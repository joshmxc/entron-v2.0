"use client";
import { useState } from "react";
import useSWR from "swr";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, UserCog, UserCheck, UserX, Circle, Trash2, KeyRound, ShieldCheck } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

const fetcher = (url: string) => api.get(url).then((r) => r.data);

const schema = z.object({
  name: z.string().min(2),
  username: z.string().min(3).regex(/^[a-zA-Z0-9._-]+$/, "Use letters, numbers, dots, underscores or hyphen"),
  phone: z.string().min(9),
  password: z.string().min(6),
  role: z.enum(["ADMIN", "STAFF"]).default("STAFF"),
  canScan: z.boolean().default(true),
  canManageGuests: z.boolean().default(false),
  canDesignCards: z.boolean().default(false),
  canSendMessages: z.boolean().default(false),
});

type FormData = z.infer<typeof schema>;

export default function StaffPage() {
  useAuth("ADMIN");
  const [showForm, setShowForm] = useState(false);
  const { data, mutate } = useSWR("/users", fetcher);
  const users = data?.data ?? [];
  const activeStaff = users.filter((u: Record<string, unknown>) => u.isActive);

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { role: "STAFF", canScan: true, canManageGuests: false, canDesignCards: false, canSendMessages: false },
  });

  const onSubmit = async (data: FormData) => {
    await api.post("/users", data);
    reset();
    setShowForm(false);
    mutate();
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    await api.patch(`/users/${id}`, { isActive: !isActive });
    mutate();
  };

  const removeUser = async (id: string, name: string) => {
    if (!window.confirm(`Remove ${name}? This cannot be undone.`)) return;
    await api.delete(`/users/${id}`);
    mutate();
  };

  const updatePermissions = async (id: string, permissions: Record<string, boolean>) => {
    await api.patch(`/users/${id}`, permissions);
    mutate();
  };

  const isOnline = (lastSeenAt: unknown) => {
    if (!lastSeenAt) return false;
    const seen = new Date(String(lastSeenAt)).getTime();
    return Date.now() - seen < 5 * 60 * 1000;
  };

  const formatLastSeen = (lastSeenAt: unknown) => {
    if (!lastSeenAt) return "Never";
    const date = new Date(String(lastSeenAt));
    const difference = Date.now() - date.getTime();
    if (difference < 60 * 1000) return "Just now";
    if (difference < 60 * 60 * 1000) return `${Math.floor(difference / 60000)} min ago`;
    if (difference < 24 * 60 * 60 * 1000) return `${Math.floor(difference / 3600000)} hr ago`;
    return date.toLocaleString();
  };

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">Staff</h1>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>

      {/* Active Staff Panel */}
      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <Circle className="w-3 h-3 text-green-400 fill-green-400" />
          <h2 className="font-semibold text-sm" style={{ color: "var(--text)" }}>
            Active Staff ({activeStaff.length})
          </h2>
        </div>
        {activeStaff.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>No active staff members.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {activeStaff.map((user: Record<string, unknown>) => (
              <div key={String(user.id)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium"
                style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)" }}>
                <span className="w-2 h-2 rounded-full bg-green-400" />
                <span>{user.name as string}</span>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {user.role === "ADMIN" ? "Admin" : "Staff"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit(onSubmit)} className="card space-y-4">
          <h2 className="font-semibold text-slate-200">New Staff Member</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="input-group">
              <label>Full Name</label>
              <input {...register("name")} placeholder="Jane Smith" />
              {errors.name && <p className="text-red-400 text-xs">{errors.name.message}</p>}
            </div>
            <div className="input-group">
              <label>Username</label>
              <input {...register("username")} placeholder="jane.staff" autoComplete="username" />
              {errors.username && <p className="text-red-400 text-xs">{errors.username.message}</p>}
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="input-group">
              <label>Phone Number</label>
              <input {...register("phone")} type="tel" placeholder="0700 000 000" />
              {errors.phone && <p className="text-red-400 text-xs">{errors.phone.message}</p>}
            </div>
            <div className="input-group">
              <label>Password</label>
              <input {...register("password")} type="password" placeholder="min. 6 characters" />
              {errors.password && <p className="text-red-400 text-xs">{errors.password.message}</p>}
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="input-group">
              <label>Role</label>
              <select {...register("role")}>
                <option value="STAFF">Staff</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" {...register("canScan")} /> Can scan QR codes
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" {...register("canManageGuests")} /> Can add/edit guests
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" {...register("canDesignCards")} /> Can design cards
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" {...register("canSendMessages")} /> Can send messages
            </label>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="btn-primary flex-1">
              {isSubmitting ? "Adding..." : "Add Staff Member"}
            </button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {users.map((user: Record<string, unknown>) => (
          <div key={String(user.id)} className="card space-y-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${user.isActive ? "bg-entron-blue/20" : "bg-slate-700"}`}>
                <UserCog className={`w-5 h-5 ${user.isActive ? "text-entron-blue" : "text-slate-500"}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-slate-200">{user.name as string}</p>
                  {isOnline(user.lastSeenAt) && <span className="w-2 h-2 rounded-full bg-green-400" title="Using the system now" />}
                </div>
                <p className="text-sm text-slate-400">
                  @{String(user.username ?? user.phone)} · {String(user.phone)}
                </p>
                <p className="text-xs text-slate-500">
                  {isOnline(user.lastSeenAt) ? "Using system now" : `Last seen: ${formatLastSeen(user.lastSeenAt)}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`badge ${user.role === "ADMIN" ? "badge-purple" : "badge-blue"}`}>
                  {user.role === "ADMIN" ? "Admin" : "Staff"}
                </span>
                <button
                  onClick={() => toggleActive(user.id as string, user.isActive as boolean)}
                  title={user.isActive ? "Deactivate account" : "Activate account"}
                  className="p-2 text-slate-400 hover:text-slate-200 transition-colors"
                >
                  {user.isActive ? <UserCheck className="w-4 h-4 text-blue-400" /> : <UserX className="w-4 h-4 text-red-400" />}
                </button>
                <button
                  onClick={async () => {
                    const password = window.prompt(`New password for ${String(user.name)} (minimum 6 characters):`);
                    if (!password || password.length < 6) return;
                    await api.patch(`/users/${String(user.id)}`, { password });
                  }}
                  title="Reset password"
                  className="p-2 text-slate-400 hover:text-entron-blue"
                >
                  <KeyRound className="w-4 h-4" />
                </button>
                {user.role !== "ADMIN" && (
                  <button
                    onClick={() => removeUser(String(user.id), String(user.name))}
                    title="Remove staff"
                    className="p-2 text-slate-400 hover:text-red-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
            {user.role !== "ADMIN" && (
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
                      onChange={(event) => updatePermissions(String(user.id), { [key]: event.target.checked })}
                      className="accent-entron-blue"
                    />
                  </label>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
