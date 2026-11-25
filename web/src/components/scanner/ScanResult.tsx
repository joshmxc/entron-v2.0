"use client";
import { useEffect } from "react";
import { CheckCircle, XCircle, AlertTriangle, User, Hash } from "lucide-react";
import { ScanResult as ScanResultType } from "@/store/scanStore";
import { cn } from "@/lib/utils";

const TYPE_LABELS: Record<string, string> = {
  SINGLE: "Single", DOUBLE: "Double", FAMILY: "Family", VIP: "VIP",
};

const STATUS_CONFIG: Record<string, {
  gradient: string;
  glow: string;
  icon: React.ElementType;
  label: string;
  iconColor: string;
  subtitle: string;
}> = {
  SUCCESS: { gradient: "from-emerald-950 via-green-900 to-emerald-700", glow: "shadow-emerald-400/40", icon: CheckCircle, label: "WELCOME!", iconColor: "text-emerald-100", subtitle: "Check-in confirmed" },
  ALREADY_SCANNED: { gradient: "from-amber-950 via-orange-900 to-amber-700", glow: "shadow-amber-400/40", icon: AlertTriangle, label: "ALREADY SCANNED", iconColor: "text-amber-100", subtitle: "Entry limit has already been used" },
  LIMIT_REACHED: { gradient: "from-orange-950 via-red-900 to-orange-700", glow: "shadow-orange-400/40", icon: AlertTriangle, label: "LIMIT REACHED", iconColor: "text-orange-100", subtitle: "No admissions remain" },
  INVALID_QR: { gradient: "from-slate-950 via-red-950 to-red-800", glow: "shadow-red-400/40", icon: XCircle, label: "NOT RECOGNIZED", iconColor: "text-red-100", subtitle: "Check the QR code or Unique ID" },
  WRONG_EVENT: { gradient: "from-slate-950 via-purple-950 to-purple-800", glow: "shadow-purple-400/40", icon: XCircle, label: "WRONG EVENT", iconColor: "text-purple-100", subtitle: "This ticket belongs to another event" },
};

interface Props {
  result: ScanResultType;
  onDismiss?: () => void;
}

export default function ScanResult({ result, onDismiss }: Props) {
  const config = STATUS_CONFIG[result.status] ?? STATUS_CONFIG.INVALID_QR;
  const Icon = config.icon;
  const isSuccess = result.status === "SUCCESS";

  useEffect(() => {
    const AudioContextClass = window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const master = context.createGain();
    master.gain.value = 0.14;
    master.connect(context.destination);

    const tone = (frequency: number, start: number, duration: number, volume = 1) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, context.currentTime + start);
      gain.gain.setValueAtTime(0.0001, context.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(volume, context.currentTime + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + start + duration);
      oscillator.connect(gain);
      gain.connect(master);
      oscillator.start(context.currentTime + start);
      oscillator.stop(context.currentTime + start + duration + 0.05);
    };

    if (isSuccess) {
      tone(523.25, 0, 0.38, 0.8);
      tone(659.25, 0.10, 0.38, 0.65);
      tone(783.99, 0.20, 0.55, 0.55);
    } else if (result.status === "ALREADY_SCANNED") {
      tone(392, 0, 0.22, 0.7);
      tone(329.63, 0.18, 0.28, 0.6);
    } else if (result.status === "LIMIT_REACHED") {
      tone(220, 0, 0.32, 0.75);
      tone(196, 0.22, 0.45, 0.65);
    } else {
      tone(174.61, 0, 0.20, 0.7);
      tone(146.83, 0.16, 0.32, 0.65);
      tone(123.47, 0.32, 0.38, 0.55);
    }
    const closeTimer = window.setTimeout(() => void context.close(), 1200);
    return () => window.clearTimeout(closeTimer);
  }, [isSuccess, result.status]);

  return (
    <div
      className={cn(
        "scan-overlay fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden px-6 bg-gradient-to-br",
        config.gradient
      )}
      onClick={onDismiss}
    >
      <div className="absolute inset-0 scan-grid opacity-20" />
      <div className="absolute left-1/2 top-1/2 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10 scan-ripple" />

      {isSuccess && (
        <div className="absolute inset-0 pointer-events-none">
          {Array.from({ length: 18 }).map((_, index) => (
            <span
              key={index}
              className="scan-confetti"
              style={{
                left: `${8 + ((index * 31) % 84)}%`,
                animationDelay: `${(index % 6) * 0.08}s`,
                background: ["#fbbf24", "#ffffff", "#34d399", "#60a5fa"][index % 4],
              }}
            />
          ))}
        </div>
      )}

      <div className={cn("relative w-full max-w-md rounded-[2rem] border border-white/15 bg-white/10 p-7 text-center shadow-2xl backdrop-blur-xl scan-card", config.glow)}>
        <div className={cn("mx-auto mb-5 flex h-28 w-28 items-center justify-center rounded-full border border-white/20 bg-white/10 shadow-xl scan-icon", config.glow)}>
          <Icon className={cn("h-16 w-16", config.iconColor)} strokeWidth={1.35} />
        </div>

        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.32em] text-white/60">
          Entron Check-In
        </p>
        <h1 className="text-3xl font-black tracking-wide text-white sm:text-4xl">
          {config.label}
        </h1>
        <p className="mt-2 text-sm text-white/65">{config.subtitle}</p>

        {result.guest && (
          <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 px-5 py-5">
            <div className="flex items-center justify-center gap-2">
              <User className="h-5 w-5 text-white/60" />
              <p className="text-xl font-bold text-white">
                {result.guest.firstName} {result.guest.lastName}
              </p>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-sm font-semibold text-white">
                {TYPE_LABELS[result.guest.guestType] ?? result.guest.guestType}
              </span>
              {result.guest.tableNumber && (
                <span className="flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-sm font-semibold text-white">
                  <Hash className="h-3.5 w-3.5" /> Table {result.guest.tableNumber}
                </span>
              )}
            </div>

            {isSuccess && (
              <div className="mt-5">
                <div className="mb-2 flex justify-between text-xs text-white/60">
                  <span>Admissions</span>
                  <span>{result.guest.admissionsUsed}/{result.guest.maxAdmissions}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-black/30">
                  <div
                    className="h-full rounded-full bg-white/90 scan-progress"
                    style={{ width: `${Math.min(100, (result.guest.admissionsUsed / result.guest.maxAdmissions) * 100)}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-white/60">
                  {result.admissionCount === 2
                    ? "Both ticket admissions admitted"
                    : "One ticket admission admitted"}
                </p>
              </div>
            )}
          </div>
        )}

        {!result.guest && (
          <p className="mt-5 text-sm text-white/75">{result.message}</p>
        )}

        <p className="mt-6 text-xs font-medium uppercase tracking-[0.22em] text-white/40">Tap anywhere to continue</p>
      </div>

        <style jsx>{`
          .scan-card {
            animation: scan-card-in 620ms cubic-bezier(.16,1,.3,1) both;
          }
          .scan-icon {
            animation: scan-icon-in 780ms cubic-bezier(.16,1,.3,1) both;
          }
          .scan-ripple {
            animation: scan-ripple 2.2s ease-out infinite;
          }
          .scan-grid {
            background-image:
              linear-gradient(rgba(255,255,255,.12) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,.12) 1px, transparent 1px);
            background-size: 42px 42px;
            mask-image: radial-gradient(circle at center, black 10%, transparent 72%);
          }
          .scan-progress {
            animation: scan-progress 900ms cubic-bezier(.16,1,.3,1) both;
          }
          .scan-confetti {
            position: absolute;
            top: -24px;
            width: 8px;
            height: 14px;
            border-radius: 2px;
            animation: scan-confetti-fall 1.8s ease-in infinite;
          }
          @keyframes scan-card-in {
            from { opacity: 0; transform: scale(.82) translateY(30px) rotateX(8deg); }
            to { opacity: 1; transform: scale(1) translateY(0) rotateX(0); }
          }
          @keyframes scan-icon-in {
            0% { opacity: 0; transform: scale(.3) rotate(-18deg); }
            60% { transform: scale(1.12) rotate(4deg); }
            100% { opacity: 1; transform: scale(1) rotate(0); }
          }
          @keyframes scan-ripple {
            0% { transform: translate(-50%, -50%) scale(.42); opacity: .65; }
            100% { transform: translate(-50%, -50%) scale(1.28); opacity: 0; }
          }
          @keyframes scan-progress {
            from { width: 0; }
          }
          @keyframes scan-confetti-fall {
            0% { transform: translateY(-20px) rotate(0deg); opacity: 0; }
            12% { opacity: 1; }
            100% { transform: translateY(110vh) rotate(540deg); opacity: 0; }
          }
        `}</style>
    </div>
  );
}
