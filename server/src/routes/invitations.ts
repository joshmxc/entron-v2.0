import { Router } from "express";
import { authenticate, requireAdmin, requirePermission, requireStaff } from "../middleware/auth";
import { uploadTemplate } from "../middleware/upload";
import * as ctrl from "../controllers/invitations.controller";

const router = Router({ mergeParams: true });

// Webhook has no auth
router.post("/webhook", ctrl.handleWebhook);

router.use(authenticate, requireStaff);

router.get("/", ctrl.listInvitations);
router.get("/templates", ctrl.listTemplates);
router.post("/templates/upload-url", requirePermission("canDesignCards"), ctrl.createTemplateUploadUrl);
router.post("/templates", requirePermission("canDesignCards"), uploadTemplate.single("file"), ctrl.uploadTemplate);
router.patch("/templates/:templateId", requirePermission("canDesignCards"), ctrl.updateTemplate);
router.delete("/templates/:templateId", requirePermission("canDesignCards"), ctrl.deleteTemplate);
router.post("/generate", requirePermission("canDesignCards"), ctrl.generateCards);
router.get("/download-zip", ctrl.downloadZip);

export default router;
