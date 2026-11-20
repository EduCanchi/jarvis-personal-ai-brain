import { db, logEvent, now, uuid, Row } from "./db";
import { processDocument } from "./ingest";
import { redact } from "./secrets";

const globalForJobs = globalThis as unknown as {
  __paibJobs?: { running: boolean; cancelled: Set<string>; booted: boolean };
};

function state() {
  if (!globalForJobs.__paibJobs) {
    globalForJobs.__paibJobs = { running: false, cancelled: new Set(), booted: false };
  }
  return globalForJobs.__paibJobs;
}

function boot() {
  const s = state();
  if (s.booted) return;
  s.booted = true;
  db().prepare("UPDATE jobs SET status = 'en_cola', step = 'Reanudado tras reinicio' WHERE status = 'procesando'").run();
  db().prepare("UPDATE documents SET status = 'pendiente' WHERE status = 'procesando'").run();
}

export function enqueue(docId: string | null, type = "ingesta"): string {
  boot();
  const existing = db()
    .prepare("SELECT id FROM jobs WHERE doc_id = ? AND status IN ('en_cola','procesando') LIMIT 1")
    .get(docId) as Row | undefined;
  if (existing) return existing.id;
  const id = uuid();
  const ts = now();
  db()
    .prepare("INSERT INTO jobs(id, doc_id, type, status, progress, step, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?)")
    .run(id, docId, type, "en_cola", 0, "En cola", ts, ts);
  setImmediate(pump);
  return id;
}

export function cancelJob(jobId: string) {
  const s = state();
  s.cancelled.add(jobId);
  db().prepare("UPDATE jobs SET status = 'cancelado', step = 'Cancelado', updated_at = ? WHERE id = ? AND status IN ('en_cola','procesando')").run(
    now(),
    jobId,
  );
  const job = db().prepare("SELECT doc_id FROM jobs WHERE id = ?").get(jobId) as Row | undefined;
  if (job?.doc_id) {
    db().prepare("UPDATE documents SET status = 'cancelado' WHERE id = ? AND status = 'procesando'").run(job.doc_id);
  }
}

export function pump() {
  boot();
  const s = state();
  if (s.running) return;
  s.running = true;
  void (async () => {
    try {
      for (;;) {
        const job = db()
          .prepare("SELECT * FROM jobs WHERE status = 'en_cola' ORDER BY created_at LIMIT 1")
          .get() as Row | undefined;
        if (!job) break;
        await runJob(job.id);
      }
    } catch (err: any) {
      logEvent("error", "trabajos", `Bucle de trabajos detenido: ${redact(String(err?.message ?? err))}`);
    } finally {
      s.running = false;
    }
  })();
}

async function runJob(jobId: string) {
  const s = state();
  const job = db().prepare("SELECT * FROM jobs WHERE id = ?").get(jobId) as Row | undefined;
  if (!job) return;
  const ts = now();
  db().prepare("UPDATE jobs SET status = 'procesando', attempts = attempts + 1, updated_at = ?, step = 'Iniciando' WHERE id = ?").run(
    ts,
    jobId,
  );

  const report = (percent: number, step: string) => {
    db().prepare("UPDATE jobs SET progress = ?, step = ?, updated_at = ? WHERE id = ?").run(percent, step, now(), jobId);
  };
  const isCancelled = () => {
    if (s.cancelled.has(jobId)) return true;
    const row = db().prepare("SELECT status FROM jobs WHERE id = ?").get(jobId) as Row | undefined;
    return row?.status === "cancelado";
  };

  try {
    if (job.type === "ingesta" && job.doc_id) {
      await processDocument(job.doc_id, report, isCancelled);
      db().prepare("UPDATE jobs SET status = 'completado', progress = 100, step = 'Completado', updated_at = ? WHERE id = ?").run(
        now(),
        jobId,
      );
    } else {
      throw new Error(`Tipo de trabajo no soportado: ${job.type}`);
    }
  } catch (err: any) {
    const message = redact(String(err?.message ?? err));
    if (message.includes("__cancelado__") || isCancelled()) {
      db().prepare("UPDATE jobs SET status = 'cancelado', step = 'Cancelado', updated_at = ? WHERE id = ?").run(now(), jobId);
      if (job.doc_id) {
        db().prepare("UPDATE documents SET status = 'cancelado' WHERE id = ?").run(job.doc_id);
      }
    } else {
      db().prepare("UPDATE jobs SET status = 'error', error = ?, step = 'Error', updated_at = ? WHERE id = ?").run(
        message.slice(0, 1200),
        now(),
        jobId,
      );
      if (job.doc_id) {
        db().prepare("UPDATE documents SET status = 'error', error = ? WHERE id = ?").run(message.slice(0, 1200), job.doc_id);
      }
      logEvent("error", "trabajos", `Fallo procesando documento`, { job: jobId, error: message });
    }
  } finally {
    s.cancelled.delete(jobId);
  }
}
