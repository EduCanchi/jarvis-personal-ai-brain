"use client";

import { useMemo, useState } from "react";
import { api, typeColor, useApi } from "@/lib/client";
import { Drawer, PageHeader, Spinner, StatusPill, Toast } from "@/components/ui";

interface NodeRow {
  id: string;
  type: string;
  name: string;
  description: string | null;
  status: string;
  confidence: number;
  origin: string;
  doc_ids: string[];
  updated_at: string;
}

interface EdgeRow {
  id: string;
  from_id: string;
  to_id: string;
  relation: string;
  evidence: string | null;
  confidence: number;
  status: string;
  origin: string;
  doc_id: string | null;
}

export default function MemoriaPage() {
  const { data, reload, loading } = useApi<{ nodes: NodeRow[]; edges: EdgeRow[] }>("/api/graph", 0);
  const [tab, setTab] = useState<"nodos" | "pendientes" | "recuerdos">("nodos");
  const [q, setQ] = useState("");
  const [type, setType] = useState("todos");
  const [selected, setSelected] = useState<NodeRow | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", type: "concepto" });
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<{ msg: string; kind: "info" | "error" | "ok" } | null>(null);
  const [busy, setBusy] = useState(false);

  const notify = (msg: string, kind: "info" | "error" | "ok" = "info") => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 3800);
  };

  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    (data?.nodes ?? []).forEach((n) => map.set(n.id, n.name));
    return map;
  }, [data]);

  const types = useMemo(() => ["todos", ...new Set((data?.nodes ?? []).map((n) => n.type))], [data]);

  const nodes = useMemo(() => {
    let list = data?.nodes ?? [];
    if (type !== "todos") list = list.filter((n) => n.type === type);
    if (tab === "recuerdos") list = list.filter((n) => n.origin === "usuario" || n.status === "usuario");
    if (q.trim()) {
      const needle = q.toLowerCase();
      list = list.filter((n) => n.name.toLowerCase().includes(needle) || (n.description ?? "").toLowerCase().includes(needle));
    }
    return list.slice(0, 500);
  }, [data, type, tab, q]);

  const pending = useMemo(
    () => (data?.edges ?? []).filter((e) => e.status === "pendiente").sort((a, b) => b.confidence - a.confidence),
    [data],
  );

  const act = async (fn: () => Promise<unknown>, message: string) => {
    setBusy(true);
    try {
      await fn();
      notify(message, "ok");
      await reload();
    } catch (err: any) {
      notify(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1200px] px-7 py-7">
      <PageHeader
        title="Memoria"
        subtitle="Conceptos, entidades y relaciones. Corrige lo que la IA haya inferido mal: tú tienes la última palabra."
        actions={
          <>
            <button
              className="btn-ghost"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  const r = await api<{ fusionados: number }>("/api/graph/dedupe", { method: "POST" });
                  notify(`${r.fusionados} nodos duplicados fusionados`, "ok");
                }, "Duplicados consolidados")
              }
            >
              Fusionar duplicados
            </button>
            <button
              className="btn-primary"
              onClick={() => {
                setCreating(true);
                setForm({ name: "", description: "", type: "concepto" });
              }}
            >
              Nuevo concepto
            </button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-white/8 bg-white/[0.02] p-0.5">
          {(["nodos", "pendientes", "recuerdos"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-lg px-3 py-1.5 text-xs capitalize transition ${
                tab === t ? "bg-white/[0.08] text-white" : "text-mist-400 hover:text-mist-200"
              }`}
            >
              {t}
              {t === "pendientes" && pending.length > 0 && (
                <span className="ml-1.5 rounded-full bg-amber-500/20 px-1.5 text-[10px] text-amber-300">{pending.length}</span>
              )}
            </button>
          ))}
        </div>
        {tab !== "pendientes" && (
          <>
            <input className="input w-56" placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="input w-40" value={type} onChange={(e) => setType(e.target.value)}>
              {types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </>
        )}
      </div>

      {loading && !data ? (
        <div className="flex items-center gap-2 text-mist-400">
          <Spinner /> Cargando memoria…
        </div>
      ) : tab === "pendientes" ? (
        <div className="space-y-2">
          {pending.length === 0 && (
            <div className="card px-4 py-10 text-center text-sm text-mist-400">
              No hay relaciones pendientes. Todas las relaciones automáticas han sido validadas o descartadas.
            </div>
          )}
          {pending.map((e) => (
            <div key={e.id} className="card p-3.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="text-sm text-mist-200">
                  {nameById.get(e.from_id) ?? "?"} <span className="font-medium text-amber-300">{e.relation}</span>{" "}
                  {nameById.get(e.to_id) ?? "?"}
                </div>
                <div className="flex items-center gap-2">
                  <span className="chip">{Math.round(e.confidence * 100)}% confianza</span>
                  <button
                    className="rounded-md border border-emerald-500/25 px-2 py-1 text-[11px] text-emerald-300 hover:bg-emerald-500/10"
                    disabled={busy}
                    onClick={() =>
                      act(
                        () => api(`/api/graph/edges/${e.id}`, { method: "PATCH", body: JSON.stringify({ status: "confirmada" }) }),
                        "Relación confirmada",
                      )
                    }
                  >
                    Confirmar
                  </button>
                  <button
                    className="rounded-md border border-red-500/25 px-2 py-1 text-[11px] text-red-300 hover:bg-red-500/10"
                    disabled={busy}
                    onClick={() => act(() => api(`/api/graph/edges/${e.id}`, { method: "DELETE" }), "Relación descartada")}
                  >
                    Descartar
                  </button>
                </div>
              </div>
              {e.evidence && <p className="mt-1.5 text-[11px] italic text-mist-400">“{e.evidence}”</p>}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {nodes.map((n) => (
            <button
              key={n.id}
              onClick={() => {
                setSelected(n);
                setForm({ name: n.name, description: n.description ?? "", type: n.type });
                setEditing(false);
              }}
              className="card card-hover p-3.5 text-left"
            >
              <div className="flex items-center gap-2">
                <span className="node-dot" style={{ background: typeColor(n.type) }} />
                <span className="truncate text-sm text-mist-100">{n.name}</span>
                <StatusPill status={n.status} className="ml-auto" />
              </div>
              <div className="mt-1 text-[10px] uppercase tracking-wider text-mist-400">{n.type}</div>
              {n.description && <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-mist-400">{n.description}</p>}
              <div className="mt-2 text-[10px] text-mist-400">
                {n.doc_ids.length} documentos · {Math.round(n.confidence * 100)}% confianza
              </div>
            </button>
          ))}
          {nodes.length === 0 && (
            <div className="card col-span-full px-4 py-10 text-center text-sm text-mist-400">Sin resultados.</div>
          )}
        </div>
      )}

      <Drawer
        open={Boolean(selected) || creating}
        onClose={() => {
          setSelected(null);
          setCreating(false);
        }}
        title={creating ? "Nuevo concepto" : "Editar concepto"}
      >
        <div className="space-y-4">
          <div>
            <label className="label">Nombre</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="label">Tipo</label>
            <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {["concepto", "persona", "organizacion", "proyecto", "proceso", "decision", "evento", "lugar", "producto", "tecnologia", "otro"].map(
                (t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ),
              )}
            </select>
          </div>
          <div>
            <label className="label">Descripción</label>
            <textarea
              className="input min-h-28"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="flex gap-2">
            <button
              className="btn-primary"
              disabled={!form.name.trim() || busy}
              onClick={() =>
                act(async () => {
                  if (creating) {
                    await api("/api/graph/nodes", { method: "POST", body: JSON.stringify(form) });
                  } else if (selected) {
                    await api(`/api/graph/nodes/${selected.id}`, { method: "PATCH", body: JSON.stringify(form) });
                  }
                  setCreating(false);
                  setSelected(null);
                }, creating ? "Concepto creado" : "Cambios guardados")
              }
            >
              Guardar
            </button>
            {!creating && selected && (
              <button
                className="btn-danger"
                disabled={busy}
                onClick={() => {
                  if (!confirm(`¿Eliminar "${selected.name}" y sus relaciones?`)) return;
                  void act(async () => {
                    await api(`/api/graph/nodes/${selected.id}`, { method: "DELETE" });
                    setSelected(null);
                  }, "Concepto eliminado");
                }}
              >
                Eliminar
              </button>
            )}
          </div>
          {selected && (
            <div className="rounded-xl border border-white/6 bg-ink-950/40 p-3 text-[11px] text-mist-400">
              <div>Origen: {selected.origin}</div>
              <div>Estado: {selected.status}</div>
              <div>Confianza: {Math.round(selected.confidence * 100)}%</div>
              <div>Documentos: {selected.doc_ids.length}</div>
            </div>
          )}
        </div>
      </Drawer>

      {toast && <Toast message={toast.msg} kind={toast.kind} onDone={() => setToast(null)} />}
    </div>
  );
}
