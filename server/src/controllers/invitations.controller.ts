import { Request, Response } from "express";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import sharp from "sharp";
import * as invitationsService from "../services/invitations.service";
import { streamZipToResponse } from "../lib/zipper";
import { prisma } from "../lib/prisma";
import { createSignedUpload, deleteStoredFile, publicFileUrl, readStoredFile, storeFile } from "../lib/storage";

const imageContentTypes: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

function validFieldsPayload(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length <= 100 && value.some((field: unknown) =>
      !!field && typeof field === "object" && (field as Record<string, unknown>).type === "qr"
    ) && value.every((field: unknown) => {
      if (!field || typeof field !== "object") return false;
      const item = field as Record<string, unknown>;
      return (item.type === "text" || item.type === "qr")
        && ["x", "y", "w", "h"].every((key) => typeof item[key] === "number" && Number.isFinite(item[key]))
        && Number(item.w) > 0
        && Number(item.h) > 0
        && Number(item.w) <= 10000
        && Number(item.h) <= 10000
        && ["rotation", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "padding"].every((key) =>
          item[key] === undefined || (typeof item[key] === "number" && Number.isFinite(item[key]))
        )
        && ["label", "sourceColumn", "text", "fontFamily", "fontStyle", "color", "align", "backgroundColor", "qrColor", "qrBg", "qrLevel"].every((key) =>
          item[key] === undefined || item[key] === null || typeof item[key] === "string"
        )
        && (item.fontStyle === undefined || item.fontStyle === "normal" || item.fontStyle === "italic")
        && (item.align === undefined || ["left", "center", "right"].includes(item.align as string))
        && (item.qrLevel === undefined || ["L", "M", "Q", "H"].includes(item.qrLevel as string))
        && (item.rotation === undefined || (typeof item.rotation === "number" && Number.isFinite(item.rotation)));
    });
  }
  return !!value && typeof value === "object";
}

export async function listTemplates(req: Request, res: Response) {
  const data = await invitationsService.listTemplates(req.params.eventId);
  res.json({ success: true, data });
}

export async function createTemplateUploadUrl(req: Request, res: Response) {
  const filename = typeof req.body.filename === "string" ? req.body.filename : "";
  const extension = path.extname(filename).toLowerCase();
  const contentType = typeof req.body.contentType === "string" ? req.body.contentType : "";
  const size = Number(req.body.size);
  if (!filename || imageContentTypes[extension] !== contentType || !Number.isFinite(size) || size <= 0 || size > 20 * 1024 * 1024) {
    res.status(400).json({ success: false, error: "Invalid card image or file size" });
    return;
  }
  const data = await createSignedUpload("public", `templates/${req.params.eventId}/${uuidv4()}${extension}`);
  res.json({ success: true, data });
}

export async function uploadTemplate(req: Request, res: Response) {
  let fileUrl: string;
  let filename: string;
  if (req.file) {
    const extension = path.extname(req.file.originalname).toLowerCase();
    if (imageContentTypes[extension] !== req.file.mimetype) {
      res.status(400).json({ success: false, error: "Unsupported card image type" });
      return;
    }
    filename = req.file.originalname;
    fileUrl = await storeFile(
      "public",
      `templates/${req.params.eventId}/${uuidv4()}${extension}`,
      req.file.buffer,
      req.file.mimetype
    );
  } else {
    const storagePath = req.body.storagePath;
    if (typeof storagePath !== "string" || !storagePath.startsWith(`templates/${req.params.eventId}/`)) {
      res.status(400).json({ success: false, error: "No valid card image was provided" });
      return;
    }
    fileUrl = publicFileUrl(storagePath);
    filename = typeof req.body.filename === "string" ? path.basename(req.body.filename) : path.basename(storagePath);
  }

  const image = await readStoredFile(fileUrl, "public");
  if (image.length > 20 * 1024 * 1024) {
    res.status(400).json({ success: false, error: "Card image must be 20 MB or smaller" });
    return;
  }
  const metadata = await sharp(image).metadata();
  if (!metadata.format || !["jpeg", "png", "webp"].includes(metadata.format)) {
    res.status(400).json({ success: false, error: "Unsupported card image type" });
    return;
  }

  let fields: unknown;
  try {
    fields = typeof req.body.fields === "string"
      ? JSON.parse(req.body.fields)
      : req.body.fields ?? [];
  } catch {
    res.status(400).json({ success: false, error: "Invalid card design data" });
    return;
  }
  if (!validFieldsPayload(fields)) {
    res.status(400).json({ success: false, error: "Invalid card design data" });
    return;
  }
  const cardType = req.body.cardType ?? null;
  if (cardType !== null && !["SINGLE", "DOUBLE", "FAMILY", "VIP"].includes(cardType)) {
    res.status(400).json({ success: false, error: "Invalid guest type" });
    return;
  }

  const templateId = req.body.templateId as string | undefined;
  let data;
  if (templateId) {
    const previous = await prisma.invitationTemplate.findFirst({
      where: { id: templateId, eventId: req.params.eventId },
      select: { fileUrl: true },
    });
    if (!previous) { res.status(404).json({ success: false, error: "Card template not found" }); return; }
    const sharedPreviousFile = await prisma.invitationTemplate.count({ where: { fileUrl: previous.fileUrl } }) > 1;
    data = await invitationsService.updateTemplate(req.params.eventId, templateId, {
      name: req.body.name ?? filename,
      fileUrl,
      fields,
      cardType,
    });
    if (!sharedPreviousFile && previous.fileUrl !== fileUrl) {
      await deleteStoredFile(previous.fileUrl, "public");
    }
  } else {
    data = await invitationsService.createTemplate(req.params.eventId, {
      name: req.body.name ?? filename,
      fileUrl,
      fields,
      cardType,
    });
  }
  res.status(201).json({ success: true, data });
}

export async function updateTemplate(req: Request, res: Response) {
  const { templateId } = req.params;
  const { fields, name, cardType } = req.body;
  if (fields !== undefined && !validFieldsPayload(fields)) {
    res.status(400).json({ success: false, error: "Invalid card design data" });
    return;
  }
  if (cardType !== undefined && cardType !== null && !["SINGLE", "DOUBLE", "FAMILY", "VIP"].includes(cardType)) {
    res.status(400).json({ success: false, error: "Invalid guest type" });
    return;
  }
  const data = await invitationsService.updateTemplate(req.params.eventId, templateId, {
    fields,
    name,
    cardType: cardType === undefined ? undefined : cardType ?? null,
  });
  res.json({ success: true, data });
}

export async function deleteTemplate(req: Request, res: Response) {
  const { templateId } = req.params;
  const template = await prisma.invitationTemplate.findFirst({
    where: { id: templateId, eventId: req.params.eventId },
    select: { fileUrl: true },
  });
  const isSharedFile = template
    ? (await prisma.invitationTemplate.count({ where: { fileUrl: template.fileUrl } })) > 1
    : false;
  const fileUrl = await invitationsService.deleteTemplate(req.params.eventId, templateId);
  if (!isSharedFile) await deleteStoredFile(fileUrl, "public");
  res.json({ success: true });
}

export async function generateCards(req: Request, res: Response) {
  const { templateId, guestIds } = req.body;
  if (!Array.isArray(guestIds) || guestIds.length > 500 || guestIds.some((id: unknown) => typeof id !== "string")) {
    res.status(400).json({ success: false, error: "Provide up to 500 guest IDs as an array of strings" });
    return;
  }
  const result = await invitationsService.generateCards(req.params.eventId, templateId ?? null, guestIds);
  res.json({ success: true, data: result });
}

export async function downloadZip(req: Request, res: Response) {
  const { eventId } = req.params;
  const invitations = await prisma.guestInvitation.findMany({
    where: { guest: { eventId }, cardUrl: { not: null } },
    select: {
      cardUrl: true,
      guestId: true,
      guest: { select: { firstName: true, lastName: true } },
    },
  });

  const files = invitations.flatMap((inv) => inv.cardUrl ? [{
    read: () => readStoredFile(inv.cardUrl!, "public"),
    name: `${safeFilePart(inv.guest.firstName)}-${safeFilePart(inv.guest.lastName)}-${inv.guestId.slice(0, 8)}.jpg`,
  }] : []);
  await streamZipToResponse(res, files, `invitations-${eventId}.zip`);
}

function safeFilePart(value: string): string {
  return value.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "guest";
}

export async function listInvitations(req: Request, res: Response) {
  const data = await invitationsService.listInvitations(
    req.params.eventId,
    Number(req.query.page) || 1,
    Number(req.query.pageSize) || 50
  );
  res.json({ success: true, ...data });
}

export async function handleWebhook(req: Request, res: Response) {
  const entries = req.body?.entry ?? [];
  for (const entry of entries) {
    const changes = entry.changes ?? [];
    for (const change of changes) {
      const statuses = change.value?.statuses ?? [];
      for (const s of statuses) {
        const status: "DELIVERED" | "READ" | "FAILED" =
          s.status === "delivered" ? "DELIVERED" : s.status === "read" ? "READ" : "FAILED";
        await invitationsService.updateInvitationStatus(s.id, status);
      }
    }
  }
  res.sendStatus(200);
}
