import { Router } from "express";
import { z } from "zod";
import { authenticate, requireStaff } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import * as ctrl from "../controllers/payments.controller";
import { config } from "../config";
import { isEventAssignedToStaff } from "../middleware/auth";

const router = Router();

// Callbacks are public (webhook from payment providers)
router.post("/mpesa/callback", (req, res, next) => {
  const secret = req.headers["x-callback-secret"] || req.headers["x-mpesa-secret"];
  if (!config.mpesa.callbackSecret || secret !== config.mpesa.callbackSecret) {
    res.status(401).json({ success: false, error: "Invalid M-Pesa callback credential" });
    return;
  }
  next();
}, ctrl.mpesaCallback);
router.post("/airtel/callback", (req, res, next) => {
  const secret = req.headers["x-callback-secret"] || req.headers["x-airtel-secret"];
  if (!config.airtel.callbackSecret || secret !== config.airtel.callbackSecret) {
    res.status(401).json({ success: false, error: "Invalid Airtel callback credential" });
    return;
  }
  next();
}, ctrl.airtelCallback);

router.use(authenticate, requireStaff);
router.use(async (req, res, next) => {
  if (req.user!.role === "ADMIN") { next(); return; }
  const eventId = req.method === "GET"
    ? String(req.query.eventId ?? "")
    : String(req.body?.eventId ?? "");
  if (!eventId || !await isEventAssignedToStaff(req.user!.sub, eventId)) {
    res.status(403).json({ success: false, error: "Event is not assigned to this staff account" });
    return;
  }
  next();
});

const initiateSchema = z.object({
  eventId: z.string().uuid(),
  guestId: z.string().uuid().optional(),
  phone: z.string().min(9),
  amount: z.number().positive(),
  provider: z.enum(["MPESA", "AIRTEL", "TIGO_PESA", "CASH"]),
  description: z.string().optional(),
});

router.post("/initiate", validateBody(initiateSchema), ctrl.initiate);
router.get("/", ctrl.list);
router.get("/:id", ctrl.getOne);

export default router;
