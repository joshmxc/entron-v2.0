"use client";

import { useState } from "react";
import useSWR from "swr";
import { Plus, Trash2, KeyRound, ShieldCheck, UserCog, UserCheck, UserX } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

const fetcher = (url: string) => api.get(url).then((response) => response.data);

export default function StaffPage() {
  useAuth("ADMIN");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    username: "",
    phone: "",
    password: "",
    role: "STAFF",
    canScan: true,
    canManageGuests: false,
    canDesignCards: false,
    canSendMessages: false,
    eventIds: [] as string[],
  });
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  const { data: usersResult, mutate: mutateUsers } = useSWR("/users", fetcher);
  const { data: eventsResult } = useSWR("/events", fetcher);
  const users = usersResult?.data ?? [];
  const events = eventsResult?.data ?? [];

  const addStaff = async (event: React.FormEvent) => {
    event.preventDefault();
    if (form.name.length < 2 || form.username.length < 3 || form.phone.length < 9 || form.password.length < 6) return;
    setSaving(true);
    try {
      await api.post("/users", form);
      setForm({
        name: "",
        username: "",
        phone: "",
        password: "",
        role: "STAFF",
        canScan: true,
        canManageGuests: false,
        canDesignCards: false,
        canSendMessages: false,
        eventIds: [],
      });
      setShowForm(false);
      await mutateUsers();
      window.alert("Staff member added successfully.");
    } catch (error) {
      const message = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
      window.alert(message || "Could not add the staff member.");
    } finally {
      setSaving(false);
    }
  };

  const updateUser = async (id: string, patch: Record<string, unknown>) => {
    setActionId(id);
    try {
      await api.patch(`/users/${id}`, patch);
      await mutateUsers();
      window.alert(patch.password ? "Password changed successfully." : "Staff account updated.");
    } catch (error) {
      const message = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
      window.alert(message || "Could not update the staff account.");
    } finally {
      setActionId(null);
    }
  };

  const removeUser = async (id: string, name: string) => {
    if (!window.confirm(`Remove ${name}? This cannot be undone.`)) return;
    setActionId(id);
    try {
      await api.delete(`/users/${id}`);
      await mutateUsers();
      window.alert(`${name} was removed.`);
    } catch (error) {
      const message = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
      window.alert(message || "Could not remove this staff member.");
    } finally {
      setActionId(null);
    }
  };

  const isOnline = (lastSeenAt: unknown) => {
    if (!lastSeenAt) return false;
    return Date.now() - new Date(String(lastSeenAt)).getTime() < 5 * 60 * 1000;
  };

  const lastSeen = (lastSeenAt: unknown) => {
    if (!lastSeenAt) return "Never";
    const date = new Date(String(lastSeenAt));
    const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hr ago`;
    return date.toLocaleString();
  };

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">Staff</h1>
        <button onClick={() => setShowForm((visible) => !visible)} className="btn-primary">
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>

      {showForm && (
        <form onSubmit={addStaff} className="card space-y-4">
          <h2 className="font-semibold text-slate-200">New Staff Member</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="input-group">
              <label>Full Name</label>
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Jane Smith" />
            </div>
            <div className="input-group">
              <label>Username</label>
              <input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} placeholder="jane.staff" />
            </div>
            <div className="input-group">
              <label>Phone Number</label>
              <input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="0700 000 000" />
            </div>
            <div className="input-group">
              <label>Password</label>
              <input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="Minimum 6 characters" />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            {[
              ["canScan", "Can scan QR codes"],
              ["canManageGuests", "Can add/edit guests"],
              ["canDesignCards", "Can design cards"],
              ["canSendMessages", "Can send messages"],
            ].map(([key, label]) => (
              <label key={key} className="flex items-center justify-between rounded-lg border border-entron-dark-border px-3 py-2 text-sm text-slate-300">
                {label}
                <input
                  type="checkbox"
                  checked={Boolean(form[key as keyof typeof form])}
                  onChange={(event) => setForm({ ...form, [key]: event.target.checked })}
                  className="accent-entron-blue"
                />
              </label>
            ))}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300">Assigned Events</label>
            <div className="grid sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
              {events.map((event: Record<string, unknown>) => {
                const eventId = String(event.id);
                const assigned = form.eventIds.includes(eventId);
                return (
                  <label key={eventId} className="flex items-center justify-between rounded-lg border border-entron-dark-border px-3 py-2 text-sm text-slate-300">
                    {String(event.name)}
                    <input
                      type="checkbox"
                      checked={assigned}
                      onChange={(change) => setForm({
                        ...form,
                        eventIds: change.target.checked
                          ? [...form.eventIds, eventId]
                          : form.eventIds.filter((id) => id !== eventId),
                      })}
                      className="accent-entron-blue"
                    />
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? "Adding..." : "Add Staff Member"}</button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {users.map((user: Record<string, unknown>) => {
          const eventIds = (user.eventIds as string[] | undefined) ?? [];
          return (
            <div key={String(user.id)} className="card space-y-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${user.isActive ? "bg-entron-blue/20" : "bg-slate-700"}`}>
                  <UserCog className={`w-5 h-5 ${user.isActive ? "text-entron-blue" : "text-slate-500"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-slate-200">{String(user.name)}</p>
                    {isOnline(user.lastSeenAt) && <span className="w-2 h-2 rounded-full bg-green-400" />}
                  </div>
                  <p className="text-sm text-slate-400">@{String(user.username ?? user.phone)} · {String(user.phone)}</p>
                  <p className="text-xs text-slate-500">{isOnline(user.lastSeenAt) ? "Using system now" : `Last seen: ${lastSeen(user.lastSeenAt)}`}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`badge ${user.role === "ADMIN" ? "badge-purple" : "badge-blue"}`}>{user.role === "ADMIN" ? "Admin" : "Staff"}</span>
                  <button
                    onClick={() => updateUser(String(user.id), { isActive: !Boolean(user.isActive) })}
                    title={user.isActive ? "Deactivate account" : "Activate account"}
                    disabled={actionId === String(user.id)}
                    className="p-2"
                  >
                    {user.isActive ? <UserCheck className="w-4 h-4 text-blue-400" /> : <UserX className="w-4 h-4 text-red-400" />}
                  </button>
                  <button
                    onClick={async () => {
                      const password = window.prompt(`New password for ${String(user.name)} (minimum 6 characters):`);
                      if (!password || password.length < 6) return;
                      await updateUser(String(user.id), { password });
                    }}
                    title="Reset password"
                    disabled={actionId === String(user.id)}
                    className="p-2 text-slate-400"
                  >
                    <KeyRound className="w-4 h-4" />
                  </button>
                  {user.role !== "ADMIN" && (
                    <button onClick={() => removeUser(String(user.id), String(user.name))} title="Remove staff" disabled={actionId === String(user.id)} className="p-2 text-slate-400 hover:text-red-400 disabled:opacity-50">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {user.role !== "ADMIN" && (
                <>
                  <div className="grid sm:grid-cols-2 gap-2 border-t border-entron-dark-border pt-3">
                    {[
                      ["canScan", "Scan QR codes"],
                      ["canManageGuests", "Add/edit guests"],
                      ["canDesignCards", "Design cards"],
                      ["canSendMessages", "Send messages"],
                    ].map(([key, label]) => (
                      <label key={key} className="flex items-center justify-between rounded-lg bg-slate-800/40 px-3 py-2 text-sm text-slate-300">
                        <span className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-entron-blue" />{label}</span>
                        <input
                          type="checkbox"
                          checked={Boolean(user[key])}
                          onChange={(change) => updateUser(String(user.id), { [key]: change.target.checked })}
                          className="accent-entron-blue"
                        />
                      </label>
                    ))}
                  </div>
                  <div className="space-y-2 border-t border-entron-dark-border pt-3">
                    <p className="text-xs font-medium text-slate-400">Assigned events</p>
                    <div className="grid sm:grid-cols-2 gap-2">
                      {events.map((event: Record<string, unknown>) => {
                        const eventId = String(event.id);
                        const assigned = eventIds.includes(eventId);
                        return (
                          <label key={eventId} className="flex items-center justify-between rounded-lg border border-entron-dark-border px-3 py-2 text-sm text-slate-300">
                            {String(event.name)}
                            <input
                              type="checkbox"
                              checked={assigned}
                              onChange={(change) => {
                                const nextIds = change.target.checked
                                  ? [...new Set([...eventIds, eventId])]
                                  : eventIds.filter((id) => id !== eventId);
                                void updateUser(String(user.id), { eventIds: nextIds });
                              }}
                              className="accent-entron-blue"
                            />
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
