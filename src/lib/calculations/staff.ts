import type { Staff, StaffAllocation, Member } from "@/lib/types";

export function calculateStaffAllocation(
  staff: Staff,
  allocations: StaffAllocation[],
  members: Member[],
): StaffAllocation[] {
  const subscribedMembers = allocations.filter((a) => {
    const member = members.find((m) => m.id === a.memberId);
    if (!member?.services) return false;
    const serviceType = getServiceTypeForStaffRole(staff.role);
    return member.services.some((s) => s.type === serviceType && s.enabled);
  });

  const totalSubscribed = subscribedMembers.length;

  if (totalSubscribed === 0) {
    return allocations.map((a) => ({
      ...a,
      amount: 0,
    }));
  }

  const perMemberAmount = staff.salary / totalSubscribed;

  return allocations.map((allocation) => {
    const member = members.find((m) => m.id === allocation.memberId);
    const isSubscribed = member?.services?.some(
      (s) => s.type === getServiceTypeForStaffRole(staff.role) && s.enabled,
    );

    if (!isSubscribed) {
      return { ...allocation, amount: 0 };
    }

    return {
      ...allocation,
      amount: Math.round(perMemberAmount * 100) / 100,
    };
  });
}

function getServiceTypeForStaffRole(role: string): string {
  const mapping: Record<string, string> = {
    cook: "cooking_staff",
    cleaner: "cleaning_staff",
    security: "security_staff",
    helper: "other_services",
    accountant: "other_services",
    manager: "other_services",
  };
  return mapping[role] || "other_services";
}

export function getMonthlyStaffCost(
  staffList: Staff[],
  allocations: StaffAllocation[],
): {
  totalStaffCost: number;
  byStaff: Record<string, number>;
  perMember: Record<string, number>;
} {
  const totalStaffCost = staffList.reduce((sum, s) => sum + s.salary, 0);
  const byStaff: Record<string, number> = {};
  staffList.forEach((s) => {
    byStaff[s.id] = s.salary;
  });

  const perMember: Record<string, number> = {};
  allocations.forEach((a) => {
    perMember[a.memberId] = (perMember[a.memberId] || 0) + a.amount;
  });

  return {
    totalStaffCost,
    byStaff,
    perMember,
  };
}
