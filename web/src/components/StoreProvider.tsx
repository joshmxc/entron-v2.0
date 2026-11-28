"use client";
import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/authStore";

export default function StoreProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    useAuthStore.persist.rehydrate();
    // Give rehydration one tick to complete
    setHydrated(true);
  }, []);

  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "var(--bg)" }}>
        <img
          src="/entron-logo.png"
          alt="Entron"
          className="w-20 h-20 rounded-2xl object-contain bg-black shadow-lg"
        />
      </div>
    );
  }

  return <>{children}</>;
}
