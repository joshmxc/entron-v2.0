import { prisma } from "../lib/prisma";
import { sendBulkSMS as nextSmsBulk, sendWhatsAppMessage, getSMSBalance } from "../lib/nextsms";
import { generateCards } from "./invitations.service";

const WHATSAPP_DELAY = 60; // ms between WhatsApp messages
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function personalize(
  template: string,
  guest: {
    firstName: string;
    lastName: string;
    phone: string | null;
    guestType: "SINGLE" | "DOUBLE" | "FAMILY" | "VIP";
    uniqueCode: string;
    isCheckedIn: boolean;
  }
) {
  const fullName = `${guest.firstName} ${guest.lastName}`.trim();
  const ticket = guest.guestType;
  const status = guest.isCheckedIn ? "Checked In" : "Waiting";
  return template
    .replace(/\{\{guest\}\}|\{\{name\}\}/g, fullName)
    .replace(/\{\{firstName\}\}/g, guest.firstName)
    .replace(/\{\{lastName\}\}/g, guest.lastName)
    .replace(/\{\{phone\}\}/g, guest.phone ?? "")
    .replace(/\{\{ticket\}\}/g, ticket)
    .replace(/\{\{uniqueId\}\}|\{\{uniqueCode\}\}/g, guest.uniqueCode)
    .replace(/\{\{status\}\}/g, status);
}

export async function sendBulkMessages(opts: {
  eventId: string;
  guestIds: string[];
  message: string;
  channel: "WHATSAPP" | "SMS" | "BOTH";
  senderId?: string;
  whatsappAccount?: string;
  whatsappTemplate?: string;
  whatsappMessageParameter?: string;
  whatsappHeaderImage?: boolean;
  date?: string;
  time?: string;
  sentBy: string;
}) {
  const { guestIds, message, channel, senderId, whatsappAccount, whatsappTemplate, whatsappMessageParameter, whatsappHeaderImage, date, time, sentBy } = opts;
  const results = {
    sent: 0,
    failed: 0,
    details: [] as { name: string; phone: string; status: string; channel: string }[],
  };

  // Load all guests in one query
  const guests = await prisma.guest.findMany({
    where: { id: { in: guestIds } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      guestType: true,
      uniqueCode: true,
      isCheckedIn: true,
      qrImageUrl: true,
      admissionsUsed: true,
      tableNumber: true,
      invitations: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  const withPhone = guests.filter((g) => g.phone);
  const noPhone   = guests.filter((g) => !g.phone);

  // Record failures for guests without phone
  noPhone.forEach((g) => {
    results.failed++;
    results.details.push({ name: `${g.firstName} ${g.lastName}`, phone: "—", status: "No phone number", channel });
  });

  // ── SMS via Next SMS (messaging-service.co.tz) ───────────────────────────
  if ((channel === "SMS" || channel === "BOTH") && withPhone.length > 0) {
    try {
      const smsPayload = withPhone.map((g) => ({
        to:   g.phone!,
        text: personalize(message, g),
      }));

      const reference = `entron_${Date.now()}`;
      const bulkResult = await nextSmsBulk(smsPayload, reference, senderId);

      // Persist each result to DB and tally
      for (let i = 0; i < withPhone.length; i++) {
        const guest   = withPhone[i];
        const r       = bulkResult.results[i];
        const body    = smsPayload[i].text;
        const succeeded = r?.status === "SENT";

        await prisma.outboundMessage.create({
          data: {
            sentBy,
            phone:      guest.phone!,
            body,
            channel:    "SMS",
            externalId: r?.messageId ?? null,
            status:     succeeded ? "SENT" : "FAILED",
          },
        });

        if (succeeded) {
          results.sent++;
          results.details.push({ name: `${guest.firstName} ${guest.lastName}`, phone: guest.phone!, status: "Sent", channel: "SMS" });
        } else {
          results.failed++;
          results.details.push({ name: `${guest.firstName} ${guest.lastName}`, phone: guest.phone!, status: "Failed", channel: "SMS" });
        }
      }
    } catch (err) {
      console.error("[NextSMS] Bulk send error:", err);
      // Entire batch failed — mark all as failed
      for (const guest of withPhone) {
        await prisma.outboundMessage.create({
          data: { sentBy, phone: guest.phone!, body: personalize(message, guest), channel: "SMS", status: "FAILED" },
        });
        results.failed++;
        results.details.push({ name: `${guest.firstName} ${guest.lastName}`, phone: guest.phone!, status: "Failed", channel: "SMS" });
      }
    }
  }

  // ── WhatsApp: NextSMS accepts template messages per recipient ─────────
  if (channel === "WHATSAPP" || channel === "BOTH") {
    for (const guest of withPhone) {
      await sleep(WHATSAPP_DELAY);
      const body = personalize(message, guest);
      let cardUrl = guest.invitations[0]?.cardUrl;
      if (whatsappHeaderImage && !cardUrl) cardUrl = guest.qrImageUrl;
      if (whatsappHeaderImage && !cardUrl) {
        await generateCards(opts.eventId, null, [guest.id]);
        const invitation = await prisma.guestInvitation.findFirst({
          where: { guestId: guest.id },
          orderBy: { createdAt: "desc" },
          select: { cardUrl: true },
        });
        cardUrl = invitation?.cardUrl;
      }
      if (whatsappHeaderImage && !cardUrl) {
        await prisma.outboundMessage.create({
          data: { sentBy, phone: guest.phone!, body, channel: "WHATSAPP", status: "FAILED" },
        });
        results.failed++;
        results.details.push({
          name: `${guest.firstName} ${guest.lastName}`,
          phone: guest.phone!,
          status: "Generated card image required",
          channel: "WHATSAPP",
        });
        continue;
      }
      try {
        const externalId = await sendWhatsAppMessage(
          guest.phone!,
          body,
          whatsappAccount,
          whatsappTemplate,
          whatsappMessageParameter,
          whatsappHeaderImage ? cardUrl : undefined,
          date,
          time
        );
        await prisma.outboundMessage.create({
          data: { sentBy, phone: guest.phone!, body, channel: "WHATSAPP", externalId, status: "SENT" },
        });
        results.sent++;
        results.details.push({ name: `${guest.firstName} ${guest.lastName}`, phone: guest.phone!, status: "Sent", channel: "WHATSAPP" });
      } catch (err) {
        console.error(
          "[NextSMS] WhatsApp send failed:",
          err instanceof Error ? err.message : String(err)
        );
        await prisma.outboundMessage.create({
          data: { sentBy, phone: guest.phone!, body, channel: "WHATSAPP", status: "FAILED" },
        });
        results.failed++;
        results.details.push({ name: `${guest.firstName} ${guest.lastName}`, phone: guest.phone!, status: "Failed", channel: "WHATSAPP" });
      }
    }
  }

  return results;
}

export async function listMessages(eventId: string, page = 1, pageSize = 50) {
  const guests = await prisma.guest.findMany({ where: { eventId }, select: { phone: true } });
  const phones = guests.map((g) => g.phone).filter(Boolean) as string[];
  const where = { phone: { in: phones } };

  const [data, total] = await Promise.all([
    prisma.outboundMessage.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { sender: { select: { name: true } } },
    }),
    prisma.outboundMessage.count({ where }),
  ]);
  return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export async function getEventGuests(eventId: string) {
  return prisma.guest.findMany({
    where: { eventId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      guestType: true,
      invitations: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { cardUrl: true },
      },
    },
    orderBy: { lastName: "asc" },
  });
}

export { getSMSBalance };
