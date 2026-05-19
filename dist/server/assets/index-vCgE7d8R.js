import { T as reactExports, K as jsxRuntimeExports } from "./server-Be2prDnF.js";
import { f as useAuth, i as useNavigate } from "./router-WN6bRTQw.js";
import { L as LoaderCircle } from "./loader-circle-Dpx49ZyD.js";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
import "./createLucideIcon-Bm3FILxO.js";
function Index() {
  const {
    user,
    loading
  } = useAuth();
  const navigate = useNavigate();
  reactExports.useEffect(() => {
    if (loading) return;
    navigate({
      to: user ? "/dashboard" : "/login"
    });
  }, [user, loading, navigate]);
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex min-h-screen items-center justify-center bg-background", children: /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-8 w-8 animate-spin text-primary" }) });
}
export {
  Index as component
};
