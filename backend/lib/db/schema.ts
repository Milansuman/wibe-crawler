import { ReasoningPart, ToolCallPart } from "@ai-sdk/provider-utils";
import { FilePart, ImagePart, TextPart } from "ai";
import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, boolean, index, uuid, pgEnum, integer, jsonb } from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const projects = pgTable("projects", {
  id: uuid().defaultRandom().primaryKey(),
  url: text().notNull(),
  title: text().notNull(),
  userId: text().references(() => user.id, {
    onDelete: "cascade"
  }).notNull()
}).enableRLS();

export const projectMessageTypes = pgEnum("project_message_types", ["system", "user", "assistant", "tool"]);

export const projectMessages = pgTable("project_messages", {
  id: uuid().defaultRandom().primaryKey(),
  projectId: uuid().references(() => projects.id, {
    onDelete: "cascade"
  }).notNull(),
  role: projectMessageTypes().default("user"),
  text: text(),
  content: jsonb().$type<Array<TextPart | ReasoningPart>>()
}).enableRLS();

export const vulnerabilities = pgTable("vulnerabilities", {
  id: uuid().defaultRandom().primaryKey(),
  projectId: uuid().references(() => projects.id, {
    onDelete: "cascade"
  }).notNull(),
  title: text().notNull(),
  description: text(),
  cvss: integer().default(0)
}).enableRLS();

export const checkPoints = pgTable("checkpoints", {
  id: uuid().defaultRandom().primaryKey(),
  projectId: uuid().references(() => projects.id, {
    onDelete: "cascade"
  }).notNull(),
  url: text(),
  context: text().notNull()
}).enableRLS();

export const pages = pgTable("pages", {
  id: uuid().defaultRandom().primaryKey(),
  url: text().notNull().unique(),
  js: text(),
  html: text()
}).enableRLS();