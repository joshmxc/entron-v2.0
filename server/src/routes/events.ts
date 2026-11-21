import { Router } from "express";
import { z } from "zod";
import { authenticate, requireAdmin, requireStaff, isEventAssignedToStaff } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import * as ctrl from "../controllers/events.controller";

const router = Router();
router.use(authenticate);

const createSchema = z.object({
  name: z.string().min(1),
  nameSwahili: z.string().optional(),
  description: z.string().optional(),
  venue: z.string().min(1),
  venueSwahili: z.string().optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  venue: z.string().min(1).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().nullable().optional(),
  isActive: z.boolean().optional(),
});

router.get("/", requireStaff, ctrl.list);
router.get("/:id", requireStaff, async (req, res) => {
  if (req.user!.role !== "ADMIN" && !await isEventAssignedToStaff(req.user!.sub, req.params.id)) {
    res.status(403).json({ success: false, error: "Event is not assigned to this staff account" });
    return;
  }
  return ctrl.get(req, res);
});
router.get("/:id/stats", requireStaff, async (req, res) => {
  if (req.user!.role !== "ADMIN" && !await isEventAssignedToStaff(req.user!.sub, req.params.id)) {
    res.status(403).json({ success: false, error: "Event is not assigned to this staff account" });
    return;
  }
  return ctrl.stats(req, res);
});
router.post("/", requireAdmin, validateBody(createSchema), ctrl.create);
router.patch("/:id", requireAdmin, validateBody(updateSchema), ctrl.update);
router.delete("/:id", requireAdmin, ctrl.remove);

export default router;
