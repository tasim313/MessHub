import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useCollection, orderBy, type Member, type Room, type MealEntry, type Bazar, type Staff, type LedgerEntry } from "@/lib/data";
import { ymKey, bdt } from "@/lib/format";
import { BadgePercent, Wallet, ArrowDownRight, AlertTriangle } from "lucide-react";
import type { Deposit, Credit, Payment, Expense } from "@/lib/types";
import { calculateAllSettlements } from "@/lib/calculations/engine";

export const Route = createFileRoute("/_authed/credits")({
  component: CreditsPage,
});

/**
 * Credits Page - Shows AUTO-COMPUTED credits from settlement
 *
 * Per Accounting Rules:
 * - No manual credit creation allowed
 * - Credit = Net Negative Balance (member owes money to mess)
 * - Credit Amount = Total Charges - Total Contributions - Payments - Credits - Deposits
 * - Status = "Pay to Mess" when Net Balance < 0
 */
function CreditsPage() {
  const { profile } = useAuth();
  const [ym, setYm] = useState(ymKey());

  const { data: members } = useCollection<Member>("members");
  const { data: rooms } = useCollection<Room>("rooms");
  const { data: meals } = useCollection<MealEntry>("meals");
  const { data: bazar } = useCollection<Bazar>("bazar");
  const { data: expenses } = useCollection<Expense>("expenses");
  const { data: deposits } = useCollection<Deposit>("deposits");
  const { data: credits } = useCollection<Credit>("credits");
  const { data: payments } = useCollection<Payment>("payments");
  const { data: staff } = useCollection<Staff>("staff");
  const { data: ledgers } = useCollection<LedgerEntry>("ledgers");

  // Compute settlements with unified formula
  const settlements = useMemo(() => {
    const monthExpenses = expenses.filter((e) => e.ym === ym);
    return calculateAllSettlements(
      members,
      ym,
      meals,
      bazar,
      deposits,
      credits,
      payments,
      ledgers,
      monthExpenses,
      rooms,
      staff,
    );
  }, [ym, members, meals, bazar, expenses, deposits, credits, payments, ledgers, rooms, staff]);

  // Members with negative balance (payable) - these are auto-credits
  const membersWithCredits = useMemo(() => {
    return settlements
      .filter((s) => s.balance < 0)
      .sort((a, b) => a.balance - b.balance); // most negative first
  }, [settlements]);

  // Summary of auto-computed credits
  const creditSummary = useMemo(() => {
    const totalCredit = membersWithCredits.reduce((sum, s) => sum + Math.abs(s.balance), 0);
    const totalCharges = membersWithCredits.reduce((sum, s) => sum + s.charges.totalCharges, 0);
    const totalPaid = membersWithCredits.reduce((sum, s) => sum + s.contributions.totalContribution + s.totalDeposit + s.totalCredit + s.totalPayment, 0);
    const totalMealCost = membersWithCredits.reduce((sum, s) => sum + s.mealCost, 0);
    return { totalCredit, totalCharges, totalPaid, totalMealCost };
  }, [membersWithCredits]);

  const totalManualCredits = credits.reduce((s, c) => s + c.amount, 0);

  return (
    <div>
      <PageHeader
        title="Credits (Auto-Computed)"
        description={`${ym} · ${membersWithCredits.length} members owe ${bdt(creditSummary.totalCredit)}`}
        action={
          <div className="flex items-center gap-2">
            <Input
              type="month"
              value={ym}
              onChange={(e) => setYm(e.target.value)}
              className="w-40"
            />
          </div>
        }
      />

      <div className="p-6 space-y-6">
        {/* Info Banner */}
        <Card className="border-amber-500/40 bg-amber-500/5 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5" />
            <div>
              <div className="font-semibold">Auto-Computed from Settlement</div>
              <div className="text-sm text-muted-foreground">
                Credits are automatically calculated from the settlement engine.
                When a member's Net Balance is negative, it means they owe money to the mess.
                This is their credit (liability). No manual credit creation is needed.
              </div>
            </div>
          </div>
        </Card>

        {/* Summary Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-5">
            <div className="text-xs uppercase text-muted-foreground">Total Due from Members</div>
            <div className="text-2xl font-bold text-destructive mt-2">{bdt(creditSummary.totalCredit)}</div>
            <div className="text-xs text-muted-foreground mt-1">{membersWithCredits.length} members owe</div>
          </Card>
          <Card className="p-5">
            <div className="text-xs uppercase text-muted-foreground">Their Total Charges</div>
            <div className="text-2xl font-bold mt-2">{bdt(creditSummary.totalCharges)}</div>
            <div className="text-xs text-muted-foreground mt-1">Meals + Rent + Expenses + Staff</div>
          </Card>
          <Card className="p-5">
            <div className="text-xs uppercase text-muted-foreground">What They Paid</div>
            <div className="text-2xl font-bold text-primary mt-2">{bdt(creditSummary.totalPaid)}</div>
            <div className="text-xs text-muted-foreground mt-1">Contributions + Payments</div>
          </Card>
          <Card className="p-5">
            <div className="text-xs uppercase text-muted-foreground">Manual Credits (Legacy)</div>
            <div className="text-2xl font-bold mt-2">{bdt(totalManualCredits)}</div>
            <div className="text-xs text-muted-foreground mt-1">{credits.length} records</div>
          </Card>
        </div>

        {/* Credit Breakdown Table */}
        <Card className="p-0 overflow-hidden">
          <div className="p-4 border-b bg-muted/30">
            <h3 className="font-semibold flex items-center gap-2">
              <BadgePercent className="h-4 w-4" />
              Members Who Owe Mess
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              These members have not paid their full share of shared expenses.
            </p>
          </div>
          {membersWithCredits.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <Wallet className="h-10 w-10 mx-auto opacity-40 mb-3" />
              No members owe money this month
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground bg-muted/50">
                  <tr>
                    <th className="text-left p-3 font-medium">Member</th>
                    <th className="text-right p-3 font-medium">Meals</th>
                    <th className="text-right p-3 font-medium">Rent</th>
                    <th className="text-right p-3 font-medium">Utilities</th>
                    <th className="text-right p-3 font-medium">Staff</th>
                    <th className="text-right p-3 font-medium">Total Charges</th>
                    <th className="text-right p-3 font-medium">Total Paid</th>
                    <th className="text-right p-3 font-medium text-destructive">Credit (Owes)</th>
                    <th className="text-left p-3 font-medium">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {membersWithCredits.map((s) => {
                    // Use the detailed creditReason from the engine if available
                    const reason = s.creditReason || "Unpaid Share";
                    return (
                      <tr key={s.memberId} className="border-t hover:bg-muted/30">
                        <td className="p-3 font-medium">{s.memberName}</td>
                        <td className="p-3 text-right tabular-nums">{bdt(s.charges.mealCost)}</td>
                        <td className="p-3 text-right tabular-nums">{bdt(s.charges.rentShare)}</td>
                        <td className="p-3 text-right tabular-nums">{bdt(s.charges.expenseShares)}</td>
                        <td className="p-3 text-right tabular-nums">{bdt(s.charges.staffShare)}</td>
                        <td className="p-3 text-right tabular-nums text-destructive">{bdt(s.charges.totalCharges)}</td>
                        <td className="p-3 text-right tabular-nums text-primary">
                          {bdt(s.contributions.totalContribution + s.totalDeposit + s.totalCredit + s.totalPayment)}
                        </td>
                        <td className="p-3 text-right tabular-nums font-bold text-destructive">
                          {bdt(Math.abs(s.balance))}
                        </td>
                        <td className="p-3 text-xs text-muted-foreground max-w-xs" title={reason}>{reason}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="text-xs font-bold bg-muted/30">
                  <tr>
                    <td className="p-3">TOTAL</td>
                    <td className="p-3 text-right">{bdt(membersWithCredits.reduce((s, m) => s + m.charges.mealCost, 0))}</td>
                    <td className="p-3 text-right">{bdt(membersWithCredits.reduce((s, m) => s + m.charges.rentShare, 0))}</td>
                    <td className="p-3 text-right">{bdt(membersWithCredits.reduce((s, m) => s + m.charges.expenseShares, 0))}</td>
                    <td className="p-3 text-right">{bdt(membersWithCredits.reduce((s, m) => s + m.charges.staffShare, 0))}</td>
                    <td className="p-3 text-right">{bdt(creditSummary.totalCharges)}</td>
                    <td className="p-3 text-right">{bdt(creditSummary.totalPaid)}</td>
                    <td className="p-3 text-right text-destructive">{bdt(creditSummary.totalCredit)}</td>
                    <td className="p-3">—</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Card>

        {/* Charge Breakdown for Members with Credits */}
        <Card className="p-5">
          <h3 className="font-semibold mb-4">Charge Breakdown Details</h3>
          {membersWithCredits.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No outstanding dues</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground bg-muted/50">
                  <tr>
                    <th className="text-left p-3 font-medium">Member</th>
                    <th className="text-left p-3 font-medium">Expense Categories</th>
                    <th className="text-left p-3 font-medium">Bazar Contribution</th>
                    <th className="text-left p-3 font-medium">Expense Bills Paid</th>
                    <th className="text-right p-3 font-medium">Net</th>
                    <th className="text-center p-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {membersWithCredits.map((s) => {
                    const expenseCategories = Object.keys(s.charges.expenseShareBreakdown).filter(k => s.charges.expenseShareBreakdown[k] > 0);
                    return (
                      <tr key={s.memberId} className="border-t hover:bg-muted/30">
                        <td className="p-3 font-medium">{s.memberName}</td>
                        <td className="p-3">
                          {expenseCategories.length > 0
                            ? expenseCategories.map(cat => cat.replace(/_/g, " ")).join(", ")
                            : "—"}
                        </td>
                        <td className="p-3">{bdt(s.contributions.bazarContribution)}</td>
                        <td className="p-3">{bdt(s.contributions.expenseContributions)}</td>
                        <td className="p-3 text-right font-bold text-destructive">{bdt(Math.abs(s.balance))}</td>
                        <td className="p-3 text-center">
                          <span className="inline-block rounded-full px-2 py-0.5 text-xs font-medium bg-destructive/10 text-destructive">
                            Pay {bdt(s.payableAmount)}
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

        {/* Quick Actions */}
        <Card className="p-5">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <ArrowDownRight className="h-4 w-4" />
            How to Settle Credits
          </h3>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>Members with negative balances need to pay the mess. Here's how:</p>
            <ol className="list-decimal list-inside space-y-2">
              <li>Go to the <strong>Charges</strong> page and select the member</li>
              <li>Use the <strong>Record Payment</strong> form to record their payment</li>
              <li>The payment will automatically update their settlement balance</li>
              <li>Or go to <strong>Payments</strong> page to record payments directly</li>
            </ol>
          </div>
        </Card>
      </div>
    </div>
  );
}