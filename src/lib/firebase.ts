import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyAoFppYEsJ53ioW7amqrxNTaHyp-zMSWO4",
  authDomain: "mess-management-e8f63.firebaseapp.com",
  projectId: "mess-management-e8f63",
  storageBucket: "mess-management-e8f63.firebasestorage.app",
  messagingSenderId: "79198272841",
  appId: "1:79198272841:web:1e720923ce43cd7ea4ee98",
  measurementId: "G-SCBJHTNDH9",
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

export function getSecondaryAuth() {
  const secondaryName = "admin-user-management";
  const existing = getApps().find((item) => item.name === secondaryName);
  const secondaryApp = existing ?? initializeApp(firebaseConfig, secondaryName);
  return getAuth(secondaryApp);
}

export type Role = "owner" | "manager" | "member";
export type UserStatus = "active" | "suspended" | "removed";

export interface AppUser {
  uid: string;
  email: string | null;
  name: string;
  role: Role;
  status?: UserStatus;
  active?: boolean;
  suspendedAt?: number;
  removedAt?: number;
  phone?: string;
  photoURL?: string | null;
  createdAt?: number;
}
