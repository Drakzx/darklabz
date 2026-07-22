import { Router, type IRouter } from "express";
import multer from "multer";
import { eq } from "drizzle-orm";
import { db, projectsTable, commentsTable, projectFilesTable } from "@workspace/db";
import { isOwnerReq } from "../lib/auth.js";
import { newId } from "../lib/idgen.js";
import { buildZip } from "../lib/zip.js";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// GET /projects — list all projects with their comments
router.get("/projects", async (req, res): Promise<void> => {
  const projects = await db
    .select()
    .from(projectsTable)
    .orderBy(projectsTable.createdAt);

  const comments = await db.select().from(commentsTable);

  const result = projects.map((p) => ({
    id: p.id,
    title: p.title,
    desc: p.description,
    codeName: p.codeName,
    code: p.code,
    likes: p.likes,
    hasFiles: p.hasFiles,
    comments: comments
      .filter((c) => c.projectId === p.id)
      .map((c) => ({ id: c.id, name: c.name, text: c.text })),
  }));

  res.json(result);
});

// POST /projects — create a project (owner only)
router.post("/projects", async (req, res): Promise<void> => {
  if (!isOwnerReq(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const body = req.body as {
    title?: string;
    desc?: string;
    codeName?: string;
    code?: string;
  };

  if (!body.title || !String(body.title).trim()) {
    res.status(400).json({ error: "title required" });
    return;
  }

  const id = newId("proj");
  const proj: typeof projectsTable.$inferInsert = {
    id,
    title: String(body.title).trim(),
    description: body.desc && String(body.desc).trim() ? String(body.desc).trim() : "Tidak ada deskripsi.",
    likes: 0,
    hasFiles: false,
  };

  if (body.code && String(body.code).trim()) {
    proj.codeName = (body.codeName && String(body.codeName).trim()) || "snippet";
    proj.code = body.code;
  }

  const [created] = await db.insert(projectsTable).values(proj).returning();

  res.status(201).json({
    id: created.id,
    title: created.title,
    desc: created.description,
    codeName: created.codeName,
    code: created.code,
    likes: created.likes,
    hasFiles: created.hasFiles,
    comments: [],
  });
});

// DELETE /projects/:id — delete a project (owner only)
router.delete("/projects/:id", async (req, res): Promise<void> => {
  if (!isOwnerReq(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [deleted] = await db
    .delete(projectsTable)
    .where(eq(projectsTable.id, id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "not found" });
    return;
  }

  // Also delete associated comments and file
  await db.delete(commentsTable).where(eq(commentsTable.projectId, id));
  await db.delete(projectFilesTable).where(eq(projectFilesTable.projectId, id));

  res.json({ ok: true });
});

// POST /projects/:id/like — increment like count
router.post("/projects/:id/like", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [proj] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, id));

  if (!proj) {
    res.status(404).json({ error: "not found" });
    return;
  }

  const [updated] = await db
    .update(projectsTable)
    .set({ likes: proj.likes + 1 })
    .where(eq(projectsTable.id, id))
    .returning();

  res.json({ likes: updated.likes });
});

// POST /projects/:id/comments — add a comment
router.post("/projects/:id/comments", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [proj] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, id));

  if (!proj) {
    res.status(404).json({ error: "not found" });
    return;
  }

  const body = req.body as { name?: string; text?: string };
  if (!body.text || !String(body.text).trim()) {
    res.status(400).json({ error: "text required" });
    return;
  }

  const comment = {
    id: newId("cmt"),
    projectId: id,
    name: body.name && String(body.name).trim() ? String(body.name).trim() : "Anonim",
    text: String(body.text).trim(),
  };

  const [created] = await db.insert(commentsTable).values(comment).returning();

  res.status(201).json({ id: created.id, name: created.name, text: created.text });
});

// DELETE /projects/:projId/comments/:cmtId — delete a comment (owner only)
router.delete("/projects/:projId/comments/:cmtId", async (req, res): Promise<void> => {
  if (!isOwnerReq(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const projId = Array.isArray(req.params.projId) ? req.params.projId[0] : req.params.projId;
  const cmtId = Array.isArray(req.params.cmtId) ? req.params.cmtId[0] : req.params.cmtId;

  const [proj] = await db.select().from(projectsTable).where(eq(projectsTable.id, projId));
  if (!proj) {
    res.status(404).json({ error: "not found" });
    return;
  }

  await db.delete(commentsTable).where(eq(commentsTable.id, cmtId));

  res.json({ ok: true });
});

// POST /projects/:id/files — upload files (owner only), stored as ZIP in DB
router.post("/projects/:id/files", upload.array("files", 50), async (req, res): Promise<void> => {
  if (!isOwnerReq(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [proj] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
  if (!proj) {
    res.status(404).json({ error: "not found" });
    return;
  }

  const uploadedFiles = req.files as Express.Multer.File[] | undefined;
  if (!uploadedFiles || uploadedFiles.length === 0) {
    res.status(400).json({ error: "no files uploaded" });
    return;
  }

  const zipBuf = buildZip(
    uploadedFiles.map((f) => ({ name: f.originalname, data: f.buffer }))
  );

  // Upsert: delete existing file record then insert new one
  await db.delete(projectFilesTable).where(eq(projectFilesTable.projectId, id));
  await db.insert(projectFilesTable).values({
    id: newId("file"),
    projectId: id,
    data: zipBuf,
  });

  await db.update(projectsTable).set({ hasFiles: true }).where(eq(projectsTable.id, id));

  res.json({ ok: true, url: `/api/projects/${id}/files` });
});

// GET /projects/:id/files — download the ZIP for a project
router.get("/projects/:id/files", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [fileRecord] = await db
    .select()
    .from(projectFilesTable)
    .where(eq(projectFilesTable.projectId, id));

  if (!fileRecord) {
    res.status(404).json({ error: "no files for this project" });
    return;
  }

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${id}-files.zip"`);
  res.end(fileRecord.data);
});

export default router;
