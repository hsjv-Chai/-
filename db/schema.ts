import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  index,
} from "drizzle-orm/sqlite-core";
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  nickname: text("nickname").notNull(),
  password: text("password").notNull(),
  role: text("role").notNull().default("member"),
  createdAt: integer("created_at").notNull(),
});
export const sessions = sqliteTable("sessions", {
  token: text("token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
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
