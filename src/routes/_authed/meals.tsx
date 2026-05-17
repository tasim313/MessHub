import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useCollection, addDocTo, updateDocIn, deleteDocFrom, orderBy, type MealEntry, type Member } from "@/lib/data";
import { dayKey, ymKey } from "@/lib/format";
import { Plus, Trash2, Utensils, Pencil } from "lucide-react";
import { toast } from "sonner";
import { submitChangeRequest } from "@/lib/workflow";

export const Route = createFileRoute("/_authed/meals")({
  component: MealsPage,
});

function MealsPage() {
  const { can, profile } = useAuth();
  const { data: members } = useCollection<Member>("members");
  const { data: meals } = useCollection<MealEntry>("meals", [orderBy("date", "desc")]);
  const ym = ymKey();
  const activeMembers = useMemo(
    () => members.filter((member) => member.active).sort((a, b) => a.name.localeCompare(b.name)),
    [members]
  );

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MealEntry | null>(null);
  const [form, setForm] = useState({
    memberId: "",
    date: dayKey(),
    breakfast: 0,
    lunch: 1,
    dinner: 1,
    guest: 0,
  });

  const resetForm = () => {
    setEditing(null);
    setForm({
      memberId: "",
      date: dayKey(),
      breakfast: 0,
      lunch: 1,
      dinner: 1,
      guest: 0,
    });
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.memberId) return toast.error("Pick a member");
    const member = members.find((m) => (m.uid || m.id) === form.memberId);
    if (!member) return;
    try {
      const payload = {
        memberId: form.memberId,
        memberName: member.name,
        date: form.date,
        ym: form.date.slice(0, 7),
        breakfast: Number(form.breakfast) || 0,
        lunch: Number(form.lunch) || 0,
        dinner: Number(form.dinner) || 0,
        guest: Number(form.guest) || 0,
      };
      if (profile?.role === "owner" && editing) {
        await updateDocIn("meals", editing.id, payload);
        toast.success("Meal updated");
      } else if (profile?.role === "owner") {
        await addDocTo("meals", payload);
        toast.success("Meal logged");
      } else if (profile) {
        await submitChangeRequest({
          collectionName: "meals",
          action: editing ? "update" : "create",
          title: `${editing ? "Update" : "Add"} meal for ${member.name}`,
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

  const monthMeals = meals.filter((m) => m.ym === ym);
  const totals = useMemo(() => {
    const map = new Map<string, { name: string; total: number }>();
    monthMeals.forEach((m) => {
      const cur = map.get(m.memberId) || { name: m.memberName, total: 0 };
      cur.total += (m.breakfast || 0) + (m.lunch || 0) + (m.dinner || 0) + (m.guest || 0);
      map.set(m.memberId, cur);
    });
    return Array.from(map.entries());
  }, [monthMeals]);

  const grandTotal = totals.reduce((s, [, v]) => s + v.total, 0);

  return (
    <div>
      <PageHeader
        title="Meals"
        description={profile ? `${grandTotal} meals logged this month · add, edit, delete requests available` : `${grandTotal} meals logged this month`}
        action={profile && (
          <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (!value) resetForm(); }}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1"/>Log meal</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editing ? "Edit" : "Log"} meal entry</DialogTitle></DialogHeader>
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Member</Label>
                    <Select value={form.memberId} onValueChange={(v) => setForm({...form, memberId: v})}>
                      <SelectTrigger><SelectValue placeholder="Select..."/></SelectTrigger>
                      <SelectContent>
                        {activeMembers.map((m) => <SelectItem key={m.uid || m.id} value={m.uid || m.id}>{m.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label>Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({...form, date: e.target.value})}/></div>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  {(["breakfast","lunch","dinner","guest"] as const).map((k) => (
                    <div key={k} className="space-y-2">
                      <Label className="capitalize">{k}</Label>
                      <Input type="number" step="0.5" min="0" value={form[k]} onChange={(e) => setForm({...form, [k]: Number(e.target.value) || 0})}/>
                    </div>
                  ))}
                </div>
                <DialogFooter><Button type="submit">Save</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      />
      <div className="p-6 space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {totals.length === 0 ? (
            <Card className="p-6 sm:col-span-2 lg:col-span-4 text-center text-muted-foreground">
              <Utensils className="h-8 w-8 mx-auto opacity-40 mb-2"/>No meals this month yet
            </Card>
          ) : totals.map(([id, v]) => (
            <Card key={id} className="p-4">
              <div className="text-xs uppercase text-muted-foreground font-medium">{v.name}</div>
              <div className="text-2xl font-bold tabular-nums mt-1">{v.total}</div>
              <div className="text-xs text-muted-foreground">meals this month</div>
            </Card>
          ))}
        </div>

        <Card className="p-5">
          <h3 className="font-semibold mb-4">Recent entries</h3>
          {meals.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No entries yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground uppercase">
                  <tr className="border-b">
                    <th className="text-left py-2 font-medium">Date</th>
                    <th className="text-left py-2 font-medium">Member</th>
                    <th className="text-right py-2 font-medium">B</th>
                    <th className="text-right py-2 font-medium">L</th>
                    <th className="text-right py-2 font-medium">D</th>
                    <th className="text-right py-2 font-medium">G</th>
                    <th className="text-right py-2 font-medium">Total</th>
                    {profile && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {meals.slice(0, 50).map((m) => (
                    <tr key={m.id} className="border-b last:border-0">
                      <td className="py-2">{m.date}</td>
                      <td>{m.memberName}</td>
                      <td className="text-right tabular-nums">{m.breakfast}</td>
                      <td className="text-right tabular-nums">{m.lunch}</td>
                      <td className="text-right tabular-nums">{m.dinner}</td>
                      <td className="text-right tabular-nums">{m.guest}</td>
                      <td className="text-right tabular-nums font-semibold">{(m.breakfast||0)+(m.lunch||0)+(m.dinner||0)+(m.guest||0)}</td>
                      {profile && (
                        <td>
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => { setEditing(m); setForm({ memberId: m.memberId, date: m.date, breakfast: m.breakfast || 0, lunch: m.lunch || 0, dinner: m.dinner || 0, guest: m.guest || 0 }); setOpen(true); }}>
                              <Pencil className="mr-1 h-3.5 w-3.5" />Edit
                            </Button>
                            <Button size="sm" variant="destructive" onClick={async () => {
                              if (!profile) return;
                              if (profile.role === "owner") {
                                await deleteDocFrom("meals", m.id);
                                toast.success("Deleted");
                              } else {
                                await submitChangeRequest({
                                  collectionName: "meals",
                                  action: "delete",
                                  title: `Delete meal for ${m.memberName}`,
                                  actor: { uid: profile.uid, name: profile.name, role: profile.role },
                                  targetId: m.id,
                                  previousData: m,
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
