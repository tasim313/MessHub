/**
 * Duplicate Prevention Utilities
 * Ensures idempotent operations and prevents duplicate record creation
 */
import { doc, getDoc, query, where, getDocs, collection } from "firebase/firestore";
import { db } from "./firebase";

/**
 * Check if a rent charge already exists for a member in a given month
 * Returns true if duplicate exists
 */
export async function checkRentChargeExists(memberId: string, month: string): Promise<boolean> {
  const docRef = doc(db, "rent_charges", `${memberId}_${month}`);
  const snap = await getDoc(docRef);
  return snap.exists();
}

/**
 * Check if a meal entry already exists for a member on a given date
 * Returns true if duplicate exists
 */
export async function checkMealEntryExists(memberId: string, date: string): Promise<boolean> {
  const q = query(
    collection(db, "meals"),
    where("memberId", "==", memberId),
    where("date", "==", date)
  );
  const snap = await getDocs(q);
  return !snap.empty;
}

/**
 * Check if a monthly closing already exists for a given month
 * Returns true if duplicate exists
 */
export async function checkMonthlyClosingExists(month: string): Promise<boolean> {
  const docRef = doc(db, "monthly_closing", month);
  const snap = await getDoc(docRef);
  return snap.exists();
}

/**
 * Check if a utility allocation already exists for a utility and member
 * Returns true if duplicate exists
 */
export async function checkUtilityAllocationExists(utilityId: string, memberId: string): Promise<boolean> {
  const q = query(
    collection(db, "utility_allocations"),
    where("utilityId", "==", utilityId),
    where("memberId", "==", memberId)
  );
  const snap = await getDocs(q);
  return !snap.empty;
}

/**
 * Check if a staff allocation already exists for a staff, member, and month
 * Returns true if duplicate exists
 */
export async function checkStaffAllocationExists(staffId: string, memberId: string, month: string): Promise<boolean> {
  const q = query(
    collection(db, "staff_allocations"),
    where("staffId", "==", staffId),
    where("memberId", "==", memberId),
    where("month", "==", month)
  );
  const snap = await getDocs(q);
  return !snap.empty;
}

/**
 * Check if a room with the same room number already exists
 * Returns true if duplicate exists
 */
export async function checkRoomExists(buildingName: string, roomNo: string): Promise<boolean> {
  const q = query(
    collection(db, "rooms"),
    where("buildingName", "==", buildingName),
    where("roomNo", "==", roomNo)
  );
  const snap = await getDocs(q);
  return !snap.empty;
}

/**
 * Check if a member is already assigned to a bed in a room
 * Returns true if duplicate exists
 */
export async function checkBedOccupied(roomId: string, bedNo: string): Promise<boolean> {
  const q = query(
    collection(db, "members"),
    where("roomId", "==", roomId),
    where("bedNo", "==", bedNo),
    where("active", "==", true)
  );
  const snap = await getDocs(q);
  return !snap.empty;
}

/**
 * Check if a member is already assigned to another room
 * Returns true if member occupies multiple beds
 */
export async function checkMemberHasRoom(memberId: string): Promise<boolean> {
  const q = query(
    collection(db, "members"),
    where("id", "==", memberId),
    where("roomId", "!=", ""),
    where("active", "==", true)
  );
  const snap = await getDocs(q);
  return !snap.empty;
}

/**
 * Check if a payment with the same reference already exists
 * Returns true if duplicate exists
 */
export async function checkPaymentReferenceExists(referenceNo: string, date: string): Promise<boolean> {
  if (!referenceNo) return false;
  const q = query(
    collection(db, "payments"),
    where("referenceNo", "==", referenceNo),
    where("date", "==", date)
  );
  const snap = await getDocs(q);
  return !snap.empty;
}

/**
 * Check if a deposit with the same reference already exists
 * Returns true if duplicate exists
 */
export async function checkDepositReferenceExists(referenceNo: string, date: string): Promise<boolean> {
  if (!referenceNo) return false;
  const q = query(
    collection(db, "deposits"),
    where("referenceNo", "==", referenceNo),
    where("date", "==", date)
  );
  const snap = await getDocs(q);
  return !snap.empty;
}

/**
 * Check if a utility bill of the same type already exists for a given month
 * Returns true if duplicate exists
 */
export async function checkUtilityTypeExists(utilityType: string, month: string): Promise<boolean> {
  const q = query(
    collection(db, "utilities"),
    where("type", "==", utilityType),
    where("ym", "==", month)
  );
  const snap = await getDocs(q);
  return !snap.empty;
}

/**
 * Generate a unique ID for rent charges
 * Format: {memberId}_{month}
 */
export function generateRentChargeId(memberId: string, month: string): string {
  return `${memberId}_${month}`;
}

/**
 * Generate a unique ID for monthly closing
 * Format: {month}
 */
export function generateMonthlyClosingId(month: string): string {
  return month;
}

/**
 * Generate a unique ID for utility allocations
 * Format: {utilityId}_{memberId}
 */
export function generateUtilityAllocationId(utilityId: string, memberId: string): string {
  return `${utilityId}_${memberId}`;
}

/**
 * Generate a unique ID for staff allocations
 * Format: {staffId}_{memberId}_{month}
 */
export function generateStaffAllocationId(staffId: string, memberId: string, month: string): string {
  return `${staffId}_${memberId}_${month}`;
}

/**
 * Check if a ledger charge entry already exists for a member in a given month and category
 * Returns true if duplicate exists
 */
export async function checkLedgerChargeExists(memberId: string, month: string, category: string): Promise<boolean> {
  const q = query(
    collection(db, "ledgers"),
    where("memberId", "==", memberId),
    where("ym", "==", month),
    where("transactionType", "==", "charge"),
    where("category", "==", category)
  );
  const snap = await getDocs(q);
  return !snap.empty;
}