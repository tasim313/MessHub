# MessHub Automatic Billing System - Complete Guide

## How Member Charges Are Automatically Calculated

### 1. RENT (Per Member)

**Setup:**
- Go to **Members** page
- Edit a member → Set **"Monthly Rent"** field (e.g., ৳3,500)
- Ensure the member's **"Rent"** service subscription is **enabled**

**Automatic Process:**
- On every 1st of the month (Cloud Function `generateMonthlyBills`):
  - Creates a `rent_charges` document for each active member
  - Amount = member's `monthlyRent` value
  - Status = "pending"

**Manual Trigger:**
- Owner/Manager can go to Firebase Console or call the `triggerMonthlyBills` function

---

### 2. UTILITY COSTS (Electricity, Internet, Gas, Water, etc.)

**Setup:**
1. Go to **Members** page → Edit a member
2. In **Service Subscriptions**, enable the services they subscribe to:
   - ☑ Internet
   - ☑ Electricity
   - ☑ Gas
   - ☑ Water
   - ☑ Generator
   - ☑ Maintenance

3. Go to **Utilities** page → Add utility bill (e.g., Internet = ৳1,000)

**Automatic Distribution:**
- System checks which members have the service **enabled**
- Only **subscribed members** share the cost
- Example: Internet = ৳1,000, Only 5 members subscribed
  - Each subscribed member pays: ৳1,000 ÷ 5 = ৳200
  - Non-subscribed members pay: ৳0

**Distribution Methods (in calculation engine):**
| Method | Description |
|--------|-------------|
| Equal | Split equally among all subscribed members |
| Per Room | Split by room count |
| Fixed | Each subscribed member pays a fixed amount |
| Custom % | Each member pays a custom percentage |

---

### 3. STAFF COSTS (Cook, Cleaner, Security, etc.)

**Setup:**
1. Go to **Staff** page → Add staff (e.g., Cook with salary ৳1,500)
2. Go to **Members** page → Edit a member
3. In **Service Subscriptions**, enable:
   - ☑ **Cooking Staff** (to share cook's salary)
   - ☑ **Cleaning Staff** (to share cleaner's salary)
   - ☑ **Security Staff** (to share security's salary)

**Automatic Distribution:**
- System maps each staff role to a service type:
  | Staff Role | Service Type |
  |------------|--------------|
  | Cook | Cooking Staff |
  | Cleaner | Cleaning Staff |
  | Security | Security Staff |
  | Helper | Other Services |

- Only members who **enabled** the matching service share the salary
- Example: Cook salary = ৳1,500, Only 2 members subscribed
  - Each pays: ৳1,500 ÷ 2 = ৳750

---

### 4. MEAL COSTS (Bazar)

**Setup:**
- Members log meals via **Meals** page
- Bazar entries are added via **Bazar** page

**Automatic Calculation:**
- **Meal Rate** = Total Bazar Cost ÷ Total Meals
- **Member's Meal Cost** = Member's Meals × Meal Rate

**Example:**
- Total Bazar this month = ৳30,000
- Total Meals this month = 500
- Meal Rate = ৳30,000 ÷ 500 = ৳60 per meal
- Member A ate 90 meals → Meal Cost = 90 × ৳60 = ৳5,400

---

### 5. MONTHLY STATEMENT (Auto-Generated)

Every member gets an automatic monthly statement:

| Item | Amount | Source |
|------|--------|--------|
| Opening Balance | ৳0 | Previous month carryover |
| + Rent Charge | ৳3,500 | Monthly rent amount |
| + Meal Cost | ৳5,400 | Meals × Meal Rate |
| + Utility Cost | ৳200 | Subscribed utilities |
| + Staff Cost | ৳750 | Subscribed staff services |
| + Other Charges | ৳0 | Manual adjustments |
| = Total Charges | ৳9,850 | |
| - Deposits | ৳5,000 | Member's deposits |
| - Credits | ৳0 | Discounts/adjustments |
| = Current Due | ৳4,850 | Amount to pay |

---

### 6. WHERE TO VIEW

| Page | What You See |
|------|-------------|
| **Ledger** (`/ledger`) | Per-member monthly financial statement with all charges |
| **Dashboard** (`/dashboard`) | Owner: All member balances. Member: Personal summary |
| **Monthly Closing** (`/monthly-closing`) | Complete financial summary of the mess |
| **Reports** (`/reports`) | Exportable Excel/PDF reports with full breakdown |

---

### 7. SERVICE SUBSCRIPTION SYSTEM

Each member has individual service toggles:

| Service | Controls Charge For |
|---------|-------------------|
| Rent | Monthly rent charge |
| Meals | Meal cost calculation |
| Internet | Internet bill distribution |
| Electricity | Electricity bill distribution |
| Gas | Gas bill distribution |
| Water | Water bill distribution |
| Cooking Staff | Cook salary distribution |
| Cleaning Staff | Cleaner salary distribution |
| Security Staff | Security salary distribution |
| Laundry | Laundry service charges |
| Parking | Parking charges |
| Generator | Generator fuel/maintenance |
| Maintenance | Maintenance costs |

**How to configure:** Members page → Edit member → Service Subscriptions section

---

### SUMMARY: Complete Data Flow

```
Member Setup
  ├── Set Monthly Rent (e.g., ৳3,500)
  ├── Enable Service Subscriptions (Rent ✓, Meals ✓, Internet ✓, Cooking Staff ✓)
  └── Log Meals daily

Staff Setup
  └── Add staff with salary (e.g., Cook ৳15,000)

Utility Setup
  └── Add bill (e.g., Internet ৳1,000)

Bazar Setup
  └── Add bazar entries (drives meal rate)

──[1st of Month: Cloud Function]──

Auto-Generate:
  ├── Rent Charges → rent_charges collection
  ├── Staff Allocations → staff_allocations collection (subscribed only)
  └── Utility Allocations → utility_allocations collection (subscribed only)

──[Real-time Calculation]──

Compute Monthly:
  ├── Meal Rate = Total Bazar ÷ Total Meals
  ├── Member Meal Cost = Member Meals × Meal Rate
  ├── Member Rent = monthlyRent
  ├── Member Utility = sum of subscribed utility shares
  ├── Member Staff = sum of subscribed staff shares
  ├── Total Charges = Rent + Meal + Utility + Staff
  └── Current Due = Total Charges - Deposits - Credits - Payments