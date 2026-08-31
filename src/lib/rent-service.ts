/**
 * Automatic Rent Charge Service
 * =====================================
 *
 * Rent must never depend on someone remembering to click a "Generate Rent"
 * button. This service backfills any missing month's rent charge for every
 * active member (from the month they joined through the current month) and
 * is safe to call on every app load — it only ever creates a rent_charges
 * document (and matching ledger entry) that doesn't already exist yet, never
 * duplicates or overwrites one.
 *
 * A member is only backfilled from their recorded joining date/timestamp —
 * if neither is known, only the current month is ensured, to avoid
 * incorrectly billing rent for months before they actually joined.
 *
 * PRORATION: full rent is charged for every month by default ("full_month"
 * policy, the original, still-default behavior). If the mess admin opts
 * into "by_days" (settings/general.rentProrationPolicy), a member's join
 * month — and their final month, if they've since left with a recorded
 * leavingDate — is prorated by actual days stayed instead of charged in
 * full. Every month strictly between those two is always charged in full
 * either way; only the boundary month(s) are ever prorated. Never
 * retroactive: this only affects newly-generated charges, since an already-
 * posted rent_charges/ledger entry is never edited.
 */
import { collection, doc, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import type { Member, Room, RentCharge, LedgerEntry } from "./types";

export type RentProrationPolicy = "full_month" | "by_days";

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
  // Safety cap: never generate more than 60 months in one pass.
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

function memberLeavingYm(member: Member): string | null {
  if (member.leavingDate && /^\d{4}-\d{2}-\d{2}$/.test(member.leavingDate)) {
    return member.leavingDate.slice(0, 7);
  }
  return null;
}

/** Last calendar day of a "YYYY-MM" month (28-31). */
function daysInMonth(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

/** The day-of-month (1-31) from a "YYYY-MM-DD" string, parsed without any timezone conversion. */
function dayOfDateStr(dateStr: string): number {
  const day = parseInt(dateStr.split("-")[2], 10);
  return Number.isFinite(day) && day > 0 ? day : 1;
}

/**
 * How much of `fullAmount` a member owes for month `ym`, under the given
 * proration policy — full amount for every month except the member's actual
 * join/leave boundary month(s), which are prorated by days stayed when the
 * policy is "by_days".
 */
export function proratedRentForMonth(
  fullAmount: number,
  ym: string,
  policy: RentProrationPolicy,
  joiningDate: string | null,
  leavingDate: string | null,
  isJoinMonth: boolean,
  isLeaveMonth: boolean,
): number {
  if (policy !== "by_days" || (!isJoinMonth && !isLeaveMonth)) return fullAmount;

  const totalDays = daysInMonth(ym);
  let stayedDays = totalDays;

  if (isJoinMonth && isLeaveMonth && joiningDate && leavingDate) {
    // Joined and left within the same single month.
    stayedDays = Math.max(0, dayOfDateStr(leavingDate) - dayOfDateStr(joiningDate) + 1);
  } else if (isJoinMonth && joiningDate) {
    stayedDays = totalDays - dayOfDateStr(joiningDate) + 1;
  } else if (isLeaveMonth && leavingDate) {
    stayedDays = dayOfDateStr(leavingDate);
  }

  stayedDays = Math.max(0, Math.min(totalDays, stayedDays));
  return Math.round(((fullAmount * stayedDays) / totalDays) * 100) / 100;
}

export interface EnsureRentResult {
  created: number;
  months: string[];
}

/**
 * Ensure every active (or recently-left, with a recorded leavingDate) room-
 * assigned member has a rent charge for every month from when they joined
 * through the current month (or their leaving month, if earlier). Pass in
 * the already-loaded rent_charges and ledgers collections (from
 * useCollection) so this only ever needs to run the in-memory existence
 * checks plus the actual writes — no extra reads.
 */
export async function ensureRentChargesUpToDate(
  members: Member[],
  rooms: Room[],
  existingRentCharges: RentCharge[],
  existingLedgers: LedgerEntry[],
  uid?: string,
  prorationPolicy: RentProrationPolicy = "full_month",
): Promise<EnsureRentResult> {
  // A member who has since left is only worth (re-)considering if we know
  // exactly when — otherwise we'd be guessing how many more months to bill.
  const processMembers = members.filter(
    (m) => m.roomId && (m.active || memberLeavingYm(m) !== null),
  );
  if (processMembers.length === 0) return { created: 0, months: [] };

  const nowYm = currentYm();
  const existingRentChargeKeys = new Set(existingRentCharges.map((r) => `${r.memberId}|${r.month}`));
  const existingLedgerRentKeys = new Set(
    existingLedgers
      .filter((l) => l.transactionType === "rent_charge")
      .map((l) => `${l.memberId}|${l.ym}`),
  );

  // Firestore batches cap at 500 writes; split into fresh batches as needed
  // (each missing month can produce up to 2 writes: rent_charges + ledger).
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

  for (const member of processMembers) {
    const room = rooms.find((r) => r.id === member.roomId);
    if (!room || !room.totalBeds) continue;
    const fullRentAmount = Math.round((room.monthlyRent / room.totalBeds) * 100) / 100;
    if (fullRentAmount <= 0) continue;

    const startYm = memberStartYm(member);
    const leavingYm = memberLeavingYm(member);
    const endYm = leavingYm && leavingYm <= nowYm ? leavingYm : nowYm;
    const months = startYm ? monthsBetween(startYm, endYm) : [nowYm];

    for (const ym of months) {
      const key = `${member.id}|${ym}`;
      const hasRentCharge = existingRentChargeKeys.has(key);
      const hasLedgerEntry = existingLedgerRentKeys.has(key);
      if (hasRentCharge && hasLedgerEntry) continue;

      const rentAmount = proratedRentForMonth(
        fullRentAmount,
        ym,
        prorationPolicy,
        member.joiningDate || null,
        member.leavingDate || null,
        ym === startYm,
        leavingYm !== null && ym === leavingYm,
      );
      if (rentAmount <= 0) continue;

      if (!hasRentCharge) {
        const rcRef = doc(db, "rent_charges", `${member.id}_${ym}`);
        nextRef().set(rcRef, {
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
        existingRentChargeKeys.add(key);
      }

      if (!hasLedgerEntry) {
        const ledgerRef = doc(collection(db, "ledgers"));
        nextRef().set(ledgerRef, {
          memberId: member.id,
          memberName: member.name,
          date: `${ym}-01`,
          ym,
          transactionType: "rent_charge",
          category: "rent",
          amount: rentAmount,
          notes: rentAmount < fullRentAmount
            ? `Rent for ${ym} - ${room.roomNo} (prorated, auto-generated)`
            : `Rent for ${ym} - ${room.roomNo} (auto-generated)`,
          chargeStatus: "pending",
          paidAmount: 0,
          createdAt: Date.now(),
          createdBy: uid,
        });
        existingLedgerRentKeys.add(key);
      }

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
