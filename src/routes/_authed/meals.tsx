import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useCollection, addDocTo, updateDocIn, deleteDocFrom, orderBy, type MealEntry, type Member } from "@/lib/data";
import { dayKey, ymKey } from "@/lib/format";
import { Plus, Trash2, Utensils, Pencil, Filter, X, Download, Search } from "lucide-react";
import { toast } from "sonner";
import { submitChangeRequest } from "@/lib/workflow";
import { exportToCSV } from "@/lib/export";

export const Route = createFileRoute("/_authed/meals")({
  component: MealsPage,
});

function MealsPage() {
  const { can, profile } = useAuth();
  const { data: members } = useCollection<Member>("members");
  const { data: meals } = useCollection<MealEntry>("meals", [orderBy("date", "desc")]);

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // Pending filter state (what user is selecting)
  const [pendingYear, setPendingYear] = useState<string>(String(currentYear));
  const [pendingMonth, setPendingMonth] = useState<string>(String(currentMonth));
  const [pendingDateFrom, setPendingDateFrom] = useState<string>("");
  const [pendingDateTo, setPendingDateTo] = useState<string>("");
  const [pendingMember, setPendingMember] = useState<string>("all");
  const [pendingUseDateRange, setPendingUseDateRange] = useState<boolean>(false);

  // Applied filter state (what the table uses, only changes on Search click)
  const [filterYear, setFilterYear] = useState<string>(String(currentYear));
  const [filterMonth, setFilterMonth] = useState<string>(String(currentMonth));
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");
  const [filterMember, setFilterMember] = useState<string>("all");
  const [useDateRange, setUseDateRange] = useState<boolean>(false);

  const activeMembers = useMemo(
    () => members.filter((member) => member.active).sort((a, b) => a.name.localeCompare(b.name)),
    [members]
  );

  // Generate year options from meals data
  const yearOptions = useMemo(() => {
    const years = new Set<string>();
    years.add(String(currentYear));
    meals.forEach((m) => {
      if (m.date) years.add(m.date.substring(0, 4));
      if (m.ym) years.add(m.ym.substring(0, 4));
    });
    return Array.from(years).sort((a, b) => Number(b) - Number(a));
  }, [meals, currentYear]);

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

  // Filtered meals
  const filteredMeals = useMemo(() => {
    let result = [...meals];

    if (useDateRange) {
      // Date range filter
      if (filterDateFrom) {
        result = result.filter((m) => m.date >= filterDateFrom);
      }
      if (filterDateTo) {
        result = result.filter((m) => m.date <= filterDateTo);
      }
    } else {
      // Month/Year filter
      const ymFilter = `${filterYear}-${String(filterMonth).padStart(2, "0")}`;
      result = result.filter((m) => m.ym === ymFilter);
    }

    // Member filter
    if (filterMember !== "all") {
      result = result.filter((m) => m.memberId === filterMember);
    }

    // Already sorted desc by date from Firestore query
    return result;
  }, [meals, filterYear, filterMonth, filterDateFrom, filterDateTo, filterMember, useDateRange]);

  // Summary by member
  const memberSummary = useMemo(() => {
    const map = new Map<string, { name: string; breakfast: number; lunch: number; dinner: number; guest: number; total: number }>();
    filteredMeals.forEach((m) => {
      const key = m.memberId;
      const cur = map.get(key) || { name: m.memberName, breakfast: 0, lunch: 0, dinner: 0, guest: 0, total: 0 };
      cur.breakfast += m.breakfast || 0;
      cur.lunch += m.lunch || 0;
      cur.dinner += m.dinner || 0;
      cur.guest += m.guest || 0;
      cur.total += (m.breakfast || 0) + (m.lunch || 0) + (m.dinner || 0) + (m.guest || 0);
      map.set(key, cur);
    });
    return Array.from(map.entries()).sort((a, b) => a[1].name.localeCompare(b[1].name));
  }, [filteredMeals]);

  const grandTotals = useMemo(() => {
    return memberSummary.reduce(
      (acc, [, v]) => ({
        breakfast: acc.breakfast + v.breakfast,
        lunch: acc.lunch + v.lunch,
        dinner: acc.dinner + v.dinner,
        guest: acc.guest + v.guest,
        total: acc.total + v.total,
      }),
      { breakfast: 0, lunch: 0, dinner: 0, guest: 0, total: 0 }
    );
  }, [memberSummary]);

  // Date summary (grouped by date)
  const dateSummary = useMemo(() => {
    const map = new Map<string, { breakfast: number; lunch: number; dinner: number; guest: number; total: number; members: number }>();
    filteredMeals.forEach((m) => {
      const cur = map.get(m.date) || { breakfast: 0, lunch: 0, dinner: 0, guest: 0, total: 0, members: 0 };
      cur.breakfast += m.breakfast || 0;
      cur.lunch += m.lunch || 0;
      cur.dinner += m.dinner || 0;
      cur.guest += m.guest || 0;
      cur.total += (m.breakfast || 0) + (m.lunch || 0) + (m.dinner || 0) + (m.guest || 0);
      cur.members += 1;
      map.set(m.date, cur);
    });
    return map;
  }, [filteredMeals]);

  const applyFilters = () => {
    setFilterYear(pendingYear);
    setFilterMonth(pendingMonth);
    setFilterDateFrom(pendingDateFrom);
    setFilterDateTo(pendingDateTo);
    setFilterMember(pendingMember);
    setUseDateRange(pendingUseDateRange);
  };

  const resetFilters = () => {
    const y = String(currentYear);
    const m = String(currentMonth);
    setPendingYear(y);
    setPendingMonth(m);
    setPendingDateFrom("");
    setPendingDateTo("");
    setPendingMember("all");
    setPendingUseDateRange(false);
    setFilterYear(y);
    setFilterMonth(m);
    setFilterDateFrom("");
    setFilterDateTo("");
    setFilterMember("all");
    setUseDateRange(false);
  };

  const hasPendingChanges =
    pendingYear !== filterYear ||
    pendingMonth !== filterMonth ||
    pendingDateFrom !== filterDateFrom ||
    pendingDateTo !== filterDateTo ||
    pendingMember !== filterMember ||
    pendingUseDateRange !== useDateRange;

  const handleExport = () => {
    if (filteredMeals.length === 0) {
      toast.error("No data to export");
      return;
    }
    const rows = filteredMeals.map((m) => ({
      Date: m.date,
      Member: m.memberName,
      Breakfast: m.breakfast || 0,
      Lunch: m.lunch || 0,
      Dinner: m.dinner || 0,
      Guest: m.guest || 0,
      Total: (m.breakfast || 0) + (m.lunch || 0) + (m.dinner || 0) + (m.guest || 0),
    }));
    exportToCSV(rows, `meals-${useDateRange ? `${filterDateFrom || "start"}-to-${filterDateTo || "end"}` : `${filterYear}-${filterMonth.padStart(2, "0")}`}`);
    toast.success("Exported successfully");
  };

  // Dialog state
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MealEntry | null>(null);
  const [form, setForm] = useState({
    memberId: "",
    date: dayKey(),
    breakfast: 0,
    lunch: 1,
    dinner: 1,
    guest: 0,
  });

  const resetForm = () => {
    setEditing(null);
    setForm({
      memberId: "",
      date: dayKey(),
      breakfast: 0,
      lunch: 1,
      dinner: 1,
      guest: 0,
    });
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.memberId) return toast.error("Pick a member");
    const member = members.find((m) => (m.uid || m.id) === form.memberId);
    if (!member) return;
    try {
      const payload = {
        memberId: form.memberId,
        memberName: member.name,
        date: form.date,
        ym: form.date.slice(0, 7),
        breakfast: Number(form.breakfast) || 0,
        lunch: Number(form.lunch) || 0,
        dinner: Number(form.dinner) || 0,
        guest: Number(form.guest) || 0,
      };
      if (profile?.role === "owner" && editing) {
        await updateDocIn("meals", editing.id, payload);
        toast.success("Meal updated");
      } else if (profile?.role === "owner") {
        await addDocTo("meals", payload);
        toast.success("Meal logged");
      } else if (profile) {
        await submitChangeRequest({
          collectionName: "meals",
          action: editing ? "update" : "create",
          title: `${editing ? "Update" : "Add"} meal for ${member.name}`,
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

  const filterLabel = useDateRange
    ? `${filterDateFrom || "Start"} to ${filterDateTo || "End"}`
    : `${monthOptions.find((m) => m.value === filterMonth)?.label} ${filterYear}`;

  const hasActiveFilters = useDateRange || filterMember !== "all" || filterYear !== String(currentYear) || filterMonth !== String(currentMonth);

  return (
    <div>
      <PageHeader
        title="Meals"
        description={`${filteredMeals.length} entries · ${grandTotals.total} total meals · ${filterLabel}`}
        action={profile && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExport} disabled={filteredMeals.length === 0}>
              <Download className="h-4 w-4 mr-1" />Export
            </Button>
            <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (!value) resetForm(); }}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />Log meal</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{editing ? "Edit" : "Log"} meal entry</DialogTitle></DialogHeader>
                <form onSubmit={onSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Member</Label>
                      <Select value={form.memberId} onValueChange={(v) => setForm({ ...form, memberId: v })}>
                        <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                        <SelectContent>
                          {activeMembers.map((m) => <SelectItem key={m.uid || m.id} value={m.uid || m.id}>{m.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2"><Label>Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
                  </div>
                  <div className="grid grid-cols-4 gap-3">
                    {(["breakfast", "lunch", "dinner", "guest"] as const).map((k) => (
                      <div key={k} className="space-y-2">
                        <Label className="capitalize">{k}</Label>
                        <Input type="number" step="0.5" min="0" value={form[k]} onChange={(e) => setForm({ ...form, [k]: Number(e.target.value) || 0 })} />
                      </div>
                    ))}
                  </div>
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
            {/* Filter mode toggle */}
            <div className="space-y-1">
              <Label className="text-xs">Mode</Label>
              <Select value={pendingUseDateRange ? "range" : "month"} onValueChange={(v) => setPendingUseDateRange(v === "range")}>
                <SelectTrigger className="w-32 h-9">
                  <SelectValue />
                </SelectTrigger>
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
                    <SelectTrigger className="w-36 h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {monthOptions.map((m) => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Year</Label>
                  <Select value={pendingYear} onValueChange={setPendingYear}>
                    <SelectTrigger className="w-28 h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {yearOptions.map((y) => (
                        <SelectItem key={y} value={y}>{y}</SelectItem>
                      ))}
                    </SelectContent>
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
              <Label className="text-xs">Member</Label>
              <Select value={pendingMember} onValueChange={setPendingMember}>
                <SelectTrigger className="w-44 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Members</SelectItem>
                  {activeMembers.map((m) => (
                    <SelectItem key={m.uid || m.id} value={m.uid || m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Search / Apply Filter Button */}
            <Button
              size="sm"
              className="h-9 px-4"
              onClick={applyFilters}
            >
              <Search className="h-4 w-4 mr-1.5" />Search
            </Button>
          </div>
        </Card>

        {/* Summary Cards */}
        {memberSummary.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {memberSummary.map(([id, v]) => (
              <Card key={id} className="p-3">
                <div className="text-xs uppercase text-muted-foreground font-medium truncate">{v.name}</div>
                <div className="text-xl font-bold tabular-nums mt-1">{v.total}</div>
                <div className="flex gap-2 mt-1 text-[10px] text-muted-foreground">
                  <span>B:{v.breakfast}</span>
                  <span>L:{v.lunch}</span>
                  <span>D:{v.dinner}</span>
                  <span>G:{v.guest}</span>
                </div>
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
                  <th className="text-left px-3 py-2.5 font-semibold text-xs uppercase tracking-wider text-muted-foreground w-[160px]">Member</th>
                  <th className="text-center px-3 py-2.5 font-semibold text-xs uppercase tracking-wider text-muted-foreground w-[60px]">B</th>
                  <th className="text-center px-3 py-2.5 font-semibold text-xs uppercase tracking-wider text-muted-foreground w-[60px]">L</th>
                  <th className="text-center px-3 py-2.5 font-semibold text-xs uppercase tracking-wider text-muted-foreground w-[60px]">D</th>
                  <th className="text-center px-3 py-2.5 font-semibold text-xs uppercase tracking-wider text-muted-foreground w-[60px]">G</th>
                  <th className="text-center px-3 py-2.5 font-semibold text-xs uppercase tracking-wider text-muted-foreground w-[70px]">Total</th>
                  {profile && <th className="w-[120px]"></th>}
                </tr>
              </thead>
              <tbody>
                {filteredMeals.length === 0 ? (
                  <tr>
                    <td colSpan={profile ? 8 : 7} className="text-center py-12 text-muted-foreground">
                      <Utensils className="h-8 w-8 mx-auto opacity-30 mb-2" />
                      <div className="text-sm">No meal entries found for the selected filters</div>
                    </td>
                  </tr>
                ) : (
                  filteredMeals.map((m, idx) => {
                    const total = (m.breakfast || 0) + (m.lunch || 0) + (m.dinner || 0) + (m.guest || 0);
                    // Show date grouping header
                    const prevMeal = filteredMeals[idx - 1];
                    const showDateHeader = idx === 0 || (prevMeal && prevMeal.date !== m.date);
                    const dateStats = dateSummary.get(m.date);

                    return (
                      <>
                        {showDateHeader && (
                          <tr key={`header-${m.date}`} className="bg-muted/30 border-y border-border">
                            <td colSpan={profile ? 8 : 7} className="px-3 py-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-foreground">{m.date}</span>
                                {dateStats && (
                                  <div className="flex gap-3 text-[10px] text-muted-foreground font-medium">
                                    <span>{dateStats.members} member{dateStats.members !== 1 ? 's' : ''}</span>
                                    <span className="tabular-nums">Total: {dateStats.total}</span>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                        <tr
                          key={m.id}
                          className={`border-b border-border/50 hover:bg-muted/20 transition-colors ${idx % 2 === 0 ? "bg-background" : "bg-muted/5"}`}
                        >
                          <td className="px-3 py-2 text-xs tabular-nums text-muted-foreground font-medium">{m.date}</td>
                          <td className="px-3 py-2 font-medium text-foreground">{m.memberName}</td>
                          <td className="px-3 py-2 text-center tabular-nums">{m.breakfast || 0}</td>
                          <td className="px-3 py-2 text-center tabular-nums">{m.lunch || 0}</td>
                          <td className="px-3 py-2 text-center tabular-nums">{m.dinner || 0}</td>
                          <td className="px-3 py-2 text-center tabular-nums">{m.guest || 0}</td>
                          <td className="px-3 py-2 text-center tabular-nums font-bold text-foreground">{total}</td>
                          {profile && (
                            <td className="px-3 py-2">
                              <div className="flex justify-end gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2"
                                  onClick={() => {
                                    setEditing(m);
                                    setForm({ memberId: m.memberId, date: m.date, breakfast: m.breakfast || 0, lunch: m.lunch || 0, dinner: m.dinner || 0, guest: m.guest || 0 });
                                    setOpen(true);
                                  }}
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2 text-destructive hover:text-destructive"
                                  onClick={async () => {
                                    if (!profile) return;
                                    if (profile.role === "owner") {
                                      await deleteDocFrom("meals", m.id);
                                      toast.success("Deleted");
                                    } else {
                                      await submitChangeRequest({
                                        collectionName: "meals",
                                        action: "delete",
                                        title: `Delete meal for ${m.memberName}`,
                                        actor: { uid: profile.uid, name: profile.name, role: profile.role },
                                        targetId: m.id,
                                        previousData: m,
                                      });
                                      toast.success("Delete request sent to admin");
                                    }
                                  }}
                                >
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

              {/* Summary Footer */}
              {filteredMeals.length > 0 && (
                <tfoot>
                  <tr className="bg-muted/50 border-t-2 border-border font-bold">
                    <td className="px-3 py-2.5 text-xs uppercase tracking-wider text-muted-foreground" colSpan={2}>
                      Grand Total ({filteredMeals.length} entries)
                    </td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-foreground">{grandTotals.breakfast}</td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-foreground">{grandTotals.lunch}</td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-foreground">{grandTotals.dinner}</td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-foreground">{grandTotals.guest}</td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-foreground text-base">{grandTotals.total}</td>
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