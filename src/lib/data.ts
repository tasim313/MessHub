import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  getDocs,
  where,
  type QueryConstraint,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import type {
  ServiceSubscription,
  Member,
  MealEntry,
  Bazar,
  Utility,
  Deposit,
  Room,
  Staff,
  ChangeRequest,
  ActivityLog,
  Bed,
  Credit,
  Payment,
  LedgerEntry,
  Report,
  Notification,
  MonthlyClosing,
  Settings,
  Expense,
} from "./types";

// Re-export all types for backward compatibility with existing imports
export type {
  ServiceSubscription,
  Member,
  MealEntry,
  Bazar,
  Utility,
  Deposit,
  Room,
  Staff,
  ChangeRequest,
  ActivityLog,
  Bed,
  Credit,
  Payment,
  LedgerEntry,
  Report,
  Notification,
  MonthlyClosing,
  Settings,
  Expense,
};

export function withoutUndefined<T extends Record<string, unknown>>(
  data: T,
): T {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined),
  ) as T;
}

// NOTE: All type definitions (Member, MealEntry, Bazar, Utility, Deposit, Room, Staff, etc.)
// are now imported from src/lib/types.ts to ensure a single source of truth.

export function useCollection<T>(
  path: string,
  constraints: QueryConstraint[] = [],
) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const key = JSON.stringify(
    constraints.map((c) => (c as { type?: string }).type || ""),
  );
  useEffect(() => {
    const q = query(collection(db, path), ...constraints);
    const unsub = onSnapshot(
      q,
      (snap) => {
        setData(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T));
        setLoading(false);
      },
      (err) => {
        console.error("snapshot error", path, err);
        setLoading(false);
      },
    );
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, key]);
  return { data, loading };
}

export async function addDocTo<T extends Record<string, unknown>>(
  path: string,
  data: T,
  uid?: string,
) {
  return addDoc(
    collection(db, path),
    withoutUndefined({
      ...data,
      createdBy: uid || auth.currentUser?.uid,
      createdAt: Date.now(),
      createdAtServer: serverTimestamp(),
    }),
  );
}

export async function updateDocIn<T extends Record<string, unknown>>(
  path: string,
  id: string,
  data: T,
) {
  return updateDoc(doc(db, path, id), withoutUndefined(data));
}

export async function deleteDocFrom(path: string, id: string) {
  return deleteDoc(doc(db, path, id));
}

export async function setDocIn<T extends Record<string, unknown>>(
  path: string,
  id: string,
  data: T,
  uid?: string,
) {
  return setDoc(
    doc(db, path, id),
    withoutUndefined({
      ...data,
      createdBy: uid || auth.currentUser?.uid,
    }),
    { merge: true },
  );
}

export async function findMemberByUid(uid: string) {
  const snap = await getDocs(
    query(collection(db, "members"), where("uid", "==", uid)),
  );
  const first = snap.docs[0];
  return first ? ({ id: first.id, ...first.data() } as Member) : null;
}

export { where, orderBy };
