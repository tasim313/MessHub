import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  useCollection, addDocTo, updateDocIn, deleteDocFrom, orderBy, type Member,
} from "@/lib/data";
import { dayKey, bdt, ymKey } from "@/lib/format";
import {
  Plus, Trash2, Pencil, Receipt, Loader2, User,
  Search, X, Calendar, Filter, RotateCcw, Repeat, Power, PowerOff,
} from "lucide-react";
import { MonthPicker } from "@/components/ui/month-picker";
import { toast } from "sonner";
import { submitChangeRequest } from "@/lib/workflow";
import type { Expense, ExpenseCategory, ExpenseStatus, AllocationMethod, ExpenseAllocation, RecurringBill } from "@/lib/types";
import { EXPENSE_CATEGORY_LABELS, EXPENSE_CATEGORY_TO_SERVICE } from "@/lib/types";
import { createExpenseWithAccounting } from "@/lib/workflow-integration";

export const Route = createFileRoute("/_authed/utilities")({
  component: ExpensesPage,
});

const EXPENSE_CATEGORIES = Object.keys(EXPENSE_CATEGORY_LABELS) as ExpenseCategory[];

// Filter types
type FilterMode = "month" | "date_range" | "all";

function ExpensesPage() {
  const { can, profile } = useAuth();
  const { data: expenses } = useCollection<Expense>("expenses", [orderBy("date", "desc")]);
  const { data: members } = useCollection<Member>("members");
  const { data: recurringBills } = useCollection<RecurringBill>("recurring_bills");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [saving, setSaving] = useState(false);

  const canManageRecurring = profile?.role === "owner" || profile?.role === "manager";

  // ────────────────────────────────────────────
  // Recurring Bill templates (water/internet/garbage/bua/etc.) — generated
  // into real Expense records automatically on the 1st of each month by
  // ensureRecurringExpensesUpToDate(), which runs once per session in
  // _authed.tsx. This UI only manages the template, never the generated bill.
  // ────────────────────────────────────────────
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [recurringEditing, setRecurringEditing] = useState<RecurringBill | null>(null);
  const [recurringSaving, setRecurringSaving] = useState(false);
  const [recurringForm, setRecurringForm] = useState({
    category: "water" as ExpenseCategory,
    label: "",
    amount: "",
    allocationMethod: "equal" as AllocationMethod,
  });

  const resetRecurringForm = () => {
    setRecurringEditing(null);
    setRecurringForm({ category: "water", label: "", amount: "", allocationMethod: "equal" });
  };

  const onRecurringSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (recurringSaving || !profile) return;
    const amount = parseFloat(recurringForm.amount);
    if (!amount || amount <= 0) return toast.error("Enter amount");
    const label = recurringForm.label.trim() || EXPENSE_CATEGORY_LABELS[recurringForm.category];

    setRecurringSaving(true);
    try {
      if (recurringEditing) {
        await updateDocIn("recurring_bills", recurringEditing.id, {
          category: recurringForm.category,
          label,
          amount,
          allocationMethod: recurringForm.allocationMethod,
        });
        toast.success("Recurring bill updated");
      } else {
        await addDocTo(
          "recurring_bills",
          {
            category: recurringForm.category,
            label,
            amount,
            allocationMethod: recurringForm.allocationMethod,
            active: true,
          },
          profile.uid,
        );
        toast.success(`${label} will now auto-generate every month`);
      }
      setRecurringOpen(false);
      resetRecurringForm();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setRecurringSaving(false);
    }
  };

  const toggleRecurringActive = async (bill: RecurringBill) => {
    try {
      await updateDocIn("recurring_bills", bill.id, { active: !bill.active });
      toast.success(bill.active ? `${bill.label} paused` : `${bill.label} resumed`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleDeleteRecurring = async (bill: RecurringBill) => {
    if (!confirm(`Delete recurring bill "${bill.label}"? Already-generated expenses are kept.`)) return;
    try {
      await deleteDocFrom("recurring_bills", bill.id);
      toast.success("Deleted");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  // ────────────────────────────────────────────
  // Filters
  // ────────────────────────────────────────────
  const [filterMode, setFilterMode] = useState<FilterMode>("month");
  const [filterMonth, setFilterMonth] = useState(() => ymKey()); // YYYY-MM
  const [filterDateFrom, setFilterDateFrom] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [filterDateTo, setFilterDateTo] = useState(() => dayKey());
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(true);

  // ────────────────────────────────────────────
  // Form state
  // ────────────────────────────────────────────
  const [form, setForm] = useState({
    category: "electricity" as ExpenseCategory,
    amount: "",
    date: dayKey(),
    paidBy: "" as string,
    paidByName: "",
    allocationMethod: "equal" as AllocationMethod,
    description: "",
    notes: "",
    status: "pending" as ExpenseStatus,
  });

  const activeMembers = useMemo(
    () => members.filter((m) => m.active).sort((a, b) => a.name.localeCompare(b.name)),
    [members],
  );

  const resetForm = () => {
    setEditing(null);
    setForm({
      category: "electricity",
      amount: "",
      date: dayKey(),
      paidBy: "__none__",
      paidByName: "",
      allocationMethod: "equal",
      description: "",
      notes: "",
      status: "pending",
    });
  };

  const updatePaidBy = (memberId: string) => {
    if (memberId === "__none__") {
      setForm({ ...form, paidBy: "__none__", paidByName: "" });
    } else {
      const member = members.find((m) => m.id === memberId);
      setForm({ ...form, paidBy: memberId, paidByName: member?.name || "" });
    }
  };

  // ────────────────────────────────────────────
  // Filter logic
  // ────────────────────────────────────────────
  const filteredExpenses = useMemo(() => {
    let result = [...expenses];

    // 1. Date filtering
    if (filterMode === "month") {
      result = result.filter((e) => e.ym === filterMonth);
    } else if (filterMode === "date_range") {
      result = result.filter((e) => e.date >= filterDateFrom && e.date <= filterDateTo);
    }
    // "all" = no date filter

    // 2. Category filter
    if (filterCategory !== "all") {
      result = result.filter((e) => e.category === filterCategory);
    }

    // 3. Status filter
    if (filterStatus === "paid") {
      result = result.filter((e) => e.paidBy);
    } else if (filterStatus === "pending") {
      result = result.filter((e) => !e.paidBy);
    }

    // 4. Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((e) => {
        const searchable = [
          EXPENSE_CATEGORY_LABELS[e.category] || e.category,
          e.description || "",
          e.notes || "",
          e.paidByName || "",
          e.amount?.toString() || "",
          e.date || "",
          e.allocationMethod?.replace(/_/g, " ") || "",
        ].join(" ").toLowerCase();
        return searchable.includes(q);
      });
    }

    // Already sorted by date desc from Firebase orderBy
    return result;
  }, [expenses, filterMode, filterMonth, filterDateFrom, filterDateTo, filterCategory, filterStatus, searchQuery]);

  // Summary stats for filtered data
  const filteredStats = useMemo(() => {
    const total = filteredExpenses.reduce((s, e) => s + (e.amount || 0), 0);
    const paid = filteredExpenses.filter((e) => e.paidBy).reduce((s, e) => s + (e.amount || 0), 0);
    const pending = total - paid;
    return { total, paid, pending, count: filteredExpenses.length };
  }, [filteredExpenses]);

  // All-time stats
  const totalExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const paidExpenses = expenses.filter((e) => e.paidBy).reduce((s, e) => s + (e.amount || 0), 0);

  const resetFilters = () => {
    setFilterMode("month");
    setFilterMonth(ymKey());
    const now = new Date();
    setFilterDateFrom(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`);
    setFilterDateTo(dayKey());
    setFilterCategory("all");
    setFilterStatus("all");
    setSearchQuery("");
  };

  const hasActiveFilters = filterCategory !== "all" || filterStatus !== "all" || searchQuery.trim() !== "" ||
    filterMode !== "month" || filterMonth !== ymKey();

  // ────────────────────────────────────────────
  // Delete handler
  // ────────────────────────────────────────────
  const handleDelete = async (e: Expense) => {
    if (!profile || !confirm(`Delete ${EXPENSE_CATEGORY_LABELS[e.category]} (${bdt(e.amount)})?`)) return;
    try {
      if (profile.role === "owner") {
        await deleteDocFrom("expenses", e.id);
        toast.success("Deleted");
      } else {
        await submitChangeRequest({
          collectionName: "expenses",
          action: "delete",
          title: `Delete ${EXPENSE_CATEGORY_LABELS[e.category]} expense`,
          actor: { uid: profile.uid, name: profile.name, role: profile.role },
          targetId: e.id,
          previousData: e,
        });
        toast.success("Delete request sent to admin");
      }
    } catch (err) { toast.error((err as Error).message); }
  };

  // ────────────────────────────────────────────
  // Submit handler
  // ────────────────────────────────────────────
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) return toast.error("Enter amount");

    setSaving(true);
    try {
      const paidBy = form.paidBy === "__none__" ? undefined : form.paidBy;
      const paidByName = paidBy ? (members.find((m) => m.id === paidBy)?.name || undefined) : undefined;

      const payload: Partial<Expense> = {
        category: form.category,
        amount,
        date: form.date,
        ym: form.date.slice(0, 7),
        paidBy,
        paidByName,
        allocationMethod: form.allocationMethod,
        description: form.description,
        notes: form.notes || undefined,
        status: paidBy ? ("paid" as ExpenseStatus) : ("pending" as ExpenseStatus),
        allocatedAmount: amount,
        paidAmount: paidBy ? amount : 0,
        remainingAmount: paidBy ? 0 : amount,
      };

      if (profile?.role === "owner" && editing) {
        // Update expense (keep existing accounting - don't re-create payments/advances)
        await updateDocIn("expenses", editing.id, { ...payload, updatedAt: Date.now() });
        toast.success("Expense updated");
      } else if (profile?.role === "owner") {
        // Use the new accounting workflow that automatically:
        // 1. Creates the expense
        // 2. Creates member allocations
        // 3. Records internal payment for payer's share (appears in Payments)
        // 4. Creates advance for excess
        // 5. Generates ledger charges for other members
        const result = await createExpenseWithAccounting(
          payload,
          members,
          [],
          [],
          profile?.uid,
        );
        
        let msg = `Expense added with ${result.allocationsCount} member allocations`;
        if (result.internalPaymentRecorded) msg += `, internal payment recorded`;
        if (result.advanceCreated) msg += `, advance created`;
        toast.success(msg);
      } else if (profile) {
        await submitChangeRequest({
          collectionName: "expenses",
          action: editing ? "update" : "create",
          title: `${editing ? "Update" : "Add"} ${EXPENSE_CATEGORY_LABELS[form.category]} expense`,
          actor: { uid: profile.uid, name: profile.name, role: profile.role },
          targetId: editing?.id,
          payload,
          previousData: editing || null,
        });
        toast.success("Request sent to admin for approval");
      }

      setOpen(false);
      resetForm();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const getFilterLabel = () => {
    if (filterMode === "month") return filterMonth;
    if (filterMode === "date_range") return `${filterDateFrom} to ${filterDateTo}`;
    return "All Time";
  };

  return (
    <div>
      <PageHeader
        title="Shared Expenses"
        description={`${bdt(totalExpenses)} total · ${bdt(paidExpenses)} paid · ${expenses.length} entries`}
        action={profile && (
          <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (!value) resetForm(); }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-1" />
                Add Expense
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{editing ? "Edit" : "Add"} Shared Expense</DialogTitle>
              </DialogHeader>
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select
                      value={form.category}
                      onValueChange={(v) => setForm({ ...form, category: v as ExpenseCategory })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-60">
                        {EXPENSE_CATEGORIES.map((cat) => (
                          <SelectItem key={cat} value={cat}>
                            {EXPENSE_CATEGORY_LABELS[cat]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Amount (৳)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input
                      type="date"
                      value={form.date}
                      onChange={(e) => setForm({ ...form, date: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Allocation Method</Label>
                    <Select
                      value={form.allocationMethod}
                      onValueChange={(v) => setForm({ ...form, allocationMethod: v as AllocationMethod })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="equal">Equal Split</SelectItem>
                        <SelectItem value="per_member">Per Member Custom</SelectItem>
                        <SelectItem value="per_room">Room-Based</SelectItem>
                        <SelectItem value="usage_based">Usage-Based</SelectItem>
                        <SelectItem value="fixed">Fixed Amount</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Paid By (optional - who paid on behalf of the mess)</Label>
                  <Select value={form.paidBy} onValueChange={updatePaidBy}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select payer (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">-- Not paid yet --</SelectItem>
                      {activeMembers.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Description (optional)</Label>
                  <Input
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Brief description of this expense"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Notes (optional)</Label>
                  <Textarea
                    rows={2}
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  />
                </div>

                <DialogFooter>
                  <Button type="submit" disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                    {editing ? "Update" : "Save"} Expense
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      />

      <div className="p-6 space-y-6">
        {/* Summary Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-5">
            <div className="text-xs uppercase text-muted-foreground">
              {filterMode === "month" ? `${filterMonth}` : filterMode === "date_range" ? "Range" : "All Time"} Expenses
            </div>
            <div className="text-2xl font-bold mt-2">{bdt(filteredStats.total)}</div>
            <div className="text-xs text-muted-foreground mt-1">{filteredStats.count} entries</div>
          </Card>
          <Card className="p-5">
            <div className="text-xs uppercase text-muted-foreground">Paid by Members</div>
            <div className="text-2xl font-bold text-primary mt-2">{bdt(filteredStats.paid)}</div>
            <div className="text-xs text-muted-foreground mt-1">Counts as contribution</div>
          </Card>
          <Card className="p-5">
            <div className="text-xs uppercase text-muted-foreground">Unpaid / Pending</div>
            <div className="text-2xl font-bold text-destructive mt-2">{bdt(filteredStats.pending)}</div>
            <div className="text-xs text-muted-foreground mt-1">Needs payment</div>
          </Card>
          <Card className="p-5">
            <div className="text-xs uppercase text-muted-foreground">All Time Total</div>
            <div className="text-2xl font-bold mt-2">{bdt(totalExpenses)}</div>
            <div className="text-xs text-muted-foreground mt-1">{expenses.length} total entries</div>
          </Card>
        </div>

        {/* ──────────────────────────────────────────── */}
        {/* RECURRING BILLS — auto-generated on the 1st of each month */}
        {/* ──────────────────────────────────────────── */}
        {canManageRecurring && (
          <Card className="overflow-hidden">
            <div className="p-4 border-b bg-muted/30 flex items-center justify-between">
              <div>
                <h3 className="font-semibold flex items-center gap-1.5">
                  <Repeat className="h-4 w-4 text-muted-foreground" />
                  Recurring Bills
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Water, internet, garbage, bua/staff bills — auto-generated as a real expense on the 1st of every month, ready to pay from Charges.
                </p>
              </div>
              <Dialog open={recurringOpen} onOpenChange={(v) => { setRecurringOpen(v); if (!v) resetRecurringForm(); }}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline">
                    <Plus className="h-4 w-4 mr-1" />
                    Add Recurring Bill
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>{recurringEditing ? "Edit" : "Add"} Recurring Bill</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={onRecurringSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label>Category</Label>
                      <Select
                        value={recurringForm.category}
                        onValueChange={(v) => setRecurringForm({ ...recurringForm, category: v as ExpenseCategory })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="max-h-60">
                          {EXPENSE_CATEGORIES.map((cat) => (
                            <SelectItem key={cat} value={cat}>
                              {EXPENSE_CATEGORY_LABELS[cat]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Label (optional — shown on the generated bill)</Label>
                      <Input
                        value={recurringForm.label}
                        onChange={(e) => setRecurringForm({ ...recurringForm, label: e.target.value })}
                        placeholder={EXPENSE_CATEGORY_LABELS[recurringForm.category]}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Monthly Amount (৳)</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={recurringForm.amount}
                          onChange={(e) => setRecurringForm({ ...recurringForm, amount: e.target.value })}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Allocation</Label>
                        <Select
                          value={recurringForm.allocationMethod}
                          onValueChange={(v) => setRecurringForm({ ...recurringForm, allocationMethod: v as AllocationMethod })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="equal">Equal Split</SelectItem>
                            <SelectItem value="per_room">Room-Based</SelectItem>
                            <SelectItem value="usage_based">Usage-Based</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button type="submit" disabled={recurringSaving}>
                        {recurringSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                        {recurringEditing ? "Update" : "Save"}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            {recurringBills.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                No recurring bills configured yet. Add water, internet, garbage, or bua bills here so they generate automatically every month.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase text-muted-foreground bg-muted/50">
                    <tr>
                      <th className="text-left p-3 font-medium">Bill</th>
                      <th className="text-left p-3 font-medium">Category</th>
                      <th className="text-right p-3 font-medium">Amount / month</th>
                      <th className="text-left p-3 font-medium">Allocation</th>
                      <th className="text-center p-3 font-medium">Status</th>
                      <th className="w-[110px]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {recurringBills.map((bill) => (
                      <tr key={bill.id} className="border-t hover:bg-muted/30 transition-colors">
                        <td className="p-3 font-medium">{bill.label}</td>
                        <td className="p-3">
                          <Badge variant="outline" className="text-xs">{EXPENSE_CATEGORY_LABELS[bill.category] || bill.category}</Badge>
                        </td>
                        <td className="p-3 text-right tabular-nums font-semibold">{bdt(bill.amount)}</td>
                        <td className="p-3 text-xs text-muted-foreground capitalize">{bill.allocationMethod.replace(/_/g, " ")}</td>
                        <td className="p-3 text-center">
                          {bill.active ? (
                            <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">Active</Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground text-xs">Paused</Badge>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              title={bill.active ? "Pause" : "Resume"}
                              onClick={() => toggleRecurringActive(bill)}
                            >
                              {bill.active ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              onClick={() => {
                                setRecurringEditing(bill);
                                setRecurringForm({
                                  category: bill.category,
                                  label: bill.label,
                                  amount: String(bill.amount),
                                  allocationMethod: bill.allocationMethod,
                                });
                                setRecurringOpen(true);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                              onClick={() => handleDeleteRecurring(bill)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}

        {/* ──────────────────────────────────────────── */}
        {/* SEARCH + FILTER BAR */}
        {/* ──────────────────────────────────────────── */}
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search expenses..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Quick Month Selector */}
            <MonthPicker
              value={filterMonth}
              onChange={(v) => {
                setFilterMonth(v);
                setFilterMode("month");
              }}
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
              {(filterCategory !== "all" || filterStatus !== "all" || filterMode !== "month") && (
                <span className="ml-1 h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
                  {[
                    filterCategory !== "all" ? 1 : 0,
                    filterStatus !== "all" ? 1 : 0,
                    filterMode !== "month" ? 1 : 0,
                  ].reduce((a, b) => a + b, 0)}
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

          {/* ──────────────────────────────────────────── */}
          {/* EXPANDED FILTER OPTIONS */}
          {/* ──────────────────────────────────────────── */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t space-y-3">
              {/* Filter Mode Row */}
              <div className="flex flex-wrap items-center gap-3">
                <Label className="text-sm font-medium whitespace-nowrap">Date Range:</Label>
                <div className="flex gap-2">
                  <Button
                    variant={filterMode === "month" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFilterMode("month")}
                  >
                    <Calendar className="h-3.5 w-3.5 mr-1" />
                    Month
                  </Button>
                  <Button
                    variant={filterMode === "date_range" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFilterMode("date_range")}
                  >
                    <Calendar className="h-3.5 w-3.5 mr-1" />
                    Date Range
                  </Button>
                  <Button
                    variant={filterMode === "all" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFilterMode("all")}
                  >
                    All Time
                  </Button>
                </div>

                {filterMode === "date_range" && (
                  <>
                    <Input
                      type="date"
                      value={filterDateFrom}
                      onChange={(e) => setFilterDateFrom(e.target.value)}
                      className="w-40"
                    />
                    <span className="text-muted-foreground text-sm">to</span>
                    <Input
                      type="date"
                      value={filterDateTo}
                      onChange={(e) => setFilterDateTo(e.target.value)}
                      className="w-40"
                    />
                  </>
                )}
              </div>

              {/* Category + Status Row */}
              <div className="flex flex-wrap items-center gap-3">
                <Label className="text-sm font-medium whitespace-nowrap">Category:</Label>
                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger className="w-52">
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {EXPENSE_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {EXPENSE_CATEGORY_LABELS[cat]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Label className="text-sm font-medium whitespace-nowrap ml-2">Status:</Label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Active Filters Summary */}
              {hasActiveFilters && (
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium">Active filters:</span>
                  {filterMode === "month" && <Badge variant="secondary" className="text-xs">Month: {filterMonth}</Badge>}
                  {filterMode === "date_range" && <Badge variant="secondary" className="text-xs">{filterDateFrom} → {filterDateTo}</Badge>}
                  {filterMode === "all" && <Badge variant="secondary" className="text-xs">All Time</Badge>}
                  {filterCategory !== "all" && <Badge variant="secondary" className="text-xs">{EXPENSE_CATEGORY_LABELS[filterCategory as ExpenseCategory]}</Badge>}
                  {filterStatus !== "all" && <Badge variant="secondary" className="text-xs capitalize">{filterStatus}</Badge>}
                  {searchQuery.trim() && <Badge variant="secondary" className="text-xs">Search: "{searchQuery}"</Badge>}
                </div>
              )}
            </div>
          )}
        </Card>

        {/* ──────────────────────────────────────────── */}
        {/* ERP-STYLE EXPENSE TABLE */}
        {/* ──────────────────────────────────────────── */}
        <Card className="overflow-hidden">
          <div className="p-4 border-b bg-muted/30 flex items-center justify-between">
            <h3 className="font-semibold">
              Expenses
              <span className="text-muted-foreground font-normal ml-2">
                ({filteredStats.count} {filteredStats.count === 1 ? "entry" : "entries"})
              </span>
            </h3>
            <span className="text-sm text-muted-foreground">{getFilterLabel()}</span>
          </div>

          {filteredExpenses.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <Receipt className="h-10 w-10 mx-auto opacity-40 mb-3" />
              <p className="font-medium">
                {expenses.length === 0 ? "No expenses recorded yet" : "No expenses match your filters"}
              </p>
              <p className="text-sm mt-1">
                {expenses.length === 0
                  ? "Add your first shared expense to start tracking."
                  : "Try adjusting your filters or search query."}
              </p>
              {expenses.length > 0 && (
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
                    <th className="text-left p-3 font-medium w-[120px]">Date</th>
                    <th className="text-left p-3 font-medium">Category</th>
                    <th className="text-left p-3 font-medium">Paid By</th>
                    <th className="text-left p-3 font-medium">Method</th>
                    <th className="text-left p-3 font-medium">Description</th>
                    <th className="text-right p-3 font-medium w-[120px]">Amount</th>
                    <th className="text-center p-3 font-medium w-[100px]">Status</th>
                    {profile && <th className="w-[80px]"></th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredExpenses.map((exp) => (
                    <tr key={exp.id} className="border-t hover:bg-muted/30 transition-colors">
                      <td className="p-3 tabular-nums whitespace-nowrap">{exp.date}</td>
                      <td className="p-3">
                        <Badge variant="outline" className="text-xs font-medium">
                          {EXPENSE_CATEGORY_LABELS[exp.category] || exp.category}
                        </Badge>
                      </td>
                      <td className="p-3">
                        {exp.paidByName ? (
                          <span className="flex items-center gap-1.5">
                            <span className="h-6 w-6 rounded-full bg-accent flex items-center justify-center text-xs font-semibold">
                              {exp.paidByName[0]}
                            </span>
                            {exp.paidByName}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-3">
                        <span className="text-xs text-muted-foreground capitalize">
                          {exp.allocationMethod.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="p-3 text-muted-foreground max-w-[200px] truncate">
                        {exp.description || exp.notes || "—"}
                      </td>
                      <td className="p-3 text-right tabular-nums font-semibold">
                        {bdt(exp.amount)}
                      </td>
                      <td className="p-3 text-center">
                        {exp.paidBy ? (
                          <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">Paid</Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground text-xs">Pending</Badge>
                        )}
                      </td>
                      {profile && (
                        <td className="p-3">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              onClick={() => {
                                setEditing(exp);
                                setForm({
                                  category: exp.category,
                                  amount: String(exp.amount),
                                  date: exp.date,
                                  paidBy: exp.paidBy || "",
                                  paidByName: exp.paidByName || "",
                                  allocationMethod: exp.allocationMethod,
                                  description: exp.description || "",
                                  notes: exp.notes || "",
                                  status: exp.status,
                                });
                                setOpen(true);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                              onClick={() => handleDelete(exp)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
                {/* Table Footer with totals */}
                <tfoot>
                  <tr className="border-t-2 bg-muted/30 font-semibold">
                    <td className="p-3" colSpan={5}>Total ({filteredStats.count} entries)</td>
                    <td className="p-3 text-right tabular-nums">{bdt(filteredStats.total)}</td>
                    <td className="p-3 text-center">
                      <span className="text-xs">
                        <span className="text-primary">{filteredStats.count - filteredExpenses.filter((e) => !e.paidBy).length} paid</span>
                        {" · "}
                        <span className="text-destructive">{filteredExpenses.filter((e) => !e.paidBy).length} pending</span>
                      </span>
                    </td>
                    {profile && <td></td>}
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