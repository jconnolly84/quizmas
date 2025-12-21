// common.js
import { firebaseConfig } from "./firebaseConfig.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import {
  getFirestore, doc, setDoc, getDoc, updateDoc, onSnapshot,
  serverTimestamp, runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

function roomRef(roomId) {
  return doc(db, "rooms", roomId);
}

export async function ensureRoom(roomId) {
  const ref = roomRef(roomId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      createdAt: serverTimestamp(),
      buzz: { lockedBy: null, lockedAt: null }
    });
  }
}

export function listenRoom(roomId, cb) {
  return onSnapshot(roomRef(roomId), (snap) => cb(snap.exists() ? snap.data() : null));
}

export async function resetBuzz(roomId) {
  await updateDoc(roomRef(roomId), {
    "buzz.lockedBy": null,
    "buzz.lockedAt": null
  });
}

// First buzz wins using a transaction (prevents ties)
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
