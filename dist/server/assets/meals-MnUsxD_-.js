import { T as reactExports, K as jsxRuntimeExports } from "./server-BIkp0ycN.js";
import { P as PageHeader } from "./PageHeader-Z4Ff3DaH.js";
import { C as Card } from "./card-C5AiUvxD.js";
import { B as Button } from "./button-Cszx3EH1.js";
import { L as Label, I as Input } from "./label-CaxEp4nO.js";
import { S as Select, d as SelectTrigger, e as SelectValue, b as SelectContent, c as SelectItem } from "./select-Fz2BedER.js";
import { D as Dialog, e as DialogTrigger, f as Plus, a as DialogContent, c as DialogHeader, d as DialogTitle, b as DialogFooter, P as Pencil, T as Trash2 } from "./dialog-CF8eZpBC.js";
import { c as useAuth, e as useCollection, o as orderBy, d as deleteDocFrom, t as toast, u as updateDocIn, a as addDocTo } from "./router-lCZ3tuDB.js";
import { y as ymKey, d as dayKey } from "./format-D1xUVgSV.js";
import { s as submitChangeRequest } from "./workflow-B7o3jkW0.js";
import { U as Utensils } from "./utensils-Ch03-WBo.js";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
import "./createLucideIcon-CnFHiikU.js";
import "./x-DGD8pb0B.js";
function MealsPage() {
  const {
    can,
    profile
  } = useAuth();
  const {
    data: members
  } = useCollection("members");
  const {
    data: meals
  } = useCollection("meals", [orderBy("date", "desc")]);
  const ym = ymKey();
  const [open, setOpen] = reactExports.useState(false);
  const [editing, setEditing] = reactExports.useState(null);
  const [form, setForm] = reactExports.useState({
    memberId: "",
    date: dayKey(),
    breakfast: 0,
    lunch: 1,
    dinner: 1,
    guest: 0
  });
  const resetForm = () => {
    setEditing(null);
    setForm({
      memberId: "",
      date: dayKey(),
      breakfast: 0,
      lunch: 1,
      dinner: 1,
      guest: 0
    });
  };
  const onSubmit = async (e) => {
    e.preventDefault();
    if (!form.memberId) return toast.error("Pick a member");
    const member = members.find((m) => m.id === form.memberId);
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
        guest: Number(form.guest) || 0
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
          actor: {
            uid: profile.uid,
            name: profile.name,
            role: profile.role
          },
          targetId: editing?.id,
          payload,
          previousData: editing || null
        });
        toast.success("Request sent to admin for approval");
      }
      setOpen(false);
      resetForm();
    } catch (err) {
      toast.error(err.message);
    }
  };
  const monthMeals = meals.filter((m) => m.ym === ym);
  const totals = reactExports.useMemo(() => {
    const map = /* @__PURE__ */ new Map();
    monthMeals.forEach((m) => {
      const cur = map.get(m.memberId) || {
        name: m.memberName,
        total: 0
      };
      cur.total += (m.breakfast || 0) + (m.lunch || 0) + (m.dinner || 0) + (m.guest || 0);
      map.set(m.memberId, cur);
    });
    return Array.from(map.entries());
  }, [monthMeals]);
  const grandTotal = totals.reduce((s, [, v]) => s + v.total, 0);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(PageHeader, { title: "Meals", description: profile ? `${grandTotal} meals logged this month · add, edit, delete requests available` : `${grandTotal} meals logged this month`, action: profile && /* @__PURE__ */ jsxRuntimeExports.jsxs(Dialog, { open, onOpenChange: (value) => {
      setOpen(value);
      if (!value) resetForm();
    }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(DialogTrigger, { asChild: true, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "h-4 w-4 mr-1" }),
        "Log meal"
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogContent, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(DialogHeader, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogTitle, { children: [
          editing ? "Edit" : "Log",
          " meal entry"
        ] }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("form", { onSubmit, className: "space-y-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-3", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Member" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: form.memberId, onValueChange: (v) => setForm({
                ...form,
                memberId: v
              }), children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "Select..." }) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectContent, { children: members.filter((m) => m.active).map((m) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: m.id, children: m.name }, m.id)) })
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Date" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { type: "date", value: form.date, onChange: (e) => setForm({
                ...form,
                date: e.target.value
              }) })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-4 gap-3", children: ["breakfast", "lunch", "dinner", "guest"].map((k) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: "capitalize", children: k }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { type: "number", step: "0.5", min: "0", value: form[k], onChange: (e) => setForm({
              ...form,
              [k]: Number(e.target.value) || 0
            }) })
          ] }, k)) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(DialogFooter, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { type: "submit", children: "Save" }) })
        ] })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-6 space-y-6", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid gap-4 sm:grid-cols-2 lg:grid-cols-4", children: totals.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs(Card, { className: "p-6 sm:col-span-2 lg:col-span-4 text-center text-muted-foreground", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Utensils, { className: "h-8 w-8 mx-auto opacity-40 mb-2" }),
        "No meals this month yet"
      ] }) : totals.map(([id, v]) => /* @__PURE__ */ jsxRuntimeExports.jsxs(Card, { className: "p-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs uppercase text-muted-foreground font-medium", children: v.name }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-2xl font-bold tabular-nums mt-1", children: v.total }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-muted-foreground", children: "meals this month" })
      ] }, id)) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(Card, { className: "p-5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "font-semibold mb-4", children: "Recent entries" }),
        meals.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-muted-foreground py-6 text-center", children: "No entries yet" }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "overflow-x-auto", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "w-full text-sm", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { className: "text-xs text-muted-foreground uppercase", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 font-medium", children: "Date" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 font-medium", children: "Member" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-right py-2 font-medium", children: "B" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-right py-2 font-medium", children: "L" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-right py-2 font-medium", children: "D" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-right py-2 font-medium", children: "G" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-right py-2 font-medium", children: "Total" }),
            profile && /* @__PURE__ */ jsxRuntimeExports.jsx("th", {})
          ] }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("tbody", { children: meals.slice(0, 50).map((m) => /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b last:border-0", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2", children: m.date }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { children: m.memberName }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "text-right tabular-nums", children: m.breakfast }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "text-right tabular-nums", children: m.lunch }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "text-right tabular-nums", children: m.dinner }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "text-right tabular-nums", children: m.guest }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "text-right tabular-nums font-semibold", children: (m.breakfast || 0) + (m.lunch || 0) + (m.dinner || 0) + (m.guest || 0) }),
            profile && /* @__PURE__ */ jsxRuntimeExports.jsx("td", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-end gap-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { size: "sm", variant: "outline", onClick: () => {
                setEditing(m);
                setForm({
                  memberId: m.memberId,
                  date: m.date,
                  breakfast: m.breakfast || 0,
                  lunch: m.lunch || 0,
                  dinner: m.dinner || 0,
                  guest: m.guest || 0
                });
                setOpen(true);
              }, children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(Pencil, { className: "mr-1 h-3.5 w-3.5" }),
                "Edit"
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { size: "sm", variant: "destructive", onClick: async () => {
                if (!profile) return;
                if (profile.role === "owner") {
                  await deleteDocFrom("meals", m.id);
                  toast.success("Deleted");
                } else {
                  await submitChangeRequest({
                    collectionName: "meals",
                    action: "delete",
                    title: `Delete meal for ${m.memberName}`,
                    actor: {
                      uid: profile.uid,
                      name: profile.name,
                      role: profile.role
                    },
                    targetId: m.id,
                    previousData: m
                  });
                  toast.success("Delete request sent to admin");
                }
              }, children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(Trash2, { className: "mr-1 h-3.5 w-3.5" }),
                "Delete"
              ] })
            ] }) })
          ] }, m.id)) })
        ] }) })
      ] })
    ] })
  ] });
}
export {
  MealsPage as component
};
