import { T as reactExports, K as jsxRuntimeExports } from "./server-BIkp0ycN.js";
import { P as PageHeader } from "./PageHeader-Z4Ff3DaH.js";
import { C as Card } from "./card-C5AiUvxD.js";
import { B as Button } from "./button-Cszx3EH1.js";
import { L as Label, I as Input } from "./label-CaxEp4nO.js";
import { D as Dialog, e as DialogTrigger, f as Plus, a as DialogContent, c as DialogHeader, d as DialogTitle, b as DialogFooter, P as Pencil, T as Trash2 } from "./dialog-CF8eZpBC.js";
import { S as Select, d as SelectTrigger, e as SelectValue, b as SelectContent, c as SelectItem } from "./select-Fz2BedER.js";
import { B as Badge } from "./badge-DgDsPmId.js";
import { c as useAuth, e as useCollection, t as toast, u as updateDocIn, a as addDocTo, d as deleteDocFrom } from "./router-lCZ3tuDB.js";
import { s as submitChangeRequest } from "./workflow-B7o3jkW0.js";
import { c as createLucideIcon } from "./createLucideIcon-CnFHiikU.js";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
import "./x-DGD8pb0B.js";
const __iconNode = [
  ["path", { d: "M18 20a6 6 0 0 0-12 0", key: "1qehca" }],
  ["circle", { cx: "12", cy: "10", r: "4", key: "1h16sb" }],
  ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }]
];
const CircleUserRound = createLucideIcon("circle-user-round", __iconNode);
function MembersPage() {
  const {
    can,
    profile
  } = useAuth();
  const {
    data: members
  } = useCollection("members");
  const [open, setOpen] = reactExports.useState(false);
  const [editing, setEditing] = reactExports.useState(null);
  const [form, setForm] = reactExports.useState({
    name: "",
    email: "",
    phone: "",
    role: "member",
    active: true
  });
  const reset = () => {
    setForm({
      name: "",
      email: "",
      phone: "",
      role: "member",
      active: true
    });
    setEditing(null);
  };
  const startEdit = (m) => {
    setEditing(m);
    setForm({
      name: m.name,
      email: m.email || "",
      phone: m.phone || "",
      role: m.role,
      active: m.active,
      uid: m.uid,
      joinedAt: m.joinedAt
    });
    setOpen(true);
  };
  const onSubmit = async (e) => {
    e.preventDefault();
    try {
      if (profile?.role === "owner" && editing) {
        if (editing.uid === profile?.uid && form.role !== "owner" && profile?.role === "owner") {
          toast.error("Owner role cannot be downgraded from this screen");
          return;
        }
        await updateDocIn("members", editing.id, form);
        toast.success("Member updated");
      } else if (profile?.role === "owner") {
        await addDocTo("members", {
          ...form,
          joinedAt: Date.now()
        });
        toast.success("Member added");
      } else if (profile) {
        await submitChangeRequest({
          collectionName: "members",
          action: editing ? "update" : "create",
          title: `${editing ? "Update" : "Add"} member ${form.name}`,
          actor: {
            uid: profile.uid,
            name: profile.name,
            role: profile.role
          },
          targetId: editing?.id,
          payload: editing ? form : {
            ...form,
            joinedAt: Date.now()
          },
          previousData: editing || null
        });
        toast.success("Request sent to admin for approval");
      }
      setOpen(false);
      reset();
    } catch (err) {
      toast.error(err.message);
    }
  };
  const onDelete = async (m) => {
    if (m.uid === profile?.uid) {
      toast.error("You cannot delete your own member profile");
      return;
    }
    if (!confirm(`Remove ${m.name}?`)) return;
    if (profile?.role === "owner") {
      await deleteDocFrom("members", m.id);
      toast.success("Removed");
      return;
    }
    if (profile) {
      await submitChangeRequest({
        collectionName: "members",
        action: "delete",
        title: `Delete member ${m.name}`,
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
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(PageHeader, { title: "Members", description: profile ? "Add, edit, and remove members. Non-owner actions go to admin approval." : "Member management", action: profile && /* @__PURE__ */ jsxRuntimeExports.jsxs(Dialog, { open, onOpenChange: (v) => {
      setOpen(v);
      if (!v) reset();
    }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(DialogTrigger, { asChild: true, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "h-4 w-4 mr-1" }),
        "Add member"
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogContent, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(DialogHeader, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogTitle, { children: [
          editing ? "Edit" : "Add",
          " member"
        ] }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("form", { onSubmit, className: "space-y-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Name" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { required: true, value: form.name, onChange: (e) => setForm({
              ...form,
              name: e.target.value
            }) })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Email" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { type: "email", value: form.email || "", onChange: (e) => setForm({
              ...form,
              email: e.target.value
            }), placeholder: "member@email.com" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Phone" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { value: form.phone, onChange: (e) => setForm({
              ...form,
              phone: e.target.value
            }), placeholder: "01XXX-XXXXXX" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Role" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: form.role, onValueChange: (v) => setForm({
              ...form,
              role: v
            }), children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, {}) }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "member", children: "Member" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "manager", children: "Manager" }),
                profile?.role === "owner" && /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "owner", children: "Owner" })
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("input", { type: "checkbox", id: "active", checked: form.active, onChange: (e) => setForm({
              ...form,
              active: e.target.checked
            }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { htmlFor: "active", children: "Active (counts in monthly split)" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(DialogFooter, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { type: "submit", children: editing ? "Save" : "Add" }) })
        ] })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-6", children: members.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs(Card, { className: "p-12 text-center", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(CircleUserRound, { className: "h-12 w-12 mx-auto text-muted-foreground/40 mb-3" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-muted-foreground", children: "No members yet. Add your first tenant." })
    ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid gap-3 sm:grid-cols-2 lg:grid-cols-3", children: members.map((m) => /* @__PURE__ */ jsxRuntimeExports.jsxs(Card, { className: "p-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start justify-between gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 min-w-0", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-11 w-11 rounded-full bg-accent text-accent-foreground flex items-center justify-center font-semibold uppercase shrink-0", children: m.name[0] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "font-semibold truncate", children: m.name }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-muted-foreground truncate", children: m.email || m.phone || "—" })
          ] })
        ] }),
        profile && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { size: "sm", variant: "outline", onClick: () => startEdit(m), children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Pencil, { className: "mr-1 h-4 w-4" }),
            "Edit"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { size: "sm", variant: "destructive", onClick: () => onDelete(m), children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Trash2, { className: "mr-1 h-4 w-4" }),
            "Delete"
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 flex gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Badge, { variant: "secondary", className: "capitalize", children: m.role }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Badge, { variant: m.active ? "default" : "outline", children: m.active ? "Active" : "Inactive" })
      ] })
    ] }, m.id)) }) })
  ] });
}
export {
  MembersPage as component
};
