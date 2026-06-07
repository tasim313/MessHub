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

export type UtilityType =
  | "electricity"
  | "internet"
  | "gas"
  | "water"
  | "generator"
  | "maintenance"
  | "rent"
  | "others";

export type AllocationMethod = "equal" | "per_member" | "per_room" | "fixed" | "custom_percentage";

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
  | "adjustment";

export type TransactionCategory =
  | "rent"
  | "meal"
  | "utility"
  | "staff"
  | "other"
  | "deposit"
  | "credit"
  | "payment";

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
