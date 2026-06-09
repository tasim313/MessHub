# MessHub ERP - Database Relationships & Feature Documentation

## Overview

MessHub ERP is a comprehensive mess management system for Bangladeshi bachelor messes, shared flats, and boarding houses. This document provides a complete guide to database relationships, table purposes, and feature mappings.

---

## Database Schema

### Core Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              USERS COLLECTION                                    │
├─────────────────────────────────────────────────────────────────────────────────┤
│  (Authentication & Authorization)                                                  │
│  uid (PK) ──────────────┐                                                        │
│  email                  │                                                            │
│  name                   │                                                            │
│  role                   │                                                            │
│  status                 │                                                            │
└─────────────────────────┼──────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                             MEMBERS COLLECTION                                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│  id (PK) ───────────────┐                                                       │
│  uid (FK → users)       │                                                       │
│  name                   │                                                       │
│  email                  │                                                       │
│  phone                  │                                                       │
│  roomId (FK → rooms) ────┼───────────────────────────────────────────────────────┤
│  roomName               │                                                       │
│  bedNo                  │                                                       │
│  services (array)       │                                                       │
│  previousDue            │                                                       │
│  depositAmount          │                                                       │
└─────────────────────────┼──────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                             ROOMS COLLECTION                                     │
├─────────────────────────────────────────────────────────────────────────────────┤
│  id (PK) ────────────────┐                                                      │
│  buildingName           │                                                      │
│  floorName              │                                                      │
│  roomNo                 │                                                      │
│  roomType               │                                                      │
│  totalBeds              │                                                      │
│  monthlyRent            │                                                      │
│  status                 │                                                      │
└─────────────────────────┼──────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                             BEDS COLLECTION                                      │
├─────────────────────────────────────────────────────────────────────────────────┤
│  id (PK)                                                                         │
│  roomId (FK → rooms)                                                              │
│  roomNo                                                                            │
│  bedNo                                                                             │
│  status                                                                              │
│  assignedMemberId (FK → members)                                                   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Table Relationships

### 1. **users** → **members** (One-to-One)
- **users.uid** → **members.uid**
- **Purpose**: Authentication and profile management
- **Why Used**: Firebase Authentication handles user login, while `members` collection stores mess-specific member data
- **Features**: Login, signup, role-based access control, user status management

### 2. **members** → **rooms** (Many-to-One)
- **members.roomId** → **rooms.id**
- **Purpose**: Room assignment tracking
- **Why Used**: Each member occupies one room; rooms can have multiple members (beds)
- **Features**: Room allocation, rent calculation, occupancy tracking

### 3. **rooms** → **beds** (One-to-Many)
- **beds.roomId** → **rooms.id**
- **Purpose**: Bed-level occupancy management
- **Why Used**: Rooms can have multiple beds; each bed tracks individual member assignment
- **Features**: Bed allocation, vacancy tracking, member transfer

### 4. **members** → **meals** (One-to-Many)
- **meals.memberId** → **members.id**
- **Purpose**: Daily meal logging
- **Why Used**: Each meal entry is recorded per member
- **Features**: Meal tracking, meal rate calculation, daily consumption

### 5. **members** → **bazar** (One-to-Many)
- **bazar.buyerId** → **members.id**
- **Purpose**: Bazar purchase tracking
- **Why Used**: Members buy groceries on behalf of the mess
- **Features**: Bazar entry, expense tracking, contribution calculation

### 6. **members** → **deposits** (One-to-Many)
- **deposits.memberId** → **members.id**
- **Purpose**: Member deposit tracking
- **Why Used**: Members deposit money (advance payments)
- **Features**: Deposit management, balance tracking

### 7. **members** → **credits** (One-to-Many)
- **credits.memberId** → **members.id**
- **Purpose**: Member credit tracking (what they owe)
- **Why Used**: Members receive credit when they spend more than their share
- **Features**: Credit management, due tracking

### 8. **members** → **payments** (One-to-Many)
- **payments.memberId** → **members.id**
- **Purpose**: Payment collection tracking
- **Why Used**: Members make payments to settle dues
- **Features**: Payment collection, due settlement, payment history

### 9. **members** → **expenses** (One-to-Many via ExpenseAllocation)
- **expenses** → **expense_allocations.memberId** → **members.id**
- **Purpose**: Shared expense distribution
- **Why Used**: Expenses are split among members based on service subscriptions
- **Features**: Utility bill allocation, shared cost distribution

### 10. **members** → **staff_allocations** (One-to-Many)
- **staff_allocations.memberId** → **members.id**
- **Purpose**: Staff cost distribution
- **Why Used**: Staff salaries are shared among members
- **Features**: Staff cost allocation, salary distribution

---

## Table Purposes & Features

### Core Tables

| Table | Purpose | Key Features | Used By |
|-------|---------|--------------|---------|
| **users** | Authentication & user management | Login, role management, status control | All users |
| **members** | Member profile & room assignment | Profile management, room/bed assignment, service subscriptions | All users |
| **rooms** | Room inventory & rent management | Room types, rent rates, occupancy status | Owner, Manager |
| **beds** | Bed-level allocation tracking | Bed status, member assignment | Owner, Manager |

### Financial Tables

| Table | Purpose | Key Features | Used By |
|-------|---------|--------------|---------|
| **meals** | Daily meal logging | Breakfast, lunch, dinner, guest meals | All users |
| **bazar** | Grocery purchase tracking | Itemized purchases, categories, vendor tracking | Bazar Manager, Member |
| **expenses** | Shared expense management | All utility bills, maintenance, staff costs | Accountant, Manager |
| **expense_allocations** | Per-member expense split | Individual share calculation, payment tracking | Accountant, Manager |
| **deposits** | Member advance payments | Payment methods, reference tracking | All users |
| **credits** | Member dues tracking | Reason, amount, date | All users |
| **payments** | Payment collections | Multiple payment methods, status tracking | All users |
| **rent_charges** | Monthly rent charges | Per-member rent, status tracking | Accountant, Manager |

### Staff Tables

| Table | Purpose | Key Features | Used By |
|-------|---------|--------------|---------|
| **staff** | Staff information | Role, salary, attendance, status | Manager, Accountant |
| **staff_allocations** | Staff cost distribution | Per-member staff cost share | Accountant, Manager |

### System Tables

| Table | Purpose | Key Features | Used By |
|-------|---------|--------------|---------|
| **ledgers** | Transaction history | Double-entry accounting, balance tracking | Accountant, Auditor |
| **monthly_closing** | Month-end settlements | Carry forward, final balances | Manager, Owner |
| **reports** | Generated reports | PDF export, financial summaries | All users |
| **notifications** | System alerts | Real-time updates, status changes | All users |
| **settings** | System configuration | Mess settings, preferences | Owner |
| **activity_logs** | Audit trail | User actions, changes tracking | Owner, Auditor |
| **change_requests** | Approval workflow | Pending/approved/rejected requests | Manager, Owner |

---

## Role-Based Access Control

### User Roles & Permissions

| Role | Can View | Can Create | Can Update | Can Delete | Special Access |
|------|----------|------------|------------|------------|----------------|
| **owner** | All | All | All | All | Full system access |
| **manager** | All | All | All (own) | All (own) | Member management |
| **accountant** | Financial data | Financial data | Financial data | No | Financial reports |
| **bazar_manager** | Bazar, Meals | Bazar, Meals | Bazar, Meals | Bazar, Meals | Bazar management |
| **meal_manager** | Meals, Bazar | Meals, Bazar | Meals, Bazar | Meals, Bazar | Meal management |
| **cook** | Meals | No | No | No | View meal entries |
| **cleaner** | No | No | No | No | Staff profile only |
| **security** | No | No | No | No | Staff profile only |
| **helper** | No | No | No | No | Staff profile only |
| **member** | Own data, Meals, Bazar | Own data, Meals, Bazar | Own data, Meals, Bazar | Own data, Meals, Bazar | Personal dashboard |
| **guest** | Limited | Limited | Limited | No | Guest access |
| **auditor** | All (read-only) | No | No | No | Audit reports |

---

## Feature-to-Table Mapping

### 1. **Dashboard Features**
| Feature | Tables Used | Description |
|---------|-------------|-------------|
| Cash Balance | deposits, expenses, payments | Total deposits minus total expenses |
| Total Meals | meals | Count of all meals for current month |
| Meal Rate | bazar, meals | Total bazar / total meals |
| Active Members | members | Count of active members |
| Vacant Beds | rooms, beds, members | Total beds - occupied beds |
| Total Due | expense_allocations, credits | Sum of all pending dues |
| Utility Costs | expenses (utility categories) | Sum of all utility expenses |
| Staff Cost | staff, staff_allocations | Total staff salary distribution |

### 2. **Meal Management**
| Feature | Tables Used | Description |
|---------|-------------|-------------|
| Daily Meal Entry | meals | Record breakfast, lunch, dinner, guest meals |
| Meal Rate Calculation | bazar, meals | `Total Bazar / Total Meals` |
| Monthly Meal Tracking | meals | Filter by ym (YYYY-MM) |
| Meal Status | members.mealStatus | Active, hold, cancelled |

### 3. **Bazar Management**
| Feature | Tables Used | Description |
|---------|-------------|-------------|
| Purchase Entry | bazar | Record grocery purchases |
| Bazar Categories | bazar.category | rice, vegetables, meat, fish, etc. |
| Bazar Contribution | bazar | Used in settlement calculation |

### 4. **Room & Bed Management**
| Feature | Tables Used | Description |
|---------|-------------|-------------|
| Room Assignment | members.roomId, rooms | Link member to room |
| Bed Allocation | beds.assignedMemberId | Track which member uses which bed |
| Rent Calculation | rooms.monthlyRent, members.roomId | Per-bed rent = room rent / total beds |
| Occupancy Tracking | rooms, beds, members | Real-time vacancy status |

### 5. **Financial Settlement**
| Feature | Tables Used | Description |
|---------|-------------|-------------|
| Monthly Closing | monthly_closing, all financial tables | Month-end settlement generation |
| Carry Forward | monthly_closing | Previous month's deposit/credit to next month |
| Balance Calculation | deposits, credits, payments, expenses | Net balance = contributions - charges |

### 6. **Payment Management**
| Feature | Tables Used | Description |
|---------|-------------|-------------|
| Payment Collection | payments | Record member payments |
| Payment Methods | payments.method | cash, bkash, nagad, rocket, bank |
| Due Settlement | payments, credits | Settle outstanding credits |

---

## Financial Calculation Logic

### Core Formula (from `engine.ts`)

```
Total Contributions = Bazar Paid + Expense Contributions + Payments Made
Total Charges = Meal Cost + Rent Share + Utility Shares + Staff Share + Previous Credit - Previous Deposit
Net Balance = Total Contributions - Total Charges

If Net Balance > 0 → Deposit (member overpaid)
If Net Balance < 0 → Credit (member owes money)
If Net Balance = 0 → Settled
```

### Meal Rate Calculation
```
Meal Rate = Total Bazar Amount / Total Meals
Meal Cost = Total Meals × Meal Rate
```

### Rent Share Calculation
```
Per-Bed Rent = Room Monthly Rent / Total Beds in Room
```

### Utility Share Calculation
```
For each expense:
  - Determine service type (electricity, water, etc.)
  - Count subscribers (members with service enabled)
  - Member Share = Expense Amount / Number of Subscribers
```

### Staff Share Calculation
```
For each active staff:
  - Determine service type (cooking_staff, cleaning_staff, etc.)
  - Count subscribers
  - Member Share = Staff Salary / Number of Subscribers
```

---

## Service Subscription System

### Service Types & Their Purpose

| Service Type | Expense Categories | Purpose |
|--------------|-------------------|---------|
| **rent** | house_rent | Room rent allocation |
| **meals** | (implicit) | Meal cost calculation |
| **electricity** | electricity | Electricity bill sharing |
| **water** | water | Water bill sharing |
| **gas** | gas | Gas bill sharing |
| **internet** | internet, wifi_equipment | Internet/WiFi cost sharing |
| **generator** | generator | Generator fuel/maintenance |
| **cleaning_staff** | cleaner_salary | Cleaner salary sharing |
| **security_staff** | security_salary | Security guard salary sharing |
| **cooking_staff** | (implicit) | Cook salary (if applicable) |
| **laundry** | other_shared | Laundry service |
| **parking** | other_shared | Parking fee |
| **maintenance** | maintenance, repair | Maintenance costs |
| **other_services** | kitchen, furniture, appliance, other_shared | Miscellaneous shared costs |

---

## Data Flow Diagram

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Member    │────▶│    Meals    │────▶│ Meal Rate   │
│             │     │             │     │ Calculation │
└─────────────┘     └─────────────┘     └─────────────┘
       │                                       │
       ▼                                       ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Bazar     │────▶│  Expenses   │────▶│ Settlement  │
│             │     │             │     │ Engine      │
└─────────────┘     └─────────────┘     └─────────────┘
       │                                       │
       ▼                                       ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Staff      │────▶│  Payments   │◀───▶│  Deposits   │
│             │     │             │     │             │
└─────────────┘     └─────────────┘     └─────────────┘
       │                                       │
       ▼                                       ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Rooms      │     │  Credits    │     │ Monthly     │
│             │     │             │     │ Closing     │
└─────────────┘     └─────────────┘     └─────────────┘
```

---

## Month-End Closing Process

### Step 1: Calculate Meal Rate
- Sum all bazar entries for the month
- Sum all meal entries for the month
- Calculate: `Meal Rate = Total Bazar / Total Meals`

### Step 2: Calculate Member Charges
For each active member:
1. **Meal Cost** = Total Meals × Meal Rate
2. **Rent Share** = Room Rent / Total Beds
3. **Utility Shares** = Sum of subscribed utility shares
4. **Staff Share** = Sum of subscribed staff salary shares
5. **Previous Due** = Member's previousDue field
6. **Previous Credit** = From previous month's closing
7. **Previous Deposit** = From previous month's closing

### Step 3: Calculate Member Contributions
For each member:
1. **Bazar Contribution** = Sum of bazar entries where member is buyer
2. **Expense Contributions** = Sum of expenses paid by member
3. **Payments Made** = Sum of payments made by member

### Step 4: Generate Settlement
- **Net Balance** = Total Contributions - Total Charges
- **If positive**: Member receives money (deposit)
- **If negative**: Member owes money (credit)

### Step 5: Carry Forward
- Previous month's deposit/credit carried to next month
- Stored in `monthly_closing` collection

---

## Key Business Rules

1. **A member can NEVER have both Deposit > 0 AND Credit > 0 simultaneously**
2. **Payments made directly to the mess ARE contributions**
3. **No manual Deposit or Credit creation - auto-computed from settlement**
4. **Service subscriptions determine utility/staff cost sharing**
5. **Room-based rent: Each bed pays equal share of room rent**
6. **Meal rate is auto-calculated from bazar and meals**

---

## Collection Names in Firestore

| Collection | Purpose |
|------------|---------|
| `users` | User authentication profiles |
| `members` | Member information |
| `rooms` | Room inventory |
| `beds` | Bed allocation |
| `meals` | Daily meal entries |
| `bazar` | Grocery purchases |
| `expenses` | Shared expenses (unified) |
| `expense_allocations` | Per-member expense splits |
| `deposits` | Member deposits |
| `credits` | Member credits (dues) |
| `payments` | Payment collections |
| `staff` | Staff information |
| `staff_allocations` | Staff cost distribution |
| `rent_charges` | Monthly rent charges |
| `ledgers` | Transaction history |
| `monthly_closing` | Month-end settlements |
| `reports` | Generated reports |
| `notifications` | System notifications |
| `settings` | System settings |
| `activity_logs` | Audit trail |
| `change_requests` | Approval requests |
| `meta` | System metadata (owner info) |

---

## Index

- [Core Entity Relationship Diagram](#core-entity-relationship-diagram)
- [Table Relationships](#table-relationships)
- [Table Purposes & Features](#table-purposes--features)
- [Role-Based Access Control](#role-based-access-control)
- [Feature-to-Table Mapping](#feature-to-table-mapping)
- [Financial Calculation Logic](#financial-calculation-logic)
- [Service Subscription System](#service-subscription-system)
- [Data Flow Diagram](#data-flow-diagram)
- [Month-End Closing Process](#month-end-closing-process)
- [Key Business Rules](#key-business-rules)
- [Collection Names in Firestore](#collection-names-in-firestore)