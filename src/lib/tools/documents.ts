import { registerTool, saveArtifact, ToolDef } from "./registry";
import pptxgen from "pptxgenjs";
import ExcelJS from "exceljs";
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from "docx";
import PDFDocument from "pdfkit";

function asText(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function ensureArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

const crearPresentacion: ToolDef = {
  nombre: "crear_presentacion",
  descripcion: "Crea una presentación PowerPoint (.pptx) con diapositivas y viñetas.",
  parametros: {
    titulo: { tipo: "texto", descripcion: "Título de la portada", obligatorio: true },
    subtitulo: { tipo: "texto", descripcion: "Subtítulo de la portada" },
    diapositivas: {
      tipo: "lista",
      descripcion: 'Lista de {titulo, puntos:[texto], notas?}',
      obligatorio: true,
    },
  },
  permisos: ["crear_archivos"],
  riesgo: "bajo",
  requiere_confirmacion: false,
  estado: () => ({ conectada: true, detalle: "PptxGenJS local" }),
  ejecutar: async (args) => {
    const pptx = new pptxgen();
    pptx.layout = "LAYOUT_WIDE";
    pptx.author = "JARVIS";
    pptx.title = asText(args.titulo);

    const portada = pptx.addSlide();
    portada.background = { color: "0B1020" };
    portada.addText(asText(args.titulo) || "Presentación", {
      x: 0.7,
      y: 2.1,
      w: 11.9,
      h: 1.2,
      fontSize: 40,
      bold: true,
      color: "FFFFFF",
      fontFace: "Helvetica",
    });
    if (args.subtitulo) {
      portada.addText(asText(args.subtitulo), { x: 0.75, y: 3.35, w: 11.5, h: 0.8, fontSize: 20, color: "8FE3D0" });
    }
    portada.addText(new Date().toLocaleDateString("es-ES"), {
      x: 0.75,
      y: 6.5,
      w: 6,
      h: 0.4,
      fontSize: 12,
      color: "9AA7C2",
    });

    const slides = ensureArray<any>(args.diapositivas ?? args.slides ?? args.diapositiva).slice(0, 40);
    slides.forEach((item, index) => {
      const slide = pptx.addSlide();
      slide.background = { color: "0B1020" };
      slide.addText(`${index + 1}. ${asText(item?.titulo ?? item?.title) || "Diapositiva"}`, {
        x: 0.6,
        y: 0.45,
        w: 12.2,
        h: 0.9,
        fontSize: 28,
        bold: true,
        color: "FFFFFF",
      });
      const puntos = ensureArray<any>(item?.puntos ?? item?.contenido ?? item?.bullets ?? item?.items ?? item?.viñetas)
        .map((p) => (typeof p === "object" ? asText((p as any)?.texto ?? (p as any)?.text) : asText(p)))
        .filter(Boolean);
      if (puntos.length) {
        slide.addText(
          puntos.map((punto) => ({ text: punto, options: { bullet: true, breakLine: true } })),
          { x: 0.9, y: 1.6, w: 11.6, h: 4.6, fontSize: 18, color: "D6DEEE", lineSpacingMultiple: 1.25 },
        );
      }
      if (item?.notas) slide.addNotes(asText(item.notas));
      slide.addText("JARVIS", { x: 11.4, y: 6.9, w: 1.4, h: 0.3, fontSize: 10, color: "5C6B8A", align: "right" });
    });

    const buffer = (await pptx.write({ outputType: "nodebuffer" })) as unknown as Buffer;
    const artifact = await saveArtifact({
      name: `${asText(args.titulo) || "presentacion"}.pptx`,
      mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      buffer,
      tool: "crear_presentacion",
    });
    return {
      ok: true,
      resumen: `Presentación creada con ${slides.length + 1} diapositivas: ${artifact.name}`,
      artefactos: [artifact],
      datos: { diapositivas: slides.length + 1, bytes: buffer.length },
    };
  },
};

const crearExcel: ToolDef = {
  nombre: "crear_excel",
  descripcion: "Crea un libro de Excel (.xlsx) con hojas, columnas y filas.",
  parametros: {
    nombre: { tipo: "texto", descripcion: "Nombre del archivo", obligatorio: true },
    hojas: {
      tipo: "lista",
      descripcion: 'Lista de {nombre, columnas:[texto], filas:[[valor]]}',
      obligatorio: true,
    },
  },
  permisos: ["crear_archivos"],
  riesgo: "bajo",
  requiere_confirmacion: false,
  estado: () => ({ conectada: true, detalle: "ExcelJS local" }),
  ejecutar: async (args) => {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "JARVIS";
    workbook.created = new Date();
    const hojas = ensureArray<any>(args.hojas ?? args.sheets).slice(0, 20);
    if (hojas.length === 0) throw new Error("Se necesita al menos una hoja");

    for (const hoja of hojas) {
      const sheet = workbook.addWorksheet(asText(hoja?.nombre).slice(0, 31) || "Hoja");
      const columnas = ensureArray<any>(hoja?.columnas ?? hoja?.columns ?? hoja?.cabeceras).map((c) => asText(c));
      if (columnas.length) {
        sheet.addRow(columnas);
        sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
        sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3B57" } };
        sheet.columns = columnas.map((c) => ({ width: Math.max(12, Math.min(40, c.length + 6)) }));
      }
      for (const fila of ensureArray<any>(hoja?.filas ?? hoja?.rows ?? hoja?.datos)) {
        const values = ensureArray<any>(fila).map((v) => (typeof v === "number" ? v : asText(v)));
        sheet.addRow(values);
      }
      sheet.eachRow((row) => {
        row.eachCell((cell) => {
          cell.border = { top: { style: "thin", color: { argb: "FFD9D9D9" } }, bottom: { style: "thin", color: { argb: "FFD9D9D9" } } };
        });
      });
    }

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const artifact = await saveArtifact({
      name: `${asText(args.nombre) || "datos"}.xlsx`,
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer,
      tool: "crear_excel",
    });
    return {
      ok: true,
      resumen: `Excel creado con ${hojas.length} hoja(s): ${artifact.name}`,
      artefactos: [artifact],
      datos: { hojas: hojas.length, bytes: buffer.length },
    };
  },
};

const crearWord: ToolDef = {
  nombre: "crear_word",
  descripcion: "Crea un documento Word (.docx) con título y secciones.",
  parametros: {
    nombre: { tipo: "texto", descripcion: "Nombre del archivo", obligatorio: true },
    titulo: { tipo: "texto", descripcion: "Título principal", obligatorio: true },
    secciones: { tipo: "lista", descripcion: 'Lista de {titulo, parrafos:[texto]}', obligatorio: true },
  },
  permisos: ["crear_archivos"],
  riesgo: "bajo",
  requiere_confirmacion: false,
  estado: () => ({ conectada: true, detalle: "docx local" }),
  ejecutar: async (args) => {
    const secciones = ensureArray<any>(args.secciones ?? args.sections).slice(0, 50);
    const children: Paragraph[] = [
      new Paragraph({ text: asText(args.titulo), heading: HeadingLevel.TITLE }),
      new Paragraph({ children: [new TextRun({ text: new Date().toLocaleString("es-ES"), italics: true, size: 18 })] }),
    ];
    for (const seccion of secciones) {
      if (seccion?.titulo) children.push(new Paragraph({ text: asText(seccion.titulo), heading: HeadingLevel.HEADING_1 }));
      for (const parrafo of ensureArray<any>(seccion?.parrafos ?? seccion?.paragraphs ?? seccion?.contenido)) {
        children.push(new Paragraph({ text: asText(parrafo), spacing: { after: 160 } }));
      }
    }
    const doc = new Document({ sections: [{ properties: {}, children }] });
    const buffer = await Packer.toBuffer(doc);
    const artifact = await saveArtifact({
      name: `${asText(args.nombre) || "documento"}.docx`,
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer,
      tool: "crear_word",
    });
    return { ok: true, resumen: `Documento Word creado: ${artifact.name}`, artefactos: [artifact] };
  },
};

const crearPdf: ToolDef = {
  nombre: "crear_pdf",
  descripcion: "Genera un PDF con portada y secciones de texto.",
  parametros: {
    nombre: { tipo: "texto", descripcion: "Nombre del archivo", obligatorio: true },
    titulo: { tipo: "texto", descripcion: "Título", obligatorio: true },
    secciones: { tipo: "lista", descripcion: 'Lista de {titulo, parrafos:[texto]}', obligatorio: true },
  },
  permisos: ["crear_archivos"],
  riesgo: "bajo",
  requiere_confirmacion: false,
  estado: () => ({ conectada: true, detalle: "PDFKit local" }),
  ejecutar: async (args) => {
    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: "A4", margin: 56, info: { Title: asText(args.titulo), Author: "JARVIS" } });
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      doc.fillColor("#0B1020").fontSize(26).text(asText(args.titulo));
      doc.moveDown(0.3);
      doc.fillColor("#5C6B8A").fontSize(10).text(new Date().toLocaleString("es-ES"));
      doc.moveDown(1.2);
      doc.fillColor("#1A1A1A");
      for (const seccion of ensureArray<any>(args.secciones ?? args.sections).slice(0, 50)) {
        if (seccion?.titulo ?? seccion?.title) {
          doc.fontSize(16).fillColor("#0B1020").text(asText(seccion.titulo ?? seccion.title));
          doc.moveDown(0.35);
        }
        doc.fontSize(11).fillColor("#333333");
        for (const parrafo of ensureArray<any>(seccion?.parrafos ?? seccion?.paragraphs ?? seccion?.contenido)) {
          doc.text(asText(parrafo), { align: "justify" });
          doc.moveDown(0.5);
        }
        doc.moveDown(0.6);
      }
      doc.end();
    });

    const artifact = await saveArtifact({
      name: `${asText(args.nombre) || "documento"}.pdf`,
      mime: "application/pdf",
      buffer,
      tool: "crear_pdf",
    });
    return { ok: true, resumen: `PDF generado: ${artifact.name}`, artefactos: [artifact] };
  },
};

const crearDiagrama: ToolDef = {
  nombre: "crear_diagrama",
  descripcion: "Crea un diagrama Mermaid (.mmd) listo para renderizar.",
  parametros: {
    nombre: { tipo: "texto", descripcion: "Nombre del archivo", obligatorio: true },
    codigo: { tipo: "texto", descripcion: "Código Mermaid (graph TD, sequenceDiagram, …)", obligatorio: true },
  },
  permisos: ["crear_archivos"],
  riesgo: "bajo",
  requiere_confirmacion: false,
  estado: () => ({ conectada: true, detalle: "Mermaid (fuente .mmd)" }),
  ejecutar: async (args) => {
    const code = asText(args.codigo).trim();
    if (!/^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|mindmap|timeline|journey)/m.test(code)) {
      throw new Error("El código no parece un diagrama Mermaid válido");
    }
    const artifact = await saveArtifact({
      name: `${asText(args.nombre) || "diagrama"}.mmd`,
      mime: "text/plain",
      buffer: Buffer.from(code, "utf8"),
      tool: "crear_diagrama",
    });
    return {
      ok: true,
      resumen: `Diagrama Mermaid creado: ${artifact.name} (puedes abrirlo en mermaid.live)`,
      artefactos: [artifact],
    };
  },
};

export function registerDocumentTools() {
  for (const tool of [crearPresentacion, crearExcel, crearWord, crearPdf, crearDiagrama]) registerTool(tool);
}
