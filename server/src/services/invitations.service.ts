import sharp from "sharp";
import QRCode from "qrcode";
import { GuestType } from "../../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { generateQRImage } from "../lib/qrcode";
import { readStoredFile, storeFile } from "../lib/storage";

type CardField = {
  id?: string;
  type: "text" | "qr";
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  label?: string;
  sourceColumn?: string | null;
  fallback?: string;
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  fontStyle?: "normal" | "italic";
  color?: string;
  align?: "left" | "center" | "right";
  lineHeight?: number;
  letterSpacing?: number;
  backgroundColor?: string;
  padding?: number;
  qrColor?: string;
  qrBg?: string;
  qrLevel?: "L" | "M" | "Q" | "H";
};

export async function createTemplate(eventId: string, data: {
  name: string;
  fileUrl: string;
  fields: unknown;
  cardType?: GuestType | null;
}) {
  return prisma.invitationTemplate.create({
    data: {
      eventId,
      name: data.name,
      fileUrl: data.fileUrl,
      fields: data.fields as object,
      cardType: data.cardType ?? null,
    },
  });
}

export async function updateTemplate(eventId: string, templateId: string, data: {
  name?: string;
  fileUrl?: string;
  fields?: unknown;
  cardType?: GuestType | null;
}) {
  const template = await prisma.invitationTemplate.findFirst({ where: { id: templateId, eventId } });
  if (!template) throw { status: 404, message: "Card template not found" };

  return prisma.invitationTemplate.update({
    where: { id: templateId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.fileUrl !== undefined && { fileUrl: data.fileUrl }),
      ...(data.fields !== undefined && { fields: data.fields as object }),
      ...(data.cardType !== undefined && { cardType: data.cardType }),
    },
  });
}

export async function deleteTemplate(eventId: string, templateId: string) {
  const template = await prisma.invitationTemplate.findFirst({ where: { id: templateId, eventId } });
  if (!template) throw { status: 404, message: "Card template not found" };
  await prisma.invitationTemplate.delete({ where: { id: templateId } });
  return template.fileUrl;
}

export async function listTemplates(eventId: string) {
  return prisma.invitationTemplate.findMany({ where: { eventId }, orderBy: { createdAt: "desc" } });
}

function legacyFieldsToDesign(fields: Record<string, unknown>): CardField[] {
  const name = fields.guestName as { x?: number; y?: number; size?: number; color?: string } | undefined;
  const qr = fields.qrCode as { x?: number; y?: number; size?: number } | undefined;
  const nameSize = name?.size ?? 48;
  const qrSize = qr?.size ?? 200;

  return [
    ...(name ? [{
      type: "text" as const,
      x: (name.x ?? 120) - nameSize * 4,
      y: (name.y ?? 160) - nameSize * 0.7,
      w: nameSize * 8,
      h: nameSize * 1.4,
      sourceColumn: "fullName",
      fontSize: nameSize,
      fontWeight: 700,
      color: name.color ?? "#ffffff",
      align: "center" as const,
    }] : []),
    ...(qr ? [{
      type: "qr" as const,
      x: (qr.x ?? 120) - qrSize / 2,
      y: (qr.y ?? 300) - qrSize / 2,
      w: qrSize,
      h: qrSize,
      sourceColumn: "qrCode",
    }] : []),
  ];
}

function normalizeFields(value: unknown): CardField[] {
  if (Array.isArray(value)) return value as CardField[];
  if (value && typeof value === "object") return legacyFieldsToDesign(value as Record<string, unknown>);
  return [];
}

type CardGuest = {
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  organization: string | null;
  guestType: GuestType;
  tableNumber: string | null;
  notes: string | null;
  custom: unknown;
  qrCode: string;
  uniqueCode: string;
};

function valueForBinding(key: string, guest: CardGuest, event: {
  name: string;
  venue: string;
  startDate: Date;
}): string {
  const normalizedKey = key.replace(/^guest\./, "");
  if (normalizedKey.startsWith("custom.")) {
    const custom = guest.custom;
    if (custom && typeof custom === "object" && !Array.isArray(custom)) {
      const value = (custom as Record<string, unknown>)[normalizedKey.slice("custom.".length)];
      return value == null ? "" : String(value);
    }
    return "";
  }
  switch (normalizedKey) {
    case "fullName": return `${guest.firstName} ${guest.lastName}`.trim();
    case "firstName": return guest.firstName;
    case "lastName": return guest.lastName;
    case "phone": return guest.phone ?? "";
    case "email": return guest.email ?? "";
    case "organization": return guest.organization ?? "";
    case "guestType": return guest.guestType;
    case "tableNumber": return guest.tableNumber ?? "";
    case "notes": return guest.notes ?? "";
    case "qrCode": return guest.qrCode;
    case "uniqueCode": return guest.uniqueCode;
    case "eventName":
    case "event.name": return event.name;
    case "eventVenue":
    case "event.venue": return event.venue;
    case "eventDate":
    case "event.date": return event.startDate.toLocaleDateString();
    default: return "";
  }
}

function textForField(field: CardField, guest: CardGuest, event: {
  name: string;
  venue: string;
  startDate: Date;
}): string {
  const value = field.sourceColumn ? `{{${field.sourceColumn}}}` : field.text ?? "";
  return value.replace(/\{\{\s*([a-zA-Z0-9_.]+)(?:\s*\|\s*([^}]*))?\s*\}\}/g, (_match, key: string, fallback?: string) =>
    valueForBinding(key, guest, event) || fallback?.trim() || field.fallback || ""
  );
}

function escapeXml(str: string) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function safeColor(value: string | undefined, fallback: string): string {
  return value && /^(#[0-9a-f]{3,8}|transparent)$/i.test(value) ? value : fallback;
}

function wrapText(text: string, maxCharacters: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      if (!word) continue;
      const next = line ? `${line} ${word}` : word;
      if (line && next.length > maxCharacters) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    lines.push(line);
  }
  return lines;
}

function textFieldSvg(field: CardField, value: string, width: number, height: number): Buffer {
  const x = Number.isFinite(field.x) ? field.x : 0;
  const y = Number.isFinite(field.y) ? field.y : 0;
  const w = Math.max(1, Number.isFinite(field.w) ? field.w : 1);
  const h = Math.max(1, Number.isFinite(field.h) ? field.h : 1);
  const fontSize = Math.max(1, Math.min(400, field.fontSize ?? 40));
  const lineHeight = Math.max(1, Math.min(3, field.lineHeight ?? 1.3));
  const padding = Math.max(0, field.padding ?? 8);
  const color = safeColor(field.color, "#332F2A");
  const background = safeColor(field.backgroundColor, "transparent");
  const align = field.align ?? "center";
  const textAnchor = align === "left" ? "start" : align === "right" ? "end" : "middle";
  const textX = align === "left" ? x + padding : align === "right" ? x + w - padding : x + w / 2;
  const maxCharacters = Math.max(1, Math.floor((w - padding * 2) / (fontSize * 0.58)));
  const lines = wrapText(value, maxCharacters);
  const totalHeight = lines.length * fontSize * lineHeight;
  let baseline = y + Math.max(padding, (h - totalHeight) / 2);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rotation = Number.isFinite(field.rotation) ? field.rotation ?? 0 : 0;
  const backgroundRect = background === "transparent"
    ? ""
    : `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${background}"/>`;
  const textLines = lines.map((line) => {
    const item = `<text x="${textX}" y="${baseline + fontSize}" text-anchor="${textAnchor}" font-family="${escapeXml(field.fontFamily ?? "Arial")},sans-serif" font-size="${fontSize}" font-weight="${field.fontWeight ?? 400}" font-style="${field.fontStyle ?? "normal"}" letter-spacing="${field.letterSpacing ?? 0}" fill="${color}">${escapeXml(line)}</text>`;
    baseline += fontSize * lineHeight;
    return item;
  }).join("");

  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g transform="rotate(${rotation} ${cx} ${cy})">${backgroundRect}${textLines}</g></svg>`);
}

export async function generateCards(
  eventId: string,
  templateId: string | null,
  guestIds: string[]
): Promise<{ generated: number; failed: number; failedGuestIds: string[] }> {
  const uniqueGuestIds = [...new Set(guestIds)];
  const [allTemplates, event, selectedGuests] = await Promise.all([
    prisma.invitationTemplate.findMany({ where: { eventId } }),
    prisma.event.findUnique({ where: { id: eventId }, select: { name: true, venue: true, startDate: true } }),
    prisma.guest.findMany({
      where: { eventId, id: { in: uniqueGuestIds } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
        organization: true,
        guestType: true,
        tableNumber: true,
        notes: true,
        custom: true,
        qrCode: true,
        uniqueCode: true,
        qrImageUrl: true,
      },
    }),
  ]);
  if (!event) throw { status: 404, message: "Event not found" };
  if (allTemplates.length === 0) throw { status: 404, message: "No card template found for this event" };
  if (templateId && !allTemplates.some((template) => template.id === templateId)) {
    throw { status: 404, message: "Card template not found for this event" };
  }

  const byType = new Map(allTemplates.map((item) => [item.cardType, item]));

  const fallback = templateId
    ? allTemplates.find((t) => t.id === templateId) ?? null
    : (byType.get(null) ?? allTemplates[0] ?? null);

  let generated = 0;
  let failed = uniqueGuestIds.length - selectedGuests.length;
  const foundGuestIds = new Set(selectedGuests.map((guest) => guest.id));
  const failedGuestIds = uniqueGuestIds.filter((id) => !foundGuestIds.has(id));

  for (const guest of selectedGuests) {
    try {
      const template = byType.get(guest.guestType) ?? fallback;
      if (!template) {
        failed++;
        failedGuestIds.push(guest.id);
        continue;
      }
      const fields = normalizeFields(template.fields);

      // Ensure QR image exists — auto-generate if missing
      let qrImageUrl = guest.qrImageUrl;
      if (!qrImageUrl) {
        qrImageUrl = await generateQRImage(guest.qrCode, eventId);
        await prisma.guest.update({ where: { id: guest.id }, data: { qrImageUrl } });
      }

      const templateImage = await readStoredFile(template.fileUrl, "public");

      const composites: sharp.OverlayOptions[] = [];
      const metadata = await sharp(templateImage).metadata();
      const width = metadata.width ?? 1;
      const height = metadata.height ?? 1;
      const textFields: string[] = [];
      const flushTextFields = () => {
        if (!textFields.length) return;
        composites.push({
          input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${textFields.join("")}</svg>`),
          left: 0,
          top: 0,
        });
        textFields.length = 0;
      };

      for (const field of fields) {
        if (field.type === "text") {
          textFields.push(textFieldSvg(field, textForField(field, guest, event), width, height).toString());
          continue;
        }
        if (field.type !== "qr") continue;
        flushTextFields();

        const qrSize = Math.max(32, Math.min(1024, Math.round(Math.min(field.w, field.h))));
        const qrBuffer = await QRCode.toBuffer(guest.qrCode, {
          type: "png",
          width: qrSize,
          margin: 1,
          errorCorrectionLevel: field.qrLevel ?? "M",
          color: {
            dark: safeColor(field.qrColor, "#0f172a"),
            light: safeColor(field.qrBg, "#ffffff"),
          },
        });
        const { data: rotatedQR, info } = await sharp(qrBuffer)
          .rotate(field.rotation ?? 0, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toBuffer({ resolveWithObject: true });
        const centerX = (field.x ?? 0) + (field.w ?? qrSize) / 2;
        const centerY = (field.y ?? 0) + (field.h ?? qrSize) / 2;
        composites.push({
          input: rotatedQR,
          left: Math.max(0, Math.round(centerX - info.width / 2)),
          top: Math.max(0, Math.round(centerY - info.height / 2)),
        });
      }

      flushTextFields();
      const cardImage = await sharp(templateImage).composite(composites).jpeg({ quality: 92 }).toBuffer();

      const cardUrl = await storeFile("public", `invitations/${eventId}/${guest.id}.jpg`, cardImage, "image/jpeg");
      // Find existing invitation for this guest, then update or create
      const existing = await prisma.guestInvitation.findFirst({ where: { guestId: guest.id } });
      if (existing) {
        await prisma.guestInvitation.update({
          where: { id: existing.id },
          data: { cardUrl, templateId: template.id, status: "PENDING" },
        });
      } else {
        await prisma.guestInvitation.create({
          data: { guestId: guest.id, templateId: template.id, cardUrl, status: "PENDING" },
        });
      }

      generated++;
    } catch (err) {
      console.error(`Card generation failed for guest ${guest.id}:`, err);
      failed++;
      failedGuestIds.push(guest.id);
    }
  }

  return { generated, failed, failedGuestIds };
}

export async function listInvitations(eventId: string, page = 1, pageSize = 50) {
  const guests = await prisma.guest.findMany({
    where: { eventId },
    skip: (page - 1) * pageSize,
    take: pageSize,
    include: { invitations: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  const total = await prisma.guest.count({ where: { eventId } });
  return { data: guests, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export async function updateInvitationStatus(
  messageId: string,
  status: "DELIVERED" | "READ" | "FAILED",
  errorMessage?: string
) {
  const inv = await prisma.guestInvitation.findFirst({ where: { messageId } });
  if (!inv) return;

  const update: Record<string, unknown> = { status };
  if (status === "DELIVERED") update.deliveredAt = new Date();
  if (status === "READ") update.readAt = new Date();
  if (errorMessage) update.errorMessage = errorMessage;

  await prisma.guestInvitation.update({ where: { id: inv.id }, data: update });
}
