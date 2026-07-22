import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, pollsTable, pollOptionsTable } from "@workspace/db";
import { isOwnerReq } from "../lib/auth.js";
import { newId } from "../lib/idgen.js";

const router: IRouter = Router();

// GET /polls — list all polls with their options
router.get("/polls", async (req, res): Promise<void> => {
  const polls = await db.select().from(pollsTable).orderBy(pollsTable.createdAt);
  const options = await db.select().from(pollOptionsTable);

  const result = polls.map((p) => ({
    id: p.id,
    question: p.question,
    options: options
      .filter((o) => o.pollId === p.id)
      .map((o) => ({ id: o.id, text: o.text, votes: o.votes })),
  }));

  res.json(result);
});

// POST /polls — create a poll (owner only)
router.post("/polls", async (req, res): Promise<void> => {
  if (!isOwnerReq(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const body = req.body as { question?: string; options?: unknown[] };

  if (!body.question || !String(body.question).trim()) {
    res.status(400).json({ error: "question required" });
    return;
  }
  if (!Array.isArray(body.options) || body.options.length < 2) {
    res.status(400).json({ error: "at least 2 options required" });
    return;
  }

  const pollId = newId("poll");

  const [poll] = await db
    .insert(pollsTable)
    .values({ id: pollId, question: String(body.question).trim() })
    .returning();

  const optionRows = body.options.map((o) => ({
    id: newId("opt"),
    pollId,
    text: String(o).trim(),
    votes: 0,
  }));

  const createdOptions = await db.insert(pollOptionsTable).values(optionRows).returning();

  res.status(201).json({
    id: poll.id,
    question: poll.question,
    options: createdOptions.map((o) => ({ id: o.id, text: o.text, votes: o.votes })),
  });
});

// DELETE /polls/:id — delete a poll (owner only)
router.delete("/polls/:id", async (req, res): Promise<void> => {
  if (!isOwnerReq(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [deleted] = await db
    .delete(pollsTable)
    .where(eq(pollsTable.id, id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "not found" });
    return;
  }

  await db.delete(pollOptionsTable).where(eq(pollOptionsTable.pollId, id));

  res.json({ ok: true });
});

// POST /polls/:id/vote — cast a vote
router.post("/polls/:id/vote", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [poll] = await db.select().from(pollsTable).where(eq(pollsTable.id, id));
  if (!poll) {
    res.status(404).json({ error: "not found" });
    return;
  }

  const body = req.body as { optionIndex?: unknown };
  const idx = typeof body.optionIndex === "number" ? body.optionIndex : -1;

  const options = await db
    .select()
    .from(pollOptionsTable)
    .where(eq(pollOptionsTable.pollId, id))
    .orderBy(pollOptionsTable.createdAt);

  const targetOption = options[idx];
  if (!targetOption) {
    res.status(400).json({ error: "invalid optionIndex" });
    return;
  }

  await db
    .update(pollOptionsTable)
    .set({ votes: targetOption.votes + 1 })
    .where(eq(pollOptionsTable.id, targetOption.id));

  const updatedOptions = await db
    .select()
    .from(pollOptionsTable)
    .where(eq(pollOptionsTable.pollId, id))
    .orderBy(pollOptionsTable.createdAt);

  res.json({
    id: poll.id,
    question: poll.question,
    options: updatedOptions.map((o) => ({ id: o.id, text: o.text, votes: o.votes })),
  });
});

export default router;
