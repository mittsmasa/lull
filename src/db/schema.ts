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
// 型定数
// ============================================================

// enum 値を定数として定義（スキーマとアプリ全体で共有）
export const EVENT_STATUSES = [
  "draft",
  "published",
  "ongoing",
  "finished",
] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

/** 有効なステータス遷移マップ */
export const VALID_TRANSITIONS: Record<EventStatus, readonly EventStatus[]> = {
  draft: ["published"],
  published: ["draft", "ongoing"],
  ongoing: ["finished"],
  finished: [],
} as const;

export const MEMBER_ROLES = ["organizer", "performer"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const PROGRAM_TYPES = [
  "performance",
  "intermission",
  "greeting",
  "other",
] as const;
export type ProgramType = (typeof PROGRAM_TYPES)[number];

export const PROGRAM_TYPE_LABELS: Record<ProgramType, string> = {
  performance: "演奏",
  intermission: "休憩",
  greeting: "あいさつ",
  other: "その他",
};

export const PERFORMER_INVITATION_STATUSES = [
  "pending",
  "accepted",
  "invalidated",
] as const;
export type PerformerInvitationStatus =
  (typeof PERFORMER_INVITATION_STATUSES)[number];

// NOTE: 出演者招待用の PERFORMER_INVITATION_STATUSES / PerformerInvitationStatus とは別物
export const INVITATION_STATUSES = ["pending", "accepted", "declined"] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

// ============================================================
// テーブル定義
// ============================================================

/**
 * users — 管理者・出演者のアカウント（Better Auth 互換）
 */
export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: integer("email_verified", { mode: "boolean" }).notNull(),
    image: text("image"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [index("users_email_idx").on(t.email)],
);

/**
 * sessions — Better Auth セッション管理
 */
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
});

/**
 * accounts — Better Auth OAuth アカウント
 */
export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", {
    mode: "timestamp",
  }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", {
    mode: "timestamp",
  }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

/**
 * verifications — Better Auth 検証トークン
 */
export const verifications = sqliteTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
});

/**
 * events — 発表会
 */
export const events = sqliteTable("events", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  venue: text("venue").notNull(),
  startDatetime: text("start_datetime").notNull(),
  openDatetime: text("open_datetime"),
  status: text("status", { enum: EVENT_STATUSES }).notNull().default("draft"),
  totalSeats: integer("total_seats").notNull(),
  currentProgramId: text("current_program_id"),
  createdAt: integer("created_at")
    .notNull()
    .$defaultFn(() => Date.now()),
  updatedAt: integer("updated_at")
    .notNull()
    .$defaultFn(() => Date.now())
    .$onUpdateFn(() => Date.now()),
});

/**
 * event_members — イベントへの出演者・管理者の紐付け
 */
export const eventMembers = sqliteTable(
  "event_members",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: MEMBER_ROLES }).notNull().default("performer"),
    displayName: text("display_name").notNull(),
    createdAt: integer("created_at")
      .notNull()
      .$defaultFn(() => Date.now()),
    updatedAt: integer("updated_at")
      .notNull()
      .$defaultFn(() => Date.now())
      .$onUpdateFn(() => Date.now()),
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
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    // nullable + set null: 出演者削除時にゲスト招待を維持するため
    memberId: text("member_id").references(() => eventMembers.id, {
      onDelete: "set null",
    }),
    token: text("token").notNull().unique(),
    // スナップショット: memberId が null になるケースがあるため、
    // 発行時点の表示名を保存
    inviterDisplayName: text("inviter_display_name").notNull(),
    // nullable: 発行時に任意入力。ゲストが回答時に入力
    guestName: text("guest_name"),
    guestEmail: text("guest_email"),
    status: text("status", { enum: INVITATION_STATUSES })
      .notNull()
      .default("pending"),
    checkedIn: integer("checked_in", { mode: "boolean" })
      .notNull()
      .default(false),
    checkedInAt: integer("checked_in_at"),
    invalidatedAt: integer("invalidated_at"),
    respondedAt: integer("responded_at"),
    createdAt: integer("created_at")
      .notNull()
      .$defaultFn(() => Date.now()),
    updatedAt: integer("updated_at")
      .notNull()
      .$defaultFn(() => Date.now())
      .$onUpdateFn(() => Date.now()),
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
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull(),
    type: text("type", { enum: PROGRAM_TYPES }).notNull(),
    scheduledTime: text("scheduled_time"),
    estimatedDuration: integer("estimated_duration"),
    note: text("note"),
    createdAt: integer("created_at")
      .notNull()
      .$defaultFn(() => Date.now()),
    updatedAt: integer("updated_at")
      .notNull()
      .$defaultFn(() => Date.now())
      .$onUpdateFn(() => Date.now()),
  },
  (t) => [index("programs_event_id_idx").on(t.eventId)],
);

/**
 * companions — 同伴者
 */
export const companions = sqliteTable(
  "companions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    invitationId: text("invitation_id")
      .notNull()
      .references(() => invitations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    checkedIn: integer("checked_in", { mode: "boolean" })
      .notNull()
      .default(false),
    checkedInAt: integer("checked_in_at"),
    createdAt: integer("created_at")
      .notNull()
      .$defaultFn(() => Date.now()),
    updatedAt: integer("updated_at")
      .notNull()
      .$defaultFn(() => Date.now())
      .$onUpdateFn(() => Date.now()),
  },
  (t) => [index("companions_invitation_id_idx").on(t.invitationId)],
);

/**
 * performer_invitations — 出演者招待
 */
export const performerInvitations = sqliteTable(
  "performer_invitations",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    displayName: text("display_name").notNull(),
    status: text("status", { enum: PERFORMER_INVITATION_STATUSES })
      .notNull()
      .default("pending"),
    acceptedByUserId: text("accepted_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    acceptedAt: integer("accepted_at"),
    createdAt: integer("created_at")
      .notNull()
      .$defaultFn(() => Date.now()),
    updatedAt: integer("updated_at")
      .notNull()
      .$defaultFn(() => Date.now())
      .$onUpdateFn(() => Date.now()),
  },
  (t) => [index("performer_invitations_event_id_idx").on(t.eventId)],
);

/**
 * program_performers — プログラムと出演者の中間テーブル
 */
export const programPerformers = sqliteTable(
  "program_performers",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    programId: text("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    memberId: text("member_id")
      .notNull()
      .references(() => eventMembers.id, { onDelete: "restrict" }),
    createdAt: integer("created_at")
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (t) => [
    unique("program_performers_unique").on(t.programId, t.memberId),
    index("program_performers_program_id_idx").on(t.programId),
    index("program_performers_member_id_idx").on(t.memberId),
  ],
);

/**
 * program_pieces — プログラムの曲目
 */
export const programPieces = sqliteTable(
  "program_pieces",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    programId: text("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull(),
    title: text("title").notNull(),
    composer: text("composer"),
    createdAt: integer("created_at")
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (t) => [index("program_pieces_program_id_idx").on(t.programId)],
);

// ============================================================
// リレーション定義
// ============================================================

export const usersRelations = relations(users, ({ many }) => ({
  eventMembers: many(eventMembers),
  sessions: many(sessions),
  accounts: many(accounts),
  performerInvitations: many(performerInvitations),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, {
    fields: [accounts.userId],
    references: [users.id],
  }),
}));

export const eventsRelations = relations(events, ({ many, one }) => ({
  eventMembers: many(eventMembers),
  invitations: many(invitations),
  programs: many(programs),
  performerInvitations: many(performerInvitations),
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
    programPerformers: many(programPerformers),
  }),
);

export const invitationsRelations = relations(invitations, ({ one, many }) => ({
  event: one(events, {
    fields: [invitations.eventId],
    references: [events.id],
  }),
  member: one(eventMembers, {
    fields: [invitations.memberId],
    references: [eventMembers.id],
  }),
  companions: many(companions),
}));

export const programsRelations = relations(programs, ({ one, many }) => ({
  event: one(events, {
    fields: [programs.eventId],
    references: [events.id],
    relationName: "programs",
  }),
  performers: many(programPerformers),
  pieces: many(programPieces),
}));

export const programPerformersRelations = relations(
  programPerformers,
  ({ one }) => ({
    program: one(programs, {
      fields: [programPerformers.programId],
      references: [programs.id],
    }),
    member: one(eventMembers, {
      fields: [programPerformers.memberId],
      references: [eventMembers.id],
    }),
  }),
);

export const programPiecesRelations = relations(programPieces, ({ one }) => ({
  program: one(programs, {
    fields: [programPieces.programId],
    references: [programs.id],
  }),
}));

export const companionsRelations = relations(companions, ({ one }) => ({
  invitation: one(invitations, {
    fields: [companions.invitationId],
    references: [invitations.id],
  }),
}));

export const performerInvitationsRelations = relations(
  performerInvitations,
  ({ one }) => ({
    event: one(events, {
      fields: [performerInvitations.eventId],
      references: [events.id],
    }),
    acceptedByUser: one(users, {
      fields: [performerInvitations.acceptedByUserId],
      references: [users.id],
    }),
  }),
);
