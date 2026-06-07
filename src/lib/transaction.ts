/**
 * Transaction-based financial operations
 * Ensures data consistency for all financial transactions
 */
import { db } from "./firebase";
import { 
  doc, 
  writeBatch, 
  collection,
  getDoc,
  type Transaction,
  runTransaction,
} from "firebase/firestore";
import type { Member, Room } from "./types";

/**
 * Record a payment with automatic ledger entry
 * Uses transaction to ensure consistency
 */
export async function recordPaymentWithLedger(input: {
  memberId: string;
  memberName: string;
  amount: number;
  method: string;
  date: string;
  ym: string;
  referenceNo?: string;
  notes?: string;
}): Promise<string> {
  const paymentRef = doc(collection(db, "payments"));
  const ledgerRef = doc(collection(db, "ledgers"));
  
  await runTransaction(db, async (transaction: Transaction) => {
    // Create payment record
    transaction.set(paymentRef, {
      ...input,
      id: paymentRef.id,
      status: "paid",
      createdAt: Date.now(),
    });
    
    // Create ledger entry
    transaction.set(ledgerRef, {
      id: ledgerRef.id,
      memberId: input.memberId,
      memberName: input.memberName,
      date: input.date,
      ym: input.ym,
      transactionType: "payment",
      category: "payment",
      amount: input.amount,
      notes: input.notes,
      createdAt: Date.now(),
    });
    
    // Update rent charge if exists
    const rentChargeRef = doc(db, "rent_charges", `${input.memberId}_${input.ym}`);
    const rentSnap = await transaction.get(rentChargeRef);
    
    if (rentSnap.exists()) {
      const rentData = rentSnap.data() as { paidAmount?: number; dueAmount?: number; status?: string };
      const newPaidAmount = (rentData.paidAmount || 0) + input.amount;
      const newDueAmount = Math.max(0, (rentData.dueAmount || 0) - input.amount);
      const newStatus = newDueAmount === 0 ? "paid" : newPaidAmount > 0 ? "partial" : "pending";
      
      transaction.update(rentChargeRef, {
        paidAmount: newPaidAmount,
        dueAmount: newDueAmount,
        status: newStatus,
      });
    }
  });
  
  return paymentRef.id;
}

/**
 * Record a deposit with automatic ledger entry
 */
export async function recordDepositWithLedger(input: {
  memberId: string;
  memberName: string;
  amount: number;
  method: string;
  date: string;
  ym: string;
  notes?: string;
}): Promise<string> {
  const depositRef = doc(collection(db, "deposits"));
  const ledgerRef = doc(collection(db, "ledgers"));
  
  await runTransaction(db, async (transaction: Transaction) => {
    // Create deposit record
    transaction.set(depositRef, {
      ...input,
      id: depositRef.id,
      createdAt: Date.now(),
    });
    
    // Create ledger entry
    transaction.set(ledgerRef, {
      id: ledgerRef.id,
      memberId: input.memberId,
      memberName: input.memberName,
      date: input.date,
      ym: input.ym,
      transactionType: "deposit",
      category: "deposit",
      amount: input.amount,
      notes: input.notes,
      createdAt: Date.now(),
    });
  });
  
  return depositRef.id;
}

/**
 * Record a credit with automatic ledger entry
 */
export async function recordCreditWithLedger(input: {
  memberId: string;
  memberName: string;
  amount: number;
  reason: string;
  date: string;
  ym: string;
  notes?: string;
}): Promise<string> {
  const creditRef = doc(collection(db, "credits"));
  const ledgerRef = doc(collection(db, "ledgers"));
  
  await runTransaction(db, async (transaction: Transaction) => {
    // Create credit record
    transaction.set(creditRef, {
      ...input,
      id: creditRef.id,
      createdAt: Date.now(),
    });
    
    // Create ledger entry
    transaction.set(ledgerRef, {
      id: ledgerRef.id,
      memberId: input.memberId,
      memberName: input.memberName,
      date: input.date,
      ym: input.ym,
      transactionType: "credit",
      category: "credit",
      amount: input.amount,
      notes: input.notes,
      createdAt: Date.now(),
    });
  });
  
  return creditRef.id;
}

/**
 * Create a batch of rent charges for a month
 * Uses batch for efficiency
 */
export async function createRentChargesBatch(
  memberCharges: { memberId: string; memberName: string; amount: number; month: string }[]
): Promise<void> {
  const batch = writeBatch(db);
  
  for (const charge of memberCharges) {
    const chargeRef = doc(db, "rent_charges", `${charge.memberId}_${charge.month}`);
    batch.set(chargeRef, {
      ...charge,
      status: "pending",
      paidAmount: 0,
      dueAmount: charge.amount,
      createdAt: Date.now(),
    });
  }
  
  await batch.commit();
}

/**
 * Create a batch of utility allocations
 */
export async function createUtilityAllocationsBatch(
  allocations: { utilityId: string; memberId: string; memberName: string; amount: number; subscribed: boolean }[]
): Promise<void> {
  const batch = writeBatch(db);
  
  for (const alloc of allocations) {
    const allocRef = doc(db, "utility_allocations", `${alloc.utilityId}_${alloc.memberId}`);
    batch.set(allocRef, {
      ...alloc,
      allocationMethod: "equal",
      createdAt: Date.now(),
    });
  }
  
  await batch.commit();
}

/**
 * Create a batch of staff allocations
 */
export async function createStaffAllocationsBatch(
  allocations: { staffId: string; staffName: string; staffRole: string; memberId: string; memberName: string; amount: number; month: string }[]
): Promise<void> {
  const batch = writeBatch(db);
  
  for (const alloc of allocations) {
    const allocRef = doc(db, "staff_allocations", `${alloc.staffId}_${alloc.memberId}_${alloc.month}`);
    batch.set(allocRef, {
      ...alloc,
      createdAt: Date.now(),
    });
  }
  
  await batch.commit();
}

/**
 * Generate rent charges for a specific month
 * Creates rent charges for all active members based on their room/bed rent
 */
export async function generateRentChargesForMonth(
  month: string,
  members: Member[],
  rooms: Room[]
): Promise<{ created: number; skipped: number }> {
  const activeMembers = members.filter((m) => m.active);
  const batch = writeBatch(db);
  let created = 0;
  let skipped = 0;
  
  for (const member of activeMembers) {
    // Check if rent charge already exists
    const chargeRef = doc(db, "rent_charges", `${member.id}_${month}`);
    const existingSnap = await getDoc(chargeRef);
    
    if (existingSnap.exists()) {
      skipped++;
      continue;
    }
    
    // Calculate rent from room (per-bed)
    let rentAmount = member.monthlyRent || 0;
    if (member.roomId) {
      const room = rooms.find((r) => r.id === member.roomId);
      if (room && room.totalBeds) {
        rentAmount = room.monthlyRent / room.totalBeds;
      }
    }
    
    if (rentAmount > 0) {
      batch.set(chargeRef, {
        memberId: member.id,
        memberName: member.name,
        month,
        amount: rentAmount,
        status: "pending",
        paidAmount: 0,
        dueAmount: rentAmount,
        createdAt: Date.now(),
      });
      created++;
    }
  }
  
  await batch.commit();
  return { created, skipped };
}