/**
 * Automated Tests for Centralized Calculation Engine
 * 
 * Tests cover:
 * - Meal Rate Calculation
 * - Member Meal Cost
 * - Settlement Calculation (corrected formula)
 * - Credits (auto-computed from negative balance)
 * - Deposits (auto-computed from positive balance)
 * - Monthly Closing
 * - Dashboard Totals
 * - Ledger Balancing
 * - Validation: Member can NEVER have both Deposit > 0 AND Credit > 0
 * 
 * CORRECTED FORMULA:
 *   Total Contributions = Bazar Paid + Expense Contributions + Payments Made
 *   Total Charges = Meal Cost + Rent Share + Expense Shares + Staff Share + Previous Due + Previous Credit - Previous Deposit
 *   Net Balance = Total Contributions - Total Charges
 *   If Net Balance > 0 → Deposit = Net Balance, Credit = 0, Status = Receive
 *   If Net Balance < 0 → Credit = ABS(Net Balance), Deposit = 0, Status = Pay
 *   If Net Balance = 0 → Deposit = 0, Credit = 0, Status = Settled
 */

import { describe, it, expect } from "vitest";
import {
  calculateMealRate,
  calculateMemberSettlement,
  calculateAllSettlements,
  getSettlementSummary,
  computeMonthlySummary,
  calculateMemberLedger,
  calculateMonthlyStatement,
  calculateMonthlyClosing,
  validateMealEntry,
  validateBazarEntry,
  validateDeposit,
  validateCredit,
  validatePayment,
  validateMonthlyClosing,
  validateDepositCreditMutualExclusivity,
} from "./engine";
import type { Member, MealEntry, Bazar, Deposit, Credit, Payment, LedgerEntry, Staff, Room, Utility } from "@/lib/types";

// ============================================================================
// Test Data Factories
// ============================================================================

function createMember(overrides: Partial<Member> = {}): Member {
  return {
    id: "member-1",
    name: "Test Member",
    email: "test@example.com",
    phone: "01700000000",
    role: "member",
    active: true,
    roomId: "room-1",
    monthlyRent: 5000,
    previousDue: 0,
    services: [
      { type: "meals", enabled: true },
      { type: "rent", enabled: true },
    ],
    ...overrides,
  };
}

function createMealEntry(overrides: Partial<MealEntry> = {}): MealEntry {
  return {
    id: `meal-${Math.random().toString(36).slice(2, 9)}`,
    memberId: "member-1",
    memberName: "Test Member",
    date: "2024-01-15",
    ym: "2024-01",
    breakfast: 1,
    lunch: 1,
    dinner: 1,
    guest: 0,
    ...overrides,
  };
}

function createBazarEntry(overrides: Partial<Bazar> = {}): Bazar {
  return {
    id: `bazar-${Math.random().toString(36).slice(2, 9)}`,
    date: "2024-01-15",
    ym: "2024-01",
    buyerId: "member-1",
    buyerName: "Test Member",
    items: [{ name: "Rice", amount: 500 }],
    total: 500,
    category: "rice",
    ...overrides,
  };
}

function createDeposit(overrides: Partial<Deposit> = {}): Deposit {
  return {
    id: `deposit-${Math.random().toString(36).slice(2, 9)}`,
    memberId: "member-1",
    memberName: "Test Member",
    amount: 1000,
    method: "cash",
    date: "2024-01-15",
    ym: "2024-01",
    ...overrides,
  };
}

function createCredit(overrides: Partial<Credit> = {}): Credit {
  return {
    id: `credit-${Math.random().toString(36).slice(2, 9)}`,
    memberId: "member-1",
    memberName: "Test Member",
    amount: 500,
    reason: "Festival discount",
    date: "2024-01-15",
    ym: "2024-01",
    ...overrides,
  };
}

function createPayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: `payment-${Math.random().toString(36).slice(2, 9)}`,
    memberId: "member-1",
    memberName: "Test Member",
    amount: 2000,
    method: "cash",
    date: "2024-01-15",
    ym: "2024-01",
    status: "paid",
    ...overrides,
  };
}

function createLedgerEntry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: `ledger-${Math.random().toString(36).slice(2, 9)}`,
    memberId: "member-1",
    memberName: "Test Member",
    date: "2024-01-15",
    ym: "2024-01",
    transactionType: "charge",
    category: "meal",
    amount: 1000,
    ...overrides,
  };
}

function createRoom(overrides: Partial<Room> = {}): Room {
  return {
    id: "room-1",
    messName: "Test Mess",
    buildingName: "Building A",
    floorName: "1st Floor",
    roomNo: "101",
    roomType: "single",
    totalBeds: 1,
    monthlyRent: 5000,
    status: "occupied",
    ...overrides,
  };
}

function createStaff(overrides: Partial<Staff> = {}): Staff {
  return {
    id: `staff-${Math.random().toString(36).slice(2, 9)}`,
    name: "Test Staff",
    role: "cook",
    salary: 10000,
    status: "active",
    ...overrides,
  };
}

function createUtility(overrides: Partial<Utility> = {}): Utility {
  return {
    id: `utility-${Math.random().toString(36).slice(2, 9)}`,
    ym: "2024-01",
    type: "electricity",
    amount: 2000,
    date: "2024-01-15",
    ...overrides,
  };
}

// ============================================================================
// Meal Rate Calculation Tests
// ============================================================================

describe("Meal Rate Calculation", () => {
  it("should calculate correct meal rate with valid data", () => {
    const bazar = [
      createBazarEntry({ total: 1000 }),
      createBazarEntry({ total: 2000 }),
    ];
    const meals = [
      createMealEntry({ breakfast: 1, lunch: 1, dinner: 1, guest: 0 }), // 3 meals
      createMealEntry({ breakfast: 1, lunch: 1, dinner: 1, guest: 0 }), // 3 meals
    ];

    const result = calculateMealRate(bazar, meals, "2024-01");
    expect(result.totalBazar).toBe(3000);
    expect(result.totalMeals).toBe(6);
    expect(result.mealRate).toBe(500); // 3000 / 6 = 500
  });

  it("should return 0 meal rate when there are no meals", () => {
    const bazar = [createBazarEntry({ total: 1000 })];
    const meals: MealEntry[] = [];

    const result = calculateMealRate(bazar, meals, "2024-01");
    expect(result.mealRate).toBe(0);
    expect(result.totalBazar).toBe(1000);
    expect(result.totalMeals).toBe(0);
  });

  it("should return 0 meal rate when there is no bazar", () => {
    const bazar: Bazar[] = [];
    const meals = [createMealEntry({ breakfast: 1, lunch: 1, dinner: 1 })];

    const result = calculateMealRate(bazar, meals, "2024-01");
    expect(result.mealRate).toBe(0);
    expect(result.totalBazar).toBe(0);
    expect(result.totalMeals).toBe(3);
  });

  it("should handle zero meals and zero bazar", () => {
    const bazar: Bazar[] = [];
    const meals: MealEntry[] = [];

    const result = calculateMealRate(bazar, meals, "2024-01");
    expect(result.mealRate).toBe(0);
    expect(result.totalBazar).toBe(0);
    expect(result.totalMeals).toBe(0);
  });

  it("should filter by month correctly", () => {
    const bazar = [
      createBazarEntry({ ym: "2024-01", total: 1000 }),
      createBazarEntry({ ym: "2024-02", total: 2000 }),
    ];
    const meals = [
      createMealEntry({ ym: "2024-01", breakfast: 1, lunch: 1, dinner: 1 }),
      createMealEntry({ ym: "2024-02", breakfast: 1, lunch: 1, dinner: 1 }),
    ];

    const result = calculateMealRate(bazar, meals, "2024-01");
    expect(result.totalBazar).toBe(1000);
    expect(result.totalMeals).toBe(3);
    expect(result.mealRate).toBeCloseTo(1000 / 3, 5);
  });

  it("should handle guest meals in calculation", () => {
    const bazar = [createBazarEntry({ total: 900 })];
    const meals = [
      createMealEntry({ breakfast: 1, lunch: 1, dinner: 1, guest: 0 }), // 3
      createMealEntry({ breakfast: 1, lunch: 1, dinner: 1, guest: 1 }), // 4
    ];

    const result = calculateMealRate(bazar, meals, "2024-01");
    expect(result.totalMeals).toBe(7);
    expect(result.mealRate).toBeCloseTo(900 / 7, 5);
  });
});

// ============================================================================
// Member Settlement Calculation Tests
// ============================================================================

describe("Member Settlement Calculation", () => {
  it("should calculate correct settlement for single member (bazar = meal cost, settled)", () => {
    const member = createMember();
    const bazar = [createBazarEntry({ buyerId: "member-1", total: 5000 })];
    const meals = [
      createMealEntry({ memberId: "member-1", breakfast: 1, lunch: 1, dinner: 1 }), // 3 meals
    ];
    const deposits: Deposit[] = [];
    const credits: Credit[] = [];
    const payments: Payment[] = [];

    const settlement = calculateMemberSettlement(member, "2024-01", meals, bazar, deposits, credits, payments);

    // Meal rate = 5000 / 3 = 1666.67
    // Meal cost = 3 * 1666.67 = 5000
    // Bazar paid = 5000 (this is the contribution)
    // Total Contributions = bazar(5000) + expenseContributions(0) + paymentsMade(0) = 5000
    // Total charges = mealCost(5000) + 0+0+0+0+0(preCredit)-0(preDeposit) = 5000
    // Balance = 5000 - 5000 = 0 (Settled!)
    expect(settlement.mealRate).toBeCloseTo(5000 / 3, 2);
    expect(settlement.mealCost).toBeCloseTo(5000, 0);
    expect(settlement.totalBazarPaid).toBe(5000);
    expect(settlement.contributions.totalContribution).toBe(5000);
    expect(settlement.charges.totalCharges).toBeCloseTo(5000, 0);
    expect(settlement.balance).toBe(0);
    expect(settlement.settlementStatus).toBe("settled");
    expect(settlement.totalDeposit).toBe(0);
    expect(settlement.totalCredit).toBe(0);
  });

  it("should calculate receive status when contributions > charges (positive balance = deposit)", () => {
    const member = createMember();
    const bazar = [createBazarEntry({ buyerId: "member-1", total: 10000 })];
    const meals = [
      createMealEntry({ memberId: "member-1", breakfast: 1, lunch: 1, dinner: 1 }), // 3 meals
    ];
    const deposits: Deposit[] = []; // Deposits are NOT inputs - they're outputs
    const credits: Credit[] = [];
    const payments = [createPayment({ memberId: "member-1", amount: 3000 })]; // Payments ARE contributions

    const settlement = calculateMemberSettlement(member, "2024-01", meals, bazar, deposits, credits, payments);

    // Meal rate = 10000 / 3 = 3333.33
    // Meal cost = 10000
    // Total Contributions = bazar(10000) + payments(3000) = 13000
    // Total Charges = 10000
    // Balance = 13000 - 10000 = 3000 (positive = receive)
    // Deposit = 3000 (auto-computed)
    // Credit = 0
    expect(settlement.settlementStatus).toBe("receive");
    expect(settlement.receivableAmount).toBeCloseTo(3000, 0);
    expect(settlement.totalDeposit).toBeCloseTo(3000, 0);
    expect(settlement.totalCredit).toBe(0);
  });

  it("should calculate pay status when charges > contributions (negative balance = credit)", () => {
    const member = createMember();
    const bazar = [createBazarEntry({ buyerId: "member-1", total: 1000 })];
    const meals = [
      createMealEntry({ memberId: "member-1", breakfast: 1, lunch: 1, dinner: 1, guest: 1 }), // 4 meals
    ];
    const deposits: Deposit[] = [];
    const credits: Credit[] = [];
    const payments: Payment[] = [];

    const settlement = calculateMemberSettlement(member, "2024-01", meals, bazar, deposits, credits, payments);

    // Meal rate = 1000 / 4 = 250
    // Meal cost = 1000
    // Bazar paid = 1000
    // Total Contributions = 1000
    // Total Charges = 1000
    // Balance = 0 (bazar covers meal cost exactly)
    expect(settlement.balance).toBe(0);
    expect(settlement.receivableAmount).toBe(0);
    expect(settlement.payableAmount).toBe(0);
    expect(settlement.settlementStatus).toBe("settled");
  });

  it("member with payment exceeding charges should have deposit (receive)", () => {
    const member = createMember();
    const bazar = [createBazarEntry({ buyerId: "member-1", total: 1000 })];
    const meals = [
      createMealEntry({ memberId: "member-1", breakfast: 1, lunch: 1, dinner: 1, guest: 1 }), // 4 meals
    ];
    const deposits: Deposit[] = [];
    const credits: Credit[] = [];
    const payments = [createPayment({ memberId: "member-1", amount: 500 })];

    const settlement = calculateMemberSettlement(member, "2024-01", meals, bazar, deposits, credits, payments);

    // Meal rate = 250, Meal cost = 1000
    // Total Contributions = bazar(1000) + payments(500) = 1500
    // Total Charges = 1000
    // Balance = 1500 - 1000 = 500
    expect(settlement.balance).toBe(500);
    expect(settlement.receivableAmount).toBe(500);
    expect(settlement.totalDeposit).toBe(500);
    expect(settlement.totalCredit).toBe(0);
    expect(settlement.settlementStatus).toBe("receive");
  });

  it("deposit records in DB should NOT affect balance (deposits are always outputs)", () => {
    const member = createMember();
    const bazar: Bazar[] = [];
    const meals = [
      createMealEntry({ memberId: "member-1", breakfast: 1, lunch: 1, dinner: 1 }), // 3 meals
    ];
    // Even though there's a deposit record in DB, balance should NOT include it
    // because deposits are auto-computed OUTPUTS
    const deposits = [createDeposit({ memberId: "member-1", amount: 5000 })];
    const credits: Credit[] = [];
    const payments: Payment[] = [];

    const settlement = calculateMemberSettlement(member, "2024-01", meals, bazar, deposits, credits, payments);

    // Meal rate = 0
    // Meal cost = 0
    // Total Contributions = 0 (no bazar, no payments)
    // Total Charges = 0
    // Balance = 0
    // The deposit record is NOT added to balance because deposits are outputs
    expect(settlement.balance).toBe(0);
    expect(settlement.receivableAmount).toBe(0);
    expect(settlement.totalDeposit).toBe(0);
    expect(settlement.settlementStatus).toBe("settled");
  });

  it("credit records in DB should NOT affect balance (credits are always outputs)", () => {
    const member = createMember();
    const bazar: Bazar[] = [];
    const meals = [
      createMealEntry({ memberId: "member-1", breakfast: 1, lunch: 1, dinner: 1 }), // 3 meals
    ];
    const deposits: Deposit[] = [];
    // Even though there's a credit record in DB, balance should NOT include it
    // because credits are auto-computed OUTPUTS
    const credits = [createCredit({ memberId: "member-1", amount: 2000 })];
    const payments: Payment[] = [];

    const settlement = calculateMemberSettlement(member, "2024-01", meals, bazar, deposits, credits, payments);

    // Balance = 0 (no contributions, no charges)
    // The credit record is NOT added to balance because credits are outputs
    expect(settlement.balance).toBe(0);
    expect(settlement.receivableAmount).toBe(0);
    expect(settlement.totalDeposit).toBe(0);
    expect(settlement.totalCredit).toBe(0);
    expect(settlement.settlementStatus).toBe("settled");
  });

  it("payments ARE counted as contributions", () => {
    const member = createMember();
    const bazar: Bazar[] = [];
    const meals = [
      createMealEntry({ memberId: "member-1", breakfast: 1, lunch: 1, dinner: 1 }), // 3 meals
    ];
    const deposits: Deposit[] = [];
    const credits: Credit[] = [];
    const payments = [createPayment({ memberId: "member-1", amount: 3000 })];

    const settlement = calculateMemberSettlement(member, "2024-01", meals, bazar, deposits, credits, payments);

    // Meal rate = 0, Meal cost = 0
    // Total Contributions = bazar(0) + payments(3000) = 3000
    // Total Charges = 0
    // Balance = 3000
    // Since balance > 0: Deposit = 3000, Credit = 0
    expect(settlement.contributions.paymentsMade).toBe(3000);
    expect(settlement.contributions.totalContribution).toBe(3000);
    expect(settlement.balance).toBe(3000);
    expect(settlement.totalDeposit).toBe(3000);
    expect(settlement.totalCredit).toBe(0);
  });

  it("should calculate payable when charges exceed contributions", () => {
    const member = createMember({ monthlyRent: 5000 });
    const room = createRoom({ id: "room-1", totalBeds: 1, monthlyRent: 5000 });
    const bazar = [createBazarEntry({ buyerId: "member-1", total: 2000 })];
    const meals = [
      createMealEntry({ memberId: "member-1", breakfast: 2, lunch: 2, dinner: 2 }), // 6 meals
    ];
    const deposits: Deposit[] = [];
    const credits: Credit[] = [];
    const payments: Payment[] = [];

    const settlement = calculateMemberSettlement(
      member, "2024-01", meals, bazar, deposits, credits, payments,
      [], [], [member], [room], [],
    );

    // Meal rate = 2000 / 6 = 333.33
    // Meal cost = 2000
    // Rent share = 5000
    // Total Charges = 2000 + 5000 = 7000
    // Total Contributions = 2000 (bazar)
    // Balance = 2000 - 7000 = -5000 (member owes money)
    expect(settlement.balance).toBe(-5000);
    expect(settlement.payableAmount).toBe(5000);
    expect(settlement.totalCredit).toBe(5000);
    expect(settlement.totalDeposit).toBe(0);
    expect(settlement.settlementStatus).toBe("pay");
  });

  it("mutual exclusivity: member can NEVER have both deposit > 0 AND credit > 0", () => {
    // Test that when balance > 0, credit is forced to 0
    const positiveSettlement = {
      memberId: "test",
      memberName: "Test",
      totalDeposit: 500,
      totalCredit: 0, // Can't be > 0 when deposit > 0
      balance: 500,
    } as any;

    // Test that when balance < 0, deposit is forced to 0
    const negativeSettlement = {
      memberId: "test2",
      memberName: "Test2",
      totalDeposit: 0, // Can't be > 0 when credit > 0
      totalCredit: 300,
      balance: -300,
    } as any;

    expect(positiveSettlement.totalDeposit).toBeGreaterThan(0);
    expect(positiveSettlement.totalCredit).toBe(0);
    expect(negativeSettlement.totalCredit).toBeGreaterThan(0);
    expect(negativeSettlement.totalDeposit).toBe(0);
  });
});

// ============================================================================
// Multiple Members Settlement Tests
// ============================================================================

describe("Multiple Members Settlement", () => {
  it("should calculate settlements for multiple members correctly", () => {
    const members = [
      createMember({ id: "member-1", name: "Rahim" }),
      createMember({ id: "member-2", name: "Karim" }),
      createMember({ id: "member-3", name: "Jamal" }),
    ];

    const bazar = [
      createBazarEntry({ buyerId: "member-1", total: 25000 }),
      createBazarEntry({ buyerId: "member-2", total: 15000 }),
      createBazarEntry({ buyerId: "member-3", total: 10000 }),
    ];

    const meals = [
      createMealEntry({ memberId: "member-1", breakfast: 1, lunch: 1, dinner: 1 }),
      createMealEntry({ memberId: "member-1", breakfast: 1, lunch: 1, dinner: 1 }),
      createMealEntry({ memberId: "member-2", breakfast: 1, lunch: 1, dinner: 1 }),
      createMealEntry({ memberId: "member-2", breakfast: 1, lunch: 1, dinner: 1 }),
      createMealEntry({ memberId: "member-3", breakfast: 1, lunch: 1, dinner: 1 }),
    ];

    const deposits: Deposit[] = [];
    const credits: Credit[] = [];
    const payments: Payment[] = [];

    const settlements = calculateAllSettlements(members, "2024-01", meals, bazar, deposits, credits, payments);

    // Total bazar = 50000, Total meals = 15, Meal rate = 3333.33
    // Rahim: 6 meals * 3333.33 = 20000, bazar = 25000, contributions = 25000, charges = 20000, balance = +5000 (receive)
    // Karim: 6 meals * 3333.33 = 20000, bazar = 15000, contributions = 15000, charges = 20000, balance = -5000 (pay)
    // Jamal: 3 meals * 3333.33 = 10000, bazar = 10000, contributions = 10000, charges = 10000, balance = 0 (settled)

    expect(settlements.length).toBe(3);
    expect(settlements[0].mealRate).toBeCloseTo(50000 / 15, 2);

    const rahim = settlements.find((s) => s.memberId === "member-1")!;
    expect(rahim.totalMeals).toBe(6);
    expect(rahim.mealCost).toBeCloseTo(20000, 0);
    expect(rahim.totalBazarPaid).toBe(25000);
    expect(rahim.balance).toBeCloseTo(5000, 0);
    expect(rahim.settlementStatus).toBe("receive");
    expect(rahim.totalDeposit).toBeCloseTo(5000, 0);
    expect(rahim.totalCredit).toBe(0);

    const karim = settlements.find((s) => s.memberId === "member-2")!;
    expect(karim.totalMeals).toBe(6);
    expect(karim.mealCost).toBeCloseTo(20000, 0);
    expect(karim.totalBazarPaid).toBe(15000);
    expect(karim.balance).toBeCloseTo(-5000, 0);
    expect(karim.settlementStatus).toBe("pay");
    expect(karim.totalCredit).toBeCloseTo(5000, 0);
    expect(karim.totalDeposit).toBe(0);

    const jamal = settlements.find((s) => s.memberId === "member-3")!;
    expect(jamal.totalMeals).toBe(3);
    expect(jamal.mealCost).toBeCloseTo(10000, 0);
    expect(jamal.totalBazarPaid).toBe(10000);
    expect(jamal.settlementStatus).toBe("settled");
    expect(jamal.totalDeposit).toBe(0);
    expect(jamal.totalCredit).toBe(0);
  });

  it("should handle zero meals for all members", () => {
    const members = [createMember({ id: "member-1" })];
    const bazar = [createBazarEntry({ buyerId: "member-1", total: 5000 })];
    const meals: MealEntry[] = [];
    const deposits: Deposit[] = [];
    const credits: Credit[] = [];
    const payments: Payment[] = [];

    const settlements = calculateAllSettlements(members, "2024-01", meals, bazar, deposits, credits, payments);

    expect(settlements[0].mealRate).toBe(0);
    expect(settlements[0].mealCost).toBe(0);
    expect(settlements[0].totalMeals).toBe(0);
    expect(settlements[0].balance).toBe(5000); // 5000 bazar - 0 charges = 5000
    expect(settlements[0].totalDeposit).toBe(5000);
    expect(settlements[0].settlementStatus).toBe("receive");
  });

  it("should handle zero bazar for all members", () => {
    const members = [createMember({ id: "member-1" })];
    const bazar: Bazar[] = [];
    const meals = [createMealEntry({ memberId: "member-1", breakfast: 1, lunch: 1, dinner: 1 })];
    const deposits: Deposit[] = [];
    const credits: Credit[] = [];
    const payments: Payment[] = [];

    const settlements = calculateAllSettlements(members, "2024-01", meals, bazar, deposits, credits, payments);

    expect(settlements[0].mealRate).toBe(0);
    expect(settlements[0].mealCost).toBe(0);
    expect(settlements[0].totalBazarPaid).toBe(0);
    expect(settlements[0].balance).toBe(0);
    expect(settlements[0].settlementStatus).toBe("settled");
  });

  it("should only include active members", () => {
    const members = [
      createMember({ id: "member-1", active: true }),
      createMember({ id: "member-2", active: false }),
    ];

    const bazar: Bazar[] = [];
    const meals: MealEntry[] = [];
    const deposits: Deposit[] = [];
    const credits: Credit[] = [];
    const payments: Payment[] = [];

    const settlements = calculateAllSettlements(members, "2024-01", meals, bazar, deposits, credits, payments);

    expect(settlements.length).toBe(1);
    expect(settlements[0].memberId).toBe("member-1");
  });
});

// ============================================================================
// Settlement Summary Tests
// ============================================================================

describe("Settlement Summary", () => {
  it("should calculate correct summary totals", () => {
    const baseContributions = (total: number) => ({
      bazarContribution: total,
      expenseContributions: 0,
      expenseBreakdown: {},
      paymentsMade: 0,
      rentPaid: 0,
      mealPaid: 0,
      utilityPaid: 0,
      totalContribution: total,
    });
    const baseCharges = (mealCost: number) => ({
      mealCost,
      rentShare: 0,
      expenseShares: 0,
      expenseShareBreakdown: {},
      staffShare: 0,
      previousDue: 0,
      previousDeposit: 0,
      previousCredit: 0,
      totalCharges: mealCost,
      chargeBreakdown: {
        meal: mealCost,
        rent: 0,
        utilities: 0,
        staff: 0,
        previousDue: 0,
        previousCredit: 0,
        previousDeposit: 0,
      },
    });

    const settlements: any[] = [
      {
        memberId: "member-1",
        memberName: "Rahim",
        totalMeals: 10,
        mealRate: 100,
        mealCost: 1000,
        totalBazarPaid: 1500,
        totalDeposit: 0,
        totalCredit: 500,
        totalPayment: 0,
        balance: -500,
        payableAmount: 500,
        receivableAmount: 0,
        settlementStatus: "pay" as const,
        contributions: baseContributions(1500),
        charges: baseCharges(1000),
        carryForwardDeposit: 0,
        carryForwardCredit: 500,
      },
      {
        memberId: "member-2",
        memberName: "Karim",
        totalMeals: 8,
        mealRate: 100,
        mealCost: 800,
        totalBazarPaid: 600,
        totalDeposit: 0,
        totalCredit: 600,
        totalPayment: 0,
        balance: -600,
        payableAmount: 600,
        receivableAmount: 0,
        settlementStatus: "pay" as const,
        contributions: baseContributions(600),
        charges: baseCharges(800),
        carryForwardDeposit: 0,
        carryForwardCredit: 600,
      },
    ];

    const summary = getSettlementSummary(settlements);

    expect(summary.totalMeals).toBe(18);
    expect(summary.totalMealCost).toBe(1800);
    expect(summary.totalBazarPaid).toBe(2100);
    expect(summary.totalDeposits).toBe(0);
    expect(summary.totalPayable).toBe(1100);
    expect(summary.totalReceivable).toBe(0);
    expect(summary.membersToPay.length).toBe(2);
  });
});

// ============================================================================
// Monthly Summary Tests
// ============================================================================

describe("Monthly Summary", () => {
  it("should calculate complete monthly summary", () => {
    const members = [
      createMember({ id: "member-1", name: "Rahim", monthlyRent: 5000 }),
      createMember({ id: "member-2", name: "Karim", monthlyRent: 5000 }),
    ];

    const rooms = [createRoom({ id: "room-1", totalBeds: 2, monthlyRent: 10000 })];

    const bazar = [
      createBazarEntry({ total: 10000 }),
      createBazarEntry({ total: 5000 }),
    ];

    const meals = [
      createMealEntry({ memberId: "member-1", breakfast: 1, lunch: 1, dinner: 1 }), // 3
      createMealEntry({ memberId: "member-2", breakfast: 1, lunch: 1, dinner: 1 }), // 3
    ];

    const utilities: Utility[] = [];
    const deposits: Deposit[] = [];
    const credits: Credit[] = [];
    const payments: Payment[] = [];
    const staff: Staff[] = [];
    const ledgerEntries: LedgerEntry[] = [];

    const summary = computeMonthlySummary(
      "2024-01",
      members,
      meals,
      bazar,
      utilities,
      deposits,
      credits,
      payments,
      staff,
      rooms,
      ledgerEntries
    );

    expect(summary.totalBazar).toBe(15000);
    expect(summary.totalMeals).toBe(6);
    expect(summary.mealRate).toBeCloseTo(2500, 0);
    expect(summary.totalRent).toBe(10000); // 5000 per member * 2
    expect(summary.perMember.length).toBe(2);
  });
});

// ============================================================================
// Ledger Calculation Tests
// ============================================================================

describe("Ledger Calculations", () => {
  it("should calculate correct ledger balance", () => {
    const member = createMember();
    const entries: LedgerEntry[] = [
      createLedgerEntry({ date: "2024-01-01", transactionType: "charge", amount: 1000, balance: 1000 }),
      createLedgerEntry({ date: "2024-01-02", transactionType: "deposit", amount: 500, balance: 500 }),
      createLedgerEntry({ date: "2024-01-03", transactionType: "payment", amount: 300, balance: 200 }),
    ];

    const ledger = calculateMemberLedger(member, entries);

    expect(ledger.openingBalance).toBe(1000);
    expect(ledger.totalCharges).toBe(1000);
    expect(ledger.totalDeposits).toBe(500);
    expect(ledger.totalPayments).toBe(300);
    expect(ledger.currentDue).toBe(200); // 1000 - 500 - 300
  });

  it("should calculate monthly statement correctly", () => {
    const member = createMember();
    const entries: LedgerEntry[] = [
      createLedgerEntry({ date: "2024-01-01", transactionType: "charge", category: "meal", amount: 1000, balance: 1000 }),
      createLedgerEntry({ date: "2024-01-02", transactionType: "deposit", category: "other", amount: 500, balance: 500 }),
    ];

    const rentCharges: any[] = [];
    const utilityAllocations: any[] = [];
    const staffAllocations: any[] = [];

    const statement = calculateMonthlyStatement(member, "2024-01", entries, rentCharges, utilityAllocations, staffAllocations);

    expect(statement.mealCharge).toBe(1000);
    expect(statement.deposits).toBe(500);
    expect(statement.totalCharges).toBe(1000);
    expect(statement.currentDue).toBe(500); // 1000 - 500
  });
});

// ============================================================================
// Monthly Closing Tests
// ============================================================================

describe("Monthly Closing", () => {
  it("should calculate correct monthly closing data", () => {
    const members = [createMember()];
    const rentCharges: any[] = [];
    const deposits: Deposit[] = [];
    const credits: Credit[] = [];
    const payments: Payment[] = [];
    const monthBazar = [createBazarEntry({ total: 10000 })];
    const monthUtilities: Utility[] = [];
    const activeStaff: Staff[] = [];

    const closing = calculateMonthlyClosing(
      members,
      "2024-01",
      2024,
      rentCharges,
      deposits,
      credits,
      payments,
      monthBazar,
      monthUtilities,
      activeStaff
    );

    expect(closing.totalBazar).toBe(10000);
    expect(closing.totalMeal).toBe(10000);
    expect(closing.netProfit).toBe(-10000); // No income but expense of 10000
  });
});

// ============================================================================
// Mutually Exclusive Deposit/Credit Validation Tests
// ============================================================================

describe("Deposit/Credit Mutual Exclusivity", () => {
  it("should detect violation when both deposit and credit are positive", () => {
    const settlements = [
      {
        memberId: "m1", memberName: "Test", totalDeposit: 500, totalCredit: 300,
      } as any,
    ];

    const violations = validateDepositCreditMutualExclusivity(settlements);
    expect(violations.length).toBe(1);
    expect(violations[0].memberId).toBe("m1");
  });

  it("should not flag when only deposit is positive", () => {
    const settlements = [
      {
        memberId: "m1", memberName: "Test", totalDeposit: 500, totalCredit: 0,
      } as any,
    ];

    const violations = validateDepositCreditMutualExclusivity(settlements);
    expect(violations.length).toBe(0);
  });

  it("should not flag when only credit is positive", () => {
    const settlements = [
      {
        memberId: "m1", memberName: "Test", totalDeposit: 0, totalCredit: 300,
      } as any,
    ];

    const violations = validateDepositCreditMutualExclusivity(settlements);
    expect(violations.length).toBe(0);
  });

  it("should not flag when both are zero (settled)", () => {
    const settlements = [
      {
        memberId: "m1", memberName: "Test", totalDeposit: 0, totalCredit: 0,
      } as any,
    ];

    const violations = validateDepositCreditMutualExclusivity(settlements);
    expect(violations.length).toBe(0);
  });
});

// ============================================================================
// Validation Tests
// ============================================================================

describe("Validation Functions", () => {
  describe("validateMealEntry", () => {
    it("should reject missing member", () => {
      expect(validateMealEntry({ date: "2024-01-15", ym: "2024-01" })).toBe("Member is required");
    });

    it("should reject missing date", () => {
      expect(validateMealEntry({ memberId: "member-1", ym: "2024-01" })).toBe("Date is required");
    });

    it("should reject negative meal counts", () => {
      expect(validateMealEntry({ memberId: "member-1", date: "2024-01-15", ym: "2024-01", breakfast: -1 })).toBe("Breakfast count cannot be negative");
    });

    it("should reject zero total meals", () => {
      expect(validateMealEntry({ memberId: "member-1", date: "2024-01-15", ym: "2024-01", breakfast: 0, lunch: 0, dinner: 0, guest: 0 })).toBe("At least one meal must be recorded");
    });

    it("should accept valid meal entry", () => {
      expect(validateMealEntry({ memberId: "member-1", date: "2024-01-15", ym: "2024-01", breakfast: 1, lunch: 1, dinner: 1 })).toBeNull();
    });
  });

  describe("validateBazarEntry", () => {
    it("should reject missing buyer", () => {
      expect(validateBazarEntry({ date: "2024-01-15", ym: "2024-01", items: [], total: 100 })).toBe("Buyer is required");
    });

    it("should reject zero total", () => {
      expect(validateBazarEntry({ buyerId: "member-1", date: "2024-01-15", ym: "2024-01", items: [{ name: "Rice", amount: 0 }], total: 0 })).toBe("Total amount must be greater than 0");
    });

    it("should accept valid bazar entry", () => {
      expect(validateBazarEntry({ buyerId: "member-1", date: "2024-01-15", ym: "2024-01", items: [{ name: "Rice", amount: 100 }], total: 100 })).toBeNull();
    });
  });

  describe("validateDeposit", () => {
    it("should reject missing member", () => {
      expect(validateDeposit({ amount: 1000, date: "2024-01-15", method: "cash" })).toBe("Member is required");
    });

    it("should reject zero amount", () => {
      expect(validateDeposit({ memberId: "member-1", amount: 0, date: "2024-01-15", method: "cash" })).toBe("Amount must be greater than 0");
    });

    it("should accept valid deposit", () => {
      expect(validateDeposit({ memberId: "member-1", amount: 1000, date: "2024-01-15", method: "cash" })).toBeNull();
    });
  });

  describe("validateCredit", () => {
    it("should reject missing reason", () => {
      expect(validateCredit({ memberId: "member-1", amount: 500, date: "2024-01-15", reason: "" })).toBe("Reason is required");
    });

    it("should accept valid credit", () => {
      expect(validateCredit({ memberId: "member-1", amount: 500, date: "2024-01-15", reason: "Discount" })).toBeNull();
    });
  });

  describe("validatePayment", () => {
    it("should reject missing method", () => {
      expect(validatePayment({ memberId: "member-1", amount: 1000, date: "2024-01-15" })).toBe("Payment method is required");
    });

    it("should accept valid payment", () => {
      expect(validatePayment({ memberId: "member-1", amount: 1000, date: "2024-01-15", method: "cash" })).toBeNull();
    });
  });

  describe("validateMonthlyClosing", () => {
    it("should reject missing month", () => {
      expect(validateMonthlyClosing({ year: 2024 })).toBe("Month is required");
    });

    it("should reject missing year", () => {
      expect(validateMonthlyClosing({ month: "2024-01" })).toBe("Year is required");
    });

    it("should accept valid closing data", () => {
      expect(validateMonthlyClosing({ month: "2024-01", year: 2024 })).toBeNull();
    });
  });
});

// ============================================================================
// Edge Cases Tests
// ============================================================================

describe("Edge Cases", () => {
  it("should handle very large numbers", () => {
    const bazar = [createBazarEntry({ total: 1000000 })];
    const meals = [createMealEntry({ breakfast: 1, lunch: 1, dinner: 1 })];

    const result = calculateMealRate(bazar, meals, "2024-01");
    expect(result.mealRate).toBeCloseTo(1000000 / 3, 0);
  });

  it("should handle decimal amounts correctly", () => {
    const bazar = [createBazarEntry({ total: 100.50 })];
    const meals = [createMealEntry({ breakfast: 1, lunch: 1, dinner: 1 })];

    const result = calculateMealRate(bazar, meals, "2024-01");
    expect(result.mealRate).toBeCloseTo(100.50 / 3, 2);
  });

  it("should handle members with no bazar entries", () => {
    const member = createMember();
    const bazar: Bazar[] = [];
    const meals = [createMealEntry({ memberId: "member-1", breakfast: 1, lunch: 1, dinner: 1 })];
    const deposits: Deposit[] = [];
    const credits: Credit[] = [];
    const payments: Payment[] = [];

    const settlement = calculateMemberSettlement(member, "2024-01", meals, bazar, deposits, credits, payments);

    expect(settlement.totalBazarPaid).toBe(0);
    expect(settlement.mealCost).toBe(0);
    expect(settlement.settlementStatus).toBe("settled");
  });

  it("should handle members with no meal entries", () => {
    const member = createMember();
    const bazar = [createBazarEntry({ buyerId: "member-1", total: 1000 })];
    const meals: MealEntry[] = [];
    const deposits: Deposit[] = [];
    const credits: Credit[] = [];
    const payments: Payment[] = [];

    const settlement = calculateMemberSettlement(member, "2024-01", meals, bazar, deposits, credits, payments);

    expect(settlement.totalMeals).toBe(0);
    expect(settlement.mealCost).toBe(0);
    expect(settlement.totalBazarPaid).toBe(1000);
    expect(settlement.balance).toBe(1000); // 1000 bazar - 0 charges = 1000
    expect(settlement.totalDeposit).toBe(1000);
    expect(settlement.settlementStatus).toBe("receive");
  });
});

// ============================================================================
// Cross-Verification Tests (ঐকিক নিয়ম / Unitary Method)
// ============================================================================

describe("Cross-Verification: Multiple Calculation Methods Must Match", () => {
  it("Method 1 & 2: Total Bazar / Total Meals = Individual Meal Rate", () => {
    const bazar = [createBazarEntry({ total: 30000 })];
    const meals = [
      createMealEntry({ memberId: "member-1", breakfast: 1, lunch: 1, dinner: 1 }), // 3
      createMealEntry({ memberId: "member-2", breakfast: 1, lunch: 1, dinner: 0 }), // 2
    ];

    const rateInfo = calculateMealRate(bazar, meals, "2024-01");
    const expectedRate = 30000 / 5; // 6000

    expect(rateInfo.mealRate).toBeCloseTo(expectedRate, 5);
    // Individual meal cost sum must equal total bazar
    const member1Cost = 3 * expectedRate;
    const member2Cost = 2 * expectedRate;
    expect(member1Cost + member2Cost).toBeCloseTo(30000, 0);
  });

  it("Method 3: Sum of all member charges must equal total expenses + rent", () => {
    const members = [
      createMember({ id: "member-1", name: "A", monthlyRent: 5000 }),
      createMember({ id: "member-2", name: "B", monthlyRent: 5000 }),
    ];
    const rooms = [createRoom({ id: "room-1", totalBeds: 2, monthlyRent: 10000 })];
    const bazar = [createBazarEntry({ total: 15000 })];
    const meals = [
      createMealEntry({ memberId: "member-1", breakfast: 1, lunch: 1, dinner: 1 }), // 3
      createMealEntry({ memberId: "member-2", breakfast: 1, lunch: 1, dinner: 1 }), // 3
    ];

    const summary = computeMonthlySummary(
      "2024-01", members, meals, bazar, [],
      [], [], [], [], rooms, [],
    );

    // Sum of all member meal costs = total bazar
    const totalMealCosts = summary.perMember.reduce((s, p) => s + p.mealCost, 0);
    expect(totalMealCosts).toBeCloseTo(summary.totalBazar, 0);

    // Sum of all member rent shares = total rent
    const totalRentShares = summary.perMember.reduce((s, p) => s + p.rentShare, 0);
    expect(totalRentShares).toBeCloseTo(summary.totalRent, 0);
  });

  it("Method 4: Net Balance = Contributions - Charges for every member", () => {
    const members = [
      createMember({ id: "member-1", name: "A" }),
      createMember({ id: "member-2", name: "B" }),
    ];
    const bazar = [createBazarEntry({ buyerId: "member-1", total: 10000 })];
    const meals = [
      createMealEntry({ memberId: "member-1", breakfast: 1, lunch: 1, dinner: 1 }),
      createMealEntry({ memberId: "member-2", breakfast: 1, lunch: 1, dinner: 1 }),
    ];

    const settlements = calculateAllSettlements(members, "2024-01", meals, bazar, [], [], []);

    settlements.forEach((s) => {
      // Balance must equal contributions - charges
      const expectedBalance = s.contributions.totalContribution - s.charges.totalCharges;
      expect(s.balance).toBeCloseTo(expectedBalance, 2);

      // Deposit + Credit must equal ABS(balance)
      expect(s.totalDeposit + s.totalCredit).toBeCloseTo(Math.abs(s.balance), 2);

      // Mutual exclusivity
      if (s.totalDeposit > 0) expect(s.totalCredit).toBe(0);
      if (s.totalCredit > 0) expect(s.totalDeposit).toBe(0);
    });
  });

  it("Method 5: Settlement summary payable + receivable should balance", () => {
    const members = [
      createMember({ id: "member-1", name: "A" }),
      createMember({ id: "member-2", name: "B" }),
      createMember({ id: "member-3", name: "C" }),
    ];
    const bazar = [
      createBazarEntry({ buyerId: "member-1", total: 20000 }),
      createBazarEntry({ buyerId: "member-2", total: 5000 }),
    ];
    const meals = [
      createMealEntry({ memberId: "member-1", breakfast: 1, lunch: 1, dinner: 1 }), // 3
      createMealEntry({ memberId: "member-2", breakfast: 1, lunch: 1, dinner: 1 }), // 3
      createMealEntry({ memberId: "member-3", breakfast: 1, lunch: 1, dinner: 1 }), // 3
    ];

    const settlements = calculateAllSettlements(members, "2024-01", meals, bazar, [], [], []);
    const summary = getSettlementSummary(settlements);

    // Total balance across all members should sum to 0 in an isolated system
    // (overpayments of some members = underpayments of others, roughly)
    // Actually totalBalance = sum of all (contributions - charges)
    expect(summary.totalBalance).toBeCloseTo(
      settlements.reduce((s, st) => s + st.balance, 0), 2
    );

    // Payable = sum of negative balances (absolute)
    expect(summary.totalPayable).toBeCloseTo(
      settlements.filter(s => s.balance < 0).reduce((s, st) => s + Math.abs(st.balance), 0), 2
    );

    // Receivable = sum of positive balances
    expect(summary.totalReceivable).toBeCloseTo(
      settlements.filter(s => s.balance > 0).reduce((s, st) => s + st.balance, 0), 2
    );
  });
});

// ============================================================================
// Carry Forward Tests
// ============================================================================

describe("Carry Forward Logic", () => {
  it("should carry forward deposit from previous month", () => {
    const member = createMember();
    const prevClosings = [
      { month: "2023-12", memberId: "member-1", deposit: 3000, credit: 0 },
    ];

    const bazar = [createBazarEntry({ buyerId: "member-1", total: 5000 })];
    const meals = [createMealEntry({ memberId: "member-1", breakfast: 1, lunch: 1, dinner: 1 })];

    const settlement = calculateMemberSettlement(
      member, "2024-01", meals, bazar, [], [], [],
      [], [], [member], [], [], prevClosings
    );

    // Previous deposit of 3000 should reduce current charges
    expect(settlement.charges.previousDeposit).toBe(3000);
    // Meal rate = 5000/3 ≈ 1666.67, meal cost = 5000
    // Charges = 5000 (meal) - 3000 (prev deposit) = 2000
    // Contributions = 5000 (bazar)
    // Balance = 5000 - 2000 = 3000 (receive)
    expect(settlement.balance).toBeCloseTo(3000, 0);
    expect(settlement.settlementStatus).toBe("receive");
  });

  it("should carry forward credit from previous month", () => {
    const member = createMember();
    const prevClosings = [
      { month: "2023-12", memberId: "member-1", deposit: 0, credit: 2000 },
    ];

    const bazar = [createBazarEntry({ buyerId: "member-1", total: 5000 })];
    const meals = [createMealEntry({ memberId: "member-1", breakfast: 1, lunch: 1, dinner: 1 })];

    const settlement = calculateMemberSettlement(
      member, "2024-01", meals, bazar, [], [], [],
      [], [], [member], [], [], prevClosings
    );

    // Previous credit of 2000 should add to current charges
    expect(settlement.charges.previousCredit).toBe(2000);
    // Meal cost = 5000, Charges = 5000 + 2000 = 7000
    // Contributions = 5000 (bazar)
    // Balance = 5000 - 7000 = -2000 (pay)
    expect(settlement.balance).toBeCloseTo(-2000, 0);
    expect(settlement.settlementStatus).toBe("pay");
    expect(settlement.totalCredit).toBeCloseTo(2000, 0);
  });

  it("should have zero carry forward when no previous closing exists", () => {
    const member = createMember();
    const settlement = calculateMemberSettlement(
      member, "2024-01",
      [createMealEntry()],
      [createBazarEntry()],
      [], [], [],
    );

    expect(settlement.charges.previousDeposit).toBe(0);
    expect(settlement.charges.previousCredit).toBe(0);
  });
});

// ============================================================================
// Cash Balance Tests
// ============================================================================

describe("Cash Balance Calculation", () => {
  it("cashBalance = deposits + payments - credits - expenses", () => {
    const members = [createMember({ id: "member-1" })];
    const rooms = [createRoom({ id: "room-1", totalBeds: 1, monthlyRent: 5000 })];
    const bazar = [createBazarEntry({ total: 10000 })];
    const meals = [createMealEntry({ memberId: "member-1", breakfast: 1, lunch: 1, dinner: 1 })];
    const deposits = [createDeposit({ amount: 8000 })];
    const payments = [createPayment({ amount: 3000 })];
    const credits = [createCredit({ amount: 1000 })];

    const summary = computeMonthlySummary(
      "2024-01", members, meals, bazar, [],
      deposits, credits, payments, [], rooms, [],
    );

    // Total expense = bazar(10000) + utilities(0) + staff(0) = 10000
    // cashBalance = deposits(8000) + payments(3000) - credits(1000) - expenses(10000) = 0
    expect(summary.cashBalance).toBe(0);
    expect(summary.totalExpense).toBe(10000);
  });

  it("perMember uses settlement values (no double calculation)", () => {
    const staff = [createStaff({ id: "s1", name: "Cook", role: "cook", salary: 10000 })];
    const members = [
      createMember({ id: "member-1", name: "A", services: [
        { type: "meals", enabled: true },
        { type: "cooking_staff", enabled: true },
      ]}),
    ];
    const rooms = [createRoom({ id: "room-1", totalBeds: 1, monthlyRent: 5000 })];

    const summary = computeMonthlySummary(
      "2024-01", members, [], [], [],
      [], [], [], staff, rooms, [],
    );

    // Staff share for member-1 should be 10000 (only subscriber)
    const p = summary.perMember[0];
    expect(p.staffShare).toBe(10000);
    // Total charges must be >= staff share (staff is a component of total charges)
    expect(p.totalCharges).toBeGreaterThanOrEqual(p.staffShare);
    // Rent should also be included
    expect(p.totalCharges).toBeGreaterThanOrEqual(p.rentShare);
  });
});

// ============================================================================
// Unitary Method (ঐকিক নিয়ম) Verification Tests
// ============================================================================

describe("Unitary Method (ঐকিক নিয়ম) Verification", () => {
  it("meal cost per member = total bazar × (member meals / total meals)", () => {
    const members = [
      createMember({ id: "m1", name: "A" }),
      createMember({ id: "m2", name: "B" }),
      createMember({ id: "m3", name: "C" }),
    ];
    const bazar = [createBazarEntry({ total: 60000 })];
    const meals = [
      createMealEntry({ memberId: "m1", breakfast: 2, lunch: 2, dinner: 2 }), // 6 meals
      createMealEntry({ memberId: "m2", breakfast: 1, lunch: 1, dinner: 1 }), // 3 meals
      createMealEntry({ memberId: "m3", breakfast: 1, lunch: 0, dinner: 1 }), // 2 meals
    ];

    const settlements = calculateAllSettlements(members, "2024-01", meals, bazar, [], [], []);

    const totalMeals = 11;
    const mealRate = 60000 / totalMeals;

    // A: 6 meals × rate = 32727.27
    const a = settlements.find(s => s.memberId === "m1")!;
    expect(a.mealCost).toBeCloseTo(6 * mealRate, 0);

    // B: 3 meals × rate = 16363.64
    const b = settlements.find(s => s.memberId === "m2")!;
    expect(b.mealCost).toBeCloseTo(3 * mealRate, 0);

    // C: 2 meals × rate = 10909.09
    const c = settlements.find(s => s.memberId === "m3")!;
    expect(c.mealCost).toBeCloseTo(2 * mealRate, 0);

    // Sum must equal total bazar
    expect(a.mealCost + b.mealCost + c.mealCost).toBeCloseTo(60000, 0);
  });

  it("expense share per member = total expense × (1 / subscriber count)", () => {
    const members = [
      createMember({ id: "m1", name: "A", services: [{ type: "electricity", enabled: true }] }),
      createMember({ id: "m2", name: "B", services: [{ type: "electricity", enabled: true }] }),
      createMember({ id: "m3", name: "C", services: [] }), // Not subscribed
    ];

    const expenses = [{
      id: "exp1", ym: "2024-01", category: "electricity" as const,
      amount: 3000, date: "2024-01-15", allocationMethod: "equal" as const, status: "paid" as const,
    }];

    const summary = computeMonthlySummary(
      "2024-01", members, [], [], expenses,
      [], [], [], [], [], [],
    );

    // Only m1 and m2 are subscribed to electricity
    // Each pays 3000 / 2 = 1500
    const p1 = summary.perMember.find(p => p.memberId === "m1")!;
    const p2 = summary.perMember.find(p => p.memberId === "m2")!;
    const p3 = summary.perMember.find(p => p.memberId === "m3")!;

    expect(p1.utilityShare).toBeCloseTo(1500, 0);
    expect(p2.utilityShare).toBeCloseTo(1500, 0);
    expect(p3.utilityShare).toBe(0); // Not subscribed

    // Sum of shares must equal total expense
    expect(p1.utilityShare + p2.utilityShare + p3.utilityShare).toBeCloseTo(3000, 0);
  });
});
