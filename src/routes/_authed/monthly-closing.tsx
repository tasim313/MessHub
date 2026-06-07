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
  type Utility,
  type Staff,
  type Room,
} from "@/lib/data";
import { computeMonthly } from "@/lib/calc";
import { ymKey, bdt } from "@/lib/format";
import { calculateMonthlyClosing } from "@/lib/calculations/monthly-closing";
import { generateRentChargesForMonth } from "@/lib/transaction";
import {
  Lock,
  Unlock,
  CheckCircle2,
  Plus,
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
  const { data: utilities } = useCollection<Utility>("utilities");
  const { data: deposits } = useCollection<Deposit>("deposits");
  const { data: credits } = useCollection<Credit>("credits");
  const { data: payments } = useCollection<Payment>("payments");
  const { data: staff } = useCollection<Staff>("staff");
  const { data: rooms } = useCollection<Room>("rooms");
  const { data: closings } = useCollection<MonthlyClosing>("monthly_closing", [
    orderBy("createdAt", "desc"),
  ]);
  const { data: rentCharges } = useCollection<RentCharge>("rent_charges");

  const monthBazar = useMemo(() => bazar.filter((b) => b.ym === ym), [bazar, ym]);
  const monthUtilities = useMemo(() => utilities.filter((u) => u.ym === ym), [utilities, ym]);
  const activeStaff = useMemo(() => staff.filter((s) => s.status !== "inactive"), [staff]);

  const monthSummary = useMemo(
    () =>
      computeMonthly(ym, members, meals, bazar, utilities, deposits, staff, rooms),
    [ym, members, meals, bazar, utilities, deposits, staff, rooms],
  );

  const existingClosing = useMemo(
    () => closings.find((c) => c.month === ym),
    [closings, ym],
  );

  const monthRentCharges = useMemo(
    () => rentCharges.filter((r) => r.month === ym),
    [rentCharges, ym],
  );

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
      monthUtilities,
      activeStaff,
    );
  }, [ym, members, monthRentCharges, deposits, credits, payments, monthBazar, monthUtilities, activeStaff]);

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

  const handleClose = async () => {
    if (!profile) return;
    try {
      if (existingClosing) {
        await updateDocIn("monthly_closing", existingClosing.id, {
          ...closingData,
          closedBy: profile.uid,
          closedByName: profile.name,
          status: "closed",
          updatedAt: Date.now(),
        });
        toast.success("Monthly closing updated");
      } else {
        await addDocTo("monthly_closing", {
          ...closingData,
          closedBy: profile.uid,
          closedByName: profile.name,
          status: "closed",
        });
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
                          <span>Utilities</span>
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

        {/* KPI Cards using actual data */}
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
            <div className="text-xs uppercase text-muted-foreground">Staff Salaries</div>
            <div className="text-2xl font-bold text-destructive mt-2">{bdt(closingData.totalStaff)}</div>
            <div className="text-xs text-muted-foreground mt-1">{activeStaff.length} active staff</div>
          </Card>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-5">
            <div className="text-xs uppercase text-muted-foreground">Utilities</div>
            <div className="text-2xl font-bold text-destructive mt-2">{bdt(closingData.totalUtility)}</div>
            <div className="text-xs text-muted-foreground mt-1">{monthUtilities.length} bills</div>
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
                  <span>Utilities</span>
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

        <Card className="p-5">
          <h3 className="font-semibold mb-4">Member Breakdown</h3>
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
                    <th className="text-right p-3 font-medium">Utility</th>
                    <th className="text-right p-3 font-medium">Staff</th>
                    <th className="text-right p-3 font-medium">Total Due</th>
                    <th className="text-right p-3 font-medium">Deposited</th>
                    <th className="text-right p-3 font-medium">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {monthSummary.perMember.map((p) => (
                    <tr key={p.memberId} className="border-t hover:bg-muted/30">
                      <td className="p-3 font-medium">{p.memberName}</td>
                      <td className="p-3 text-right tabular-nums">{p.meals}</td>
                      <td className="p-3 text-right tabular-nums">{bdt(p.mealCost)}</td>
                      <td className="p-3 text-right tabular-nums">{bdt(p.rentShare)}</td>
                      <td className="p-3 text-right tabular-nums">{bdt(p.utilityShare)}</td>
                      <td className="p-3 text-right tabular-nums">{bdt(p.staffShare)}</td>
                      <td className="p-3 text-right tabular-nums font-semibold">{bdt(p.totalDue)}</td>
                      <td className="p-3 text-right tabular-nums text-primary">{bdt(p.deposited)}</td>
                      <td className={`p-3 text-right tabular-nums font-bold ${p.balance >= 0 ? "text-primary" : "text-destructive"}`}>
                        {bdt(p.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}