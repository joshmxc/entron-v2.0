import { Router } from "express";
import { z } from "zod";
import { authenticate, requirePermission, requireStaff, isEventAssignedToStaff } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { scanLimiter } from "../middleware/rateLimiter";
import * as ctrl from "../controllers/scans.controller";

const router = Router();
router.use(authenticate, requireStaff);
router.use(async (req, res, next) => {
  if (req.user!.role !== "ADMIN" && Array.isArray(req.body?.items)) {
    for (const item of req.body.items) {
      if (!item?.eventId || !await isEventAssignedToStaff(req.user!.sub, String(item.eventId))) {
        res.status(403).json({ success: false, error: "Event is not assigned to this staff account" });
        return;
      }
    }
  }
  const eventId = req.body?.eventId || req.query.eventId;
  if (req.user!.role !== "ADMIN" && eventId && !await isEventAssignedToStaff(req.user!.sub, String(eventId))) {
    res.status(403).json({ success: false, error: "Event is not assigned to this staff account" });
    return;
  }
  next();
});

const scanSchema = z.object({
  qrCode: z.string().uuid().optional(),
  uniqueCode: z.string().trim().min(4).max(20).optional(),
  eventId: z.string().uuid(),
  offlineTimestamp: z.string().datetime().optional(),
  admissionCount: z.number().int().min(1).max(10).optional(),
}).refine((value) => Boolean(value.qrCode || value.uniqueCode), {
  message: "QR code or unique ID is required",
});

const batchSchema = z.object({
  items: z.array(scanSchema).max(500),
});

router.post("/", scanLimiter, validateBody(scanSchema), requirePermission("canScan"), ctrl.scan);
router.post("/batch-sync", validateBody(batchSchema), requirePermission("canScan"), ctrl.batchSync);
router.get("/", ctrl.list);
router.get("/stats/me", ctrl.staffStats);
router.get("/stats/:staffId", ctrl.staffStats);

export default router;
