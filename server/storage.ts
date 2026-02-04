import type { UserData } from "@shared/schema";
import { getFirebaseDb } from "./firebase";

export interface IStorage {
  getUserData(clerkId: string): Promise<UserData | undefined>;
  setUserData(clerkId: string, data: UserData): Promise<void>;
  updateUserData(clerkId: string, updates: Partial<UserData>): Promise<void>;
}

export class FirebaseStorage implements IStorage {
  async getUserData(clerkId: string): Promise<UserData | undefined> {
    const db = getFirebaseDb();
    const snapshot = await db.ref(`users/${clerkId}`).once("value");
    return snapshot.val() || undefined;
  }

  async setUserData(clerkId: string, data: UserData): Promise<void> {
    const db = getFirebaseDb();
    await db.ref(`users/${clerkId}`).set(data);
  }

  async updateUserData(clerkId: string, updates: Partial<UserData>): Promise<void> {
    const db = getFirebaseDb();
    await db.ref(`users/${clerkId}`).update(updates);
  }
}

export const storage = new FirebaseStorage();
