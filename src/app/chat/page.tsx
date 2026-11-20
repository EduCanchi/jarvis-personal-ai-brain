"use client";

import { useEffect, useRef, useState } from "react";
import { api, relativeDate, useApi } from "@/lib/client";
import { PageHeader, Spinner, Toast } from "@/components/ui";

interface Citation {
  n: number;
  doc_id: string;
  doc_name: string;
  page: number | null;
  chunk_id: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: string | null;
  citations?: Citation[];
  created_at: string;
}

interface Conversation {
  id: string;
  title: string;
  updated_at: string;
  mensajes: number;
}

export default function ChatPage() {
  const { data: convData, reload: reloadConvs } = useApi<{ conversations: Conversation[] }>("/api/conversations", 15000);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<{ msg: string; kind: "info" | "error" | "ok" } | null>(null);
  const [showReasoning, setShowReasoning] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const loadConversation = async (id: string) => {
    try {
      const data = await api<{ messages: Message[] }>(`/api/conversations/${id}`);
      setConversationId(id);
      setMessages(data.messages);
    } catch (err: any) {
      setToast({ msg: err.message, kind: "error" });
    }
  };

  const send = async () => {
    const q = question.trim();
    if (!q || sending) return;
    setQuestion("");
    setSending(true);
    const optimistic: Message = {
      id: `tmp-${Date.now()}`,
      role: "user",
      content: q,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    try {
      const result = await api<{
        conversation_id: string;
        message_id: string;
        answer: string;
        reasoning: string;
        sources: any[];
      }>("/api/chat", {
        method: "POST",
        body: JSON.stringify({ question: q, conversation_id: conversationId }),
      });
      setConversationId(result.conversation_id);
      setMessages((prev) => [
        ...prev,
        {
          id: result.message_id,
          role: "assistant",
          content: result.answer,
          reasoning: result.reasoning,
          citations: result.sources?.map((s) => ({
            n: s.n,
            doc_id: s.doc_id,
            doc_name: s.doc_name,
            page: s.page,
            chunk_id: s.chunk_id,
          })),
          created_at: new Date().toISOString(),
        },
      ]);
      void reloadConvs();
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: `⚠️ ${err.message}`,
          created_at: new Date().toISOString(),
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-full">
      <div className="hidden w-64 shrink-0 flex-col border-r border-white/6 bg-ink-900/40 lg:flex">
        <div className="flex items-center justify-between px-4 py-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-mist-400">Conversaciones</h2>
          <button
            className="rounded-lg border border-white/8 px-2 py-1 text-xs text-mist-300 hover:border-white/16"
            onClick={() => {
              setConversationId(null);
              setMessages([]);
            }}
          >
            Nueva
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {(convData?.conversations ?? []).map((c) => (
            <button
              key={c.id}
              onClick={() => void loadConversation(c.id)}
              className={`mb-1 w-full rounded-lg px-3 py-2 text-left transition ${
                conversationId === c.id ? "bg-white/[0.07] text-white" : "text-mist-300 hover:bg-white/[0.04]"
              }`}
            >
              <div className="truncate text-xs">{c.title}</div>
              <div className="mt-0.5 text-[10px] text-mist-400">
                {c.mensajes} mensajes · {relativeDate(c.updated_at)}
              </div>
            </button>
          ))}
          {(convData?.conversations ?? []).length === 0 && (
            <p className="px-3 py-4 text-xs text-mist-400">Aún no hay conversaciones.</p>
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="border-b border-white/6 px-7 pb-4 pt-6">
          <PageHeader
            title="Chat IA"
            subtitle="Pregunta en lenguaje natural sobre tus documentos. Las respuestas citan las fuentes utilizadas."
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-7 py-5">
          {messages.length === 0 && !sending && (
            <div className="mx-auto mt-10 max-w-2xl">
              <div className="card p-6 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-neon-500/20 to-violet-500/20 ring-1 ring-white/10">
                  <svg viewBox="0 0 24 24" className="h-6 w-6 text-neon-400" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <path d="M21 12a8 8 0 0 1-8 8H7l-4 3V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8Z" />
                  </svg>
                </div>
                <h3 className="text-base font-medium text-white">Conversa con tu conocimiento</h3>
                <p className="mx-auto mt-1.5 max-w-md text-sm text-mist-400">
                  El sistema recupera fragmentos de tus documentos antes de responder y te muestra las fuentes.
                </p>
                <div className="mt-5 grid gap-2 text-left sm:grid-cols-2">
                  {[
                    "¿Qué proyectos aparecen en mis documentos y quién los lidera?",
                    "Resume el contenido del último PDF que he subido.",
                    "¿Qué relación hay entre las personas y las organizaciones mencionadas?",
                    "¿Qué información contradice lo que dice el documento más reciente?",
                  ].map((s) => (
                    <button
                      key={s}
                      className="rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2 text-xs text-mist-300 transition hover:border-neon-500/30 hover:text-white"
                      onClick={() => setQuestion(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="mx-auto max-w-3xl space-y-4">
            {messages.map((m) => (
              <div key={m.id} className={m.role === "user" ? "flex justify-end" : ""}>
                {m.role === "user" ? (
                  <div className="max-w-[85%] rounded-2xl rounded-br-md bg-neon-500/12 px-4 py-2.5 text-sm text-mist-100 ring-1 ring-neon-500/20">
                    {m.content}
                  </div>
                ) : (
                  <div className="max-w-full">
                    <div className="card px-4 py-3.5">
                      <div className="whitespace-pre-wrap text-sm leading-relaxed text-mist-200">{m.content}</div>
                      {m.citations && m.citations.length > 0 && (
                        <div className="mt-3 border-t border-white/6 pt-3">
                          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-mist-400">
                            Fuentes utilizadas
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {m.citations.map((c) => (
                              <a
                                key={`${m.id}-${c.n}`}
                                href={`/api/documents/${c.doc_id}/file${c.page ? `#page=${c.page}` : ""}`}
                                target="_blank"
                                rel="noreferrer"
                                className="chip hover:border-neon-500/40 hover:text-white"
                                title={c.doc_name}
                              >
                                <span className="font-mono text-neon-400">[{c.n}]</span>
                                <span className="max-w-[220px] truncate">{c.doc_name}</span>
                                {c.page && <span className="text-mist-400">p.{c.page}</span>}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                      {m.reasoning && (
                        <div className="mt-3">
                          <button
                            className="text-[11px] text-mist-400 hover:text-mist-200"
                            onClick={() => setShowReasoning(showReasoning === m.id ? null : m.id)}
                          >
                            {showReasoning === m.id ? "Ocultar razonamiento" : "Ver razonamiento del modelo"}
                          </button>
                          {showReasoning === m.id && (
                            <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg bg-ink-950/70 p-3 font-mono text-[10px] leading-relaxed text-mist-400">
                              {m.reasoning}
                            </pre>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {sending && (
              <div className="card flex items-center gap-3 px-4 py-3 text-sm text-mist-400">
                <Spinner /> Recuperando evidencia y razonando…
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        <div className="border-t border-white/6 px-7 py-4">
          <div className="mx-auto flex max-w-3xl items-end gap-2">
            <textarea
              className="input max-h-40 min-h-[46px] resize-y py-3"
              placeholder="Escribe tu pregunta… (Enter para enviar, Shift+Enter para nueva línea)"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={1}
            />
            <button className="btn-primary h-[46px] px-4" onClick={() => void send()} disabled={sending || !question.trim()}>
              {sending ? <Spinner /> : "Enviar"}
            </button>
          </div>
          <p className="mx-auto mt-2 max-w-3xl text-[10px] text-mist-400">
            El contenido recuperado se envía a NVIDIA Build para generar la respuesta. Puedes desactivarlo en Configuración.
          </p>
        </div>
      </div>

      {toast && <Toast message={toast.msg} kind={toast.kind} onDone={() => setToast(null)} />}
    </div>
  );
}
