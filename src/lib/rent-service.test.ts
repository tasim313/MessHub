import { describe, it, expect } from "vitest";
import { proratedRentForMonth } from "./rent-service";

describe("proratedRentForMonth", () => {
  it("always charges the full amount under the full_month policy, even on a boundary month", () => {
    expect(proratedRentForMonth(5000, "2026-06", "full_month", "2026-06-15", null, true, false)).toBe(5000);
  });

  it("charges the full amount for a month that isn't a join or leave boundary", () => {
    expect(proratedRentForMonth(5000, "2026-07", "by_days", "2026-06-15", null, false, false)).toBe(5000);
  });

  it("prorates the join month by days stayed (June has 30 days, joined on the 15th → 16 days stayed)", () => {
    // June 15 through June 30 inclusive = 16 days.
    const result = proratedRentForMonth(5000, "2026-06", "by_days", "2026-06-15", null, true, false);
    expect(result).toBeCloseTo((5000 * 16) / 30, 2);
  });

  it("prorates the leaving month by days stayed (left on the 21st of a 31-day month)", () => {
    const result = proratedRentForMonth(5000, "2026-08", "by_days", null, "2026-08-21", false, true);
    expect(result).toBeCloseTo((5000 * 21) / 31, 2);
  });

  it("prorates a single month where the member both joined and left", () => {
    // Joined Aug 5, left Aug 12 → 8 days stayed (5,6,7,8,9,10,11,12).
    const result = proratedRentForMonth(3100, "2026-08", "by_days", "2026-08-05", "2026-08-12", true, true);
    expect(result).toBeCloseTo((3100 * 8) / 31, 2);
  });

  it("charges the full month when joining on the 1st (stayed the whole month)", () => {
    const result = proratedRentForMonth(5000, "2026-06", "by_days", "2026-06-01", null, true, false);
    expect(result).toBe(5000);
  });

  it("never returns a negative or over-100% amount for a malformed date pairing", () => {
    // Leaving date earlier in the month than joining date within the same month.
    const result = proratedRentForMonth(3000, "2026-08", "by_days", "2026-08-20", "2026-08-05", true, true);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(3000);
  });
});
