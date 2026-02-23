import { relations } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  unique,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// ============================================================
// テーブル定義
// ============================================================

/**
 * users — 管理者・出演者のアカウント
 */
export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email"),
    avatarUrl: text("avatar_url"),
    authProvider: text("auth_provider").notNull(),
    authProviderId: text("auth_provider_id").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    unique("users_auth_provider_unique").on(t.authProvider, t.authProviderId),
    index("users_email_idx").on(t.email),
  ],
);

/**
 * events — 発表会
 */
export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  venue: text("venue"),
  date: text("date").notNull(),
  openTime: text("open_time"),
  startTime: text("start_time"),
  status: text("status").notNull().default("draft"),
  totalSeats: integer("total_seats").notNull(),
  currentProgramId: text("current_program_id"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/**
 * event_members — イベントへの出演者・管理者の紐付け
 */
export const eventMembers = sqliteTable(
  "event_members",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    allotment: integer("allotment").notNull(),
    displayName: text("display_name"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    unique("event_members_event_user_unique").on(t.eventId, t.userId),
    index("event_members_event_id_idx").on(t.eventId),
    index("event_members_user_id_idx").on(t.userId),
  ],
);

/**
 * invitations — 招待
 */
export const invitations = sqliteTable(
  "invitations",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    memberId: text("member_id")
      .notNull()
      .references(() => eventMembers.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    guestName: text("guest_name").notNull(),
    guestEmail: text("guest_email"),
    companionCount: integer("companion_count").notNull().default(0),
    status: text("status").notNull().default("pending"),
    respondedAt: integer("responded_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    index("invitations_event_id_idx").on(t.eventId),
    index("invitations_member_id_idx").on(t.memberId),
    uniqueIndex("invitations_token_idx").on(t.token),
  ],
);

/**
 * programs — プログラム（演目・休憩・あいさつ等）
 */
export const programs = sqliteTable(
  "programs",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    order: integer("order").notNull(),
    type: text("type").notNull(),
    title: text("title").notNull(),
    composer: text("composer"),
    memberId: text("member_id").references(() => eventMembers.id, {
      onDelete: "set null",
    }),
    scheduledTime: text("scheduled_time"),
    estimatedDuration: integer("estimated_duration"),
    note: text("note"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    unique("programs_event_order_unique").on(t.eventId, t.order),
    index("programs_event_id_idx").on(t.eventId),
    index("programs_member_id_idx").on(t.memberId),
  ],
);

/**
 * check_ins — 来場チェックイン
 */
export const checkIns = sqliteTable(
  "check_ins",
  {
    id: text("id").primaryKey(),
    invitationId: text("invitation_id")
      .notNull()
      .references(() => invitations.id, { onDelete: "cascade" }),
    checkedInAt: integer("checked_in_at").notNull(),
    checkedInBy: text("checked_in_by")
      .notNull()
      .references(() => eventMembers.id),
    headCount: integer("head_count").notNull(),
  },
  (t) => [
    uniqueIndex("check_ins_invitation_id_idx").on(t.invitationId),
    index("check_ins_checked_in_by_idx").on(t.checkedInBy),
  ],
);

// ============================================================
// リレーション定義
// ============================================================

export const usersRelations = relations(users, ({ many }) => ({
  eventMembers: many(eventMembers),
}));

export const eventsRelations = relations(events, ({ many, one }) => ({
  eventMembers: many(eventMembers),
  invitations: many(invitations),
  programs: many(programs),
  currentProgram: one(programs, {
    fields: [events.currentProgramId],
    references: [programs.id],
    relationName: "currentProgram",
  }),
}));

export const eventMembersRelations = relations(
  eventMembers,
  ({ one, many }) => ({
    event: one(events, {
      fields: [eventMembers.eventId],
      references: [events.id],
    }),
    user: one(users, {
      fields: [eventMembers.userId],
      references: [users.id],
    }),
    invitations: many(invitations),
    programs: many(programs),
    checkIns: many(checkIns),
  }),
);

export const invitationsRelations = relations(invitations, ({ one }) => ({
  event: one(events, {
    fields: [invitations.eventId],
    references: [events.id],
  }),
  member: one(eventMembers, {
    fields: [invitations.memberId],
    references: [eventMembers.id],
  }),
  checkIn: one(checkIns),
}));

export const programsRelations = relations(programs, ({ one }) => ({
  event: one(events, {
    fields: [programs.eventId],
    references: [events.id],
    relationName: "programs",
  }),
  member: one(eventMembers, {
    fields: [programs.memberId],
    references: [eventMembers.id],
  }),
}));

export const checkInsRelations = relations(checkIns, ({ one }) => ({
  invitation: one(invitations, {
    fields: [checkIns.invitationId],
    references: [invitations.id],
  }),
  checkedInByMember: one(eventMembers, {
    fields: [checkIns.checkedInBy],
    references: [eventMembers.id],
  }),
}));
