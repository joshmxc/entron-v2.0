import { Router } from "express";
import { prisma } from "../lib/prisma";

const router = Router();

router.get("/rsvp/:eventId/:token/:uniqueCode", async (req, res) => {
  const event = await prisma.event.findFirst({
    where: { id: req.params.eventId, publicLookupToken: req.params.token, isActive: true },
    select: { id: true, name: true, nameSwahili: true, venue: true, startDate: true },
  });
  if (!event) {
    res.status(404).json({ success: false, error: "Invitation not found" });
    return;
  }

  const guest = await prisma.guest.findFirst({
    where: { eventId: event.id, uniqueCode: req.params.uniqueCode.toUpperCase() },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      guestType: true,
      maxAdmissions: true,
      rsvpStatus: true,
      rsvpAttendees: true,
    },
  });
  if (!guest) {
    res.status(404).json({ success: false, error: "Invitation not found" });
    return;
  }
  res.json({ success: true, data: { event, guest } });
});

router.post("/rsvp/:eventId/:token/:uniqueCode", async (req, res) => {
  const status = req.body?.status;
  const attendees = Number(req.body?.attendees ?? 0);
  if (!["ATTENDING", "DECLINED"].includes(status)) {
    res.status(400).json({ success: false, error: "Invalid RSVP status" });
    return;
  }

  const event = await prisma.event.findFirst({
    where: { id: req.params.eventId, publicLookupToken: req.params.token, isActive: true },
    select: { id: true },
  });
  if (!event) {
    res.status(404).json({ success: false, error: "Invitation not found" });
    return;
  }

  const guest = await prisma.guest.findFirst({
    where: { eventId: event.id, uniqueCode: req.params.uniqueCode.toUpperCase() },
    select: { id: true, maxAdmissions: true },
  });
  if (!guest) {
    res.status(404).json({ success: false, error: "Invitation not found" });
    return;
  }
  const safeAttendees = status === "DECLINED"
    ? 0
    : Math.min(Math.max(1, Number.isFinite(attendees) ? Math.floor(attendees) : 1), guest.maxAdmissions);

  await prisma.guest.update({
    where: { id: guest.id },
    data: {
      rsvpStatus: status,
      rsvpAttendees: safeAttendees,
      rsvpRespondedAt: new Date(),
    },
  });
  res.json({ success: true, data: { status, attendees: safeAttendees } });
});

router.get("/guest-list/:eventId/:token", async (req, res) => {
  const event = await prisma.event.findFirst({
    where: {
      id: req.params.eventId,
      publicLookupToken: req.params.token,
      isActive: true,
    },
    select: { id: true, name: true, nameSwahili: true },
  });
  if (!event) {
    res.status(404).json({ success: false, error: "Guest list not found" });
    return;
  }

  const search = typeof req.query.search === "string"
    ? req.query.search.trim()
    : "";
  const guests = await prisma.guest.findMany({
    where: {
      eventId: event.id,
      ...(search ? {
        OR: [
          { firstName: { contains: search, mode: "insensitive" } },
          { lastName: { contains: search, mode: "insensitive" } },
          { phone: { contains: search } },
        ],
      } : {}),
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 1000,
    select: {
      firstName: true,
      lastName: true,
      phone: true,
    },
  });

  const normalizePhone = (phone: string) => {
    const digits = phone.replace(/\D/g, "");
    if (digits.startsWith("255") && digits.length >= 12) return digits;
    if (digits.startsWith("0") && digits.length === 10) return `255${digits.slice(1)}`;
    if (digits.length === 9 && /^[67]/.test(digits)) return `255${digits}`;
    return digits;
  };

  const phones = guests.map((guest) => guest.phone).filter((phone): phone is string => !!phone);
  const delivered = await prisma.outboundMessage.findMany({
    where: {
      status: "SENT",
      phone: { in: phones },
      channel: { in: ["SMS", "WHATSAPP"] },
    },
    select: { phone: true, channel: true },
  });
  const smsPhones = new Set(delivered.filter((item) => item.channel === "SMS").map((item) => normalizePhone(item.phone)));
  const whatsappPhones = new Set(delivered.filter((item) => item.channel === "WHATSAPP").map((item) => normalizePhone(item.phone)));

  res.json({
    success: true,
    data: {
      eventName: event.nameSwahili || event.name,
      guests: guests.map((guest) => ({
        fullName: `${guest.firstName} ${guest.lastName}`.trim(),
        phone: guest.phone || "",
        smsReceived: !!guest.phone && smsPhones.has(normalizePhone(guest.phone)),
        whatsappReceived: !!guest.phone && whatsappPhones.has(normalizePhone(guest.phone)),
      })),
    },
  });
});

export default router;
