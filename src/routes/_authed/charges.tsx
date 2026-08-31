import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useMemo, useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  useCollection,
  addDocTo,
  updateDocIn,
  deleteDocFrom,
  orderBy,
  where,
  type Member,
  type Room,
  type LedgerEntry,
  type MealEntry,
  type Bazar,
  type Staff,
} from "@/lib/data";
import { ymKey, bdt } from "@/lib/format";
import { MonthPicker } from "@/components/ui/month-picker";
import {
  Receipt, DollarSign, Users, Building2, Trash2, Loader2, ArrowUpDown,
  UserRound, BedDouble, CreditCard, PiggyBank, BadgePercent,
  Search, Filter, X, CheckCircle2, CircleDot, AlertCircle,
  ChevronDown, ChevronUp, WalletIcon, FileMinus2, Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { submitChangeRequest } from "@/lib/workflow";
import type { Deposit, Credit, Payment, Expense, ServiceType, MonthlyClosing, ExpenseAllocation } from "@/lib/types";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/types";
import { calculateMemberSettlement } from "@/lib/calculations/engine";
import { isMemberSubscribedToService, getPerBedRent } from "@/lib/calc";
import { checkLedgerChargeExists, deleteDuplicateCharges } from "@/lib/duplicate-check";
import { recordPaymentWithAdvanceRecovery } from "@/lib/payment-service";
import { issueCreditNote, issueRefund, voidCreditNote, voidRefund } from "@/lib/credit-refund-service";
import type { ChargeAllocation, CreditNote, Refund } from "@/lib/types";

export const Route = createFileRoute("/_authed/charges")({
  component: ChargesPage,
});

const SERVICE_LABELS: Record<ServiceType, string> = {
  rent: "Rent", meals: "Meals", internet: "Internet", electricity: "Electricity",
  gas: "Gas", water: "Water", cooking_staff: "Cooking Staff", cleaning_staff: "Cleaning Staff",
  security_staff: "Security Staff", laundry: "Laundry", parking: "Parking",
  generator: "Generator", maintenance: "Maintenance", other_services: "Other Services",
};

const METHODS = ["Cash", "bKash", "Nagad", "Rocket", "Bank"];

const monthOptions = [
  { value: "1", label: "January" }, { value: "2", label: "February" },
  { value: "3", label: "March" }, { value: "4", label: "April" },
  { value: "5", label: "May" }, { value: "6", label: "June" },
  { value: "7", label: "July" }, { value: "8", label: "August" },
  { value: "9", label: "September" }, { value: "10", label: "October" },
  { value: "11", label: "November" }, { value: "12", label: "December" },
];

/**
 * Human-readable labels for charge transaction types
 */
const CHARGE_TYPE_LABELS: Record<string, string> = {
  meal_charge: "Meal Cost",
  rent_charge: "Rent",
  utility_charge: "Shared Expense",
  staff_charge: "Staff Salary",
  other_charge: "Other Charge",
};

/** Charge types that should be displayed as individual charge rows */
const CHARGE_TRANSACTION_TYPES = ["meal_charge", "rent_charge", "utility_charge", "staff_charge", "other_charge"];

function getChargeTypeFromCategory(category: string): string {
  if (category === "meal") return "meal_charge";
  if (category === "rent") return "rent_charge";
  if (category === "staff") return "staff_charge";
  if (["internet", "electricity", "gas", "water", "generator", "maintenance",
       "cleaner_salary", "security_salary", "garbage", "wifi", "kitchen",
       "furniture", "appliance", "other_expense"].includes(category)) {
    return "utility_charge";
  }
  return "other_charge";
}

function ChargesPage() {
  const { profile } = useAuth();
  const [ym, setYm] = useState(ymKey());
  const [selectedMember, setSelectedMember] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [showPaidCharges, setShowPaidCharges] = useState(false);

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const { data: members } = useCollection<Member>("members");
  const { data: rooms } = useCollection<Room>("rooms");
  const { data: staff } = useCollection<Staff>("staff");
  const { data: expenses } = useCollection<Expense>("expenses", [orderBy("date", "desc")]);
  const { data: meals } = useCollection<MealEntry>("meals", [orderBy("date", "desc")]);
  const { data: bazar } = useCollection<Bazar>("bazar", [orderBy("date", "desc")]);
  const { data: ledgers } = useCollection<LedgerEntry>("ledgers", [orderBy("date", "desc")]);
  const { data: payments } = useCollection<Payment>("payments", [orderBy("date", "desc")]);
  const { data: deposits } = useCollection<Deposit>("deposits", [orderBy("date", "desc")]);
  const { data: credits } = useCollection<Credit>("credits", [orderBy("date", "desc")]);
  const { data: closings } = useCollection<MonthlyClosing>("monthly_closing", [orderBy("createdAt", "desc")]);
  const { data: allocations } = useCollection<ExpenseAllocation>("expense_allocations", [orderBy("createdAt", "desc")]);
  const { data: chargeAllocations } = useCollection<ChargeAllocation>(
    "charge_allocations",
    [where("memberId", "==", selectedMember || "__none__")],
  );
  const { data: creditNotes } = useCollection<CreditNote>(
    "credit_notes",
    [where("memberId", "==", selectedMember || "__none__")],
  );
  const { data: refunds } = useCollection<Refund>(
    "refunds",
    [where("memberId", "==", selectedMember || "__none__")],
  );

  const activeMembers = useMemo(
    () => members.filter((m) => m.active).sort((a, b) => a.name.localeCompare(b.name)),
    [members]
  );

  // Pending filter state (what user selects, only applies on Search click)
  const [pendingYear, setPendingYear] = useState<string>(String(currentYear));
  const [pendingMonth, setPendingMonth] = useState<string>(String(currentMonth));
  const [pendingMember, setPendingMember] = useState<string>("");

  // Applied filter state (what actually drives the data)
  const [filterYear, setFilterYear] = useState<string>(String(currentYear));
  const [filterMonth, setFilterMonth] = useState<string>(String(currentMonth));
  const [filterMember, setFilterMember] = useState<string>("");

  const yearOptions = useMemo(() => {
    const years = new Set<string>();
    years.add(String(currentYear));
    return Array.from(years).sort((a, b) => Number(b) - Number(a));
  }, [currentYear]);

  // Auto-select first member when data loads
  useEffect(() => {
    if (activeMembers.length > 0 && !selectedMember) {
      const defaultMember = filterMember || activeMembers[0].id;
      setSelectedMember(defaultMember);
      if (!pendingMember) setPendingMember(defaultMember);
      if (!filterMember) setFilterMember(defaultMember);
    }
  }, [activeMembers, selectedMember, filterMember, pendingMember]);

  const currentMember = members.find((m) => m.id === selectedMember);
  const currentRoom = rooms.find((r) => r.id === currentMember?.roomId);

  const monthExpenses = expenses.filter((e) => e.ym === ym);
  const monthPayments = payments.filter((p) => p.ym === ym);
  const monthAllocations = allocations.filter((a) => (a as any).ym === ym);

  const activeServices = useMemo(() => {
    if (!currentMember?.services) return [];
    return currentMember.services.filter((s) => s.enabled).map((s) => s.type);
  }, [currentMember]);

  /**
   * INDIVIDUAL CHARGES: Get all charge entries from the ledger for the selected member and month.
   * Each charge is displayed as its own row (not combined).
   * Paid charges are soft-deleted (hidden) by default.
   */
  const memberCharges = useMemo(() => {
    if (!selectedMember) return [];

    return ledgers
      .filter((e) => {
        // Must be a charge type and belong to this member+month
        if (e.memberId !== selectedMember) return false;
        if (e.ym !== ym) return false;
        return CHARGE_TRANSACTION_TYPES.includes(e.transactionType);
      })
      .map((entry) => {
        // Determine if this charge is paid
        const chargeStatus = entry.chargeStatus || "pending";
        const paidAmount = entry.paidAmount || 0;
        const isPaid = chargeStatus === "paid" || (paidAmount >= entry.amount);
        const isPartial = chargeStatus === "partial" || (paidAmount > 0 && paidAmount < entry.amount);

        // Get a human-readable label for this charge
        const chargeLabel = getChargeLabel(entry);
        const amount = entry.amount || 0;
        const due = isPaid ? 0 : isPartial ? amount - paidAmount : amount;

        return {
          ...entry,
          chargeLabel,
          chargeStatus: isPaid ? "paid" as const : isPartial ? "partial" as const : "pending" as const,
          paidAmount,
          dueAmount: due,
        };
      })
      .sort((a, b) => {
        // Sort: pending first, then partial, then paid
        const statusOrder = { pending: 0, partial: 1, paid: 2 };
        const aOrder = statusOrder[a.chargeStatus] ?? 0;
        const bOrder = statusOrder[b.chargeStatus] ?? 0;
        if (aOrder !== bOrder) return aOrder - bOrder;
        // Then by date
        return a.date.localeCompare(b.date);
      });
  }, [ledgers, selectedMember, ym]);

  /** Charges that are not yet paid (active charges) */
  const pendingCharges = useMemo(
    () => memberCharges.filter((c) => c.chargeStatus !== "paid"),
    [memberCharges]
  );

  /** Fully paid charges */
  const paidCharges = useMemo(
    () => memberCharges.filter((c) => c.chargeStatus === "paid"),
    [memberCharges]
  );

  /**
   * Get the total pending amount for this member.
   * Used in settlement calculations.
   */
  const totalPendingChargeAmount = useMemo(
    () => pendingCharges.reduce((sum, c) => sum + c.dueAmount, 0),
    [pendingCharges]
  );

  const prevMonthClosings = useMemo(() => {
    if (!currentMember || !closings.length) return [];
    const [year, month] = ym.split("-").map(Number);
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const prevYm = `${prevYear}-${String(prevMonth).padStart(2, "0")}`;
    const prevClosing = closings.find((c) => c.month === prevYm);
    if (!prevClosing || prevClosing.status !== "closed") return [];
    return [{
      month: prevClosing.month,
      memberId: currentMember.id,
      deposit: (prevClosing as any).memberBreakdown?.[currentMember.id]?.deposit || 0,
      credit: (prevClosing as any).memberBreakdown?.[currentMember.id]?.credit || 0,
    }];
  }, [currentMember, ym, closings]);

  const memberSettlement = useMemo(() => {
    if (!currentMember) return null;
    return calculateMemberSettlement(
      currentMember, ym, meals, bazar, deposits, credits, payments,
      ledgers, monthExpenses, activeMembers, rooms, staff, prevMonthClosings, monthAllocations,
      creditNotes, refunds,
    );
  }, [currentMember, ym, meals, bazar, deposits, credits, payments, ledgers, monthExpenses, activeMembers, rooms, staff, prevMonthClosings, monthAllocations, creditNotes, refunds]);

  const memberEntries = ledgers
    .filter((e) => e.memberId === selectedMember && e.ym === ym)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || 0) - (b.createdAt || 0));

  /**
   * Settlement trace: for every charge this member has had this month, which
   * payment(s) actually settled it, and how much of each. This is the
   * concrete "who paid which charge, and what was the final settlement"
   * answer — sourced from the charge_allocations join records rather than
   * a single mutable paidAmount field on the charge.
   */
  const settlementTrace = useMemo(() => {
    const paymentsById = new Map(payments.map((p) => [p.id, p]));
    const creditNotesById = new Map(creditNotes.map((c) => [c.id, c]));
    return memberCharges.map((charge) => {
      const rows = chargeAllocations
        .filter((a) => a.chargeId === charge.id)
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
        .map((a) => ({
          allocationId: a.id,
          amount: a.amount,
          date: a.date,
          sourceType: a.sourceType,
          payment: a.sourceType === "payment" ? paymentsById.get(a.sourceId) : undefined,
          creditNote: a.sourceType === "credit_note" ? creditNotesById.get(a.sourceId) : undefined,
        }));
      return { charge, rows, totalAllocated: rows.reduce((s, r) => s + r.amount, 0) };
    });
  }, [memberCharges, chargeAllocations, payments, creditNotes]);

  /**
    * Generate charges from current month's data and save them as individual ledger entries.
    * Each charge type (meal, rent, utility, staff) gets its own entry.
    */
  const handleGenerateCharges = async () => {
    if (!currentMember || !profile || !memberSettlement) return;
    setSaving(true);
    try {
      const charges = memberSettlement.charges;
      const cleanupResults: string[] = [];
      const allCategories = [
        ...(charges.mealCost > 0 ? [{ category: "meal", label: "meal" }] : []),
        ...(charges.rentShare > 0 ? [{ category: "rent", label: "rent" }] : []),
        ...Object.keys(charges.expenseShareBreakdown).filter(c => charges.expenseShareBreakdown[c] > 0).map(c => ({ category: c, label: c })),
        ...(charges.staffShare > 0 ? [{ category: "staff", label: "staff" }] : []),
      ];
      for (const { category } of allCategories) {
        const chargeDate = ym + "-01";
        const deleted = await deleteDuplicateCharges(currentMember.id, ym, category, chargeDate);
        if (deleted > 0) cleanupResults.push(`${EXPENSE_CATEGORY_LABELS[category as keyof typeof EXPENSE_CATEGORY_LABELS] || category}: removed ${deleted} duplicate${deleted > 1 ? "s" : ""}`);
      }
      if (cleanupResults.length > 0) toast.info(cleanupResults.join(", "), { duration: 4000 });
      const results: string[] = [];
      const now = Date.now();

      // Meal charge
      if (charges.mealCost > 0) {
        const chargeDate = ym + "-01";
        const exists = await checkLedgerChargeExists(currentMember.id, ym, "meal", chargeDate);
        if (!exists) {
          const mealNotes = `Meal cost for ${ym} (${memberSettlement.totalMeals} meals × ${bdt(memberSettlement.mealRate)})`;
          await addDocTo("ledgers", {
            memberId: currentMember.id,
            memberName: currentMember.name,
            date: ym + "-01",
            ym,
            transactionType: "meal_charge",
            category: "meal",
            amount: charges.mealCost,
            notes: mealNotes,
            chargeStatus: "pending",
            paidAmount: 0,
            createdAt: now,
          });
          results.push("Meal charge saved");
        }
      }

      // Rent charge
      if (charges.rentShare > 0) {
        const chargeDate = ym + "-01";
        const exists = await checkLedgerChargeExists(currentMember.id, ym, "rent", chargeDate);
        if (!exists) {
          await addDocTo("ledgers", {
            memberId: currentMember.id,
            memberName: currentMember.name,
            date: ym + "-01",
            ym,
            transactionType: "rent_charge",
            category: "rent",
            amount: charges.rentShare,
            notes: `Rent share for ${ym}`,
            chargeStatus: "pending",
            paidAmount: 0,
            createdAt: now,
          });
          results.push("Rent charge saved");
        }
      }

      // Individual expense/utility charges
      for (const [category, amount] of Object.entries(charges.expenseShareBreakdown)) {
        if (amount > 0) {
          const chargeDate = ym + "-01";
          const exists = await checkLedgerChargeExists(currentMember.id, ym, category, chargeDate);
          if (!exists) {
            const catLabel = EXPENSE_CATEGORY_LABELS[category as keyof typeof EXPENSE_CATEGORY_LABELS] || category;
            await addDocTo("ledgers", {
              memberId: currentMember.id,
              memberName: currentMember.name,
              date: ym + "-01",
              ym,
              transactionType: "utility_charge",
              category: category as any,
              amount,
              notes: `${catLabel} for ${ym}`,
              chargeStatus: "pending",
              paidAmount: 0,
              createdAt: now,
            });
            results.push(`${catLabel} charge saved`);
          }
        }
      }

      // Staff charge
      if (charges.staffShare > 0) {
        const chargeDate = ym + "-01";
        const exists = await checkLedgerChargeExists(currentMember.id, ym, "staff", chargeDate);
        if (!exists) {
          await addDocTo("ledgers", {
            memberId: currentMember.id,
            memberName: currentMember.name,
            date: ym + "-01",
            ym,
            transactionType: "staff_charge",
            category: "staff",
            amount: charges.staffShare,
            notes: `Staff salary share for ${ym}`,
            chargeStatus: "pending",
            paidAmount: 0,
            createdAt: now,
          });
          results.push("Staff charge saved");
        }
      }

      // Previous due/credit/deposit as notes
      if (charges.previousDue > 0) {
        // This is already tracked in the member profile, no need to create a ledger entry
        results.push(`Previous due: ${bdt(charges.previousDue)}`);
      }
      if (charges.previousCredit > 0 && charges.previousCredit > 0.01) {
        results.push(`Previous credit carried: ${bdt(charges.previousCredit)}`);
      }
      if (charges.previousDeposit > 0 && charges.previousDeposit > 0.01) {
        results.push(`Previous deposit carried: ${bdt(charges.previousDeposit)}`);
      }

      toast.success(results.length > 0 ? results.join(", ") : "All charges already generated");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  /**
   * Mark a specific charge as paid by linking it to a payment.
   * This soft-deletes the charge from the active view.
   */
  /**
   * Every payment recorded from this page goes through the SAME pipeline as
   * the /payments page (recordPaymentWithAdvanceRecovery): advance recovery,
   * then allocation to real outstanding charges (recorded as traceable
   * charge_allocations rows), then any excess becomes a deposit. This is
   * what makes "who paid which charge, and what was the final settlement"
   * answerable — previously this page only touched a charge's paidAmount
   * field directly and never recovered advances at all.
   */
  // Every mutating action on this page shares the one `saving` flag: a
  // double-click firing two concurrent payment/credit-note/refund writes is
  // a real financial duplication risk, not just a cosmetic annoyance, so all
  // buttons below are disabled while ANY one of them is in flight.
  const handlePayCharge = async (chargeEntry: any) => {
    if (!currentMember || !profile || saving) return;
    const amount = chargeEntry.dueAmount || chargeEntry.amount;
    setSaving(true);
    try {
      const date = new Date().toISOString().slice(0, 10);
      await recordPaymentWithAdvanceRecovery(
        currentMember.id, currentMember.name, amount, "Cash", date, ym,
        chargeEntry.category, `Payment for ${chargeEntry.chargeLabel}`,
        undefined, profile.uid, chargeEntry.id,
      );
      toast.success(`${chargeEntry.chargeLabel}: ${bdt(amount)} paid`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!currentMember || !profile || saving) return;
    const form = e.target as HTMLFormElement;
    const amount = parseFloat((form.elements.namedItem("amount") as HTMLInputElement).value);
    const method = (form.elements.namedItem("method") as HTMLSelectElement).value;
    const date = (form.elements.namedItem("date") as HTMLInputElement).value;
    const category = (form.elements.namedItem("category") as HTMLSelectElement).value;
    const targetChargeId = (form.elements.namedItem("targetCharge") as HTMLSelectElement).value;
    const notes = (form.elements.namedItem("notes") as HTMLTextAreaElement).value;
    if (!amount || amount <= 0) return toast.error("Enter amount");

    // Detect a likely duplicate (same member+date+amount) and show it
    // rather than silently inserting or hard-blocking — require an explicit
    // confirmation before it's actually recorded.
    const existingPayment = payments.find(
      (p) => p.memberId === currentMember.id && p.date === date && Math.abs(p.amount - amount) < 0.01,
    );
    if (existingPayment) {
      const confirmed = confirm(
        `${currentMember.name} already has a payment of ৳${existingPayment.amount} recorded on ${date}. Add another one anyway?`,
      );
      if (!confirmed) return;
    }

    setSaving(true);
    try {
      const isTargeted = targetChargeId && targetChargeId !== "__all__";
      const charge = isTargeted ? memberCharges.find((c) => c.id === targetChargeId) : undefined;
      const result = await recordPaymentWithAdvanceRecovery(
        currentMember.id, currentMember.name, amount, method, date, ym,
        charge?.category || category,
        notes || (charge ? `Payment for ${charge.chargeLabel} via ${method}` : `Payment via ${method}`),
        undefined, profile.uid, charge?.id,
      );

      const settledCount = result.chargeAllocations.length;
      let msg = charge ? `Payment recorded for ${charge.chargeLabel}` : "Payment recorded";
      if (settledCount > 0) msg += ` (${settledCount} charge${settledCount > 1 ? "s" : ""} settled)`;
      if (result.advanceRecoveryAmount > 0) msg += `, ${bdt(result.advanceRecoveryAmount)} recovered advances`;
      if (result.remainingAmount > 0) msg += `, ${bdt(result.remainingAmount)} excess becomes deposit`;
      toast.success(msg);
      form.reset();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleQuickPayment = async (amount: number, notes: string, category: string, chargeId?: string) => {
    if (!currentMember || !profile || !amount || amount <= 0 || saving) return;
    setSaving(true);
    try {
      const date = new Date().toISOString().slice(0, 10);
      const charge = chargeId ? memberCharges.find((c) => c.id === chargeId) : undefined;
      await recordPaymentWithAdvanceRecovery(
        currentMember.id, currentMember.name, amount, "Cash", date, ym,
        charge?.category || category, notes, undefined, profile.uid, charge?.id,
      );
      toast.success(`${notes}: ${bdt(amount)} recorded`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  /**
   * Credit note: corrects/forgives part of what the member owes. Never
   * edits the original charge — records a separate, reasoned correction
   * that reduces their outstanding balance.
   */
  const handleIssueCreditNote = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!currentMember || !profile || saving) return;
    const form = e.target as HTMLFormElement;
    const amount = parseFloat((form.elements.namedItem("cnAmount") as HTMLInputElement).value);
    const reason = (form.elements.namedItem("cnReason") as HTMLTextAreaElement).value;
    const targetChargeId = (form.elements.namedItem("cnTargetCharge") as HTMLSelectElement).value;
    if (!amount || amount <= 0) return toast.error("Enter an amount greater than zero");
    if (!reason.trim()) return toast.error("A reason is required to issue a credit note");
    setSaving(true);
    try {
      const charge = targetChargeId && targetChargeId !== "__none__" ? memberCharges.find((c) => c.id === targetChargeId) : undefined;
      const date = new Date().toISOString().slice(0, 10);
      await issueCreditNote(
        currentMember.id, currentMember.name, amount, reason, ym, date,
        { uid: profile.uid, name: profile.name, role: profile.role },
        charge?.category, charge?.id,
      );
      toast.success(`Credit note of ${bdt(amount)} issued to ${currentMember.name}`);
      form.reset();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  /**
   * Refund: physically returns money to the member (e.g. cashing out part
   * of a held deposit). Capped at what's actually available so the mess
   * can never refund more than it holds for this member.
   */
  const handleIssueRefund = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!currentMember || !profile || !memberSettlement || saving) return;
    const form = e.target as HTMLFormElement;
    const amount = parseFloat((form.elements.namedItem("rfAmount") as HTMLInputElement).value);
    const reason = (form.elements.namedItem("rfReason") as HTMLTextAreaElement).value;
    const method = (form.elements.namedItem("rfMethod") as HTMLSelectElement).value;
    if (!amount || amount <= 0) return toast.error("Enter an amount greater than zero");
    if (!reason.trim()) return toast.error("A reason is required to issue a refund");
    const availableDeposit = memberSettlement.totalDeposit;
    if (amount > availableDeposit + 0.01) {
      return toast.error(`Cannot refund ${bdt(amount)} — ${currentMember.name} only has ${bdt(availableDeposit)} available as deposit`);
    }
    setSaving(true);
    try {
      const date = new Date().toISOString().slice(0, 10);
      await issueRefund(
        currentMember.id, currentMember.name, amount, reason, method, ym, date,
        { uid: profile.uid, name: profile.name, role: profile.role },
      );
      toast.success(`Refund of ${bdt(amount)} issued to ${currentMember.name}`);
      form.reset();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleVoidCreditNote = async (note: CreditNote) => {
    if (!profile || saving) return;
    const reason = prompt(`Reason for voiding this ৳${note.amount} credit note?`);
    if (!reason || !reason.trim()) return;
    setSaving(true);
    try {
      await voidCreditNote(note.id, reason, { uid: profile.uid, name: profile.name, role: profile.role });
      toast.success("Credit note voided");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleVoidRefund = async (refund: Refund) => {
    if (!profile || saving) return;
    const reason = prompt(`Reason for voiding this ৳${refund.amount} refund?`);
    if (!reason || !reason.trim()) return;
    setSaving(true);
    try {
      await voidRefund(refund.id, reason, { uid: profile.uid, name: profile.name, role: profile.role });
      toast.success("Refund voided");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTransaction = async (entry: LedgerEntry) => {
    if (!profile || !confirm("Delete?")) return;
    try {
      if (profile.role === "owner") {
        await deleteDocFrom("ledgers", entry.id);
        toast.success("Deleted");
      } else {
        await submitChangeRequest({
          collectionName: "ledgers",
          action: "delete",
          title: `Delete transaction`,
          actor: { uid: profile.uid, name: profile.name, role: profile.role },
          targetId: entry.id,
          previousData: entry,
        });
      }
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pay": return "bg-destructive/10 text-destructive";
      case "receive": return "bg-primary/10 text-primary";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getChargeStatusBadge = (status: string) => {
    switch (status) {
      case "paid": return { icon: CheckCircle2, className: "bg-green-500/10 text-green-600 border-green-500/20", label: "Paid" };
      case "partial": return { icon: AlertCircle, className: "bg-amber-500/10 text-amber-600 border-amber-500/20", label: "Partial" };
      default: return { icon: CircleDot, className: "bg-destructive/10 text-destructive border-destructive/20", label: "Unpaid" };
    }
  };

  return (
    <div>
      <PageHeader
        title="Member Charges"
        description="Individual charge tracking with payment status"
      />
      <div className="p-6 space-y-6">
        {/* FILTERS BAR */}
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">Filters</span>
          </div>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Month</Label>
              <Select value={pendingMonth} onValueChange={setPendingMonth}>
                <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>{monthOptions.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Year</Label>
              <Select value={pendingYear} onValueChange={setPendingYear}>
                <SelectTrigger className="w-28 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>{yearOptions.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Member</Label>
              <Select value={pendingMember} onValueChange={setPendingMember}>
                <SelectTrigger className="w-44 h-9"><SelectValue placeholder="Select member" /></SelectTrigger>
                <SelectContent>
                  {activeMembers.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" className="h-9 px-4" onClick={() => {
              setFilterYear(pendingYear);
              setFilterMonth(pendingMonth);
              setFilterMember(pendingMember);
              setYm(`${pendingYear}-${String(pendingMonth).padStart(2, "0")}`);
              setSelectedMember(pendingMember);
            }}>
              <Search className="h-4 w-4 mr-1.5" />Search
            </Button>
          </div>
        </Card>

        {currentMember && memberSettlement && (
          <>
            {/* MEMBER INFO */}
            <Card className="p-5">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-foreground font-bold text-xl uppercase">{currentMember.name[0]}</div>
                <div>
                  <h2 className="text-lg font-bold">{currentMember.name}</h2>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground mt-1">
                    <span className="flex items-center gap-1"><UserRound className="h-3.5 w-3.5" />{currentMember.role || "Member"}</span>
                    {currentRoom && (
                      <><span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />Room {currentRoom.roomNo}</span>
                      {currentMember.bedNo && <span className="flex items-center gap-1"><BedDouble className="h-3.5 w-3.5" />Bed {currentMember.bedNo}</span>}</>
                    )}
                  </div>
                  {activeServices.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">{activeServices.map((svc) => <Badge key={svc} variant="outline" className="text-xs">{SERVICE_LABELS[svc] || svc}</Badge>)}</div>
                  )}
                </div>
              </div>
            </Card>

            {/* ──────────────────────────────────────────── */}
            {/* INDIVIDUAL CHARGES TABLE */}
            {/* ──────────────────────────────────────────── */}
            <Card className="overflow-hidden">
              <div className="p-4 border-b bg-muted/30 flex items-center justify-between">
                <h3 className="font-semibold flex items-center gap-2">
                  <Receipt className="h-4 w-4" />
                  Individual Charges
                  <span className="text-muted-foreground font-normal ml-1">
                    ({memberCharges.length} total · {pendingCharges.length} pending)
                  </span>
                </h3>
                <div className="flex items-center gap-2">
                  {paidCharges.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => setShowPaidCharges(!showPaidCharges)}
                    >
                      {showPaidCharges ? <ChevronUp className="h-3.5 w-3.5 mr-1" /> : <ChevronDown className="h-3.5 w-3.5 mr-1" />}
                      {showPaidCharges ? "Hide Paid" : `Show Paid (${paidCharges.length})`}
                    </Button>
                  )}
                  <Button size="sm" onClick={handleGenerateCharges} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Generate Charges"}
                  </Button>
                </div>
              </div>

              {memberCharges.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground">
                  <Receipt className="h-10 w-10 mx-auto opacity-40 mb-3" />
                  <p className="font-medium">No charges generated for this period</p>
                  <Button size="sm" variant="outline" onClick={handleGenerateCharges} disabled={saving} className="mt-3">
                    Generate Charges Now
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs uppercase text-muted-foreground bg-muted/50 sticky top-0">
                      <tr>
                        <th className="text-left p-3 font-medium">Date</th>
                        <th className="text-left p-3 font-medium">Charge Type</th>
                        <th className="text-left p-3 font-medium">Description</th>
                        <th className="text-right p-3 font-medium">Amount</th>
                        <th className="text-right p-3 font-medium">Paid</th>
                        <th className="text-right p-3 font-medium">Due</th>
                        <th className="text-center p-3 font-medium">Status</th>
                        <th className="text-center p-3 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {memberCharges
                        .filter((c) => showPaidCharges || c.chargeStatus !== "paid")
                        .map((charge) => {
                          const statusInfo = getChargeStatusBadge(charge.chargeStatus);
                          const StatusIcon = statusInfo.icon;
                          return (
                            <tr
                              key={charge.id}
                              className={`border-t hover:bg-muted/30 transition-colors ${
                                charge.chargeStatus === "paid" ? "opacity-50" : ""
                              }`}
                            >
                              <td className="p-3">{charge.date}</td>
                              <td className="p-3">
                                <span className="font-medium">{charge.chargeLabel}</span>
                              </td>
                              <td className="p-3 text-muted-foreground max-w-[250px]">
                                <span className="whitespace-normal break-words">{charge.notes || "—"}</span>
                              </td>
                              <td className="p-3 text-right tabular-nums font-semibold">
                                {bdt(charge.amount)}
                              </td>
                              <td className="p-3 text-right tabular-nums text-primary">
                                {charge.paidAmount > 0 ? bdt(charge.paidAmount) : "—"}
                              </td>
                              <td className="p-3 text-right tabular-nums font-semibold text-destructive">
                                {charge.dueAmount > 0 ? bdt(charge.dueAmount) : "—"}
                              </td>
                              <td className="p-3 text-center">
                                <Badge variant="outline" className={`text-xs gap-1 ${statusInfo.className}`}>
                                  <StatusIcon className="h-3 w-3" />
                                  {statusInfo.label}
                                </Badge>
                              </td>
                              <td className="p-3 text-center">
                                {charge.chargeStatus !== "paid" && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 text-xs"
                                    disabled={saving}
                                    onClick={() => handlePayCharge(charge)}
                                  >
                                    Pay {bdt(charge.dueAmount)}
                                  </Button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                    <tfoot className="font-semibold bg-muted/30">
                      <tr className="border-t-2">
                        <td className="p-3" colSpan={2}>Total</td>
                        <td className="p-3"></td>
                        <td className="p-3 text-right">
                          {bdt(memberCharges.reduce((s, c) => s + c.amount, 0))}
                        </td>
                        <td className="p-3 text-right text-primary">
                          {bdt(memberCharges.reduce((s, c) => s + (c.paidAmount || 0), 0))}
                        </td>
                        <td className="p-3 text-right text-destructive">
                          {bdt(pendingCharges.reduce((s, c) => s + c.dueAmount, 0))}
                        </td>
                        <td className="p-3"></td>
                        <td className="p-3"></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </Card>

            {/* SETTLEMENT SUMMARY */}
            <Card className="p-5">
              <h3 className="font-semibold text-lg mb-4 flex items-center gap-2"><DollarSign className="h-5 w-5" />Settlement Summary</h3>
              <div className="rounded-lg bg-muted p-4 space-y-3">
                <div className="flex justify-between text-sm">
                  <span>Total Charges (all types)</span>
                  <span className="font-semibold text-destructive">{bdt(memberSettlement.charges.totalCharges)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Total Contributions (bazar + payments + bills paid)</span>
                  <span className="font-semibold text-primary">{bdt(memberSettlement.contributions.totalContribution)}</span>
                </div>
                <div className="border-t pt-3 flex justify-between font-bold text-lg">
                  <span>Net Balance</span>
                  <span className={memberSettlement.balance >= 0 ? "text-primary" : "text-destructive"}>
                    {memberSettlement.balance >= 0 ? "Deposit " : "Due "}{bdt(Math.abs(memberSettlement.balance))}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-4">
                <div className="rounded-lg border p-3 text-center">
                  <div className="text-xs uppercase text-muted-foreground mb-1">Deposit (Member overpaid)</div>
                  <div className="text-lg font-bold text-primary">{memberSettlement.totalDeposit > 0 ? bdt(memberSettlement.totalDeposit) : "—"}</div>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <div className="text-xs uppercase text-muted-foreground mb-1">Credit (Member owes mess)</div>
                  <div className="text-lg font-bold text-destructive">{memberSettlement.totalCredit > 0 ? bdt(memberSettlement.totalCredit) : "—"}</div>
                </div>
              </div>
              <div className="mt-4 bg-background rounded-md p-3 text-center">
                <Badge className={getStatusBadge(memberSettlement.settlementStatus) + " text-sm px-4 py-2"}>
                  {memberSettlement.settlementStatus === "pay" ? "Member Has Dues" : memberSettlement.settlementStatus === "receive" ? "Member Has Deposit" : "Settled"}
                </Badge>
              </div>

              {/* Charge Breakdown */}
              <div className="mt-4 space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">Charge Breakdown</h4>
                {memberSettlement.charges.mealCost > 0 && (
                  <div className="flex justify-between items-center p-2 rounded bg-muted/50">
                    <span className="text-sm">Meals <span className="text-xs text-muted-foreground">({memberSettlement.totalMeals} × {bdt(memberSettlement.mealRate)})</span></span>
                    <span className="text-sm font-semibold">{bdt(memberSettlement.charges.mealCost)}</span>
                  </div>
                )}
                {memberSettlement.charges.rentShare > 0 && (
                  <div className="flex justify-between items-center p-2 rounded bg-muted/50">
                    <span className="text-sm">Rent</span>
                    <span className="text-sm font-semibold">{bdt(memberSettlement.charges.rentShare)}</span>
                  </div>
                )}
                {Object.entries(memberSettlement.charges.expenseShareBreakdown).map(([cat, amount]) => (
                  <div key={cat} className="flex justify-between items-center p-2 rounded bg-muted/50">
                    <span className="text-sm">{EXPENSE_CATEGORY_LABELS[cat as keyof typeof EXPENSE_CATEGORY_LABELS] || cat}</span>
                    <span className="text-sm font-semibold">{bdt(amount)}</span>
                  </div>
                ))}
                {memberSettlement.charges.staffShare > 0 && (
                  <div className="flex justify-between items-center p-2 rounded bg-muted/50">
                    <span className="text-sm">Staff</span>
                    <span className="text-sm font-semibold">{bdt(memberSettlement.charges.staffShare)}</span>
                  </div>
                )}
                {memberSettlement.charges.previousDue > 0 && (
                  <div className="flex justify-between items-center p-2 rounded bg-destructive/10">
                    <span className="text-sm font-medium text-destructive">Previous Due</span>
                    <span className="text-sm font-semibold text-destructive">{bdt(memberSettlement.charges.previousDue)}</span>
                  </div>
                )}
                {memberSettlement.charges.previousDeposit > 0 && (
                  <div className="flex justify-between items-center p-2 rounded bg-green-500/10">
                    <span className="text-sm font-medium text-green-600">Previous Deposit (credit)</span>
                    <span className="text-sm font-semibold text-green-600">-{bdt(memberSettlement.charges.previousDeposit)}</span>
                  </div>
                )}
                {memberSettlement.charges.previousCredit > 0 && (
                  <div className="flex justify-between items-center p-2 rounded bg-amber-500/10">
                    <span className="text-sm font-medium text-amber-600">Previous Credit (debt)</span>
                    <span className="text-sm font-semibold text-amber-600">+{bdt(memberSettlement.charges.previousCredit)}</span>
                  </div>
                )}
              </div>
            </Card>

            {/* RECORD PAYMENT */}
            <Card className="p-5">
              <h3 className="font-semibold text-lg mb-4 flex items-center gap-2"><CreditCard className="h-5 w-5" />Record Payment</h3>

              {/* Quick Pay per charge */}
              {pendingCharges.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Quick Pay Individual Charges</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {pendingCharges.map((charge) => (
                      <form
                        key={charge.id}
                        onSubmit={(e) => {
                          e.preventDefault();
                          const f = e.target as HTMLFormElement;
                          const amt = parseFloat((f.elements.namedItem("quickAmount") as HTMLInputElement).value);
                          if (!amt || amt <= 0) return toast.error("Enter amount");
                          handleQuickPayment(amt, `Payment for ${charge.chargeLabel}`, charge.category, charge.id);
                          f.reset();
                        }}
                        className="contents"
                      >
                        <div className="flex flex-col gap-1 p-3 rounded-lg border hover:bg-accent/50">
                          <span className="text-xs font-medium text-muted-foreground">{charge.chargeLabel}</span>
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-destructive">Due: {bdt(charge.dueAmount)}</span>
                          </div>
                          <input
                            type="number"
                            name="quickAmount"
                            min="0"
                            step="0.01"
                            placeholder="৳ amount"
                            required
                            disabled={saving}
                            className="w-full text-sm bg-transparent border-b border-dashed outline-none tabular-nums"
                          />
                        </div>
                      </form>
                    ))}
                  </div>
                </div>
              )}

              <details className="border rounded-lg p-4">
                <summary className="text-sm font-medium cursor-pointer text-muted-foreground hover:text-foreground">Full Payment Form</summary>
                <form onSubmit={handleRecordPayment} className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Amount (৳)</label>
                      <Input type="number" name="amount" min="0" step="0.01" placeholder="Enter amount" required />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Method</label>
                      <Select name="method" defaultValue="Cash">
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Pay Specific Charge</label>
                      <Select name="targetCharge" defaultValue="__all__">
                        <SelectTrigger><SelectValue placeholder="Select charge" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__all__">-- Auto-allocate to all pending --</SelectItem>
                          {pendingCharges.map((charge) => (
                            <SelectItem key={charge.id} value={charge.id}>
                              {charge.chargeLabel} - {bdt(charge.dueAmount)} due
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Date</label>
                      <Input type="date" name="date" defaultValue={ym + "-01"} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Notes</label>
                    <Textarea name="notes" rows={2} placeholder="Optional notes" />
                  </div>
                  <Button type="submit" className="w-full" disabled={saving}>{saving ? "Saving..." : "Record Payment"}</Button>
                </form>
              </details>
            </Card>

            {/* CREDIT NOTES & REFUNDS — corrections that never edit a posted charge/payment */}
            {(profile?.role === "owner" || profile?.role === "manager") && (
            <Card className="p-5">
              <h3 className="font-semibold text-lg mb-1 flex items-center gap-2"><FileMinus2 className="h-5 w-5" />Credit Notes & Refunds</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Corrections are never made by editing a posted charge or payment — issue a credit note (forgives an amount never actually owed) or a refund (returns money the member did pay), each with a mandatory reason and a full audit trail.
              </p>

              <div className="grid gap-4 md:grid-cols-2">
                <details className="border rounded-lg p-4">
                  <summary className="text-sm font-medium cursor-pointer flex items-center gap-1.5">
                    <FileMinus2 className="h-4 w-4" />Issue Credit Note
                  </summary>
                  <form onSubmit={handleIssueCreditNote} className="space-y-3 mt-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Amount (৳)</label>
                      <Input type="number" name="cnAmount" min="0.01" step="0.01" placeholder="Enter amount" required />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Correct a specific charge</label>
                      <Select name="cnTargetCharge" defaultValue="__none__">
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">-- General credit (FIFO across charges) --</SelectItem>
                          {memberCharges.map((charge) => (
                            <SelectItem key={charge.id} value={charge.id}>
                              {charge.chargeLabel} - {bdt(charge.dueAmount)} due
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Reason (required)</label>
                      <Textarea name="cnReason" rows={2} placeholder="Why is this charge being corrected?" required />
                    </div>
                    <Button type="submit" variant="outline" className="w-full" disabled={saving}>{saving ? "Saving..." : "Issue Credit Note"}</Button>
                  </form>
                </details>

                <details className="border rounded-lg p-4">
                  <summary className="text-sm font-medium cursor-pointer flex items-center gap-1.5">
                    <Undo2 className="h-4 w-4" />Issue Refund
                  </summary>
                  <form onSubmit={handleIssueRefund} className="space-y-3 mt-4">
                    <p className="text-xs text-muted-foreground">
                      Available to refund: <span className="font-semibold text-primary">{bdt(memberSettlement?.totalDeposit || 0)}</span>
                    </p>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Amount (৳)</label>
                      <Input type="number" name="rfAmount" min="0.01" step="0.01" max={memberSettlement?.totalDeposit || 0} placeholder="Enter amount" required />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Method</label>
                      <Select name="rfMethod" defaultValue="Cash">
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Reason (required)</label>
                      <Textarea name="rfReason" rows={2} placeholder="Why is this being refunded?" required />
                    </div>
                    <Button type="submit" variant="outline" className="w-full" disabled={saving || !memberSettlement || memberSettlement.totalDeposit <= 0}>{saving ? "Saving..." : "Issue Refund"}</Button>
                  </form>
                </details>
              </div>

              {(creditNotes.length > 0 || refunds.length > 0) && (
                <div className="mt-5 space-y-2">
                  {creditNotes.filter((c) => c.ym === ym).map((note) => (
                    <div key={note.id} className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                      <div className="min-w-0">
                        <div className="font-medium flex items-center gap-2">
                          <FileMinus2 className="h-3.5 w-3.5 text-muted-foreground" />
                          Credit note {bdt(note.amount)}
                          <Badge variant="outline" className={`text-[10px] ${note.status === "voided" ? "bg-destructive/10 text-destructive" : ""}`}>
                            {note.status}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{note.reason}</div>
                      </div>
                      {note.status === "issued" && profile && (
                        <Button size="sm" variant="ghost" disabled={saving} onClick={() => handleVoidCreditNote(note)}>
                          <Undo2 className="h-3.5 w-3.5 mr-1" />Void
                        </Button>
                      )}
                    </div>
                  ))}
                  {refunds.filter((r) => r.ym === ym).map((refund) => (
                    <div key={refund.id} className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                      <div className="min-w-0">
                        <div className="font-medium flex items-center gap-2">
                          <Undo2 className="h-3.5 w-3.5 text-muted-foreground" />
                          Refund {bdt(refund.amount)} via {refund.method}
                          <Badge variant="outline" className={`text-[10px] ${refund.status === "voided" ? "bg-destructive/10 text-destructive" : ""}`}>
                            {refund.status}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{refund.reason}</div>
                      </div>
                      {refund.status === "issued" && profile && (
                        <Button size="sm" variant="ghost" disabled={saving} onClick={() => handleVoidRefund(refund)}>
                          <Undo2 className="h-3.5 w-3.5 mr-1" />Void
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
            )}

            {/* TRANSACTION HISTORY */}
            <Card className="p-5">
              <h3 className="font-semibold text-lg mb-4">Transaction History</h3>
              {memberEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No transactions for this month</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs uppercase text-muted-foreground bg-muted/50">
                      <tr>
                        <th className="text-left p-3 font-medium">Date</th>
                        <th className="text-left p-3 font-medium">Type</th>
                        <th className="text-left p-3 font-medium">Category</th>
                        <th className="text-left p-3 font-medium">Notes</th>
                        <th className="text-center p-3 font-medium">Status</th>
                        <th className="text-right p-3 font-medium">Amount</th>
                        {profile && <th></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {memberEntries.map((entry) => {
                        const isCharge = CHARGE_TRANSACTION_TYPES.includes(entry.transactionType);
                        const chargeStatus = isCharge ? (entry as any).chargeStatus : null;
                        return (
                          <tr key={entry.id} className="border-t hover:bg-muted/30">
                            <td className="p-3">{entry.date}</td>
                            <td className="p-3 capitalize">{entry.transactionType.replace(/_/g, " ")}</td>
                            <td className="p-3 capitalize">{entry.category}</td>
                            <td className="p-3 text-muted-foreground max-w-[200px]">
                              <span className="whitespace-normal break-words">{entry.notes || "—"}</span>
                            </td>
                            <td className="p-3 text-center">
                              {chargeStatus && (
                                <Badge variant="outline" className={`text-xs ${
                                  chargeStatus === "paid" ? "bg-green-500/10 text-green-600" :
                                  chargeStatus === "partial" ? "bg-amber-500/10 text-amber-600" : ""
                                }`}>
                                  {chargeStatus === "paid" ? "Paid" : chargeStatus === "partial" ? "Partial" : "Pending"}
                                </Badge>
                              )}
                            </td>
                            <td className={`p-3 text-right tabular-nums font-semibold ${
                              entry.transactionType === "payment" || entry.transactionType === "bazar_contribution" || entry.transactionType === "expense_contribution"
                                ? "text-primary" : "text-destructive"
                            }`}>
                              {bdt(entry.amount)}
                            </td>
                            {profile && (
                              <td className="p-3">
                                <Button size="sm" variant="destructive" onClick={() => handleDeleteTransaction(entry)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            {/* FINAL SETTLEMENT TRACE — which payment(s) settled which charge */}
            <Card className="p-5">
              <h3 className="font-semibold text-lg mb-1 flex items-center gap-2"><ArrowUpDown className="h-5 w-5" />Settlement Trace</h3>
              <p className="text-sm text-muted-foreground mb-4">Every charge this month and exactly which payment(s) settled it — the final answer to "who paid this, and how much is still owed."</p>
              {settlementTrace.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No charges for this month yet</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs uppercase text-muted-foreground bg-muted/50">
                      <tr>
                        <th className="text-left p-3 font-medium">Charge</th>
                        <th className="text-right p-3 font-medium">Amount</th>
                        <th className="text-left p-3 font-medium">Settled By</th>
                        <th className="text-right p-3 font-medium">Paid</th>
                        <th className="text-right p-3 font-medium">Still Due</th>
                      </tr>
                    </thead>
                    <tbody>
                      {settlementTrace.map(({ charge, rows, totalAllocated }) => {
                        const stillDue = Math.max(0, charge.amount - totalAllocated);
                        return (
                          <tr key={charge.id} className="border-t align-top">
                            <td className="p-3 font-medium">{charge.chargeLabel}</td>
                            <td className="p-3 text-right tabular-nums">{bdt(charge.amount)}</td>
                            <td className="p-3">
                              {rows.length === 0 ? (
                                <span className="text-xs text-muted-foreground">Not yet paid</span>
                              ) : (
                                <div className="space-y-1">
                                  {rows.map((r) => (
                                    <div key={r.allocationId} className="text-xs flex items-center gap-1.5">
                                      <Badge variant="outline" className="text-[10px]">{r.date}</Badge>
                                      <span className="text-muted-foreground">
                                        {r.sourceType === "credit_note"
                                          ? "Credit note"
                                          : r.payment ? `${r.payment.method} payment` : "Payment"} — {bdt(r.amount)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="p-3 text-right tabular-nums text-primary font-medium">{bdt(totalAllocated)}</td>
                            <td className={`p-3 text-right tabular-nums font-semibold ${stillDue > 0.01 ? "text-destructive" : "text-muted-foreground"}`}>
                              {bdt(stillDue)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Get a human-readable label for a charge entry.
 * Extracts meaningful description from the transaction type, category, and notes.
 */
function getChargeLabel(entry: LedgerEntry): string {
  // If it's a utility_charge, extract the expense category label from notes or category
  if (entry.transactionType === "utility_charge") {
    const catLabel = EXPENSE_CATEGORY_LABELS[entry.category as keyof typeof EXPENSE_CATEGORY_LABELS];
    if (catLabel) return catLabel;
    // Try to extract from notes
    if (entry.notes) {
      const match = entry.notes.match(/^([^:]+)/);
      if (match) return match[1].trim();
    }
    return "Shared Expense";
  }

  // Use predefined labels for standard charge types
  return CHARGE_TYPE_LABELS[entry.transactionType] ||
    entry.transactionType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}