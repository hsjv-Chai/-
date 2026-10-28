import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  index,
} from "drizzle-orm/sqlite-core";
export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    username: text("username").notNull().unique(),
    nickname: text("nickname").notNull(),
    password: text("password").notNull(),
    role: text("role").notNull().default("member"),
    createdAt: integer("created_at").notNull(),
    registrationIp: text("registration_ip"),
    accountStatus: text("account_status").notNull().default("active"),
    restrictedRoomId: text("restricted_room_id"),
    banReason: text("ban_reason"),
    bannedAt: integer("banned_at"),
    accountVersion: integer("account_version").notNull().default(0),
    email: text("email"),
    emailCanonical: text("email_canonical"),
    emailVerifiedAt: integer("email_verified_at"),
  },
  (t) => [
    index("users_registration_ip_idx").on(t.registrationIp, t.createdAt),
    index("users_email_idx").on(t.emailCanonical),
  ],
);
export const emailQuotas = sqliteTable("email_quotas", {
  canonical: text("canonical").primaryKey(),
  registeredCount: integer("registered_count").notNull().default(0),
});
export const emailSendAttempts = sqliteTable(
  "email_send_attempts",
  {
    id: text("id").primaryKey(),
    canonical: text("canonical").notNull(),
    ip: text("ip"),
    day: text("day").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    index("email_attempt_canonical_idx").on(t.canonical, t.createdAt),
    index("email_attempt_ip_idx").on(t.ip, t.createdAt),
    index("email_attempt_day_idx").on(t.day),
  ],
);
export const emailChallenges = sqliteTable(
  "email_challenges",
  {
    id: text("id").primaryKey(),
    canonical: text("canonical").notNull(),
    email: text("email").notNull(),
    username: text("username").notNull(),
    codeHash: text("code_hash").notNull(),
    transport: text("transport").notNull(),
    status: text("status").notNull().default("pending"),
    wrongAttempts: integer("wrong_attempts").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
    consumedBy: text("consumed_by"),
    consumedAt: integer("consumed_at"),
  },
  (t) => [index("email_challenge_canonical_idx").on(t.canonical, t.createdAt)],
);
export const registrationAlerts = sqliteTable("registration_alerts", {
  id: text("id").primaryKey(),
  ip: text("ip").notNull(),
  windowStart: integer("window_start").notNull(),
  createdAt: integer("created_at").notNull(),
  accountCount: integer("account_count").notNull(),
});
export const registrationAlertUsers = sqliteTable(
  "registration_alert_users",
  {
    alertId: text("alert_id")
      .notNull()
      .references(() => registrationAlerts.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.alertId, t.userId] }),
    index("registration_alert_user_idx").on(t.userId),
  ],
);
export const accountAudit = sqliteTable(
  "account_audit",
  {
    id: text("id").primaryKey(),
    actorId: text("actor_id")
      .notNull()
      .references(() => users.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    action: text("action").notNull(),
    reason: text("reason").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("account_audit_user_idx").on(t.userId, t.createdAt)],
);
export const sessions = sqliteTable("sessions", {
  token: text("token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  expires: integer("expires").notNull(),
});
// These are read-only final-result receipts, never authentication sessions.
export const gameResultReceipts = sqliteTable("game_result_receipts", {
  token: text("token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  roomId: text("room_id").notNull(),
  expires: integer("expires").notNull(),
});
export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
});
export const posts = sqliteTable(
  "posts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id),
    title: text("title").notNull(),
    body: text("body").notNull(),
    featured: integer("featured").notNull().default(0),
    pinned: integer("pinned").notNull().default(0),
    hidden: integer("hidden").notNull().default(0),
    demo: integer("demo").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("posts_created_idx").on(t.createdAt)],
);
export const replies = sqliteTable(
  "replies",
  {
    id: text("id").primaryKey(),
    postId: text("post_id")
      .notNull()
      .references(() => posts.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    quoteId: text("quote_id"),
    body: text("body").notNull(),
    hidden: integer("hidden").notNull().default(0),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("replies_post_idx").on(t.postId, t.createdAt)],
);
export const likes = sqliteTable(
  "likes",
  {
    postId: text("post_id")
      .notNull()
      .references(() => posts.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.userId] })],
);
export const uploads = sqliteTable("uploads", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  postId: text("post_id").references(() => posts.id),
  mime: text("mime").notNull(),
  createdAt: integer("created_at").notNull(),
});
export const authAttempts = sqliteTable("auth_attempts", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  expires: integer("expires").notNull(),
});
export const gameRooms = sqliteTable(
  "game_rooms",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id),
    game: text("game").notNull(),
    phase: text("phase").notNull(),
    state: text("state").notNull(),
    version: integer("version").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    index("game_rooms_updated_idx").on(t.updatedAt),
    index("game_rooms_owner_idx").on(t.ownerId, t.createdAt),
  ],
);

export const gardenCheckIns = sqliteTable(
  "garden_check_ins",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    day: text("day").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
);
