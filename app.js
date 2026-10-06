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

const photos = [
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
  startedAt: 0,
  round: 1,
  players: [],
  winners: [],
  pairs: [],
  pairIndex: 0,
  bye: null,
  currentPair: null,
  votes: [],
  finalWinner: null,
  saving: false,
  starting: false
};

let firebaseReady = false;
let auth = null;
let db = null;
let anonymousPromise = null;

if (
  SITE_CONFIG?.firebase?.apiKey &&
  SITE_CONFIG?.firebase?.projectId
) {
  try {
    const app = initializeApp(SITE_CONFIG.firebase);
    auth = getAuth(app);
    db = getFirestore(app);
    firebaseReady = true;
  } catch (error) {
    console.error("Firebase initialization failed:", error);
  }
}

function showScreen(name) {
  Object.values(screens).forEach((screen) => {
    screen?.classList.remove("active");
  });

  screens[name]?.classList.add("active");

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

function shuffle(list) {
  const result = [...list];

  if (
    typeof crypto !== "undefined" &&
    typeof crypto.getRandomValues === "function"
  ) {
    const random = new Uint32Array(result.length);
    crypto.getRandomValues(random);

    for (let i = result.length - 1; i > 0; i--) {
      const j = random[i] % (i + 1);
      [result[i], result[j]] = [result[j], result[i]];
    }

    return result;
  }

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

function createSessionId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

async function ensureAnonymousUser() {
  if (!firebaseReady || !auth) {
    return null;
  }

  if (auth.currentUser?.isAnonymous) {
    state.sessionId = auth.currentUser.uid;
    return auth.currentUser;
  }

  if (anonymousPromise) {
    return anonymousPromise;
  }

  anonymousPromise = signInAnonymously(auth)
    .then((credential) => {
      state.sessionId = credential.user.uid;
      return credential.user;
    })
    .catch((error) => {
      console.error(
        "Anonymous authentication failed:",
        error
      );
      return null;
    })
    .finally(() => {
      anonymousPromise = null;
    });

  return anonymousPromise;
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

function formatSeconds(seconds) {
  const total = Math.max(
    0,
    Math.round(Number(seconds) || 0)
  );

  const minutes = Math.floor(total / 60);
  const secondsLeft = total % 60;

  return minutes
    ? `${minutes}m ${secondsLeft}s`
    : `${secondsLeft}s`;
}

function formatDate(value) {
  if (!value) {
    return "—";
  }

  if (typeof value.toDate === "function") {
    return value.toDate().toLocaleString();
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString();
}

function makePlaceholder(label) {
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
      <text x="450" y="470" text-anchor="middle"
        font-family="Arial,sans-serif"
        font-size="46"
        font-weight="700"
        fill="#161514">${escapeHtml(label)}</text>
      <text x="450" y="525" text-anchor="middle"
        font-family="Arial,sans-serif"
        font-size="24"
        fill="#74706a">drop your real photo here</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function attachImageFallback(img, photo) {
  img.onerror = null;
  img.src = makePlaceholder(photo.label);
}

function startNewRound(players) {
  const shuffled = shuffle(players);

  state.players = shuffled;
  state.winners = [];
  state.pairs = [];
  state.pairIndex = 0;
  state.bye = null;
  state.currentPair = null;

  if (shuffled.length % 2 === 1) {
    state.bye = shuffled[shuffled.length - 1];
    shuffled.length -= 1;
  }

  for (let i = 0; i < shuffled.length; i += 2) {
    state.pairs.push([
      shuffled[i],
      shuffled[i + 1]
    ]);
  }
}

function startGameRound() {
  startNewRound(
    state.round === 1
      ? photos
      : state.winners
  );

  renderNextMatch();
}

function renderNextMatch() {
  if (state.finalWinner) {
    return;
  }

  if (state.pairIndex < state.pairs.length) {
    state.currentPair =
      state.pairs[state.pairIndex];

    renderBattle();
    return;
  }

  finishRound();
}

function finishRound() {
  if (state.bye) {
    state.winners.push(state.bye);
  }

  if (state.winners.length === 1) {
    state.finalWinner = state.winners[0];
    showWinner();
    return;
  }

  state.round += 1;

  if (state.round > 4) {
    state.finalWinner = state.winners[0];
    showWinner();
    return;
  }

  startGameRound();
}

function startGame() {
  const input =
    document.getElementById("nameInput");

  const error =
    document.getElementById("nameError");

  if (!input || !error || state.starting) {
    return;
  }

  const name =
    input.value.trim();

  error.textContent = "";

  if (name.length < 2) {
    error.textContent =
      "At least 2 characters. I need to know who judged this.";
    return;
  }

  if (name.length > 40) {
    error.textContent =
      "Keep your name under 40 characters.";
    return;
  }

  state.starting = true;

  if (firebaseReady) {
    ensureAnonymousUser()
      .then((user) => {
        if (!user?.isAnonymous) {
          throw new Error(
            "Anonymous authentication failed."
          );
        }

        beginGame(name);
      })
      .catch((errorObject) => {
        console.error(
          "Game start failed:",
          errorObject
        );

        error.textContent =
          "Couldn't connect to the voting system. Try again.";
      })
      .finally(() => {
        state.starting = false;
      });

    return;
  }

  state.starting = false;
  beginGame(name);
}

function beginGame(name) {
  state.name = name;
  state.startedAt = Date.now();
  state.round = 1;
  state.players = [];
  state.winners = [];
  state.pairs = [];
  state.pairIndex = 0;
  state.bye = null;
  state.currentPair = null;
  state.votes = [];
  state.finalWinner = null;
  state.saving = false;

  if (!state.sessionId) {
    state.sessionId =
      createSessionId();
  }

  startGameRound();
  showScreen("battle");
}

function chooseWinner(photoId) {
  if (!state.currentPair) {
    return;
  }

  const first =
    state.currentPair[0];

  const second =
    state.currentPair[1];

  let winner;
  let loser;

  if (photoId === first.id) {
    winner = first;
    loser = second;
  } else if (photoId === second.id) {
    winner = second;
    loser = first;
  } else {
    return;
  }

  const buttons =
    document.querySelectorAll(
      "[data-photo-id]"
    );

  buttons.forEach((button) => {
    button.disabled = true;
  });

  document
    .querySelector(
      `[data-photo-id="${winner.id}"]`
    )
    ?.classList.add("picked");

  state.votes.push({
    round: state.round,
    match: state.votes.length + 1,
    winnerId: winner.id,
    winnerLabel: winner.label,
    loserId: loser.id,
    loserLabel: loser.label,
    timestamp:
      new Date().toISOString()
  });

  state.winners.push(winner);
  state.pairIndex += 1;
  state.currentPair = null;

  window.setTimeout(
    renderNextMatch,
    180
  );
}

function renderBattle() {
  if (!state.currentPair) {
    return;
  }

  const roundLabel =
    document.getElementById(
      "roundLabel"
    );

  const battleTitle =
    document.getElementById(
      "battleTitle"
    );

  const progressText =
    document.getElementById(
      "progressText"
    );

  const progressBar =
    document.getElementById(
      "progressBar"
    );

  const grid =
    document.getElementById(
      "battleGrid"
    );

  if (
    !roundLabel ||
    !battleTitle ||
    !progressText ||
    !progressBar ||
    !grid
  ) {
    return;
  }

  const totalMatches =
    state.pairs.length;

  const currentMatch =
    state.pairIndex + 1;

  roundLabel.textContent =
    `ROUND ${state.round} OF 4`;

  battleTitle.textContent =
    state.round === 1
      ? "Okay, judge this."
      : state.round === 2
        ? "Now it gets serious."
        : state.round === 3
          ? "Now we're getting close."
          : "Final stretch.";

  progressText.textContent =
    `${currentMatch} / ${totalMatches}`;

  progressBar.style.width =
    `${Math.min(
      100,
      (currentMatch /
        Math.max(1, totalMatches)) *
        100
    )}%`;

  grid.innerHTML = "";

  state.currentPair.forEach(
    (photo, index) => {
      const button =
        document.createElement("button");

      button.type = "button";
      button.className =
        "photo-choice";

      button.dataset.photoId =
        photo.id;

      const img =
        document.createElement("img");

      img.src = photo.src;
      img.alt = photo.label;
      img.loading =
        index === 0
          ? "eager"
          : "lazy";

      img.addEventListener(
        "error",
        (event) => {
          attachImageFallback(
            event.currentTarget,
            photo
          );
        }
      );

      const meta =
        document.createElement("div");

      meta.className =
        "photo-meta";

      const label =
        document.createElement("span");

      label.className =
        "photo-label";

      label.textContent =
        photo.label;

      const tag =
        document.createElement("span");

      tag.className =
        "vote-tag";

      tag.textContent =
        "pick me";

      meta.append(
        label,
        tag
      );

      button.append(
        img,
        meta
      );

      button.addEventListener(
        "click",
        () => {
          chooseWinner(
            photo.id
          );
        }
      );

      grid.appendChild(
        button
      );
    }
  );
}

function showWinner() {
  if (!state.finalWinner) {
    return;
  }

  const elapsed =
    Math.max(
      0,
      (Date.now() -
        state.startedAt) /
        1000
    );

  const finishName =
    document.getElementById(
      "finishName"
    );

  const finishCount =
    document.getElementById(
      "finishCount"
    );

  const finishTime =
    document.getElementById(
      "finishTime"
    );

  const winnerCard =
    document.getElementById(
      "winnerCard"
    );

  if (finishName) {
    finishName.textContent =
      state.name;
  }

  if (finishCount) {
    finishCount.textContent =
      photos.length;
  }

  if (finishTime) {
    finishTime.textContent =
      formatSeconds(elapsed);
  }

  if (winnerCard) {
    winnerCard.innerHTML =
      "";

    const img =
      document.createElement("img");

    img.src =
      state.finalWinner.src;

    img.alt =
      state.finalWinner.label;

    img.addEventListener(
      "error",
      (event) => {
        attachImageFallback(
          event.currentTarget,
          state.finalWinner
        );
      }
    );

    const caption =
      document.createElement("div");

    caption.className =
      "winner-caption";

    const label =
      document.createElement("span");

    label.textContent =
      state.finalWinner.label;

    const champion =
      document.createElement("span");

    champion.textContent =
      "🏆 champion";

    caption.append(
      label,
      champion
    );

    winnerCard.append(
      img,
      caption
    );
  }

  showScreen("winner");

  saveResponse(elapsed);
}

function buildPayload(elapsed) {
  return {
    name: state.name,
    sessionId: state.sessionId,
    durationSeconds:
      Math.round(elapsed),
    totalPhotos: photos.length,
    finalWinnerId:
      state.finalWinner.id,
    finalWinnerLabel:
      state.finalWinner.label,
    votes: state.votes,
    eliminatedByRound:
      state.votes.map(
        (vote) =>
          `${vote.loserLabel} lost to ${vote.winnerLabel} in Round ${vote.round}`
      ),
    browser:
      navigator.userAgent
        .slice(0, 500),
    platform:
      String(
        navigator.platform || ""
      ).slice(0, 100),
    language:
      String(
        navigator.language || ""
      ).slice(0, 50),
    screen:
      `${window.innerWidth}x${window.innerHeight}`.slice(
        0,
        30
      ),
    referrer:
      document.referrer
        ? document.referrer.slice(
            0,
            2048
          )
        : null
  };
}

async function saveResponse(elapsed) {
  if (state.saving) {
    return;
  }

  state.saving = true;

  const status =
    document.getElementById(
      "saveStatus"
    );

  const payload =
    buildPayload(elapsed);

  let firestoreSaved =
    false;

  let emailSent =
    false;

  try {
    localStorage.setItem(
      `pfp_response_${state.sessionId}`,
      JSON.stringify({
        ...payload,
        submittedAt:
          new Date().toISOString()
      })
    );
  } catch (error) {
    console.warn(
      "Local save failed:",
      error
    );
  }

  if (
    firebaseReady &&
    db &&
    auth
  ) {
    try {
      const user =
        await ensureAnonymousUser();

      if (
        !user ||
        !user.isAnonymous
      ) {
        throw new Error(
          "No anonymous Firebase session is available."
        );
      }

      const responseData = {
        ...payload,
        sessionId:
          user.uid,
        submittedAt:
          serverTimestamp(),
        savedAt:
          serverTimestamp()
      };

      await addDoc(
        collection(
          db,
          "responses"
        ),
        responseData
      );

      firestoreSaved =
        true;
    } catch (error) {
      console.error(
        "Firestore save failed:",
        error
      );
    }
  }

  const endpoint =
    SITE_CONFIG?.formspreeEndpoint;

  if (
    endpoint &&
    !String(endpoint).includes(
      "YOUR_FORM_ID"
    )
  ) {
    try {
      const submittedAt =
        new Date().toISOString();

      const formData =
        new FormData();

      formData.append(
        "name",
        payload.name
      );

      formData.append(
        "submittedAt",
        submittedAt
      );

      formData.append(
        "finalWinner",
        payload.finalWinnerLabel
      );

      formData.append(
        "durationSeconds",
        String(
          payload.durationSeconds
        )
      );

      formData.append(
        "totalPhotos",
        String(
          payload.totalPhotos
        )
      );

      formData.append(
        "eliminations",
        payload.eliminatedByRound.join(
          " | "
        )
      );

      formData.append(
        "responsesJSON",
        JSON.stringify(
          payload,
          null,
          2
        )
      );

      const response =
        await fetch(
          endpoint,
          {
            method: "POST",
            headers: {
              Accept:
                "application/json"
            },
            body:
              formData
          }
        );

      emailSent =
        response.ok;
    } catch (error) {
      console.error(
        "Formspree save failed:",
        error
      );
    }
  }

  if (!status) {
    state.saving = false;
    return;
  }

  if (
    firestoreSaved &&
    emailSent
  ) {
    status.textContent =
      "Saved + sent. Your verdict has officially been delivered 👀";
  } else if (
    firestoreSaved
  ) {
    status.textContent =
      "Saved. Your verdict is in the scoreboard.";
  } else if (
    emailSent
  ) {
    status.textContent =
      "Email sent, but the scoreboard could not save your vote.";
  } else {
    status.textContent =
      "Your verdict could not be saved.";
  }

  state.saving = false;
}

function sortRows(rows) {
  return [...rows].sort(
    (a, b) => {
      const aTime =
        typeof a.savedAt?.toMillis ===
        "function"
          ? a.savedAt.toMillis()
          : new Date(
              a.savedAt ||
                a.submittedAt ||
                0
            ).getTime();

      const bTime =
        typeof b.savedAt?.toMillis ===
        "function"
          ? b.savedAt.toMillis()
          : new Date(
              b.savedAt ||
                b.submittedAt ||
                0
            ).getTime();

      return bTime - aTime;
    }
  );
}

async function loginDev() {
  const email =
    document.getElementById(
      "devEmail"
    );

  const password =
    document.getElementById(
      "devPassword"
    );

  const button =
    document.getElementById(
      "devLoginButton"
    );

  const error =
    document.getElementById(
      "devError"
    );

  if (
    !email ||
    !password ||
    !error ||
    !auth
  ) {
    return;
  }

  const emailValue =
    email.value.trim();

  const passwordValue =
    password.value;

  error.textContent =
    "";

  if (
    !emailValue ||
    !passwordValue
  ) {
    error.textContent =
      "Enter both the developer email and password.";
    return;
  }

  if (button) {
    button.disabled =
      true;
  }

  try {
    if (auth.currentUser) {
      await signOut(auth);
    }

    await signInWithEmailAndPassword(
      auth,
      emailValue,
      passwordValue
    );

    showScreen(
      "dashboard"
    );

    await loadDashboard();
  } catch (errorObject) {
    console.error(
      "Developer login failed:",
      errorObject
    );

    error.textContent =
      "Login failed. Check your developer email and password.";
  } finally {
    if (button) {
      button.disabled =
        false;
    }
  }
}

async function loadDashboard() {
  const summary =
    document.getElementById(
      "dashboardSummary"
    );

  const trends =
    document.getElementById(
      "dashboardTrends"
    );

  const responses =
    document.getElementById(
      "dashboardResponses"
    );

  if (
    !summary ||
    !trends ||
    !responses
  ) {
    return;
  }

  if (
    !firebaseReady ||
    !auth ||
    !db
  ) {
    summary.innerHTML =
      `<div class="empty-state">Firebase is not configured.</div>`;
    trends.innerHTML =
      "";
    responses.innerHTML =
      "";
    return;
  }

  const user =
    auth.currentUser;

  if (
    !user ||
    user.isAnonymous
  ) {
    summary.innerHTML =
      `<div class="empty-state">Developer authentication is required.</div>`;
    trends.innerHTML =
      "";
    responses.innerHTML =
      "";
    return;
  }

  summary.innerHTML =
    `<div class="empty-state">Loading votes…</div>`;

  try {
    const snapshot =
      await getDocs(
        collection(
          db,
          "responses"
        )
      );

    const rows =
      sortRows(
        snapshot.docs.map(
          (doc) => ({
            id: doc.id,
            ...doc.data()
          })
        )
      );

    renderDashboard(
      rows
    );
  } catch (error) {
    console.error(
      "Dashboard load failed:",
      error
    );

    summary.innerHTML =
      `<div class="empty-state">Could not load the scoreboard. Check the deployed Firebase Rules.</div>`;

    trends.innerHTML =
      "";

    responses.innerHTML =
      "";
  }
}

function renderDashboard(rows) {
  const summary =
    document.getElementById(
      "dashboardSummary"
    );

  const trends =
    document.getElementById(
      "dashboardTrends"
    );

  const responses =
    document.getElementById(
      "dashboardResponses"
    );

  const stats =
    Object.fromEntries(
      photos.map(
        (photo) => [
          photo.id,
          {
            label:
              photo.label,
            wins: 0,
            losses: 0,
            appearances: 0,
            finals: 0
          }
        ]
      )
    );

  let totalMatches =
    0;

  rows.forEach(
    (row) => {
      const votes =
        Array.isArray(
          row.votes
        )
          ? row.votes
          : [];

      totalMatches +=
        votes.length;

      votes.forEach(
        (vote) => {
          if (
            !stats[
              vote.winnerId
            ] ||
            !stats[
              vote.loserId
            ]
          ) {
            return;
          }

          stats[
            vote.winnerId
          ].wins += 1;

          stats[
            vote.loserId
          ].losses += 1;

          stats[
            vote.winnerId
          ].appearances += 1;

          stats[
            vote.loserId
          ].appearances += 1;
        }
      );

      if (
        stats[
          row.finalWinnerId
        ]
      ) {
        stats[
          row.finalWinnerId
        ].finals += 1;
      }
    }
  );

  const ranking =
    Object.values(
      stats
    ).sort(
      (a, b) =>
        b.finals -
          a.finals ||
        b.wins -
          a.wins ||
        b.appearances -
          a.appearances
    );

  const leader =
    ranking[0];

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
      <div class="stat-value">
        ${
          leader
            ? escapeHtml(
                leader.label.replace(
                  "Photo ",
                  "#"
                )
              )
            : "—"
        }
      </div>
    </div>

    <div class="stat-card">
      <div class="stat-label">Leader wins</div>
      <div class="stat-value">
        ${
          leader
            ? leader.wins
            : 0
        }
      </div>
    </div>
  `;

  const maxWins =
    Math.max(
      1,
      ...ranking.map(
        (item) =>
          item.wins
      )
    );

  trends.innerHTML = `
    <div class="section-title">
      Who is winning right now?
    </div>

    <div class="trend-card">
      ${
        ranking
          .map(
            (item, index) => `
              <div class="trend-row">
                <div class="rank">
                  #${index + 1}
                </div>

                <div class="trend-main">
                  <div class="trend-name">
                    ${escapeHtml(
                      item.label
                    )}
                  </div>

                  <div class="bar-track">
                    <div
                      class="bar-fill"
                      style="width:${Math.round(
                        (item.wins /
                          maxWins) *
                          100
                      )}%"
                    ></div>
                  </div>
                </div>

                <div class="trend-number">
                  ${
                    item.wins
                  } wins · ${
                    item.appearances
                      ? Math.round(
                          (item.wins /
                            item.appearances) *
                            100
                        )
                      : 0
                  }%
                </div>
              </div>
            `
          )
          .join("")
      }
    </div>
  `;

  responses.innerHTML = `
    <div class="section-title">
      Every judge, separately.
    </div>

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
          ${
            rows.length
              ? rows
                  .map(
                    (row) => `
                      <tr>
                        <td>
                          <strong>
                            ${escapeHtml(
                              row.name ||
                                "Unknown"
                            )}
                          </strong>
                        </td>

                        <td>
                          ${escapeHtml(
                            row.finalWinnerLabel ||
                              "—"
                          )}
                        </td>

                        <td>
                          <div class="response-votes">
                            ${
                              Array.isArray(
                                row.votes
                              )
                                ? row.votes
                                    .map(
                                      (
                                        vote
                                      ) => `
                                        <span class="vote-chip">
                                          R${escapeHtml(
                                            vote.round
                                          )}:
                                          ${escapeHtml(
                                            vote.loserLabel
                                          )}
                                          →
                                          ${escapeHtml(
                                            vote.winnerLabel
                                          )}
                                        </span>
                                      `
                                    )
                                    .join("")
                                : ""
                            }
                          </div>
                        </td>

                        <td>
                          ${formatSeconds(
                            row.durationSeconds ||
                              0
                          )}
                        </td>

                        <td>
                          ${escapeHtml(
                            formatDate(
                              row.submittedAt ||
                                row.savedAt
                            )
                          )}
                        </td>
                      </tr>
                    `
                  )
                  .join("")
              : `
                <tr>
                  <td colspan="5">
                    <div class="empty-state">
                      No votes yet. Send the link to someone 😭
                    </div>
                  </td>
                </tr>
              `
          }
        </tbody>
      </table>
    </div>
  `;
}

document
  .getElementById("startButton")
  ?.addEventListener(
    "click",
    startGame
  );

document
  .getElementById("nameInput")
  ?.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key ===
        "Enter"
      ) {
        startGame();
      }
    }
  );

document
  .getElementById("restartButton")
  ?.addEventListener(
    "click",
    () => {
      const input =
        document.getElementById(
          "nameInput"
        );

      const error =
        document.getElementById(
          "nameError"
        );

      if (input) {
        input.value = "";
      }

      if (error) {
        error.textContent =
          "";
      }

      showScreen(
        "start"
      );
    }
  );

document
  .getElementById("devButton")
  ?.addEventListener(
    "click",
    () => {
      showScreen(
        auth?.currentUser &&
          !auth.currentUser.isAnonymous
          ? "dashboard"
          : "devLogin"
      );

      if (
        auth?.currentUser &&
        !auth.currentUser.isAnonymous
      ) {
        loadDashboard();
      }
    }
  );

document
  .getElementById("backHomeButton")
  ?.addEventListener(
    "click",
    () => {
      showScreen(
        "start"
      );
    }
  );

document
  .getElementById("devLoginButton")
  ?.addEventListener(
    "click",
    loginDev
  );

document
  .getElementById("devPassword")
  ?.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key ===
        "Enter"
      ) {
        loginDev();
      }
    }
  );

document
  .getElementById("refreshDashboard")
  ?.addEventListener(
    "click",
    loadDashboard
  );

document
  .getElementById("logoutButton")
  ?.addEventListener(
    "click",
    async () => {
      try {
        await signOut(auth);
      } catch (error) {
        console.error(
          "Logout failed:",
          error
        );
      }

      showScreen(
        "start"
      );
    }
  );

if (auth) {
  onAuthStateChanged(
    auth,
    (user) => {
      if (
        user &&
        !user.isAnonymous &&
        screens.dashboard?.classList.contains(
          "active"
        )
      ) {
        loadDashboard();
      }
    }
  );
}

showScreen("start");
