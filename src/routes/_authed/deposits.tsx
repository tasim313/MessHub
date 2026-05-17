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
import { useCollection, addDocTo, updateDocIn, deleteDocFrom, orderBy, type Deposit, type Member } from "@/lib/data";
import { dayKey, bdt } from "@/lib/format";
import { Plus, Trash2, Wallet, Pencil } from "lucide-react";
import { toast } from "sonner";
import { submitChangeRequest } from "@/lib/workflow";

export const Route = createFileRoute("/_authed/deposits")({
  component: DepositsPage,
});

const METHODS = ["Cash", "bKash", "Nagad", "Rocket", "Bank"];

function DepositsPage() {
  const { can, profile } = useAuth();
  const { data: members } = useCollection<Member>("members");
  const { data: deposits } = useCollection<Deposit>("deposits", [orderBy("date", "desc")]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Deposit | null>(null);
  const [form, setForm] = useState({ memberId: "", amount: "", method: "bKash", date: dayKey(), notes: "" });

  const resetForm = () => {
    setEditing(null);
    setForm({ memberId: "", amount: "", method: "bKash", date: dayKey(), notes: "" });
  };

  const activeMembers = useMemo(
    () => members.filter((member) => member.active).sort((a, b) => a.name.localeCompare(b.name)),
    [members]
  );

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const member = members.find((m) => (m.uid || m.id) === form.memberId);
    if (!member) return toast.error("Pick a member");
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) return toast.error("Enter amount");
    try {
      const payload = {
        memberId: form.memberId,
        memberName: member.name,
        amount,
        method: form.method,
        date: form.date,
        ym: form.date.slice(0, 7),
        notes: form.notes,
      };
      if (profile?.role === "owner" && editing) {
        await updateDocIn("deposits", editing.id, payload);
        toast.success("Deposit updated");
      } else if (profile?.role === "owner") {
        await addDocTo("deposits", payload);
        toast.success("Deposit recorded");
      } else if (profile) {
        await submitChangeRequest({
          collectionName: "deposits",
          action: editing ? "update" : "create",
          title: `${editing ? "Update" : "Add"} deposit for ${member.name}`,
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

  const total = deposits.reduce((s, d) => s + d.amount, 0);

  return (
    <div>
      <PageHeader
        title="Deposits"
        description={profile ? `${bdt(total)} collected · ${deposits.length} payments · add, edit, delete requests available` : `${bdt(total)} collected · ${deposits.length} payments`}
        action={profile && (
          <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (!value) resetForm(); }}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1"/>Add deposit</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editing ? "Edit" : "Record"} deposit</DialogTitle></DialogHeader>
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Member</Label>
                    <Select value={form.memberId} onValueChange={(v) => setForm({...form, memberId: v})}>
                      <SelectTrigger><SelectValue placeholder="Who paid?"/></SelectTrigger>
                      <SelectContent>{activeMembers.map(m => <SelectItem key={m.uid || m.id} value={m.uid || m.id}>{m.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label>Amount (৳)</Label><Input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({...form, amount: e.target.value})} required/></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Method</Label>
                    <Select value={form.method} onValueChange={(v) => setForm({...form, method: v})}>
                      <SelectTrigger><SelectValue/></SelectTrigger>
                      <SelectContent>{METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label>Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({...form, date: e.target.value})}/></div>
                </div>
                <div className="space-y-2"><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({...form, notes: e.target.value})}/></div>
                <DialogFooter><Button type="submit">Save</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      />
      <div className="p-6">
        <Card className="p-0 overflow-hidden">
          {deposits.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <Wallet className="h-10 w-10 mx-auto opacity-40 mb-3"/>
              No deposits yet
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground bg-muted/50">
                  <tr>
                    <th className="text-left p-3 font-medium">Date</th>
                    <th className="text-left p-3 font-medium">Member</th>
                    <th className="text-left p-3 font-medium">Method</th>
                    <th className="text-left p-3 font-medium">Notes</th>
                    <th className="text-right p-3 font-medium">Amount</th>
                    {profile && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {deposits.map((d) => (
                    <tr key={d.id} className="border-t hover:bg-muted/30">
                      <td className="p-3">{d.date}</td>
                      <td className="p-3 font-medium">{d.memberName}</td>
                      <td className="p-3">{d.method}</td>
                      <td className="p-3 text-muted-foreground">{d.notes || "—"}</td>
                      <td className="p-3 text-right tabular-nums font-semibold text-primary">{bdt(d.amount)}</td>
                      {profile && (
                        <td className="p-3">
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => { setEditing(d); setForm({ memberId: d.memberId, amount: String(d.amount), method: d.method, date: d.date, notes: d.notes || "" }); setOpen(true); }}>
                              <Pencil className="mr-1 h-3.5 w-3.5" />Edit
                            </Button>
                            <Button size="sm" variant="destructive" onClick={async () => {
                              if (!profile || !confirm("Delete?")) return;
                              if (profile.role === "owner") {
                                await deleteDocFrom("deposits", d.id);
                                toast.success("Deleted");
                              } else {
                                await submitChangeRequest({
                                  collectionName: "deposits",
                                  action: "delete",
                                  title: `Delete deposit for ${d.memberName}`,
                                  actor: { uid: profile.uid, name: profile.name, role: profile.role },
                                  targetId: d.id,
                                  previousData: d,
                                });
                                toast.success("Delete request sent to admin");
                              }
                            }}>
                              <Trash2 className="mr-1 h-3.5 w-3.5"/>Delete
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
