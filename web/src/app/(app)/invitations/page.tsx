"use client";

import Link from "next/link";
import useSWR from "swr";
import { Palette } from "lucide-react";
import api from "@/lib/api";
import { useEventStore } from "@/store/eventStore";

type EventOption = {
  id: string;
  name: string;
  venue: string;
  startDate: string;
};

const fetcher = (url: string) => api.get(url).then((response) => response.data);

export default function InvitationsPage() {
  const { activeEvent, setActiveEvent } = useEventStore();
  const { data, error, isLoading } = useSWR("/events", fetcher);
  const events: EventOption[] = data?.data ?? [];
  const selectedEvent = events.find((event) => event.id === activeEvent?.id) ?? activeEvent;

  return (
    <div className="max-w-2xl">
      <div className="mb-6 flex items-center gap-3">
        <Palette className="h-8 w-8 text-purple-400" />
        <div>
          <h1 className="page-title">Card Design</h1>
          <p className="text-sm text-slate-400">Choose an event to create or customize its guest card designs.</p>
        </div>
      </div>

      {error && <p role="alert" className="mb-4 text-sm text-red-400">Could not load events. Please refresh and try again.</p>}

      <section className="card space-y-4">
        <label className="input-group">
          <span>Event</span>
          <select
            value={selectedEvent?.id ?? ""}
            onChange={(event) => {
              const nextEvent = events.find((item) => item.id === event.target.value);
              if (nextEvent) setActiveEvent(nextEvent);
            }}
            disabled={isLoading || events.length === 0}
          >
            <option value="">{isLoading ? "Loading events..." : "Select an event"}</option>
            {events.map((event) => (
              <option key={event.id} value={event.id}>{event.name}</option>
            ))}
          </select>
        </label>

        {selectedEvent ? (
          <>
            <div className="rounded-lg border border-entron-dark-border bg-slate-900/50 p-4">
              <p className="font-medium text-slate-100">{selectedEvent.name}</p>
              <p className="mt-1 text-sm text-slate-400">{selectedEvent.venue}</p>
              <p className="mt-3 text-xs text-slate-500">
                Designs are saved for this event only. You can upload a background, customize text and QR layers, and create multiple designs for different guest types.
              </p>
            </div>
            <Link href={`/events/${selectedEvent.id}/invitations`} className="btn-primary inline-flex">
              Design cards for {selectedEvent.name}
            </Link>
          </>
        ) : (
          <p className="text-sm text-slate-400">
            {events.length ? "Select an event to manage its card designs." : "Create or select an event before designing cards."}
          </p>
        )}
      </section>
    </div>
  );
}
