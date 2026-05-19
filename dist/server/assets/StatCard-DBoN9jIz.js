import { c as createLucideIcon } from "./createLucideIcon-Bm3FILxO.js";
import { K as jsxRuntimeExports } from "./server-Be2prDnF.js";
import { C as Card } from "./card-BWi_GllL.js";
import { a as cn } from "./button-DaKbRMv6.js";
const __iconNode = [
  ["path", { d: "M16 7h6v6", key: "box55l" }],
  ["path", { d: "m22 7-8.5 8.5-5-5L2 17", key: "1t1m79" }]
];
const TrendingUp = createLucideIcon("trending-up", __iconNode);
function computeMonthly(ym, members, meals, bazar, utilities, deposits) {
  const monthMeals = meals.filter((m) => m.ym === ym);
  const monthBazar = bazar.filter((b) => b.ym === ym);
  const monthUtilities = utilities.filter((u) => u.ym === ym);
  const monthDeposits = deposits.filter((d) => d.ym === ym);
  const totalMeals = monthMeals.reduce(
    (s, m) => s + (m.breakfast || 0) + (m.lunch || 0) + (m.dinner || 0) + (m.guest || 0),
    0
  );
  const totalBazar = monthBazar.reduce((s, b) => s + b.total, 0);
  const totalUtilities = monthUtilities.reduce((s, u) => s + u.amount, 0);
  const totalDeposits = monthDeposits.reduce((s, d) => s + d.amount, 0);
  const mealRate = totalMeals > 0 ? totalBazar / totalMeals : 0;
  const activeMembers = members.filter((m) => m.active);
  const utilityPerMember = activeMembers.length > 0 ? totalUtilities / activeMembers.length : 0;
  const perMember = activeMembers.map((m) => {
    const mealsCount = monthMeals.filter((x) => x.memberId === m.id).reduce((s, x) => s + (x.breakfast || 0) + (x.lunch || 0) + (x.dinner || 0) + (x.guest || 0), 0);
    const mealCost = mealsCount * mealRate;
    const deposited = monthDeposits.filter((d) => d.memberId === m.id).reduce((s, d) => s + d.amount, 0);
    const totalDue = mealCost + utilityPerMember;
    return {
      memberId: m.id,
      memberName: m.name,
      meals: mealsCount,
      mealCost,
      utilityShare: utilityPerMember,
      totalDue,
      deposited,
      balance: deposited - totalDue
    };
  });
  return {
    ym,
    totalMeals,
    totalBazar,
    totalUtilities,
    totalExpense: totalBazar + totalUtilities,
    mealRate,
    utilityPerMember,
    totalDeposits,
    perMember
  };
}
function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  tone = "default"
}) {
  const toneClasses = {
    default: "bg-secondary text-secondary-foreground",
    primary: "bg-primary/10 text-primary",
    warning: "bg-chart-3/15 text-chart-3",
    danger: "bg-destructive/10 text-destructive"
  }[tone];
  return /* @__PURE__ */ jsxRuntimeExports.jsx(Card, { className: "p-5 hover:shadow-md transition-shadow", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start justify-between", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs uppercase tracking-wide text-muted-foreground font-medium", children: label }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-2xl font-bold tabular-nums", children: value }),
      hint && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-muted-foreground", children: hint })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: cn("flex h-10 w-10 items-center justify-center rounded-lg", toneClasses), children: /* @__PURE__ */ jsxRuntimeExports.jsx(Icon, { className: "h-5 w-5" }) })
  ] }) });
}
export {
  StatCard as S,
  TrendingUp as T,
  computeMonthly as c
};
