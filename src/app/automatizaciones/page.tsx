"use client";

import { useState } from "react";
import { api, formatDate, useApi } from "@/lib/client";
import { PageHeader, Spinner, Toast } from "@/components/ui";

interface Automation {
  id: string;
  name: string;
  prompt: string;
  schedule: string;
  descripcion_horario: string;
  next_run: string | null;
  enabled: number;
  last_run: string | null;
  last_result: string | null;
  created_at: string;
}

export default function AutomatizacionesPage() {
  const { data, reload, loading } = useApi<{ automations: Automation[] }>("/api/automations", 30000);
  const [instruccion, setInstruccion] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; kind: "info" | "error" | "ok" } | null>(null);
  const [expandido, setExpandido] = useState<string | null>(null);

  const notify = (msg: string, kind: "info" | "error" | "ok" = "info") => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 4200);
  };

  const crear = async () => {
    if (!instruccion.trim()) return;
    setBusy("crear");
    try {
      await api("/api/automations", { method: "POST", body: JSON.stringify({ instruccion: instruccion.trim() }) });
      setInstruccion("");
      notify("Automatización creada", "ok");
      await reload();
    } catch (err: any) {
      notify(err.message, "error");
    } finally {
      setBusy(null);
    }
  };

  const alternar = async (a: Automation) => {
    setBusy(a.id);
    try {
      await api(`/api/automations/${a.id}`, { method: "PATCH", body: JSON.stringify({ enabled: !a.enabled }) });
      await reload();
    } catch (err: any) {
      notify(err.message, "error");
    } finally {
      setBusy(null);
    }
  };

  const ejecutar = async (a: Automation) => {
    setBusy(a.id);
    try {
      const res = await api<{ ok: boolean; resumen: string }>(`/api/automations/${a.id}`, { method: "POST" });
      notify(res.resumen.slice(0, 160), res.ok ? "ok" : "error");
      await reload();
    } catch (err: any) {
      notify(err.message, "error");
    } finally {
      setBusy(null);
    }
  };

  const eliminar = async (a: Automation) => {
    if (!confirm(`¿Eliminar la automatización "${a.name}"?`)) return;
    try {
      await api(`/api/automations/${a.id}`, { method: "DELETE" });
      notify("Eliminada", "ok");
      await reload();
    } catch (err: any) {
      notify(err.message, "error");
    }
  };

  return (
    <div className="mx-auto max-w-[1000px] px-4 py-6 sm:px-7">
      <PageHeader
        title="Automatizaciones"
        subtitle="Tareas programadas que JARVIS ejecuta y te notifica. Se crean hablando o escribiendo en lenguaje natural."
      />

      <section className="card mb-5 p-5">
        <h2 className="h2 mb-2">Crear con lenguaje natural</h2>
        <div className="flex flex-wrap gap-2">
          <input
            className="input flex-1 min-w-[260px]"
            placeholder="Ej.: cada mañana a las 8 resúmeme la agenda del día y avísame"
            value={instruccion}
            onChange={(e) => setInstruccion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void crear()}
          />
          <button className="btn-primary" onClick={() => void crear()} disabled={busy === "crear" || !instruccion.trim()}>
            {busy === "crear" ? <Spinner /> : "Crear"}
          </button>
        </div>
        <p className="mt-2 text-[11px] text-mist-400">
          El asistente traduce la petición a una programación (cada N minutos, diaria o semanal) y te muestra la próxima
          ejecución. Puedes desactivarla en cualquier momento.
        </p>
      </section>

      <div className="space-y-2">
        {loading && !data && <div className="flex items-center gap-2 text-mist-400"><Spinner /> Cargando…</div>}
        {(data?.automations ?? []).map((a) => (
          <div key={a.id} className="card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`node-dot ${a.enabled ? "bg-emerald-400" : "bg-mist-400"}`} />
                  <span className="text-sm text-mist-100">{a.name}</span>
                  <span className="chip">{a.descripcion_horario}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-[11px] text-mist-400">{a.prompt}</p>
                <div className="mt-1 text-[10px] text-mist-400">
                  Próxima: {a.next_run ? formatDate(a.next_run) : "—"} · Última: {a.last_run ? formatDate(a.last_run) : "nunca"}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button className="btn-ghost text-xs" onClick={() => void alternar(a)} disabled={busy === a.id}>
                  {a.enabled ? "Desactivar" : "Activar"}
                </button>
                <button className="btn-ghost text-xs" onClick={() => void ejecutar(a)} disabled={busy === a.id}>
                  {busy === a.id ? <Spinner /> : "Ejecutar ahora"}
                </button>
                <button className="btn-danger text-xs" onClick={() => void eliminar(a)}>
                  Eliminar
                </button>
              </div>
            </div>
            {a.last_result && (
              <div className="mt-2">
                <button
                  className="text-[10px] text-mist-400 hover:text-white"
                  onClick={() => setExpandido(expandido === a.id ? null : a.id)}
                >
                  {expandido === a.id ? "Ocultar resultado" : "Ver último resultado"}
                </button>
                {expandido === a.id && (
                  <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-ink-950/60 p-2 text-[10px] text-mist-300">
                    {a.last_result}
                  </pre>
                )}
              </div>
            )}
          </div>
        ))}
        {(data?.automations ?? []).length === 0 && !loading && (
          <div className="card px-4 py-10 text-center text-sm text-mist-400">
            No hay automatizaciones. Prueba con “todos los lunes a las 9 prepárame un resumen de la semana”.
          </div>
        )}
      </div>

      {toast && <Toast message={toast.msg} kind={toast.kind} onDone={() => setToast(null)} />}
    </div>
  );
}
