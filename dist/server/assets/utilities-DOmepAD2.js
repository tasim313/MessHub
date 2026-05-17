import { T as reactExports, K as jsxRuntimeExports } from "./server-BIkp0ycN.js";
import { P as PageHeader } from "./PageHeader-Z4Ff3DaH.js";
import { C as Card } from "./card-C5AiUvxD.js";
import { B as Button } from "./button-Cszx3EH1.js";
import { L as Label, I as Input } from "./label-CaxEp4nO.js";
import { S as Select, d as SelectTrigger, e as SelectValue, b as SelectContent, c as SelectItem } from "./select-Fz2BedER.js";
import { D as Dialog, e as DialogTrigger, f as Plus, a as DialogContent, c as DialogHeader, d as DialogTitle, b as DialogFooter, P as Pencil, T as Trash2 } from "./dialog-CF8eZpBC.js";
import { T as Textarea } from "./textarea-gSn8hMF_.js";
import { c as useAuth, e as useCollection, o as orderBy, d as deleteDocFrom, t as toast, u as updateDocIn, a as addDocTo } from "./router-lCZ3tuDB.js";
import { d as dayKey, y as ymKey, b as bdt } from "./format-D1xUVgSV.js";
import { s as submitChangeRequest } from "./workflow-B7o3jkW0.js";
import { Z as Zap } from "./zap-BuDS_sj6.js";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
import "./createLucideIcon-CnFHiikU.js";
import "./x-DGD8pb0B.js";
const TYPES = ["Electricity", "Gas", "Water", "Internet", "Bua salary", "Rent", "Garbage", "Security", "Generator", "Other"];
function UtilitiesPage() {
  const {
    can,
    profile
  } = useAuth();
  const {
    data: utilities
  } = useCollection("utilities", [orderBy("date", "desc")]);
  const [open, setOpen] = reactExports.useState(false);
  const [editing, setEditing] = reactExports.useState(null);
  const [form, setForm] = reactExports.useState({
    type: "Electricity",
    amount: "",
    date: dayKey(),
    notes: ""
  });
  const resetForm = () => {
    setEditing(null);
    setForm({
      type: "Electricity",
      amount: "",
      date: dayKey(),
      notes: ""
    });
  };
  const onSubmit = async (e) => {
    e.preventDefault();
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) return toast.error("Enter amount");
    try {
      const payload = {
        type: form.type,
        amount,
        date: form.date,
        ym: form.date.slice(0, 7),
        notes: form.notes
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
  const ym = ymKey();
  const monthTotal = utilities.filter((u) => u.ym === ym).reduce((s, u) => s + u.amount, 0);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(PageHeader, { title: "Utilities", description: profile ? `${bdt(monthTotal)} this month · add, edit, delete requests available` : `${bdt(monthTotal)} this month`, action: profile && /* @__PURE__ */ jsxRuntimeExports.jsxs(Dialog, { open, onOpenChange: (value) => {
      setOpen(value);
      if (!value) resetForm();
    }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(DialogTrigger, { asChild: true, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "h-4 w-4 mr-1" }),
        "Add bill"
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogContent, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(DialogHeader, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogTitle, { children: [
          editing ? "Edit" : "Add",
          " utility bill"
        ] }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("form", { onSubmit, className: "space-y-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-3", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Type" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: form.type, onValueChange: (v) => setForm({
                ...form,
                type: v
              }), children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, {}) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectContent, { children: TYPES.map((t) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: t, children: t }, t)) })
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Amount (৳)" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { type: "number", min: "0", step: "0.01", value: form.amount, onChange: (e) => setForm({
                ...form,
                amount: e.target.value
              }), required: true })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Date" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { type: "date", value: form.date, onChange: (e) => setForm({
              ...form,
              date: e.target.value
            }) })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Notes" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Textarea, { rows: 2, value: form.notes, onChange: (e) => setForm({
              ...form,
              notes: e.target.value
            }) })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(DialogFooter, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { type: "submit", children: "Save" }) })
        ] })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-6", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Card, { className: "p-0 overflow-hidden", children: utilities.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-12 text-center text-muted-foreground", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Zap, { className: "h-10 w-10 mx-auto opacity-40 mb-3" }),
      "No utility bills yet"
    ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "overflow-x-auto", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "w-full text-sm", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { className: "text-xs uppercase text-muted-foreground bg-muted/50", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left p-3 font-medium", children: "Date" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left p-3 font-medium", children: "Type" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left p-3 font-medium", children: "Notes" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-right p-3 font-medium", children: "Amount" }),
        profile && /* @__PURE__ */ jsxRuntimeExports.jsx("th", {})
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("tbody", { children: utilities.map((u) => /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-t hover:bg-muted/30", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "p-3", children: u.date }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "p-3 font-medium", children: u.type }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "p-3 text-muted-foreground", children: u.notes || "—" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "p-3 text-right tabular-nums font-semibold", children: bdt(u.amount) }),
        profile && /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "p-3", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-end gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { size: "sm", variant: "outline", onClick: () => {
            setEditing(u);
            setForm({
              type: u.type,
              amount: String(u.amount),
              date: u.date,
              notes: u.notes || ""
            });
            setOpen(true);
          }, children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Pencil, { className: "mr-1 h-3.5 w-3.5" }),
            "Edit"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { size: "sm", variant: "destructive", onClick: async () => {
            if (!profile || !confirm("Delete?")) return;
            if (profile.role === "owner") {
              await deleteDocFrom("utilities", u.id);
              toast.success("Deleted");
            } else {
              await submitChangeRequest({
                collectionName: "utilities",
                action: "delete",
                title: `Delete ${u.type} utility`,
                actor: {
                  uid: profile.uid,
                  name: profile.name,
                  role: profile.role
                },
                targetId: u.id,
                previousData: u
              });
              toast.success("Delete request sent to admin");
            }
          }, children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Trash2, { className: "mr-1 h-3.5 w-3.5" }),
            "Delete"
          ] })
        ] }) })
      ] }, u.id)) })
    ] }) }) }) })
  ] });
}
export {
  UtilitiesPage as component
};
