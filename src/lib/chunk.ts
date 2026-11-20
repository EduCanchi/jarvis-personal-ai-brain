import { getSetting } from "./db";

export interface ChunkDraft {
  content: string;
  page?: number;
  kind?: "texto" | "vision" | "tabla";
}

/** Divide texto respetando párrafos y frases, con solapamiento configurable. */
export function chunkText(text: string, opts?: { size?: number; overlap?: number; page?: number }): ChunkDraft[] {
  const size = opts?.size ?? (Number(getSetting("tamano_fragmento", "1400")) || 1400);
  const overlap = Math.min(opts?.overlap ?? (Number(getSetting("solapamiento_fragmento", "200")) || 200), size / 2);
  const clean = text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return [];

  const paragraphs = clean.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  const chunks: ChunkDraft[] = [];
  let buffer = "";

  const flush = () => {
    const value = buffer.trim();
    if (value) chunks.push({ content: value, page: opts?.page, kind: "texto" });
    buffer = value.length > overlap ? value.slice(value.length - overlap) : value;
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > size) {
      if (buffer.trim()) {
        chunks.push({ content: buffer.trim(), page: opts?.page, kind: "texto" });
        buffer = "";
      }
      const sentences = paragraph.match(/[^.!?;\n]+[.!?;]?\s*/g) ?? [paragraph];
      let current = "";
      for (const sentence of sentences) {
        if ((current + sentence).length > size && current) {
          chunks.push({ content: current.trim(), page: opts?.page, kind: "texto" });
          current = current.slice(-overlap) + sentence;
        } else {
          current += sentence;
        }
      }
      buffer = current.trim();
      continue;
    }
    if ((buffer + "\n\n" + paragraph).length > size) {
      flush();
      buffer = (buffer ? buffer + "\n\n" : "") + paragraph;
    } else {
      buffer = buffer ? buffer + "\n\n" + paragraph : paragraph;
    }
  }
  const tail = buffer.trim();
  if (tail) {
    const last = chunks[chunks.length - 1];
    if (!last || last.content !== tail) chunks.push({ content: tail, page: opts?.page, kind: "texto" });
  }
  return chunks;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
