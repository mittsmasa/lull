import { db } from "@/db";
import {
  companions,
  eventMembers,
  events,
  invitations,
  type MemberRole,
  performerInvitations,
  programPerformers,
  programPieces,
  programs,
  users,
} from "@/db/schema";

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

type InvitationOverrides = Partial<typeof invitations.$inferInsert> & {
  eventId: string;
};

export async function addInvitation(overrides: InvitationOverrides) {
  const id = overrides.id ?? nextId("inv");
  const row = {
    id,
    token: overrides.token ?? nextId("token"),
    inviterDisplayName: overrides.inviterDisplayName ?? "主催者",
    ...overrides,
  } satisfies typeof invitations.$inferInsert;
  await db.insert(invitations).values(row);
  const created = await db.query.invitations.findFirst({
    where: (t, { eq }) => eq(t.id, id),
  });
  if (!created) throw new Error("addInvitation: insert failed");
  return created;
}

type CompanionOverrides = Partial<typeof companions.$inferInsert> & {
  invitationId: string;
};

export async function addCompanion(overrides: CompanionOverrides) {
  const id = overrides.id ?? nextId("comp");
  const row = {
    id,
    name: overrides.name ?? `Companion ${id}`,
    ...overrides,
  } satisfies typeof companions.$inferInsert;
  await db.insert(companions).values(row);
  return row;
}

type PerformerInvitationOverrides = Partial<
  typeof performerInvitations.$inferInsert
> & { eventId: string };

export async function addPerformerInvitation(
  overrides: PerformerInvitationOverrides,
) {
  const id = overrides.id ?? nextId("perfinv");
  const row = {
    id,
    token: overrides.token ?? nextId("ptoken"),
    displayName: overrides.displayName ?? `出演者 ${id}`,
    ...overrides,
  } satisfies typeof performerInvitations.$inferInsert;
  await db.insert(performerInvitations).values(row);
  return row;
}

type ProgramOverrides = Partial<typeof programs.$inferInsert> & {
  eventId: string;
};

export async function addProgram(overrides: ProgramOverrides) {
  const id = overrides.id ?? nextId("prog");
  const row = {
    id,
    sortOrder: overrides.sortOrder ?? 1,
    type: overrides.type ?? "performance",
    ...overrides,
  } satisfies typeof programs.$inferInsert;
  await db.insert(programs).values(row);
  return row;
}

type ProgramPieceOverrides = Partial<typeof programPieces.$inferInsert> & {
  programId: string;
};

export async function addProgramPiece(overrides: ProgramPieceOverrides) {
  const id = overrides.id ?? nextId("piece");
  const row = {
    id,
    sortOrder: overrides.sortOrder ?? 1,
    title: overrides.title ?? `Piece ${id}`,
    ...overrides,
  } satisfies typeof programPieces.$inferInsert;
  await db.insert(programPieces).values(row);
  return row;
}

type ProgramPerformerOverrides = Partial<
  typeof programPerformers.$inferInsert
> & {
  programId: string;
  memberId: string;
};

export async function addProgramPerformer(
  overrides: ProgramPerformerOverrides,
) {
  const id = overrides.id ?? nextId("pp");
  const row = {
    id,
    ...overrides,
  } satisfies typeof programPerformers.$inferInsert;
  await db.insert(programPerformers).values(row);
  return row;
}
