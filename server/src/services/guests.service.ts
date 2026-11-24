import { v4 as uuidv4 } from "uuid";
import { prisma } from "../lib/prisma";
import { generateQRImage } from "../lib/qrcode";
import { ImportOptions, parseGuestExcel, GuestRow } from "../lib/excel";
import crypto from "crypto";

function generateUniqueCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += alphabet[crypto.randomInt(alphabet.length)];
  }
  return `ENT-${code}`;
}

async function createUniqueCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateUniqueCode();
    const existing = await prisma.guest.findUnique({ where: { uniqueCode: code } }).catch(() => null);
    if (!existing) return code;
  }
  throw new Error("Could not generate a unique guest code");
}

function admissionsForType(type: string, custom?: number): number {
  if (type === "SINGLE") return 1;
  if (type === "DOUBLE") return 2;
  if (type === "VIP") return 1;
  return custom ?? 1;
}

export async function createGuest(eventId: string, data: {
  firstName: string;
  lastName?: string;
  phone?: string;
  email?: string;
  organization?: string;
  guestType?: string;
  maxAdmissions?: number;
  tableNumber?: string;
  seatNumber?: string;
  notes?: string;
  custom?: Record<string, string>;
  validationWarnings?: string[];
  importBatchId?: string;
}) {
  const guestType = (data.guestType ?? "SINGLE") as "SINGLE" | "DOUBLE" | "FAMILY" | "VIP";
  const maxAdmissions = admissionsForType(guestType, data.maxAdmissions);
  const qrCode = uuidv4();
  const uniqueCode = await createUniqueCode();

  const qrImageUrl = await generateQRImage(qrCode, eventId);

  return prisma.guest.create({
    data: {
      eventId,
      firstName: data.firstName,
      lastName: data.lastName ?? "",
      phone: data.phone,
      email: data.email,
      organization: data.organization,
      guestType,
      maxAdmissions,
      tableNumber: data.tableNumber,
      seatNumber: data.seatNumber,
      notes: data.notes,
      custom: data.custom && Object.keys(data.custom).length ? data.custom : undefined,
      validationWarnings: data.validationWarnings?.length ? data.validationWarnings : undefined,
      importBatchId: data.importBatchId,
      qrCode,
      uniqueCode,
      qrImageUrl,
    },
  });
}

export async function listGuests(eventId: string, opts: {
  page?: number;
  pageSize?: number;
  search?: string;
  checkedIn?: boolean;
}) {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 50;
  const skip = (page - 1) * pageSize;

  const where: Record<string, unknown> = { eventId };
  if (opts.search) {
    where.OR = [
      { firstName: { contains: opts.search, mode: "insensitive" } },
      { lastName: { contains: opts.search, mode: "insensitive" } },
      { phone: { contains: opts.search } },
      { uniqueCode: { contains: opts.search, mode: "insensitive" } },
    ];
  }
  if (typeof opts.checkedIn === "boolean") where.isCheckedIn = opts.checkedIn;

  const [data, total] = await Promise.all([
    prisma.guest.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { lastName: "asc" },
      include: { _count: { select: { scans: true } } },
    }),
    prisma.guest.count({ where }),
  ]);

  return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export async function exportGuests(eventId: string) {
  return prisma.guest.findMany({
    where: { eventId },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: {
      firstName: true,
      lastName: true,
      phone: true,
      guestType: true,
      uniqueCode: true,
      qrCode: true,
    },
  });
}

export async function findDuplicateGuests(eventId: string) {
  const guests = await prisma.guest.findMany({
    where: { eventId, phone: { not: null } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      isCheckedIn: true,
      admissionsUsed: true,
      createdAt: true,
      _count: { select: { scans: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  const grouped = new Map<string, typeof guests>();

  for (const guest of guests) {
    const name = `${guest.firstName} ${guest.lastName}`.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
    const phone = guest.phone?.replace(/\D/g, "") ?? "";
    if (!name || !phone) continue;

    const key = `${name}\u0000${phone}`;
    const group = grouped.get(key);
    if (group) group.push(guest);
    else grouped.set(key, [guest]);
  }

  return [...grouped.values()]
    .filter((group) => group.length > 1)
    .map((group) => ({
      guests: group.sort((a, b) =>
        Number(b.isCheckedIn) - Number(a.isCheckedIn) ||
        b._count.scans - a._count.scans ||
        b.admissionsUsed - a.admissionsUsed ||
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.id.localeCompare(b.id)
      ),
    }));
}

export async function removeDuplicateGuests(eventId: string) {
  const groups = await findDuplicateGuests(eventId);
  const ids = groups.flatMap((group) => group.guests.slice(1).map((guest) => guest.id));
  if (ids.length === 0) return { groups: groups.length, deleted: 0 };

  const result = await prisma.guest.deleteMany({
    where: { eventId, id: { in: ids } },
  });
  return { groups: groups.length, deleted: result.count };
}

export async function getGuest(eventId: string, id: string) {
  const guest = await prisma.guest.findUnique({
    where: { id, eventId },
    include: { scans: { include: { staff: { select: { name: true } } }, orderBy: { createdAt: "desc" } } },
  });
  if (!guest) throw { status: 404, message: "Guest not found" };
  return guest;
}

export async function updateGuest(eventId: string, id: string, data: Partial<{
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string;
  organization: string | null;
  guestType: "SINGLE" | "DOUBLE" | "FAMILY" | "VIP";
  maxAdmissions: number;
  tableNumber: string | null;
  seatNumber: string;
  notes: string | null;
  custom: Record<string, string> | null;
}>) {
  const existing = await prisma.guest.findFirst({ where: { id, eventId }, select: { id: true } });
  if (!existing) throw { status: 404, message: "Guest not found in this event" };
  return prisma.guest.update({ where: { id }, data: data as Parameters<typeof prisma.guest.update>[0]["data"] });
}

export async function deleteGuest(eventId: string, id: string) {
  const existing = await prisma.guest.findFirst({ where: { id, eventId }, select: { id: true } });
  if (!existing) throw { status: 404, message: "Guest not found in this event" };
  await prisma.guest.delete({ where: { id } });
}

export async function regenerateQR(eventId: string, id: string) {
  const guest = await prisma.guest.findFirst({ where: { id, eventId } });
  if (!guest) throw { status: 404, message: "Guest not found" };

  const qrCode = uuidv4();
  const qrImageUrl = await generateQRImage(qrCode, guest.eventId);

  return prisma.guest.update({ where: { id }, data: { qrCode, qrImageUrl } });
}

export async function importFromExcel(
  eventId: string,
  buffer: Buffer,
  filename: string,
  importedBy: string,
  options: ImportOptions,
  sourcePath: string
): Promise<{
  batchId: string;
  totalRows: number;
  imported: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
  warnings: Array<{ row: number; message: string }>;
}> {
  const importBatch = await prisma.importBatch.create({
    data: {
      eventId,
      filename,
      sourcePath,
      status: "PENDING",
      rowCount: 0,
      totalRows: 0,
      skippedRows: 0,
      importedBy,
      columnMap: options.columnMap ?? {},
    },
  });

  try {
    const parsed = parseGuestExcel(buffer, options);
    const errors = [...parsed.errors];
    const warnings: Array<{ row: number; message: string }> = [];
    if (parsed.totalRows === 0 || errors.some((item) => item.row === 0)) {
      await prisma.importBatch.update({
        where: { id: importBatch.id },
        data: {
          status: "FAILED",
          totalRows: parsed.totalRows,
          skippedRows: parsed.totalRows,
          error: errors.map((item) => item.message).join("; "),
        },
      });
      return {
        batchId: importBatch.id,
        totalRows: parsed.totalRows,
        imported: 0,
        skipped: parsed.totalRows,
        errors,
        warnings,
      };
    }

    const existing = await prisma.guest.findMany({
      where: { eventId },
      select: { firstName: true, lastName: true, phone: true, email: true, seatNumber: true },
    });
    const seenEmails = new Set(existing.map((guest) => guest.email?.trim().toLowerCase()).filter(Boolean) as string[]);
    const seenSeats = new Set(existing.map((guest) => guest.seatNumber?.trim().toLowerCase()).filter(Boolean) as string[]);
    const identityKey = (firstName: string, lastName: string, phone: string) => {
      const name = `${firstName} ${lastName}`.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
      const normalizedPhone = phone.replace(/\D/g, "");
      return name && normalizedPhone ? `${name}\u0000${normalizedPhone}` : "";
    };
    const seenIdentities = new Set(existing
      .map((guest) => identityKey(guest.firstName, guest.lastName, guest.phone ?? ""))
      .filter(Boolean));
    const importRows: GuestRow[] = [];
    for (const row of parsed.rows) {
      const rowWarnings = [...row.warnings];
      const duplicateParts: string[] = [];
      const emailKey = row.email?.trim().toLowerCase();
      const seatKey = row.seatNumber?.trim().toLowerCase();
      const identity = identityKey(row.firstName, row.lastName, row.phone);
      if (emailKey && seenEmails.has(emailKey)) duplicateParts.push("Email already exists in this event");
      if (seatKey && seenSeats.has(seatKey)) duplicateParts.push("Seat number already exists in this event");
      if (identity && seenIdentities.has(identity)) duplicateParts.push("Guest with the same full name and phone already exists");

      if (duplicateParts.length && options.duplicatePolicy === "skip") {
        errors.push({ row: row.sourceRow, message: duplicateParts.join("; ") });
        continue;
      }
      if (duplicateParts.length) rowWarnings.push(...duplicateParts);
      if (emailKey) seenEmails.add(emailKey);
      if (seatKey) seenSeats.add(seatKey);
      if (identity) seenIdentities.add(identity);
      if (rowWarnings.length) warnings.push({ row: row.sourceRow, message: rowWarnings.join("; ") });
      importRows.push({ ...row, warnings: rowWarnings });
    }

    let imported = 0;
    for (let i = 0; i < importRows.length; i += 100) {
      const batch = importRows.slice(i, i + 100);
      const outcomes = await Promise.allSettled(batch.map((row) =>
        createGuest(eventId, {
          ...row,
          importBatchId: importBatch.id,
          validationWarnings: row.warnings,
        })
      ));
      outcomes.forEach((outcome, index) => {
        if (outcome.status === "fulfilled") imported++;
        else errors.push({
          row: batch[index].sourceRow,
          message: outcome.reason instanceof Error ? outcome.reason.message : "Could not import this row",
        });
      });
    }

    const skipped = Math.max(0, parsed.totalRows - imported);
    await prisma.importBatch.update({
      where: { id: importBatch.id },
      data: {
        status: "READY",
        rowCount: imported,
        totalRows: parsed.totalRows,
        skippedRows: skipped,
      },
    });
    return { batchId: importBatch.id, totalRows: parsed.totalRows, imported, skipped, errors, warnings };
  } catch (error) {
    await prisma.importBatch.update({
      where: { id: importBatch.id },
      data: {
        status: "FAILED",
        error: error instanceof Error ? error.message : "Import failed",
      },
    });
    throw error;
  }
}
