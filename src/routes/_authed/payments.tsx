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
import { dayKey, bdt, ymKey } from "@/lib/format";
import { MonthPicker } from "@/components/ui/month-picker";
import { Plus, Trash2, Banknote, Pencil, Search, Filter, X } from "lucide-react";
import { toast } from "sonner";
import { submitChangeRequest } from "@/lib/workflow";
import { checkPaymentReferenceExists } from "@/lib/duplicate-check";
import type { Payment } from "@/lib/types";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/types";

export const Route = createFileRoute("/_authed/payments")({
  component: PaymentsPage,
});

const METHODS = ["Cash", "bKash", "Nagad", "Rocket", "Bank"];
const STATUSES = ["paid", "partially_paid", "due", "overpaid"];
const CATEGORIES = ["rent", "meal", "internet", "electricity", "gas", "water", "staff", "maintenance", "other"];

const monthOptions = [
  { value: "1", label: "January" }, { value: "2", label: "February" },
  { value: "3", label: "March" }, { value: "4", label: "April" },
  { value: "5", label: "May" }, { value: "6", label: "June" },
  { value: "7", label: "July" }, { value: "8", label: "August" },
  { value: "9", label: "September" }, { value: "10", label: "October" },
  { value: "11", label: "November" }, { value: "12", label: "December" },
];

function PaymentsPage() {
  const { can, profile } = useAuth();
  const { data: members } = useCollection<Member>("members");
  const { data: payments } = useCollection<Payment>("payments", [orderBy("date", "desc")]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Payment | null>(null);
  const [form, setForm] = useState({ memberId: "", amount: "", method: "Cash", date: dayKey(), status: "paid" as Payment["status"], referenceNo: "", notes: "", category: "" });

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // Pending filter state
  const [pendingYear, setPendingYear] = useState<string>(String(currentYear));
  const [pendingMonth, setPendingMonth] = useState<string>(String(currentMonth));
  const [pendingDateFrom, setPendingDateFrom] = useState<string>("");
  const [pendingDateTo, setPendingDateTo] = useState<string>("");
  const [pendingUseDateRange, setPendingUseDateRange] = useState<boolean>(false);
  const [pendingMember, setPendingMember] = useState<string>("all");
  const [pendingMethod, setPendingMethod] = useState<string>("all");
  const [pendingCategory, setPendingCategory] = useState<string>("all");
  const [pendingStatus, setPendingStatus] = useState<string>("all");

  // Applied filter state
  const [filterYear, setFilterYear] = useState<string>(String(currentYear));
  const [filterMonth, setFilterMonth] = useState<string>(String(currentMonth));
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");
  const [useDateRange, setUseDateRange] = useState<boolean>(false);
  const [filterMember, setFilterMember] = useState<string>("all");
  const [filterMethod, setFilterMethod] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const resetForm = () => {
    setEditing(null);
    setForm({ memberId: "", amount: "", method: "Cash", date: dayKey(), status: "paid", referenceNo: "", notes: "", category: "" });
  };

  const activeMembers = useMemo(() => members.filter((m) => m.active).sort((a, b) => a.name.localeCompare(b.name)), [members]);

  const yearOptions = useMemo(() => {
    const years = new Set<string>();
    years.add(String(currentYear));
    payments.forEach((p) => { if (p.date) years.add(p.date.substring(0, 4)); });
    return Array.from(years).sort((a, b) => Number(b) - Number(a));
  }, [payments, currentYear]);

  const currentYm = useDateRange ? "" : `${filterYear}-${String(filterMonth).padStart(2, "0")}`;
  const filterLabel = useDateRange
    ? `${filterDateFrom || "Start"} to ${filterDateTo || "End"}`
    : `${monthOptions.find((m) => m.value === filterMonth)?.label} ${filterYear}`;

  const filteredPayments = useMemo(() => {
    let result = [...payments];

    // Date filter
    if (useDateRange) {
      if (filterDateFrom) result = result.filter((p) => p.date >= filterDateFrom);
      if (filterDateTo) result = result.filter((p) => p.date <= filterDateTo);
    } else {
      result = result.filter((p) => p.ym === currentYm);
    }

    if (filterMember !== "all") result = result.filter((p) => p.memberId === filterMember);
    if (filterMethod !== "all") result = result.filter((p) => p.method === filterMethod);
    if (filterCategory !== "all") result = result.filter((p) => p.category === filterCategory);
    if (filterStatus !== "all") result = result.filter((p) => p.status === filterStatus);

    return result;
  }, [payments, useDateRange, filterDateFrom, filterDateTo, currentYm, filterMember, filterMethod, filterCategory, filterStatus]);

  const filteredStats = useMemo(() => {
    const total = filteredPayments.reduce((s, d) => s + d.amount, 0);
    return { total, count: filteredPayments.length };
  }, [filteredPayments]);

  const total = payments.reduce((s, d) => s + d.amount, 0);

  const applyFilters = () => {
    setFilterYear(pendingYear);
    setFilterMonth(pendingMonth);
    setFilterDateFrom(pendingDateFrom);
    setFilterDateTo(pendingDateTo);
    setUseDateRange(pendingUseDateRange);
    setFilterMember(pendingMember);
    setFilterMethod(pendingMethod);
    setFilterCategory(pendingCategory);
    setFilterStatus(pendingStatus);
  };

  const resetFilters = () => {
    const y = String(currentYear);
    const m = String(currentMonth);
    setPendingYear(y); setPendingMonth(m);
    setPendingDateFrom(""); setPendingDateTo(""); setPendingUseDateRange(false);
    setPendingMember("all"); setPendingMethod("all"); setPendingCategory("all"); setPendingStatus("all");
    setFilterYear(y); setFilterMonth(m);
    setFilterDateFrom(""); setFilterDateTo(""); setUseDateRange(false);
    setFilterMember("all"); setFilterMethod("all"); setFilterCategory("all"); setFilterStatus("all");
  };

  const hasActiveFilters = useDateRange || filterYear !== String(currentYear) || filterMonth !== String(currentMonth) || filterMember !== "all" || filterMethod !== "all" || filterCategory !== "all" || filterStatus !== "all";

  const statusVariant = (status: string) => {
    switch (status) { case "paid": return "default"; case "partially_paid": return "secondary"; case "overpaid": return "default"; default: return "destructive"; }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const member = members.find((m) => (m.uid || m.id) === form.memberId);
    if (!member) return toast.error("Pick a member");
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) return toast.error("Enter amount");
    if (form.referenceNo && await checkPaymentReferenceExists(form.referenceNo, form.date)) return toast.error("Payment with this reference already exists for this date");

    try {
      const payload = { memberId: form.memberId, memberName: member.name, amount, method: form.method, date: form.date, ym: form.date.slice(0, 7), status: form.status, referenceNo: form.referenceNo, notes: form.notes, category: form.category || undefined };
      if (profile?.role === "owner" && editing) { await updateDocIn("payments", editing.id, payload); toast.success("Payment updated"); }
      else if (profile?.role === "owner") { await addDocTo("payments", payload); await addDocTo("ledgers", { memberId: form.memberId, memberName: member.name, date: form.date, ym: form.date.slice(0, 7), transactionType: "payment", category: form.category || "payment", amount, notes: form.notes || `Payment via ${form.method}` }); toast.success("Payment recorded"); }
      else if (profile) { await submitChangeRequest({ collectionName: "payments", action: editing ? "update" : "create", title: `${editing ? "Update" : "Add"} payment for ${member.name}`, actor: { uid: profile.uid, name: profile.name, role: profile.role }, targetId: editing?.id, payload, previousData: editing || null }); toast.success("Request sent to admin"); }
      setOpen(false);
      resetForm();
    } catch (err) { toast.error((err as Error).message); }
  };

  return (
    <div>
      <PageHeader
        title="Payments"
        description={`${filterLabel} · ${filteredStats.count} entries totaling ${bdt(filteredStats.total)}`}
        action={
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />Record Payment</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editing ? "Edit" : "Record"} Payment</DialogTitle></DialogHeader>
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>Member</Label><Select value={form.memberId} onValueChange={(v) => setForm({ ...form, memberId: v })}><SelectTrigger><SelectValue placeholder="Select member" /></SelectTrigger><SelectContent>{activeMembers.map(m => <SelectItem key={m.uid || m.id} value={m.uid || m.id}>{m.name}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-2"><Label>Amount (৳)</Label><Input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>Method</Label><Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-2"><Label>Status</Label><Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as Payment["status"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s} className="capitalize">{s.replace("_", " ")}</SelectItem>)}</SelectContent></Select></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Category</Label><Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{EXPENSE_CATEGORY_LABELS[c as keyof typeof EXPENSE_CATEGORY_LABELS] || c}</SelectItem>)}</SelectContent></Select></div>
                </div>
                <div className="space-y-2"><Label>Reference</Label><Input value={form.referenceNo} onChange={(e) => setForm({ ...form, referenceNo: e.target.value })} placeholder="TrxID or ref #" /></div>
                <div className="space-y-2"><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
                <DialogFooter><Button type="submit">Save</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="p-6 space-y-6">
        {/* Summary Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-5"><div className="text-xs uppercase text-muted-foreground">{filterLabel} Payments</div><div className="text-2xl font-bold mt-2">{bdt(filteredStats.total)}</div><div className="text-xs text-muted-foreground mt-1">{filteredStats.count} entries</div></Card>
          <Card className="p-5"><div className="text-xs uppercase text-muted-foreground">All Time Total</div><div className="text-2xl font-bold mt-2">{bdt(total)}</div><div className="text-xs text-muted-foreground mt-1">{payments.length} total entries</div></Card>
          <Card className="p-5"><div className="text-xs uppercase text-muted-foreground">Cash Payments</div><div className="text-2xl font-bold mt-2">{bdt(filteredPayments.filter(p => (p.method as string).toLowerCase() === "cash").reduce((s, p) => s + p.amount, 0))}</div></Card>
          <Card className="p-5"><div className="text-xs uppercase text-muted-foreground">Digital Payments</div><div className="text-2xl font-bold mt-2">{bdt(filteredPayments.filter(p => (p.method as string).toLowerCase() !== "cash").reduce((s, p) => s + p.amount, 0))}</div></Card>
        </div>

        {/* FILTERS BAR (Like meals & bazar) */}
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
            <div className="space-y-1">
              <Label className="text-xs">Mode</Label>
              <Select value={pendingUseDateRange ? "range" : "month"} onValueChange={(v) => setPendingUseDateRange(v === "range")}>
                <SelectTrigger className="w-32 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">Month/Year</SelectItem>
                  <SelectItem value="range">Date Range</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {!pendingUseDateRange ? (
              <>
                <div className="space-y-1"><Label className="text-xs">Month</Label><Select value={pendingMonth} onValueChange={setPendingMonth}><SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger><SelectContent>{monthOptions.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1"><Label className="text-xs">Year</Label><Select value={pendingYear} onValueChange={setPendingYear}><SelectTrigger className="w-28 h-9"><SelectValue /></SelectTrigger><SelectContent>{yearOptions.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent></Select></div>
              </>
            ) : (
              <>
                <div className="space-y-1"><Label className="text-xs">From</Label><Input type="date" value={pendingDateFrom} onChange={(e) => setPendingDateFrom(e.target.value)} className="w-40 h-9" /></div>
                <div className="space-y-1"><Label className="text-xs">To</Label><Input type="date" value={pendingDateTo} onChange={(e) => setPendingDateTo(e.target.value)} className="w-40 h-9" /></div>
              </>
            )}
            <div className="space-y-1"><Label className="text-xs">Member</Label><Select value={pendingMember} onValueChange={setPendingMember}><SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Members</SelectItem>{activeMembers.map((m) => <SelectItem key={m.uid || m.id} value={m.uid || m.id}>{m.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label className="text-xs">Method</Label><Select value={pendingMethod} onValueChange={setPendingMethod}><SelectTrigger className="w-28 h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All</SelectItem>{METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label className="text-xs">Category</Label><Select value={pendingCategory} onValueChange={setPendingCategory}><SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All</SelectItem>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{EXPENSE_CATEGORY_LABELS[c as keyof typeof EXPENSE_CATEGORY_LABELS] || c}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label className="text-xs">Status</Label><Select value={pendingStatus} onValueChange={setPendingStatus}><SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All</SelectItem>{STATUSES.map(s => <SelectItem key={s} value={s} className="capitalize">{s.replace("_", " ")}</SelectItem>)}</SelectContent></Select></div>
            <Button size="sm" className="h-9 px-4" onClick={applyFilters}><Search className="h-4 w-4 mr-1.5" />Search</Button>
          </div>
        </Card>

        {/* ERP-STYLE PAYMENTS TABLE */}
        <Card className="overflow-hidden">
          <div className="p-4 border-b bg-muted/30 flex items-center justify-between">
            <h3 className="font-semibold flex items-center gap-2"><Banknote className="h-4 w-4" />Payments <span className="text-muted-foreground font-normal ml-1">({filteredStats.count} entries)</span></h3>
            <span className="text-sm text-muted-foreground">{filterLabel}</span>
          </div>
          {filteredPayments.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <Banknote className="h-10 w-10 mx-auto opacity-40 mb-3" />
              <p className="font-medium">{payments.length === 0 ? "No payments yet" : "No payments match your filters"}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground bg-muted/50 sticky top-0">
                  <tr>
                    <th className="text-left p-3 font-medium">Date</th>
                    <th className="text-left p-3 font-medium">Member</th>
                    <th className="text-left p-3 font-medium">Category</th>
                    <th className="text-left p-3 font-medium">Method</th>
                    <th className="text-left p-3 font-medium">Ref</th>
                    <th className="text-center p-3 font-medium">Status</th>
                    <th className="text-right p-3 font-medium">Amount</th>
                    {profile && <th className="w-[80px]"></th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredPayments.map((d) => (
                    <tr key={d.id} className="border-t hover:bg-muted/30 transition-colors">
                      <td className="p-3 tabular-nums whitespace-nowrap">{d.date}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <span className="h-6 w-6 rounded-full bg-accent flex items-center justify-center text-xs font-semibold">{d.memberName[0]}</span>
                          <span className="font-medium">{d.memberName}</span>
                        </div>
                      </td>
                      <td className="p-3">{d.category ? <Badge variant="outline" className="text-xs">{EXPENSE_CATEGORY_LABELS[d.category as keyof typeof EXPENSE_CATEGORY_LABELS] || d.category}</Badge> : <span className="text-muted-foreground">—</span>}</td>
                      <td className="p-3"><span className="text-xs text-muted-foreground">{d.method}</span></td>
                      <td className="p-3 text-muted-foreground text-xs">{d.referenceNo || "—"}</td>
                      <td className="p-3 text-center"><Badge variant={statusVariant(d.status) as any} className="text-xs capitalize">{d.status.replace("_", " ")}</Badge></td>
                      <td className="p-3 text-right tabular-nums font-semibold">{bdt(d.amount)}</td>
                      {profile && (
                        <td className="p-3">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setEditing(d); setForm({ memberId: d.memberId, amount: String(d.amount), method: d.method as string, date: d.date, status: d.status, referenceNo: d.referenceNo || "", notes: d.notes || "", category: d.category || "" }); setOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={async () => { if (!confirm("Delete?")) return; if (profile.role === "owner") { await deleteDocFrom("payments", d.id); toast.success("Deleted"); } else { await submitChangeRequest({ collectionName: "payments", action: "delete", title: `Delete payment for ${d.memberName}`, actor: { uid: profile.uid, name: profile.name, role: profile.role }, targetId: d.id, previousData: d }); toast.success("Delete request sent"); } }}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot className="font-semibold bg-muted/30 border-t-2">
                  <tr><td className="p-3" colSpan={6}>Total ({filteredStats.count} entries)</td><td className="p-3 text-right">{bdt(filteredStats.total)}</td>{profile && <td></td>}</tr>
                </tfoot>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}