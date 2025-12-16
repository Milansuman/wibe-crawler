import { relations } from "drizzle-orm";
import { jsonb } from "drizzle-orm/pg-core";
import { integer } from "drizzle-orm/pg-core";
import { pgEnum } from "drizzle-orm/pg-core";
import { uuid } from "drizzle-orm/pg-core";
import { pgTable, text, timestamp, boolean, index } from "drizzle-orm/pg-core";

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
  cookieHeader: text(),
  localStorage: text(),
  userId: uuid().references(() => user.id, {
    onDelete: "cascade"
  })
});

export const urlTypes = pgEnum("urlTypes", ["page", "pdf", "image", "video", "audio", "document"]);

export const urls = pgTable("urls", {
  id: uuid().defaultRandom().primaryKey(),
  parentUrl: text().notNull(),
  url: text().notNull(),
  projectId: uuid().references(() => projects.id, {
    onDelete: "cascade"
  }),
  type: urlTypes().default("page"),
  interest: integer().default(5) //how interesting is this url?
});

export const urlSearchParams = pgTable("url_search_params", {
  id: uuid().defaultRandom().primaryKey(),
  urlId: uuid().references(() => urls.id, {
    onDelete: "cascade"
  }),
  param: text().notNull(),
  interest: integer().default(5)
});

export const subdomains = pgTable("subdomains", {
  id: uuid().defaultRandom().primaryKey(),
  projectId: uuid().references(() => projects.id, {
    onDelete: "cascade"
  }),
  host: text().notNull()
});

export const emails = pgTable("emails", {
  id: uuid().defaultRandom().primaryKey(),
  projectId: uuid().references(() => projects.id, {
    onDelete: "cascade"
  }),
  email: text().notNull(),
  url: text().notNull()
})

export const apiCalls = pgTable("api_calls", {
  id: uuid().defaultRandom().primaryKey(),
  projectId: uuid().references(() => projects.id, {
    onDelete: "cascade"
  }),
  url: text().notNull(),
  method: text().notNull().default("GET"),
  headers: jsonb(),
  payload: text(),
  interest: integer().default(5)
});

export const vulnerabilities = pgTable("vulnerabilities", {
  id: uuid().defaultRandom().primaryKey(),
  projectId: uuid().references(() => projects.id, {
    onDelete: "cascade"
  }),
  title: text().notNull(),
  description: text().notNull(),
  cvss: integer().notNull().default(0)
});

export const exploitSteps = pgTable("exploit_steps", {
  id: uuid().defaultRandom().primaryKey(),
  projectId: uuid().references(() => projects.id, {
    onDelete: "cascade"
  }),
  vulnerabilityId: uuid().references(() => vulnerabilities.id, {
    onDelete: "cascade"
  }),
  description: text().notNull(),
});