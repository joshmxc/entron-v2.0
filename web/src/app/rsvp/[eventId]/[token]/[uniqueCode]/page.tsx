"use client";

import { use, useEffect, useState } from "react";
import { CheckCircle2, CalendarDays, MapPin, XCircle } from "lucide-react";

interface RsvpGuest {
  id: string;
  firstName: string;
  lastName: string;
  guestType: string;
  maxAdmissions: number;
  rsvpStatus: "PENDING" | "ATTENDING" | "DECLINED";
  rsvpAttendees: number;
}

export default function RsvpPage({
  params,
}: {
  params: Promise<{ eventId: string; token: string; uniqueCode: string }>;
}) {
  const { eventId, token, uniqueCode } = use(params);
  const [event, setEvent] = useState<{ name: string; nameSwahili?: string; venue: string; startDate: string } | null>(null);
  const [guest, setGuest] = useState<RsvpGuest | null>(null);
  const [attendees, setAttendees] = useState(1);
  const [status, setStatus] = useState<"PENDING" | "ATTENDING" | "DECLINED">("PENDING");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/v1/public/rsvp/${eventId}/${token}/${uniqueCode}`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Invitation not found");
        setEvent(body.data.event);
        setGuest(body.data.guest);
        setStatus(body.data.guest.rsvpStatus);
        setAttendees(body.data.guest.rsvpAttendees || 1);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Invitation not found"))
      .finally(() => setLoading(false));
  }, [eventId, token, uniqueCode]);

  const submit = async (nextStatus: "ATTENDING" | "DECLINED") => {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/v1/public/rsvp/${eventId}/${token}/${uniqueCode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus, attendees }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not save RSVP");
      setStatus(nextStatus);
      setAttendees(body.data.attendees);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save RSVP");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">Loading invitation...</main>;
  }
  if (error && !guest) {
    return <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-center text-red-400">{error}</main>;
  }

  const eventName = event?.nameSwahili || event?.name || "Event";
  const guestName = guest ? `${guest.firstName} ${guest.lastName}`.trim() : "";

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
      <div className="mx-auto max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div className="mb-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-blue-400">Entron RSVP</p>
          <h1 className="mt-2 text-2xl font-bold">{eventName}</h1>
          {guestName && <p className="mt-2 text-slate-300">Hello, {guestName}</p>}
        </div>

        {event && (
          <div className="mb-6 space-y-2 rounded-2xl bg-black/20 p-4 text-sm text-slate-300">
            <p className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-blue-400" />{new Date(event.startDate).toLocaleString()}</p>
            {event.venue && <p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-blue-400" />{event.venue}</p>}
          </div>
        )}

        {guest && guest.maxAdmissions > 1 ? (
          <div className="mb-5">
            <p className="mb-2 text-sm text-slate-400">How many people are attending?</p>
            <div className="grid grid-cols-2 gap-2">
              {Array.from({ length: guest.maxAdmissions }, (_, index) => index + 1).map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => setAttendees(count)}
                  className={`rounded-xl border px-3 py-3 text-sm font-semibold ${attendees === count ? "border-blue-500 bg-blue-500/10 text-blue-300" : "border-slate-700 text-slate-300"}`}
                >
                  {count} {count === 1 ? "person" : "people"}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {status === "ATTENDING" && (
          <div className="mb-5 rounded-2xl border border-green-700/40 bg-green-950/30 p-4 text-center">
            <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-green-400" />
            <p className="font-semibold text-green-300">RSVP confirmed</p>
            <p className="mt-1 text-sm text-slate-400">{attendees} {attendees === 1 ? "person" : "people"} attending</p>
          </div>
        )}
        {status === "DECLINED" && (
          <div className="mb-5 rounded-2xl border border-slate-700 bg-slate-800/40 p-4 text-center">
            <XCircle className="mx-auto mb-2 h-8 w-8 text-slate-400" />
            <p className="font-semibold text-slate-300">You selected cannot attend</p>
          </div>
        )}

        {error && <p className="mb-4 text-center text-sm text-red-400">{error}</p>}

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={saving}
            onClick={() => submit("ATTENDING")}
            className="rounded-xl bg-green-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
          >
            Attending
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => submit("DECLINED")}
            className="rounded-xl border border-slate-700 px-4 py-3 text-sm font-bold text-slate-300 disabled:opacity-60"
          >
            Cannot attend
          </button>
        </div>
      </div>
    </main>
  );
}
