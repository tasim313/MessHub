/**
 * Central calculation engine - Single source of truth for all monthly computations.
 * Uses service subscriptions for utility/staff splits and room-based rent.
 *
 * NOW WRAPS engine-v2.ts for all new calculations while maintaining backward compatibility
 * with the existing engine.ts for pages that haven't been migrated yet.
 */
import type {
  MealEntry,
  Bazar,
  Utility,
  Expense,
  Deposit,
  Credit,
  Payment,
  Member,
  Staff,
  Room,
  LedgerEntry,
  MonthlyClosing,
  ExpenseAllocation,
  Advance,
  AdvanceRecovery,
} from "./types";
import { computeMonthlySummary } from "./calculations/engine";
import { calculateCompleteMonthlySummary, calculateMealRate, calculateMemberExpenseShares, calculateMemberStaffShare } from "./calculations/engine-v2";

// Re-export all v2 engine functions
export {
  calculateMealRate,
  calculateCompleteMonthlySummary,
  calculateMemberExpenseShares,
  calculateMemberStaffShare,
} from "./calculations/engine-v2";

// ============================================================================
// Legacy Interface (Backward Compatible)
// ============================================================================

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
  perMember: PerMember[];
  settlements: import("./calculations/engine").MemberSettlement[];
  settlementSummary: import("./calculations/engine").SettlementSummary;
}

export interface PerMember {
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
  deposited: number;
  credited: number;
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
  creditReason?: string;
  depositSource?: string;
  // NEW: Advance info
  advancesGiven: number;
  outstandingAdvance: number;
  // NEW: Contribution breakdown
  bazarContribution: number;
  paymentsMade: number;
  expenseContributionsTotal: number;
}

// Service type mapping for utilities
const UTILITY_SERVICE_MAP: Record<string, string> = {
  electricity: "electricity",
  internet: "internet",
  gas: "gas",
  water: "water",
  generator: "generator",
  maintenance: "maintenance",
};

// Service type mapping for staff roles
const STAFF_SERVICE_MAP: Record<string, string> = {
  cook: "cooking_staff",
  cleaner: "cleaning_staff",
  security: "security_staff",
  helper: "other_services",
  accountant: "other_services",
  manager: "other_services",
};

// Check if member subscribes to a service
export function isMemberSubscribedToService(member: Member, serviceType: string): boolean {
  if (!member.services) return false;
  return member.services.some((s) => s.type === serviceType && s.enabled);
}

// Get per-bed rent from room
export function getPerBedRent(member: Member, rooms: Room[]): number {
  if (!member.roomId) return 0;
  const room = rooms.find((r) => r.id === member.roomId);
  if (!room || !room.totalBeds) return 0;
  return room.monthlyRent / room.totalBeds;
}

/**
 * Computes complete monthly summary with service subscription awareness.
 * All pages MUST use this instead of duplicating logic.
 *
 * Uses ENGINE-V2 when advances data is available, otherwise falls back to v1.
 */
export function computeMonthly(
  ym: string,
  members: Member[],
  meals: MealEntry[],
  bazar: Bazar[],
  utilities: Utility[] | Expense[],
  deposits: Deposit[],
  credits: Credit[] = [],
  payments: Payment[] = [],
  staff: Staff[] = [],
  rooms: Room[] = [],
  ledgerEntries: LedgerEntry[] = [],
  prevClosings: Array<{ month: string; memberId: string; deposit: number; credit: number }> = [],
  monthAllocations: ExpenseAllocation[] = [],
  allAdvances: Advance[] = [],
  allAdvanceRecoveries: AdvanceRecovery[] = [],
  closings: MonthlyClosing[] = [],
): MonthlySummary {
  // Use v2 engine when we have Expense data (new unified expense system)
  // Otherwise fall back to v1 for backward compatibility
  const hasExpenses = (utilities as Expense[]).some((u) => (u as Expense).category !== undefined);
  
  if (hasExpenses && allAdvances.length >= 0) {
    // Use v2 engine with Expense data
    const expenses = utilities as Expense[];
    const v2Result = calculateCompleteMonthlySummary(
      ym,
      members,
      meals,
      bazar,
      expenses,
      monthAllocations,
      payments,
      staff,
      rooms,
      allAdvances,
      allAdvanceRecoveries,
      closings && closings.length > 0 ? closings : prevClosings,
    );

    // Convert v2 result to legacy MonthlySummary format
    return {
      ym: v2Result.ym,
      totalMeals: v2Result.totalMeals,
      totalBazar: v2Result.totalBazar,
      totalUtilities: v2Result.totalExpenses,
      totalRent: v2Result.members.reduce((s, m) => s + m.rentShare, 0),
      totalStaffCost: v2Result.totalStaffCost,
      totalPreviousDue: 0,
      totalExpense: v2Result.totalExpenses + v2Result.totalBazar + v2Result.totalStaffCost,
      mealRate: v2Result.mealRate,
      utilityPerMember: v2Result.totalExpenses / (members.filter((m) => m.active).length || 1),
      staffCostPerMember: v2Result.totalStaffCost / (members.filter((m) => m.active).length || 1),
      totalDeposits: v2Result.totalDeposits,
      totalCredits: v2Result.totalCredits,
      totalPayments: v2Result.totalPayments,
      cashBalance: v2Result.totalPayments - v2Result.totalCharges,
      vacantBeds: v2Result.vacantBeds,
      occupiedBeds: v2Result.occupiedBeds,
      perMember: v2Result.members.map((m) => ({
        memberId: m.memberId,
        memberName: m.memberName,
        meals: Math.round(m.mealCost / (v2Result.mealRate || 1)),
        mealCost: m.mealCost,
        utilityShare: m.expenseShares,
        rentShare: m.rentShare,
        staffShare: m.staffShare,
        previousDue: m.previousDue,
        previousDeposit: m.previousDeposit,
        previousCredit: m.previousCredit,
        totalDue: m.totalCharges,
        deposited: m.depositAmount,
        credited: m.creditAmount,
        paid: m.paymentContributions,
        balance: m.balance,
        settlementStatus: m.settlementStatus,
        payableAmount: m.creditAmount,
        receivableAmount: m.depositAmount,
        totalCharges: m.totalCharges,
        totalContributions: m.totalContributions,
        expenseShares: m.expenseShareBreakdown,
        expenseContributions: m.expenseContributionBreakdown,
        carryForwardDeposit: m.previousDeposit,
        carryForwardCredit: m.previousCredit,
        creditReason: m.creditAmount > 0 ? `Due ৳${m.creditAmount} (unpaid charges)` : undefined,
        depositSource: m.depositAmount > 0 ? `Deposit ৳${m.depositAmount} (excess held for member)` : undefined,
        advancesGiven: m.advancesGiven,
        outstandingAdvance: m.outstandingAdvance,
        bazarContribution: m.bazarContribution,
        paymentsMade: m.paymentsMade,
        expenseContributionsTotal: m.expenseContributions,
      })),
      settlements: [],
      settlementSummary: {
        totalMeals: v2Result.totalMeals,
        totalBazar: v2Result.totalBazar,
        totalMealCost: v2Result.totalBazar,
        totalBazarPaid: v2Result.members.reduce((s, m) => s + m.bazarContribution, 0),
        totalDeposits: v2Result.totalDeposits,
        totalCredits: v2Result.totalCredits,
        totalPayments: v2Result.totalPayments,
        totalPayable: v2Result.totalCredits,
        totalReceivable: v2Result.totalDeposits,
        totalBalance: v2Result.totalPayments - v2Result.totalCharges,
        membersToPay: v2Result.members.filter((m) => m.settlementStatus === "pay") as any,
        membersToReceive: v2Result.members.filter((m) => m.settlementStatus === "receive") as any,
        settledMembers: v2Result.members.filter((m) => m.settlementStatus === "settled") as any,
      },
    };
  }

  // Fallback to v1 engine for backward compatibility
  const result = computeMonthlySummary(
    ym,
    members,
    meals,
    bazar,
    utilities,
    deposits,
    credits,
    payments,
    staff,
    rooms,
    ledgerEntries,
    [],
    prevClosings,
    monthAllocations
  );

  // Convert to legacy format for backward compatibility
  return {
    ym: result.ym,
    totalMeals: result.totalMeals,
    totalBazar: result.totalBazar,
    totalUtilities: result.totalUtilities,
    totalRent: result.totalRent,
    totalStaffCost: result.totalStaffCost,
    totalPreviousDue: result.totalPreviousDue,
    totalExpense: result.totalExpense,
    mealRate: result.mealRate,
    utilityPerMember: result.utilityPerMember,
    staffCostPerMember: result.staffCostPerMember,
    totalDeposits: result.totalDeposits,
    totalCredits: result.totalCredits,
    totalPayments: result.totalPayments,
    cashBalance: result.cashBalance,
    vacantBeds: result.vacantBeds,
    occupiedBeds: result.occupiedBeds,
    perMember: result.perMember.map((p) => ({
        memberId: p.memberId,
        memberName: p.memberName,
        meals: p.meals,
        mealCost: p.mealCost,
        utilityShare: p.utilityShare,
        rentShare: p.rentShare,
        staffShare: p.staffShare,
        previousDue: p.previousDue,
        previousDeposit: p.previousDeposit,
        previousCredit: p.previousCredit,
        totalDue: p.totalDue,
        deposited: p.deposited,
        credited: p.credited,
        paid: p.paid,
        balance: p.balance,
        settlementStatus: p.settlementStatus,
        payableAmount: p.payableAmount,
        receivableAmount: p.receivableAmount,
        totalCharges: p.totalCharges,
        totalContributions: p.totalContributions,
        expenseShares: p.expenseShares,
        expenseContributions: p.expenseContributions,
        carryForwardDeposit: p.carryForwardDeposit,
        carryForwardCredit: p.carryForwardCredit,
        creditReason: p.creditReason,
        depositSource: p.depositSource,
        advancesGiven: 0,
        outstandingAdvance: 0,
        bazarContribution: 0,
        paymentsMade: 0,
        expenseContributionsTotal: 0,
      })),
    settlements: result.settlements,
    settlementSummary: result.settlementSummary,
  };
}

/**
 * NEW: Compute monthly using engine-v2 (the correct accounting engine).
 * This should be used by new pages and refactored pages.
 */
export function computeMonthlyV2(
  ym: string,
  members: Member[],
  meals: MealEntry[],
  bazar: Bazar[],
  expenses: Expense[],
  expenseAllocations: ExpenseAllocation[],
  payments: Payment[],
  staff: Staff[],
  rooms: Room[],
  allAdvances: Advance[],
  allAdvanceRecoveries: AdvanceRecovery[],
  closings: MonthlyClosing[],
) {
  return calculateCompleteMonthlySummary(
    ym,
    members,
    meals,
    bazar,
    expenses,
    expenseAllocations,
    payments,
    staff,
    rooms,
    allAdvances,
    allAdvanceRecoveries,
    closings,
  );
}