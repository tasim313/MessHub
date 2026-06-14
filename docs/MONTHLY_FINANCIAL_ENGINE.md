# Monthly Financial Engine

## Overview

The Monthly Financial Engine is the core accounting system that automatically generates all financial records from raw business transactions. Users only enter real business transactions; the system automatically creates all internal accounting records.

## Architecture

### Data Sources (Input)

For a selected month (e.g., June 2026), the system reads from:

| Collection | Description |
|------------|-------------|
| `expenses` | Shared expenses (Internet, Electricity, Rent, etc.) |
| `bazar` | Bazar purchases made by members |
| `meals` | Meal entries (breakfast, lunch, dinner, guest) |
| `members` | Active member list |
| `rooms` | Room assignments and rent |
| `staff` | Staff salaries |
| `payments` | Member payments |
| `advances` | Existing advance records |
| `advance_recoveries` | Existing recovery records |
| `monthly_closing` | Previous month closing data |

### Automatic Generation (Output)

The system automatically generates:

| Collection | Description |
|------------|-------------|
| `ledgers` | All transaction entries (charges, payments, advances, recoveries) |
| `expense_allocations` | Per-member expense share tracking |
| `rent_charges` | Per-member rent charges |
| `payments` | Internal payments for payer's own share |
| `advances` | Advance records for excess payments |
| `advance_recoveries` | Recovery records when other members pay |

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    MONTHLY FINANCIAL ENGINE                       │
└─────────────────────────────────────────────────────────────────┘

INPUT: Raw Business Transactions
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│   EXPENSE    │  │    BAZAR     │  │    MEALS     │
│ (Internet    │  │ (Member buys  │  │ (Member eats)│
│  Bill)       │  │  groceries)  │  │              │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       │                 │                 │
       ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                    AUTOMATIC GENERATION                           │
└─────────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 1: Generate Member Charges                                   │
│                                                                   │
│  Expense → Calculate shares → Create ledger charges                 │
│  (Each member gets a charge entry)                                │
└─────────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 2: Internal Payment (if payer exists)                        │
│                                                                   │
│  Payer's share is auto-paid → Creates payment + ledger entry      │
│  (Prevents double-charging the payer)                             │
└─────────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 3: Advance Creation (if excess)                              │
│                                                                   │
│  Expense - Payer's share = Advance                                │
│  (Mess owes this money to the payer)                              │
└─────────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 4: Payment Processing (when member pays)                     │
│                                                                   │
│  Payment → Recover advances (FIFO) → Pay charges → Deposit excess   │
└─────────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────────┐
│                    OUTPUT: Complete Ledger                         │
└─────────────────────────────────────────────────────────────────┘
```

## Example Scenarios

### Scenario 1: Internet Bill

**Input:**
- Internet Bill: 1000 Tk
- Paid by: Member A
- 5 Members total

**Automatic Generation:**

| Step | Action | Amount | Member |
|------|--------|--------|--------|
| 1 | Charge created | 200 Tk | Each of 5 members |
| 2 | Internal payment | 200 Tk | Member A (own share) |
| 3 | Advance created | 800 Tk | Member A (excess) |

**Result:**
- Member A: Paid 1000, 200 auto-paid, 800 advance
- Other 4 members: Each owe 200 Tk

### Scenario 2: Member B Pays 200 Tk

**Input:**
- Member B pays: 200 Tk

**Automatic Processing:**

| Step | Action | Amount |
|------|--------|--------|
| 1 | Recover advance | 200 Tk (from Member A's advance) |
| 2 | Pay charges | 0 Tk (advance fully covered) |

**Result:**
- Member A's advance: 800 → 600 Tk remaining
- Member B: Payment recorded, advance recovery created

### Scenario 3: Meal Charges

**Input:**
- Bazar total: 15000 Tk
- Total meals: 300
- Member A meals: 60

**Automatic Generation:**

| Step | Action | Amount |
|------|--------|--------|
| 1 | Meal rate | 15000/300 = 50 Tk/meal |
| 2 | Member A meal cost | 60 × 50 = 3000 Tk |
| 3 | Charge created | 3000 Tk |

**Result:**
- Member A: 3000 Tk meal charge
- Bazar contribution: Already recorded as payment

## API Functions

### `generateMonthlyFinancials(ym, uid?)`

Main entry point for generating all financial records for a month.

```typescript
const result = await generateMonthlyFinancials("2026-06", "user123");
// Returns:
// {
//   ym: "2026-06",
//   chargesGenerated: 15,
//   internalPaymentsGenerated: 2,
//   advancesCreated: 2,
//   advancesRecovered: 0,
//   ledgerEntriesCreated: 19,
//   totalCharges: 15000,
//   totalInternalPayments: 2000,
//   totalAdvances: 800,
//   totalRecoveries: 0,
//   reconciliation: { balanced: true, errors: [] }
// }
```

### `recordPaymentWithAdvanceRecovery(memberId, memberName, amount, method, date, ym, category?, notes?, referenceId?, uid?)`

Records a payment and automatically processes advance recovery.

```typescript
const result = await recordPaymentWithAdvanceRecovery(
  "m2",
  "Member B",
  300,
  "cash",
  "2026-06-20",
  "2026-06"
);
// Returns:
// {
//   paymentId: "p123",
//   paymentAmount: 300,
//   advanceRecoveryAmount: 200,
//   chargePaymentAmount: 100,
//   remainingAmount: 0,
//   recoveries: [{ advanceId: "a1", amount: 200, advanceOwnerId: "m1" }]
// }
```

### `createExpenseWithAccounting(expenseData, members, rooms, staff, uid?)`

Creates an expense with full accounting treatment.

```typescript
const result = await createExpenseWithAccounting(
  {
    category: "internet",
    amount: 1000,
    date: "2026-06-15",
    paidBy: "m1",
    paidByName: "Member A"
  },
  members,
  rooms,
  staff,
  "user123"
);
// Returns:
// {
//   expenseId: "e123",
//   allocationsCount: 5,
//   internalPaymentRecorded: true,
//   advanceCreated: true
// }
```

## Reconciliation Rules

### Total Charges
```
Total Charges = Sum of all member charges
              = Meal Cost + Rent Share + Utility Shares + Staff Share
```

### Total Advances
```
Total Advances = Total External Payments - Total Internal Payments
```

### Total Recoveries
```
Total Recoveries = Sum of all advance recovery transactions
```

### Member Ledger Balance
```
Balance = Charges - Payments - Deposits - Credits
```

### Validation
- No member can have both Deposit > 0 AND Credit > 0 simultaneously
- All generated records must reference their source document
- No duplicate records (checked by sourceId + memberId + ym)

## Regeneration Triggers

The system automatically regenerates when:

1. **Shared Expense Added/Updated**
   - Re-generates charges for that expense
   - Updates internal payments and advances

2. **Bazar Entry Added**
   - Updates meal rate
   - Re-generates meal charges

3. **Rent Changes**
   - Re-generates rent charges for affected members

4. **Meals Change**
   - Re-generates meal charges

5. **Payment Added**
   - Processes advance recovery
   - Updates ledger

6. **Member Added/Removed**
   - Re-generates all charges for the month

7. **Distribution Rules Change**
   - Re-generates affected charges

## File Structure

```
src/lib/
├── calculations/
│   ├── monthly-engine.ts      # Main generation engine
│   ├── engine-v2.ts           # Core calculation functions
│   ├── auto-generator.ts      # Legacy auto-generator
│   └── ledger.ts              # Ledger calculations
├── services/
│   ├── advance-service.ts     # Advance management
│   ├── charge-service.ts      # Charge generation
│   └── payment-service.ts     # Payment processing
└── hooks/
    └── use-monthly-generation.ts  # React hook for UI
```

## Best Practices

1. **Always use the automatic functions** - Never manually create charges, payments, or advances
2. **Check for existing records** - The system is idempotent and won't create duplicates
3. **Verify reconciliation** - Check the `reconciliation.balanced` flag after generation
4. **Use source references** - All generated records link back to their source
5. **Test with small data** - Verify calculations with simple test cases first