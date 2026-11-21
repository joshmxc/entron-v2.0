"use client";
import { use, useCallback, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  Download,
  FileSpreadsheet,
  Upload,
} from "lucide-react";
import api from "@/lib/api";
import { uploadWithSignedUrl } from "@/lib/storageUpload";

type ImportOptions = {
  sheetName?: string;
  headerRow?: number;
  columnMap?: Record<string, string>;
  duplicatePolicy?: "keep" | "skip";
};

type Preview = {
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
};

type ImportResult = {
  batchId: string;
  totalRows: number;
  imported: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
  warnings: Array<{ row: number; message: string }>;
};

type ImportBatch = {
  id: string;
  filename: string;
  status: string;
  rowCount: number;
  totalRows: number;
  skippedRows: number;
  error?: string | null;
  createdAt: string;
  hasSourceFile: boolean;
};

const FIELD_OPTIONS = [
  ["ignore", "Ignore this column"],
  ["fullName", "Full name (required)"],
  ["email", "Email"],
  ["phone", "Phone"],
  ["guestType", "Guest type / access level"],
  ["seatNumber", "Seat"],
  ["tableNumber", "Table"],
  ["organization", "Organization"],
  ["notes", "Notes"],
  ["__custom", "Keep as custom field"],
];

function customFieldName(header: string, index: number) {
  const key = header.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return `custom.${key || `column_${index + 1}`}`;
}

export default function ImportPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = use(params);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [sheetName, setSheetName] = useState("");
  const [headerRow, setHeaderRow] = useState("1");
  const [columnMap, setColumnMap] = useState<Record<string, string>>({});
  const [duplicatePolicy, setDuplicatePolicy] = useState<"keep" | "skip">("skip");
  const [allowInvalidRows, setAllowInvalidRows] = useState(false);
  const [previewDirty, setPreviewDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [importError, setImportError] = useState("");
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [historyError, setHistoryError] = useState("");
  const [downloadingBatchId, setDownloadingBatchId] = useState("");

  const loadBatches = useCallback(async () => {
    try {
      const response = await api.get(`/events/${eventId}/guests/import/batches`);
      setBatches(response.data.data ?? []);
      setHistoryError("");
    } catch (error) {
      const responseMessage = (error as { response?: { data?: { error?: string; message?: string } } })
        .response?.data;
      setHistoryError(responseMessage?.error || responseMessage?.message || "Could not load import history.");
    }
  }, [eventId]);

  useEffect(() => {
    void loadBatches();
  }, [loadBatches]);

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted[0]) {
      setFile(accepted[0]);
      setPreview(null);
      setResult(null);
      setImportError("");
      setPreviewDirty(false);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.ms-excel": [".xls"],
      "text/csv": [".csv"],
    },
    maxFiles: 1,
  });

  const submitOptions = (formData: FormData, options: ImportOptions) => {
    if (options.sheetName) formData.append("sheetName", options.sheetName);
    if (options.headerRow !== undefined) formData.append("headerRow", String(options.headerRow));
    if (options.columnMap) formData.append("columnMap", JSON.stringify(options.columnMap));
    if (options.duplicatePolicy) formData.append("duplicatePolicy", options.duplicatePolicy);
  };

  const postImportFile = async (endpoint: string, options: ImportOptions) => {
    if (!file) throw new Error("Choose a spreadsheet file first.");
    const storagePath = await uploadWithSignedUrl(
      `/events/${eventId}/guests/import/upload-url`,
      file
    );
    if (storagePath) {
      return api.post(endpoint, { ...options, filename: file.name, storagePath });
    }

    const formData = new FormData();
    formData.append("file", file);
    submitOptions(formData, options);
    return api.post(endpoint, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  };

  const handlePreview = async (overrides: ImportOptions = {}) => {
    if (!file) return;
    setLoading(true);
    setImportError("");
    try {
      const options: ImportOptions = {
        sheetName: overrides.sheetName ?? (sheetName || undefined),
        headerRow: overrides.headerRow ?? (headerRow ? Number(headerRow) - 1 : undefined),
        columnMap: overrides.columnMap ?? (Object.keys(columnMap).length ? columnMap : undefined),
        duplicatePolicy: overrides.duplicatePolicy ?? duplicatePolicy,
      };
      const response = await postImportFile(`/events/${eventId}/guests/import/preview`, options);
      const data = response.data.data as Preview;
      setPreview(data);
      setSheetName(data.sheetName);
      setHeaderRow(String(data.headerRow + 1));
      setColumnMap(data.columnMap);
      setAllowInvalidRows(false);
      setPreviewDirty(false);
    } catch (error) {
      const responseMessage = (error as { response?: { data?: { error?: string; message?: string } } })
        .response?.data;
      setImportError(responseMessage?.error || responseMessage?.message || "Could not read this spreadsheet.");
      setPreview(null);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!file || !preview) return;
    setLoading(true);
    setImportError("");
    try {
      const response = await postImportFile(`/events/${eventId}/guests/import`, {
        sheetName,
        headerRow: Number(headerRow) - 1,
        columnMap,
        duplicatePolicy,
      });
      setResult(response.data.data as ImportResult);
      void loadBatches();
    } catch (error) {
      const responseMessage = (error as { response?: { data?: { error?: string; message?: string } } })
        .response?.data;
      setImportError(responseMessage?.error || responseMessage?.message || "Could not import this file.");
    } finally {
      setLoading(false);
    }
  };

  const downloadErrors = (errors: ImportResult["errors"]) => {
    const csv = [
      ["Row", "Error"],
      ...errors.map((error) => [String(error.row), error.message]),
    ].map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "guest-import-errors.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const downloadSource = async (batch: ImportBatch) => {
    setDownloadingBatchId(batch.id);
    try {
      const response = await api.get(
        `/events/${eventId}/guests/import/batches/${batch.id}/download`,
        { responseType: "blob" }
      );
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = batch.filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setImportError(`Could not download the original file "${batch.filename}".`);
    } finally {
      setDownloadingBatchId("");
    }
  };

  const invalidPercent = preview?.totalRows
    ? ((preview.totalRows - preview.validRows) / preview.totalRows) * 100
    : 0;
  const needsOverride = invalidPercent > 5;

  return (
    <div className="max-w-5xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/events/${eventId}/guests`} className="text-slate-400 hover:text-slate-100">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="page-title">Import Guests from Spreadsheet</h1>
      </div>

      <div className="card mb-4 text-sm text-slate-300 space-y-2">
        <p className="font-medium text-slate-200">Map your spreadsheet columns before importing.</p>
        <p className="text-xs text-slate-400">
          Full name is required. Phone, guest type, email, seat, table, organization, notes, and custom columns are optional.
          XLSX, XLS, and CSV files up to 10 MB and 20,000 rows are supported.
        </p>
      </div>

      {historyError && <p role="status" className="mb-4 text-sm text-amber-300">{historyError}</p>}
      {batches.length > 0 && (
        <section className="card mb-4 space-y-3">
          <h2 className="font-semibold text-slate-100">Recent import history</h2>
          <div className="divide-y divide-entron-dark-border">
            {batches.map((batch) => (
              <div key={batch.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-200">{batch.filename}</p>
                  <p className="text-xs text-slate-500">
                    {new Date(batch.createdAt).toLocaleString()} · {batch.rowCount} imported · {batch.skippedRows} skipped
                    {batch.error ? ` · ${batch.error}` : ""}
                  </p>
                </div>
                <span className="badge badge-blue text-xs">{batch.status}</span>
                {batch.hasSourceFile && (
                  <button
                    type="button"
                    onClick={() => downloadSource(batch)}
                    disabled={downloadingBatchId === batch.id}
                    className="btn-secondary text-xs"
                  >
                    {downloadingBatchId === batch.id ? "Downloading..." : "Download original"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {!result ? (
        <div className="space-y-4">
          {importError && <p role="alert" className="text-sm text-red-400">{importError}</p>}

          <div
            {...getRootProps()}
            className={`card border-2 border-dashed cursor-pointer text-center py-8 transition-all ${
              isDragActive ? "border-entron-blue bg-entron-blue/10" : "border-entron-dark-border hover:border-entron-blue/50"
            }`}
          >
            <input {...getInputProps()} />
            <FileSpreadsheet className="w-10 h-10 text-slate-500 mx-auto mb-2" />
            {file ? (
              <p className="text-slate-200 font-medium">{file.name}</p>
            ) : (
              <>
                <p className="text-slate-300">Drop a spreadsheet here or click to select</p>
                <p className="text-slate-500 text-sm mt-1">.xlsx, .xls, .csv</p>
              </>
            )}
          </div>

          {file && !preview && (
            <button onClick={() => handlePreview()} disabled={loading} className="btn-primary">
              <FileSpreadsheet className="w-4 h-4" />
              {loading ? "Reading spreadsheet..." : "Review columns"}
            </button>
          )}

          {preview && (
            <>
              <div className="card grid gap-4 sm:grid-cols-3">
                <label className="text-sm text-slate-300">
                  Worksheet
                  <select
                    value={sheetName}
                    onChange={(event) => {
                      setSheetName(event.target.value);
                      setColumnMap({});
                      setPreviewDirty(true);
                    }}
                    className="input mt-1 w-full"
                  >
                    {preview.sheetNames.map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                </label>
                <label className="text-sm text-slate-300">
                  Header row
                  <input
                    type="number"
                    min="1"
                    value={headerRow}
                    onChange={(event) => {
                      setHeaderRow(event.target.value);
                      setPreviewDirty(true);
                    }}
                    className="input mt-1 w-full"
                  />
                </label>
                <label className="text-sm text-slate-300">
                  Existing duplicates
                  <select
                    value={duplicatePolicy}
                    onChange={(event) => {
                      setDuplicatePolicy(event.target.value as "keep" | "skip");
                      setPreviewDirty(true);
                    }}
                    className="input mt-1 w-full"
                  >
                    <option value="skip">Skip duplicate email or seat</option>
                    <option value="keep">Import and show a warning</option>
                  </select>
                </label>
              </div>

              <section className="card">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div>
                    <h2 className="font-semibold text-slate-100">Column mapping</h2>
                    <p className="text-xs text-slate-400 mt-1">Change the worksheet or header row, then refresh the preview.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handlePreview({
                      sheetName,
                      headerRow: Number(headerRow) - 1,
                      columnMap: Object.keys(columnMap).length ? columnMap : undefined,
                      duplicatePolicy,
                    })}
                    disabled={loading || !headerRow || Number(headerRow) < 1}
                    className="btn-secondary"
                  >
                    {loading ? "Refreshing..." : "Refresh preview"}
                  </button>
                </div>
                <div className="space-y-2">
                  {preview.headers.map((header, index) => {
                    const key = String(index);
                    const value = columnMap[key] ?? "ignore";
                    const selectValue = value.startsWith("custom.") ? "__custom" : value;
                    return (
                      <label key={key} className="grid items-center gap-3 sm:grid-cols-2">
                        <span className="truncate text-sm text-slate-300" title={header}>{header || `Column ${index + 1}`}</span>
                        <select
                          value={selectValue}
                          onChange={(event) => {
                            const target = event.target.value === "__custom"
                              ? customFieldName(header, index)
                              : event.target.value;
                            setColumnMap((current) => ({ ...current, [key]: target }));
                            setPreviewDirty(true);
                          }}
                          className="input w-full"
                        >
                          {FIELD_OPTIONS.map(([target, label]) => (
                            <option key={target} value={target}>{label}</option>
                          ))}
                        </select>
                      </label>
                    );
                  })}
                </div>
              </section>
              {previewDirty && (
                <p className="text-sm text-amber-300">
                  Settings have changed. Refresh the preview to validate the current column mapping before importing.
                </p>
              )}

              <section className="card">
                <div className="flex flex-wrap gap-5 text-sm">
                  <span><strong className="text-slate-100">{preview.totalRows}</strong> rows</span>
                  <span className="text-green-400"><strong>{preview.validRows}</strong> valid</span>
                  <span className={preview.errors.length ? "text-red-400" : "text-slate-400"}>
                    <strong>{preview.totalRows - preview.validRows}</strong> need attention ({invalidPercent.toFixed(1)}%)
                  </span>
                  <span className="text-amber-300"><strong>{preview.warnings.length}</strong> warnings</span>
                </div>
                {preview.sampleRows.length > 0 && (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr>{preview.headers.map((header, index) => (
                          <th key={index} className="p-2 text-slate-400">{header || `Column ${index + 1}`}</th>
                        ))}</tr>
                      </thead>
                      <tbody>
                        {preview.sampleRows.map((row, rowIndex) => (
                          <tr key={rowIndex} className="border-t border-slate-700">
                            {preview.headers.map((_header, columnIndex) => (
                              <td key={columnIndex} className="p-2 text-slate-300">{row[columnIndex] || "—"}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {preview.errors.length > 0 && (
                <div className="card border-red-700/50">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="w-5 h-5 text-red-400" />
                    <p className="font-medium text-slate-200">Rows that cannot be imported</p>
                  </div>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {preview.errors.slice(0, 30).map((error, index) => (
                      <p key={`${error.row}-${index}`} className="text-xs text-red-400">Row {error.row}: {error.message}</p>
                    ))}
                    {preview.errors.length > 30 && <p className="text-xs text-slate-400">Showing first 30 errors.</p>}
                  </div>
                </div>
              )}

              {needsOverride && (
                <label className="flex items-start gap-2 text-sm text-amber-300">
                  <input
                    type="checkbox"
                    checked={allowInvalidRows}
                    onChange={(event) => setAllowInvalidRows(event.target.checked)}
                    className="mt-1"
                  />
                  Import valid rows anyway; the invalid rows will be skipped.
                </label>
              )}
            </>
          )}

          <div className="flex gap-3">
            <Link href={`/events/${eventId}/guests`} className="btn-secondary flex-1 text-center">Cancel</Link>
            {preview ? (
              <button
                onClick={handleImport}
                disabled={loading || previewDirty || preview.validRows === 0 || (needsOverride && !allowInvalidRows)}
                className="btn-primary flex-1"
              >
                <Upload className="w-4 h-4" />
                {loading ? "Importing..." : `Import ${preview.validRows} valid rows`}
              </button>
            ) : (
              <button onClick={() => handlePreview()} disabled={!file || loading} className="btn-primary flex-1">
                <FileSpreadsheet className="w-4 h-4" />
                {loading ? "Reading spreadsheet..." : "Review columns"}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="card border-green-700/50">
            <CheckCircle className="w-8 h-8 text-green-400 mb-3" />
            <p className="text-xl font-bold text-green-400">{result.imported} imported</p>
            <p className="text-sm text-slate-400">
              {result.skipped} skipped out of {result.totalRows} rows. Original spreadsheet is retained with this import record.
            </p>
            <p className="mt-1 text-xs text-slate-500">Batch ID: {result.batchId}</p>
          </div>

          {result.errors.length > 0 && (
            <div className="card border-red-700/50">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-red-400" />
                  <p className="font-medium text-slate-200">Errors ({result.errors.length})</p>
                </div>
                <button onClick={() => downloadErrors(result.errors)} className="btn-secondary text-sm">
                  <Download className="w-4 h-4" /> Download error CSV
                </button>
              </div>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {result.errors.slice(0, 50).map((error, index) => (
                  <p key={`${error.row}-${index}`} className="text-xs text-red-400">Row {error.row}: {error.message}</p>
                ))}
              </div>
            </div>
          )}
          {result.warnings.length > 0 && (
            <div className="card border-amber-700/50">
              <p className="font-medium text-amber-300 mb-2">Warnings ({result.warnings.length})</p>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {result.warnings.slice(0, 30).map((warning, index) => (
                  <p key={`${warning.row}-${index}`} className="text-xs text-amber-300">Row {warning.row}: {warning.message}</p>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-3">
            <button onClick={() => { setFile(null); setPreview(null); setResult(null); }} className="btn-secondary flex-1">
              Import another file
            </button>
            <Link href={`/events/${eventId}/guests`} className="btn-primary flex-1 text-center">View Guests</Link>
          </div>
        </div>
      )}
    </div>
  );
}
