"use client";

import { ReactNode } from "react";
import { statusClass } from "@/lib/client";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="h1">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-sm text-mist-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function StatCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: string;
}) {
  return (
    <div className="card card-hover p-4">
      <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-mist-400">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
      {hint && <div className="mt-1 text-[11px] text-mist-400">{hint}</div>}
    </div>
  );
}

export function StatusPill({ status, className = "" }: { status: string; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] capitalize ${statusClass(
        status,
      )} ${className}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.015] px-6 py-14 text-center">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-white/[0.04] text-mist-400">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M12 5v14M5 12h14" strokeLinecap="round" />
        </svg>
      </div>
      <div className="text-sm font-medium text-mist-200">{title}</div>
      {hint && <div className="mt-1 max-w-md text-xs text-mist-400">{hint}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-xl flex-col border-l border-white/10 bg-ink-900/95 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-mist-400 hover:bg-white/5 hover:text-white">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-white/8 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Toast({ message, kind = "info", onDone }: { message: string; kind?: "info" | "error" | "ok"; onDone: () => void }) {
  return (
    <div
      className={`fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 rounded-xl border px-4 py-2.5 text-sm shadow-xl backdrop-blur ${
        kind === "error"
          ? "border-red-500/30 bg-red-950/80 text-red-200"
          : kind === "ok"
            ? "border-emerald-500/30 bg-emerald-950/80 text-emerald-200"
            : "border-white/10 bg-ink-800/90 text-mist-200"
      }`}
      onClick={onDone}
    >
      {message}
    </div>
  );
}
