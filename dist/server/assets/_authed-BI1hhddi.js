import { a6 as useRouter, T as reactExports, K as jsxRuntimeExports, O as Outlet } from "./server-Be2prDnF.js";
import { f as useAuth, j as useTheme, i as useNavigate, L as Link } from "./router-WN6bRTQw.js";
import { a as cn, B as Button } from "./button-DaKbRMv6.js";
import { c as createLucideIcon } from "./createLucideIcon-Bm3FILxO.js";
import { U as Utensils } from "./utensils-B7_DlzVJ.js";
import { S as ShoppingBasket } from "./shopping-basket-Cy8X6ldT.js";
import { Z as Zap } from "./zap-DMD4pnI2.js";
import { W as Wallet } from "./wallet-DGval9w5.js";
import { U as Users } from "./users-CW2kKI2y.js";
import { U as UserPlus } from "./user-plus-ChCu7UmW.js";
import { H as House } from "./house-D1buyzr2.js";
import { X } from "./x-CqIYJWAP.js";
import { L as LoaderCircle } from "./loader-circle-Dpx49ZyD.js";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
function useLocation(opts) {
  const router = useRouter();
  {
    const location = router.stores.location.get();
    return location;
  }
}
const __iconNode$5 = [
  [
    "path",
    {
      d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",
      key: "1oefj6"
    }
  ],
  ["path", { d: "M14 2v5a1 1 0 0 0 1 1h5", key: "wfsgrz" }],
  ["path", { d: "M8 18v-2", key: "qcmpov" }],
  ["path", { d: "M12 18v-4", key: "q1q25u" }],
  ["path", { d: "M16 18v-6", key: "15y0np" }]
];
const FileChartColumnIncreasing = createLucideIcon("file-chart-column-increasing", __iconNode$5);
const __iconNode$4 = [
  ["rect", { width: "7", height: "9", x: "3", y: "3", rx: "1", key: "10lvy0" }],
  ["rect", { width: "7", height: "5", x: "14", y: "3", rx: "1", key: "16une8" }],
  ["rect", { width: "7", height: "9", x: "14", y: "12", rx: "1", key: "1hutg5" }],
  ["rect", { width: "7", height: "5", x: "3", y: "16", rx: "1", key: "ldoo1y" }]
];
const LayoutDashboard = createLucideIcon("layout-dashboard", __iconNode$4);
const __iconNode$3 = [
  ["path", { d: "m16 17 5-5-5-5", key: "1bji2h" }],
  ["path", { d: "M21 12H9", key: "dn1m92" }],
  ["path", { d: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4", key: "1uf3rs" }]
];
const LogOut = createLucideIcon("log-out", __iconNode$3);
const __iconNode$2 = [
  ["path", { d: "M4 5h16", key: "1tepv9" }],
  ["path", { d: "M4 12h16", key: "1lakjw" }],
  ["path", { d: "M4 19h16", key: "1djgab" }]
];
const Menu = createLucideIcon("menu", __iconNode$2);
const __iconNode$1 = [
  [
    "path",
    {
      d: "M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401",
      key: "kfwtm"
    }
  ]
];
const Moon = createLucideIcon("moon", __iconNode$1);
const __iconNode = [
  ["circle", { cx: "12", cy: "12", r: "4", key: "4exip2" }],
  ["path", { d: "M12 2v2", key: "tus03m" }],
  ["path", { d: "M12 20v2", key: "1lh1kg" }],
  ["path", { d: "m4.93 4.93 1.41 1.41", key: "149t6j" }],
  ["path", { d: "m17.66 17.66 1.41 1.41", key: "ptbguv" }],
  ["path", { d: "M2 12h2", key: "1t8f8n" }],
  ["path", { d: "M20 12h2", key: "1q8mjw" }],
  ["path", { d: "m6.34 17.66-1.41 1.41", key: "1m8zz5" }],
  ["path", { d: "m19.07 4.93-1.41 1.41", key: "1shlcs" }]
];
const Sun = createLucideIcon("sun", __iconNode);
const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["owner", "manager", "member"] },
  { to: "/meals", label: "Meals", icon: Utensils, roles: ["owner", "manager", "member"] },
  { to: "/bazar", label: "Bazar", icon: ShoppingBasket, roles: ["owner", "manager", "member"] },
  { to: "/utilities", label: "Utilities", icon: Zap, roles: ["owner", "manager", "member"] },
  { to: "/deposits", label: "Deposits", icon: Wallet, roles: ["owner", "manager", "member"] },
  { to: "/members", label: "Members", icon: Users, roles: ["owner", "manager"] },
  { to: "/reports", label: "Reports", icon: FileChartColumnIncreasing, roles: ["owner", "manager"] },
  { to: "/admin", label: "Users & Admin", icon: UserPlus, roles: ["owner"] }
];
function AppShell({ children }) {
  const { profile, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = reactExports.useState(false);
  const visible = nav.filter((n) => !profile || n.roles.includes(profile.role));
  const onLogout = async () => {
    await logout();
    navigate({ to: "/login" });
  };
  const Sidebar = /* @__PURE__ */ jsxRuntimeExports.jsxs("aside", { className: "flex h-full w-64 flex-col border-r bg-sidebar text-sidebar-foreground", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-16 items-center gap-2 border-b px-5", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground", children: /* @__PURE__ */ jsxRuntimeExports.jsx(House, { className: "h-5 w-5" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "font-bold leading-tight", children: "MessHub" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-muted-foreground", children: "Dhaka edition" })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("nav", { className: "flex-1 space-y-1 p-3", children: visible.map((item) => {
      const active = location.pathname === item.to || location.pathname.startsWith(item.to + "/");
      const Icon = item.icon;
      return /* @__PURE__ */ jsxRuntimeExports.jsxs(
        Link,
        {
          to: item.to,
          onClick: () => setOpen(false),
          className: cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
          ),
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Icon, { className: "h-4 w-4" }),
            item.label
          ]
        },
        item.to
      );
    }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "border-t p-3 space-y-2", children: [
      profile && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 rounded-lg px-2 py-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-9 w-9 items-center justify-center rounded-full bg-accent text-accent-foreground font-semibold uppercase", children: profile.name?.[0] ?? "U" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0 flex-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "truncate text-sm font-medium", children: profile.name }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-muted-foreground capitalize", children: profile.role })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "outline", size: "sm", className: "flex-1", onClick: toggle, children: theme === "dark" ? /* @__PURE__ */ jsxRuntimeExports.jsx(Sun, { className: "h-4 w-4" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Moon, { className: "h-4 w-4" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "outline", size: "sm", className: "flex-1", onClick: onLogout, children: /* @__PURE__ */ jsxRuntimeExports.jsx(LogOut, { className: "h-4 w-4" }) })
      ] })
    ] })
  ] });
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex min-h-screen bg-background", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "hidden md:block", children: Sidebar }),
    open && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "fixed inset-0 z-50 md:hidden", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "absolute inset-0 bg-black/50", onClick: () => setOpen(false) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative h-full w-64", children: [
        Sidebar,
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: () => setOpen(false),
            className: "absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-accent",
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { className: "h-5 w-5" })
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-1 flex-col", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "flex h-14 items-center gap-3 border-b bg-card px-4 md:hidden", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "ghost", size: "sm", onClick: () => setOpen(true), children: /* @__PURE__ */ jsxRuntimeExports.jsx(Menu, { className: "h-5 w-5" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "font-semibold", children: "MessHub" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("main", { className: "flex-1 overflow-auto", children })
    ] })
  ] });
}
function AuthedLayout() {
  const {
    user,
    loading
  } = useAuth();
  const navigate = useNavigate();
  reactExports.useEffect(() => {
    if (!loading && !user) navigate({
      to: "/login"
    });
  }, [user, loading, navigate]);
  if (loading || !user) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex min-h-screen items-center justify-center bg-background", children: /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-8 w-8 animate-spin text-primary" }) });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx(AppShell, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(Outlet, {}) });
}
export {
  AuthedLayout as component
};
