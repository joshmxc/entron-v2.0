"use client";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { Calendar, QrCode } from "lucide-react";
import { useEventStore } from "@/store/eventStore";
import { useAuthStore } from "@/store/authStore";
import api from "@/lib/api";

const fetcher = (url: string) => api.get(url).then((response) => response.data);

interface ScannerEvent {
  id: string;
  name: string;
  venue: string;
  startDate: string;
}

export default function ScannerLandingPage() {
  const { activeEvent, setActiveEvent } = useEventStore();
  const { user } = useAuthStore();
  const { data: eventsData } = useSWR("/events", fetcher);
  const events: ScannerEvent[] = eventsData?.data ?? [];
  const [selectedEventId, setSelectedEventId] = useState(activeEvent?.id ?? "");
  const selectedEvent =
    events.find((event) => event.id === selectedEventId) ??
    (selectedEventId ? activeEvent : null);

  if (user?.role !== "ADMIN" && !user?.canScan) {
    return (
      <div className="text-center py-16">
        <QrCode className="w-12 h-12 text-slate-600 mx-auto mb-3" />
        <p className="text-slate-400">You do not have permission to scan QR codes.</p>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-16">
        <QrCode className="w-12 h-12 text-slate-600 mx-auto mb-3" />
        <p className="text-slate-400 mb-2">No events are available for scanning</p>
        <Link href="/events" className="btn-primary inline-flex">Go to Events</Link>
      </div>
    );
  }

  const chooseEvent = (eventId: string) => {
    setSelectedEventId(eventId);
    const event = events.find((item) => item.id === eventId);
    if (event) setActiveEvent(event);
  };

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center gap-6 px-4">
      <div className="w-full rounded-2xl border border-entron-dark-border bg-entron-dark-card p-5 text-center">
        <Calendar className="mx-auto mb-3 h-10 w-10 text-entron-blue" />
        <h1 className="mb-1 text-xl font-bold text-slate-100">Choose an Event</h1>
        <p className="mb-4 text-sm text-slate-400">Select the event you want to scan outside its event page</p>
        <select
          value={selectedEvent?.id ?? ""}
          onChange={(event) => chooseEvent(event.target.value)}
          className="w-full text-sm"
          aria-label="Event for scanning"
        >
          <option value="" disabled>Select an event</option>
          {events.map((event) => (
            <option key={event.id} value={event.id}>
              {event.name}{event.venue ? ` — ${event.venue}` : ""}
            </option>
          ))}
        </select>
      </div>

      {selectedEvent && (
        <div className="flex flex-col items-center gap-4 text-center">
          <QrCode className="h-14 w-14 text-entron-blue" />
          <div>
            <p className="text-lg font-semibold text-slate-100">{selectedEvent.name}</p>
            {selectedEvent.venue && <p className="text-sm text-slate-500">{selectedEvent.venue}</p>}
          </div>
          <Link href={`/events/${selectedEvent.id}/scan`} className="btn-primary btn-lg px-12">
            Start Scanning
          </Link>
        </div>
      )}
    </div>
  );
}
