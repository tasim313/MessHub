import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { AppShell } from "@/components/app/AppShell";
import { Loader2 } from "lucide-react";
import { useCollection, type Member, type Room } from "@/lib/data";
import type { RentCharge, LedgerEntry } from "@/lib/types";
import { ensureRentChargesUpToDate } from "@/lib/rent-service";
import { toast } from "sonner";

export const Route = createFileRoute("/_authed")({
  component: AuthedLayout,
});

/**
 * Rent must never depend on someone remembering to click "Generate Rent".
 * Runs once per session (owner/manager only, matching who's allowed to
 * write rent_charges) and silently backfills any missing month — current
 * and past — for every active member, then does nothing on subsequent
 * checks since everything already exists.
 */
function useAutoRentGeneration(enabled: boolean) {
  const { data: members } = useCollection<Member>("members");
  const { data: rooms } = useCollection<Room>("rooms");
  const { data: rentCharges } = useCollection<RentCharge>("rent_charges");
  const { data: ledgers } = useCollection<LedgerEntry>("ledgers");
  const ranRef = useRef(false);

  useEffect(() => {
    if (!enabled || ranRef.current) return;
    if (members.length === 0 || rooms.length === 0) return;
    ranRef.current = true;
    ensureRentChargesUpToDate(members, rooms, rentCharges, ledgers)
      .then((result) => {
        if (result.created > 0) {
          toast.success(`Rent auto-generated for ${result.months.join(", ")}`);
        }
      })
      .catch((err) => {
        console.error("Auto rent generation failed", err);
        ranRef.current = false; // allow a retry on the next data refresh
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, members, rooms, rentCharges, ledgers]);
}

function AuthedLayout() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [user, loading, navigate]);

  useAutoRentGeneration(profile?.role === "owner" || profile?.role === "manager");

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
