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
  ArrowUpRight, TrendingUp, TrendingDown,
} from "lucide-react";
import { toast } from "sonner";
import type { Deposit, Credit, Payment, Expense } from "@/lib/types";
import { calculateAllSettlements, getSettlementSummary, type MemberSettlement } from "@/lib/calculations/engine";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/deposits")({
  component: DepositsPage,
});

type FilterMode = "month" | "date_range" | "all";

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

  // ────────────────────────────────────────────
  // Filters
  // ────────────────────────────────────────────
  const [filterMonth, setFilterMonth] = useState(() => ymKey());
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(true);

  // Sync ym with filterMonth
  const currentYm = filterMonth;

  // Compute settlements with unified formula
  const settlements = useMemo(() => {
    const monthExpenses = expenses.filter((e) => e.ym === currentYm);
    return calculateAllSettlements(
      members, currentYm, meals, bazar, deposits, credits,
      payments, ledgers, monthExpenses, rooms, staff,
    );
  }, [currentYm, members, meals, bazar, expenses, deposits, credits, payments, ledgers, rooms, staff]);

  // ────────────────────────────────────────────
  // Filter Logic
  // ────────────────────────────────────────────
  const filteredSettlements = useMemo(() => {
    let result = [...settlements];

    // Status filter
    if (filterStatus === "receive") {
      result = result.filter((s) => s.balance > 0);
    } else if (filterStatus === "pay") {
      result = result.filter((s) => s.balance < 0);
    } else if (filterStatus === "settled") {
      result = result.filter((s) => s.balance === 0);
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((s) => {
        const searchable = [
          s.memberName,
          s.settlementStatus,
          s.contributions.bazarContribution.toString(),
          s.charges.totalCharges.toString(),
          s.balance.toString(),
          s.depositSource || "",
          s.creditReason || "",
        ].join(" ").toLowerCase();
        return searchable.includes(q);
      });
    }

    // Sort: positive balance (receivable) first, then by amount descending
    return result.sort((a, b) => b.balance - a.balance);
  }, [settlements, filterStatus, searchQuery]);

  // Members with positive balance (receivable)
  const membersWithDeposits = useMemo(() => {
    return filteredSettlements.filter((s) => s.balance > 0);
  }, [filteredSettlements]);

  // Summary stats
  const depositSummary = useMemo(() => {
    const totalDeposit = membersWithDeposits.reduce((sum, s) => sum + s.balance, 0);
    const totalContributions = membersWithDeposits.reduce((sum, s) => sum + s.contributions.totalContribution, 0);
    const totalCharges = membersWithDeposits.reduce((sum, s) => sum + s.charges.totalCharges, 0);
    return { totalDeposit, totalContributions, totalCharges };
  }, [membersWithDeposits]);

  // All settlements summary
  const allSummary = useMemo(() => {
    return getSettlementSummary(settlements);
  }, [settlements]);

  const totalManualDeposits = deposits.filter((d) => d.ym === currentYm).reduce((s, d) => s + d.amount, 0);
  const activeCount = members.filter((m) => m.active).length;

  const resetFilters = () => {
    setFilterMonth(ymKey());
    setSearchQuery("");
    setFilterStatus("all");
  };

  const hasActiveFilters = filterMonth !== ymKey() || searchQuery.trim() !== "" || filterStatus !== "all";

  return (
    <div>
      <PageHeader
        title="Members To Receive From Mess"
        description={`${currentYm} · ${membersWithDeposits.length} members with deposits totaling ${bdt(depositSummary.totalDeposit)}`}
        action={
          <div className="flex items-center gap-2">
            <Input
              type="month"
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
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
        {/* SEARCH + FILTER BAR */}
        {/* ──────────────────────────────────────────── */}
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by member name, amount, status..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Quick Month Selector */}
            <Input
              type="month"
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="w-44"
            />

            {/* Filter Toggle Button */}
            <Button
              variant={showFilters ? "default" : "outline"}
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="gap-1.5"
            >
              <Filter className="h-4 w-4" />
              Filters
              {filterStatus !== "all" && (
                <span className="ml-1 h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
                  1
                </span>
              )}
            </Button>

            {/* Reset Filters */}
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={resetFilters} className="gap-1.5 text-muted-foreground">
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </Button>
            )}
          </div>

          {/* Expanded Filter Options */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <Label className="text-sm font-medium whitespace-nowrap">Status:</Label>
                <div className="flex gap-2">
                  <Button
                    variant={filterStatus === "all" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFilterStatus("all")}
                  >
                    All
                  </Button>
                  <Button
                    variant={filterStatus === "receive" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFilterStatus("receive")}
                    className="gap-1"
                  >
                    <TrendingUp className="h-3.5 w-3.5" />
                    Receive
                  </Button>
                  <Button
                    variant={filterStatus === "pay" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFilterStatus("pay")}
                    className="gap-1"
                  >
                    <TrendingDown className="h-3.5 w-3.5" />
                    Pay
                  </Button>
                  <Button
                    variant={filterStatus === "settled" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFilterStatus("settled")}
                  >
                    Settled
                  </Button>
                </div>
              </div>

              {/* Active Filters Summary */}
              {hasActiveFilters && (
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium">Active filters:</span>
                  {filterMonth !== ymKey() && <Badge variant="secondary" className="text-xs">Month: {filterMonth}</Badge>}
                  {filterStatus !== "all" && <Badge variant="secondary" className="text-xs capitalize">Status: {filterStatus}</Badge>}
                  {searchQuery.trim() && <Badge variant="secondary" className="text-xs">Search: "{searchQuery}"</Badge>}
                </div>
              )}
            </div>
          )}
        </Card>

        {/* ──────────────────────────────────────────── */}
        {/* DEPOSIT MEMBERS TABLE (ERP-Style) */}
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
            <span className="text-sm text-muted-foreground">{currentYm}</span>
          </div>

          {membersWithDeposits.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <Wallet className="h-10 w-10 mx-auto opacity-40 mb-3" />
              <p className="font-medium">
                {settlements.length === 0 ? "No data for this month" : "No members have deposits this month"}
              </p>
              <p className="text-sm mt-1">
                {settlements.length === 0
                  ? "Add members and expenses to see settlements."
                  : "Try adjusting your filters or selecting a different month."}
              </p>
              {settlements.length > 0 && (
                <Button variant="outline" size="sm" onClick={resetFilters} className="mt-4 gap-1.5">
                  <RotateCcw className="h-3.5 w-3.5" />
                  Clear Filters
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
                        <td className="p-3 text-xs text-muted-foreground max-w-[250px] truncate" title={reason}>
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

        {/* ──────────────────────────────────────────── */}
        {/* ALL MEMBERS SETTLEMENT SUMMARY */}
        {/* ──────────────────────────────────────────── */}
        <Card className="overflow-hidden">
          <div className="p-4 border-b bg-muted/30">
            <h3 className="font-semibold">All Members Settlement Summary</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Complete settlement status for all active members in {currentYm}
            </p>
          </div>

          {settlements.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <p className="font-medium">No data for this month</p>
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
                  {filteredSettlements.map((s) => (
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
                <tfoot className="font-semibold bg-muted/30 border-t-2">
                  <tr>
                    <td className="p-3">Total ({filteredSettlements.length} members)</td>
                    <td className="p-3 text-right text-destructive">{bdt(allSummary.totalMealCost)}</td>
                    <td className="p-3 text-right text-primary">{bdt(allSummary.totalBazarPaid)}</td>
                    <td className={`p-3 text-right ${allSummary.totalBalance >= 0 ? "text-primary" : "text-destructive"}`}>
                      {bdt(allSummary.totalBalance)}
                    </td>
                    <td className="p-3 text-center text-xs">
                      {allSummary.membersToReceive.length} receive · {allSummary.membersToPay.length} pay · {allSummary.settledMembers.length} settled
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}