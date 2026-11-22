import { prisma } from "../lib/prisma";
import { getSMSBalance, sendWhatsAppTemplateBatch } from "../lib/nextsms";
import { generateCards } from "./invitations.service";

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
  channel: "WHATSAPP";
  senderId?: string;
  whatsappAccount?: string;
  whatsappTemplate?: string;
  whatsappMessageParameter?: string;
  date?: string;
  time?: string;
  sentBy: string;
}) {
  const { guestIds, message, whatsappAccount, whatsappTemplate, whatsappMessageParameter, date, time, sentBy } = opts;
  const channel = "WHATSAPP" as const;
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

  // ── WhatsApp template messages via NextSMS (one batch, one recipient order) ─
  if (channel === "WHATSAPP" && withPhone.length > 0) {
    const recipients: { guest: typeof withPhone[number]; body: string; imageUrl?: string }[] = [];
    for (const guest of withPhone) {
      const body = personalize(message, guest);
      let cardUrl = guest.invitations[0]?.cardUrl;
      if (!cardUrl) {
        await generateCards(opts.eventId, null, [guest.id]);
        const invitation = await prisma.guestInvitation.findFirst({
          where: { guestId: guest.id },
          orderBy: { createdAt: "desc" },
          select: { cardUrl: true },
        });
        cardUrl = invitation?.cardUrl;
      }
      if (!cardUrl) {
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
      recipients.push({ guest, body, imageUrl: cardUrl });
    }

    if (recipients.length > 0) {
      try {
        const batch = await sendWhatsAppTemplateBatch(
          recipients.map((recipient) => ({
            to: recipient.guest.phone!,
            personalisationValue: recipient.body,
            imageUrl: recipient.imageUrl,
          })),
          whatsappAccount,
          whatsappTemplate,
          whatsappMessageParameter,
          date,
          time
        );

        for (let i = 0; i < recipients.length; i++) {
          const recipient = recipients[i];
          const r = batch.results[i];
          const succeeded = r?.status === "SENT";
          await prisma.outboundMessage.create({
            data: {
              sentBy,
              phone: recipient.guest.phone!,
              body: recipient.body,
              channel: "WHATSAPP",
              externalId: r?.messageId || null,
              status: succeeded ? "SENT" : "FAILED",
            },
          });
          if (succeeded) {
            results.sent++;
            results.details.push({
              name: `${recipient.guest.firstName} ${recipient.guest.lastName}`,
              phone: recipient.guest.phone!,
              status: "Sent",
              channel: "WHATSAPP",
            });
          } else {
            results.failed++;
            results.details.push({
              name: `${recipient.guest.firstName} ${recipient.guest.lastName}`,
              phone: recipient.guest.phone!,
              status: r?.error || "Failed",
              channel: "WHATSAPP",
            });
          }
        }
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        console.error("[NextSMS] WhatsApp batch send failed:", detail);
        for (const recipient of recipients) {
          await prisma.outboundMessage.create({
            data: { sentBy, phone: recipient.guest.phone!, body: recipient.body, channel: "WHATSAPP", status: "FAILED" },
          });
          results.failed++;
          results.details.push({
            name: `${recipient.guest.firstName} ${recipient.guest.lastName}`,
            phone: recipient.guest.phone!,
            status: detail,
            channel: "WHATSAPP",
          });
        }
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
