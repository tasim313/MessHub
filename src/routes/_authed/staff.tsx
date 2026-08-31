import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  addDocTo,
  deleteDocFrom,
  orderBy,
  updateDocIn,
  useCollection,
  type Staff,
} from "@/lib/data";
import { bdt, dayKey } from "@/lib/format";
import {
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UsersRound,
  Filter,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { submitChangeRequest } from "@/lib/workflow";
import { checkStaffHasAllocations } from "@/lib/duplicate-check";

export const Route = createFileRoute("/_authed/staff")({
  component: StaffPage,
});

const ROLES: Staff["role"][] = [
  "manager",
  "cook",
  "cleaner",
  "security",
  "helper",
  "accountant",
];
const STATUSES: Staff["status"][] = ["active", "inactive", "on_leave"];

const blankStaff: Omit<Staff, "id"> = {
  name: "",
  phone: "",
  role: "cook",
  salary: 0,
  advance: 0,
  overtime: 0,
  bonus: 0,
  leaveDays: 0,
  attendanceDays: 0,
  paidAmount: 0,
  status: "active",
  joinedAt: dayKey(),
  notes: "",
};

function StaffPage() {
  const { profile } = useAuth();
  const { data: staff } = useCollection<Staff>("staff", [
    orderBy("name", "asc"),
  ]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Staff | null>(null);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(true);
  const [form, setForm] = useState<Omit<Staff, "id">>(blankStaff);

  const payroll = useMemo(() => {
    return staff.reduce(
      (acc, item) => {
        if (item.status !== "inactive") {
          const payable =
            (item.salary || 0) +
            (item.overtime || 0) +
            (item.bonus || 0) -
            (item.advance || 0);
          acc.gross += item.salary || 0;
          acc.payable += payable;
          acc.paid += item.paidAmount || 0;
        }
        return acc;
      },
      { gross: 0, payable: 0, paid: 0 },
    );
  }, [staff]);

  const filtered = useMemo(() => {
    let result = [...staff];

    if (filterRole !== "all") {
      result = result.filter((item) => item.role === filterRole);
    }

    if (filterStatus !== "all") {
      result = result.filter((item) => item.status === filterStatus);
    }

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter((item) => {
        const haystack = `${item.name} ${item.phone || ""} ${item.role} ${item.status} ${item.salary} ${item.notes || ""}`.toLowerCase();
        return haystack.includes(q);
      });
    }

    return result;
  }, [staff, filterRole, filterStatus, search]);

  const resetFilters = () => {
    setSearch("");
    setFilterRole("all");
    setFilterStatus("all");
  };

  const hasActiveFilters = search.trim() !== "" || filterRole !== "all" || filterStatus !== "all";

  const reset = () => {
    setEditing(null);
    setForm(blankStaff);
  };

  const saveStaff = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (!profile) return;
    if (!form.name.trim()) return toast.error("Staff name is required");

    if (!editing) {
      const nameLower = form.name.trim().toLowerCase();
      const duplicate = staff.some(
        (s) =>
          s.status !== "inactive" &&
          s.name.trim().toLowerCase() === nameLower &&
          (!form.role || s.role === form.role),
      );
      if (duplicate) {
        return toast.error(`An active staff member named "${form.name.trim()}" already exists — check for a duplicate entry`);
      }
    }

    const payload = {
      ...form,
      // Never trust the HTML min="0" alone — it can be bypassed (devtools,
      // programmatic form fill). Clamp every figure to a non-negative value.
      salary: Math.max(0, Number(form.salary) || 0),
      advance: Math.max(0, Number(form.advance) || 0),
      overtime: Math.max(0, Number(form.overtime) || 0),
      bonus: Math.max(0, Number(form.bonus) || 0),
      leaveDays: Math.max(0, Number(form.leaveDays) || 0),
      attendanceDays: Math.max(0, Number(form.attendanceDays) || 0),
      paidAmount: Math.max(0, Number(form.paidAmount) || 0),
    };
    setSaving(true);
    try {
      if (profile.role === "owner" && editing) {
        await updateDocIn("staff", editing.id, payload);
        toast.success("Staff updated");
      } else if (profile.role === "owner") {
        await addDocTo("staff", payload);
        toast.success("Staff added");
      } else {
        await submitChangeRequest({
          collectionName: "staff",
          action: editing ? "update" : "create",
          title: `${editing ? "Update" : "Add"} staff ${payload.name}`,
          actor: { uid: profile.uid, name: profile.name, role: profile.role },
          targetId: editing?.id,
          payload,
          previousData: editing || null,
        });
        toast.success("Staff request sent to admin");
      }
      setOpen(false);
      reset();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const deleteStaff = async (item: Staff) => {
    if (!profile) return;
    if (await checkStaffHasAllocations(item.id)) {
      toast.error(`Cannot delete ${item.name} — past months' charges still reference this staff record. Mark them inactive instead.`);
      return;
    }
    if (!confirm(`Delete ${item.name}?`)) return;
    if (profile.role === "owner") {
      await deleteDocFrom("staff", item.id);
      toast.success("Staff deleted");
      return;
    }
    await submitChangeRequest({
      collectionName: "staff",
      action: "delete",
      title: `Delete staff ${item.name}`,
      actor: { uid: profile.uid, name: profile.name, role: profile.role },
      targetId: item.id,
      previousData: item,
    });
    toast.success("Delete request sent to admin");
  };

  return (
    <div>
      <PageHeader
        title="Staff & payroll"
        description={`${staff.filter((item) => item.status !== "inactive").length} active staff · ${bdt(payroll.payable)} payable · ${bdt(payroll.paid)} paid`}
        action={
          profile && (
            <Dialog
              open={open}
              onOpenChange={(value) => {
                setOpen(value);
                if (!value) reset();
              }}
            >
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-1 h-4 w-4" />
                  Add staff
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editing ? "Edit" : "Add"} staff</DialogTitle>
                </DialogHeader>
                <form onSubmit={saveStaff} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Name</Label>
                      <Input
                        required
                        value={form.name}
                        onChange={(e) =>
                          setForm({ ...form, name: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Phone</Label>
                      <Input
                        value={form.phone || ""}
                        onChange={(e) =>
                          setForm({ ...form, phone: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-2">
                      <Label>Role</Label>
                      <Select
                        value={form.role}
                        onValueChange={(value) =>
                          setForm({ ...form, role: value as Staff["role"] })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map((role) => (
                            <SelectItem
                              key={role}
                              value={role}
                              className="capitalize"
                            >
                              {role}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select
                        value={form.status}
                        onValueChange={(value) =>
                          setForm({ ...form, status: value as Staff["status"] })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((status) => (
                            <SelectItem
                              key={status}
                              value={status}
                              className="capitalize"
                            >
                              {status.replace("_", " ")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Joined</Label>
                      <Input
                        type="date"
                        value={form.joinedAt || ""}
                        onChange={(e) =>
                          setForm({ ...form, joinedAt: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-3">
                    <div className="space-y-2">
                      <Label>Salary</Label>
                      <Input
                        type="number"
                        min="0"
                        value={form.salary}
                        onChange={(e) =>
                          setForm({ ...form, salary: Number(e.target.value) })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Advance</Label>
                      <Input
                        type="number"
                        min="0"
                        value={form.advance || 0}
                        onChange={(e) =>
                          setForm({ ...form, advance: Number(e.target.value) })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Overtime</Label>
                      <Input
                        type="number"
                        min="0"
                        value={form.overtime || 0}
                        onChange={(e) =>
                          setForm({ ...form, overtime: Number(e.target.value) })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Bonus</Label>
                      <Input
                        type="number"
                        min="0"
                        value={form.bonus || 0}
                        onChange={(e) =>
                          setForm({ ...form, bonus: Number(e.target.value) })
                        }
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-2">
                      <Label>Attendance</Label>
                      <Input
                        type="number"
                        min="0"
                        value={form.attendanceDays || 0}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            attendanceDays: Number(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Leave</Label>
                      <Input
                        type="number"
                        min="0"
                        value={form.leaveDays || 0}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            leaveDays: Number(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Paid</Label>
                      <Input
                        type="number"
                        min="0"
                        value={form.paidAmount || 0}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            paidAmount: Number(e.target.value),
                          })
                        }
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea
                      rows={2}
                      value={form.notes || ""}
                      onChange={(e) =>
                        setForm({ ...form, notes: e.target.value })
                      }
                    />
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )
        }
      />
      <div className="space-y-4 p-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="p-4">
            <div className="text-xs uppercase text-muted-foreground">
              Gross salary
            </div>
            <div className="mt-2 text-2xl font-bold">{bdt(payroll.gross)}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs uppercase text-muted-foreground">
              Net payable
            </div>
            <div className="mt-2 text-2xl font-bold">
              {bdt(payroll.payable)}
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-xs uppercase text-muted-foreground">
              {payroll.payable - payroll.paid >= 0 ? "Outstanding" : "Overpaid"}
            </div>
            <div className="mt-2 text-2xl font-bold">
              {bdt(Math.abs(payroll.payable - payroll.paid))}
            </div>
          </Card>
        </div>
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search staff by name, role, salary..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Button variant={showFilters ? "default" : "outline"} size="sm" onClick={() => setShowFilters(!showFilters)} className="gap-1.5">
              <Filter className="h-4 w-4" />Filters
              {(filterRole !== "all" || filterStatus !== "all") && (
                <span className="ml-1 h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
                  {[filterRole !== "all" ? 1 : 0, filterStatus !== "all" ? 1 : 0].reduce((a, b) => a + b, 0)}
                </span>
              )}
            </Button>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={resetFilters} className="gap-1.5 text-muted-foreground">
                <RotateCcw className="h-3.5 w-3.5" />Reset
              </Button>
            )}
          </div>
          {showFilters && (
            <div className="mt-4 pt-4 border-t space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <Label className="text-sm font-medium whitespace-nowrap">Role:</Label>
                <Select value={filterRole} onValueChange={setFilterRole}>
                  <SelectTrigger className="w-44"><SelectValue placeholder="All Roles" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Roles</SelectItem>
                    {ROLES.map((role) => <SelectItem key={role} value={role} className="capitalize">{role}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Label className="text-sm font-medium whitespace-nowrap ml-2">Status:</Label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-40"><SelectValue placeholder="All" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    {STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s.replace("_", " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {hasActiveFilters && (
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium">Active:</span>
                  {filterRole !== "all" && <Badge variant="secondary" className="text-xs capitalize">Role: {filterRole}</Badge>}
                  {filterStatus !== "all" && <Badge variant="secondary" className="text-xs capitalize">Status: {filterStatus}</Badge>}
                  {search.trim() && <Badge variant="secondary" className="text-xs">Search: "{search}"</Badge>}
                </div>
              )}
            </div>
          )}
        </Card>
        {filtered.length === 0 ? (
          <Card className="p-12 text-center text-muted-foreground">
            <UsersRound className="mx-auto mb-3 h-10 w-10 opacity-40" />
            No staff found
          </Card>
        ) : (
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="p-3 text-left font-medium">Staff</th>
                    <th className="p-3 text-left font-medium">Role</th>
                    <th className="p-3 text-right font-medium">Salary</th>
                    <th className="p-3 text-right font-medium">Adjustments</th>
                    <th className="p-3 text-right font-medium">Net payable</th>
                    <th className="p-3 text-left font-medium">Attendance</th>
                    {profile && <th />}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => {
                    const net =
                      (item.salary || 0) +
                      (item.overtime || 0) +
                      (item.bonus || 0) -
                      (item.advance || 0);
                    return (
                      <tr key={item.id} className="border-t hover:bg-muted/30">
                        <td className="p-3">
                          <div className="font-medium">{item.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {item.phone || "No phone"}
                          </div>
                        </td>
                        <td className="p-3">
                          <Badge variant="secondary" className="capitalize">
                            <ShieldCheck className="mr-1 h-3 w-3" />
                            {item.role}
                          </Badge>
                        </td>
                        <td className="p-3 text-right font-semibold tabular-nums">
                          {bdt(item.salary)}
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          {bdt(
                            (item.overtime || 0) +
                              (item.bonus || 0) -
                              (item.advance || 0),
                          )}
                        </td>
                        <td className="p-3 text-right font-semibold tabular-nums">
                          {bdt(net)}
                        </td>
                        <td className="p-3 text-muted-foreground">
                          {item.attendanceDays || 0} present ·{" "}
                          {item.leaveDays || 0} leave
                        </td>
                        {profile && (
                          <td className="p-3">
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setEditing(item);
                                  setForm({ ...item });
                                  setOpen(true);
                                }}
                              >
                                <Pencil className="mr-1 h-3.5 w-3.5" />
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => deleteStaff(item)}
                              >
                                <Trash2 className="mr-1 h-3.5 w-3.5" />
                                Delete
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
