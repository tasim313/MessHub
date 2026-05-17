export function bdt(n: number): string {
  if (!Number.isFinite(n)) return "৳0";
  return "৳" + Math.round(n).toLocaleString("en-BD");
}

export function ymKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function dayKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}