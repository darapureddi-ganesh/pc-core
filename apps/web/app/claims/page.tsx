"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { assignClaim, classifyClaim, getQueueStatus } from "../actions";
import type { QueueStatus } from "../types";
import { STEP_LABEL, timeLeft, when } from "./format";

export default function ClaimsQueuePage() {
  const [status, setStatus] = useState<QueueStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setStatus(await getQueueStatus());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    run(async () => {});
  }, []);

  // Classification is a precondition for assignment, so do both in one click.
  const autoAssign = (claimId: string, classified: boolean) =>
    run(async () => {
      if (!classified) await classifyClaim(claimId);
      await assignClaim(claimId);
    });

  const names = new Map(status?.handlerWorkloads.map((h) => [h.handlerId, h.name]));

  return (
    <main className="wrap" style={{ gridTemplateColumns: "1fr" }}>
      <section className="card">
        <span className="eyebrow">Ops dashboard</span>
        <h2>Claims queue</h2>
        <p className="note">
          Open claims, soonest IRDAI deadline first: surveyor within 24 hours of intimation, survey
          report within 15 days, settlement within 7 days of the report.
        </p>

        {error && <div className="error">{error}</div>}

        {status && (
          <>
            <div className="queue-summary">
              <div className={`stat${status.irdaiOverdue > 0 ? " crit" : ""}`}>
                <div className="n">{status.irdaiOverdue}</div>
                <div className="lbl">Past IRDAI deadline</div>
              </div>
              <div className="stat">
                <div className="n">{status.totalPending}</div>
                <div className="lbl">Unassigned</div>
              </div>
              <div className="stat">
                <div className="n">{status.totalAssigned}</div>
                <div className="lbl">Assigned</div>
              </div>
              <div className={`stat${status.slaBreachAlerts > 0 ? " crit" : ""}`}>
                <div className="n">{status.slaBreachAlerts}</div>
                <div className="lbl">Past 30-day TAT</div>
              </div>
            </div>

            <h2>Open claims</h2>
            {status.openClaims.length === 0 ? (
              <div className="placeholder">No open claims. File one from Quote &amp; issue.</div>
            ) : (
              <div className="table-scroll">
                <table className="queue-table">
                  <thead>
                    <tr>
                      <th>Claim</th>
                      <th>Cause</th>
                      <th>Next step</th>
                      <th>Deadline</th>
                      <th>Priority</th>
                      <th>Handler</th>
                    </tr>
                  </thead>
                  <tbody>
                    {status.openClaims.map((c) => (
                      <tr key={c.claimId} className={c.irdai?.overdue ? "overdue" : undefined}>
                        <td>
                          <Link href={`/claims/${c.claimId}`} className="mono-link">
                            {c.claimId.slice(0, 8)}
                          </Link>
                          <div className="sub">{c.policyNumber ?? c.policyId.slice(0, 8)}</div>
                        </td>
                        <td>{c.cause}</td>
                        <td>{c.irdai ? STEP_LABEL[c.irdai.step] : <span className="sub">{c.stage ?? "Not tracked"}</span>}</td>
                        <td>
                          {c.irdai ? (
                            <>
                              <span className={c.irdai.overdue ? "pill sla-breached" : undefined}>
                                {timeLeft(c.irdai.dueAt)}
                              </span>
                              <div className="sub">{when(c.irdai.dueAt)}</div>
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>
                          {c.priority ? (
                            <span className={`pill priority-${c.priority.toLowerCase()}`}>{c.priority}</span>
                          ) : (
                            <span className="sub">not classified</span>
                          )}
                        </td>
                        <td>
                          {c.assignedHandlerId ? (
                            names.get(c.assignedHandlerId) ?? c.assignedHandlerId
                          ) : (
                            <button className="secondary" disabled={busy} onClick={() => autoAssign(c.claimId, !!c.claimType)}>
                              Auto-assign
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
                        <div className="fill" style={{ width: `${Math.min(100, h.utilizationRatio * 100)}%` }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <div className="actionbtns">
          <button className="secondary" onClick={() => run(async () => {})} disabled={busy}>
            {busy ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </section>
    </main>
  );
}
