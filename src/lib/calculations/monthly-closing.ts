/**
 * Monthly Closing Calculation Module
 * ====================================
 * 
 * Complete recalculation from Firebase data.
 * Uses the enterprise financial engine for all calculations.
 * 
 * Monthly Closing Steps (per specification):
 *   1. Load Firebase
 *   2. Validate Data
 *   3. Remove Duplicates
 *   4. Verify Charges
 *   5. Verify Payments
 *   6. Verify Deposits
 *   7. Verify Credits
 *   8. Calculate Bazaar
 *   9. Calculate Utilities
 *  10. Calculate Rent
 *  11. Calculate Shared Expenses
 *  12. Apply Deposits
 *  13. Apply Credits
 *  14. Calculate Settlement
 *  15. Verify Ledger
 *  16. Verify Totals
 *  17. Save Closing Report
 *  18. Lock Month
 * 
 * No incorrect data may be carried forward.
 */
import type {
  Member,
  MealEntry,
  Bazar,
  Utility,
  Expense,
  ExpenseAllocation,
  Deposit,
  Credit,
  Payment,
  Staff,
  Room,
  LedgerEntry,
  MonthlyClosing,
  RentCharge,
  Advance,
  AdvanceRecovery,
} from "@/lib/types";
import { calculateMonthlyClosing as calculateMonthlyClosingV1 } from "./engine";
import {
  validateMonthData,
  detectAllDuplicates,
  calculateSeparateAccounting,
  generateClosingReport,
  runVerificationChecklist,
  calculateMemberToMemberSettlements,
  consolidateSettlements,
  type MonthlyClosingReport,
  type VerificationResult,
} from "@/lib/financial-engine";
import {
  calculateCompleteMonthlySummary,
  calculateMealRate,
  validateMutualExclusivity,
} from "./engine-v2";

// Re-export the report type for use in UI pages
export type { MonthlyClosingReport, VerificationResult } from "@/lib/financial-engine";

/**
 * Calculate monthly closing with FULL verification from Firebase.
 * This function performs the complete 18-step closing process.
 * 
 * @returns The complete closing report with all verification results
 */
export function calculateMonthlyClosingWithVerification(
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
  return generateClosingReport(
    ym,
    members,
    meals,
    bazar,
    expenses,
    expenseAllocations,
    payments,
    deposits,
    credits,
    staff,
    rooms,
    ledgerEntries,
    rentCharges,
    closings,
    allAdvances,
    allAdvanceRecoveries,
  );
}

/**
 * Validate and verify all data for a month before closing.
 * Returns validation result with detailed errors and warnings.
 */
export function validateBeforeClosing(
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
) {
  return validateMonthData(
    ym, members, meals, bazar, expenses, deposits, credits,
    payments, staff, rooms, ledgerEntries, rentCharges, closings,
  );
}

/**
 * Detect all duplicates across all collections for a given month.
 * Returns detailed information about each duplicate found.
 */
export function detectMonthlyDuplicates(
  ym: string,
  bazar: Bazar[],
  expenses: Expense[],
  payments: Payment[],
  deposits: Deposit[],
  credits: Credit[],
  ledgerEntries: LedgerEntry[],
) {
  return detectAllDuplicates(ym, bazar, expenses, payments, deposits, credits, ledgerEntries);
}

/**
 * Calculate the complete verification checklist for a month.
 * Verifies every record, calculation, ledger, and balance.
 */
export function verifyMonthlyClosing(
  ym: string,
  members: Member[],
  expenses: Expense[],
  payments: Payment[],
  deposits: Deposit[],
  credits: Credit[],
  ledgerEntries: LedgerEntry[],
  expenseAllocations: ExpenseAllocation[],
  allAdvances: Advance[],
  allAdvanceRecoveries: AdvanceRecovery[],
  meals: MealEntry[],
  bazar: Bazar[],
  staff: Staff[],
  rooms: Room[],
  rentCharges: RentCharge[],
  closings: MonthlyClosing[],
): VerificationResult {
  const monthAlloc = expenseAllocations.filter((a: ExpenseAllocation) => a.ym === ym);

  const summary = calculateCompleteMonthlySummary(
    ym, members, meals, bazar, expenses, monthAlloc, payments, staff, rooms,
    allAdvances, allAdvanceRecoveries, closings,
  );

  return runVerificationChecklist(
    ym, members, expenses, payments, deposits, credits, ledgerEntries,
    monthAlloc, allAdvances, allAdvanceRecoveries, summary,
  );
}

/**
 * Calculate separate accounting for each category.
 * Each category maintains its own ledger independently.
 */
export function calculateSeparateAccountingForMonth(
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
) {
  return calculateSeparateAccounting(
    ym, activeMembers, monthMeals, monthBazar, monthExpenses, monthPayments,
    monthDeposits, monthCredits, staff, rooms, rentCharges, monthAllocations,
  );
}

/**
 * Calculate member-to-member settlements for a month.
 * Shows who owes whom and why.
 */
export function calculateMemberSettlementsForMonth(
  expenses: Expense[],
  bazar: Bazar[],
  activeMembers: Member[],
  ym: string,
) {
  const raw = calculateMemberToMemberSettlements(expenses, bazar, activeMembers, ym);
  return consolidateSettlements(raw);
}

/**
 * Legacy compatibility: calculate monthly closing data using v1 engine.
 * Maintained for backward compatibility with existing UI pages.
 */
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
  monthMeals: MealEntry[] = [],
) {
  return calculateMonthlyClosingV1(
    _members, month, year, rentCharges, deposits, credits,
    payments, monthBazar, monthUtilities, activeStaff, monthMeals,
  );
}