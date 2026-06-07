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
import { useCollection, addDocTo, updateDocIn, deleteDocFrom, orderBy, type Utility } from "@/lib/data";
import { dayKey, bdt } from "@/lib/format";
import { Plus, Trash2, Zap, Pencil } from "lucide-react";
import { toast } from "sonner";
import { submitChangeRequest } from "@/lib/workflow";

export const Route = createFileRoute("/_authed/utilities")({
  component: UtilitiesPage,
});

// Utility types that can be set (one time setup)
const UTILITY_TYPES = ["Electricity", "Gas", "Water", "Internet", "Bua salary", "Garbage", "Security", "Generator", "Other"];

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

  // Get unique utility types (one entry per type)
  const uniqueUtilities = useMemo(() => {
    const seen = new Set<string>();
    return utilities.filter(u => {
      const key = u.type.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [utilities]);

  // Get existing types
  const existingTypes = useMemo(() => 
    new Set(uniqueUtilities.map(u => u.type.toLowerCase())), 
    [uniqueUtilities]
  );
  
  // Available types (not yet set)
  const availableTypes = useMemo(() => 
    editing 
      ? UTILITY_TYPES // When editing, show all types
      : UTILITY_TYPES.filter(t => !existingTypes.has(t.toLowerCase())),
    [existingTypes, editing]
  );

  // Check if type already exists
  const typeExists = (type: string) => existingTypes.has(type.toLowerCase());

  // Delete handler
  const handleDelete = async (u: Utility) => {
    if (!profile || !confirm("Delete?")) return;
    try {
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
    } catch (err) { toast.error((err as Error).message); }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) return toast.error("Enter amount");
    
    // Prevent duplicate type (only when adding, not editing)
    if (!editing && typeExists(form.type)) {
      return toast.error(`${form.type} already set. Edit the existing entry instead.`);
    }
    
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

  const total = uniqueUtilities.reduce((s, u) => s + u.amount, 0);

  return (
    <div>
      <PageHeader
        title="Utilities"
        description={profile ? `${bdt(total)} total · one entry per type · add, edit, delete requests available` : `${bdt(total)} total`}
        action={profile && (
          <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (!value) resetForm(); }}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1"/>Add utility</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} utility</DialogTitle></DialogHeader>
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select value={form.type} onValueChange={(v) => setForm({...form, type: v})}>
                      <SelectTrigger><SelectValue/></SelectTrigger>
                      <SelectContent>
                        {availableTypes.length > 0 ? (
                          availableTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)
                        ) : (
                          <div className="p-2 text-sm text-muted-foreground">All types set</div>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label>Amount (৳)</Label><Input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({...form, amount: e.target.value})} required/></div>
                </div>
                <div className="space-y-2"><Label>Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({...form, date: e.target.value})}/></div>
                <div className="space-y-2"><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({...form, notes: e.target.value})}/></div>
                <DialogFooter><Button type="submit" disabled={availableTypes.length === 0 && !editing}>Save</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      />
      <div className="p-6">
        <Card className="p-0 overflow-hidden">
          {uniqueUtilities.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <Zap className="h-10 w-10 mx-auto opacity-40 mb-3"/>
              No utilities set
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground bg-muted/50">
                  <tr>
                    <th className="text-left p-3 font-medium">Type</th>
                    <th className="text-left p-3 font-medium">Notes</th>
                    <th className="text-right p-3 font-medium">Amount</th>
                    {profile && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {uniqueUtilities.map((u) => (
                    <tr key={u.id} className="border-t hover:bg-muted/30">
                      <td className="p-3 font-medium">{u.type}</td>
                      <td className="p-3 text-muted-foreground">{u.notes || "—"}</td>
                      <td className="p-3 text-right tabular-nums font-semibold">{bdt(u.amount)}</td>
                      {profile && (
                        <td className="p-3">
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => { setEditing(u); setForm({ type: u.type, amount: String(u.amount), date: u.date, notes: u.notes || "" }); setOpen(true); }}>
                              <Pencil className="mr-1 h-3.5 w-3.5" />Edit
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => handleDelete(u)}>
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
