"use client";

import Link from "next/link";
import { PageHeader, StatCard, StatusPill, Spinner } from "@/components/ui";
import { formatBytes, relativeDate, useApi } from "@/lib/client";

interface Stats {
  documentos: number;
  procesados: number;
  errores: number;
  fragmentos: number;
  nodos: number;
  relaciones: number;
  relaciones_pendientes: number;
  conversaciones: number;
  mensajes: number;
  trabajos_en_cola: number;
  tamano_db: number;
  tipos: Array<{ type: string; c: number }>;
  recientes: Array<{ id: string; name: string; ext: string; status: string; added_at: string; size: number }>;
  eventos: Array<{ id: number; level: string; kind: string; message: string; created_at: string }>;
  trabajos: Array<{ id: string; doc_name: string | null; status: string; progress: number; step: string }>;
  sistema: {
    clave_configurada: boolean;
    clave_origen: string;
    modelo_principal: string;
    modelo_vision: string;
    modelo_embeddings: string;
    peticiones_activas: number;
    memoria_rss_mb: number;
    heap_mb: number;
    directorio_datos: string;
  };
}

export default function DashboardPage() {
  const { data, error, loading } = useApi<Stats>("/api/stats", 5000);

  if (loading && !data) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-mist-400">
        <Spinner /> Cargando cerebro…
      </div>
    );
  }

  const s = data!;
  const activos = s.trabajos.filter((j) => j.status === "procesando" || j.status === "en_cola");

  return (
    <div className="mx-auto max-w-[1200px] px-7 py-7">
      <PageHeader
        title="Dashboard"
        subtitle="Estado general de tu cerebro visual: documentos, conocimiento, memoria y conexiones."
        actions={
          <>
            <Link href="/biblioteca" className="btn-primary">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" strokeLinecap="round" />
              </svg>
              Añadir documentos
            </Link>
            <Link href="/cerebro" className="btn-ghost">
              Ver cerebro
            </Link>
          </>
        }
      />

      {error && <div className="mb-4 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Documentos" value={s.documentos} hint={`${s.procesados} procesados · ${s.errores} con error`} />
        <StatCard label="Nodos" value={s.nodos} hint={`${s.tipos.length} tipos distintos`} accent="#5ff0d8" />
        <StatCard label="Relaciones" value={s.relaciones} hint={`${s.relaciones_pendientes} pendientes de validar`} accent="#a99dff" />
        <StatCard label="Fragmentos" value={s.fragmentos} hint={`Base de datos ${formatBytes(s.tamano_db)}`} />
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="h2">Documentos recientes</h2>
            <Link href="/biblioteca" className="text-xs text-neon-400 hover:underline">
              Ver biblioteca
            </Link>
          </div>
          {s.recientes.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-mist-400">
              Todavía no hay documentos. Arrastra un PDF, una imagen o un Word en la Biblioteca.
            </div>
          ) : (
            <ul className="divide-y divide-white/5">
              {s.recientes.map((doc) => (
                <li key={doc.id} className="flex items-center gap-3 py-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.05] font-mono text-[10px] uppercase text-mist-300">
                    {doc.ext}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-mist-200">{doc.name}</div>
                    <div className="text-[11px] text-mist-400">
                      {relativeDate(doc.added_at)} · {formatBytes(doc.size)}
                    </div>
                  </div>
                  <StatusPill status={doc.status} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-5">
          <h2 className="h2 mb-3">Estado del sistema</h2>
          <dl className="space-y-2.5 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-mist-400">Clave NVIDIA</dt>
              <dd className={s.sistema.clave_configurada ? "text-emerald-300" : "text-amber-300"}>
                {s.sistema.clave_configurada ? `OK (${s.sistema.clave_origen})` : "No configurada"}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-mist-400">Trabajos activos</dt>
              <dd className="text-mist-200">{activos.length}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-mist-400">Peticiones IA</dt>
              <dd className="text-mist-200">{s.sistema.peticiones_activas}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-mist-400">RAM del servidor</dt>
              <dd className="text-mist-200">{s.sistema.memoria_rss_mb} MB</dd>
            </div>
          </dl>
          <div className="mt-4 space-y-1.5 rounded-xl bg-ink-950/60 p-3 font-mono text-[10px] text-mist-400">
            <div className="truncate">principal · {s.sistema.modelo_principal}</div>
            <div className="truncate">visión · {s.sistema.modelo_vision}</div>
            <div className="truncate">embeddings · {s.sistema.modelo_embeddings}</div>
          </div>
          {!s.sistema.clave_configurada && (
            <Link href="/configuracion" className="btn-primary mt-4 w-full">
              Configurar API key
            </Link>
          )}
        </div>
      </section>

      {activos.length > 0 && (
        <section className="card mt-4 p-5">
          <h2 className="h2 mb-3">Procesándose ahora</h2>
          <div className="space-y-3">
            {activos.map((job) => (
              <div key={job.id}>
                <div className="mb-1 flex items-center justify-between text-xs text-mist-300">
                  <span className="truncate">{job.doc_name ?? "Documento"}</span>
                  <span className="text-mist-400">
                    {job.step} · {job.progress}%
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-neon-500 to-violet-500 transition-all"
                    style={{ width: `${job.progress}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="h2 mb-3">Actividad reciente</h2>
          {s.eventos.length === 0 ? (
            <div className="text-sm text-mist-400">Sin actividad registrada.</div>
          ) : (
            <ul className="space-y-2.5">
              {s.eventos.map((e) => (
                <li key={e.id} className="flex gap-3 text-sm">
                  <span
                    className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                      e.level === "error" ? "bg-red-400" : e.level === "warn" ? "bg-amber-400" : "bg-neon-500"
                    }`}
                  />
                  <div className="min-w-0">
                    <div className="truncate text-mist-200">{e.message}</div>
                    <div className="text-[11px] text-mist-400">
                      {e.kind} · {relativeDate(e.created_at)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-5">
          <h2 className="h2 mb-3">Composición del conocimiento</h2>
          {s.tipos.length === 0 ? (
            <div className="text-sm text-mist-400">Aún no hay nodos. Procesa documentos para construir el grafo.</div>
          ) : (
            <div className="space-y-2">
              {s.tipos.map((t) => {
                const max = Math.max(...s.tipos.map((x) => x.c));
                return (
                  <div key={t.type} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 text-xs capitalize text-mist-300">{t.type}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-neon-500/80 to-violet-500/80"
                        style={{ width: `${Math.max(6, (t.c / max) * 100)}%` }}
                      />
                    </div>
                    <span className="w-8 text-right text-xs text-mist-400">{t.c}</span>
                  </div>
                );
              })}
            </div>
          )}
          {s.relaciones_pendientes > 0 && (
            <Link href="/memoria" className="mt-4 flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
              <span className="node-dot bg-amber-400" />
              {s.relaciones_pendientes} relaciones ambiguas esperan tu validación
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
