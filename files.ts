import { Router, type IRouter } from "express";
import { db, projectsTable, projectFilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { isOwnerReq } from "../lib/auth.js";
import { buildZip } from "../lib/zip.js";

const router: IRouter = Router();

// GET /files/all — owner only, download semua ZIP semua project jadi satu ZIP besar
router.get("/files/all", async (req, res): Promise<void> => {
  if (!isOwnerReq(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const files = await db.select().from(projectFilesTable);

  if (files.length === 0) {
    res.status(404).json({ error: "Belum ada file yang diupload" });
    return;
  }

  // Ambil nama project untuk tiap file
  const projects = await db.select().from(projectsTable);
  const projMap = new Map(projects.map((p) => [p.id, p.title]));

  // Tiap project ZIP jadi satu entry di ZIP besar, dengan nama project-nya
  const entries = files.map((f) => {
    const title = projMap.get(f.projectId) ?? f.projectId;
    const safeName = title.replace(/[^a-zA-Z0-9_\-. ]/g, "_");
    return { name: `${safeName}.zip`, data: f.data };
  });

  const allZip = buildZip(entries);

  const date = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="drakzx-all-files-${date}.zip"`);
  res.end(allZip);
});

export default router;
