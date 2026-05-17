import { T as reactExports, K as jsxRuntimeExports } from "./server-BIkp0ycN.js";
import { P as PageHeader } from "./PageHeader-Z4Ff3DaH.js";
import { C as Card } from "./card-C5AiUvxD.js";
import { B as Button } from "./button-Cszx3EH1.js";
import { L as Label, I as Input } from "./label-CaxEp4nO.js";
import { S as Select, d as SelectTrigger, e as SelectValue, b as SelectContent, c as SelectItem } from "./select-Fz2BedER.js";
import { D as Dialog, e as DialogTrigger, f as Plus, a as DialogContent, c as DialogHeader, d as DialogTitle, b as DialogFooter, P as Pencil, T as Trash2 } from "./dialog-CF8eZpBC.js";
import { T as Textarea } from "./textarea-gSn8hMF_.js";
import { c as useAuth, e as useCollection, o as orderBy, d as deleteDocFrom, t as toast, u as updateDocIn, a as addDocTo } from "./router-lCZ3tuDB.js";
import { d as dayKey, b as bdt } from "./format-D1xUVgSV.js";
import { s as submitChangeRequest } from "./workflow-B7o3jkW0.js";
import { c as createLucideIcon } from "./createLucideIcon-CnFHiikU.js";
import { S as ShoppingBasket } from "./shopping-basket-CF0dON7C.js";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
import "./x-DGD8pb0B.js";
const __iconNode = [
  ["path", { d: "m21 21-4.34-4.34", key: "14j7rj" }],
  ["circle", { cx: "11", cy: "11", r: "8", key: "4ej97u" }]
];
const Search = createLucideIcon("search", __iconNode);
const CATS = ["Rice", "Oil", "Fish", "Meat", "Vegetables", "Gas", "Water jar", "Snacks", "Cleaning", "Internet", "Other"];
function BazarPage() {
  const {
    can,
    profile
  } = useAuth();
  const {
    data: members
  } = useCollection("members");
  const {
    data: bazar
  } = useCollection("bazar", [orderBy("date", "desc")]);
  const [open, setOpen] = reactExports.useState(false);
  const [editing, setEditing] = reactExports.useState(null);
  const [search, setSearch] = reactExports.useState("");
  const [form, setForm] = reactExports.useState({
    buyerId: "",
    date: dayKey(),
    category: "Vegetables",
    total: "",
    notes: ""
  });
  const resetForm = () => {
    setEditing(null);
    setForm({
      buyerId: "",
      date: dayKey(),
      category: "Vegetables",
      total: "",
      notes: ""
    });
  };
  const onSubmit = async (e) => {
    e.preventDefault();
    const buyer = members.find((m) => m.id === form.buyerId);
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
        items: [{
          name: form.category,
          amount: total
        }],
        total,
        notes: form.notes
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
  const filtered = bazar.filter((b) => !search || b.category.toLowerCase().includes(search.toLowerCase()) || b.buyerName.toLowerCase().includes(search.toLowerCase()) || (b.notes || "").toLowerCase().includes(search.toLowerCase()));
  const grand = filtered.reduce((s, b) => s + b.total, 0);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(PageHeader, { title: "Bazar", description: profile ? `${filtered.length} entries · ${bdt(grand)} total · add, edit, delete requests available` : `${filtered.length} entries · ${bdt(grand)} total`, action: profile && /* @__PURE__ */ jsxRuntimeExports.jsxs(Dialog, { open, onOpenChange: (value) => {
      setOpen(value);
      if (!value) resetForm();
    }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(DialogTrigger, { asChild: true, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "h-4 w-4 mr-1" }),
        "Add bazar"
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogContent, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(DialogHeader, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogTitle, { children: [
          editing ? "Edit" : "Add",
          " bazar entry"
        ] }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("form", { onSubmit, className: "space-y-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-3", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Buyer" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: form.buyerId, onValueChange: (v) => setForm({
                ...form,
                buyerId: v
              }), children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "Who bought?" }) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectContent, { children: members.map((m) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: m.id, children: m.name }, m.id)) })
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
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-3", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Category" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: form.category, onValueChange: (v) => setForm({
                ...form,
                category: v
              }), children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, {}) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectContent, { children: CATS.map((c) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: c, children: c }, c)) })
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Amount (৳)" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { type: "number", min: "0", step: "0.01", value: form.total, onChange: (e) => setForm({
                ...form,
                total: e.target.value
              }), required: true })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Notes" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Textarea, { rows: 2, value: form.notes, onChange: (e) => setForm({
              ...form,
              notes: e.target.value
            }), placeholder: "Details, items, etc." })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(DialogFooter, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { type: "submit", children: "Save" }) })
        ] })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-6 space-y-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative max-w-md", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Search, { className: "absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { placeholder: "Search by category, buyer, notes…", value: search, onChange: (e) => setSearch(e.target.value), className: "pl-9" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Card, { className: "p-0 overflow-hidden", children: filtered.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-12 text-center text-muted-foreground", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(ShoppingBasket, { className: "h-10 w-10 mx-auto opacity-40 mb-3" }),
        "No bazar entries"
      ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "overflow-x-auto", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "w-full text-sm", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { className: "text-xs uppercase text-muted-foreground bg-muted/50", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left p-3 font-medium", children: "Date" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left p-3 font-medium", children: "Buyer" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left p-3 font-medium", children: "Category" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left p-3 font-medium", children: "Notes" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-right p-3 font-medium", children: "Amount" }),
          profile && /* @__PURE__ */ jsxRuntimeExports.jsx("th", {})
        ] }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("tbody", { children: filtered.map((b) => /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-t hover:bg-muted/30", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "p-3", children: b.date }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "p-3", children: b.buyerName }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "p-3", children: b.category }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "p-3 text-muted-foreground max-w-xs truncate", children: b.notes || "—" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "p-3 text-right tabular-nums font-semibold", children: bdt(b.total) }),
          profile && /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "p-3", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-end gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { size: "sm", variant: "outline", onClick: () => {
              setEditing(b);
              setForm({
                buyerId: b.buyerId,
                date: b.date,
                category: b.category,
                total: String(b.total),
                notes: b.notes || ""
              });
              setOpen(true);
            }, children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Pencil, { className: "mr-1 h-3.5 w-3.5" }),
              "Edit"
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { size: "sm", variant: "destructive", onClick: async () => {
              if (!profile || !confirm("Delete?")) return;
              if (profile.role === "owner") {
                await deleteDocFrom("bazar", b.id);
                toast.success("Deleted");
              } else {
                await submitChangeRequest({
                  collectionName: "bazar",
                  action: "delete",
                  title: `Delete bazar ${b.category}`,
                  actor: {
                    uid: profile.uid,
                    name: profile.name,
                    role: profile.role
                  },
                  targetId: b.id,
                  previousData: b
                });
                toast.success("Delete request sent to admin");
              }
            }, children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Trash2, { className: "mr-1 h-3.5 w-3.5" }),
              "Delete"
            ] })
          ] }) })
        ] }, b.id)) })
      ] }) }) })
    ] })
  ] });
}
export {
  BazarPage as component
};
