"use client";

import { useMemo, useState } from "react";
import { api, formatBytes, formatDate, useApi } from "@/lib/client";
import { Drawer, PageHeader, Spinner, Toast } from "@/components/ui";

interface ToolInfo {
  nombre: string;
  descripcion: string;
  parametros: Record<string, { tipo: string; descripcion: string; obligatorio?: boolean }>;
  permisos: string[];
  riesgo: "bajo" | "medio" | "alto";
  requiere_confirmacion: boolean;
  estado: { conectada: boolean; detalle: string };
}

const RIESGO: Record<string, string> = {
  bajo: "border-emerald-500/25 text-emerald-300",
  medio: "border-amber-500/25 text-amber-300",
  alto: "border-red-500/25 text-red-300",
};

export default function HerramientasPage() {
  const { data, reload, loading } = useApi<{
    tools: ToolInfo[];
    runs: Array<{ id: string; tool: string; status: string; origin: string; duration_ms: number; created_at: string; error: string | null }>;
    artifacts: Array<{ id: string; name: string; mime: string; size: number; tool: string; created_at: string }>;
  }>("/api/tools", 0);

  const [selected, setSelected] = useState<ToolInfo | null>(null);
  const [args, setArgs] = useState("{}");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [toast, setToast] = useState<{ msg: string; kind: "info" | "error" | "ok" } | null>(null);
  const [filtro, setFiltro] = useState("");

  const notify = (msg: string, kind: "info" | "error" | "ok" = "info") => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 4000);
  };

  const tools = useMemo(() => {
    const list = data?.tools ?? [];
    if (!filtro.trim()) return list;
    const q = filtro.toLowerCase();
    return list.filter((t) => t.nombre.includes(q) || t.descripcion.toLowerCase().includes(q));
  }, [data, filtro]);

  const abrir = (tool: ToolInfo) => {
    setSelected(tool);
    setResult(null);
    const example: Record<string, unknown> = {};
    for (const [key, p] of Object.entries(tool.parametros)) {
      if (p.tipo === "numero") example[key] = 1;
      else if (p.tipo === "booleano") example[key] = true;
      else if (p.tipo === "lista") example[key] = [];
      else if (p.tipo === "objeto") example[key] = {};
      else example[key] = "";
    }
    setArgs(JSON.stringify(example, null, 2));
  };

  const ejecutar = async (confirmado: boolean) => {
    if (!selected) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(args || "{}");
    } catch {
      notify("Los argumentos no son JSON válido", "error");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const res = await api<any>("/api/tools", {
        method: "POST",
        body: JSON.stringify({ nombre: selected.nombre, argumentos: parsed, confirmado }),
      });
      setResult(res);
      notify(res.ok ? "Ejecutada" : res.requiere_confirmacion ? "Necesita confirmación" : "Falló", res.ok ? "ok" : "error");
      await reload();
    } catch (err: any) {
      notify(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-7">
      <PageHeader
        title="Herramientas"
        subtitle="Acciones verificables que JARVIS puede ejecutar, con permisos, riesgo y registro."
        actions={<input className="input w-56" placeholder="Filtrar…" value={filtro} onChange={(e) => setFiltro(e.target.value)} />}
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {loading && !data && <div className="flex items-center gap-2 text-mist-400"><Spinner /> Cargando…</div>}
        {tools.map((tool) => (
          <button key={tool.nombre} onClick={() => abrir(tool)} className="card card-hover p-4 text-left">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs text-neon-400">{tool.nombre}</span>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] ${RIESGO[tool.riesgo]}`}>{tool.riesgo}</span>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-mist-400">{tool.descripcion}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
              <span className={`node-dot ${tool.estado.conectada ? "bg-emerald-400" : "bg-amber-400"}`} />
              <span className="text-mist-400">{tool.estado.detalle}</span>
              {tool.requiere_confirmacion && <span className="chip">confirmación</span>}
            </div>
          </button>
        ))}
      </div>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="h2 mb-3">Archivos generados</h2>
          {(data?.artifacts ?? []).length === 0 ? (
            <p className="text-xs text-mist-400">Aún no se ha generado ningún archivo. Pide una presentación o un Excel a JARVIS.</p>
          ) : (
            <ul className="space-y-2">
              {data!.artifacts.map((a) => (
                <li key={a.id} className="flex items-center gap-2 rounded-lg border border-white/6 px-3 py-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-white/5 font-mono text-[9px] uppercase text-mist-300">
                    {a.name.split(".").pop()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <a href={`/api/files/${a.id}`} target="_blank" rel="noreferrer" className="block truncate text-xs text-mist-200 hover:text-white">
                      {a.name}
                    </a>
                    <div className="text-[10px] text-mist-400">
                      {formatBytes(a.size)} · {a.tool} · {formatDate(a.created_at)}
                    </div>
                  </div>
                  <a href={`/api/files/${a.id}?download=1`} className="text-[10px] text-mist-400 hover:text-white">
                    Descargar
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-5">
          <h2 className="h2 mb-3">Últimas ejecuciones</h2>
          {(data?.runs ?? []).length === 0 ? (
            <p className="text-xs text-mist-400">Sin ejecuciones registradas.</p>
          ) : (
            <ul className="space-y-1.5">
              {data!.runs.map((r) => (
                <li key={r.id} className="flex items-center gap-2 text-[11px]">
                  <span className={`node-dot ${r.status === "ok" ? "bg-emerald-400" : "bg-red-400"}`} />
                  <span className="font-mono text-mist-300">{r.tool}</span>
                  <span className="text-mist-400">{r.origin}</span>
                  <span className="ml-auto text-mist-400">{r.duration_ms} ms · {formatDate(r.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <Drawer open={Boolean(selected)} onClose={() => setSelected(null)} title={selected?.nombre ?? ""}>
        {selected && (
          <div className="space-y-4">
            <p className="text-sm text-mist-300">{selected.descripcion}</p>
            <div className="flex flex-wrap gap-1.5">
              {selected.permisos.map((p) => (
                <span key={p} className="chip font-mono">{p}</span>
              ))}
              <span className={`chip ${RIESGO[selected.riesgo]}`}>riesgo {selected.riesgo}</span>
              {selected.requiere_confirmacion && <span className="chip text-amber-300">requiere confirmación</span>}
            </div>

            <div>
              <h3 className="h2 mb-2">Parámetros</h3>
              <ul className="space-y-1 text-[11px]">
                {Object.entries(selected.parametros).map(([key, p]) => (
                  <li key={key} className="flex gap-2">
                    <span className="font-mono text-mist-200">{key}</span>
                    <span className="text-mist-400">{p.tipo}{p.obligatorio ? " · obligatorio" : ""} — {p.descripcion}</span>
                  </li>
                ))}
                {Object.keys(selected.parametros).length === 0 && <li className="text-mist-400">Sin parámetros.</li>}
              </ul>
            </div>

            <div>
              <label className="label">Argumentos (JSON)</label>
              <textarea className="input min-h-40 font-mono text-xs" value={args} onChange={(e) => setArgs(e.target.value)} />
            </div>

            <div className="flex flex-wrap gap-2">
              <button className="btn-primary" disabled={busy} onClick={() => void ejecutar(!selected.requiere_confirmacion)}>
                {busy ? <Spinner /> : selected.requiere_confirmacion ? "Solicitar" : "Ejecutar"}
              </button>
              {result?.requiere_confirmacion && (
                <button className="btn-danger" disabled={busy} onClick={() => void ejecutar(true)}>
                  Confirmar y ejecutar
                </button>
              )}
            </div>

            {result && (
              <div className="rounded-xl border border-white/6 bg-ink-950/50 p-3">
                <div className={`text-xs ${result.ok ? "text-emerald-300" : "text-amber-300"}`}>{result.resumen}</div>
                {result.error && <div className="mt-1 text-[11px] text-red-300">{result.error}</div>}
                {result.artefactos?.map((a: any) => (
                  <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[11px] text-neon-400 hover:underline">
                    Abrir {a.name}
                  </a>
                ))}
                {result.datos && (
                  <pre className="mt-2 max-h-48 overflow-auto rounded bg-black/40 p-2 font-mono text-[10px] text-mist-400">
                    {JSON.stringify(result.datos, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}
      </Drawer>

      {toast && <Toast message={toast.msg} kind={toast.kind} onDone={() => setToast(null)} />}
    </div>
  );
}
