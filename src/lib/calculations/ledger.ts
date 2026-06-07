import type { LedgerEntry, Member, Deposit, Credit, Payment, RentCharge, UtilityAllocation, StaffAllocation } from "@/lib/types";

export function calculateMemberLedger(
  member: Member,
  entries: LedgerEntry[],
): {
  openingBalance: number;
  totalCharges: number;
  totalDeposits: number;
  totalCredits: number;
  totalPayments: number;
  currentDue: number;
  balance: number;
} {
  const sortedEntries = [...entries].sort((a, b) => a.date.localeCompare(b.date));

  let balance = 0;
  let openingBalance = 0;

  sortedEntries.forEach((entry, index) => {
    if (index === 0) {
      openingBalance = entry.balance || 0;
      balance = openingBalance;
    }

    switch (entry.transactionType) {
      case "charge":
        balance += entry.amount;
        break;
      case "deposit":
        balance -= entry.amount;
        break;
      case "payment":
        balance -= entry.amount;
        break;
      case "credit":
        balance -= entry.amount;
        break;
      case "refund":
        balance += entry.amount;
        break;
      case "adjustment":
        balance += entry.amount;
        break;
    }
  });

  const totalCharges = entries
    .filter((e) => e.transactionType === "charge")
    .reduce((sum, e) => sum + e.amount, 0);

  const totalDeposits = entries
    .filter((e) => e.transactionType === "deposit")
    .reduce((sum, e) => sum + e.amount, 0);

  const totalCredits = entries
    .filter((e) => e.transactionType === "credit")
    .reduce((sum, e) => sum + e.amount, 0);

  const totalPayments = entries
    .filter((e) => e.transactionType === "payment")
    .reduce((sum, e) => sum + e.amount, 0);

  const currentDue = totalCharges - totalDeposits - totalCredits - totalPayments;

  return {
    openingBalance,
    totalCharges,
    totalDeposits,
    totalCredits,
    totalPayments,
    currentDue,
    balance,
  };
}

export function calculateMonthlyStatement(
  member: Member,
  month: string,
  entries: LedgerEntry[],
  rentCharges: RentCharge[],
  utilityAllocations: UtilityAllocation[],
  staffAllocations: StaffAllocation[],
): {
  month: string;
  openingBalance: number;
  rentCharge: number;
  mealCharge: number;
  utilityCharge: number;
  staffCharge: number;
  otherCharges: number;
  totalCharges: number;
  deposits: number;
  credits: number;
  payments: number;
  currentDue: number;
  transactions: LedgerEntry[];
} {
  const monthEntries = entries.filter((e) => e.ym === month);
  const monthRent = rentCharges
    .filter((r) => r.memberId === member.id && r.month === month)
    .reduce((sum, r) => sum + r.amount, 0);
  const monthUtility = utilityAllocations
    .filter((u) => u.memberId === member.id)
    .reduce((sum, u) => sum + u.amount, 0);
  const monthStaff = staffAllocations
    .filter((s) => s.memberId === member.id && s.month === month)
    .reduce((sum, s) => sum + s.amount, 0);

  const rentCharge = monthRent;
  const utilityCharge = monthUtility;
  const staffCharge = monthStaff;
  const mealCharge = monthEntries
    .filter((e) => e.category === "meal")
    .reduce((sum, e) => sum + e.amount, 0);
  const otherCharges = monthEntries
    .filter((e) => e.category === "other" && e.transactionType === "charge")
    .reduce((sum, e) => sum + e.amount, 0);

  const totalCharges = rentCharge + mealCharge + utilityCharge + staffCharge + otherCharges;
  const deposits = monthEntries
    .filter((e) => e.transactionType === "deposit")
    .reduce((sum, e) => sum + e.amount, 0);
  const credits = monthEntries
    .filter((e) => e.transactionType === "credit")
    .reduce((sum, e) => sum + e.amount, 0);
  const payments = monthEntries
    .filter((e) => e.transactionType === "payment")
    .reduce((sum, e) => sum + e.amount, 0);

  const currentDue = totalCharges - deposits - credits - payments;

  const sortedEntries = [...monthEntries].sort((a, b) => a.date.localeCompare(b.date));
  let runningBalance = 0;
  const transactionsWithBalance = sortedEntries.map((entry) => {
    switch (entry.transactionType) {
      case "charge":
        runningBalance += entry.amount;
        break;
      case "deposit":
      case "payment":
      case "credit":
        runningBalance -= entry.amount;
        break;
      case "refund":
        runningBalance += entry.amount;
        break;
      case "adjustment":
        runningBalance += entry.amount;
        break;
    }
    return { ...entry, balance: runningBalance };
  });

  // Calculate opening balance from the first entry's balance or 0 if no entries
  const openingBalance = sortedEntries.length > 0 
    ? (sortedEntries[0].balance || 0) 
    : 0;

  return {
    month,
    openingBalance,
    rentCharge,
    mealCharge,
    utilityCharge,
    staffCharge,
    otherCharges,
    totalCharges,
    deposits,
    credits,
    payments,
    currentDue,
    transactions: transactionsWithBalance,
  };
}
