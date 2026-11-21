"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Printer } from "lucide-react";
import api from "@/lib/api";

type PrintableGuest = {
  id: string;
  firstName: string;
  lastName: string;
  invitations?: Array<{ cardUrl?: string | null }>;
};

const PAGE_SIZE = 500;

export default function PrintCardsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = use(params);
  const [guests, setGuests] = useState<PrintableGuest[]>([]);
  const [eventName, setEventName] = useState("Guest cards");
  const [cardsPerPage, setCardsPerPage] = useState(4);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const [eventResponse, firstPage] = await Promise.all([
          api.get(`/events/${eventId}`),
          api.get(`/events/${eventId}/invitations`, { params: { page: 1, pageSize: PAGE_SIZE } }),
        ]);
        const allGuests: PrintableGuest[] = firstPage.data.data ?? [];
        const totalPages: number = firstPage.data.totalPages ?? 1;
        for (let first = 2; first <= totalPages; first += 5) {
          const pageNumbers = Array.from({ length: Math.min(5, totalPages - first + 1) }, (_value, index) => first + index);
          const responses = await Promise.all(pageNumbers.map((page) =>
            api.get(`/events/${eventId}/invitations`, { params: { page, pageSize: PAGE_SIZE } })
          ));
          responses.forEach((response) => allGuests.push(...(response.data.data ?? [])));
        }
        if (!active) return;
        setEventName(eventResponse.data.data?.name ?? "Guest cards");
        setGuests(allGuests.filter((guest) => guest.invitations?.[0]?.cardUrl));
      } catch {
        if (active) setError("Could not load generated cards for printing.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [eventId]);

  const pages = useMemo(() => {
    const result: PrintableGuest[][] = [];
    for (let index = 0; index < guests.length; index += cardsPerPage) {
      result.push(guests.slice(index, index + cardsPerPage));
    }
    return result;
  }, [cardsPerPage, guests]);
  const columns = cardsPerPage === 1 ? 1 : cardsPerPage <= 6 ? 2 : 3;
  const rows = Math.ceil(cardsPerPage / columns);

  return (
    <div className="space-y-5">
      <style jsx global>{`
        @page { size: A4 portrait; margin: 8mm; }
        @media print {
          body * { visibility: hidden !important; }
          #guest-card-print, #guest-card-print * { visibility: visible !important; }
          #guest-card-print { position: fixed; inset: 0; width: 100%; }
          .print-page { break-after: page; page-break-after: always; }
          .print-page:last-child { break-after: auto; page-break-after: auto; }
        }
      `}</style>

      <header className="print:hidden flex flex-wrap items-center gap-3">
        <Link href={`/events/${eventId}/invitations`} className="text-slate-400 hover:text-slate-100" aria-label="Back to card design">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="page-title">Print guest cards</h1>
          <p className="text-sm text-slate-400">{eventName}</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          Cards per page
          <select
            value={cardsPerPage}
            onChange={(event) => setCardsPerPage(Number(event.target.value))}
            className="input"
          >
            {[1, 2, 4, 6, 9].map((count) => <option key={count} value={count}>{count}</option>)}
          </select>
        </label>
        <button onClick={() => window.print()} disabled={loading || guests.length === 0} className="btn-primary">
          <Printer className="h-4 w-4" /> Print / Save PDF
        </button>
      </header>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading generated cards...
        </div>
      )}
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      {!loading && !error && guests.length === 0 && (
        <p className="text-sm text-slate-400">No generated cards are available to print yet.</p>
      )}

      <div id="guest-card-print" className="space-y-6 print:space-y-0">
        {pages.map((page, pageIndex) => (
          <section
            key={pageIndex}
            className="print-page mx-auto grid min-h-[260mm] max-w-5xl gap-4 rounded-lg bg-white p-4 print:m-0 print:h-[281mm] print:min-h-0 print:max-w-none print:rounded-none print:bg-white print:p-0 print:gap-[6mm]"
            style={{
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
            }}
          >
            {page.map((guest) => (
              <article key={guest.id} className="flex min-h-0 flex-col items-center justify-center overflow-hidden border border-slate-200 p-2 print:border-0 print:p-0">
                <img
                  src={guest.invitations?.[0]?.cardUrl ?? ""}
                  alt={`Guest card for ${guest.firstName} ${guest.lastName}`}
                  className="max-h-full max-w-full object-contain"
                />
              </article>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
