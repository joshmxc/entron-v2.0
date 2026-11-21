import { Router } from "express";
import { authenticate, requirePermission, requireStaff, isEventAssignedToStaff } from "../middleware/auth";
import * as ctrl from "../controllers/messages.controller";

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

router.get("/", ctrl.listMessages);
router.get("/guests", ctrl.getGuests);
router.get("/balance", ctrl.getSMSBalance);
router.post("/send", requirePermission("canSendMessages"), ctrl.sendMessages);

export default router;
