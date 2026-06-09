# MessHub ERP – UI Relationships, Menus, Tables & Architecture Documentation

> **Last Updated:** 2026-06-08
> **Version:** 1.0

> **Project:** MessHub ERP – Enterprise Bangladeshi Bachelor Mess Management System  
> **Tech Stack:** React + TanStack Router + Firebase Firestore + Tailwind CSS + shadcn/ui  
> **Database:** Firebase Firestore (NoSQL document collections)

---

## 1. PROJECT OVERVIEW

MessHub is a complete mess management ERP for Bangladesh bachelor messes, hostels, and boarding houses. It handles:

- Multi-mess, multi-building, multi-floor, multi-room management
- Member onboarding and bed allocation
- Meal tracking and automatic meal rate calculation
- Bazar (grocery/shopping) expense management
- Utility bill management and allocation
- Staff management and payroll
- Complete accounting (double-entry ledger, deposits, credits, payments)
- Monthly closing and settlement generation
- PDF/Excel reporting
- Role-based access control (RBAC)

---

## 2. DATABASE COLLECTIONS (FIRESTORE TABLES)

| Collection Name | Type | Primary Key | Description |
|----------------|------|-------------|-------------|
| `users` | Auth/Profile | `uid` | Firebase Auth users + extended profile (role, status, phone, etc.) |
| `members` | Document | `id` (auto) | Mess member profiles, room/bed assignments, service subscriptions |
| `rooms` | Document | `id` (auto) | Room definitions (building, floor, type, beds, rent) |
| `beds` | Document | `id` (auto) | Individual bed assignments within rooms |
| `meals` | Document | `id` (auto) | Daily meal entries per member (breakfast, lunch, dinner, guest) |
| `bazar` | Document | `id` (auto) | Bazar/grocery purchase entries |
| `expenses` | Document | `id` (auto) | Unified shared expenses (utilities, rent, staff, maintenance, etc.) |
| `expense_allocations` | Document | `id` (auto) | Per-member allocation of shared expenses |
| `staff` | Document | `id` (auto) | Staff records (cook, cleaner, security, manager, etc.) |
| `staff_allocations` | Document | `id` (auto) | Per-member staff cost allocation |
| `payments` | Document | `id` (auto) | Member payment records (cash, bKash, Nagad, Rocket, Bank) |
| `deposits` | Document | `id` (auto) | Member deposit records (security, advance) |
| `credits` | Document | `id` (auto) | Member credit/adjustment records |
| `rent_charges` | Document | `id` (auto) | Monthly rent charge records per member |
| `utility_allocations` | Document | `id` (auto) | Per-member utility bill allocation |
| `ledgers` | Document | `id` (auto) | General ledger entries (all financial transactions) |
| `monthly_closing` | Document | `id` (auto) | Monthly closing/settlement snapshots |
| `change_requests` | Document | `id` (auto) | Approval workflow requests (create/update/delete) |
| `activity_logs` | Document | `id` (auto) | Audit trail of all actions |
| `notifications` | Document | `id` (auto) | In-app notifications |
| `reports` | Document | `id` (auto) | Generated report metadata |
| `settings` | Document | `id` | Mess configuration (name, currency, fiscal year, etc.) |

---

## 3. NAVIGATION / MENU STRUCTURE

The navigation is defined in [`AppShell.tsx`](src/components/app/AppShell.tsx:32) and rendered as a sidebar. Access is controlled by user role.

### 3.1 Menu Items & Role Access

| Menu Label | Route | Icon | Accessible Roles | Purpose |
|-----------|-------|------|------------------|---------|
| **Dashboard** | `/dashboard` | `LayoutDashboard` | owner, manager, member | Executive overview & KPIs |
| **Meals** | `/meals` | `Utensils` | owner, manager, member | Daily meal entry & tracking |
| **Bazar** | `/bazar` | `ShoppingBasket` | owner, manager, member | Grocery/shopping expense entry |
| **Utilities** | `/utilities` | `Zap` | owner, manager, member | Shared expense management (electricity, gas, internet, etc.) |
| **Deposits** | `/deposits` | `Wallet` | owner, manager, member | Auto-computed member deposits (positive balance) |
| **Credits** | `/credits` | `BadgePercent` | owner, manager | Auto-computed member credits (negative balance / dues) |
| **Payments** | `/payments` | `Banknote` | owner, manager | Manual payment recording |
| **Charges** | `/charges` | `Receipt` | owner, manager | Member charge breakdown & settlement details |
| **Ledger** | `/ledger` | `BookText` | owner, manager, member | Per-member monthly financial statement |
| **Rooms & Beds** | `/rooms` | `BedDouble` | owner, manager | Room/bed management & occupancy |
| **Staff** | `/staff` | `UsersRound` | owner, manager | Staff records & payroll |
| **Members** | `/members` | `Users` | owner, manager | Member CRUD & service subscriptions |
| **Reports** | `/reports` | `FileBarChart` | owner, manager | PDF/Excel export of monthly reports |
| **Monthly Closing** | `/monthly-closing` | `Lock` | owner, manager | Month-end lock & settlement generation |
| **Users & Admin** | `/admin` | `UserPlus` | owner only | User management, approval workflow, audit logs |

### 3.2 Layout Structure

```
/_authed (Layout Route)
├── AppShell (Sidebar + Header + Main Content)
│   ├── Sidebar (desktop: always visible, mobile: drawer)
│   │   ├── Logo / Brand
│   │   ├── Navigation Links (role-filtered)
│   │   ├── User Profile (avatar, name, role)
│   │   └── Theme Toggle + Logout
│   ├── Mobile Header (hamburger menu)
│   └── <Outlet /> (renders child route component)
│       ├── /dashboard
│       ├── /meals
│       ├── /bazar
│       ├── /utilities
│       ├── /deposits
│       ├── /credits
│       ├── /payments
│       ├── /charges
│       ├── /ledger
│       ├── /rooms
│       ├── /staff
│       ├── /members
│       ├── /reports
│       ├── /monthly-closing
│       └── /admin
```

---

## 4. UI PAGES – DETAILED ANALYSIS

### 4.1 DASHBOARD (`/dashboard`)

**File:** [`src/routes/_authed/dashboard.tsx`](src/routes/_authed/dashboard.tsx)

**Purpose:** Executive overview showing KPIs, charts, and member financial summaries for the current month.

**Inputs (User):**
- None (view-only page)
- Implicit: current month (`ymKey()`)

**Data Sources (Firestore Collections):**
- `members` – all member records
- `meals` – all meal entries
- `bazar` – all bazar entries
- `utilities` / `expenses` – all expense records
- `deposits` – all deposit records
- `staff` – all staff records
- `rooms` – all room records

**Outputs (UI Displays):**
- **Stat Cards:** Total Members, Active Members, Rooms Occupied, Empty Beds, Monthly Expenses, Monthly Income, Due Amount, Collection Amount, Staff Cost, Utility Cost, Meal Cost, Profit/Loss
- **Charts:** Expense split (pie), meal trends (line/area), member balance distribution (bar)
- **Member Summary Table:** Per-member meal count, meal cost, rent, utility, staff, total charges, deposits, balance
- **Due Members List:** Members with negative balance
- **Paid Members List:** Members with positive/zero balance

**Features:**
- Real-time data via Firestore snapshots
- Automatic monthly computation via `computeMonthly()`
- Responsive charts using Recharts
- Member-specific view (members see only their own data)
- Quick navigation to other modules

**Who Uses:** owner, manager, member

---

### 4.2 MEALS (`/meals`)

**File:** [`src/routes/_authed/meals.tsx`](src/routes/_authed/meals.tsx)

**Purpose:** Record and track daily meal consumption per member (breakfast, lunch, dinner, guest meals).

**Inputs (User):**
- Member selection (dropdown)
- Date picker
- Breakfast count (number)
- Lunch count (number)
- Dinner count (number)
- Guest meals count (number)

**Data Sources:**
- `members` – for member selection
- `meals` – existing meal entries

**Outputs (UI Displays):**
- Monthly meal table: per-member daily meal entries
- Monthly totals per member
- Grand total meals for the month
- Edit/Delete actions (owner only)

**Features:**
- Add/Edit/Delete meal entries
- Approval workflow for non-owner roles (submits `change_request`)
- Monthly filtering
- Search/filter capabilities
- Meal rate calculation integration

**Who Uses:** owner (full CRUD), manager (full CRUD), member (view only / request via workflow)

---

### 4.3 BAZAR (`/bazar`)

**File:** [`src/routes/_authed/bazar.tsx`](src/routes/_authed/bazar.tsx)

**Purpose:** Record grocery/shopping purchases made on behalf of the mess.

**Inputs (User):**
- Buyer/Member selection (dropdown)
- Date picker
- Category (Rice, Oil, Fish, Meat, Vegetables, Gas, Water jar, Snacks, Cleaning, Internet, Other)
- Total amount (number)
- Notes (textarea)

**Data Sources:**
- `members` – for buyer selection
- `bazar` – existing bazar entries

**Outputs (UI Displays):**
- Bazar entry list with date, buyer, category, amount, notes
- Grand total of filtered entries
- Search by category, buyer, or notes

**Features:**
- Add/Edit/Delete bazar entries
- Approval workflow for non-owner roles
- Category-based filtering
- Receipt/notes tracking
- Monthly aggregation

**Who Uses:** owner, manager, member (view/request)

---

### 4.4 UTILITIES / EXPENSES (`/utilities`)

**File:** [`src/routes/_authed/utilities.tsx`](src/routes/_authed/utilities.tsx)

**Purpose:** Manage all shared expenses (electricity, water, gas, internet, rent, staff salaries, maintenance, etc.) with per-member allocation.

**Inputs (User):**
- Expense category (electricity, water, gas, internet, generator, cleaner_salary, security_salary, maintenance, repair, garbage, wifi_equipment, kitchen, furniture, appliance, other_shared)
- Amount (number)
- Date picker
- Paid by (member selection – who paid on behalf of mess)
- Allocation method (equal, per_member, per_room, fixed, custom_percentage, usage_based)
- Description (text)
- Notes (textarea)
- Status (pending, paid, partially_paid, overdue)

**Data Sources:**
- `members` – for paidBy selection
- `expenses` – all expense records
- `expense_allocations` – per-member allocations (created automatically)

**Outputs (UI Displays):**
- Grouped expense list by category
- Category totals
- Expense detail cards with allocation info
- Delete confirmation dialogs

**Features:**
- Unified expense system (replaces old utility-only model)
- 16 expense categories covering all shared costs
- Multiple allocation methods
- Automatic per-member allocation generation
- Approval workflow
- Receipt URL attachment support

**Who Uses:** owner, manager, member (view/request)

---

### 4.5 DEPOSITS (`/deposits`)

**File:** [`src/routes/_authed/deposits.tsx`](src/routes/_authed/deposits.tsx)

**Purpose:** Display auto-computed deposits – members with positive net balance (they overpaid and are owed money by the mess).

**Inputs (User):**
- Month selector (YYYY-MM)

**Data Sources:**
- `members` – all members
- `rooms` – room data for rent calculation
- `meals` – meal entries
- `bazar` – bazar entries
- `expenses` – all expenses
- `deposits` – manual deposit records
- `credits` – credit records
- `payments` – payment records
- `staff` – staff records
- `ledgers` – ledger entries

**Outputs (UI Displays):**
- Month selector
- Summary cards: Total Deposit, Total Contributions, Total Charges
- Member list with positive balance (sorted by highest balance)
- Per-member breakdown: contributions, charges, net balance
- Manual deposit total (for reference)

**Features:**
- **Auto-computed** – no manual entry allowed
- Settlement engine integration (`calculateAllSettlements`)
- Month-specific filtering
- Export capabilities

**Who Uses:** owner, manager, member

---

### 4.6 CREDITS (`/credits`)

**File:** [`src/routes/_authed/credits.tsx`](src/routes/_authed/credits.tsx)

**Purpose:** Display auto-computed credits – members with negative net balance (they owe money to the mess).

**Inputs (User):**
- Month selector (YYYY-MM)

**Data Sources:**
- Same as Deposits (full settlement data)

**Outputs (UI Displays):**
- Month selector
- Info banner explaining credit = "Pay to Mess"
- Summary: Total Credit, Total Charges, Total Paid, Total Meal Cost
- Member list with negative balance (sorted by most negative first)
- Per-member breakdown: charges, contributions, payments, net balance

**Features:**
- **Auto-computed** – no manual entry allowed
- Settlement engine integration
- Visual warning/alert styling for dues
- Month-specific filtering

**Who Uses:** owner, manager

---

### 4.7 PAYMENTS (`/payments`)

**File:** [`src/routes/_authed/payments.tsx`](src/routes/_authed/payments.tsx)

**Purpose:** Record manual payments received from members (cash, bKash, Nagad, Rocket, Bank transfer).

**Inputs (User):**
- Member selection (dropdown)
- Amount (number)
- Payment method (Cash, bKash, Nagad, Rocket, Bank)
- Date picker
- Status (paid, partially_paid, due, overpaid)
- Reference number (text)
- Notes (textarea)

**Data Sources:**
- `members` – for member selection
- `payments` – existing payment records
- `ledgers` – ledger entries (auto-created on payment)

**Outputs (UI Displays):**
- Payment list with member, amount, method, date, status, reference
- Add/Edit payment dialog
- Delete confirmation

**Features:**
- Add/Edit/Delete payments
- Duplicate reference number check
- Automatic ledger entry creation on payment
- Approval workflow for non-owner roles
- Payment method tracking
- Reference number for bank/mobile transactions

**Who Uses:** owner, manager

---

### 4.8 CHARGES (`/charges`)

**File:** [`src/routes/_authed/charges.tsx`](src/routes/_authed/charges.tsx)

**Purpose:** Detailed per-member charge breakdown showing how each member's monthly dues are calculated. This is the central settlement page where managers/owners can review, save charges to ledger, record manual charges, and record payments.

**Inputs (User):**
- Month selector (YYYY-MM)
- Member selector (dropdown)

**Data Sources:**
- `members` – member data
- `rooms` – room data for rent calculation
- `expenses` – monthly expenses (all categories)
- `expense_allocations` – per-member expense allocations
- `meals` – monthly meal entries
- `bazar` – monthly bazar entries
- `ledgers` – ledger entries
- `payments` – monthly payments
- `deposits` – monthly deposits
- `credits` – monthly credits
- `staff` – staff records
- `staff_allocations` – per-member staff allocations
- `rent_charges` – rent charge records

**Outputs (UI Displays):**
- Month & Member selectors
- Member info card (name, room, bed, rent)
- Service subscription list (rent, meals, internet, electricity, gas, water, cooking_staff, cleaning_staff, security_staff, laundry, parking, generator, maintenance, other_services)
- **Charges Section** (What member owes):
  - Meal cost (meal rate × member's total meals)
  - Rent share (per-bed rent)
  - Expense shares (per subscribed service: electricity, water, gas, internet, etc.)
  - Staff share (allocated staff cost)
  - Previous due (carried forward from previous month)
  - Previous credit (carried forward)
  - Previous deposit (carried forward, reduces charges)
  - Total charges
- **Contributions Section** (What member paid):
  - Bazar contribution (bills paid on behalf of mess)
  - Expense contributions (shared bills paid by member)
  - Rent paid
  - Total contributions
- **Net Balance Section:**
  - Total contributions
  - Deposits
  - Credits
  - Payments
  - Total charges
  - Net balance (positive = deposit/receive, negative = credit/pay)
  - Settlement status badge (Settled / Pay X to Mess / Receive X from Mess)
- **Record Charge Form:**
  - Charge type (rent, meals, internet, electricity, gas, water, etc.)
  - Amount
  - Date
  - Notes
- **Record Payment Form:**
  - Amount
  - Method (Cash, bKash, Nagad, Rocket, Bank)
  - Date
  - Notes
- **Transactions Table:**
  - Date, Type, Category, Notes, Amount
  - Delete button (owner direct, others via workflow)

**Features:**
- Real-time charge calculation via `calculateMemberSettlement()`
- Service subscription awareness (members only pay for subscribed services)
- Per-bed rent calculation
- Meal rate integration (auto-calculated from bazar + expenses / total meals)
- **"Save to Ledger" button** – bulk saves all auto-calculated charges (meal, rent, expenses, staff) as ledger entries with duplicate check
- **Manual charge recording** – add ad-hoc charges directly to ledger
- **Manual payment recording** – add payments directly (also creates ledger entry)
- Previous month carry-forward (due, credit, deposit)
- Settlement status determination (settled / pay / receive)
- Unpaid charges tracking with remaining balance
- Approval workflow for non-owner roles (delete requests)
- Duplicate charge prevention (`checkLedgerChargeExists`)

**Charges Page Workflow (Step-by-Step):**

1. **Select Month & Member** → Page loads all relevant data for that month
2. **Auto-Calculation** → `calculateMemberSettlement()` computes:
   - Meal cost = member's meals × meal rate
   - Rent share = per-bed rent (if subscribed to rent)
   - Expense shares = allocated expense amounts (only for subscribed services)
   - Staff share = allocated staff cost (if subscribed to staff services)
   - Previous due/credit/deposit = carried forward from prior month
   - Total charges = sum of all above
   - Contributions = bazar paid + expenses paid + rent paid + payments + deposits + credits
   - Net balance = contributions - charges
3. **Review Charges** → Manager/owner reviews the auto-calculated breakdown
4. **Save to Ledger** → Click "Save to Ledger" to persist all charges as `ledgers` documents:
   - Each charge type saved as separate ledger entry (meal, rent, electricity, etc.)
   - Duplicate check prevents re-saving existing charges
   - Creates `transactionType: "charge"` entries
5. **Record Manual Charge** → Use form to add custom/ad-hoc charges:
   - Select charge type, enter amount, date, notes
   - Creates `ledgers` entry with `transactionType: "charge"`
6. **Record Payment** → Use form to record member payment:
   - Enter amount, method, date, notes
   - Creates `payments` document
   - Also creates `ledgers` entry with `transactionType: "payment"`
7. **View Transactions** → See all ledger entries for the member/month
8. **Delete Transaction** → Owner can delete directly; others submit change request

**Related Tables:**
| Table | Relationship |
|-------|-------------|
| `members` | Primary entity – selected member |
| `rooms` | Provides per-bed rent calculation |
| `meals` | Source for meal count → meal cost |
| `bazar` | Source for meal rate calculation |
| `expenses` | Source for expense shares |
| `expense_allocations` | Per-member expense allocation amounts |
| `staff` | Source for staff cost |
| `staff_allocations` | Per-member staff cost allocation |
| `payments` | Member payments (contributions) |
| `deposits` | Member deposits (contributions) |
| `credits` | Member credits (contributions) |
| `ledgers` | Target for saved charges and recorded payments |
| `rent_charges` | Rent charge records (reference) |

**Who Uses:** owner, manager

---

### 4.9 LEDGER (`/ledger`)

**File:** [`src/routes/_authed/ledger.tsx`](src/routes/_authed/ledger.tsx)

**Purpose:** Display per-member monthly financial statement (general ledger view).

**Inputs (User):**
- Month selector (YYYY-MM)
- Member selector (dropdown)

**Data Sources:**
- `members` – member data
- `ledgers` – all ledger entries
- `rent_charges` – rent charge records
- `utility_allocations` – utility allocation records
- `staff_allocations` – staff allocation records

**Outputs (UI Displays):**
- Month & Member selectors
- Financial Statement card:
  - Opening balance
  - Rent charge
  - Meal charge
  - Utility charge
  - Staff charge
  - Other charges
  - Total charges
  - Deposits
  - Credits
  - Payments
  - Current due/balance
- Transaction list (ledger entries for the month)
- Export to CSV

**Features:**
- Monthly statement generation
- CSV export
- Member-specific view (members see only their own ledger)
- Opening balance tracking
- Transaction history

**Who Uses:** owner, manager, member

---

### 4.10 ROOMS & BEDS (`/rooms`)

**File:** [`src/routes/_authed/rooms.tsx`](src/routes/_authed/rooms.tsx)

**Purpose:** Manage room and bed inventory, track occupancy, and view vacancy status.

**Inputs (User):**
- Room form: mess name, branch name, building name, floor name, room number, room type (single, double, triple, shared, family, staff), total beds, monthly rent, status (available, occupied, maintenance, reserved), notes
- Search/filter

**Data Sources:**
- `rooms` – room records
- `members` – for occupancy calculation
- `beds` – bed records (referenced)

**Outputs (UI Displays):**
- Room list with building, floor, room number, type, beds, rent, status
- Occupancy indicators (how many members assigned per room)
- Search/filter
- Add/Edit/Delete room dialogs
- Status badges (available, occupied, maintenance, reserved)

**Features:**
- Full room CRUD
- Multi-building/floor hierarchy
- Room type support (single, double, triple, shared, family, staff)
- Occupancy tracking via member assignments
- Approval workflow for non-owner roles

**Who Uses:** owner, manager

---

### 4.11 STAFF (`/staff`)

**File:** [`src/routes/_authed/staff.tsx`](src/routes/_authed/staff.tsx)

**Purpose:** Manage staff records, track attendance, salary, advances, overtime, bonuses, and payroll.

**Inputs (User):**
- Staff form: name, phone, role (manager, cook, cleaner, security, helper, accountant), salary, advance, overtime, bonus, leave days, attendance days, paid amount, status (active, inactive, on_leave), joined date, notes
- Search/filter

**Data Sources:**
- `staff` – staff records
- `staff_allocations` – per-member staff cost allocation

**Outputs (UI Displays):**
- Staff list with name, role, salary, status
- Payroll summary cards: Gross Salary, Payable Amount, Paid Amount
- Search/filter
- Add/Edit/Delete staff dialogs
- Status badges

**Features:**
- Full staff CRUD
- Payroll calculation (salary + overtime + bonus - advance)
- Attendance tracking
- Leave management
- Staff cost allocation to members
- Approval workflow

**Who Uses:** owner, manager

---

### 4.12 MEMBERS (`/members`)

**File:** [`src/routes/_authed/members.tsx`](src/routes/_authed/members.tsx)

**Purpose:** Core member management – onboarding, profile editing, room/bed assignment, service subscriptions.

**Inputs (User):**
- Member form: name, email, phone, NID, occupation, emergency contact, joining date, leaving date, room assignment, bed assignment, deposit amount, monthly rent, meal status, security deposit, previous due, notes, status (active, inactive, moved_out, suspended, pending)
- Service subscriptions: rent, meals, internet, electricity, gas, water, cooking_staff, cleaning_staff, security_staff, laundry, parking, generator, maintenance, other_services
- Search/filter

**Data Sources:**
- `members` – member records
- `rooms` – for room/bed assignment
- `utilities` / `expenses` – for service subscription defaults

**Outputs (UI Displays):**
- Member list with name, room, bed, status, meal status
- Member detail cards
- Service subscription toggles
- Add/Edit/Delete member dialogs
- Status badges (active, inactive, moved_out, suspended, pending)

**Features:**
- Full member CRUD
- Room & bed assignment
- Service subscription management (members opt-in/out of services)
- Duplicate check (NID, phone, email)
- Approval workflow for non-owner roles
- Member status tracking
- Previous due carry-forward

**Who Uses:** owner, manager

---

### 4.13 REPORTS (`/reports`)

**File:** [`src/routes/_authed/reports.tsx`](src/routes/_authed/reports.tsx)

**Purpose:** Generate and export monthly financial and operational reports.

**Inputs (User):**
- Month selector (YYYY-MM)
- Export buttons (PDF, Excel, Print, Email, SMS)

**Data Sources:**
- `members` – all members
- `meals` – meal entries
- `bazar` – bazar entries
- `utilities` / `expenses` – expense records
- `deposits` – deposit records
- `staff` – staff records
- `rooms` – room records

**Outputs (UI Displays):**
- Monthly summary cards (Total Bazar, Total Utilities, Total Meals, Meal Rate, Total Deposits, Staff Cost)
- Per-member report table: Member, Meals, Meal Cost, Rent, Utility, Staff, Previous Due, Total Due, Deposited, Balance
- Export functionality:
  - PDF (via jsPDF + autoTable)
  - Excel (via xlsx)
  - CSV (via export utility)
  - Print view
  - Email/SMS placeholders

**Features:**
- PDF generation with auto-formatted tables
- Excel export
- Print-friendly layout
- Monthly filtering
- Comprehensive per-member breakdown

**Who Uses:** owner, manager

---

### 4.14 MONTHLY CLOSING (`/monthly-closing`)

**File:** [`src/routes/_authed/monthly-closing.tsx`](src/routes/_authed/monthly-closing.tsx)

**Purpose:** Lock a month's data, generate rent charges, and create a monthly closing record (snapshot).

**Inputs (User):**
- Month selector (YYYY-MM)
- "Close Month" button
- "Generate Rent Charges" button
- "Lock/Unlock" actions

**Data Sources:**
- `members` – all members
- `meals` – monthly meals
- `bazar` – monthly bazar
- `expenses` – monthly expenses
- `deposits` – monthly deposits
- `credits` – monthly credits
- `payments` – monthly payments
- `staff` – active staff
- `rooms` – room data
- `rent_charges` – rent charge records
- `monthly_closing` – existing closing records

**Outputs (UI Displays):**
- Month selector
- Closing status indicator (open/closed)
- Monthly summary: Total Income, Total Expense, Net Profit, Total Rent, Total Meal, Total Utility, Total Staff, Total Deposit, Total Credit, Total Collection, Total Due
- Action buttons: Generate Rent Charges, Close Month, Unlock Month
- Confirmation dialogs

**Features:**
- Month-end lock mechanism (prevents further edits)
- Automatic rent charge generation
- Monthly closing snapshot creation
- Financial summary (income, expense, profit/loss)
- Re-open capability (unlock)

**Who Uses:** owner, manager

---

### 4.15 USERS & ADMIN (`/admin`)

**File:** [`src/routes/_authed/admin.tsx`](src/routes/_authed/admin.tsx)

**Purpose:** Owner-only admin panel for user management, approval workflow, and audit logging.

**Inputs (User):**
- Create user form: name, email, password, role (owner, manager, accountant, bazar_manager, meal_manager, cook, cleaner, security, helper, member, guest, auditor)
- Approval actions: Approve/Reject change requests
- User management: Suspend, Activate, Remove users

**Data Sources:**
- `users` – Firebase Auth users + extended profiles
- `members` – member records
- `change_requests` – pending approval requests
- `activity_logs` – audit trail

**Outputs (UI Displays):**
- User creation form
- User list with role, status, actions
- Change request queue (pending, approved, rejected)
- Activity log timeline
- Approval/Rejection actions

**Features:**
- User CRUD (owner only)
- Role assignment (12 roles)
- Change request approval workflow
- Audit logging
- User status management (active, suspended, removed)
- Member-User linking

**Who Uses:** owner only

---

## 5. ROLE-BASED ACCESS CONTROL (RBAC)

### 5.1 Role Definitions

| Role | Description | Key Permissions |
|------|-------------|-----------------|
| `owner` | Mess owner | Full access to all features including admin panel |
| `manager` | Day-to-day manager | Full CRUD on most modules, no admin panel |
| `accountant` | Accountant | Ledger, payments, deposits, credits, reports |
| `bazar_manager` | Bazar manager | Bazar entries, meal entries |
| `meal_manager` | Meal manager | Meal entries |
| `cook` | Kitchen staff | Meal entries only |
| `cleaner` | Cleaning staff | Limited view |
| `security` | Security staff | Limited view |
| `helper` | General helper | Limited view |
| `member` | Boarding member | View own data, request changes via workflow |
| `guest` | Guest member | Limited view |
| `auditor` | Auditor | Read-only access to reports and ledger |

### 5.2 Permission Matrix

| Feature | owner | manager | accountant | bazar_manager | meal_manager | cook | member | guest | auditor |
|---------|-------|---------|------------|---------------|--------------|------|--------|-------|---------|
| Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (own) | ✅ (own) | ✅ |
| Meals (CRUD) | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Bazar (CRUD) | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Utilities (CRUD) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Deposits (View) | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ (own) | ❌ | ✅ |
| Credits (View) | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Payments (CRUD) | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Charges (View) | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ (own) | ❌ | ✅ |
| Ledger (View) | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ (own) | ❌ | ✅ |
| Rooms (CRUD) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Staff (CRUD) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Members (CRUD) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Reports | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Monthly Closing | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Admin Panel | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

> **Note:** Non-owner roles can submit change requests for approval instead of direct CRUD.

---

## 6. DATA FLOW & RELATIONSHIPS

### 6.1 Core Data Flow

```
Members
  ├── Room Assignment → Rooms
  ├── Bed Assignment → Beds
  ├── Service Subscriptions → Expense Allocations
  ├── Meal Entries → Meal Rate Calculation
  ├── Payments → Ledger Entries
  ├── Deposits → Ledger Entries
  └── Credits → Ledger Entries

Meals
  ├── Per member per day
  ├── Aggregated → Meal Rate
  └── Meal Rate → Member Meal Cost

Bazar
  ├── Per purchase entry
  └── Aggregated → Total Bazar Cost

Expenses (Unified)
  ├── Categories (16 types)
  ├── Allocation Methods (6 types)
  ├── Expense Allocations → Per-member shares
  └── Aggregated → Total Utility/Shared Cost

Staff
  ├── Salary, Advance, Overtime, Bonus
  ├── Staff Allocations → Per-member shares
  └── Aggregated → Total Staff Cost

Settlement Engine
  ├── Input: Members, Meals, Bazar, Expenses, Payments, Deposits, Credits, Staff, Rooms
  ├── Calculate: Meal Rate, Rent, Utility Share, Staff Share, Total Charges
  ├── Calculate: Total Contributions (Payments + Deposits + Credits)
  └── Output: Per-member Balance (Deposit if > 0, Credit if < 0)

Monthly Closing
  ├── Snapshot of all monthly data
  ├── Lock mechanism
  └── Rent Charge generation
```

### 6.2 Entity Relationship Summary

| Entity | Related To | Relationship |
|--------|-----------|--------------|
| Member | Room | Many-to-One (many members per room) |
| Member | Bed | Many-to-One (many members per bed over time) |
| Member | MealEntry | One-to-Many |
| Member | Payment | One-to-Many |
| Member | Deposit | One-to-Many |
| Member | Credit | One-to-Many |
| Member | LedgerEntry | One-to-Many |
| Member | ExpenseAllocation | One-to-Many |
| Member | StaffAllocation | One-to-Many |
| Member | RentCharge | One-to-Many |
| Member | ChangeRequest | One-to-Many (as requester) |
| Room | Bed | One-to-Many |
| Room | Member | One-to-Many (current assignment) |
| Expense | ExpenseAllocation | One-to-Many |
| Staff | StaffAllocation | One-to-Many |
| MealEntry | Member | Many-to-One |
| Bazar | Member (buyer) | Many-to-One |
| Payment | Member | Many-to-One |
| Deposit | Member | Many-to-One |
| Credit | Member | Many-to-One |
| LedgerEntry | Member | Many-to-One |
| MonthlyClosing | (snapshot) | Independent |
| ChangeRequest | User | Many-to-One (requester) |
| ActivityLog | User | Many-to-One (actor) |

---

## 7. INPUT/OUTPUT SUMMARY PER UI

| UI Page | Primary Inputs | Primary Outputs | Side Effects |
|---------|---------------|-----------------|--------------|
| Dashboard | (none – view only) | KPI cards, charts, member summaries | None |
| Meals | Member, date, meal counts | Meal table, monthly totals | Creates/updates `meals` doc, may create `change_request` |
| Bazar | Buyer, date, category, amount, notes | Bazar list, grand total | Creates/updates `bazar` doc, may create `change_request` |
| Utilities | Category, amount, date, paidBy, allocation method, status | Grouped expense list, category totals | Creates/updates `expenses` doc, auto-creates `expense_allocations` |
| Deposits | Month selector | Member deposit list, summary | None (read-only, computed) |
| Credits | Month selector | Member credit list, summary | None (read-only, computed) |
| Payments | Member, amount, method, date, status, reference | Payment list | Creates/updates `payments` doc, auto-creates `ledgers` doc, may create `change_request` |
| Charges | Month, member | Charge breakdown, settlement preview | None (read-only, computed) |
| Ledger | Month, member | Financial statement, transaction list | None (read-only, computed) |
| Rooms | Room form fields | Room list, occupancy map | Creates/updates/deletes `rooms` doc, may create `change_request` |
| Staff | Staff form fields | Staff list, payroll summary | Creates/updates/deletes `staff` doc, may create `change_request` |
| Members | Member form, service subscriptions | Member list, service toggles | Creates/updates/deletes `members` doc, may create `change_request` |
| Reports | Month, export action | Report table, PDF/Excel files | Generates downloadable files |
| Monthly Closing | Month, action buttons | Closing summary, status | Creates/updates `monthly_closing` doc, generates `rent_charges` |
| Admin | User form, approval actions | User list, request queue, activity log | Creates/updates `users`, `change_requests`, `activity_logs` |

---

## 8. CALCULATION ENGINES

| Engine | File | Purpose |
|--------|------|---------|
| `computeMonthly()` | [`src/lib/calc.ts`](src/lib/calc.ts) | Aggregates monthly data (meals, bazar, expenses, deposits, staff) into summary stats |
| `calculateAllSettlements()` | [`src/lib/calculations/engine.ts`](src/lib/calculations/engine.ts) | Full per-member settlement calculation (charges, contributions, balance) |
| `calculateMemberSettlement()` | [`src/lib/calculations/engine.ts`](src/lib/calculations/engine.ts) | Single member settlement |
| `calculateMonthlyClosing()` | [`src/lib/calculations/monthly-closing.ts`](src/lib/calculations/monthly-closing.ts) | Month-end closing data aggregation |
| `calculateMonthlyStatement()` | [`src/lib/calculations/ledger.ts`](src/lib/calculations/ledger.ts) | Per-member monthly ledger statement |
| `calculateMealRate()` | [`src/lib/calculations/meal.ts`](src/lib/calculations/meal.ts) | Meal rate calculation (total bazar + expenses / total meals) |
| `calculateRent()` | [`src/lib/calculations/rent.ts`](src/lib/calculations/rent.ts) | Rent charge calculation |
| `calculateUtility()` | [`src/lib/calculations/utility.ts`](src/lib/calculations/utility.ts) | Utility allocation calculation |
| `calculateSettlement()` | [`src/lib/calculations/settlement.ts`](src/lib/calculations/settlement.ts) | Settlement summary calculation |

---

## 9. WORKFLOW & APPROVAL SYSTEM

Non-owner roles cannot directly create/update/delete data. Instead, they submit **Change Requests** that go through an approval workflow:

1. **User submits request** → Creates document in `change_requests` collection
2. **Owner reviews** → Sees request in Admin panel (`/admin`)
3. **Owner approves/rejects** → If approved, `applyApprovedRequest()` executes the actual data change
4. **Audit trail** → All actions logged in `activity_logs`

**Change Request Types:**
- `create` – New document creation
- `update` – Document modification
- `delete` – Document deletion

**Collections with workflow support:**
- `meals`
- `bazar`
- `expenses`
- `payments`
- `rooms`
- `staff`
- `members`

---

## 10. AUTHENTICATION & SESSION

**File:** [`src/lib/auth-context.tsx`](src/lib/auth-context.tsx)

- Firebase Authentication (email/password)
- Extended user profile in `users` collection
- Role stored in user profile
- Session persisted via Firebase Auth
- Protected routes via `_authed` layout
- Auto-redirect to `/login` if unauthenticated

---

## 11. KEY BUSINESS RULES

1. **Meal Rate = (Total Bazar + Total Shared Expenses) / Total Meals**
2. **Member Balance = (Total Contributions + Payments + Credits + Deposits) - Total Charges**
3. **Deposit (Auto) = Positive Balance** → Member receives money from mess
4. **Credit (Auto) = Negative Balance** → Member owes money to mess
5. **Rent = Per-bed rent** (room monthlyRent / totalBeds)
6. **Service Subscription = Member only pays for services they are subscribed to**
7. **Monthly Closing = Locks the month, prevents further edits, generates rent charges**
8. **No manual deposit/credit creation** – these are auto-computed from settlement engine

---

## 12. FILE STRUCTURE REFERENCE

```
src/
├── components/
│   ├── app/
│   │   ├── AppShell.tsx          # Main layout + sidebar navigation
│   │   ├── PageHeader.tsx        # Reusable page header component
│   │   └── StatCard.tsx          # KPI stat card component
│   └── ui/                       # shadcn/ui components
├── lib/
│   ├── types.ts                  # All TypeScript interfaces & types
│   ├── data.ts                   # Firestore CRUD hooks & utilities
│   ├── auth-context.tsx          # Authentication context & RBAC
│   ├── calc.ts                   # Monthly aggregation calculations
│   ├── format.ts                 # Date/currency formatting
│   ├── workflow.ts               # Change request approval workflow
│   ├── duplicate-check.ts        # Duplicate reference validation
│   ├── export.ts                 # CSV export utility
│   ├── notifications.ts          # Notification helpers
│   ├── calculations/
│   │   ├── engine.ts             # Core settlement calculation engine
│   │   ├── meal.ts               # Meal rate calculation
│   │   ├── rent.ts               # Rent calculation
│   │   ├── utility.ts            # Utility allocation
│   │   ├── settlement.ts         # Settlement summary
│   │   ├── ledger.ts             # Monthly statement
│   │   └── monthly-closing.ts    # Month-end closing
│   └── hooks/
│       └── use-crud.ts           # Generic CRUD hook
├── routes/
│   ├── _authed.tsx               # Authenticated layout wrapper
│   ├── _authed/
│   │   ├── dashboard.tsx         # Dashboard page
│   │   ├── meals.tsx             # Meals page
│   │   ├── bazar.tsx             # Bazar page
│   │   ├── utilities.tsx         # Utilities/Expenses page
│   │   ├── deposits.tsx          # Deposits page
│   │   ├── credits.tsx           # Credits page
│   │   ├── payments.tsx          # Payments page
│   │   ├── charges.tsx           # Charges page
│   │   ├── ledger.tsx            # Ledger page
│   │   ├── rooms.tsx             # Rooms & Beds page
│   │   ├── staff.tsx             # Staff page
│   │   ├── members.tsx           # Members page
│   │   ├── reports.tsx           # Reports page
│   │   ├── monthly-closing.tsx   # Monthly Closing page
│   │   └── admin.tsx             # Admin/Users page
│   ├── login.tsx                 # Login page
│   └── signup.tsx                # Signup page
└── router.tsx                    # TanStack Router configuration
```

---

## 13. SUMMARY: WHO DOES WHAT

| Actor | Responsibilities |
|-------|-----------------|
| **Owner** | Full system control: user management, approval workflow, all CRUD operations, monthly closing, reports |
| **Manager** | Day-to-day operations: members, rooms, staff, meals, bazar, utilities, payments, ledger, reports |
| **Accountant** | Financial operations: payments, deposits, credits, ledger, reports |
| **Bazar Manager** | Bazar entries, meal entries |
| **Meal Manager** | Meal entries |
| **Cook** | Meal entries only |
| **Member** | View own dashboard, meals, ledger, deposits, credits; request changes via workflow |
| **Guest** | Limited view access |
| **Auditor** | Read-only access to reports, ledger, dashboard |

---

*Document generated from source code analysis of MessHub ERP v1.0*
