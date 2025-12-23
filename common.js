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
  runTransaction,
  arrayUnion
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

function roomRef(roomId) {
  return doc(db, "rooms", roomId);
}

/**
 * Creates the room document if it doesn't exist.
 * Includes buzzer + scoring + game/charades/live-question state.
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

      // Stage state
      game: { round: null, index: 0, reveal: false },

      // Live questions (preloaded)
      live: null,
      reveal: false,

      // Charades state
      charades: {
        actorTeam: null,
        person: null,
        endsAt: null,
        running: false,
        revealed: false,
        used: []
      },

      // Hum the Tune state
      hum: {
        hummerTeam: null,
        song: null, // string (e.g. "Jingle Bells — Traditional")
        endsAt: null,
        running: false,
        revealed: false,
        used: []
      }
    });
    return;
  }

  // If the room already existed, ensure new fields exist
  const data = snap.data() || {};
  const patch = {};

  if (!data.teams) patch.teams = [];
  if (!data.scores) patch.scores = {};

  if (!data.game) patch.game = { round: null, index: 0, reveal: false };
  if (data.live === undefined) patch.live = null;
  if (data.reveal === undefined) patch.reveal = false;

  if (!data.charades) {
    patch.charades = { actorTeam: null, person: null, endsAt: null, running: false, revealed: false, used: [] };
  }
  if (!data.hum) {
    patch.hum = { hummerTeam: null, song: null, endsAt: null, running: false, revealed: false, used: [] };
  }

  if (Object.keys(patch).length) {
    await updateDoc(ref, patch);
  }
}

/**
 * Live listener for a room document.
 */
export function listenRoom(roomId, cb) {
  return onSnapshot(roomRef(roomId), (snap) => cb(snap.exists() ? snap.data() : null));
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
  await runTransaction,
  arrayUnion(db, async (tx) => {
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
 */
export async function registerTeam(roomId, teamName) {
  const ref = roomRef(roomId);

  await runTransaction,
  arrayUnion(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Room missing");

    const data = snap.data() || {};
    const teams = Array.isArray(data.teams) ? [...data.teams] : [];
    const scores = data.scores ? { ...data.scores } : {};

    if (!teams.includes(teamName)) teams.push(teamName);
    if (scores[teamName] === undefined) scores[teamName] = 0;

    tx.update(ref, { teams, scores });
  });
}

/**
 * Adjusts a team's score by delta.
 */
export async function changeScore(roomId, teamName, delta) {
  const ref = roomRef(roomId);

  await runTransaction,
  arrayUnion(db, async (tx) => {
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
 * LIVE QUESTIONS: sets the current question and switches stage to "questions".
 */
export async function setLiveQuestion(roomId, live) {
  await updateDoc(roomRef(roomId), {
    live,
    reveal: false,
    game: { round: "questions", index: Number(live?.index ?? 0), reveal: false },

    // Clear any previous stage state so devices switch cleanly
    charades: { actorTeam: null, person: null, endsAt: null, running: false, revealed: false },
    hum: { hummerTeam: null, song: null, endsAt: null, running: false, revealed: false },

    // Reset buzzer for the question
    "buzz.lockedBy": null,
    "buzz.lockedAt": null
  });
}

export async function setReveal(roomId, reveal) {
  await updateDoc(roomRef(roomId), { reveal: !!reveal });
}

/**
 * CHARADES: start and take control of the stage.
 */
export async function startCharades(roomId, actorTeam, person, seconds) {
  await updateDoc(roomRef(roomId), {
    game: { round: "charades", index: 0, reveal: false },

    // Clear any previous live question so teams don't keep seeing it
    live: null,
    reveal: false,

    "charades.actorTeam": actorTeam,
    "charades.person": person,
    "charades.endsAt": Date.now() + Number(seconds) * 1000,
    "charades.running": true,
    "charades.revealed": false,
    "charades.used": arrayUnion(person),

    // Clear hum state so devices switch cleanly (but keep hum.used history)
    "hum.hummerTeam": null,
    "hum.song": null,
    "hum.endsAt": null,
    "hum.running": false,
    "hum.revealed": false,

    // Clear buzzer for this round
    "buzz.lockedBy": null,
    "buzz.lockedAt": null
  });
}

export async function stopCharades(roomId) {
  // Stop the round and freeze the timer immediately
  await updateDoc(roomRef(roomId), { "charades.running": false, "charades.endsAt": null });
}

export async function revealCharades(roomId) {
  // Reveal and stop; also clear endsAt so host/team UIs stop counting
  await updateDoc(roomRef(roomId), { "charades.revealed": true, "charades.running": false, "charades.endsAt": null });
}


/**
 * HUM THE TUNE: start and take control of the stage.
 */
export async function startHum(roomId, hummerTeam, song, seconds) {
  await updateDoc(roomRef(roomId), {
    game: { round: "hum", index: 0, reveal: false },

    // Clear other stage content
    live: null,
    reveal: false,
    charades: { actorTeam: null, person: null, endsAt: null, running: false, revealed: false },

    hum: {
      hummerTeam,
      song,
      endsAt: Date.now() + Number(seconds) * 1000,
      running: true,
      revealed: false
    },

    // Clear buzzer for this round
    "buzz.lockedBy": null,
    "buzz.lockedAt": null
  });
}

export async function stopHum(roomId) {
  // Stop the round and freeze the timer immediately
  await updateDoc(roomRef(roomId), { "hum.running": false, "hum.endsAt": null });
}

export async function revealHum(roomId) {
  // Reveal and stop; also clear endsAt so host/team UIs stop counting
  await updateDoc(roomRef(roomId), { "hum.revealed": true, "hum.running": false, "hum.endsAt": null });
}

/**
 * Clears the stage and returns everyone to buzzer-only mode.
 * Keeps teams/scores intact.
 */
export async function clearStage(roomId) {
  await updateDoc(roomRef(roomId), {
    live: null,
    reveal: false,
    game: { round: null, index: 0, reveal: false },

    // Reset round state but keep the per-room history (charades.used / hum.used)
    "charades.actorTeam": null,
    "charades.person": null,
    "charades.endsAt": null,
    "charades.running": false,
    "charades.revealed": false,

    "hum.hummerTeam": null,
    "hum.song": null,
    "hum.endsAt": null,
    "hum.running": false,
    "hum.revealed": false,

    "buzz.lockedBy": null,
    "buzz.lockedAt": null
  });
}


/**
 * Optional: reset the 'used' history for the room (only if you ever exhaust the lists).
 */
export async function resetCharadesPool(roomId) {
  await updateDoc(roomRef(roomId), { "charades.used": [] });
}

export async function resetHumPool(roomId) {
  await updateDoc(roomRef(roomId), { "hum.used": [] });
}
