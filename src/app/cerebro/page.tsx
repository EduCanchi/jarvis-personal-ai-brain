"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  Handle,
  Position,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { api, typeColor, useApi } from "@/lib/client";
import { Drawer, PageHeader, Spinner, StatusPill, Toast } from "@/components/ui";

interface GraphNode {
  id: string;
  type: string;
  name: string;
  description: string | null;
  status: string;
  confidence: number;
  doc_ids: string[];
}

interface GraphEdge {
  id: string;
  from_id: string;
  to_id: string;
  relation: string;
  evidence: string | null;
  confidence: number;
  status: string;
  doc_id: string | null;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

type BrainNodeData = {
  label: string;
  type: string;
  degree: number;
  status: string;
  highlighted?: boolean;
};

function BrainNode({ data }: NodeProps) {
  const d = data as unknown as BrainNodeData;
  const color = typeColor(d.type);
  const size = Math.min(46, 22 + Math.sqrt(d.degree) * 5);
  return (
    <div className="group flex flex-col items-center" style={{ width: 120 }}>
      <div
        className="flex items-center justify-center rounded-full border transition"
        style={{
          width: size,
          height: size,
          background: `radial-gradient(circle at 30% 30%, ${color}cc, ${color}33 70%)`,
          borderColor: `${color}aa`,
          boxShadow: d.highlighted ? `0 0 0 3px ${color}55, 0 0 24px ${color}66` : `0 0 14px ${color}33`,
        }}
      >
        <span className="text-[9px] font-bold uppercase text-ink-950/80">{d.type.slice(0, 3)}</span>
      </div>
      <div
        className="mt-1.5 max-w-[120px] truncate rounded-md px-1 text-center text-[10px] leading-tight text-mist-200 group-hover:text-white"
        title={d.label}
      >
        {d.label}
      </div>
      <Handle type="target" position={Position.Top} style={{ opacity: 0, top: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0, bottom: 0 }} />
    </div>
  );
}

const nodeTypes = { brain: BrainNode };

function clusterLayout(nodes: GraphNode[], edges: GraphEdge[]): Record<string, { x: number; y: number }> {
  const degree = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.from_id, (degree.get(e.from_id) ?? 0) + 1);
    degree.set(e.to_id, (degree.get(e.to_id) ?? 0) + 1);
  }
  const byType = new Map<string, GraphNode[]>();
  for (const n of nodes) {
    if (!byType.has(n.type)) byType.set(n.type, []);
    byType.get(n.type)!.push(n);
  }
  const types = [...byType.keys()].sort((a, b) => byType.get(b)!.length - byType.get(a)!.length);
  const positions: Record<string, { x: number; y: number }> = {};
  const clusterRadius = Math.max(420, types.length * 150);
  types.forEach((type, ti) => {
    const angle = (ti / Math.max(1, types.length)) * Math.PI * 2;
    const cx = Math.cos(angle) * clusterRadius;
    const cy = Math.sin(angle) * clusterRadius;
    const list = byType.get(type)!.sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0));
    const golden = Math.PI * (3 - Math.sqrt(5));
    list.forEach((node, i) => {
      const r = 18 + 26 * Math.sqrt(i);
      const a = i * golden;
      positions[node.id] = { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
    });
  });
  return positions;
}

function GraphInner({
  data,
  query,
  typeFilter,
  onSelect,
}: {
  data: GraphData;
  query: string;
  typeFilter: string;
  onSelect: (id: string) => void;
}) {
  const degree = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of data.edges) {
      map.set(e.from_id, (map.get(e.from_id) ?? 0) + 1);
      map.set(e.to_id, (map.get(e.to_id) ?? 0) + 1);
    }
    return map;
  }, [data.edges]);

  const positions = useMemo(() => clusterLayout(data.nodes, data.edges), [data.nodes, data.edges]);

  const visibleNodes = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.nodes.filter((n) => {
      if (typeFilter !== "todos" && n.type !== typeFilter) return false;
      if (q && !n.name.toLowerCase().includes(q) && !(n.description ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data.nodes, typeFilter, query]);

  const visibleIds = useMemo(() => new Set(visibleNodes.map((n) => n.id)), [visibleNodes]);

  const rfNodes = useMemo<Node[]>(
    () =>
      visibleNodes.map((n) => ({
        id: n.id,
        type: "brain",
        position: positions[n.id] ?? { x: 0, y: 0 },
        data: {
          label: n.name,
          type: n.type,
          degree: degree.get(n.id) ?? 0,
          status: n.status,
          highlighted: Boolean(query) && n.name.toLowerCase().includes(query.toLowerCase()),
        },
      })),
    [visibleNodes, positions, degree, query],
  );

  const rfEdges = useMemo<Edge[]>(() => {
    const edges = data.edges.filter((e) => visibleIds.has(e.from_id) && visibleIds.has(e.to_id)).slice(0, 2500);
    return edges.map((e) => ({
      id: e.id,
      source: e.from_id,
      target: e.to_id,
      label: e.relation,
      animated: e.status === "pendiente",
      style: {
        stroke: e.status === "pendiente" ? "rgba(255,196,102,0.35)" : "rgba(139,149,173,0.28)",
        strokeWidth: Math.max(1, e.confidence * 2),
        strokeDasharray: e.status === "pendiente" ? "5 4" : undefined,
      },
      labelStyle: { fill: "rgba(174,183,204,0.75)", fontSize: 9 },
      labelBgStyle: { fill: "rgba(5,6,10,0.7)" },
      labelBgPadding: [3, 2] as [number, number],
      labelBgBorderRadius: 4,
    }));
  }, [data.edges, visibleIds]);

  const [nodes, setNodes, onNodesChange] = useNodesState(rfNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(rfEdges);

  useEffect(() => {
    setNodes(rfNodes);
    setEdges(rfEdges);
  }, [rfNodes, rfEdges, setNodes, setEdges]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      onNodeClick={(_e, node) => onSelect(node.id)}
      fitView
      minZoom={0.05}
      maxZoom={2.4}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={26} size={1} color="rgba(139,149,173,0.14)" />
      <Controls showInteractive={false} />
      <MiniMap
        pannable
        zoomable
        nodeColor={(n) => typeColor((n.data as any).type)}
        maskColor="rgba(5,6,10,0.75)"
        style={{ background: "#0a0c14" }}
      />
      <Panel position="bottom-center">
        <div className="rounded-full border border-white/8 bg-ink-900/80 px-3 py-1 text-[11px] text-mist-400 backdrop-blur">
          {visibleNodes.length} nodos · {rfEdges.length} relaciones · arrastra para organizar, rueda para zoom
        </div>
      </Panel>
    </ReactFlow>
  );
}

export default function CerebroPage() {
  const { data, loading, reload } = useApi<GraphData>("/api/graph", 0);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("todos");
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [toast, setToast] = useState<{ msg: string; kind: "info" | "error" | "ok" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [mergeTarget, setMergeTarget] = useState("");
  const [connectTarget, setConnectTarget] = useState("");
  const [relation, setRelation] = useState("");

  const notify = (msg: string, kind: "info" | "error" | "ok" = "info") => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 3800);
  };

  const openNode = useCallback(async (id: string) => {
    setSelected(id);
    setDetail(null);
    try {
      const d = await api(`/api/graph/nodes/${id}`);
      setDetail(d);
    } catch (err: any) {
      notify(err.message, "error");
    }
  }, []);

  const types = useMemo(() => {
    const set = new Set((data?.nodes ?? []).map((n) => n.type));
    return ["todos", ...[...set].sort()];
  }, [data]);

  const otherNodes = useMemo(
    () => (data?.nodes ?? []).filter((n) => n.id !== selected).sort((a, b) => a.name.localeCompare(b.name)),
    [data, selected],
  );

  const act = async (fn: () => Promise<unknown>, message: string) => {
    setBusy(true);
    try {
      await fn();
      notify(message, "ok");
      await reload();
      if (selected) await openNode(selected);
    } catch (err: any) {
      notify(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const exportGraph = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cerebro-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-white/6 px-7 pb-4 pt-6">
        <PageHeader
          title="Cerebro visual"
          subtitle="Mapa interactivo del conocimiento: cada nodo es una entidad y cada línea una relación con su evidencia."
          actions={
            <>
              <button className="btn-ghost" onClick={exportGraph} disabled={!data}>
                Exportar grafo
              </button>
              <button className="btn-ghost" onClick={() => void reload()}>
                Actualizar
              </button>
            </>
          }
        />
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <svg
              viewBox="0 0 24 24"
              className="absolute left-3 top-2.5 h-4 w-4 text-mist-400"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.2-3.2" strokeLinecap="round" />
            </svg>
            <input
              className="input w-64 pl-9"
              placeholder="Buscar nodo…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {types.map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`rounded-full border px-2.5 py-1 text-[11px] capitalize transition ${
                  typeFilter === t
                    ? "border-neon-500/40 bg-neon-500/10 text-neon-400"
                    : "border-white/8 bg-white/[0.03] text-mist-400 hover:text-mist-200"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        {loading && !data ? (
          <div className="flex h-full items-center justify-center gap-2 text-mist-400">
            <Spinner /> Cargando grafo…
          </div>
        ) : (data?.nodes.length ?? 0) === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="text-lg text-mist-200">Tu cerebro está vacío</div>
            <p className="max-w-md text-sm text-mist-400">
              Añade documentos en la Biblioteca. El sistema extraerá entidades y relaciones, y el grafo se dibujará aquí.
            </p>
            <a href="/biblioteca" className="btn-primary">
              Ir a la Biblioteca
            </a>
          </div>
        ) : (
          <ReactFlowProvider>
            <GraphInner data={data!} query={query} typeFilter={typeFilter} onSelect={openNode} />
          </ReactFlowProvider>
        )}
      </div>

      <Drawer
        open={Boolean(selected)}
        onClose={() => {
          setSelected(null);
          setDetail(null);
        }}
        title={detail?.node?.name ?? "Cargando nodo…"}
      >
        {!detail ? (
          <div className="flex items-center gap-2 text-sm text-mist-400">
            <Spinner /> Cargando detalles…
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="chip capitalize" style={{ color: typeColor(detail.node.type) }}>
                <span className="node-dot" style={{ background: typeColor(detail.node.type) }} />
                {detail.node.type}
              </span>
              <StatusPill status={detail.node.status} />
              <span className="chip">confianza {(detail.node.confidence * 100).toFixed(0)}%</span>
              <span className="chip">{detail.node.doc_ids.length} documentos</span>
            </div>

            {detail.node.description && <p className="text-sm leading-relaxed text-mist-300">{detail.node.description}</p>}

            <div>
              <h3 className="h2 mb-2">Documentos de origen</h3>
              {detail.documents.length === 0 ? (
                <p className="text-xs text-mist-400">Sin documentos asociados (nodo manual o inferido).</p>
              ) : (
                <ul className="space-y-1.5">
                  {detail.documents.map((doc: any) => (
                    <li key={doc.id}>
                      <a
                        href={`/api/documents/${doc.id}/file`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 rounded-lg border border-white/6 bg-white/[0.02] px-3 py-2 text-xs text-mist-200 hover:border-white/14"
                      >
                        <span className="font-mono text-[10px] uppercase text-mist-400">{doc.ext}</span>
                        <span className="truncate">{doc.name}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h3 className="h2 mb-2">Relaciones ({detail.edges.length})</h3>
              <ul className="space-y-2">
                {detail.edges.map((edge: any) => {
                  const outgoing = edge.from_id === detail.node.id;
                  return (
                    <li key={edge.id} className="rounded-xl border border-white/6 bg-white/[0.02] p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-xs text-mist-200">
                          <span className="text-mist-400">{outgoing ? detail.node.name : edge.from_name}</span>{" "}
                          <span className="font-medium text-neon-400">{edge.relation}</span>{" "}
                          <span className="text-mist-400">{outgoing ? edge.to_name : detail.node.name}</span>
                        </div>
                        <StatusPill status={edge.status} />
                      </div>
                      {edge.evidence && <p className="mt-1.5 text-[11px] italic text-mist-400">“{edge.evidence}”</p>}
                      <div className="mt-2 flex items-center gap-2 text-[10px] text-mist-400">
                        <span>{Math.round(edge.confidence * 100)}%</span>
                        {edge.doc_name && <span className="truncate">· {edge.doc_name}</span>}
                        <div className="ml-auto flex gap-1">
                          {edge.status === "pendiente" && (
                            <button
                              className="rounded-md border border-emerald-500/25 px-2 py-0.5 text-emerald-300 hover:bg-emerald-500/10"
                              disabled={busy}
                              onClick={() => act(() => api(`/api/graph/edges/${edge.id}`, { method: "PATCH", body: JSON.stringify({ status: "confirmada" }) }), "Relación confirmada")}
                            >
                              Confirmar
                            </button>
                          )}
                          <button
                            className="rounded-md border border-red-500/25 px-2 py-0.5 text-red-300 hover:bg-red-500/10"
                            disabled={busy}
                            onClick={() => act(() => api(`/api/graph/edges/${edge.id}`, { method: "DELETE" }), "Relación eliminada")}
                          >
                            Quitar
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
                {detail.edges.length === 0 && <li className="text-xs text-mist-400">Este nodo aún no tiene relaciones.</li>}
              </ul>
            </div>

            <div className="space-y-3 rounded-xl border border-white/6 bg-ink-950/40 p-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-mist-400">Acciones</h3>
              <div className="flex flex-wrap gap-2">
                <button
                  className="btn-danger text-xs"
                  disabled={busy}
                  onClick={() => {
                    if (!confirm(`¿Eliminar el nodo "${detail.node.name}" y todas sus relaciones?`)) return;
                    void act(async () => {
                      await api(`/api/graph/nodes/${selected}`, { method: "DELETE" });
                      setSelected(null);
                      setDetail(null);
                    }, "Nodo eliminado");
                  }}
                >
                  Eliminar nodo
                </button>
              </div>

              <div className="grid gap-2">
                <label className="label mb-0">Conectar con otro nodo</label>
                <div className="flex gap-2">
                  <select className="input flex-1" value={connectTarget} onChange={(e) => setConnectTarget(e.target.value)}>
                    <option value="">Selecciona un nodo…</option>
                    {otherNodes.slice(0, 800).map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.name} ({n.type})
                      </option>
                    ))}
                  </select>
                  <input
                    className="input w-36"
                    placeholder="relación"
                    value={relation}
                    onChange={(e) => setRelation(e.target.value)}
                  />
                  <button
                    className="btn-ghost text-xs"
                    disabled={!connectTarget || !relation || busy}
                    onClick={() =>
                      act(async () => {
                        await api("/api/graph/edges", {
                          method: "POST",
                          body: JSON.stringify({ from_id: selected, to_id: connectTarget, relation }),
                        });
                        setConnectTarget("");
                        setRelation("");
                      }, "Relación creada")
                    }
                  >
                    Crear
                  </button>
                </div>
              </div>

              <div className="grid gap-2">
                <label className="label mb-0">Fusionar duplicados (este nodo se absorbe)</label>
                <div className="flex gap-2">
                  <select className="input flex-1" value={mergeTarget} onChange={(e) => setMergeTarget(e.target.value)}>
                    <option value="">Selecciona el nodo destino…</option>
                    {otherNodes.slice(0, 800).map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.name} ({n.type})
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn-ghost text-xs"
                    disabled={!mergeTarget || busy}
                    onClick={() => {
                      if (!confirm("Se moverán las relaciones al nodo destino y se eliminará este nodo. ¿Continuar?")) return;
                      void act(async () => {
                        await api(`/api/graph/nodes/${selected}/merge`, {
                          method: "POST",
                          body: JSON.stringify({ target_id: mergeTarget }),
                        });
                        setSelected(mergeTarget);
                        setMergeTarget("");
                        await openNode(mergeTarget);
                      }, "Nodos fusionados");
                    }}
                  >
                    Fusionar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </Drawer>

      {toast && <Toast message={toast.msg} kind={toast.kind} onDone={() => setToast(null)} />}
    </div>
  );
}
