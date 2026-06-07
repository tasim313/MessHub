import type { Member, RentCharge, Payment, Deposit, Credit, LedgerEntry } from "@/lib/types";

export function calculateRentCharges(
  members: Member[],
  month: string,
): RentCharge[] {
  return members
    .filter((m) => m.active && typeof m.monthlyRent === "number" && m.monthlyRent > 0)
    .map((m) => ({
      id: `${m.id}_${month}`,
      memberId: m.id,
      memberName: m.name,
      month,
      amount: m.monthlyRent as number,
      status: "pending" as const,
      paidAmount: 0,
      dueAmount: m.monthlyRent as number,
      createdAt: Date.now(),
      createdBy: m.uid || "",
    }));
}

export function calculateMemberDue(
  memberId: string,
  rentCharges: RentCharge[],
  payments: Payment[],
  deposits: Deposit[],
  credits: Credit[],
): {
  totalRent: number;
  totalPaid: number;
  totalDue: number;
  paymentStatus: "paid" | "partially_paid" | "due" | "overpaid";
} {
  const memberRent = rentCharges
    .filter((r) => r.memberId === memberId)
    .reduce((sum, r) => sum + r.amount, 0);

  const memberPayments = payments
    .filter((p) => p.memberId === memberId)
    .reduce((sum, p) => sum + p.amount, 0);

  const memberDeposits = deposits
    .filter((d) => d.memberId === memberId)
    .reduce((sum, d) => sum + d.amount, 0);

  const memberCredits = credits
    .filter((c) => c.memberId === memberId)
    .reduce((sum, c) => sum + c.amount, 0);

  const totalPaid = memberPayments + memberDeposits + memberCredits;
  const totalDue = memberRent - totalPaid;

  let paymentStatus: "paid" | "partially_paid" | "due" | "overpaid";
  if (totalDue <= 0) {
    paymentStatus = totalDue < 0 ? "overpaid" : "paid";
  } else if (totalPaid > 0) {
    paymentStatus = "partially_paid";
  } else {
    paymentStatus = "due";
  }

  return {
    totalRent: memberRent,
    totalPaid,
    totalDue,
    paymentStatus,
  };
}

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
