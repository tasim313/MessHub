import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  useCollection,
  addDocTo,
  updateDocIn,
  orderBy,
  type Member,
  type MealEntry,
  type Bazar,
  type Staff,
  type Room,
} from "@/lib/data";
import type { Expense, ExpenseAllocation } from "@/lib/types";
import { computeMonthly } from "@/lib/calc";
import { ymKey, bdt } from "@/lib/format";
import { calculateMonthlyClosing } from "@/lib/calculations/monthly-closing";
import { calculateAllSettlements, calculateMemberSettlement } from "@/lib/calculations/engine";
import { calculateMemberToMemberSettlements, consolidateSettlements } from "@/lib/financial-engine";
import { generateRentChargesForMonth } from "@/lib/transaction";
import { cleanupAllDuplicateCharges } from "@/lib/duplicate-check";
import { MonthPicker } from "@/components/ui/month-picker";
import {
  Lock,
  Unlock,
  CheckCircle2,
  Plus,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import type { MonthlyClosing, RentCharge, Deposit, Credit, Payment } from "@/lib/types";

export const Route = createFileRoute("/_authed/monthly-closing")({
  component: MonthlyClosingPage,
});

function MonthlyClosingPage() {
  const { profile } = useAuth();
  const [ym, setYm] = useState(ymKey());
  const { data: members } = useCollection<Member>("members");
  const { data: meals } = useCollection<MealEntry>("meals");
  const { data: bazar } = useCollection<Bazar>("bazar");
  const { data: expenses } = useCollection<Expense>("expenses");
  const { data: deposits } = useCollection<Deposit>("deposits");
  const { data: credits } = useCollection<Credit>("credits");
  const { data: payments } = useCollection<Payment>("payments");
  const { data: staff } = useCollection<Staff>("staff");
  const { data: rooms } = useCollection<Room>("rooms");
  const { data: closings } = useCollection<MonthlyClosing>("monthly_closing", [
    orderBy("createdAt", "desc"),
  ]);
  const { data: rentCharges } = useCollection<RentCharge>("rent_charges");
  const { data: allocations } = useCollection<ExpenseAllocation>("expense_allocations", [orderBy("createdAt", "desc")]);

  const monthBazar = useMemo(() => bazar.filter((b) => b.ym === ym), [bazar, ym]);
  const monthExpenses = useMemo(() => expenses.filter((e) => e.ym === ym), [expenses, ym]);
  const activeStaff = useMemo(() => staff.filter((s) => s.status !== "inactive"), [staff]);

  // Build prevClosings for carry forward
  const prevClosings = useMemo(() => {
    if (!closings.length) return [];
    const [year, month] = ym.split("-").map(Number);
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const prevYm = `${prevYear}-${String(prevMonth).padStart(2, "0")}`;
    const prevClosing = closings.find((c) => c.month === prevYm);
    if (!prevClosing || prevClosing.status !== "closed") return [];
    
    const breakdown = (prevClosing as any).memberBreakdown || {};
    return Object.entries(breakdown).map(([memberId, data]: [string, any]) => ({
      month: prevYm,
      memberId,
      deposit: data.deposit || 0,
      credit: data.credit || 0,
    }));
  }, [closings, ym]);

  // Filter allocations for current month
  const monthAllocations = useMemo(() => {
    if (!allocations) return [];
    return allocations.filter((a) => (a as any).ym === ym);
  }, [allocations, ym]);

  const monthSummary = useMemo(
    () =>
      computeMonthly(ym, members, meals, bazar, expenses, deposits, credits, payments, staff, rooms, [], prevClosings, monthAllocations),
    [ym, members, meals, bazar, expenses, deposits, credits, payments, staff, rooms, prevClosings, monthAllocations],
  );

  const existingClosing = useMemo(
    () => closings.find((c) => c.month === ym),
    [closings, ym],
  );

  const monthRentCharges = useMemo(
    () => rentCharges.filter((r) => r.month === ym),
    [rentCharges, ym],
  );

  const monthMeals = useMemo(() => meals.filter((m) => m.ym === ym), [meals, ym]);

  const closingData = useMemo(() => {
    const year = parseInt(ym.split("-")[0], 10);
    return calculateMonthlyClosing(
      members,
      ym,
      year,
      monthRentCharges,
      deposits.filter((d) => d.ym === ym),
      credits.filter((c) => c.ym === ym),
      payments.filter((p) => p.ym === ym),
      monthBazar,
      monthExpenses,
      activeStaff,
      monthMeals, // Fixed: pass meals to calculate meal rate correctly
    );
  }, [ym, members, monthRentCharges, deposits, credits, payments, monthBazar, monthExpenses, activeStaff, monthMeals]);

  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(false);

  const handleGenerateRentCharges = async () => {
    if (!profile) return;
    setGenerating(true);
    try {
      const result = await generateRentChargesForMonth(ym, members, rooms);
      toast.success(`Generated ${result.created} rent charges (${result.skipped} already existed)`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setGenerating(false);
    }
  };

  // Build member breakdown for carry forward with detailed settlement reasons
   const memberBreakdown = useMemo(() => {
     const breakdown: Record<string, {
       deposit: number;
       credit: number;
       balance: number;
       totalCharges: number;
       totalContributions: number;
       settlementStatus: "pay" | "receive" | "settled";
       payableAmount: number;
       receivableAmount: number;
       creditReason: string | undefined;
       depositSource: string | undefined;
       // Charge breakdown
       mealCost: number;
       rentShare: number;
       staffShare: number;
       expenseShares: Record<string, number>;
       // Contribution breakdown
       bazarContribution: number;
       paymentsMade: number;
       expenseContributions: number;
     }> = {};
     monthSummary.perMember.forEach((p) => {
       breakdown[p.memberId] = {
         deposit: p.deposited,
         credit: p.credited,
         balance: p.balance,
         totalCharges: p.totalCharges,
         totalContributions: p.totalContributions,
         settlementStatus: p.settlementStatus,
         payableAmount: p.payableAmount,
         receivableAmount: p.receivableAmount,
         creditReason: p.creditReason,
         depositSource: p.depositSource,
         mealCost: p.mealCost,
         rentShare: p.rentShare,
         staffShare: p.staffShare,
         expenseShares: p.expenseShares,
         bazarContribution: p.bazarContribution,
         paymentsMade: p.paymentsMade || 0,
          expenseContributions: Object.values(p.expenseContributions || {}).reduce((sum, v) => sum + v, 0),
        };
     });
     return breakdown;
   }, [monthSummary]);

  const handleClose = async () => {
    if (!profile) return;
    try {
      // Step 1: Clean up any duplicate charges before closing
      const allCategories = [
        "meal", "rent", "staff",
        ...Object.keys(monthExpenses.reduce((acc: Record<string, boolean>, e) => {
          acc[e.category] = true;
          return acc;
        }, {} as Record<string, boolean>))
      ];
      const cleanupResult = await cleanupAllDuplicateCharges(ym, allCategories);
      if (cleanupResult.totalDeleted > 0) {
        toast.info(`Cleaned ${cleanupResult.totalDeleted} duplicate charges: ${Object.entries(cleanupResult.details).map(([cat, count]) => `${cat}: ${count}`).join(", ")}`);

        // Log the cleanup to activity_logs for audit trail
        await addDocTo("activity_logs", {
          type: "financial",
          entity: "ledgers",
          entityId: ym,
          action: "duplicate_cleanup",
          actorUid: profile.uid,
          actorName: profile.name,
          actorRole: profile.role,
          message: `Monthly closing (${ym}): Cleaned ${cleanupResult.totalDeleted} duplicate ledger charge(s). Breakdown: ${Object.entries(cleanupResult.details).map(([cat, count]) => `${cat}: ${count}`).join(", ")}`,
          meta: {
            month: ym,
            totalDeleted: cleanupResult.totalDeleted,
            details: cleanupResult.details,
          },
        });
      }

      const closePayload = {
        month: ym,
        year: parseInt(ym.split("-")[0], 10),
        totalIncome: monthSummary.perMember.reduce((s, p) => s + p.rentShare, 0) + monthSummary.totalPayments,
        totalExpense: monthSummary.totalExpense,
        netProfit: monthSummary.totalRent + monthSummary.totalPayments - monthSummary.totalExpense,
        totalRent: monthSummary.totalRent,
        totalMeal: monthSummary.totalBazar,
        totalUtility: monthSummary.totalUtilities,
        totalStaff: monthSummary.totalStaffCost,
        totalDeposit: monthSummary.totalDeposits,
        totalCredit: monthSummary.totalCredits,
        totalCollection: monthSummary.totalPayments,
        totalDue: monthSummary.perMember.reduce((s, p) => s + Math.max(0, -p.balance), 0),
        mealRate: monthSummary.mealRate,
        totalMeals: monthSummary.totalMeals,
        totalBazar: monthSummary.totalBazar,
        memberBreakdown,
        closedBy: profile.uid,
        closedByName: profile.name,
        status: "closed" as const,
        closedAt: Date.now(),
        updatedAt: Date.now(),
      };

      if (existingClosing) {
        await updateDocIn("monthly_closing", existingClosing.id, closePayload);
        toast.success("Monthly closed/updated");
      } else {
        await addDocTo("monthly_closing", closePayload);
        toast.success("Month closed successfully");
      }
      setOpen(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleReopen = async () => {
    if (!profile || !existingClosing) return;
    try {
      await updateDocIn("monthly_closing", existingClosing.id, {
        status: "open",
        updatedAt: Date.now(),
      });
      toast.success("Month reopened");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const isOwnerOrManager = profile?.role === "owner" || profile?.role === "manager";

  const totalDue = monthSummary.perMember.reduce((s, m) => s + Math.max(0, -m.balance), 0);

  // Check if rent charges exist for this month
  const hasRentCharges = monthRentCharges.length > 0;

  // Expenses breakdown by category for the month
  const expenseByCategory = useMemo(() => {
    const byCat: Record<string, number> = {};
    monthExpenses.forEach((e) => {
      byCat[e.category] = (byCat[e.category] || 0) + (e.amount || 0);
    });
    return Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  }, [monthExpenses]);

  // Member-to-member settlements (who owes whom and why)
  const activeMembers = useMemo(() => members.filter((m) => m.active), [members]);
  const memberToMemberSettlements = useMemo(() => {
    const raw = calculateMemberToMemberSettlements(monthExpenses, monthBazar, activeMembers, ym);
    return consolidateSettlements(raw);
  }, [monthExpenses, monthBazar, activeMembers, ym]);

  // Total settled amount
  const totalSettlementAmount = useMemo(
    () => memberToMemberSettlements.reduce((s, st) => s + st.amount, 0),
    [memberToMemberSettlements],
  );

  return (
    <div>
      <PageHeader
        title="Monthly Closing"
        description={
          existingClosing?.status === "closed"
            ? `${ym} is closed`
            : `${ym} is open`
        }
        action={
          isOwnerOrManager && (
            <div className="flex gap-2">
              <Input
                type="month"
                value={ym}
                onChange={(e) => setYm(e.target.value)}
                className="w-40"
              />
              {!hasRentCharges && (
                <Button
                  variant="outline"
                  onClick={handleGenerateRentCharges}
                  disabled={generating}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  {generating ? "Generating..." : "Generate Rent"}
                </Button>
              )}
              {existingClosing?.status === "closed" ? (
                <Button variant="outline" onClick={handleReopen}>
                  <Unlock className="h-4 w-4 mr-1" />
                  Reopen
                </Button>
              ) : (
                <Dialog open={open} onOpenChange={setOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Lock className="h-4 w-4 mr-1" />
                      Close Month
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Close {ym}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        This will lock the month and prevent further edits.
                      </p>
                      <div className="rounded-lg bg-muted p-4 space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Rent Receivable</span>
                          <span className="font-semibold">{bdt(closingData.totalRent)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>Collections (Payments)</span>
                          <span className="font-semibold">{bdt(closingData.totalCollection)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>Total Bazar</span>
                          <span className="font-semibold">{bdt(closingData.totalMeal)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>Expenses</span>
                          <span className="font-semibold">{bdt(closingData.totalUtility)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>Staff Salaries</span>
                          <span className="font-semibold">{bdt(closingData.totalStaff)}</span>
                        </div>
                        <div className="flex justify-between text-sm font-bold border-t pt-2">
                          <span>Net Profit/Loss</span>
                          <span className={closingData.netProfit >= 0 ? "text-primary" : "text-destructive"}>
                            {bdt(closingData.netProfit)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button onClick={handleClose}>
                        <CheckCircle2 className="h-4 w-4 mr-1" />
                        Confirm Close
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          )
        }
      />
      <div className="p-6 space-y-6">
        {existingClosing?.status === "closed" && (
          <Card className="border-primary/40 bg-primary/5 p-4">
            <div className="flex items-center gap-3">
              <Lock className="h-5 w-5 text-primary" />
              <div>
                <div className="font-semibold">Month Closed</div>
                <div className="text-sm text-muted-foreground">
                  Closed by {existingClosing.closedByName}
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* KPI Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-5">
            <div className="text-xs uppercase text-muted-foreground">Rent Receivable</div>
            <div className="text-2xl font-bold text-primary mt-2">{bdt(closingData.totalRent)}</div>
            <div className="text-xs text-muted-foreground mt-1">{monthRentCharges.length} charges</div>
          </Card>
          <Card className="p-5">
            <div className="text-xs uppercase text-muted-foreground">Collections</div>
            <div className="text-2xl font-bold text-primary mt-2">{bdt(closingData.totalCollection)}</div>
            <div className="text-xs text-muted-foreground mt-1">Payments received</div>
          </Card>
          <Card className="p-5">
            <div className="text-xs uppercase text-muted-foreground">Total Bazar</div>
            <div className="text-2xl font-bold text-destructive mt-2">{bdt(closingData.totalMeal)}</div>
            <div className="text-xs text-muted-foreground mt-1">{monthBazar.length} entries</div>
          </Card>
          <Card className="p-5">
            <div className="text-xs uppercase text-muted-foreground">Shared Expenses</div>
            <div className="text-2xl font-bold text-destructive mt-2">{bdt(closingData.totalUtility)}</div>
            <div className="text-xs text-muted-foreground mt-1">{monthExpenses.length} entries</div>
          </Card>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-5">
            <div className="text-xs uppercase text-muted-foreground">Staff Salaries</div>
            <div className="text-2xl font-bold text-destructive mt-2">{bdt(closingData.totalStaff)}</div>
            <div className="text-xs text-muted-foreground mt-1">{activeStaff.length} active staff</div>
          </Card>
          <Card className="p-5">
            <div className="text-xs uppercase text-muted-foreground">Deposits</div>
            <div className="text-2xl font-bold mt-2">{bdt(closingData.totalDeposit)}</div>
          </Card>
          <Card className="p-5">
            <div className="text-xs uppercase text-muted-foreground">Credits</div>
            <div className="text-2xl font-bold mt-2">{bdt(closingData.totalCredit)}</div>
          </Card>
          <Card className="p-5">
            <div className="text-xs uppercase text-muted-foreground">Total Due</div>
            <div className="text-2xl font-bold text-destructive mt-2">{bdt(totalDue)}</div>
          </Card>
        </div>

        {/* Financial Breakdown */}
        <Card className="p-5">
          <h3 className="font-semibold mb-4">Financial Breakdown — {ym}</h3>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Income</h4>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Rent Receivable</span>
                  <span className="font-semibold">{bdt(closingData.totalRent)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Collections (Payments)</span>
                  <span className="font-semibold">{bdt(closingData.totalCollection)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold border-t pt-2">
                  <span>Total Income</span>
                  <span className="text-primary">{bdt(closingData.totalIncome)}</span>
                </div>
              </div>
            </div>
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Expenses</h4>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Bazar (Meals)</span>
                  <span className="font-semibold">{bdt(closingData.totalMeal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Shared Expenses</span>
                  <span className="font-semibold">{bdt(closingData.totalUtility)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Staff Salaries</span>
                  <span className="font-semibold">{bdt(closingData.totalStaff)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold border-t pt-2">
                  <span>Total Expense</span>
                  <span className="text-destructive">{bdt(closingData.totalExpense)}</span>
                </div>
              </div>
            </div>
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Summary</h4>
              <div className="space-y-2">
                <div className="flex justify-between text-sm font-bold">
                  <span>Net Profit/Loss</span>
                  <span className={closingData.netProfit >= 0 ? "text-primary" : "text-destructive"}>
                    {bdt(closingData.netProfit)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Total Due</span>
                  <span className="font-semibold text-destructive">{bdt(totalDue)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Total Deposits</span>
                  <span className="font-semibold">{bdt(closingData.totalDeposit)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Total Credits</span>
                  <span className="font-semibold">{bdt(closingData.totalCredit)}</span>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Expense Breakdown by Category */}
        {expenseByCategory.length > 0 && (
          <Card className="p-5">
            <h3 className="font-semibold mb-4">Expenses by Category</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground bg-muted/50">
                  <tr>
                    <th className="text-left p-3 font-medium">Category</th>
                    <th className="text-right p-3 font-medium">Amount</th>
                    <th className="text-right p-3 font-medium">% of Total</th>
                  </tr>
                </thead>
                <tbody>
                  {expenseByCategory.map(([cat, amount]) => (
                    <tr key={cat} className="border-t hover:bg-muted/30">
                      <td className="p-3 font-medium capitalize">{cat.replace(/_/g, " ")}</td>
                      <td className="p-3 text-right tabular-nums font-semibold">{bdt(amount)}</td>
                      <td className="p-3 text-right tabular-nums">
                        {closingData.totalUtility > 0
                          ? `${((amount / closingData.totalUtility) * 100).toFixed(1)}%`
                          : "0%"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Member Breakdown */}
        <Card className="p-5">
          <h3 className="font-semibold mb-4">Member Breakdown — {ym}</h3>
          {monthSummary.perMember.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No data for this month</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground bg-muted/50">
                   <tr>
                     <th className="text-left p-3 font-medium">Member</th>
                     <th className="text-right p-3 font-medium">Meals</th>
                     <th className="text-right p-3 font-medium">Meal Cost</th>
                     <th className="text-right p-3 font-medium">Rent</th>
                     <th className="text-right p-3 font-medium">Expenses</th>
                     <th className="text-right p-3 font-medium">Staff</th>
                     <th className="text-right p-3 font-medium">Other Charges</th>
                     <th className="text-right p-3 font-medium">Total Charges</th>
                     <th className="text-right p-3 font-medium">Contributions</th>
                     <th className="text-right p-3 font-medium">Prev Deposit</th>
                     <th className="text-right p-3 font-medium">Prev Credit</th>
                     <th className="text-right p-3 font-medium">Deposit</th>
                     <th className="text-right p-3 font-medium">Credit</th>
                     <th className="text-right p-3 font-medium">Balance</th>
                     <th className="text-center p-3 font-medium">Status</th>
                     <th className="text-left p-3 font-medium">Reason</th>
                     <th className="text-right p-3 font-medium">Carry Forward</th>
                   </tr>
                 </thead>
                 <tbody>
                   {monthSummary.perMember.map((p) => {
                     const reason = p.balance >= 0 ? p.depositSource : p.creditReason;
                     return (
                       <tr key={p.memberId} className="border-t hover:bg-muted/30">
                         <td className="p-3 font-medium">{p.memberName}</td>
                         <td className="p-3 text-right tabular-nums">{p.meals}</td>
                         <td className="p-3 text-right tabular-nums">{bdt(p.mealCost)}</td>
                         <td className="p-3 text-right tabular-nums">{bdt(p.rentShare)}</td>
                         <td className="p-3 text-right tabular-nums">{bdt(p.utilityShare)}</td>
                         <td className="p-3 text-right tabular-nums">{bdt(p.staffShare)}</td>
                         <td className="p-3 text-right tabular-nums">{bdt(p.previousDue)}</td>
                         <td className="p-3 text-right tabular-nums font-semibold">{bdt(p.totalCharges)}</td>
                         <td className="p-3 text-right tabular-nums text-primary">{bdt(p.totalContributions)}</td>
                         <td className="p-3 text-right tabular-nums">{bdt(p.previousDeposit)}</td>
                         <td className="p-3 text-right tabular-nums">{bdt(p.previousCredit)}</td>
                         <td className="p-3 text-right tabular-nums text-primary">{bdt(p.deposited)}</td>
                         <td className="p-3 text-right tabular-nums text-destructive">{bdt(p.credited)}</td>
                         <td className={`p-3 text-right tabular-nums font-bold ${p.balance >= 0 ? "text-primary" : "text-destructive"}`}>
                           {bdt(p.balance)}
                         </td>
                         <td className="p-3 text-center">
                           <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                             p.settlementStatus === "settled" ? "bg-primary/10 text-primary" :
                             p.settlementStatus === "receive" ? "bg-green-500/10 text-green-600" :
                             "bg-destructive/10 text-destructive"
                           }`}>
                             {p.settlementStatus === "receive" ? "Receive" :
                              p.settlementStatus === "pay" ? "Pay" :
                              "Settled"}
                           </span>
                         </td>
                         <td className="p-3 text-xs text-muted-foreground whitespace-normal break-words" style={{ maxWidth: "300px" }} title={reason || ""}>
                            {reason || "—"}
                          </td>
                         <td className="p-3 text-right tabular-nums text-xs">
                           <span className="text-muted-foreground">
                             D: {bdt(p.carryForwardDeposit)} C: {bdt(p.carryForwardCredit)}
                           </span>
                         </td>
                       </tr>
                     );
                   })}
                 </tbody>
               </table>
             </div>
           )}
         </Card>

         {/* Settlement Details - Shows why each member owes or is owed */}
         {monthSummary.perMember.length > 0 && (
           <Card className="p-5">
             <h3 className="font-semibold mb-4">Settlement Details — {ym}</h3>
             <div className="space-y-4">
               {monthSummary.perMember.map((p) => (
                 <div key={p.memberId} className="border rounded-lg p-4">
                   <div className="font-medium text-lg mb-2">{p.memberName}</div>
                   <div className="grid gap-2 md:grid-cols-2 text-sm">
                     {/* Charges Section */}
                     <div className="bg-destructive/5 p-3 rounded">
                       <div className="font-semibold text-destructive mb-1">Charges (Money Owed)</div>
                       <div className="space-y-1">
                         {p.mealCost > 0 && (
                           <div className="flex justify-between">
                             <span>Meal Cost:</span>
                             <span className="font-medium">{bdt(p.mealCost)}</span>
                           </div>
                         )}
                         {p.rentShare > 0 && (
                           <div className="flex justify-between">
                             <span>Rent Share:</span>
                             <span className="font-medium">{bdt(p.rentShare)}</span>
                           </div>
                         )}
                         {p.staffShare > 0 && (
                           <div className="flex justify-between">
                             <span>Staff Share:</span>
                             <span className="font-medium">{bdt(p.staffShare)}</span>
                           </div>
                         )}
                         {p.previousDue > 0 && (
                           <div className="flex justify-between">
                             <span>Previous Due:</span>
                             <span className="font-medium">{bdt(p.previousDue)}</span>
                           </div>
                         )}
                         {p.previousCredit > 0 && (
                           <div className="flex justify-between">
                             <span>Previous Credit:</span>
                             <span className="font-medium">{bdt(p.previousCredit)}</span>
                           </div>
                         )}
                         {Object.entries(p.expenseShares).filter(([_, amount]) => amount > 0).map(([cat, amount]) => (
                           <div key={cat} className="flex justify-between">
                             <span>{cat.replace(/_/g, " ")}:</span>
                             <span className="font-medium">{bdt(amount)}</span>
                           </div>
                         ))}
                         <div className="flex justify-between font-bold border-t pt-1 mt-1">
                           <span>Total Charges:</span>
                           <span>{bdt(p.totalCharges)}</span>
                         </div>
                       </div>
                     </div>

                     {/* Contributions Section */}
                     <div className="bg-primary/5 p-3 rounded">
                       <div className="font-semibold text-primary mb-1">Contributions (Money Paid)</div>
                       <div className="space-y-1">
                         {p.bazarContribution > 0 && (
                           <div className="flex justify-between">
                             <span>Bazar Paid:</span>
                             <span className="font-medium">{bdt(p.bazarContribution)}</span>
                           </div>
                         )}
                         {p.paymentsMade > 0 && (
                           <div className="flex justify-between">
                             <span>Payments Made:</span>
                             <span className="font-medium">{bdt(p.paymentsMade)}</span>
                           </div>
                         )}
                         {Object.values(p.expenseContributions || {}).reduce((sum, v) => sum + v, 0) > 0 && (
                           <div className="flex justify-between">
                             <span>Expense Contributions:</span>
                             <span className="font-medium">{bdt(Object.values(p.expenseContributions || {}).reduce((sum, v) => sum + v, 0))}</span>
                           </div>
                         )}
                         <div className="flex justify-between font-bold border-t pt-1 mt-1">
                           <span>Total Contributions:</span>
                           <span>{bdt(p.totalContributions)}</span>
                         </div>
                       </div>
                     </div>
                   </div>

                   {/* Settlement Reason */}
                   <div className="mt-3 p-3 bg-muted/30 rounded">
                     <div className="font-semibold mb-1">
                       {p.balance >= 0 ? "Deposit (Excess held for member)" : "Credit (Outstanding from member)"}
                     </div>
                     <div className="text-sm whitespace-normal break-words">
                       {p.balance >= 0 ? p.depositSource : p.creditReason || "—"}
                     </div>
                   </div>
                 </div>
               ))}
             </div>
         </Card>
         )}

         {/* ──────────────────────────────────────────── */}
         {/* MEMBER-TO-MEMBER SETTLEMENTS TABLE */}
         {/* Clear display of who owes whom and why */}
         {/* ──────────────────────────────────────────── */}
         {memberToMemberSettlements.length > 0 && (
           <Card className="p-5">
             <div className="flex items-center justify-between mb-4">
               <div>
                 <h3 className="font-semibold text-lg">Who Owes Whom — {ym}</h3>
                 <p className="text-sm text-muted-foreground mt-1">
                   Money flows between members only. The mess/software never gives or receives money.
                 </p>
               </div>
               <div className="text-right">
                 <div className="text-xs text-muted-foreground">Total Settlements</div>
                 <div className="text-lg font-bold text-primary">{bdt(totalSettlementAmount)}</div>
                 <div className="text-xs text-muted-foreground">{memberToMemberSettlements.length} transfers</div>
               </div>
             </div>
             <div className="overflow-x-auto">
               <table className="w-full text-sm">
                 <thead className="text-xs uppercase text-muted-foreground bg-muted/50">
                   <tr>
                     <th className="text-left p-3 font-medium">Who Pays</th>
                     <th className="text-center p-3 font-medium"></th>
                     <th className="text-left p-3 font-medium">Who Receives</th>
                     <th className="text-right p-3 font-medium">Amount</th>
                     <th className="text-left p-3 font-medium">Reason</th>
                   </tr>
                 </thead>
                 <tbody>
                   {memberToMemberSettlements.map((st, i) => (
                     <tr key={`${st.fromMemberId}-${st.toMemberId}-${i}`} className="border-t hover:bg-muted/30 transition-colors">
                       <td className="p-3">
                         <div className="flex items-center gap-2">
                           <span className="h-7 w-7 rounded-full bg-destructive/10 flex items-center justify-center text-xs font-bold text-destructive">
                             {st.fromMemberName[0]}
                           </span>
                           <span className="font-medium">{st.fromMemberName}</span>
                         </div>
                       </td>
                       <td className="p-3 text-center">
                         <span className="inline-flex items-center gap-1 text-muted-foreground">
                           pays <ArrowRight className="h-3.5 w-3.5" />
                         </span>
                       </td>
                       <td className="p-3">
                         <div className="flex items-center gap-2">
                           <span className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                             {st.toMemberName[0]}
                           </span>
                           <span className="font-medium">{st.toMemberName}</span>
                         </div>
                       </td>
                       <td className="p-3 text-right tabular-nums font-bold text-primary">{bdt(st.amount)}</td>
                       <td className="p-3 text-xs text-muted-foreground max-w-[300px] whitespace-normal break-words">
                         {st.reason}
                       </td>
                     </tr>
                   ))}
                 </tbody>
                 <tfoot className="font-semibold bg-muted/30">
                   <tr className="border-t-2">
                     <td colSpan={3} className="p-3">Total</td>
                     <td className="p-3 text-right text-primary">{bdt(totalSettlementAmount)}</td>
                     <td className="p-3"></td>
                   </tr>
                 </tfoot>
               </table>
             </div>
             <div className="mt-4 p-3 bg-primary/5 rounded-lg">
               <p className="text-xs text-muted-foreground text-center">
                 The mess (software) is only an accounting platform that tracks these member-to-member obligations.
                 No money is held, received, or paid by the mess itself.
               </p>
             </div>
           </Card>
         )}

         {memberToMemberSettlements.length === 0 && monthSummary.perMember.length > 0 && (
           <Card className="p-5">
             <h3 className="font-semibold mb-2">Who Owes Whom — {ym}</h3>
             <p className="text-sm text-muted-foreground text-center py-6">
               All members are settled. No member-to-member transfers needed.
             </p>
           </Card>
         )}
       </div>
    </div>
  );
}
