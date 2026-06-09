import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useCollection, addDocTo, orderBy, type Member, type Room, type MealEntry, type Bazar, type Staff, type LedgerEntry } from "@/lib/data";
import { ymKey, bdt } from "@/lib/format";
import { Wallet, PiggyBank, Download, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import type { Deposit, Credit, Payment, Expense } from "@/lib/types";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/types";
import { calculateAllSettlements, getSettlementSummary, type MemberSettlement } from "@/lib/calculations/engine";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/deposits")({
  component: DepositsPage,
});

/**
 * Deposits Page - Shows AUTO-COMPUTED deposits from settlement
 *
 * Per Accounting Rules:
 * - No manual deposit creation allowed
 * - Deposit = Net Positive Balance (member paid more than charges)
 * - Deposit Amount = Total Contributions + Payments + Credits - Total Charges
 * - Status = "Receive from Mess" when Net Balance > 0
 */
function DepositsPage() {
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

  // Members with positive balance (receivable) - these are auto-deposits
  const membersWithDeposits = useMemo(() => {
    return settlements
      .filter((s) => s.balance > 0)
      .sort((a, b) => b.balance - a.balance);
  }, [settlements]);

  // Summary of auto-computed deposits
  const depositSummary = useMemo(() => {
    const totalDeposit = membersWithDeposits.reduce((sum, s) => sum + s.balance, 0);
    const totalContributions = membersWithDeposits.reduce((sum, s) => sum + s.contributions.totalContribution, 0);
    const totalCharges = membersWithDeposits.reduce((sum, s) => sum + s.charges.totalCharges, 0);
    return { totalDeposit, totalContributions, totalCharges };
  }, [membersWithDeposits]);

  const activeCount = members.filter((m) => m.active).length;
  const totalManualDeposits = deposits.reduce((s, d) => s + d.amount, 0);

  return (
    <div>
      <PageHeader
        title="Members To Receive From Mess"
        description={`${ym} · ${membersWithDeposits.length} members with deposits totaling ${bdt(depositSummary.totalDeposit)}`}
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
        <Card className="border-primary/40 bg-primary/5 p-4">
          <div className="flex items-start gap-3">
            <Wallet className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <div className="font-semibold">Auto-Computed from Settlement</div>
              <div className="text-sm text-muted-foreground">
                Deposits are automatically calculated from the settlement engine.
                When a member's Net Balance is positive, it means the mess owes them money.
                This is their deposit amount. No manual deposit creation is needed.
              </div>
            </div>
          </div>
        </Card>

        {/* Summary Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-5">
            <div className="text-xs uppercase text-muted-foreground">Total Deposit Receivable</div>
            <div className="text-2xl font-bold text-primary mt-2">{bdt(depositSummary.totalDeposit)}</div>
            <div className="text-xs text-muted-foreground mt-1">{membersWithDeposits.length} members</div>
          </Card>
          <Card className="p-5">
            <div className="text-xs uppercase text-muted-foreground">Total Contributions</div>
            <div className="text-2xl font-bold mt-2">{bdt(depositSummary.totalContributions)}</div>
            <div className="text-xs text-muted-foreground mt-1">Bazar + Expenses + Rent</div>
          </Card>
          <Card className="p-5">
            <div className="text-xs uppercase text-muted-foreground">Total Charges</div>
            <div className="text-2xl font-bold mt-2 text-destructive">{bdt(depositSummary.totalCharges)}</div>
            <div className="text-xs text-muted-foreground mt-1">Meals + Rent + Expenses + Staff</div>
          </Card>
          <Card className="p-5">
            <div className="text-xs uppercase text-muted-foreground">Manual Deposits (Legacy)</div>
            <div className="text-2xl font-bold mt-2">{bdt(totalManualDeposits)}</div>
            <div className="text-xs text-muted-foreground mt-1">{deposits.length} records</div>
          </Card>
        </div>

        {/* Deposit Breakdown Table */}
        <Card className="p-0 overflow-hidden">
          <div className="p-4 border-b bg-muted/30">
            <h3 className="font-semibold flex items-center gap-2">
              <PiggyBank className="h-4 w-4" />
              Members To Receive From Mess
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              These members paid shared expenses for others. Mess must pay them back.
            </p>
          </div>
          {membersWithDeposits.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <Wallet className="h-10 w-10 mx-auto opacity-40 mb-3" />
              No members have deposits this month
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground bg-muted/50">
                  <tr>
                    <th className="text-left p-3 font-medium">Member</th>
                    <th className="text-right p-3 font-medium">Total Contributions</th>
                    <th className="text-right p-3 font-medium">Bazar</th>
                    <th className="text-right p-3 font-medium">Expenses Paid</th>
                    <th className="text-right p-3 font-medium">Payments</th>
                    <th className="text-right p-3 font-medium">Total Charges</th>
                    <th className="text-right p-3 font-medium text-primary">Deposit</th>
                    <th className="text-left p-3 font-medium">Source / Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {membersWithDeposits.map((s) => {
                    // Use the detailed depositSource from the engine if available
                    const reason = s.depositSource || "Overpayment";
                    return (
                      <tr key={s.memberId} className="border-t hover:bg-muted/30">
                        <td className="p-3 font-medium">{s.memberName}</td>
                        <td className="p-3 text-right tabular-nums">{bdt(s.contributions.totalContribution)}</td>
                        <td className="p-3 text-right tabular-nums">{bdt(s.contributions.bazarContribution)}</td>
                        <td className="p-3 text-right tabular-nums">{bdt(s.contributions.expenseContributions)}</td>
                        <td className="p-3 text-right tabular-nums">{bdt(s.contributions.paymentsMade)}</td>
                        <td className="p-3 text-right tabular-nums text-destructive">{bdt(s.charges.totalCharges)}</td>
                        <td className="p-3 text-right tabular-nums font-bold text-primary">{bdt(s.balance)}</td>
                        <td className="p-3 text-xs text-muted-foreground max-w-xs" title={reason}>{reason}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="text-xs font-bold bg-muted/30">
                  <tr>
                    <td className="p-3">TOTAL</td>
                    <td className="p-3 text-right">{bdt(depositSummary.totalContributions)}</td>
                    <td className="p-3 text-right">{bdt(membersWithDeposits.reduce((s, m) => s + m.contributions.bazarContribution, 0))}</td>
                    <td className="p-3 text-right">{bdt(membersWithDeposits.reduce((s, m) => s + m.contributions.expenseContributions, 0))}</td>
                    <td className="p-3 text-right">{bdt(membersWithDeposits.reduce((s, m) => s + m.contributions.paymentsMade, 0))}</td>
                    <td className="p-3 text-right">{bdt(depositSummary.totalCharges)}</td>
                    <td className="p-3 text-right text-primary">{bdt(depositSummary.totalDeposit)}</td>
                    <td className="p-3">—</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Card>

        {/* Settlement Status Summary */}
        <Card className="p-5">
          <h3 className="font-semibold mb-4">All Members Settlement Summary</h3>
          {settlements.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No data for this month</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground bg-muted/50">
                  <tr>
                    <th className="text-left p-3 font-medium">Member</th>
                    <th className="text-right p-3 font-medium">Total Charges</th>
                    <th className="text-right p-3 font-medium">Total Paid</th>
                    <th className="text-right p-3 font-medium">Net Balance</th>
                    <th className="text-center p-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {settlements.map((s) => (
                    <tr key={s.memberId} className="border-t hover:bg-muted/30">
                      <td className="p-3 font-medium">{s.memberName}</td>
                      <td className="p-3 text-right tabular-nums text-destructive">{bdt(s.charges.totalCharges)}</td>
                      <td className="p-3 text-right tabular-nums text-primary">{bdt(s.contributions.totalContribution + s.totalDeposit + s.totalCredit + s.totalPayment)}</td>
                      <td className={`p-3 text-right tabular-nums font-bold ${
                        s.balance > 0 ? "text-primary" : s.balance < 0 ? "text-destructive" : ""
                      }`}>
                        {bdt(s.balance)}
                      </td>
                      <td className="p-3 text-center">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          s.settlementStatus === "settled" ? "bg-primary/10 text-primary" :
                          s.settlementStatus === "receive" ? "bg-green-500/10 text-green-600" :
                          "bg-destructive/10 text-destructive"
                        }`}>
                          {s.settlementStatus === "receive" ? `Receive ${bdt(s.receivableAmount)}` :
                           s.settlementStatus === "pay" ? `Pay ${bdt(s.payableAmount)}` :
                           "Settled"}
                        </span>
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