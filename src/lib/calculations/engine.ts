/**
 * Centralized Financial Calculation Engine
 * Single source of truth for ALL financial calculations in the Mess ERP system.
 *
 * CRITICAL ACCOUNTING RULES:
 * 1. Total Contribution = Bazar Paid + Expense Contributions + Payments Made
 * 2. Total Charges = Meal Cost + Rent Share + Utility Shares + Staff Share + Other Charges + Previous Credit - Previous Deposit
 * 3. Net Balance = Total Contributions - Total Charges
 * 4. If Net Balance > 0 → Deposit = Net Balance, Credit = 0, Status = Receive from Mess
 * 5. If Net Balance < 0 → Credit = ABS(Net Balance), Deposit = 0, Status = Pay to Mess
 * 6. If Net Balance = 0 → Deposit = 0, Credit = 0, Status = Settled
 * 7. A member can NEVER have Deposit > 0 AND Credit > 0 simultaneously
 * 8. Payments are counted as Contributions (money member paid directly to the mess)
 * 9. No manual Deposit or Credit creation allowed - they are auto-computed from settlement
 * 10. Carry forward: Previous month Deposit → Next month Previous Deposit
 *     Previous month Credit → Next month Previous Credit
 */

import type {
  Member,
  MealEntry,
  Bazar,
  Utility,
  Deposit,
  Credit,
  Payment,
  LedgerEntry,
  Staff,
  Room,
  RentCharge,
  UtilityAllocation,
  StaffAllocation,
  MonthlyClosing,
  Expense,
  ExpenseAllocation,
  ExpenseCategory,
} from "@/lib/types";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/types";

// ============================================================================
// Core Types
// ============================================================================

export interface MealRateInfo {
  totalBazar: number;
  totalMeals: number;
  mealRate: number;
}

export interface MemberMealInfo {
  memberId: string;
  memberName: string;
  totalMeals: number;
  mealRate: number;
  mealCost: number;
}

/**
 * Unified Contribution Breakdown for a member
 *
 * Total Contributions = Bazar Paid + Expense Contributions (bills paid) + Payments Made
 */
export interface MemberContributions {
  // Bazar paid by this member
  bazarContribution: number;
  bazarEntries: { buyer: string; amount: number }[];
  // Expense/Utility payments made by member on behalf of mess (electricity, internet, etc.)
  expenseContributions: number;
  expenseBreakdown: Record<string, number>;
  expenseEntries: { category: string; paidBy: string; amount: number }[];
  // Payments made directly to mess (these ARE contributions)
  // Includes ALL payments - rent, meals, utilities, etc.
  paymentsMade: number;
  // Rent paid (via payment category or notes)
  rentPaid: number;
  // Meal payments
  mealPaid: number;
  // Utility payments
  utilityPaid: number;
  // Total of all contributions
  totalContribution: number;
}

/**
 * Unified Charge Breakdown for a member
 *
 * Total Charges = Meal Cost + Rent Share + Expense Shares + Staff Share + Previous Credit - Previous Deposit
 */
export interface MemberCharges {
  mealCost: number;
  rentShare: number;
  expenseShares: number;
  expenseShareBreakdown: Record<string, number>;
  staffShare: number;
  previousDue: number;
  previousDeposit: number;
  previousCredit: number;
  totalCharges: number;
  // Breakdown of what makes up the charges for display
  chargeBreakdown: {
    meal: number;
    rent: number;
    utilities: number;
    staff: number;
    previousDue: number;
    previousCredit: number;
    previousDeposit: number;
  };
}

export interface MemberSettlement {
  memberId: string;
  memberName: string;
  // Meal info
  totalMeals: number;
  mealRate: number;
  // Contributions
  contributions: MemberContributions;
  // Charges
  charges: MemberCharges;
  // Legacy fields for backward compatibility
  mealCost: number;
  totalBazarPaid: number;
  totalDeposit: number; // Auto-computed: positive balance
  totalCredit: number;  // Auto-computed: negative balance
  totalPayment: number;
  balance: number;
  payableAmount: number;
  receivableAmount: number;
  settlementStatus: "pay" | "receive" | "settled";
  lastTransactionDate?: string;
  // Carry forward values
  carryForwardDeposit: number;
  carryForwardCredit: number;
  // Detailed breakdown for UI display
  creditReason: string | undefined;
  depositSource: string | undefined;
}

export interface MonthlySummary {
  ym: string;
  totalMeals: number;
  totalBazar: number;
  totalUtilities: number;
  totalRent: number;
  totalStaffCost: number;
  totalPreviousDue: number;
  totalExpense: number;
  mealRate: number;
  utilityPerMember: number;
  staffCostPerMember: number;
  totalDeposits: number;
  totalCredits: number;
  totalPayments: number;
  cashBalance: number;
  vacantBeds: number;
  occupiedBeds: number;
  perMember: PerMemberSummary[];
  settlements: MemberSettlement[];
  settlementSummary: SettlementSummary;
}

export interface PerMemberSummary {
  memberId: string;
  memberName: string;
  meals: number;
  mealCost: number;
  utilityShare: number;
  rentShare: number;
  staffShare: number;
  previousDue: number;
  previousDeposit: number;
  previousCredit: number;
  totalDue: number;
  deposited: number; // Auto-computed deposit
  credited: number;  // Auto-computed credit
  paid: number;
  balance: number;
  settlementStatus: "pay" | "receive" | "settled";
  payableAmount: number;
  receivableAmount: number;
  // New unified fields
  totalCharges: number;
  totalContributions: number;
  expenseShares: Record<string, number>;
  expenseContributions: Record<string, number>;
  carryForwardDeposit: number;
  carryForwardCredit: number;
  // Detailed breakdown for UI
  creditReason: string | undefined;
  depositSource: string | undefined;
}

export interface SettlementSummary {
  totalMeals: number;
  totalBazar: number;
  totalMealCost: number;
  totalBazarPaid: number;
  totalDeposits: number;
  totalCredits: number;
  totalPayments: number;
  totalPayable: number;
  totalReceivable: number;
  totalBalance: number;
  membersToPay: MemberSettlement[];
  membersToReceive: MemberSettlement[];
  settledMembers: MemberSettlement[];
}

export interface LedgerStatement {
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
  transactions: LedgerTransaction[];
}

export interface LedgerTransaction {
  date: string;
  transactionType: string;
  category: string;
  amount: number;
  balance: number;
  notes?: string;
}

export interface MonthlyClosingData {
  month: string;
  year: number;
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
  closedBy: string;
  closedByName: string;
  status: "open" | "closed";
}

// ============================================================================
// Service Type Mappings (Single Source of Truth)
// ============================================================================

const UTILITY_SERVICE_MAP: Record<string, string> = {
  electricity: "electricity",
  internet: "internet",
  gas: "gas",
  water: "water",
  generator: "generator",
  maintenance: "maintenance",
};

const STAFF_SERVICE_MAP: Record<string, string> = {
  cook: "cooking_staff",
  cleaner: "cleaning_staff",
  security: "security_staff",
  helper: "other_services",
  accountant: "other_services",
  manager: "other_services",
};

// ============================================================================
// Helper Functions
// ============================================================================

function isMemberSubscribedToService(member: Member, serviceType: string): boolean {
  if (!member.services) return false;
  return member.services.some((s) => s.type === serviceType && s.enabled);
}

function getPerBedRent(member: Member, rooms: Room[]): number {
  if (!member.roomId) return 0;
  const room = rooms.find((r) => r.id === member.roomId);
  if (!room || !room.totalBeds) return 0;
  return room.monthlyRent / room.totalBeds;
}

function getMemberMealsCount(memberId: string, monthMeals: MealEntry[]): number {
  return monthMeals
    .filter((m) => m.memberId === memberId)
    .reduce((sum, m) => sum + (m.breakfast || 0) + (m.lunch || 0) + (m.dinner || 0) + (m.guest || 0), 0);
}

function getMemberBazarPaid(memberId: string, monthBazar: Bazar[]): number {
  return monthBazar
    .filter((b) => b.buyerId === memberId)
    .reduce((sum, b) => sum + (b.total || 0), 0);
}

function getMemberDeposits(memberId: string, monthDeposits: Deposit[]): number {
  return monthDeposits
    .filter((d) => d.memberId === memberId)
    .reduce((sum, d) => sum + (d.amount || 0), 0);
}

function getMemberCredits(memberId: string, monthCredits: Credit[]): number {
  return monthCredits
    .filter((c) => c.memberId === memberId)
    .reduce((sum, c) => sum + (c.amount || 0), 0);
}

function getMemberPayments(memberId: string, monthPayments: Payment[]): number {
  return monthPayments
    .filter((p) => p.memberId === memberId)
    .reduce((sum, p) => sum + (p.amount || 0), 0);
}

/**
 * Build a detailed credit reason string showing exactly why a member owes money
 * and what specific expenses they haven't fully paid for.
 */
function buildCreditReason(
  contributions: MemberContributions,
  charges: MemberCharges,
  balance: number,
): string | undefined {
  if (balance >= 0) return undefined;

  const reasons: string[] = [];
  const absBalance = Math.abs(balance);

  // Meal shortfall
  const mealShortfall = charges.mealCost - contributions.bazarContribution - contributions.mealPaid;
  if (mealShortfall > 0.01 && contributions.bazarEntries.length > 0) {
    const bazarNames = contributions.bazarEntries.map((e) => `${e.buyer}(${bdt(e.amount)})`).join(", ");
    reasons.push(`Meals: ${bdt(mealShortfall)} short · bazar paid by [${bazarNames}]`);
  } else if (mealShortfall > 0.01) {
    reasons.push(`Meals: ${bdt(mealShortfall)} short`);
  }

  // Rent shortfall
  const rentShortfall = charges.rentShare - contributions.rentPaid;
  if (rentShortfall > 0.01) {
    reasons.push(`Rent: ${bdt(rentShortfall)} short`);
  }

  // Utility/expense shortfall
  const utilityShortfall = charges.expenseShares - contributions.expenseContributions - contributions.utilityPaid;
  if (utilityShortfall > 0.01 && contributions.expenseEntries.length > 0) {
    const expNames = contributions.expenseEntries.map((e) => `${e.paidBy}((${EXPENSE_CATEGORY_LABELS[e.category as keyof typeof EXPENSE_CATEGORY_LABELS] || e.category}) ৳${bdt(e.amount)})`).join(", ");
    reasons.push(`Utilities: ${bdt(utilityShortfall)} short · bills paid by [${expNames}]`);
  } else if (utilityShortfall > 0.01) {
    reasons.push(`Utilities: ${bdt(utilityShortfall)} short`);
  }

  // Staff shortfall
  const staffShortfall = charges.staffShare;
  if (staffShortfall > 0.01) {
    reasons.push(`Staff: ${bdt(staffShortfall)} share`);
  }

  // Previous due
  if (charges.previousDue > 0.01) {
    reasons.push(`Previous due: ${bdt(charges.previousDue)}`);
  }

  // Previous credit carried forward
  if (charges.previousCredit > 0.01) {
    reasons.push(`Previous credit: ${bdt(charges.previousCredit)}`);
  }

  if (reasons.length === 0) {
    return `Owes ${bdt(absBalance)} to mess`;
  }

  return reasons.join("; ");
}

/**
 * Build a detailed deposit source string showing exactly why a member has a deposit
 * and what specific contributions exceeded their charges.
 */
function buildDepositSource(
  contributions: MemberContributions,
  charges: MemberCharges,
  balance: number,
): string | undefined {
  if (balance <= 0) return undefined;

  const sources: string[] = [];
  const absBalance = balance;

  // Bazar excess
  const bazarExcess = contributions.bazarContribution - charges.mealCost;
  if (bazarExcess > 0.01) {
    sources.push(`Bazar: ${bdt(contributions.bazarContribution)} paid, meals cost ${bdt(charges.mealCost)} (excess ${bdt(bazarExcess)})`);
  }

  // Rent excess
  const rentExcess = contributions.rentPaid - charges.rentShare;
  if (rentExcess > 0.01) {
    sources.push(`Rent: ${bdt(contributions.rentPaid)} paid, share ${bdt(charges.rentShare)} (excess ${bdt(rentExcess)})`);
  }

  // Utility excess
  const utilityExcess = contributions.utilityPaid + contributions.expenseContributions - charges.expenseShares;
  if (utilityExcess > 0.01) {
    sources.push(`Utilities: ${bdt(contributions.utilityPaid + contributions.expenseContributions)} paid, share ${bdt(charges.expenseShares)} (excess ${bdt(utilityExcess)})`);
  }

  // Meal payments excess
  const mealExcess = contributions.mealPaid;
  if (mealExcess > 0.01) {
    sources.push(`Meal payments: ${bdt(mealExcess)}`);
  }

  // General payments excess
  const otherPayments = contributions.paymentsMade - contributions.rentPaid - contributions.mealPaid - contributions.utilityPaid;
  if (otherPayments > 0.01) {
    sources.push(`Other payments: ${bdt(otherPayments)}`);
  }

  // Previous deposit carried forward
  if (charges.previousDeposit > 0.01) {
    sources.push(`Previous deposit: ${bdt(charges.previousDeposit)}`);
  }

  if (sources.length === 0) {
    return `Overpaid ${bdt(absBalance)}`;
  }

  return sources.join("; ");
}

// Helper for bdt formatting in reason strings (reuse from format module)
function bdt(amount: number): string {
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// ============================================================================
// Carry Forward Logic
// ============================================================================

/**
 * Get the previous month's closing data to carry forward deposits and credits.
 */
export function getPreviousMonthBalances(
  memberId: string,
  ym: string,
  prevClosings: Array<{ month: string; memberId: string; deposit: number; credit: number }>,
): { previousDeposit: number; previousCredit: number } {
  // Calculate previous month YYYY-MM
  const [year, month] = ym.split("-").map(Number);
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const prevYm = `${prevYear}-${String(prevMonth).padStart(2, "0")}`;

  // Find previous month closing record for this member
  const prevClosing = prevClosings.find((c) => c.month === prevYm && c.memberId === memberId);

  return {
    previousDeposit: prevClosing?.deposit || 0,
    previousCredit: prevClosing?.credit || 0,
  };
}

// ============================================================================
// Unified Contribution & Charge Calculations
// ============================================================================

/**
 * Calculate a member's total contributions across ALL expense types.
 *
 * PER THE REQUIREMENTS:
 * Total Contributions = Bazar Paid + Rent Paid + Utility Paid + Other Shared Expenses Paid + Payments Made
 *
 * Payments Made directly to the mess ARE contributions.
 */
export function calculateMemberContributions(
  memberId: string,
  memberName: string,
  monthBazar: Bazar[],
  monthExpenses: Expense[],
  monthPayments: Payment[],
): MemberContributions {
  // 1. Bazar contributions (money the member spent on bazar)
  const bazarEntries: { buyer: string; amount: number }[] = [];
  const bazarContribution = getMemberBazarPaid(memberId, monthBazar);
  monthBazar.forEach((b) => {
    if (b.buyerId === memberId) {
      const buyerLabel = b.buyerName || memberName;
      bazarEntries.push({ buyer: buyerLabel, amount: b.total || 0 });
    }
  });

  // 2. Expense contributions - when a member pays an expense bill on behalf of the mess
  const expenseBreakdown: Record<string, number> = {};
  const expenseEntries: { category: string; paidBy: string; amount: number }[] = [];
  let expenseContributions = 0;

  monthExpenses.forEach((expense) => {
    if (expense.paidBy === memberId) {
      const cat = expense.category;
      expenseBreakdown[cat] = (expenseBreakdown[cat] || 0) + (expense.amount || 0);
      expenseContributions += expense.amount || 0;
      const payerLabel = expense.paidByName || memberName;
      expenseEntries.push({ category: cat, paidBy: payerLabel, amount: expense.amount || 0 });
    }
  });

  // 3. All payments made by the member ARE contributions
  // This includes rent, meals, utilities, and any other payments
  const allPayments = monthPayments.filter((p) => p.memberId === memberId);
  const paymentsMade = allPayments.reduce((sum, p) => sum + (p.amount || 0), 0);

  // 4. Categorize payments by type for detailed breakdown
  let rentPaid = 0;
  let mealPaid = 0;
  let utilityPaid = 0;

  allPayments.forEach((payment) => {
    const cat = (payment.category || "").toLowerCase();
    const notes = (payment.notes || "").toLowerCase();
    const amount = payment.amount || 0;

    if (cat === "rent" || notes.includes("rent")) {
      rentPaid += amount;
    } else if (cat === "meal" || notes.includes("meal")) {
      mealPaid += amount;
    } else if (["internet", "electricity", "gas", "water", "generator", "utility"].includes(cat) ||
               notes.includes("internet") || notes.includes("electricity") || notes.includes("gas") ||
               notes.includes("water") || notes.includes("utility")) {
      utilityPaid += amount;
    }
  });

  // Total = Bazar + Expense Contributions (bills paid) + Payments Made (direct payments to mess)
  const totalContribution = bazarContribution + expenseContributions + paymentsMade;

  return {
    bazarContribution,
    bazarEntries,
    expenseContributions,
    expenseBreakdown,
    expenseEntries,
    paymentsMade,
    rentPaid,
    mealPaid,
    utilityPaid,
    totalContribution,
  };
}

/**
 * Round a number to 2 decimal places to avoid floating point precision issues
 * This ensures all monetary values are clean decimals, not floats
 */
function roundToTwoDecimals(value: number): number {
  return Math.round((value || 0) * 100) / 100;
}

/**
 * Calculate a member's total charges for a month.
 *
 * PER THE REQUIREMENTS:
 * Total Charges = Meal Cost + Rent Share + Utility Shares + Staff Share + Other Charges + Previous Credit - Previous Deposit
 *
 * Previous Credit (what member owed from last month) ADDS to charges.
 * Previous Deposit (what member overpaid from last month) SUBTRACTS from charges.
 */
export function calculateMemberCharges(
  member: Member,
  mealRate: number,
  monthMeals: MealEntry[],
  monthExpenses: Expense[],
  activeMembers: Member[],
  rooms: Room[],
  staff: Staff[],
  _monthPayments: Payment[],
  previousDeposit: number = 0,
  previousCredit: number = 0,
  monthAllocations: ExpenseAllocation[] = [],
): MemberCharges {
  const totalMeals = getMemberMealsCount(member.id, monthMeals);
  const mealCost = roundToTwoDecimals(totalMeals * mealRate);
  const rentShare = roundToTwoDecimals(getPerBedRent(member, rooms));

  // Expense shares - prefer using persisted allocations if available
  let expenseShareBreakdown: Record<string, number> = {};
  let expenseShares = 0;

  if (monthAllocations.length > 0) {
    // Use persisted expense allocations (preferred method)
    const allocResult = calculateMemberChargesFromAllocations(member.id, monthAllocations);
    expenseShareBreakdown = allocResult.expenseShareBreakdown;
    expenseShares = allocResult.expenseShares;
  } else {
    // Fallback: calculate on-the-fly from expenses
    monthExpenses.forEach((expense) => {
      const serviceType = getServiceTypeForExpenseCategory(expense.category);
      let memberShare = 0;

      if (serviceType) {
        const subscribers = activeMembers.filter((m) => isMemberSubscribedToService(m, serviceType)).length || 1;
        if (isMemberSubscribedToService(member, serviceType)) {
          memberShare = (expense.amount || 0) / subscribers;
        }
      } else {
        memberShare = (expense.amount || 0) / (activeMembers.length || 1);
      }

      if (memberShare > 0) {
        expenseShareBreakdown[expense.category] = roundToTwoDecimals((expenseShareBreakdown[expense.category] || 0) + memberShare);
        expenseShares += memberShare;
      }
    });
  }

  // Staff share
  let staffShare = 0;
  staff.filter((s) => s.status !== "inactive").forEach((s) => {
    const serviceType = STAFF_SERVICE_MAP[s.role] || "other_services";
    const subscribers = activeMembers.filter((m) => isMemberSubscribedToService(m, serviceType)).length || 1;
    if (isMemberSubscribedToService(member, serviceType)) {
      staffShare += (s.salary || 0) / subscribers;
    }
  });

  const previousDue = member.previousDue || 0;

  // Round all values to 2 decimal places to avoid floating point precision issues
  const roundedExpenseShares = roundToTwoDecimals(expenseShares);
  const roundedStaffShare = roundToTwoDecimals(staffShare);
  const roundedPreviousDeposit = roundToTwoDecimals(previousDeposit);
  const roundedPreviousCredit = roundToTwoDecimals(previousCredit);

  // Total Charges = Meal Cost + Rent + Expense Shares + Staff Share + Previous Due + Previous Credit - Previous Deposit
  // Previous Credit: debt carried forward from last month (adds to current charges)
  // Previous Deposit: overpayment carried forward from last month (subtracts from current charges)
  // This follows the PAYMENT APPLICATION ORDER:
  //   1. Previous Credit is reduced first
  //   2. Current Month Charges are paid next
  //   3. Excess becomes Deposit
  const totalCharges = roundToTwoDecimals(mealCost + rentShare + roundedExpenseShares + roundedStaffShare + previousDue + roundedPreviousCredit - roundedPreviousDeposit);

  return {
    mealCost,
    rentShare,
    expenseShares: roundedExpenseShares,
    expenseShareBreakdown,
    staffShare: roundedStaffShare,
    previousDue,
    previousDeposit: roundedPreviousDeposit,
    previousCredit: roundedPreviousCredit,
    totalCharges,
    chargeBreakdown: {
      meal: mealCost,
      rent: rentShare,
      utilities: roundedExpenseShares,
      staff: roundedStaffShare,
      previousDue,
      previousCredit: roundedPreviousCredit,
      previousDeposit: roundedPreviousDeposit,
      },
    };
  }

/**
 * Calculate member charges from expense allocations (preferred method)
 * This uses the persisted expense_allocations collection for accurate tracking
 * 
 * CRITICAL: This is the correct way to calculate member charges for shared expenses.
 * Each expense allocation represents a member's share of an expense.
 */
export function calculateMemberChargesFromAllocations(
  memberId: string,
  monthAllocations: ExpenseAllocation[],
): { expenseShares: number; expenseShareBreakdown: Record<string, number> } {
  const expenseShareBreakdown: Record<string, number> = {};
  let expenseShares = 0;

  monthAllocations
    .filter((alloc) => alloc.memberId === memberId)
    .forEach((alloc) => {
      expenseShareBreakdown[alloc.category] = (expenseShareBreakdown[alloc.category] || 0) + (alloc.amount || 0);
      expenseShares += alloc.amount || 0;
    });

  return { expenseShares, expenseShareBreakdown };
}

function getServiceTypeForExpenseCategory(category: ExpenseCategory): string | null {
  const mapping: Record<string, string> = {
    house_rent: "rent",
    electricity: "electricity",
    water: "water",
    gas: "gas",
    internet: "internet",
    generator: "generator",
    cleaner_salary: "cleaning_staff",
    security_salary: "security_staff",
    maintenance: "maintenance",
    repair: "maintenance",
    garbage: "other_services",
    wifi_equipment: "internet",
    kitchen: "other_services",
    furniture: "other_services",
    appliance: "other_services",
    other_shared: "other_services",
  };
  return mapping[category] || null;
}

// ============================================================================
// Core Calculation Functions
// ============================================================================

/**
 * Calculate meal rate for a given month
 * Formula: Total Bazar Amount / Total Meals
 */
export function calculateMealRate(bazarEntries: Bazar[], mealEntries: MealEntry[], ym: string): MealRateInfo {
  const monthBazar = bazarEntries.filter((b) => b.ym === ym);
  const monthMeals = mealEntries.filter((m) => m.ym === ym);

  const totalBazar = monthBazar.reduce((sum, b) => sum + (b.total || 0), 0);
  const totalMeals = monthMeals.reduce(
    (sum, m) => sum + (m.breakfast || 0) + (m.lunch || 0) + (m.dinner || 0) + (m.guest || 0),
    0
  );

  const mealRate = totalMeals > 0 ? totalBazar / totalMeals : 0;

  return { totalBazar, totalMeals, mealRate };
}

/**
 * Calculate member settlement for a given month
 *
 * CORRECTED FORMULA:
 *   Total Contributions = Bazar Paid + Expense Contributions + Payments Made
 *   Total Charges = Meal Cost + Rent Share + Expense Shares + Staff Share + Previous Due + Previous Credit - Previous Deposit
 *   Net Balance = Total Contributions - Total Charges
 *
 *   If Net Balance > 0 → Deposit = Net Balance, Credit = 0, Receive from Mess
 *   If Net Balance < 0 → Credit = ABS(Net Balance), Deposit = 0, Pay to Mess
 *   If Net Balance = 0 → Deposit = 0, Credit = 0, Settled
 *
 *   A member can NEVER have both Deposit > 0 AND Credit > 0.
 */
export function calculateMemberSettlement(
  member: Member,
  ym: string,
  mealEntries: MealEntry[],
  bazarEntries: Bazar[],
  deposits: Deposit[],
  credits: Credit[],
  payments: Payment[],
  ledgerEntries: LedgerEntry[] = [],
  monthExpenses: Expense[] = [],
  activeMembers: Member[] = [],
  rooms: Room[] = [],
  staff: Staff[] = [],
  prevClosings: Array<{ month: string; memberId: string; deposit: number; credit: number }> = [],
  monthAllocations: ExpenseAllocation[] = [],
): MemberSettlement {
  const monthMeals = mealEntries.filter((m) => m.ym === ym);
  const monthBazar = bazarEntries.filter((b) => b.ym === ym);
  const monthDeposits = deposits.filter((d) => d.ym === ym);
  const monthCredits = credits.filter((c) => c.ym === ym);
  const monthPayments = payments.filter((p) => p.ym === ym);
  const allActiveMembers = activeMembers.length > 0 ? activeMembers : [member];

  const { mealRate, totalBazar } = calculateMealRate(bazarEntries, mealEntries, ym);
  const totalMeals = getMemberMealsCount(member.id, monthMeals);
  const mealCost = roundToTwoDecimals(totalMeals * mealRate);
  const totalBazarPaid = getMemberBazarPaid(member.id, monthBazar);

  // Get carry forward balances from previous month
  const { previousDeposit, previousCredit } = getPreviousMonthBalances(member.id, ym, prevClosings);

  // Unified Contribution Formula: Bazar + Expense Contributions + Payments Made
  const contributions = calculateMemberContributions(
    member.id,
    member.name,
    monthBazar,
    monthExpenses,
    monthPayments,
  );

  // Unified Charge Formula with carry forward
  // Pass monthAllocations to use persisted allocations if available
  const charges = calculateMemberCharges(
    member,
    mealRate,
    monthMeals,
    monthExpenses,
    allActiveMembers,
    rooms,
    staff,
    monthPayments,
    previousDeposit,
    previousCredit,
    monthAllocations,
  );

  // CORRECTED: Net Balance = Total Contributions - Total Charges
  // The formula handles payment application order automatically:
  // - Previous Credit increases charges (member owes from last month)
  // - Previous Deposit decreases charges (member overpaid last month)
  // - Payments increase contributions (member pays now)
  // Net result: Payment first reduces credit, then reduces charges, then becomes deposit
  const balance = roundToTwoDecimals(contributions.totalContribution - charges.totalCharges);

  // Determine Deposit and Credit (auto-computed from balance)
  // A member can NEVER have both > 0
  let totalDeposit = 0;
  let totalCredit = 0;

  if (balance > 0) {
    totalDeposit = balance; // Deposit = positive balance (member overpaid)
    totalCredit = 0;
  } else if (balance < 0) {
    totalCredit = Math.abs(balance); // Credit = negative balance (member owes)
    totalDeposit = 0;
  }
  // If balance === 0, both are 0 (Settled)

  const payableAmount = totalCredit; // What member needs to pay
  const receivableAmount = totalDeposit; // What mess needs to give back

  let settlementStatus: "pay" | "receive" | "settled" = "settled";
  if (balance < 0) {
    settlementStatus = "pay";
  } else if (balance > 0) {
    settlementStatus = "receive";
  }

  const memberLedgers = ledgerEntries
    .filter((e) => e.memberId === member.id)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  const lastTransactionDate = memberLedgers.length > 0 ? memberLedgers[0].date : undefined;

  // Build detailed reason/source strings for UI
  const creditReason = buildCreditReason(contributions, charges, balance);
  const depositSource = buildDepositSource(contributions, charges, balance);

  return {
    memberId: member.id,
    memberName: member.name,
    totalMeals,
    mealRate,
    mealCost,
    totalBazarPaid,
    totalDeposit,
    totalCredit,
    totalPayment: getMemberPayments(member.id, monthPayments),
    contributions,
    charges,
    balance,
    payableAmount,
    receivableAmount,
    settlementStatus,
    lastTransactionDate,
    carryForwardDeposit: totalDeposit,
    carryForwardCredit: totalCredit,
    creditReason,
    depositSource,
  };
}

/**
 * Calculate all members' settlements for a given month
 */
export function calculateAllSettlements(
  members: Member[],
  ym: string,
  mealEntries: MealEntry[],
  bazarEntries: Bazar[],
  deposits: Deposit[],
  credits: Credit[],
  payments: Payment[],
  ledgerEntries: LedgerEntry[] = [],
  monthExpenses: Expense[] = [],
  rooms: Room[] = [],
  staff: Staff[] = [],
  prevClosings: Array<{ month: string; memberId: string; deposit: number; credit: number }> = [],
  monthAllocations: ExpenseAllocation[] = [],
): MemberSettlement[] {
  const activeMembers = members.filter((m) => m.active);

  return activeMembers
    .map((member) =>
      calculateMemberSettlement(
        member,
        ym,
        mealEntries,
        bazarEntries,
        deposits,
        credits,
        payments,
        ledgerEntries,
        monthExpenses,
        activeMembers,
        rooms,
        staff,
        prevClosings,
        monthAllocations,
      )
    )
    .sort((a, b) => a.memberName.localeCompare(b.memberName));
}

/**
 * Get settlement summary statistics
 */
export function getSettlementSummary(settlements: MemberSettlement[]): SettlementSummary {
  const membersToPay = settlements.filter((s) => s.settlementStatus === "pay");
  const membersToReceive = settlements.filter((s) => s.settlementStatus === "receive");
  const settledMembers = settlements.filter((s) => s.settlementStatus === "settled");

  return {
    totalMeals: settlements.reduce((sum, s) => sum + s.totalMeals, 0),
    totalBazar: settlements.reduce((sum, s) => sum + s.totalBazarPaid, 0),
    totalMealCost: settlements.reduce((sum, s) => sum + s.mealCost, 0),
    totalBazarPaid: settlements.reduce((sum, s) => sum + s.totalBazarPaid, 0),
    totalDeposits: settlements.reduce((sum, s) => sum + s.totalDeposit, 0),
    totalCredits: settlements.reduce((sum, s) => sum + s.totalCredit, 0),
    totalPayments: settlements.reduce((sum, s) => sum + s.totalPayment, 0),
    totalPayable: settlements.reduce((sum, s) => sum + s.payableAmount, 0),
    totalReceivable: settlements.reduce((sum, s) => sum + s.receivableAmount, 0),
    totalBalance: settlements.reduce((sum, s) => sum + s.balance, 0),
    membersToPay: membersToPay.sort((a, b) => b.payableAmount - a.payableAmount),
    membersToReceive: membersToReceive.sort((a, b) => b.receivableAmount - a.receivableAmount),
    settledMembers: settledMembers.sort((a, b) => a.memberName.localeCompare(b.memberName)),
  };
}

/**
 * Compute complete monthly summary - THE central function for all monthly data
 */
export function computeMonthlySummary(
  ym: string,
  members: Member[],
  meals: MealEntry[],
  bazar: Bazar[],
  _utilities: Utility[] | Expense[],
  deposits: Deposit[],
  credits: Credit[],
  payments: Payment[],
  staff: Staff[] = [],
  rooms: Room[] = [],
  ledgerEntries: LedgerEntry[] = [],
  monthExpenses: Expense[] = [],
  prevClosings: Array<{ month: string; memberId: string; deposit: number; credit: number }> = [],
  monthAllocations: ExpenseAllocation[] = [],
): MonthlySummary {
  const monthMeals = meals.filter((m) => m.ym === ym);
  const monthBazar = bazar.filter((b) => b.ym === ym);
  const monthDeposits = deposits.filter((d) => d.ym === ym);
  const monthCredits = credits.filter((c) => c.ym === ym);
  const monthPayments = payments.filter((p) => p.ym === ym);
  const activeMembers = members.filter((m) => m.active);

  // Use expenses directly if provided, otherwise convert from utilities
  const monthExps: Expense[] = monthExpenses.length > 0
    ? monthExpenses
    : (_utilities as (Utility | Expense)[]).filter((u) => {
        // Only filter if it's a Utility type (has .type property) or Expense type (has .category property)
        return u && (u as any).ym === ym;
      }).map((u) => {
        // Check if it's actually a Utility (has .type) or already an Expense (has .category)
        if ((u as Expense).category) {
          // Already an Expense - return as-is
          return u as Expense;
        }
        // Legacy Utility - convert
        return convertUtilityToExpense(u as Utility);
      });

  const totalBazar = monthBazar.reduce((s, b) => s + (b.total || 0), 0);
  const totalMeals = monthMeals.reduce(
    (s, m) => s + (m.breakfast || 0) + (m.lunch || 0) + (m.dinner || 0) + (m.guest || 0),
    0
  );
  const mealRate = totalMeals > 0 ? totalBazar / totalMeals : 0;
  const totalExpenseAmount = monthExps.reduce((s, e) => s + (e.amount || 0), 0);
  const totalStaffCost = staff
    .filter((s) => s.status !== "inactive")
    .reduce((sum, item) => sum + (item.salary || 0) + (item.overtime || 0) + (item.bonus || 0) - (item.advance || 0), 0);
  const totalDeposits = monthDeposits.reduce((s, d) => s + (d.amount || 0), 0);
  const totalCredits = monthCredits.reduce((s, c) => s + (c.amount || 0), 0);
  const totalPayments = monthPayments.reduce((s, p) => s + (p.amount || 0), 0);

  const totalRent = activeMembers.reduce((sum, m) => sum + getPerBedRent(m, rooms), 0);
  const totalPreviousDue = activeMembers.reduce((sum, m) => sum + (m.previousDue || 0), 0);

  const occupiedBeds = activeMembers.filter((m) => m.roomId || m.roomName || m.bedNo).length;
  const totalBeds = rooms.reduce((sum, r) => sum + (r.totalBeds || 0), 0);
  const vacantBeds = Math.max(0, totalBeds - occupiedBeds);

  const settlements = calculateAllSettlements(
    activeMembers,
    ym,
    monthMeals,
    monthBazar,
    monthDeposits,
    monthCredits,
    monthPayments,
    ledgerEntries,
    monthExps,
    rooms,
    staff,
    prevClosings,
    monthAllocations,
  );

  const settlementSummary = getSettlementSummary(settlements);

    const perMember: PerMemberSummary[] = activeMembers.map((m) => {
    const settlement = settlements.find((s) => s.memberId === m.id)!;

    // Use values directly from settlement to ensure consistency (single source of truth)
    const previousDue = m.previousDue || 0;

    // totalDue = gross charges for this month ONLY (before carry-forward adjustments)
    // This is what the member owes for current month before previous deposit/credit offset
    const totalDue = settlement.mealCost + settlement.charges.expenseShares + settlement.charges.rentShare + settlement.charges.staffShare + previousDue;

    return {
      memberId: m.id,
      memberName: m.name,
      meals: settlement.totalMeals,
      mealCost: settlement.mealCost,
      utilityShare: settlement.charges.expenseShares,
      rentShare: settlement.charges.rentShare,
      staffShare: settlement.charges.staffShare,
      previousDue,
      previousDeposit: settlement.charges.previousDeposit,
      previousCredit: settlement.charges.previousCredit,
      totalDue,
      deposited: settlement.totalDeposit,
      credited: settlement.totalCredit,
      paid: settlement.totalPayment,
      balance: settlement.balance,
      settlementStatus: settlement.settlementStatus,
      payableAmount: settlement.payableAmount,
      receivableAmount: settlement.receivableAmount,
      totalCharges: settlement.charges.totalCharges,
      totalContributions: settlement.contributions.totalContribution,
      expenseShares: settlement.charges.expenseShareBreakdown,
      expenseContributions: settlement.contributions.expenseBreakdown,
      carryForwardDeposit: settlement.carryForwardDeposit,
      carryForwardCredit: settlement.carryForwardCredit,
      creditReason: settlement.creditReason,
      depositSource: settlement.depositSource,
    };
  });

  const totalExpense = totalBazar + totalExpenseAmount + totalStaffCost;

  return {
    ym,
    totalMeals,
    totalBazar,
    totalUtilities: totalExpenseAmount,
    totalRent,
    totalStaffCost,
    totalPreviousDue,
    totalExpense,
    mealRate,
    utilityPerMember: totalExpenseAmount / (activeMembers.length || 1),
    staffCostPerMember: totalStaffCost / (activeMembers.length || 1),
    totalDeposits,
    totalCredits,
    totalPayments,
    // Cash Balance = Money Received (deposits + payments) - Money Spent (expenses)
    // Note: Credits here are manually-created credit records from Firebase (not auto-computed settlement credits)
    // They represent advances given TO members, which reduce cash
    cashBalance: totalDeposits + totalPayments - totalCredits - totalExpense,
    vacantBeds,
    occupiedBeds,
    perMember,
    settlements,
    settlementSummary,
  };
}

// ============================================================================
// Validation: Member can NEVER have both Deposit > 0 AND Credit > 0
// ============================================================================

export function validateDepositCreditMutualExclusivity(
  settlements: MemberSettlement[],
): { memberId: string; memberName: string; message: string }[] {
  const violations: { memberId: string; memberName: string; message: string }[] = [];

  settlements.forEach((s) => {
    if (s.totalDeposit > 0 && s.totalCredit > 0) {
      violations.push({
        memberId: s.memberId,
        memberName: s.memberName,
        message: `Member ${s.memberName} has both Deposit (${s.totalDeposit}) and Credit (${s.totalCredit}) - this violates accounting rules`,
      });
    }
  });

  return violations;
}

/**
 * Convert a legacy Utility record to an Expense record
 */
function convertUtilityToExpense(utility: Utility): Expense {
  const catMap: Record<string, ExpenseCategory> = {
    electricity: "electricity",
    internet: "internet",
    gas: "gas",
    water: "water",
    generator: "generator",
    maintenance: "maintenance",
    rent: "house_rent",
    others: "other_shared",
  };

  return {
    id: utility.id,
    ym: utility.ym,
    category: catMap[utility.type.toLowerCase()] || "other_shared",
    amount: utility.amount || 0,
    date: utility.date,
    paidBy: utility.paidBy,
    paidByName: utility.paidByName,
    notes: utility.notes,
    allocationMethod: "equal",
    status: utility.paidBy ? "paid" : "pending",
    createdBy: utility.createdBy,
    createdAt: utility.createdAt,
  };
}

// ============================================================================
// Ledger Calculations
// ============================================================================

export function calculateMemberLedger(
  member: Member,
  entries: LedgerEntry[],
) {
  const sortedEntries = [...entries].sort((a, b) => a.date.localeCompare(b.date));

  let balance = 0;
  let openingBalance = 0;

  // Set of transaction types that INCREASE member's liability (charges)
  const chargeTypes = new Set(["charge", "meal_charge", "rent_charge", "utility_charge", "staff_charge", "other_charge"]);
  // Set of transaction types that DECREASE member's liability (payments/contributions)
  const paymentTypes = new Set(["payment", "bazar_contribution", "expense_contribution"]);

  sortedEntries.forEach((entry, index) => {
    if (index === 0) {
      openingBalance = entry.balance || 0;
      balance = openingBalance;
    }

    if (chargeTypes.has(entry.transactionType)) {
      balance += entry.amount;
    } else if (paymentTypes.has(entry.transactionType)) {
      balance -= entry.amount;
    } else if (entry.transactionType === "deposit") {
      // Legacy: deposit reduces balance (member paid in advance)
      balance -= entry.amount;
    } else if (entry.transactionType === "credit") {
      // Legacy: credit reduces balance (member was given credit)
      balance -= entry.amount;
    } else if (entry.transactionType === "refund") {
      balance += entry.amount;
    } else if (entry.transactionType === "adjustment") {
      balance += entry.amount;
    } else if (entry.transactionType === "monthly_closing") {
      // Closing entries carry forward balance
    }
  });

  const totalCharges = entries
    .filter((e) => chargeTypes.has(e.transactionType))
    .reduce((sum, e) => sum + e.amount, 0);

  const totalPayments = entries
    .filter((e) => paymentTypes.has(e.transactionType))
    .reduce((sum, e) => sum + e.amount, 0);

  const totalDeposits = entries
    .filter((e) => e.transactionType === "deposit")
    .reduce((sum, e) => sum + e.amount, 0);

  const totalCredits = entries
    .filter((e) => e.transactionType === "credit")
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
): LedgerStatement {
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
  const transactions: LedgerTransaction[] = sortedEntries.map((entry) => {
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
    return {
      date: entry.date,
      transactionType: entry.transactionType,
      category: entry.category,
      amount: entry.amount,
      balance: runningBalance,
      notes: entry.notes,
    };
  });

  const openingBalance = sortedEntries.length > 0 ? (sortedEntries[0].balance || 0) : 0;

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
    transactions,
  };
}

// ============================================================================
// Monthly Closing Calculations
// ============================================================================

export function calculateMonthlyClosing(
  _members: Member[],
  month: string,
  year: number,
  rentCharges: RentCharge[],
  deposits: Deposit[],
  credits: Credit[],
  payments: Payment[],
  monthBazar: Bazar[],
  monthUtilities: Utility[] | Expense[],
  activeStaff: Staff[],
  monthMeals: MealEntry[] = [], // Fixed: now accepts meals
): Omit<MonthlyClosingData, "closedBy" | "closedByName" | "status"> {
  // Rent Receivable
  const totalRent = rentCharges.reduce((sum, r) => sum + (r.amount || 0), 0);

  // Collections
  const totalCollection = payments.reduce((sum, p) => sum + (p.amount || 0), 0);

  // Total Income
  const totalIncome = totalRent + totalCollection;

  // Expenses
  const totalBazar = monthBazar.reduce((sum, b) => sum + (b.total || 0), 0);
  const totalUtility = monthUtilities.reduce((sum, u) => sum + ((u as Expense).amount || (u as Utility).amount || 0), 0);
  const totalStaffCost = activeStaff.reduce(
    (sum, s) => sum + (s.salary || 0) + (s.overtime || 0) + (s.bonus || 0) - (s.advance || 0),
    0
  );

  const totalExpense = totalBazar + totalUtility + totalStaffCost;
  const netProfit = totalIncome - totalExpense;

  const totalDeposit = deposits.reduce((sum, d) => sum + (d.amount || 0), 0);
  const totalCredit = credits.reduce((sum, c) => sum + (c.amount || 0), 0);

  const totalDue = rentCharges.reduce((sum, r) => {
    const dueAmount = r.dueAmount !== undefined ? r.dueAmount : Math.max(0, r.amount - (r.paidAmount || 0));
    return sum + dueAmount;
  }, 0);

  // Fixed: Use monthMeals parameter instead of empty array
  const { mealRate, totalMeals } = calculateMealRateFromBazar(monthBazar, monthMeals);

  return {
    month,
    year,
    totalIncome,
    totalExpense,
    netProfit,
    totalRent,
    totalMeal: totalBazar,
    totalUtility,
    totalStaff: totalStaffCost,
    totalDeposit,
    totalCredit,
    totalCollection,
    totalDue,
    mealRate,
    totalMeals,
    totalBazar,
  };
}

function calculateMealRateFromBazar(monthBazar: Bazar[], monthMeals: MealEntry[]): MealRateInfo {
  const totalBazar = monthBazar.reduce((sum, b) => sum + (b.total || 0), 0);
  const totalMeals = monthMeals.reduce(
    (sum, m) => sum + (m.breakfast || 0) + (m.lunch || 0) + (m.dinner || 0) + (m.guest || 0),
    0
  );
  const mealRate = totalMeals > 0 ? totalBazar / totalMeals : 0;
  return { totalBazar, totalMeals, mealRate };
}

// ============================================================================
// Rent Charge Calculations
// ============================================================================

export function calculateRentCharges(members: Member[], month: string): RentCharge[] {
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
) {
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

// ============================================================================
// Utility Allocation Calculations
// ============================================================================

export function calculateUtilityAllocation(
  utility: Utility,
  allocations: UtilityAllocation[],
  members: Member[],
): UtilityAllocation[] {
  const subscribedAllocations = allocations.filter((a) => a.subscribed);
  const totalSubscribed = subscribedAllocations.length;

  if (totalSubscribed === 0) {
    return allocations.map((a) => ({
      ...a,
      amount: 0,
    }));
  }

  return allocations.map((allocation) => {
    if (!allocation.subscribed) {
      return { ...allocation, amount: 0 };
    }

    let amount = 0;

    switch (allocation.allocationMethod) {
      case "equal":
        amount = utility.amount / totalSubscribed;
        break;
      case "per_member":
        amount = utility.amount / totalSubscribed;
        break;
      case "per_room": {
        const member = members.find((m) => m.id === allocation.memberId);
        const memberRoomId = member?.roomId;
        const totalRooms = new Set(
          members.filter((m) => isMemberSubscribedToService(m, utility.type)).map((m) => m.roomId),
        ).size;
        amount = totalRooms > 0 ? utility.amount / totalRooms : 0;
        break;
      }
      case "fixed":
        amount = allocation.fixedAmount || 0;
        break;
      case "custom_percentage":
        amount = (utility.amount * (allocation.percentage || 0)) / 100;
        break;
      default:
        amount = utility.amount / totalSubscribed;
    }

    return {
      ...allocation,
      amount: Math.round(amount * 100) / 100,
    };
  });
}

// ============================================================================
// Expense Calculation Functions
// ============================================================================

/**
 * Calculate allocations for a single expense
 */
export function calculateExpenseAllocations(
  expense: Expense,
  members: Member[],
): ExpenseAllocation[] {
  const activeMembers = members.filter((m) => m.active);
  const serviceType = getServiceTypeForExpenseCategory(expense.category);

  const subscribers = serviceType
    ? activeMembers.filter((m) => isMemberSubscribedToService(m, serviceType))
    : activeMembers;

  const totalSubscribers = serviceType
    ? subscribers.length || 1
    : activeMembers.length || 1;

  return activeMembers.map((member) => {
    const isSubscribed = serviceType
      ? isMemberSubscribedToService(member, serviceType)
      : true;

    if (!isSubscribed) {
      return {
        id: `${expense.id}_${member.id}`,
        expenseId: expense.id,
        memberId: member.id,
        memberName: member.name,
        category: expense.category,
        amount: 0,
        subscribed: false,
        ym: expense.ym,
        status: "pending",
        createdAt: Date.now(),
      };
    }

    let amount = 0;

    switch (expense.allocationMethod) {
      case "equal":
      case "per_member":
        amount = expense.amount / totalSubscribers;
        break;
      case "per_room": {
        const memberRoomId = member.roomId;
        const roomMembers = activeMembers.filter((m) => m.roomId === memberRoomId);
        const totalRooms = new Set(subscribers.map((m) => m.roomId)).size;
        amount = totalRooms > 0 ? expense.amount / totalRooms / (roomMembers.length || 1) : 0;
        break;
      }
      case "fixed":
        amount = (expense as any).fixedAmount || expense.amount / totalSubscribers;
        break;
      case "custom_percentage":
        amount = (expense.amount * ((member as any).percentage || 100 / totalSubscribers)) / 100;
        break;
      case "usage_based":
        amount = expense.amount / totalSubscribers;
        break;
      default:
        amount = expense.amount / totalSubscribers;
    }

    return {
      id: `${expense.id}_${member.id}`,
      expenseId: expense.id,
      memberId: member.id,
      memberName: member.name,
      category: expense.category,
      amount: Math.round(amount * 100) / 100,
      subscribed: true,
      ym: expense.ym,
      status: "pending",
      paidAmount: 0,
      dueAmount: Math.round(amount * 100) / 100,
      createdAt: Date.now(),
    };
  });
}

// ============================================================================
// Validation Functions
// ============================================================================

export function validateMealEntry(entry: Partial<MealEntry>): string | null {
  if (!entry.memberId) return "Member is required";
  if (!entry.date) return "Date is required";
  if (!entry.ym) return "Month is required";
  if ((entry.breakfast || 0) < 0) return "Breakfast count cannot be negative";
  if ((entry.lunch || 0) < 0) return "Lunch count cannot be negative";
  if ((entry.dinner || 0) < 0) return "Dinner count cannot be negative";
  if ((entry.guest || 0) < 0) return "Guest count cannot be negative";
  const total = (entry.breakfast || 0) + (entry.lunch || 0) + (entry.dinner || 0) + (entry.guest || 0);
  if (total === 0) return "At least one meal must be recorded";
  return null;
}

export function validateBazarEntry(entry: Partial<Bazar>): string | null {
  if (!entry.buyerId) return "Buyer is required";
  if (!entry.date) return "Date is required";
  if (!entry.ym) return "Month is required";
  if (!entry.items || entry.items.length === 0) return "At least one item is required";
  if ((entry.total || 0) <= 0) return "Total amount must be greater than 0";
  return null;
}

export function validateDeposit(entry: Partial<Deposit>): string | null {
  if (!entry.memberId) return "Member is required";
  if (!entry.amount || entry.amount <= 0) return "Amount must be greater than 0";
  if (!entry.date) return "Date is required";
  if (!entry.method) return "Payment method is required";
  return null;
}

export function validateCredit(entry: Partial<Credit>): string | null {
  if (!entry.memberId) return "Member is required";
  if (!entry.amount || entry.amount <= 0) return "Amount must be greater than 0";
  if (!entry.reason || !entry.reason.trim()) return "Reason is required";
  if (!entry.date) return "Date is required";
  return null;
}

export function validatePayment(entry: Partial<Payment>): string | null {
  if (!entry.memberId) return "Member is required";
  if (!entry.amount || entry.amount <= 0) return "Amount must be greater than 0";
  if (!entry.method) return "Payment method is required";
  if (!entry.date) return "Date is required";
  return null;
}

export function validateMonthlyClosing(closing: Partial<MonthlyClosingData>): string | null {
  if (!closing.month) return "Month is required";
  if (!closing.year) return "Year is required";
  return null;
}

export function validateExpense(entry: Partial<Expense>): string | null {
  if (!entry.category) return "Category is required";
  if (!entry.amount || entry.amount <= 0) return "Amount must be greater than 0";
  if (!entry.date) return "Date is required";
  if (!entry.ym) return "Month is required";
  return null;
}