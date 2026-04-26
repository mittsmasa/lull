import { describe, expect, it } from "vitest";
import {
  addEventMember,
  addProgram,
  addProgramPerformer,
  addProgramPiece,
  createEvent,
  createUser,
} from "../../../tests/db/factories";
import { getProgramsByEventId } from "./programs";

describe("getProgramsByEventId", () => {
  it("sortOrder 昇順で返し、performers と pieces を結合する", async () => {
    const event = await createEvent();
    const user = await createUser();
    const memberId = await addEventMember({
      eventId: event.id,
      userId: user.id,
      role: "performer",
      displayName: "出演者A",
    });

    const p2 = await addProgram({
      eventId: event.id,
      sortOrder: 2,
      type: "performance",
    });
    const p1 = await addProgram({
      eventId: event.id,
      sortOrder: 1,
      type: "intermission",
    });

    // p2 に pieces / performer を紐付け（sortOrder 逆順で挿入して並び順を検証）
    await addProgramPiece({
      programId: p2.id,
      sortOrder: 2,
      title: "曲B",
      composer: "作曲家B",
    });
    await addProgramPiece({
      programId: p2.id,
      sortOrder: 1,
      title: "曲A",
      composer: null,
    });
    await addProgramPerformer({ programId: p2.id, memberId });

    const result = await getProgramsByEventId(event.id);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(p1.id);
    expect(result[1].id).toBe(p2.id);

    expect(result[1].pieces.map((pc) => pc.title)).toEqual(["曲A", "曲B"]);
    expect(result[1].performers).toEqual([
      { id: expect.any(String), memberId, displayName: "出演者A" },
    ]);
    expect(result[0].pieces).toEqual([]);
    expect(result[0].performers).toEqual([]);
  });

  it("他イベントのプログラムは含めない", async () => {
    const event = await createEvent();
    const other = await createEvent();
    await addProgram({ eventId: other.id, sortOrder: 1 });

    const result = await getProgramsByEventId(event.id);
    expect(result).toEqual([]);
  });
});
