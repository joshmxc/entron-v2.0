"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Camera } from "lucide-react";
import { useScanner } from "@/hooks/useScanner";
import ScanResult from "@/components/scanner/ScanResult";

export default function ScanPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = use(params);
  const {
    videoRef,
    scannerState,
    result,
    selectedAdmissions,
    setSelectedAdmissions,
    startScanning,
    stopScanning,
    handleUniqueCode,
  } = useScanner(eventId);
  const [mode, setMode] = useState<"qr" | "code">("qr");
  const [uniqueCode, setUniqueCode] = useState("");

  useEffect(() => {
    if (mode === "qr") startScanning();
    else stopScanning();
    return () => stopScanning();
  }, [mode]);

  const submitUniqueCode = (event: React.FormEvent) => {
    event.preventDefault();
    if (!uniqueCode.trim()) return;
    void handleUniqueCode(uniqueCode, selectedAdmissions);
  };

  return (
    <div className="fixed inset-0 bg-black flex flex-col z-50">
      {/* Header overlay */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center gap-3 p-4 bg-gradient-to-b from-black/80 to-transparent">
        <Link href={`/events/${eventId}`} onClick={stopScanning} className="text-white">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <span className="text-white font-medium">Skana QR Code</span>
        <div className="ml-auto flex items-center gap-2 text-xs text-white/70">
          <span className="w-2 h-2 rounded-full bg-entron-blue animate-pulse inline-block" />
          {scannerState === "SCANNING" && "Inaskanikisha..."}
          {scannerState === "PENDING" && "Inathibitisha..."}
          {scannerState === "IDLE" && "Imesimama"}
        </div>
      </div>

      <div className="absolute top-20 left-1/2 z-20 flex -translate-x-1/2 rounded-xl border border-white/20 bg-black/70 p-1">
        <button
          type="button"
          onClick={() => setMode("qr")}
          className={`rounded-lg px-4 py-2 text-sm ${mode === "qr" ? "bg-entron-blue text-white" : "text-white/70"}`}
        >
          Scan QR
        </button>
        <button
          type="button"
          onClick={() => setMode("code")}
          className={`rounded-lg px-4 py-2 text-sm ${mode === "code" ? "bg-entron-blue text-white" : "text-white/70"}`}
        >
          Enter Unique ID
        </button>
      </div>

      <div className="absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-white/20 bg-black/70 p-2">
        <span className="px-2 text-xs font-semibold text-white/60">Admit</span>
        {[1, 2].map((count) => (
          <button
            key={count}
            type="button"
            onClick={() => setSelectedAdmissions(count)}
            className={`rounded-lg px-3 py-2 text-sm font-semibold ${selectedAdmissions === count ? "bg-entron-blue text-white" : "text-white/70"}`}
          >
            {count} {count === 1 ? "person" : "people"}
          </button>
        ))}
      </div>

      {mode === "code" && (
        <form
          onSubmit={submitUniqueCode}
          className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/95 px-6"
        >
          <div className="w-full max-w-sm space-y-4 rounded-2xl border border-white/10 bg-slate-900 p-5">
            <div className="text-center">
              <h2 className="text-lg font-semibold text-white">Verify Unique ID</h2>
              <p className="mt-1 text-sm text-white/60">Enter the guest’s ENT- code</p>
            </div>
            <input
              value={uniqueCode}
              onChange={(event) => setUniqueCode(event.target.value.toUpperCase())}
              placeholder="ENT-XXXXXX"
              autoComplete="off"
              className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-center text-xl font-semibold tracking-widest text-white"
            />
            <button type="submit" className="btn-primary btn-lg w-full">
              Verify Guest
            </button>
          </div>
        </form>
      )}

      {/* Video feed */}
      <video
        ref={videoRef}
        className="w-full h-full object-cover"
        playsInline
        muted
        autoPlay
      />

      {/* Scanner frame overlay */}
      {(scannerState === "SCANNING" || scannerState === "PENDING") && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative w-64 h-64">
            {/* Corner brackets */}
            <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-entron-blue rounded-tl-lg" />
            <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-entron-blue rounded-tr-lg" />
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-entron-blue rounded-bl-lg" />
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-entron-blue rounded-br-lg" />

            {/* Scan line */}
            {scannerState === "SCANNING" && (
              <div className="absolute left-2 right-2 top-0 h-0.5 bg-entron-blue opacity-80"
                style={{ animation: "scan-line 2s linear infinite" }} />
            )}
          </div>
          <p className="absolute bottom-32 text-white/70 text-sm">Elekeza kamera kwenye QR code</p>
        </div>
      )}

      {/* Result overlay */}
      {result && (scannerState === "RESULT" || scannerState === "COOLDOWN") && (
        <ScanResult
          result={result}
          onDismiss={() => {
            if (mode === "qr") {
              void startScanning();
            } else {
              setUniqueCode("");
              stopScanning();
            }
          }}
        />
      )}

      {/* Start button (if idle) */}
      {scannerState === "IDLE" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
          <Camera className="w-16 h-16 text-white/40" />
          <button onClick={startScanning} className="btn-primary btn-lg">
            Anzisha Kamera
          </button>
        </div>
      )}

      <style jsx>{`
        @keyframes scan-line {
          0% { top: 0; }
          50% { top: calc(100% - 2px); }
          100% { top: 0; }
        }
      `}</style>
    </div>
  );
}
