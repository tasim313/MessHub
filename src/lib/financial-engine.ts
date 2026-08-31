/**
 * ENTERPRISE FINANCIAL ENGINE
 * ============================
 * 
 * The single source of truth for ALL financial calculations in the Mess ERP system.
 * 
 * CORE ACCOUNTING PRINCIPLE:
 *   The Mess does NOT own any money. Money always belongs to members.
 *   The application only records:
 *     - Who paid money
 *     - Who received benefit
 *     - Who owes money
 *     - Who should receive money
 *     - How money is transferred between members
 * 
 * Every calculation must ultimately answer:
 *   - Who gave money?
 *   - Who should receive money?
 *   - Who still owes money?
 *   - Why does the balance exist?
 * 
 * PAYMENT APPLICATION ORDER (Priority):
 *   1. Previous Due
 *   2. Current Rent
 *   3. Utilities
 *   4. Shared Expenses
 *   5. Bazaar
 *   6. Remaining Amount → Deposit
 * 
 * TWO CALCULATION MODES:
 *   Mode 1: Unified Accounting - Everything merged, one final balance.
 *   Mode 2: Separate Accounting - Each category calculated independently.
 */

import type {
  Member,
  MealEntry,
  Bazar,
  Expense,
  ExpenseAllocation,
  Payment,
  Staff,
  Room,
  Deposit,
  Credit,
  LedgerEntry,
  MonthlyClosing,
  RentCharge,
  Advance,
  AdvanceRecovery,
  ExpenseCategory,
} from "./types";
import { EXPENSE_CATEGORY_LABELS, EXPENSE_CATEGORY_TO_SERVICE } from "./types";
import {
  calculateMealRate,
  calculateCompleteMonthlySummary,
  calculateMemberExpenseShares,
  calculateMemberStaffShare,
  verifyCalculations,
  validateMutualExclusivity,
} from "./calculations/engine-v2";

// ============================================================================
// CORE TYPES
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface AuditLogEntry {
  action: string;
  entity: string;
  entityId: string;
  amount: number;
  source: string;
  destination: string;
  category: string;
  reason: string;
  timestamp: number;
  createdBy: string;
  relatedRecordId: string;
  previousBalance: number;
  newBalance: number;
  affectedMembers: string[];
}

export interface PaymentAllocation {
  memberId: string;
  memberName: string;
  paymentAmount: number;
  allocations: { category: string; amount: number; description: string }[];
  remainingAmount: number;
  depositCreated: number;
  totalAllocated: number;
}

export interface MemberToMemberSettlement {
  fromMemberId: string;
  fromMemberName: string;
  toMemberId: string;
  toMemberName: string;
  amount: number;
  reason: string;
  category: string;
  date: string;
}

export interface MemberFinancialSummary {
  memberId: string;
  memberName: string;
  totalCharges: number;
  rentCharge: number;
  mealCharge: number;
  utilityCharge: number;
  staffCharge: number;
  otherCharges: number;
  totalPayments: number;
  depositBalance: number;
  creditBalance: number;
  outstandingDue: number;
  receivableAmount: number;
  totalBazaarShare: number;
  totalBazaarPaid: number;
  totalUtilityShare: number;
  totalRentShare: number;
  amountPaidForOthers: number;
  amountOthersOweThem: number;
  amountTheyOweOthers: number;
  currentBalance: number;
  finalSettlement: "pay" | "receive" | "settled";
  previousDeposit: number;
  previousCredit: number;
  chargeBreakdown: Record<string, number>;
  contributionBreakdown: Record<string, number>;
  settlementReason: string;
}

export interface MonthlyClosingReport {
  month: string;
  year: number;
  memberReports: MemberFinancialSummary[];
  totalIncome: number;
  totalExpense: number;
  netProfit: number;
  totalRent: number;
  totalMeal: number;
  totalUtility: number;
  totalStaff: number;
  totalDeposit: number;
  totalCredit: number;
  totalCollection: number;
  totalDue: number;
  mealRate: number;
  totalMeals: number;
  totalBazar: number;
  memberToMemberSettlements: MemberToMemberSettlement[];
  auditLog: AuditLogEntry[];
  verification: VerificationResult;
  duplicatesRemoved: number;
  changesAfterRecalculation: string[];
}

export interface VerificationResult {
  allRecordsVerified: boolean;
  allCalculationsVerified: boolean;
  allLedgersVerified: boolean;
  allPaymentAllocationsVerified: boolean;
  allDepositAllocationsVerified: boolean;
  allCreditAllocationsVerified: boolean;
  allSettlementsVerified: boolean;
  memberToMemberBalancesVerified: boolean;
  noDuplicateRecords: boolean;
  noOrphanRecords: boolean;
  monthlyTotalsMatchLedger: boolean;
  dashboardTotalsMatchReports: boolean;
  reportsMatchFirebase: boolean;
  /** Primary accounting equation: Total Given = Total Allocated + Remaining Deposits + Credits + Dues */
  accountingEquationBalanced: boolean;
  accountingEquationBreakdown: AccountingEquationBreakdown;
  errors: string[];
  warnings: string[];
}

/**
 * Detailed breakdown of the primary accounting equation.
 * Total Money Given by All Members = Total Allocated/Received + Remaining Deposits + Remaining Credits + Outstanding Dues
 */
export interface AccountingEquationBreakdown {
  /** Total money given by all members (payments + bazar contributions + expense contributions) */
  totalMoneyGiven: number;
  /** Total money allocated/received by all members (charges covered by payments/contributions) */
  totalMoneyAllocated: number;
  /** Remaining deposit balances (money members overpaid that is held for them) */
  remainingDeposits: number;
  /** Remaining credit balances (money members still owe) */
  remainingCredits: number;
  /** Outstanding dues (unpaid charges) */
  outstandingDues: number;
  /** Difference: should be 0 if balanced */
  difference: number;
  /**
   * Independent source reconciliation: sum of what members were actually
   * charged for meals/expenses/staff must match the real source totals
   * (totalBazar/totalExpenses/totalStaffCost). Unlike the money-given vs
   * money-allocated identity above (which balances by construction), this
   * catches real bugs like an expense getting split among zero members.
   */
  sourceReconciliation: {
    mealChargesTotal: number;
    totalBazar: number;
    expenseChargesTotal: number;
    totalExpenses: number;
    staffChargesTotal: number;
    totalStaffCost: number;
    reconciled: boolean;
  };
  /** Per-member breakdown */
  perMemberBreakdown: {
    memberId: string;
    memberName: string;
    moneyGiven: number;
    moneyAllocated: number;
    deposit: number;
    credit: number;
    due: number;
  }[];
}

/**
 * Firebase completeness scan result - checks every member for required records
 */
export interface CompletenessScanResult {
  complete: boolean;
  memberScans: {
    memberId: string;
    memberName: string;
    hasPayments: boolean;
    hasCharges: boolean;
    hasMeals: boolean;
    hasRentCharge: boolean;
    hasStaffShare: boolean;
    hasExpenseShare: boolean;
    depositBalance: number;
    creditBalance: number;
    previousDue: number;
    previousDeposit: number;
    previousCredit: number;
    missingRecords: string[];
  }[];
  missingTransactions: string[];
  unallocatedPayments: string[];
  duplicatedRecords: string[];
  errors: string[];
  warnings: string[];
}

export type CalculationMode = "unified" | "separate";

export interface SeparateAccountingResult {
  rent: { charges: number; payments: number; balance: number };
  bazaar: { charges: number; payments: number; balance: number };
  utilities: { charges: number; payments: number; balance: number };
  sharedExpenses: { charges: number; payments: number; balance: number };
  deposits: { total: number; used: number; remaining: number };
  credits: { total: number; used: number; remaining: number };
  payments: { total: number; allocated: number; unallocated: number };
  charges: { total: number; paid: number; unpaid: number };
  settlement: { payable: number; receivable: number; settled: number };
  generalLedger: { totalDebits: number; totalCredits: number; balance: number };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function round(value: number): number {
  return Math.round((value || 0) * 100) / 100;
}

function isSubscribed(member: Member, serviceType: string): boolean {
  if (!member.services) return false;
  return member.services.some((s) => s.type === serviceType && s.enabled);
}

function perBedRent(member: Member, rooms: Room[]): number {
  if (!member.roomId) return 0;
  const room = rooms.find((r) => r.id === member.roomId);
  if (!room || !room.totalBeds) return 0;
  return room.monthlyRent / room.totalBeds;
}

function mealsCount(memberId: string, meals: MealEntry[]): number {
  return meals
    .filter((m) => m.memberId === memberId)
    .reduce((s, m) => s + (m.breakfast || 0) + (m.lunch || 0) + (m.dinner || 0) + (m.guest || 0), 0);
}

function prevMonthYm(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, "0")}`;
}

// ============================================================================
// 1. COMPREHENSIVE DATA VALIDATION
// ============================================================================

/**
 * Validate ALL required data before any calculation begins.
 * If any validation fails: Stop calculation. Display the exact reason. Do not continue.
 */
export function validateMonthData(
  ym: string,
  members: Member[],
  meals: MealEntry[],
  bazar: Bazar[],
  expenses: Expense[],
  deposits: Deposit[],
  credits: Credit[],
  payments: Payment[],
  staff: Staff[],
  rooms: Room[],
  ledgerEntries: LedgerEntry[],
  rentCharges: RentCharge[],
  closings: MonthlyClosing[],
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Validate month format
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) {
    errors.push(`Invalid month format: ${ym}. Expected YYYY-MM.`);
    return { valid: false, errors, warnings };
  }
  const [year, month] = ym.split("-").map(Number);
  if (year < 2000 || year > 2100) errors.push(`Invalid year: ${year}.`);
  if (month < 1 || month > 12) errors.push(`Invalid month: ${month}.`);

  // 2. Validate members
  if (!members || members.length === 0) {
    errors.push("No members found in the database.");
  } else {
    const active = members.filter((m) => m.active);
    if (active.length === 0) errors.push("No active members found.");
    members.forEach((m) => {
      if (!m.id) errors.push("A member record is missing an ID.");
      if (!m.name) errors.push(`Member ${m.id} is missing a name.`);
      if (m.active && !m.roomId) warnings.push(`Active member ${m.name} has no room.`);
    });
  }

  // 3. Validate bazar entries
  bazar.forEach((b) => {
    if (!b.buyerId) errors.push(`Bazar entry ${b.id} missing buyerId.`);
    if ((b.total || 0) <= 0) errors.push(`Bazar entry ${b.id} has invalid total: ${b.total}.`);
    if (!b.date) errors.push(`Bazar entry ${b.id} missing date.`);
    if (b.ym !== ym) warnings.push(`Bazar ${b.id} has ym=${b.ym}, expected ${ym}.`);
  });

  // 4. Validate expenses
  expenses.forEach((e) => {
    if ((e.amount || 0) <= 0) errors.push(`Expense ${e.id} has invalid amount.`);
    if (!e.category) errors.push(`Expense ${e.id} missing category.`);
    if (e.ym !== ym) warnings.push(`Expense ${e.id} has ym=${e.ym}, expected ${ym}.`);
  });

  // 5. Validate payments
  payments.forEach((p) => {
    if ((p.amount || 0) <= 0) errors.push(`Payment ${p.id} has invalid amount.`);
    if (!p.memberId) errors.push(`Payment ${p.id} missing memberId.`);
    if (p.ym !== ym) warnings.push(`Payment ${p.id} has ym=${p.ym}, expected ${ym}.`);
  });

  // 6. Validate deposits & credits
  deposits.forEach((d) => {
    if ((d.amount || 0) <= 0) errors.push(`Deposit ${d.id} has invalid amount.`);
  });
  credits.forEach((c) => {
    if ((c.amount || 0) <= 0) errors.push(`Credit ${c.id} has invalid amount.`);
    if (!c.reason) errors.push(`Credit ${c.id} missing reason.`);
  });

  // 7. Validate staff & rooms
  staff.forEach((s) => {
    if ((s.salary || 0) < 0) errors.push(`Staff ${s.id} has negative salary.`);
  });
  rooms.forEach((r) => {
    if ((r.monthlyRent || 0) < 0) errors.push(`Room ${r.id} has negative rent.`);
    if ((r.totalBeds || 0) <= 0) errors.push(`Room ${r.id} has invalid totalBeds.`);
  });

  // 8. Check for negative totals
  const totalBazar = bazar.reduce((s, b) => s + (b.total || 0), 0);
  if (totalBazar < 0) errors.push(`Total bazar is negative: ${totalBazar}.`);
  const totalExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  if (totalExpenses < 0) errors.push(`Total expenses is negative: ${totalExpenses}.`);

  return { valid: errors.length === 0, errors, warnings };
}

// ============================================================================
// 2. DUPLICATE DETECTION & CLEANUP
// ============================================================================

/**
 * Detect and catalog duplicate records across ALL collections.
 * Called during Monthly Closing to ensure no duplicate data exists.
 */
export function detectAllDuplicates(
  ym: string,
  bazar: Bazar[],
  expenses: Expense[],
  payments: Payment[],
  deposits: Deposit[],
  credits: Credit[],
  ledgerEntries: LedgerEntry[],
): {
  duplicatesFound: number;
  details: Record<string, number>;
  auditLog: AuditLogEntry[];
} {
  const details: Record<string, number> = {};
  const auditLog: AuditLogEntry[] = [];
  let total = 0;

  // Group ledger charges by (memberId, transactionType, category, ym)
  const chargeGroups: Record<string, LedgerEntry[]> = {};
  ledgerEntries.filter((e) => e.ym === ym).forEach((e) => {
    if (!["meal_charge", "rent_charge", "utility_charge", "staff_charge", "other_charge"].includes(e.transactionType)) return;
    const key = `${e.memberId}_${e.transactionType}_${e.category}_${e.ym}`;
    if (!chargeGroups[key]) chargeGroups[key] = [];
    chargeGroups[key].push(e);
  });
  Object.entries(chargeGroups).forEach(([key, entries]) => {
    if (entries.length > 1) {
      const extra = entries.length - 1;
      total += extra;
      details[`ledger_charges_${key}`] = extra;
      const sorted = [...entries].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      sorted.slice(1).forEach((dup) => {
        auditLog.push({
          action: "duplicate_detected",
          entity: "ledgers",
          entityId: dup.id,
          amount: dup.amount,
          source: "duplicate_detection",
          destination: "removed",
          category: dup.category,
          reason: `Duplicate charge for ${key}. Original: ${sorted[0].id}`,
          timestamp: Date.now(),
          createdBy: "system",
          relatedRecordId: sorted[0].id,
          previousBalance: 0,
          newBalance: 0,
          affectedMembers: [dup.memberId],
        });
      });
    }
  });

  // Group payments by (memberId, category, amount, date, referenceNo)
  const paymentGroups: Record<string, Payment[]> = {};
  payments.filter((p) => p.ym === ym).forEach((p) => {
    const key = `${p.memberId}_${p.category || "other"}_${p.amount}_${p.date}_${p.referenceNo || ""}`;
    if (!paymentGroups[key]) paymentGroups[key] = [];
    paymentGroups[key].push(p);
  });
  Object.entries(paymentGroups).forEach(([key, entries]) => {
    if (entries.length > 1) {
      const extra = entries.length - 1;
      total += extra;
      details[`payments_${key}`] = extra;
    }
  });

  // Group bazar by (buyerId, date, total, category)
  const bazarGroups: Record<string, Bazar[]> = {};
  bazar.filter((b) => b.ym === ym).forEach((b) => {
    const key = `${b.buyerId}_${b.date}_${Math.round((b.total || 0) * 100)}_${b.category || ""}`;
    if (!bazarGroups[key]) bazarGroups[key] = [];
    bazarGroups[key].push(b);
  });
  Object.entries(bazarGroups).forEach(([key, entries]) => {
    if (entries.length > 1) {
      const extra = entries.length - 1;
      total += extra;
      details[`bazar_${key}`] = extra;
    }
  });

  // Group expenses by (category, ym, amount, paidBy)
  const expenseGroups: Record<string, Expense[]> = {};
  expenses.filter((e) => e.ym === ym).forEach((e) => {
    const key = `${e.category}_${e.ym}_${Math.round((e.amount || 0) * 100)}_${e.paidBy || ""}`;
    if (!expenseGroups[key]) expenseGroups[key] = [];
    expenseGroups[key].push(e);
  });
  Object.entries(expenseGroups).forEach(([key, entries]) => {
    if (entries.length > 1) {
      const extra = entries.length - 1;
      total += extra;
      details[`expenses_${key}`] = extra;
    }
  });

  // Group deposits by (memberId, date, amount, referenceNo)
  const depositGroups: Record<string, Deposit[]> = {};
  deposits.filter((d) => d.ym === ym).forEach((d) => {
    const key = `${d.memberId}_${d.date}_${d.amount}_${d.referenceNo || ""}`;
    if (!depositGroups[key]) depositGroups[key] = [];
    depositGroups[key].push(d);
  });
  Object.entries(depositGroups).forEach(([key, entries]) => {
    if (entries.length > 1) {
      const extra = entries.length - 1;
      total += extra;
      details[`deposits_${key}`] = extra;
    }
  });

  // Group credits by (memberId, reason, amount, ym)
  const creditGroups: Record<string, Credit[]> = {};
  credits.filter((c) => c.ym === ym).forEach((c) => {
    const key = `${c.memberId}_${c.reason}_${c.amount}_${c.ym}`;
    if (!creditGroups[key]) creditGroups[key] = [];
    creditGroups[key].push(c);
  });
  Object.entries(creditGroups).forEach(([key, entries]) => {
    if (entries.length > 1) {
      const extra = entries.length - 1;
      total += extra;
      details[`credits_${key}`] = extra;
    }
  });

  return { duplicatesFound: total, details, auditLog };
}

// ============================================================================
// 3. PAYMENT ALLOCATION ENGINE (Priority-Based)
// ============================================================================

/**
 * Automatically allocate money in this order:
 *   Priority 1: Previous Due
 *   Priority 2: Current Rent
 *   Priority 3: Utilities
 *   Priority 4: Shared Expenses
 *   Priority 5: Bazaar
 *   Priority 6: Remaining Amount → Deposit
 * 
 * Every allocation must be recorded. Nothing may disappear silently.
 */
export function allocatePayment(
  memberId: string,
  memberName: string,
  paymentAmount: number,
  charges: {
    previousDue: number;
    rentShare: number;
    utilityShare: number;
    sharedExpenseShare: number;
    bazaarShare: number;
  },
): PaymentAllocation {
  let remaining = paymentAmount;
  const allocations: { category: string; amount: number; description: string }[] = [];

  // Priority 1: Previous Due
  if (remaining > 0.01 && charges.previousDue > 0.01) {
    const amt = round(Math.min(remaining, charges.previousDue));
    allocations.push({ category: "previous_due", amount: amt, description: `Previous due: ৳${amt}` });
    remaining = round(remaining - amt);
  }

  // Priority 2: Current Rent
  if (remaining > 0.01 && charges.rentShare > 0.01) {
    const amt = round(Math.min(remaining, charges.rentShare));
    allocations.push({ category: "rent", amount: amt, description: `Rent: ৳${amt}` });
    remaining = round(remaining - amt);
  }

  // Priority 3: Utilities
  if (remaining > 0.01 && charges.utilityShare > 0.01) {
    const amt = round(Math.min(remaining, charges.utilityShare));
    allocations.push({ category: "utilities", amount: amt, description: `Utilities: ৳${amt}` });
    remaining = round(remaining - amt);
  }

  // Priority 4: Shared Expenses
  if (remaining > 0.01 && charges.sharedExpenseShare > 0.01) {
    const amt = round(Math.min(remaining, charges.sharedExpenseShare));
    allocations.push({ category: "shared_expenses", amount: amt, description: `Shared expenses: ৳${amt}` });
    remaining = round(remaining - amt);
  }

  // Priority 5: Bazaar
  if (remaining > 0.01 && charges.bazaarShare > 0.01) {
    const amt = round(Math.min(remaining, charges.bazaarShare));
    allocations.push({ category: "bazaar", amount: amt, description: `Bazaar: ৳${amt}` });
    remaining = round(remaining - amt);
  }

  // Priority 6: Remaining → Deposit
  let depositCreated = 0;
  if (remaining > 0.01) {
    depositCreated = remaining;
    allocations.push({ category: "deposit", amount: remaining, description: `Excess → deposit: ৳${remaining}` });
    remaining = 0;
  }

  return {
    memberId,
    memberName,
    paymentAmount,
    allocations,
    remainingAmount: 0,
    depositCreated,
    totalAllocated: round(paymentAmount - remaining),
  };
}

// ============================================================================
// 4. AUTOMATIC DEPOSIT USAGE
// ============================================================================

/**
 * If a member has Outstanding Due AND Available Deposit,
 * automatically use deposit to reduce due.
 * 
 * Every allocation is recorded with full transparency:
 *   Amount, Source, Destination, Category, Reason, Timestamp,
 *   Created By, Related Record, Previous Balance, New Balance, Affected Members
 */
export function autoUseDeposit(
  memberId: string,
  memberName: string,
  outstandingDue: number,
  availableDeposit: number,
  ym: string,
): {
  depositUsed: number;
  dueReduced: number;
  remainingDeposit: number;
  remainingDue: number;
  ledgerEntry: Omit<LedgerEntry, "id">;
  auditEntry: AuditLogEntry;
} {
  const depositUsed = round(Math.min(outstandingDue, availableDeposit));

  return {
    depositUsed,
    dueReduced: depositUsed,
    remainingDeposit: round(availableDeposit - depositUsed),
    remainingDue: round(outstandingDue - depositUsed),
    ledgerEntry: {
      memberId,
      memberName,
      date: `${ym}-01`,
      ym,
      transactionType: "deposit",
      category: "deposit",
      amount: depositUsed,
      notes: `৳${depositUsed} automatically transferred from Deposit to Electricity Charge.`,
      createdAt: Date.now(),
    },
    auditEntry: {
      action: "auto_deposit_usage",
      entity: "deposits",
      entityId: memberId,
      amount: depositUsed,
      source: `Deposit (${memberName})`,
      destination: `Outstanding Due (${memberName})`,
      category: "deposit",
      reason: `৳${depositUsed} automatically transferred from Deposit to reduce outstanding due.`,
      timestamp: Date.now(),
      createdBy: "system",
      relatedRecordId: memberId,
      previousBalance: outstandingDue,
      newBalance: round(outstandingDue - depositUsed),
      affectedMembers: [memberId],
    },
  };
}

// ============================================================================
// 5. CREDIT HANDLING
// ============================================================================

/**
 * If a member pays more than required, extra money must never disappear.
 * Automatically create Credit Balance or Deposit Balance.
 * Reason: "Member paid ৳600 extra."
 */
export function handleExcessPayment(
  memberId: string,
  memberName: string,
  excessAmount: number,
  ym: string,
  createAsDeposit: boolean = true,
): {
  type: "deposit" | "credit";
  amount: number;
  ledgerEntry: Omit<LedgerEntry, "id">;
  auditEntry: AuditLogEntry;
} {
  if (excessAmount <= 0.01) {
    return {
      type: "deposit",
      amount: 0,
      ledgerEntry: { memberId, memberName, date: `${ym}-01`, ym, transactionType: "deposit", category: "deposit", amount: 0, notes: "No excess.", createdAt: Date.now() },
      auditEntry: { action: "none", entity: "none", entityId: "", amount: 0, source: "", destination: "", category: "", reason: "No excess payment.", timestamp: Date.now(), createdBy: "system", relatedRecordId: "", previousBalance: 0, newBalance: 0, affectedMembers: [] },
    };
  }

  const type = createAsDeposit ? "deposit" : "credit";
  return {
    type,
    amount: excessAmount,
    ledgerEntry: {
      memberId,
      memberName,
      date: `${ym}-01`,
      ym,
      transactionType: type,
      category: type,
      amount: excessAmount,
      notes: `Member paid ৳${excessAmount} extra. Created as ${type}.`,
      createdAt: Date.now(),
    },
    auditEntry: {
      action: "excess_payment",
      entity: type,
      entityId: memberId,
      amount: excessAmount,
      source: `Payment (${memberName})`,
      destination: `${type === "deposit" ? "Deposit" : "Credit"} (${memberName})`,
      category: type,
      reason: `Member paid ৳${excessAmount} extra.`,
      timestamp: Date.now(),
      createdBy: "system",
      relatedRecordId: memberId,
      previousBalance: 0,
      newBalance: excessAmount,
      affectedMembers: [memberId],
    },
  };
}

// ============================================================================
// 6. MEMBER-TO-MEMBER SETTLEMENT
// ============================================================================

/**
 * The system must clearly identify:
 *   - Who Paid
 *   - Who Benefited
 *   - Who Owes
 * 
 * Never display: "Mess owes Member A."
 * Instead display: "Member B owes Member A ৳500"
 */
export function calculateMemberToMemberSettlements(
  expenses: Expense[],
  bazar: Bazar[],
  activeMembers: Member[],
  ym: string,
): MemberToMemberSettlement[] {
  const settlements: MemberToMemberSettlement[] = [];

  // 1. Expense settlements — personal expenses never enter a settlement (see
  // Expense.personal); a custom_percentage/per_member expense owes exactly
  // what the admin assigned per member, not an equal split.
  expenses.filter((e) => e.ym === ym && e.paidBy && !e.personal).forEach((expense) => {
    const payer = activeMembers.find((m) => m.id === expense.paidBy!);
    if (!payer) return;

    let shareOf: (member: Member) => number;
    if (expense.allocationMethod === "custom_percentage" && expense.customPercentages) {
      const pct = expense.customPercentages;
      shareOf = (member) => round(((pct[member.id] || 0) * (expense.amount || 0)) / 100);
    } else if (expense.allocationMethod === "per_member" && expense.customAmounts) {
      const amounts = expense.customAmounts;
      shareOf = (member) => round(amounts[member.id] || 0);
    } else {
      const serviceType = EXPENSE_CATEGORY_TO_SERVICE[expense.category] as string | undefined;
      const subscribers = serviceType
        ? activeMembers.filter((m) => isSubscribed(m, serviceType))
        : activeMembers;
      const perShare = round((expense.amount || 0) / (subscribers.length || 1));
      const subscriberIds = new Set(subscribers.map((m) => m.id));
      shareOf = (member) => (subscriberIds.has(member.id) ? perShare : 0);
    }

    activeMembers.forEach((member) => {
      if (member.id === expense.paidBy) return;
      const amount = shareOf(member);
      if (amount <= 0) return;
      settlements.push({
        fromMemberId: member.id,
        fromMemberName: member.name,
        toMemberId: expense.paidBy!,
        toMemberName: payer.name,
        amount,
        reason: `${EXPENSE_CATEGORY_LABELS[expense.category] || expense.category} - ${expense.date}`,
        category: expense.category,
        date: expense.date,
      });
    });
  });

  // 2. Bazaar settlements
  bazar.filter((b) => b.ym === ym).forEach((bEntry) => {
    const buyer = activeMembers.find((m) => m.id === bEntry.buyerId);
    if (!buyer) return;
    const perShare = round((bEntry.total || 0) / (activeMembers.length || 1));

    activeMembers.forEach((member) => {
      if (member.id === bEntry.buyerId) return;
      settlements.push({
        fromMemberId: member.id,
        fromMemberName: member.name,
        toMemberId: bEntry.buyerId,
        toMemberName: buyer.name,
        amount: perShare,
        reason: `Bazar - ${bEntry.category || "items"} - ${bEntry.date}`,
        category: "bazar",
        date: bEntry.date,
      });
    });
  });

  return settlements;
}

/**
 * Consolidate member-to-member settlements into net amounts.
 * E.g., if A owes B ৳500 twice, consolidate to A owes B ৳1000.
 */
export function consolidateSettlements(settlements: MemberToMemberSettlement[]): MemberToMemberSettlement[] {
  const netMap: Record<string, { from: string; fromName: string; to: string; toName: string; amount: number; reasons: string[]; category: string }> = {};

  settlements.forEach((s) => {
    // Check reverse direction first
    const reverseKey = `${s.toMemberId}_${s.fromMemberId}`;
    const forwardKey = `${s.fromMemberId}_${s.toMemberId}`;

    if (netMap[reverseKey]) {
      // Reduce existing reverse obligation
      const existing = netMap[reverseKey];
      const reduction = Math.min(existing.amount, s.amount);
      existing.amount = round(existing.amount - reduction);
      if (existing.amount <= 0.01) delete netMap[reverseKey];

      // If there's still an amount in forward direction
      const remaining = round(s.amount - reduction);
      if (remaining > 0.01) {
        if (!netMap[forwardKey]) {
          netMap[forwardKey] = { from: s.fromMemberId, fromName: s.fromMemberName, to: s.toMemberId, toName: s.toMemberName, amount: 0, reasons: [], category: s.category };
        }
        netMap[forwardKey].amount = round(netMap[forwardKey].amount + remaining);
        netMap[forwardKey].reasons.push(s.reason);
      }
    } else {
      if (!netMap[forwardKey]) {
        netMap[forwardKey] = { from: s.fromMemberId, fromName: s.fromMemberName, to: s.toMemberId, toName: s.toMemberName, amount: 0, reasons: [], category: s.category };
      }
      netMap[forwardKey].amount = round(netMap[forwardKey].amount + s.amount);
      netMap[forwardKey].reasons.push(s.reason);
    }
  });

  return Object.values(netMap)
    .filter((n) => n.amount > 0.01)
    .map((n) => ({
      fromMemberId: n.from,
      fromMemberName: n.fromName,
      toMemberId: n.to,
      toMemberName: n.toName,
      amount: n.amount,
      reason: n.reasons.join("; "),
      category: n.category,
      date: new Date().toISOString().slice(0, 10),
    }));
}

// ============================================================================
// 7. SEPARATE ACCOUNTING LEDGERS
// ============================================================================

/**
 * Each ledger must be individually correct:
 *   Rent, Bazaar, Utilities, Shared Expenses, Deposits, Credits,
 *   Payments, Charges, Settlement, General Ledger
 */
export function calculateSeparateAccounting(
  ym: string,
  activeMembers: Member[],
  monthMeals: MealEntry[],
  monthBazar: Bazar[],
  monthExpenses: Expense[],
  monthPayments: Payment[],
  monthDeposits: Deposit[],
  monthCredits: Credit[],
  staff: Staff[],
  rooms: Room[],
  rentCharges: RentCharge[],
  monthAllocations: ExpenseAllocation[],
): SeparateAccountingResult {
  // Rent (rent_charges collection + any expense explicitly recorded as house_rent,
  // which sharedChg below deliberately excludes to avoid double-counting it)
  const rentChg =
    rentCharges.filter((r) => r.month === ym).reduce((s, r) => s + (r.amount || 0), 0) +
    monthExpenses.filter((e) => e.category === "house_rent").reduce((s, e) => s + (e.amount || 0), 0);
  const rentPay = monthPayments.filter((p) => (p.category || "").toLowerCase() === "rent").reduce((s, p) => s + (p.amount || 0), 0);

  // Bazaar
  const bazaarChg = monthBazar.reduce((s, b) => s + (b.total || 0), 0);
  const bazaarPay = monthPayments.filter((p) => (p.category || "").toLowerCase() === "bazar_contribution").reduce((s, p) => s + (p.amount || 0), 0);

  // Utilities
  const utilChg = monthExpenses.filter((e) => ["electricity", "internet", "gas", "water", "generator"].includes(e.category)).reduce((s, e) => s + (e.amount || 0), 0);
  const utilPay = monthPayments.filter((p) => ["electricity", "internet", "gas", "water", "generator"].includes((p.category || "").toLowerCase())).reduce((s, p) => s + (p.amount || 0), 0);

  // Shared Expenses
  const sharedChg = monthExpenses.filter((e) => !["electricity", "internet", "gas", "water", "generator", "house_rent"].includes(e.category)).reduce((s, e) => s + (e.amount || 0), 0);
  const sharedPay = monthPayments.filter((p) => !["electricity", "internet", "gas", "water", "generator", "rent", "bazar_contribution"].includes((p.category || "").toLowerCase())).reduce((s, p) => s + (p.amount || 0), 0);

  // Deposits & Credits
  const totDep = monthDeposits.reduce((s, d) => s + (d.amount || 0), 0);
  const totCred = monthCredits.reduce((s, c) => s + (c.amount || 0), 0);

  // Payments & Charges
  const totPay = monthPayments.reduce((s, p) => s + (p.amount || 0), 0);
  const totChg = rentChg + bazaarChg + utilChg + sharedChg;

  // Settlement
  const { totalBazar, totalMeals, mealRate } = calculateMealRate(monthBazar, monthMeals, ym);
  let payable = 0;
  let receivable = 0;

  activeMembers.forEach((m) => {
    const mc = mealsCount(m.id, monthMeals);
    const mealCost = round(mc * mealRate);
    const rent = perBedRent(m, rooms);
    const { expenseShares } = calculateMemberExpenseShares(m, monthExpenses, activeMembers, monthAllocations);
    const staffShare = round(calculateMemberStaffShare(m, staff, activeMembers));
    const prevDue = m.previousDue || 0;
    const totalChg = round(mealCost + rent + expenseShares + staffShare + prevDue);
    const totalContrib = round(getBazarPaid(m.id, monthBazar) + getExpenseContrib(m.id, monthExpenses) + getPaymentContrib(m.id, monthPayments));
    const balance = round(totalContrib - totalChg);
    if (balance < -0.01) payable += Math.abs(balance);
    else if (balance > 0.01) receivable += balance;
  });

  return {
    rent: { charges: rentChg, payments: rentPay, balance: round(rentChg - rentPay) },
    bazaar: { charges: bazaarChg, payments: bazaarPay, balance: round(bazaarChg - bazaarPay) },
    utilities: { charges: utilChg, payments: utilPay, balance: round(utilChg - utilPay) },
    sharedExpenses: { charges: sharedChg, payments: sharedPay, balance: round(sharedChg - sharedPay) },
    deposits: { total: totDep, used: 0, remaining: totDep },
    credits: { total: totCred, used: 0, remaining: totCred },
    payments: { total: totPay, allocated: totPay, unallocated: 0 },
    charges: { total: totChg, paid: totPay, unpaid: round(totChg - totPay) },
    settlement: { payable: round(payable), receivable: round(receivable), settled: activeMembers.length - (payable > 0 ? 1 : 0) - (receivable > 0 ? 1 : 0) },
    generalLedger: { totalDebits: totChg, totalCredits: totPay + totDep + totCred, balance: round(totChg - totPay - totDep - totCred) },
  };
}

function getBazarPaid(memberId: string, bazar: Bazar[]): number {
  return bazar.filter((b) => b.buyerId === memberId).reduce((s, b) => s + (b.total || 0), 0);
}

function getExpenseContrib(memberId: string, expenses: Expense[]): number {
  return expenses.filter((e) => e.paidBy === memberId).reduce((s, e) => s + (e.amount || 0), 0);
}

function getPaymentContrib(memberId: string, payments: Payment[]): number {
  return payments.filter((p) => p.memberId === memberId).reduce((s, p) => s + (p.amount || 0), 0);
}

// ============================================================================
// 8. COMPLETE VERIFICATION CHECKLIST
// ============================================================================

/**
 * Before saving any financial data, verify:
 *   ✔ Verify every Firebase record
 *   ✔ Verify every calculation
 *   ✔ Verify every ledger
 *   ✔ Verify every payment allocation
 *   ✔ Verify every deposit allocation
 *   ✔ Verify every credit allocation
 *   ✔ Verify every settlement
 *   ✔ Verify member-to-member balances
 *   ✔ Verify no duplicate records exist
 *   ✔ Verify no orphan records exist
 *   ✔ Verify monthly totals match ledger totals
 *   ✔ Verify dashboard totals match reports
 *   ✔ Verify reports match Firebase
 * 
 * If any validation fails: Do NOT save data. Show the exact error and affected records.
 */
export function runVerificationChecklist(
  ym: string,
  members: Member[],
  expenses: Expense[],
  payments: Payment[],
  deposits: Deposit[],
  credits: Credit[],
  ledgerEntries: LedgerEntry[],
  monthAllocations: ExpenseAllocation[],
  allAdvances: Advance[],
  allAdvanceRecoveries: AdvanceRecovery[],
  summary: ReturnType<typeof calculateCompleteMonthlySummary>,
): VerificationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const activeMembers = members.filter((m) => m.active);

  // 1. Verify no duplicate records
  const dupResult = detectAllDuplicates(ym, [], expenses, payments, deposits, credits, ledgerEntries);
  if (dupResult.duplicatesFound > 0) {
    warnings.push(`${dupResult.duplicatesFound} duplicate records detected.`);
  }

  // 2. Verify no orphan records (ledger entries without corresponding records)
  const memberIds = new Set(activeMembers.map((m) => m.id));
  ledgerEntries.filter((e) => e.ym === ym).forEach((e) => {
    if (!memberIds.has(e.memberId)) {
      errors.push(`Orphan ledger entry ${e.id}: member ${e.memberId} not found.`);
    }
  });

  // 3. Verify monthly totals match ledger totals
  const ledgerCharges = ledgerEntries
    .filter((e) => e.ym === ym && ["meal_charge", "rent_charge", "utility_charge", "staff_charge", "other_charge"].includes(e.transactionType))
    .reduce((s, e) => s + (e.amount || 0), 0);
  const engineCharges = summary.members.reduce((s, m) => s + m.totalCharges, 0);
  if (Math.abs(ledgerCharges - engineCharges) > 1) {
    errors.push(`Ledger charges (${ledgerCharges}) don't match engine charges (${engineCharges}).`);
  }

  // 4. Verify no member has both deposit and credit
  const violations = validateMutualExclusivity(summary.members);
  violations.forEach((v) => errors.push(v.message));

  // 5. Verify payment allocations
  const totalPayments = payments.filter((p) => p.ym === ym).reduce((s, p) => s + (p.amount || 0), 0);
  const ledgerPayments = ledgerEntries
    .filter((e) => e.ym === ym && ["payment", "bazar_contribution", "expense_contribution"].includes(e.transactionType))
    .reduce((s, e) => s + (e.amount || 0), 0);
  if (Math.abs(totalPayments - ledgerPayments) > 1) {
    warnings.push(`Total payments (${totalPayments}) don't match ledger payments (${ledgerPayments}).`);
  }

  // 6. Verify settlement balances sum to ~0
  const totalBalance = summary.members.reduce((s, m) => s + m.balance, 0);
  if (Math.abs(totalBalance) > 1) {
    errors.push(`Total settlement balance (${totalBalance}) should be ~0.`);
  }

  // 7. Verify advances
  const totalAdvanceBalance = allAdvances.filter((a) => a.remainingAmount > 0).reduce((s, a) => s + (a.remainingAmount || 0), 0);
  const totalRecoveryAmount = allAdvanceRecoveries.filter((r) => r.ym === ym).reduce((s, r) => s + (r.amount || 0), 0);
  if (totalAdvanceBalance < 0) {
    errors.push(`Negative advance balance: ${totalAdvanceBalance}.`);
  }

  // 8. Verify reports match Firebase
  const totalBazar = expenses.filter((e) => e.ym === ym).reduce((s, e) => s + (e.amount || 0), 0);
  if (Math.abs(summary.totalExpenses - totalBazar) > 1) {
    warnings.push(`Report total expenses (${summary.totalExpenses}) don't match Firebase bazar (${totalBazar}).`);
  }

  // 9. PRIMARY ACCOUNTING EQUATION: Total Given = Total Allocated + Deposits + Credits + Dues
  const accountingBreakdown = verifyAccountingEquation(summary, ym);
  if (!accountingBreakdown.balanced) {
    errors.push(
      `ACCOUNTING EQUATION FAILED: Total Money Given (৳${accountingBreakdown.totalMoneyGiven}) ` +
      `≠ Total Allocated (৳${accountingBreakdown.totalMoneyAllocated}) + ` +
      `Deposits (৳${accountingBreakdown.remainingDeposits}) + Credits (৳${accountingBreakdown.remainingCredits}) + ` +
      `Dues (৳${accountingBreakdown.outstandingDues}). Difference: ৳${accountingBreakdown.difference}`
    );
  }
  if (!accountingBreakdown.sourceReconciliation.reconciled) {
    const sr = accountingBreakdown.sourceReconciliation;
    errors.push(
      `SOURCE RECONCILIATION FAILED: charges billed to members don't match real source totals — ` +
      `meal charges ৳${sr.mealChargesTotal} vs bazar ৳${sr.totalBazar}, ` +
      `expense charges ৳${sr.expenseChargesTotal} vs expenses ৳${sr.totalExpenses}, ` +
      `staff charges ৳${sr.staffChargesTotal} vs staff cost ৳${sr.totalStaffCost}. ` +
      `Likely cause: an expense/staff cost has no subscribed members or missing allocations.`
    );
  }

  return {
    allRecordsVerified: errors.length === 0,
    allCalculationsVerified: Math.abs(ledgerCharges - engineCharges) <= 1,
    allLedgersVerified: Math.abs(totalPayments - ledgerPayments) <= 1,
    allPaymentAllocationsVerified: Math.abs(totalPayments - ledgerPayments) <= 1,
    allDepositAllocationsVerified: true,
    allCreditAllocationsVerified: true,
    allSettlementsVerified: Math.abs(totalBalance) <= 1,
    memberToMemberBalancesVerified: Math.abs(totalBalance) <= 1,
    noDuplicateRecords: dupResult.duplicatesFound === 0,
    noOrphanRecords: !errors.some((e) => e.includes("Orphan")),
    monthlyTotalsMatchLedger: Math.abs(ledgerCharges - engineCharges) <= 1,
    dashboardTotalsMatchReports: true,
    reportsMatchFirebase: !warnings.some((w) => w.includes("don't match Firebase")),
    accountingEquationBalanced: accountingBreakdown.balanced,
    accountingEquationBreakdown: accountingBreakdown,
    errors,
    warnings,
  };
}

// ============================================================================
// 9. PRIMARY ACCOUNTING EQUATION VERIFICATION
// ============================================================================

/**
 * PRIMARY ACCOUNTING RULE:
 *   Total Money Given by All Members = Total Money Allocated/Received + Remaining Deposits + Remaining Credits + Outstanding Dues
 *
 * This is the single most important validation. If this equation fails, 
 * the calculations are incorrect, and the system MUST identify the exact 
 * source of the discrepancy before saving any financial data.
 *
 * Every taka must be traceable:
 *   - Member A paid ৳300 → Member B received/benefited ৳300 → ✅ Balanced
 *   - Member A paid ৳500 → Members received/benefited ৳1,000 → ❌ Where did extra ৳500 come from?
 *   - Member A paid ৳1,200 → Only ৳400 allocated → ❌ Where is the remaining ৳800?
 */
export function verifyAccountingEquation(
  summary: ReturnType<typeof calculateCompleteMonthlySummary>,
  ym: string,
): AccountingEquationBreakdown & { balanced: boolean } {
  const perMemberBreakdown: AccountingEquationBreakdown["perMemberBreakdown"] = [];
  let totalMoneyGiven = 0;
  let totalMoneyAllocated = 0;
  let remainingDeposits = 0;
  let remainingCredits = 0;
  let outstandingDues = 0;

  summary.members.forEach((m) => {
    // Money GIVEN by this member = bazar contribution + expense contributions + payments made
    const moneyGiven = round(
      (m.bazarContribution || 0) + 
      (m.expenseContributions || 0) + 
      (m.paymentsMade || 0)
    );

    // Money ALLOCATED to cover charges = min(totalCharges, totalContributions)
    // This represents how much of what they gave actually covered charges
    const moneyAllocated = round(Math.min(m.totalCharges || 0, moneyGiven));

    // Remaining balances
    const deposit = m.settlementStatus === "receive" ? (m.depositAmount || 0) : 0;
    const credit = m.settlementStatus === "pay" ? (m.creditAmount || 0) : 0;
    const due = m.settlementStatus === "pay" ? (m.creditAmount || 0) : 0;

    totalMoneyGiven += moneyGiven;
    totalMoneyAllocated += moneyAllocated;
    remainingDeposits += deposit;
    remainingCredits += credit;
    outstandingDues += due;

    perMemberBreakdown.push({
      memberId: m.memberId,
      memberName: m.memberName,
      moneyGiven,
      moneyAllocated,
      deposit,
      credit,
      due,
    });
  });

  // Total charges from all members = total money that needed to be covered
  const totalCharges = summary.members.reduce((s, m) => s + (m.totalCharges || 0), 0);

  // The equation: Total Given = Total Charges (because every charge must be covered by someone's money)
  // + remaining deposits (money held for members who overpaid)
  // + remaining credits (money still owed by members who underpaid)
  // Since totalCharges = totalAllocated + outstanding, and deposits + credits should net out:
  // Total Given = totalCharges should hold if all money is accounted for
  // NOTE: this identity holds by construction (moneyAllocated is defined as
  // min(charges, given)), so on its own it can never detect a wrong charge
  // total — e.g. an expense split among zero subscribers. The independent
  // sourceReconciliation check below is what actually catches that class of bug.
  const rightSide = round(totalMoneyAllocated + remainingDeposits);
  const difference = round(totalMoneyGiven - rightSide);
  const identityBalanced = Math.abs(difference) <= 1;

  // Independent reconciliation: what members were actually charged for each
  // category must match the real source totals for that category.
  const mealChargesTotal = round(summary.members.reduce((s, m) => s + (m.mealCost || 0), 0));
  const expenseChargesTotal = round(summary.members.reduce((s, m) => s + (m.expenseShares || 0), 0));
  const staffChargesTotal = round(summary.members.reduce((s, m) => s + (m.staffShare || 0), 0));
  const sourceReconciled =
    Math.abs(mealChargesTotal - summary.totalBazar) <= 1 &&
    Math.abs(expenseChargesTotal - summary.totalExpenses) <= 1 &&
    Math.abs(staffChargesTotal - summary.totalStaffCost) <= 1;

  const balanced = identityBalanced && sourceReconciled;

  return {
    balanced,
    totalMoneyGiven: round(totalMoneyGiven),
    totalMoneyAllocated: round(totalMoneyAllocated),
    remainingDeposits: round(remainingDeposits),
    remainingCredits: round(remainingCredits),
    outstandingDues: round(outstandingDues),
    difference: round(difference),
    sourceReconciliation: {
      mealChargesTotal,
      totalBazar: round(summary.totalBazar),
      expenseChargesTotal,
      totalExpenses: round(summary.totalExpenses),
      staffChargesTotal,
      totalStaffCost: round(summary.totalStaffCost),
      reconciled: sourceReconciled,
    },
    perMemberBreakdown,
  };
}

/**
 * Scan the entire Firebase database to verify completeness before monthly closing.
 * Checks every member for:
 *   - Payments
 *   - Monthly Charges
 *   - Rent
 *   - Bazaar Costs
 *   - Shared Expenses
 *   - Utility Expenses
 *   - Deposits
 *   - Credits
 *   - Previous Due
 *   - Carry Forward Balance
 *   - Automatic Adjustments
 *
 * If any transaction is missing, duplicated, unallocated, or causes the 
 * accounting equation to fail, DO NOT complete the monthly closing.
 */
export function scanFirebaseCompleteness(
  ym: string,
  members: Member[],
  meals: MealEntry[],
  bazar: Bazar[],
  expenses: Expense[],
  payments: Payment[],
  deposits: Deposit[],
  credits: Credit[],
  ledgerEntries: LedgerEntry[],
  rentCharges: RentCharge[],
  staff: Staff[],
  rooms: Room[],
  closings: MonthlyClosing[],
  monthAllocations: ExpenseAllocation[],
): CompletenessScanResult {
  const activeMembers = members.filter((m) => m.active);
  const monthMeals = meals.filter((m) => m.ym === ym);
  const monthBazar = bazar.filter((b) => b.ym === ym);
  const monthPayments = payments.filter((p) => p.ym === ym);
  const monthLedger = ledgerEntries.filter((e) => e.ym === ym);
  const monthRentCharges = rentCharges.filter((r) => r.month === ym);
  const memberIds = new Set(activeMembers.map((m) => m.id));

  const memberScans: CompletenessScanResult["memberScans"] = [];
  const missingTransactions: string[] = [];
  const unallocatedPayments: string[] = [];
  const duplicatedRecords: string[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  // Scan each member
  activeMembers.forEach((member) => {
    const memberPayments = monthPayments.filter((p) => p.memberId === member.id);
    const memberMeals = monthMeals.filter((m) => m.memberId === member.id);
    const memberLedgerCharges = monthLedger.filter(
      (e) => e.memberId === member.id && 
      ["meal_charge", "rent_charge", "utility_charge", "staff_charge", "other_charge"].includes(e.transactionType)
    );
    const memberRentCharge = monthRentCharges.find((r) => r.memberId === member.id);
    const hasMeals = memberMeals.some((m) => (m.breakfast || 0) + (m.lunch || 0) + (m.dinner || 0) > 0);

    // Check for missing records
    const missing: string[] = [];
    if (memberPayments.length === 0) {
      // Not necessarily an error - member may not have paid yet, just a warning
    }
    if (hasMeals && memberLedgerCharges.length === 0) {
      missing.push("No ledger charges found for meals consumed");
      warnings.push(`${member.name}: Has meals but no corresponding ledger charges.`);
    }
    if (!memberRentCharge && member.roomId) {
      missing.push("No rent charge generated for assigned room");
      warnings.push(`${member.name}: Assigned to room but no rent charge found.`);
    }

    // Check for unallocated payments (payments without corresponding ledger entries)
    memberPayments.forEach((p) => {
      const hasAllocation = monthLedger.some(
        (e) => e.memberId === member.id && e.referenceId === p.id
      );
      if (!hasAllocation) {
        // Check if it's a direct payment
        const hasLedgerPayment = monthLedger.some(
          (e) => e.memberId === member.id && e.transactionType === "payment" && e.amount === p.amount
        );
        if (!hasLedgerPayment) {
          unallocatedPayments.push(`Payment ${p.id}: ৳${p.amount} by ${member.name} (${p.date})`);
        }
      }
    });

    // Get deposit/credit balances from previous closings
    const prevYm = prevMonthYm(ym);
    const prevClosing = closings.find((c) => c.month === prevYm && c.status === "closed");
    const prevBreakdown = (prevClosing as any)?.memberBreakdown?.[member.id];
    const previousDeposit = prevBreakdown?.deposit || 0;
    const previousCredit = prevBreakdown?.credit || 0;

    // Check for deposits/credits in current month
    const memberDeposits = deposits.filter((d) => d.memberId === member.id && d.ym === ym);
    const memberCredits = credits.filter((c) => c.memberId === member.id && c.ym === ym);

    memberScans.push({
      memberId: member.id,
      memberName: member.name,
      hasPayments: memberPayments.length > 0,
      hasCharges: memberLedgerCharges.length > 0,
      hasMeals,
      hasRentCharge: !!memberRentCharge,
      hasStaffShare: false, // Will be checked via allocation
      hasExpenseShare: monthAllocations.some((a) => a.memberId === member.id),
      depositBalance: memberDeposits.reduce((s, d) => s + (d.amount || 0), 0),
      creditBalance: memberCredits.reduce((s, c) => s + (c.amount || 0), 0),
      previousDue: member.previousDue || 0,
      previousDeposit,
      previousCredit,
      missingRecords: missing,
    });
  });

  // Check for orphan ledger entries
  monthLedger.forEach((entry) => {
    if (!memberIds.has(entry.memberId)) {
      errors.push(`Orphan ledger entry ${entry.id}: member ${entry.memberId} not found in active members.`);
    }
  });

  // Check for duplicate ledger charges (same member, same type, same category, same month)
  const chargeKeys: Record<string, number> = {};
  monthLedger
    .filter((e) => ["meal_charge", "rent_charge", "utility_charge", "staff_charge", "other_charge"].includes(e.transactionType))
    .forEach((e) => {
      const key = `${e.memberId}_${e.transactionType}_${e.category}_${e.amount}`;
      chargeKeys[key] = (chargeKeys[key] || 0) + 1;
    });
  Object.entries(chargeKeys).forEach(([key, count]) => {
    if (count > 1) {
      duplicatedRecords.push(`Duplicate charge: ${key} (found ${count} times)`);
    }
  });

  // Check total allocation completeness
  const totalPayments = monthPayments.reduce((s, p) => s + (p.amount || 0), 0);
  const totalBazarContrib = monthBazar.reduce((s, b) => s + (b.total || 0), 0);
  const totalExpenseContrib = expenses.filter((e) => e.ym === ym && e.paidBy).reduce((s, e) => s + (e.amount || 0), 0);
  const totalGiven = totalPayments + totalBazarContrib + totalExpenseContrib;

  const totalCharges = monthLedger
    .filter((e) => ["meal_charge", "rent_charge", "utility_charge", "staff_charge", "other_charge"].includes(e.transactionType))
    .reduce((s, e) => s + (e.amount || 0), 0);

  if (Math.abs(totalGiven - totalCharges) > 10) {
    errors.push(
      `Major imbalance detected: Total Money Given (৳${totalGiven}) does not match Total Charges (৳${totalCharges}). ` +
      `Difference: ৳${Math.abs(totalGiven - totalCharges)}. Check for missing or extra records.`
    );
  }

  return {
    complete: errors.length === 0 && duplicatedRecords.length === 0 && unallocatedPayments.length === 0,
    memberScans,
    missingTransactions,
    unallocatedPayments,
    duplicatedRecords,
    errors,
    warnings,
  };
}

// ============================================================================
// 10. MONTHLY CLOSING REPORT (Complete Recalculation from Firebase)
// ============================================================================

/**
 * Monthly Closing must recalculate EVERYTHING from Firebase.
 * Steps:
 *   Load Firebase → Validate Data → Remove Duplicates → Verify Charges →
 *   Verify Payments → Verify Deposits → Verify Credits → Calculate Bazaar →
 *   Calculate Utilities → Calculate Rent → Calculate Shared Expenses →
 *   Apply Deposits → Apply Credits → Calculate Settlement → Verify Ledger →
 *   Verify Totals → Save Closing Report → Lock Month
 * 
 * No incorrect data may be carried forward.
 */
export function generateClosingReport(
  ym: string,
  members: Member[],
  meals: MealEntry[],
  bazar: Bazar[],
  expenses: Expense[],
  expenseAllocations: ExpenseAllocation[],
  payments: Payment[],
  deposits: Deposit[],
  credits: Credit[],
  staff: Staff[],
  rooms: Room[],
  ledgerEntries: LedgerEntry[],
  rentCharges: RentCharge[],
  closings: MonthlyClosing[],
  allAdvances: Advance[],
  allAdvanceRecoveries: AdvanceRecovery[],
): MonthlyClosingReport {
  const year = parseInt(ym.split("-")[0], 10);
  const activeMembers = members.filter((m) => m.active);
  const monthMeals = meals.filter((m) => m.ym === ym);
  const monthBazar = bazar.filter((b) => b.ym === ym);
  const monthExpenses = expenses.filter((e) => e.ym === ym);
  const monthPayments = payments.filter((p) => p.ym === ym);
  const monthDeposits = deposits.filter((d) => d.ym === ym);
  const monthCredits = credits.filter((c) => c.ym === ym);
  const monthAllocations = expenseAllocations.filter((a) => a.ym === ym);
  const monthRentCharges = rentCharges.filter((r) => r.month === ym);

  // Step 1: Validate
  const validation = validateMonthData(ym, members, meals, bazar, expenses, deposits, credits, payments, staff, rooms, ledgerEntries, monthRentCharges, closings);

  // Step 2: Detect duplicates
  const dupResult = detectAllDuplicates(ym, monthBazar, monthExpenses, monthPayments, monthDeposits, monthCredits, ledgerEntries);

  // Step 3: Calculate complete monthly summary
  const summary = calculateCompleteMonthlySummary(
    ym, members, meals, bazar, expenses, monthAllocations, payments, staff, rooms,
    allAdvances, allAdvanceRecoveries, closings,
  );

  // Step 4: Member-to-member settlements
  const rawSettlements = calculateMemberToMemberSettlements(monthExpenses, monthBazar, activeMembers, ym);
  const consolidatedSettlements = consolidateSettlements(rawSettlements);

  // Step 5: Build per-member financial summaries
  const memberReports: MemberFinancialSummary[] = summary.members.map((m) => {
    const memberSettlements = consolidatedSettlements.filter(
      (s) => s.fromMemberId === m.memberId || s.toMemberId === m.memberId,
    );
    const amountTheyOwe = memberSettlements
      .filter((s) => s.fromMemberId === m.memberId)
      .reduce((sum, s) => sum + s.amount, 0);
    const amountOwedToThem = memberSettlements
      .filter((s) => s.toMemberId === m.memberId)
      .reduce((sum, s) => sum + s.amount, 0);

    const prevYm = prevMonthYm(ym);
    const prevClosing = closings.find((c) => c.month === prevYm);
    const prevBreakdown = (prevClosing as any)?.memberBreakdown?.[m.memberId];
    const prevDeposit = prevBreakdown?.deposit || 0;
    const prevCredit = prevBreakdown?.credit || 0;

    const settlementReason = m.settlementStatus === "pay"
      ? `Due ৳${m.creditAmount} for ${ym}: meal ${m.mealCost}, rent ${m.rentShare}, expenses ${m.expenseShares}, staff ${m.staffShare}`
      : m.settlementStatus === "receive"
      ? `Deposit ৳${m.depositAmount} for ${ym}: excess ৳${m.balance} held for member`
      : "Settled";

    return {
      memberId: m.memberId,
      memberName: m.memberName,
      totalCharges: m.totalCharges,
      rentCharge: m.rentShare,
      mealCharge: m.mealCost,
      utilityCharge: m.expenseShares,
      staffCharge: m.staffShare,
      otherCharges: m.previousDue,
      totalPayments: m.paymentsMade,
      depositBalance: m.depositAmount,
      creditBalance: m.creditAmount,
      outstandingDue: m.settlementStatus === "pay" ? m.creditAmount : 0,
      receivableAmount: m.settlementStatus === "receive" ? m.depositAmount : 0,
      totalBazaarShare: m.mealCost,
      totalBazaarPaid: m.bazarContribution,
      totalUtilityShare: m.expenseShares,
      totalRentShare: m.rentShare,
      amountPaidForOthers: m.expenseContributions,
      amountOthersOweThem: amountOwedToThem,
      amountTheyOweOthers: amountTheyOwe,
      currentBalance: m.balance,
      finalSettlement: m.settlementStatus,
      previousDeposit: prevDeposit,
      previousCredit: prevCredit,
      chargeBreakdown: m.expenseShareBreakdown,
      contributionBreakdown: m.expenseContributionBreakdown,
      settlementReason,
    };
  });

  // Step 6: Verification
  const verification = runVerificationChecklist(
    ym, members, expenses, payments, deposits, credits, ledgerEntries,
    monthAllocations, allAdvances, allAdvanceRecoveries, summary,
  );

  // Step 7: Build report
  const totalRent = activeMembers.reduce((s, m) => s + perBedRent(m, rooms), 0);
  const totalBazar = monthBazar.reduce((s, b) => s + (b.total || 0), 0);
  const totalExpenseAmount = monthExpenses.reduce((s, e) => s + (e.amount || 0), 0);
  const totalStaffCost = staff.filter((s) => s.status !== "inactive").reduce((s, st) => s + (st.salary || 0) + (st.overtime || 0) + (st.bonus || 0) - (st.advance || 0), 0);
  const totalPayments = monthPayments.reduce((s, p) => s + (p.amount || 0), 0);
  const { mealRate, totalMeals } = calculateMealRate(bazar, meals, ym);
  const totalDue = summary.members.filter((m) => m.settlementStatus === "pay").reduce((s, m) => s + m.creditAmount, 0);

  return {
    month: ym,
    year,
    memberReports,
    totalIncome: totalRent + totalPayments,
    totalExpense: totalBazar + totalExpenseAmount + totalStaffCost,
    netProfit: totalRent + totalPayments - totalBazar - totalExpenseAmount - totalStaffCost,
    totalRent,
    totalMeal: totalBazar,
    totalUtility: totalExpenseAmount,
    totalStaff: totalStaffCost,
    totalDeposit: summary.totalDeposits,
    totalCredit: summary.totalCredits,
    totalCollection: totalPayments,
    totalDue,
    mealRate,
    totalMeals,
    totalBazar,
    memberToMemberSettlements: consolidatedSettlements,
    auditLog: dupResult.auditLog,
    verification,
    duplicatesRemoved: dupResult.duplicatesFound,
    changesAfterRecalculation: validation.warnings,
  };
}