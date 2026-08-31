/**
 * Automatic Charge Generation Service
 * =====================================
 * 
 * Automatically generates member charges whenever ANY financial obligation is created.
 * 
 * Triggers for charge generation:
 *   - Shared Expense created → Generate per-member charges
 *   - Bazar entry created → Generate meal charges (via meal rate)
 *   - Rent charge created → Generate rent charges
 *   - Utility bill created → Generate utility charges
 *   - Staff salary created → Generate staff charges
 *   - Monthly closing adjustment → Generate adjustment charges
 *   - Future modules → Must also generate charges
 * 
 * Each charge is recorded in the "ledgers" collection with:
 *   - memberId: Who owes
 *   - transactionType: What type of charge (meal_charge, rent_charge, etc.)
 *   - category: The expense category
 *   - amount: How much they owe
 *   - ym: The month
 *   - date: When it was charged
 * 
 * CRITICAL: Charges are NEVER duplicated. The system checks for existing charges
 * before creating new ones.
 */
import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Member, Expense, ExpenseAllocation, Room, Staff } from "./types";
import { EXPENSE_CATEGORY_LABELS } from "./types";
import { calculateMemberExpenseShares, calculateMemberStaffShare } from "./calculations/engine-v2";
import { createAdvance } from "./advance-service";
import { checkLedgerChargeExists, checkInternalPaymentExists, checkPaymentReferenceExists } from "./duplicate-check";

// ============================================================================
// 1. GENERATE CHARGES FROM A SHARED EXPENSE
// ============================================================================

/**
 * When a shared expense is created:
 * 1. Calculate each member's share based on allocation method
 * 2. Create expense_allocations records
 * 3. Generate ledger charges for each member
 * 4. Auto-pay the expense payer's own share (create internal payment)
 * 5. Create an advance for the excess (expense - payer's share)
 * 
 * This is called AFTER the expense is created in Firebase.
 */
export async function generateChargesFromExpense(
  expense: Expense,
  members: Member[],
  rooms: Room[],
  staff: Staff[],
  uid?: string,
): Promise<{
  allocationsCreated: number;
  chargesCreated: number;
  advanceCreated: string | null;
  advanceAmount: number;
}> {
  const activeMembers = members.filter((m) => m.active);
  const amount = expense.amount || 0;
  const ym = expense.ym;

  // 1. Calculate allocations
  const allocations = calculateExpenseAllocationsForExpense(expense, activeMembers);

  // 2. Save allocations and generate charges
  let allocationsCreated = 0;
  let chargesCreated = 0;

  for (const allocation of allocations) {
    // Check if charge already exists for this member+month+category+date
    const exists = await checkLedgerChargeExists(
      allocation.memberId,
      ym,
      expense.category,
      expense.date,
    );
    if (exists) {
      continue;
    }

    // Save allocation to expense_allocations collection
    await addDoc(collection(db, "expense_allocations"), {
      ...allocation,
      createdAt: Date.now(),
      createdBy: uid,
    });
    allocationsCreated++;

    // Generate ledger charge for this member's share
    if (allocation.amount > 0) {
      const categoryLabel = EXPENSE_CATEGORY_LABELS[expense.category] || expense.category;

      await addDoc(collection(db, "ledgers"), {
        memberId: allocation.memberId,
        memberName: allocation.memberName,
        date: expense.date,
        ym,
        transactionType: "utility_charge",
        category: expense.category,
        amount: allocation.amount,
        notes: `${categoryLabel} for ${ym} - share: ${allocation.amount}`,
        referenceId: expense.id,
        referenceType: "expense",
        createdAt: Date.now(),
        createdBy: uid,
      });
      chargesCreated++;
    }
  }

  // 3. Auto-pay the expense payer's own share
  if (expense.paidBy) {
    const payerAllocation = allocations.find((a) => a.memberId === expense.paidBy);
    const payerShare = payerAllocation?.amount || 0;
    const payer = activeMembers.find((m) => m.id === expense.paidBy);

    if (payer && payerShare > 0) {
      // Check if the internal auto-payment already exists (NOT the same as
      // checkExpenseAllocationExists — that always returns true here since
      // every member's allocation, including the payer's, was just created
      // in the loop above, which would silently skip this payment forever)
      const paymentExists = await checkInternalPaymentExists(expense.id, expense.paidBy);
      if (!paymentExists) {
        // Record internal payment - payer's own share is auto-paid
        await addDoc(collection(db, "payments"), {
          memberId: expense.paidBy,
          memberName: payer.name,
          amount: payerShare,
          method: "cash",
          date: expense.date,
          ym,
          status: "paid",
          category: expense.category,
          notes: `Auto-payment: ${payer.name}'s own share of ${EXPENSE_CATEGORY_LABELS[expense.category] || expense.category}`,
          referenceId: expense.id,
          referenceType: "expense",
          createdAt: Date.now(),
          createdBy: uid,
        });

        // Record in ledger as payment
        await addDoc(collection(db, "ledgers"), {
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
      }

      // 4. Create advance for the excess (expense amount - payer's share)
      const advanceAmount = amount - payerShare;
      if (advanceAmount > 0 && payer) {
        const categoryLabel = EXPENSE_CATEGORY_LABELS[expense.category] || expense.category;
        const advanceId = await createAdvance(
          expense.paidBy,
          payer.name,
          advanceAmount,
          `${categoryLabel} - ${expense.date}`,
          "expense",
          expense.id,
          ym,
          uid,
        );

        return { allocationsCreated, chargesCreated, advanceCreated: advanceId, advanceAmount };
      }
    }
  }

  return { allocationsCreated, chargesCreated, advanceCreated: null, advanceAmount: 0 };
}

/**
 * Calculate expense allocations for each member based on the expense's allocation method
 */
function calculateExpenseAllocationsForExpense(
  expense: Expense,
  activeMembers: Member[],
): Omit<ExpenseAllocation, "id" | "createdAt" | "createdBy">[] {
  const serviceType = getServiceTypeForExpenseCategory(expense.category);
  let subscribers = serviceType
    ? activeMembers.filter((m) => isMemberSubscribedToService(m, serviceType))
    : activeMembers;
  if (serviceType && subscribers.length === 0) {
    // Nobody has explicitly subscribed — don't let the expense vanish from
    // everyone's charges. Fall back to every active member who hasn't
    // explicitly opted out.
    subscribers = activeMembers.filter((m) => !isMemberExplicitlyOptedOut(m, serviceType));
    if (subscribers.length === 0) subscribers = activeMembers;
  }

  const totalSubscribers = subscribers.length || 1;
  const amount = expense.amount || 0;

  return activeMembers.map((member) => {
    const isSubscribed = serviceType
      ? subscribers.some((m) => m.id === member.id) && !isMemberExplicitlyOptedOut(member, serviceType)
      : true;

    if (!isSubscribed) {
      return {
        expenseId: expense.id,
        memberId: member.id,
        memberName: member.name,
        category: expense.category,
        amount: 0,
        subscribed: false,
        ym: expense.ym,
        status: "pending" as const,
      };
    }

    let memberAmount = 0;
    switch (expense.allocationMethod) {
      case "equal":
      case "per_member":
        memberAmount = amount / totalSubscribers;
        break;
      case "per_room": {
        const memberRoomId = member.roomId;
        const roomMembers = activeMembers.filter((m) => m.roomId === memberRoomId);
        const totalRooms = new Set(subscribers.map((m) => m.roomId)).size;
        memberAmount = totalRooms > 0 ? amount / totalRooms / (roomMembers.length || 1) : 0;
        break;
      }
      default:
        memberAmount = amount / totalSubscribers;
    }

    return {
      expenseId: expense.id,
      memberId: member.id,
      memberName: member.name,
      category: expense.category,
      amount: Math.round(memberAmount * 100) / 100,
      subscribed: true,
      ym: expense.ym,
      status: "pending" as const,
      paidAmount: 0,
      dueAmount: Math.round(memberAmount * 100) / 100,
    };
  });
}

function isMemberExplicitlyOptedOut(member: Member, serviceType: string): boolean {
  if (!member.services) return false;
  return member.services.some((s) => s.type === serviceType && s.enabled === false);
}

function isMemberSubscribedToService(member: Member, serviceType: string): boolean {
  if (!member.services) return false;
  return member.services.some((s) => s.type === serviceType && s.enabled);
}

function getServiceTypeForExpenseCategory(category: string): string | null {
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
// 2. GENERATE RENT CHARGES
// ============================================================================

/**
 * Generate rent charges for all active members for a given month.
 * Only creates charges for members who have room assignment and monthly rent.
 */
export async function generateRentCharges(
  members: Member[],
  rooms: Room[],
  ym: string,
  uid?: string,
): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;

  for (const member of members.filter((m) => m.active && m.roomId)) {
    const room = rooms.find((r) => r.id === member.roomId);
    if (!room || !room.totalBeds) {
      skipped++;
      continue;
    }

    const rentAmount = Math.round((room.monthlyRent / room.totalBeds) * 100) / 100;
    if (rentAmount <= 0) {
      skipped++;
      continue;
    }

    // Check if rent charge already exists for this member+month
    const existingQuery = query(
      collection(db, "rent_charges"),
      where("memberId", "==", member.id),
      where("month", "==", ym),
    );
    const existing = await getDocs(existingQuery);
    if (!existing.empty) {
      skipped++;
      continue;
    }

    // Create rent charge
    await addDoc(collection(db, "rent_charges"), {
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

    // Generate ledger charge with date check
    const chargeDate = `${ym}-01`;
    const ledgerExists = await checkLedgerChargeExists(
      member.id,
      ym,
      "rent",
      chargeDate,
    );
    if (!ledgerExists) {
      await addDoc(collection(db, "ledgers"), {
        memberId: member.id,
        memberName: member.name,
        date: chargeDate,
        ym,
        transactionType: "rent_charge",
        category: "rent",
        amount: rentAmount,
        notes: `Rent for ${ym} - ${room.roomNo} (${room.monthlyRent}/${room.totalBeds} beds)`,
        createdAt: Date.now(),
        createdBy: uid,
      });
    }

    created++;
  }

  return { created, skipped };
}

// ============================================================================
// 3. GENERATE STAFF CHARGES
// ============================================================================

/**
 * Generate staff charges for all active members based on their service subscriptions.
 */
export async function generateStaffCharges(
  staff: Staff[],
  members: Member[],
  ym: string,
  uid?: string,
): Promise<{ created: number }> {
  let created = 0;
  const activeMembers = members.filter((m) => m.active);
  const activeStaff = staff.filter((s) => s.status !== "inactive");

  for (const member of activeMembers) {
    const staffShare = calculateMemberStaffShareFromService(member, activeStaff, activeMembers);
    if (staffShare <= 0) continue;

    // Check if staff charge already exists for this member+month+date
    const chargeDate = `${ym}-01`;
    const exists = await checkLedgerChargeExists(
      member.id,
      ym,
      "staff",
      chargeDate,
    );
    if (exists) continue;

    // Generate ledger charge
    await addDoc(collection(db, "ledgers"), {
      memberId: member.id,
      memberName: member.name,
      date: chargeDate,
      ym,
      transactionType: "staff_charge",
      category: "staff",
      amount: Math.round(staffShare * 100) / 100,
      notes: `Staff salary share for ${ym}`,
      createdAt: Date.now(),
      createdBy: uid,
    });

    created++;
  }

  return { created };
}

function calculateMemberStaffShareFromService(
  member: Member,
  activeStaff: Staff[],
  activeMembers: Member[],
): number {
  const STAFF_SERVICE_MAP: Record<string, string> = {
    cook: "cooking_staff",
    cleaner: "cleaning_staff",
    security: "security_staff",
    helper: "other_services",
    accountant: "other_services",
    manager: "other_services",
  };

  let staffShare = 0;
  activeStaff.forEach((s) => {
    const serviceType = STAFF_SERVICE_MAP[s.role] || "other_services";
    if (isMemberExplicitlyOptedOut(member, serviceType)) return;
    let subscribers = activeMembers.filter((m) => isMemberSubscribedToService(m, serviceType));
    if (subscribers.length === 0) {
      subscribers = activeMembers.filter((m) => !isMemberExplicitlyOptedOut(m, serviceType));
      if (subscribers.length === 0) subscribers = activeMembers;
    }
    if (!subscribers.some((m) => m.id === member.id)) return;
    const totalSubscribers = subscribers.length || 1;
    const staffCost = (s.salary || 0) + (s.overtime || 0) + (s.bonus || 0) - (s.advance || 0);
    staffShare += staffCost / totalSubscribers;
  });

  return staffShare;
}

// ============================================================================
// 4. GENERATE CHARGES FROM ALL SOURCES (BATCH)
// ============================================================================

/**
 * Generate ALL charges for a month from all sources.
 * This should be called when setting up a new month or recalculating.
 */
export async function generateAllChargesForMonth(
  ym: string,
  members: Member[],
  rooms: Room[],
  staff: Staff[],
  expenses: Expense[],
  uid?: string,
): Promise<{
  rentCreated: number;
  staffCreated: number;
  expenseCreated: number;
  allocationsCreated: number;
}> {
  // Generate rent charges
  const rentResult = await generateRentCharges(members, rooms, ym, uid);

  // Generate staff charges
  const staffResult = await generateStaffCharges(staff, members, ym, uid);

  // Generate charges from each expense that hasn't been processed yet
  let expenseCreated = 0;
  let allocationsCreated = 0;

  for (const expense of expenses.filter((e) => e.ym === ym)) {
    // Check if charges already exist for this expense
    const existingQuery = query(
      collection(db, "expense_allocations"),
      where("expenseId", "==", expense.id),
    );
    const existing = await getDocs(existingQuery);

    if (existing.empty) {
      const result = await generateChargesFromExpense(expense, members, rooms, staff, uid);
      expenseCreated += result.chargesCreated;
      allocationsCreated += result.allocationsCreated;
    }
  }

  return {
    rentCreated: rentResult.created,
    staffCreated: staffResult.created,
    expenseCreated,
    allocationsCreated,
  };
}