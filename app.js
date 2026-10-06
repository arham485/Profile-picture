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
  startedAt: 0,
  currentRound: 1,
  currentRoundPlayers: [],
  currentRoundWinners: [],
  currentPairIndex: 0,
  currentPair: null,
  roundMatches: 0,
  votes: [],
  finalWinner: null,
  responseSaved: false,
  choosing: false,
  starting: false
};

let firebaseReady = false;
let db = null;
let auth = null;
let anonymousSessionPromise = null;

const firebaseConfig = SITE_CONFIG?.firebase;

if (
  firebaseConfig?.apiKey &&
  firebaseConfig?.projectId &&
  !String(firebaseConfig.apiKey).includes("YOUR_") &&
  !String(firebaseConfig.projectId).includes("YOUR_")
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

function showScreen(key) {
  Object.values(screens).forEach((screen) => {
    screen?.classList.remove("active");
  });

  screens[key]?.classList.add("active");

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

function createLocalSessionId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function shuffle(items) {
  const array = [...items];

  if (
    typeof crypto !== "undefined" &&
    typeof crypto.getRandomValues === "function"
  ) {
    const randomValues = new Uint32Array(array.length - 1);
    crypto.getRandomValues(randomValues);

    for (let i = array.length - 1, r = 0; i > 0; i--, r++) {
      const j = randomValues[r] % (i + 1);
      [array[i], array[j]] = [array[j], array[i]];
    }

    return array;
  }

  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }

  return array;
}

async function ensureAnonymousSession() {
  if (!firebaseReady || !auth) {
    return null;
  }

  if (auth.currentUser?.isAnonymous) {
    state.sessionId = auth.currentUser.uid;
    return auth.currentUser;
  }

  if (anonymousSessionPromise) {
    return anonymousSessionPromise;
  }

  anonymousSessionPromise = signInAnonymously(auth)
    .then((credential) => {
      state.sessionId = credential.user.uid;
      return credential.user;
    })
    .catch((error) => {
      console.error("Anonymous Firebase sign-in failed:", error);
      return null;
    })
    .finally(() => {
      anonymousSessionPromise = null;
    });

  return anonymousSessionPromise;
}

function formatSeconds(totalSeconds) {
  const sec = Math.max(0, Math.round(Number(totalSeconds) || 0));
  const mins = Math.floor(sec / 60);
  const remainder = sec % 60;

  return mins
    ? `${mins}m ${remainder}s`
    : `${remainder}s`;
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
    return value.toDate().toLocaleString();
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString();
}

function getDateMillis(value) {
  if (!value) {
    return 0;
  }

  if (typeof value.toMillis === "function") {
    return value.toMillis();
  }

  if (typeof value.toDate === "function") {
    return value.toDate().getTime();
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? 0
    : date.getTime();
}

function resetGameState() {
  state.currentRound = 1;
  state.currentRoundPlayers = shuffle(photoManifest);
  state.currentRoundWinners = [];
  state.currentPairIndex = 0;
  state.currentPair = null;
  state.roundMatches = Math.floor(
    state.currentRoundPlayers.length / 2
  );
  state.votes = [];
  state.finalWinner = null;
  state.responseSaved = false;
  state.choosing = false;
}

async function startGame() {
  const input = document.getElementById("nameInput");
  const error = document.getElementById("nameError");
  const startButton = document.getElementById("startButton");

  if (!input || !error || state.starting) {
    return;
  }

  const name = input.value.trim();

  error.textContent = "";

  if (!name) {
    error.textContent = "Put your name in first 😭";
    input.focus();
    return;
  }

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

  if (startButton) {
    startButton.disabled = true;
  }

  try {
    if (firebaseReady) {
      const user = await ensureAnonymousSession();

      if (!user || !user.isAnonymous) {
        throw new Error(
          "Anonymous authentication failed."
        );
      }
    } else {
      state.sessionId = createLocalSessionId();
    }

    state.name = name;
    state.startedAt = Date.now();

    resetGameState();

    showScreen("battle");
    renderNextMatch();
  } catch (errorObject) {
    console.error(
      "Game start failed:",
      errorObject
    );

    error.textContent =
      "Couldn't start the game right now. Try again.";
  } finally {
    state.starting = false;

    if (startButton) {
      startButton.disabled = false;
    }
  }
}

function renderNextMatch() {
  if (state.finalWinner) {
    return;
  }

  const players = state.currentRoundPlayers;
  const index = state.currentPairIndex;

  if (index >= players.length) {
    completeRound();
    return;
  }

  const first = players[index];
  const second = players[index + 1];

  if (!first) {
    completeRound();
    return;
  }

  if (!second) {
    state.currentRoundWinners.push(first);
    state.currentPairIndex += 1;
    completeRound();
    return;
  }

  state.currentPair = {
    first,
    second
  };

  state.choosing = false;

  renderBattle();
}

function completeRound() {
  const players = state.currentRoundPlayers;
  const winners = [...state.currentRoundWinners];

  if (players.length % 2 === 1) {
    const byePlayer = players[players.length - 1];

    if (
      !winners.some(
        (photo) => photo.id === byePlayer.id
      )
    ) {
      winners.push(byePlayer);
    }
  }

  if (winners.length === 1) {
    state.finalWinner = winners[0];
    showWinner();
    return;
  }

  state.currentRound += 1;
  state.currentRoundPlayers = winners;
  state.currentRoundWinners = [];
  state.currentPairIndex = 0;
  state.currentPair = null;
  state.roundMatches = Math.floor(
    winners.length / 2
  );

  renderNextMatch();
}

function chooseWinner(winnerId) {
  if (!state.currentPair || state.choosing) {
    return;
  }

  const { first, second } = state.currentPair;

  let winner = null;
  let loser = null;

  if (winnerId === first.id) {
    winner = first;
    loser = second;
  } else if (winnerId === second.id) {
    winner = second;
    loser = first;
  } else {
    return;
  }

  state.choosing = true;

  document.querySelectorAll(
    "[data-photo-id]"
  ).forEach((button) => {
    button.disabled = true;
  });

  const selectedButton =
    document.querySelector(
      `[data-photo-id="${winner.id}"]`
    );

  selectedButton?.classList.add("picked");

  state.votes.push({
    round: state.currentRound,
    match:
      Math.floor(
        state.currentPairIndex / 2
      ) + 1,
    winnerId: winner.id,
    winnerLabel: winner.label,
    loserId: loser.id,
    loserLabel: loser.label,
    timestamp:
      new Date().toISOString()
  });

  state.currentRoundWinners.push(winner);
  state.currentPair = null;

  state.currentPairIndex += 2;

  window.setTimeout(() => {
    renderNextMatch();
  }, 180);
}

function renderBattle() {
  if (!state.currentPair) {
    return;
  }

  const roundLabel =
    document.getElementById("roundLabel");

  const battleTitle =
    document.getElementById("battleTitle");

  const progressText =
    document.getElementById("progressText");

  const progressBar =
    document.getElementById("progressBar");

  const grid =
    document.getElementById("battleGrid");

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
    Math.max(1, state.roundMatches);

  const currentMatch =
    Math.floor(
      state.currentPairIndex / 2
    ) + 1;

  roundLabel.textContent =
    `ROUND ${state.currentRound}`;

  battleTitle.textContent =
    state.currentRound === 1
      ? "Okay, judge this."
      : state.currentRound === 2
        ? "Now it gets serious."
        : state.currentRound === 3
          ? "Now we're getting close."
          : "Final stretch.";

  progressText.textContent =
    `${Math.min(
      currentMatch,
      totalMatches
    )} / ${totalMatches}`;

  progressBar.style.width =
    `${Math.min(
      100,
      (currentMatch / totalMatches) * 100
    )}%`;

  grid.innerHTML = "";

  const photos = [
    state.currentPair.first,
    state.currentPair.second
  ];

  photos.forEach((photo, index) => {
    const button =
      document.createElement("button");

    button.type = "button";
    button.className = "photo-choice";
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
        imageErrorFallback(
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
        chooseWinner(photo.id);
      }
    );

    grid.appendChild(button);
  });
}

function showWinner() {
  if (!state.finalWinner) {
    return;
  }

  const winner =
    state.finalWinner;

  const elapsed =
    Math.max(
      0,
      (Date.now() -
        state.startedAt) / 1000
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
      String(photoManifest.length);
  }

  if (finishTime) {
    finishTime.textContent =
      formatSeconds(elapsed);
  }

  if (winnerCard) {
    winnerCard.innerHTML = "";

    const img =
      document.createElement("img");

    img.src = winner.src;
    img.alt = winner.label;

    img.addEventListener(
      "error",
      (event) => {
        imageErrorFallback(
          event.currentTarget,
          winner
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
      winner.label;

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

function buildResponsePayload(elapsed) {
  return {
    name: state.name,

    sessionId:
      state.sessionId,

    durationSeconds:
      Math.max(
        0,
        Math.round(elapsed)
      ),

    totalPhotos:
      photoManifest.length,

    finalWinnerId:
      state.finalWinner?.id ??
      null,

    finalWinnerLabel:
      state.finalWinner?.label ??
      null,

    votes:
      state.votes.map(
        (vote) => ({
          round: vote.round,
          match: vote.match,
          winnerId:
            vote.winnerId,
          winnerLabel:
            vote.winnerLabel,
          loserId:
            vote.loserId,
          loserLabel:
            vote.loserLabel,
          timestamp:
            vote.timestamp
        })
      ),

    eliminatedByRound:
      state.votes.map(
        (vote) =>
          `${vote.loserLabel} lost to ${vote.winnerLabel} in Round ${vote.round}`
      ),

    browser:
      String(
        navigator.userAgent || ""
      ).slice(0, 500),

    platform:
      String(
        navigator.platform || ""
      ).slice(0, 100),

    language:
      String(
        navigator.language || ""
      ).slice(0, 50),

    screen:
      `${window.innerWidth}x${window.innerHeight}`
        .slice(0, 30),

    referrer:
      document.referrer
        ? document.referrer.slice(
            0,
            2048
          )
        : null
  };
}

function validateResponsePayload(payload) {
  if (
    !payload ||
    !payload.name ||
    payload.name.length < 2 ||
    payload.name.length > 40
  ) {
    return false;
  }

  if (
    !payload.sessionId ||
    payload.totalPhotos !== 10
  ) {
    return false;
  }

  if (
    !payload.finalWinnerId ||
    !payload.finalWinnerLabel
  ) {
    return false;
  }

  if (
    !Array.isArray(
      payload.votes
    ) ||
    payload.votes.length !== 9
  ) {
    return false;
  }

  if (
    payload.votes[8]
      .winnerId !==
    payload.finalWinnerId
  ) {
    return false;
  }

  return payload.votes.every(
    (vote) =>
      vote &&
      Number.isInteger(
        vote.round
      ) &&
      vote.round >= 1 &&
      vote.round <= 4 &&
      Number.isInteger(
        vote.match
      ) &&
      vote.match >= 1 &&
      vote.match <= 9 &&
      typeof vote.winnerId ===
        "string" &&
      typeof vote.loserId ===
        "string" &&
      typeof vote.winnerLabel ===
        "string" &&
      typeof vote.loserLabel ===
        "string" &&
      vote.winnerId !==
        vote.loserId
  );
}

async function saveResponse(elapsed) {
  if (state.responseSaved) {
    return;
  }

  state.responseSaved = true;

  const status =
    document.getElementById(
      "saveStatus"
    );

  const payload =
    buildResponsePayload(
      elapsed
    );

  if (
    !validateResponsePayload(
      payload
    )
  ) {
    state.responseSaved =
      false;

    if (status) {
      status.textContent =
        "Something went wrong saving the verdict.";
    }

    return;
  }

  try {
    localStorage.setItem(
      `pfp_response_${payload.sessionId}`,
      JSON.stringify({
        ...payload,
        submittedAt:
          new Date().toISOString()
      })
    );
  } catch (error) {
    console.warn(
      "Local storage save failed:",
      error
    );
  }

  let firestoreSaved =
    false;

  let emailSent =
    false;

  if (
    firebaseReady &&
    db &&
    auth
  ) {
    try {
      const user =
        await ensureAnonymousSession();

      if (
        !user ||
        !user.isAnonymous
      ) {
        throw new Error(
          "No anonymous Firebase session is available."
        );
      }

      payload.sessionId =
        user.uid;

      const firestoreTimestamp =
        serverTimestamp();

      await addDoc(
        collection(
          db,
          "responses"
        ),
        {
          name:
            payload.name,

          sessionId:
            payload.sessionId,

          submittedAt:
            firestoreTimestamp,

          durationSeconds:
            payload.durationSeconds,

          totalPhotos:
            payload.totalPhotos,

          finalWinnerId:
            payload.finalWinnerId,

          finalWinnerLabel:
            payload.finalWinnerLabel,

          votes:
            payload.votes,

          eliminatedByRound:
            payload.eliminatedByRound,

          browser:
            payload.browser,

          platform:
            payload.platform,

          language:
            payload.language,

          screen:
            payload.screen,

          referrer:
            payload.referrer,

          savedAt:
            firestoreTimestamp
        }
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
        payload.finalWinnerLabel ||
          "Unknown"
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
          {
            ...payload,
            submittedAt
          },
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
            body: formData
          }
        );

      emailSent =
        response.ok;
    } catch (error) {
      console.error(
        "Formspree submission failed:",
        error
      );
    }
  }

  if (!status) {
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
      "Sent. Your verdict has officially been delivered 👀";
  } else if (
    !firebaseReady &&
    !endpoint
  ) {
    status.textContent =
      "Verdict saved on this browser.";
  } else if (
    firebaseReady &&
    !firestoreSaved
  ) {
    status.textContent =
      "Email sent, but the scoreboard could not save your vote.";
  } else {
    status.textContent =
      "Your verdict could not be delivered. Try again.";
  }
}

function openDevMode() {
  const error =
    document.getElementById(
      "devError"
    );

  if (error) {
    error.textContent =
      "";
  }

  if (
    !firebaseReady ||
    !auth
  ) {
    showScreen(
      "devLogin"
    );

    if (error) {
      error.textContent =
        "Developer mode needs Firebase configured first.";
    }

    return;
  }

  if (
    auth.currentUser &&
    !auth.currentUser.isAnonymous
  ) {
    showScreen(
      "dashboard"
    );

    loadDashboard();

    return;
  }

  showScreen(
    "devLogin"
  );
}

async function loginDev() {
  const emailInput =
    document.getElementById(
      "devEmail"
    );

  const passwordInput =
    document.getElementById(
      "devPassword"
    );

  const loginButton =
    document.getElementById(
      "devLoginButton"
    );

  const error =
    document.getElementById(
      "devError"
    );

  if (
    !emailInput ||
    !passwordInput ||
    !error
  ) {
    return;
  }

  const email =
    emailInput.value.trim();

  const password =
    passwordInput.value;

  error.textContent =
    "";

  if (
    !firebaseReady ||
    !auth
  ) {
    error.textContent =
      "Firebase is not configured.";
    return;
  }

  if (
    !email ||
    !password
  ) {
    error.textContent =
      "Enter both the developer email and password.";
    return;
  }

  if (loginButton) {
    loginButton.disabled =
      true;
  }

  try {
    if (auth.currentUser) {
      await signOut(auth);
    }

    const credential =
      await signInWithEmailAndPassword(
        auth,
        email,
        password
      );

    if (
      !credential.user ||
      credential.user.isAnonymous
    ) {
      throw new Error(
        "Developer authentication was not accepted."
      );
    }

    showScreen(
      "dashboard"
    );

    await loadDashboard();
  } catch (loginError) {
    console.error(
      "Developer login failed:",
      loginError
    );

    error.textContent =
      "Login failed. Check your developer email and password.";
  } finally {
    if (loginButton) {
      loginButton.disabled =
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
    !db ||
    !auth
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
      `<div class="empty-state">Developer access is not active.</div>`;

    trends.innerHTML =
      "";

    responses.innerHTML =
      "";

    return;
  }

  summary.innerHTML =
    `<div class="empty-state">Loading votes…</div>`;

  try {
    const snap =
      await getDocs(
        collection(
          db,
          "responses"
        )
      );

    const rows =
      snap.docs
        .map((doc) => ({
          id: doc.id,
          ...doc.data()
        }))
        .sort(
          (a, b) =>
            getDateMillis(
              b.savedAt ??
              b.submittedAt
            ) -
            getDateMillis(
              a.savedAt ??
              a.submittedAt
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
      `<div class="empty-state">Could not load responses. Check the developer UID in Firestore Rules.</div>`;

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

  if (
    !summary ||
    !trends ||
    !responses
  ) {
    return;
  }

  const photoStats =
    Object.fromEntries(
      photoManifest.map(
        (photo) => [
          photo.id,
          {
            label:
              photo.label,
            wins: 0,
            losses: 0,
            finals: 0,
            appearances: 0
          }
        ]
      )
    );

  let totalMatches =
    0;

  for (const row of rows) {
    const votes =
      Array.isArray(
        row.votes
      )
        ? row.votes
        : [];

    totalMatches +=
      votes.length;

    for (const vote of votes) {
      if (
        !vote ||
        !vote.winnerId ||
        !vote.loserId
      ) {
        continue;
      }

      if (
        !photoStats[
          vote.winnerId
        ]
      ) {
        photoStats[
          vote.winnerId
        ] = {
          label:
            String(
              vote.winnerLabel ||
                "Unknown"
            ),
          wins: 0,
          losses: 0,
          finals: 0,
          appearances: 0
        };
      }

      if (
        !photoStats[
          vote.loserId
        ]
      ) {
        photoStats[
          vote.loserId
        ] = {
          label:
            String(
              vote.loserLabel ||
                "Unknown"
            ),
          wins: 0,
          losses: 0,
          finals: 0,
          appearances: 0
        };
      }

      photoStats[
        vote.winnerId
      ].wins += 1;

      photoStats[
        vote.loserId
      ].losses += 1;

      photoStats[
        vote.winnerId
      ].appearances += 1;

      photoStats[
        vote.loserId
      ].appearances += 1;
    }

    if (
      row.finalWinnerId &&
      photoStats[
        row.finalWinnerId
      ]
    ) {
      photoStats[
        row.finalWinnerId
      ].finals += 1;
    }
  }

  const stats =
    Object.values(
      photoStats
    )
      .map(
        (item) => ({
          ...item,
          winRate:
            item.appearances
              ? Math.round(
                  (item.wins /
                    item.appearances) *
                    100
                )
              : 0
        })
      )
      .sort(
        (a, b) =>
          b.finals -
            a.finals ||
          b.wins -
            a.wins ||
          b.winRate -
            a.winRate
      );

  const topPhoto =
    stats[0];

  const maxWins =
    Math.max(
      1,
      ...stats.map(
        (item) =>
          item.wins
      )
    );

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
          topPhoto
            ? escapeHtml(
                topPhoto.label.replace(
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
          topPhoto
            ? topPhoto.wins
            : 0
        }
      </div>
    </div>
  `;

  trends.innerHTML = `
    <div class="section-title">
      Who is winning right now?
    </div>

    <div class="trend-card">
      ${
        stats
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
                    item.winRate
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

const startButton =
  document.getElementById(
    "startButton"
  );

const nameInput =
  document.getElementById(
    "nameInput"
  );

const restartButton =
  document.getElementById(
    "restartButton"
  );

const devButton =
  document.getElementById(
    "devButton"
  );

const backHomeButton =
  document.getElementById(
    "backHomeButton"
  );

const devLoginButton =
  document.getElementById(
    "devLoginButton"
  );

const refreshDashboard =
  document.getElementById(
    "refreshDashboard"
  );

const logoutButton =
  document.getElementById(
    "logoutButton"
  );

const devPassword =
  document.getElementById(
    "devPassword"
  );

startButton?.addEventListener(
  "click",
  startGame
);

nameInput?.addEventListener(
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

restartButton?.addEventListener(
  "click",
  () => {
    if (nameInput) {
      nameInput.value =
        "";
    }

    const nameError =
      document.getElementById(
        "nameError"
      );

    if (nameError) {
      nameError.textContent =
        "";
    }

    showScreen("start");
  }
);

devButton?.addEventListener(
  "click",
  openDevMode
);

backHomeButton?.addEventListener(
  "click",
  () => {
    showScreen("start");
  }
);

devLoginButton?.addEventListener(
  "click",
  loginDev
);

refreshDashboard?.addEventListener(
  "click",
  loadDashboard
);

logoutButton?.addEventListener(
  "click",
  async () => {
    if (!auth) {
      showScreen("start");
      return;
    }

    try {
      await signOut(auth);
    } catch (error) {
      console.error(
        "Developer logout failed:",
        error
      );
    }

    showScreen("start");
  }
);

devPassword?.addEventListener(
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

if (auth) {
  onAuthStateChanged(
    auth,
    (user) => {
      if (
        !user &&
        screens.dashboard?.classList.contains(
          "active"
        )
      ) {
        showScreen(
          "devLogin"
        );
      }
    }
  );
}

showScreen("start");
