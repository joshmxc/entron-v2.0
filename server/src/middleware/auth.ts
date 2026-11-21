import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../lib/jwt";
import { prisma } from "../lib/prisma";

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ success: false, error: "Missing token" });
    return;
  }
  const token = header.slice(7);
  try {
    req.user = verifyAccessToken(token);
    void prisma.user.update({
      where: { id: req.user.sub },
      data: { lastSeenAt: new Date() },
    }).catch(() => undefined);
    next();
  } catch {
    res.status(401).json({ success: false, error: "Invalid or expired token" });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }
  if (req.user.role !== "ADMIN") {
    res.status(403).json({ success: false, error: "Admin access required" });
    return;
  }
  next();
}

export function requireStaff(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }
  next();
}

export function requirePermission(
  permission: "canScan" | "canManageGuests" | "canDesignCards" | "canSendMessages"
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }
    if (req.user.role === "ADMIN") {
      next();
      return;
    }
    const user = await prisma.user.findUnique({
      where: { id: req.user.sub },
      select: { isActive: true, canScan: true, canManageGuests: true, canDesignCards: true, canSendMessages: true },
    });
    if (!user?.isActive) {
      res.status(403).json({ success: false, error: "Account is inactive" });
      return;
    }
    if (!user[permission]) {
      res.status(403).json({ success: false, error: "Permission denied" });
      return;
    }
    next();
  };
}
