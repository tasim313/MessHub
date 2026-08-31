/**
 * Automatic Payment Processing Service
 * =====================================
 * 
 * Handles ALL payment-related operations with proper accounting:
 * 
 * 1. PAYMENT ENTRY: Records the payment in the database
 * 2. ADVANCE RECOVERY: Automatically recovers outstanding advances (FIFO)
 * 3. CHARGE PAYMENT: Remaining amount pays the member's charges
 * 4. LEDGER UPDATE: Records all transactions in the member's ledger
 * 5. DASHBOARD/REPORT SYNC: Everything recalculates automatically
 * 
 * PAYMENT APPLICATION ORDER (FIFO):
 *   Step 1: Recover oldest outstanding advances from other members
 *   Step 2: Pay the member's own outstanding charges
 *   Step 3: Any excess becomes a new advance/deposit for this member
 * 
 * This function is the SINGLE entry point for all payment operations.
 */
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  query,
  where,
  orderBy,
  getDocs,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Payment, Advance, AdvanceRecovery } from "./types";
import { processAdvanceRecoveryFromPayment } from "./advance-service";
import { fetchOutstandingCharges, allocatePaymentToCharges } from "./allocation-service";
import { withoutUndefined } from "./data";

// ============================================================================
// RECORD PAYMENT WITH AUTOMATIC ADVANCE RECOVERY
// ============================================================================

export interface PaymentResult {
  paymentId: string;
  paymentAmount: number;
  advanceRecoveryAmount: number;
  chargePaymentAmount: number;
  remainingAmount: number;
  recoveries: { advanceId: string; amount: number; advanceOwnerId: string }[];
  /** Which specific charges this payment actually settled — the "who paid which charge" trace */
  chargeAllocations: { chargeId: string; category: string; amount: number }[];
}

/**
 * Record a payment and automatically process advance recovery.
 * 
 * This is the SINGLE function to call when recording ANY payment.
 * 
 * Payment flow:
 * 1. Save payment to Firebase
 * 2. Recover outstanding advances (FIFO)
 * 3. Create ledger entries
 * 4. Return complete payment result
 */
export async function recordPaymentWithAdvanceRecovery(
  memberId: string,
  memberName: string,
  amount: number,
  method: string,
  date: string,
  ym: string,
  category?: string,
  notes?: string,
  referenceId?: string,
  uid?: string,
  /** If set, this specific charge is settled first, before FIFO across the rest */
  targetChargeId?: string,
): Promise<PaymentResult> {
  // 1. Save the payment record
  const paymentData: Omit<Payment, "id"> = {
    memberId,
    memberName,
    amount,
    method: method as any,
    date,
    ym,
    status: "paid",
    category: category || "other",
    notes: notes || `Payment via ${method}`,
    referenceId: referenceId || undefined,
    referenceType: referenceId ? "expense" : undefined,
    createdAt: Date.now(),
    createdBy: uid,
  };

  const paymentRef = await addDoc(collection(db, "payments"), withoutUndefined(paymentData as unknown as Record<string, unknown>));
  const paymentId = paymentRef.id;

  let chargeAllocations: { chargeId: string; category: string; amount: number }[] = [];
  let stillUnallocated = amount;
  let advanceRecoveryAmount = 0;
  let recoveries: { advanceId: string; amount: number; advanceOwnerId: string }[] = [];

  // 2. If the caller explicitly targeted one charge (e.g. "mark this rent
  // charge as paid"), settle it directly first — this money was earmarked
  // by the admin for that specific obligation, so it should not be diverted
  // into recovering an unrelated member's advance before the requested
  // charge is even marked paid.
  if (targetChargeId && stillUnallocated > 0.01) {
    const outstandingCharges = await fetchOutstandingCharges(memberId);
    const targetCharge = outstandingCharges.find((c) => c.id === targetChargeId);
    if (targetCharge) {
      const targetResult = await allocatePaymentToCharges(
        memberId, paymentId, stillUnallocated, date, ym, [targetCharge], uid,
      );
      chargeAllocations = targetResult.allocations;
      stillUnallocated = targetResult.remaining;
      if (targetResult.totalAllocated > 0) {
        await addDoc(collection(db, "ledgers"), withoutUndefined({
          memberId, memberName, date, ym,
          transactionType: "payment",
          category: category || targetCharge.category || "other",
          amount: targetResult.totalAllocated,
          notes: notes || `Payment for ${targetCharge.category}`,
          referenceId: paymentId,
          referenceType: "payment",
          createdAt: Date.now(),
          createdBy: uid,
        }));
      }
    }
  }

  // 3. Whatever's left (the whole amount, for an untargeted/general payment,
  // or any excess beyond the targeted charge) follows the standard order:
  // recover other members' outstanding advances (FIFO) first, ...
  if (stillUnallocated > 0.01) {
    const recoveryResult = await processAdvanceRecoveryFromPayment(
      paymentId, memberId, memberName, stillUnallocated, date, ym, uid,
    );
    advanceRecoveryAmount = recoveryResult.recoveryAmount;
    recoveries = recoveryResult.recoveries;
    stillUnallocated = recoveryResult.chargePaymentAmount;

    // ... then apply the remainder to this member's own outstanding charges
    // (FIFO by date), recorded as real allocations — not a single generic
    // ledger note — so "which charge did this payment settle" stays
    // traceable and charges.tsx's paid/pending status stays accurate no
    // matter which page the payment was recorded from.
    if (stillUnallocated > 0.01) {
      const remainingCharges = (await fetchOutstandingCharges(memberId)).filter((c) => c.id !== targetChargeId);
      const allocResult = await allocatePaymentToCharges(
        memberId, paymentId, stillUnallocated, date, ym, remainingCharges, uid,
      );
      chargeAllocations = [...chargeAllocations, ...allocResult.allocations];
      stillUnallocated = allocResult.remaining;

      if (allocResult.totalAllocated > 0) {
        await addDoc(collection(db, "ledgers"), withoutUndefined({
          memberId, memberName, date, ym,
          transactionType: "payment",
          category: category || "other",
          amount: allocResult.totalAllocated,
          notes: notes || `Payment: ${allocResult.totalAllocated} Tk via ${method} (${allocResult.allocations.length} charge(s) settled)`,
          referenceId: paymentId,
          referenceType: "payment",
          createdAt: Date.now(),
          createdBy: uid,
        }));
      }
    }
  }

  // 4. Anything left over — either no outstanding charges existed, or the
  // payment exceeded them — becomes a deposit for this member. Previously
  // this step only fired on a hardcoded (always-zero) field, so an
  // overpayment via this path silently never became a visible deposit.
  const remainingAmount = Math.round((stillUnallocated || 0) * 100) / 100;
  if (remainingAmount > 0.01) {
    await addDoc(collection(db, "ledgers"), withoutUndefined({
      memberId,
      memberName,
      date,
      ym,
      transactionType: "deposit",
      category: "deposit",
      amount: remainingAmount,
      notes: `Excess payment: ${remainingAmount} Tk becomes deposit`,
      referenceId: paymentId,
      referenceType: "payment",
      createdAt: Date.now(),
      createdBy: uid,
    }));
  }

  return {
    paymentId,
    paymentAmount: amount,
    advanceRecoveryAmount,
    chargePaymentAmount: chargeAllocations.reduce((s, a) => s + a.amount, 0),
    remainingAmount,
    recoveries,
    chargeAllocations,
  };
}

// ============================================================================
// HANDLE EXPENSE CREATION (Internal Payment + Advance)
// ============================================================================

/**
 * Handle the financial side of an expense being created.
 * Called when a new expense is added to the system.
 * 
 * 1. Records an internal payment for the payer's own share
 * 2. Creates an advance for any excess
 * 3. Creates ledger entries
 */
export async function handleExpenseFinancials(
  expenseId: string,
  expenseAmount: number,
  expenseCategory: string,
  expenseDate: string,
  expenseYm: string,
  payerId: string,
  payerName: string,
  payerShare: number,
  uid?: string,
): Promise<{ internalPaymentId?: string; advanceId?: string }> {
  let internalPaymentId: string | undefined;
  let advanceId: string | undefined;

  // Record internal payment for the payer's own share
  if (payerShare > 0) {
    const paymentRef = await addDoc(collection(db, "payments"), withoutUndefined({
      memberId: payerId,
      memberName: payerName,
      amount: payerShare,
      method: "cash",
      date: expenseDate,
      ym: expenseYm,
      status: "paid",
      category: expenseCategory,
      notes: `Internal: ${payerName}'s own share of ${expenseCategory}`,
      referenceId: expenseId,
      referenceType: "expense",
      createdAt: Date.now(),
      createdBy: uid,
    }));
    internalPaymentId = paymentRef.id;

    // Record in ledger
    await addDoc(collection(db, "ledgers"), withoutUndefined({
      memberId: payerId,
      memberName: payerName,
      date: expenseDate,
      ym: expenseYm,
      transactionType: "payment",
      category: expenseCategory,
      amount: payerShare,
      notes: `Internal: ${payerName}'s own share paid`,
      referenceId: expenseId,
      referenceType: "expense",
      createdAt: Date.now(),
      createdBy: uid,
    }));
  }

  // Create advance for excess
  const advanceAmount = expenseAmount - payerShare;
  if (advanceAmount > 0) {
    const { createAdvance } = await import("./advance-service");
    advanceId = await createAdvance(
      payerId,
      payerName,
      advanceAmount,
      `${expenseCategory} - ${expenseDate}`,
      "expense",
      expenseId,
      expenseYm,
      uid,
    );
  }

  return { internalPaymentId, advanceId };
}