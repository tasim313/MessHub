import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
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
import { MonthPicker } from "@/components/ui/month-picker";
import {
  Receipt, DollarSign, Users, Building2, Trash2, Loader2, ArrowUpDown,
  UserRound, BedDouble, CreditCard, PiggyBank, BadgePercent,
  Search, Filter, X,
} from "lucide-react";
import { toast } from "sonner";
import { submitChangeRequest } from "@/lib/workflow";
import type { Deposit, Credit, Payment, Expense, ServiceType, MonthlyClosing, ExpenseAllocation } from "@/lib/types";
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

const monthOptions = [
  { value: "1", label: "January" }, { value: "2", label: "February" },
  { value: "3", label: "March" }, { value: "4", label: "April" },
  { value: "5", label: "May" }, { value: "6", label: "June" },
  { value: "7", label: "July" }, { value: "8", label: "August" },
  { value: "9", label: "September" }, { value: "10", label: "October" },
  { value: "11", label: "November" }, { value: "12", label: "December" },
];

function ChargesPage() {
  const { profile } = useAuth();
  const [ym, setYm] = useState(ymKey());
  const [selectedMember, setSelectedMember] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // Pending filter state
  const [pendingYear, setPendingYear] = useState<string>(String(currentYear));
  const [pendingMonth, setPendingMonth] = useState<string>(String(currentMonth));
  const [pendingMember, setPendingMember] = useState<string>("");

  // Applied filter state
  const [filterYear, setFilterYear] = useState<string>(String(currentYear));
  const [filterMonth, setFilterMonth] = useState<string>(String(currentMonth));
  const [filterMember, setFilterMember] = useState<string>("");

  const yearOptions = useMemo(() => {
    const years = new Set<string>();
    years.add(String(currentYear));
    return Array.from(years).sort((a, b) => Number(b) - Number(a));
  }, [currentYear]);

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
  const { data: allocations } = useCollection<ExpenseAllocation>("expense_allocations", [orderBy("createdAt", "desc")]);

  const activeMembers = useMemo(
    () => members.filter((m) => m.active).sort((a, b) => a.name.localeCompare(b.name)),
    [members]
  );

  useEffect(() => {
    if (filterMember && activeMembers.length > 0) {
      setSelectedMember(filterMember);
    }
  }, [filterMember, activeMembers]);

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
  const monthAllocations = allocations.filter((a) => (a as any).ym === ym);

  // Get active services for the current member
  const activeServices = useMemo(() => {
    if (!currentMember?.services) return [];
    return currentMember.services.filter((s) => s.enabled).map((s) => s.type);
  }, [currentMember]);

  // CARRY FORWARD
  const prevMonthClosings = useMemo(() => {
    if (!currentMember || !closings.length) return [];
    const [year, month] = ym.split("-").map(Number);
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const prevYm = `${prevYear}-${String(prevMonth).padStart(2, "0")}`;
    const prevClosing = closings.find((c) => c.month === prevYm);
    if (!prevClosing || prevClosing.status !== "closed") return [];
    return [{
      month: prevClosing.month,
      memberId: currentMember.id,
      deposit: (prevClosing as any).memberBreakdown?.[currentMember.id]?.deposit || 0,
      credit: (prevClosing as any).memberBreakdown?.[currentMember.id]?.credit || 0,
    }];
  }, [currentMember, ym, closings]);

  // SETTLEMENT
  const memberSettlement = useMemo(() => {
    if (!currentMember) return null;
    return calculateMemberSettlement(
      currentMember, ym, meals, bazar, deposits, credits, payments,
      ledgers, monthExpenses, activeMembers, rooms, [], prevMonthClosings,
    );
  }, [currentMember, ym, meals, bazar, deposits, credits, payments, ledgers, monthExpenses, activeMembers, rooms, prevMonthClosings]);

  // MEMBER ENTRIES
  const memberEntries = ledgers
    .filter((e) => e.memberId === selectedMember && e.ym === ym)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || 0) - (b.createdAt || 0));

  // SAVE TO LEDGER
  const handleSaveToLedger = async () => {
    if (!currentMember || !profile || !memberSettlement) return;
    setSaving(true);
    try {
      const charges = memberSettlement.charges;
      const results: string[] = [];

      if (charges.mealCost > 0) {
        const exists = await checkLedgerChargeExists(currentMember.id, ym, "meal");
        if (!exists) {
          await addDocTo("ledgers", { memberId: currentMember.id, memberName: currentMember.name, date: ym + "-01", ym, transactionType: "meal_charge", category: "meal", amount: charges.mealCost, notes: `Meal cost for ${ym} (${memberSettlement.totalMeals} meals × ${bdt(memberSettlement.mealRate)})` });
          results.push("Meal charge saved");
        }
      }
      if (charges.rentShare > 0) {
        const exists = await checkLedgerChargeExists(currentMember.id, ym, "rent");
        if (!exists) {
          await addDocTo("ledgers", { memberId: currentMember.id, memberName: currentMember.name, date: ym + "-01", ym, transactionType: "rent_charge", category: "rent", amount: charges.rentShare, notes: `Rent share for ${ym}` });
          results.push("Rent charge saved");
        }
      }
      for (const [category, amount] of Object.entries(charges.expenseShareBreakdown)) {
        if (amount > 0) {
          const exists = await checkLedgerChargeExists(currentMember.id, ym, category);
          if (!exists) {
            await addDocTo("ledgers", { memberId: currentMember.id, memberName: currentMember.name, date: ym + "-01", ym, transactionType: "utility_charge", category: category as any, amount, notes: `${EXPENSE_CATEGORY_LABELS[category as keyof typeof EXPENSE_CATEGORY_LABELS] || category} for ${ym}` });
            results.push(`${category} charge saved`);
          }
        }
      }
      if (charges.staffShare > 0) {
        const exists = await checkLedgerChargeExists(currentMember.id, ym, "staff");
        if (!exists) {
          await addDocTo("ledgers", { memberId: currentMember.id, memberName: currentMember.name, date: ym + "-01", ym, transactionType: "staff_charge", category: "staff", amount: charges.staffShare, notes: `Staff share for ${ym}` });
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

  // RECORD PAYMENT
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
      const referencedExpense = referenceId ? monthExpenses.find((ex) => ex.id === referenceId) : null;
      const expenseYm = referencedExpense ? referencedExpense.ym : paymentYm;
      const expenseDate = referencedExpense ? referencedExpense.date : date;
      await addDocTo("payments", { memberId: currentMember.id, memberName: currentMember.name, amount, method, date: expenseDate, ym: expenseYm, status: "paid", category, referenceId: referenceId || undefined, referenceType: referenceId ? "expense" : undefined, notes: notes || `Payment for ${categoryLabel} via ${method}` });
      await addDocTo("ledgers", { memberId: currentMember.id, memberName: currentMember.name, date: expenseDate, ym: expenseYm, transactionType: "payment", category, amount, referenceId: referenceId || undefined, notes: notes || `Payment for ${categoryLabel} via ${method}` });
      toast.success(`Payment of ${bdt(amount)} for ${categoryLabel} recorded`);
      form.reset();
    } catch (err) { toast.error((err as Error).message); }
  };

  const handleQuickPayment = async (amount: number, notes: string, category: string) => {
    if (!currentMember || !profile) return;
    if (!amount || amount <= 0) return toast.error("Enter amount");
    try {
      const date = new Date().toISOString().slice(0, 10);
      const paymentYm = date.slice(0, 7);
      const categoryLabel = EXPENSE_CATEGORY_LABELS[category as keyof typeof EXPENSE_CATEGORY_LABELS] || category;
      await addDocTo("payments", { memberId: currentMember.id, memberName: currentMember.name, amount, method: "Cash", date, ym: paymentYm, status: "paid", category, notes: `${notes} (${categoryLabel})` });
      await addDocTo("ledgers", { memberId: currentMember.id, memberName: currentMember.name, date, ym: paymentYm, transactionType: "payment", category: category as any, amount, notes: `${notes} - ${categoryLabel} - ${bdt(amount)}` });
      toast.success(`${notes} (${categoryLabel}): ${bdt(amount)} recorded`);
    } catch (err) { toast.error((err as Error).message); }
  };

  const handleDeleteTransaction = async (entry: LedgerEntry) => {
    if (!profile || !confirm("Delete this transaction?")) return;
    try {
      if (profile.role === "owner") { await deleteDocFrom("ledgers", entry.id); toast.success("Deleted"); }
      else { await submitChangeRequest({ collectionName: "ledgers", action: "delete", title: `Delete transaction for ${currentMember?.name}`, actor: { uid: profile.uid, name: profile.name, role: profile.role }, targetId: entry.id, previousData: entry }); toast.success("Delete request sent"); }
    } catch (err) { toast.error((err as Error).message); }
  };

  const getStatusBadge = (status: string) => {
    switch (status) { case "pay": return "bg-destructive/10 text-destructive"; case "receive": return "bg-primary/10 text-primary"; default: return "bg-muted text-muted-foreground"; }
  };

  return (
    <div>
      <PageHeader
        title="Member Charges"
        description="Settlement preview with auto-calculated deposit and credit"
      />

      <div className="p-6 space-y-6">
        {/* FILTERS BAR (Like meals & bazar) */}
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">Filters</span>
          </div>
          <div className="flex flex-wrap gap-3 items-end">
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
            <div className="space-y-1">
              <Label className="text-xs">Member</Label>
              <Select value={pendingMember} onValueChange={setPendingMember}>
                <SelectTrigger className="w-44 h-9"><SelectValue placeholder="Select member" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Members</SelectItem>
                  {activeMembers.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" className="h-9 px-4" onClick={() => {
              setFilterYear(pendingYear);
              setFilterMonth(pendingMonth);
              setFilterMember(pendingMember);
              setYm(`${pendingYear}-${String(pendingMonth).padStart(2, "0")}`);
              setSelectedMember(pendingMember);
            }}>
              <Search className="h-4 w-4 mr-1.5" />Search
            </Button>
          </div>
        </Card>

        {currentMember && memberSettlement && (
          <>
            {/* MEMBER INFORMATION */}
            <Card className="p-5">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-foreground font-bold text-xl uppercase">{currentMember.name[0]}</div>
                <div>
                  <h2 className="text-lg font-bold">{currentMember.name}</h2>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground mt-1">
                    <span className="flex items-center gap-1"><UserRound className="h-3.5 w-3.5" />{currentMember.role || "Member"}</span>
                    {currentRoom && (
                      <>
                        <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />Room {currentRoom.roomNo}</span>
                        {currentMember.bedNo && <span className="flex items-center gap-1"><BedDouble className="h-3.5 w-3.5" />Bed {currentMember.bedNo}</span>}
                      </>
                    )}
                  </div>
                  {activeServices.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {activeServices.map((svc) => <Badge key={svc} variant="outline" className="text-xs">{SERVICE_LABELS[svc] || svc}</Badge>)}
                    </div>
                  )}
                </div>
              </div>
            </Card>

            {/* MEMBER CHARGES */}
            <Card className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-lg flex items-center gap-2"><ArrowUpDown className="h-5 w-5" />Member Charges</h3>
                <Button size="sm" onClick={handleSaveToLedger} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save to Ledger"}</Button>
              </div>
              <div className="space-y-3">
                {memberSettlement.charges.mealCost > 0 && (
                  <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
                    <span className="font-medium">Meals <span className="text-xs text-muted-foreground ml-2">({memberSettlement.totalMeals} meals × {bdt(memberSettlement.mealRate)})</span></span>
                    <span className="font-semibold">{bdt(memberSettlement.charges.mealCost)}</span>
                  </div>
                )}
                {memberSettlement.charges.rentShare > 0 && (
                  <div className="flex justify-between items-center p-3 bg-muted rounded-lg"><span className="font-medium">Rent</span><span className="font-semibold">{bdt(memberSettlement.charges.rentShare)}</span></div>
                )}
                {Object.entries(memberSettlement.charges.expenseShareBreakdown).map(([cat, amount]) => (
                  <div key={cat} className="flex justify-between items-center p-3 bg-muted rounded-lg"><span className="font-medium">{EXPENSE_CATEGORY_LABELS[cat as keyof typeof EXPENSE_CATEGORY_LABELS] || cat}</span><span className="font-semibold">{bdt(amount)}</span></div>
                ))}
                {memberSettlement.charges.staffShare > 0 && (
                  <div className="flex justify-between items-center p-3 bg-muted rounded-lg"><span className="font-medium">Staff</span><span className="font-semibold">{bdt(memberSettlement.charges.staffShare)}</span></div>
                )}
                {memberSettlement.charges.previousDue > 0 && (
                  <div className="flex justify-between items-center p-3 bg-destructive/10 rounded-lg"><span className="font-medium">Other Charges</span><span className="font-semibold text-destructive">{bdt(memberSettlement.charges.previousDue)}</span></div>
                )}
                {memberSettlement.charges.previousCredit > 0 && (
                  <div className="flex justify-between items-center p-3 bg-amber-500/10 rounded-lg"><span className="font-medium">Previous Credit</span><span className="font-semibold text-amber-600">{bdt(memberSettlement.charges.previousCredit)}</span></div>
                )}
                {memberSettlement.charges.previousDeposit > 0 && (
                  <div className="flex justify-between items-center p-3 bg-green-500/10 rounded-lg"><span className="font-medium">Previous Deposit</span><span className="font-semibold text-green-600">-{bdt(memberSettlement.charges.previousDeposit)}</span></div>
                )}
                <div className="border-t pt-3 mt-3"><div className="flex justify-between items-center font-bold text-lg"><span>Total Charges</span><span className="text-destructive">{bdt(memberSettlement.charges.totalCharges)}</span></div></div>
              </div>
            </Card>

            {/* MEMBER CONTRIBUTIONS */}
            <Card className="p-5">
              <h3 className="font-semibold text-lg mb-4 flex items-center gap-2"><Users className="h-5 w-5" />Member Contributions</h3>
              <div className="space-y-3">
                {Object.entries(memberSettlement.contributions.expenseBreakdown).map(([cat, amount]) => (
                  <div key={cat} className="flex justify-between items-center p-3 bg-muted rounded-lg"><span className="font-medium">{EXPENSE_CATEGORY_LABELS[cat as keyof typeof EXPENSE_CATEGORY_LABELS] || cat} Paid</span><span className="font-semibold text-primary">{bdt(amount)}</span></div>
                ))}
                {memberSettlement.contributions.bazarContribution > 0 && (
                  <div className="flex justify-between items-center p-3 bg-muted rounded-lg"><span className="font-medium">Bazar Paid</span><span className="font-semibold">{bdt(memberSettlement.contributions.bazarContribution)}</span></div>
                )}
                {memberSettlement.contributions.rentPaid > 0 && (
                  <div className="flex justify-between items-center p-3 bg-muted rounded-lg"><span className="font-medium">Rent Paid</span><span className="font-semibold">{bdt(memberSettlement.contributions.rentPaid)}</span></div>
                )}
                {memberSettlement.contributions.expenseContributions > 0 && (
                  <div className="flex justify-between items-center p-3 bg-muted rounded-lg"><span className="font-medium">Utility Paid</span><span className="font-semibold">{bdt(memberSettlement.contributions.expenseContributions)}</span></div>
                )}
                {memberSettlement.contributions.paymentsMade > 0 && (
                  <div className="flex justify-between items-center p-3 bg-primary/5 rounded-lg"><span className="font-medium">Payments Made</span><span className="font-semibold text-primary">{bdt(memberSettlement.contributions.paymentsMade)}</span></div>
                )}
                <div className="border-t pt-3 mt-3"><div className="flex justify-between items-center font-bold text-lg"><span>Total Contributions</span><span className="text-primary">{bdt(memberSettlement.contributions.totalContribution)}</span></div></div>
              </div>
            </Card>

            {/* SETTLEMENT RESULT */}
            <Card className="p-5">
              <h3 className="font-semibold text-lg mb-4 flex items-center gap-2"><DollarSign className="h-5 w-5" />Settlement Result</h3>
              <div className="rounded-lg bg-muted p-4 space-y-3">
                <div className="flex justify-between text-sm"><span>Total Charges</span><span className="font-semibold text-destructive">{bdt(memberSettlement.charges.totalCharges)}</span></div>
                <div className="flex justify-between text-sm"><span>Total Contributions</span><span className="font-semibold text-primary">{bdt(memberSettlement.contributions.totalContribution)}</span></div>
                <div className="border-t pt-3 flex justify-between font-bold text-lg"><span>Net Balance</span><span className={memberSettlement.balance >= 0 ? "text-primary" : "text-destructive"}>{memberSettlement.balance >= 0 ? "+" : ""}{bdt(memberSettlement.balance)}</span></div>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-4">
                <div className="rounded-lg border p-3 text-center"><div className="text-xs uppercase text-muted-foreground mb-1">Deposit</div><div className="text-lg font-bold text-primary">{memberSettlement.totalDeposit > 0 ? bdt(memberSettlement.totalDeposit) : "—"}</div></div>
                <div className="rounded-lg border p-3 text-center"><div className="text-xs uppercase text-muted-foreground mb-1">Credit</div><div className="text-lg font-bold text-destructive">{memberSettlement.totalCredit > 0 ? bdt(memberSettlement.totalCredit) : "—"}</div></div>
                <div className="rounded-lg border p-3 text-center"><div className="text-xs uppercase text-muted-foreground mb-1">Receivable</div><div className="text-lg font-bold text-primary">{memberSettlement.receivableAmount > 0 ? bdt(memberSettlement.receivableAmount) : "—"}</div></div>
                <div className="rounded-lg border p-3 text-center"><div className="text-xs uppercase text-muted-foreground mb-1">Payable</div><div className="text-lg font-bold text-destructive">{memberSettlement.payableAmount > 0 ? bdt(memberSettlement.payableAmount) : "—"}</div></div>
              </div>
              <div className="mt-4 bg-background rounded-md p-3 text-center">
                <Badge className={getStatusBadge(memberSettlement.settlementStatus) + " text-sm px-4 py-2"}>
                  {memberSettlement.settlementStatus === "pay" ? `Member Owes Mess` : memberSettlement.settlementStatus === "receive" ? `Mess Owes Member` : "Settled"}
                </Badge>
              </div>
            </Card>

            {/* RECORD PAYMENT */}
            <Card className="p-5">
              <h3 className="font-semibold text-lg mb-4 flex items-center gap-2"><CreditCard className="h-5 w-5" />Record Payment</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mb-6">
                {(() => {
                  const payCategories: { key: string; label: string; category: string }[] = [];
                  if (currentMember?.services) {
                    currentMember.services.filter((s) => s.enabled).forEach((svc) => {
                      const svcToPay: Record<string, { label: string; category: string }> = { rent: { label: "Rent", category: "rent" }, meals: { label: "Meals", category: "meal" }, internet: { label: "Internet", category: "internet" }, electricity: { label: "Electricity", category: "electricity" }, gas: { label: "Gas", category: "gas" }, water: { label: "Water", category: "water" }, cooking_staff: { label: "Cooking Staff", category: "staff" }, cleaning_staff: { label: "Cleaning Staff", category: "staff" }, security_staff: { label: "Security Staff", category: "staff" }, generator: { label: "Generator", category: "other" }, maintenance: { label: "Maintenance", category: "other" }, laundry: { label: "Laundry", category: "other" }, parking: { label: "Parking", category: "other" }, other_services: { label: "Other Services", category: "other" } };
                      if (svcToPay[svc.type]) { const mapped = svcToPay[svc.type]; if (!payCategories.find((p) => p.key === mapped.category)) payCategories.push({ key: mapped.category, label: mapped.label, category: mapped.category }); }
                    });
                  }
                  if (!payCategories.find((p) => p.key === "other")) payCategories.push({ key: "other", label: "Other", category: "other" });
                  return payCategories.map((payOpt) => (
                    <form key={payOpt.key} onSubmit={(e) => { e.preventDefault(); const form = e.target as HTMLFormElement; const amount = parseFloat((form.elements.namedItem("quickAmount") as HTMLInputElement).value); if (!amount || amount <= 0) return toast.error("Enter amount"); handleQuickPayment(amount, `${payOpt.label} Payment`, payOpt.category); form.reset(); }} className="contents">
                      <div className="flex flex-col gap-1 p-3 rounded-lg border hover:bg-accent/50 cursor-pointer"><span className="text-xs font-medium text-muted-foreground">{payOpt.label}</span><input type="number" name="quickAmount" min="0" step="0.01" placeholder="৳" required className="w-full text-sm bg-transparent border-b border-dashed outline-none tabular-nums" /></div>
                    </form>
                  ));
                })()}
              </div>
              <details className="border rounded-lg p-4">
                <summary className="text-sm font-medium cursor-pointer text-muted-foreground hover:text-foreground">Full Payment Form</summary>
                <form onSubmit={handleRecordPayment} className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2"><label className="text-sm font-medium">Amount (৳)</label><Input type="number" name="amount" min="0" step="0.01" placeholder="Enter amount" required /></div>
                    <div className="space-y-2"><label className="text-sm font-medium">Method</label><Select name="method" defaultValue="Cash"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2"><label className="text-sm font-medium">Payment For</label><Select name="category" defaultValue="other"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(() => { const cats: { value: string; label: string }[] = []; if (currentMember?.services) { const added = new Set<string>(); currentMember.services.filter((s) => s.enabled).forEach((svc) => { const svcToCat: Record<string, { label: string; cat: string }> = { rent: { label: "Rent", cat: "rent" }, meals: { label: "Meals", cat: "meal" }, internet: { label: "Internet", cat: "internet" }, electricity: { label: "Electricity", cat: "electricity" }, gas: { label: "Gas", cat: "gas" }, water: { label: "Water", cat: "water" }, cooking_staff: { label: "Staff (Cooking)", cat: "staff" }, cleaning_staff: { label: "Staff (Cleaning)", cat: "staff" }, security_staff: { label: "Staff (Security)", cat: "staff" }, generator: { label: "Generator", cat: "other" }, maintenance: { label: "Maintenance", cat: "other" }, laundry: { label: "Laundry", cat: "other" }, parking: { label: "Parking", cat: "other" }, other_services: { label: "Other Services", cat: "other" } }; const mapped = svcToCat[svc.type]; if (mapped && !added.has(mapped.cat)) { added.add(mapped.cat); cats.push({ value: mapped.cat, label: mapped.label }); } }); } if (!cats.find((c) => c.value === "other")) cats.push({ value: "other", label: "Other" }); return cats.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>); })()}</SelectContent></Select></div>
                    <div className="space-y-2"><label className="text-sm font-medium">Date</label><Input type="date" name="date" defaultValue={ym + "-01"} /></div>
                  </div>
                  <div className="space-y-2"><label className="text-sm font-medium">Link to Expense</label><Select name="referenceId" defaultValue="__none__"><SelectTrigger><SelectValue placeholder="Select expense" /></SelectTrigger><SelectContent><SelectItem value="__none__">-- General Payment --</SelectItem>{monthExpenses.filter((e) => !e.paidBy || e.paidBy !== currentMember?.id).map((exp) => <SelectItem key={exp.id} value={exp.id}>{EXPENSE_CATEGORY_LABELS[exp.category] || exp.category} - {bdt(exp.amount)} ({exp.date})</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-2"><label className="text-sm font-medium">Notes</label><Textarea name="notes" rows={2} placeholder="Optional notes" /></div>
                  <Button type="submit" className="w-full">Record Payment</Button>
                </form>
              </details>
            </Card>

            {/* TRANSACTIONS */}
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
                          <td className={`p-3 text-right tabular-nums font-semibold ${entry.transactionType === "payment" || entry.transactionType === "bazar_contribution" || entry.transactionType === "expense_contribution" ? "text-primary" : "text-destructive"}`}>{bdt(entry.amount)}</td>
                          {profile && <td className="p-3"><Button size="sm" variant="destructive" onClick={() => handleDeleteTransaction(entry)}><Trash2 className="h-3.5 w-3.5" /></Button></td>}
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