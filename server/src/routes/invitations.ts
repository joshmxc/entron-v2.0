import { Router } from "express";
import { authenticate, requireAdmin, requirePermission, requireStaff, isEventAssignedToStaff } from "../middleware/auth";
import { uploadTemplate } from "../middleware/upload";
import * as ctrl from "../controllers/invitations.controller";
import crypto from "crypto";
import { config } from "../config";

const router = Router({ mergeParams: true });

router.post("/webhook", (req, res, next) => {
  const suppliedSecret = String(req.headers["x-webhook-secret"] ?? "");
  if (config.whatsapp.webhookVerifyToken && suppliedSecret === config.whatsapp.webhookVerifyToken) {
    next();
    return;
  }
  const signature = String(req.headers["x-hub-signature-256"] ?? "");
  if (config.whatsapp.appSecret && signature.startsWith("sha256=")) {
    const expected = `sha256=${crypto.createHmac("sha256", config.whatsapp.appSecret).update(JSON.stringify(req.body)).digest("hex")}`;
    if (signature.length === expected.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      next();
      return;
    }
  }
  res.status(401).json({ success: false, error: "Invalid WhatsApp webhook credential" });
}, ctrl.handleWebhook);

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

router.get("/", ctrl.listInvitations);
router.get("/templates", ctrl.listTemplates);
router.post("/templates/upload-url", requirePermission("canDesignCards"), ctrl.createTemplateUploadUrl);
router.post("/templates", requirePermission("canDesignCards"), uploadTemplate.single("file"), ctrl.uploadTemplate);
router.patch("/templates/:templateId", requirePermission("canDesignCards"), ctrl.updateTemplate);
router.delete("/templates/:templateId", requirePermission("canDesignCards"), ctrl.deleteTemplate);
router.post("/generate", requirePermission("canDesignCards"), ctrl.generateCards);
router.get("/download-zip", ctrl.downloadZip);

export default router;
