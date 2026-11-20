"use client";

import { useCallback, useEffect, useState } from "react";

export async function api<T = any>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers:
      init?.body instanceof FormData
        ? init?.headers
        : { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.error ?? `Error ${res.status}`);
  return data as T;
}

export function useApi<T = any>(url: string | null, intervalMs = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!url) return;
    try {
      const result = await api<T>(url);
      setData(result);
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? "Error de red");
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    setLoading(true);
    void reload();
    if (intervalMs > 0) {
      const timer = setInterval(() => void reload(), intervalMs);
      return () => clearInterval(timer);
    }
  }, [reload, intervalMs]);

  return { data, error, loading, reload, setData };
}

export const TYPE_COLORS: Record<string, string> = {
  documento: "#5ff0d8",
  persona: "#8b7cff",
  organizacion: "#4ea8ff",
  proyecto: "#ffc466",
  concepto: "#a99dff",
  proceso: "#ff8fb1",
  decision: "#ff7a7a",
  evento: "#7ee787",
  imagen: "#00c2ff",
  lugar: "#f0a35f",
  producto: "#d7a6ff",
  tecnologia: "#5ad1ff",
  otro: "#8b95ad",
};

export function typeColor(type: string) {
  return TYPE_COLORS[type] ?? TYPE_COLORS.otro;
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function relativeDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return `hace ${d} d`;
}

export const STATUS_STYLES: Record<string, string> = {
  procesado: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  pendiente: "bg-white/5 text-mist-300 border-white/10",
  procesando: "bg-sky-500/10 text-sky-300 border-sky-500/20",
  error: "bg-red-500/10 text-red-300 border-red-500/20",
  cancelado: "bg-amber-500/10 text-amber-300 border-amber-500/20",
  completado: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  en_cola: "bg-white/5 text-mist-300 border-white/10",
  confirmada: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  verificado: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  inferido: "bg-violet-500/10 text-violet-300 border-violet-500/20",
  usuario: "bg-sky-500/10 text-sky-300 border-sky-500/20",
  activo: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  inactivo: "bg-white/5 text-mist-300 border-white/10",
};

export function statusClass(status: string) {
  return STATUS_STYLES[status] ?? "bg-white/5 text-mist-300 border-white/10";
}
