// common.js
import { firebaseConfig } from "./firebaseConfig.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

function roomRef(roomId) {
  return doc(db, "rooms", roomId);
}

/**
 * Creates the room document if it doesn't exist.
 * Includes buzzer + scoring + (now) game/charades state.
 */
export async function ensureRoom(roomId) {
  const ref = roomRef(roomId);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(ref, {
      createdAt: serverTimestamp(),

      // Buzzer state (first buzz wins)
      buzz: { lockedBy: null, lockedAt: null },

      // Scoring state
      teams: [],
      scores: {},

      // Game state (new)
      game: { round: null, index: 0, reveal: false },

      // Charades state (new)
      live: null,
      reveal: false,

      charades: {
        actorTeam: null,
        person: null,
        endsAt: null,      // ms epoch
        running: false,
        revealed: false
      }
    });
    return;
  }

  // If the room already existed (from earlier), ensure new fields exist
  const data = snap.data() || {};
  const patch = {};

  if (!data.teams) patch.teams = [];
  if (!data.scores) patch.scores = {};
  if (!data.game) {
    patch.game = { round: null, index: 0, reveal: false };
  }
  if (!data.charades) {
    patch.charades = { actorTeam: null, person: null, endsAt: null, running: false, revealed: false };
  }

  if (Object.keys(patch).length) {
    await updateDoc(ref, patch);
  }
}

/**
 * Live listener for a room document.
 */
export function listenRoom(roomId, cb) {
  return onSnapshot(roomRef(roomId), (snap) =>
    cb(snap.exists() ? snap.data() : null)
  );
}

/**
 * Resets the buzzer lock so another buzz can happen.
 */
export async function resetBuzz(roomId) {
  await updateDoc(roomRef(roomId), {
    "buzz.lockedBy": null,
    "buzz.lockedAt": null
  });
}

/**
 * First buzz wins using a Firestore transaction (prevents ties).
 */
export async function buzz(roomId, teamName) {
  const ref = roomRef(roomId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Room missing");

    const data = snap.data();
    if (data?.buzz?.lockedBy) return; // already locked

    tx.update(ref, {
      "buzz.lockedBy": teamName,
      "buzz.lockedAt": Date.now()
    });
  });
}

/**
 * Registers a team in the room (idempotent).
 * - Adds team to teams[] if missing
 * - Initialises score to 0 if missing
 */
export async function registerTeam(roomId, teamName) {
  const ref = roomRef(roomId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Room missing");

    const data = snap.data() || {};
    const teams = Array.isArray(data.teams) ? [...data.teams] : [];
    const scores = data.scores ? { ...data.scores } : {};

    if (!teams.includes(teamName)) {
      teams.push(teamName);
    }
    if (scores[teamName] === undefined) {
      scores[teamName] = 0;
    }

    tx.update(ref, { teams, scores });
  });
}

/**
 * Adjusts a team's score by delta (e.g. +1, +2, -1).
 */
export async function changeScore(roomId, teamName, delta) {
  const ref = roomRef(roomId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Room missing");

    const data = snap.data() || {};
    const scores = data.scores ? { ...data.scores } : {};
    const current = Number(scores[teamName] ?? 0);

    scores[teamName] = current + Number(delta);

    tx.update(ref, { scores });
  });
}

/**
 * CHARADES: Start a round.
 */
export async function startCharades(roomId, actorTeam, person, seconds) {
  const endsAt = Date.now() + (Number(seconds) * 1000);

  await updateDoc(roomRef(roomId), {
    game: { round: "charades", index: Date.now(), reveal: false },
    live: null,
      reveal: false,

      charades: {
      actorTeam,
      person,
      endsAt,
      running: true,
      revealed: false
    },
    // clear buzzer for this round
    "buzz.lockedBy": null,
    "buzz.lockedAt": null
  });
}

/**
 * CHARADES: Stop the timer early (doesn't reveal).
 */
export async function stopCharades(roomId) {
  await updateDoc(roomRef(roomId), {
    "charades.running": false
  });
}

/**
 * CHARADES: Reveal the person name on host (and stop timer).
 */
export async function revealCharades(roomId) {
  await updateDoc(roomRef(roomId), {
    "charades.revealed": true,
    "charades.running": false
  });
}


/**
 * Sets the current live question (host controlled).
 */
export async function setLiveQuestion(roomId, live) {
  await updateDoc(roomRef(roomId), {
    live,
    reveal: false,
    game: { round: "questions", index: live?.index ?? 0, reveal: false },
    // Clear any previous charades state so devices switch cleanly
    charades: {
      actorTeam: null,
      person: null,
      endsAt: null,
      running: false,
      revealed: false
    },
    "buzz.lockedBy": null,
    "buzz.lockedAt": null
  });
}

/**
 * Toggles reveal for the live question.
 */
export async function setReveal(roomId, reveal) {
  await updateDoc(roomRef(roomId), { reveal: !!reveal });
}
