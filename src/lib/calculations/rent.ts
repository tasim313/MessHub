import type { RentCharge, Payment } from "@/lib/types";

/**
 * Rent Calculation Module
 * Re-exports from centralized calculation engine to ensure consistent calculations.
 */
export { calculateRentCharges, calculateMemberDue } from "./engine";

/**
 * Get rent collection statistics
 */
export function getRentCollectionStats(
  rentCharges: RentCharge[],
  payments: Payment[],
): {
  totalReceivable: number;
  totalCollected: number;
  totalDue: number;
  collectionRate: number;
  paidCount: number;
  partialCount: number;
  dueCount: number;
} {
  const totalReceivable = rentCharges.reduce((sum, r) => sum + r.amount, 0);

  const paymentsByMember = new Map<string, number>();
  payments.forEach((p) => {
    paymentsByMember.set(p.memberId, (paymentsByMember.get(p.memberId) || 0) + p.amount);
  });

  let totalCollected = 0;
  let paidCount = 0;
  let partialCount = 0;
  let dueCount = 0;

  rentCharges.forEach((r) => {
    const paid = paymentsByMember.get(r.memberId) || 0;
    totalCollected += paid;

    if (paid >= r.amount) {
      paidCount++;
    } else if (paid > 0) {
      partialCount++;
    } else {
      dueCount++;
    }
  });

  const totalDue = totalReceivable - totalCollected;
  const collectionRate = totalReceivable > 0 ? (totalCollected / totalReceivable) * 100 : 0;

  return {
    totalReceivable,
    totalCollected,
    totalDue,
    collectionRate: Math.round(collectionRate * 100) / 100,
    paidCount,
    partialCount,
    dueCount,
  };
}
