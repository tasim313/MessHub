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
import { useCollection, orderBy, type Member, type LedgerEntry } from "@/lib/data";
import { ymKey, bdt } from "@/lib/format";
import { calculateMonthlyStatement } from "@/lib/calculations/ledger";
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
    return calculateMonthlyStatement(
      member,
      ym,
      entries.filter((e) => e.ym === ym),
      rentCharges.filter((r) => r.month === ym),
      utilityAllocations,
      staffAllocations.filter((s) => s.month === ym),
    );
  }, [selectedMember, ym, members, entries, rentCharges, utilityAllocations, staffAllocations]);

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
                    Financial Statement — {statement.month}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {members.find((m) => m.id === selectedMember)?.name}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const rows = statement.transactions.map((t) => ({
                      Date: t.date,
                      Type: t.transactionType,
                      Category: t.category,
                      Amount: t.amount,
                      Balance: t.balance || 0,
                      Notes: t.notes || "",
                    }));
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
                  <div className="text-xs text-muted-foreground">Opening Balance</div>
                  <div className="text-xl font-bold">{bdt(statement.openingBalance)}</div>
                </div>
                <div className="rounded-lg bg-muted p-4">
                  <div className="text-xs text-muted-foreground">Total Charges</div>
                  <div className="text-xl font-bold">{bdt(statement.totalCharges)}</div>
                </div>
                <div className="rounded-lg bg-muted p-4">
                  <div className="text-xs text-muted-foreground">Total Payments</div>
                  <div className="text-xl font-bold">{bdt(statement.payments)}</div>
                </div>
                <div className={`rounded-lg p-4 ${statement.currentDue <= 0 ? "bg-primary/10" : "bg-destructive/10"}`}>
                  <div className="text-xs text-muted-foreground">Current Due</div>
                  <div className={`text-xl font-bold ${statement.currentDue <= 0 ? "text-primary" : "text-destructive"}`}>
                    {bdt(statement.currentDue)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
                <Card className="p-3">
                  <div className="text-xs text-muted-foreground">Rent</div>
                  <div className="font-semibold">{bdt(statement.rentCharge)}</div>
                </Card>
                <Card className="p-3">
                  <div className="text-xs text-muted-foreground">Meal</div>
                  <div className="font-semibold">{bdt(statement.mealCharge)}</div>
                </Card>
                <Card className="p-3">
                  <div className="text-xs text-muted-foreground">Utility</div>
                  <div className="font-semibold">{bdt(statement.utilityCharge)}</div>
                </Card>
                <Card className="p-3">
                  <div className="text-xs text-muted-foreground">Staff</div>
                  <div className="font-semibold">{bdt(statement.staffCharge)}</div>
                </Card>
                <Card className="p-3">
                  <div className="text-xs text-muted-foreground">Deposits</div>
                  <div className="font-semibold">{bdt(statement.deposits)}</div>
                </Card>
              </div>
            </Card>

            <Card className="p-5">
              <h3 className="font-semibold mb-4">Transactions</h3>
              {statement.transactions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No transactions for this month</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs uppercase text-muted-foreground bg-muted/50">
                      <tr>
                        <th className="text-left p-3 font-medium">Date</th>
                        <th className="text-left p-3 font-medium">Type</th>
                        <th className="text-left p-3 font-medium">Category</th>
                        <th className="text-left p-3 font-medium">Notes</th>
                        <th className="text-right p-3 font-medium">Amount</th>
                        <th className="text-right p-3 font-medium">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statement.transactions.map((t, i) => (
                        <tr key={i} className="border-t hover:bg-muted/30">
                          <td className="p-3">{t.date}</td>
                          <td className="p-3">
                            <Badge variant="outline" className="capitalize">
                              {t.transactionType}
                            </Badge>
                          </td>
                          <td className="p-3 capitalize">{t.category}</td>
                          <td className="p-3 text-muted-foreground max-w-xs truncate">{t.notes || "—"}</td>
                          <td className={`p-3 text-right tabular-nums font-semibold ${
                            t.transactionType === "deposit" || t.transactionType === "payment" || t.transactionType === "credit"
                              ? "text-primary" : "text-destructive"
                          }`}>
                            {bdt(t.amount)}
                          </td>
                          <td className="p-3 text-right tabular-nums">{bdt(t.balance || 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
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