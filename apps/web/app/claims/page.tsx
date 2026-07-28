"use client";

import { useEffect, useState } from "react";
import { getQueueStatus } from "../actions";
import type { QueueStatus } from "../types";

export default function ClaimsQueuePage() {
  const [status, setStatus] = useState<QueueStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setBusy(true);
    setError(null);
    try {
      setStatus(await getQueueStatus());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <main className="wrap" style={{ gridTemplateColumns: "1fr" }}>
      <section className="card">
        <span className="eyebrow">Ops dashboard</span>
        <h2>Claims queue</h2>

        {error && <div className="error">{error}</div>}

        {status && (
          <>
            <div className="queue-summary">
              <div className="stat">
                <div className="n">{status.totalPending}</div>
                <div className="lbl">Pending</div>
              </div>
              <div className="stat">
                <div className="n">{status.totalAssigned}</div>
                <div className="lbl">Assigned</div>
              </div>
              <div className={`stat${status.slaBreachAlerts > 0 ? " crit" : ""}`}>
                <div className="n">{status.slaBreachAlerts}</div>
                <div className="lbl">SLA breaches</div>
              </div>
              <div className="stat">
                <div className="n">{(status.avgSlaRisk * 100).toFixed(0)}%</div>
                <div className="lbl">Avg SLA risk</div>
              </div>
            </div>

            <h2>Pending claims</h2>
            {status.pendingClaims.length === 0 ? (
              <div className="placeholder">No unassigned claims in the queue.</div>
            ) : (
              <table className="queue-table">
                <thead>
                  <tr>
                    <th>Claim</th>
                    <th>Policy</th>
                    <th>Type</th>
                    <th>Priority</th>
                    <th>SLA deadline</th>
                  </tr>
                </thead>
                <tbody>
                  {status.pendingClaims.map((c) => (
                    <tr key={c.claimId}>
                      <td>{c.claimId.slice(0, 8)}</td>
                      <td>{c.policyNumber ?? c.policyId.slice(0, 8)}</td>
                      <td>{c.claimType ?? "—"}</td>
                      <td>
                        {c.priority ? (
                          <span className={`pill priority-${c.priority.toLowerCase()}`}>
                            {c.priority}
                          </span>
                        ) : (
                          "not classified"
                        )}
                      </td>
                      <td>
                        {c.slaDeadline ?? "—"}
                        {c.slaBreached && <span className="pill sla-breached"> breached</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <h2 style={{ marginTop: "1.4rem" }}>Handler workload</h2>
            <table className="queue-table">
              <thead>
                <tr>
                  <th>Handler</th>
                  <th>Workload</th>
                  <th>Utilization</th>
                </tr>
              </thead>
              <tbody>
                {status.handlerWorkloads.map((h) => (
                  <tr key={h.handlerId}>
                    <td>{h.name}</td>
                    <td>
                      {h.currentWorkload} / {h.maxCapacity}
                    </td>
                    <td>
                      <div className="workload-bar">
                        <div
                          className="fill"
                          style={{ width: `${Math.min(100, h.utilizationRatio * 100)}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <div className="actionbtns">
          <button className="secondary" onClick={refresh} disabled={busy}>
            {busy ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </section>
    </main>
  );
}
