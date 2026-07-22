import { Router, type IRouter } from "express";
import { OWNER_USERNAME, OWNER_PASSWORD, OWNER_SECRET, isOwnerReq } from "../lib/auth.js";

const router: IRouter = Router();

router.post("/auth/login", async (req, res): Promise<void> => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (username === OWNER_USERNAME && password === OWNER_PASSWORD) {
    res.json({ token: OWNER_SECRET, username: OWNER_USERNAME });
    return;
  }
  res.status(401).json({ error: "Invalid credentials" });
});

router.get("/auth/verify", async (req, res): Promise<void> => {
  const ok = isOwnerReq(req);
  res.status(ok ? 200 : 401).json({ ok });
});

export default router;
