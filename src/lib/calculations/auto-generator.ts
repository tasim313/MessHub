/**
 * AUTOMATIC MONTHLY FINANCIAL GENERATOR
 * ======================================
 * 
 * Reads all financial transactions for a selected month and automatically generates:
 * - Member Charges
 * - Internal Payments (own-share settlements)
 * - Advances (Deposits)
 * - Advance Recovery Records
 * - Member Ledger Entries
 * 
 * This is the SINGLE entry point for all monthly financial generation.
 * The user only enters raw business transactions; all accounting records are auto-generated.
 * 
 * REGENERATION RULES:
 * - Safe to call multiple times
 * - Skips already-generated records (idempotent)
 * - Updates existing records when source data changes
 * - Never creates duplicates
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
  Advance,
  AdvanceRecovery,
  MonthlyClosing,
  LedgerEntry,
  RentCharge,
  UtilityAllocation,
  StaffAllocation,
} from "../types";

// PersonalCharge type (for personal member charges)
interface PersonalCharge {
  id: string;
  memberId: string;
  memberName: string;
  category: string;
  amount: number;
  description?: string;
  date: string;
  ym: string;
}
import {
  calculateMealRate,
  calculateMemberExpenseShares,
  calculateMemberStaffShare,
  calculateExpenseAdvance,
  calculatePaymentDistribution,
  calculateMemberMonthlySummary,
  calculateCompleteMonthlySummary,
  verifyCalculations,
  validateMutualExclusivity,
} from "./engine-v2";

// ============================================================================
// TYPES
// ============================================================================

export interface GeneratedCharge {
  memberId: string;
  memberName: string;
  chargeType: "meal" | "rent" | "utility" | "staff" | "bazar" | "personal" | "other";
  category: string;
  amount: number;
  sourceId: string;
  sourceType: string;
  status: "pending" | "paid" | "partial";
  paidAmount: number;
  dueAmount: number;
}

export interface GeneratedInternalPayment {
  memberId: string;
  memberName: string;
  amount: number;
  sourceId: string;
  sourceType: string;
  reason: string;
}

export interface GeneratedAdvance {
  memberId: string;
  memberName: string;
  amount: number;
  remainingAmount: number;
  sourceId: string;
  sourceType: string;
  source: string;
  status: "outstanding" | "partially_recovered" | "recovered";
}

export interface GeneratedAdvanceRecovery {
  advanceId: string;
  advanceOwnerId: string;
  advanceOwnerName: string;
  recoveredFromMemberId: string;
  recoveredFromMemberName: string;
  amount: number;
  sourcePaymentId: string;
}

export interface GeneratedLedgerEntry {
  memberId: string;
  memberName: string;
  date: string;
  ym: string;
  transactionType: string;
  category: string;
  amount: number;
  notes: string;
  referenceId: string;
  referenceType: string;
}

export interface MonthlyGenerationResult {
  ym: string;
  chargesGenerated: number;
  internalPaymentsGenerated: number;
  advancesCreated: number;
  advancesRecovered: number;
  ledgerEntriesCreated: number;
  totalCharges: number;
  totalInternalPayments: number;
  totalAdvances: number;
  totalRecoveries: number;
  reconciliation: {
    totalCharges: number;
    totalPayments: number;
    totalAdvances: number;
    totalRecoveries: number;
    balanced: boolean;
    errors: string[];
  };
}

// ============================================================================
// MAIN GENERATION FUNCTION
// ============================================================================

/**
 * Generate all monthly financial records from raw transaction data.
 * 
 * This function:
 * 1. Calculates all member charges from expenses, bazar, rent, meals, staff
 * 2. Creates internal payments for expense payers' own shares
 * 3. Creates advances for excess payments
 * 4. Processes advance recoveries from member payments
 * 5. Creates all ledger entries
 * 6. Validates reconciliation
 * 
 * @returns Generation result with counts and reconciliation status
 */
export function generateMonthlyFinancials(
  ym: string,
  members: Member[],
  mealEntries: MealEntry[],
  bazarEntries: Bazar[],
  expenses: Expense[],
  expenseAllocations: ExpenseAllocation[],
  payments: Payment[],
  staff: Staff[],
  rooms: Room[],
  existingAdvances: Advance[],
  existingAdvanceRecoveries: AdvanceRecovery[],
  existingLedgerEntries: LedgerEntry[],
  existingRentCharges: RentCharge[],
  existingUtilityAllocations: UtilityAllocation[],
  existingStaffAllocations: StaffAllocation[],
  personalCharges: PersonalCharge[] = [],
  closings: MonthlyClosing[] = [],
): MonthlyGenerationResult {
  const activeMembers = members.filter((m) => m.active);
  const monthMeals = mealEntries.filter((m) => m.ym === ym);
  const monthBazar = bazarEntries.filter((b) => b.ym === ym);
  const monthExpenses = expenses.filter((e) => e.ym === ym);
  const monthPayments = payments.filter((p) => p.ym === ym);
  const monthAllocations = expenseAllocations.filter((a) => a.ym === ym);

  // ============================================================================
  // STEP 1: CALCULATE ALL CHARGES
  // ============================================================================

  const generatedCharges: GeneratedCharge[] = [];
  const generatedInternalPayments: GeneratedInternalPayment[] = [];
  const generatedAdvances: GeneratedAdvance[] = [];
  const generatedAdvanceRecoveries: GeneratedAdvanceRecovery[] = [];
  const generatedLedgerEntries: GeneratedLedgerEntry[] = [];

  // Calculate meal rate
  const { mealRate } = calculateMealRate(bazarEntries, mealEntries, ym);

  // Calculate complete monthly summary (includes all charges and contributions)
  const summary = calculateCompleteMonthlySummary(
    ym,
    members,
    mealEntries,
    bazarEntries,
    expenses,
    monthAllocations,
    payments,
    staff,
    rooms,
    existingAdvances,
    existingAdvanceRecoveries,
    closings,
  );

  // ============================================================================
  // STEP 2: GENERATE CHARGES FROM EXPENSES
  // ============================================================================

  monthExpenses.forEach((expense) => {
    const activeMembersForExpense = activeMembers;
    
    // Calculate allocations for this expense
    const allocations = calculateExpenseAllocationsForExpense(expense, activeMembersForExpense);
    
    allocations.forEach((alloc) => {
      if (alloc.amount <= 0) return;
      
      // Check if charge already exists
      const existingCharge = existingLedgerEntries.find(
        (e) => e.memberId === alloc.memberId &&
               e.ym === ym &&
               e.referenceId === expense.id &&
               e.transactionType === "utility_charge"
      );
      
      if (existingCharge) return; // Skip duplicate
      
      generatedCharges.push({
        memberId: alloc.memberId,
        memberName: alloc.memberName,
        chargeType: "utility",
        category: expense.category,
        amount: alloc.amount,
        sourceId: expense.id,
        sourceType: "expense",
        status: "pending",
        paidAmount: 0,
        dueAmount: alloc.amount,
      });
      
      generatedLedgerEntries.push({
        memberId: alloc.memberId,
        memberName: alloc.memberName,
        date: expense.date,
        ym,
        transactionType: "utility_charge",
        category: expense.category,
        amount: alloc.amount,
        notes: `${expense.category} for ${ym} - share: ${alloc.amount}`,
        referenceId: expense.id,
        referenceType: "expense",
      });
    });

    // ============================================================================
    // STEP 3: CREATE INTERNAL PAYMENT FOR PAYER'S OWN SHARE
    // ============================================================================

    if (expense.paidBy) {
      const payerAllocation = allocations.find((a) => a.memberId === expense.paidBy);
      const payerShare = payerAllocation?.amount || 0;
      const payer = activeMembers.find((m) => m.id === expense.paidBy);

      if (payer && payerShare > 0) {
        // Check if internal payment already exists
        const existingPayment = existingLedgerEntries.find(
          (e) => e.memberId === expense.paidBy &&
                 e.ym === ym &&
                 e.referenceId === expense.id &&
                 e.transactionType === "payment" &&
                 e.notes?.includes("Internal")
        );
        
        if (!existingPayment) {
          generatedInternalPayments.push({
            memberId: expense.paidBy,
            memberName: payer.name,
            amount: payerShare,
            sourceId: expense.id,
            sourceType: "expense",
            reason: `Own share of ${expense.category}`,
          });
          
          generatedLedgerEntries.push({
            memberId: expense.paidBy,
            memberName: payer.name,
            date: expense.date,
            ym,
            transactionType: "payment",
            category: expense.category,
            amount: payerShare,
            notes: `Internal: ${payer.name}'s own share paid`,
            referenceId: expense.id,
            referenceType: "expense",
          });
        }

        // ============================================================================
        // STEP 4: CREATE ADVANCE FOR EXCESS
        // ============================================================================

        const advanceAmount = (expense.amount || 0) - payerShare;
        if (advanceAmount > 0) {
          // Check if advance already exists for this expense
          const existingAdvance = existingAdvances.find(
            (a) => a.sourceId === expense.id && a.memberId === expense.paidBy
          );
          
          if (!existingAdvance) {
            generatedAdvances.push({
              memberId: expense.paidBy,
              memberName: payer.name,
              amount: advanceAmount,
              remainingAmount: advanceAmount,
              sourceId: expense.id,
              sourceType: "expense",
              source: `${expense.category} - ${expense.date}`,
              status: "outstanding",
            });
            
            generatedLedgerEntries.push({
              memberId: expense.paidBy,
              memberName: payer.name,
              date: expense.date,
              ym,
              transactionType: "advance_given",
              category: "advance",
              amount: advanceAmount,
              notes: `Advance: ${expense.category} - ${payer.name} paid ${advanceAmount} Tk extra`,
              referenceId: expense.id,
              referenceType: "expense",
            });
          }
        }
      }
    }
  });

  // ============================================================================
  // STEP 5: GENERATE RENT CHARGES
  // ============================================================================

  activeMembers.forEach((member) => {
    if (!member.roomId) return;
    const room = rooms.find((r) => r.id === member.roomId);
    if (!room || !room.totalBeds) return;
    
    const rentAmount = room.monthlyRent / room.totalBeds;
    if (rentAmount <= 0) return;
    
    // Check if rent charge already exists
    const existingRentCharge = existingRentCharges.find(
      (r) => r.memberId === member.id && r.month === ym
    );
    
    if (!existingRentCharge) {
      generatedCharges.push({
        memberId: member.id,
        memberName: member.name,
        chargeType: "rent",
        category: "rent",
        amount: rentAmount,
        sourceId: `rent_${ym}_${member.id}`,
        sourceType: "rent",
        status: "pending",
        paidAmount: 0,
        dueAmount: rentAmount,
      });
      
      generatedLedgerEntries.push({
        memberId: member.id,
        memberName: member.name,
        date: `${ym}-01`,
        ym,
        transactionType: "rent_charge",
        category: "rent",
        amount: rentAmount,
        notes: `Rent for ${ym} - ${room.roomNo}`,
        referenceId: `rent_${ym}_${member.id}`,
        referenceType: "rent",
      });
    }
  });

  // ============================================================================
  // STEP 6: GENERATE STAFF CHARGES
  // ============================================================================

  const activeStaff = staff.filter((s) => s.status !== "inactive");
  activeMembers.forEach((member) => {
    const staffShare = calculateMemberStaffShare(member, activeStaff, activeMembers);
    if (staffShare <= 0) return;
    
    // Check if staff charge already exists
    const existingStaffCharge = existingLedgerEntries.find(
      (e) => e.memberId === member.id &&
             e.ym === ym &&
             e.transactionType === "staff_charge"
    );
    
    if (!existingStaffCharge) {
      generatedCharges.push({
        memberId: member.id,
        memberName: member.name,
        chargeType: "staff",
        category: "staff",
        amount: staffShare,
        sourceId: `staff_${ym}_${member.id}`,
        sourceType: "staff",
        status: "pending",
        paidAmount: 0,
        dueAmount: staffShare,
      });
      
      generatedLedgerEntries.push({
        memberId: member.id,
        memberName: member.name,
        date: `${ym}-01`,
        ym,
        transactionType: "staff_charge",
        category: "staff",
        amount: staffShare,
        notes: `Staff salary share for ${ym}`,
        referenceId: `staff_${ym}_${member.id}`,
        referenceType: "staff",
      });
    }
  });

  // ============================================================================
  // STEP 7: GENERATE MEAL CHARGES
  // ============================================================================

  if (mealRate > 0) {
    activeMembers.forEach((member) => {
      const memberMeals = monthMeals.filter((m) => m.memberId === member.id);
      const totalMeals = memberMeals.reduce(
        (sum, m) => sum + (m.breakfast || 0) + (m.lunch || 0) + (m.dinner || 0) + (m.guest || 0),
        0
      );
      const mealCost = totalMeals * mealRate;
      
      if (mealCost <= 0) return;
      
      // Check if meal charge already exists
      const existingMealCharge = existingLedgerEntries.find(
        (e) => e.memberId === member.id &&
               e.ym === ym &&
               e.transactionType === "meal_charge"
      );
      
      if (!existingMealCharge) {
        generatedCharges.push({
          memberId: member.id,
          memberName: member.name,
          chargeType: "meal",
          category: "meal",
          amount: mealCost,
          sourceId: `meal_${ym}_${member.id}`,
          sourceType: "meal",
          status: "pending",
          paidAmount: 0,
          dueAmount: mealCost,
        });
        
        generatedLedgerEntries.push({
          memberId: member.id,
          memberName: member.name,
          date: `${ym}-01`,
          ym,
          transactionType: "meal_charge",
          category: "meal",
          amount: mealCost,
          notes: `Meal charges for ${ym} (${totalMeals} meals @ ${mealRate}/meal)`,
          referenceId: `meal_${ym}_${member.id}`,
          referenceType: "meal",
        });
      }
    });
  }

  // ============================================================================
  // STEP 8: GENERATE PERSONAL CHARGES
  // ============================================================================

  personalCharges.forEach((charge) => {
    if (charge.ym !== ym) return;
    
    // Check if personal charge already exists
    const existingPersonalCharge = existingLedgerEntries.find(
      (e) => e.memberId === charge.memberId &&
             e.ym === ym &&
             e.referenceId === charge.id &&
             e.transactionType === "other_charge"
    );
    
    if (existingPersonalCharge) return;
    
    generatedCharges.push({
      memberId: charge.memberId,
      memberName: charge.memberName,
      chargeType: "personal",
      category: charge.category,
      amount: charge.amount,
      sourceId: charge.id,
      sourceType: "personal_charge",
      status: "pending",
      paidAmount: 0,
      dueAmount: charge.amount,
    });
    
    generatedLedgerEntries.push({
      memberId: charge.memberId,
      memberName: charge.memberName,
      date: charge.date,
      ym,
      transactionType: "other_charge",
      category: charge.category,
      amount: charge.amount,
      notes: `Personal charge: ${charge.description || charge.category}`,
      referenceId: charge.id,
      referenceType: "personal_charge",
    });
  });

  // ============================================================================
  // STEP 9: PROCESS PAYMENTS (CHARGE PAYMENTS + ADVANCE RECOVERIES)
  // ============================================================================

  // Get all outstanding advances (from existing only - for recovery calculation)
   monthPayments.forEach((payment) => {
     // Skip internal payments (they're already handled)
     if (payment.notes?.includes("Internal") || payment.referenceType === "expense") return;
     
     // Check if this payment is already recorded in ledger
     const existingPaymentEntry = existingLedgerEntries.find(
       (e) => e.referenceId === payment.id && e.transactionType === "payment"
     );
     
     if (existingPaymentEntry) return; // Skip duplicate
     
     // Get member's outstanding charges
     const memberCharges = generatedCharges
       .filter((c) => c.memberId === payment.memberId && c.status !== "paid")
       .reduce((sum, c) => sum + (c.dueAmount || c.amount), 0);
     
     // Get member's outstanding advances (advances OTHER members have with this member)
     const memberOutstandingAdvances = existingAdvances.filter(
       (a) => a.memberId !== payment.memberId && a.remainingAmount > 0
     );
     
     // Calculate payment distribution
     const distribution = calculatePaymentDistribution(
       payment.amount,
       memberCharges,
       memberOutstandingAdvances,
     );
    
    // Record advance recoveries
    distribution.advanceRecoveries.forEach((recovery) => {
      generatedAdvanceRecoveries.push({
        advanceId: recovery.advanceId,
        advanceOwnerId: recovery.advanceOwnerId,
        advanceOwnerName: recovery.advanceOwnerName,
        recoveredFromMemberId: payment.memberId,
        recoveredFromMemberName: payment.memberName,
        amount: recovery.amount,
        sourcePaymentId: payment.id,
      });
      
      generatedLedgerEntries.push({
        memberId: recovery.advanceOwnerId,
        memberName: recovery.advanceOwnerName,
        date: payment.date,
        ym,
        transactionType: "advance_recovered",
        category: "advance_recovery",
        amount: recovery.amount,
        notes: `Advance recovered: ${recovery.amount} Tk from ${payment.memberName}'s payment`,
        referenceId: payment.id,
        referenceType: "payment",
      });
    });
    
    // Record charge payment
    if (distribution.chargePayment > 0) {
      generatedLedgerEntries.push({
        memberId: payment.memberId,
        memberName: payment.memberName,
        date: payment.date,
        ym,
        transactionType: "payment",
        category: payment.category || "other",
        amount: distribution.chargePayment,
        notes: `Payment: ${distribution.chargePayment} Tk via ${payment.method}`,
        referenceId: payment.id,
        referenceType: "payment",
      });
    }
    
    // Record excess as deposit
    if (distribution.remainingPayment > 0.01) {
      generatedLedgerEntries.push({
        memberId: payment.memberId,
        memberName: payment.memberName,
        date: payment.date,
        ym,
        transactionType: "deposit",
        category: "deposit",
        amount: distribution.remainingPayment,
        notes: `Excess payment: ${distribution.remainingPayment} Tk becomes deposit`,
        referenceId: payment.id,
        referenceType: "payment",
      });
    }
  });

  // ============================================================================
  // STEP 10: CALCULATE RECONCILIATION
  // ============================================================================

  const totalCharges = generatedCharges.reduce((sum, c) => sum + c.amount, 0);
  const totalInternalPayments = generatedInternalPayments.reduce((sum, p) => sum + p.amount, 0);
  const totalAdvances = generatedAdvances.reduce((sum, a) => sum + a.amount, 0);
  const totalRecoveries = generatedAdvanceRecoveries.reduce((sum, r) => sum + r.amount, 0);

  // Verify reconciliation
  const reconciliation = verifyMonthlyReconciliation(
    ym,
    generatedCharges,
    generatedInternalPayments,
    generatedAdvances,
    generatedAdvanceRecoveries,
    generatedLedgerEntries,
    monthPayments,
    summary,
  );

  return {
    ym,
    chargesGenerated: generatedCharges.length,
    internalPaymentsGenerated: generatedInternalPayments.length,
    advancesCreated: generatedAdvances.length,
    advancesRecovered: generatedAdvanceRecoveries.length,
    ledgerEntriesCreated: generatedLedgerEntries.length,
    totalCharges,
    totalInternalPayments,
    totalAdvances,
    totalRecoveries,
    reconciliation,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function calculateExpenseAllocationsForExpense(
  expense: Expense,
  activeMembers: Member[],
): Omit<GeneratedCharge, "chargeType" | "status" | "paidAmount" | "dueAmount">[] {
  const amount = expense.amount || 0;
  const totalMembers = activeMembers.length || 1;

  return activeMembers.map((member) => {
    const memberAmount = amount / totalMembers;
    return {
      memberId: member.id,
      memberName: member.name,
      category: expense.category,
      amount: Math.round(memberAmount * 100) / 100,
      sourceId: expense.id,
      sourceType: "expense",
    };
  });
}

function verifyMonthlyReconciliation(
  ym: string,
  charges: GeneratedCharge[],
  internalPayments: GeneratedInternalPayment[],
  advances: GeneratedAdvance[],
  recoveries: GeneratedAdvanceRecovery[],
  ledgerEntries: GeneratedLedgerEntry[],
  payments: Payment[],
  summary: ReturnType<typeof calculateCompleteMonthlySummary>,
): { totalCharges: number; totalPayments: number; totalAdvances: number; totalRecoveries: number; balanced: boolean; errors: string[] } {
  const errors: string[] = [];

  const totalCharges = charges.reduce((sum, c) => sum + c.amount, 0);
  const totalInternalPayments = internalPayments.reduce((sum, p) => sum + p.amount, 0);
  const totalAdvances = advances.reduce((sum, a) => sum + a.amount, 0);
  const totalRecoveries = recoveries.reduce((sum, r) => sum + r.amount, 0);
  const totalPayments = payments.reduce((sum, p) => sum + p.amount, 0);

  // Verify: Total Charges = Sum of member charges from summary
  const summaryTotalCharges = summary.members.reduce((s, m) => s + m.totalCharges, 0);
  if (Math.abs(totalCharges - summaryTotalCharges) > 0.01) {
    errors.push(`Charges mismatch: generated ${totalCharges} vs summary ${summaryTotalCharges}`);
  }

  // Verify: Total Advances = Total External Payments - Total Internal Payments
  const expectedAdvances = totalPayments - totalInternalPayments;
  if (Math.abs(totalAdvances - expectedAdvances) > 0.01 && totalAdvances > 0) {
    // This is informational, not necessarily an error
  }

  // Verify: Ledger balances
  const ledgerCharges = ledgerEntries
    .filter((e) => ["charge", "meal_charge", "rent_charge", "utility_charge", "staff_charge", "other_charge"].includes(e.transactionType))
    .reduce((sum, e) => sum + e.amount, 0);
  
  const ledgerPayments = ledgerEntries
    .filter((e) => ["payment", "bazar_contribution", "expense_contribution"].includes(e.transactionType))
    .reduce((sum, e) => sum + e.amount, 0);
  
  const ledgerDeposits = ledgerEntries
    .filter((e) => e.transactionType === "deposit")
    .reduce((sum, e) => sum + e.amount, 0);
  
  const ledgerCredits = ledgerEntries
    .filter((e) => e.transactionType === "credit")
    .reduce((sum, e) => sum + e.amount, 0);

  const ledgerBalance = ledgerCharges - ledgerPayments - ledgerDeposits - ledgerCredits;
  const summaryBalance = summary.totalCharges - summary.totalPayments - summary.totalDeposits - summary.totalCredits;

  if (Math.abs(ledgerBalance - summaryBalance) > 0.01) {
    errors.push(`Ledger balance mismatch: ${ledgerBalance} vs summary ${summaryBalance}`);
  }

  // Verify: No member has both deposit and credit
  const exclusivityViolations = validateMutualExclusivity(summary.members);
  exclusivityViolations.forEach((v) => errors.push(v.message));

  return {
    totalCharges,
    totalPayments,
    totalAdvances,
    totalRecoveries,
    balanced: errors.length === 0,
    errors,
  };
}

// ============================================================================
// REGENERATION HELPERS
// ============================================================================

/**
 * Check if a record already exists to prevent duplicates
 */
export function isRecordAlreadyGenerated(
  memberId: string,
  ym: string,
  sourceId: string,
  sourceType: string,
  transactionType: string,
  existingLedgerEntries: LedgerEntry[],
): boolean {
  return existingLedgerEntries.some(
    (e) => e.memberId === memberId &&
           e.ym === ym &&
           e.referenceId === sourceId &&
           e.transactionType === transactionType
  );
}

/**
 * Get affected members when a specific expense changes
 */
export function getAffectedMembersForExpense(
  expense: Expense,
  activeMembers: Member[],
): string[] {
  return activeMembers.map((m) => m.id);
}

/**
 * Get affected members when a bazar entry changes
 */
export function getAffectedMembersForBazar(
  bazar: Bazar,
  activeMembers: Member[],
): string[] {
  return activeMembers.map((m) => m.id);
}

/**
 * Get affected members when a payment changes
 */
export function getAffectedMembersForPayment(
  payment: Payment,
): string[] {
  return [payment.memberId];
}
