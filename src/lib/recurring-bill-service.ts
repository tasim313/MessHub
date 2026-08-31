/**
 * Recurring Bill Auto-Generation Service
 * =====================================
 *
 * Rent and staff salaries have a stored monthly amount already (room rent,
 * staff salary), so they can be auto-generated directly. Bills like water,
 * internet, and garbage collection don't — their monthly amount has to be
 * configured once as a RecurringBill template (see /utilities), and this
 * service turns that template into the real accounting records (Expense +
 * expense_allocations + per-member charges) every month, using the exact
 * same createExpenseWithAccounting flow as manually adding an expense — so
 * an auto-generated bill behaves identically to a hand-entered one and is
 * payable from /charges exactly the same way.
 *
 * A template only generates bills from the month it was created onward —
 * never retroactively for months before it existed.
 */
import type { Member, RecurringBill, Expense, Room, Staff } from "./types";
import { createExpenseWithAccounting } from "./workflow-integration";

function currentYm(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function monthsBetween(startYm: string, endYm: string): string[] {
  const [sy, sm] = startYm.split("-").map(Number);
  const [ey, em] = endYm.split("-").map(Number);
  if (!sy || !sm || !ey || !em) return [];
  const months: string[] = [];
  let y = sy;
  let m = sm;
  let guard = 0;
  while ((y < ey || (y === ey && m <= em)) && guard < 60) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    guard += 1;
  }
  return months;
}

function billStartYm(bill: RecurringBill): string {
  if (bill.createdAt) {
    const d = new Date(bill.createdAt);
    if (!Number.isNaN(d.getTime())) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    }
  }
  return currentYm();
}

export interface EnsureRecurringBillsResult {
  created: number;
  months: string[];
}

export async function ensureRecurringExpensesUpToDate(
  recurringBills: RecurringBill[],
  members: Member[],
  existingExpenses: Expense[],
  uid?: string,
): Promise<EnsureRecurringBillsResult> {
  const activeBills = recurringBills.filter((b) => b.active && b.amount > 0);
  if (activeBills.length === 0) return { created: 0, months: [] };

  const nowYm = currentYm();
  // A recurring bill is considered "already generated" for a month if any
  // expense references this template (via recurringBillId) for that month —
  // never re-generate, even if the amount was since changed.
  const existingKeys = new Set(
    existingExpenses
      .filter((e) => (e as any).recurringBillId)
      .map((e) => `${(e as any).recurringBillId}|${e.ym}`),
  );

  let created = 0;
  const createdMonths = new Set<string>();

  for (const bill of activeBills) {
    const startYm = billStartYm(bill);
    const months = monthsBetween(startYm, nowYm);

    for (const ym of months) {
      const key = `${bill.id}|${ym}`;
      if (existingKeys.has(key)) continue;

      await createExpenseWithAccounting(
        {
          category: bill.category,
          amount: bill.amount,
          date: `${ym}-01`,
          ym,
          allocationMethod: bill.allocationMethod,
          status: "pending",
          notes: `${bill.label} for ${ym} (auto-generated)`,
          recurringBillId: bill.id,
        } as Partial<Expense> & { recurringBillId: string },
        members,
        [] as Room[],
        [] as Staff[],
        uid,
      );
      existingKeys.add(key);

      created += 1;
      createdMonths.add(ym);
    }
  }

  return { created, months: [...createdMonths].sort() };
}
