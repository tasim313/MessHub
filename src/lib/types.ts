export type Role =
  | "owner"
  | "manager"
  | "accountant"
  | "bazar_manager"
  | "meal_manager"
  | "cook"
  | "cleaner"
  | "security"
  | "helper"
  | "member"
  | "guest"
  | "auditor";

export type UserStatus = "active" | "suspended" | "removed";

export type RoomType = "single" | "double" | "triple" | "shared" | "family" | "staff";

export type RoomStatus = "available" | "occupied" | "maintenance" | "reserved";

export type MemberStatus = "active" | "inactive" | "moved_out" | "suspended" | "pending";

export type MealStatus = "active" | "hold" | "cancelled";

export type StaffRole = "manager" | "cook" | "cleaner" | "security" | "helper" | "accountant";

export type StaffStatus = "active" | "inactive" | "on_leave";

export type PaymentMethod = "cash" | "bkash" | "nagad" | "rocket" | "bank";

export type PaymentStatus = "paid" | "partially_paid" | "due" | "overpaid";

export type ChangeRequestStatus = "pending" | "approved" | "rejected";

export type ChangeRequestAction = "create" | "update" | "delete";

export type AllocationMethod = "equal" | "per_member" | "per_room" | "fixed" | "custom_percentage" | "usage_based";

export type BazarCategory =
  | "rice"
  | "vegetables"
  | "meat"
  | "fish"
  | "oil"
  | "spices"
  | "dairy"
  | "fruits"
  | "others";

export type ServiceType =
  | "rent"
  | "meals"
  | "internet"
  | "electricity"
  | "gas"
  | "water"
  | "cooking_staff"
  | "cleaning_staff"
  | "security_staff"
  | "laundry"
  | "parking"
  | "generator"
  | "maintenance"
  | "other_services";

export type TransactionType =
  | "charge"
  | "deposit"
  | "payment"
  | "credit"
  | "refund"
  | "credit_note"
  | "adjustment"
  | "meal_charge"
  | "rent_charge"
  | "utility_charge"
  | "staff_charge"
  | "other_charge"
  | "bazar_contribution"
  | "expense_contribution"
  | "monthly_closing"
  | "advance_given"
  | "advance_recovered";

export type TransactionCategory =
  | "rent"
  | "meal"
  | "utility"
  | "internet"
  | "electricity"
  | "gas"
  | "water"
  | "generator"
  | "maintenance"
  | "staff"
  | "other"
  | "deposit"
  | "credit"
  | "credit_note"
  | "payment"
  | "bazar_contribution"
  | "food"
  | "cleaning"
  | "security"
  | "furniture"
  | "appliance"
  | "kitchen"
  | "repair"
  | "garbage"
  | "wifi"
  | "cleaner_salary"
  | "security_salary"
  | "other_expense"
  | "advance"
  | "advance_recovery";

// ============================================================================
// Unified Expense System - Covers ALL shared expenses
// ============================================================================

/**
 * All supported expense categories in the system.
 * Every expense must fall under one of these categories.
 */
export type ExpenseCategory =
  | "house_rent"
  | "electricity"
  | "water"
  | "gas"
  | "internet"
  | "generator"
  | "cleaner_salary"
  | "security_salary"
  | "maintenance"
  | "repair"
  | "garbage"
  | "wifi_equipment"
  | "kitchen"
  | "furniture"
  | "appliance"
  | "other_shared";

/**
 * Human-readable labels for expense categories
 */
export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  house_rent: "House Rent",
  electricity: "Electricity Bill",
  water: "Water Bill",
  gas: "Gas Bill",
  internet: "Internet Bill",
  generator: "Generator Bill",
  cleaner_salary: "Cleaner Salary",
  security_salary: "Security Guard Salary",
  maintenance: "Maintenance Cost",
  repair: "Repair Cost",
  garbage: "Garbage Collection",
  wifi_equipment: "WiFi Equipment Cost",
  kitchen: "Kitchen Expenses",
  furniture: "Common Furniture Cost",
  appliance: "Shared Appliance Cost",
  other_shared: "Other Shared Expenses",
};

/**
 * Service type mapping for each expense category (for subscription-based allocation)
 */
export const EXPENSE_CATEGORY_TO_SERVICE: Record<ExpenseCategory, ServiceType> = {
  house_rent: "rent",
  electricity: "electricity",
  water: "water",
  gas: "gas",
  internet: "internet",
  generator: "generator",
  cleaner_salary: "cleaning_staff",
  security_salary: "security_staff",
  maintenance: "maintenance",
  repair: "maintenance",
  garbage: "other_services",
  wifi_equipment: "internet",
  kitchen: "other_services",
  furniture: "other_services",
  appliance: "other_services",
  other_shared: "other_services",
};

/**
 * Transaction category mapping for each expense category
 */
export const EXPENSE_CATEGORY_TO_TRANSACTION: Record<ExpenseCategory, TransactionCategory> = {
  house_rent: "rent",
  electricity: "electricity",
  water: "water",
  gas: "gas",
  internet: "internet",
  generator: "generator",
  cleaner_salary: "cleaner_salary",
  security_salary: "security_salary",
  maintenance: "maintenance",
  repair: "repair",
  garbage: "garbage",
  wifi_equipment: "wifi",
  kitchen: "kitchen",
  furniture: "furniture",
  appliance: "appliance",
  other_shared: "other_expense",
};

/**
 * Expense status tracking
 */
export type ExpenseStatus = "pending" | "paid" | "partially_paid" | "overdue";

/**
 * Unified Expense Record - replaces the old Utility type
 * Tracks every shared expense in the mess
 */
export interface Expense {
  id: string;
  ym: string;
  category: ExpenseCategory;
  amount: number;
  description?: string;
  date: string;
  // Who paid (the person who paid on behalf of the mess)
  paidBy?: string;
  paidByName?: string;
  // Allocation method
  allocationMethod: AllocationMethod;
  // Fixed amount per member, used when allocationMethod === "fixed"
  fixedAmount?: number;
  // Set when this expense was auto-generated from a RecurringBill template —
  // used to guard against generating the same month's bill twice.
  recurringBillId?: string;
  // Per-member percentage split (memberId -> percent 0-100), used when
  // allocationMethod === "custom_percentage"
  customPercentages?: Record<string, number>;
  // Status
  status: ExpenseStatus;
  // Receipt/image URL
  receiptUrl?: string;
  // How much has been allocated vs paid
  allocatedAmount?: number;
  paidAmount?: number;
  remainingAmount?: number;
  // Notes
  notes?: string;
  // Metadata
  createdAt?: number;
  createdBy?: string;
  updatedAt?: number;
}

/**
 * Per-member expense allocation tracking
 */
export interface ExpenseAllocation {
  id: string;
  expenseId: string;
  memberId: string;
  memberName: string;
  category: ExpenseCategory;
  amount: number;
  percentage?: number;
  subscribed: boolean;
  // Month for filtering
  ym: string;
  // Payment tracking
  paidAmount?: number;
  dueAmount?: number;
  status?: "pending" | "paid" | "partial";
  createdAt?: number;
  createdBy?: string;
}

// ============================================================================
// Advance / Advance Recovery System
// ============================================================================

/**
 * Represents money advanced by a member who paid more than their share of an expense.
 * This is a LIABILITY of the mess toward that member.
 */
export interface Advance {
  id: string;
  /** The member who advanced the money */
  memberId: string;
  memberName: string;
  /** Total amount advanced */
  amount: number;
  /** Remaining un-recovered amount */
  remainingAmount: number;
  /** Source of the advance (expense, etc.) */
  source: string;
  sourceType: "expense" | "utility" | "bazar" | "rent" | "other";
  /** Source reference ID */
  sourceId: string;
  /** Month */
  ym: string;
  /** Status */
  status: "outstanding" | "partially_recovered" | "recovered";
  /** Notes */
  notes?: string;
  createdAt?: number;
  createdBy?: string;
  updatedAt?: number;
}

/**
 * Tracks each recovery of an advance.
 * When another member pays, their payment recovers part of the advance.
 */
export interface AdvanceRecovery {
  id: string;
  /** Which advance this recovery is for */
  advanceId: string;
  /** The advance owner (who gets their money back) */
  advanceOwnerId: string;
  advanceOwnerName: string;
  /** The member who made the payment that triggered this recovery */
  recoveredFromMemberId: string;
  recoveredFromMemberName: string;
  /** Amount recovered */
  amount: number;
  /** The payment that triggered this recovery */
  sourcePaymentId: string;
  /** Month */
  ym: string;
  date: string;
  notes?: string;
  createdAt?: number;
  createdBy?: string;
}

// ============================================================================
// Legacy Types (Keep for backward compatibility)
// ============================================================================

export type UtilityType =
  | "electricity"
  | "internet"
  | "gas"
  | "water"
  | "generator"
  | "maintenance"
  | "rent"
  | "others";

export interface AppUser {
  uid: string;
  email: string | null;
  name: string;
  role: Role;
  status?: UserStatus;
  active?: boolean;
  suspendedAt?: number;
  removedAt?: number;
  phone?: string;
  photoURL?: string | null;
  createdAt?: number;
  createdBy?: string;
  lastLoginAt?: number;
  lastLoginDevice?: string;
}

export interface Member {
  id: string;
  name: string;
  email?: string | null;
  phone?: string;
  role: Role;
  uid?: string;
  active: boolean;
  photoUrl?: string;
  nid?: string;
  occupation?: string;
  emergencyContact?: string;
  joiningDate?: string;
  leavingDate?: string;
  roomId?: string;
  roomName?: string;
  bedNo?: string;
  depositAmount?: number;
  monthlyRent?: number;
  mealStatus?: MealStatus;
  securityDeposit?: number;
  previousDue?: number;
  notes?: string;
  status?: MemberStatus;
  joinedAt?: number;
  createdBy?: string;
  services?: ServiceSubscription[];
}

export interface ServiceSubscription {
  type: ServiceType;
  enabled: boolean;
  amount?: number;
  notes?: string;
}

export interface Room {
  id: string;
  messName: string;
  branchName?: string;
  buildingName: string;
  floorName: string;
  roomNo: string;
  roomType: RoomType;
  totalBeds: number;
  monthlyRent: number;
  status: RoomStatus;
  notes?: string;
  createdAt?: number;
  createdBy?: string;
}

export interface Bed {
  id: string;
  roomId: string;
  roomNo: string;
  bedNo: string;
  status: "available" | "occupied" | "maintenance";
  assignedMemberId?: string;
  assignedMemberName?: string;
  joinDate?: string;
  leaveDate?: string;
  notes?: string;
  createdAt?: number;
  createdBy?: string;
}

export interface Staff {
  id: string;
  name: string;
  phone?: string;
  role: StaffRole;
  salary: number;
  advance?: number;
  overtime?: number;
  bonus?: number;
  leaveDays?: number;
  attendanceDays?: number;
  paidAmount?: number;
  status: StaffStatus;
  joinedAt?: string;
  notes?: string;
  createdAt?: number;
  createdBy?: string;
}

export interface MealEntry {
  id: string;
  memberId: string;
  memberName: string;
  date: string; // YYYY-MM-DD
  ym: string; // YYYY-MM
  breakfast: number;
  lunch: number;
  dinner: number;
  guest: number;
  createdAt?: number;
  createdBy?: string;
}

export interface Bazar {
  id: string;
  date: string;
  ym: string;
  buyerId: string;
  buyerName: string;
  items: { name: string; amount: number }[];
  total: number;
  category: BazarCategory;
  notes?: string;
  receiptUrl?: string;
  createdAt?: number;
  createdBy?: string;
}

export interface Utility {
  id: string;
  ym: string;
  type: UtilityType;
  amount: number;
  paidBy?: string;
  paidByName?: string;
  notes?: string;
  date: string;
  createdAt?: number;
  createdBy?: string;
}

export interface UtilityAllocation {
  id: string;
  utilityId: string;
  memberId: string;
  memberName: string;
  amount: number;
  allocationMethod: AllocationMethod;
  percentage?: number;
  fixedAmount?: number;
  subscribed: boolean;
  createdAt?: number;
  createdBy?: string;
}

export interface StaffAllocation {
  id: string;
  staffId: string;
  staffName: string;
  staffRole: StaffRole;
  memberId: string;
  memberName: string;
  amount: number;
  month: string; // YYYY-MM
  createdAt?: number;
  createdBy?: string;
}

export interface RentCharge {
  id: string;
  memberId: string;
  memberName: string;
  month: string; // YYYY-MM
  amount: number;
  status: "pending" | "paid" | "partial" | "overdue";
  paidAmount?: number;
  dueAmount?: number;
  createdAt?: number;
  createdBy?: string;
}

export interface Deposit {
  id: string;
  memberId: string;
  memberName: string;
  amount: number;
  method: PaymentMethod;
  date: string;
  ym: string;
  referenceNo?: string;
  notes?: string;
  createdAt?: number;
  createdBy?: string;
}

export interface Credit {
  id: string;
  memberId: string;
  memberName: string;
  amount: number;
  reason: string;
  date: string;
  ym: string;
  notes?: string;
  createdAt?: number;
  createdBy?: string;
}

export interface Payment {
  id: string;
  memberId: string;
  memberName: string;
  amount: number;
  method: PaymentMethod;
  date: string;
  ym: string;
  status: PaymentStatus;
  referenceNo?: string;
  notes?: string;
  // What the payment is for (expense category, rent, meal, etc.)
  category?: string;
  // Link to specific expense/utility record
  referenceId?: string;
  referenceType?: "expense" | "utility" | "rent" | "meal" | "bazar" | "staff" | "other";
  createdAt?: number;
  createdBy?: string;
}

export interface LedgerEntry {
  id: string;
  memberId: string;
  memberName: string;
  date: string;
  ym: string;
  transactionType: TransactionType;
  category: TransactionCategory;
  amount: number;
  referenceId?: string;
  referenceType?: string;
  notes?: string;
  createdBy?: string;
  createdAt?: number;
  balance?: number;
  /** Payment tracking: how much of this charge has been paid */
  paidAmount?: number;
  /** Payment tracking: status of this charge entry */
  chargeStatus?: "pending" | "paid" | "partial";
  /** Reference to the payment that cleared this charge */
  paymentReferenceId?: string;
}

/**
 * Many-to-many join record between a settling source (a Payment or a
 * CreditNote) and a charge (a "charge" is a ledgers document with a
 * chargeType, e.g. meal_charge/rent_charge/etc). One payment/credit note can
 * settle several charges, and — over time, across partial payments — one
 * charge can be settled by several sources. This is the single source of
 * truth for "who/what settled which charge", replacing any single mutable
 * field (paidAmount/paymentReferenceId) as the record of what happened;
 * those fields remain as a fast-read cache derived from these allocation
 * rows.
 */
export interface ChargeAllocation {
  id: string;
  /** What settled the charge: an actual payment, or a credit note correction */
  sourceType: "payment" | "credit_note";
  sourceId: string; // id of the payments or credit_notes document
  chargeId: string; // id of the ledgers document being settled
  memberId: string;
  category: string;
  amount: number;
  date: string;
  ym: string;
  createdAt?: number;
  createdBy?: string;
}

/**
 * A Credit Note corrects a charge WITHOUT ever editing the original charge
 * record — it reduces what the member is deemed to owe, with a mandatory
 * reason, fully auditable. Never delete or backdate-edit a posted charge to
 * "fix" it; issue a credit note instead.
 */
export interface CreditNote {
  id: string;
  memberId: string;
  memberName: string;
  amount: number; // always > 0 — the amount being forgiven/corrected
  reason: string; // mandatory
  category?: string;
  /** The specific charge this corrects, if any (optional — can be a general credit) */
  relatedChargeId?: string;
  date: string;
  ym: string;
  status: "issued" | "voided";
  voidedReason?: string;
  voidedBy?: string;
  voidedAt?: number;
  createdBy?: string;
  createdAt?: number;
}

/**
 * A Refund is money physically returned to a member (e.g. cashing out part
 * of their held deposit). Distinct from a Credit Note: a credit note forgives
 * an obligation the member never actually paid; a refund reverses money the
 * member DID pay. Both are tracked as separate, permanent, auditable records
 * — never as edits to the original payment/deposit.
 */
export interface Refund {
  id: string;
  memberId: string;
  memberName: string;
  amount: number; // always > 0
  reason: string; // mandatory
  method: string; // how the cash was returned (cash, bKash, bank, ...)
  /** The payment/deposit this refund reverses, if any */
  relatedPaymentId?: string;
  date: string;
  ym: string;
  status: "issued" | "voided";
  voidedReason?: string;
  voidedBy?: string;
  voidedAt?: number;
  createdBy?: string;
  createdAt?: number;
}

/**
 * A recurring monthly bill template (rent is handled separately via Rooms;
 * this covers fixed-amount bills like water, internet, garbage collection,
 * etc. that don't otherwise have a stored monthly amount anywhere). Once
 * active, the actual Expense document for the current month is generated
 * automatically — this template is never itself the accounting record, it
 * only describes what to generate.
 */
export interface RecurringBill {
  id: string;
  category: ExpenseCategory;
  label: string;
  amount: number;
  allocationMethod: AllocationMethod;
  active: boolean;
  createdBy?: string;
  createdAt?: number;
}

export interface Report {
  id: string;
  type: "financial" | "meal" | "bazar" | "utility" | "staff" | "rent" | "collection" | "due" | "occupancy";
  title: string;
  month: string; // YYYY-MM
  data: Record<string, unknown>;
  generatedBy: string;
  generatedByName: string;
  createdAt?: number;
  createdBy?: string;
}

export interface Notification {
  id: string;
  recipientUid: string;
  recipientRole: Role;
  title: string;
  message: string;
  type: "info" | "warning" | "error" | "success";
  read: boolean;
  link?: string;
  createdAt?: number;
  createdBy?: string;
}

export interface ActivityLog {
  id: string;
  type: string;
  entity: string;
  entityId?: string;
  action: string;
  actorUid: string;
  actorName: string;
  actorRole: Role;
  message: string;
  meta?: Record<string, unknown>;
  createdAt?: number;
  createdBy?: string;
}

export interface MonthlyClosing {
  id: string;
  month: string; // YYYY-MM
  year: number;
  totalIncome: number;
  totalExpense: number;
  netProfit: number;
  totalRent: number;
  totalMeal: number;
  totalUtility: number;
  totalStaff: number;
  totalDeposit: number;
  totalCredit: number;
  totalCollection: number;
  totalDue: number;
  closedBy: string;
  closedByName: string;
  closedAt?: number;
  createdAt?: number;
  createdBy?: string;
  status: "open" | "closed";
  memberBreakdown?: Record<string, {
    deposit: number;
    credit: number;
    balance: number;
    totalCharges: number;
    totalContributions: number;
  }>;
}

export interface Settings {
  id: string;
  messName: string;
  branchName?: string;
  address?: string;
  phone?: string;
  email?: string;
  currency: string;
  currencySymbol: string;
  fiscalYearStart: string;
  monthlyClosingDay: number;
  mealRateCalculationMethod: "equal" | "weighted";
  defaultRentDueDay: number;
  lateFeePercentage: number;
  lateFeeEnabled: boolean;
  notificationEnabled: boolean;
  emailNotifications: boolean;
  smsNotifications: boolean;
  createdAt?: number;
  updatedAt?: number;
  createdBy?: string;
}

export interface ChangeRequest {
  id: string;
  collectionName: string;
  action: ChangeRequestAction;
  targetId?: string;
  title: string;
  payload?: Record<string, unknown>;
  previousData?: Record<string, unknown> | null;
  requestedByUid: string;
  requestedByName: string;
  requestedByRole: Role;
  status: ChangeRequestStatus;
  reviewNote?: string;
  reviewedByUid?: string;
  reviewedByName?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface DashboardStats {
  totalMembers: number;
  activeMembers: number;
  roomsOccupied: number;
  emptyBeds: number;
  monthlyExpenses: number;
  monthlyIncome: number;
  dueAmount: number;
  collectionAmount: number;
  staffCost: number;
  utilityCost: number;
  mealCost: number;
  profitLoss: number;
}

export interface MemberFinancialSummary {
  memberId: string;
  memberName: string;
  openingBalance: number;
  rentCharge: number;
  mealCharge: number;
  utilityCharge: number;
  staffCharge: number;
  otherCharges: number;
  totalCharges: number;
  deposits: number;
  credits: number;
  payments: number;
  currentDue: number;
  paymentStatus: PaymentStatus;
}

export interface MonthlyStatement {
  memberId: string;
  memberName: string;
  month: string;
  openingBalance: number;
  rentCharge: number;
  mealCharge: number;
  utilityCharge: number;
  staffCharge: number;
  otherCharges: number;
  totalCharges: number;
  deposits: number;
  credits: number;
  payments: number;
  currentDue: number;
  transactions: LedgerEntry[];
}