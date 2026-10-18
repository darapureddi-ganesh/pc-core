"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  addPayment,
  addRecoveryStep,
  appointSurveyor,
  approvePayment,
  getClaim,
  getCoverage,
  listHandlers,
  openRecovery,
  recordSurveyReport,
  setReserve,
  settleClaim,
  settleRecovery,
} from "../../actions";
import type { Claim, ClaimPayment, CoverageView, Handler } from "../../types";
import { inr, when } from "../format";

const STAGES = ["INTIMATED", "SURVEY", "ASSESSMENT", "SETTLED"] as const;
const CHECK_CLASS = { PASS: "priority-low", CHECK: "priority-medium", FAIL: "priority-critical" };

/** Read a named field from the submitted form. */
const field = (e: FormEvent<HTMLFormElement>, name: string): string =>
  String(new FormData(e.currentTarget).get(name) ?? "").trim();
const num = (e: FormEvent<HTMLFormElement>, name: string): number => Number(field(e, name));

export default function ClaimPage() {
  const { id } = useParams<{ id: string }>();
  const [claim, setClaim] = useState<Claim | null>(null);
  const [coverage, setCoverage] = useState<CoverageView | null>(null);
  const [handlers, setHandlers] = useState<Handler[]>([]);
  const [actingAs, setActingAs] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([getClaim(id), getCoverage(id), listHandlers()])
      .then(([c, cov, hs]) => {
        setClaim(c);
        setCoverage(cov);
        setHandlers(hs);
        setActingAs(c.assignedHandlerId ?? hs[0]?.handlerId ?? "");
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [id]);

  const me = handlers.find((h) => h.handlerId === actingAs);
  const name = (handlerId?: string) => handlers.find((h) => h.handlerId === handlerId)?.name ?? handlerId;

  /** Run a mutation from a form or button; the API returns the updated claim. */
  const act = (fn: (e: FormEvent<HTMLFormElement>) => Promise<Claim>) => async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setError(null);
    try {
      setClaim(await fn(e));
      form.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (!claim) {
    return (
      <main className="wrap" style={{ gridTemplateColumns: "1fr" }}>
        <section className="card">{error ? <div className="error">{error}</div> : "Loading claim…"}</section>
      </main>
    );
  }

  const payments = claim.payments ?? [];
  const sumOf = (ps: ClaimPayment[]) => ps.reduce((s, p) => s + p.amount, 0);
  const paid = sumOf(payments.filter((p) => p.status === "RELEASED"));
  const awaiting = sumOf(payments.filter((p) => p.status === "AWAITING_APPROVAL"));
  const settled = claim.status === "SETTLED";
  const r = claim.recovery;
  const by = me?.name ?? "Unknown";

  return (
    <main className="wrap">
      <section className="card span-2">
        <span className="eyebrow">
          <Link href="/claims">Claims queue</Link> / Claim
        </span>
        <h2>
          {claim.claimId.slice(0, 8)} &middot; {claim.cause}
        </h2>
        <div className="trace">
          Policy <strong>{claim.policyNumber ?? claim.policyId.slice(0, 8)}</strong> &middot; incident{" "}
          {claim.incidentDate} &middot; sum insured <strong>{inr(claim.sumInsured)}</strong> &middot; handler{" "}
          <strong>{name(claim.assignedHandlerId) ?? "not assigned"}</strong>
        </div>
        <ol className="stages">
          {STAGES.map((s) => (
            <li key={s} className={s === claim.stage ? "active" : STAGES.indexOf(s) < STAGES.indexOf(claim.stage ?? "INTIMATED") ? "done" : undefined}>
              {s.charAt(0) + s.slice(1).toLowerCase()}
            </li>
          ))}
        </ol>
        <div className="field acting-as">
          <label htmlFor="acting-as">Acting as (demo: the portal has one shared login)</label>
          <select id="acting-as" value={actingAs} onChange={(e) => setActingAs(e.target.value)}>
            {handlers.map((h) => (
              <option key={h.handlerId} value={h.handlerId}>
                {h.name} · authority {inr(h.paymentAuthority ?? 0)}
              </option>
            ))}
          </select>
        </div>
        {error && <div className="error">{error}</div>}
      </section>

      {coverage && (
        <section className="card">
          <span className="eyebrow">As of {claim.incidentDate}</span>
          <h2>Coverage</h2>
          <ul className="checks">
            {coverage.checks.map((c) => (
              <li key={c.title}>
                <span className={`pill ${CHECK_CLASS[c.state]}`}>{c.state}</span>
                <div>
                  <strong>{c.title}</strong>
                  <div className="sub">{c.detail}</div>
                </div>
              </li>
            ))}
          </ul>
          <table className="breakdown">
            <tbody>
              <tr><td className="lbl">Insured</td><td>{coverage.policy.insured?.name ?? "—"}</td></tr>
              <tr><td className="lbl">Vehicle</td><td>{[coverage.vehicle.registrationNo, coverage.vehicle.make, coverage.vehicle.model].filter(Boolean).join(" · ") || "—"}</td></tr>
              <tr><td className="lbl">IDV</td><td>{coverage.vehicle.idv ? inr(coverage.vehicle.idv) : "—"}</td></tr>
              <tr><td className="lbl">Add-ons</td><td>{coverage.addOns.join(", ") || "None"}</td></tr>
              <tr><td className="lbl">NCB</td><td>{coverage.ncb}%</td></tr>
              <tr><td className="lbl">Term</td><td>{coverage.policy.term.from} to {coverage.policy.term.to}</td></tr>
            </tbody>
          </table>
        </section>
      )}

      <section className="card">
        <span className="eyebrow">IRDAI workflow</span>
        <h2>Survey &amp; settlement</h2>
        {claim.surveyor && (
          <div className="trace">
            Surveyor <strong>{claim.surveyor.name}</strong>, appointed {when(claim.surveyor.appointedAt)}
            {claim.surveyor.assessedAmount !== undefined && (
              <>
                {" "}&middot; assessed <strong>{inr(claim.surveyor.assessedAmount)}</strong>
              </>
            )}
          </div>
        )}
        {claim.stage === "INTIMATED" && (
          <form onSubmit={act((e) => appointSurveyor(id, field(e, "surveyor"), by))}>
            <div className="field">
              <label htmlFor="surveyor">Surveyor (IRDAI-licensed)</label>
              <input id="surveyor" name="surveyor" required placeholder="R. K. Survey & Assessors" />
            </div>
            <button className="primary" disabled={busy}>Appoint surveyor</button>
          </form>
        )}
        {claim.stage === "SURVEY" && (
          <form onSubmit={act((e) => recordSurveyReport(id, num(e, "assessed"), by))}>
            <div className="field">
              <label htmlFor="assessed">Assessed loss (₹)</label>
              <input id="assessed" name="assessed" type="number" min="0" required />
            </div>
            <button className="primary" disabled={busy}>Record survey report</button>
          </form>
        )}
        {claim.stage === "ASSESSMENT" && (
          <form onSubmit={act((e) => settleClaim(id, num(e, "settle")))}>
            <div className="field">
              <label htmlFor="settle">Settlement amount (₹)</label>
              <input id="settle" name="settle" type="number" min="1" required defaultValue={claim.surveyor?.assessedAmount} />
            </div>
            <button className="primary" disabled={busy}>Settle and close claim</button>
          </form>
        )}
        {settled && <div className="placeholder">Settled at {inr(claim.settledAmount)}.</div>}
        {!claim.stage && <div className="placeholder">Filed before stages were tracked; no IRDAI workflow.</div>}
      </section>

      <section className="card">
        <span className="eyebrow">Money out</span>
        <h2>Reserve &amp; payments</h2>
        <div className="queue-summary">
          <div className="stat"><div className="n">{inr(claim.reserveAmount)}</div><div className="lbl">Reserve</div></div>
          <div className="stat"><div className="n">{inr(paid)}</div><div className="lbl">Paid</div></div>
          <div className="stat"><div className="n">{inr(awaiting)}</div><div className="lbl">Awaiting approval</div></div>
          <div className="stat"><div className="n">{inr(claim.reserveAmount - paid - awaiting)}</div><div className="lbl">Outstanding</div></div>
        </div>
        {!settled && (
          <>
            <form className="inline-form" onSubmit={act((e) => setReserve(id, num(e, "reserve")))}>
              <div className="field">
                <label htmlFor="reserve">New reserve (₹)</label>
                <input id="reserve" name="reserve" type="number" min="0" required />
              </div>
              <button className="secondary" disabled={busy}>Set reserve</button>
            </form>
            <form
              onSubmit={act((e) =>
                addPayment(id, {
                  payee: field(e, "payee"),
                  payeeType: field(e, "payeeType") as ClaimPayment["payeeType"],
                  mode: field(e, "mode") as ClaimPayment["mode"],
                  account: field(e, "account"),
                  ifsc: field(e, "ifsc") || undefined,
                  amount: num(e, "amount"),
                  requestedBy: actingAs,
                }),
              )}
            >
              <div className="row">
                <div className="field"><label htmlFor="payee">Payee</label><input id="payee" name="payee" required /></div>
                <div className="field">
                  <label htmlFor="payeeType">Payee type</label>
                  <select id="payeeType" name="payeeType">
                    <option value="GARAGE">Garage</option><option value="INSURED">Insured</option>
                    <option value="SURVEYOR">Surveyor</option><option value="CLAIMANT">Third-party claimant</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="mode">Mode</label>
                  <select id="mode" name="mode"><option>NEFT</option><option>IMPS</option><option>UPI</option></select>
                </div>
                <div className="field"><label htmlFor="amount">Amount (₹)</label><input id="amount" name="amount" type="number" min="1" required /></div>
                <div className="field"><label htmlFor="account">Account no. or UPI ID</label><input id="account" name="account" required autoComplete="off" /></div>
                <div className="field"><label htmlFor="ifsc">IFSC (not for UPI)</label><input id="ifsc" name="ifsc" maxLength={11} placeholder="HDFC0001234" /></div>
              </div>
              <p className="note">
                {me?.name ?? "You"} can release up to {inr(me?.paymentAuthority ?? 0)}. Larger payments wait for another
                handler with enough authority.
              </p>
              <button className="primary" disabled={busy}>Submit payment</button>
            </form>
          </>
        )}
        {payments.length > 0 && (
          <table className="queue-table" style={{ marginTop: "1rem" }}>
            <thead><tr><th>Payee</th><th>Amount</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.paymentId}>
                  <td>{p.payee}<div className="sub">{p.mode} · {p.destination}</div></td>
                  <td>{inr(p.amount)}</td>
                  <td>
                    <span className={`pill ${p.status === "RELEASED" ? "priority-low" : "priority-medium"}`}>
                      {p.status === "RELEASED" ? "Released" : "Awaiting approval"}
                    </span>
                    <div className="sub">by {name(p.requestedBy)}{p.approvedBy && `, approved by ${name(p.approvedBy)}`}</div>
                  </td>
                  <td>
                    {p.status === "AWAITING_APPROVAL" && (
                      <form onSubmit={act(() => approvePayment(id, p.paymentId, actingAs))}>
                        <button className="secondary" disabled={busy}>Approve as {me?.name ?? "…"}</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <span className="eyebrow">Money back</span>
        <h2>Recovery</h2>
        {!r ? (
          <form
            onSubmit={act((e) =>
              openRecovery(id, {
                against: field(e, "against"),
                theirInsurer: field(e, "theirInsurer") || undefined,
                targetMin: num(e, "min"),
                targetMax: num(e, "max"),
                by,
              }),
            )}
          >
            <p className="note">Open one when another party caused the loss, or the salvage can be sold.</p>
            <div className="field"><label htmlFor="against">Recover from</label><input id="against" name="against" required placeholder="At-fault vehicle or salvage buyer" /></div>
            <div className="field"><label htmlFor="theirInsurer">Their insurer</label><input id="theirInsurer" name="theirInsurer" /></div>
            <div className="row">
              <div className="field"><label htmlFor="min">Target from (₹)</label><input id="min" name="min" type="number" min="0" required /></div>
              <div className="field"><label htmlFor="max">Target to (₹)</label><input id="max" name="max" type="number" min="0" required /></div>
            </div>
            <button className="primary" disabled={busy}>Open recovery</button>
          </form>
        ) : (
          <>
            <table className="breakdown">
              <tbody>
                <tr><td className="lbl">Against</td><td>{r.against}</td></tr>
                <tr><td className="lbl">Their insurer</td><td>{r.theirInsurer ?? "—"}</td></tr>
                <tr><td className="lbl">Target</td><td>{inr(r.targetMin)} to {inr(r.targetMax)}</td></tr>
                {r.settledAmount !== undefined && (
                  <tr><td className="lbl">Recovered</td><td><strong>{inr(r.settledAmount)}</strong> on {r.settledOn}</td></tr>
                )}
              </tbody>
            </table>
            {r.settledAmount === undefined && (
              <>
                <form className="inline-form" onSubmit={act((e) => addRecoveryStep(id, { step: field(e, "step"), amount: field(e, "stepAmount") ? num(e, "stepAmount") : undefined, note: field(e, "note") || undefined, by }))}>
                  <div className="field">
                    <label htmlFor="step">Step</label>
                    <select id="step" name="step">
                      <option>Recovery demand letter</option><option>Counter-offer received</option>
                      <option>Counter-offer sent</option><option>Inter-company meeting</option><option>Referred to Lok Adalat</option>
                    </select>
                  </div>
                  <div className="field"><label htmlFor="stepAmount">Amount (₹)</label><input id="stepAmount" name="stepAmount" type="number" min="0" /></div>
                  <div className="field"><label htmlFor="note">Note</label><input id="note" name="note" /></div>
                  <button className="secondary" disabled={busy}>Add step</button>
                </form>
                <form className="inline-form" onSubmit={act((e) => settleRecovery(id, num(e, "recovered"), new Date().toISOString().slice(0, 10), by))}>
                  <div className="field"><label htmlFor="recovered">Agreed amount (₹)</label><input id="recovered" name="recovered" type="number" min="1" required /></div>
                  <button className="primary" disabled={busy}>Record final settlement</button>
                </form>
              </>
            )}
            {r.steps.length > 0 && (
              <ul className="checks">
                {[...r.steps].reverse().map((s) => (
                  <li key={s.at + s.step}>
                    <span className="sub">{when(s.at)}</span>
                    <div>{s.step}{s.amount !== undefined && ` · ${inr(s.amount)}`}{s.note && <div className="sub">{s.note}</div>}</div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      <section className="card">
        <span className="eyebrow">Audit trail</span>
        <h2>Activity</h2>
        <ul className="checks">
          {(claim.activity ?? []).map((a) => (
            <li key={a.at + a.text}>
              <span className="sub">{when(a.at)}</span>
              <div>{a.text}<div className="sub">{a.by}</div></div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
