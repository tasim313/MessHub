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
import { db } from "./firebase";

export function withoutUndefined<T extends Record<string, unknown>>(data: T): T {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined),
  ) as T;
}

export interface Member {
  id: string;
  name: string;
  email?: string | null;
  phone?: string;
  role: "owner" | "manager" | "member";
  uid?: string;
  active: boolean;
  joinedAt?: number;
}

export interface MealEntry {
  id: string;
  memberId: string;
  memberName: string;
  date: string; // YYYY-MM-DD
  ym: string;   // YYYY-MM
  breakfast: number;
  lunch: number;
  dinner: number;
  guest: number;
  createdAt?: number;
}

export interface Bazar {
  id: string;
  date: string;
  ym: string;
  buyerId: string;
  buyerName: string;
  items: { name: string; amount: number }[];
  total: number;
  category: string;
  notes?: string;
  createdAt?: number;
}

export interface Utility {
  id: string;
  ym: string;
  type: string; // electricity, gas, water, internet, bua, rent, etc.
  amount: number;
  paidBy?: string;
  paidByName?: string;
  notes?: string;
  date: string;
  createdAt?: number;
}

export interface Deposit {
  id: string;
  memberId: string;
  memberName: string;
  amount: number;
  method: string; // cash, bkash, nagad, rocket, bank
  date: string;
  ym: string;
  notes?: string;
  createdAt?: number;
}

export interface ChangeRequest {
  id: string;
  collectionName: string;
  action: "create" | "update" | "delete";
  targetId?: string;
  title: string;
  payload?: Record<string, unknown>;
  previousData?: Record<string, unknown> | null;
  requestedByUid: string;
  requestedByName: string;
  requestedByRole: Member["role"];
  status: "pending" | "approved" | "rejected";
  reviewNote?: string;
  reviewedByUid?: string;
  reviewedByName?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface ActivityLog {
  id: string;
  type: string;
  entity: string;
  entityId?: string;
  action: string;
  actorUid: string;
  actorName: string;
  actorRole: Member["role"];
  message: string;
  meta?: Record<string, unknown>;
  createdAt?: number;
}

export function useCollection<T>(path: string, constraints: QueryConstraint[] = []) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const key = JSON.stringify(constraints.map((c) => (c as { type?: string }).type || ""));
  useEffect(() => {
    const q = query(collection(db, path), ...constraints);
    const unsub = onSnapshot(
      q,
      (snap) => {
        setData(snap.docs.map((d) => ({ id: d.id, ...d.data() } as T)));
        setLoading(false);
      },
      (err) => {
        console.error("snapshot error", path, err);
        setLoading(false);
      }
    );
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, key]);
  return { data, loading };
}

export async function addDocTo<T extends Record<string, unknown>>(path: string, data: T) {
  return addDoc(collection(db, path), withoutUndefined({ ...data, createdAt: Date.now(), createdAtServer: serverTimestamp() }));
}

export async function updateDocIn<T extends Record<string, unknown>>(path: string, id: string, data: T) {
  return updateDoc(doc(db, path, id), withoutUndefined(data));
}

export async function deleteDocFrom(path: string, id: string) {
  return deleteDoc(doc(db, path, id));
}

export async function setDocIn<T extends Record<string, unknown>>(path: string, id: string, data: T) {
  return setDoc(doc(db, path, id), withoutUndefined(data), { merge: true });
}

export async function findMemberByUid(uid: string) {
  const snap = await getDocs(query(collection(db, "members"), where("uid", "==", uid)));
  const first = snap.docs[0];
  return first ? ({ id: first.id, ...first.data() } as Member) : null;
}

export { where, orderBy };
