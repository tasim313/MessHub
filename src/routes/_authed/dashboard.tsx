import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/PageHeader";
import { StatCard } from "@/components/app/StatCard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  useCollection,
  orderBy,
  type Member,
  type MealEntry,
  type Bazar,

  type Deposit,
  type Credit,
  type Payment,
  type Staff,
  type Room,
} from "@/lib/data";
import { computeMonthly } from "@/lib/calc";
import { ymKey, bdt } from "@/lib/format";
import { useMemo } from "react";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/types";
import type { MonthlyClosing, ExpenseAllocation, Expense, Advance, AdvanceRecovery, CreditNote, Refund } from "@/lib/types";
import { useAuth } from "@/lib/auth-context";
import {
  Utensils,
  Wallet,
  ShoppingBasket,
  TrendingUp,
  Users,
  ArrowUpRight,
  BellRing,
  UserRound,
  BedDouble,
  Banknote,
  DollarSign,
  PiggyBank,
  Receipt,
  Building2,
  Activity,
  ArrowDownRight,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
  AreaChart,
  Area,
} from "recharts";
import { motion } from "framer-motion";

export const Route = createFileRoute("/_authed/dashboard")({
  component: DashboardPage,
});

const CHART_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

function DashboardPage() {
  const ym = ymKey();
  const { profile, profileError } = useAuth();
  const { data: members } = useCollection<Member>("members");
  const { data: meals } = useCollection<MealEntry>("meals");
  const { data: bazar } = useCollection<Bazar>("bazar", [orderBy("createdAt", "desc")]);
  const { data: expenses } = useCollection<Expense>("expenses");
  const { data: deposits } = useCollection<Deposit>("deposits");
  const { data: credits } = useCollection<Credit>("credits");
  const { data: payments } = useCollection<Payment>("payments");
  const { data: staff } = useCollection<Staff>("staff");
  const { data: rooms } = useCollection<Room>("rooms");
  const { data: closings } = useCollection<MonthlyClosing>("monthly_closing", [orderBy("createdAt", "desc")]);
  const { data: allocations } = useCollection<ExpenseAllocation>("expense_allocations", [orderBy("createdAt", "desc")]);
  const { data: advances } = useCollection<Advance>("advances");
  const { data: advanceRecoveries } = useCollection<AdvanceRecovery>("advance_recoveries");
  const { data: creditNotes } = useCollection<CreditNote>("credit_notes");
  const { data: refunds } = useCollection<Refund>("refunds");

  const currentMember = useMemo(
    () =>
      members.find(
        (m) =>
          m.uid === profile?.uid ||
          (!!profile?.email && m.email === profile.email),
      ),
    [members, profile],
  );

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

  const summary = useMemo(
    () =>
      computeMonthly(
        ym,
        members,
        meals,
        bazar,
        expenses,
        deposits,
        credits,
        payments,
        staff,
        rooms,
        [],
        prevClosings,
        monthAllocations,
        advances,
        advanceRecoveries,
        closings,
        creditNotes,
        refunds,
      ),
    [
      ym,
      members,
      meals,
      bazar,
      expenses,
      deposits,
      credits,
      payments,
      staff,
      rooms,
      prevClosings,
      monthAllocations,
      advances,
      advanceRecoveries,
      closings,
      creditNotes,
      refunds,
    ],
  );

  // Use the correctly computed cashBalance from the engine
  const balance = summary.cashBalance;
  const mySummary = currentMember
    ? summary.perMember.find((item) => item.memberId === currentMember.id)
    : null;
  const myDeposits = deposits
    .filter((item) => item.memberId === currentMember?.id && item.ym === ym)
    .reduce((sum, item) => sum + item.amount, 0);
  const dueMembers = summary.perMember.filter((item) => item.balance < 0);
  const paidMembers = summary.perMember.filter((item) => item.balance >= 0);

  const expenseSplit = [
    { name: "Bazar", value: summary.totalBazar, color: "var(--chart-1)" },
    { name: "Utilities", value: summary.totalUtilities, color: "var(--chart-2)" },
    { name: "Salary", value: summary.totalStaffCost, color: "var(--chart-3)" },
  ];

  const incomeSplit = [
    { name: "Rent", value: summary.totalRent, color: "var(--chart-4)" },
    { name: "Deposits", value: summary.totalDeposits, color: "var(--chart-5)" },
  ];

  const trend = useMemo(() => {
    const days: Record<string, number> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const k = `${d.getMonth() + 1}/${d.getDate()}`;
      days[k] = 0;
    }
    bazar.forEach((entry) => {
      const d = new Date(entry.date);
      const diff = (Date.now() - d.getTime()) / 86400000;
      if (diff < 30 && diff >= 0) {
        const k = `${d.getMonth() + 1}/${d.getDate()}`;
        if (k in days) days[k] += entry.total;
      }
    });
    return Object.entries(days).map(([day, amount]) => ({ day, amount }));
  }, [bazar]);

  const utilityTrend = useMemo(() => {
    const byType: Record<string, number> = {};
    expenses.filter((e) => e.ym === ym).forEach((e) => {
      const label = EXPENSE_CATEGORY_LABELS[e.category] || e.category;
      byType[label] = (byType[label] || 0) + e.amount;
    });
    return Object.entries(byType).map(([name, value]) => ({ name, value }));
  }, [expenses, ym]);

  const activeCount = members.filter((m) => m.active).length;
  const totalBeds = rooms.reduce((sum, r) => sum + (r.totalBeds || 0), 0);
  const occupiedBeds = members.filter((m) => m.active && m.roomId).length;

  const serviceUsage = useMemo(() => {
    const counts: Record<string, number> = {
      rent: 0, meals: 0, internet: 0, electricity: 0, gas: 0, water: 0,
      cooking_staff: 0, cleaning_staff: 0, security_staff: 0, laundry: 0,
    };
    members.filter((m) => m.active).forEach((m) => {
      (m.services || []).forEach((s) => {
        if (s.enabled) counts[s.type] = (counts[s.type] || 0) + 1;
      });
    });
    return Object.entries(counts).map(([name, value]) => ({ name: name.replace(/_/g, " "), value }));
  }, [members]);

  const isOwnerOrManager = profile?.role === "owner" || profile?.role === "manager";

  return (
    <div>
      <PageHeader
        title={isOwnerOrManager ? "Owner Dashboard" : "My Dashboard"}
        description={`${ym} · ${activeCount} active members · ${occupiedBeds}/${totalBeds} beds filled`}
        action={
          <div className="flex gap-2">
            {isOwnerOrManager && (
              <Button asChild size="sm">
                <Link to="/bazar">Add Bazar</Link>
              </Button>
            )}
            <Button asChild size="sm" variant="outline">
              <Link to="/meals">Log Meal</Link>
            </Button>
          </div>
        }
      />
      <div className="p-6 space-y-6">
        {profileError && (
          <Card className="border-amber-500/40 bg-amber-500/5 p-4">
            <h3 className="font-semibold text-amber-700 dark:text-amber-300">Profile sync warning</h3>
            <p className="mt-1 text-sm text-muted-foreground">{profileError}</p>
          </Card>
        )}

        {/* KPI Row 1 - Core Metrics */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <StatCard
            label={isOwnerOrManager ? "Cash Balance" : "My Balance"}
            value={bdt(isOwnerOrManager ? balance : mySummary?.balance || 0)}
            icon={Wallet}
            tone={(isOwnerOrManager ? balance : mySummary?.balance || 0) >= 0 ? "primary" : "danger"}
            hint={isOwnerOrManager ? "Collections minus expenses" : (mySummary?.balance || 0) >= 0 ? "Advance" : "Due"}
          />
          <StatCard
            label={isOwnerOrManager ? "Total Expense" : "My Deposits"}
            value={bdt(isOwnerOrManager ? summary.totalExpense : myDeposits)}
            icon={Receipt}
            hint={isOwnerOrManager ? "Bazar + utilities + salary" : "This month"}
          />
          <StatCard
            label={isOwnerOrManager ? "Total Meals" : "My Meals"}
            value={String(isOwnerOrManager ? summary.totalMeals : mySummary?.meals || 0)}
            icon={Utensils}
            tone="primary"
            hint={`Rate ${bdt(summary.mealRate)}/meal`}
          />
          <StatCard
            label={isOwnerOrManager ? "Active Members" : "Utility Share"}
            value={isOwnerOrManager ? String(activeCount) : bdt(mySummary?.utilityShare || 0)}
            icon={isOwnerOrManager ? Users : BellRing}
            hint={isOwnerOrManager ? `${dueMembers.length} due · ${paidMembers.length} paid` : "This month"}
          />
        </motion.div>

        {/* KPI Row 2 - Owner/Manager KPIs */}
        {isOwnerOrManager && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Rent Receivable" value={bdt(summary.totalRent)} icon={Banknote} tone="primary" />
            <StatCard label="Total Due" value={bdt(summary.perMember.reduce((s, m) => s + Math.max(0, -m.balance), 0))} icon={DollarSign} tone="danger" hint={`${dueMembers.length} members`} />
            <StatCard label="Total Deposits" value={bdt(summary.totalDeposits)} icon={PiggyBank} tone="primary" hint="Collected this month" />
            <StatCard label="Staff Cost" value={bdt(summary.totalStaffCost)} icon={Users} hint={`${staff.filter((s) => s.status !== "inactive").length} active`} />
          </div>
        )}

        {/* KPI Row 2b - Member Overpayment & Underpayment */}
        {isOwnerOrManager && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Members Overpaid"
              value={bdt(summary.settlementSummary.totalReceivable)}
              icon={PiggyBank}
              tone="primary"
              hint="Held as member deposits"
            />
            <StatCard
              label="Members Underpaid"
              value={bdt(summary.settlementSummary.totalPayable)}
              icon={ArrowDownRight}
              tone="danger"
              hint="Outstanding from members"
            />
            <StatCard
              label="Members With Deposits"
              value={String(summary.settlementSummary.membersToReceive.length)}
              icon={Users}
              tone="primary"
              hint="Credit balance held for them"
            />
            <StatCard
              label="Members With Dues"
              value={String(summary.settlementSummary.membersToPay.length)}
              icon={Users}
              tone="danger"
              hint="Still need to pay"
            />
          </div>
        )}

        {/* KPI Row 3 - Owner only */}
        {profile?.role === "owner" && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Vacant Beds" value={String(Math.max(0, totalBeds - occupiedBeds))} icon={BedDouble} hint={`${occupiedBeds} occupied of ${totalBeds}`} />
            <StatCard label="Utility Cost" value={bdt(summary.totalUtilities)} icon={Building2} tone="warning" />
            <StatCard label="Meal Cost" value={bdt(summary.totalBazar)} icon={ShoppingBasket} />
            <StatCard label={balance >= 0 ? "Net Profit" : "Net Loss"} value={bdt(Math.abs(balance))} icon={Activity} tone={balance >= 0 ? "primary" : "danger"} />
          </div>
        )}

        {/* Charts Row */}
        <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
          {/* Bazar Trend */}
          <Card className="p-5 lg:col-span-2 xl:col-span-2">
            <div className="mb-4">
              <h3 className="font-semibold">Bazar Spending Trend</h3>
              <p className="text-xs text-muted-foreground">Last 30 days</p>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend}>
                  <defs>
                    <linearGradient id="bazarGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={10} interval="preserveStartEnd" />
                  <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                  <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }} />
                  <Area type="monotone" dataKey="amount" stroke="var(--primary)" fill="url(#bazarGradient)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Expense Split */}
          <Card className="p-5">
            <h3 className="font-semibold mb-1">Expense Split</h3>
            <p className="text-xs text-muted-foreground mb-4">This month</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={expenseSplit} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={3}>
                    {expenseSplit.map((item, i) => <Cell key={i} fill={item.color} />)}
                  </Pie>
                  <Legend />
                  <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        {/* Charts Row 2 */}
        <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
          {/* Utility Breakdown */}
          {utilityTrend.length > 0 && (
            <Card className="p-5">
              <h3 className="font-semibold mb-1">Utility Cost by Type</h3>
              <p className="text-xs text-muted-foreground mb-4">{ym}</p>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={utilityTrend} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis type="number" stroke="var(--muted-foreground)" fontSize={12} />
                    <YAxis dataKey="name" type="category" stroke="var(--muted-foreground)" fontSize={10} width={80} />
                    <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }} />
                    <Bar dataKey="value" fill="var(--chart-2)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          {/* Service Usage */}
          {serviceUsage.length > 0 && (
            <Card className="p-5">
              <h3 className="font-semibold mb-1">Service Subscriptions</h3>
              <p className="text-xs text-muted-foreground mb-4">Active members</p>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={serviceUsage}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={8} angle={-45} textAnchor="end" height={60} />
                    <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                    <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }} />
                    <Bar dataKey="value" fill="var(--chart-3)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          {/* Income vs Expense */}
          <Card className="p-5">
            <h3 className="font-semibold mb-1">Income vs Expense</h3>
            <p className="text-xs text-muted-foreground mb-4">This month comparison</p>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={[
                    { name: "Income", value: summary.totalRent + summary.totalDeposits, color: "var(--chart-1)" },
                    { name: "Expense", value: summary.totalExpense, color: "var(--chart-3)" },
                  ]} dataKey="value" nameKey="name" innerRadius={40} outerRadius={70} paddingAngle={5}>
                    {[
                      { name: "Income", value: summary.totalRent + summary.totalDeposits, color: "var(--chart-1)" },
                      { name: "Expense", value: summary.totalExpense, color: "var(--chart-3)" },
                    ].map((item, i) => <Cell key={i} fill={item.color} />)}
                  </Pie>
                  <Legend />
                  <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        {/* Member Balances (Owner/Manager) */}
        {isOwnerOrManager ? (
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold">Member Balances</h3>
                <p className="text-xs text-muted-foreground">Overview of all member dues and deposits</p>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link to="/members">Manage <ArrowUpRight className="ml-1 h-3.5 w-3.5" /></Link>
              </Button>
            </div>
            {summary.perMember.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Add members to see balances</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {summary.perMember.map((item) => (
                  <Card key={item.memberId} className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-foreground font-semibold uppercase">
                        {item.memberName[0]}
                      </div>
                      <div>
                        <div className="font-semibold">{item.memberName}</div>
                        <div className="text-xs text-muted-foreground">{item.meals} meals</div>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <div className="text-muted-foreground">Deposited</div>
                        <div className={`font-semibold ${item.deposited > 0 ? "text-primary" : ""}`}>{bdt(item.deposited)}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Due</div>
                        <div className="font-semibold">{bdt(item.totalDue)}</div>
                      </div>
                    </div>
                    <div className={`mt-4 rounded-lg px-3 py-2 text-sm font-semibold ${item.balance >= 0 ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>
                      {item.balance >= 0 ? "Advance" : "Outstanding"}: {bdt(Math.abs(item.balance))}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </Card>
        ) : (
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold">My Monthly Summary</h3>
                <p className="text-xs text-muted-foreground">Personal financial breakdown</p>
              </div>
              <UserRound className="h-5 w-5 text-muted-foreground" />
            </div>
            {!currentMember || !mySummary ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No linked member profile found. Ask the owner to link your account.
              </p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Card className="p-4">
                  <div className="text-xs uppercase text-muted-foreground">Rent</div>
                  <div className="mt-2 text-2xl font-bold">{bdt(mySummary.rentShare)}</div>
                </Card>
                <Card className="p-4">
                  <div className="text-xs uppercase text-muted-foreground">Meal Cost</div>
                  <div className="mt-2 text-2xl font-bold">{bdt(mySummary.mealCost)}</div>
                </Card>
                <Card className="p-4">
                  <div className="text-xs uppercase text-muted-foreground">Utility Share</div>
                  <div className="mt-2 text-2xl font-bold">{bdt(mySummary.utilityShare)}</div>
                </Card>
                <Card className="p-4">
                  <div className="text-xs uppercase text-muted-foreground">Staff Share</div>
                  <div className="mt-2 text-2xl font-bold">{bdt(mySummary.staffShare)}</div>
                </Card>
                <Card className="p-4">
                  <div className="text-xs uppercase text-muted-foreground">Deposited</div>
                  <div className="mt-2 text-2xl font-bold text-primary">{bdt(mySummary.deposited)}</div>
                </Card>
                <Card className="p-4">
                  <div className="text-xs uppercase text-muted-foreground">Total Due</div>
                  <div className="mt-2 text-2xl font-bold">{bdt(mySummary.totalDue)}</div>
                </Card>
                <Card className={`p-4 ${mySummary.balance >= 0 ? "bg-primary/10" : "bg-destructive/10"}`}>
                  <div className="text-xs uppercase text-muted-foreground">Balance</div>
                  <div className={`mt-2 text-2xl font-bold ${mySummary.balance >= 0 ? "text-primary" : "text-destructive"}`}>
                    {bdt(Math.abs(mySummary.balance))}
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="text-xs uppercase text-muted-foreground">My Meals</div>
                  <div className="mt-2 text-2xl font-bold">{mySummary.meals}</div>
                </Card>
              </div>
            )}
          </Card>
        )}

        {/* Recent Activity */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold">Recent Bazar Activity</h3>
              <p className="text-xs text-muted-foreground">Latest shared expense entries</p>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link to="/bazar">All <ArrowUpRight className="ml-1 h-3.5 w-3.5" /></Link>
            </Button>
          </div>
          {bazar.slice(0, 5).length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center flex flex-col items-center gap-2">
              <ShoppingBasket className="h-8 w-8 opacity-40" />
              No bazar entries yet
            </p>
          ) : (
            <div className="space-y-2">
              {bazar.slice(0, 5).map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <div className="font-medium text-sm">{item.category || "Bazar"} · {item.buyerName}</div>
                    <div className="text-xs text-muted-foreground">{item.date}</div>
                  </div>
                  <div className="font-semibold tabular-nums">{bdt(item.total)}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}