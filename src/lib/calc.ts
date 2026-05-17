import type { MealEntry, Bazar, Utility, Deposit, Member } from "./data";

export interface MonthlySummary {
  ym: string;
  totalMeals: number;
  totalBazar: number;
  totalUtilities: number;
  totalExpense: number;
  mealRate: number;          // bazar per meal
  utilityPerMember: number;  // utilities split equally among active members
  totalDeposits: number;
  perMember: PerMember[];
}

export interface PerMember {
  memberId: string;
  memberName: string;
  meals: number;
  mealCost: number;
  utilityShare: number;
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
  deposits: Deposit[]
): MonthlySummary {
  const monthMeals = meals.filter((m) => m.ym === ym);
  const monthBazar = bazar.filter((b) => b.ym === ym);
  const monthUtilities = utilities.filter((u) => u.ym === ym);
  const monthDeposits = deposits.filter((d) => d.ym === ym);

  const totalMeals = monthMeals.reduce(
    (s, m) => s + (m.breakfast || 0) + (m.lunch || 0) + (m.dinner || 0) + (m.guest || 0),
    0
  );
  const totalBazar = monthBazar.reduce((s, b) => s + b.total, 0);
  const totalUtilities = monthUtilities.reduce((s, u) => s + u.amount, 0);
  const totalDeposits = monthDeposits.reduce((s, d) => s + d.amount, 0);
  const mealRate = totalMeals > 0 ? totalBazar / totalMeals : 0;

  const activeMembers = members.filter((m) => m.active);
  const utilityPerMember = activeMembers.length > 0 ? totalUtilities / activeMembers.length : 0;

  const perMember: PerMember[] = activeMembers.map((m) => {
    const mealsCount = monthMeals
      .filter((x) => x.memberId === m.id)
      .reduce((s, x) => s + (x.breakfast || 0) + (x.lunch || 0) + (x.dinner || 0) + (x.guest || 0), 0);
    const mealCost = mealsCount * mealRate;
    const deposited = monthDeposits.filter((d) => d.memberId === m.id).reduce((s, d) => s + d.amount, 0);
    const totalDue = mealCost + utilityPerMember;
    return {
      memberId: m.id,
      memberName: m.name,
      meals: mealsCount,
      mealCost,
      utilityShare: utilityPerMember,
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
    totalExpense: totalBazar + totalUtilities,
    mealRate,
    utilityPerMember,
    totalDeposits,
    perMember,
  };
}