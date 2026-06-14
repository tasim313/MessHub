/**
 * FINANCIAL CALCULATION ENGINE V2 - TESTS
 * ========================================
 * 
 * Tests cover:
 * 1. Meal rate calculation
 * 2. Member expense share calculation
 * 3. Staff share calculation
 * 4. Advance calculation
 * 5. Payment distribution (recover advances first, then pay charges)
 * 6. Complete monthly summary
 * 7. Mathematical verification
 * 8. Edge cases (no members, no expenses, etc.)
 */
import { describe, it, expect } from "vitest";
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
  calculateMonthlyClosingData,
} from "./engine-v2";
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
  ServiceType,
} from "../types";

// ============================================================================
// Test Data Builders
// ============================================================================

function createMember(overrides: Partial<Member> = {}): Member {
  return {
    id: "member_a",
    name: "Member A",
    active: true,
    role: "member",
    roomId: "room_1",
    services: [
      { type: "internet", enabled: true },
      { type: "electricity", enabled: true },
      { type: "gas", enabled: true },
      { type: "water", enabled: true },
      { type: "cooking_staff", enabled: true },
      { type: "cleaning_staff", enabled: true },
      { type: "security_staff", enabled: true },
    ],
    ...overrides,
  };
}

function createMembers(): Member[] {
  return [
    createMember({ id: "member_a", name: "Member A" }),
    createMember({ id: "member_b", name: "Member B" }),
    createMember({ id: "member_c", name: "Member C", services: [
      { type: "internet", enabled: true },
      { type: "electricity", enabled: true },
      { type: "gas", enabled: false },
      { type: "water", enabled: true },
    ]}),
  ];
}

function createExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: "expense_1",
    ym: "2026-06",
    category: "internet",
    amount: 1000,
    date: "2026-06-01",
    paidBy: "member_a",
    paidByName: "Member A",
    allocationMethod: "equal",
    status: "paid",
    ...overrides,
  };
}

function createMealEntries(): MealEntry[] {
  return [
    { id: "m1", memberId: "member_a", memberName: "Member A", date: "2026-06-01", ym: "2026-06", breakfast: 1, lunch: 1, dinner: 1, guest: 0 },  // 3
    { id: "m2", memberId: "member_b", memberName: "Member B", date: "2026-06-01", ym: "2026-06", breakfast: 1, lunch: 1, dinner: 1, guest: 0 },  // 3
    { id: "m3", memberId: "member_a", memberName: "Member A", date: "2026-06-02", ym: "2026-06", breakfast: 1, lunch: 1, dinner: 1, guest: 0 },  // 3
    { id: "m4", memberId: "member_b", memberName: "Member B", date: "2026-06-02", ym: "2026-06", breakfast: 1, lunch: 1, dinner: 1, guest: 0 },  // 3
  ];
}

function createBazarEntries(): Bazar[] {
  return [
    { id: "b1", date: "2026-06-01", ym: "2026-06", buyerId: "member_a", buyerName: "Member A", items: [{ name: "Rice", amount: 500 }], total: 500, category: "rice" },
    { id: "b2", date: "2026-06-02", ym: "2026-06", buyerId: "member_b", buyerName: "Member B", items: [{ name: "Vegetables", amount: 300 }], total: 300, category: "vegetables" },
    { id: "b3", date: "2026-06-03", ym: "2026-06", buyerId: "member_a", buyerName: "Member A", items: [{ name: "Meat", amount: 700 }], total: 700, category: "meat" },
  ];
}

function createPayments(): Payment[] {
  return [
    { id: "p1", memberId: "member_b", memberName: "Member B", amount: 1000, method: "cash", date: "2026-06-15", ym: "2026-06", status: "paid", category: "internet", notes: "Payment" },
  ];
}

function createStaff(): Staff[] {
  return [
    { id: "s1", name: "Cook", role: "cook", salary: 5000, status: "active" },
    { id: "s2", name: "Cleaner", role: "cleaner", salary: 3000, status: "active" },
  ];
}

function createRoom(): Room {
  return { id: "room_1", messName: "Test Mess", buildingName: "A", floorName: "1", roomNo: "101", roomType: "double", totalBeds: 2, monthlyRent: 10000, status: "occupied" };
}

function createAdvances(): Advance[] {
  return [
    {
      id: "adv_1",
      memberId: "member_a",
      memberName: "Member A",
      amount: 500,
      remainingAmount: 500,
      source: "Internet Bill - 2026-06-01",
      sourceType: "expense",
      sourceId: "expense_1",
      ym: "2026-06",
      status: "outstanding",
      createdAt: 1,
    },
  ];
}

function createAdvanceRecoveries(): AdvanceRecovery[] {
  return [];
}

function createClosings(): MonthlyClosing[] {
  return [];
}

// ============================================================================
// TESTS
// ============================================================================

describe("calculateMealRate", () => {
  it("calculates correct meal rate from bazar and meals", () => {
    const meals = createMealEntries();
    const bazar = createBazarEntries();

    const result = calculateMealRate(bazar, meals, "2026-06");

    // Total bazar: 500 + 300 + 700 = 1500
    // Total meals: A(3+3=6) + B(3+3=6) = 12
    // Meal rate: 1500 / 12 = 125
    expect(result.totalBazar).toBe(1500);
    expect(result.totalMeals).toBe(12);
    expect(result.mealRate).toBe(125);
  });

  it("returns 0 meal rate when no meals exist", () => {
    const result = calculateMealRate([], [], "2026-06");
    expect(result.mealRate).toBe(0);
    expect(result.totalMeals).toBe(0);
    expect(result.totalBazar).toBe(0);
  });
});

describe("calculateMemberExpenseShares", () => {
  it("calculates equal shares for all subscribed members", () => {
    const members = createMembers();
    const expense = createExpense({ amount: 1000 });
    const activeMembers = members.filter((m) => m.active);

    const result = calculateMemberExpenseShares(
      members[0], // Member A (subscribed to internet)
      [expense],
      activeMembers,
    );

    // Internet: 1000 / 3 subscribers (A, B, C) = 333.33
    expect(result.expenseShares).toBeCloseTo(333.33, 1);
  });

  it("skips non-subscribed members", () => {
    const members = createMembers();
    // Create an expense only member A subscribes to a specific service
    const expense = createExpense({ category: "gas", amount: 600 });
    const activeMembers = members.filter((m) => m.active);

    // Member C has gas disabled
    const resultA = calculateMemberExpenseShares(members[0], [expense], activeMembers);
    const resultC = calculateMemberExpenseShares(members[2], [expense], activeMembers);

    // A and B subscribe to gas, C doesn't
    // 600 / 2 = 300 each for A and B, 0 for C
    expect(resultA.expenseShares).toBeCloseTo(300, 1);
    expect(resultC.expenseShares).toBe(0);
  });

  it("uses persisted allocations when available", () => {
    const members = createMembers();
    const allocations: ExpenseAllocation[] = [
      { id: "alloc_1", expenseId: "expense_1", memberId: "member_a", memberName: "Member A", category: "internet", amount: 500, subscribed: true, ym: "2026-06" },
      { id: "alloc_2", expenseId: "expense_1", memberId: "member_b", memberName: "Member B", category: "internet", amount: 500, subscribed: true, ym: "2026-06" },
    ];

    const result = calculateMemberExpenseShares(
      members[0],
      [],
      [members[0], members[1]],
      allocations,
    );

    expect(result.expenseShares).toBe(500);
    expect(result.expenseShareBreakdown.internet).toBe(500);
  });
});

describe("calculateMemberStaffShare", () => {
  it("calculates staff share correctly", () => {
    const members = createMembers();
    const staff = createStaff();
    const activeMembers = members.filter((m) => m.active);

    // Member A subscribes to ALL staff services (cooking_staff, cleaning_staff, security_staff)
    // Member B subscribes to ALL staff services
    // Member C does NOT subscribe to cooking_staff or cleaning_staff
    // Cook (5000): only A and B subscribe → 5000/2 = 2500
    // Cleaner (3000): only A and B subscribe → 3000/2 = 1500
    // Total: 2500 + 1500 = 4000
    const result = calculateMemberStaffShare(members[0], staff, activeMembers);
    expect(result).toBeCloseTo(4000, 1);
  });
});

describe("calculateExpenseAdvance", () => {
  it("calculates advance correctly when payer pays more than their share", () => {
    const expense = createExpense({ amount: 1000 });
    const payerShare = 333.33; // 1/3 of 1000

    const result = calculateExpenseAdvance(expense, payerShare);

    expect(result.advanceAmount).toBeCloseTo(666.67, 1);
    expect(result.payerEffectiveShare).toBeCloseTo(333.33, 1);
  });

  it("returns 0 advance when payer pays exactly their share", () => {
    const expense = createExpense({ amount: 500 });
    const payerShare = 500;

    const result = calculateExpenseAdvance(expense, payerShare);

    expect(result.advanceAmount).toBe(0);
    expect(result.payerEffectiveShare).toBe(500);
  });

  it("returns 0 advance when payer pays less than their share", () => {
    const expense = createExpense({ amount: 200 });
    const payerShare = 500;

    const result = calculateExpenseAdvance(expense, payerShare);

    expect(result.advanceAmount).toBe(0);
    expect(result.payerEffectiveShare).toBe(200);
  });
});

describe("calculatePaymentDistribution", () => {
  it("recovers advances first (FIFO), then pays charges", () => {
    const advances = createAdvances(); // Member A has 500 advance
    const paymentAmount = 600;
    const memberOutstandingCharges = 1000;

    const result = calculatePaymentDistribution(
      paymentAmount,
      memberOutstandingCharges,
      advances,
    );

    // Step 1: Recover Member A's advance: 500
    // Step 2: Remaining 100 pays own charges
    expect(result.advanceRecoveries).toHaveLength(1);
    expect(result.advanceRecoveries[0].amount).toBe(500);
    expect(result.advanceRecoveries[0].advanceOwnerId).toBe("member_a");
    expect(result.chargePayment).toBe(100);
    expect(result.remainingPayment).toBe(0);
  });

  it("handles payment less than advances", () => {
    const advances = createAdvances(); // Member A has 500 advance
    const paymentAmount = 200;
    const memberOutstandingCharges = 1000;

    const result = calculatePaymentDistribution(
      paymentAmount,
      memberOutstandingCharges,
      advances,
    );

    // All 200 goes to recover advance
    expect(result.advanceRecoveries).toHaveLength(1);
    expect(result.advanceRecoveries[0].amount).toBe(200);
    expect(result.chargePayment).toBe(0);
    expect(result.remainingPayment).toBe(0);
  });

  it("handles payment greater than all advances and charges", () => {
    const advances = createAdvances(); // Member A has 500 advance
    const paymentAmount = 2000;
    const memberOutstandingCharges = 1000;

    const result = calculatePaymentDistribution(
      paymentAmount,
      memberOutstandingCharges,
      advances,
    );

    // Step 1: Recover 500 advance
    // Step 2: Pay 1000 charges
    // Step 3: 500 remaining (excess becomes deposit/advance for payer)
    expect(result.advanceRecoveries).toHaveLength(1);
    expect(result.advanceRecoveries[0].amount).toBe(500);
    expect(result.chargePayment).toBe(1000);
    expect(result.remainingPayment).toBe(500);
  });

  it("recovers multiple advances in FIFO order", () => {
    const advances: Advance[] = [
      { id: "adv_1", memberId: "member_a", memberName: "Member A", amount: 300, remainingAmount: 300, source: "Internet", sourceType: "expense", sourceId: "e1", ym: "2026-06", status: "outstanding", createdAt: 1 },
      { id: "adv_2", memberId: "member_b", memberName: "Member B", amount: 200, remainingAmount: 200, source: "Electricity", sourceType: "expense", sourceId: "e2", ym: "2026-06", status: "outstanding", createdAt: 2 },
    ];
    const paymentAmount = 400;
    const memberOutstandingCharges = 500;

    const result = calculatePaymentDistribution(
      paymentAmount,
      memberOutstandingCharges,
      advances,
    );

    // FIFO: First recover adv_1 (300), then adv_2 (100)
    // Remaining: 0 for charges
    expect(result.advanceRecoveries).toHaveLength(2);
    expect(result.advanceRecoveries[0].amount).toBe(300);
    expect(result.advanceRecoveries[0].advanceOwnerId).toBe("member_a");
    expect(result.advanceRecoveries[1].amount).toBe(100);
    expect(result.advanceRecoveries[1].advanceOwnerId).toBe("member_b");
    expect(result.chargePayment).toBe(0);
    expect(result.remainingPayment).toBe(0);
  });
});

describe("calculateMemberMonthlySummary", () => {
  it("calculates complete monthly summary for a member", () => {
    const member = createMember();
    const members = createMembers();
    const meals = createMealEntries();
    const bazar = createBazarEntries();
    const expenses = [createExpense()];
    const payments = createPayments();
    const staff = createStaff();
    const rooms = [createRoom()];
    const advances = createAdvances();
    const advanceRecoveries = createAdvanceRecoveries();
    const activeMembers = members.filter((m) => m.active);

    const result = calculateMemberMonthlySummary(
      member,
      "2026-06",
      meals,
      bazar,
      expenses,
      [],
      payments,
      staff,
      rooms,
      advances,
      advanceRecoveries,
      activeMembers,
      [],
    );

    // Member A has 6 meals
    // Total meals across all members: A(3+3=6) + B(3+3=6) = 12
    // Meal rate: 1500/12 = 125
    // Meal cost for A: 6 * 125 = 750
    expect(result.mealCost).toBe(750);

    // Rent: member_a has room_1 with totalBeds=2, monthlyRent=10000 → 10000/2 = 5000
    expect(result.rentShare).toBe(5000);

    // Internet: 1000/3 = 333.33
    expect(result.expenseShares).toBeCloseTo(333.33, 1);

    // Staff: 4000 (as calculated above)
    expect(result.staffShare).toBeCloseTo(4000, 1);

    // Total charges: 750 + 5000 + 333.33 + 4000 = 10083.33
    expect(result.totalCharges).toBeCloseTo(10083.33, 1);

    // Bazar contribution: 500 + 700 = 1200
    expect(result.bazarContribution).toBe(1200);

    // Total contributions: 1200 (bazar) + 1000 (paid internet) = 2200
    expect(result.totalContributions).toBeCloseTo(2200, 1);

    // Balance: 2200 - 10083.33 = -7883.33 (member owes mess)
    expect(result.balance).toBeCloseTo(-7883.33, 1);
    expect(result.settlementStatus).toBe("pay");
    expect(result.creditAmount).toBeCloseTo(7883.33, 1);
  });
});

describe("calculateCompleteMonthlySummary", () => {
  it("calculates complete monthly summary for all members", () => {
    const members = createMembers();
    const meals = createMealEntries();
    const bazar = createBazarEntries();
    const expenses = [createExpense()];
    const payments = createPayments();
    const staff = createStaff();
    const rooms = [createRoom()];
    const advances = createAdvances();
    const advanceRecoveries = createAdvanceRecoveries();
    const closings = createClosings();

    const result = calculateCompleteMonthlySummary(
      "2026-06",
      members,
      meals,
      bazar,
      expenses,
      [],
      payments,
      staff,
      rooms,
      advances,
      advanceRecoveries,
      closings,
    );

    expect(result.members).toHaveLength(3);
    expect(result.totalMeals).toBe(12);
    expect(result.totalBazar).toBe(1500);
    expect(result.totalExpenses).toBe(1000);
    expect(result.totalStaffCost).toBe(8000); // 5000 + 3000
    expect(result.mealRate).toBe(125);
    expect(result.totalPayments).toBe(1000);
    expect(result.totalCharges).toBeGreaterThan(0);
  });

  it("handles empty data gracefully", () => {
    const result = calculateCompleteMonthlySummary(
      "2026-06",
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
    );

    expect(result.members).toHaveLength(0);
    expect(result.totalMeals).toBe(0);
    expect(result.totalBazar).toBe(0);
    expect(result.totalExpenses).toBe(0);
    expect(result.totalCharges).toBe(0);
  });
});

describe("validateMutualExclusivity", () => {
  it("detects violations where member has both deposit and credit", () => {
    const members = createMembers();
    const meals = createMealEntries();
    const bazar = createBazarEntries();
    const expenses = [createExpense()];
    const payments = createPayments();
    const staff = createStaff();
    const rooms = [createRoom()];
    const advances = createAdvances();
    const advanceRecoveries = createAdvanceRecoveries();
    const activeMembers = members.filter((m) => m.active);

    const summary = calculateCompleteMonthlySummary(
      "2026-06",
      members,
      meals,
      bazar,
      expenses,
      [],
      payments,
      staff,
      rooms,
      advances,
      advanceRecoveries,
      [],
    );

    const violations = validateMutualExclusivity(summary.members);
    expect(violations).toHaveLength(0); // No violations in this scenario
  });
});

describe("verifyCalculations", () => {
  it("should reconcile all financial data correctly", () => {
    const members = createMembers();
    const meals = createMealEntries();
    const bazar = createBazarEntries();
    const expenses = [createExpense()];
    const payments = createPayments();
    const staff = createStaff();
    const rooms = [createRoom()];
    const advances = createAdvances();
    const advanceRecoveries = createAdvanceRecoveries();
    const closings = createClosings();

    const summary = calculateCompleteMonthlySummary(
      "2026-06",
      members,
      meals,
      bazar,
      expenses,
      [],
      payments,
      staff,
      rooms,
      advances,
      advanceRecoveries,
      closings,
    );

    const verification = verifyCalculations(
      summary,
      expenses,
      payments,
      advances,
      advanceRecoveries,
      "2026-06",
    );

    expect(verification.allReconciled).toBe(true);
    expect(verification.errors).toHaveLength(0);
    expect(verification.totalExpenses).toBe(1000);
    expect(verification.totalExpenseRecords).toBe(1);
    expect(verification.totalPayments).toBe(1000);
    expect(verification.totalPaymentRecords).toBe(1);
  });
});

describe("calculateMonthlyClosingData", () => {
  it("computes closing data correctly", () => {
    const members = createMembers();
    const meals = createMealEntries();
    const bazar = createBazarEntries();
    const expenses = [createExpense()];
    const payments = createPayments();
    const staff = createStaff();
    const rooms = [createRoom()];
    const advances = createAdvances();
    const advanceRecoveries = createAdvanceRecoveries();
    const closings = createClosings();

    const summary = calculateCompleteMonthlySummary(
      "2026-06",
      members,
      meals,
      bazar,
      expenses,
      [],
      payments,
      staff,
      rooms,
      advances,
      advanceRecoveries,
      closings,
    );

    const closingData = calculateMonthlyClosingData(summary, "2026-06");

    // All 3 members have room_1 assigned via createMember default
    // Room has 2 beds, rent = 10000/2 = 5000 per member
    // All 3 share the same room: 3 * 5000 = 15000
    expect(closingData.totalRent).toBe(15000);
    expect(closingData.totalCollection).toBe(1000);
    expect(closingData.totalIncome).toBe(16000); // 15000 rent + 1000 collections
    expect(closingData.totalBazar).toBe(1500);
    expect(closingData.totalUtility).toBe(1000);
    expect(closingData.totalStaff).toBe(8000);
    expect(closingData.totalExpense).toBe(10500); // 1500 + 1000 + 8000
    expect(closingData.netProfit).toBe(5500); // 16000 - 10500
    expect(closingData.mealRate).toBe(125);
    expect(closingData.totalMeals).toBe(12);
  });
});

// ============================================================================
// ADVANCED SCENARIO TESTS
// ============================================================================

describe("Complete Accounting Workflow Scenario", () => {
  it("properly handles the complete expense → charge → advance → recovery workflow", () => {
    /**
     * SCENARIO:
     * 
     * Members: A, B
     * Internet Bill: 1000 Tk, Paid by A
     * 
     * Step 1: Create expense (1000 Tk, paid by A)
     * Step 2: Calculate shares: A=500, B=500
     * Step 3: A's share (500) is auto-paid (A doesn't pay twice)
     * Step 4: Advance: 1000 - 500 = 500 (A advances this to mess)
     * Step 5: B pays 500 Tk
     * Step 6: B's payment recovers A's advance (500)
     * Result: A's advance is fully recovered, B's charge is paid
     */

    // Setup: 2 members, both subscribed to internet
    const members: Member[] = [
      createMember({ id: "member_a", name: "Member A", services: [{ type: "internet", enabled: true }] }),
      createMember({ id: "member_b", name: "Member B", services: [{ type: "internet", enabled: true }] }),
    ];

    // Expense: 1000 Tk Internet, paid by A
    const expenses = [createExpense({ amount: 1000, paidBy: "member_a", paidByName: "Member A" })];

    // Calculate A's share = 500
    const { expenseShares: aShare } = calculateMemberExpenseShares(members[0], expenses, members);
    expect(aShare).toBe(500);

    // Calculate B's share = 500
    const { expenseShares: bShare } = calculateMemberExpenseShares(members[1], expenses, members);
    expect(bShare).toBe(500);

    // Calculate A's advance: expense - A's share = 1000 - 500 = 500
    const { advanceAmount } = calculateExpenseAdvance(expenses[0], aShare);
    expect(advanceAmount).toBe(500);

    // A's total contributions: 1000 (paid the bill)
    const aContributions = 1000;

    // A's total charges: 500 (A's share of internet)
    const aCharges = aShare;

    // A's balance: 1000 - 500 = 500 (A has advance)
    const aBalance = aContributions - aCharges;
    expect(aBalance).toBe(500);

    // B's total charges: 500
    const bCharges = bShare;

    // B makes a payment of 500 Tk
    const bPayment = 500;

    // Payment distribution: B's payment first recovers A's advance
    const advances = [{
      id: "adv_1",
      memberId: "member_a",
      memberName: "Member A",
      amount: advanceAmount,
      remainingAmount: advanceAmount,
      source: "Internet Bill",
      sourceType: "expense" as const,
      sourceId: "expense_1",
      ym: "2026-06",
      status: "outstanding" as const,
      createdAt: 1,
    }];

    const distribution = calculatePaymentDistribution(
      bPayment,
      bCharges,
      advances,
    );

    // All of B's 500 Tk goes to recover A's advance
    expect(distribution.advanceRecoveries).toHaveLength(1);
    expect(distribution.advanceRecoveries[0].amount).toBe(500);
    expect(distribution.advanceRecoveries[0].advanceOwnerId).toBe("member_a");
    expect(distribution.chargePayment).toBe(0);

    // After recovery: A's advance is now 0 (fully recovered)
    const remainingAdvance = advanceAmount - distribution.advanceRecoveries[0].amount;
    expect(remainingAdvance).toBe(0);

    // Final state:
    // A paid 1000, A's charges 500 → A has 0 remaining (advance recovered, own share paid)
    // B paid 500, B's charges 500 → B has 0 remaining
    // Everyone settled
    expect(aBalance - distribution.advanceRecoveries[0].amount).toBe(0);
  });

  it("handles partial payment that partially recovers advance", () => {
    /**
     * SCENARIO:
     * Internet Bill: 1000 Tk, Paid by A
     * A's advance: 500 (since A's share is also 500, but A paid 1000 total)
     * B pays only 200 Tk (partial payment)
     * 
     * Expected: 200 recovers A's advance, remaining advance = 300
     * B still owes 300 for their share
     */
    const advances: Advance[] = [{
      id: "adv_1",
      memberId: "member_a",
      memberName: "Member A",
      amount: 500,
      remainingAmount: 500,
      source: "Internet",
      sourceType: "expense",
      sourceId: "e1",
      ym: "2026-06",
      status: "outstanding",
      createdAt: 1,
    }];

    const distribution = calculatePaymentDistribution(200, 500, advances);

    expect(distribution.advanceRecoveries).toHaveLength(1);
    expect(distribution.advanceRecoveries[0].amount).toBe(200);
    expect(distribution.chargePayment).toBe(0);
    expect(distribution.remainingPayment).toBe(0);

    // Remaining advance: 500 - 200 = 300
    const updatedRemainingAdvance = advances[0].remainingAmount - 200;
    expect(updatedRemainingAdvance).toBe(300);
  });
});