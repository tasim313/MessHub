# COMPLETE AUDIT REPORT - MessHub ERP

## CRITICAL BUGS FOUND

### BUG 1: Service Subscription Ignored in calc.ts ⚠️
**File:** `src/lib/calc.ts` (Lines 82-83)
```typescript
const utilityPerMember = totalUtilities / activeMembers.length;
const staffCostPerMember = totalStaffCost / activeMembers.length;
```
**Issue:** Splits utilities and staff costs equally among ALL active members. Ignores service subscriptions (e.g. internet bill shared with 5 people even if only 3 subscribed).
**Fix:** Must filter by subscribed members per service.

### BUG 2: Room-Based Rent Not Used in calc.ts ⚠️
**File:** `src/lib/calc.ts` (Line 98)
```typescript
rentShare = m.monthlyRent || 0;
```
**Issue:** Uses member's monthlyRent field instead of per-bed room rent (Room Rent ÷ Beds).
**Fix:** Must look up room and calculate per-bed rent.

### BUG 3: Duplicate Type Definitions ⚠️
**Files:** `src/lib/data.ts` vs `src/lib/types.ts`
**Issue:** 50% of types are duplicated with incompatible shapes (string vs enum). Causes compilation errors.
**Fix:** Consolidate to single source of truth in `types.ts`.

### BUG 4: Forward Reference in charges.tsx ⚠️
**File:** `src/routes/_authed/charges.tsx`
**Issue:** `onAmountChange` is used in JSX render before function definition. 
**Fix:** Move the function definition above the JSX return.

### BUG 5: Incomplete Monthly Closing ⚠️
**File:** `src/lib/calculations/monthly-closing.ts`
**Issue:** `totalMeal: totalBazar` - double counts bazar. Should use meal charges from ledgers.
**Fix:** Accept mealCost from ledger charges

### BUG 6: No Operation Idempotency ⚠️
**Issue:** Cloud Function `generateMonthlyBills` and charges page can create duplicate records on repeated execution.
**Fix:** Add idempotency checks (check if month already processed, check if same entry exists).

### BUG 7: Calculations in UI Components ⚠️
**Issue:** Dashboard.tsx computes utility trends, service usage, and occupancy directly in the component instead of using calculation engines.
**Fix:** Move to calc.ts or calculation engines.

## FIX ALL ISSUES