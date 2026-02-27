import { describe, expect, it } from "vitest";
import { formatDate, formatDatetime, formatTime } from "./format";

describe("formatDatetime", () => {
  it("YYYY-MM-DDTHH:mm を YYYY/MM/DD HH:mm に変換する", () => {
    expect(formatDatetime("2026-03-15T14:00")).toBe("2026/03/15 14:00");
  });

  it("タイムゾーン付き ISO 8601 を処理する", () => {
    expect(formatDatetime("2026-03-15T14:00:00+09:00")).toBe(
      "2026/03/15 14:00",
    );
  });

  it("UTC (Z) 表記を処理する", () => {
    expect(formatDatetime("2026-03-15T05:00:00Z")).toBe("2026/03/15 05:00");
  });
});

describe("formatDate", () => {
  it("日付部分を抽出する", () => {
    expect(formatDate("2026-03-15T14:00")).toBe("2026/03/15");
  });
});

describe("formatTime", () => {
  it("時刻部分を抽出する", () => {
    expect(formatTime("2026-03-15T14:00")).toBe("14:00");
  });
});
