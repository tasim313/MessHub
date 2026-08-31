/**
 * Credit Notes & Refunds Service
 * =====================================
 *
 * Implements the accounting rule: never edit or delete a posted charge or
 * payment to "fix" it. Corrections and reversals are separate, permanent,
 * auditable documents:
 *
 *   - Credit Note: forgives/corrects part of what a member owes. Reduces
 *     the member's outstanding charges without ever touching the original
 *     charge's amount field.
 *   - Refund: physically returns money to a member (e.g. part of a held
 *     deposit paid back in cash). Distinct from a credit note — a refund
 *     reverses money the member DID pay; a credit note forgives money they
 *     never actually owed.
 *
 * Both can be voided (never deleted) — voiding posts a new offsetting
 * ledger entry and marks the original record `voided`, preserving the full
 * history of what happened and why.
 *
 * All amounts here are validated > 0 — this system never stores or displays
 * a negative figure; direction is always encoded by the record type
 * (credit note vs. charge, refund vs. deposit), never by sign.
 */
import { collection, addDoc, doc, updateDoc, getDoc } from "firebase/firestore";
import { db } from "./firebase";
import type { CreditNote, Refund } from "./types";
import { fetchOutstandingCharges, allocateToCharges, getAllocationsForSource } from "./allocation-service";
import { logActivity, type ActorInfo } from "./workflow";
import { withoutUndefined } from "./data";

export interface CreditNoteResult {
  creditNoteId: string;
  allocations: { chargeId: string; category: string; amount: number }[];
  unapplied: number;
}

/**
 * Issue a credit note reducing a member's outstanding charges by `amount`.
 * If `relatedChargeId` is given, that charge is corrected first; any
 * remainder is applied FIFO across the member's other outstanding charges.
 * Any amount left over (no matching outstanding charges) is still recorded
 * against the member via the ledger entry, showing as a general credit.
 */
export async function issueCreditNote(
  memberId: string,
  memberName: string,
  amount: number,
  reason: string,
  ym: string,
  date: string,
  actor: ActorInfo,
  category?: string,
  relatedChargeId?: string,
): Promise<CreditNoteResult> {
  if (!(amount > 0)) throw new Error("Credit note amount must be greater than zero");
  if (!reason.trim()) throw new Error("A reason is required to issue a credit note");

  const creditNoteData: Omit<CreditNote, "id"> = {
    memberId,
    memberName,
    amount,
    reason: reason.trim(),
    category,
    relatedChargeId,
    date,
    ym,
    status: "issued",
    createdBy: actor.uid,
    createdAt: Date.now(),
  };
  const ref = await addDoc(collection(db, "credit_notes"), withoutUndefined(creditNoteData as unknown as Record<string, unknown>));
  const creditNoteId = ref.id;

  let charges = await fetchOutstandingCharges(memberId);
  if (relatedChargeId) {
    charges = [
      ...charges.filter((c) => c.id === relatedChargeId),
      ...charges.filter((c) => c.id !== relatedChargeId),
    ];
  }
  const result = await allocateToCharges("credit_note", creditNoteId, memberId, amount, date, ym, charges, actor.uid);

  await addDoc(collection(db, "ledgers"), withoutUndefined({
    memberId,
    memberName,
    date,
    ym,
    transactionType: "credit_note",
    category: category || "credit_note",
    amount,
    notes: `Credit note: ${reason.trim()}`,
    referenceId: creditNoteId,
    referenceType: "credit_note",
    createdAt: Date.now(),
    createdBy: actor.uid,
  }));

  await logActivity({
    type: "financial",
    entity: "credit_notes",
    entityId: creditNoteId,
    action: "issue",
    actor,
    message: `${actor.name} issued a ৳${amount} credit note to ${memberName}: ${reason.trim()}`,
    meta: { memberId, amount, reason: reason.trim(), relatedChargeId: relatedChargeId || null },
  });

  return { creditNoteId, allocations: result.allocations, unapplied: result.remaining };
}

/**
 * Void a previously issued credit note. Never deletes the original record —
 * marks it voided and posts a new charge restoring the corrected amount,
 * so the correction's full history (issue + void, with reasons) stays intact.
 */
export async function voidCreditNote(
  creditNoteId: string,
  voidReason: string,
  actor: ActorInfo,
): Promise<void> {
  if (!voidReason.trim()) throw new Error("A reason is required to void a credit note");

  const snap = await getDoc(doc(db, "credit_notes", creditNoteId));
  if (!snap.exists()) throw new Error("Credit note not found");
  const creditNote = { id: snap.id, ...snap.data() } as CreditNote;
  if (creditNote.status === "voided") throw new Error("This credit note has already been voided");

  const date = new Date().toISOString().slice(0, 10);
  const ym = date.slice(0, 7);

  await updateDoc(doc(db, "credit_notes", creditNoteId), {
    status: "voided",
    voidedReason: voidReason.trim(),
    voidedBy: actor.uid,
    voidedAt: Date.now(),
  });

  // Restore the corrected amount as a new charge (never edits the original
  // charges the credit note had reduced).
  await addDoc(collection(db, "ledgers"), withoutUndefined({
    memberId: creditNote.memberId,
    memberName: creditNote.memberName,
    date,
    ym,
    transactionType: "other_charge",
    category: creditNote.category || "credit_note",
    amount: creditNote.amount,
    notes: `Credit note voided (${voidReason.trim()}) — original: ${creditNote.reason}`,
    referenceId: creditNoteId,
    referenceType: "credit_note",
    chargeStatus: "pending",
    paidAmount: 0,
    createdAt: Date.now(),
    createdBy: actor.uid,
  }));

  await logActivity({
    type: "financial",
    entity: "credit_notes",
    entityId: creditNoteId,
    action: "void",
    actor,
    message: `${actor.name} voided a ৳${creditNote.amount} credit note for ${creditNote.memberName}: ${voidReason.trim()}`,
    meta: { memberId: creditNote.memberId, amount: creditNote.amount, voidReason: voidReason.trim() },
  });
}

export interface RefundResult {
  refundId: string;
}

/**
 * Issue a refund — money physically returned to a member. Caller is
 * responsible for checking `amount` against the member's actual available
 * deposit/balance before calling (this service only enforces amount > 0
 * and a reason; it doesn't have access to the full settlement calculation).
 */
export async function issueRefund(
  memberId: string,
  memberName: string,
  amount: number,
  reason: string,
  method: string,
  ym: string,
  date: string,
  actor: ActorInfo,
  relatedPaymentId?: string,
): Promise<RefundResult> {
  if (!(amount > 0)) throw new Error("Refund amount must be greater than zero");
  if (!reason.trim()) throw new Error("A reason is required to issue a refund");

  const refundData: Omit<Refund, "id"> = {
    memberId,
    memberName,
    amount,
    reason: reason.trim(),
    method,
    relatedPaymentId,
    date,
    ym,
    status: "issued",
    createdBy: actor.uid,
    createdAt: Date.now(),
  };
  const ref = await addDoc(collection(db, "refunds"), withoutUndefined(refundData as unknown as Record<string, unknown>));
  const refundId = ref.id;

  // "refund" already reduces the member's held deposit/increases what they
  // owe going forward (see calculateMemberLedger: balance += amount, the
  // same direction as a charge).
  await addDoc(collection(db, "ledgers"), withoutUndefined({
    memberId,
    memberName,
    date,
    ym,
    transactionType: "refund",
    category: "refund",
    amount,
    notes: `Refund via ${method}: ${reason.trim()}`,
    referenceId: refundId,
    referenceType: "refund",
    createdAt: Date.now(),
    createdBy: actor.uid,
  }));

  await logActivity({
    type: "financial",
    entity: "refunds",
    entityId: refundId,
    action: "issue",
    actor,
    message: `${actor.name} refunded ৳${amount} to ${memberName} via ${method}: ${reason.trim()}`,
    meta: { memberId, amount, method, reason: reason.trim(), relatedPaymentId: relatedPaymentId || null },
  });

  return { refundId };
}

/** Void a previously issued refund — restores the amount as a new deposit-side entry. */
export async function voidRefund(
  refundId: string,
  voidReason: string,
  actor: ActorInfo,
): Promise<void> {
  if (!voidReason.trim()) throw new Error("A reason is required to void a refund");

  const snap = await getDoc(doc(db, "refunds", refundId));
  if (!snap.exists()) throw new Error("Refund not found");
  const refund = { id: snap.id, ...snap.data() } as Refund;
  if (refund.status === "voided") throw new Error("This refund has already been voided");

  const date = new Date().toISOString().slice(0, 10);
  const ym = date.slice(0, 7);

  await updateDoc(doc(db, "refunds", refundId), {
    status: "voided",
    voidedReason: voidReason.trim(),
    voidedBy: actor.uid,
    voidedAt: Date.now(),
  });

  await addDoc(collection(db, "ledgers"), withoutUndefined({
    memberId: refund.memberId,
    memberName: refund.memberName,
    date,
    ym,
    transactionType: "deposit",
    category: "deposit",
    amount: refund.amount,
    notes: `Refund voided (${voidReason.trim()}) — original: ${refund.reason}`,
    referenceId: refundId,
    referenceType: "refund",
    createdAt: Date.now(),
    createdBy: actor.uid,
  }));

  await logActivity({
    type: "financial",
    entity: "refunds",
    entityId: refundId,
    action: "void",
    actor,
    message: `${actor.name} voided a ৳${refund.amount} refund for ${refund.memberName}: ${voidReason.trim()}`,
    meta: { memberId: refund.memberId, amount: refund.amount, voidReason: voidReason.trim() },
  });
}

/** All allocations a specific credit note applied — "what did this credit note correct" */
export async function getCreditNoteAllocations(creditNoteId: string) {
  return getAllocationsForSource(creditNoteId);
}
