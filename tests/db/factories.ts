import { db } from "@/db";
import { eventMembers, events, type MemberRole, users } from "@/db/schema";

let counter = 0;
const nextId = (prefix: string) =>
  `${prefix}-${++counter}-${Date.now().toString(36)}`;

type UserOverrides = Partial<typeof users.$inferInsert>;
type EventOverrides = Partial<typeof events.$inferInsert>;

export async function createUser(overrides: UserOverrides = {}) {
  const id = overrides.id ?? nextId("user");
  const now = new Date();
  const row = {
    id,
    name: `User ${id}`,
    email: `${id}@example.com`,
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } satisfies typeof users.$inferInsert;
  await db.insert(users).values(row);
  return row;
}

export async function createEvent(overrides: EventOverrides = {}) {
  const id = overrides.id ?? nextId("event");
  const row = {
    id,
    name: `Event ${id}`,
    venue: "Test Hall",
    startDatetime: "2030-01-01T10:00:00Z",
    totalSeats: 100,
    ...overrides,
  } satisfies typeof events.$inferInsert;
  await db.insert(events).values(row);
  return row;
}

export async function addEventMember({
  eventId,
  userId,
  role = "performer",
  displayName,
}: {
  eventId: string;
  userId: string;
  role?: MemberRole;
  displayName?: string;
}) {
  const id = nextId("member");
  await db.insert(eventMembers).values({
    id,
    eventId,
    userId,
    role,
    displayName: displayName ?? `Member ${id}`,
  });
  return id;
}
