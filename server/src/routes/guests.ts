import { Router } from "express";
import { z } from "zod";
import { authenticate, requireStaff, requireAdmin, requirePermission, isEventAssignedToStaff } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { uploadExcel } from "../middleware/upload";
import * as ctrl from "../controllers/guests.controller";

const router = Router({ mergeParams: true });
router.use(authenticate, requireStaff);
router.use(async (req, res, next) => {
  if (req.user!.role !== "ADMIN") {
    const eventId = req.params.eventId;
    if (!eventId || !await isEventAssignedToStaff(req.user!.sub, eventId)) {
      res.status(403).json({ success: false, error: "Event is not assigned to this staff account" });
      return;
    }
  }
  next();
});

const createSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().optional().default(""),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  guestType: z.enum(["SINGLE", "DOUBLE", "FAMILY", "VIP"]).default("SINGLE"),
  maxAdmissions: z.number().int().min(1).optional(),
  tableNumber: z.string().optional(),
  seatNumber: z.string().optional(),
  notes: z.string().optional(),
});

const updateSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().optional(),
  phone: z.string().nullable().optional(),
  guestType: z.enum(["SINGLE", "DOUBLE", "FAMILY", "VIP"]).optional(),
  maxAdmissions: z.number().int().min(1).optional(),
  tableNumber: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

router.get("/export", ctrl.exportList);
router.get("/duplicates", requireAdmin, ctrl.duplicates);
router.delete("/duplicates", requireAdmin, ctrl.removeDuplicates);
router.get("/import/batches", ctrl.listImportBatches);
router.get("/import/batches/:batchId/download", ctrl.downloadImportSource);
router.get("/", ctrl.list);
router.post("/", validateBody(createSchema), requirePermission("canManageGuests"), ctrl.create);
router.post("/import/upload-url", requirePermission("canManageGuests"), ctrl.createImportUploadUrl);
router.post("/import/preview", requirePermission("canManageGuests"), uploadExcel.single("file"), ctrl.previewImport);
router.post("/import", requirePermission("canManageGuests"), uploadExcel.single("file"), ctrl.importExcel);
router.get("/:id", ctrl.get);
router.patch("/:id", validateBody(updateSchema), requirePermission("canManageGuests"), ctrl.update);
router.delete("/:id", requireAdmin, ctrl.remove);
router.post("/:id/regenerate-qr", requirePermission("canManageGuests"), ctrl.regenerateQR);

export default router;
