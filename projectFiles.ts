import { pgTable, text, timestamp, customType } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// bytea column for storing ZIP file data
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
  toDriver(value: Buffer): Buffer {
    return value;
  },
  fromDriver(value: Buffer): Buffer {
    return value;
  },
});

export const projectFilesTable = pgTable("project_files", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().unique(),
  data: bytea("data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertProjectFileSchema = createInsertSchema(projectFilesTable, {
  data: z.any(),
}).omit({ createdAt: true });
export type InsertProjectFile = z.infer<typeof insertProjectFileSchema>;
export type ProjectFile = typeof projectFilesTable.$inferSelect;
