import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useCollection, addDocTo, updateDocIn, deleteDocFrom, type Member } from "@/lib/data";
import { Plus, Pencil, Trash2, UserCircle2 } from "lucide-react";
import { toast } from "sonner";
import { submitChangeRequest } from "@/lib/workflow";

export const Route = createFileRoute("/_authed/members")({
  component: MembersPage,
});

function MembersPage() {
  const { can, profile } = useAuth();
  const { data: members } = useCollection<Member>("members");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [form, setForm] = useState<Omit<Member, "id">>({ name: "", email: "", phone: "", role: "member", active: true });

  const reset = () => { setForm({ name: "", email: "", phone: "", role: "member", active: true }); setEditing(null); };
  const startEdit = (m: Member) => {
    setEditing(m);
    setForm({ name: m.name, email: m.email || "", phone: m.phone || "", role: m.role, active: m.active, uid: m.uid, joinedAt: m.joinedAt });
    setOpen(true);
  };
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (profile?.role === "owner" && editing) {
        if (editing.uid === profile?.uid && form.role !== "owner" && profile?.role === "owner") {
          toast.error("Owner role cannot be downgraded from this screen");
          return;
        }
        await updateDocIn("members", editing.id, form);
        toast.success("Member updated");
      } else if (profile?.role === "owner") {
        await addDocTo("members", { ...form, joinedAt: Date.now() });
        toast.success("Member added");
      } else if (profile) {
        await submitChangeRequest({
          collectionName: "members",
          action: editing ? "update" : "create",
          title: `${editing ? "Update" : "Add"} member ${form.name}`,
          actor: { uid: profile.uid, name: profile.name, role: profile.role },
          targetId: editing?.id,
          payload: editing ? form : { ...form, joinedAt: Date.now() },
          previousData: editing || null,
        });
        toast.success("Request sent to admin for approval");
      }
      setOpen(false); reset();
    } catch (err) { toast.error((err as Error).message); }
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
    [members]
  );

  return (
    <div>
      <PageHeader
        title="Members"
        description={profile ? "Add, edit, and remove members. Non-owner actions go to admin approval." : "Member management"}
        action={profile && (
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-1"/>Add member</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} member</DialogTitle></DialogHeader>
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="space-y-2"><Label>Name</Label><Input required value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} /></div>
                <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email || ""} onChange={(e) => setForm({...form, email: e.target.value})} placeholder="member@email.com" /></div>
                <div className="space-y-2"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({...form, phone: e.target.value})} placeholder="01XXX-XXXXXX" /></div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={form.role} onValueChange={(v) => setForm({...form, role: v as Member["role"]})}>
                    <SelectTrigger><SelectValue/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      {profile?.role === "owner" && <SelectItem value="owner">Owner</SelectItem>}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="active" checked={form.active} onChange={(e) => setForm({...form, active: e.target.checked})}/>
                  <Label htmlFor="active">Active (counts in monthly split)</Label>
                </div>
                <DialogFooter><Button type="submit">{editing ? "Save" : "Add"}</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      />
      <div className="p-6">
        {sortedMembers.length === 0 ? (
          <Card className="p-12 text-center">
            <UserCircle2 className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3"/>
            <p className="text-muted-foreground">No members yet. Add your first tenant.</p>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sortedMembers.map((m) => (
              <Card key={m.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-11 w-11 rounded-full bg-accent text-accent-foreground flex items-center justify-center font-semibold uppercase shrink-0">{m.name[0]}</div>
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{m.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{m.email || m.phone || "—"}</div>
                    </div>
                  </div>
                  {profile && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => startEdit(m)}><Pencil className="mr-1 h-4 w-4"/>Edit</Button>
                      <Button size="sm" variant="destructive" onClick={() => onDelete(m)}><Trash2 className="mr-1 h-4 w-4"/>Delete</Button>
                    </div>
                  )}
                </div>
                <div className="mt-3 flex gap-2">
                  <Badge variant="secondary" className="capitalize">{m.role}</Badge>
                  <Badge variant={m.active ? "default" : "outline"}>{m.active ? "Active" : "Inactive"}</Badge>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
