import type { Db } from "./database";
import type { CheckResult } from "../monitor/checker";

export interface Service {
  id: number;
  name: string;
  url: string;
  interval_ms: number;
  timeout_ms: number;
  enabled: boolean;
  created_at: string;
}

const toService = (r: any): Service => ({ ...r, enabled: !!r.enabled });

export function createRepo(db: Db) {
  return {
    createService(v: { name: string; url: string; interval_ms: number; timeout_ms: number }): Service {
      const info = db
        .prepare("INSERT INTO services (name,url,interval_ms,timeout_ms) VALUES (@name,@url,@interval_ms,@timeout_ms)")
        .run(v);
      return this.getService(Number(info.lastInsertRowid))!;
    },
    listServices(): Service[] {
      return db.prepare("SELECT * FROM services ORDER BY id").all().map(toService);
    },
    getService(id: number): Service | undefined {
      const r = db.prepare("SELECT * FROM services WHERE id=?").get(id);
      return r ? toService(r) : undefined;
    },
    updateService(id: number, p: Partial<{ name: string; url: string; interval_ms: number; timeout_ms: number; enabled: boolean }>) {
      const cur = this.getService(id);
      if (!cur) return undefined;
      const m = { ...cur, ...p };
      db.prepare("UPDATE services SET name=@name,url=@url,interval_ms=@interval_ms,timeout_ms=@timeout_ms,enabled=@enabled WHERE id=@id")
        .run({ ...m, enabled: m.enabled ? 1 : 0 });
      return this.getService(id);
    },
    deleteService(id: number): boolean {
      return db.prepare("DELETE FROM services WHERE id=?").run(id).changes > 0;
    },
    insertCheck(serviceId: number, r: CheckResult) {
      db.prepare(
        "INSERT INTO health_checks (service_id,status,http_status,response_time_ms,error) VALUES (?,?,?,?,?)"
      ).run(serviceId, r.status, r.httpStatus, r.responseTimeMs, r.error);
    },
    recentChecks(serviceId: number, limit: number) {
      return db.prepare("SELECT * FROM health_checks WHERE service_id=? ORDER BY id DESC LIMIT ?").all(serviceId, limit);
    },
    consecutiveFailures(serviceId: number): number {
      const row: any = db
        .prepare(
          `SELECT COUNT(*) AS n FROM health_checks
           WHERE service_id=? AND status='down'
             AND id > COALESCE((SELECT MAX(id) FROM health_checks WHERE service_id=? AND status='up'), 0)`
        )
        .get(serviceId, serviceId);
      return row.n;
    },
    metrics(serviceId: number) {
      const row: any = db
        .prepare(
          `SELECT COUNT(*) AS total,
                  SUM(status='up') AS ok,
                  SUM(status='down') AS failed,
                  AVG(CASE WHEN status='up' THEN response_time_ms END) AS avg_ms
           FROM (SELECT * FROM health_checks WHERE service_id=? ORDER BY id DESC LIMIT 500)`
        )
        .get(serviceId);
      const last: any = db.prepare("SELECT * FROM health_checks WHERE service_id=? ORDER BY id DESC LIMIT 1").get(serviceId);
      const total = row.total as number;
      return {
        total_checks: total,
        successful_checks: row.ok ?? 0,
        failed_checks: row.failed ?? 0,
        uptime_percent: total ? Math.round(((row.ok ?? 0) / total) * 10000) / 100 : null,
        avg_response_ms: row.avg_ms == null ? null : Math.round(row.avg_ms),
        last_status: last?.status ?? null,
        last_http_status: last?.http_status ?? null,
        last_checked_at: last?.checked_at ?? null,
        consecutive_failures: this.consecutiveFailures(serviceId),
      };
    },
  };
}
export type Repo = ReturnType<typeof createRepo>;