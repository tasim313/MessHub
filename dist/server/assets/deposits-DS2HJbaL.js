import { T as reactExports, K as jsxRuntimeExports } from "./server-Be2prDnF.js";
import { P as PageHeader } from "./PageHeader-Cb4B8lqw.js";
import { C as Card } from "./card-BWi_GllL.js";
import { B as Button } from "./button-DaKbRMv6.js";
import { L as Label, I as Input } from "./label-NPkKlzoR.js";
import { S as Select, d as SelectTrigger, e as SelectValue, b as SelectContent, c as SelectItem } from "./select-CQW9GX0z.js";
import { D as Dialog, e as DialogTrigger, f as Plus, a as DialogContent, c as DialogHeader, d as DialogTitle, b as DialogFooter, P as Pencil, T as Trash2 } from "./dialog-Bz3q12UF.js";
import { T as Textarea } from "./textarea-D_DoJwkz.js";
import { f as useAuth, h as useCollection, o as orderBy, b as deleteDocFrom, t as toast, u as updateDocIn, a as addDocTo } from "./router-WN6bRTQw.js";
import { d as dayKey, b as bdt } from "./format-D1xUVgSV.js";
import { s as submitChangeRequest } from "./workflow-BI3VGUpj.js";
import { W as Wallet } from "./wallet-DGval9w5.js";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
import "./createLucideIcon-Bm3FILxO.js";
import "./x-CqIYJWAP.js";
const METHODS = ["Cash", "bKash", "Nagad", "Rocket", "Bank"];
function DepositsPage() {
  const {
    can,
    profile
  } = useAuth();
  const {
    data: members
  } = useCollection("members");
  const {
    data: deposits
  } = useCollection("deposits", [orderBy("date", "desc")]);
  const [open, setOpen] = reactExports.useState(false);
  const [editing, setEditing] = reactExports.useState(null);
  const [form, setForm] = reactExports.useState({
    memberId: "",
    amount: "",
    method: "bKash",
    date: dayKey(),
    notes: ""
  });
  const resetForm = () => {
    setEditing(null);
    setForm({
      memberId: "",
      amount: "",
      method: "bKash",
      date: dayKey(),
      notes: ""
    });
  };
  const activeMembers = reactExports.useMemo(() => members.filter((member) => member.active).sort((a, b) => a.name.localeCompare(b.name)), [members]);
  const onSubmit = async (e) => {
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
        notes: form.notes
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
  const total = deposits.reduce((s, d) => s + d.amount, 0);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(PageHeader, { title: "Deposits", description: profile ? `${bdt(total)} collected · ${deposits.length} payments · add, edit, delete requests available` : `${bdt(total)} collected · ${deposits.length} payments`, action: profile && /* @__PURE__ */ jsxRuntimeExports.jsxs(Dialog, { open, onOpenChange: (value) => {
      setOpen(value);
      if (!value) resetForm();
    }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(DialogTrigger, { asChild: true, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "h-4 w-4 mr-1" }),
        "Add deposit"
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogContent, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(DialogHeader, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogTitle, { children: [
          editing ? "Edit" : "Record",
          " deposit"
        ] }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("form", { onSubmit, className: "space-y-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-3", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Member" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: form.memberId, onValueChange: (v) => setForm({
                ...form,
                memberId: v
              }), children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "Who paid?" }) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectContent, { children: activeMembers.map((m) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: m.uid || m.id, children: m.name }, m.uid || m.id)) })
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
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-3", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Method" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: form.method, onValueChange: (v) => setForm({
                ...form,
                method: v
              }), children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, {}) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectContent, { children: METHODS.map((m) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: m, children: m }, m)) })
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
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-6", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Card, { className: "p-0 overflow-hidden", children: deposits.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-12 text-center text-muted-foreground", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Wallet, { className: "h-10 w-10 mx-auto opacity-40 mb-3" }),
      "No deposits yet"
    ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "overflow-x-auto", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "w-full text-sm", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { className: "text-xs uppercase text-muted-foreground bg-muted/50", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left p-3 font-medium", children: "Date" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left p-3 font-medium", children: "Member" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left p-3 font-medium", children: "Method" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left p-3 font-medium", children: "Notes" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-right p-3 font-medium", children: "Amount" }),
        profile && /* @__PURE__ */ jsxRuntimeExports.jsx("th", {})
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("tbody", { children: deposits.map((d) => /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-t hover:bg-muted/30", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "p-3", children: d.date }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "p-3 font-medium", children: d.memberName }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "p-3", children: d.method }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "p-3 text-muted-foreground", children: d.notes || "—" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "p-3 text-right tabular-nums font-semibold text-primary", children: bdt(d.amount) }),
        profile && /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "p-3", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-end gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { size: "sm", variant: "outline", onClick: () => {
            setEditing(d);
            setForm({
              memberId: d.memberId,
              amount: String(d.amount),
              method: d.method,
              date: d.date,
              notes: d.notes || ""
            });
            setOpen(true);
          }, children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Pencil, { className: "mr-1 h-3.5 w-3.5" }),
            "Edit"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { size: "sm", variant: "destructive", onClick: async () => {
            if (!profile || !confirm("Delete?")) return;
            if (profile.role === "owner") {
              await deleteDocFrom("deposits", d.id);
              toast.success("Deleted");
            } else {
              await submitChangeRequest({
                collectionName: "deposits",
                action: "delete",
                title: `Delete deposit for ${d.memberName}`,
                actor: {
                  uid: profile.uid,
                  name: profile.name,
                  role: profile.role
                },
                targetId: d.id,
                previousData: d
              });
              toast.success("Delete request sent to admin");
            }
          }, children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Trash2, { className: "mr-1 h-3.5 w-3.5" }),
            "Delete"
          ] })
        ] }) })
      ] }, d.id)) })
    ] }) }) }) })
  ] });
}
export {
  DepositsPage as component
};
