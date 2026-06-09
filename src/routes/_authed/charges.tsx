import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useMemo, useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  useCollection,
  addDocTo,
  updateDocIn,
  deleteDocFrom,
  orderBy,
  type Member,
  type Room,
  type LedgerEntry,
  type MealEntry,
  type Bazar,
} from "@/lib/data";
import { ymKey, bdt } from "@/lib/format";
import {
  Receipt, DollarSign, Users, Building2, Trash2, Loader2, ArrowUpDown,
  UserRound, BedDouble, CreditCard, PiggyBank, BadgePercent,
} from "lucide-react";
import { toast } from "sonner";
import { submitChangeRequest } from "@/lib/workflow";
import type { Deposit, Credit, Payment, Expense, ServiceType, MonthlyClosing } from "@/lib/types";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/types";
import { calculateMemberSettlement } from "@/lib/calculations/engine";
import { isMemberSubscribedToService, getPerBedRent } from "@/lib/calc";
import { checkLedgerChargeExists } from "@/lib/duplicate-check";

export const Route = createFileRoute("/_authed/charges")({
  component: ChargesPage,
});

// Service type to display name mapping
const SERVICE_LABELS: Record<ServiceType, string> = {
  rent: "Rent",
  meals: "Meals",
  internet: "Internet",
  electricity: "Electricity",
  gas: "Gas",
  water: "Water",
  cooking_staff: "Cooking Staff",
  cleaning_staff: "Cleaning Staff",
  security_staff: "Security Staff",
  laundry: "Laundry",
  parking: "Parking",
  generator: "Generator",
  maintenance: "Maintenance",
  other_services: "Other Services",
};

const METHODS = ["Cash", "bKash", "Nagad", "Rocket", "Bank"];

function ChargesPage() {
  const { profile } = useAuth();
  const [ym, setYm] = useState(ymKey());
  const [selectedMember, setSelectedMember] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const { data: members } = useCollection<Member>("members");
  const { data: rooms } = useCollection<Room>("rooms");
  const { data: expenses } = useCollection<Expense>("expenses", [orderBy("date", "desc")]);
  const { data: meals } = useCollection<MealEntry>("meals", [orderBy("date", "desc")]);
  const { data: bazar } = useCollection<Bazar>("bazar", [orderBy("date", "desc")]);
  const { data: ledgers } = useCollection<LedgerEntry>("ledgers", [orderBy("date", "desc")]);
  const { data: payments } = useCollection<Payment>("payments", [orderBy("date", "desc")]);
  const { data: deposits } = useCollection<Deposit>("deposits", [orderBy("date", "desc")]);
  const { data: credits } = useCollection<Credit>("credits", [orderBy("date", "desc")]);
  const { data: closings } = useCollection<MonthlyClosing>("monthly_closing", [orderBy("createdAt", "desc")]);

  const activeMembers = useMemo(
    () => members.filter((m) => m.active).sort((a, b) => a.name.localeCompare(b.name)),
    [members]
  );

  useEffect(() => {
    if (activeMembers.length > 0 && !selectedMember) {
      setSelectedMember(activeMembers[0].id);
    }
  }, [activeMembers, selectedMember]);

  const currentMember = members.find((m) => m.id === selectedMember);
  const currentRoom = rooms.find((r) => r.id === currentMember?.roomId);

  // Month-specific data
  const monthExpenses = expenses.filter((e) => e.ym === ym);
  const monthPayments = payments.filter((p) => p.ym === ym);

  // Get active services for the current member
  const activeServices = useMemo(() => {
    if (!currentMember?.services) return [];
    return currentMember.services.filter((s) => s.enabled).map((s) => s.type);
  }, [currentMember]);

  // ============================================================================
  // CARRY FORWARD: Get previous month's closing data for deposit/credit carry forward
  // ============================================================================
  const prevMonthClosings = useMemo(() => {
    if (!currentMember || !closings.length) return [];

    // Calculate previous month YYYY-MM
    const [year, month] = ym.split("-").map(Number);
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const prevYm = `${prevYear}-${String(prevMonth).padStart(2, "0")}`;

    // Find previous month closing
    const prevClosing = closings.find((c) => c.month === prevYm);
    if (!prevClosing || prevClosing.status !== "closed") return [];

    return [{
      month: prevClosing.month,
      memberId: currentMember.id,
      deposit: (prevClosing as any).memberBreakdown?.[currentMember.id]?.deposit || 0,
      credit: (prevClosing as any).memberBreakdown?.[currentMember.id]?.credit || 0,
    }];
  }, [currentMember, ym, closings]);

  // ============================================================================
  // SETTLEMENT: Single source of truth for all calculations
  // ============================================================================
  const memberSettlement = useMemo(() => {
    if (!currentMember) return null;

    return calculateMemberSettlement(
      currentMember,
      ym,
      meals,
      bazar,
      deposits,
      credits,
      payments,
      ledgers,
      monthExpenses,
      activeMembers,
      rooms,
      [],
      prevMonthClosings,
    );
  }, [currentMember, ym, meals, bazar, deposits, credits, payments, ledgers, monthExpenses, activeMembers, rooms, prevMonthClosings]);

  // ============================================================================
  // MEMBER ENTRIES: Ledger entries for display only (not for calculation)
  // ============================================================================
  const memberEntries = ledgers
    .filter((e) => e.memberId === selectedMember && e.ym === ym)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || 0) - (b.createdAt || 0));

  // ============================================================================
  // SAVE TO LEDGER: Create ledger entries for all auto-calculated charges
  // ============================================================================
  const handleSaveToLedger = async () => {
    if (!currentMember || !profile || !memberSettlement) return;

    setSaving(true);
    try {
      const charges = memberSettlement.charges;
      const results: string[] = [];

      // Save meal cost charge
      if (charges.mealCost > 0) {
        const exists = await checkLedgerChargeExists(currentMember.id, ym, "meal");
        if (!exists) {
          await addDocTo("ledgers", {
            memberId: currentMember.id,
            memberName: currentMember.name,
            date: ym + "-01",
            ym,
            transactionType: "meal_charge",
            category: "meal",
            amount: charges.mealCost,
            notes: `Meal cost for ${ym} (${memberSettlement.totalMeals} meals × ${bdt(memberSettlement.mealRate)})`,
          });
          results.push("Meal charge saved");
        }
      }

      // Save rent charge
      if (charges.rentShare > 0) {
        const exists = await checkLedgerChargeExists(currentMember.id, ym, "rent");
        if (!exists) {
          await addDocTo("ledgers", {
            memberId: currentMember.id,
            memberName: currentMember.name,
            date: ym + "-01",
            ym,
            transactionType: "rent_charge",
            category: "rent",
            amount: charges.rentShare,
            notes: `Rent share for ${ym}`,
          });
          results.push("Rent charge saved");
        }
      }

      // Save expense shares (utilities)
      for (const [category, amount] of Object.entries(charges.expenseShareBreakdown)) {
        if (amount > 0) {
          const exists = await checkLedgerChargeExists(currentMember.id, ym, category);
          if (!exists) {
            await addDocTo("ledgers", {
              memberId: currentMember.id,
              memberName: currentMember.name,
              date: ym + "-01",
              ym,
              transactionType: "utility_charge",
              category: category as any,
              amount,
              notes: `${EXPENSE_CATEGORY_LABELS[category as keyof typeof EXPENSE_CATEGORY_LABELS] || category} for ${ym}`,
            });
            results.push(`${category} charge saved`);
          }
        }
      }

      // Save staff share
      if (charges.staffShare > 0) {
        const exists = await checkLedgerChargeExists(currentMember.id, ym, "staff");
        if (!exists) {
          await addDocTo("ledgers", {
            memberId: currentMember.id,
            memberName: currentMember.name,
            date: ym + "-01",
            ym,
            transactionType: "staff_charge",
            category: "staff",
            amount: charges.staffShare,
            notes: `Staff share for ${ym}`,
          });
          results.push("Staff charge saved");
        }
      }

      toast.success(results.length > 0 ? results.join(", ") : "All charges already in ledger");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // ============================================================================
  // RECORD PAYMENT: Only way to record payments
  // ============================================================================
  const handleRecordPayment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!currentMember || !profile) return;

    const form = e.target as HTMLFormElement;
    const amount = parseFloat((form.elements.namedItem("amount") as HTMLInputElement).value);
    const method = (form.elements.namedItem("method") as HTMLSelectElement).value;
    const date = (form.elements.namedItem("date") as HTMLInputElement).value;
    const category = (form.elements.namedItem("category") as HTMLSelectElement).value;
    const referenceId = (form.elements.namedItem("referenceId") as HTMLInputElement).value || undefined;
    const notes = (form.elements.namedItem("notes") as HTMLTextAreaElement).value;
    const paymentYm = date.slice(0, 7);

    if (!amount || amount <= 0) return toast.error("Enter amount");

    try {
      const categoryLabel = EXPENSE_CATEGORY_LABELS[category as keyof typeof EXPENSE_CATEGORY_LABELS] || category;

      // Find the referenced expense to get its month and details
      const referencedExpense = referenceId ? monthExpenses.find((ex) => ex.id === referenceId) : null;
      const expenseYm = referencedExpense ? referencedExpense.ym : paymentYm;
      const expenseDate = referencedExpense ? referencedExpense.date : date;

      // Create payment record in payments collection
      await addDocTo("payments", {
        memberId: currentMember.id,
        memberName: currentMember.name,
        amount,
        method,
        date: expenseDate,
        ym: expenseYm,
        status: "paid",
        category,
        referenceId: referenceId || undefined,
        referenceType: referenceId ? "expense" : undefined,
        notes: notes || `Payment for ${categoryLabel} via ${method}${referencedExpense ? ` (Ref: ${referencedExpense.id})` : ""}`,
      });

      // Create ledger entry (not deposit/credit - those are calculated)
      await addDocTo("ledgers", {
        memberId: currentMember.id,
        memberName: currentMember.name,
        date: expenseDate,
        ym: expenseYm,
        transactionType: "payment",
        category,
        amount,
        referenceId: referenceId || undefined,
        notes: notes || `Payment for ${categoryLabel} via ${method}${referencedExpense ? ` (Ref: ${referencedExpense.id})` : ""}`,
      });

      // If payment is linked to a specific expense, update the expense's paid status
      if (referencedExpense && referencedExpense.paidBy !== currentMember.id) {
        await updateDocIn("expenses", referencedExpense.id, {
          paidBy: currentMember.id,
          paidByName: currentMember.name,
          status: "paid",
          paidAmount: referencedExpense.amount,
          remainingAmount: 0,
          updatedAt: Date.now(),
        });
        toast.success(`Payment of ${bdt(amount)} for ${categoryLabel} recorded. Expense marked as paid.`);
      } else {
        toast.success(`Payment of ${bdt(amount)} for ${categoryLabel} recorded. Settlement recalculated.`);
      }
      form.reset();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  // ============================================================================
  // QUICK PAYMENT: Category-specific quick payment handler
  // ============================================================================
  const handleQuickPayment = async (amount: number, notes: string, category: string) => {
    if (!currentMember || !profile) return;
    if (!amount || amount <= 0) return toast.error("Enter amount");

    try {
      const date = new Date().toISOString().slice(0, 10);
      const paymentYm = date.slice(0, 7);
      const categoryLabel = EXPENSE_CATEGORY_LABELS[category as keyof typeof EXPENSE_CATEGORY_LABELS] || category;

      // Create payment record with category tracking
      await addDocTo("payments", {
        memberId: currentMember.id,
        memberName: currentMember.name,
        amount,
        method: "Cash",
        date,
        ym: paymentYm,
        status: "paid",
        category,
        notes: `${notes} (${categoryLabel})`,
      });

      // Create ledger entry with category for tracking
      await addDocTo("ledgers", {
        memberId: currentMember.id,
        memberName: currentMember.name,
        date,
        ym: paymentYm,
        transactionType: "payment",
        category: category as any,
        amount,
        notes: `${notes} - ${categoryLabel} - ${bdt(amount)}`,
      });

      toast.success(`${notes} (${categoryLabel}): ${bdt(amount)} recorded for ${paymentYm}`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  // ============================================================================
  // DELETE TRANSACTION
  // ============================================================================
  const handleDeleteTransaction = async (entry: LedgerEntry) => {
    if (!profile || !confirm("Delete this transaction?")) return;

    try {
      if (profile.role === "owner") {
        await deleteDocFrom("ledgers", entry.id);
        toast.success("Deleted");
      } else {
        await submitChangeRequest({
          collectionName: "ledgers",
          action: "delete",
          title: `Delete transaction for ${currentMember?.name}`,
          actor: { uid: profile.uid, name: profile.name, role: profile.role },
          targetId: entry.id,
          previousData: entry,
        });
        toast.success("Delete request sent to admin");
      }
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  // ============================================================================
  // HELPER: Get status badge class
  // ============================================================================
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pay": return "bg-destructive/10 text-destructive";
      case "receive": return "bg-primary/10 text-primary";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div>
      <PageHeader
        title="Member Charges"
        description="Settlement preview with auto-calculated deposit and credit"
      />

      <div className="p-6 space-y-6">
        {/* Month and Member Selection */}
        <div className="flex flex-wrap gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Month</label>
            <Input type="month" value={ym} onChange={(e) => setYm(e.target.value)} className="w-44" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Member</label>
            <Select value={selectedMember} onValueChange={setSelectedMember}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Select member" />
              </SelectTrigger>
              <SelectContent>
                {activeMembers.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {currentMember && memberSettlement && (
          <>
            {/* ============================================================ */}
            {/* MEMBER INFORMATION */}
            {/* ============================================================ */}
            <Card className="p-5">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-foreground font-bold text-xl uppercase">
                  {currentMember.name[0]}
                </div>
                <div>
                  <h2 className="text-lg font-bold">{currentMember.name}</h2>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground mt-1">
                    <span className="flex items-center gap-1">
                      <UserRound className="h-3.5 w-3.5" />
                      {currentMember.role || "Member"}
                    </span>
                    {currentRoom && (
                      <>
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3.5 w-3.5" />
                          Room {currentRoom.roomNo}
                        </span>
                        {currentMember.bedNo && (
                          <span className="flex items-center gap-1">
                            <BedDouble className="h-3.5 w-3.5" />
                            Bed {currentMember.bedNo}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  {activeServices.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {activeServices.map((svc) => (
                        <Badge key={svc} variant="outline" className="text-xs">
                          {SERVICE_LABELS[svc] || svc}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </Card>

            {/* ============================================================ */}
            {/* MEMBER CHARGES - What member owes */}
            {/* ============================================================ */}
            <Card className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-lg flex items-center gap-2">
                  <ArrowUpDown className="h-5 w-5" />
                  Member Charges
                </h3>
                <Button size="sm" onClick={handleSaveToLedger} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save to Ledger"}
                </Button>
              </div>

              <div className="space-y-3">
                {/* Meals */}
                {memberSettlement.charges.mealCost > 0 && (
                  <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
                    <span className="font-medium">
                      Meals
                      <span className="text-xs text-muted-foreground ml-2">
                        ({memberSettlement.totalMeals} meals × {bdt(memberSettlement.mealRate)})
                      </span>
                    </span>
                    <span className="font-semibold">{bdt(memberSettlement.charges.mealCost)}</span>
                  </div>
                )}

                {/* Rent */}
                {memberSettlement.charges.rentShare > 0 && (
                  <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
                    <span className="font-medium">Rent</span>
                    <span className="font-semibold">{bdt(memberSettlement.charges.rentShare)}</span>
                  </div>
                )}

                {/* Utilities */}
                {Object.entries(memberSettlement.charges.expenseShareBreakdown).map(([cat, amount]) => (
                  <div key={cat} className="flex justify-between items-center p-3 bg-muted rounded-lg">
                    <span className="font-medium">
                      {EXPENSE_CATEGORY_LABELS[cat as keyof typeof EXPENSE_CATEGORY_LABELS] || cat}
                    </span>
                    <span className="font-semibold">{bdt(amount)}</span>
                  </div>
                ))}

                {/* Staff */}
                {memberSettlement.charges.staffShare > 0 && (
                  <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
                    <span className="font-medium">Staff</span>
                    <span className="font-semibold">{bdt(memberSettlement.charges.staffShare)}</span>
                  </div>
                )}

                {/* Other Charges */}
                {memberSettlement.charges.previousDue > 0 && (
                  <div className="flex justify-between items-center p-3 bg-destructive/10 rounded-lg">
                    <span className="font-medium">Other Charges</span>
                    <span className="font-semibold text-destructive">{bdt(memberSettlement.charges.previousDue)}</span>
                  </div>
                )}

                {/* Previous Credit */}
                {memberSettlement.charges.previousCredit > 0 && (
                  <div className="flex justify-between items-center p-3 bg-amber-500/10 rounded-lg">
                    <span className="font-medium">Previous Credit</span>
                    <span className="font-semibold text-amber-600">{bdt(memberSettlement.charges.previousCredit)}</span>
                  </div>
                )}

                {/* Previous Deposit */}
                {memberSettlement.charges.previousDeposit > 0 && (
                  <div className="flex justify-between items-center p-3 bg-green-500/10 rounded-lg">
                    <span className="font-medium">Previous Deposit</span>
                    <span className="font-semibold text-green-600">-{bdt(memberSettlement.charges.previousDeposit)}</span>
                  </div>
                )}

                {/* Total Charges */}
                <div className="border-t pt-3 mt-3">
                  <div className="flex justify-between items-center font-bold text-lg">
                    <span>Total Charges</span>
                    <span className="text-destructive">{bdt(memberSettlement.charges.totalCharges)}</span>
                  </div>
                </div>
              </div>
            </Card>

            {/* ============================================================ */}
            {/* MEMBER CONTRIBUTIONS - What member already paid */}
            {/* ============================================================ */}
            <Card className="p-5">
              <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                <Users className="h-5 w-5" />
                Member Contributions
              </h3>

              <div className="space-y-3">
                {/* Shared Expenses Paid */}
                {Object.entries(memberSettlement.contributions.expenseBreakdown).map(([cat, amount]) => (
                  <div key={cat} className="flex justify-between items-center p-3 bg-muted rounded-lg">
                    <span className="font-medium">
                      {EXPENSE_CATEGORY_LABELS[cat as keyof typeof EXPENSE_CATEGORY_LABELS] || cat} Paid
                    </span>
                    <span className="font-semibold text-primary">{bdt(amount)}</span>
                  </div>
                ))}

                {/* Bazar Paid */}
                {memberSettlement.contributions.bazarContribution > 0 && (
                  <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
                    <span className="font-medium">Bazar Paid</span>
                    <span className="font-semibold">{bdt(memberSettlement.contributions.bazarContribution)}</span>
                  </div>
                )}

                {/* Rent Paid */}
                {memberSettlement.contributions.rentPaid > 0 && (
                  <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
                    <span className="font-medium">Rent Paid</span>
                    <span className="font-semibold">{bdt(memberSettlement.contributions.rentPaid)}</span>
                  </div>
                )}

                {/* Utility Paid */}
                {memberSettlement.contributions.expenseContributions > 0 && (
                  <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
                    <span className="font-medium">Utility Paid</span>
                    <span className="font-semibold">{bdt(memberSettlement.contributions.expenseContributions)}</span>
                  </div>
                )}

                {/* Payments Made */}
                {memberSettlement.contributions.paymentsMade > 0 && (
                  <div className="flex justify-between items-center p-3 bg-primary/5 rounded-lg">
                    <span className="font-medium">Payments Made</span>
                    <span className="font-semibold text-primary">{bdt(memberSettlement.contributions.paymentsMade)}</span>
                  </div>
                )}

                {/* Total Contributions */}
                <div className="border-t pt-3 mt-3">
                  <div className="flex justify-between items-center font-bold text-lg">
                    <span>Total Contributions</span>
                    <span className="text-primary">{bdt(memberSettlement.contributions.totalContribution)}</span>
                  </div>
                </div>
              </div>
            </Card>

            {/* ============================================================ */}
            {/* SETTLEMENT RESULT - Final balance */}
            {/* ============================================================ */}
            <Card className="p-5">
              <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Settlement Result
              </h3>

              <div className="rounded-lg bg-muted p-4 space-y-3">
                <div className="flex justify-between text-sm">
                  <span>Total Charges</span>
                  <span className="font-semibold text-destructive">{bdt(memberSettlement.charges.totalCharges)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Total Contributions</span>
                  <span className="font-semibold text-primary">{bdt(memberSettlement.contributions.totalContribution)}</span>
                </div>
                <div className="border-t pt-3 flex justify-between font-bold text-lg">
                  <span>Net Balance</span>
                  <span className={memberSettlement.balance >= 0 ? "text-primary" : "text-destructive"}>
                    {memberSettlement.balance >= 0 ? "+" : ""}{bdt(memberSettlement.balance)}
                  </span>
                </div>
              </div>

              {/* Auto-computed Deposit/Credit/Receivable/Payable */}
              <div className="grid grid-cols-2 gap-3 mt-4">
                <div className="rounded-lg border p-3 text-center">
                  <div className="text-xs uppercase text-muted-foreground mb-1">Deposit</div>
                  <div className="text-lg font-bold text-primary">
                    {memberSettlement.totalDeposit > 0 ? bdt(memberSettlement.totalDeposit) : "—"}
                  </div>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <div className="text-xs uppercase text-muted-foreground mb-1">Credit</div>
                  <div className="text-lg font-bold text-destructive">
                    {memberSettlement.totalCredit > 0 ? bdt(memberSettlement.totalCredit) : "—"}
                  </div>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <div className="text-xs uppercase text-muted-foreground mb-1">Receivable</div>
                  <div className="text-lg font-bold text-primary">
                    {memberSettlement.receivableAmount > 0 ? bdt(memberSettlement.receivableAmount) : "—"}
                  </div>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <div className="text-xs uppercase text-muted-foreground mb-1">Payable</div>
                  <div className="text-lg font-bold text-destructive">
                    {memberSettlement.payableAmount > 0 ? bdt(memberSettlement.payableAmount) : "—"}
                  </div>
                </div>
              </div>

              {/* Status */}
              <div className="mt-4 bg-background rounded-md p-3 text-center">
                <Badge className={getStatusBadge(memberSettlement.settlementStatus) + " text-sm px-4 py-2"}>
                  {memberSettlement.settlementStatus === "pay"
                    ? `Member Owes Mess`
                    : memberSettlement.settlementStatus === "receive"
                      ? `Mess Owes Member`
                      : "Settled"}
                </Badge>
              </div>
            </Card>

            {/* ============================================================ */}
            {/* RECORD PAYMENT - Dynamically shows member's subscribed services */}
            {/* ============================================================ */}
            <Card className="p-5">
              <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Record Payment
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                Record payments toward your subscribed services. Only active subscriptions are shown.
              </p>

              {/* Dynamic Quick Pay Buttons based on member's service subscriptions */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mb-6">
                {/* Map service subscriptions to payment categories */}
                {(() => {
                  // Build payment options from member's active service subscriptions
                  const payCategories: { key: string; label: string; category: string }[] = [];

                  if (currentMember?.services) {
                    currentMember.services
                      .filter((s) => s.enabled)
                      .forEach((svc) => {
                        // Map service subscription types to payment categories
                        const svcToPay: Record<string, { label: string; category: string }> = {
                          rent: { label: "Rent", category: "rent" },
                          meals: { label: "Meals", category: "meal" },
                          internet: { label: "Internet", category: "internet" },
                          electricity: { label: "Electricity", category: "electricity" },
                          gas: { label: "Gas", category: "gas" },
                          water: { label: "Water", category: "water" },
                          cooking_staff: { label: "Cooking Staff", category: "staff" },
                          cleaning_staff: { label: "Cleaning Staff", category: "staff" },
                          security_staff: { label: "Security Staff", category: "staff" },
                          generator: { label: "Generator", category: "other" },
                          maintenance: { label: "Maintenance", category: "other" },
                          laundry: { label: "Laundry", category: "other" },
                          parking: { label: "Parking", category: "other" },
                          other_services: { label: "Other Services", category: "other" },
                        };

                        if (svcToPay[svc.type]) {
                          const mapped = svcToPay[svc.type];
                          // Avoid duplicates (multiple staff types map to "staff")
                          if (!payCategories.find((p) => p.key === mapped.category)) {
                            payCategories.push({
                              key: mapped.category,
                              label: mapped.label,
                              category: mapped.category,
                            });
                          }
                        }
                      });
                  }

                  // Always include "Other" as a fallback payment option
                  if (!payCategories.find((p) => p.key === "other")) {
                    payCategories.push({ key: "other", label: "Other", category: "other" });
                  }

                  return payCategories.map((payOpt) => (
                    <form
                      key={payOpt.key}
                      onSubmit={(e) => {
                        e.preventDefault();
                        const form = e.target as HTMLFormElement;
                        const amount = parseFloat((form.elements.namedItem("quickAmount") as HTMLInputElement).value);
                        if (!amount || amount <= 0) return toast.error("Enter amount");
                        handleQuickPayment(amount, `${payOpt.label} Payment`, payOpt.category);
                        form.reset();
                      }}
                      className="contents"
                    >
                      <div className="flex flex-col gap-1 p-3 rounded-lg border hover:bg-accent/50 cursor-pointer">
                        <span className="text-xs font-medium text-muted-foreground">{payOpt.label}</span>
                        <input
                          type="number"
                          name="quickAmount"
                          min="0"
                          step="0.01"
                          placeholder="৳"
                          required
                          className="w-full text-sm bg-transparent border-b border-dashed outline-none tabular-nums"
                        />
                      </div>
                    </form>
                  ));
                })()}
              </div>

              {/* Full Payment Form - category dropdown also dynamically filtered */}
              <details className="border rounded-lg p-4">
                <summary className="text-sm font-medium cursor-pointer text-muted-foreground hover:text-foreground">
                  Full Payment Form (custom amount, method & notes)
                </summary>
                <form onSubmit={handleRecordPayment} className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Amount (৳)</label>
                      <Input
                        type="number"
                        name="amount"
                        min="0"
                        step="0.01"
                        placeholder="Enter amount"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Method</label>
                      <Select name="method" defaultValue="Cash">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {METHODS.map(m => (
                            <SelectItem key={m} value={m}>{m}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Payment For</label>
                      <Select name="category" defaultValue="other">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(() => {
                            const cats: { value: string; label: string }[] = [];
                            if (currentMember?.services) {
                              const added = new Set<string>();
                              currentMember.services
                                .filter((s) => s.enabled)
                                .forEach((svc) => {
                                  const svcToCat: Record<string, { label: string; cat: string }> = {
                                    rent: { label: "Rent", cat: "rent" },
                                    meals: { label: "Meals", cat: "meal" },
                                    internet: { label: "Internet", cat: "internet" },
                                    electricity: { label: "Electricity", cat: "electricity" },
                                    gas: { label: "Gas", cat: "gas" },
                                    water: { label: "Water", cat: "water" },
                                    cooking_staff: { label: "Staff (Cooking)", cat: "staff" },
                                    cleaning_staff: { label: "Staff (Cleaning)", cat: "staff" },
                                    security_staff: { label: "Staff (Security)", cat: "staff" },
                                    generator: { label: "Generator", cat: "other" },
                                    maintenance: { label: "Maintenance", cat: "other" },
                                    laundry: { label: "Laundry", cat: "other" },
                                    parking: { label: "Parking", cat: "other" },
                                    other_services: { label: "Other Services", cat: "other" },
                                  };
                                  const mapped = svcToCat[svc.type];
                                  if (mapped && !added.has(mapped.cat)) {
                                    added.add(mapped.cat);
                                    cats.push({ value: mapped.cat, label: mapped.label });
                                  }
                                });
                            }
                            if (!cats.find((c) => c.value === "other")) {
                              cats.push({ value: "other", label: "Other" });
                            }
                            return cats.map((c) => (
                              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                            ));
                          })()}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Date</label>
                      <Input type="date" name="date" defaultValue={ym + "-01"} />
                    </div>
                  </div>

                  {/* Reference to specific expense */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Link to Expense (optional)</label>
                    <Select name="referenceId" defaultValue="__none__">
                      <SelectTrigger>
                        <SelectValue placeholder="Select specific expense to pay for" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">-- General Payment (no specific expense) --</SelectItem>
                        {monthExpenses
                          .filter((e) => !e.paidBy || e.paidBy !== currentMember?.id)
                          .map((exp) => (
                            <SelectItem key={exp.id} value={exp.id}>
                              {EXPENSE_CATEGORY_LABELS[exp.category] || exp.category} - {bdt(exp.amount)} ({exp.date})
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Select a specific expense to mark it as paid by this member
                    </p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Notes</label>
                    <Textarea name="notes" rows={2} placeholder="Optional notes" />
                  </div>
                  <Button type="submit" className="w-full">
                    Record Payment
                  </Button>
                </form>
              </details>
            </Card>

            {/* ============================================================ */}
            {/* TRANSACTIONS - Ledger display */}
            {/* ============================================================ */}
            <Card className="p-5">
              <h3 className="font-semibold text-lg mb-4">Transactions</h3>
              {memberEntries.length === 0 ? (
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
                        {profile && <th></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {memberEntries.map((entry) => (
                        <tr key={entry.id} className="border-t hover:bg-muted/30">
                          <td className="p-3">{entry.date}</td>
                          <td className="p-3 capitalize">{entry.transactionType.replace(/_/g, " ")}</td>
                          <td className="p-3 capitalize">{entry.category}</td>
                          <td className="p-3 text-muted-foreground max-w-xs truncate">{entry.notes || "—"}</td>
                          <td className={`p-3 text-right tabular-nums font-semibold ${
                            entry.transactionType === "payment" || entry.transactionType === "bazar_contribution" || entry.transactionType === "expense_contribution"
                              ? "text-primary"
                              : "text-destructive"
                          }`}>
                            {bdt(entry.amount)}
                          </td>
                          {profile && (
                            <td className="p-3">
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleDeleteTransaction(entry)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}