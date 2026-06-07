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
import { useCollection, addDocTo, updateDocIn, deleteDocFrom, orderBy, type Member } from "@/lib/data";
import { dayKey, bdt } from "@/lib/format";
import { Plus, Trash2, BadgePercent, Pencil } from "lucide-react";
import { toast } from "sonner";
import { submitChangeRequest } from "@/lib/workflow";
import type { Credit } from "@/lib/types";

export const Route = createFileRoute("/_authed/credits")({
  component: CreditsPage,
});

function CreditsPage() {
  const { can, profile } = useAuth();
  const { data: members } = useCollection<Member>("members");
  const { data: credits } = useCollection<Credit>("credits", [orderBy("date", "desc")]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Credit | null>(null);
  const [form, setForm] = useState({ memberId: "", amount: "", reason: "", date: dayKey(), notes: "" });

  const resetForm = () => {
    setEditing(null);
    setForm({ memberId: "", amount: "", reason: "", date: dayKey(), notes: "" });
  };

  const activeMembers = useMemo(
    () => members.filter((m) => m.active).sort((a, b) => a.name.localeCompare(b.name)),
    [members]
  );

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const member = members.find((m) => (m.uid || m.id) === form.memberId);
    if (!member) return toast.error("Pick a member");
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) return toast.error("Enter amount");
    if (!form.reason.trim()) return toast.error("Reason is required");
    try {
      const payload = {
        memberId: form.memberId,
        memberName: member.name,
        amount,
        reason: form.reason,
        date: form.date,
        ym: form.date.slice(0, 7),
        notes: form.notes,
      };
      if (profile?.role === "owner" && editing) {
        await updateDocIn("credits", editing.id, payload);
        toast.success("Credit updated");
      } else if (profile?.role === "owner") {
        await addDocTo("credits", payload);
        // Also create ledger entry for consistency
        await addDocTo("ledgers", {
          memberId: form.memberId,
          memberName: member.name,
          date: form.date,
          ym: form.date.slice(0, 7),
          transactionType: "credit",
          category: "credit",
          amount,
          notes: form.notes || `Credit: ${form.reason}`,
        });
        toast.success("Credit recorded");
      } else if (profile) {
        await submitChangeRequest({
          collectionName: "credits",
          action: editing ? "update" : "create",
          title: `${editing ? "Update" : "Add"} credit for ${member.name}`,
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

  const total = credits.reduce((s, d) => s + d.amount, 0);

  return (
    <div>
      <PageHeader
        title="Credits"
        description={`${bdt(total)} total credits · ${credits.length} entries`}
        action={
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1"/>Add credit</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editing ? "Edit" : "Record"} credit</DialogTitle></DialogHeader>
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Member</Label>
                    <Select value={form.memberId} onValueChange={(v) => setForm({...form, memberId: v})}>
                      <SelectTrigger><SelectValue placeholder="Select member"/></SelectTrigger>
                      <SelectContent>{activeMembers.map(m => <SelectItem key={m.uid || m.id} value={m.uid || m.id}>{m.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label>Amount (৳)</Label><Input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({...form, amount: e.target.value})} required/></div>
                </div>
                <div className="space-y-2">
                  <Label>Reason</Label>
                  <Input value={form.reason} onChange={(e) => setForm({...form, reason: e.target.value})} placeholder="e.g. Festival discount, adjustment" required/>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({...form, date: e.target.value})}/></div>
                </div>
                <div className="space-y-2"><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({...form, notes: e.target.value})}/></div>
                <DialogFooter><Button type="submit">Save</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />
      <div className="p-6">
        <Card className="p-0 overflow-hidden">
          {credits.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <BadgePercent className="h-10 w-10 mx-auto opacity-40 mb-3"/>
              No credits yet
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground bg-muted/50">
                  <tr>
                    <th className="text-left p-3 font-medium">Date</th>
                    <th className="text-left p-3 font-medium">Member</th>
                    <th className="text-left p-3 font-medium">Reason</th>
                    <th className="text-left p-3 font-medium">Notes</th>
                    <th className="text-right p-3 font-medium">Amount</th>
                    {profile && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {credits.map((d) => (
                    <tr key={d.id} className="border-t hover:bg-muted/30">
                      <td className="p-3">{d.date}</td>
                      <td className="p-3 font-medium">{d.memberName}</td>
                      <td className="p-3">{d.reason}</td>
                      <td className="p-3 text-muted-foreground">{d.notes || "—"}</td>
                      <td className="p-3 text-right tabular-nums font-semibold text-primary">{bdt(d.amount)}</td>
                      {profile && (
                        <td className="p-3">
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => { setEditing(d); setForm({ memberId: d.memberId, amount: String(d.amount), reason: d.reason, date: d.date, notes: d.notes || "" }); setOpen(true); }}>
                              <Pencil className="mr-1 h-3.5 w-3.5" />Edit
                            </Button>
                            <Button size="sm" variant="destructive" onClick={async () => {
                              if (!profile || !confirm("Delete?")) return;
                              if (profile.role === "owner") {
                                await deleteDocFrom("credits", d.id);
                                toast.success("Deleted");
                              } else {
                                await submitChangeRequest({
                                  collectionName: "credits",
                                  action: "delete",
                                  title: `Delete credit for ${d.memberName}`,
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