import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMemo, useState } from "react";
import {
  useCollection,
  type Member,
  type MealEntry,
  type Bazar,
  type Utility,
  type Deposit,
  type Credit,
  type Payment,
  type Staff,
  type Room,
} from "@/lib/data";
import { computeMonthly } from "@/lib/calc";
import { ymKey, bdt } from "@/lib/format";
import {
  FileDown,
  FileSpreadsheet,
  Mail,
  MessageCircle,
  Printer,
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
  const { data: utilities } = useCollection<Utility>("utilities");
  const { data: deposits } = useCollection<Deposit>("deposits");
  const { data: credits } = useCollection<Credit>("credits");
  const { data: payments } = useCollection<Payment>("payments");
  const { data: staff } = useCollection<Staff>("staff");
  const { data: rooms } = useCollection<Room>("rooms");

  const summary = useMemo(
    () =>
      computeMonthly(
        ym,
        members,
        meals,
        bazar,
        utilities,
        deposits,
        credits,
        payments,
        staff,
        rooms,
      ),
    [ym, members, meals, bazar, utilities, deposits, credits, payments, staff, rooms],
  );

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
        pdfMoney(p.balance),
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
      XLSX.utils.json_to_sheet(utilities.filter((u) => u.ym === ym)),
      "Utilities",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(deposits.filter((d) => d.ym === ym)),
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
            label="Cash balance"
            value={bdt(summary.cashBalance)}
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
                        {bdt(p.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
