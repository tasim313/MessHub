/**
 * Automatic Staff Charge Service
 * =====================================
 *
 * Staff salaries (cook, cleaner/"bua", security, etc.) must never depend on
 * someone remembering to click a button. This backfills any missing month's
 * staff charge for every active, service-subscribed member (from the month
 * they joined through the current month) and is safe to call on every app
 * load — it only ever creates a staff_charge ledger entry that doesn't
 * already exist yet, never duplicates or overwrites one.
 *
 * Uses the same canonical per-member staff share formula as the rest of the
 * app (calculateMemberStaffShare in engine-v2.ts), so the auto-generated
 * charge always matches what /charges and /dashboard compute live.
 */
import { collection, doc, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import type { Member, Staff, LedgerEntry } from "./types";
import { calculateMemberStaffShare } from "./calculations/engine-v2";

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

function memberStartYm(member: Member): string | null {
  if (member.joiningDate && /^\d{4}-\d{2}/.test(member.joiningDate)) {
    return member.joiningDate.slice(0, 7);
  }
  if (member.joinedAt) {
    const d = new Date(member.joinedAt);
    if (!Number.isNaN(d.getTime())) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    }
  }
  return null;
}

export interface EnsureStaffChargesResult {
  created: number;
  months: string[];
}

export async function ensureStaffChargesUpToDate(
  members: Member[],
  staff: Staff[],
  existingLedgers: LedgerEntry[],
  uid?: string,
): Promise<EnsureStaffChargesResult> {
  const activeMembers = members.filter((m) => m.active);
  const activeStaff = staff.filter((s) => s.status !== "inactive");
  if (activeMembers.length === 0 || activeStaff.length === 0) return { created: 0, months: [] };

  const nowYm = currentYm();
  const existingStaffChargeKeys = new Set(
    existingLedgers
      .filter((l) => l.transactionType === "staff_charge")
      .map((l) => `${l.memberId}|${l.ym}`),
  );

  const batches: ReturnType<typeof writeBatch>[] = [writeBatch(db)];
  let opsInCurrentBatch = 0;
  const nextRef = () => {
    if (opsInCurrentBatch >= 450) {
      batches.push(writeBatch(db));
      opsInCurrentBatch = 0;
    }
    opsInCurrentBatch += 1;
    return batches[batches.length - 1];
  };

  let created = 0;
  const createdMonths = new Set<string>();

  for (const member of activeMembers) {
    const startYm = memberStartYm(member);
    const months = startYm ? monthsBetween(startYm, nowYm) : [nowYm];

    for (const ym of months) {
      const key = `${member.id}|${ym}`;
      if (existingStaffChargeKeys.has(key)) continue;

      const staffShare = Math.round(calculateMemberStaffShare(member, activeStaff, activeMembers) * 100) / 100;
      if (staffShare <= 0) continue;

      const ledgerRef = doc(collection(db, "ledgers"));
      nextRef().set(ledgerRef, {
        memberId: member.id,
        memberName: member.name,
        date: `${ym}-01`,
        ym,
        transactionType: "staff_charge",
        category: "staff",
        amount: staffShare,
        notes: `Staff salary share for ${ym} (auto-generated)`,
        chargeStatus: "pending",
        paidAmount: 0,
        createdAt: Date.now(),
        createdBy: uid,
      });
      existingStaffChargeKeys.add(key);

      created += 1;
      createdMonths.add(ym);
    }
  }

  if (created > 0) {
    for (const b of batches) {
      await b.commit();
    }
  }

  return { created, months: [...createdMonths].sort() };
}
