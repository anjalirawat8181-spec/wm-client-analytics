import { describe, expect, it } from "vitest";
import { formatInt, formatMonth, formatPct, formatRupees, formatRupeesShort, groupIndian } from "./format";

describe("groupIndian", () => {
  it("groups in lakhs and crores", () => {
    expect(groupIndian(0)).toBe("0");
    expect(groupIndian(999)).toBe("999");
    expect(groupIndian(1000)).toBe("1,000");
    expect(groupIndian(100000)).toBe("1,00,000");
    expect(groupIndian(1234567)).toBe("12,34,567");
    expect(groupIndian(123456789)).toBe("12,34,56,789");
    expect(groupIndian(-1234567)).toBe("-12,34,567");
  });
});

describe("formatRupees", () => {
  it("uses crore at 1 crore and above", () => {
    expect(formatRupees(10_000_000)).toBe("Rs 1.00 crore");
    expect(formatRupees(56_406_928_597)).toBe("Rs 5,640.69 crore");
  });
  it("uses lakh between 1 lakh and 1 crore", () => {
    expect(formatRupees(100_000)).toBe("Rs 1.00 lakh");
    expect(formatRupees(250_000)).toBe("Rs 2.50 lakh");
    expect(formatRupees(9_999_999)).toBe("Rs 100.00 lakh");
  });
  it("shows plain rupees below 1 lakh", () => {
    expect(formatRupees(99_999)).toBe("Rs 99,999");
    expect(formatRupees(0)).toBe("Rs 0");
  });
  it("keeps the sign for negatives", () => {
    expect(formatRupees(-600_000)).toBe("-Rs 6.00 lakh");
  });
  it("handles missing values", () => {
    expect(formatRupees(null)).toBe("n/a");
    expect(formatRupees(undefined)).toBe("n/a");
    expect(formatRupees(Number.NaN)).toBe("n/a");
  });
});

describe("short and other formats", () => {
  it("formats axis labels", () => {
    expect(formatRupeesShort(56_406_928_597)).toBe("5,641 Cr");
    expect(formatRupeesShort(250_000)).toBe("2.5 L");
    expect(formatRupeesShort(-30_000_000)).toBe("-3.0 Cr");
  });
  it("formats percentages, integers and months", () => {
    expect(formatPct(0.0104)).toBe("1.04%");
    expect(formatPct(null)).toBe("n/a");
    expect(formatInt(4037)).toBe("4,037");
    expect(formatMonth("2026-10-31")).toBe("Oct 2026");
  });
});
