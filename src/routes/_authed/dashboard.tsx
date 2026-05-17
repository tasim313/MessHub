import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/PageHeader";
import { StatCard } from "@/components/app/StatCard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useCollection, orderBy, type Member, type MealEntry, type Bazar, type Utility, type Deposit } from "@/lib/data";
import { computeMonthly } from "@/lib/calc";
import { ymKey, bdt } from "@/lib/format";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  Utensils, Wallet, ShoppingBasket, TrendingUp, Users, ArrowUpRight, BellRing, UserRound,
} from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";
import { motion } from "framer-motion";

export const Route = createFileRoute("/_authed/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const ym = ymKey();
  const { profile, profileError } = useAuth();
  const { data: members } = useCollection<Member>("members");
  const { data: meals } = useCollection<MealEntry>("meals");
  const { data: bazar } = useCollection<Bazar>("bazar", [orderBy("createdAt", "desc")]);
  const { data: utilities } = useCollection<Utility>("utilities");
  const { data: deposits } = useCollection<Deposit>("deposits");

  const currentMember = useMemo(
    () => members.find((member) => member.uid === profile?.uid || (!!profile?.email && member.email === profile.email)),
    [members, profile]
  );

  const summary = useMemo(
    () => computeMonthly(ym, members, meals, bazar, utilities, deposits),
    [ym, members, meals, bazar, utilities, deposits]
  );

  const balance = summary.totalDeposits - summary.totalExpense;
  const mySummary = currentMember
    ? summary.perMember.find((item) => item.memberId === currentMember.id)
    : null;
  const myDeposits = deposits
    .filter((item) => item.memberId === currentMember?.id && item.ym === ym)
    .reduce((sum, item) => sum + item.amount, 0);
  const dueMembers = summary.perMember.filter((item) => item.balance < 0);

  const expenseSplit = [
    { name: "Bazar", value: summary.totalBazar, color: "var(--chart-1)" },
    { name: "Utilities", value: summary.totalUtilities, color: "var(--chart-2)" },
  ];

  const trend = useMemo(() => {
    const days: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const k = `${d.getMonth() + 1}/${d.getDate()}`;
      days[k] = 0;
    }
    bazar.forEach((entry) => {
      const d = new Date(entry.date);
      const diff = (Date.now() - d.getTime()) / 86400000;
      if (diff < 7 && diff >= 0) {
        const k = `${d.getMonth() + 1}/${d.getDate()}`;
        if (k in days) days[k] += entry.total;
      }
    });
    return Object.entries(days).map(([day, amount]) => ({ day, amount }));
  }, [bazar]);

  const isOwnerOrManager = profile?.role === "owner" || profile?.role === "manager";

  return (
    <div>
      <PageHeader
        title={isOwnerOrManager ? "Mess dashboard" : "My dashboard"}
        description={`Live summary for ${ym}`}
        action={
          <div className="flex gap-2">
            {isOwnerOrManager && <Button asChild size="sm"><Link to="/bazar">Add Bazar</Link></Button>}
            <Button asChild size="sm" variant="outline"><Link to="/meals">Log Meal</Link></Button>
          </div>
        }
      />
      <div className="p-6 space-y-6">
        {profileError && (
          <Card className="border-amber-500/40 bg-amber-500/5 p-4">
            <h3 className="font-semibold text-amber-700 dark:text-amber-300">Profile sync warning</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Dashboard loaded, but Firebase profile sync had an issue: {profileError}
            </p>
          </Card>
        )}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <StatCard label={isOwnerOrManager ? "Current Balance" : "My Balance"} value={bdt(isOwnerOrManager ? balance : mySummary?.balance || 0)} icon={Wallet} tone={(isOwnerOrManager ? balance : mySummary?.balance || 0) >= 0 ? "primary" : "danger"} hint={(isOwnerOrManager ? balance : mySummary?.balance || 0) >= 0 ? "Up to date" : "Payment needed"} />
          <StatCard label={isOwnerOrManager ? "Total Expense" : "My Deposits"} value={bdt(isOwnerOrManager ? summary.totalExpense : myDeposits)} icon={TrendingUp} hint={isOwnerOrManager ? "Bazar + utilities" : "This month"} />
          <StatCard label={isOwnerOrManager ? "Monthly Meals" : "My Meals"} value={String(isOwnerOrManager ? summary.totalMeals : mySummary?.meals || 0)} icon={Utensils} tone="primary" hint={`Meal rate ${bdt(summary.mealRate)}`} />
          <StatCard label={isOwnerOrManager ? "Active Members" : "Utility Share"} value={isOwnerOrManager ? String(members.filter((member) => member.active).length) : bdt(mySummary?.utilityShare || 0)} icon={isOwnerOrManager ? Users : BellRing} hint={isOwnerOrManager ? `${dueMembers.length} members due` : "This month"} />
        </motion.div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="p-5 lg:col-span-2">
            <div className="mb-4">
              <h3 className="font-semibold">Bazar trend</h3>
              <p className="text-xs text-muted-foreground">Last 7 days spending</p>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={12} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                  <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }} />
                  <Bar dataKey="amount" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card className="p-5">
            <h3 className="font-semibold mb-1">Expense split</h3>
            <p className="text-xs text-muted-foreground mb-4">This month</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={expenseSplit} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={3}>
                    {expenseSplit.map((item, index) => <Cell key={index} fill={item.color} />)}
                  </Pie>
                  <Legend />
                  <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        {isOwnerOrManager ? (
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold">Member balances</h3>
                <p className="text-xs text-muted-foreground">Owner can monitor every member dashboard summary</p>
              </div>
              <Button asChild variant="ghost" size="sm"><Link to="/members">Manage members <ArrowUpRight className="ml-1 h-3.5 w-3.5"/></Link></Button>
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
                        <div className="text-xs text-muted-foreground">{item.meals} meals this month</div>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <div className="text-muted-foreground">Deposited</div>
                        <div className="font-semibold">{bdt(item.deposited)}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Total due</div>
                        <div className="font-semibold">{bdt(item.totalDue)}</div>
                      </div>
                    </div>
                    <div className={`mt-4 rounded-lg px-3 py-2 text-sm font-semibold ${item.balance >= 0 ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>
                      {item.balance >= 0 ? "Advance balance" : "Outstanding due"}: {bdt(Math.abs(item.balance))}
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
                <h3 className="font-semibold">My monthly summary</h3>
                <p className="text-xs text-muted-foreground">Personal meal, deposit, and due details</p>
              </div>
              <UserRound className="h-5 w-5 text-muted-foreground" />
            </div>
            {!currentMember || !mySummary ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Your account is signed in, but no linked member profile was found yet. Ask the owner to update your member email or uid.
              </p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Card className="p-4">
                  <div className="text-xs uppercase text-muted-foreground">Meal cost</div>
                  <div className="mt-2 text-2xl font-bold">{bdt(mySummary.mealCost)}</div>
                </Card>
                <Card className="p-4">
                  <div className="text-xs uppercase text-muted-foreground">Utility share</div>
                  <div className="mt-2 text-2xl font-bold">{bdt(mySummary.utilityShare)}</div>
                </Card>
                <Card className="p-4">
                  <div className="text-xs uppercase text-muted-foreground">Deposited</div>
                  <div className="mt-2 text-2xl font-bold">{bdt(mySummary.deposited)}</div>
                </Card>
                <Card className="p-4">
                  <div className="text-xs uppercase text-muted-foreground">Final due</div>
                  <div className={`mt-2 text-2xl font-bold ${mySummary.balance >= 0 ? "text-primary" : "text-destructive"}`}>{bdt(Math.abs(mySummary.balance))}</div>
                </Card>
              </div>
            )}
          </Card>
        )}

        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold">Recent bazar</h3>
              <p className="text-xs text-muted-foreground">Latest shared expense activity</p>
            </div>
            <Button asChild variant="ghost" size="sm"><Link to="/bazar">All <ArrowUpRight className="ml-1 h-3.5 w-3.5"/></Link></Button>
          </div>
          {bazar.slice(0, 5).length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center flex flex-col items-center gap-2"><ShoppingBasket className="h-8 w-8 opacity-40"/>No bazar entries yet</p>
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
