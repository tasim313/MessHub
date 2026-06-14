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

  const paymentRef = await addDoc(collection(db, "payments"), paymentData);
  const paymentId = paymentRef.id;

  // 2. Process advance recovery from this payment
  const recoveryResult = await processAdvanceRecoveryFromPayment(
    paymentId,
    memberId,
    memberName,
    amount,
    date,
    ym,
    uid,
  );

  // 3. Record the remaining amount as a charge payment in ledger
  if (recoveryResult.chargePaymentAmount > 0) {
    await addDoc(collection(db, "ledgers"), {
      memberId,
      memberName,
      date,
      ym,
      transactionType: "payment",
      category: category || "other",
      amount: recoveryResult.chargePaymentAmount,
      notes: notes || `Payment: ${recoveryResult.chargePaymentAmount} Tk via ${method}`,
      referenceId: paymentId,
      referenceType: "payment",
      createdAt: Date.now(),
      createdBy: uid,
    });
  }

  // 4. If there's remaining amount after all recovery and charge payment,
  // it becomes a new advance (deposit) for this member
  if (recoveryResult.remainingAmount > 0.01) {
    // Record as a deposit/advance for this member
    await addDoc(collection(db, "ledgers"), {
      memberId,
      memberName,
      date,
      ym,
      transactionType: "deposit",
      category: "deposit",
      amount: recoveryResult.remainingAmount,
      notes: `Excess payment: ${recoveryResult.remainingAmount} Tk becomes deposit`,
      referenceId: paymentId,
      referenceType: "payment",
      createdAt: Date.now(),
      createdBy: uid,
    });
  }

  return {
    paymentId,
    paymentAmount: amount,
    advanceRecoveryAmount: recoveryResult.recoveryAmount,
    chargePaymentAmount: recoveryResult.chargePaymentAmount,
    remainingAmount: recoveryResult.remainingAmount,
    recoveries: recoveryResult.recoveries,
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
    const paymentRef = await addDoc(collection(db, "payments"), {
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
    });
    internalPaymentId = paymentRef.id;

    // Record in ledger
    await addDoc(collection(db, "ledgers"), {
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
    });
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