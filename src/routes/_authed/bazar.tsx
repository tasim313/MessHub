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
import { Plus, Trash2, ShoppingBasket, Search, Pencil } from "lucide-react";
import { toast } from "sonner";
import { submitChangeRequest } from "@/lib/workflow";

export const Route = createFileRoute("/_authed/bazar")({
  component: BazarPage,
});

const CATS = ["Rice", "Oil", "Fish", "Meat", "Vegetables", "Gas", "Water jar", "Snacks", "Cleaning", "Internet", "Other"];

function BazarPage() {
  const { can, profile } = useAuth();
  const { data: members } = useCollection<Member>("members");
  const { data: bazar } = useCollection<Bazar>("bazar", [orderBy("date", "desc")]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Bazar | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ buyerId: "", date: dayKey(), category: "Vegetables", total: "", notes: "" });

  const resetForm = () => {
    setEditing(null);
    setForm({ buyerId: "", date: dayKey(), category: "Vegetables", total: "", notes: "" });
  };

  const activeMembers = useMemo(
    () => members.filter((member) => member.active).sort((a, b) => a.name.localeCompare(b.name)),
    [members]
  );

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

  const filtered = bazar.filter((b) =>
    !search ||
    b.category.toLowerCase().includes(search.toLowerCase()) ||
    b.buyerName.toLowerCase().includes(search.toLowerCase()) ||
    (b.notes || "").toLowerCase().includes(search.toLowerCase())
  );
  const grand = filtered.reduce((s, b) => s + b.total, 0);

  return (
    <div>
      <PageHeader
        title="Bazar"
        description={profile ? `${filtered.length} entries · ${bdt(grand)} total · add, edit, delete requests available` : `${filtered.length} entries · ${bdt(grand)} total`}
        action={profile && (
          <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (!value) resetForm(); }}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1"/>Add bazar</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} bazar entry</DialogTitle></DialogHeader>
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Buyer</Label>
                    <Select value={form.buyerId} onValueChange={(v) => setForm({...form, buyerId: v})}>
                      <SelectTrigger><SelectValue placeholder="Who bought?"/></SelectTrigger>
                      <SelectContent>
                        {activeMembers.map((m) => <SelectItem key={m.uid || m.id} value={m.uid || m.id}>{m.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label>Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({...form, date: e.target.value})}/></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select value={form.category} onValueChange={(v) => setForm({...form, category: v})}>
                      <SelectTrigger><SelectValue/></SelectTrigger>
                      <SelectContent>{CATS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label>Amount (৳)</Label><Input type="number" min="0" step="0.01" value={form.total} onChange={(e) => setForm({...form, total: e.target.value})} required/></div>
                </div>
                <div className="space-y-2"><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({...form, notes: e.target.value})} placeholder="Details, items, etc."/></div>
                <DialogFooter><Button type="submit">Save</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      />
      <div className="p-6 space-y-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/>
          <Input placeholder="Search by category, buyer, notes…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9"/>
        </div>
        <Card className="p-0 overflow-hidden">
          {filtered.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <ShoppingBasket className="h-10 w-10 mx-auto opacity-40 mb-3"/>
              No bazar entries
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground bg-muted/50">
                  <tr>
                    <th className="text-left p-3 font-medium">Date</th>
                    <th className="text-left p-3 font-medium">Buyer</th>
                    <th className="text-left p-3 font-medium">Category</th>
                    <th className="text-left p-3 font-medium">Notes</th>
                    <th className="text-right p-3 font-medium">Amount</th>
                    {profile && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((b) => (
                    <tr key={b.id} className="border-t hover:bg-muted/30">
                      <td className="p-3">{b.date}</td>
                      <td className="p-3">{b.buyerName}</td>
                      <td className="p-3">{b.category}</td>
                      <td className="p-3 text-muted-foreground max-w-xs truncate">{b.notes || "—"}</td>
                      <td className="p-3 text-right tabular-nums font-semibold">{bdt(b.total)}</td>
                      {profile && (
                        <td className="p-3">
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => { setEditing(b); setForm({ buyerId: b.buyerId, date: b.date, category: b.category, total: String(b.total), notes: b.notes || "" }); setOpen(true); }}>
                              <Pencil className="mr-1 h-3.5 w-3.5" />Edit
                            </Button>
                            <Button size="sm" variant="destructive" onClick={async () => {
                              if (!profile || !confirm("Delete?")) return;
                              if (profile.role === "owner") {
                                await deleteDocFrom("bazar", b.id);
                                toast.success("Deleted");
                              } else {
                                await submitChangeRequest({
                                  collectionName: "bazar",
                                  action: "delete",
                                  title: `Delete bazar ${b.category}`,
                                  actor: { uid: profile.uid, name: profile.name, role: profile.role },
                                  targetId: b.id,
                                  previousData: b,
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
