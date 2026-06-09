import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMemo, useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { useCollection, orderBy, type Member, type LedgerEntry, type MealEntry, type Bazar, type Deposit, type Credit, type Payment, type Staff, type Room } from "@/lib/data";
import type { Expense } from "@/lib/types";
import { ymKey, bdt } from "@/lib/format";
import { calculateMemberSettlement } from "@/lib/calculations/engine";
import { BookText, FileDown } from "lucide-react";
import { exportToCSV } from "@/lib/export";
import type { RentCharge, UtilityAllocation, StaffAllocation } from "@/lib/types";

export const Route = createFileRoute("/_authed/ledger")({
  component: LedgerPage,
});

function LedgerPage() {
  const { profile } = useAuth();
  const [ym, setYm] = useState(ymKey());
  const [selectedMember, setSelectedMember] = useState<string>("");
  const { data: members } = useCollection<Member>("members");
  const { data: entries } = useCollection<LedgerEntry>("ledgers", [orderBy("date", "desc")]);
  const { data: meals } = useCollection<MealEntry>("meals");
  const { data: bazar } = useCollection<Bazar>("bazar");
  const { data: expenses } = useCollection<Expense>("expenses");
  const { data: deposits } = useCollection<Deposit>("deposits");
  const { data: credits } = useCollection<Credit>("credits");
  const { data: payments } = useCollection<Payment>("payments");
  const { data: staff } = useCollection<Staff>("staff");
  const { data: rooms } = useCollection<Room>("rooms");
  const { data: rentCharges } = useCollection<RentCharge>("rent_charges");
  const { data: utilityAllocations } = useCollection<UtilityAllocation>("utility_allocations");
  const { data: staffAllocations } = useCollection<StaffAllocation>("staff_allocations");

  const memberOptions = useMemo(() => {
    if (profile?.role === "member") {
      const m = members.find((m) => m.uid === profile.uid);
      return m ? [m] : [];
    }
    return members.filter((m) => m.active).sort((a, b) => a.name.localeCompare(b.name));
  }, [members, profile]);

  useEffect(() => {
    if (profile?.role === "member" && memberOptions.length > 0 && !selectedMember) {
      setSelectedMember(memberOptions[0].id);
    }
  }, [memberOptions, profile, selectedMember]);

  const statement = useMemo(() => {
    if (!selectedMember) return null;
    const member = members.find((m) => m.id === selectedMember);
    if (!member) return null;
    const activeMembers = members.filter((m) => m.active);
    return calculateMemberSettlement(
      member,
      ym,
      meals,
      bazar,
      deposits,
      credits,
      payments,
      entries,
      expenses,
      activeMembers,
      rooms,
      staff,
    );
  }, [selectedMember, ym, members, entries, meals, bazar, expenses, deposits, credits, payments, rooms, staff]);

  if (!profile) return null;

  return (
    <div>
      <PageHeader
        title="Member Ledger"
        description="Monthly financial statement per member"
      />
      <div className="p-6 space-y-6">
        <div className="flex flex-wrap gap-4">
          <div className="space-y-2">
            <Label>Month</Label>
            <Input type="month" value={ym} onChange={(e) => setYm(e.target.value)} className="w-44" />
          </div>
          <div className="space-y-2">
            <Label>Member</Label>
            <Select value={selectedMember} onValueChange={setSelectedMember}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Select member" />
              </SelectTrigger>
              <SelectContent>
                {memberOptions.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {!selectedMember ? (
          <Card className="p-12 text-center text-muted-foreground">
            <BookText className="h-10 w-10 mx-auto opacity-40 mb-3" />
            Select a member and month to view statement
          </Card>
        ) : statement ? (
          <>
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-lg">
                    Financial Statement — {ym}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {members.find((m) => m.id === selectedMember)?.name}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const rows = [
                      { Date: ym + "-01", Type: "Opening", Category: "Balance", Amount: 0, Balance: statement.balance - statement.contributions.totalContribution + statement.charges.totalCharges, Notes: "Opening balance" },
                      ...Object.entries(statement.charges.expenseShareBreakdown).map(([cat, amount]) => ({
                        Date: ym + "-01", Type: "Expense Share", Category: cat, Amount: amount, Balance: 0, Notes: `Shared expense: ${cat}`,
                      })),
                      { Date: ym + "-01", Type: "Meal Charge", Category: "meal", Amount: statement.charges.mealCost, Balance: 0, Notes: `Meals: ${statement.totalMeals} × ${bdt(statement.mealRate)}` },
                      { Date: ym + "-01", Type: "Rent Charge", Category: "rent", Amount: statement.charges.rentShare, Balance: 0, Notes: "Rent share" },
                      { Date: ym + "-01", Type: "Staff Charge", Category: "staff", Amount: statement.charges.staffShare, Balance: 0, Notes: "Staff share" },
                      ...Object.entries(statement.contributions.expenseBreakdown).map(([cat, amount]) => ({
                        Date: ym + "-01", Type: "Expense Contribution", Category: cat, Amount: amount, Balance: 0, Notes: `Paid shared expense: ${cat}`,
                      })),
                      { Date: ym + "-01", Type: "Bazar Contribution", Category: "bazar", Amount: statement.contributions.bazarContribution, Balance: 0, Notes: "Bazar paid" },
                      { Date: ym + "-01", Type: "Payment", Category: "payment", Amount: statement.contributions.paymentsMade, Balance: 0, Notes: "Payments made" },
                      { Date: ym + "-01", Type: "Settlement", Category: "settlement", Amount: statement.balance, Balance: statement.balance, Notes: `Net balance: ${statement.settlementStatus}` },
                    ];
                    exportToCSV(
                      rows as unknown as Record<string, unknown>[],
                      `ledger-${selectedMember}-${ym}`,
                    );
                  }}
                >
                  <FileDown className="h-4 w-4 mr-1" />
                  Export CSV
                </Button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="rounded-lg bg-muted p-4">
                  <div className="text-xs text-muted-foreground">Total Charges</div>
                  <div className="text-xl font-bold text-destructive">{bdt(statement.charges.totalCharges)}</div>
                </div>
                <div className="rounded-lg bg-muted p-4">
                  <div className="text-xs text-muted-foreground">Total Contributions</div>
                  <div className="text-xl font-bold text-primary">{bdt(statement.contributions.totalContribution)}</div>
                </div>
                <div className="rounded-lg bg-muted p-4">
                  <div className="text-xs text-muted-foreground">Net Balance</div>
                  <div className={`text-xl font-bold ${statement.balance >= 0 ? "text-primary" : "text-destructive"}`}>
                    {bdt(statement.balance)}
                  </div>
                </div>
                <div className={`rounded-lg p-4 ${statement.settlementStatus === "settled" ? "bg-primary/10" : statement.settlementStatus === "receive" ? "bg-green-500/10" : "bg-destructive/10"}`}>
                  <div className="text-xs text-muted-foreground">Status</div>
                  <div className={`text-xl font-bold ${statement.settlementStatus === "settled" ? "text-primary" : statement.settlementStatus === "receive" ? "text-green-600" : "text-destructive"}`}>
                    {statement.settlementStatus === "receive" ? `Mess Owes ${bdt(statement.receivableAmount)}` :
                     statement.settlementStatus === "pay" ? `Owes Mess ${bdt(statement.payableAmount)}` :
                     "Settled"}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
                <Card className="p-3">
                  <div className="text-xs text-muted-foreground">Meal Cost</div>
                  <div className="font-semibold">{bdt(statement.charges.mealCost)}</div>
                </Card>
                <Card className="p-3">
                  <div className="text-xs text-muted-foreground">Rent Share</div>
                  <div className="font-semibold">{bdt(statement.charges.rentShare)}</div>
                </Card>
                <Card className="p-3">
                  <div className="text-xs text-muted-foreground">Expense Shares</div>
                  <div className="font-semibold">{bdt(statement.charges.expenseShares)}</div>
                </Card>
                <Card className="p-3">
                  <div className="text-xs text-muted-foreground">Staff Share</div>
                  <div className="font-semibold">{bdt(statement.charges.staffShare)}</div>
                </Card>
                <Card className="p-3">
                  <div className="text-xs text-muted-foreground">Deposit</div>
                  <div className="font-semibold text-primary">{bdt(statement.totalDeposit)}</div>
                </Card>
                <Card className="p-3">
                  <div className="text-xs text-muted-foreground">Credit</div>
                  <div className="font-semibold text-destructive">{bdt(statement.totalCredit)}</div>
                </Card>
              </div>
            </Card>

            <Card className="p-5">
              <h3 className="font-semibold mb-4">Settlement Breakdown</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase text-muted-foreground bg-muted/50">
                    <tr>
                      <th className="text-left p-3 font-medium">Category</th>
                      <th className="text-right p-3 font-medium">Charges</th>
                      <th className="text-right p-3 font-medium">Contributions</th>
                      <th className="text-right p-3 font-medium">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t">
                      <td className="p-3 font-medium">Meals</td>
                      <td className="p-3 text-right tabular-nums text-destructive">{bdt(statement.charges.mealCost)}</td>
                      <td className="p-3 text-right tabular-nums">—</td>
                      <td className="p-3 text-right tabular-nums font-bold text-destructive">{bdt(-statement.charges.mealCost)}</td>
                    </tr>
                    <tr className="border-t">
                      <td className="p-3 font-medium">Rent</td>
                      <td className="p-3 text-right tabular-nums text-destructive">{bdt(statement.charges.rentShare)}</td>
                      <td className="p-3 text-right tabular-nums">—</td>
                      <td className="p-3 text-right tabular-nums font-bold text-destructive">{bdt(-statement.charges.rentShare)}</td>
                    </tr>
                    {Object.entries(statement.charges.expenseShareBreakdown).map(([cat, amount]) => (
                      <tr key={cat} className="border-t">
                        <td className="p-3 font-medium">{cat.replace(/_/g, " ")}</td>
                        <td className="p-3 text-right tabular-nums text-destructive">{bdt(amount)}</td>
                        <td className="p-3 text-right tabular-nums">—</td>
                        <td className="p-3 text-right tabular-nums font-bold text-destructive">{bdt(-amount)}</td>
                      </tr>
                    ))}
                    <tr className="border-t">
                      <td className="p-3 font-medium">Staff</td>
                      <td className="p-3 text-right tabular-nums text-destructive">{bdt(statement.charges.staffShare)}</td>
                      <td className="p-3 text-right tabular-nums">—</td>
                      <td className="p-3 text-right tabular-nums font-bold text-destructive">{bdt(-statement.charges.staffShare)}</td>
                    </tr>
                    <tr className="border-t bg-muted/30">
                      <td className="p-3 font-bold">Total Charges</td>
                      <td className="p-3 text-right tabular-nums font-bold text-destructive">{bdt(statement.charges.totalCharges)}</td>
                      <td className="p-3 text-right tabular-nums">—</td>
                      <td className="p-3 text-right tabular-nums font-bold text-destructive">{bdt(-statement.charges.totalCharges)}</td>
                    </tr>
                    {Object.entries(statement.contributions.expenseBreakdown).map(([cat, amount]) => (
                      <tr key={cat} className="border-t">
                        <td className="p-3 font-medium">{cat.replace(/_/g, " ")} Paid</td>
                        <td className="p-3 text-right tabular-nums">—</td>
                        <td className="p-3 text-right tabular-nums text-primary">{bdt(amount)}</td>
                        <td className="p-3 text-right tabular-nums font-bold text-primary">{bdt(amount)}</td>
                      </tr>
                    ))}
                    {statement.contributions.bazarContribution > 0 && (
                      <tr className="border-t">
                        <td className="p-3 font-medium">Bazar Paid</td>
                        <td className="p-3 text-right tabular-nums">—</td>
                        <td className="p-3 text-right tabular-nums text-primary">{bdt(statement.contributions.bazarContribution)}</td>
                        <td className="p-3 text-right tabular-nums font-bold text-primary">{bdt(statement.contributions.bazarContribution)}</td>
                      </tr>
                    )}
                    {statement.contributions.paymentsMade > 0 && (
                      <tr className="border-t">
                        <td className="p-3 font-medium">Payments Made</td>
                        <td className="p-3 text-right tabular-nums">—</td>
                        <td className="p-3 text-right tabular-nums text-primary">{bdt(statement.contributions.paymentsMade)}</td>
                        <td className="p-3 text-right tabular-nums font-bold text-primary">{bdt(statement.contributions.paymentsMade)}</td>
                      </tr>
                    )}
                    <tr className="border-t bg-muted/30">
                      <td className="p-3 font-bold">Total Contributions</td>
                      <td className="p-3 text-right tabular-nums">—</td>
                      <td className="p-3 text-right tabular-nums font-bold text-primary">{bdt(statement.contributions.totalContribution)}</td>
                      <td className="p-3 text-right tabular-nums font-bold text-primary">{bdt(statement.contributions.totalContribution)}</td>
                    </tr>
                    <tr className="border-t bg-primary/5">
                      <td className="p-3 font-bold text-lg">Net Balance</td>
                      <td className="p-3 text-right tabular-nums font-bold text-destructive">{bdt(-statement.charges.totalCharges)}</td>
                      <td className="p-3 text-right tabular-nums font-bold text-primary">{bdt(statement.contributions.totalContribution)}</td>
                      <td className={`p-3 text-right tabular-nums font-bold text-lg ${statement.balance >= 0 ? "text-primary" : "text-destructive"}`}>
                        {bdt(statement.balance)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        ) : (
          <Card className="p-12 text-center text-muted-foreground">
            No data available for this month
          </Card>
        )}
      </div>
    </div>
  );
}