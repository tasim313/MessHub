import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  useCollection,
  addDocTo,
  updateDocIn,
  deleteDocFrom,
  syncUserRole,
  type Member,
  type Room,
  type Utility,
} from "@/lib/data";
import { Plus, Pencil, Trash2, UserCircle2 } from "lucide-react";
import { toast } from "sonner";
import { submitChangeRequest } from "@/lib/workflow";
import type { ServiceType } from "@/lib/types";

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

export const Route = createFileRoute("/_authed/members")({
  component: MembersPage,
});

function MembersPage() {
  const { can, profile } = useAuth();
  const { data: members } = useCollection<Member>("members");
  const { data: rooms } = useCollection<Room>("rooms");
  const { data: utilities } = useCollection<Utility>("utilities");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  
  // Get unique utility types from utilities table
   const uniqueUtilities = useMemo(() => {
     const seen = new Set<string>();
     return utilities.filter(u => {
       const key = u.type.toLowerCase();
       if (seen.has(key)) return false;
       seen.add(key);
       return true;
     });
   }, [utilities]);
   
   const utilityTypes = useMemo(() => {
     return uniqueUtilities.map(u => u.type.toLowerCase());
   }, [uniqueUtilities]);
  
  // Map utility type to service type
  const getServiceType = (utilityType: string): ServiceType => {
    const map: Record<string, ServiceType> = {
      "electricity": "electricity",
      "internet": "internet",
      "gas": "gas",
      "water": "water",
      "generator": "generator",
      "maintenance": "maintenance",
      "bua salary": "other_services",
      "garbage": "other_services",
      "security": "other_services",
      "rent": "rent",
      "other": "other_services",
    };
    return map[utilityType] || "other_services";
  };
  
  // Default service types (always available)
  const defaultServiceTypes: ServiceType[] = [
    "rent", "meals", "internet", "electricity", "gas", "water",
    "cooking_staff", "cleaning_staff", "security_staff", "laundry",
    "parking", "generator", "maintenance", "other_services"
  ];
  
  // Get all available service types (from utilities + defaults)
  const allServiceTypes = useMemo(() => {
    const types = new Set<ServiceType>(defaultServiceTypes);
    utilityTypes.forEach(ut => {
      const serviceType = getServiceType(ut);
      types.add(serviceType);
    });
    return Array.from(types);
  }, [utilityTypes]);
  
  const [form, setForm] = useState<Omit<Member, "id">>({
    name: "",
    email: "",
    phone: "",
    role: "member",
    active: true,
    status: "active",
    mealStatus: "active",
    monthlyRent: 0,
    depositAmount: 0,
    securityDeposit: 0,
    previousDue: 0,
    services: defaultServiceTypes.map(type => ({ type, enabled: type === "rent" || type === "meals" })),
  });

  const reset = () => {
    setForm({
      name: "",
      email: "",
      phone: "",
      role: "member",
      active: true,
      status: "active",
      mealStatus: "active",
      monthlyRent: 0,
      depositAmount: 0,
      securityDeposit: 0,
      previousDue: 0,
      services: allServiceTypes.map(type => ({ type, enabled: type === "rent" || type === "meals" })),
    });
    setEditing(null);
  };
  const startEdit = (m: Member) => {
    setEditing(m);
    setForm({
      name: m.name,
      email: m.email || "",
      phone: m.phone || "",
      role: m.role,
      active: m.active,
      uid: m.uid,
      joinedAt: m.joinedAt,
      nid: m.nid || "",
      occupation: m.occupation || "",
      emergencyContact: m.emergencyContact || "",
      joiningDate: m.joiningDate || "",
      leavingDate: m.leavingDate || "",
      roomId: m.roomId || "",
      roomName: m.roomName || "",
      bedNo: m.bedNo || "",
      depositAmount: m.depositAmount || 0,
      monthlyRent: m.monthlyRent || 0,
      mealStatus: m.mealStatus || "active",
      securityDeposit: m.securityDeposit || 0,
      previousDue: m.previousDue || 0,
      status: m.status || (m.active ? "active" : "inactive"),
      notes: m.notes || "",
      services: m.services || allServiceTypes.map(type => ({ type, enabled: type === "rent" || type === "meals" })),
    });
    setOpen(true);
  };
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    // Prevent double-booking the same bed: two active members should never
    // silently share one roomId+bedNo (roomId/bedNo were plain mutable
    // fields with no reservation check, so nothing stopped this before).
    if (form.active && form.roomId && form.bedNo) {
      const conflict = members.find(
        (m) =>
          m.active &&
          m.id !== editing?.id &&
          m.roomId === form.roomId &&
          m.bedNo === form.bedNo,
      );
      if (conflict) {
        toast.error(`Bed ${form.bedNo} in this room is already occupied by ${conflict.name}`);
        return;
      }
    }

    // Prevent assigning a room beyond its bed capacity.
    if (form.active && form.roomId) {
      const room = rooms.find((r) => r.id === form.roomId);
      if (room?.totalBeds) {
        const occupantCount = members.filter(
          (m) => m.active && m.id !== editing?.id && m.roomId === form.roomId,
        ).length;
        if (occupantCount >= room.totalBeds) {
          toast.error(`Room ${room.roomNo} is already at full capacity (${room.totalBeds} beds)`);
          return;
        }
      }
    }

    // Never trust the HTML min="0" alone — clamp every money figure to a
    // non-negative value before it's ever saved.
    const form_ = {
      ...form,
      monthlyRent: Math.max(0, Number(form.monthlyRent) || 0),
      depositAmount: Math.max(0, Number(form.depositAmount) || 0),
      securityDeposit: Math.max(0, Number(form.securityDeposit) || 0),
      previousDue: Math.max(0, Number(form.previousDue) || 0),
    };

    setSaving(true);
    try {
      if (profile?.role === "owner" && editing) {
        if (
          editing.uid === profile?.uid &&
          form.role !== "owner" &&
          profile?.role === "owner"
        ) {
          toast.error("Owner role cannot be downgraded from this screen");
          return;
        }
        await updateDocIn("members", editing.id, form_);
        // The Firestore security rules read the role from users/{uid}, not
        // members/{id}. Sync the new role so the user's permissions actually
        // change (e.g. member -> owner/manager).
        if (editing.role !== form.role) {
          await syncUserRole(editing, form.role);
        }
        toast.success("Member updated");
      } else if (profile?.role === "owner") {
        await addDocTo("members", { ...form_, joinedAt: Date.now() });
        toast.success("Member added");
      } else if (profile) {
        await submitChangeRequest({
          collectionName: "members",
          action: editing ? "update" : "create",
          title: `${editing ? "Update" : "Add"} member ${form.name}`,
          actor: { uid: profile.uid, name: profile.name, role: profile.role },
          targetId: editing?.id,
          payload: editing ? form_ : { ...form_, joinedAt: Date.now() },
          previousData: editing || null,
        });
        toast.success("Request sent to admin for approval");
      }
      setOpen(false);
      reset();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const onDelete = async (m: Member) => {
    if (m.uid === profile?.uid) {
      toast.error("You cannot delete your own member profile");
      return;
    }
    if (!confirm(`Remove ${m.name}?`)) return;
    if (profile?.role === "owner") {
      await deleteDocFrom("members", m.id);
      toast.success("Removed");
      return;
    }
    if (profile) {
      await submitChangeRequest({
        collectionName: "members",
        action: "delete",
        title: `Delete member ${m.name}`,
        actor: { uid: profile.uid, name: profile.name, role: profile.role },
        targetId: m.id,
        previousData: m,
      });
      toast.success("Delete request sent to admin");
    }
  };

  const sortedMembers = useMemo(
    () => [...members].sort((a, b) => a.name.localeCompare(b.name)),
    [members],
  );

  return (
    <div>
      <PageHeader
        title="Members"
        description={
          profile
            ? "Add, edit, and remove members. Non-owner actions go to admin approval."
            : "Member management"
        }
        action={
          profile && (
            <Dialog
              open={open}
              onOpenChange={(v) => {
                setOpen(v);
                if (!v) reset();
              }}
            >
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-1" />
                  Add member
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editing ? "Edit" : "Add"} member</DialogTitle>
                </DialogHeader>
                <form onSubmit={onSubmit} className="space-y-4">
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
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input
                        type="email"
                        value={form.email || ""}
                        onChange={(e) =>
                          setForm({ ...form, email: e.target.value })
                        }
                        placeholder="member@email.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Phone</Label>
                      <Input
                        value={form.phone}
                        onChange={(e) =>
                          setForm({ ...form, phone: e.target.value })
                        }
                        placeholder="01XXX-XXXXXX"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>NID</Label>
                      <Input
                        value={form.nid || ""}
                        onChange={(e) =>
                          setForm({ ...form, nid: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Occupation</Label>
                      <Input
                        value={form.occupation || ""}
                        onChange={(e) =>
                          setForm({ ...form, occupation: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Emergency contact</Label>
                    <Input
                      value={form.emergencyContact || ""}
                      onChange={(e) =>
                        setForm({ ...form, emergencyContact: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Role</Label>
                    <Select
                      value={form.role}
                      onValueChange={(v) =>
                        setForm({ ...form, role: v as Member["role"] })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="member">Member</SelectItem>
                        <SelectItem value="manager">Manager</SelectItem>
                        <SelectItem value="accountant">Accountant</SelectItem>
                        <SelectItem value="bazar_manager">
                          Bazar manager
                        </SelectItem>
                        <SelectItem value="meal_manager">
                          Meal manager
                        </SelectItem>
                        <SelectItem value="cook">Cook</SelectItem>
                        <SelectItem value="guest">Guest</SelectItem>
                        <SelectItem value="auditor">Auditor</SelectItem>
                        {profile?.role === "owner" && (
                          <SelectItem value="owner">Owner</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Room</Label>
                      <Select
                        value={form.roomId || "none"}
                        onValueChange={(value) => {
                          const room = rooms.find((item) => item.id === value);
                          setForm({
                            ...form,
                            roomId: value === "none" ? "" : value,
                            roomName: room
                              ? `${room.buildingName} ${room.roomNo}`
                              : "",
                          });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No room</SelectItem>
                          {rooms.map((room) => (
                            <SelectItem key={room.id} value={room.id}>
                              {room.buildingName} · {room.floorName} ·{" "}
                              {room.roomNo}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Bed</Label>
                      <Input
                        value={form.bedNo || ""}
                        onChange={(e) =>
                          setForm({ ...form, bedNo: e.target.value })
                        }
                        placeholder="A / 01"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-2">
                      <Label>Monthly rent</Label>
                      <Input
                        type="number"
                        min="0"
                        value={form.monthlyRent || 0}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            monthlyRent: Number(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Deposit</Label>
                      <Input
                        type="number"
                        min="0"
                        value={form.depositAmount || 0}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            depositAmount: Number(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Previous due</Label>
                      <Input
                        type="number"
                        min="0"
                        value={form.previousDue || 0}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            previousDue: Number(e.target.value),
                          })
                        }
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select
                        value={form.status || "active"}
                        onValueChange={(v) =>
                          setForm({
                            ...form,
                            status: v as Member["status"],
                            active: v === "active",
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                          <SelectItem value="moved_out">Moved out</SelectItem>
                          <SelectItem value="suspended">Suspended</SelectItem>
                          <SelectItem value="pending">Pending</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Meal status</Label>
                      <Select
                        value={form.mealStatus || "active"}
                        onValueChange={(v) =>
                          setForm({
                            ...form,
                            mealStatus: v as Member["mealStatus"],
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="hold">Hold</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="active"
                      checked={form.active}
                      onChange={(e) =>
                        setForm({ ...form, active: e.target.checked })
                      }
                    />
                    <Label htmlFor="active">
                      Active (counts in monthly split)
                    </Label>
                  </div>
                  <div className="space-y-2">
                     <Label>Service Subscriptions</Label>
                     <div className="grid grid-cols-2 gap-2">
                       {/* Show default service types */}
                       {defaultServiceTypes.map((serviceType) => (
                         <div
                           key={serviceType}
                           className="flex items-center gap-2"
                         >
                           <input
                             type="checkbox"
                             id={`service-${serviceType}`}
                             checked={(form.services || []).some(s => s.type === serviceType && s.enabled)}
                             onChange={(e) => {
                                const currentServices = form.services || defaultServiceTypes.map(t => ({ type: t as ServiceType, enabled: t === "rent" || t === "meals" }));
                                const otherServices = currentServices.filter(s => s.type !== serviceType);
                                setForm({
                                  ...form,
                                  services: [...otherServices, { type: serviceType, enabled: e.target.checked }],
                                });
                              }}
                           />
                           <Label
                             htmlFor={`service-${serviceType}`}
                             className="text-sm"
                           >
                             {SERVICE_LABELS[serviceType] || serviceType.replace(/_/g, " ")}
                           </Label>
                         </div>
                       ))}
                       {/* Show utility types from utilities table as other_services */}
                       {uniqueUtilities.map((u) => {
                         const serviceType = getServiceType(u.type.toLowerCase());
                         if (serviceType === "other_services") {
                           return (
                             <div
                               key={`util-${u.type.toLowerCase()}`}
                               className="flex items-center gap-2"
                             >
                               <input
                                 type="checkbox"
                                 id={`service-util-${u.type.toLowerCase()}`}
                                 checked={(form.services || []).some(s => s.type === "other_services" && s.enabled)}
                                 onChange={(e) => {
                                   const currentServices = form.services || defaultServiceTypes.map(t => ({ type: t as ServiceType, enabled: t === "rent" || t === "meals" }));
                                   const otherServices = currentServices.filter(s => s.type !== "other_services");
                                   setForm({
                                     ...form,
                                     services: [...otherServices, { type: "other_services" as ServiceType, enabled: e.target.checked }],
                                   });
                                 }}
                               />
                               <Label
                                 htmlFor={`service-util-${u.type.toLowerCase()}`}
                                 className="text-sm"
                               >
                                 {u.type}
                               </Label>
                             </div>
                           );
                         }
                         return null;
                       })}
                     </div>
                   </div>
                  <DialogFooter>
                    <Button type="submit" disabled={saving}>{saving ? "Saving..." : editing ? "Save" : "Add"}</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )
        }
      />
      <div className="p-6">
        {sortedMembers.length === 0 ? (
          <Card className="p-12 text-center">
            <UserCircle2 className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">
              No members yet. Add your first tenant.
            </p>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sortedMembers.map((m) => (
              <Card key={m.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-11 w-11 rounded-full bg-accent text-accent-foreground flex items-center justify-center font-semibold uppercase shrink-0">
                      {m.name[0]}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{m.name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {m.email || m.phone || "—"}
                      </div>
                    </div>
                  </div>
                  {profile && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => startEdit(m)}
                      >
                        <Pencil className="mr-1 h-4 w-4" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => onDelete(m)}
                      >
                        <Trash2 className="mr-1 h-4 w-4" />
                        Delete
                      </Button>
                    </div>
                  )}
                </div>
                <div className="mt-3 flex gap-2">
                  <Badge variant="secondary" className="capitalize">
                    {m.role}
                  </Badge>
                  <Badge variant={m.active ? "default" : "outline"}>
                    {m.status
                      ? m.status.replace("_", " ")
                      : m.active
                        ? "Active"
                        : "Inactive"}
                  </Badge>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-muted-foreground">Room</div>
                    <div className="font-medium">
                      {m.roomName || "Unassigned"}
                      {m.bedNo ? ` · Bed ${m.bedNo}` : ""}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Rent</div>
                    <div className="font-medium">
                      ৳{Math.round(m.monthlyRent || 0).toLocaleString("en-BD")}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
