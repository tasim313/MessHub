/**
 * Settlement Calculation Engine
 * Central source of truth for all member settlement calculations
 * 
 * Core Accounting Rules:
 * - Total Contribution = Bazar + Expense Contributions + Rent Paid + Deposits + Credits + Payments
 * - Total Charges = Meal Cost + Rent Share + Expense Shares + Staff Share + Previous Due
 * - Net Balance = Total Contributions - Total Charges
 * - Positive Balance = Receive from Mess
 * - Negative Balance = Pay to Mess
 */
import type { Member, MealEntry, Bazar, Deposit, Credit, Payment, LedgerEntry } from "@/lib/types";
import { 
  calculateMemberSettlement,
  calculateAllSettlements,
  getSettlementSummary,
} from "./engine";

export interface MemberSettlement {
  memberId: string;
  memberName: string;
  totalMeals: number;
  mealRate: number;
  mealCost: number;
  totalBazarPaid: number;
  totalDeposit: number;
  totalCredit: number;
  totalPayment: number;
  contributions: import("./engine").MemberContributions;
  charges: import("./engine").MemberCharges;
  balance: number;
  payableAmount: number;
  receivableAmount: number;
  settlementStatus: "pay" | "receive" | "settled";
  lastTransactionDate?: string;
}

// Re-export from centralized engine
export { calculateMemberSettlement, calculateAllSettlements, getSettlementSummary };

/**
 * Get members who need to pay (negative settlement)
 */
export function getMembersToPay(settlements: MemberSettlement[]): MemberSettlement[] {
  return settlements
    .filter((s) => s.settlementStatus === "pay")
    .sort((a, b) => b.payableAmount - a.payableAmount);
}

/**
 * Get members who will receive (positive settlement)
 */
export function getMembersToReceive(settlements: MemberSettlement[]): MemberSettlement[] {
  return settlements
    .filter((s) => s.settlementStatus === "receive")
    .sort((a, b) => b.receivableAmount - a.receivableAmount);
}