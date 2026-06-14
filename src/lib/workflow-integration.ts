/**
 * WORKFLOW INTEGRATION SERVICE
 * =============================
 * 
 * Bridges the gap between the UI pages (utilities, bazar) and the new accounting engine.
 * 
 * When an expense is created with a payer:
 *   1. Save expense to Firebase
 *   2. Generate member allocations (expense_allocations)
 *   3. Record internal payment for payer's share (payments + ledger)
 *   4. Create advance for excess (advances + ledger)
 *   5. Generate charges for all members (ledger)
 * 
 * When bazar is created:
 *   1. Save bazar to Firebase
 *   2. Record bazar contribution (payments + ledger as "bazar_contribution")
 * 
 * Now ALL financial events properly appear in the Payments section.
 */
import {
  collection,
  addDoc,
  doc,
  writeBatch,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Member, Expense, ExpenseAllocation, Bazar, Room, Staff } from "./types";
import { EXPENSE_CATEGORY_LABELS } from "./types";
import { createAdvance } from "./advance-service";

// ============================================================================
// 1. CREATE EXPENSE WITH FULL ACCOUNTING WORKFLOW
// ============================================================================

/**
 * Creates a shared expense WITH full accounting treatment:
 * 1. Saves the expense
 * 2. Creates expense allocations for each member
 * 3. Records internal payment for the payer's own share → APPEARS IN PAYMENTS
 * 4. Creates an advance for any excess paid
 * 5. Records ledger entries for charges
 */
export async function createExpenseWithAccounting(
  expenseData: Partial<Expense>,
  members: Member[],
  rooms: Room[],
  staff: Staff[],
  uid?: string,
): Promise<{
  expenseId: string;
  allocationsCount: number;
  internalPaymentRecorded: boolean;
  advanceCreated: boolean;
}> {
  const activeMembers = members.filter((m) => m.active);
  const amount = expenseData.amount || 0;
  const expenseYm = expenseData.date?.slice(0, 7) || "";
  const paidBy = expenseData.paidBy;
  const paidByName = expenseData.paidByName;

  const batch = writeBatch(db);

  // 1. Create the expense document
  const expenseRef = doc(collection(db, "expenses"));
  const expenseId = expenseRef.id;

  const newExpense: Expense = {
    id: expenseId,
    ym: expenseYm,
    category: (expenseData.category || "other_shared") as any,
    amount,
    date: expenseData.date || "",
    paidBy: paidBy || undefined,
    paidByName: paidByName || undefined,
    allocationMethod: expenseData.allocationMethod || "equal",
    status: paidBy ? "paid" : "pending",
    description: expenseData.description,
    notes: expenseData.notes,
    createdAt: Date.now(),
    createdBy: uid,
  };

  batch.set(expenseRef, newExpense);

  // 2. Calculate and create expense allocations
  const serviceType = getServiceTypeForExpenseCategory(newExpense.category);
  const subscribers = serviceType
    ? activeMembers.filter((m) => isMemberSubscribedToService(m, serviceType))
    : activeMembers;
  const totalSubscribers = subscribers.length || 1;

  let payerShare = 0;

  activeMembers.forEach((member) => {
    const isSubscribed = serviceType
      ? isMemberSubscribedToService(member, serviceType)
      : true;

    const memberAmount = isSubscribed ? amount / totalSubscribers : 0;

    const allocation: ExpenseAllocation = {
      id: `${expenseId}_${member.id}`,
      expenseId,
      memberId: member.id,
      memberName: member.name,
      category: newExpense.category,
      amount: Math.round(memberAmount * 100) / 100,
      subscribed: isSubscribed,
      ym: expenseYm,
      status: isSubscribed ? "pending" : "pending",
      createdAt: Date.now(),
      createdBy: uid,
    };

    batch.set(doc(db, "expense_allocations", allocation.id), allocation);

    // Track payer's share for auto-payment
    if (member.id === paidBy) {
      payerShare = memberAmount;
    }

    // Create ledger charge for non-payer members
    // (payer's charge is handled by the internal payment)
    if (member.id !== paidBy && memberAmount > 0 && isSubscribed) {
      const chargeId = `charge_${expenseId}_${member.id}`;
      batch.set(doc(db, "ledgers", chargeId), {
        memberId: member.id,
        memberName: member.name,
        date: newExpense.date,
        ym: expenseYm,
        transactionType: "utility_charge",
        category: newExpense.category,
        amount: Math.round(memberAmount * 100) / 100,
        notes: `${EXPENSE_CATEGORY_LABELS[newExpense.category] || newExpense.category} for ${expenseYm}`,
        referenceId: expenseId,
        referenceType: "expense",
        createdAt: Date.now(),
        createdBy: uid,
      });
    }
  });

  // 3. If a member paid, record internal payment + advance
  if (paidBy && paidByName) {
    // a) Record internal payment for payer's own share → THIS IS THE KEY FIX
    //    This makes it show up in the Payments section
    if (payerShare > 0) {
      const paymentRef = doc(collection(db, "payments"));
      batch.set(paymentRef, {
        memberId: paidBy,
        memberName: paidByName,
        amount: payerShare,
        method: "cash",
        date: newExpense.date,
        ym: expenseYm,
        status: "paid",
        category: newExpense.category,
        notes: `Internal: ${paidByName}'s own share of ${EXPENSE_CATEGORY_LABELS[newExpense.category] || newExpense.category} (auto-recorded)`,
        referenceId: expenseId,
        referenceType: "expense",
        createdAt: Date.now(),
        createdBy: uid,
      });

      // b) Record ledger entry for this payment
      const payerLedgerId = `payment_${expenseId}_${paidBy}`;
      batch.set(doc(db, "ledgers", payerLedgerId), {
        memberId: paidBy,
        memberName: paidByName,
        date: newExpense.date,
        ym: expenseYm,
        transactionType: "payment",
        category: newExpense.category,
        amount: payerShare,
        notes: `Auto-payment: ${paidByName}'s own share paid via expense`,
        referenceId: expenseId,
        referenceType: "expense",
        createdAt: Date.now(),
        createdBy: uid,
      });
    }

    // c) Create advance for excess (expense - payer's share)
    const advanceAmount = amount - payerShare;
    if (advanceAmount > 0) {
      const advanceRef = doc(collection(db, "advances"));
      batch.set(advanceRef, {
        memberId: paidBy,
        memberName: paidByName,
        amount: advanceAmount,
        remainingAmount: advanceAmount,
        source: `${EXPENSE_CATEGORY_LABELS[newExpense.category] || newExpense.category} - ${newExpense.date}`,
        sourceType: "expense",
        sourceId: expenseId,
        ym: expenseYm,
        status: "outstanding",
        createdAt: Date.now(),
        createdBy: uid,
      });

      // d) Ledger entry for advance
      const advanceLedgerId = `advance_${expenseId}_${paidBy}`;
      batch.set(doc(db, "ledgers", advanceLedgerId), {
        memberId: paidBy,
        memberName: paidByName,
        date: newExpense.date,
        ym: expenseYm,
        transactionType: "advance_given",
        category: "advance",
        amount: advanceAmount,
        notes: `Advance: ${paidByName} paid ${advanceAmount} Tk extra for ${EXPENSE_CATEGORY_LABELS[newExpense.category] || newExpense.category}`,
        referenceId: expenseId,
        referenceType: "expense",
        createdAt: Date.now(),
        createdBy: uid,
      });
    }
  }

  await batch.commit();

  return {
    expenseId,
    allocationsCount: activeMembers.length,
    internalPaymentRecorded: !!paidBy && payerShare > 0,
    advanceCreated: !!paidBy && (amount - payerShare) > 0,
  };
}

// ============================================================================
// 2. CREATE BAZAR WITH ACCOUNTING
// ============================================================================

/**
 * Creates a bazar entry and records it as a bazar contribution in payments.
 * This makes bazar payments visible in the Payments section.
 */
export async function createBazarWithAccounting(
  bazarData: Partial<Bazar>,
  uid?: string,
): Promise<{ bazarId: string }> {
  const batch = writeBatch(db);

  // 1. Create bazar document
  const bazarRef = doc(collection(db, "bazar"));
  const bazarId = bazarRef.id;

  const ym = bazarData.date?.slice(0, 7) || "";
  const buyerId = bazarData.buyerId || "";
  const buyerName = bazarData.buyerName || "";

  batch.set(bazarRef, {
    id: bazarId,
    date: bazarData.date || "",
    ym,
    buyerId,
    buyerName,
    items: bazarData.items || [{ name: bazarData.category || "others", amount: bazarData.total }],
    total: bazarData.total || 0,
    category: bazarData.category || "others",
    notes: bazarData.notes || "",
    createdAt: Date.now(),
    createdBy: uid,
  });

  // 2. Record bazar contribution in payments → THIS IS THE KEY FIX
  //    Makes bazar contributions visible in the Payments section
  if (buyerId && buyerName && bazarData.total && bazarData.total > 0) {
    const paymentRef = doc(collection(db, "payments"));
    batch.set(paymentRef, {
      memberId: buyerId,
      memberName: buyerName,
      amount: bazarData.total,
      method: "cash",
      date: bazarData.date || "",
      ym,
      status: "paid",
      category: "bazar_contribution",
      notes: `Bazar contribution: ${buyerName} bought ${bazarData.category || "items"} for ${bazarData.total} Tk`,
      referenceId: bazarId,
      referenceType: "bazar",
      createdAt: Date.now(),
      createdBy: uid,
    });

    // 3. Ledger entry for bazar contribution
    const ledgerRef = doc(collection(db, "ledgers"));
    batch.set(ledgerRef, {
      memberId: buyerId,
      memberName: buyerName,
      date: bazarData.date || "",
      ym,
      transactionType: "bazar_contribution",
      category: "bazar_contribution",
      amount: bazarData.total || 0,
      notes: `Bazar: ${buyerName} spent ${bazarData.total} Tk on ${bazarData.category || "items"}`,
      referenceId: bazarId,
      referenceType: "bazar",
      createdAt: Date.now(),
      createdBy: uid,
    });
  }

  await batch.commit();

  return { bazarId };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

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