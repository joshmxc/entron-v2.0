import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { getEventStats } from "../services/events.service";
import { getStaffStats } from "../services/scans.service";

export async function adminStats(req: Request, res: Response) {
  const { eventId } = req.query;
  if (!eventId) { res.status(400).json({ success: false, error: "eventId required" }); return; }

  const [eventStats, staffList] = await Promise.all([
    getEventStats(eventId as string),
    prisma.user.findMany({
      where: { role: "STAFF", isActive: true },
      select: { id: true, name: true },
    }),
  ]);

  const staffStats = await Promise.all(
    staffList.map(async (staff) => ({
      ...staff,
      ...(await getStaffStats(staff.id, eventId as string)),
    }))
  );

  const paymentSummary = await prisma.payment.aggregate({
    where: { eventId: eventId as string, status: "COMPLETED" },
    _sum: { amount: true },
    _count: true,
  });

  res.json({
    success: true,
    data: {
      event: eventStats,
      staff: staffStats,
      payments: {
        total: paymentSummary._count,
        amount: paymentSummary._sum.amount ?? 0,
      },
    },
  });
}

export async function staffDashboard(req: Request, res: Response) {
  const staffId = req.user!.sub;
  const { eventId } = req.query;
  if (!eventId) {
    res.status(400).json({ success: false, error: "eventId required" });
    return;
  }
  const assignment = await prisma.staffEventAssignment.findUnique({
    where: { userId_eventId: { userId: staffId, eventId: eventId as string } },
  });
  if (!assignment) {
    res.status(403).json({ success: false, error: "Event is not assigned to this staff account" });
    return;
  }
  const [eventStats, staffStats] = await Promise.all([
    getEventStats(eventId as string),
    getStaffStats(staffId, eventId as string),
  ]);
  res.json({
    success: true,
    data: {
      event: eventStats,
      staff: staffStats,
    },
  });
}
