import type { Db } from "./database";

export type IncidentStatus = "open" | "recovering" | "escalated" | "resolved";
export interface Incident {
  id: number;
  service_id: number;
  severity: "warning" | "critical";
  status: IncidentStatus;
  opened_at: string;
  resolved_at: string | null;
  recovery_attempts: number;
  last_attempt_ms: number | null;
}
export type LogLevel = "debug" | "info" | "warn" | "error";
const INCIDENT_FIELDS = ["severity", "status", "recovery_attempts", "last_attempt_ms"] as const;

export function createHealingRepo(db: Db) {
  return {
    openIncident(serviceId: number): Incident {
      const info = db.prepare("INSERT INTO incidents (service_id,severity,status) VALUES (?, 'warning', 'open')").run(serviceId);
      return this.getIncident(Number(info.lastInsertRowid))!;
    },
    getIncident(id: number): Incident | undefined {
      return db.prepare("SELECT * FROM incidents WHERE id=?").get(id) as Incident | undefined;
    },
    activeIncident(serviceId: number): Incident | undefined {
      return db
        .prepare("SELECT * FROM incidents WHERE service_id=? AND status != 'resolved' ORDER BY id DESC LIMIT 1")
        .get(serviceId) as Incident | undefined;
    },
    updateIncident(id: number, p: Partial<Pick<Incident, (typeof INCIDENT_FIELDS)[number]>>) {
      const keys = INCIDENT_FIELDS.filter((k) => p[k] !== undefined);
      if (!keys.length) return;
      const set = keys.map((k) => `${k}=@${k}`).join(",");
      db.prepare(`UPDATE incidents SET ${set} WHERE id=@id`).run({ ...p, id });
    },
    resolveIncident(id: number) {
      db.prepare("UPDATE incidents SET status='resolved', resolved_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(id);
    },
    listIncidents(f: { status?: IncidentStatus; serviceId?: number; limit?: number }) {
      const where: string[] = [];
      const args: unknown[] = [];
      if (f.status) { where.push("i.status=?"); args.push(f.status); }
      if (f.serviceId) { where.push("i.service_id=?"); args.push(f.serviceId); }
      args.push(Math.min(Math.max(f.limit ?? 50, 1), 500));
      return db
        .prepare(
          `SELECT i.*, s.name AS service_name FROM incidents i JOIN services s ON s.id=i.service_id
           ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY i.id DESC LIMIT ?`
        )
        .all(...args);
    },
    addAttempt(a: { incidentId: number; serviceId: number; attemptNo: number; action: string; startedMs: number }): number {
      const info = db
        .prepare("INSERT INTO recovery_attempts (incident_id,service_id,attempt_no,action,started_ms) VALUES (?,?,?,?,?)")
        .run(a.incidentId, a.serviceId, a.attemptNo, a.action, a.startedMs);
      return Number(info.lastInsertRowid);
    },
    finishAttempt(id: number, outcome: "success" | "failed", detail: string) {
      db.prepare("UPDATE recovery_attempts SET outcome=?, detail=?, finished_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(outcome, detail, id);
    },
    attemptsFor(incidentId: number) {
      return db.prepare("SELECT * FROM recovery_attempts WHERE incident_id=? ORDER BY id").all(incidentId);
    },
    countAttemptsSince(serviceId: number, sinceMs: number): number {
      const r: any = db.prepare("SELECT COUNT(*) AS n FROM recovery_attempts WHERE service_id=? AND started_ms>=?").get(serviceId, sinceMs);
      return r.n;
    },
    totalAttempts(serviceId: number): number {
      const r: any = db.prepare("SELECT COUNT(*) AS n FROM recovery_attempts WHERE service_id=?").get(serviceId);
      return r.n;
    },
    lastAttempt(serviceId: number): any {
      return db.prepare("SELECT * FROM recovery_attempts WHERE service_id=? ORDER BY id DESC LIMIT 1").get(serviceId);
    },
    addLog(level: LogLevel, source: string, message: string, serviceId?: number, incidentId?: number) {
      db.prepare("INSERT INTO logs (level,source,message,service_id,incident_id) VALUES (?,?,?,?,?)").run(level, source, message, serviceId ?? null, incidentId ?? null);
    },
    listLogs(f: { level?: LogLevel; q?: string; serviceId?: number; incidentId?: number; limit?: number }) {
      const where: string[] = [];
      const args: unknown[] = [];
      if (f.level) { where.push("level=?"); args.push(f.level); }
      if (f.serviceId) { where.push("service_id=?"); args.push(f.serviceId); }
      if (f.incidentId) { where.push("incident_id=?"); args.push(f.incidentId); }
      if (f.q) { where.push("message LIKE ? ESCAPE '\\'"); args.push(`%${f.q.replace(/[\\%_]/g, "\\$&")}%`); }
      args.push(Math.min(Math.max(f.limit ?? 100, 1), 1000));
      const order = f.incidentId ? "ASC" : "DESC";
      return db.prepare(`SELECT * FROM logs ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY id ${order} LIMIT ?`).all(...args);
    },
    setRecoveryTarget(serviceId: number, target: string | null) {
      db.prepare("UPDATE services SET recovery_target=? WHERE id=?").run(target, serviceId);
    },
  };
}
export type HealingRepo = ReturnType<typeof createHealingRepo>;