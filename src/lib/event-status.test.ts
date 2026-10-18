import { describe, expect, it } from "vitest";
import { EVENT_STATUSES } from "@/db/schema";
import { canCheckIn, canReceivePayment } from "./event-status";

describe("canCheckIn", () => {
  it("ongoing と finished で true を返す", () => {
    expect(canCheckIn("ongoing")).toBe(true);
    expect(canCheckIn("finished")).toBe(true);
  });

  it("draft と published で false を返す", () => {
    expect(canCheckIn("draft")).toBe(false);
    expect(canCheckIn("published")).toBe(false);
  });

  it("全ステータスを網羅している", () => {
    expect(EVENT_STATUSES.map(canCheckIn)).toEqual([false, false, true, true]);
  });
});

describe("canReceivePayment", () => {
  it("ongoing でのみ true を返す", () => {
    expect(canReceivePayment("ongoing")).toBe(true);
  });

  it("finished では false を返す（会計は終了とともに締める）", () => {
    expect(canReceivePayment("finished")).toBe(false);
  });

  it("draft と published で false を返す", () => {
    expect(canReceivePayment("draft")).toBe(false);
    expect(canReceivePayment("published")).toBe(false);
  });
});
