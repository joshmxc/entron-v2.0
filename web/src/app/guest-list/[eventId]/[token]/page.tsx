"use client";

import { use, useState } from "react";
import useSWR from "swr";
import { Search, Users, Phone } from "lucide-react";

interface Guest {
  fullName: string;
  phone: string;
}

export default function PublicGuestListPage({
  params,
}: {
  params: Promise<{ eventId: string; token: string }>;
}) {
  const { eventId, token } = use(params);
  const [search, setSearch] = useState("");
  const query = search ? `?search=${encodeURIComponent(search)}` : "";
  const fetcher = (url: string) => fetch(url).then((response) => {
    if (!response.ok) throw new Error("Guest list not available");
    return response.json();
  });
  const { data, error, isLoading } = useSWR(
    `/api/v1/public/guest-list/${eventId}/${token}${query}`,
    fetcher
  );
  const guests: Guest[] = data?.data?.guests ?? [];
  const eventName = data?.data?.eventName ?? "Guest List";

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
      <div className="mx-auto max-w-3xl">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 shadow-lg shadow-blue-600/20">
            <Users className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold">{eventName}</h1>
          <p className="mt-1 text-sm text-slate-400">Guest name and phone list</p>
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search guest name or phone..."
            className="w-full rounded-xl border border-slate-700 bg-slate-900 py-3 pl-12 pr-4 text-slate-100 outline-none focus:border-blue-500"
          />
        </div>

        {isLoading && <p className="py-10 text-center text-slate-500">Loading guest list...</p>}
        {error && <p className="py-10 text-center text-red-400">Guest list is not available.</p>}

        {!isLoading && !error && (
          <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
            {guests.length === 0 ? (
              <p className="py-10 text-center text-slate-500">No matching guests found.</p>
            ) : (
              guests.map((guest, index) => (
                <div
                  key={`${guest.fullName}-${guest.phone}-${index}`}
                  className="flex items-center gap-3 border-b border-slate-800 px-4 py-4 last:border-b-0"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600/15 text-sm font-bold text-blue-400">
                    {guest.fullName.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-100">{guest.fullName || "—"}</p>
                    {guest.phone && (
                      <p className="mt-0.5 flex items-center gap-1 text-sm text-slate-400">
                        <Phone className="h-3.5 w-3.5" />
                        {guest.phone}
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </main>
  );
}
