import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useCollection, addDocTo, updateDocIn, deleteDocFrom, orderBy, type Bazar, type Member } from "@/lib/data";
import { dayKey, bdt } from "@/lib/format";
import { Plus, Trash2, ShoppingBasket, Search, Pencil, Filter, X, Download } from "lucide-react";
import { toast } from "sonner";
import { submitChangeRequest } from "@/lib/workflow";
import { exportToCSV } from "@/lib/export";

export const Route = createFileRoute("/_authed/bazar")({
  component: BazarPage,
});

const CATS = ["Rice", "Oil", "Fish", "Meat", "Vegetables", "Gas", "Water jar", "Snacks", "Cleaning", "Internet", "Other"];

function BazarPage() {
  const { can, profile } = useAuth();
  const { data: members } = useCollection<Member>("members");
  const { data: bazar } = useCollection<Bazar>("bazar", [orderBy("date", "desc")]);

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // Pending filter state (what user is selecting)
  const [pendingYear, setPendingYear] = useState<string>(String(currentYear));
  const [pendingMonth, setPendingMonth] = useState<string>(String(currentMonth));
  const [pendingDateFrom, setPendingDateFrom] = useState<string>("");
  const [pendingDateTo, setPendingDateTo] = useState<string>("");
  const [pendingBuyer, setPendingBuyer] = useState<string>("all");
  const [pendingCategory, setPendingCategory] = useState<string>("all");
  const [pendingUseDateRange, setPendingUseDateRange] = useState<boolean>(false);

  // Applied filter state (what the table uses, only changes on Search click)
  const [filterYear, setFilterYear] = useState<string>(String(currentYear));
  const [filterMonth, setFilterMonth] = useState<string>(String(currentMonth));
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");
  const [filterBuyer, setFilterBuyer] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [useDateRange, setUseDateRange] = useState<boolean>(false);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Bazar | null>(null);
  const [form, setForm] = useState({ buyerId: "", date: dayKey(), category: "Vegetables", total: "", notes: "" });

  const resetForm = () => {
    setEditing(null);
    setForm({ buyerId: "", date: dayKey(), category: "Vegetables", total: "", notes: "" });
  };

  const activeMembers = useMemo(
    () => members.filter((member) => member.active).sort((a, b) => a.name.localeCompare(b.name)),
    [members]
  );

  const yearOptions = useMemo(() => {
    const years = new Set<string>();
    years.add(String(currentYear));
    bazar.forEach((b) => {
      if (b.date) years.add(b.date.substring(0, 4));
      if (b.ym) years.add(b.ym.substring(0, 4));
    });
    return Array.from(years).sort((a, b) => Number(b) - Number(a));
  }, [bazar, currentYear]);

  const monthOptions = [
    { value: "1", label: "January" },
    { value: "2", label: "February" },
    { value: "3", label: "March" },
    { value: "4", label: "April" },
    { value: "5", label: "May" },
    { value: "6", label: "June" },
    { value: "7", label: "July" },
    { value: "8", label: "August" },
    { value: "9", label: "September" },
    { value: "10", label: "October" },
    { value: "11", label: "November" },
    { value: "12", label: "December" },
  ];

  const buyerOptions = useMemo(() => {
    const map = new Map<string, string>();
    bazar.forEach((b) => {
      if (b.buyerId && b.buyerName) map.set(b.buyerId, b.buyerName);
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [bazar]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const buyer = members.find((m) => (m.uid || m.id) === form.buyerId);
    if (!buyer) return toast.error("Pick a buyer");
    const total = parseFloat(form.total);
    if (!total || total <= 0) return toast.error("Enter amount");
    try {
      const payload = {
        buyerId: form.buyerId,
        buyerName: buyer.name,
        date: form.date,
        ym: form.date.slice(0, 7),
        category: form.category,
        items: [{ name: form.category, amount: total }],
        total,
        notes: form.notes,
      };
      if (profile?.role === "owner" && editing) {
        await updateDocIn("bazar", editing.id, payload);
        toast.success("Bazar updated");
      } else if (profile?.role === "owner") {
        await addDocTo("bazar", payload);
        toast.success("Bazar added");
      } else if (profile) {
        await submitChangeRequest({
          collectionName: "bazar",
          action: editing ? "update" : "create",
          title: `${editing ? "Update" : "Add"} bazar by ${buyer.name}`,
          actor: { uid: profile.uid, name: profile.name, role: profile.role },
          targetId: editing?.id,
          payload,
          previousData: editing || null,
        });
        toast.success("Request sent to admin for approval");
      }
      setOpen(false);
      resetForm();
    } catch (err) { toast.error((err as Error).message); }
  };

  const filtered = useMemo(() => {
    let result = [...bazar];
    if (useDateRange) {
      if (filterDateFrom) result = result.filter((b) => b.date >= filterDateFrom);
      if (filterDateTo) result = result.filter((b) => b.date <= filterDateTo);
    } else {
      const ymFilter = `${filterYear}-${String(filterMonth).padStart(2, "0")}`;
      result = result.filter((b) => b.ym === ymFilter);
    }
    if (filterBuyer !== "all") result = result.filter((b) => b.buyerId === filterBuyer);
    if (filterCategory !== "all") result = result.filter((b) => b.category === filterCategory);
    return result;
  }, [bazar, filterYear, filterMonth, filterDateFrom, filterDateTo, filterBuyer, filterCategory, useDateRange]);

  const grand = filtered.reduce((s, b) => s + b.total, 0);

  const buyerSummary = useMemo(() => {
    const map = new Map<string, { name: string; count: number; total: number }>();
    filtered.forEach((b) => {
      const cur = map.get(b.buyerId) || { name: b.buyerName, count: 0, total: 0 };
      cur.count += 1;
      cur.total += b.total;
      map.set(b.buyerId, cur);
    });
    return Array.from(map.entries()).sort((a, b) => b[1].total - a[1].total);
  }, [filtered]);

  const dateSummary = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    filtered.forEach((b) => {
      const cur = map.get(b.date) || { count: 0, total: 0 };
      cur.count += 1;
      cur.total += b.total;
      map.set(b.date, cur);
    });
    return map;
  }, [filtered]);

  const applyFilters = () => {
    setFilterYear(pendingYear);
    setFilterMonth(pendingMonth);
    setFilterDateFrom(pendingDateFrom);
    setFilterDateTo(pendingDateTo);
    setFilterBuyer(pendingBuyer);
    setFilterCategory(pendingCategory);
    setUseDateRange(pendingUseDateRange);
  };

  const resetFilters = () => {
    const y = String(currentYear);
    const m = String(currentMonth);
    setPendingYear(y); setPendingMonth(m); setPendingDateFrom(""); setPendingDateTo("");
    setPendingBuyer("all"); setPendingCategory("all"); setPendingUseDateRange(false);
    setFilterYear(y); setFilterMonth(m); setFilterDateFrom(""); setFilterDateTo("");
    setFilterBuyer("all"); setFilterCategory("all"); setUseDateRange(false);
  };

  const handleExport = () => {
    if (filtered.length === 0) return toast.error("No data to export");
    const rows = filtered.map((b) => ({
      Date: b.date, Buyer: b.buyerName, Category: b.category, Notes: b.notes || "", Amount: b.total,
    }));
    exportToCSV(rows, `bazar-${useDateRange ? `${filterDateFrom || "start"}-to-${filterDateTo || "end"}` : `${filterYear}-${filterMonth.padStart(2, "0")}`}`);
    toast.success("Exported successfully");
  };

  const filterLabel = useDateRange
    ? `${filterDateFrom || "Start"} to ${filterDateTo || "End"}`
    : `${monthOptions.find((m) => m.value === filterMonth)?.label} ${filterYear}`;

  const hasActiveFilters = useDateRange || filterBuyer !== "all" || filterCategory !== "all" || filterYear !== String(currentYear) || filterMonth !== String(currentMonth);

  return (
    <div>
      <PageHeader
        title="Bazar"
        description={`${filtered.length} entries · ${bdt(grand)} total · ${filterLabel}`}
        action={profile && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExport} disabled={filtered.length === 0}>
              <Download className="h-4 w-4 mr-1" />Export
            </Button>
            <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (!value) resetForm(); }}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />Add bazar</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} bazar entry</DialogTitle></DialogHeader>
                <form onSubmit={onSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Buyer</Label>
                      <Select value={form.buyerId} onValueChange={(v) => setForm({ ...form, buyerId: v })}>
                        <SelectTrigger><SelectValue placeholder="Who bought?" /></SelectTrigger>
                        <SelectContent>
                          {activeMembers.map((m) => <SelectItem key={m.uid || m.id} value={m.uid || m.id}>{m.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2"><Label>Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Category</Label>
                      <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{CATS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2"><Label>Amount (৳)</Label><Input type="number" min="0" step="0.01" value={form.total} onChange={(e) => setForm({ ...form, total: e.target.value })} required /></div>
                  </div>
                  <div className="space-y-2"><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Details, items, etc." /></div>
                  <DialogFooter><Button type="submit">Save</Button></DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        )}
      />

      <div className="p-6 space-y-4">
        {/* Filters Bar */}
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
              </>
            ) : (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">From</Label>
                  <Input type="date" value={pendingDateFrom} onChange={(e) => setPendingDateFrom(e.target.value)} className="w-40 h-9" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">To</Label>
                  <Input type="date" value={pendingDateTo} onChange={(e) => setPendingDateTo(e.target.value)} className="w-40 h-9" />
                </div>
              </>
            )}
            <div className="space-y-1">
              <Label className="text-xs">Buyer</Label>
              <Select value={pendingBuyer} onValueChange={setPendingBuyer}>
                <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Buyers</SelectItem>
                  {buyerOptions.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Category</Label>
              <Select value={pendingCategory} onValueChange={setPendingCategory}>
                <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {CATS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" className="h-9 px-4" onClick={applyFilters}>
              <Search className="h-4 w-4 mr-1.5" />Search
            </Button>
          </div>
        </Card>

        {/* Summary Cards */}
        {buyerSummary.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {buyerSummary.map(([id, v]) => (
              <Card key={id} className="p-3">
                <div className="text-xs uppercase text-muted-foreground font-medium truncate">{v.name}</div>
                <div className="text-xl font-bold tabular-nums mt-1">{bdt(v.total)}</div>
                <div className="text-[10px] text-muted-foreground mt-1">{v.count} entr{v.count !== 1 ? 'ies' : 'y'}</div>
              </Card>
            ))}
          </div>
        )}

        {/* ERP Table */}
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-muted/50 border-y-2 border-border">
                  <th className="text-left px-3 py-2.5 font-semibold text-xs uppercase tracking-wider text-muted-foreground w-[110px]">Date</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-xs uppercase tracking-wider text-muted-foreground w-[140px]">Buyer</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-xs uppercase tracking-wider text-muted-foreground w-[120px]">Category</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Notes</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-xs uppercase tracking-wider text-muted-foreground w-[120px]">Amount</th>
                  {profile && <th className="w-[100px]"></th>}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={profile ? 6 : 5} className="text-center py-12 text-muted-foreground">
                      <ShoppingBasket className="h-8 w-8 mx-auto opacity-30 mb-2" />
                      <div className="text-sm">No bazar entries found for the selected filters</div>
                    </td>
                  </tr>
                ) : (
                  filtered.map((b, idx) => {
                    const prevBazar = filtered[idx - 1];
                    const showDateHeader = idx === 0 || (prevBazar && prevBazar.date !== b.date);
                    const dSummary = dateSummary.get(b.date);
                    return (
                      <>
                        {showDateHeader && (
                          <tr key={`header-${b.date}`} className="bg-muted/30 border-y border-border">
                            <td colSpan={profile ? 6 : 5} className="px-3 py-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-foreground">{b.date}</span>
                                {dSummary && (
                                  <div className="flex gap-3 text-[10px] text-muted-foreground font-medium">
                                    <span>{dSummary.count} entr{dSummary.count !== 1 ? 'ies' : 'y'}</span>
                                    <span className="tabular-nums">Total: {bdt(dSummary.total)}</span>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                        <tr key={b.id} className={`border-b border-border/50 hover:bg-muted/20 transition-colors ${idx % 2 === 0 ? "bg-background" : "bg-muted/5"}`}>
                          <td className="px-3 py-2 text-xs tabular-nums text-muted-foreground font-medium">{b.date}</td>
                          <td className="px-3 py-2 font-medium text-foreground">{b.buyerName}</td>
                          <td className="px-3 py-2">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-muted text-muted-foreground">{b.category}</span>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground max-w-xs truncate text-xs">{b.notes || "—"}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-bold text-foreground">{bdt(b.total)}</td>
                          {profile && (
                            <td className="px-3 py-2">
                              <div className="flex justify-end gap-1">
                                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => { setEditing(b); setForm({ buyerId: b.buyerId, date: b.date, category: b.category, total: String(b.total), notes: b.notes || "" }); setOpen(true); }}>
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive hover:text-destructive" onClick={async () => {
                                  if (!profile) return;
                                  if (profile.role === "owner") {
                                    await deleteDocFrom("bazar", b.id);
                                    toast.success("Deleted");
                                  } else {
                                    await submitChangeRequest({ collectionName: "bazar", action: "delete", title: `Delete bazar ${b.category}`, actor: { uid: profile.uid, name: profile.name, role: profile.role }, targetId: b.id, previousData: b });
                                    toast.success("Delete request sent to admin");
                                  }
                                }}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </td>
                          )}
                        </tr>
                      </>
                    );
                  })
                )}
              </tbody>
              {filtered.length > 0 && (
                <tfoot>
                  <tr className="bg-muted/50 border-t-2 border-border font-bold">
                    <td className="px-3 py-2.5 text-xs uppercase tracking-wider text-muted-foreground" colSpan={4}>Grand Total ({filtered.length} entries)</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-foreground text-base">{bdt(grand)}</td>
                    {profile && <td></td>}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}