function bdt(n) {
  if (!Number.isFinite(n)) return "৳0";
  return "৳" + Math.round(n).toLocaleString("en-BD");
}
function ymKey(d = /* @__PURE__ */ new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function dayKey(d = /* @__PURE__ */ new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export {
  bdt as b,
  dayKey as d,
  ymKey as y
};
