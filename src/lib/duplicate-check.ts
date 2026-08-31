/**
 * Duplicate Prevention Utilities
 * Ensures idempotent operations and prevents duplicate record creation
 */
import { doc, getDoc, query, where, getDocs, collection, deleteDoc, orderBy } from "firebase/firestore";
import { db } from "./firebase";

const CHARGE_TRANSACTION_TYPES = ["meal_charge", "rent_charge", "utility_charge", "staff_charge", "other_charge"];

function isChargeType(transactionType: string): boolean {
  return CHARGE_TRANSACTION_TYPES.includes(transactionType);
}

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
 * Check if a ledger charge entry already exists for a member in a given month, category, and date.
 * This prevents duplicate charges for the same user, month, and date combination.
 * Uses a simple memberId-only query to avoid composite index requirements,
 * then filters client-side by month, transactionType, category, and date.
 */
export async function checkLedgerChargeExists(
  memberId: string,
  month: string,
  category: string,
  date?: string,
): Promise<boolean> {
  const q = query(
    collection(db, "ledgers"),
    where("memberId", "==", memberId),
  );
  const snap = await getDocs(q);
  return snap.docs.some((d) => {
    const data = d.data();
    // Check month, transactionType, and category
    if (data.ym !== month || !isChargeType(data.transactionType) || data.category !== category) {
      return false;
    }
    // If date is provided, also check date match
    if (date && data.date !== date) {
      return false;
    }
    return true;
  });
}

/**
 * Find duplicate charge entries for a member in a given month and category.
 * Returns the IDs of extra entries (keeping the first one by createdAt, marking others as duplicates).
 */
export async function findDuplicateLedgerCharges(
  memberId: string,
  month: string,
  category: string,
  date?: string,
): Promise<string[]> {
  const q = query(
    collection(db, "ledgers"),
    where("memberId", "==", memberId),
  );
  const snap = await getDocs(q);
  const matches = snap.docs
    .filter((d) => {
      const data = d.data();
      // Check month, transactionType, and category
      if (data.ym !== month || !isChargeType(data.transactionType) || data.category !== category) {
        return false;
      }
      // If date is provided, also check date match
      if (date && data.date !== date) {
        return false;
      }
      return true;
    })
    .sort((a, b) => ((a.data().createdAt || 0) - (b.data().createdAt || 0)));
  const docIds = matches.map((d) => d.id);
  if (docIds.length <= 1) return [];
  return docIds.slice(1);
}

/**
 * Delete duplicate charge entries for a member in a given month and category.
 * Keeps the oldest entry (by createdAt) and deletes the rest.
 */
export async function deleteDuplicateCharges(
  memberId: string,
  month: string,
  category: string,
  date?: string,
): Promise<number> {
  const duplicateIds = await findDuplicateLedgerCharges(memberId, month, category, date);
  const deletePromises = duplicateIds.map((id) => deleteDoc(doc(db, "ledgers", id)));
  await Promise.all(deletePromises);
  return duplicateIds.length;
}

/**
 * Get the unique existing ledger charge for a member/month/category.
 * If multiple entries exist, deletes extras and returns the first one's id and amount.
 * Returns null if no entry exists.
 */
export async function getUniqueLedgerCharge(
  memberId: string,
  month: string,
  category: string,
  date?: string,
): Promise<{ id: string; amount: number } | null> {
  const q = query(
    collection(db, "ledgers"),
    where("memberId", "==", memberId),
  );
  const snap = await getDocs(q);
  const matches = snap.docs
    .filter((d) => {
      const data = d.data();
      // Check month, transactionType, and category
      if (data.ym !== month || !isChargeType(data.transactionType) || data.category !== category) {
        return false;
      }
      // If date is provided, also check date match
      if (date && data.date !== date) {
        return false;
      }
      return true;
    })
    .sort((a, b) => ((a.data().createdAt || 0) - (b.data().createdAt || 0)));
  if (matches.length === 0) return null;
  for (let i = 1; i < matches.length; i++) {
    await deleteDoc(doc(db, "ledgers", matches[i].id));
  }
  return { id: matches[0].id, amount: (matches[0].data() as { amount?: number }).amount || 0 };
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
    where("memberId", "==", memberId),
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
    where("month", "==", month),
  );
  const snap = await getDocs(q);
  return !snap.empty;
}

/**
 * Check if a staff member has any allocation records referencing them
 * (from any member/month). Used to block deletion of a staff record that
 * past months' charges still point at.
 */
export async function checkStaffHasAllocations(staffId: string): Promise<boolean> {
  const q = query(collection(db, "staff_allocations"), where("staffId", "==", staffId));
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
    where("roomNo", "==", roomNo),
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
    where("active", "==", true),
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
    where("active", "==", true),
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
    where("date", "==", date),
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
    where("date", "==", date),
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
    where("ym", "==", month),
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
 * Check if an internal "payer's own share" payment already exists for an
 * expense and member. Distinct from checkExpenseAllocationExists, which
 * checks the expense_allocations collection (a different record that is
 * always created before this check runs) — using that one here would
 * always report a false positive and silently skip the internal payment.
 * Returns true if the internal payment already exists.
 */
export async function checkInternalPaymentExists(expenseId: string, memberId: string): Promise<boolean> {
  const q = query(
    collection(db, "payments"),
    where("referenceId", "==", expenseId),
    where("memberId", "==", memberId),
  );
  const snap = await getDocs(q);
  return !snap.empty;
}

/**
 * Check if an expense allocation already exists for an expense and member
 * Returns true if duplicate exists
 */
export async function checkExpenseAllocationExists(expenseId: string, memberId: string): Promise<boolean> {
  const q = query(
    collection(db, "expense_allocations"),
    where("expenseId", "==", expenseId),
    where("memberId", "==", memberId),
  );
  const snap = await getDocs(q);
  return !snap.empty;
}

/**
 * Generate a unique ID for expense allocations
 * Format: {expenseId}_{memberId}
 */
export function generateExpenseAllocationId(expenseId: string, memberId: string): string {
  return `${expenseId}_${memberId}`;
}

/**
 * Clean up all duplicate charges for a specific month across all members.
 * This is called during monthly closing to ensure no duplicate charges exist.
 * Returns a summary of cleanup actions.
 */
export async function cleanupAllDuplicateCharges(
  month: string,
  categories: string[],
): Promise<{ totalDeleted: number; details: Record<string, number> }> {
  const details: Record<string, number> = {};
  let totalDeleted = 0;

  // Get all ledgers for the month
  const q = query(
    collection(db, "ledgers"),
    where("ym", "==", month),
  );
  const snap = await getDocs(q);

  // Group by memberId, transactionType, and category
  const grouped: Record<string, string[]> = {};
  snap.docs.forEach((d) => {
    const data = d.data();
    if (isChargeType(data.transactionType) && categories.includes(data.category)) {
      const key = `${data.memberId}_${data.transactionType}_${data.category}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(d.id);
    }
  });

  // For each group, keep only the first (oldest) entry
  for (const key of Object.keys(grouped)) {
    const ids = grouped[key];
    if (ids.length > 1) {
      // Sort by createdAt to find the oldest
      const sortedIds = ids.sort((a, b) => {
        const dataA = snap.docs.find((d) => d.id === a)?.data() as { createdAt?: number };
        const dataB = snap.docs.find((d) => d.id === b)?.data() as { createdAt?: number };
        return (dataA?.createdAt || 0) - (dataB?.createdAt || 0);
      });
      // Delete all but the first
      const toDelete = sortedIds.slice(1);
      for (const id of toDelete) {
        await deleteDoc(doc(db, "ledgers", id));
      }
      const category = key.split("_")[2];
      details[category] = (details[category] || 0) + toDelete.length;
      totalDeleted += toDelete.length;
    }
  }

  return { totalDeleted, details };
}
