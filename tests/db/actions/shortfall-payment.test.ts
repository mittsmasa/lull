import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  confirmCheckoutPayment,
  createCheckoutSession,
  respondToInvitation,
} from "@/app/i/[token]/_actions";
import { db } from "@/db";
import { invitations } from "@/db/schema";
import {
  addEventMember,
  addInvitation,
  createEvent,
  createUser,
} from "../factories";
import { clearAfterTasks, flushAfter } from "../helpers/after";
import { clearSentMails, sentMails } from "../helpers/mail";

// 決済後に回答が変わって差額が生まれ、その差額だけを追加決済するまでの通し検証。
// 個々の関数のテストは create-checkout-session / confirm-checkout-payment /
// respond-invitation-payment 側にあり、ここでは経路をつないだときの
// 受領額の積み上がりと二重課金の不在を見る

type MockStripe = {
  checkout: {
    sessions: {
      retrieve: ReturnType<typeof vi.fn>;
      expire: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
  };
};

function enableStripe(): MockStripe {
  const mock: MockStripe = {
    checkout: {
      sessions: {
        retrieve: vi.fn(),
        expire: vi.fn().mockResolvedValue({}),
        create: vi.fn(),
      },
    },
  };
  (globalThis as { __mockStripe?: unknown }).__mockStripe = mock;
  return mock;
}

beforeEach(() => {
  clearAfterTasks();
  clearSentMails();
});

afterEach(() => {
  delete (globalThis as { __mockStripe?: unknown }).__mockStripe;
});

const guest = {
  guestName: "差額太郎",
  guestEmail: "sagaku@example.com",
};

/** 参加費 500 / 懇親会費 1000、懇親会不参加で出席回答済みの招待 */
async function setup() {
  const user = await createUser();
  const event = await createEvent({
    status: "published",
    totalSeats: 10,
    attendanceFee: 500,
    afterPartyEnabled: true,
    afterPartyFee: 1000,
  });
  const memberId = await addEventMember({
    eventId: event.id,
    userId: user.id,
    role: "organizer",
  });
  const inv = await addInvitation({
    eventId: event.id,
    memberId,
    status: "accepted",
    guestName: guest.guestName,
    guestEmail: guest.guestEmail,
    afterPartyAttendance: "declined",
    paymentMethod: "prepaid",
  });
  return { event, inv };
}

function paidSession(id: string, amountTotal: number, invitationId: string) {
  return {
    id,
    status: "complete",
    payment_status: "paid",
    amount_total: amountTotal,
    metadata: { invitationId },
  };
}

function readInvitation(id: string) {
  return db.query.invitations.findFirst({ where: eq(invitations.id, id) });
}

/** 懇親会に参加する変更（請求 500 → 1500） */
function joinAfterParty(token: string) {
  return respondToInvitation(token, {
    ...guest,
    attendance: "accepted",
    companions: [],
    afterPartyAttendance: "attending",
    paymentMethod: "prepaid",
  });
}

describe("差額決済の通し検証", () => {
  it("参加費決済 → 懇親会参加への変更 → 差額だけを追加決済できる", async () => {
    const stripe = enableStripe();
    const { inv } = await setup();

    // 1. 参加費 500 を決済する
    stripe.checkout.sessions.create.mockResolvedValueOnce({
      id: "cs_first",
      url: "https://checkout.stripe.com/first",
    });
    expect(await createCheckoutSession(inv.token)).toEqual({
      url: "https://checkout.stripe.com/first",
    });
    expect(
      stripe.checkout.sessions.create.mock.calls[0][0].line_items,
    ).toHaveLength(1);

    stripe.checkout.sessions.retrieve.mockResolvedValueOnce(
      paidSession("cs_first", 500, inv.id),
    );
    expect(await confirmCheckoutPayment(inv.token, "cs_first")).toEqual({
      paid: true,
    });

    expect(await readInvitation(inv.id)).toMatchObject({
      paidAmount: 500,
      paidMethod: "stripe",
      stripeCheckoutSessionId: "cs_first",
      settledCheckoutSessionIds: ",cs_first,",
    });
    // 差額がないうちは追加のセッションを作れない
    expect(await createCheckoutSession(inv.token)).toEqual({
      error: expect.stringContaining("お支払い済み"),
    });

    // 2. 懇親会に参加する変更で差額 1000 が生まれる
    expect(await joinAfterParty(inv.token)).toBeUndefined();

    const afterChange = await readInvitation(inv.id);
    // 受領記録は動かさない（請求額は常に動的算出）
    expect(afterChange).toMatchObject({
      afterPartyAttendance: "attending",
      paidAmount: 500,
      // 決済済みのセッション ID は監査用に残す（失効対象にしない）
      stripeCheckoutSessionId: "cs_first",
    });
    expect(stripe.checkout.sessions.expire).not.toHaveBeenCalled();

    // 3. 差額 1000 だけの Checkout セッションを作る
    stripe.checkout.sessions.create.mockResolvedValueOnce({
      id: "cs_second",
      url: "https://checkout.stripe.com/second",
    });
    expect(await createCheckoutSession(inv.token)).toEqual({
      url: "https://checkout.stripe.com/second",
    });

    const secondArgs = stripe.checkout.sessions.create.mock.calls[1][0];
    expect(secondArgs.line_items).toHaveLength(1);
    expect(secondArgs.line_items[0].price_data.unit_amount).toBe(1000);
    expect(secondArgs.line_items[0].quantity).toBe(1);
    // 記録済みのセッションは retrieve / expire の対象外
    // （retrieve が呼ばれたのは 1 の confirm だけ）
    expect(stripe.checkout.sessions.retrieve).toHaveBeenCalledTimes(1);
    expect(stripe.checkout.sessions.expire).not.toHaveBeenCalled();

    // 4. 差額を決済すると受領額が現請求額に追いつく
    stripe.checkout.sessions.retrieve.mockResolvedValueOnce(
      paidSession("cs_second", 1000, inv.id),
    );
    expect(await confirmCheckoutPayment(inv.token, "cs_second")).toEqual({
      paid: true,
    });

    expect(await readInvitation(inv.id)).toMatchObject({
      paidAmount: 1500,
      paidMethod: "stripe",
      stripeCheckoutSessionId: "cs_second",
      settledCheckoutSessionIds: ",cs_first,cs_second,",
    });

    // 5. 差額が解消したらまた作れない
    expect(await createCheckoutSession(inv.token)).toEqual({
      error: expect.stringContaining("お支払い済み"),
    });

    // 決済のたびにゲストへ通知する（初回 + 差額の 2 通。
    // 回答変更の通知も混ざるため件名で絞る）
    await flushAfter();
    const paymentMails = sentMails().filter((m) =>
      m.subject.includes("お支払いを承りました"),
    );
    expect(paymentMails).toHaveLength(2);
    expect(paymentMails[1].text).toContain("- 受領額: ¥1,500");
  });

  it("差額決済の再確認・webhook 再送では二重に加算されない", async () => {
    const stripe = enableStripe();
    const { inv } = await setup();

    stripe.checkout.sessions.create.mockResolvedValueOnce({
      id: "cs_first",
      url: "https://checkout.stripe.com/first",
    });
    await createCheckoutSession(inv.token);
    stripe.checkout.sessions.retrieve.mockResolvedValue(
      paidSession("cs_first", 500, inv.id),
    );
    await confirmCheckoutPayment(inv.token, "cs_first");
    await joinAfterParty(inv.token);

    stripe.checkout.sessions.create.mockResolvedValueOnce({
      id: "cs_second",
      url: "https://checkout.stripe.com/second",
    });
    await createCheckoutSession(inv.token);
    stripe.checkout.sessions.retrieve.mockResolvedValue(
      paidSession("cs_second", 1000, inv.id),
    );
    await confirmCheckoutPayment(inv.token, "cs_second");

    // 同じ差額セッションの再確認（ページ再読み込み・webhook 再送に相当）
    expect(await confirmCheckoutPayment(inv.token, "cs_second")).toEqual({
      paid: true,
    });
    // 差額決済より前のセッションが遅れて再送されても同じ
    stripe.checkout.sessions.retrieve.mockResolvedValue(
      paidSession("cs_first", 500, inv.id),
    );
    expect(await confirmCheckoutPayment(inv.token, "cs_first")).toEqual({
      paid: true,
    });

    expect(await readInvitation(inv.id)).toMatchObject({
      paidAmount: 1500,
      settledCheckoutSessionIds: ",cs_first,cs_second,",
    });
  });

  it("差額が残っている間も減額方向の変更は受け付けない", async () => {
    const stripe = enableStripe();
    const { inv } = await setup();

    stripe.checkout.sessions.create.mockResolvedValueOnce({
      id: "cs_first",
      url: "https://checkout.stripe.com/first",
    });
    await createCheckoutSession(inv.token);
    stripe.checkout.sessions.retrieve.mockResolvedValueOnce(
      paidSession("cs_first", 500, inv.id),
    );
    await confirmCheckoutPayment(inv.token, "cs_first");
    await joinAfterParty(inv.token);

    // 差額 1000 が未決済の状態で懇親会をキャンセルしようとする
    const res = await respondToInvitation(inv.token, {
      ...guest,
      attendance: "accepted",
      companions: [],
      afterPartyAttendance: "declined",
      paymentMethod: "prepaid",
    });
    expect(res?.error).toContain("減る変更");

    expect(await readInvitation(inv.id)).toMatchObject({
      afterPartyAttendance: "attending",
      paidAmount: 500,
    });
  });
});
