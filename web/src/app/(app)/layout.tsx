"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import Sidebar from "@/components/layout/Sidebar";
import BottomNav from "@/components/layout/BottomNav";
import Header from "@/components/layout/Header";
import { useOfflineQueue } from "@/hooks/useOfflineQueue";
import ThemeProvider from "@/components/ThemeProvider";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, accessToken } = useAuthStore();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  useOfflineQueue();

  useEffect(() => {
    // Wait one tick for Zustand rehydration before checking auth
    const t = setTimeout(() => setReady(true), 50);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (ready && (!user || !accessToken)) router.push("/login");
  }, [ready, user, accessToken, router]);

  if (!ready || !user) return null;

  return (
    <ThemeProvider>
    <div className="flex min-h-screen w-full max-w-[100vw] overflow-x-hidden">
      {/* Sidebar — desktop only */}
      <aside className="hidden md:flex w-64 flex-col fixed inset-y-0 left-0 z-20">
        <Sidebar />
      </aside>

      {/* Main content */}
      <div className="min-w-0 w-full flex-1 md:ml-64 flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 min-w-0 w-full max-w-[100vw] p-3 sm:p-4 md:p-6 pb-24 md:pb-6 overflow-x-hidden">
          {children}
        </main>
      </div>

      {/* Bottom nav — mobile only */}
      <BottomNav />
    </div>
    </ThemeProvider>
  );
}
