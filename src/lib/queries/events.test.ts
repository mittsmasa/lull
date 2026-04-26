import { describe, expect, it } from "vitest";
import {
  addEventMember,
  createEvent,
  createUser,
} from "../../../tests/db/factories";
import { getEventsByUserId } from "./events";

describe("getEventsByUserId", () => {
  it("ユーザーが関わるイベントを role 付きで返す", async () => {
    const user = await createUser();
    const event = await createEvent({ name: "発表会A" });
    await addEventMember({
      eventId: event.id,
      userId: user.id,
      role: "organizer",
    });

    const result = await getEventsByUserId(user.id);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: event.id,
      name: "発表会A",
      role: "organizer",
    });
  });

  it("未終了は startDatetime 昇順、finished は降順で末尾に並ぶ", async () => {
    const user = await createUser();
    const eventEarly = await createEvent({
      name: "早い",
      startDatetime: "2030-01-01T10:00:00Z",
      status: "published",
    });
    const eventLate = await createEvent({
      name: "遅い",
      startDatetime: "2030-06-01T10:00:00Z",
      status: "published",
    });
    const eventFinishedNew = await createEvent({
      name: "終了済(新)",
      startDatetime: "2025-06-01T10:00:00Z",
      status: "finished",
    });
    const eventFinishedOld = await createEvent({
      name: "終了済(旧)",
      startDatetime: "2024-01-01T10:00:00Z",
      status: "finished",
    });
    for (const e of [
      eventEarly,
      eventLate,
      eventFinishedNew,
      eventFinishedOld,
    ]) {
      await addEventMember({ eventId: e.id, userId: user.id });
    }

    const result = await getEventsByUserId(user.id);

    expect(result.map((r) => r.id)).toEqual([
      eventEarly.id,
      eventLate.id,
      eventFinishedNew.id,
      eventFinishedOld.id,
    ]);
  });

  it("関わっていないイベントは返さない", async () => {
    const user = await createUser();
    const other = await createUser();
    const event = await createEvent();
    await addEventMember({ eventId: event.id, userId: other.id });

    const result = await getEventsByUserId(user.id);

    expect(result).toHaveLength(0);
  });
});
