import { T as reactExports, K as jsxRuntimeExports } from "./server-BIkp0ycN.js";
import { c as useAuth, f as useNavigate } from "./router-lCZ3tuDB.js";
import { L as LoaderCircle } from "./loader-circle-BJpQR19q.js";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
import "./createLucideIcon-CnFHiikU.js";
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
