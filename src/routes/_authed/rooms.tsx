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
  type Member,
  type Room,
} from "@/lib/data";
import { bdt } from "@/lib/format";
import {
  BedDouble,
  Building2,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { submitChangeRequest } from "@/lib/workflow";

export const Route = createFileRoute("/_authed/rooms")({
  component: RoomsPage,
});

const ROOM_TYPES: Room["roomType"][] = [
  "single",
  "double",
  "triple",
  "shared",
  "family",
  "staff",
];
const STATUSES: Room["status"][] = [
  "available",
  "occupied",
  "maintenance",
  "reserved",
];

const blankRoom: Omit<Room, "id"> = {
  messName: "Main Mess",
  branchName: "Dhaka",
  buildingName: "Building A",
  floorName: "1st Floor",
  roomNo: "",
  roomType: "shared",
  totalBeds: 4,
  monthlyRent: 0,
  status: "available",
  notes: "",
};

function RoomsPage() {
  const { profile } = useAuth();
  const { data: rooms } = useCollection<Room>("rooms", [
    orderBy("buildingName", "asc"),
  ]);
  const { data: members } = useCollection<Member>("members");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Room | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<Omit<Room, "id">>(blankRoom);

  const occupancy = useMemo(() => {
    const map = new Map<string, number>();
    members
      .filter((member) => member.active)
      .forEach((member) => {
        if (member.roomId)
          map.set(member.roomId, (map.get(member.roomId) || 0) + 1);
      });
    return map;
  }, [members]);

  const filtered = rooms.filter((room) => {
    const haystack =
      `${room.messName} ${room.branchName || ""} ${room.buildingName} ${room.floorName} ${room.roomNo} ${room.status}`.toLowerCase();
    return !search || haystack.includes(search.toLowerCase());
  });

  const totalBeds = rooms.reduce((sum, room) => sum + (room.totalBeds || 0), 0);
  const occupiedBeds = rooms.reduce(
    (sum, room) => sum + (occupancy.get(room.id) || 0),
    0,
  );
  const vacantBeds = Math.max(0, totalBeds - occupiedBeds);

  const reset = () => {
    setEditing(null);
    setForm(blankRoom);
  };

  const saveRoom = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!profile) return;
    if (!form.roomNo.trim()) return toast.error("Room number is required");
    const payload = {
      ...form,
      totalBeds: Number(form.totalBeds) || 0,
      monthlyRent: Number(form.monthlyRent) || 0,
    };
    try {
      if (profile.role === "owner" && editing) {
        await updateDocIn("rooms", editing.id, payload);
        toast.success("Room updated");
      } else if (profile.role === "owner") {
        await addDocTo("rooms", payload);
        toast.success("Room added");
      } else {
        await submitChangeRequest({
          collectionName: "rooms",
          action: editing ? "update" : "create",
          title: `${editing ? "Update" : "Add"} room ${payload.roomNo}`,
          actor: { uid: profile.uid, name: profile.name, role: profile.role },
          targetId: editing?.id,
          payload,
          previousData: editing || null,
        });
        toast.success("Room request sent to admin");
      }
      setOpen(false);
      reset();
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const deleteRoom = async (room: Room) => {
    if (!profile || !confirm(`Delete room ${room.roomNo}?`)) return;
    if (profile.role === "owner") {
      await deleteDocFrom("rooms", room.id);
      toast.success("Room deleted");
      return;
    }
    await submitChangeRequest({
      collectionName: "rooms",
      action: "delete",
      title: `Delete room ${room.roomNo}`,
      actor: { uid: profile.uid, name: profile.name, role: profile.role },
      targetId: room.id,
      previousData: room,
    });
    toast.success("Delete request sent to admin");
  };

  return (
    <div>
      <PageHeader
        title="Rooms & beds"
        description={`${rooms.length} rooms · ${occupiedBeds}/${totalBeds} beds occupied · ${vacantBeds} vacant`}
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
                  Add room
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editing ? "Edit" : "Add"} room</DialogTitle>
                </DialogHeader>
                <form onSubmit={saveRoom} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Mess</Label>
                      <Input
                        value={form.messName}
                        onChange={(e) =>
                          setForm({ ...form, messName: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Branch</Label>
                      <Input
                        value={form.branchName || ""}
                        onChange={(e) =>
                          setForm({ ...form, branchName: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-2">
                      <Label>Building</Label>
                      <Input
                        value={form.buildingName}
                        onChange={(e) =>
                          setForm({ ...form, buildingName: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Floor</Label>
                      <Input
                        value={form.floorName}
                        onChange={(e) =>
                          setForm({ ...form, floorName: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Room no</Label>
                      <Input
                        required
                        value={form.roomNo}
                        onChange={(e) =>
                          setForm({ ...form, roomNo: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Type</Label>
                      <Select
                        value={form.roomType}
                        onValueChange={(value) =>
                          setForm({
                            ...form,
                            roomType: value as Room["roomType"],
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROOM_TYPES.map((type) => (
                            <SelectItem
                              key={type}
                              value={type}
                              className="capitalize"
                            >
                              {type}
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
                          setForm({ ...form, status: value as Room["status"] })
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
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Beds</Label>
                      <Input
                        type="number"
                        min="0"
                        value={form.totalBeds}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            totalBeds: Number(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Monthly rent</Label>
                      <Input
                        type="number"
                        min="0"
                        value={form.monthlyRent}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            monthlyRent: Number(e.target.value),
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
                    <Button type="submit">Save</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )
        }
      />
      <div className="space-y-4 p-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search mess, building, floor, room..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {filtered.length === 0 ? (
          <Card className="p-12 text-center text-muted-foreground">
            <BedDouble className="mx-auto mb-3 h-10 w-10 opacity-40" />
            No rooms found
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((room) => {
              const occupied = occupancy.get(room.id) || 0;
              const vacant = Math.max(0, (room.totalBeds || 0) - occupied);
              return (
                <Card key={room.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 font-semibold">
                        <Building2 className="h-4 w-4 text-primary" />
                        {room.buildingName} · Room {room.roomNo}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {room.messName} · {room.floorName} ·{" "}
                        {room.branchName || "Main branch"}
                      </div>
                    </div>
                    <Badge variant={vacant > 0 ? "default" : "secondary"}>
                      {vacant} vacant
                    </Badge>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                    <div>
                      <div className="text-muted-foreground">Beds</div>
                      <div className="font-semibold">
                        {occupied}/{room.totalBeds}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Rent</div>
                      <div className="font-semibold">
                        {bdt(room.monthlyRent)}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Status</div>
                      <div className="font-semibold capitalize">
                        {room.status}
                      </div>
                    </div>
                  </div>
                  {room.notes && (
                    <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
                      {room.notes}
                    </p>
                  )}
                  {profile && (
                    <div className="mt-4 flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditing(room);
                          setForm({ ...room });
                          setOpen(true);
                        }}
                      >
                        <Pencil className="mr-1 h-3.5 w-3.5" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => deleteRoom(room)}
                      >
                        <Trash2 className="mr-1 h-3.5 w-3.5" />
                        Delete
                      </Button>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
