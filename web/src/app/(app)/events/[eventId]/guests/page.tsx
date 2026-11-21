"use client";
import { use, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Plus, Upload, Search, QrCode, CheckCircle, Clock, ArrowLeft, Download, Trash2, CopyCheck } from "lucide-react";
import api from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { cn } from "@/lib/utils";

const fetcher = (url: string) => api.get(url).then((r) => r.data);

const TYPE_COLORS: Record<string, string> = {
  SINGLE: "badge-blue",
  DOUBLE: "badge-green",
  FAMILY: "badge-purple",
  VIP: "badge-yellow",
};

const TYPE_LABELS: Record<string, string> = {
  SINGLE: "Single", DOUBLE: "Double", FAMILY: "Family", VIP: "VIP",
};

export default function GuestsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = use(params);
  const { user } = useAuthStore();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "in" | "out">("all");
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [deletingGuestId, setDeletingGuestId] = useState<string | null>(null);
  const [removingDuplicates, setRemovingDuplicates] = useState(false);
  const [exporting, setExporting] = useState(false);

  const query = new URLSearchParams({ pageSize: "100" });
  if (search) query.set("search", search);
  if (filter === "in") query.set("checkedIn", "true");
  if (filter === "out") query.set("checkedIn", "false");

  const listKey = `/events/${eventId}/guests?${query}`;
  const { data, error, isLoading, mutate } = useSWR(listKey, fetcher, { refreshInterval: 10000 });
  const isAdmin = user?.role === "ADMIN";
  const { data: duplicateData, error: duplicateError, mutate: mutateDuplicates } = useSWR(
    isAdmin ? `/events/${eventId}/guests/duplicates` : null,
    fetcher,
    { refreshInterval: 15000 }
  );
  const guests = data?.data ?? [];
  const total = data?.total ?? 0;
  const duplicateGroups = duplicateData?.data?.groups ?? [];
  const duplicateCount = duplicateData?.data?.duplicateCount ?? 0;

  const removeGuest = async (guest: Record<string, unknown>) => {
    const name = `${String(guest.firstName)} ${String(guest.lastName)}`;
    if (!window.confirm(`Remove ${name}? Their QR code and guest history will also be deleted.`)) return;

    setActionError("");
    setActionMessage("");
    setDeletingGuestId(String(guest.id));
    try {
      await api.delete(`/events/${eventId}/guests/${guest.id}`);
      await Promise.all([mutate(), mutateDuplicates()]);
      setActionMessage(`${name} was removed.`);
    } catch {
      setActionError(`Could not remove ${name}. Please try again.`);
    } finally {
      setDeletingGuestId(null);
    }
  };

  const exportGuests = async () => {
    setActionError("");
    setActionMessage("");
    setExporting(true);
    try {
      const response = await api.get(`/events/${eventId}/guests/export`, { responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `event-${eventId}-guests.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setActionMessage("Guest list exported.");
    } catch {
      setActionError("Could not export the guest list. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const removeDuplicates = async () => {
    if (!window.confirm(
      `Remove ${duplicateCount} duplicate guest record${duplicateCount === 1 ? "" : "s"}? ` +
      "Duplicates match on full name and phone. The record with the most check-in activity will be kept; " +
      "other copies and their QR codes, scans, and invitations will be deleted."
    )) return;

    setActionError("");
    setActionMessage("");
    setRemovingDuplicates(true);
    try {
      const response = await api.delete(`/events/${eventId}/guests/duplicates`);
      const deleted = response.data.data.deleted as number;
      await Promise.all([mutate(), mutateDuplicates()]);
      setActionMessage(`${deleted} duplicate guest record${deleted === 1 ? "" : "s"} removed.`);
    } catch {
      setActionError("Could not remove duplicate guests. Please try again.");
    } finally {
      setRemovingDuplicates(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/events/${eventId}`} className="text-slate-400 hover:text-slate-100">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="page-title flex-1">Guests ({total})</h1>
        <div className="flex gap-2">
          {isAdmin && (
            <Link href={`/events/${eventId}/guests/import`} className="btn-secondary">
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">Import</span>
            </Link>
          )}
          <button type="button" onClick={exportGuests} disabled={exporting} className="btn-secondary">
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">{exporting ? "Exporting..." : "Export"}</span>
          </button>
          <Link href={`/events/${eventId}/guests/new`} className="btn-primary">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add</span>
          </Link>
        </div>
      </div>

      {actionError && <p role="alert" className="mb-4 text-sm text-red-400">{actionError}</p>}
      {actionMessage && <p role="status" className="mb-4 text-sm text-blue-400">{actionMessage}</p>}
      {isAdmin && duplicateError && (
        <p role="alert" className="mb-4 text-sm text-red-400">Could not check for duplicate guests.</p>
      )}

      {isAdmin && duplicateCount > 0 && (
        <div className="card mb-4 flex flex-wrap items-center justify-between gap-3 border-amber-700/50">
          <div>
            <p className="font-medium text-slate-200">
              {duplicateCount} possible duplicate guest record{duplicateCount === 1 ? "" : "s"} detected
            </p>
            <p className="text-xs text-slate-400">
              Matched by full name and phone number across {duplicateGroups.length} group{duplicateGroups.length === 1 ? "" : "s"}.
            </p>
            <details className="mt-2 text-xs text-slate-400">
              <summary className="cursor-pointer hover:text-slate-200">Review matching guests</summary>
              <ul className="mt-2 space-y-1">
                {duplicateGroups.map((group: { guests: Array<{ id: string; firstName: string; lastName: string; phone: string | null }> }, index: number) => (
                  <li key={group.guests[0]?.id ?? index}>
                    {group.guests.map((guest) => `${guest.firstName} ${guest.lastName}`).join(" / ")}
                    {" · "}{group.guests[0]?.phone}
                  </li>
                ))}
              </ul>
            </details>
          </div>
          <button
            type="button"
            onClick={removeDuplicates}
            disabled={removingDuplicates}
            className="btn-secondary text-amber-300"
          >
            <CopyCheck className="w-4 h-4" />
            {removingDuplicates ? "Removing..." : "Remove Duplicates"}
          </button>
        </div>
      )}

      {/* Search & filter */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search guests..."
            className="pl-10"
          />
        </div>
        <div className="flex gap-1 bg-entron-dark-card border border-entron-dark-border rounded-lg p-1">
          {(["all", "in", "out"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-3 py-1.5 rounded text-xs font-medium transition-all",
                filter === f ? "bg-entron-blue text-white" : "text-slate-400 hover:text-slate-200"
              )}
            >
              {f === "all" ? "All" : f === "in" ? "Checked In" : "Not In"}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <div className="text-center text-slate-400 py-8">Loading...</div>}
      {error && <p role="alert" className="py-4 text-center text-red-400">Could not load guests. Please refresh and try again.</p>}

      {/* Desktop table */}
      <div className="table-container hidden md:block">
        <table className="entron-table">
          <thead>
            <tr>
              <th>Guest</th>
              <th>Phone</th>
              <th>Ticket</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {guests.map((g: Record<string, unknown>) => (
              <tr key={String(g.id)}>
                <td>
                  <p className="font-medium text-slate-200">{g.firstName as string} {g.lastName as string}</p>
                  {g.email ? <p className="text-xs text-slate-500">{String(g.email)}</p> : null}
                </td>
                <td className="text-slate-400">{(g.phone as string) ?? "—"}</td>
                <td>
                  <span className={`badge ${TYPE_COLORS[g.guestType as string] ?? "badge-blue"}`}>
                    {TYPE_LABELS[g.guestType as string] ?? g.guestType as string}
                  </span>
                </td>
                <td>
                  {g.isCheckedIn ? (
                    <span className="flex items-center gap-1 text-blue-400 text-sm">
                      <CheckCircle className="w-3.5 h-3.5" /> Checked In
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-slate-500 text-sm">
                      <Clock className="w-3.5 h-3.5" /> Waiting
                    </span>
                  )}
                </td>
                <td>
                  <div className="flex items-center gap-3">
                    <Link href={`/events/${eventId}/guests/${g.id}`} className="text-entron-blue text-sm hover:underline">
                      View
                    </Link>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => removeGuest(g)}
                        disabled={deletingGuestId === String(g.id)}
                        aria-label={`Remove ${g.firstName} ${g.lastName}`}
                        className="text-red-400 text-sm hover:underline disabled:opacity-50"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {guests.map((g: Record<string, unknown>) => (
          <div key={String(g.id)} className="card flex items-center gap-3">
            <Link href={`/events/${eventId}/guests/${g.id}`} className="flex flex-1 items-center gap-3 min-w-0">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                g.isCheckedIn ? "bg-green-900/50" : "bg-slate-700"
              }`}>
                {g.isCheckedIn
                  ? <CheckCircle className="w-5 h-5 text-blue-400" />
                  : <Clock className="w-5 h-5 text-slate-400" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-200">{g.firstName as string} {g.lastName as string}</p>
                <p className="text-xs text-slate-400">{(g.phone as string) ?? ""}</p>
              </div>
              <span className={`badge ${TYPE_COLORS[g.guestType as string] ?? "badge-blue"}`}>
                {TYPE_LABELS[g.guestType as string]}
              </span>
            </Link>
            {isAdmin && (
              <button
                type="button"
                onClick={() => removeGuest(g)}
                disabled={deletingGuestId === String(g.id)}
                aria-label={`Remove ${g.firstName} ${g.lastName}`}
                className="p-2 text-red-400 disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      {!isLoading && guests.length === 0 && (
        <div className="card text-center py-12">
          <QrCode className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">No guests yet</p>
        </div>
      )}
    </div>
  );
}
