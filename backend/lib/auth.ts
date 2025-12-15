import { betterAuth } from "better-auth";
import { db } from "./db";
import * as schema from "./db/schema";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema
  }),
  emailAndPassword: { 
    enabled: true, 
  },
  trustedOrigins: ["http://localhost:5173"]
});