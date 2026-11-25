import { Router } from "express";
import { z } from "zod";
import { authenticate, requireAdmin } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import * as authService from "../services/auth.service";

const router = Router();
router.use(authenticate, requireAdmin);

const createSchema = z.object({
  name: z.string().trim().min(2),
  username: z.string().trim().min(3).regex(/^[a-zA-Z0-9._-]+$/),
  phone: z.string().trim().min(9),
  password: z.string().min(6),
  role: z.enum(["ADMIN", "STAFF"]).default("STAFF"),
  canScan: z.boolean().optional(),
  canManageGuests: z.boolean().optional(),
  canDesignCards: z.boolean().optional(),
  canSendMessages: z.boolean().optional(),
  eventIds: z.array(z.string().uuid()).optional(),
});

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  username: z.string().min(3).regex(/^[a-zA-Z0-9._-]+$/).optional(),
  isActive: z.boolean().optional(),
  role: z.enum(["ADMIN", "STAFF"]).optional(),
  password: z.string().min(6).optional(),
  canScan: z.boolean().optional(),
  canManageGuests: z.boolean().optional(),
  canDesignCards: z.boolean().optional(),
  canSendMessages: z.boolean().optional(),
  eventIds: z.array(z.string().uuid()).optional(),
});

router.get("/", async (_req, res) => {
  const data = await authService.listUsers();
  res.json({ success: true, data });
});

router.post("/", validateBody(createSchema), async (req, res) => {
  const data = await authService.createUser(req.body);
  res.status(201).json({ success: true, data });
});

router.patch("/:id", validateBody(updateSchema), async (req, res) => {
  const data = await authService.updateUser(req.params.id, req.body);
  res.json({ success: true, data });
});

router.delete("/:id", async (req, res) => {
  await authService.deleteUser(req.params.id);
  res.json({ success: true, message: "User deleted" });
});

export default router;
