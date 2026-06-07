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
import { Plus, Trash2, Banknote, Pencil } from "lucide-react";
import { toast } from "sonner";
import { submitChangeRequest } from "@/lib/workflow";
import { checkPaymentReferenceExists } from "@/lib/duplicate-check";
import type { Payment } from "@/lib/types";

export const Route = createFileRoute("/_authed/payments")({
  component: PaymentsPage,
});

const METHODS = ["Cash", "bKash", "Nagad", "Rocket", "Bank"];
const STATUSES = ["paid", "partially_paid", "due", "overpaid"];

function PaymentsPage() {
  const { can, profile } = useAuth();
  const { data: members } = useCollection<Member>("members");
  const { data: payments } = useCollection<Payment>("payments", [orderBy("date", "desc")]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Payment | null>(null);
  const [form, setForm] = useState({ memberId: "", amount: "", method: "Cash", date: dayKey(), status: "paid" as Payment["status"], referenceNo: "", notes: "" });

  const resetForm = () => {
    setEditing(null);
    setForm({ memberId: "", amount: "", method: "Cash", date: dayKey(), status: "paid", referenceNo: "", notes: "" });
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

    // Check for duplicate reference
    if (form.referenceNo && await checkPaymentReferenceExists(form.referenceNo, form.date)) {
      return toast.error("Payment with this reference already exists for this date");
    }

    try {
      const payload = {
        memberId: form.memberId,
        memberName: member.name,
        amount,
        method: form.method,
        date: form.date,
        ym: form.date.slice(0, 7),
        status: form.status,
        referenceNo: form.referenceNo,
        notes: form.notes,
      };
      if (profile?.role === "owner" && editing) {
        await updateDocIn("payments", editing.id, payload);
        toast.success("Payment updated");
      } else if (profile?.role === "owner") {
        await addDocTo("payments", payload);
        // Also create ledger entry for consistency
        await addDocTo("ledgers", {
          memberId: form.memberId,
          memberName: member.name,
          date: form.date,
          ym: form.date.slice(0, 7),
          transactionType: "payment",
          category: "payment",
          amount,
          notes: form.notes || `Payment via ${form.method}`,
        });
        toast.success("Payment recorded");
      } else if (profile) {
        await submitChangeRequest({
          collectionName: "payments",
          action: editing ? "update" : "create",
          title: `${editing ? "Update" : "Add"} payment for ${member.name}`,
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

  const total = payments.reduce((s, d) => s + d.amount, 0);

  const statusVariant = (status: string) => {
    switch (status) {
      case "paid": return "default";
      case "partially_paid": return "secondary";
      case "overpaid": return "default";
      default: return "destructive";
    }
  };

  return (
    <div>
      <PageHeader
        title="Payments"
        description={`${bdt(total)} total · ${payments.length} entries`}
        action={
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1"/>Record payment</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editing ? "Edit" : "Record"} payment</DialogTitle></DialogHeader>
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
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Method</Label>
                    <Select value={form.method} onValueChange={(v) => setForm({...form, method: v})}>
                      <SelectTrigger><SelectValue/></SelectTrigger>
                      <SelectContent>{METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={form.status} onValueChange={(v) => setForm({...form, status: v as Payment["status"]})}>
                      <SelectTrigger><SelectValue/></SelectTrigger>
                      <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s} className="capitalize">{s.replace("_", " ")}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({...form, date: e.target.value})}/></div>
                  <div className="space-y-2"><Label>Reference</Label><Input value={form.referenceNo} onChange={(e) => setForm({...form, referenceNo: e.target.value})} placeholder="TrxID or ref #"/></div>
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
          {payments.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <Banknote className="h-10 w-10 mx-auto opacity-40 mb-3"/>
              No payments yet
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground bg-muted/50">
                  <tr>
                    <th className="text-left p-3 font-medium">Date</th>
                    <th className="text-left p-3 font-medium">Member</th>
                    <th className="text-left p-3 font-medium">Method</th>
                    <th className="text-left p-3 font-medium">Ref</th>
                    <th className="text-left p-3 font-medium">Status</th>
                    <th className="text-right p-3 font-medium">Amount</th>
                    {profile && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {payments.map((d) => (
                    <tr key={d.id} className="border-t hover:bg-muted/30">
                      <td className="p-3">{d.date}</td>
                      <td className="p-3 font-medium">{d.memberName}</td>
                      <td className="p-3">{d.method}</td>
                      <td className="p-3 text-muted-foreground">{d.referenceNo || "—"}</td>
                      <td className="p-3">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          d.status === "paid" ? "bg-primary/10 text-primary" :
                          d.status === "partially_paid" ? "bg-chart-3/15 text-chart-3" :
                          d.status === "overpaid" ? "bg-blue-500/10 text-blue-500" :
                          "bg-destructive/10 text-destructive"
                        }`}>
                          {d.status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="p-3 text-right tabular-nums font-semibold">{bdt(d.amount)}</td>
                      {profile && (
                        <td className="p-3">
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => { setEditing(d); setForm({ memberId: d.memberId, amount: String(d.amount), method: d.method, date: d.date, status: d.status, referenceNo: d.referenceNo || "", notes: d.notes || "" }); setOpen(true); }}>
                              <Pencil className="mr-1 h-3.5 w-3.5" />Edit
                            </Button>
                            <Button size="sm" variant="destructive" onClick={async () => {
                              if (!profile || !confirm("Delete?")) return;
                              if (profile.role === "owner") {
                                await deleteDocFrom("payments", d.id);
                                toast.success("Deleted");
                              } else {
                                await submitChangeRequest({
                                  collectionName: "payments",
                                  action: "delete",
                                  title: `Delete payment for ${d.memberName}`,
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