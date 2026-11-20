"use client";

import { useState } from "react";
import { api, formatDate, useApi } from "@/lib/client";
import { PageHeader, Spinner, StatusPill, Toast } from "@/components/ui";

interface Connector {
  id: string;
  kind: string;
  name: string;
  config: string;
  status: string;
  last_sync: string | null;
  error: string | null;
}

const FUTURE = [
  {
    kind: "google_drive",
    name: "Google Drive",
    detail: "Sincronización incremental de carpetas y documentos. Requiere OAuth de tu cuenta de Google.",
    scopes: "drive.readonly",
  },
  {
    kind: "gmail",
    name: "Gmail",
    detail: "Importación de mensajes seleccionados con etiquetas. Solo lectura, nunca envía correos.",
    scopes: "gmail.readonly",
  },
  {
    kind: "calendar",
    name: "Google Calendar",
    detail: "Eventos y reuniones como nodos de tipo evento. Solo lectura.",
    scopes: "calendar.readonly",
  },
  {
    kind: "notion",
    name: "Notion",
    detail: "Páginas y bases de datos mediante token de integración interno.",
    scopes: "read_content",
  },
];

export default function ConexionesPage() {
  const { data, reload } = useApi<{ connectors: Connector[] }>("/api/connectors", 0);
  const [folder, setFolder] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; kind: "info" | "error" | "ok" } | null>(null);

  const notify = (msg: string, kind: "info" | "error" | "ok" = "info") => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 4200);
  };

  const add = async () => {
    if (!folder.trim()) return;
    setBusy("add");
    try {
      await api("/api/connectors", { method: "POST", body: JSON.stringify({ path: folder.trim() }) });
      notify("Carpeta conectada", "ok");
      setFolder("");
      await reload();
    } catch (err: any) {
      notify(err.message, "error");
    } finally {
      setBusy(null);
    }
  };

  const sync = async (id: string) => {
    setBusy(id);
    try {
      const result = await api<{ added: number; duplicates: number; skipped: number; errors: string[] }>(
        `/api/connectors/${id}/sync`,
        { method: "POST" },
      );
      notify(`${result.added} nuevos · ${result.duplicates} duplicados · ${result.skipped} omitidos`, "ok");
      await reload();
    } catch (err: any) {
      notify(err.message, "error");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: string, name: string) => {
    if (!confirm(`¿Desconectar "${name}"? Los documentos ya importados se conservan.`)) return;
    try {
      await api(`/api/connectors?id=${id}`, { method: "DELETE" });
      notify("Conector desconectado", "ok");
      await reload();
    } catch (err: any) {
      notify(err.message, "error");
    }
  };

  const connectors = data?.connectors ?? [];

  return (
    <div className="mx-auto max-w-[1100px] px-7 py-7">
      <PageHeader
        title="Conexiones"
        subtitle="Fuentes de conocimiento externas. Nada se conecta ni se envía sin tu autorización explícita."
      />

      <section className="card mb-5 p-5">
        <h2 className="h2 mb-1">Carpetas locales</h2>
        <p className="mb-4 text-xs text-mist-400">
          Indexa una carpeta de tu Mac (por ejemplo Documentos o Descargas). Solo se leen archivos compatibles; nunca se
          modifican ni se borran.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            className="input flex-1 min-w-[260px] font-mono text-xs"
            placeholder="/Users/usuario/Documentos/Proyectos"
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
          />
          <button className="btn-primary" onClick={() => void add()} disabled={busy === "add" || !folder.trim()}>
            {busy === "add" ? <Spinner /> : "Conectar carpeta"}
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {connectors.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/6 bg-white/[0.02] px-3.5 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-mist-100">{c.name}</span>
                  <StatusPill status={c.status} />
                </div>
                <div className="mt-0.5 truncate font-mono text-[10px] text-mist-400">{JSON.parse(c.config || "{}").path}</div>
                <div className="text-[10px] text-mist-400">
                  Última sincronización: {c.last_sync ? formatDate(c.last_sync) : "nunca"}
                  {c.error ? ` · ${c.error}` : ""}
                </div>
              </div>
              <button className="btn-ghost text-xs" onClick={() => void sync(c.id)} disabled={busy === c.id}>
                {busy === c.id ? <Spinner /> : "Sincronizar"}
              </button>
              <button className="btn-ghost text-xs" onClick={() => void remove(c.id, c.name)}>
                Desconectar
              </button>
            </div>
          ))}
          {connectors.length === 0 && (
            <div className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-xs text-mist-400">
              No hay carpetas conectadas.
            </div>
          )}
        </div>
      </section>

      <section>
        <h2 className="h2 mb-3">Servicios en la nube</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {FUTURE.map((f) => (
            <div key={f.kind} className="card p-4 opacity-80">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-mist-100">{f.name}</div>
                <span className="chip">No configurado</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-mist-400">{f.detail}</p>
              <div className="mt-3 flex items-center gap-2">
                <button className="btn-ghost cursor-not-allowed text-xs" disabled>
                  Conectar con OAuth
                </button>
                <span className="font-mono text-[10px] text-mist-400">scope: {f.scopes}</span>
              </div>
              <p className="mt-2 text-[10px] text-amber-300/80">
                Pendiente de autorización OAuth. No se ha declarado como terminado.
              </p>
            </div>
          ))}
        </div>
      </section>

      {toast && <Toast message={toast.msg} kind={toast.kind} onDone={() => setToast(null)} />}
    </div>
  );
}
