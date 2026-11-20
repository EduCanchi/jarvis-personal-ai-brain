import fs from "node:fs/promises";
import path from "node:path";
import mammoth from "mammoth";
import ExcelJS from "exceljs";

export interface ParsedPage {
  page: number;
  text: string;
}

export interface ParsedImage {
  page?: number;
  dataUrl: string;
  label: string;
}

export interface ParsedDoc {
  text: string;
  pages: number;
  pageTexts: ParsedPage[];
  images: ParsedImage[];
  warnings: string[];
}

const MAX_RENDER_PAGES = 12;

async function loadCanvas() {
  const canvas = await import("@napi-rs/canvas");
  const g = globalThis as any;
  if (!g.DOMMatrix) g.DOMMatrix = canvas.DOMMatrix;
  if (!g.ImageData) g.ImageData = canvas.ImageData;
  if (!g.Path2D) g.Path2D = canvas.Path2D;
  return canvas;
}

async function parsePdf(filePath: string): Promise<ParsedDoc> {
  const warnings: string[] = [];
  const { createCanvas } = await loadCanvas();
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(await fs.readFile(filePath));
  const doc = await pdfjs.getDocument({
    data,
    disableFontFace: true,
    useSystemFonts: true,
  } as any).promise;

  const pageTexts: ParsedPage[] = [];
  const images: ParsedImage[] = [];
  let rendered = 0;

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const text = content.items
      .map((item: any) => ("str" in item ? item.str + (item.hasEOL ? "\n" : " ") : ""))
      .join("")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    pageTexts.push({ page: p, text });

    const needsVision = text.length < 40;
    if (needsVision && rendered < MAX_RENDER_PAGES) {
      try {
        const viewport = page.getViewport({ scale: 1.4 });
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        const ctx = canvas.getContext("2d");
        await page.render({ canvasContext: ctx as any, viewport, canvas: canvas as any }).promise;
        const png = canvas.toBuffer("image/png");
        images.push({
          page: p,
          label: `Página ${p} (sin texto seleccionable, renderizada como imagen)`,
          dataUrl: `data:image/png;base64,${png.toString("base64")}`,
        });
        rendered++;
      } catch (err: any) {
        warnings.push(`No se pudo renderizar la página ${p}: ${String(err?.message ?? err)}`);
      }
    }
  }
  await (doc as any).destroy?.();
  if (rendered > 0) warnings.push(`${rendered} página(s) se enviarán al modelo de visión por no tener texto extraíble.`);
  return {
    text: pageTexts.map((p) => p.text).join("\n\n"),
    pages: doc.numPages,
    pageTexts,
    images,
    warnings,
  };
}

async function parseDocx(filePath: string): Promise<ParsedDoc> {
  const result = await mammoth.extractRawText({ path: filePath });
  return { text: result.value, pages: 0, pageTexts: [], images: [], warnings: result.messages.map((m) => m.message) };
}

async function parseXlsx(filePath: string): Promise<ParsedDoc> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const parts: string[] = [];
  workbook.eachSheet((sheet) => {
    parts.push(`## Hoja: ${sheet.name}`);
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const values = (row.values as any[]).slice(1).map((v) => {
        if (v == null) return "";
        if (typeof v === "object" && "text" in v) return String((v as any).text);
        if (typeof v === "object" && "result" in v) return String((v as any).result);
        return String(v);
      });
      if (values.some((v) => v.trim())) parts.push(values.join(" | "));
    });
  });
  return { text: parts.join("\n"), pages: workbook.worksheets.length, pageTexts: [], images: [], warnings: [] };
}

async function parsePlain(filePath: string): Promise<ParsedDoc> {
  const raw = await fs.readFile(filePath, "utf8");
  return { text: raw, pages: 0, pageTexts: [], images: [], warnings: [] };
}

async function parseHtml(filePath: string): Promise<ParsedDoc> {
  const raw = await fs.readFile(filePath, "utf8");
  const text = raw
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ");
  return { text, pages: 0, pageTexts: [], images: [], warnings: [] };
}

/** Normaliza una imagen a JPEG/PNG acotado para no gastar tokens de más. */
export async function imageToDataUrl(filePath: string, maxSide = 1600): Promise<string> {
  const buffer = await fs.readFile(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mime =
    ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : ext === ".gif" ? "image/gif" : "image/jpeg";
  try {
    const { createCanvas, loadImage } = await loadCanvas();
    const img = await loadImage(buffer);
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    if (scale === 1 && buffer.length < 2_500_000) {
      return `data:${mime};base64,${buffer.toString("base64")}`;
    }
    const canvas = createCanvas(Math.round(img.width * scale), Math.round(img.height * scale));
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const out = canvas.toBuffer("image/jpeg", 82);
    return `data:image/jpeg;base64,${out.toString("base64")}`;
  } catch {
    return `data:${mime};base64,${buffer.toString("base64")}`;
  }
}

export async function parseDocument(filePath: string, ext: string): Promise<ParsedDoc> {
  const normalized = ext.toLowerCase().replace(/^\./, "");
  switch (normalized) {
    case "pdf":
      return parsePdf(filePath);
    case "docx":
      return parseDocx(filePath);
    case "xlsx":
    case "xlsm":
      return parseXlsx(filePath);
    case "html":
    case "htm":
      return parseHtml(filePath);
    case "png":
    case "jpg":
    case "jpeg":
    case "webp":
    case "gif": {
      const dataUrl = await imageToDataUrl(filePath);
      return {
        text: "",
        pages: 1,
        pageTexts: [],
        images: [{ dataUrl, label: "Imagen original" }],
        warnings: [],
      };
    }
    case "txt":
    case "md":
    case "markdown":
    case "csv":
    case "json":
    case "log":
    case "tsv":
    case "rtf":
      return parsePlain(filePath);
    default: {
      const probe = await fs.readFile(filePath);
      if (probe.includes(0)) throw new Error(`Formato no soportado: .${normalized}`);
      return { text: probe.toString("utf8"), pages: 0, pageTexts: [], images: [], warnings: [`Extensión .${normalized} tratada como texto plano`] };
    }
  }
}
