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
  useCollection, addDocTo, orderBy, type Member, type Room,
  type MealEntry, type Bazar, type Staff, type LedgerEntry,
} from "@/lib/data";
import { ymKey, bdt } from "@/lib/format";
import {
  Wallet, PiggyBank, Search, Filter, RotateCcw, Calendar,
  ArrowUpRight, TrendingUp, TrendingDown, X,
} from "lucide-react";
import { MonthPicker } from "@/components/ui/month-picker";
import { toast } from "sonner";
import type { Deposit, Credit, Payment, Expense, ExpenseAllocation } from "@/lib/types";
import { calculateAllSettlements, getSettlementSummary, type MemberSettlement } from "@/lib/calculations/engine";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/deposits")({
  component: DepositsPage,
});

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
  const { data: allocations } = useCollection<ExpenseAllocation>("expense_allocations", [orderBy("createdAt", "desc")]);

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // Pending filter state (what user is selecting)
  const [pendingYear, setPendingYear] = useState<string>(String(currentYear));
  const [pendingMonth, setPendingMonth] = useState<string>(String(currentMonth));
  const [pendingDateFrom, setPendingDateFrom] = useState<string>("");
  const [pendingDateTo, setPendingDateTo] = useState<string>("");
  const [pendingUseDateRange, setPendingUseDateRange] = useState<boolean>(false);

  // Applied filter state (what the table uses, only changes on Search click)
  const [filterYear, setFilterYear] = useState<string>(String(currentYear));
  const [filterMonth, setFilterMonth] = useState<string>(String(currentMonth));
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");
  const [useDateRange, setUseDateRange] = useState<boolean>(false);

  // Generate year options
  const yearOptions = useMemo(() => {
    const years = new Set<string>();
    years.add(String(currentYear));
    return Array.from(years).sort((a, b) => Number(b) - Number(a));
  }, [currentYear]);

  const monthOptions = [
    { value: "1", label: "January" }, { value: "2", label: "February" },
    { value: "3", label: "March" }, { value: "4", label: "April" },
    { value: "5", label: "May" }, { value: "6", label: "June" },
    { value: "7", label: "July" }, { value: "8", label: "August" },
    { value: "9", label: "September" }, { value: "10", label: "October" },
    { value: "11", label: "November" }, { value: "12", label: "December" },
  ];

  const currentYm = useDateRange ? "" : `${filterYear}-${String(filterMonth).padStart(2, "0")}`;
  const hasMonthSelected = !useDateRange && !!currentYm;

  // Filter allocations for current month
  const monthAllocations = useMemo(() => {
    if (!allocations) return [];
    if (hasMonthSelected) {
      return allocations.filter((a) => (a as any).ym === currentYm);
    }
    return allocations.filter((a) => {
      const exp = expenses.find((e) => e.id === a.expenseId);
      return exp && exp.date >= filterDateFrom && exp.date <= filterDateTo;
    });
  }, [allocations, currentYm, hasMonthSelected, expenses, filterDateFrom, filterDateTo]);

  // Compute settlements with unified formula
  const settlements = useMemo(() => {
    const monthExpenses = expenses.filter((e) => hasMonthSelected ? e.ym === currentYm : e.date >= filterDateFrom && e.date <= filterDateTo);
    return calculateAllSettlements(
      members, currentYm, meals, bazar, deposits, credits,
      payments, ledgers, monthExpenses, rooms, staff,
      [],
      monthAllocations,
    );
  }, [currentYm, members, meals, bazar, expenses, deposits, credits, payments, ledgers, rooms, staff, hasMonthSelected, filterDateFrom, filterDateTo, monthAllocations]);

  // Filter by status
  const membersWithDeposits = useMemo(() => {
    return settlements.filter((s) => s.balance > 0).sort((a, b) => b.balance - a.balance);
  }, [settlements]);

  // Summary stats
  const depositSummary = useMemo(() => {
    const totalDeposit = membersWithDeposits.reduce((sum, s) => sum + s.balance, 0);
    const totalContributions = membersWithDeposits.reduce((sum, s) => sum + s.contributions.totalContribution, 0);
    const totalCharges = membersWithDeposits.reduce((sum, s) => sum + s.charges.totalCharges, 0);
    return { totalDeposit, totalContributions, totalCharges };
  }, [membersWithDeposits]);

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
    setPendingYear(y);
    setPendingMonth(m);
    setPendingDateFrom("");
    setPendingDateTo("");
    setPendingUseDateRange(false);
    setFilterYear(y);
    setFilterMonth(m);
    setFilterDateFrom("");
    setFilterDateTo("");
    setUseDateRange(false);
  };

  const hasFilterChanges =
    pendingYear !== filterYear ||
    pendingMonth !== filterMonth ||
    pendingDateFrom !== filterDateFrom ||
    pendingDateTo !== filterDateTo ||
    pendingUseDateRange !== useDateRange;

  const hasActiveFilters = useDateRange || filterYear !== String(currentYear) || filterMonth !== String(currentMonth);

  const filterLabel = useDateRange
    ? `${filterDateFrom || "Start"} to ${filterDateTo || "End"}`
    : `${monthOptions.find((m) => m.value === filterMonth)?.label} ${filterYear}`;

  return (
    <div>
      <PageHeader
        title="Members To Receive From Mess"
        description={`${currentYm || filterLabel} · ${membersWithDeposits.length} members totaling ${bdt(depositSummary.totalDeposit)}`}
        action={
          <div className="flex items-center gap-2">
            <MonthPicker value={currentYm || ymKey()} onChange={(v) => { setPendingYear(v.split("-")[0]); setPendingMonth(v.split("-")[1]); setFilterYear(v.split("-")[0]); setFilterMonth(v.split("-")[1]); setUseDateRange(false); }} />
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
            <div className="text-xs text-muted-foreground mt-1">Bazar + Expenses + Payments</div>
          </Card>
          <Card className="p-5">
            <div className="text-xs uppercase text-muted-foreground">Total Charges</div>
            <div className="text-2xl font-bold mt-2 text-destructive">{bdt(depositSummary.totalCharges)}</div>
            <div className="text-xs text-muted-foreground mt-1">Meals + Rent + Expenses + Staff</div>
          </Card>
          <Card className="p-5">
            <div className="text-xs uppercase text-muted-foreground">Net Settlement</div>
            <div className={`text-2xl font-bold mt-2 ${allSummary.totalBalance >= 0 ? "text-primary" : "text-destructive"}`}>
              {bdt(allSummary.totalBalance)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {allSummary.membersToReceive.length} receive · {allSummary.membersToPay.length} pay · {allSummary.settledMembers.length} settled
            </div>
          </Card>
        </div>

        {/* ──────────────────────────────────────────── */}
        {/* FILTERS BAR (Like meals & bazar) */}
        {/* ──────────────────────────────────────────── */}
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
            {/* Filter mode toggle */}
            <div className="space-y-1">
              <Label className="text-xs">Mode</Label>
              <Select value={pendingUseDateRange ? "range" : "month"} onValueChange={(v) => setPendingUseDateRange(v === "range")}>
                <SelectTrigger className="w-32 h-9">
                  <SelectValue />
                </SelectTrigger>
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
                    <SelectTrigger className="w-36 h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {monthOptions.map((m) => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Year</Label>
                  <Select value={pendingYear} onValueChange={setPendingYear}>
                    <SelectTrigger className="w-28 h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {yearOptions.map((y) => (
                        <SelectItem key={y} value={y}>{y}</SelectItem>
                      ))}
                    </SelectContent>
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

            {/* Search / Apply Filter Button */}
            <Button size="sm" className="h-9 px-4" onClick={applyFilters}>
              <Search className="h-4 w-4 mr-1.5" />Search
            </Button>
          </div>
        </Card>

        {/* ──────────────────────────────────────────── */}
        {/* DEPOSIT MEMBERS TABLE */}
        {/* ──────────────────────────────────────────── */}
        <Card className="overflow-hidden">
          <div className="p-4 border-b bg-muted/30 flex items-center justify-between">
            <h3 className="font-semibold flex items-center gap-2">
              <PiggyBank className="h-4 w-4" />
              Members To Receive From Mess
              <span className="text-muted-foreground font-normal ml-1">
                ({membersWithDeposits.length} {membersWithDeposits.length === 1 ? "member" : "members"})
              </span>
            </h3>
            <span className="text-sm text-muted-foreground">{filterLabel}</span>
          </div>

          {membersWithDeposits.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <Wallet className="h-10 w-10 mx-auto opacity-40 mb-3" />
              <p className="font-medium">
                {settlements.length === 0 ? "No data for this period" : "No members have deposits"}
              </p>
              {settlements.length > 0 && (
                <Button variant="outline" size="sm" onClick={resetFilters} className="mt-4 gap-1.5">
                  <RotateCcw className="h-3.5 w-3.5" />Clear Filters
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground bg-muted/50 sticky top-0">
                  <tr>
                    <th className="text-left p-3 font-medium">Member</th>
                    <th className="text-right p-3 font-medium">Meals</th>
                    <th className="text-right p-3 font-medium">Contributions</th>
                    <th className="text-right p-3 font-medium">Charges</th>
                    <th className="text-right p-3 font-medium text-primary">Deposit</th>
                    <th className="text-center p-3 font-medium">Status</th>
                    <th className="text-left p-3 font-medium">Source / Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {membersWithDeposits.map((s) => {
                    const reason = s.depositSource || "Overpayment";
                    return (
                      <tr key={s.memberId} className="border-t hover:bg-muted/30 transition-colors">
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <span className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                              {s.memberName[0]}
                            </span>
                            <span className="font-medium">{s.memberName}</span>
                          </div>
                        </td>
                        <td className="p-3 text-right tabular-nums">{s.totalMeals}</td>
                        <td className="p-3 text-right tabular-nums">{bdt(s.contributions.totalContribution)}</td>
                        <td className="p-3 text-right tabular-nums text-destructive">{bdt(s.charges.totalCharges)}</td>
                        <td className="p-3 text-right tabular-nums font-bold text-primary">{bdt(s.balance)}</td>
                        <td className="p-3 text-center">
                          <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">
                            Receive {bdt(s.receivableAmount)}
                          </Badge>
                        </td>
                        <td className="p-3 text-xs text-muted-foreground whitespace-normal break-words">
                          {reason}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="font-semibold bg-muted/30">
                  <tr className="border-t-2">
                    <td className="p-3">Total ({membersWithDeposits.length} members)</td>
                    <td className="p-3 text-right">{membersWithDeposits.reduce((s, m) => s + m.totalMeals, 0)}</td>
                    <td className="p-3 text-right">{bdt(depositSummary.totalContributions)}</td>
                    <td className="p-3 text-right">{bdt(depositSummary.totalCharges)}</td>
                    <td className="p-3 text-right text-primary">{bdt(depositSummary.totalDeposit)}</td>
                    <td className="p-3"></td>
                    <td className="p-3"></td>
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
          {settlements.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <p className="font-medium">No data for this period</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground bg-muted/50 sticky top-0">
                  <tr>
                    <th className="text-left p-3 font-medium">Member</th>
                    <th className="text-right p-3 font-medium">Total Charges</th>
                    <th className="text-right p-3 font-medium">Contributions</th>
                    <th className="text-right p-3 font-medium">Net Balance</th>
                    <th className="text-center p-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {settlements.map((s) => (
                    <tr key={s.memberId} className="border-t hover:bg-muted/30 transition-colors">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <span className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold ${
                            s.balance > 0 ? "bg-primary/10 text-primary" :
                            s.balance < 0 ? "bg-destructive/10 text-destructive" :
                            "bg-muted text-muted-foreground"
                          }`}>
                            {s.memberName[0]}
                          </span>
                          <span className="font-medium">{s.memberName}</span>
                        </div>
                      </td>
                      <td className="p-3 text-right tabular-nums text-destructive">{bdt(s.charges.totalCharges)}</td>
                      <td className="p-3 text-right tabular-nums text-primary">{bdt(s.contributions.totalContribution)}</td>
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