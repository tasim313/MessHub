/**
 * Advance & Advance Recovery Service
 * ====================================
 * 
 * Manages the complete lifecycle of advances:
 * 1. CREATION: When a member pays more than their share of an expense
 * 2. RECOVERY: When other members' payments automatically recover the advance
 * 3. HISTORY: Complete tracking of who recovered how much and when
 * 
 * ACCOUNTING RULES:
 * - Advance is a LIABILITY of the mess toward a member who overpaid
 * - Advances are recovered in FIFO order when other members pay
 * - When fully recovered, advance status changes to "recovered"
 * - Every recovery transaction is recorded in the ledger
 */
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  query,
  where,
  getDocs,
  serverTimestamp,
  orderBy,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Advance, AdvanceRecovery, LedgerEntry, Expense } from "./types";
import { withoutUndefined } from "./data";

// ============================================================================
// CREATE ADVANCE
// ============================================================================

/**
 * Create an advance record when a member pays more than their share of an expense.
 * 
 * Example: Internet Bill 1000 Tk, paid by Member A
 *   - A's share: 500 Tk
 *   - A paid: 1000 Tk
 *   - Advance: 500 Tk (A is owed this by the mess)
 * 
 * Also creates a ledger entry to track the advance.
 */
export async function createAdvance(
  memberId: string,
  memberName: string,
  amount: number,
  source: string,
  sourceType: Advance["sourceType"],
  sourceId: string,
  ym: string,
  uid?: string,
): Promise<string> {
  if (amount <= 0) return ""; // No advance needed

  const advanceData: Omit<Advance, "id"> = {
    memberId,
    memberName,
    amount,
    remainingAmount: amount,
    source,
    sourceType,
    sourceId,
    ym,
    status: "outstanding",
    createdAt: Date.now(),
    createdBy: uid,
  };

  const docRef = await addDoc(collection(db, "advances"), withoutUndefined(advanceData as unknown as Record<string, unknown>));
  const advanceId = docRef.id;

  // Create ledger entry for the advance
  await addDoc(collection(db, "ledgers"), withoutUndefined({
    memberId,
    memberName,
    date: `${ym}-01`,
    ym,
    transactionType: "advance_given",
    category: "advance",
    amount,
    notes: `Advance: ${source} - ${memberName} paid ${amount} Tk extra`,
    referenceId: advanceId,
    referenceType: "advance",
    createdAt: Date.now(),
    createdBy: uid,
  }));

  return advanceId;
}

// ============================================================================
// PROCESS ADVANCE RECOVERY
// ============================================================================

/**
 * Process advance recovery from a member's payment.
 * 
 * When Member B pays 500 Tk:
 *   1. First, recover outstanding advances from other members (FIFO)
 *   2. Then, apply remaining to B's own charges
 * 
 * This function:
 *   - Creates AdvanceRecovery records
 *   - Updates the Advance's remainingAmount and status
 *   - Creates ledger entries for the recovery
 *   - Updates the payer's ledger entry
 * 
 * @returns Array of recovery records created
 */
export async function processAdvanceRecoveryFromPayment(
  paymentId: string,
  payerMemberId: string,
  payerMemberName: string,
  amount: number,
  date: string,
  ym: string,
  uid?: string,
): Promise<{
  recoveryAmount: number;
  chargePaymentAmount: number;
  remainingAmount: number;
  recoveries: { advanceId: string; amount: number; advanceOwnerId: string }[];
}> {
  try {
    // Get all outstanding advances (FIFO order)
    const advancesQuery = query(
      collection(db, "advances"),
      where("status", "!=", "recovered"),
      orderBy("createdAt", "asc"),
    );
    const advancesSnap = await getDocs(advancesQuery);
    
    const outstandingAdvances = advancesSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as Advance)
      .filter((a) => a.remainingAmount > 0 && a.memberId !== payerMemberId); // Don't recover from self

    let remaining = amount;
    const recoveries: { advanceId: string; amount: number; advanceOwnerId: string }[] = [];

    // Step 1: Recover advances in FIFO order
    for (const advance of outstandingAdvances) {
      if (remaining <= 0) break;
      const recoveryAmount = Math.min(remaining, advance.remainingAmount);
      if (recoveryAmount > 0) {
        recoveries.push({
          advanceId: advance.id,
          amount: recoveryAmount,
          advanceOwnerId: advance.memberId,
        });
        remaining -= recoveryAmount;

        // Create AdvanceRecovery record
        const recoveryData: Omit<AdvanceRecovery, "id"> = {
          advanceId: advance.id,
          advanceOwnerId: advance.memberId,
          advanceOwnerName: advance.memberName,
          recoveredFromMemberId: payerMemberId,
          recoveredFromMemberName: payerMemberName,
          amount: recoveryAmount,
          sourcePaymentId: paymentId,
          ym,
          date,
          notes: `Recovered from ${payerMemberName}'s payment`,
          createdAt: Date.now(),
          createdBy: uid,
        };
        await addDoc(collection(db, "advance_recoveries"), withoutUndefined(recoveryData as unknown as Record<string, unknown>));

        // Update the advance record
        const newRemainingAmount = advance.remainingAmount - recoveryAmount;
        const newStatus = newRemainingAmount <= 0 ? "recovered" : "partially_recovered";
        await updateDoc(doc(db, "advances", advance.id), {
          remainingAmount: Math.max(0, newRemainingAmount),
          status: newStatus,
          updatedAt: Date.now(),
        });

        // Create ledger entry for the advance owner (receiving recovery)
        await addDoc(collection(db, "ledgers"), withoutUndefined({
          memberId: advance.memberId,
          memberName: advance.memberName,
          date,
          ym,
          transactionType: "advance_recovered",
          category: "advance_recovery",
          amount: recoveryAmount,
          notes: `Advance recovered: ${recoveryAmount} Tk from ${payerMemberName}'s payment`,
          referenceId: paymentId,
          referenceType: "payment",
          createdAt: Date.now(),
          createdBy: uid,
        }));
      }
    }

    // Step 2: Remaining amount goes to charge payment (handled by the caller)
    const chargePaymentAmount = remaining;

    return {
      recoveryAmount: amount - chargePaymentAmount,
      chargePaymentAmount,
      remainingAmount: 0,
      recoveries,
    };
  } catch (error) {
    console.error("Error processing advance recovery:", error);
    return { recoveryAmount: 0, chargePaymentAmount: amount, remainingAmount: amount, recoveries: [] };
  }
}

// ============================================================================
// GET RECOVERY HISTORY
// ============================================================================

/**
 * Get complete recovery history for an advance
 */
export async function getAdvanceRecoveryHistory(
  advanceId: string,
): Promise<AdvanceRecovery[]> {
  const q = query(
    collection(db, "advance_recoveries"),
    where("advanceId", "==", advanceId),
    orderBy("createdAt", "asc"),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AdvanceRecovery);
}

/**
 * Get all advances for a member with recovery history
 */
export async function getMemberAdvancesWithHistory(
  memberId: string,
): Promise<(Advance & { recoveries: AdvanceRecovery[] })[]> {
  // Get all advances for this member
  const advancesQuery = query(
    collection(db, "advances"),
    where("memberId", "==", memberId),
    orderBy("createdAt", "desc"),
  );
  const advancesSnap = await getDocs(advancesQuery);
  const advances = advancesSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Advance);

  // Get recovery history for each advance
  const advancesWithHistory = await Promise.all(
    advances.map(async (adv) => {
      const recoveries = await getAdvanceRecoveryHistory(adv.id);
      return { ...adv, recoveries };
    }),
  );

  return advancesWithHistory;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get total outstanding advance balance for a member (how much other members owe them)
 */
export async function getMemberOutstandingAdvance(memberId: string): Promise<number> {
  const q = query(
    collection(db, "advances"),
    where("memberId", "==", memberId),
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => d.data() as Advance)
    .filter((a) => a.remainingAmount > 0)
    .reduce((sum, a) => sum + (a.remainingAmount || 0), 0);
}

/**
 * Get all outstanding advances (money other members owe to advance-givers)
 */
export async function getAllOutstandingAdvances(): Promise<Advance[]> {
  const q = query(
    collection(db, "advances"),
    where("status", "!=", "recovered"),
    orderBy("createdAt", "asc"),
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as Advance)
    .filter((a) => a.remainingAmount > 0);
}

/**
 * Get all advances for a specific expense (to track how much was advanced from one bill)
 */
export async function getAdvancesBySource(sourceId: string): Promise<Advance[]> {
  const q = query(
    collection(db, "advances"),
    where("sourceId", "==", sourceId),
    orderBy("createdAt", "asc"),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Advance);
}