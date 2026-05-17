import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMemo, useState } from "react";
import { useCollection, type Member, type MealEntry, type Bazar, type Utility, type Deposit } from "@/lib/data";
import { computeMonthly } from "@/lib/calc";
import { ymKey, bdt } from "@/lib/format";
import { FileDown, FileSpreadsheet } from "lucide-react";
import { StatCard } from "@/components/app/StatCard";
import { Utensils, Wallet, TrendingUp, Receipt } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { toast } from "sonner";

export const Route = createFileRoute("/_authed/reports")({
  component: ReportsPage,
});

function ReportsPage() {
  const [ym, setYm] = useState(ymKey());
  const { data: members } = useCollection<Member>("members");
  const { data: meals } = useCollection<MealEntry>("meals");
  const { data: bazar } = useCollection<Bazar>("bazar");
  const { data: utilities } = useCollection<Utility>("utilities");
  const { data: deposits } = useCollection<Deposit>("deposits");

  const summary = useMemo(
    () => computeMonthly(ym, members, meals, bazar, utilities, deposits),
    [ym, members, meals, bazar, utilities, deposits]
  );

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(`Monthly Report — ${ym}`, 14, 18);
    doc.setFontSize(11);
    doc.text(`Total Bazar: ${bdt(summary.totalBazar)}`, 14, 30);
    doc.text(`Total Utilities: ${bdt(summary.totalUtilities)}`, 14, 37);
    doc.text(`Total Meals: ${summary.totalMeals}`, 14, 44);
    doc.text(`Meal Rate: ${bdt(summary.mealRate)}/meal`, 14, 51);
    doc.text(`Total Deposits: ${bdt(summary.totalDeposits)}`, 14, 58);
    autoTable(doc, {
      startY: 66,
      head: [["Member", "Meals", "Meal Cost", "Utility Share", "Total Due", "Deposited", "Balance"]],
      body: summary.perMember.map((p) => [
        p.memberName, p.meals,
        bdt(p.mealCost), bdt(p.utilityShare),
        bdt(p.totalDue), bdt(p.deposited), bdt(p.balance),
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
      ["Total Meals", summary.totalMeals],
      ["Meal Rate", summary.mealRate],
      ["Total Deposits", summary.totalDeposits],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sum), "Summary");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary.perMember), "Members");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bazar.filter(b => b.ym === ym)), "Bazar");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(utilities.filter(u => u.ym === ym)), "Utilities");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(deposits.filter(d => d.ym === ym)), "Deposits");
    XLSX.writeFile(wb, `MessHub-${ym}.xlsx`);
    toast.success("Excel exported");
  };

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Monthly closing summary"
        action={
          <div className="flex gap-2">
            <Button onClick={exportPDF} size="sm" variant="outline"><FileDown className="h-4 w-4 mr-1"/>PDF</Button>
            <Button onClick={exportXLSX} size="sm"><FileSpreadsheet className="h-4 w-4 mr-1"/>Excel</Button>
          </div>
        }
      />
      <div className="p-6 space-y-6">
        <Card className="p-4 max-w-xs">
          <Label>Month</Label>
          <Input type="month" value={ym} onChange={(e) => setYm(e.target.value)} className="mt-1.5"/>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Bazar" value={bdt(summary.totalBazar)} icon={Receipt} tone="primary"/>
          <StatCard label="Utilities" value={bdt(summary.totalUtilities)} icon={TrendingUp}/>
          <StatCard label="Meals" value={String(summary.totalMeals)} icon={Utensils} hint={`Rate ${bdt(summary.mealRate)}`}/>
          <StatCard label="Deposits" value={bdt(summary.totalDeposits)} icon={Wallet} tone="primary"/>
        </div>

        <Card className="p-5">
          <h3 className="font-semibold mb-4">Member breakdown — {ym}</h3>
          {summary.perMember.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No data for this month</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground">
                  <tr className="border-b">
                    <th className="text-left py-2 font-medium">Member</th>
                    <th className="text-right py-2 font-medium">Meals</th>
                    <th className="text-right py-2 font-medium">Meal Cost</th>
                    <th className="text-right py-2 font-medium">Utility</th>
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
                      <td className="text-right tabular-nums">{bdt(p.mealCost)}</td>
                      <td className="text-right tabular-nums">{bdt(p.utilityShare)}</td>
                      <td className="text-right tabular-nums">{bdt(p.totalDue)}</td>
                      <td className="text-right tabular-nums">{bdt(p.deposited)}</td>
                      <td className={`text-right tabular-nums font-bold ${p.balance >= 0 ? "text-primary" : "text-destructive"}`}>{bdt(p.balance)}</td>
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