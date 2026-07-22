import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const pollOptionsTable = pgTable("poll_options", {
  id: text("id").primaryKey(),
  pollId: text("poll_id").notNull(),
  text: text("text").notNull(),
  votes: integer("votes").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPollOptionSchema = createInsertSchema(pollOptionsTable).omit({
  createdAt: true,
});
export type InsertPollOption = z.infer<typeof insertPollOptionSchema>;
export type PollOption = typeof pollOptionsTable.$inferSelect;
