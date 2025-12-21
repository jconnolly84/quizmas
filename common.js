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
 * Includes buzzer + scoring state.
 */
export async function ensureRoom(roomId) {
  const ref = roomRef(roomId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      createdAt: serverTimestamp(),

      // Buzzer state (first buzz wins)
      buzz: { lockedBy: null, lockedAt: null },

      // Scoring state (new)
      teams: [],   // ["Team A", "Team B"]
      scores: {}   // { "Team A": 0, "Team B": 0 }
    });
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

