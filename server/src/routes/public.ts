import { Router } from "express";
import { prisma } from "../lib/prisma";

const router = Router();

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

  res.json({
    success: true,
    data: {
      eventName: event.nameSwahili || event.name,
      guests: guests.map((guest) => ({
        fullName: `${guest.firstName} ${guest.lastName}`.trim(),
        phone: guest.phone || "",
      })),
    },
  });
});

export default router;
