import admin from "firebase-admin";

let db: admin.database.Database | null = null;

export function initializeFirebase(): admin.database.Database {
  if (db) {
    return db;
  }

  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccount) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT environment variable is required");
  }

  let parsedServiceAccount: admin.ServiceAccount;
  try {
    parsedServiceAccount = JSON.parse(serviceAccount);
  } catch (error) {
    throw new Error("Invalid FIREBASE_SERVICE_ACCOUNT JSON");
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(parsedServiceAccount),
      databaseURL: "https://sash-d5c2d-default-rtdb.firebaseio.com/",
    });
  }

  db = admin.database();
  return db;
}

export function getFirebaseDb(): admin.database.Database {
  if (!db) {
    return initializeFirebase();
  }
  return db;
}

export async function getUserData(clerkId: string): Promise<any> {
  const db = getFirebaseDb();
  const snapshot = await db.ref(`users/${clerkId}`).once("value");
  return snapshot.val();
}

export async function setUserData(clerkId: string, data: any): Promise<void> {
  const db = getFirebaseDb();
  await db.ref(`users/${clerkId}`).set(data);
}

export async function updateUserData(clerkId: string, updates: any): Promise<void> {
  const db = getFirebaseDb();
  await db.ref(`users/${clerkId}`).update(updates);
}

export async function getUserByUsername(username: string): Promise<{ clerkId: string; data: any } | null> {
  const db = getFirebaseDb();
  const snapshot = await db.ref("users").orderByChild("username").equalTo(username).once("value");
  const users = snapshot.val();
  if (!users) {
    return null;
  }
  const clerkId = Object.keys(users)[0];
  return { clerkId, data: users[clerkId] };
}

// Shared notes utilities
export async function getSharedNote(noteId: string): Promise<any> {
  const db = getFirebaseDb();
  const snapshot = await db.ref(`sharedNotes/${noteId}`).once("value");
  return snapshot.val();
}

export async function setSharedNote(noteId: string, note: any): Promise<void> {
  const db = getFirebaseDb();
  await db.ref(`sharedNotes/${noteId}`).set(note);
}

export async function deleteSharedNote(noteId: string): Promise<void> {
  const db = getFirebaseDb();
  await db.ref(`sharedNotes/${noteId}`).remove();
}

export async function getAllSharedNotes(): Promise<any[]> {
  const db = getFirebaseDb();
  const snapshot = await db.ref("sharedNotes").once("value");
  const data = snapshot.val();
  if (!data) return [];
  return Object.values(data);
}
