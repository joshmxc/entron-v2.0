"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, RefreshCw, Phone, Mail, QrCode, CheckCircle, Clock, Printer, Pencil } from "lucide-react";
import api from "@/lib/api";
import { formatDate } from "@/lib/utils";

const fetcher = (url: string) => api.get(url).then((r) => r.data);
const TYPE_LABELS: Record<string, string> = { SINGLE: "Single", DOUBLE: "Double", FAMILY: "Family", VIP: "VIP" };
const editSchema = z.object({
  name: z.string().trim().min(1, "Guest name is required"),
  phone: z.string().trim().optional(),
  guestType: z.enum(["SINGLE", "DOUBLE", "FAMILY", "VIP"]),
  maxAdmissions: z.coerce.number().int().min(1, "Enter at least one admission"),
  tableNumber: z.string().optional(),
  notes: z.string().optional(),
});
type EditFormData = z.infer<typeof editSchema>;

const STATUS_LABELS: Record<string, string> = {
  SUCCESS: "Checked In",
  ALREADY_SCANNED: "Already Scanned",
  LIMIT_REACHED: "Limit Reached",
  INVALID_QR: "Invalid QR",
  WRONG_EVENT: "Wrong Event",
};

export default function GuestDetailPage({ params }: { params: Promise<{ eventId: string; guestId: string }> }) {
  const { eventId, guestId } = use(params);
  const { data, mutate } = useSWR(`/events/${eventId}/guests/${guestId}`, fetcher);
  const guest = data?.data;
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState("");
  const { register, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } = useForm<EditFormData>({
    resolver: zodResolver(editSchema),
    defaultValues: { name: "", phone: "", guestType: "SINGLE", maxAdmissions: 1, tableNumber: "", notes: "" },
  });
  const guestType = watch("guestType");

  useEffect(() => {
    if (guestType !== "FAMILY") {
      setValue("maxAdmissions", guestType === "DOUBLE" ? 2 : 1, { shouldValidate: true });
    }
  }, [guestType, setValue]);

  const regenerateQR = async () => {
    await api.post(`/events/${eventId}/guests/${guestId}/regenerate-qr`);
    mutate();
  };

  const startEditing = () => {
    reset({
      name: `${guest.firstName} ${guest.lastName}`.trim(),
      phone: guest.phone ?? "",
      guestType: guest.guestType,
      maxAdmissions: guest.maxAdmissions,
      tableNumber: guest.tableNumber ?? "",
      notes: guest.notes ?? "",
    });
    setEditError("");
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setEditError("");
  };

  const saveDetails = async (formData: EditFormData) => {
    setEditError("");
    const [firstName, ...lastNameParts] = formData.name.trim().split(/\s+/);
    try {
      await api.patch(`/events/${eventId}/guests/${guestId}`, {
        firstName,
        lastName: lastNameParts.join(" "),
        phone: formData.phone?.trim() || null,
        guestType: formData.guestType,
        maxAdmissions: formData.maxAdmissions,
        tableNumber: formData.tableNumber?.trim() || null,
        notes: formData.notes?.trim() || null,
      });
      await mutate();
      setEditing(false);
    } catch {
      setEditError("Could not save guest details. Please try again.");
    }
  };

  if (!guest) return <div className="text-slate-400 text-center py-12">Loading...</div>;

  const apiBase = "";

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/events/${eventId}/guests`} className="text-slate-400 hover:text-slate-100">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="page-title flex-1">{`${guest.firstName} ${guest.lastName}`.trim()}</h1>
        {!editing && (
          <button type="button" onClick={startEditing} className="btn-secondary">
            <Pencil className="w-4 h-4" />
            Edit Details
          </button>
        )}
      </div>

      {/* Status banner */}
      <div className={`card flex items-center gap-3 ${guest.isCheckedIn ? "border-green-700/50" : "border-slate-600/50"}`}>
        {guest.isCheckedIn
          ? <CheckCircle className="w-6 h-6 text-blue-400 flex-shrink-0" />
          : <Clock className="w-6 h-6 text-slate-400 flex-shrink-0" />
        }
        <div>
          <p className="font-semibold text-slate-100">
            {guest.isCheckedIn ? "Checked In" : "Not yet checked in"}
          </p>
          {guest.checkedInAt && (
            <p className="text-sm text-slate-400">{formatDate(guest.checkedInAt)}</p>
          )}
          <p className="text-sm text-slate-400">
            Entry {guest.admissionsUsed}/{guest.maxAdmissions}
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {editing ? (
          <form onSubmit={handleSubmit(saveDetails)} className="card space-y-4">
            <h3 className="font-semibold text-slate-200">Edit Guest Details</h3>
            {editError && <p role="alert" className="text-red-400 text-sm">{editError}</p>}
            <div className="input-group">
              <label>Full Name *</label>
              <input {...register("name")} />
              {errors.name && <p className="text-red-400 text-xs">{errors.name.message}</p>}
            </div>
            <div className="input-group">
              <label>Phone Number</label>
              <input {...register("phone")} type="tel" />
              {errors.phone && <p className="text-red-400 text-xs">{errors.phone.message}</p>}
            </div>
            <div className="input-group">
              <label>Guest Type</label>
              <select {...register("guestType")}>
                <option value="SINGLE">Single (1)</option>
                <option value="DOUBLE">Double (2)</option>
                <option value="FAMILY">Family (custom)</option>
                <option value="VIP">VIP</option>
              </select>
            </div>
            <div className="input-group">
              <label>Max Admissions *</label>
              <input
                {...register("maxAdmissions")}
                type="number"
                min={1}
                readOnly={guestType !== "FAMILY"}
                className={guestType !== "FAMILY" ? "opacity-70" : ""}
              />
              {errors.maxAdmissions && <p className="text-red-400 text-xs">{errors.maxAdmissions.message}</p>}
              <p className="text-xs text-slate-500">Set by ticket type except for Family.</p>
            </div>
            <div className="input-group">
              <label>Table Number (optional)</label>
              <input {...register("tableNumber")} />
            </div>
            <div className="input-group">
              <label>Note (optional)</label>
              <textarea {...register("notes")} rows={2} />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={cancelEditing} className="btn-secondary flex-1">Cancel</button>
              <button type="submit" disabled={isSubmitting} className="btn-primary flex-1">
                {isSubmitting ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        ) : (
          <div className="card space-y-3">
            <h3 className="font-semibold text-slate-200">Guest Details</h3>
            <div className="space-y-2 text-sm">
              {[
                { label: "Ticket Type", value: TYPE_LABELS[guest.guestType] ?? guest.guestType },
                { label: "Max Admissions", value: guest.maxAdmissions },
                { label: "Table", value: guest.tableNumber ?? "—" },
                { label: "Notes", value: guest.notes ?? "—" },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between">
                  <span className="text-slate-400">{label}</span>
                  <span className="text-slate-200">{value}</span>
                </div>
              ))}
              {guest.phone && (
                <div className="flex items-center gap-2 pt-2">
                  <Phone className="w-4 h-4 text-slate-400" />
                  <span className="text-slate-200">{guest.phone}</span>
                </div>
              )}
              {guest.email && (
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-slate-400" />
                  <span className="text-slate-200 text-xs">{guest.email}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* QR Code */}
        <div className="card flex flex-col items-center gap-3">
          <h3 className="font-semibold text-slate-200 self-start">QR Code</h3>
          {guest.qrImageUrl ? (
            <div className="bg-white p-3 rounded-xl">
              <img
                src={`${apiBase}${guest.qrImageUrl}`}
                alt="QR Code"
                width={180}
                height={180}
                className="block"
              />
            </div>
          ) : (
            <div className="w-44 h-44 bg-slate-700 rounded-xl flex items-center justify-center">
              <QrCode className="w-12 h-12 text-slate-500" />
            </div>
          )}
          <div className="flex gap-2 w-full">
            <button onClick={regenerateQR} className="btn-secondary flex-1 text-xs">
              <RefreshCw className="w-3.5 h-3.5" /> Regenerate
            </button>
            <button onClick={() => window.print()} className="btn-secondary flex-1 text-xs no-print">
              <Printer className="w-3.5 h-3.5" /> Print
            </button>
          </div>
        </div>
      </div>

      {/* Scan history */}
      {guest.scans?.length > 0 && (
        <div className="card">
          <h3 className="font-semibold text-slate-200 mb-3">Scan History</h3>
          <div className="space-y-2">
            {guest.scans.map((scan: Record<string, unknown>) => (
              <div key={String(scan.id)} className="flex items-center gap-3 text-sm">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  scan.status === "SUCCESS" ? "bg-blue-400" : "bg-red-400"
                }`} />
                <span className="text-slate-400 flex-1">
                  {STATUS_LABELS[scan.status as string] ?? String(scan.status ?? "")}
                  {scan.staff ? ` · ${(scan.staff as Record<string, string>).name}` : ""}
                </span>
                <span className="text-slate-500 text-xs">
                  {formatDate(scan.createdAt as string, "dd MMM, HH:mm")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
