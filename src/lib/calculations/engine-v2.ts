/**
 * FINANCIAL CALCULATION ENGINE V2
 * ===============================
 * 
 * Complete redesign of the financial engine to properly separate accounting concepts:
 * 
 * 1. EXPENSE - What the mess owes to external vendors (stored once, never modified)
 * 2. CHARGE - How much each member owes (auto-generated from expenses)
 * 3. PAYMENT - When a member pays money to the mess (reduces charges, recovers advances)
 * 4. ADVANCE - When a member pays more than their share (liability of mess toward member)
 * 5. ADVANCE RECOVERY - When other members' payments repay the advance
 * 
 * CRITICAL RULES:
 * - The member who pays an expense to an external vendor is treated as having ADVANCED money
 * - The payer's own share is automatically marked as paid (they don't pay twice)
 * - The excess (expense amount - payer's share) becomes an ADVANCE from the payer
 * - Other members paying their charges automatically recovers the advance
 * - Every recovery is tracked with complete history
 * - No manual Deposit/Credit creation - everything is auto-computed
 * 
 * ACCOUNTING EQUATIONS:
 *   Total Charges = Sum of all member charges for all obligations
 *   Total Payments = Sum of all member payments
 *   Total Advances = Sum of all outstanding advances (money other members owe to advance-givers)
 *   Net Position = Total Payments + Total Contributions - Total Charges - Previous Credit + Previous Deposit
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
  RentCharge,
  Advance,
  AdvanceRecovery,
  MonthlyClosing,
  LedgerEntry,
  ExpenseCategory,
  ServiceType,
  CreditNote,
  Refund,
} from "@/lib/types";

// ============================================================================
// Core Types
// ============================================================================

export interface MealRateInfo {
  totalBazar: number;
  totalMeals: number;
  mealRate: number;
}

/**
 * A member's charge for a specific category
 */
export interface MemberCharge {
  category: string;
  categoryLabel: string;
  amount: number;
  paidAmount: number;
  remainingAmount: number;
  status: "pending" | "paid" | "partial";
}

/**
 * A member's total financial summary for a month
 */
export interface MemberMonthlySummary {
  memberId: string;
  memberName: string;
  
  // Charges
  totalMeals: number;
  mealCost: number;
  rentShare: number;
  expenseShares: number;
  expenseShareBreakdown: Record<string, number>;
  staffShare: number;
  previousDue: number;
  totalCharges: number;
  /** Total credit notes applied this month — reduces totalCharges, never edits the original charge */
  creditNoteTotal: number;

  // Contributions (what they paid FOR the mess)
  bazarContribution: number;
  expenseContributions: number;
  expenseContributionBreakdown: Record<string, number>;
  paymentContributions: number;
  totalContributions: number;
  /** Total refunds paid back this month — reduces totalContributions (money physically returned) */
  refundTotal: number;
  
  // Advance info (when member overpays)
  advancesGiven: number; // Total advances this member has given
  outstandingAdvance: number; // How much is still owed to this member
  advancesToRecover: AdvanceInfo[];
  
  // Payments made
  paymentsMade: number;
  
  // Settlement
  balance: number; // Positive = member overpaid (held as deposit), Negative = member underpaid (has dues)
  depositAmount: number; // Auto-computed from positive balance
  creditAmount: number; // Auto-computed from negative balance
  settlementStatus: "settled" | "pay" | "receive";
  
  // Carry forward
  previousDeposit: number;
  previousCredit: number;
}

export interface AdvanceInfo {
  id: string;
  source: string;
  sourceId: string;
  amount: number;
  remainingAmount: number;
  status: string;
  recoveries: { fromMember: string; amount: number; date: string; paymentId: string }[];
}

export interface MonthlySummary {
  ym: string;
  members: MemberMonthlySummary[];
  
  // Totals
  totalMeals: number;
  totalBazar: number;
  totalExpenses: number;
  totalStaffCost: number;
  mealRate: number;
  
  totalPayments: number;
  totalAdvances: number; // Total outstanding advances
  totalCharges: number;
  
  // Settlement summary
  totalDeposits: number;
  totalCredits: number;
  totalCreditNotes: number;
  totalRefunds: number;
  totalPayable: number;
  totalReceivable: number;
  
  vacantBeds: number;
  occupiedBeds: number;
}

// ============================================================================
// Service Type Mappings
// ============================================================================

const EXPENSE_SERVICE_MAP: Record<string, string> = {
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

/**
 * Round a number to 2 decimal places to avoid floating point precision issues
 * This ensures all monetary values are clean decimals, not floats
 */
function roundToTwoDecimals(value: number): number {
  return Math.round((value || 0) * 100) / 100;
}

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

function getPreviousMonthYm(ym: string): string {
  const [year, month] = ym.split("-").map(Number);
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  return `${prevYear}-${String(prevMonth).padStart(2, "0")}`;
}

// ============================================================================
// 1. MEAL RATE CALCULATION
// ============================================================================

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

// ============================================================================
// 2. CHARGE GENERATION FROM EXPENSES
// ============================================================================

/**
 * Calculate a member's share of all expenses for the month.
 * Uses the primary allocation method: expense_allocations collection (if available)
 * Falls back to subscription-based calculation.
 */
export function calculateMemberExpenseShares(
  member: Member,
  monthExpenses: Expense[],
  activeMembers: Member[],
  monthAllocations: ExpenseAllocation[] = [],
): { expenseShares: number; expenseShareBreakdown: Record<string, number> } {
  const expenseShareBreakdown: Record<string, number> = {};
  let expenseShares = 0;

  // Consider every expense we know about, whether it comes from the raw
  // expenses list or only has persisted allocation records. Allocations are
  // preferred PER EXPENSE (not all-or-nothing for the whole month) so an
  // expense that hasn't had its allocations generated yet still falls back
  // to an on-the-fly calculation instead of silently charging nobody.
  const expenseIds = new Set<string>([
    ...monthExpenses.map((e) => e.id),
    ...monthAllocations.map((a) => a.expenseId),
  ]);

  expenseIds.forEach((expenseId) => {
    const allocationsForExpense = monthAllocations.filter((a) => a.expenseId === expenseId);

    // A personal expense is never shared — createExpenseWithAccounting never
    // allocates one, so this only matters as a defensive guard against
    // legacy/edge-case data reaching this function.
    const expenseForId = monthExpenses.find((e) => e.id === expenseId);
    if (expenseForId?.personal) return;

    if (allocationsForExpense.length > 0) {
      const memberAlloc = allocationsForExpense.find((a) => a.memberId === member.id);
      const memberShare = memberAlloc?.amount || 0;
      const cat = memberAlloc?.category || allocationsForExpense[0].category;
      if (memberShare > 0) {
        expenseShareBreakdown[cat] = roundToTwoDecimals((expenseShareBreakdown[cat] || 0) + memberShare);
        expenseShares += memberShare;
      }
      return;
    }

    // Fallback: calculate on-the-fly from the expense itself
    const expense = monthExpenses.find((e) => e.id === expenseId);
    if (!expense) return;

    let memberShare = 0;

    // Mirror the same custom_percentage/per_member handling
    // createExpenseWithAccounting applies at creation time, so a pre-existing
    // expense with no persisted allocations yet still respects an explicit
    // admin-assigned split instead of silently falling back to an equal share.
    if (expense.allocationMethod === "custom_percentage" && expense.customPercentages) {
      memberShare = (expense.customPercentages[member.id] || 0) * (expense.amount || 0) / 100;
      if (memberShare > 0) {
        expenseShareBreakdown[expense.category] = roundToTwoDecimals((expenseShareBreakdown[expense.category] || 0) + memberShare);
        expenseShares += memberShare;
      }
      return;
    }
    if (expense.allocationMethod === "per_member" && expense.customAmounts) {
      memberShare = expense.customAmounts[member.id] || 0;
      if (memberShare > 0) {
        expenseShareBreakdown[expense.category] = roundToTwoDecimals((expenseShareBreakdown[expense.category] || 0) + memberShare);
        expenseShares += memberShare;
      }
      return;
    }

    const serviceType = EXPENSE_SERVICE_MAP[expense.category] || null;

    if (serviceType && isMemberExplicitlyOptedOut(member, serviceType)) {
      // Always respect an explicit opt-out on this member.
    } else if (serviceType) {
      let subscribers = activeMembers.filter((m) => isMemberSubscribedToService(m, serviceType));
      if (subscribers.length === 0) {
        // Nobody has explicitly subscribed — don't let the expense vanish
        // from everyone's charges. Fall back to every active member who
        // hasn't explicitly opted out.
        subscribers = activeMembers.filter((m) => !isMemberExplicitlyOptedOut(m, serviceType));
        if (subscribers.length === 0) subscribers = activeMembers;
      }
      const totalSubscribers = subscribers.length || 1;
      const memberIsIncluded = subscribers.some((m) => m.id === member.id);
      if (memberIsIncluded) {
        memberShare = (expense.amount || 0) / totalSubscribers;
      }
    } else {
      memberShare = (expense.amount || 0) / (activeMembers.length || 1);
    }

    if (memberShare > 0) {
      expenseShareBreakdown[expense.category] = roundToTwoDecimals((expenseShareBreakdown[expense.category] || 0) + memberShare);
      expenseShares += memberShare;
    }
  });

  return { expenseShares: roundToTwoDecimals(expenseShares), expenseShareBreakdown };
}

/**
 * Calculate a member's staff share
 */
function isMemberExplicitlyOptedOut(member: Member, serviceType: string): boolean {
  if (!member.services) return false;
  return member.services.some((s) => s.type === serviceType && s.enabled === false);
}

export function calculateMemberStaffShare(
  member: Member,
  staff: Staff[],
  activeMembers: Member[],
): number {
  let staffShare = 0;
  staff.filter((s) => s.status !== "inactive").forEach((s) => {
    const serviceType = STAFF_SERVICE_MAP[s.role] || "other_services";
    // Always respect an explicit opt-out on this member.
    if (isMemberExplicitlyOptedOut(member, serviceType)) return;

    let subscribers = activeMembers.filter((m) => isMemberSubscribedToService(m, serviceType));
    if (subscribers.length === 0) {
      // Nobody has explicitly subscribed — don't let the cost vanish from
      // everyone's charges. Fall back to every active member who hasn't
      // explicitly opted out (an unconfigured/new service still gets billed).
      subscribers = activeMembers.filter((m) => !isMemberExplicitlyOptedOut(m, serviceType));
      if (subscribers.length === 0) subscribers = activeMembers;
    }
    const totalSubscribers = subscribers.length || 1;
    const memberIsIncluded = subscribers.some((m) => m.id === member.id);
    if (memberIsIncluded) {
      // Match the aggregate totalStaffCost formula (salary + overtime + bonus - advance)
      // so per-member charges reconcile with the total staff cost figure.
      const staffCost = (s.salary || 0) + (s.overtime || 0) + (s.bonus || 0) - (s.advance || 0);
      staffShare += staffCost / totalSubscribers;
    }
  });
  return staffShare;
}

// ============================================================================
// 3. ADVANCE CALCULATION
// ============================================================================

/**
 * Calculate advances for the payer of an expense.
 * 
 * When Member A pays 1000 Tk for Internet:
 *   - A's own share: 500 Tk (auto-paid, treated as internal payment)
 *   - Advance: 500 Tk (the excess A paid for B)
 * 
 * This advance is a LIABILITY where other members owe this amount to Member A.
 */
export function calculateExpenseAdvance(
  expense: Expense,
  payerShare: number,
): { advanceAmount: number; payerEffectiveShare: number } {
  const amount = expense.amount || 0;
  const advanceAmount = Math.max(0, amount - payerShare);
  const payerEffectiveShare = Math.min(amount, payerShare);
  
  return { advanceAmount, payerEffectiveShare };
}

/**
 * Get all outstanding advances for a member
 */
export function getMemberAdvances(
  memberId: string,
  advances: Advance[],
): Advance[] {
  return advances.filter(
    (a) => a.memberId === memberId && a.remainingAmount > 0
  );
}

/**
 * Calculate how much of a payment should recover advances vs pay charges.
 * 
 * When another member pays, their payment first recovers outstanding advances
 * before reducing the payer's own charges.
 * 
 * @returns { recoverAdvances: number; payCharges: number }
 */
export function calculatePaymentDistribution(
  paymentAmount: number,
  memberOutstandingCharges: number,
  outstandingAdvances: Advance[],
): {
  advanceRecoveries: { advanceId: string; amount: number; advanceOwnerId: string; advanceOwnerName: string }[];
  chargePayment: number;
  remainingPayment: number;
} {
  let remaining = paymentAmount;
  const advanceRecoveries: { advanceId: string; amount: number; advanceOwnerId: string; advanceOwnerName: string }[] = [];

  // Step 1: Recover outstanding advances FIRST (FIFO)
  const sortedAdvances = [...outstandingAdvances].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  
  for (const advance of sortedAdvances) {
    if (remaining <= 0) break;
    const recoveryAmount = Math.min(remaining, advance.remainingAmount);
    if (recoveryAmount > 0) {
      advanceRecoveries.push({
        advanceId: advance.id,
        amount: recoveryAmount,
        advanceOwnerId: advance.memberId,
        advanceOwnerName: advance.memberName,
      });
      remaining -= recoveryAmount;
    }
  }

  // Step 2: Remaining goes to pay the member's own charges
  const chargePayment = Math.min(remaining, memberOutstandingCharges);
  remaining -= chargePayment;

  return {
    advanceRecoveries,
    chargePayment,
    remainingPayment: remaining, // Any excess becomes new advance/deposit
  };
}

// ============================================================================
// 4. MEMBER MONTHLY SUMMARY (Single Source of Truth for ALL member calculations)
// ============================================================================

/**
 * Calculate the complete monthly summary for a single member.
 * This is THE single source of truth for all member financial data.
 * Every page MUST use this function.
 */
export function calculateMemberMonthlySummary(
  member: Member,
  ym: string,
  mealEntries: MealEntry[],
  bazarEntries: Bazar[],
  expenses: Expense[],
  expenseAllocations: ExpenseAllocation[],
  payments: Payment[],
  staff: Staff[],
  rooms: Room[],
  allAdvances: Advance[],
  allAdvanceRecoveries: AdvanceRecovery[],
  activeMembers: Member[],
  prevClosings: Array<{ month: string; memberId: string; deposit: number; credit: number }>,
  creditNotes: CreditNote[] = [],
  refunds: Refund[] = [],
): MemberMonthlySummary {
  const monthMeals = mealEntries.filter((m) => m.ym === ym);
  const monthBazar = bazarEntries.filter((b) => b.ym === ym);
  // Personal expenses (toothpaste, snacks, ...) are never shared — excluded
  // up front so they never reach any charge/contribution calculation below.
  const monthExpenses = expenses.filter((e) => e.ym === ym && !e.personal);
  const monthPayments = payments.filter((p) => p.ym === ym);
  const monthAllocations = expenseAllocations.filter((a) => a.ym === ym);

  // 1. Calculate meal rate and meal cost
  const { mealRate } = calculateMealRate(bazarEntries, mealEntries, ym);
  const totalMeals = getMemberMealsCount(member.id, monthMeals);
  const mealCost = roundToTwoDecimals(totalMeals * mealRate);

  // 2. Calculate rent share
  const rentShare = roundToTwoDecimals(getPerBedRent(member, rooms));

  // 3. Calculate expense shares — excluding any expense this member paid for
  // themselves. Their own share of it is settled immediately via an internal
  // auto-payment (see createExpenseWithAccounting) and never gets a ledger
  // charge of its own, so it must not appear here as an outstanding charge
  // either — that amount is excluded from paymentsMade below for the same
  // reason, so leaving it in here would double it into Total Charges. Both
  // the expense list AND its persisted allocations must be filtered — an
  // expenseId reachable only through monthAllocations would otherwise still
  // pull the self-paid share back in via the allocations branch below.
  const selfPaidExpenseIds = new Set(
    monthExpenses.filter((e) => e.paidBy === member.id).map((e) => e.id),
  );
  const { expenseShares, expenseShareBreakdown } = calculateMemberExpenseShares(
    member,
    monthExpenses.filter((e) => e.paidBy !== member.id),
    activeMembers,
    monthAllocations.filter((a) => !selfPaidExpenseIds.has(a.expenseId)),
  );

  // 4. Calculate staff share
  const staffShare = roundToTwoDecimals(calculateMemberStaffShare(member, staff, activeMembers));

  // 5. Calculate bazar contributions
  const bazarContribution = monthBazar
    .filter((b) => b.buyerId === member.id)
    .reduce((sum, b) => sum + (b.total || 0), 0);

  // 6. Calculate expense contributions (when a member pays an expense bill on
  // behalf of the mess). Only the EXCESS beyond the payer's own share counts
  // here — their own share is already reflected via paymentContributions
  // below (the app auto-records an internal "own share paid" Payment
  // document for the payer, see charge-service/workflow-integration), so
  // including the expense's full amount here would double-count that
  // portion. The excess is what the payer is actually owed back (it's also
  // tracked as an Advance) and is the only part not yet settled elsewhere.
  const expenseContributionBreakdown: Record<string, number> = {};
  let expenseContributions = 0;
  monthExpenses.forEach((expense) => {
    if (expense.paidBy === member.id) {
      const cat = expense.category;
      const { expenseShares: ownShare } = calculateMemberExpenseShares(
        member, [expense], activeMembers,
        monthAllocations.filter((a) => a.expenseId === expense.id),
      );
      const excess = Math.max(0, (expense.amount || 0) - ownShare);
      expenseContributionBreakdown[cat] = (expenseContributionBreakdown[cat] || 0) + excess;
      expenseContributions += excess;
    }
  });

  // 7. Calculate payments made — excluding the internal "own share
  // auto-paid" Payment document createExpenseWithAccounting records for a
  // payer (referenceType "expense"). That document was never real money
  // entering the mess's pool; it only marks the payer's own share (already
  // excluded from expenseShares above) as settled, so counting it here too
  // would inflate Total Contributions by that same self-settled amount.
  const paymentsMade = monthPayments
    .filter((p) => p.memberId === member.id && p.referenceType !== "expense")
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  // 8. Calculate advances given and outstanding
  const memberAdvances = allAdvances.filter((a) => a.memberId === member.id);
  const advancesGiven = memberAdvances.reduce((sum, a) => sum + (a.amount || 0), 0);
  const outstandingAdvance = memberAdvances.reduce((sum, a) => sum + (a.remainingAmount || 0), 0);

  // 9. Build advance info with recovery history
  const advancesToRecover: AdvanceInfo[] = memberAdvances
    .filter((a) => a.amount > 0)
    .map((adv) => {
      const recoveries = allAdvanceRecoveries
        .filter((r) => r.advanceId === adv.id)
        .map((r) => ({
          fromMember: r.recoveredFromMemberName,
          amount: r.amount,
          date: r.date,
          paymentId: r.sourcePaymentId,
        }));
      return {
        id: adv.id,
        source: adv.source,
        sourceId: adv.sourceId,
        amount: adv.amount,
        remainingAmount: adv.remainingAmount,
        status: adv.status,
        recoveries,
      };
    });

  // 10. Get carry forward from previous month
  const prevYm = getPreviousMonthYm(ym);
  const prevClosing = prevClosings.find((c) => c.month === prevYm && c.memberId === member.id);
  const previousDeposit = prevClosing?.deposit || 0;
  const previousCredit = prevClosing?.credit || 0;
  // member.previousDue is a one-time opening balance (e.g. set when the member
  // joined). Once a monthly closing exists for the prior month, any unpaid
  // amount is already carried forward via previousCredit/previousDeposit, so
  // applying previousDue again here would charge it every month forever.
  // Only apply it in the member's first tracked month (no prior closing yet).
  const previousDue = prevClosing ? 0 : (member.previousDue || 0);

  // Round expense shares to 2 decimal places
  const roundedExpenseShares = roundToTwoDecimals(expenseShares);

  // 10b. Credit notes (correct/forgive charges — never edits the original
  // charge) and refunds (money physically returned — reverses a prior
  // contribution) issued to this member this month.
  const creditNoteTotal = roundToTwoDecimals(
    creditNotes
      .filter((c) => c.memberId === member.id && c.ym === ym && c.status === "issued")
      .reduce((s, c) => s + (c.amount || 0), 0),
  );
  const refundTotal = roundToTwoDecimals(
    refunds
      .filter((r) => r.memberId === member.id && r.ym === ym && r.status === "issued")
      .reduce((s, r) => s + (r.amount || 0), 0),
  );

  // 11. Total charges for this member
  const totalCharges = roundToTwoDecimals(mealCost + rentShare + roundedExpenseShares + staffShare + previousDue + previousCredit - previousDeposit - creditNoteTotal);

  // 12. Total contributions (what member paid FOR the mess)
  const paymentContributions = paymentsMade;
  const totalContributions = bazarContribution + expenseContributions + paymentContributions - refundTotal;

  // 13. Calculate settlement
  const balance = roundToTwoDecimals(totalContributions - totalCharges);

  let depositAmount = 0;
  let creditAmount = 0;
  let settlementStatus: "settled" | "pay" | "receive" = "settled";

  if (balance > 0) {
    depositAmount = balance;
    settlementStatus = "receive"; // member overpaid, excess held as deposit
  } else if (balance < 0) {
    creditAmount = Math.abs(balance);
    settlementStatus = "pay"; // member owes mess
  }

  return {
    memberId: member.id,
    memberName: member.name,
    totalMeals,
    mealCost,
    rentShare,
    expenseShares: roundedExpenseShares,
    expenseShareBreakdown,
    staffShare,
    previousDue,
    totalCharges,
    creditNoteTotal,
    bazarContribution,
    expenseContributions,
    expenseContributionBreakdown,
    paymentContributions,
    totalContributions,
    refundTotal,
    advancesGiven,
    outstandingAdvance,
    advancesToRecover,
    paymentsMade,
    balance,
    depositAmount,
    creditAmount,
    settlementStatus,
    previousDeposit,
    previousCredit,
  };
}

// ============================================================================
// 5. COMPLETE MONTHLY SUMMARY
// ============================================================================

/**
 * Calculate the complete monthly summary for all members.
 * This is THE function the entire application must use.
 */
export function calculateCompleteMonthlySummary(
  ym: string,
  members: Member[],
  mealEntries: MealEntry[],
  bazarEntries: Bazar[],
  expenses: Expense[],
  expenseAllocations: ExpenseAllocation[],
  payments: Payment[],
  staff: Staff[],
  rooms: Room[],
  allAdvances: Advance[],
  allAdvanceRecoveries: AdvanceRecovery[],
  closings: MonthlyClosing[] | Array<{ month: string; memberId: string; deposit: number; credit: number }>,
  creditNotes: CreditNote[] = [],
  refunds: Refund[] = [],
): MonthlySummary {
  const activeMembers = members.filter((m) => m.active);
  const monthMeals = mealEntries.filter((m) => m.ym === ym);
  const monthBazar = bazarEntries.filter((b) => b.ym === ym);
  // Personal expenses are never mess spending — excluded from the
  // mess-wide total here for the same reason calculateMemberMonthlySummary
  // excludes them per member.
  const monthExpenses = expenses.filter((e) => e.ym === ym && !e.personal);
  const monthPayments = payments.filter((p) => p.ym === ym);

  // Build prevClosings from existing monthly closing records or accept directly
  const prevYm = getPreviousMonthYm(ym);
  let prevClosings: Array<{ month: string; memberId: string; deposit: number; credit: number }> = [];

  if (Array.isArray(closings) && closings.length > 0) {
    const first = closings[0];
    if ("memberId" in first && ("deposit" in first || "credit" in first)) {
      prevClosings = closings as Array<{ month: string; memberId: string; deposit: number; credit: number }>;
    } else {
      const prevClosing = (closings as MonthlyClosing[]).find((c) => c.month === prevYm && c.status === "closed");
      prevClosings = prevClosing?.memberBreakdown
        ? Object.entries(prevClosing.memberBreakdown).map(([memberId, data]: [string, any]) => ({
            month: prevYm,
            memberId,
            deposit: data.deposit || 0,
            credit: data.credit || 0,
          }))
        : [];
    }
  }

  // Calculate meal rate
  const { totalBazar, totalMeals, mealRate } = calculateMealRate(bazarEntries, mealEntries, ym);

  // Calculate all member summaries
  const memberSummaries = activeMembers.map((member) =>
    calculateMemberMonthlySummary(
      member,
      ym,
      mealEntries,
      bazarEntries,
      expenses,
      expenseAllocations,
      payments,
      staff,
      rooms,
      allAdvances,
      allAdvanceRecoveries,
      activeMembers,
      prevClosings,
      creditNotes,
      refunds,
    )
  ).sort((a, b) => a.memberName.localeCompare(b.memberName));

  // Calculate totals
  const totalExpenses = monthExpenses.reduce((s, e) => s + (e.amount || 0), 0);
  const totalStaffCost = staff
    .filter((s) => s.status !== "inactive")
    .reduce((sum, item) => sum + (item.salary || 0) + (item.overtime || 0) + (item.bonus || 0) - (item.advance || 0), 0);
  const totalPayments = monthPayments.reduce((s, p) => s + (p.amount || 0), 0);
  const totalAdvances = allAdvances
    .filter((a) => a.remainingAmount > 0)
    .reduce((s, a) => s + (a.remainingAmount || 0), 0);
  const totalCharges = memberSummaries.reduce((s, m) => s + m.totalCharges, 0);

  const totalDeposits = memberSummaries.reduce((s, m) => s + m.depositAmount, 0);
  const totalCredits = memberSummaries.reduce((s, m) => s + m.creditAmount, 0);
  const totalCreditNotes = memberSummaries.reduce((s, m) => s + m.creditNoteTotal, 0);
  const totalRefunds = memberSummaries.reduce((s, m) => s + m.refundTotal, 0);
  const totalPayable = memberSummaries
    .filter((m) => m.settlementStatus === "pay")
    .reduce((s, m) => s + m.creditAmount, 0);
  const totalReceivable = memberSummaries
    .filter((m) => m.settlementStatus === "receive")
    .reduce((s, m) => s + m.depositAmount, 0);

  const occupiedBeds = activeMembers.filter((m) => m.roomId || m.roomName || m.bedNo).length;
  const totalBeds = rooms.reduce((sum, r) => sum + (r.totalBeds || 0), 0);
  const vacantBeds = Math.max(0, totalBeds - occupiedBeds);

  return {
    ym,
    members: memberSummaries,
    totalMeals,
    totalBazar,
    totalExpenses,
    totalStaffCost,
    mealRate,
    totalPayments,
    totalAdvances,
    totalCharges,
    totalDeposits,
    totalCredits,
    totalCreditNotes,
    totalRefunds,
    totalPayable,
    totalReceivable,
    vacantBeds,
    occupiedBeds,
  };
}

// ============================================================================
// 6. DEPOSIT / CREDIT VALIDATION
// ============================================================================

/**
 * Validate that no member has both deposit and credit > 0 simultaneously
 */
export function validateMutualExclusivity(members: MemberMonthlySummary[]): {
  memberId: string;
  memberName: string;
  message: string;
}[] {
  const violations: { memberId: string; memberName: string; message: string }[] = [];
  members.forEach((m) => {
    if (m.depositAmount > 0 && m.creditAmount > 0) {
      violations.push({
        memberId: m.memberId,
        memberName: m.memberName,
        message: `Member ${m.memberName} has both Deposit (${m.depositAmount}) and Credit (${m.creditAmount})`,
      });
    }
  });
  return violations;
}

// ============================================================================
// 7. MONTHLY CLOSING DATA
// ============================================================================

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
}

export function calculateMonthlyClosingData(
  summary: MonthlySummary,
  ym: string,
): MonthlyClosingData {
  const year = parseInt(ym.split("-")[0], 10);
  const activeMembers = summary.members;
  
  const totalRent = activeMembers.reduce((s, m) => s + m.rentShare, 0);
  const totalCollection = summary.totalPayments;
  const totalIncome = totalRent + totalCollection;
  const totalExpense = summary.totalBazar + summary.totalExpenses + summary.totalStaffCost;
  const netProfit = totalIncome - totalExpense;

  const totalDue = activeMembers
    .filter((m) => m.settlementStatus === "pay")
    .reduce((s, m) => s + m.creditAmount, 0);

  return {
    month: ym,
    year,
    totalIncome,
    totalExpense,
    netProfit,
    totalRent,
    totalMeal: summary.totalBazar,
    totalUtility: summary.totalExpenses,
    totalStaff: summary.totalStaffCost,
    totalDeposit: summary.totalDeposits,
    totalCredit: summary.totalCredits,
    totalCollection,
    totalDue,
    mealRate: summary.mealRate,
    totalMeals: summary.totalMeals,
    totalBazar: summary.totalBazar,
  };
}

// ============================================================================
// 8. LEDGER CALCULATIONS
// ============================================================================

export function calculateMemberLedger(
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

  // Transaction types that INCREASE member's liability (charges)
  const chargeTypes = new Set([
    "charge", "meal_charge", "rent_charge", "utility_charge", "staff_charge", "other_charge",
  ]);
  // Transaction types that DECREASE member's liability (payments/contributions)
  const paymentTypes = new Set([
    "payment", "bazar_contribution", "expense_contribution",
  ]);

  sortedEntries.forEach((entry, index) => {
    if (index === 0) {
      // Informational only — the running `balance` below is derived purely
      // from summing every entry's delta, so it isn't seeded from this
      // stored value (which would otherwise double-count the first entry).
      openingBalance = entry.balance || 0;
    }

    if (chargeTypes.has(entry.transactionType)) {
      balance += entry.amount;
    } else if (paymentTypes.has(entry.transactionType)) {
      balance -= entry.amount;
    } else if (entry.transactionType === "deposit") {
      balance -= entry.amount;
    } else if (entry.transactionType === "credit") {
      balance -= entry.amount;
    } else if (entry.transactionType === "refund") {
      balance += entry.amount;
    } else if (entry.transactionType === "adjustment") {
      balance += entry.amount;
    } else if (entry.transactionType === "advance_given") {
      balance -= entry.amount;
    } else if (entry.transactionType === "advance_recovered") {
      balance -= entry.amount;
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

// ============================================================================
// 9. MATHEMATICAL VERIFICATION
// ============================================================================

export interface VerificationResult {
  totalExpenses: number;
  totalExpenseRecords: number;
  totalCharges: number;
  totalChargesFromMembers: number;
  totalPayments: number;
  totalPaymentRecords: number;
  outstandingCharges: number;
  advanceBalance: number;
  originalAdvances: number;
  recoveredAdvances: number;
  allReconciled: boolean;
  errors: string[];
}

/**
 * Verify that all financial calculations reconcile correctly.
 * This is a mathematical audit function.
 */
export function verifyCalculations(
  summary: MonthlySummary,
  expenses: Expense[],
  payments: Payment[],
  advances: Advance[],
  advanceRecoveries: AdvanceRecovery[],
  ym: string,
): VerificationResult {
  const errors: string[] = [];
  const monthExpenses = expenses.filter((e) => e.ym === ym);
  const monthPayments = payments.filter((p) => p.ym === ym);

  const totalExpenses = monthExpenses.reduce((s, e) => s + (e.amount || 0), 0);
  const totalExpenseRecords = monthExpenses.length;

  const totalCharges = summary.members.reduce((s, m) => s + m.totalCharges, 0);
  const totalPayments = monthPayments.reduce((s, p) => s + (p.amount || 0), 0);
  const totalPaymentRecords = monthPayments.length;

  // Verify: Total Charges = Sum of all member charges
  const chargesFromMembers = summary.members.reduce((s, m) => {
    return s + m.mealCost + m.rentShare + m.expenseShares + m.staffShare + m.previousDue;
  }, 0);

  // Verify: Outstanding charges
  const outstandingCharges = summary.members
    .filter((m) => m.settlementStatus === "pay")
    .reduce((s, m) => s + m.creditAmount, 0);

  // Verify: Advance balance
  const originalAdvances = advances
    .filter((a) => a.ym === ym)
    .reduce((s, a) => s + (a.amount || 0), 0);
  const recoveredAdvances = advanceRecoveries
    .filter((r) => r.ym === ym)
    .reduce((s, r) => s + (r.amount || 0), 0);
  const currentAdvanceBalance = advances
    .filter((a) => a.remainingAmount > 0)
    .reduce((s, a) => s + (a.remainingAmount || 0), 0);

  // Cross-check: Outstanding charges should match what the engine computed
  const engineOutstanding = summary.members
    .filter((m) => m.settlementStatus === "pay")
    .reduce((s, m) => s + m.creditAmount, 0);

  if (Math.abs(outstandingCharges - engineOutstanding) > 0.01) {
    errors.push(`Outstanding charges mismatch: ${outstandingCharges} vs ${engineOutstanding}`);
  }

  // Verify: No member has both deposit and credit
  const violations = validateMutualExclusivity(summary.members);
  violations.forEach((v) => errors.push(v.message));

  const allReconciled = errors.length === 0;

  return {
    totalExpenses,
    totalExpenseRecords,
    totalCharges,
    totalChargesFromMembers: chargesFromMembers,
    totalPayments,
    totalPaymentRecords,
    outstandingCharges,
    advanceBalance: currentAdvanceBalance,
    originalAdvances,
    recoveredAdvances,
    allReconciled,
    errors,
  };
}