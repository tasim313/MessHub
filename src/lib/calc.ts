/**
 * Central calculation engine - Single source of truth for all monthly computations.
 * Uses service subscriptions for utility/staff splits and room-based rent.
 */
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
  mealRate: number;
  utilityPerMember: number;
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

// Service type mapping for utilities
const UTILITY_SERVICE_MAP: Record<string, string> = {
  electricity: "electricity",
  internet: "internet",
  gas: "gas",
  water: "water",
  generator: "generator",
  maintenance: "maintenance",
};

// Service type mapping for staff roles
const STAFF_SERVICE_MAP: Record<string, string> = {
  cook: "cooking_staff",
  cleaner: "cleaning_staff",
  security: "security_staff",
  helper: "other_services",
  accountant: "other_services",
  manager: "other_services",
};

// Check if member subscribes to a service
export function isMemberSubscribedToService(member: Member, serviceType: string): boolean {
  if (!member.services) return false;
  return member.services.some((s) => s.type === serviceType && s.enabled);
}

// Get per-bed rent from room
export function getPerBedRent(member: Member, rooms: Room[]): number {
  if (!member.roomId) return 0;
  const room = rooms.find((r) => r.id === member.roomId);
  if (!room || !room.totalBeds) return 0;
  return room.monthlyRent / room.totalBeds;
}

/**
 * Computes complete monthly summary with service subscription awareness.
 * All pages MUST use this instead of duplicating logic.
 */
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
  const activeMembers = members.filter((m) => m.active);

  // Core aggregations
  const totalBazar = monthBazar.reduce((s, b) => s + b.total, 0);
  const totalMeals = monthMeals.reduce((s, m) => s + (m.breakfast || 0) + (m.lunch || 0) + (m.dinner || 0) + (m.guest || 0), 0);
  const mealRate = totalMeals > 0 ? totalBazar / totalMeals : 0;
  const totalUtilities = monthUtilities.reduce((s, u) => s + u.amount, 0);
  const totalStaffCost = staff.filter((s) => s.status !== "inactive").reduce((sum, item) => sum + (item.salary || 0) + (item.overtime || 0) + (item.bonus || 0) - (item.advance || 0), 0);
  const totalDeposits = monthDeposits.reduce((s, d) => s + d.amount, 0);

  // Rent from rooms (per-bed)
  const totalRent = activeMembers.reduce((sum, m) => sum + getPerBedRent(m, rooms), 0);
  const totalPreviousDue = activeMembers.reduce((sum, m) => sum + (m.previousDue || 0), 0);

  const occupiedBeds = activeMembers.filter((m) => m.roomId || m.roomName || m.bedNo).length;
  const totalBeds = rooms.reduce((sum, r) => sum + (r.totalBeds || 0), 0);
  const vacantBeds = Math.max(0, totalBeds - occupiedBeds);

  const perMember: PerMember[] = activeMembers.map((m) => {
    // Meals
    const mealsCount = monthMeals.filter((x) => x.memberId === m.id).reduce(
      (s, x) => s + (x.breakfast || 0) + (x.lunch || 0) + (x.dinner || 0) + (x.guest || 0), 0
    );
    const mealCost = mealsCount * mealRate;
    
    // Deposits
    const deposited = monthDeposits.filter((d) => d.memberId === m.id).reduce((s, d) => s + d.amount, 0);
    
    // Per-bed rent from room
    const rentShare = getPerBedRent(m, rooms);
    
    // Service-subscription-aware utility share
    let myUtility = 0;
    monthUtilities.forEach((u) => {
      const serviceType = UTILITY_SERVICE_MAP[u.type as string];
      // For "others" type or unknown types, all active members are subscribers
      const subscribers = serviceType 
        ? activeMembers.filter((mem) => isMemberSubscribedToService(mem, serviceType)).length || 1
        : activeMembers.length || 1;
      
      if (!serviceType || isMemberSubscribedToService(m, serviceType)) {
        myUtility += u.amount / subscribers;
      }
    });
    
    // Service-subscription-aware staff share
    let myStaff = 0;
    staff.filter((s) => s.status !== "inactive").forEach((s) => {
      const serviceType = STAFF_SERVICE_MAP[s.role] || "other_services";
      const subscribers = activeMembers.filter((mem) => isMemberSubscribedToService(mem, serviceType)).length || 1;
      if (isMemberSubscribedToService(m, serviceType)) {
        myStaff += (s.salary || 0) / subscribers;
      }
    });

    const previousDue = m.previousDue || 0;
    const totalDue = mealCost + myUtility + rentShare + myStaff + previousDue;
    
    return {
      memberId: m.id, memberName: m.name,
      meals: mealsCount, mealCost,
      utilityShare: myUtility, rentShare, staffShare: myStaff,
      previousDue, totalDue, deposited,
      balance: deposited - totalDue,
    };
  });

  const totalExpense = totalBazar + totalUtilities + totalStaffCost;

  return {
    ym, totalMeals, totalBazar, totalUtilities, totalRent, totalStaffCost,
    totalPreviousDue, totalExpense, mealRate,
    utilityPerMember: totalUtilities / (activeMembers.length || 1),
    staffCostPerMember: totalStaffCost / (activeMembers.length || 1),
    totalDeposits, cashBalance: totalDeposits - totalExpense,
    vacantBeds, occupiedBeds, perMember,
  };
}