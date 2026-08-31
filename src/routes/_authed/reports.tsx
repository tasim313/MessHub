import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMemo, useState } from "react";
import {
  useCollection,
  orderBy,
  type Member,
  type MealEntry,
  type Bazar,
  type Deposit,
  type Credit,
  type Payment,
  type Staff,
  type Room,
} from "@/lib/data";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/types";
import type { MonthlyClosing, ExpenseAllocation, Expense, Advance, AdvanceRecovery, CreditNote, Refund } from "@/lib/types";
import { computeMonthly } from "@/lib/calc";
import { calculateMemberToMemberSettlements, consolidateSettlements } from "@/lib/financial-engine";
import { ymKey, bdt } from "@/lib/format";
import {
  FileDown,
  FileSpreadsheet,
  Mail,
  MessageCircle,
  Printer,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import { StatCard } from "@/components/app/StatCard";
import { MonthPicker } from "@/components/ui/month-picker";
import { Utensils, Wallet, TrendingUp, Receipt } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { toast } from "sonner";

export const Route = createFileRoute("/_authed/reports")({
  component: ReportsPage,
});

function pdfMoney(value: number) {
  if (!Number.isFinite(value)) return "BDT 0";
  return `BDT ${Math.round(value).toLocaleString("en-BD")}`;
}

function ReportsPage() {
  const [ym, setYm] = useState(ymKey());
  const { data: members } = useCollection<Member>("members");
  const { data: meals } = useCollection<MealEntry>("meals");
  const { data: bazar } = useCollection<Bazar>("bazar");
  const { data: expenses } = useCollection<Expense>("expenses");
  const { data: deposits } = useCollection<Deposit>("deposits");
  const { data: credits } = useCollection<Credit>("credits");
  const { data: payments } = useCollection<Payment>("payments");
  const { data: staff } = useCollection<Staff>("staff");
  const { data: rooms } = useCollection<Room>("rooms");
  const { data: closings } = useCollection<MonthlyClosing>("monthly_closing", [orderBy("createdAt", "desc")]);
  const { data: allocations } = useCollection<ExpenseAllocation>("expense_allocations", [orderBy("createdAt", "desc")]);
  const { data: advances } = useCollection<Advance>("advances");
  const { data: advanceRecoveries } = useCollection<AdvanceRecovery>("advance_recoveries");
  const { data: creditNotes } = useCollection<CreditNote>("credit_notes");
  const { data: refunds } = useCollection<Refund>("refunds");

  // Build prevClosings for carry forward
  const prevClosings = useMemo(() => {
    if (!closings.length) return [];
    const [year, month] = ym.split("-").map(Number);
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const prevYm = `${prevYear}-${String(prevMonth).padStart(2, "0")}`;
    const prevClosing = closings.find((c) => c.month === prevYm);
    if (!prevClosing || prevClosing.status !== "closed") return [];
    
    const breakdown = (prevClosing as any).memberBreakdown || {};
    return Object.entries(breakdown).map(([memberId, data]: [string, any]) => ({
      month: prevYm,
      memberId,
      deposit: data.deposit || 0,
      credit: data.credit || 0,
    }));
  }, [closings, ym]);

  // Filter allocations for current month
  const monthAllocations = useMemo(() => {
    if (!allocations) return [];
    return allocations.filter((a) => (a as any).ym === ym);
  }, [allocations, ym]);

  const summary = useMemo(
    () =>
      computeMonthly(
        ym,
        members,
        meals,
        bazar,
        expenses,
        deposits,
        credits,
        payments,
        staff,
        rooms,
        [],
        prevClosings,
        monthAllocations,
        advances,
        advanceRecoveries,
        closings,
        creditNotes,
        refunds,
      ),
    [
      ym,
      members,
      meals,
      bazar,
      expenses,
      deposits,
      credits,
      payments,
      staff,
      rooms,
      prevClosings,
      monthAllocations,
      advances,
      advanceRecoveries,
      closings,
      creditNotes,
      refunds,
    ],
  );

  // "Who owes whom" — a direct, zero-sum redistribution among members for
  // bills one member fronted for the others. Always nets to exactly zero:
  // every taka one member is owed is a taka someone else owes them, nothing
  // is owed to or by the mess itself.
  const activeMembersList = useMemo(() => members.filter((m) => m.active), [members]);
  const monthExpensesForSettlement = useMemo(() => expenses.filter((e) => e.ym === ym), [expenses, ym]);
  const monthBazarForSettlement = useMemo(() => bazar.filter((b) => b.ym === ym), [bazar, ym]);
  const memberToMemberSettlements = useMemo(() => {
    const raw = calculateMemberToMemberSettlements(monthExpensesForSettlement, monthBazarForSettlement, activeMembersList, ym);
    return consolidateSettlements(raw);
  }, [monthExpensesForSettlement, monthBazarForSettlement, activeMembersList, ym]);
  const totalSettlementAmount = memberToMemberSettlements.reduce((s, t) => s + t.amount, 0);

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(`Monthly Report — ${ym}`, 14, 18);
    doc.setFontSize(11);
    doc.text(`Total Bazar: ${pdfMoney(summary.totalBazar)}`, 14, 30);
    doc.text(`Total Utilities: ${pdfMoney(summary.totalUtilities)}`, 14, 37);
    doc.text(`Total Meals: ${summary.totalMeals}`, 14, 44);
    doc.text(`Meal Rate: ${pdfMoney(summary.mealRate)}/meal`, 14, 51);
    doc.text(`Total Deposits: ${pdfMoney(summary.totalDeposits)}`, 14, 58);
    doc.text(`Staff Cost: ${pdfMoney(summary.totalStaffCost)}`, 14, 65);
    autoTable(doc, {
      startY: 73,
      head: [
        [
          "Member",
          "Meals",
          "Meal Cost",
          "Rent",
          "Utility",
          "Staff",
          "Previous",
          "Total Due",
          "Deposited",
          "Balance",
        ],
      ],
      body: summary.perMember.map((p) => [
        p.memberName,
        p.meals,
        pdfMoney(p.mealCost),
        pdfMoney(p.rentShare),
        pdfMoney(p.utilityShare),
        pdfMoney(p.staffShare),
        pdfMoney(p.previousDue),
        pdfMoney(p.totalDue),
        pdfMoney(p.deposited),
        `${p.balance >= 0 ? "Deposit " : "Due "}${pdfMoney(Math.abs(p.balance))}`,
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [22, 163, 74] },
    });
    doc.save(`MessHub-${ym}.pdf`);
    toast.success("PDF exported");
  };

  const exportXLSX = () => {
    const wb = XLSX.utils.book_new();
    const sum = [
      ["Month", ym],
      ["Total Bazar", summary.totalBazar],
      ["Total Utilities", summary.totalUtilities],
      ["Total Expense", summary.totalExpense],
      ["Total Staff Cost", summary.totalStaffCost],
      ["Total Rent Ledger", summary.totalRent],
      ["Total Previous Due", summary.totalPreviousDue],
      ["Total Meals", summary.totalMeals],
      ["Meal Rate", summary.mealRate],
      ["Total Deposits", summary.totalDeposits],
      ["Cash Balance", summary.cashBalance],
      ["Vacant Beds", summary.vacantBeds],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sum), "Summary");
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(summary.perMember),
      "Members",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(bazar.filter((b) => b.ym === ym)),
      "Bazar",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(expenses.filter((e: Expense) => e.ym === ym)),
      "Expenses",
    );
    // Use the same auto-computed per-member deposit figures shown on screen
    // (summary.perMember), not the raw `deposits` collection — that legacy
    // collection is a separate, largely disconnected data source from the
    // settlement engine and would export numbers that don't reconcile with
    // the "Deposits" KPI card or the member breakdown table above.
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        summary.perMember
          .filter((p) => p.deposited > 0)
          .map((p) => ({
            Member: p.memberName,
            Deposit: p.deposited,
            Source: p.depositSource || "",
          })),
      ),
      "Deposits",
    );
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(staff), "Staff");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rooms), "Rooms");
    XLSX.writeFile(wb, `MessHub-${ym}.xlsx`);
    toast.success("Excel exported");
  };

  const exportCSV = () => {
    const rows = [
      [
        "Member",
        "Meals",
        "Meal Cost",
        "Rent",
        "Utility",
        "Staff",
        "Previous Due",
        "Total Due",
        "Deposited",
        "Balance",
      ],
      ...summary.perMember.map((p) => [
        p.memberName,
        p.meals,
        p.mealCost,
        p.rentShare,
        p.utilityShare,
        p.staffShare,
        p.previousDue,
        p.totalDue,
        p.deposited,
        p.balance,
      ]),
    ];
    const csv = rows
      .map((row) =>
        row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","),
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `MessHub-${ym}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    toast.success("CSV exported");
  };

  const shareText = `MessHub ${ym}: meals ${summary.totalMeals}, meal rate ${bdt(summary.mealRate)}, expense ${bdt(summary.totalExpense)}, collections ${bdt(summary.totalDeposits)}, cash ${bdt(summary.cashBalance)}.`;

  const emailReport = () => {
    window.location.href = `mailto:?subject=${encodeURIComponent(`MessHub report ${ym}`)}&body=${encodeURIComponent(shareText)}`;
  };

  const whatsappReport = () => {
    window.open(
      `https://wa.me/?text=${encodeURIComponent(shareText)}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Monthly closing summary"
        action={
          <div className="flex flex-wrap gap-2">
            <Button onClick={exportPDF} size="sm" variant="outline">
              <FileDown className="h-4 w-4 mr-1" />
              PDF
            </Button>
            <Button onClick={exportCSV} size="sm" variant="outline">
              <FileDown className="h-4 w-4 mr-1" />
              CSV
            </Button>
            <Button onClick={exportXLSX} size="sm">
              <FileSpreadsheet className="h-4 w-4 mr-1" />
              Excel
            </Button>
            <Button onClick={() => window.print()} size="sm" variant="outline">
              <Printer className="h-4 w-4 mr-1" />
              Print
            </Button>
            <Button onClick={emailReport} size="sm" variant="outline">
              <Mail className="h-4 w-4 mr-1" />
              Email
            </Button>
            <Button onClick={whatsappReport} size="sm" variant="outline">
              <MessageCircle className="h-4 w-4 mr-1" />
              WhatsApp
            </Button>
          </div>
        }
      />
      <div className="p-6 space-y-6">
        <Card className="p-4 max-w-xs">
          <Label>Month</Label>
          <div className="mt-1.5">
            <MonthPicker value={ym} onChange={setYm} />
          </div>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Bazar"
            value={bdt(summary.totalBazar)}
            icon={Receipt}
            tone="primary"
          />
          <StatCard
            label="Utilities"
            value={bdt(summary.totalUtilities)}
            icon={TrendingUp}
          />
          <StatCard
            label="Meals"
            value={String(summary.totalMeals)}
            icon={Utensils}
            hint={`Rate ${bdt(summary.mealRate)}`}
          />
          <StatCard
            label="Deposits"
            value={bdt(summary.totalDeposits)}
            icon={Wallet}
            tone="primary"
          />
          <StatCard
            label="Staff cost"
            value={bdt(summary.totalStaffCost)}
            icon={Receipt}
          />
          <StatCard
            label="Rent ledger"
            value={bdt(summary.totalRent)}
            icon={Wallet}
          />
          <StatCard
            label="Vacant beds"
            value={String(summary.vacantBeds)}
            icon={TrendingUp}
          />
          <StatCard
            label={summary.cashBalance >= 0 ? "Cash balance" : "Cash shortfall"}
            value={bdt(Math.abs(summary.cashBalance))}
            icon={Wallet}
            tone={summary.cashBalance >= 0 ? "primary" : "danger"}
          />
        </div>

        <Card className="p-5">
          <h3 className="font-semibold mb-4">Member breakdown — {ym}</h3>
          {summary.perMember.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No data for this month
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground">
                  <tr className="border-b">
                    <th className="text-left py-2 font-medium">Member</th>
                    <th className="text-right py-2 font-medium">Meals</th>
                    <th className="text-right py-2 font-medium">Meal Cost</th>
                    <th className="text-right py-2 font-medium">Rent</th>
                    <th className="text-right py-2 font-medium">Utility</th>
                    <th className="text-right py-2 font-medium">Staff</th>
                    <th className="text-right py-2 font-medium">Previous</th>
                    <th className="text-right py-2 font-medium">Total Due</th>
                    <th className="text-right py-2 font-medium">Deposited</th>
                    <th className="text-right py-2 font-medium">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.perMember.map((p) => (
                    <tr key={p.memberId} className="border-b last:border-0">
                      <td className="py-2.5 font-medium">{p.memberName}</td>
                      <td className="text-right tabular-nums">{p.meals}</td>
                      <td className="text-right tabular-nums">
                        {bdt(p.mealCost)}
                      </td>
                      <td className="text-right tabular-nums">
                        {bdt(p.rentShare)}
                      </td>
                      <td className="text-right tabular-nums">
                        {bdt(p.utilityShare)}
                      </td>
                      <td className="text-right tabular-nums">
                        {bdt(p.staffShare)}
                      </td>
                      <td className="text-right tabular-nums">
                        {bdt(p.previousDue)}
                      </td>
                      <td className="text-right tabular-nums">
                        {bdt(p.totalDue)}
                      </td>
                      <td className="text-right tabular-nums">
                        {bdt(p.deposited)}
                      </td>
                      <td
                        className={`text-right tabular-nums font-bold ${p.balance >= 0 ? "text-primary" : "text-destructive"}`}
                      >
                        {p.balance >= 0 ? "Deposit " : "Due "}{bdt(Math.abs(p.balance))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Member Settlement Summary — who gave what, who owes what */}
        <Card className="p-5">
          <h3 className="font-semibold">Member Settlement Summary — {ym}</h3>
          <p className="text-xs text-muted-foreground mt-1 mb-4">
            What each member actually paid this month vs. their fair share of every cost (rent + meals + utilities + staff).
          </p>
          {summary.perMember.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No data for this month</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground bg-muted/50">
                  <tr>
                    <th className="text-left p-3 font-medium">Member</th>
                    <th className="text-right p-3 font-medium">Total Paid</th>
                    <th className="text-right p-3 font-medium">Fair Share</th>
                    <th className="text-right p-3 font-medium">Balance</th>
                    <th className="text-center p-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.perMember.map((p) => (
                    <tr key={p.memberId} className="border-t hover:bg-muted/30">
                      <td className="p-3 font-medium">{p.memberName}</td>
                      <td className="p-3 text-right tabular-nums text-primary">{bdt(p.totalContributions)}</td>
                      <td className="p-3 text-right tabular-nums">{bdt(p.totalCharges)}</td>
                      <td className={`p-3 text-right tabular-nums font-bold ${p.balance >= 0 ? "text-primary" : "text-destructive"}`}>
                        {p.balance >= 0 ? "+" : "-"}{bdt(Math.abs(p.balance))}
                      </td>
                      <td className="p-3 text-center">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          p.settlementStatus === "settled" ? "bg-primary/10 text-primary" :
                          p.settlementStatus === "receive" ? "bg-green-500/10 text-green-600" :
                          "bg-destructive/10 text-destructive"
                        }`}>
                          {p.settlementStatus === "receive" ? "Will Receive" : p.settlementStatus === "pay" ? "Must Pay" : "Settled"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="font-semibold bg-muted/30 border-t-2">
                  <tr>
                    <td className="p-3">Total</td>
                    <td className="p-3 text-right">{bdt(summary.perMember.reduce((s, p) => s + p.totalContributions, 0))}</td>
                    <td className="p-3 text-right">{bdt(summary.perMember.reduce((s, p) => s + p.totalCharges, 0))}</td>
                    <td className="p-3 text-right">{bdt(summary.perMember.reduce((s, p) => s + p.balance, 0))}</td>
                    <td className="p-3"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Card>

        {/* Final Settlement — Who Owes Whom (never held by the mess itself) */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-semibold">Final Settlement — Who Owes Whom — {ym}</h3>
            {memberToMemberSettlements.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-primary font-medium">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Total Receivable = Total Payable = {bdt(totalSettlementAmount)}
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Direct transfers needed to zero everyone out — money flows only between members; the mess itself never holds or owes anything.
          </p>
          {memberToMemberSettlements.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Everyone is settled — no transfers needed.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground bg-muted/50">
                  <tr>
                    <th className="text-left p-3 font-medium">From</th>
                    <th className="text-center p-3 font-medium"></th>
                    <th className="text-left p-3 font-medium">To</th>
                    <th className="text-right p-3 font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {memberToMemberSettlements.map((st, i) => (
                    <tr key={`${st.fromMemberId}-${st.toMemberId}-${i}`} className="border-t hover:bg-muted/30">
                      <td className="p-3 font-medium">{st.fromMemberName}</td>
                      <td className="p-3 text-center text-muted-foreground"><ArrowRight className="h-3.5 w-3.5 inline" /></td>
                      <td className="p-3 font-medium">{st.toMemberName}</td>
                      <td className="p-3 text-right tabular-nums font-bold text-primary">{bdt(st.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="font-semibold bg-muted/30 border-t-2">
                  <tr>
                    <td colSpan={3} className="p-3">Total</td>
                    <td className="p-3 text-right text-primary">{bdt(totalSettlementAmount)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
