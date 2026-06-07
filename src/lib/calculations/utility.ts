import type { Utility, UtilityAllocation, Member } from "@/lib/types";

function isMemberSubscribed(member: Member, utilityType: string): boolean {
  if (!member.services) return false;
  const serviceMap: Record<string, string> = {
    electricity: "electricity",
    internet: "internet",
    gas: "gas",
    water: "water",
    generator: "generator",
    maintenance: "maintenance",
  };
  const serviceType = serviceMap[utilityType];
  if (!serviceType) return true; // For "others" and "rent", assume all subscribed
  return member.services.some((s) => s.type === serviceType && s.enabled);
}

export function calculateUtilityAllocation(
  utility: Utility,
  allocations: UtilityAllocation[],
  members: Member[],
): UtilityAllocation[] {
  const subscribedAllocations = allocations.filter((a) => a.subscribed);
  const totalSubscribed = subscribedAllocations.length;

  if (totalSubscribed === 0) {
    return allocations.map((a) => ({
      ...a,
      amount: 0,
    }));
  }

  return allocations.map((allocation) => {
    if (!allocation.subscribed) {
      return { ...allocation, amount: 0 };
    }

    let amount = 0;

    switch (allocation.allocationMethod) {
      case "equal":
        amount = utility.amount / totalSubscribed;
        break;
      case "per_member":
        amount = utility.amount / totalSubscribed;
        break;
      case "per_room": {
        const member = members.find((m) => m.id === allocation.memberId);
        const memberRoomId = member?.roomId;
        const roomMembers = members.filter((m) => m.roomId === memberRoomId && isMemberSubscribed(m, utility.type));
        const totalRooms = new Set(
          members.filter((m) => isMemberSubscribed(m, utility.type)).map((m) => m.roomId),
        ).size;
        amount = totalRooms > 0 ? utility.amount / totalRooms : 0;
        break;
      }
      case "fixed":
        amount = allocation.fixedAmount || 0;
        break;
      case "custom_percentage":
        amount = (utility.amount * (allocation.percentage || 0)) / 100;
        break;
      default:
        amount = utility.amount / totalSubscribed;
    }

    return {
      ...allocation,
      amount: Math.round(amount * 100) / 100,
    };
  });
}

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
