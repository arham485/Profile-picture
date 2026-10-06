import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import {
  getFirestore,
  addDoc,
  collection,
  getDocs,
  orderBy,
  query,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { SITE_CONFIG } from "./firebase-config.js";

const screens = {
  start: document.getElementById("startScreen"),
  battle: document.getElementById("battleScreen"),
  winner: document.getElementById("winnerScreen"),
  devLogin: document.getElementById("devLoginScreen"),
  dashboard: document.getElementById("dashboardScreen")
};

const photoManifest = [
  { id: "photo-1", label: "Photo 01", src: "photos/photo-01.jpg" },
  { id: "photo-2", label: "Photo 02", src: "photos/photo-02.jpg" },
  { id: "photo-3", label: "Photo 03", src: "photos/photo-03.jpg" },
  { id: "photo-4", label: "Photo 04", src: "photos/photo-04.jpg" },
  { id: "photo-5", label: "Photo 05", src: "photos/photo-05.jpg" },
  { id: "photo-6", label: "Photo 06", src: "photos/photo-06.jpg" },
  { id: "photo-7", label: "Photo 07", src: "photos/photo-07.jpg" },
  { id: "photo-8", label: "Photo 08", src: "photos/photo-08.jpg" },
  { id: "photo-9", label: "Photo 09", src: "photos/photo-09.jpg" },
  { id: "photo-10", label: "Photo 10", src: "photos/photo-10.jpg" }
];

const state = {
  name: "",
  sessionId: "",
  startedAt: null,
  currentRound: 1,
  matchQueue: [],
  nextRound: [],
  currentPair: null,
  votes: [],
  roundMatches: 0,
  completedMatches: 0,
  finalWinner: null,
  responseSaved: false
};

let firebaseReady = false;
let db = null;
let auth = null;

const firebaseConfig = SITE_CONFIG?.firebase;

if (
  firebaseConfig?.apiKey &&
  firebaseConfig?.projectId &&
  !firebaseConfig.apiKey.includes("YOUR_") &&
  !firebaseConfig.projectId.includes("YOUR_")
) {
  try {
    const firebaseApp = initializeApp(firebaseConfig);
    auth = getAuth(firebaseApp);
    db = getFirestore(firebaseApp);
    firebaseReady = true;
  } catch (error) {
    console.error("Firebase initialization failed:", error);
  }
}

function createLocalSessionId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function ensureAnonymousSession() {
  if (!firebaseReady || !auth) {
    return null;
  }

  if (auth.currentUser?.isAnonymous) {
    state.sessionId = auth.currentUser.uid;
    return auth.currentUser;
  }

  if (auth.currentUser && !auth.currentUser.isAnonymous) {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Could not switch to anonymous session:", error);
      return null;
    }
  }

  try {
    const credential = await signInAnonymously(auth);
    state.sessionId = credential.user.uid;
    return credential.user;
  } catch (error) {
    console.error("Anonymous Firebase sign-in failed:", error);
    return null;
  }
}

function showScreen(key) {
  Object.values(screens).forEach((screen) => {
    if (screen) {
      screen.classList.remove("active");
    }
  });

  if (screens[key]) {
    screens[key].classList.add("active");
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function shuffle(items) {
  const array = [...items];

  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }

  return array;
}

function formatSeconds(totalSeconds) {
  const sec = Math.max(0, Math.round(Number(totalSeconds) || 0));
  const mins = Math.floor(sec / 60);
  const remainder = sec % 60;
  return mins ? `${mins}m ${remainder}s` : `${remainder}s`;
}

function roundName(round) {
  return `ROUND ${round}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function makePlaceholder(label) {
  const safeLabel = escapeHtml(label);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="900" height="900">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#ded7ff"/>
          <stop offset="1" stop-color="#f1ece2"/>
        </linearGradient>
      </defs>
      <rect width="900" height="900" fill="url(#g)"/>
      <circle cx="450" cy="340" r="120" fill="#7357e8" opacity=".18"/>
      <path d="M160 700c80-170 500-170 580 0" fill="#7357e8" opacity=".15"/>
      <text x="450" y="470" text-anchor="middle" font-family="Arial, sans-serif" font-size="46" font-weight="700" fill="#161514">${safeLabel}</text>
      <text x="450" y="525" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" fill="#74706a">drop your real photo here</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function imageErrorFallback(img, photo) {
  img.onerror = null;
  img.src = makePlaceholder(photo.label);
}

function formatDate(value) {
  if (!value) {
    return "—";
  }

  if (typeof value.toDate === "function") {
    const date = value.toDate();
    return date.toLocaleString();
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString();
}

async function startGame() {
  const input = document.getElementById("nameInput");
  const error = document.getElementById("nameError");
  const name = input.value.trim();

  error.textContent = "";

  if (!name) {
    error.textContent = "Put your name in first 😭";
    input.focus();
    return;
  }

  if (name.length < 2) {
    error.textContent = "At least 2 characters. I need to know who judged this.";
    return;
  }

  if (name.length > 40) {
    error.textContent = "Keep your name under 40 characters.";
    return;
  }

  if (firebaseReady) {
    const user = await ensureAnonymousSession();

    if (!user || !user.isAnonymous) {
      error.textContent = "Couldn't connect to the voting system. Try again.";
      return;
    }
  } else {
    state.sessionId = createLocalSessionId();
  }

  state.name = name;
  state.startedAt = Date.now();
  state.currentRound = 1;
  state.matchQueue = shuffle(photoManifest);
  state.nextRound = [];
  state.currentPair = null;
  state.votes = [];
  state.completedMatches = 0;
  state.roundMatches = Math.ceil(state.matchQueue.length / 2);
  state.finalWinner = null;
  state.responseSaved = false;

  showScreen("battle");
  runNextMatch();
}

function beginRoundIfNeeded() {
  if (state.matchQueue.length === 1) {
    state.nextRound.push(state.matchQueue.shift());
    finishOrAdvance();
    return;
  }

  if (state.matchQueue.length === 0) {
    state.matchQueue = state.nextRound;
    state.nextRound = [];
    state.currentRound += 1;

    if (state.matchQueue.length === 1) {
      state.finalWinner = state.matchQueue[0];
      showWinner();
      return;
    }

    state.roundMatches = Math.ceil(state.matchQueue.length / 2);
  }
}

function runNextMatch() {
  beginRoundIfNeeded();

  if (state.finalWinner) {
    return;
  }

  const first = state.matchQueue.shift();
  const second = state.matchQueue.shift();

  if (!first) {
    finishOrAdvance();
    return;
  }

  if (!second) {
    state.nextRound.push(first);
    finishOrAdvance();
    return;
  }

  state.currentPair = { first, second };
  renderBattle();
}

function finishOrAdvance() {
  if (state.matchQueue.length > 0) {
    runNextMatch();
    return;
  }

  if (state.nextRound.length === 1) {
    state.finalWinner = state.nextRound[0];
    showWinner();
    return;
  }

  state.matchQueue = state.nextRound;
  state.nextRound = [];
  state.currentRound += 1;
  state.roundMatches = Math.ceil(state.matchQueue.length / 2);
  runNextMatch();
}

function chooseWinner(winnerId) {
  if (!state.currentPair) {
    return;
  }

  const { first, second } = state.currentPair;
  const winner = winnerId === first.id ? first : second;
  const loser = winner.id === first.id ? second : first;

  state.votes.push({
    round: state.currentRound,
    match: state.votes.length + 1,
    winnerId: winner.id,
    winnerLabel: winner.label,
    loserId: loser.id,
    loserLabel: loser.label,
    timestamp: new Date().toISOString()
  });

  state.nextRound.push(winner);
  state.completedMatches += 1;
  state.currentPair = null;

  const buttons = document.querySelectorAll("[data-photo-id]");
  buttons.forEach((button) => {
    button.disabled = true;
  });

  const button = document.querySelector(`[data-photo-id="${winner.id}"]`);
  if (button) {
    button.classList.add("picked");
  }

  setTimeout(() => {
    finishOrAdvance();
  }, 180);
}

function renderBattle() {
  document.getElementById("roundLabel").textContent = roundName(state.currentRound);

  document.getElementById("battleTitle").textContent =
    state.currentRound === 1
      ? "Okay, judge this."
      : state.currentRound === 2
        ? "Now it gets serious."
        : "Final stretch.";

  const totalMatches = state.roundMatches || 1;
  const currentInRound = (state.completedMatches % totalMatches) + 1;

  document.getElementById("progressText").textContent = `${currentInRound} / ${totalMatches}`;
  document.getElementById("progressBar").style.width = `${Math.min(100, (currentInRound / totalMatches) * 100)}%`;

  const grid = document.getElementById("battleGrid");
  grid.innerHTML = "";

  [state.currentPair.first, state.currentPair.second].forEach((photo, index) => {
    const button = document.createElement("button");
    button.className = "photo-choice";
    button.type = "button";
    button.dataset.photoId = photo.id;

    const img = document.createElement("img");
    img.src = photo.src;
    img.alt = photo.label;
    img.loading = index === 0 ? "eager" : "lazy";

    const meta = document.createElement("div");
    meta.className = "photo-meta";

    const label = document.createElement("span");
    label.className = "photo-label";
    label.textContent = photo.label;

    const tag = document.createElement("span");
    tag.className = "vote-tag";
    tag.textContent = "pick me";

    meta.appendChild(label);
    meta.appendChild(tag);
    button.appendChild(img);
    button.appendChild(meta);

    img.addEventListener("error", (event) => {
      imageErrorFallback(event.currentTarget, photo);
    });

    button.addEventListener("click", () => chooseWinner(photo.id));

    grid.appendChild(button);
  });
}

function showWinner() {
  if (!state.finalWinner) {
    return;
  }

  const elapsed = Math.max(0, (Date.now() - state.startedAt) / 1000);
  const winner = state.finalWinner;

  document.getElementById("finishName").textContent = state.name;
  document.getElementById("finishCount").textContent = photoManifest.length;
  document.getElementById("finishTime").textContent = formatSeconds(elapsed);

  const card = document.getElementById("winnerCard");
  card.innerHTML = "";

  const img = document.createElement("img");
  img.src = winner.src;
  img.alt = winner.label;

  const caption = document.createElement("div");
  caption.className = "winner-caption";

  const label = document.createElement("span");
  label.textContent = winner.label;

  const champion = document.createElement("span");
  champion.textContent = "🏆 champion";

  caption.appendChild(label);
  caption.appendChild(champion);
  card.appendChild(img);
  card.appendChild(caption);

  img.addEventListener("error", (event) => {
    imageErrorFallback(event.currentTarget, winner);
  });

  showScreen("winner");
  saveResponse(elapsed);
}

function buildResponsePayload(elapsed) {
  return {
    name: state.name,
    sessionId: state.sessionId,
    submittedAt: null,
    durationSeconds: Math.round(elapsed),
    totalPhotos: photoManifest.length,
    finalWinnerId: state.finalWinner?.id ?? null,
    finalWinnerLabel: state.finalWinner?.label ?? null,
    votes: state.votes,
    eliminatedByRound: state.votes.map(
      (vote) => `${vote.loserLabel} lost to ${vote.winnerLabel} in Round ${vote.round}`
    ),
    browser: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    screen: `${window.innerWidth}x${window.innerHeight}`,
    referrer: document.referrer || null
  };
}

async function saveResponse(elapsed) {
  if (state.responseSaved) {
    return;
  }

  state.responseSaved = true;

  const status = document.getElementById("saveStatus");
  const payload = buildResponsePayload(elapsed);

  try {
    localStorage.setItem(
      `pfp_response_${payload.sessionId || createLocalSessionId()}`,
      JSON.stringify({ ...payload, submittedAt: new Date().toISOString() })
    );
  } catch (error) {
    console.warn("Local storage save failed:", error);
  }

  let firestoreSaved = false;
  let emailSent = false;

  if (firebaseReady && db && auth) {
    try {
      const user = await ensureAnonymousSession();

      if (!user || !user.isAnonymous) {
        throw new Error("No anonymous Firebase session is available.");
      }

      payload.sessionId = user.uid;

      await addDoc(collection(db, "responses"), {
        name: payload.name,
        sessionId: payload.sessionId,
        submittedAt: serverTimestamp(),
        durationSeconds: payload.durationSeconds,
        totalPhotos: payload.totalPhotos,
        finalWinnerId: payload.finalWinnerId,
        finalWinnerLabel: payload.finalWinnerLabel,
        votes: payload.votes,
        eliminatedByRound: payload.eliminatedByRound,
        browser: payload.browser,
        platform: payload.platform,
        language: payload.language,
        screen: payload.screen,
        referrer: payload.referrer,
        savedAt: serverTimestamp()
      });

      firestoreSaved = true;
    } catch (error) {
      console.warn("Firestore save failed:", error);
    }
  }

  const endpoint = SITE_CONFIG?.formspreeEndpoint;

  if (endpoint && !endpoint.includes("YOUR_FORM_ID")) {
    try {
      const formData = new FormData();
      formData.append("name", payload.name);
      formData.append("submittedAt", new Date().toISOString());
      formData.append("finalWinner", payload.finalWinnerLabel || "Unknown");
      formData.append("durationSeconds", String(payload.durationSeconds));
      formData.append("totalPhotos", String(payload.totalPhotos));
      formData.append("eliminations", payload.eliminatedByRound.join(" | "));
      formData.append(
        "responsesJSON",
        JSON.stringify({ ...payload, submittedAt: new Date().toISOString() }, null, 2)
      );

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: formData
      });

      emailSent = response.ok;
    } catch (error) {
      console.warn("Formspree submission failed:", error);
    }
  }

  if (firestoreSaved && emailSent) {
    status.textContent = "Saved + sent. Your verdict has officially been delivered 👀";
  } else if (firestoreSaved) {
    status.textContent = "Saved. Your verdict is in the scoreboard.";
  } else if (emailSent) {
    status.textContent = "Sent. Your verdict has officially been delivered 👀";
  } else if (!firebaseReady && !endpoint) {
    status.textContent = "Verdict saved on this browser.";
  } else if (!firestoreSaved && firebaseReady) {
    status.textContent = "Email sent, but the scoreboard could not save your vote.";
  } else {
    status.textContent = "Your verdict could not be delivered. Try again.";
  }
}

function openDevMode() {
  showScreen("devLogin");

  const error = document.getElementById("devError");
  error.textContent = "";

  if (!firebaseReady || !auth) {
    error.textContent = "Developer mode needs Firebase configured first.";
  }
}

async function loginDev() {
  const email = document.getElementById("devEmail").value.trim();
  const password = document.getElementById("devPassword").value;
  const error = document.getElementById("devError");

  error.textContent = "";

  if (!firebaseReady || !auth) {
    error.textContent = "Firebase is not configured.";
    return;
  }

  if (!email || !password) {
    error.textContent = "Enter both the developer email and password.";
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);
    showScreen("dashboard");
    await loadDashboard();
  } catch (errorObject) {
    console.error("Developer login failed:", errorObject);
    error.textContent = "Login failed. Check your email and password.";
  }
}

async function loadDashboard() {
  const summary = document.getElementById("dashboardSummary");
  const trends = document.getElementById("dashboardTrends");
  const responses = document.getElementById("dashboardResponses");

  if (!firebaseReady || !db || !auth) {
    summary.innerHTML = `<div class="empty-state">Firebase is not configured.</div>`;
    trends.innerHTML = "";
    responses.innerHTML = "";
    return;
  }

  const user = auth.currentUser;

  if (!user || user.isAnonymous) {
    summary.innerHTML = `<div class="empty-state">Developer authentication is required.</div>`;
    trends.innerHTML = "";
    responses.innerHTML = "";
    return;
  }

  summary.innerHTML = `<div class="empty-state">Loading votes…</div>`;

  try {
    const snap = await getDocs(
      query(collection(db, "responses"), orderBy("savedAt", "desc"))
    );

    const rows = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    renderDashboard(rows);
  } catch (error) {
    console.error("Dashboard load failed:", error);
    summary.innerHTML = `<div class="empty-state">Could not load responses. Check your Firebase rules and developer account.</div>`;
    trends.innerHTML = "";
    responses.innerHTML = "";
  }
}

function renderDashboard(rows) {
  const summary = document.getElementById("dashboardSummary");
  const trends = document.getElementById("dashboardTrends");
  const responses = document.getElementById("dashboardResponses");

  const photoStats = Object.fromEntries(
    photoManifest.map((photo) => [
      photo.id,
      { label: photo.label, wins: 0, losses: 0, finals: 0, appearances: 0 }
    ])
  );

  let totalMatches = 0;

  for (const row of rows) {
    const votes = Array.isArray(row.votes) ? row.votes : [];
    totalMatches += votes.length;

    for (const vote of votes) {
      if (!photoStats[vote.winnerId]) {
        photoStats[vote.winnerId] = {
          label: String(vote.winnerLabel || "Unknown"),
          wins: 0,
          losses: 0,
          finals: 0,
          appearances: 0
        };
      }

      if (!photoStats[vote.loserId]) {
        photoStats[vote.loserId] = {
          label: String(vote.loserLabel || "Unknown"),
          wins: 0,
          losses: 0,
          finals: 0,
          appearances: 0
        };
      }

      photoStats[vote.winnerId].wins += 1;
      photoStats[vote.loserId].losses += 1;
      photoStats[vote.winnerId].appearances += 1;
      photoStats[vote.loserId].appearances += 1;
    }

    if (row.finalWinnerId && photoStats[row.finalWinnerId]) {
      photoStats[row.finalWinnerId].finals += 1;
    }
  }

  const stats = Object.values(photoStats)
    .map((item) => ({
      ...item,
      winRate: item.appearances
        ? Math.round((item.wins / item.appearances) * 100)
        : 0
    }))
    .sort((a, b) => b.wins - a.wins || b.winRate - a.winRate);

  const topPhoto = stats[0];

  summary.innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Total judges</div>
      <div class="stat-value">${rows.length}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Matches voted</div>
      <div class="stat-value">${totalMatches}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Current leader</div>
      <div class="stat-value">${topPhoto ? escapeHtml(topPhoto.label.replace("Photo ", "#")) : "—"}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Leader wins</div>
      <div class="stat-value">${topPhoto ? topPhoto.wins : 0}</div>
    </div>
  `;

  const maxWins = Math.max(1, ...stats.map((item) => item.wins));

  trends.innerHTML = `
    <div class="section-title">Who is winning right now?</div>
    <div class="trend-card">
      ${stats.map((item, index) => `
        <div class="trend-row">
          <div class="rank">#${index + 1}</div>
          <div class="trend-main">
            <div class="trend-name">${escapeHtml(item.label)}</div>
            <div class="bar-track"><div class="bar-fill" style="width:${Math.round((item.wins / maxWins) * 100)}%"></div></div>
          </div>
          <div class="trend-number">${item.wins} wins · ${item.winRate}%</div>
        </div>
      `).join("")}
    </div>
  `;

  responses.innerHTML = `
    <div class="section-title">Every judge, separately.</div>
    <div class="responses-table-wrap">
      <table class="responses-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Final pick</th>
            <th>Eliminations</th>
            <th>Time</th>
            <th>Submitted</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length ? rows.map((row) => `
            <tr>
              <td><strong>${escapeHtml(row.name || "Unknown")}</strong></td>
              <td>${escapeHtml(row.finalWinnerLabel || "—")}</td>
              <td>
                <div class="response-votes">
                  ${(Array.isArray(row.votes) ? row.votes : []).map((vote) =>
                    `<span class="vote-chip">R${escapeHtml(vote.round)}: ${escapeHtml(vote.loserLabel)} → ${escapeHtml(vote.winnerLabel)}</span>`
                  ).join("")}
                </div>
              </td>
              <td>${formatSeconds(row.durationSeconds || 0)}</td>
              <td>${escapeHtml(formatDate(row.submittedAt))}</td>
            </tr>
          `).join("") : `
            <tr><td colspan="5"><div class="empty-state">No votes yet. Send the link to someone 😭</div></td></tr>
          `}
        </tbody>
      </table>
    </div>
  `;
}

document.getElementById("startButton").addEventListener("click", startGame);

document.getElementById("nameInput").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    startGame();
  }
});

document.getElementById("restartButton").addEventListener("click", () => {
  document.getElementById("nameInput").value = "";
  document.getElementById("nameError").textContent = "";
  showScreen("start");
});

document.getElementById("devButton").addEventListener("click", openDevMode);

document.getElementById("backHomeButton").addEventListener("click", () => showScreen("start"));

document.getElementById("devLoginButton").addEventListener("click", loginDev);

document.getElementById("refreshDashboard").addEventListener("click", loadDashboard);

document.getElementById("logoutButton").addEventListener("click", async () => {
  try {
    await signOut(auth);
    showScreen("start");
    await ensureAnonymousSession();
  } catch (error) {
    console.error("Logout failed:", error);
    showScreen("start");
  }
});

if (auth) {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      state.sessionId = user.uid;
    } else if (screens.dashboard?.classList.contains("active")) {
      showScreen("devLogin");
    }
  });

  ensureAnonymousSession();
} else {
  state.sessionId = createLocalSessionId();
}
