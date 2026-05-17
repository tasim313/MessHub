import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useCollection, addDocTo, updateDocIn, deleteDocFrom, orderBy, type Utility } from "@/lib/data";
import { dayKey, bdt, ymKey } from "@/lib/format";
import { Plus, Trash2, Zap, Pencil } from "lucide-react";
import { toast } from "sonner";
import { submitChangeRequest } from "@/lib/workflow";

export const Route = createFileRoute("/_authed/utilities")({
  component: UtilitiesPage,
});

const TYPES = ["Electricity", "Gas", "Water", "Internet", "Bua salary", "Rent", "Garbage", "Security", "Generator", "Other"];

function UtilitiesPage() {
  const { can, profile } = useAuth();
  const { data: utilities } = useCollection<Utility>("utilities", [orderBy("date", "desc")]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Utility | null>(null);
  const [form, setForm] = useState({ type: "Electricity", amount: "", date: dayKey(), notes: "" });

  const resetForm = () => {
    setEditing(null);
    setForm({ type: "Electricity", amount: "", date: dayKey(), notes: "" });
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) return toast.error("Enter amount");
    try {
      const payload = {
        type: form.type,
        amount,
        date: form.date,
        ym: form.date.slice(0, 7),
        notes: form.notes,
      };
      if (profile?.role === "owner" && editing) {
        await updateDocIn("utilities", editing.id, payload);
        toast.success("Utility updated");
      } else if (profile?.role === "owner") {
        await addDocTo("utilities", payload);
        toast.success("Utility added");
      } else if (profile) {
        await submitChangeRequest({
          collectionName: "utilities",
          action: editing ? "update" : "create",
          title: `${editing ? "Update" : "Add"} ${form.type} utility`,
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

  const ym = ymKey();
  const monthTotal = utilities.filter(u => u.ym === ym).reduce((s, u) => s + u.amount, 0);

  return (
    <div>
      <PageHeader
        title="Utilities"
        description={profile ? `${bdt(monthTotal)} this month · add, edit, delete requests available` : `${bdt(monthTotal)} this month`}
        action={profile && (
          <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (!value) resetForm(); }}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1"/>Add bill</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} utility bill</DialogTitle></DialogHeader>
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select value={form.type} onValueChange={(v) => setForm({...form, type: v})}>
                      <SelectTrigger><SelectValue/></SelectTrigger>
                      <SelectContent>{TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label>Amount (৳)</Label><Input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({...form, amount: e.target.value})} required/></div>
                </div>
                <div className="space-y-2"><Label>Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({...form, date: e.target.value})}/></div>
                <div className="space-y-2"><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({...form, notes: e.target.value})}/></div>
                <DialogFooter><Button type="submit">Save</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      />
      <div className="p-6">
        <Card className="p-0 overflow-hidden">
          {utilities.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <Zap className="h-10 w-10 mx-auto opacity-40 mb-3"/>
              No utility bills yet
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground bg-muted/50">
                  <tr>
                    <th className="text-left p-3 font-medium">Date</th>
                    <th className="text-left p-3 font-medium">Type</th>
                    <th className="text-left p-3 font-medium">Notes</th>
                    <th className="text-right p-3 font-medium">Amount</th>
                    {profile && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {utilities.map((u) => (
                    <tr key={u.id} className="border-t hover:bg-muted/30">
                      <td className="p-3">{u.date}</td>
                      <td className="p-3 font-medium">{u.type}</td>
                      <td className="p-3 text-muted-foreground">{u.notes || "—"}</td>
                      <td className="p-3 text-right tabular-nums font-semibold">{bdt(u.amount)}</td>
                      {profile && (
                        <td className="p-3">
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => { setEditing(u); setForm({ type: u.type, amount: String(u.amount), date: u.date, notes: u.notes || "" }); setOpen(true); }}>
                              <Pencil className="mr-1 h-3.5 w-3.5" />Edit
                            </Button>
                            <Button size="sm" variant="destructive" onClick={async () => {
                              if (!profile || !confirm("Delete?")) return;
                              if (profile.role === "owner") {
                                await deleteDocFrom("utilities", u.id);
                                toast.success("Deleted");
                              } else {
                                await submitChangeRequest({
                                  collectionName: "utilities",
                                  action: "delete",
                                  title: `Delete ${u.type} utility`,
                                  actor: { uid: profile.uid, name: profile.name, role: profile.role },
                                  targetId: u.id,
                                  previousData: u,
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
