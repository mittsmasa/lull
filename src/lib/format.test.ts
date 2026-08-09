import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDatetime,
  formatEpochDatetime,
  formatTime,
} from "./format";

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

  it("ミリ秒付き ISO 8601 を処理する", () => {
    expect(formatDatetime("2026-03-15T14:00:00.000+09:00")).toBe(
      "2026/03/15 14:00",
    );
  });

  it("ミリ秒付き UTC (Z) を処理する", () => {
    expect(formatDatetime("2026-03-15T05:00:00.000Z")).toBe("2026/03/15 05:00");
  });
});

describe("formatEpochDatetime", () => {
  it("epoch ms を JST の YYYY/MM/DD HH:mm に変換する", () => {
    // 2026-03-15T14:00:00+09:00
    expect(formatEpochDatetime(Date.UTC(2026, 2, 15, 5, 0))).toBe(
      "2026/03/15 14:00",
    );
  });

  it("実行環境のタイムゾーンに関わらず JST で表示する", () => {
    // UTC では 2026-03-15 23:30、JST では日付が翌日に繰り上がる
    expect(formatEpochDatetime(Date.UTC(2026, 2, 15, 23, 30))).toBe(
      "2026/03/16 08:30",
    );
  });

  it("深夜 0 時台を 00 時として表示する（24 時表記にしない）", () => {
    // JST 2026-03-15 00:15
    expect(formatEpochDatetime(Date.UTC(2026, 2, 14, 15, 15))).toBe(
      "2026/03/15 00:15",
    );
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
