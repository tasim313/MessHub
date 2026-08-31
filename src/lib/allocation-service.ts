/**
 * Charge Allocation Service
 * =====================================
 *
 * Records exactly what settled which charge, and by how much — a payment,
 * or a credit note correction.
 *
 * Without this, "how much has member X paid toward their June rent charge"
 * has no answer — a charge only had a single mutable `paidAmount` field that
 * different payment flows overwrote independently, and a payment recorded
 * elsewhere (e.g. the /payments page) never touched a charge's paid status
 * at all. This service is the ONLY place that should ever mutate a charge's
 * paidAmount/chargeStatus, and every mutation is paired with a
 * charge_allocations record so the history stays fully traceable:
 *   - "What settled this charge?" -> getAllocationsForCharge(chargeId)
 *   - "What did this payment/credit note settle?" -> getAllocationsForSource(sourceId)
 */
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { db } from "./firebase";
import type { ChargeAllocation, LedgerEntry } from "./types";
import { withoutUndefined } from "./data";

const CHARGE_TRANSACTION_TYPES = ["meal_charge", "rent_charge", "utility_charge", "staff_charge", "other_charge"];

export interface AllocationResult {
  allocations: { chargeId: string; category: string; amount: number }[];
  totalAllocated: number;
  remaining: number;
}

/**
 * Fetch a member's outstanding (pending or partially paid) charge ledger
 * entries, oldest first. Firestore doesn't allow ordering by a field not
 * used in an inequality filter without a composite index, so we filter by
 * memberId only and do the rest client-side (consistent with the pattern
 * already used in duplicate-check.ts).
 */
export async function fetchOutstandingCharges(memberId: string): Promise<LedgerEntry[]> {
  const q = query(collection(db, "ledgers"), where("memberId", "==", memberId));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as LedgerEntry)
    .filter((e) => {
      if (!CHARGE_TRANSACTION_TYPES.includes(e.transactionType)) return false;
      const paid = e.paidAmount || 0;
      return e.chargeStatus !== "paid" && paid < e.amount - 0.01;
    })
    .sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || 0) - (b.createdAt || 0));
}

/**
 * Allocate `amount` across the given charges (FIFO order as passed in),
 * writing a charge_allocations record for every (source, charge) pair
 * touched and updating each charge's paidAmount/chargeStatus.
 */
export async function allocateToCharges(
  sourceType: ChargeAllocation["sourceType"],
  sourceId: string,
  memberId: string,
  amount: number,
  date: string,
  ym: string,
  charges: LedgerEntry[],
  uid?: string,
): Promise<AllocationResult> {
  let remaining = Math.round(amount * 100) / 100;
  const allocations: AllocationResult["allocations"] = [];

  for (const charge of charges) {
    if (remaining <= 0.01) break;
    const due = Math.round(((charge.amount || 0) - (charge.paidAmount || 0)) * 100) / 100;
    if (due <= 0.01) continue;

    const allocAmount = Math.round(Math.min(remaining, due) * 100) / 100;
    if (allocAmount <= 0) continue;

    const allocationData: Omit<ChargeAllocation, "id"> = {
      sourceType,
      sourceId,
      chargeId: charge.id,
      memberId,
      category: charge.category,
      amount: allocAmount,
      date,
      ym,
      createdAt: Date.now(),
      createdBy: uid,
    };
    await addDoc(collection(db, "charge_allocations"), withoutUndefined(allocationData as unknown as Record<string, unknown>));

    const newPaidAmount = Math.round(((charge.paidAmount || 0) + allocAmount) * 100) / 100;
    const newStatus = newPaidAmount >= (charge.amount || 0) - 0.01 ? "paid" : "partial";
    await updateDoc(doc(db, "ledgers", charge.id), {
      paidAmount: newPaidAmount,
      chargeStatus: newStatus,
      paymentReferenceId: sourceId,
      updatedAt: Date.now(),
    });

    allocations.push({ chargeId: charge.id, category: charge.category, amount: allocAmount });
    remaining = Math.round((remaining - allocAmount) * 100) / 100;
  }

  return {
    allocations,
    totalAllocated: Math.round((amount - Math.max(0, remaining)) * 100) / 100,
    remaining: Math.max(0, remaining),
  };
}

/** Backward-compatible alias for payment-sourced allocation. */
export async function allocatePaymentToCharges(
  memberId: string,
  paymentId: string,
  amount: number,
  date: string,
  ym: string,
  charges: LedgerEntry[],
  uid?: string,
): Promise<AllocationResult> {
  return allocateToCharges("payment", paymentId, memberId, amount, date, ym, charges, uid);
}

/** Every allocation that settled a specific charge — "what settled this charge, and when" */
export async function getAllocationsForCharge(chargeId: string): Promise<ChargeAllocation[]> {
  const q = query(collection(db, "charge_allocations"), where("chargeId", "==", chargeId));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as ChargeAllocation)
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

/** Every charge a specific payment/credit note contributed toward. */
export async function getAllocationsForSource(sourceId: string): Promise<ChargeAllocation[]> {
  const q = query(collection(db, "charge_allocations"), where("sourceId", "==", sourceId));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as ChargeAllocation)
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

/** All allocations for a member, for building a full "final settlement" trace. */
export async function getAllocationsForMember(memberId: string): Promise<ChargeAllocation[]> {
  const q = query(collection(db, "charge_allocations"), where("memberId", "==", memberId));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as ChargeAllocation)
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}
