/**
 * Central calculation engine - Single source of truth for all monthly computations.
 * Uses service subscriptions for utility/staff splits and room-based rent.
 *
 * NOW WRAPS src/lib/calculations/engine.ts for complete consistency.
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
} from "./types";
import { computeMonthlySummary } from "./calculations/engine";

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
 * NOW DELEGATES TO computeMonthlySummary from engine.ts
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
  monthAllocations: import("./types").ExpenseAllocation[] = [],
): MonthlySummary {
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
    })),
    settlements: result.settlements,
    settlementSummary: result.settlementSummary,
  };
}