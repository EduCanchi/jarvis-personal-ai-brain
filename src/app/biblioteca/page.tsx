"use client";

import { useCallback, useRef, useState } from "react";
import { api, formatBytes, formatDate, relativeDate, statusClass, useApi } from "@/lib/client";
import { Drawer, EmptyState, PageHeader, Spinner, StatusPill, Toast } from "@/components/ui";

interface Doc {
  id: string;
  name: string;
  ext: string;
  mime: string;
  size: number;
  status: string;
  error: string | null;
  pages: number | null;
  chars: number | null;
  added_at: string;
  processed_at: string | null;
  origin: string;
  excluded_remote: number;
  chunks: number;
  edges: number;
}

export default function BibliotecaPage() {
  const { data, reload, loading } = useApi<{ documents: Doc[] }>("/api/documents", 5000);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [toast, setToast] = useState<{ msg: string; kind: "info" | "error" | "ok" } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const notify = (msg: string, kind: "info" | "error" | "ok" = "info") => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 4200);
  };

  const upload = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) return;
      setUploading(true);
      const form = new FormData();
      list.forEach((f) => form.append("files", f));
      try {
        const result = await api<{ results: Array<{ name: string; duplicate?: boolean; error?: string }> }>("/api/documents", {
          method: "POST",
          body: form,
        });
        const okCount = result.results.filter((r) => !r.error && !r.duplicate).length;
        const dups = result.results.filter((r) => r.duplicate).length;
        const errors = result.results.filter((r) => r.error);
        notify(
          `${okCount} archivo(s) en cola${dups ? ` · ${dups} duplicado(s)` : ""}${errors.length ? ` · ${errors.length} error(es)` : ""}`,
          errors.length ? "error" : "ok",
        );
        await reload();
      } catch (err: any) {
        notify(err.message, "error");
      } finally {
        setUploading(false);
      }
    },
    [reload],
  );

  const openDetail = async (id: string) => {
    setSelected(id);
    setDetail(null);
    try {
      setDetail(await api(`/api/documents/${id}`));
    } catch (err: any) {
      notify(err.message, "error");
    }
  };

  const reprocess = async (id: string) => {
    try {
      await api(`/api/documents/${id}`, { method: "POST" });
      notify("Documento enviado a reprocesar", "ok");
      await reload();
      if (selected === id) await openDetail(id);
    } catch (err: any) {
      notify(err.message, "error");
    }
  };

  const remove = async (id: string, name: string) => {
    if (!confirm(`¿Eliminar "${name}" y todo su conocimiento asociado? El archivo original se borrará del almacén local.`)) return;
    try {
      await api(`/api/documents/${id}`, { method: "DELETE" });
      notify("Documento eliminado", "ok");
      setSelected(null);
      setDetail(null);
      await reload();
    } catch (err: any) {
      notify(err.message, "error");
    }
  };

  const toggleRemote = async (id: string, excluded: boolean) => {
    try {
      await api(`/api/documents/${id}`, { method: "PATCH", body: JSON.stringify({ excluded_remote: excluded }) });
      notify(excluded ? "Excluido del procesamiento remoto" : "Incluido en procesamiento remoto", "ok");
      await reload();
      await openDetail(id);
    } catch (err: any) {
      notify(err.message, "error");
    }
  };

  const docs = data?.documents ?? [];

  return (
    <div className="mx-auto max-w-[1200px] px-7 py-7">
      <PageHeader
        title="Biblioteca"
        subtitle="Arrastra documentos e imágenes. Se procesan en segundo plano y se convierten en conocimiento consultable."
        actions={
          <>
            <button className="btn-primary" onClick={() => inputRef.current?.click()} disabled={uploading}>
              {uploading ? <Spinner /> : "Subir archivos"}
            </button>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              accept=".pdf,.docx,.xlsx,.txt,.md,.csv,.json,.html,.png,.jpg,.jpeg,.webp,.gif"
              onChange={(e) => e.target.files && void upload(e.target.files)}
            />
          </>
        }
      />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length) void upload(e.dataTransfer.files);
        }}
        className={`mb-5 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition ${
          dragging ? "border-neon-500/60 bg-neon-500/5" : "border-white/8 bg-white/[0.015]"
        }`}
      >
        <div className="text-sm text-mist-300">
          {dragging ? "Suelta los archivos para incorporarlos" : "Arrastra aquí PDF, Word, Excel, Markdown, TXT o imágenes"}
        </div>
        <div className="mt-1 text-[11px] text-mist-400">
          Máximo 60 MB por archivo · los duplicados se detectan por hash SHA-256
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/6 text-left text-[11px] uppercase tracking-wider text-mist-400">
              <th className="px-4 py-3 font-medium">Documento</th>
              <th className="px-4 py-3 font-medium">Tipo</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Fragmentos</th>
              <th className="px-4 py-3 font-medium">Relaciones</th>
              <th className="px-4 py-3 font-medium">Añadido</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {docs.map((doc) => (
              <tr key={doc.id} className="border-b border-white/4 last:border-0 hover:bg-white/[0.02]">
                <td className="max-w-[320px] px-4 py-3">
                  <button className="flex items-center gap-2 text-left" onClick={() => void openDetail(doc.id)}>
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] font-mono text-[9px] uppercase text-mist-300">
                      {doc.ext}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-mist-200">{doc.name}</span>
                      <span className="block text-[10px] text-mist-400">
                        {formatBytes(doc.size)}
                        {doc.pages ? ` · ${doc.pages} pág.` : ""}
                        {doc.excluded_remote ? " · solo local" : ""}
                      </span>
                    </span>
                  </button>
                </td>
                <td className="px-4 py-3 text-xs text-mist-400">{doc.origin}</td>
                <td className="px-4 py-3">
                  <StatusPill status={doc.status} />
                </td>
                <td className="px-4 py-3 text-xs text-mist-300">{doc.chunks}</td>
                <td className="px-4 py-3 text-xs text-mist-300">{doc.edges}</td>
                <td className="px-4 py-3 text-xs text-mist-400">{relativeDate(doc.added_at)}</td>
                <td className="px-4 py-3 text-right">
                  <button className="text-xs text-mist-400 hover:text-white" onClick={() => void openDetail(doc.id)}>
                    Detalles
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {docs.length === 0 && !loading && (
          <div className="p-6">
            <EmptyState
              title="Sin documentos todavía"
              hint="Sube un PDF con texto, un Word, una hoja de cálculo o una imagen. El sistema extraerá texto, entidades y relaciones."
            />
          </div>
        )}
      </div>

      <Drawer open={Boolean(selected)} onClose={() => setSelected(null)} title={detail?.document?.name ?? "Documento"}>
        {!detail ? (
          <div className="flex items-center gap-2 text-sm text-mist-400">
            <Spinner /> Cargando…
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={detail.document.status} />
              <span className="chip">{detail.document.ext.toUpperCase()}</span>
              <span className="chip">{formatBytes(detail.document.size)}</span>
              {detail.document.chars ? <span className="chip">{detail.document.chars} caracteres</span> : null}
              <span className="chip">{formatDate(detail.document.added_at)}</span>
            </div>

            {detail.document.error && (
              <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-xs text-amber-200">
                {detail.document.error}
              </div>
            )}

            {detail.job && (
              <div className="rounded-xl border border-white/6 bg-white/[0.02] p-3">
                <div className="mb-1 flex justify-between text-[11px] text-mist-400">
                  <span>
                    {detail.job.status} · {detail.job.step}
                  </span>
                  <span>{detail.job.progress}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
                  <div className="h-full bg-gradient-to-r from-neon-500 to-violet-500" style={{ width: `${detail.job.progress}%` }} />
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <a className="btn-ghost text-xs" href={`/api/documents/${detail.document.id}/file`} target="_blank" rel="noreferrer">
                Abrir original
              </a>
              <button className="btn-ghost text-xs" onClick={() => void reprocess(detail.document.id)}>
                Reprocesar
              </button>
              <button
                className="btn-ghost text-xs"
                onClick={() => void toggleRemote(detail.document.id, !detail.document.excluded_remote)}
              >
                {detail.document.excluded_remote ? "Permitir envío a NVIDIA" : "Solo procesamiento local"}
              </button>
              <button
                className="btn-danger text-xs"
                onClick={() => void remove(detail.document.id, detail.document.name)}
              >
                Eliminar
              </button>
            </div>

            <div>
              <h3 className="h2 mb-2">Relaciones extraídas ({detail.edges.length})</h3>
              <ul className="space-y-1.5">
                {detail.edges.slice(0, 40).map((e: any) => (
                  <li key={e.id} className="rounded-lg border border-white/6 bg-white/[0.02] px-3 py-2 text-[11px]">
                    <div className="text-mist-200">
                      {e.from_name} <span className="text-neon-400">{e.relation}</span> {e.to_name}
                    </div>
                    {e.evidence && <div className="mt-0.5 italic text-mist-400">“{e.evidence}”</div>}
                  </li>
                ))}
                {detail.edges.length === 0 && <li className="text-xs text-mist-400">Sin relaciones registradas.</li>}
              </ul>
            </div>

            <div>
              <h3 className="h2 mb-2">Fragmentos ({detail.chunks.length})</h3>
              <div className="space-y-2">
                {detail.chunks.slice(0, 30).map((c: any) => (
                  <div key={c.id} className="rounded-lg border border-white/6 bg-ink-950/40 p-3">
                    <div className="mb-1 flex gap-2 text-[10px] text-mist-400">
                      <span>#{c.idx + 1}</span>
                      {c.page && <span>pág. {c.page}</span>}
                      <span className={statusClass("")}>{c.kind}</span>
                    </div>
                    <p className="line-clamp-4 text-[11px] leading-relaxed text-mist-300">{c.content}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Drawer>

      {toast && <Toast message={toast.msg} kind={toast.kind} onDone={() => setToast(null)} />}
    </div>
  );
}
