import { T as reactExports, K as jsxRuntimeExports } from "./server-Be2prDnF.js";
import { P as PageHeader } from "./PageHeader-Cb4B8lqw.js";
import { C as Card } from "./card-BWi_GllL.js";
import { B as Badge } from "./badge-f48e357W.js";
import { f as useAuth, h as useCollection, o as orderBy, t as toast, s as setDocIn } from "./router-WN6bRTQw.js";
import { a as cn, B as Button } from "./button-DaKbRMv6.js";
import { a as applyApprovedRequest, r as rejectRequest } from "./workflow-BI3VGUpj.js";
import { L as Label, I as Input } from "./label-NPkKlzoR.js";
import { S as Select, d as SelectTrigger, e as SelectValue, b as SelectContent, c as SelectItem } from "./select-CQW9GX0z.js";
import { c as createLucideIcon } from "./createLucideIcon-Bm3FILxO.js";
import { U as UserPlus } from "./user-plus-ChCu7UmW.js";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
const __iconNode$7 = [
  ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }],
  ["path", { d: "M4.929 4.929 19.07 19.071", key: "196cmz" }]
];
const Ban = createLucideIcon("ban", __iconNode$7);
const __iconNode$6 = [
  ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }],
  ["path", { d: "m9 12 2 2 4-4", key: "dzmm74" }]
];
const CircleCheck = createLucideIcon("circle-check", __iconNode$6);
const __iconNode$5 = [
  ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }],
  ["path", { d: "m15 9-6 6", key: "1uzhvr" }],
  ["path", { d: "m9 9 6 6", key: "z0biqf" }]
];
const CircleX = createLucideIcon("circle-x", __iconNode$5);
const __iconNode$4 = [
  ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }],
  ["path", { d: "M12 6v6h4", key: "135r8i" }]
];
const Clock3 = createLucideIcon("clock-3", __iconNode$4);
const __iconNode$3 = [
  ["path", { d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8", key: "1357e3" }],
  ["path", { d: "M3 3v5h5", key: "1xhq8a" }],
  ["path", { d: "M12 7v5l4 2", key: "1fdv2h" }]
];
const History = createLucideIcon("history", __iconNode$3);
const __iconNode$2 = [
  ["path", { d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8", key: "1357e3" }],
  ["path", { d: "M3 3v5h5", key: "1xhq8a" }]
];
const RotateCcw = createLucideIcon("rotate-ccw", __iconNode$2);
const __iconNode$1 = [
  [
    "path",
    {
      d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
      key: "oel41y"
    }
  ],
  ["path", { d: "m9 12 2 2 4-4", key: "dzmm74" }]
];
const ShieldCheck = createLucideIcon("shield-check", __iconNode$1);
const __iconNode = [
  ["path", { d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", key: "1yyitq" }],
  ["circle", { cx: "9", cy: "7", r: "4", key: "nufk8" }],
  ["line", { x1: "17", x2: "22", y1: "8", y2: "13", key: "3nzzx3" }],
  ["line", { x1: "22", x2: "17", y1: "8", y2: "13", key: "1swrse" }]
];
const UserX = createLucideIcon("user-x", __iconNode);
const Table = reactExports.forwardRef(
  ({ className, ...props }, ref) => /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "relative w-full overflow-auto", children: /* @__PURE__ */ jsxRuntimeExports.jsx("table", { ref, className: cn("w-full caption-bottom text-sm", className), ...props }) })
);
Table.displayName = "Table";
const TableHeader = reactExports.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { ref, className: cn("[&_tr]:border-b", className), ...props }));
TableHeader.displayName = "TableHeader";
const TableBody = reactExports.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsxRuntimeExports.jsx("tbody", { ref, className: cn("[&_tr:last-child]:border-0", className), ...props }));
TableBody.displayName = "TableBody";
const TableFooter = reactExports.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsxRuntimeExports.jsx(
  "tfoot",
  {
    ref,
    className: cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className),
    ...props
  }
));
TableFooter.displayName = "TableFooter";
const TableRow = reactExports.forwardRef(
  ({ className, ...props }, ref) => /* @__PURE__ */ jsxRuntimeExports.jsx(
    "tr",
    {
      ref,
      className: cn(
        "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
        className
      ),
      ...props
    }
  )
);
TableRow.displayName = "TableRow";
const TableHead = reactExports.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsxRuntimeExports.jsx(
  "th",
  {
    ref,
    className: cn(
      "h-10 px-2 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className
    ),
    ...props
  }
));
TableHead.displayName = "TableHead";
const TableCell = reactExports.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsxRuntimeExports.jsx(
  "td",
  {
    ref,
    className: cn(
      "p-2 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className
    ),
    ...props
  }
));
TableCell.displayName = "TableCell";
const TableCaption = reactExports.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsxRuntimeExports.jsx("caption", { ref, className: cn("mt-4 text-sm text-muted-foreground", className), ...props }));
TableCaption.displayName = "TableCaption";
function statusLabel(status, active) {
  if (status === "removed") return "Removed";
  if (status === "suspended" || active === false) return "Suspended";
  return "Active";
}
function AdminPage() {
  const {
    profile,
    adminCreateUser
  } = useAuth();
  const {
    data: requests
  } = useCollection("change_requests", [orderBy("createdAt", "desc")]);
  const {
    data: logs
  } = useCollection("activity_logs", [orderBy("createdAt", "desc")]);
  const {
    data: users,
    loading: usersLoading
  } = useCollection("users", [orderBy("createdAt", "desc")]);
  const {
    data: members
  } = useCollection("members", [orderBy("joinedAt", "desc")]);
  const [name, setName] = reactExports.useState("");
  const [email, setEmail] = reactExports.useState("");
  const [password, setPassword] = reactExports.useState("");
  const [role, setRole] = reactExports.useState("member");
  const [creating, setCreating] = reactExports.useState(false);
  const [actingUid, setActingUid] = reactExports.useState(null);
  const memberMap = reactExports.useMemo(() => new Map(members.map((member) => [member.uid || member.id, member])), [members]);
  if (profile?.role !== "owner") {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(PageHeader, { title: "Admin", description: "Owner access only" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-6", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Card, { className: "p-6 text-sm text-muted-foreground", children: "Only the Owner can access the admin approval and tracking page." }) })
    ] });
  }
  const actor = {
    uid: profile.uid,
    name: profile.name,
    role: profile.role
  };
  const pending = requests.filter((request) => request.status === "pending");
  const handleCreateUser = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      await adminCreateUser({
        email: email.trim(),
        password,
        name: name.trim(),
        role
      });
      toast.success("User account created successfully.");
      setName("");
      setEmail("");
      setPassword("");
      setRole("member");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setCreating(false);
    }
  };
  const handleUserStatus = async (userItem, nextStatus) => {
    if (userItem.uid === profile.uid && nextStatus !== "active") {
      toast.error("You cannot suspend or remove your own owner account.");
      return;
    }
    setActingUid(userItem.uid);
    try {
      const nextActive = nextStatus === "active";
      const timestamp = Date.now();
      await setDocIn("users", userItem.uid, {
        status: nextStatus,
        active: nextActive,
        suspendedAt: nextStatus === "suspended" ? timestamp : null,
        removedAt: nextStatus === "removed" ? timestamp : null,
        updatedAt: timestamp
      });
      const relatedMember = memberMap.get(userItem.uid);
      if (relatedMember) {
        await setDocIn("members", relatedMember.id, {
          active: nextActive,
          role: userItem.role,
          uid: userItem.uid,
          name: userItem.name,
          email: userItem.email
        });
      }
      toast.success(nextStatus === "active" ? "User reactivated." : nextStatus === "suspended" ? "User suspended." : "User removed from MessHub.");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setActingUid(null);
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(PageHeader, { title: "Admin", description: "Create users, control access, approve requests, and review tracking logs" }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-6 space-y-6", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid gap-4 md:grid-cols-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Card, { className: "p-5", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(ShieldCheck, { className: "h-5 w-5 text-primary" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-muted-foreground", children: "Admin role" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "font-semibold", children: "Owner approval control" })
          ] })
        ] }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Card, { className: "p-5", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Clock3, { className: "h-5 w-5 text-primary" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-muted-foreground", children: "Pending approvals" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "font-semibold", children: pending.length })
          ] })
        ] }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Card, { className: "p-5", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(History, { className: "h-5 w-5 text-primary" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-muted-foreground", children: "Tracked actions" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "font-semibold", children: logs.length })
          ] })
        ] }) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid gap-6 xl:grid-cols-[420px,minmax(0,1fr)]", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Card, { className: "p-5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(UserPlus, { className: "h-5 w-5 text-primary" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "font-semibold", children: "Add user" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-sm text-muted-foreground", children: "Create a new MessHub account with email and password directly from the dashboard." }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("form", { onSubmit: handleCreateUser, className: "mt-5 space-y-4", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { htmlFor: "admin-user-name", children: "Full name" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { id: "admin-user-name", required: true, value: name, onChange: (e) => setName(e.target.value) })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { htmlFor: "admin-user-email", children: "Email" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { id: "admin-user-email", type: "email", required: true, value: email, onChange: (e) => setEmail(e.target.value) })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { htmlFor: "admin-user-password", children: "Password" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { id: "admin-user-password", type: "password", minLength: 6, required: true, value: password, onChange: (e) => setPassword(e.target.value) })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "User role" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: role, onValueChange: (value) => setRole(value), children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "Select role" }) }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "member", children: "Member" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "manager", children: "Manager" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "owner", children: "Owner" })
                ] })
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { type: "submit", className: "w-full", disabled: creating, children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(UserPlus, { className: "mr-2 h-4 w-4" }),
              creating ? "Creating..." : "Create user"
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-muted-foreground", children: "Suspend and remove below are app-level access controls. They block MessHub access immediately, even though browser-only Firebase cannot fully disable Auth accounts." })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Card, { className: "p-5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "font-semibold", children: "User management" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-sm text-muted-foreground", children: "Suspend, reactivate, or remove any non-owner access from the dashboard." }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-4", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(Table, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(TableHeader, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(TableRow, { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(TableHead, { children: "User" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(TableHead, { children: "Role" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(TableHead, { children: "Status" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(TableHead, { className: "text-right", children: "Actions" })
            ] }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(TableBody, { children: usersLoading ? /* @__PURE__ */ jsxRuntimeExports.jsx(TableRow, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(TableCell, { colSpan: 4, className: "text-sm text-muted-foreground", children: "Loading users..." }) }) : users.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx(TableRow, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(TableCell, { colSpan: 4, className: "text-sm text-muted-foreground", children: "No users found." }) }) : users.map((userItem) => {
              const currentStatus = userItem.status || (userItem.active === false ? "suspended" : "active");
              const busy = actingUid === userItem.uid;
              return /* @__PURE__ */ jsxRuntimeExports.jsxs(TableRow, { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs(TableCell, { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "font-medium", children: userItem.name }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-muted-foreground", children: userItem.email })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(TableCell, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(Badge, { variant: "outline", className: "capitalize", children: userItem.role }) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(TableCell, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(Badge, { variant: currentStatus === "active" ? "default" : currentStatus === "suspended" ? "secondary" : "destructive", children: statusLabel(currentStatus, userItem.active) }) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(TableCell, { className: "text-right", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap justify-end gap-2", children: [
                  currentStatus !== "suspended" && currentStatus !== "removed" && /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { size: "sm", variant: "outline", disabled: busy, onClick: () => handleUserStatus(userItem, "suspended"), children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(Ban, { className: "mr-1 h-4 w-4" }),
                    "Suspend"
                  ] }),
                  currentStatus !== "active" && /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { size: "sm", variant: "outline", disabled: busy, onClick: () => handleUserStatus(userItem, "active"), children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(RotateCcw, { className: "mr-1 h-4 w-4" }),
                    "Reactivate"
                  ] }),
                  currentStatus !== "removed" && /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { size: "sm", variant: "destructive", disabled: busy, onClick: () => handleUserStatus(userItem, "removed"), children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(UserX, { className: "mr-1 h-4 w-4" }),
                    "Remove"
                  ] })
                ] }) })
              ] }, userItem.uid);
            }) })
          ] }) })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(Card, { className: "p-5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "font-semibold", children: "Approval inbox" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-sm text-muted-foreground", children: "Members and managers can submit add, edit, and delete requests. Owner approves or rejects them here." }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-4 space-y-3", children: pending.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-lg border p-4 text-sm text-muted-foreground", children: "No pending requests right now." }) : pending.map((request) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-lg border p-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Badge, { children: request.collectionName }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Badge, { variant: "secondary", children: request.action }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Badge, { variant: "outline", children: request.requestedByRole })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-3 font-medium", children: request.title }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-1 text-sm text-muted-foreground", children: [
            "Requested by ",
            request.requestedByName
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 flex gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { size: "sm", onClick: async () => {
              try {
                await applyApprovedRequest(request, actor);
                toast.success("Request approved");
              } catch (error) {
                toast.error(error.message);
              }
            }, children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { className: "mr-1 h-4 w-4" }),
              "Approve"
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { size: "sm", variant: "outline", onClick: async () => {
              try {
                await rejectRequest(request, actor);
                toast.success("Request rejected");
              } catch (error) {
                toast.error(error.message);
              }
            }, children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(CircleX, { className: "mr-1 h-4 w-4" }),
              "Reject"
            ] })
          ] })
        ] }, request.id)) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(Card, { className: "p-5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "font-semibold", children: "Activity tracking" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-sm text-muted-foreground", children: "Every request submission and approval decision is stored in `activity_logs`." }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-4 space-y-2", children: logs.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-lg border p-4 text-sm text-muted-foreground", children: "No tracked actions yet." }) : logs.slice(0, 20).map((log) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-lg border p-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Badge, { variant: "outline", children: log.entity }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Badge, { variant: "secondary", children: log.action }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Badge, { children: log.actorRole })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-2 text-sm", children: log.message }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-1 text-xs text-muted-foreground", children: log.actorName })
        ] }, log.id)) })
      ] })
    ] })
  ] });
}
export {
  AdminPage as component
};
