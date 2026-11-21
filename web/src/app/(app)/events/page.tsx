"use client";
import Link from "next/link";
import useSWR from "swr";
import { useEffect, useState } from "react";
import { Plus, Calendar, MapPin, Users, ChevronRight, Pencil, Trash2 } from "lucide-react";
import api from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { useEventStore } from "@/store/eventStore";
import { formatDate } from "@/lib/utils";

const fetcher = (url: string) => api.get(url).then((r) => r.data);

interface EventSummary {
  id: string;
  name: string;
  venue: string;
  startDate: string;
  isActive: boolean;
  _count?: { guests: number };
}

export default function EventsPage() {
  const { user } = useAuthStore();
  const { setActiveEvent } = useEventStore();
  const { data, error, isLoading, mutate } = useSWR("/events", fetcher);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const isAdmin = user?.role === "ADMIN";

  const events: EventSummary[] = data?.data ?? [];

  useEffect(() => {
    if (user?.role === "STAFF" && events.length === 1) {
      const event = events[0];
      setActiveEvent({
        id: event.id,
        name: event.name,
        venue: event.venue,
        startDate: event.startDate,
      });
    }
  }, [events, setActiveEvent, user?.role]);

  const removeEvent = async (event: EventSummary) => {
    const confirmed = window.confirm(
      `Delete "${event.name}"? Its guests and scan history will also be permanently deleted.`
    );
    if (!confirmed) return;

    setActionError("");
    setDeletingId(event.id);
    try {
      await api.delete(`/events/${event.id}`);
      await mutate();
    } catch {
      setActionError(`Could not delete "${event.name}". Please try again.`);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Events</h1>
        {isAdmin && (
          <Link href="/events/new" className="btn-primary">
            <Plus className="w-4 h-4" /> New Event
          </Link>
        )}
      </div>

      {error && (
        <p role="alert" className="text-red-400 text-sm mb-4">
          Could not load events. Please refresh and try again.
        </p>
      )}
      {actionError && (
        <p role="alert" className="text-red-400 text-sm mb-4">{actionError}</p>
      )}

      {isLoading && (
        <div className="text-slate-400 text-center py-12">Loading...</div>
      )}

      {!isLoading && events.length === 0 && (
        <div className="card text-center py-12">
          <Calendar className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">No events yet</p>
          {isAdmin && (
            <Link href="/events/new" className="btn-primary mt-4 inline-flex">
              <Plus className="w-4 h-4" /> Create First Event
            </Link>
          )}
        </div>
      )}

      <div className="grid gap-4">
        {events.map((event) => (
          <div key={event.id} className="card hover:border-entron-blue/50 transition-all group">
            <div className="flex items-start justify-between gap-3">
              <Link
                href={`/events/${event.id}`}
                onClick={() => setActiveEvent({
                  id: event.id,
                  name: event.name,
                  venue: event.venue,
                  startDate: event.startDate,
                })}
                className="flex-1 min-w-0"
              >
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-slate-100 truncate">{event.name}</h3>
                  <span className={`badge ${event.isActive ? "badge-green" : "badge-red"}`}>
                    {event.isActive ? "Active" : "Closed"}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-sm text-slate-400 mb-2">
                  <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate">{event.venue}</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {formatDate(event.startDate, "dd MMM yyyy")}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {event._count?.guests ?? 0} guests
                  </span>
                </div>
              </Link>
              <div className="flex items-center gap-2">
                {isAdmin && (
                  <>
                    <Link
                      href={`/events/${event.id}/edit`}
                      aria-label={`Edit ${event.name}`}
                      className="p-2 rounded-lg text-slate-400 hover:text-entron-blue hover:bg-slate-700/50"
                    >
                      <Pencil className="w-4 h-4" />
                    </Link>
                    <button
                      type="button"
                      onClick={() => removeEvent(event)}
                      disabled={deletingId === event.id}
                      aria-label={`Delete ${event.name}`}
                      className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-700/50 disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
                <ChevronRight className="w-5 h-5 text-slate-600 group-hover:text-entron-blue transition-colors flex-shrink-0 mt-1" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
