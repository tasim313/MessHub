import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  useCollection, orderBy, type Member, type Room, type MealEntry,
  type Bazar, type Staff, type LedgerEntry,
} from "@/lib/data";
import { ymKey, bdt } from "@/lib/format";
import { MonthPicker } from "@/components/ui/month-picker";
import {
  BadgePercent, Wallet, ArrowDownRight, AlertTriangle,
  Search, Filter, RotateCcw, TrendingDown, X,
} from "lucide-react";
import type { Deposit, Credit, Payment, Expense } from "@/lib/types";
import { calculateAllSettlements, getSettlementSummary } from "@/lib/calculations/engine";

export const Route = createFileRoute("/_authed/credits")({
  component: CreditsPage,
});

const monthOptions = [
  { value: "1", label: "January" }, { value: "2", label: "February" },
  { value: "3", label: "March" }, { value: "4", label: "April" },
  { value: "5", label: "May" }, { value: "6", label: "June" },
  { value: "7", label: "July" }, { value: "8", label: "August" },
  { value: "9", label: "September" }, { value: "10", label: "October" },
  { value: "11", label: "November" }, { value: "12", label: "December" },
];

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

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // Pending filter state
  const [pendingYear, setPendingYear] = useState<string>(String(currentYear));
  const [pendingMonth, setPendingMonth] = useState<string>(String(currentMonth));
  const [pendingDateFrom, setPendingDateFrom] = useState<string>("");
  const [pendingDateTo, setPendingDateTo] = useState<string>("");
  const [pendingUseDateRange, setPendingUseDateRange] = useState<boolean>(false);

  // Applied filter state
  const [filterYear, setFilterYear] = useState<string>(String(currentYear));
  const [filterMonth, setFilterMonth] = useState<string>(String(currentMonth));
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");
  const [useDateRange, setUseDateRange] = useState<boolean>(false);

  const yearOptions = useMemo(() => {
    const years = new Set<string>();
    years.add(String(currentYear));
    return Array.from(years).sort((a, b) => Number(b) - Number(a));
  }, [currentYear]);

  const currentYm = useDateRange ? "" : `${filterYear}-${String(filterMonth).padStart(2, "0")}`;
  const hasMonthSelected = !useDateRange && !!currentYm;
  const filterLabel = useDateRange
    ? `${filterDateFrom || "Start"} to ${filterDateTo || "End"}`
    : `${monthOptions.find((m) => m.value === filterMonth)?.label} ${filterYear}`;

  // Compute settlements
  const settlements = useMemo(() => {
    const monthExpenses = expenses.filter((e) => hasMonthSelected ? e.ym === currentYm : e.date >= filterDateFrom && e.date <= filterDateTo);
    return calculateAllSettlements(members, currentYm, meals, bazar, deposits, credits, payments, ledgers, monthExpenses, rooms, staff);
  }, [currentYm, members, meals, bazar, expenses, deposits, credits, payments, ledgers, rooms, staff, hasMonthSelected, filterDateFrom, filterDateTo]);

  const filteredSettlements = useMemo(() => {
    return [...settlements].sort((a, b) => a.balance - b.balance);
  }, [settlements]);

  const membersWithCredits = useMemo(() => {
    return filteredSettlements.filter((s) => s.balance < 0);
  }, [filteredSettlements]);

  const creditSummary = useMemo(() => {
    const totalCredit = membersWithCredits.reduce((sum, s) => sum + Math.abs(s.balance), 0);
    const totalCharges = membersWithCredits.reduce((sum, s) => sum + s.charges.totalCharges, 0);
    const totalPaid = membersWithCredits.reduce((sum, s) => sum + s.contributions.totalContribution, 0);
    return { totalCredit, totalCharges, totalPaid };
  }, [membersWithCredits]);

  const allSummary = useMemo(() => getSettlementSummary(settlements), [settlements]);

  const applyFilters = () => {
    setFilterYear(pendingYear);
    setFilterMonth(pendingMonth);
    setFilterDateFrom(pendingDateFrom);
    setFilterDateTo(pendingDateTo);
    setUseDateRange(pendingUseDateRange);
  };

  const resetFilters = () => {
    const y = String(currentYear);
    const m = String(currentMonth);
    setPendingYear(y); setPendingMonth(m);
    setPendingDateFrom(""); setPendingDateTo(""); setPendingUseDateRange(false);
    setFilterYear(y); setFilterMonth(m);
    setFilterDateFrom(""); setFilterDateTo(""); setUseDateRange(false);
  };

  const hasActiveFilters = useDateRange || filterYear !== String(currentYear) || filterMonth !== String(currentMonth);
  const hasFilterChanges = pendingYear !== filterYear || pendingMonth !== filterMonth || pendingDateFrom !== filterDateFrom || pendingDateTo !== filterDateTo || pendingUseDateRange !== useDateRange;

  return (
    <div>
      <PageHeader
        title="Credits (Auto-Computed)"
        description={`${filterLabel} · ${membersWithCredits.length} members owe ${bdt(creditSummary.totalCredit)}`}
        action={<MonthPicker value={currentYm || ymKey()} onChange={(v) => { setPendingYear(v.split("-")[0]); setPendingMonth(v.split("-")[1]); setFilterYear(v.split("-")[0]); setFilterMonth(v.split("-")[1]); setUseDateRange(false); }} />}
      />

      <div className="p-6 space-y-6">
        {/* Info Banner */}
        <Card className="border-amber-500/40 bg-amber-500/5 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5" />
            <div>
              <div className="font-semibold">Auto-Computed from Settlement</div>
              <div className="text-sm text-muted-foreground">Credits are automatically calculated. When a member's Net Balance is negative, they owe money to the mess.</div>
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
            <div className="text-xs text-muted-foreground mt-1">Contributions</div>
          </Card>
          <Card className="p-5">
            <div className="text-xs uppercase text-muted-foreground">Net Settlement</div>
            <div className={`text-2xl font-bold mt-2 ${allSummary.totalBalance >= 0 ? "text-primary" : "text-destructive"}`}>{bdt(allSummary.totalBalance)}</div>
            <div className="text-xs text-muted-foreground mt-1">{allSummary.membersToPay.length} pay · {allSummary.membersToReceive.length} receive · {allSummary.settledMembers.length} settled</div>
          </Card>
        </div>

        {/* FILTERS BAR (like meals & bazar) */}
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">Filters</span>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={resetFilters}>
                <X className="h-3 w-3 mr-1" />Clear
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Mode</Label>
              <Select value={pendingUseDateRange ? "range" : "month"} onValueChange={(v) => setPendingUseDateRange(v === "range")}>
                <SelectTrigger className="w-32 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">Month/Year</SelectItem>
                  <SelectItem value="range">Date Range</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {!pendingUseDateRange ? (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">Month</Label>
                  <Select value={pendingMonth} onValueChange={setPendingMonth}>
                    <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>{monthOptions.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Year</Label>
                  <Select value={pendingYear} onValueChange={setPendingYear}>
                    <SelectTrigger className="w-28 h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>{yearOptions.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">From</Label>
                  <Input type="date" value={pendingDateFrom} onChange={(e) => setPendingDateFrom(e.target.value)} className="w-40 h-9" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">To</Label>
                  <Input type="date" value={pendingDateTo} onChange={(e) => setPendingDateTo(e.target.value)} className="w-40 h-9" />
                </div>
              </>
            )}
            <Button size="sm" className="h-9 px-4" onClick={applyFilters}>
              <Search className="h-4 w-4 mr-1.5" />Search
            </Button>
          </div>
        </Card>

        {/* Credit Members Table */}
        <Card className="overflow-hidden">
          <div className="p-4 border-b bg-muted/30 flex items-center justify-between">
            <h3 className="font-semibold flex items-center gap-2">
              <BadgePercent className="h-4 w-4" />Members Who Owe Mess <span className="text-muted-foreground font-normal ml-1">({membersWithCredits.length} members)</span>
            </h3>
            <span className="text-sm text-muted-foreground">{filterLabel}</span>
          </div>
          {membersWithCredits.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <Wallet className="h-10 w-10 mx-auto opacity-40 mb-3" />
              <p className="font-medium">{settlements.length === 0 ? "No data for this period" : "No members owe money"}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground bg-muted/50 sticky top-0">
                  <tr>
                    <th className="text-left p-3 font-medium">Member</th>
                    <th className="text-right p-3 font-medium">Meals</th>
                    <th className="text-right p-3 font-medium">Rent</th>
                    <th className="text-right p-3 font-medium">Utilities</th>
                    <th className="text-right p-3 font-medium">Staff</th>
                    <th className="text-right p-3 font-medium">Total Charges</th>
                    <th className="text-right p-3 font-medium">Paid</th>
                    <th className="text-right p-3 font-medium text-destructive">Credit (Owes)</th>
                    <th className="text-left p-3 font-medium">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {membersWithCredits.map((s) => {
                    const reason = s.creditReason || "Unpaid Share";
                    return (
                      <tr key={s.memberId} className="border-t hover:bg-muted/30 transition-colors">
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <span className="h-7 w-7 rounded-full bg-destructive/10 flex items-center justify-center text-xs font-bold text-destructive">{s.memberName[0]}</span>
                            <span className="font-medium">{s.memberName}</span>
                          </div>
                        </td>
                        <td className="p-3 text-right tabular-nums">{bdt(s.charges.mealCost)}</td>
                        <td className="p-3 text-right tabular-nums">{bdt(s.charges.rentShare)}</td>
                        <td className="p-3 text-right tabular-nums">{bdt(s.charges.expenseShares)}</td>
                        <td className="p-3 text-right tabular-nums">{bdt(s.charges.staffShare)}</td>
                        <td className="p-3 text-right tabular-nums text-destructive">{bdt(s.charges.totalCharges)}</td>
                        <td className="p-3 text-right tabular-nums text-primary">{bdt(s.contributions.totalContribution)}</td>
                        <td className="p-3 text-right tabular-nums font-bold text-destructive">{bdt(Math.abs(s.balance))}</td>
                        <td className="p-3 text-xs text-muted-foreground whitespace-normal break-words">{reason}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="font-semibold bg-muted/30 border-t-2">
                  <tr>
                    <td className="p-3">Total ({membersWithCredits.length} members)</td>
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

        {/* All Members Settlement Summary */}
        <Card className="overflow-hidden">
          <div className="p-4 border-b bg-muted/30">
            <h3 className="font-semibold">All Members Settlement Summary</h3>
            <p className="text-xs text-muted-foreground mt-1">Complete settlement status for {filterLabel}</p>
          </div>
          {filteredSettlements.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground"><p className="font-medium">No data for this period</p></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground bg-muted/50 sticky top-0">
                  <tr>
                    <th className="text-left p-3 font-medium">Member</th>
                    <th className="text-right p-3 font-medium">Charges</th>
                    <th className="text-right p-3 font-medium">Contributions</th>
                    <th className="text-right p-3 font-medium">Net Balance</th>
                    <th className="text-center p-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSettlements.map((s) => (
                    <tr key={s.memberId} className="border-t hover:bg-muted/30 transition-colors">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <span className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold ${s.balance > 0 ? "bg-primary/10 text-primary" : s.balance < 0 ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}>{s.memberName[0]}</span>
                          <span className="font-medium">{s.memberName}</span>
                        </div>
                      </td>
                      <td className="p-3 text-right tabular-nums text-destructive">{bdt(s.charges.totalCharges)}</td>
                      <td className="p-3 text-right tabular-nums text-primary">{bdt(s.contributions.totalContribution)}</td>
                      <td className={`p-3 text-right tabular-nums font-bold ${s.balance > 0 ? "text-primary" : s.balance < 0 ? "text-destructive" : ""}`}>{bdt(s.balance)}</td>
                      <td className="p-3 text-center">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${s.settlementStatus === "settled" ? "bg-primary/10 text-primary" : s.settlementStatus === "receive" ? "bg-green-500/10 text-green-600" : "bg-destructive/10 text-destructive"}`}>
                          {s.settlementStatus === "receive" ? `Receive ${bdt(s.receivableAmount)}` : s.settlementStatus === "pay" ? `Pay ${bdt(s.payableAmount)}` : "Settled"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Quick Actions */}
        <Card className="p-5">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><ArrowDownRight className="h-4 w-4" />How to Settle Credits</h3>
          <div className="space-y-3 text-sm text-muted-foreground">
            <ol className="list-decimal list-inside space-y-2">
              <li>Go to the <strong>Charges</strong> page and select the member</li>
              <li>Use the <strong>Record Payment</strong> form to record their payment</li>
              <li>The payment will automatically update their settlement balance</li>
            </ol>
          </div>
        </Card>
      </div>
    </div>
  );
}