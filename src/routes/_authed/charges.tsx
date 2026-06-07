import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useMemo, useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  useCollection,
  addDocTo,
  deleteDocFrom,
  orderBy,
  type Member,
  type Room,
  type LedgerEntry,
} from "@/lib/data";
import { ymKey, bdt } from "@/lib/format";
import {
  Receipt, DollarSign, Users, Zap, Building2, PiggyBank, Trash2, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { submitChangeRequest } from "@/lib/workflow";
import type { Deposit, Credit, Payment, Utility, ServiceType } from "@/lib/types";
import { isMemberSubscribedToService, getPerBedRent } from "@/lib/calc";

export const Route = createFileRoute("/_authed/charges")({
  component: ChargesPage,
});

// Service type to display name mapping
const SERVICE_LABELS: Record<ServiceType, string> = {
  rent: "Rent",
  meals: "Meals",
  internet: "Internet",
  electricity: "Electricity",
  gas: "Gas",
  water: "Water",
  cooking_staff: "Cooking Staff",
  cleaning_staff: "Cleaning Staff",
  security_staff: "Security Staff",
  laundry: "Laundry",
  parking: "Parking",
  generator: "Generator",
  maintenance: "Maintenance",
  other_services: "Other Services",
};

// All utility service types that can be subscribed
const UTILITY_SERVICE_TYPES: ServiceType[] = [
  "electricity", "internet", "gas", "water", "generator", "maintenance"
];

// Map utility type names (as stored in DB) to service types
const UTILITY_TYPE_TO_SERVICE: Record<string, ServiceType> = {
  "electricity": "electricity",
  "internet": "internet",
  "gas": "gas",
  "water": "water",
  "generator": "generator",
  "maintenance": "maintenance",
  "bua salary": "other_services",
  "garbage": "other_services",
  "security": "other_services",
  "rent": "rent",
  "other": "other_services",
};

function ChargesPage() {
  const { profile } = useAuth();
  const [ym, setYm] = useState(ymKey());
  const [selectedMember, setSelectedMember] = useState<string>("");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const { data: members } = useCollection<Member>("members");
  const { data: rooms } = useCollection<Room>("rooms");
  const { data: utilities } = useCollection<Utility>("utilities", [orderBy("date", "desc")]);
  const { data: ledgers } = useCollection<LedgerEntry>("ledgers", [orderBy("date", "desc")]);
  const { data: payments } = useCollection<Payment>("payments", [orderBy("date", "desc")]);
  const { data: deposits } = useCollection<Deposit>("deposits", [orderBy("date", "desc")]);
  const { data: credits } = useCollection<Credit>("credits", [orderBy("date", "desc")]);

  const activeMembers = useMemo(
    () => members.filter((m) => m.active).sort((a, b) => a.name.localeCompare(b.name)),
    [members]
  );

  useEffect(() => {
    if (activeMembers.length > 0 && !selectedMember) {
      setSelectedMember(activeMembers[0].id);
    }
  }, [activeMembers, selectedMember]);

  const currentMember = members.find((m) => m.id === selectedMember);
  const currentRoom = rooms.find((r) => r.id === currentMember?.roomId);
  const perBedRent = currentMember ? getPerBedRent(currentMember, rooms) : 0;
  
  // Get unique utilities (one-time setup - no duplicates)
  const uniqueUtilities = useMemo(() => {
    const seen = new Set<string>();
    return utilities.filter(u => {
      const key = u.type.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [utilities]);

  // Get month-specific utilities for auto charges
  const monthUtilities = utilities.filter((u) => u.ym === ym);

  // Calculate auto charges based on member's subscriptions AND utilities table
  // This shows all subscribed services that have bills in the utilities table
  const autoCharges = useMemo(() => {
    if (!currentMember) return { rent: 0, utilities: [] as { type: ServiceType; amount: number; hasBill: boolean; billAmount?: number }[], total: 0 };
    
    const charges: { rent: number; utilities: { type: ServiceType; amount: number; hasBill: boolean; billAmount?: number }[]; total: number } = {
      rent: 0,
      utilities: [],
      total: 0,
    };

    // Rent charge (if subscribed)
    if (isMemberSubscribedToService(currentMember, "rent")) {
      charges.rent = perBedRent;
      charges.total += perBedRent;
    }

    // Utility charges - show all subscribed utilities that have bills
    // Get all unique utility types from the utilities table
    const uniqueUtilityTypes = new Set(monthUtilities.map(u => u.type.toLowerCase()));
    
    UTILITY_SERVICE_TYPES.forEach((serviceType) => {
      if (isMemberSubscribedToService(currentMember, serviceType)) {
        // Find if there's a bill for this utility type this month
        const bill = monthUtilities.find(u => {
          const dbType = u.type.toLowerCase();
          return dbType === serviceType;
        });
        
        if (bill) {
          // Calculate share based on number of subscribers
          const subscribers = activeMembers.filter(m => isMemberSubscribedToService(m, serviceType)).length || 1;
          const amount = bill.amount / subscribers;
          charges.utilities.push({ type: serviceType, amount, hasBill: true, billAmount: bill.amount });
          charges.total += amount;
        } else {
          // Show subscribed service without bill
          charges.utilities.push({ type: serviceType, amount: 0, hasBill: false });
        }
      }
    });

    return charges;
  }, [currentMember, perBedRent, monthUtilities, activeMembers]);

  // Get all available utility types for Record Payment dropdown
  const availableUtilityTypes = useMemo(() => {
    return uniqueUtilities.map(u => ({
      type: u.type,
      serviceType: UTILITY_TYPE_TO_SERVICE[u.type.toLowerCase()] || "other_services",
      amount: u.amount
    }));
  }, [uniqueUtilities]);

  // Only ONE source: ledgers collection
  const memberEntries = ledgers.filter((e) => e.memberId === selectedMember && e.ym === ym);

  // Calculate totals from ledger entries
  const totalCharges = memberEntries
    .filter((e) => e.transactionType === "charge")
    .reduce((sum, e) => sum + e.amount, 0);
  const totalDeposits = memberEntries
    .filter((e) => e.transactionType === "deposit")
    .reduce((sum, e) => sum + e.amount, 0);
  const totalCredits = memberEntries
    .filter((e) => e.transactionType === "credit")
    .reduce((sum, e) => sum + e.amount, 0);
  const totalPayments = memberEntries
    .filter((e) => e.transactionType === "payment")
    .reduce((sum, e) => sum + e.amount, 0);
  const currentDue = totalCharges - totalDeposits - totalCredits - totalPayments;

  // Handle amount changes
  const handleAmountChange = (key: string, value: string) => {
    setAmounts(prev => ({ ...prev, [key]: value }));
  };

  // Save auto charges to ledger
  const handleSaveAutoCharges = async () => {
    if (!currentMember || !profile) return;
    
    setSaving(true);
    try {
      // Save rent charge if subscribed
      if (autoCharges.rent > 0) {
        await addDocTo("ledgers", {
          memberId: currentMember.id,
          memberName: currentMember.name,
          date: ym + "-01",
          ym,
          transactionType: "charge",
          category: "rent",
          amount: autoCharges.rent,
          notes: `Auto charge: Rent for ${ym}`,
        });
      }

      // Save utility charges
      for (const util of autoCharges.utilities) {
        if (util.hasBill && util.amount > 0) {
          await addDocTo("ledgers", {
            memberId: currentMember.id,
            memberName: currentMember.name,
            date: ym + "-01",
            ym,
            transactionType: "charge",
            category: "utility",
            amount: util.amount,
            notes: `Auto charge: ${SERVICE_LABELS[util.type]} for ${ym}`,
          });
        }
      }

      toast.success("Auto charges saved to ledger");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // Record payment handler
  const handleRecordPayment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!currentMember || !profile) return;

    const form = e.target as HTMLFormElement;
    const amount = parseFloat((form.elements.namedItem("amount") as HTMLInputElement).value);
    const method = (form.elements.namedItem("method") as HTMLSelectElement).value;
    const date = (form.elements.namedItem("date") as HTMLInputElement).value;
    const notes = (form.elements.namedItem("notes") as HTMLTextAreaElement).value;

    if (!amount || amount <= 0) return toast.error("Enter amount");

    try {
      await addDocTo("payments", {
        memberId: currentMember.id,
        memberName: currentMember.name,
        amount,
        method,
        date,
        ym: date.slice(0, 7),
        status: "paid",
        notes,
      });

      // Also create ledger entry
      await addDocTo("ledgers", {
        memberId: currentMember.id,
        memberName: currentMember.name,
        date,
        ym: date.slice(0, 7),
        transactionType: "payment",
        category: "payment",
        amount,
        notes: notes || `Payment via ${method}`,
      });

      toast.success("Payment recorded");
      form.reset();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  // Record deposit handler
  const handleRecordDeposit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!currentMember || !profile) return;

    const form = e.target as HTMLFormElement;
    const amount = parseFloat((form.elements.namedItem("amount") as HTMLInputElement).value);
    const method = (form.elements.namedItem("method") as HTMLSelectElement).value;
    const date = (form.elements.namedItem("date") as HTMLInputElement).value;
    const notes = (form.elements.namedItem("notes") as HTMLTextAreaElement).value;

    if (!amount || amount <= 0) return toast.error("Enter amount");

    try {
      await addDocTo("deposits", {
        memberId: currentMember.id,
        memberName: currentMember.name,
        amount,
        method,
        date,
        ym: date.slice(0, 7),
        notes,
      });

      // Also create ledger entry
      await addDocTo("ledgers", {
        memberId: currentMember.id,
        memberName: currentMember.name,
        date,
        ym: date.slice(0, 7),
        transactionType: "deposit",
        category: "deposit",
        amount,
        notes: notes || `Deposit via ${method}`,
      });

      toast.success("Deposit recorded");
      form.reset();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  // Record credit handler
  const handleRecordCredit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!currentMember || !profile) return;

    const form = e.target as HTMLFormElement;
    const amount = parseFloat((form.elements.namedItem("amount") as HTMLInputElement).value);
    const reason = (form.elements.namedItem("reason") as HTMLInputElement).value;
    const date = (form.elements.namedItem("date") as HTMLInputElement).value;
    const notes = (form.elements.namedItem("notes") as HTMLTextAreaElement).value;

    if (!amount || amount <= 0) return toast.error("Enter amount");

    try {
      await addDocTo("credits", {
        memberId: currentMember.id,
        memberName: currentMember.name,
        amount,
        reason,
        date,
        ym: date.slice(0, 7),
        notes,
      });

      // Also create ledger entry
      await addDocTo("ledgers", {
        memberId: currentMember.id,
        memberName: currentMember.name,
        date,
        ym: date.slice(0, 7),
        transactionType: "credit",
        category: "credit",
        amount,
        notes: notes || `Credit: ${reason}`,
      });

      toast.success("Credit recorded");
      form.reset();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  // Delete transaction handler
  const handleDeleteTransaction = async (entry: LedgerEntry) => {
    if (!profile || !confirm("Delete this transaction?")) return;
    
    try {
      if (profile.role === "owner") {
        await deleteDocFrom("ledgers", entry.id);
        toast.success("Deleted");
      } else {
        await submitChangeRequest({
          collectionName: "ledgers",
          action: "delete",
          title: `Delete transaction for ${currentMember?.name}`,
          actor: { uid: profile.uid, name: profile.name, role: profile.role },
          targetId: entry.id,
          previousData: entry,
        });
        toast.success("Delete request sent to admin");
      }
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const METHODS = ["Cash", "bKash", "Nagad", "Rocket", "Bank"];

  return (
    <div>
      <PageHeader
        title="Member Charges"
        description="Manage auto charges and record payments"
      />
      
      <div className="p-6 space-y-6">
        {/* Member Selection */}
        <div className="flex flex-wrap gap-4">
          <div className="space-y-2">
            <Label>Month</Label>
            <Input type="month" value={ym} onChange={(e) => setYm(e.target.value)} className="w-44" />
          </div>
          <div className="space-y-2">
            <Label>Member</Label>
            <Select value={selectedMember} onValueChange={setSelectedMember}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Select member" />
              </SelectTrigger>
              <SelectContent>
                {activeMembers.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {currentMember && (
          <>
            {/* Auto Charges Section */}
            <Card className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-lg flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  Auto Charges
                </h3>
                {autoCharges.total > 0 && (
                  <Button size="sm" onClick={handleSaveAutoCharges} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save to Ledger"}
                  </Button>
                )}
              </div>
              
              <div className="space-y-3">
                {autoCharges.rent > 0 && (
                  <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
                    <span className="font-medium">Rent</span>
                    <span className="font-semibold">{bdt(autoCharges.rent)}</span>
                  </div>
                )}
                
                {autoCharges.utilities.length > 0 ? (
                  autoCharges.utilities.map((util) => (
                    <div key={util.type} className="flex justify-between items-center p-3 bg-muted rounded-lg">
                      <div>
                        <span className="font-medium">{SERVICE_LABELS[util.type]}</span>
                        {!util.hasBill && (
                          <span className="text-xs text-muted-foreground ml-2">(No bill yet)</span>
                        )}
                      </div>
                      <span className="font-semibold">
                        {util.hasBill ? bdt(util.amount) : "—"}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No subscribed services</p>
                )}
                
                {autoCharges.total > 0 && (
                  <div className="border-t pt-3 mt-3">
                    <div className="flex justify-between items-center font-bold text-lg">
                      <span>Total Auto Charges</span>
                      <span>{bdt(autoCharges.total)}</span>
                    </div>
                  </div>
                )}
              </div>
            </Card>

            {/* Record Payment Section */}
            <Card className="p-5">
              <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                <Receipt className="h-5 w-5" />
                Record Payment
              </h3>
              
              <form onSubmit={handleRecordPayment} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Amount (৳)</Label>
                    <Input 
                      type="number" 
                      name="amount"
                      min="0" 
                      step="0.01" 
                      placeholder="Enter amount" 
                      required 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Method</Label>
                    <Select name="method" defaultValue="Cash">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {METHODS.map(m => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input type="date" name="date" defaultValue={ym + "-01"} />
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea 
                    name="notes" 
                    rows={2} 
                    placeholder="Optional notes" 
                  />
                </div>
                <Button type="submit" className="w-full">
                  Record Payment
                </Button>
              </form>
            </Card>

            {/* Record Deposit Section */}
            <Card className="p-5">
              <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                <PiggyBank className="h-5 w-5" />
                Record Deposit
              </h3>
              
              <form onSubmit={handleRecordDeposit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Amount (৳)</Label>
                    <Input 
                      type="number" 
                      name="amount"
                      min="0" 
                      step="0.01" 
                      placeholder="Enter amount" 
                      required 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Method</Label>
                    <Select name="method" defaultValue="Cash">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {METHODS.map(m => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input type="date" name="date" defaultValue={ym + "-01"} />
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea 
                    name="notes" 
                    rows={2} 
                    placeholder="Optional notes" 
                  />
                </div>
                <Button type="submit" className="w-full">
                  Record Deposit
                </Button>
              </form>
            </Card>

            {/* Record Credit Section */}
            <Card className="p-5">
              <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Record Credit
              </h3>
              
              <form onSubmit={handleRecordCredit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Amount (৳)</Label>
                    <Input 
                      type="number" 
                      name="amount"
                      min="0" 
                      step="0.01" 
                      placeholder="Enter amount" 
                      required 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Reason</Label>
                    <Input 
                      type="text" 
                      name="reason"
                      placeholder="Credit reason" 
                      required 
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input type="date" name="date" defaultValue={ym + "-01"} />
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea 
                    name="notes" 
                    rows={2} 
                    placeholder="Optional notes" 
                  />
                </div>
                <Button type="submit" className="w-full">
                  Record Credit
                </Button>
              </form>
            </Card>

            {/* Summary Section */}
            <Card className="p-5">
              <h3 className="font-semibold text-lg mb-4">Summary</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-lg bg-muted p-3">
                  <div className="text-xs text-muted-foreground">Total Charges</div>
                  <div className="font-semibold">{bdt(totalCharges)}</div>
                </div>
                <div className="rounded-lg bg-muted p-3">
                  <div className="text-xs text-muted-foreground">Total Deposits</div>
                  <div className="font-semibold">{bdt(totalDeposits)}</div>
                </div>
                <div className="rounded-lg bg-muted p-3">
                  <div className="text-xs text-muted-foreground">Total Credits</div>
                  <div className="font-semibold">{bdt(totalCredits)}</div>
                </div>
                <div className={`rounded-lg p-3 ${currentDue <= 0 ? "bg-primary/10" : "bg-destructive/10"}`}>
                  <div className="text-xs text-muted-foreground">Current Due</div>
                  <div className={`font-semibold ${currentDue <= 0 ? "text-primary" : "text-destructive"}`}>
                    {bdt(currentDue)}
                  </div>
                </div>
              </div>
            </Card>

            {/* Transactions Section */}
            <Card className="p-5">
              <h3 className="font-semibold text-lg mb-4">Transactions</h3>
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
                        <th className="text-right p-3 font-medium">Amount</th>
                        {profile && <th></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {memberEntries.map((entry) => (
                        <tr key={entry.id} className="border-t hover:bg-muted/30">
                          <td className="p-3">{entry.date}</td>
                          <td className="p-3 capitalize">{entry.transactionType}</td>
                          <td className="p-3 capitalize">{entry.category}</td>
                          <td className="p-3 text-muted-foreground max-w-xs truncate">{entry.notes || "—"}</td>
                          <td className={`p-3 text-right tabular-nums font-semibold ${
                            entry.transactionType === "deposit" || entry.transactionType === "payment" || entry.transactionType === "credit"
                              ? "text-primary" 
                              : "text-destructive"
                          }`}>
                            {bdt(entry.amount)}
                          </td>
                          {profile && (
                            <td className="p-3">
                              <Button 
                                size="sm" 
                                variant="destructive"
                                onClick={() => handleDeleteTransaction(entry)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          )}
                        </tr>
                      ))}
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