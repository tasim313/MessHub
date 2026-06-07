/**
 * Monthly Closing Calculation Engine
 * Uses actual collection data (bazar, utilities, staff salaries) instead of ledger entries
 */
import type { Member, MonthlyClosing, RentCharge, Deposit, Credit, Payment, Staff } from "@/lib/types";

// Flexible types to accept both string and enum types
interface FlexibleBazar {
  id: string;
  date: string;
  ym: string;
  buyerId: string;
  buyerName: string;
  items: { name: string; amount: number }[];
  total: number;
  category: string;
  notes?: string;
  createdAt?: number;
}

interface FlexibleUtility {
  id: string;
  ym: string;
  type: string;
  amount: number;
  paidBy?: string;
  paidByName?: string;
  notes?: string;
  date: string;
  createdAt?: number;
}

export function calculateMonthlyClosing(
  members: Member[],
  month: string,
  year: number,
  rentCharges: RentCharge[],
  deposits: Deposit[],
  credits: Credit[],
  payments: Payment[],
  monthBazar: FlexibleBazar[],
  monthUtilities: FlexibleUtility[],
  activeStaff: Staff[],
): Omit<MonthlyClosing, "id" | "createdAt" | "createdBy"> {
  // Rent Receivable - Total rent charges for the month
  const totalRent = rentCharges.reduce((sum, r) => sum + (r.amount || 0), 0);
  
  // Collections - Total payments received
  const totalCollection = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  
  // Total Income = Rent Receivable + Collections
  const totalIncome = totalRent + totalCollection;
  
  // Expenses
  const totalBazar = monthBazar.reduce((sum, b) => sum + (b.total || 0), 0);
  const totalUtility = monthUtilities.reduce((sum, u) => sum + (u.amount || 0), 0);
  const totalStaffCost = activeStaff.reduce((sum, s) => sum + (s.salary || 0) + (s.overtime || 0) + (s.bonus || 0) - (s.advance || 0), 0);
  
  const totalExpense = totalBazar + totalUtility + totalStaffCost;
  const netProfit = totalIncome - totalExpense;
  
  // Total deposits and credits
  const totalDeposit = deposits.reduce((sum, d) => sum + (d.amount || 0), 0);
  const totalCredit = credits.reduce((sum, c) => sum + (c.amount || 0), 0);
  
  // Total Due - Sum of all outstanding dues from rent charges
  // Use dueAmount if available, otherwise calculate from payments
  const totalDue = rentCharges.reduce((sum, r) => {
    const dueAmount = r.dueAmount !== undefined ? r.dueAmount : Math.max(0, r.amount - (r.paidAmount || 0));
    return sum + dueAmount;
  }, 0);
  
  return {
    month, year,
    totalIncome, totalExpense, netProfit,
    totalRent, totalMeal: totalBazar, totalUtility, totalStaff: totalStaffCost,
    totalDeposit, totalCredit, totalCollection, totalDue,
    closedBy: "", closedByName: "", status: "open",
  };
}

/**
 * Get member-wise dues for a specific month
 */
export function getMemberDues(
  members: Member[],
  month: string,
  rentCharges: RentCharge[],
  payments: Payment[],
  deposits: Deposit[],
  credits: Credit[],
): { memberId: string; memberName: string; rentDue: number; totalPaid: number; balance: number }[] {
  return members.map((m) => {
    const memberRent = rentCharges
      .filter((r) => r.memberId === m.id)
      .reduce((s, r) => s + (r.amount || 0), 0);
    
    const memberPaid = payments
      .filter((p) => p.memberId === m.id)
      .reduce((s, p) => s + (p.amount || 0), 0);
    
    const memberDeposits = deposits
      .filter((d) => d.memberId === m.id)
      .reduce((s, d) => s + (d.amount || 0), 0);
    
    const memberCredits = credits
      .filter((c) => c.memberId === m.id)
      .reduce((s, c) => s + (c.amount || 0), 0);
    
    const balance = memberRent - memberPaid - memberDeposits - memberCredits;
    
    return {
      memberId: m.id,
      memberName: m.name,
      rentDue: memberRent,
      totalPaid: memberPaid + memberDeposits + memberCredits,
      balance,
    };
  });
}