import { K as jsxRuntimeExports } from "./server-Be2prDnF.js";
function PageHeader({ title, description, action }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-3 border-b bg-card/50 px-6 py-5 sm:flex-row sm:items-center sm:justify-between", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-2xl font-bold tracking-tight", children: title }),
      description && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-muted-foreground mt-1", children: description })
    ] }),
    action && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex gap-2", children: action })
  ] });
}
export {
  PageHeader as P
};
