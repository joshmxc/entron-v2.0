import { prisma } from "../lib/prisma";
import { isNextSmsConfigured, sendSMS } from "../lib/nextsms";
import { ScanPayload, ScanResult } from "../types";

const WELCOME_SMS_DELAY_MS = 15_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function processScan(
  payload: ScanPayload,
  staffId: string,
  deviceInfo?: string
): Promise<ScanResult> {
  const identifier = payload.uniqueCode
    ? payload.uniqueCode.trim().toUpperCase().replace(/\s+/g, "")
    : payload.qrCode;
  if (!identifier) {
    return { status: "INVALID_QR", message: "QR code or unique ID is required" };
  }
  const guest = payload.uniqueCode
    ? await prisma.guest.findUnique({
        where: { uniqueCode: identifier },
        include: { event: { select: { name: true } } },
      })
    : await prisma.guest.findUnique({
        where: { qrCode: identifier },
        include: { event: { select: { name: true } } },
      });
  if (!guest) {
    const result: ScanResult = payload.uniqueCode
      ? { status: "INVALID_QR", message: "Unique ID not found" }
      : { status: "INVALID_QR", message: "QR code not found" };
    return result;
  }
  if (guest.eventId !== payload.eventId) {
    const result: ScanResult = { status: "WRONG_EVENT", message: "QR code belongs to a different event" };
    return result;
  }

  const requestedAdmissions = payload.admissionCount;
  if (
    requestedAdmissions === undefined &&
    (guest.guestType === "DOUBLE" || guest.guestType === "FAMILY")
  ) {
    return {
      status: "PENDING_ADMISSIONS",
      guest: {
        id: guest.id,
        firstName: guest.firstName,
        lastName: guest.lastName,
        guestType: guest.guestType,
        maxAdmissions: guest.maxAdmissions,
        admissionsUsed: guest.admissionsUsed,
        tableNumber: guest.tableNumber,
      },
      admissionCount: 0,
      message: "Choose how many guests are attending",
    };
  }

  const admissionCount = requestedAdmissions ?? 1;
  if (admissionCount > guest.maxAdmissions) {
    return {
      status: "LIMIT_REACHED",
      guest: {
        id: guest.id,
        firstName: guest.firstName,
        lastName: guest.lastName,
        guestType: guest.guestType,
        maxAdmissions: guest.maxAdmissions,
        admissionsUsed: guest.admissionsUsed,
        tableNumber: guest.tableNumber,
      },
      admissionCount: 0,
      message: `Cannot admit ${admissionCount}; maximum is ${guest.maxAdmissions}`,
    };
  }

  const { admissionsUsed, maxAdmissions, welcomeSmsClaimed, limitReached } = await prisma.$transaction(async (tx) => {
    const updatedGuests = await tx.$queryRaw<Array<{ admissions_used: number }>>`
      UPDATE "guests"
      SET "admissions_used" = "admissions_used" + ${admissionCount},
          "is_checked_in" = TRUE,
          "checked_in_at" = COALESCE("checked_in_at", NOW())
      WHERE "id" = ${guest.id}
        AND "admissions_used" + ${admissionCount} <= "max_admissions"
      RETURNING "admissions_used"
    `;

    if (updatedGuests.length === 0) {
      const currentGuest = await tx.guest.findUnique({
        where: { id: guest.id },
        select: { maxAdmissions: true, admissionsUsed: true },
      });
      if (!currentGuest) throw new Error("Guest was removed while processing the scan");

      await tx.scan.create({
        data: {
          guestId: guest.id,
          eventId: payload.eventId,
          staffId,
          status: "LIMIT_REACHED",
          admissionCount: 0,
          deviceInfo,
        },
      });
      return {
        admissionsUsed: currentGuest.admissionsUsed,
        welcomeSmsClaimed: false,
        limitReached: true,
        maxAdmissions: currentGuest.maxAdmissions,
      };
    }

    await tx.scan.create({
      data: {
        guestId: guest.id,
        eventId: payload.eventId,
        staffId,
        status: "SUCCESS",
        admissionCount,
        deviceInfo,
        syncedFromOffline: !!payload.offlineTimestamp,
        originalTimestamp: payload.offlineTimestamp ? new Date(payload.offlineTimestamp) : undefined,
      },
    });
    const welcomeSmsClaimed = !!guest.phone && isNextSmsConfigured()
      ? (await tx.guest.updateMany({
          where: { id: guest.id, welcomeSmsAttemptedAt: null },
          data: { welcomeSmsAttemptedAt: new Date() },
        })).count === 1
      : false;
    return {
      admissionsUsed: updatedGuests[0].admissions_used,
      welcomeSmsClaimed,
      limitReached: false,
      maxAdmissions: guest.maxAdmissions,
    };
  });

  if (limitReached) {
    return {
      status: "LIMIT_REACHED",
      guest: {
        id: guest.id,
        firstName: guest.firstName,
        lastName: guest.lastName,
        guestType: guest.guestType,
        maxAdmissions,
        admissionsUsed,
        tableNumber: guest.tableNumber,
      },
      message: `Entry limit reached (${admissionsUsed}/${maxAdmissions})`,
    };
  }

  if (welcomeSmsClaimed && guest.phone) {
    const guestName = `${guest.firstName} ${guest.lastName}`.trim();
    const body =
      `Karibu ${guestName}!\n\n` +
      `Tunafurahi kukukaribisha kwenye Harusi ya ${guest.event.name}.  ` +
      `Tunakutakia muda mzuri wa kusherehekea pamoja nasi. ✨\n\n` +
      `Uthibitisho wako wa kuingia kwenye tukio umekamilika.✅\n` +
      `Karibu sana, na tufurahie pamoja! 🥂`;
    try {
      await sleep(WELCOME_SMS_DELAY_MS);
      const sms = await sendSMS(guest.phone, body, "HARUSI");
      await prisma.outboundMessage.create({
        data: {
          sentBy: staffId,
          phone: guest.phone,
          body,
          channel: "SMS",
          externalId: sms.messageId || null,
          status: sms.status === "SENT" ? "SENT" : "FAILED",
        },
      });
      if (sms.status !== "SENT") {
        console.error(`[Scan] Welcome SMS was not sent for guest ${guest.id}: ${sms.error ?? sms.status}`);
      }
    } catch (err) {
      console.error(`[Scan] Welcome SMS attempt failed for guest ${guest.id}:`, err);
    }
  }

  const result: ScanResult = {
    status: "SUCCESS",
    guest: {
      id: guest.id,
      firstName: guest.firstName,
      lastName: guest.lastName,
      guestType: guest.guestType,
      maxAdmissions: guest.maxAdmissions,
      admissionsUsed,
      tableNumber: guest.tableNumber,
    },
    admissionCount,
    message: `Welcome, ${guest.firstName} ${guest.lastName}!`,
  };

  return result;
}

export async function batchSync(
  items: ScanPayload[],
  staffId: string
): Promise<{ synced: number; errors: number }> {
  let synced = 0;
  let errors = 0;
  for (const item of items) {
    try {
      await processScan(item, staffId);
      synced++;
    } catch {
      errors++;
    }
  }
  return { synced, errors };
}

export async function getScans(eventId: string, staffId?: string, page = 1, pageSize = 50) {
  const where: Record<string, unknown> = { eventId };
  if (staffId) where.staffId = staffId;

  const [data, total] = await Promise.all([
    prisma.scan.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: "desc" },
      include: {
        guest: { select: { firstName: true, lastName: true, guestType: true } },
        staff: { select: { name: true } },
      },
    }),
    prisma.scan.count({ where }),
  ]);

  return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export async function getStaffStats(staffId: string, eventId?: string) {
  const where: Record<string, unknown> = { staffId };
  if (eventId) where.eventId = eventId;

  const [total, byStatus, recentScans] = await Promise.all([
    prisma.scan.count({ where }),
    prisma.scan.groupBy({ by: ["status"], where, _count: true }),
    prisma.scan.findMany({
      where,
      take: 20,
      orderBy: { createdAt: "desc" },
      include: {
        guest: { select: { firstName: true, lastName: true, guestType: true } },
      },
    }),
  ]);

  const statusMap: Record<string, number> = {};
  byStatus.forEach((s: { status: string; _count: number }) => { statusMap[s.status] = s._count; });

  return { total, ...statusMap, recentScans };
}
