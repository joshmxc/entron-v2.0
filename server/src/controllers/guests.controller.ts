import { Request, Response } from "express";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import * as guestsService from "../services/guests.service";
import * as XLSX from "xlsx";
import { ImportOptions, previewGuestExcel } from "../lib/excel";
import { prisma } from "../lib/prisma";
import { createSignedUpload, deleteStoredFile, readStoredFile, storeFile } from "../lib/storage";

const excelContentTypes: Record<string, string[]> = {
  ".xlsx": ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ".xls": ["application/vnd.ms-excel"],
  ".csv": ["text/csv", "application/csv", "text/plain"],
};

function getImportOptions(body: Request["body"]): ImportOptions {
  let columnMap = body.columnMap;
  if (typeof columnMap === "string") {
    try {
      columnMap = JSON.parse(columnMap);
    } catch {
      throw { status: 400, message: "Column mapping must be valid JSON" };
    }
  }
  if (columnMap !== undefined && (!columnMap || typeof columnMap !== "object" || Array.isArray(columnMap) ||
      Object.values(columnMap).some((value) => typeof value !== "string"))) {
    throw { status: 400, message: "Column mapping is invalid" };
  }

  const rawHeaderRow = body.headerRow;
  const headerRow = rawHeaderRow === undefined || rawHeaderRow === ""
    ? undefined
    : Number(rawHeaderRow);
  if (headerRow !== undefined && (!Number.isInteger(headerRow) || headerRow < 0)) {
    throw { status: 400, message: "Header row must be a non-negative integer" };
  }

  const duplicatePolicy = body.duplicatePolicy === undefined
    ? undefined
    : body.duplicatePolicy;
  if (duplicatePolicy !== undefined && duplicatePolicy !== "keep" && duplicatePolicy !== "skip") {
    throw { status: 400, message: "Duplicate policy must be keep or skip" };
  }
  if (body.sheetName !== undefined && typeof body.sheetName !== "string") {
    throw { status: 400, message: "Worksheet name is invalid" };
  }

  return {
    sheetName: body.sheetName || undefined,
    headerRow,
    columnMap,
    duplicatePolicy,
  };
}

export async function list(req: Request, res: Response) {
  const data = await guestsService.listGuests(req.params.eventId, {
    page: Number(req.query.page) || 1,
    pageSize: Number(req.query.pageSize) || 50,
    search: req.query.search as string | undefined,
    checkedIn: req.query.checkedIn === "true" ? true : req.query.checkedIn === "false" ? false : undefined,
  });
  res.json({ success: true, ...data });
}

export async function exportList(req: Request, res: Response) {
  const guests = await guestsService.exportGuests(req.params.eventId);
  const rows = guests.map((guest) => ({
    "Full Name": `${guest.firstName} ${guest.lastName}`.trim(),
    Phone: guest.phone ?? "",
    "Guest Type": guest.guestType,
    "Unique ID": guest.uniqueCode,
  }));
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([["Full Name", "Phone", "Guest Type", "Unique ID"]]);
  XLSX.utils.sheet_add_json(worksheet, rows, { skipHeader: true, origin: "A2" });
  XLSX.utils.book_append_sheet(workbook, worksheet, "Guests");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="event-${req.params.eventId}-guests.xlsx"`);
  res.send(buffer);
}

export async function duplicates(req: Request, res: Response) {
  const groups = await guestsService.findDuplicateGuests(req.params.eventId);
  const duplicateCount = groups.reduce((count, group) => count + group.guests.length - 1, 0);
  res.json({ success: true, data: { groups, duplicateCount } });
}

export async function removeDuplicates(req: Request, res: Response) {
  const data = await guestsService.removeDuplicateGuests(req.params.eventId);
  res.json({ success: true, data });
}

export async function get(req: Request, res: Response) {
  const data = await guestsService.getGuest(req.params.id);
  res.json({ success: true, data });
}

export async function create(req: Request, res: Response) {
  const data = await guestsService.createGuest(req.params.eventId, req.body);
  res.status(201).json({ success: true, data });
}

export async function update(req: Request, res: Response) {
  const data = await guestsService.updateGuest(req.params.id, req.body);
  res.json({ success: true, data });
}

export async function remove(req: Request, res: Response) {
  await guestsService.deleteGuest(req.params.id);
  res.json({ success: true, message: "Guest deleted" });
}

export async function regenerateQR(req: Request, res: Response) {
  const data = await guestsService.regenerateQR(req.params.id);
  res.json({ success: true, data });
}

export async function createImportUploadUrl(req: Request, res: Response) {
  const filename = typeof req.body.filename === "string" ? req.body.filename : "";
  const extension = path.extname(filename).toLowerCase();
  const contentType = typeof req.body.contentType === "string" ? req.body.contentType : "";
  const size = Number(req.body.size);
  if (!filename || !excelContentTypes[extension]?.includes(contentType) || !Number.isFinite(size) || size <= 0 || size > 10 * 1024 * 1024) {
    res.status(400).json({ success: false, error: "Invalid spreadsheet file or file size" });
    return;
  }
  const data = await createSignedUpload("private", `excel/${req.params.eventId}/${uuidv4()}${extension}`);
  res.json({ success: true, data });
}

async function getImportFile(req: Request): Promise<{ buffer: Buffer; filename: string; sourcePath: string }> {
  if (req.file) {
    const extension = path.extname(req.file.originalname).toLowerCase();
    const sourcePath = await storeFile(
      "private",
      `excel/${req.params.eventId}/${uuidv4()}${extension}`,
      req.file.buffer,
      req.file.mimetype
    );
    return { buffer: req.file.buffer, filename: path.basename(req.file.originalname), sourcePath };
  }

  const sourcePath = req.body.storagePath;
  if (typeof sourcePath !== "string" || !sourcePath.startsWith(`excel/${req.params.eventId}/`)) {
    throw { status: 400, message: "No valid spreadsheet file was provided" };
  }
  const filename = typeof req.body.filename === "string" ? path.basename(req.body.filename) : path.basename(sourcePath);
  return { buffer: await readStoredFile(sourcePath, "private"), filename, sourcePath };
}

export async function importExcel(req: Request, res: Response) {
  let options: ImportOptions;
  try {
    options = getImportOptions(req.body);
  } catch (error) {
    if (typeof req.body.storagePath === "string" && req.body.storagePath.startsWith(`excel/${req.params.eventId}/`)) {
      await deleteStoredFile(req.body.storagePath, "private");
    }
    throw error;
  }
  const { buffer, filename, sourcePath } = await getImportFile(req);
  const result = await guestsService.importFromExcel(
    req.params.eventId,
    buffer,
    filename,
    req.user!.sub,
    options,
    sourcePath
  );
  res.json({ success: true, data: result });
}

export async function previewImport(req: Request, res: Response) {
  const { buffer, sourcePath } = await getImportFile(req);
  try {
    const preview = previewGuestExcel(buffer, getImportOptions(req.body));
    res.json({ success: true, data: preview });
  } finally {
    await deleteStoredFile(sourcePath, "private");
  }
}

export async function listImportBatches(req: Request, res: Response) {
  const data = await prisma.importBatch.findMany({
    where: { eventId: req.params.eventId },
    select: {
      id: true,
      filename: true,
      status: true,
      rowCount: true,
      totalRows: true,
      skippedRows: true,
      error: true,
      createdAt: true,
      sourcePath: true,
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  res.json({
    success: true,
    data: data.map(({ sourcePath, ...batch }) => ({ ...batch, hasSourceFile: Boolean(sourcePath) })),
  });
}

export async function downloadImportSource(req: Request, res: Response) {
  const batch = await prisma.importBatch.findFirst({
    where: { id: req.params.batchId, eventId: req.params.eventId },
    select: { filename: true, sourcePath: true },
  });
  if (!batch?.sourcePath) {
    res.status(404).json({ success: false, error: "Original import file not found" });
    return;
  }
  const buffer = await readStoredFile(batch.sourcePath, "private");
  res.attachment(path.basename(batch.filename));
  res.send(buffer);
}
