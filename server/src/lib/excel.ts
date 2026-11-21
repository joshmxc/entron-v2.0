import * as XLSX from "xlsx";

export interface GuestRow {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  guestType?: string;
  seatNumber?: string;
  tableNumber?: string;
  organization?: string;
  notes?: string;
  custom: Record<string, string>;
  warnings: string[];
  sourceRow: number;
}

export interface ImportOptions {
  sheetName?: string;
  headerRow?: number;
  columnMap?: Record<string, string>;
  duplicatePolicy?: "keep" | "skip";
}

export interface ParseResult {
  rows: GuestRow[];
  errors: Array<{ row: number; message: string }>;
  totalRows: number;
}

export interface SpreadsheetPreview {
  sheetNames: string[];
  sheetName: string;
  headerRow: number;
  headers: string[];
  columnMap: Record<string, string>;
  sampleRows: string[][];
  totalRows: number;
  validRows: number;
  errors: Array<{ row: number; message: string }>;
  warnings: Array<{ row: number; message: string }>;
}

const FIELD_ALIASES: Record<string, string[]> = {
  fullName: ["full name", "name", "guest name", "attendee", "fullname", "jina"],
  email: ["email", "e mail", "mail", "email address"],
  phone: ["phone", "mobile", "telephone", "phone number", "contact"],
  seatNumber: ["seat", "seat no", "seat number", "chair"],
  tableNumber: ["table", "table no", "table number"],
  guestType: ["access", "access level", "tier", "category", "guest type", "pass type", "zone", "type"],
  organization: ["organization", "organisation", "company", "group"],
  notes: ["note", "notes", "comment", "comments"],
};

const VALID_GUEST_TYPES = new Set(["SINGLE", "DOUBLE", "FAMILY", "VIP"]);

export function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, "_");
}

export function detectHeaderRow(matrix: unknown[][]): number {
  const limit = Math.min(matrix.length, 20);
  for (let rowIndex = 0; rowIndex < limit; rowIndex++) {
    const values = matrix[rowIndex] ?? [];
    const textualCells = values.filter((value) => {
      const text = String(value ?? "").trim();
      return text !== "" && !/^[+-]?\d+(?:[.,]\d+)?$/.test(text);
    });
    if (textualCells.length >= 2) return rowIndex;
  }
  return -1;
}

export function autoMapColumns(headers: unknown[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  headers.forEach((value, index) => {
    const normalized = normalizeHeader(value);
    if (!normalized) {
      mapping[String(index)] = "ignore";
      return;
    }

    let bestField = "";
    let bestScore = 0;
    for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
      for (const alias of aliases) {
        const score = similarity(normalized.replace(/_/g, " "), alias);
        if (score > bestScore) {
          bestField = field;
          bestScore = score;
        }
      }
    }
    mapping[String(index)] = bestScore >= 0.8
      ? bestField
      : `custom.${normalized}`;
  });
  return mapping;
}

function similarity(left: string, right: string): number {
  if (left === right) return 1;
  const longer = Math.max(left.length, right.length);
  if (!longer) return 1;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i++) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= right.length; j++) {
      const old = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (left[i - 1] === right[j - 1] ? 0 : 1)
      );
      diagonal = old;
    }
  }
  return (longer - previous[right.length]) / longer;
}

function parseGuestType(value: string): "SINGLE" | "DOUBLE" | "FAMILY" | "VIP" | null {
  const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (VALID_GUEST_TYPES.has(normalized)) return normalized as "SINGLE" | "DOUBLE" | "FAMILY" | "VIP";
  if (["ONE", "SINGLE_ADMISSION", "INDIVIDUAL"].includes(normalized)) return "SINGLE";
  if (["TWO", "DOUBLE_ADMISSION", "COUPLE"].includes(normalized)) return "DOUBLE";
  return null;
}

function cellText(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function isBlankRow(row: unknown[]): boolean {
  return row.every((cell) => cellText(cell) === "");
}

export function previewGuestExcel(buffer: Buffer, options: ImportOptions = {}): SpreadsheetPreview {
  const workbook = XLSX.read(buffer, { type: "buffer", raw: false });
  const emptyPreview: SpreadsheetPreview = {
    sheetNames: workbook.SheetNames,
    sheetName: "",
    headerRow: -1,
    headers: [],
    columnMap: {},
    sampleRows: [],
    totalRows: 0,
    validRows: 0,
    errors: [],
    warnings: [],
  };
  if (options.sheetName && !workbook.SheetNames.includes(options.sheetName)) {
    emptyPreview.errors = [{ row: 0, message: `Worksheet "${options.sheetName}" was not found.` }];
    return emptyPreview;
  }
  const sheetName = options.sheetName ?? workbook.SheetNames.find((name) => {
      const sheet = workbook.Sheets[name];
      return !!sheet && !!sheet["!ref"];
    });
  if (!sheetName) {
    emptyPreview.errors = [{ row: 0, message: "No non-empty worksheet was found." }];
    return emptyPreview;
  }
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    emptyPreview.errors = [{ row: 0, message: `Worksheet "${sheetName}" was not found.` }];
    return emptyPreview;
  }
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
    blankrows: false,
  });
  const headerRow = options.headerRow ?? detectHeaderRow(matrix);
  if (!Number.isInteger(headerRow) || headerRow < 0 || headerRow >= matrix.length) {
    return {
      ...emptyPreview,
      sheetName,
      errors: [{ row: 0, message: "No header row detected. Select the correct header row and retry." }],
    };
  }
  const headers = (matrix[headerRow] ?? []).map(cellText);
  const columnMap = options.columnMap ?? autoMapColumns(headers);
  const parsed = parseGuestExcel(buffer, { ...options, sheetName, headerRow, columnMap });
  return {
    sheetNames: workbook.SheetNames,
    sheetName,
    headerRow,
    headers,
    columnMap,
    sampleRows: matrix.slice(headerRow + 1).filter((row) => !isBlankRow(row)).slice(0, 5).map((row) =>
      headers.map((_header, index) => cellText(row[index]))
    ),
    totalRows: parsed.totalRows,
    validRows: parsed.rows.length,
    errors: parsed.errors,
    warnings: parsed.rows.flatMap((row) => row.warnings.map((message) => ({ row: row.sourceRow, message }))),
  };
}

export function parseGuestExcel(buffer: Buffer, options: ImportOptions = {}): ParseResult {
  const workbook = XLSX.read(buffer, { type: "buffer", raw: false });
  if (options.sheetName && !workbook.SheetNames.includes(options.sheetName)) {
    return { rows: [], errors: [{ row: 0, message: `Worksheet "${options.sheetName}" was not found.` }], totalRows: 0 };
  }
  const sheetName = options.sheetName ?? workbook.SheetNames.find((name) => {
      const sheet = workbook.Sheets[name];
      return !!sheet && !!sheet["!ref"];
    });
  if (!sheetName) {
    return { rows: [], errors: [{ row: 0, message: "No non-empty worksheet was found." }], totalRows: 0 };
  }

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    return { rows: [], errors: [{ row: 0, message: `Worksheet "${sheetName}" was not found.` }], totalRows: 0 };
  }
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
    blankrows: false,
  });
  const headerRow = options.headerRow ?? detectHeaderRow(matrix);
  if (!Number.isInteger(headerRow) || headerRow < 0 || headerRow >= matrix.length) {
    return { rows: [], errors: [{ row: 0, message: "No header row detected. Select the correct header row and retry." }], totalRows: 0 };
  }

  const headers = matrix[headerRow] ?? [];
  const mapping = options.columnMap ?? autoMapColumns(headers);
  const dataRows = matrix.slice(headerRow + 1)
    .map((row, index) => ({ row, sourceRow: headerRow + index + 2 }))
    .filter(({ row }) => !isBlankRow(row));
  const totalRows = dataRows.length;
  if (totalRows > 20000) {
    return { rows: [], errors: [{ row: 0, message: "This file has more than 20,000 data rows. Split it into smaller files." }], totalRows };
  }

  const rows: GuestRow[] = [];
  const errors: Array<{ row: number; message: string }> = [];
  const seenEmails = new Set<string>();
  const seenSeats = new Set<string>();
  const duplicatePolicy = options.duplicatePolicy ?? "keep";

  for (const { row, sourceRow } of dataRows) {
    const values: Record<string, string> = {};
    const custom: Record<string, string> = {};
    headers.forEach((_header, columnIndex) => {
      const target = mapping[String(columnIndex)] ?? "ignore";
      const value = cellText(row[columnIndex]);
      if (!value || target === "ignore") return;
      if (target.startsWith("custom.")) {
        const key = target.slice("custom.".length) || `column_${columnIndex + 1}`;
        custom[key] = value;
      } else {
        values[target] = value;
      }
    });

    const rowErrors: string[] = [];
    const warnings: string[] = [];
    const fullName = (values.fullName ?? "").trim().replace(/\s+/g, " ");
    if (!fullName) rowErrors.push("Full name is required");

    const email = values.email || undefined;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      warnings.push("Email address does not look valid");
    }
    const seatNumber = values.seatNumber || undefined;
    if (seatNumber && !/^[A-Za-z0-9][A-Za-z0-9 /-]{0,31}$/.test(seatNumber)) {
      warnings.push("Seat number has an unusual format");
    }

    if (email) {
      const normalizedEmail = email.toLowerCase();
      if (seenEmails.has(normalizedEmail)) {
        const message = "Duplicate email address in this file";
        if (duplicatePolicy === "skip") rowErrors.push(message);
        else warnings.push(message);
      }
      seenEmails.add(normalizedEmail);
    }
    if (seatNumber) {
      const normalizedSeat = seatNumber.toLowerCase();
      if (seenSeats.has(normalizedSeat)) {
        const message = "Duplicate seat number in this file";
        if (duplicatePolicy === "skip") rowErrors.push(message);
        else warnings.push(message);
      }
      seenSeats.add(normalizedSeat);
    }

    const mappedType = values.guestType ? parseGuestType(values.guestType) : "SINGLE";
    if (values.guestType && !mappedType) {
      warnings.push(`Unknown guest type "${values.guestType}"; imported as SINGLE`);
    }
    if (rowErrors.length) {
      errors.push({ row: sourceRow, message: rowErrors.join("; ") });
      continue;
    }

    const [firstName, ...lastParts] = fullName.split(" ");
    rows.push({
      firstName,
      lastName: lastParts.join(" "),
      phone: values.phone ?? "",
      email,
      guestType: mappedType ?? "SINGLE",
      seatNumber,
      tableNumber: values.tableNumber || undefined,
      organization: values.organization || undefined,
      notes: values.notes || undefined,
      custom,
      warnings,
      sourceRow,
    });
  }

  if (!totalRows) errors.push({ row: headerRow + 1, message: "No rows found below the header." });
  return { rows, errors, totalRows };
}
