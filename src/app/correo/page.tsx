"use client";

import { useState } from "react";
import { api, formatDate, useApi } from "@/lib/client";
import { PageHeader, Spinner, Toast } from "@/components/ui";

const COLORS: Record<string, string> = {
  importante: "text-red-300 border-red-500/25",
  personal: "text-sky-300 border-sky-500/25",
  profesional: "text-violet-300 border-violet-500/25",
  proyecto: "text-neon-400 border-neon-500/25",
  solicitud: "text-amber-300 border-amber-500/25",
  compromiso: "text-emerald-300 border-emerald-500/25",
  promocion: "text-mist-300 border-white/10",
  spam: "text-orange-300 border-orange-500/25",
  fraude: "text-red-400 border-red-500/30",
  requiere_respuesta: "text-pink-300 border-pink-500/25",
};

export default function CorreoPage() {
  const { data, reload, loading } = useApi<any>("/api/correo", 0);
  const [clasificacion, setClasificacion] = useState("todas");
  const [q, setQ] = useState("");
  const [folder, setFolder] = useState("inbox");
  const [files, setFiles] = useState<FileList | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<any>(null);
  const [instruccion, setInstruccion] = useState("");
  const [borrador, setBorrador] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; kind: "info" | "error" | "ok" } | null>(null);

  const notify = (msg: string, kind: "info" | "error" | "ok" = "info") => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 4500);
  };

  const toggle = async (habilitar: boolean) => {
    try {
      await api("/api/correo", { method: "POST", body: JSON.stringify({ habilitar }) });
      await reload();
    } catch (err: any) {
      notify(err.message, "error");
    }
  };

  const importar = async () => {
    if (!files || files.length === 0) return;
    setBusy("importar");
    try {
      const form = new FormData();
      Array.from(files).forEach((f) => form.append("files", f));
      form.append("folder", folder);
      const r = await api<any>("/api/correo", { method: "POST", body: form });
      notify(`${r.results.filter((x: any) => !x.error).length} correos importados`, "ok");
      setFiles(null);
      await reload();
    } catch (err: any) {
      notify(err.message, "error");
    } finally {
      setBusy(null);
    }
  };

  const clasificar = async () => {
    setBusy("clasificar");
    try {
      const r = await api<any>("/api/correo", { method: "POST", body: JSON.stringify({ accion: "clasificar", limite: 10 }) });
      notify(`${r.resultados.length} correos clasificados`, "ok");
      await reload();
    } catch (err: any) {
      notify(err.message, "error");
    } finally {
      setBusy(null);
    }
  };

  const aprender = async () => {
    setBusy("estilo");
    try {
      const r = await api<any>("/api/correo", { method: "POST", body: JSON.stringify({ accion: "estilo" }) });
      notify(`Estilo aprendido con ${r.muestras} correos`, "ok");
      await reload();
    } catch (err: any) {
      notify(err.message, "error");
    } finally {
      setBusy(null);
    }
  };

  const abrir = async (id: string) => {
    try {
      setDetalle(await api(`/api/correo?id=${id}`));
      setBorrador(null);
    } catch (err: any) {
      notify(err.message, "error");
    }
  };

  const redactar = async () => {
    if (!detalle) return;
    setBusy("borrador");
    try {
      const r = await api<any>("/api/correo", {
        method: "POST",
        body: JSON.stringify({ accion: "borrador", id: detalle.email.id, instruccion }),
      });
      setBorrador(r.borrador);
    } catch (err: any) {
      notify(err.message, "error");
    } finally {
      setBusy(null);
    }
  };

  const habilitado = Boolean(data?.habilitado);
  const correos = (data?.correos ?? []).filter((c: any) => {
    if (clasificacion !== "todas" && c.classification !== clasificacion) return false;
    if (q.trim()) {
      const n = q.toLowerCase();
      return String(c.subject).toLowerCase().includes(n) || String(c.from_addr).toLowerCase().includes(n);
    }
    return true;
  });

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-7">
      <PageHeader
        title="Correo"
        subtitle="Clasificación, compromisos y borradores con tu estilo. Nada se envía sin tu confirmación."
      />

      <section className={`card mb-4 p-4 ${habilitado ? "" : "border-amber-500/25"}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-mist-100">Módulo de correo {habilitado ? "activo" : "desactivado"}</div>
            <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-mist-400">
              De momento se importan archivos <span className="font-mono">.eml</span> exportados desde tu cliente. Gmail
              directo requiere OAuth y no está conectado. JARVIS nunca envía, borra ni archiva: solo lee, clasifica y
              propone borradores.
            </p>
          </div>
          <button className={habilitado ? "btn-ghost text-xs" : "btn-primary text-xs"} onClick={() => void toggle(!habilitado)}>
            {habilitado ? "Desactivar" : "Activar"}
          </button>
        </div>
      </section>

      {habilitado && (
        <section className="card mb-4 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="file"
              multiple
              accept=".eml"
              onChange={(e) => setFiles(e.target.files)}
              className="text-xs text-mist-300"
            />
            <select className="input w-32 py-1.5 text-xs" value={folder} onChange={(e) => setFolder(e.target.value)}>
              <option value="inbox">recibidos</option>
              <option value="sent">enviados</option>
            </select>
            <button className="btn-primary text-xs" disabled={!files || busy === "importar"} onClick={() => void importar()}>
              {busy === "importar" ? <Spinner /> : "Importar"}
            </button>
            <button className="btn-ghost text-xs" disabled={busy === "clasificar"} onClick={() => void clasificar()}>
              {busy === "clasificar" ? <Spinner /> : "Clasificar pendientes"}
            </button>
            <button className="btn-ghost text-xs" disabled={busy === "estilo"} onClick={() => void aprender()}>
              {busy === "estilo" ? <Spinner /> : "Aprender mi estilo"}
            </button>
          </div>
          {data?.estilo && (
            <div className="mt-3 rounded-xl border border-white/6 bg-white/[0.02] p-3 text-[11px] text-mist-400">
              <div className="mb-1 font-medium text-mist-200">Estilo aprendido ({data.estilo.muestras} correos)</div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(data.estilo.profile).map(([k, v]) => (
                  <span key={k} className="chip">
                    {k}: {Array.isArray(v) ? v.join(", ") : String(v).slice(0, 40)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input className="input w-56" placeholder="Buscar asunto o remitente…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input w-44" value={clasificacion} onChange={(e) => setClasificacion(e.target.value)}>
          <option value="todas">todas</option>
          {Object.keys(COLORS).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <span className="text-[11px] text-mist-400">
          {data?.total ?? 0} correos · {data?.pendientes_respuesta ?? 0} pendientes de respuesta
        </span>
      </div>

      {loading && !data ? (
        <div className="flex items-center gap-2 text-mist-400">
          <Spinner /> Cargando…
        </div>
      ) : (
        <div className="space-y-1.5">
          {correos.map((c: any) => (
            <button key={c.id} className="card card-hover flex w-full items-center gap-3 p-3 text-left" onClick={() => void abrir(c.id)}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm text-mist-100">{c.subject}</span>
                  {c.classification && (
                    <span className={`rounded-full border px-1.5 py-0.5 text-[9px] ${COLORS[c.classification] ?? "text-mist-300 border-white/10"}`}>
                      {c.classification}
                    </span>
                  )}
                  {c.needs_reply ? <span className="chip text-[9px] text-pink-300">responder</span> : null}
                </div>
                <div className="mt-0.5 truncate text-[10px] text-mist-400">
                  {c.from_addr} · {formatDate(c.sent_at)} · {c.folder}
                </div>
              </div>
              <span className="text-[10px] text-mist-400">{c.confidence ? `${Math.round(c.confidence * 100)}%` : ""}</span>
            </button>
          ))}
          {correos.length === 0 && (
            <div className="card px-4 py-10 text-center text-sm text-mist-400">
              No hay correos. Activa el módulo e importa archivos .eml (o exporta desde Gmail).
            </div>
          )}
        </div>
      )}

      {detalle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDetalle(null)} />
          <div className="card relative max-h-[88vh] w-full max-w-2xl overflow-auto p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-white">{detalle.email.subject}</h3>
                <div className="text-[11px] text-mist-400">
                  {detalle.email.from_addr} → {detalle.email.to_addr} · {formatDate(detalle.email.sent_at)}
                </div>
              </div>
              <button className="text-xs text-mist-400 hover:text-white" onClick={() => setDetalle(null)}>
                cerrar
              </button>
            </div>

            {detalle.email.entities && (
              <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                {(() => {
                  try {
                    const e = JSON.parse(detalle.email.entities);
                    return (
                      <>
                        {e.resumen && <span className="chip">{e.resumen}</span>}
                        {(e.entidades ?? []).map((x: string) => (
                          <span key={x} className="chip">
                            {x}
                          </span>
                        ))}
                        {(e.compromisos ?? []).map((x: string) => (
                          <span key={x} className="chip text-emerald-300">
                            {x}
                          </span>
                        ))}
                      </>
                    );
                  } catch {
                    return null;
                  }
                })()}
              </div>
            )}

            <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-ink-950/60 p-3 text-[11px] leading-relaxed text-mist-300">
              {detalle.email.body}
            </pre>

            <div className="mt-3">
              <label className="label">Instrucción para el borrador (opcional)</label>
              <div className="flex gap-2">
                <input
                  className="input flex-1"
                  placeholder="Ej.: confirma la reunión del jueves y pide el informe"
                  value={instruccion}
                  onChange={(e) => setInstruccion(e.target.value)}
                />
                <button className="btn-primary text-xs" disabled={busy === "borrador"} onClick={() => void redactar()}>
                  {busy === "borrador" ? <Spinner /> : "Redactar"}
                </button>
              </div>
            </div>

            {borrador && (
              <div className="mt-3">
                <div className="mb-1 flex items-center justify-between">
                  <span className="label mb-0">Borrador (no enviado)</span>
                  <button className="text-[10px] text-neon-400" onClick={() => void navigator.clipboard.writeText(borrador)}>
                    copiar
                  </button>
                </div>
                <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-lg border border-neon-500/20 bg-neon-500/5 p-3 text-[11px] leading-relaxed text-mist-200">
                  {borrador}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {toast && <Toast message={toast.msg} kind={toast.kind} onDone={() => setToast(null)} />}
    </div>
  );
}
