"use client";

import { useState } from "react";
import { api, formatDate, useApi } from "@/lib/client";
import { PageHeader, Spinner, Toast } from "@/components/ui";

interface Memoria {
  id: string;
  kind: string;
  content: string;
  summary: string | null;
  source: string;
  confidence: number;
  status: string;
  sensitive: boolean;
  created_at: string;
  updated_at: string;
  use_count: number;
}

const KIND_COLORS: Record<string, string> = {
  episodica: "text-sky-300 border-sky-500/25",
  semantica: "text-violet-300 border-violet-500/25",
  preferencia: "text-amber-300 border-amber-500/25",
  procedimental: "text-emerald-300 border-emerald-500/25",
  documental: "text-neon-400 border-neon-500/25",
  salud: "text-rose-300 border-rose-500/25",
};

export default function MemoriaPersonalPage() {
  const { data, reload, loading } = useApi<any>("/api/memory", 0);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("todas");
  const [nuevo, setNuevo] = useState({ kind: "semantica", content: "", sensitive: false });
  const [detalle, setDetalle] = useState<any>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [textoEdit, setTextoEdit] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; kind: "info" | "error" | "ok" } | null>(null);

  const notify = (msg: string, kind: "info" | "error" | "ok" = "info") => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 4000);
  };

  const memorias: Memoria[] = (data?.memorias ?? []).filter(
    (m: Memoria) =>
      (kind === "todas" || m.kind === kind) &&
      (!q.trim() || m.content.toLowerCase().includes(q.toLowerCase())),
  );

  const guardar = async () => {
    if (!nuevo.content.trim()) return;
    setBusy(true);
    try {
      await api("/api/memory", { method: "POST", body: JSON.stringify(nuevo) });
      setNuevo({ kind: "semantica", content: "", sensitive: false });
      notify("Recuerdo guardado", "ok");
      await reload();
    } catch (err: any) {
      notify(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const olvidar = async (m: Memoria) => {
    if (!confirm(`¿Olvidar este recuerdo?\n\n"${m.content.slice(0, 120)}"`)) return;
    try {
      await api(`/api/memory?id=${m.id}`, { method: "DELETE" });
      notify("Recuerdo eliminado", "ok");
      await reload();
    } catch (err: any) {
      notify(err.message, "error");
    }
  };

  const corregir = async (m: Memoria) => {
    if (!textoEdit.trim()) return;
    try {
      await api("/api/memory", { method: "PATCH", body: JSON.stringify({ id: m.id, content: textoEdit }) });
      setEditando(null);
      notify("Recuerdo corregido", "ok");
      await reload();
    } catch (err: any) {
      notify(err.message, "error");
    }
  };

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-7">
      <PageHeader
        title="Lo que sé de ti"
        subtitle="Memorias diferenciadas con origen, confianza y fecha. Puedes corregirlas u olvidarlas."
        actions={
          <button
            className="btn-ghost text-xs"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await api<any>("/api/memory", { method: "POST", body: JSON.stringify({ accion: "consolidar" }) });
                notify(`${r.duplicados} duplicados · ${r.olvidadas} olvidadas`, "ok");
                await reload();
              } catch (err: any) {
                notify(err.message, "error");
              } finally {
                setBusy(false);
              }
            }}
          >
            Consolidar
          </button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-6">
        {(data?.tipos ?? []).map((t: string) => {
          const total = (data?.memorias ?? []).filter((m: Memoria) => m.kind === t).length;
          return (
            <button
              key={t}
              onClick={() => setKind(kind === t ? "todas" : t)}
              className={`card px-3 py-2 text-left transition ${kind === t ? "border-neon-500/40" : "hover:border-white/12"}`}
            >
              <div className="text-[10px] uppercase tracking-wider text-mist-400">{t}</div>
              <div className="text-lg font-semibold text-white">{total}</div>
            </button>
          );
        })}
      </div>

      <section className="card mb-4 p-4">
        <h2 className="h2 mb-2">Añadir un recuerdo</h2>
        <div className="flex flex-wrap gap-2">
          <select className="input w-40" value={nuevo.kind} onChange={(e) => setNuevo({ ...nuevo, kind: e.target.value })}>
            {(data?.tipos ?? []).map((t: string) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input
            className="input flex-1 min-w-[240px]"
            placeholder="Ej.: prefiere resúmenes de tres puntos y tono directo"
            value={nuevo.content}
            onChange={(e) => setNuevo({ ...nuevo, content: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && void guardar()}
          />
          <label className="flex items-center gap-2 rounded-xl border border-white/8 px-3 text-[11px] text-mist-300">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-[#35e0c4]"
              checked={nuevo.sensitive}
              onChange={(e) => setNuevo({ ...nuevo, sensitive: e.target.checked })}
            />
            sensible
          </label>
          <button className="btn-primary" onClick={() => void guardar()} disabled={busy || !nuevo.content.trim()}>
            Guardar
          </button>
        </div>
      </section>

      <div className="mb-3 flex flex-wrap gap-2">
        <input className="input w-64" placeholder="Buscar en recuerdos…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input w-40" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="todas">todas</option>
          {(data?.tipos ?? []).map((t: string) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <span className="self-center text-[11px] text-mist-400">{memorias.length} recuerdos</span>
      </div>

      {loading && !data && (
        <div className="flex items-center gap-2 text-mist-400">
          <Spinner /> Cargando memoria…
        </div>
      )}

      <div className="space-y-2">
        {memorias.map((m) => (
          <div key={m.id} className="card p-3.5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-2 py-0.5 text-[10px] ${KIND_COLORS[m.kind] ?? "text-mist-300 border-white/10"}`}>
                  {m.kind}
                </span>
                <span className="text-[10px] text-mist-400">
                  {m.source} · {Math.round(m.confidence * 100)}% · {formatDate(m.updated_at)}
                  {m.sensitive ? " · cifrado" : ""}
                </span>
              </div>
              <div className="flex gap-1.5">
                <button
                  className="text-[10px] text-mist-400 hover:text-white"
                  onClick={async () => setDetalle(await api(`/api/memory/${m.id}`))}
                >
                  ¿Por qué?
                </button>
                <button
                  className="text-[10px] text-mist-400 hover:text-white"
                  onClick={() => {
                    setEditando(m.id);
                    setTextoEdit(m.content);
                  }}
                >
                  Corregir
                </button>
                <button className="text-[10px] text-red-300/80 hover:text-red-200" onClick={() => void olvidar(m)}>
                  Olvidar
                </button>
              </div>
            </div>
            {editando === m.id ? (
              <div className="mt-2 flex gap-2">
                <input className="input flex-1" value={textoEdit} onChange={(e) => setTextoEdit(e.target.value)} />
                <button className="btn-primary text-xs" onClick={() => void corregir(m)}>
                  Guardar
                </button>
                <button className="btn-ghost text-xs" onClick={() => setEditando(null)}>
                  Cancelar
                </button>
              </div>
            ) : (
              <p className="mt-2 text-sm leading-relaxed text-mist-200">{m.content}</p>
            )}
          </div>
        ))}
        {memorias.length === 0 && !loading && (
          <div className="card px-4 py-10 text-center text-sm text-mist-400">
            Todavía no sé nada de ti. Habla con JARVIS, importa correos o añade un recuerdo.
          </div>
        )}
      </div>

      {detalle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setDetalle(null)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="card relative w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-white">Origen del recuerdo</h3>
            <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-ink-950/60 p-3 font-mono text-[10px] text-mist-300">
              {JSON.stringify(detalle, null, 2)}
            </pre>
            <button className="btn-ghost mt-3 text-xs" onClick={() => setDetalle(null)}>
              Cerrar
            </button>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.msg} kind={toast.kind} onDone={() => setToast(null)} />}
    </div>
  );
}
