import { T as reactExports, K as jsxRuntimeExports } from "./server-Be2prDnF.js";
import { f as useAuth, i as useNavigate, g as getDoc, c as doc, d as db, L as Link, t as toast } from "./router-WN6bRTQw.js";
import { B as Button } from "./button-DaKbRMv6.js";
import { L as Label, I as Input } from "./label-NPkKlzoR.js";
import { C as Card } from "./card-BWi_GllL.js";
import { S as Select, d as SelectTrigger, e as SelectValue, b as SelectContent, c as SelectItem } from "./select-CQW9GX0z.js";
import { H as House } from "./house-D1buyzr2.js";
import { L as LoaderCircle } from "./loader-circle-Dpx49ZyD.js";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
import "./createLucideIcon-Bm3FILxO.js";
function SignupPage() {
  const {
    user,
    signup
  } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = reactExports.useState("");
  const [email, setEmail] = reactExports.useState("");
  const [password, setPassword] = reactExports.useState("");
  const [role, setRole] = reactExports.useState("member");
  const [busy, setBusy] = reactExports.useState(false);
  const [ownerExists, setOwnerExists] = reactExports.useState(null);
  reactExports.useEffect(() => {
    if (user) navigate({
      to: "/dashboard"
    });
  }, [user, navigate]);
  reactExports.useEffect(() => {
    let mounted = true;
    getDoc(doc(db, "meta", "owner")).then((snap) => {
      if (mounted) setOwnerExists(snap.exists());
    }).catch(() => {
      if (mounted) setOwnerExists(true);
    });
    return () => {
      mounted = false;
    };
  }, []);
  const onSubmit = async (e) => {
    e.preventDefault();
    if (ownerExists) {
      toast.error("New users must be created by the admin from the dashboard.");
      return;
    }
    setBusy(true);
    try {
      await signup(email, password, name, role);
      toast.success("Account created successfully.");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "min-h-screen bg-gradient-to-br from-background via-background to-accent/30 flex items-center justify-center p-4", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "w-full max-w-md space-y-6", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-center space-y-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg", children: /* @__PURE__ */ jsxRuntimeExports.jsx(House, { className: "h-7 w-7" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-3xl font-bold tracking-tight", children: "Create your account" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-muted-foreground", children: "First account becomes the mess Owner" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Card, { className: "p-6 shadow-xl border-border/60", children: ownerExists ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground", children: "The first owner account has already been created. New users now need to be added by the admin from the dashboard." }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { asChild: true, className: "w-full", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Link, { to: "/login", children: "Go to sign in" }) })
    ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("form", { onSubmit, className: "space-y-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { htmlFor: "name", children: "Full name" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { id: "name", required: true, value: name, onChange: (e) => setName(e.target.value) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { htmlFor: "email", children: "Email" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { id: "email", type: "email", required: true, value: email, onChange: (e) => setEmail(e.target.value) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { htmlFor: "password", children: "Password" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { id: "password", type: "password", required: true, minLength: 6, value: password, onChange: (e) => setPassword(e.target.value) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Role" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: role, onValueChange: (value) => setRole(value), children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "Select role" }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "owner", children: "Admin / Owner" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "member", children: "Member" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "manager", children: "Manager" })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-muted-foreground", children: "`Admin / Owner` is visible here. Only the first signup should use it. Later accounts should use Member or Manager." })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { type: "submit", className: "w-full", disabled: busy, children: busy ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-4 w-4 animate-spin" }) : "Create account" })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-center text-sm text-muted-foreground", children: [
      "Already have an account?",
      " ",
      /* @__PURE__ */ jsxRuntimeExports.jsx(Link, { to: "/login", className: "text-primary font-medium hover:underline", children: "Sign in" })
    ] })
  ] }) });
}
export {
  SignupPage as component
};
