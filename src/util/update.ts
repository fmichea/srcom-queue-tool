import {
  DocumentSnapshot,
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { GameDoc, RunDoc } from "../types/firestore";
import { collection, doc } from "./firestore";
import { getAllUnverifiedRuns, getGame } from "./srcom";

// Update a game's doc in the firestore
export async function updateGame(abbreviation: string) {
  const game = await getGame(abbreviation);

  const gameDocRef = doc<GameDoc>(collection(undefined, "games"), abbreviation);
  await setDoc(gameDocRef, game);

  await updateGameQueue(await getDoc(gameDocRef));
}

// Update a game's queue in the firestore
export async function updateGameQueue(gameDoc: DocumentSnapshot<GameDoc>) {
  const game = gameDoc.data();
  if (game === undefined) {
    return;
  }

  const runs = await getAllUnverifiedRuns(game.srcomId);

  const queueCollection = collection<RunDoc>(gameDoc.ref, "queue");

  const promises = [];
  for (const run of runs) {
    const runDocRef = doc<RunDoc>(queueCollection, run.id);
    promises.push(setDoc(runDocRef, run, { merge: true }));
  }

  await Promise.all(promises);

  // update queueLastUpdated
  await setDoc(
    gameDoc.ref,
    { queueLastUpdated: serverTimestamp() },
    { merge: true }
  );
}

// Firestore object TTLs, in seconds
// Game docs: 1 day
const GAME_TTL = 1 * 60 * 60 * 24;
// Game queues: 1 minute
const GAME_QUEUE_TTL = 300;

export function shouldUpdateGame(gameDoc?: DocumentSnapshot<GameDoc>): boolean {
  if (gameDoc === undefined) {
    // gameDoc is undefined if value from db is still being loaded; don't get ahead of ourselves here
    return false;
  }

  if (gameDoc?.exists() === false) {
    return true;
  }

  if (gameDoc.data()?.lastUpdated === null) {
    // This field can briefly be null right after updating its value
    return false;
  }

  return (
    Timestamp.now().seconds - gameDoc.data()!.lastUpdated.seconds > GAME_TTL
  );
}

export function shouldUpdateGameQueue(
  gameDoc?: DocumentSnapshot<GameDoc>
): boolean {
  if (gameDoc === undefined) {
    // gameDoc is undefined if value from db is still being loaded; don't get ahead of ourselves here
    return false;
  }

  if (gameDoc.exists() === false) {
    return true;
  }

  if (gameDoc.data()?.queueLastUpdated === null) {
    // This field can briefly be null right after updating its value
    return false;
  }

  return (
    Timestamp.now().seconds - gameDoc.data()!.queueLastUpdated.seconds >
    GAME_QUEUE_TTL
  );
}
