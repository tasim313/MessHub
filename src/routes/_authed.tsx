import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { AppShell } from "@/components/app/AppShell";
import { Loader2 } from "lucide-react";
import { useCollection, type Member, type Room, type Staff } from "@/lib/data";
import type { RentCharge, LedgerEntry, Expense, RecurringBill } from "@/lib/types";
import { ensureRentChargesUpToDate } from "@/lib/rent-service";
import { ensureStaffChargesUpToDate } from "@/lib/staff-charge-service";
import { ensureRecurringExpensesUpToDate } from "@/lib/recurring-bill-service";
import { toast } from "sonner";

export const Route = createFileRoute("/_authed")({
  component: AuthedLayout,
});

/**
 * Rent, staff salaries, and recurring bills (water/internet/garbage/etc.)
 * must never depend on someone remembering to click a "Generate" button.
 * Runs once per session (owner/manager only, matching who's allowed to
 * write these records) and silently backfills whatever's missing — current
 * and past — then does nothing on subsequent checks since everything
 * already exists. Each of the three generators is independently idempotent,
 * so a failure in one doesn't block the others.
 */
function useAutoMonthlyGeneration(enabled: boolean) {
  const { data: members } = useCollection<Member>("members");
  const { data: rooms } = useCollection<Room>("rooms");
  const { data: staff } = useCollection<Staff>("staff");
  const { data: rentCharges } = useCollection<RentCharge>("rent_charges");
  const { data: ledgers } = useCollection<LedgerEntry>("ledgers");
  const { data: expenses } = useCollection<Expense>("expenses");
  const { data: recurringBills } = useCollection<RecurringBill>("recurring_bills");
  const ranRef = useRef(false);

  useEffect(() => {
    if (!enabled || ranRef.current) return;
    if (members.length === 0 || rooms.length === 0) return;
    ranRef.current = true;

    ensureRentChargesUpToDate(members, rooms, rentCharges, ledgers)
      .then((result) => {
        if (result.created > 0) toast.success(`Rent auto-generated for ${result.months.join(", ")}`);
      })
      .catch((err) => console.error("Auto rent generation failed", err));

    ensureStaffChargesUpToDate(members, staff, ledgers)
      .then((result) => {
        if (result.created > 0) toast.success(`Staff charges auto-generated for ${result.months.join(", ")}`);
      })
      .catch((err) => console.error("Auto staff charge generation failed", err));

    ensureRecurringExpensesUpToDate(recurringBills, members, expenses)
      .then((result) => {
        if (result.created > 0) toast.success(`Recurring bills auto-generated for ${result.months.join(", ")}`);
      })
      .catch((err) => console.error("Auto recurring bill generation failed", err));

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, members, rooms, staff, rentCharges, ledgers, expenses, recurringBills]);
}

function AuthedLayout() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [user, loading, navigate]);

  useAutoMonthlyGeneration(profile?.role === "owner" || profile?.role === "manager");

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
