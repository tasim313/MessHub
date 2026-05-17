import { K as jsxRuntimeExports } from "./server-BIkp0ycN.js";
import { P as PageHeader } from "./PageHeader-Z4Ff3DaH.js";
import { C as Card } from "./card-C5AiUvxD.js";
import { B as Badge } from "./badge-DgDsPmId.js";
import { c as useAuth, e as useCollection, o as orderBy, t as toast } from "./router-lCZ3tuDB.js";
import { B as Button } from "./button-Cszx3EH1.js";
import { a as applyApprovedRequest, r as rejectRequest } from "./workflow-B7o3jkW0.js";
import { S as ShieldCheck } from "./shield-check-BZj0zV0w.js";
import { c as createLucideIcon } from "./createLucideIcon-CnFHiikU.js";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
const __iconNode$3 = [
  ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }],
  ["path", { d: "m9 12 2 2 4-4", key: "dzmm74" }]
];
const CircleCheck = createLucideIcon("circle-check", __iconNode$3);
const __iconNode$2 = [
  ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }],
  ["path", { d: "m15 9-6 6", key: "1uzhvr" }],
  ["path", { d: "m9 9 6 6", key: "z0biqf" }]
];
const CircleX = createLucideIcon("circle-x", __iconNode$2);
const __iconNode$1 = [
  ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }],
  ["path", { d: "M12 6v6h4", key: "135r8i" }]
];
const Clock3 = createLucideIcon("clock-3", __iconNode$1);
const __iconNode = [
  ["path", { d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8", key: "1357e3" }],
  ["path", { d: "M3 3v5h5", key: "1xhq8a" }],
  ["path", { d: "M12 7v5l4 2", key: "1fdv2h" }]
];
const History = createLucideIcon("history", __iconNode);
function AdminPage() {
  const {
    profile
  } = useAuth();
  const {
    data: requests
  } = useCollection("change_requests", [orderBy("createdAt", "desc")]);
  const {
    data: logs
  } = useCollection("activity_logs", [orderBy("createdAt", "desc")]);
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
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(PageHeader, { title: "Admin", description: "Approve requests, review tracking logs, and control operational changes" }),
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
