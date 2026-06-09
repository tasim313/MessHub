/**
 * Meal Calculation Module
 * 
 * NOTE: This module now re-exports from the centralized engine.ts
 * to ensure all calculations use the same logic.
 */
import type { MealEntry, Bazar, Member } from "@/lib/types";
import { calculateMealRate } from "./engine";

export function calculateMemberMealCost(
  memberMeals: MealEntry,
  mealRate: number,
): number {
  const totalMeals = memberMeals.breakfast + memberMeals.lunch + memberMeals.dinner + memberMeals.guest;
  return totalMeals * mealRate;
}

export function getMonthlyMealStats(
  bazarEntries: Bazar[],
  mealEntries: MealEntry[],
): {
  totalBazar: number;
  totalMeals: number;
  mealRate: number;
  dailyConsumption: Record<string, number>;
  monthlyConsumption: number;
  topConsumers: { memberId: string; memberName: string; meals: number }[];
} {
  const totalBazar = bazarEntries.reduce((sum, b) => sum + b.total, 0);
  const totalMeals = mealEntries.reduce(
    (sum, m) => sum + m.breakfast + m.lunch + m.dinner + m.guest,
    0,
  );
  const mealRate = totalMeals > 0 ? totalBazar / totalMeals : 0;

  const dailyConsumption: Record<string, number> = {};
  mealEntries.forEach((m) => {
    const dayTotal = m.breakfast + m.lunch + m.dinner + m.guest;
    dailyConsumption[m.date] = (dailyConsumption[m.date] || 0) + dayTotal;
  });

  const memberMeals: Record<string, { memberId: string; memberName: string; meals: number }> = {};
  mealEntries.forEach((m) => {
    const total = m.breakfast + m.lunch + m.dinner + m.guest;
    if (!memberMeals[m.memberId]) {
      memberMeals[m.memberId] = { memberId: m.memberId, memberName: m.memberName, meals: 0 };
    }
    memberMeals[m.memberId].meals += total;
  });

  const topConsumers = Object.values(memberMeals)
    .sort((a, b) => b.meals - a.meals)
    .slice(0, 10);

  return {
    totalBazar,
    totalMeals,
    mealRate,
    dailyConsumption,
    monthlyConsumption: totalMeals,
    topConsumers,
  };
}

export function getMemberMealBreakdown(
  memberId: string,
  mealEntries: MealEntry[],
): { date: string; breakfast: number; lunch: number; dinner: number; guest: number; total: number }[] {
  return mealEntries
    .filter((m) => m.memberId === memberId)
    .map((m) => ({
      date: m.date,
      breakfast: m.breakfast,
      lunch: m.lunch,
      dinner: m.dinner,
      guest: m.guest,
      total: m.breakfast + m.lunch + m.dinner + m.guest,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
