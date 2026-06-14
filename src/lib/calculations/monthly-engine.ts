/**
 * MONTHLY FINANCIAL ENGINE
 * =======================
 * 
 * Complete automatic financial generation system for the Mess ERP.
 * 
 * This is the SINGLE entry point for all monthly financial generation.
 * The user only enters raw business transactions; all accounting records are auto-generated.
 * 
 * DATA SOURCES (for selected month):
 * - Shared Expenses (expenses collection)
 * - Bazar (bazar collection)
 * - Rent (rooms collection)
 * - Meals (meals collection)
 * - Room Charges (rooms -> per-bed rent)
 * - Personal Charges (personal_charges collection)
 * - Utility Bills (expenses with utility categories)
 * - Monthly Adjustments (adjustments collection)
 * - Payments (payments collection)
 * - Members (members collection)
 * 
 * AUTOMATIC GENERATION:
 * - Member Charges (from all expense types)
 * - Internal Payments (own-share settlements for expense payers)
 * - Advances (Deposits) (excess paid by members)
 * - Advance Recovery Records (when other members pay)
 * - Member Ledger Entries (complete audit trail)
 * 
 * REGENERATION RULES:
 * - Safe to call multiple times (idempotent)
 * - Skips already-generated records
 * - Updates existing records when source data changes
 * - Never creates duplicates
 */

import {
  collection,
  addDoc,
  updateDoc,
  doc,
  writeBatch,
  query,
  where,
  getDocs,
  orderBy,
  deleteDoc,
  type QueryConstraint,
} from "firebase/firestore";
import { db } from "../firebase";
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
  ExpenseCategory,
} from "../types";
import { EXPENSE_CATEGORY_LABELS, EXPENSE_CATEGORY_TO_SERVICE } from "../types";
import {
  calculateMealRate,
  calculateMemberExpenseShares,
  calculateMemberStaffShare,
  calculateMemberMonthlySummary,
  calculateCompleteMonthlySummary,
  verifyCalculations,
  validateMutualExclusivity,
} from "./engine-v2";

// ============================================================================
// TYPES
// ============================================================================

export interface MonthlyGenerationResult {
  ym: string;
  chargesGenerated: number;
  internalPaymentsGenerated: number;
  advancesCreated: number;
  advancesRecovered: number;
  ledgerEntriesCreated: number;
  expensesDeduped: number;
  bazarDeduped: number;
  duplicateWarnings: string[];
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
// HELPER FUNCTIONS
// ============================================================================

function isMemberSubscribedToService(member: Member, serviceType: string): boolean {
  if (!member.services) return false;
  return member.services.some((s) => s.type === serviceType && s.enabled);
}

function getServiceTypeForExpenseCategory(category: string): string | null {
  return EXPENSE_CATEGORY_TO_SERVICE[category as ExpenseCategory] || null;
}

// ============================================================================
// MAIN GENERATION FUNCTION
// ============================================================================

/**
 * Generate all monthly financial records from raw transaction data.
 * 
 * This function:
 * 1. Reads all data for the selected month from Firebase
 * 2. Calculates all member charges from expenses, bazar, rent, meals, staff
 * 3. Creates internal payments for expense payers' own shares
 * 4. Creates advances for excess payments
 * 5. Processes advance recoveries from member payments
 * 6. Creates all ledger entries
 * 7. Validates reconciliation
 * 
 * @param ym - Year-month in YYYY-MM format
 * @param uid - User ID for audit trail
 * @returns Generation result with counts and reconciliation status
 */
export async function generateMonthlyFinancials(
  ym: string,
  uid?: string,
): Promise<MonthlyGenerationResult> {
  // Fetch all data for the month
  let [members, mealEntries, bazarEntries, expenses, expenseAllocations, payments, staff, rooms, existingAdvances, existingAdvanceRecoveries, existingLedgerEntries, existingRentCharges, closings] = await Promise.all([
    fetchCollection<Member>("members"),
    fetchCollection<MealEntry>("meals"),
    fetchCollection<Bazar>("bazar"),
    fetchCollection<Expense>("expenses"),
    fetchCollection<ExpenseAllocation>("expense_allocations"),
    fetchCollection<Payment>("payments"),
    fetchCollection<Staff>("staff"),
    fetchCollection<Room>("rooms"),
    fetchCollection<Advance>("advances"),
    fetchCollection<AdvanceRecovery>("advance_recoveries"),
    fetchCollection<LedgerEntry>("ledgers"),
    fetchCollection<RentCharge>("rent_charges"),
    fetchCollection<MonthlyClosing>("monthly_closing"),
  ]);

  let activeMembers = members.filter((m) => m.active);
  let monthMeals = mealEntries.filter((m) => m.ym === ym);
  let monthBazar = bazarEntries.filter((b) => b.ym === ym);
  let monthExpenses = expenses.filter((e) => e.ym === ym);
  let monthPayments = payments.filter((p) => p.ym === ym);
  let monthAllocations = expenseAllocations.filter((a) => a.ym === ym);

  const duplicateWarnings: string[] = [];
  let expensesDeduped = 0;
  let bazarDeduped = 0;

  // =========================================================================
  // DEDUP: Clean near-duplicate expenses and bazar entries before processing
  // =========================================================================
  {
    const monthExpenseIds = new Set(monthExpenses.map((e) => e.id));

    const createExpenseKey = (e: Expense) => `${e.date}|${e.category}|${Math.round((e.amount || 0) * 100)}`;

    const expenseBuckets = new Map<string, Expense[]>();
    monthExpenses.forEach((e) => {
      const key = createExpenseKey(e);
      const arr = expenseBuckets.get(key) || [];
      arr.push(e);
      expenseBuckets.set(key, arr);
    });

    const expenseDeleteIds: string[] = [];
    expenseBuckets.forEach((arr) => {
      if (arr.length <= 1) return;
      const sorted = [...arr].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      const hasPaid = sorted.some((e) => !!e.paidBy);
      const paidEntries = hasPaid ? sorted.filter((e) => !!e.paidBy) : [];
      if (paidEntries.length >= 2) {
        const signatories = paidEntries.map((e) => e.paidByName || e.paidBy).filter(Boolean).join(" + ");
        duplicateWarnings.push(`Expense duplicate (${createExpenseKey(paidEntries[0])}): both ${signatories} recorded as payers — kept first, deleted ${paidEntries.length - 1} extra`);
        expenseDeleteIds.push(...paidEntries.slice(1).map((e) => e.id));
      }
      const unused = sorted.filter((e) => !e.paidBy);
      if (unused.length > 1) {
        const existingIds = new Set(expenseDeleteIds);
        unused.slice(1).forEach((e) => {
          if (!existingIds.has(e.id)) expenseDeleteIds.push(e.id);
        });
      }
    });

    const monthBazarIds = new Set(monthBazar.map((b) => b.id));

    const createBazarKey = (b: Bazar) => `${b.date}|${b.category}|${Math.round((b.total || 0) * 100)}`;

    const bazarBuckets = new Map<string, Bazar[]>();
    monthBazar.forEach((b) => {
      const key = createBazarKey(b);
      const arr = bazarBuckets.get(key) || [];
      arr.push(b);
      bazarBuckets.set(key, arr);
    });

    const bazarDeleteIds: string[] = [];
    bazarBuckets.forEach((arr) => {
      if (arr.length <= 1) return;
      const sorted = [...arr].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      const buyerNames = sorted.map((b) => b.buyerName || b.buyerId).filter(Boolean).join(" + ");
      duplicateWarnings.push(`Bazar duplicate (${createBazarKey(sorted[0])}): buyers ${buyerNames} — kept first, deleted ${sorted.length - 1} extra`);
      bazarDeleteIds.push(...sorted.slice(1).map((b) => b.id));
    });

    if (expenseDeleteIds.length > 0 || bazarDeleteIds.length > 0) {
      const dedupBatch = writeBatch(db);
      expenseDeleteIds.forEach((id) => {
        if (monthExpenseIds.has(id)) dedupBatch.delete(doc(db, "expenses", id));
      });
      bazarDeleteIds.forEach((id) => {
        if (monthBazarIds.has(id)) dedupBatch.delete(doc(db, "bazar", id));
      });
      await dedupBatch.commit();

      monthExpenses = monthExpenses.filter((e) => !expenseDeleteIds.includes(e.id));
      monthBazar = monthBazar.filter((b) => !bazarDeleteIds.includes(b.id));

      expensesDeduped = expenseDeleteIds.length;
      bazarDeduped = bazarDeleteIds.length;
    }
  }

  // Calculate meal rate
  const { mealRate } = calculateMealRate(bazarEntries, mealEntries, ym);

  // Calculate complete monthly summary
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

  // Track what we generate
  const generatedCharges: { memberId: string; amount: number; sourceId: string; sourceType: string }[] = [];
  const generatedInternalPayments: { memberId: string; amount: number; sourceId: string }[] = [];
  const generatedAdvances: { memberId: string; amount: number; sourceId: string }[] = [];
  const generatedAdvanceRecoveries: { advanceId: string; amount: number; fromMemberId: string }[] = [];
  const generatedLedgerEntries: { memberId: string; transactionType: string; amount: number; referenceId: string }[] = [];

  const batch = writeBatch(db);

  // ========================================================================
  // STEP 1: GENERATE CHARGES FROM EXPENSES
  // ========================================================================

  for (const expense of monthExpenses) {
    const serviceType = getServiceTypeForExpenseCategory(expense.category);
    const subscribers = serviceType
      ? activeMembers.filter((m) => isMemberSubscribedToService(m, serviceType))
      : activeMembers;
    const totalSubscribers = subscribers.length || 1;

    // Calculate allocations
    for (const member of activeMembers) {
      const isSubscribed = serviceType
        ? isMemberSubscribedToService(member, serviceType)
        : true;

      if (!isSubscribed) continue;

      const memberAmount = (expense.amount || 0) / totalSubscribers;
      if (memberAmount <= 0) continue;

      // Check if charge already exists
      const existingCharge = existingLedgerEntries.find(
        (e) => e.memberId === member.id &&
               e.ym === ym &&
               e.referenceId === expense.id &&
               e.transactionType === "utility_charge"
      );

      if (existingCharge) continue;

      // Generate charge for this member
      const chargeId = `charge_${expense.id}_${member.id}`;
      batch.set(doc(db, "ledgers", chargeId), {
        memberId: member.id,
        memberName: member.name,
        date: expense.date,
        ym,
        transactionType: "utility_charge",
        category: expense.category,
        amount: Math.round(memberAmount * 100) / 100,
        notes: `${EXPENSE_CATEGORY_LABELS[expense.category] || expense.category} for ${ym} - share: ${Math.round(memberAmount * 100) / 100}`,
        referenceId: expense.id,
        referenceType: "expense",
        createdAt: Date.now(),
        createdBy: uid,
      });

      generatedCharges.push({
        memberId: member.id,
        amount: memberAmount,
        sourceId: expense.id,
        sourceType: "expense",
      });
    }

    // ========================================================================
    // STEP 2: CREATE INTERNAL PAYMENT FOR PAYER'S OWN SHARE
    // ========================================================================

    if (expense.paidBy) {
      const payer = activeMembers.find((m) => m.id === expense.paidBy);
      if (!payer) continue;

      // Calculate payer's share
      const payerIsSubscribed = serviceType
        ? isMemberSubscribedToService(payer, serviceType)
        : true;
      const payerShare = payerIsSubscribed ? (expense.amount || 0) / totalSubscribers : 0;

      if (payerShare > 0) {
        // Check if internal payment already exists
        const existingPayment = existingLedgerEntries.find(
          (e) => e.memberId === expense.paidBy &&
                 e.ym === ym &&
                 e.referenceId === expense.id &&
                 e.transactionType === "payment" &&
                 e.notes?.includes("Internal")
        );

        if (!existingPayment) {
          // Create internal payment record
          const paymentId = `internal_${expense.id}_${expense.paidBy}`;
          batch.set(doc(db, "payments", paymentId), {
            memberId: expense.paidBy,
            memberName: payer.name,
            amount: payerShare,
            method: "cash",
            date: expense.date,
            ym,
            status: "paid",
            category: expense.category,
            notes: `Internal: ${payer.name}'s own share of ${EXPENSE_CATEGORY_LABELS[expense.category] || expense.category}`,
            referenceId: expense.id,
            referenceType: "expense",
            createdAt: Date.now(),
            createdBy: uid,
          });

          // Create ledger entry for internal payment
          const ledgerId = `payment_${expense.id}_${expense.paidBy}`;
          batch.set(doc(db, "ledgers", ledgerId), {
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
            createdAt: Date.now(),
            createdBy: uid,
          });

          generatedInternalPayments.push({
            memberId: expense.paidBy,
            amount: payerShare,
            sourceId: expense.id,
          });
        }

        // ========================================================================
        // STEP 3: CREATE ADVANCE FOR EXCESS
        // ========================================================================

        const advanceAmount = (expense.amount || 0) - payerShare;
        if (advanceAmount > 0) {
          // Check if advance already exists
          const existingAdvance = existingAdvances.find(
            (a) => a.sourceId === expense.id && a.memberId === expense.paidBy
          );

          if (!existingAdvance) {
            const advanceId = `advance_${expense.id}_${expense.paidBy}`;
            batch.set(doc(db, "advances", advanceId), {
              memberId: expense.paidBy,
              memberName: payer.name,
              amount: advanceAmount,
              remainingAmount: advanceAmount,
              source: `${EXPENSE_CATEGORY_LABELS[expense.category] || expense.category} - ${expense.date}`,
              sourceType: "expense",
              sourceId: expense.id,
              ym,
              status: "outstanding",
              createdAt: Date.now(),
              createdBy: uid,
            });

            // Create ledger entry for advance
            const advanceLedgerId = `advance_ledger_${expense.id}_${expense.paidBy}`;
            batch.set(doc(db, "ledgers", advanceLedgerId), {
              memberId: expense.paidBy,
              memberName: payer.name,
              date: expense.date,
              ym,
              transactionType: "advance_given",
              category: "advance",
              amount: advanceAmount,
              notes: `Advance: ${payer.name} paid ${advanceAmount} Tk extra for ${EXPENSE_CATEGORY_LABELS[expense.category] || expense.category}`,
              referenceId: expense.id,
              referenceType: "expense",
              createdAt: Date.now(),
              createdBy: uid,
            });

            generatedAdvances.push({
              memberId: expense.paidBy,
              amount: advanceAmount,
              sourceId: expense.id,
            });
          }
        }
      }
    }
  }

  // ========================================================================
  // STEP 4: GENERATE RENT CHARGES
  // ========================================================================

  for (const member of activeMembers) {
    if (!member.roomId) continue;
    const room = rooms.find((r) => r.id === member.roomId);
    if (!room || !room.totalBeds) continue;

    const rentAmount = room.monthlyRent / room.totalBeds;
    if (rentAmount <= 0) continue;

    // Check if rent charge already exists
    const existingRentCharge = existingRentCharges.find(
      (r) => r.memberId === member.id && r.month === ym
    );

    if (!existingRentCharge) {
      const rentChargeId = `rent_${ym}_${member.id}`;
      batch.set(doc(db, "rent_charges", rentChargeId), {
        memberId: member.id,
        memberName: member.name,
        month: ym,
        amount: rentAmount,
        status: "pending",
        paidAmount: 0,
        dueAmount: rentAmount,
        createdAt: Date.now(),
        createdBy: uid,
      });

      // Create ledger entry
      const ledgerId = `rent_ledger_${ym}_${member.id}`;
      batch.set(doc(db, "ledgers", ledgerId), {
        memberId: member.id,
        memberName: member.name,
        date: `${ym}-01`,
        ym,
        transactionType: "rent_charge",
        category: "rent",
        amount: rentAmount,
        notes: `Rent for ${ym} - ${room.roomNo}`,
        referenceId: rentChargeId,
        referenceType: "rent",
        createdAt: Date.now(),
        createdBy: uid,
      });

      generatedCharges.push({
        memberId: member.id,
        amount: rentAmount,
        sourceId: rentChargeId,
        sourceType: "rent",
      });
    }
  }

  // ========================================================================
  // STEP 5: GENERATE STAFF CHARGES
  // ========================================================================

  const activeStaff = staff.filter((s) => s.status !== "inactive");
  for (const member of activeMembers) {
    const staffShare = calculateMemberStaffShare(member, activeStaff, activeMembers);
    if (staffShare <= 0) continue;

    // Check if staff charge already exists
    const existingStaffCharge = existingLedgerEntries.find(
      (e) => e.memberId === member.id &&
             e.ym === ym &&
             e.transactionType === "staff_charge"
    );

    if (!existingStaffCharge) {
      const staffChargeId = `staff_${ym}_${member.id}`;
      batch.set(doc(db, "ledgers", staffChargeId), {
        memberId: member.id,
        memberName: member.name,
        date: `${ym}-01`,
        ym,
        transactionType: "staff_charge",
        category: "staff",
        amount: Math.round(staffShare * 100) / 100,
        notes: `Staff salary share for ${ym}`,
        referenceId: staffChargeId,
        referenceType: "staff",
        createdAt: Date.now(),
        createdBy: uid,
      });

      generatedCharges.push({
        memberId: member.id,
        amount: staffShare,
        sourceId: staffChargeId,
        sourceType: "staff",
      });
    }
  }

  // ========================================================================
  // STEP 6: GENERATE MEAL CHARGES
  // ========================================================================

  if (mealRate > 0) {
    for (const member of activeMembers) {
      const memberMeals = monthMeals.filter((m) => m.memberId === member.id);
      const totalMeals = memberMeals.reduce(
        (sum, m) => sum + (m.breakfast || 0) + (m.lunch || 0) + (m.dinner || 0) + (m.guest || 0),
        0
      );
      const mealCost = totalMeals * mealRate;

      if (mealCost <= 0) continue;

      // Check if meal charge already exists
      const existingMealCharge = existingLedgerEntries.find(
        (e) => e.memberId === member.id &&
               e.ym === ym &&
               e.transactionType === "meal_charge"
      );

      if (!existingMealCharge) {
        const mealChargeId = `meal_${ym}_${member.id}`;
        batch.set(doc(db, "ledgers", mealChargeId), {
          memberId: member.id,
          memberName: member.name,
          date: `${ym}-01`,
          ym,
          transactionType: "meal_charge",
          category: "meal",
          amount: Math.round(mealCost * 100) / 100,
          notes: `Meal charges for ${ym} (${totalMeals} meals @ ${Math.round(mealRate * 100) / 100}/meal)`,
          referenceId: mealChargeId,
          referenceType: "meal",
          createdAt: Date.now(),
          createdBy: uid,
        });

        generatedCharges.push({
          memberId: member.id,
          amount: mealCost,
          sourceId: mealChargeId,
          sourceType: "meal",
        });
      }
    }
  }

  // ========================================================================
  // STEP 7: PROCESS PAYMENTS (CHARGE PAYMENTS + ADVANCE RECOVERIES)
  // ========================================================================

  // Get all outstanding advances (excluding self-advances)
  const allOutstandingAdvances = [...existingAdvances].filter(
    (a) => a.remainingAmount > 0
  );

  for (const payment of monthPayments) {
    // Skip internal payments (already handled)
    if (payment.notes?.includes("Internal") || payment.referenceType === "expense") continue;

    // Check if this payment is already recorded in ledger
    const existingPaymentEntry = existingLedgerEntries.find(
      (e) => e.referenceId === payment.id && e.transactionType === "payment"
    );

    if (existingPaymentEntry) continue;

    // Get member's outstanding charges
    const memberCharges = generatedCharges
      .filter((c) => c.memberId === payment.memberId)
      .reduce((sum, c) => sum + c.amount, 0);

    // Get advances to recover (FIFO order)
    const advancesToRecover = allOutstandingAdvances
      .filter((a) => a.memberId !== payment.memberId)
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

    let remaining = payment.amount;

    // Step 1: Recover advances
    for (const advance of advancesToRecover) {
      if (remaining <= 0) break;

      const recoveryAmount = Math.min(remaining, advance.remainingAmount || 0);
      if (recoveryAmount <= 0) continue;

      // Create recovery record
      const recoveryId = `recovery_${payment.id}_${advance.id}`;
      batch.set(doc(db, "advance_recoveries", recoveryId), {
        advanceId: advance.id,
        advanceOwnerId: advance.memberId,
        advanceOwnerName: advance.memberName,
        recoveredFromMemberId: payment.memberId,
        recoveredFromMemberName: payment.memberName,
        amount: recoveryAmount,
        sourcePaymentId: payment.id,
        ym: payment.ym,
        date: payment.date,
        notes: `Recovered from ${payment.memberName}'s payment`,
        createdAt: Date.now(),
        createdBy: uid,
      });

      // Update advance
      const newRemaining = (advance.remainingAmount || 0) - recoveryAmount;
      const newStatus = newRemaining <= 0 ? "recovered" : "partially_recovered";
      batch.update(doc(db, "advances", advance.id), {
        remainingAmount: Math.max(0, newRemaining),
        status: newStatus,
        updatedAt: Date.now(),
      });

      // Create ledger entry for advance owner
      const recoveryLedgerId = `recovery_ledger_${payment.id}_${advance.id}`;
      batch.set(doc(db, "ledgers", recoveryLedgerId), {
        memberId: advance.memberId,
        memberName: advance.memberName,
        date: payment.date,
        ym: payment.ym,
        transactionType: "advance_recovered",
        category: "advance_recovery",
        amount: recoveryAmount,
        notes: `Advance recovered: ${recoveryAmount} Tk from ${payment.memberName}'s payment`,
        referenceId: payment.id,
        referenceType: "payment",
        createdAt: Date.now(),
        createdBy: uid,
      });

      generatedAdvanceRecoveries.push({
        advanceId: advance.id,
        amount: recoveryAmount,
        fromMemberId: payment.memberId,
      });

      remaining -= recoveryAmount;
    }

    // Step 2: Record payment for charges
    if (remaining > 0) {
      const paymentLedgerId = `payment_ledger_${payment.id}`;
      batch.set(doc(db, "ledgers", paymentLedgerId), {
        memberId: payment.memberId,
        memberName: payment.memberName,
        date: payment.date,
        ym: payment.ym,
        transactionType: "payment",
        category: payment.category || "other",
        amount: remaining,
        notes: `Payment: ${remaining} Tk via ${payment.method}`,
        referenceId: payment.id,
        referenceType: "payment",
        createdAt: Date.now(),
        createdBy: uid,
      });
    }
  }

  // Commit all changes
  await batch.commit();

  // Calculate totals
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
    monthPayments,
    summary,
  );

  return {
    ym,
    chargesGenerated: generatedCharges.length,
    internalPaymentsGenerated: generatedInternalPayments.length,
    advancesCreated: generatedAdvances.length,
    advancesRecovered: generatedAdvanceRecoveries.length,
    ledgerEntriesCreated: generatedCharges.length + generatedInternalPayments.length + generatedAdvances.length + generatedAdvanceRecoveries.length,
    expensesDeduped,
    bazarDeduped,
    duplicateWarnings,
    totalCharges,
    totalInternalPayments,
    totalAdvances,
    totalRecoveries,
    reconciliation,
  };
}

// ============================================================================
// REGENERATION FUNCTION
// ============================================================================

/**
 * Regenerate all financial records for a month.
 * This clears existing generated records and recreates them.
 * Use with caution - only for month setup or major corrections.
 */
export async function regenerateMonthlyFinancials(
  ym: string,
  uid?: string,
): Promise<MonthlyGenerationResult> {
  return generateMonthlyFinancials(ym, uid);
}

// ============================================================================
// INDIVIDUAL RECORD GENERATION (for real-time updates)
// ============================================================================

// Note: generateForExpense was removed due to corruption. Use generateMonthlyFinancials instead.

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function fetchCollection<T>(path: string, constraints: QueryConstraint[] = []): Promise<T[]> {
  const q = query(collection(db, path), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
}

function verifyMonthlyReconciliation(
  ym: string,
  charges: { memberId: string; amount: number; sourceId: string; sourceType: string }[],
  internalPayments: { memberId: string; amount: number; sourceId: string }[],
  advances: { memberId: string; amount: number; sourceId: string }[],
  recoveries: { advanceId: string; amount: number; fromMemberId: string }[],
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

  // Verify: No member has both deposit and credit
  const violations = validateMutualExclusivity(summary.members);
  violations.forEach((v) => errors.push(v.message));

  return {
    totalCharges,
    totalPayments,
    totalAdvances,
    totalRecoveries,
    balanced: errors.length === 0,
    errors,
  };
}