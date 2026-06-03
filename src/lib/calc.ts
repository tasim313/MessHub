import type {
  MealEntry,
  Bazar,
  Utility,
  Deposit,
  Member,
  Staff,
  Room,
} from "./data";

export interface MonthlySummary {
  ym: string;
  totalMeals: number;
  totalBazar: number;
  totalUtilities: number;
  totalRent: number;
  totalStaffCost: number;
  totalPreviousDue: number;
  totalExpense: number;
  mealRate: number; // bazar per meal
  utilityPerMember: number; // utilities split equally among active members
  staffCostPerMember: number;
  totalDeposits: number;
  cashBalance: number;
  vacantBeds: number;
  occupiedBeds: number;
  perMember: PerMember[];
}

export interface PerMember {
  memberId: string;
  memberName: string;
  meals: number;
  mealCost: number;
  utilityShare: number;
  rentShare: number;
  staffShare: number;
  previousDue: number;
  totalDue: number;
  deposited: number;
  balance: number;
}

export function computeMonthly(
  ym: string,
  members: Member[],
  meals: MealEntry[],
  bazar: Bazar[],
  utilities: Utility[],
  deposits: Deposit[],
  staff: Staff[] = [],
  rooms: Room[] = [],
): MonthlySummary {
  const monthMeals = meals.filter((m) => m.ym === ym);
  const monthBazar = bazar.filter((b) => b.ym === ym);
  const monthUtilities = utilities.filter((u) => u.ym === ym);
  const monthDeposits = deposits.filter((d) => d.ym === ym);

  const totalMeals = monthMeals.reduce(
    (s, m) =>
      s +
      (m.breakfast || 0) +
      (m.lunch || 0) +
      (m.dinner || 0) +
      (m.guest || 0),
    0,
  );
  const totalBazar = monthBazar.reduce((s, b) => s + b.total, 0);
  const totalUtilities = monthUtilities.reduce((s, u) => s + u.amount, 0);
  const totalDeposits = monthDeposits.reduce((s, d) => s + d.amount, 0);
  const totalStaffCost = staff
    .filter((s) => s.status !== "inactive")
    .reduce(
      (sum, item) =>
        sum +
        (item.salary || 0) +
        (item.overtime || 0) +
        (item.bonus || 0) -
        (item.advance || 0),
      0,
    );
  const mealRate = totalMeals > 0 ? totalBazar / totalMeals : 0;

  const activeMembers = members.filter((m) => m.active);
  const utilityPerMember =
    activeMembers.length > 0 ? totalUtilities / activeMembers.length : 0;
  const staffCostPerMember =
    activeMembers.length > 0 ? totalStaffCost / activeMembers.length : 0;
  const totalRent = activeMembers.reduce(
    (sum, member) => sum + (member.monthlyRent || 0),
    0,
  );
  const totalPreviousDue = activeMembers.reduce(
    (sum, member) => sum + (member.previousDue || 0),
    0,
  );
  const occupiedBeds = activeMembers.filter(
    (member) => member.roomId || member.roomName || member.bedNo,
  ).length;
  const totalBeds = rooms.reduce((sum, room) => sum + (room.totalBeds || 0), 0);
  const vacantBeds = Math.max(0, totalBeds - occupiedBeds);

  const perMember: PerMember[] = activeMembers.map((m) => {
    const mealsCount = monthMeals
      .filter((x) => x.memberId === m.id)
      .reduce(
        (s, x) =>
          s +
          (x.breakfast || 0) +
          (x.lunch || 0) +
          (x.dinner || 0) +
          (x.guest || 0),
        0,
      );
    const mealCost = mealsCount * mealRate;
    const deposited = monthDeposits
      .filter((d) => d.memberId === m.id)
      .reduce((s, d) => s + d.amount, 0);
    const rentShare = m.monthlyRent || 0;
    const previousDue = m.previousDue || 0;
    const totalDue =
      mealCost +
      utilityPerMember +
      rentShare +
      staffCostPerMember +
      previousDue;
    return {
      memberId: m.id,
      memberName: m.name,
      meals: mealsCount,
      mealCost,
      utilityShare: utilityPerMember,
      rentShare,
      staffShare: staffCostPerMember,
      previousDue,
      totalDue,
      deposited,
      balance: deposited - totalDue,
    };
  });

  return {
    ym,
    totalMeals,
    totalBazar,
    totalUtilities,
    totalRent,
    totalStaffCost,
    totalPreviousDue,
    totalExpense: totalBazar + totalUtilities + totalStaffCost,
    mealRate,
    utilityPerMember,
    staffCostPerMember,
    totalDeposits,
    cashBalance: totalDeposits - (totalBazar + totalUtilities + totalStaffCost),
    vacantBeds,
    occupiedBeds,
    perMember,
  };
}
