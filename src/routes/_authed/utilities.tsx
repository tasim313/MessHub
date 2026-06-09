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
import { useCollection, addDocTo, updateDocIn, deleteDocFrom, orderBy, type Member } from "@/lib/data";
import { dayKey, bdt } from "@/lib/format";
import { Plus, Trash2, Zap, Pencil, Receipt, Loader2, User } from "lucide-react";
import { toast } from "sonner";
import { submitChangeRequest } from "@/lib/workflow";
import type { Expense, ExpenseAllocation, ExpenseCategory, ExpenseStatus, AllocationMethod } from "@/lib/types";
import { EXPENSE_CATEGORY_LABELS, EXPENSE_CATEGORY_TO_SERVICE } from "@/lib/types";

export const Route = createFileRoute("/_authed/utilities")({
  component: ExpensesPage,
});

// Remapping from the older UI strings to new expense categories
const EXPENSE_CATEGORIES = Object.keys(EXPENSE_CATEGORY_LABELS) as ExpenseCategory[];

function ExpensesPage() {
  const { can, profile } = useAuth();
  const { data: expenses } = useCollection<Expense>("expenses", [orderBy("date", "desc")]);
  const { data: members } = useCollection<Member>("members");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
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
  const [saving, setSaving] = useState(false);

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

  // Get the selected member name when paidBy changes
  const updatePaidBy = (memberId: string) => {
    if (memberId === "__none__") {
      setForm({
        ...form,
        paidBy: "__none__",
        paidByName: "",
      });
    } else {
      const member = members.find((m) => m.id === memberId);
      setForm({
        ...form,
        paidBy: memberId,
        paidByName: member?.name || "",
      });
    }
  };

  // Calculate total per category
  const categoryTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    expenses.forEach((e) => {
      totals[e.category] = (totals[e.category] || 0) + (e.amount || 0);
    });
    return totals;
  }, [expenses]);

  // Group expenses by category
  const groupedExpenses = useMemo(() => {
    const groups: Record<string, Expense[]> = {};
    EXPENSE_CATEGORIES.forEach((cat) => {
      const catExpenses = expenses.filter((e) => e.category === cat);
      if (catExpenses.length > 0) {
        groups[cat] = catExpenses;
      }
    });
    return groups;
  }, [expenses]);

  // Delete handler
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

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) return toast.error("Enter amount");

    setSaving(true);
    try {
      // Handle "none" selection - convert to null
      const paidBy = form.paidBy === "__none__" ? null : form.paidBy;
      const paidByName = paidBy ? (members.find((m) => m.id === paidBy)?.name || null) : null;

      const payload = {
        category: form.category,
        amount,
        date: form.date,
        ym: form.date.slice(0, 7),
        paidBy,
        paidByName,
        allocationMethod: form.allocationMethod,
        description: form.description,
        notes: form.notes || null,
        status: paidBy ? ("paid" as ExpenseStatus) : ("pending" as ExpenseStatus),
        allocatedAmount: amount,
        paidAmount: paidBy ? amount : 0,
        remainingAmount: paidBy ? 0 : amount,
      };

      if (profile?.role === "owner" && editing) {
        await updateDocIn("expenses", editing.id, {
          ...payload,
          updatedAt: Date.now(),
        });
        toast.success("Expense updated");
      } else if (profile?.role === "owner") {
        await addDocTo("expenses", payload);
        toast.success("Expense added");
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

  const totalExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const paidExpenses = expenses.filter((e) => e.paidBy).reduce((s, e) => s + (e.amount || 0), 0);
  const unpaidExpenses = totalExpenses - paidExpenses;

  return (
    <div>
      <PageHeader
        title="Shared Expenses"
        description={`${bdt(totalExpenses)} total · ${bdt(paidExpenses)} paid · ${bdt(unpaidExpenses)} pending`}
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
                  <Select
                    value={form.paidBy}
                    onValueChange={updatePaidBy}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select payer (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">-- Not paid yet --</SelectItem>
                      {activeMembers.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
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
            <div className="text-xs uppercase text-muted-foreground">Total Expenses</div>
            <div className="text-2xl font-bold mt-2">{bdt(totalExpenses)}</div>
            <div className="text-xs text-muted-foreground mt-1">{expenses.length} entries</div>
          </Card>
          <Card className="p-5">
            <div className="text-xs uppercase text-muted-foreground">Paid by Members</div>
            <div className="text-2xl font-bold text-primary mt-2">{bdt(paidExpenses)}</div>
            <div className="text-xs text-muted-foreground mt-1">Counts as contribution</div>
          </Card>
          <Card className="p-5">
            <div className="text-xs uppercase text-muted-foreground">Unpaid / Pending</div>
            <div className="text-2xl font-bold text-destructive mt-2">{bdt(unpaidExpenses)}</div>
            <div className="text-xs text-muted-foreground mt-1">Needs payment</div>
          </Card>
          <Card className="p-5">
            <div className="text-xs uppercase text-muted-foreground">Unique Categories</div>
            <div className="text-2xl font-bold mt-2">{Object.keys(groupedExpenses).length}</div>
            <div className="text-xs text-muted-foreground mt-1">of {EXPENSE_CATEGORIES.length} types</div>
          </Card>
        </div>

        {/* Category Breakdown */}
        {EXPENSE_CATEGORIES.map((cat) => {
          const catExpenses = expenses.filter((e) => e.category === cat);
          if (catExpenses.length === 0) return null;

          const catTotal = catExpenses.reduce((s, e) => s + (e.amount || 0), 0);
          return (
            <Card key={cat} className="p-0 overflow-hidden">
              <div className="p-4 border-b bg-muted/30">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    {EXPENSE_CATEGORY_LABELS[cat]}
                  </h3>
                  <div className="text-lg font-bold">{bdt(catTotal)}</div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase text-muted-foreground bg-muted/50">
                    <tr>
                      <th className="text-left p-3 font-medium">Date</th>
                      <th className="text-left p-3 font-medium">Paid By</th>
                      <th className="text-left p-3 font-medium">Method</th>
                      <th className="text-left p-3 font-medium">Description</th>
                      <th className="text-right p-3 font-medium">Amount</th>
                      <th className="text-center p-3 font-medium">Status</th>
                      {profile && <th></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {catExpenses.map((exp) => (
                      <tr key={exp.id} className="border-t hover:bg-muted/30">
                        <td className="p-3">{exp.date}</td>
                        <td className="p-3">
                          {exp.paidByName ? (
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {exp.paidByName}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-3">
                          <Badge variant="outline" className="text-xs">
                            {exp.allocationMethod.replace(/_/g, " ")}
                          </Badge>
                        </td>
                        <td className="p-3 text-muted-foreground max-w-[200px] truncate">
                          {exp.description || exp.notes || "—"}
                        </td>
                        <td className="p-3 text-right tabular-nums font-semibold">
                          {bdt(exp.amount)}
                        </td>
                        <td className="p-3 text-center">
                          {exp.paidBy ? (
                            <Badge className="bg-primary/10 text-primary border-primary/20">Paid</Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">Pending</Badge>
                          )}
                        </td>
                        {profile && (
                          <td className="p-3">
                            <div className="flex justify-end gap-1">
                              <Button
                                size="sm"
                                variant="outline"
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
                              <Button size="sm" variant="destructive" onClick={() => handleDelete(exp)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          );
        })}

        {expenses.length === 0 && (
          <Card className="p-12 text-center text-muted-foreground">
            <Receipt className="h-10 w-10 mx-auto opacity-40 mb-3" />
            <p className="font-medium">No expenses recorded yet</p>
            <p className="text-sm mt-1">Add your first shared expense to start tracking.</p>
          </Card>
        )}
      </div>
    </div>
  );
}