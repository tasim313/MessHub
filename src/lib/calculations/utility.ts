/**
 * Utility Calculation Module
 * Re-exports from centralized calculation engine to ensure consistent calculations.
 */
export { calculateUtilityAllocation } from "./engine";

import type { Utility, UtilityAllocation } from "@/lib/types";

/**
 * Get monthly utility summary
 */
export function getMonthlyUtilitySummary(
  utilities: Utility[],
  allocations: UtilityAllocation[],
): {
  totalUtility: number;
  byType: Record<string, number>;
  perMember: Record<string, number>;
} {
  const totalUtility = utilities.reduce((sum, u) => sum + u.amount, 0);
  const byType: Record<string, number> = {};
  utilities.forEach((u) => {
    byType[u.type] = (byType[u.type] || 0) + u.amount;
  });

  const perMember: Record<string, number> = {};
  allocations.forEach((a) => {
    perMember[a.memberId] = (perMember[a.memberId] || 0) + a.amount;
  });

  return {
    totalUtility,
    byType,
    perMember,
  };
}
