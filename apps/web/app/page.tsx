"use client";

import { useState } from "react";
import {
  assignClaim,
  bindPolicy,
  classifyClaim,
  fileClaim,
  getBillingStatement,
  issuePolicy,
  payOutstanding,
  quotePolicy,
} from "./actions";
import { API_PUBLIC_BASE } from "./config";
import type {
  AssignResult,
  BillingStatement,
  Claim,
  Policy,
  QuoteResult,
} from "./types";

const ADDONS: Array<{ code: string; label: string }> = [
  { code: "ZERO_DEP", label: "Zero Dep" },
  { code: "ENGINE_PROT", label: "Engine Protect" },
  { code: "RSA", label: "Roadside" },
];

const NCB_STEPS = [0, 20, 25, 35, 45, 50];

const BREAKDOWN_ROWS: Array<[string, string]> = [
  ["odBase", "OD base"],
  ["odAddOns", "Add-ons"],
  ["odGross", "OD gross"],
  ["ncbDisc", "NCB discount"],
  ["loading", "Loading"],
  ["volDedDisc", "Deductible discount"],
  ["odNet", "OD net"],
  ["tp", "Third-party"],
  ["pa", "Personal accident"],
  ["premium", "Premium"],
  ["gst", "GST 18%"],
];

const inr = (n: number) =>
  "₹" + (n === 0 ? 0 : n).toLocaleString("en-IN", { minimumFractionDigits: 2 });

export default function Page() {
  const [insuredName, setInsuredName] = useState("A. Sharma");
  const [registrationNo, setRegistrationNo] = useState("KA01AB1234");
  const [make, setMake] = useState("Maruti");
  const [model, setModel] = useState("Swift");
  const [cc, setCc] = useState(1200);
  const [idv, setIdv] = useState(600000);
  const [zone, setZone] = useState("A");
  const [age, setAge] = useState(2);
  const [ncb, setNcb] = useState(25);
  const [addOns, setAddOns] = useState<string[]>(["ZERO_DEP"]);
  const [newVehicle, setNewVehicle] = useState(false);

  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [billing, setBilling] = useState<BillingStatement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [incidentDate, setIncidentDate] = useState("2026-03-01");
  const [cause, setCause] = useState("collision, minor front-end damage");
  const [rawIntakeText, setRawIntakeText] = useState(
    `Vehicle ${registrationNo} hit on 2026-03-01, repair estimate ₹45,000.`,
  );
  const [claim, setClaim] = useState<Claim | null>(null);
  const [ruleApplied, setRuleApplied] = useState<string | null>(null);
  const [assignResult, setAssignResult] = useState<AssignResult | null>(null);

  const phase: "idle" | "quoted" | "bound" | "issued" =
    policy?.status === "ISSUED"
      ? "issued"
      : policy?.status === "BOUND"
        ? "bound"
        : quote
          ? "quoted"
          : "idle";

  const toggleAddOn = (code: string) =>
    setAddOns((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onQuote = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const result = await quotePolicy({
        insured: { name: insuredName },
        risk: {
          vehicle: { cc, idv, rtoZone: zone, age, registrationNo, make, model },
          policy: { ncb },
          selectedAddOns: addOns,
          coverages: { tpSelected: true },
          newVehicle,
        },
      });
      setQuote(result);
      setPolicy(null);
      setBilling(null);
      setClaim(null);
      setRuleApplied(null);
      setAssignResult(null);
    });
  };

  const onBind = () =>
    quote && run(async () => setPolicy(await bindPolicy(quote.policyId)));

  const onIssue = () =>
    quote &&
    run(async () => {
      const issued = await issuePolicy(quote.policyId);
      setPolicy(issued);
      setBilling(await getBillingStatement(quote.policyId));
    });

  const onPayInFull = () =>
    quote &&
    billing &&
    run(async () => {
      setBilling(await payOutstanding(quote.policyId, billing.outstanding));
    });

  const onFileClaim = (e: React.FormEvent) => {
    e.preventDefault();
    quote &&
      run(async () => {
        setClaim(
          await fileClaim(quote.policyId, {
            incidentDate,
            cause,
            rawIntakeText: rawIntakeText || undefined,
          }),
        );
        setRuleApplied(null);
        setAssignResult(null);
      });
  };

  const onClassify = () =>
    claim &&
    run(async () => {
      const result = await classifyClaim(claim.claimId);
      setClaim(result.claim);
      setRuleApplied(result.ruleApplied);
    });

  const onAssign = () =>
    claim &&
    run(async () => {
      const result = await assignClaim(claim.claimId);
      setClaim(result.claim);
      setAssignResult(result);
    });

  return (
    <main className="wrap">
      {/* ── Risk form ─────────────────────────────────────────── */}
      <form className="card" onSubmit={onQuote}>
        <span className="eyebrow">Risk</span>
        <h2>Private car details</h2>

        <div className="row">
          <div className="field">
            <label htmlFor="insuredName">Insured name</label>
            <input
              id="insuredName"
              type="text"
              value={insuredName}
              onChange={(e) => setInsuredName(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="registrationNo">Registration no.</label>
            <input
              id="registrationNo"
              type="text"
              value={registrationNo}
              onChange={(e) => setRegistrationNo(e.target.value)}
            />
          </div>
        </div>

        <div className="row">
          <div className="field">
            <label htmlFor="make">Make</label>
            <input
              id="make"
              type="text"
              value={make}
              onChange={(e) => setMake(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="model">Model</label>
            <input
              id="model"
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
          </div>
        </div>

        <div className="row">
          <div className="field">
            <label htmlFor="cc">Engine (cc)</label>
            <input
              id="cc"
              type="number"
              value={cc}
              onChange={(e) => setCc(Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label htmlFor="age">Vehicle age (yrs)</label>
            <input
              id="age"
              type="number"
              value={age}
              onChange={(e) => setAge(Number(e.target.value))}
            />
          </div>
        </div>

        <div className="row">
          <div className="field">
            <label htmlFor="idv">IDV (₹)</label>
            <input
              id="idv"
              type="number"
              value={idv}
              onChange={(e) => setIdv(Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label htmlFor="zone">RTO zone</label>
            <select
              id="zone"
              value={zone}
              onChange={(e) => setZone(e.target.value)}
            >
              <option value="A">Zone A</option>
              <option value="B">Zone B</option>
            </select>
          </div>
        </div>

        <div className="field">
          <label htmlFor="ncb">No-claim bonus</label>
          <select
            id="ncb"
            value={ncb}
            onChange={(e) => setNcb(Number(e.target.value))}
          >
            {NCB_STEPS.map((v) => (
              <option key={v} value={v}>
                {v}%
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>
            <input
              type="checkbox"
              checked={newVehicle}
              onChange={(e) => setNewVehicle(e.target.checked)}
              style={{ marginRight: "0.4rem" }}
            />
            New vehicle (first registration) — prices TP as the mandatory
            3-year lump sum instead of annual
          </label>
        </div>

        <div className="field">
          <label>Add-ons</label>
          <div className="addons">
            {ADDONS.map((a) => (
              <span
                key={a.code}
                className={`chip${addOns.includes(a.code) ? " on" : ""}`}
                onClick={() => toggleAddOn(a.code)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && toggleAddOn(a.code)}
              >
                {a.label}
              </span>
            ))}
          </div>
        </div>

        <p className="note">
          Third-party liability and owner-driver PA are included &mdash; statutory
          under the Motor Vehicles Act.
        </p>

        <button className="primary" type="submit" disabled={busy}>
          {busy && phase === "idle" ? "Quoting…" : "Get quote"}
        </button>
      </form>

      {/* ── Outcome ──────────────────────────────────────────── */}
      <section className="card">
        <span className="eyebrow">Outcome</span>
        <div className="statusbar">
          <span className={`step${phase !== "idle" ? " done" : " active"}`}>
            Quote
          </span>
          <span className="sep">›</span>
          <span
            className={`step${
              phase === "bound" || phase === "issued"
                ? " done"
                : phase === "quoted"
                  ? " active"
                  : ""
            }`}
          >
            Bind
          </span>
          <span className="sep">›</span>
          <span
            className={`step${
              phase === "issued" ? " done" : phase === "bound" ? " active" : ""
            }`}
          >
            Issue
          </span>
        </div>

        {error && <div className="error">{error}</div>}

        {!quote && !error && (
          <div className="placeholder">
            Enter the risk and get a quote to begin.
          </div>
        )}

        {quote && (
          <>
            <table className="breakdown">
              <tbody>
                {BREAKDOWN_ROWS.map(([key, label]) => {
                  const v = quote.rating.breakdown[key];
                  if (v === undefined) return null;
                  const negative = key === "ncbDisc" || key === "volDedDisc";
                  const shown = negative ? -v : v;
                  return (
                    <tr key={key}>
                      <td className="lbl">{label}</td>
                      <td>{inr(shown)}</td>
                    </tr>
                  );
                })}
                <tr className="total">
                  <td>Total payable</td>
                  <td>{inr(quote.rating.total)}</td>
                </tr>
              </tbody>
            </table>

            {quote.rating.referrals.map((r) => (
              <div key={r.id} className="referral">
                ⚑ Referral &mdash; {r.message}
              </div>
            ))}
            {quote.rating.errors.map((er) => (
              <div key={er.id} className="error">
                {er.message}
              </div>
            ))}

            <div className="actionbtns">
              {phase === "quoted" && (
                <button className="primary" onClick={onBind} disabled={busy}>
                  {busy ? "Binding…" : "Bind cover"}
                </button>
              )}
              {phase === "bound" && (
                <button className="primary" onClick={onIssue} disabled={busy}>
                  {busy ? "Issuing…" : "Issue policy"}
                </button>
              )}
              {phase === "issued" && policy && (
                <div className="schedule">
                  <div className="pn">{policy.policyNumber}</div>
                  <div className="meta">
                    {policy.productCode} @ {policy.productVersion} &middot; cover{" "}
                    {policy.term.from} → {policy.term.to}
                  </div>
                  <div>
                    Policy issued. Total premium{" "}
                    <strong>{inr(quote.rating.total)}</strong>.
                  </div>

                  <div className="doclinks">
                    <a
                      href={`${API_PUBLIC_BASE}/policies/${policy.policyId}/documents/schedule`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Policy schedule ↗
                    </a>
                    <a
                      href={`${API_PUBLIC_BASE}/policies/${policy.policyId}/documents/certificate`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Certificate (Form 51) ↗
                    </a>
                  </div>

                  {billing && (
                    <div className="billing">
                      <div className="billing-row">
                        <span>Paid</span>
                        <span>{inr(billing.paid)}</span>
                      </div>
                      <div className="billing-row">
                        <span>Outstanding</span>
                        <span>{inr(billing.outstanding)}</span>
                      </div>
                      {billing.outstanding > 0 ? (
                        <button
                          className="primary"
                          onClick={onPayInFull}
                          disabled={busy}
                        >
                          {busy ? "Recording…" : "Pay in full"}
                        </button>
                      ) : (
                        <div className="paid-badge">✓ Paid in full</div>
                      )}
                    </div>
                  )}

                  <div className="claim-block">
                    {!claim ? (
                      <form onSubmit={onFileClaim}>
                        <div className="row">
                          <div className="field">
                            <label htmlFor="incidentDate">Incident date</label>
                            <input
                              id="incidentDate"
                              type="date"
                              value={incidentDate}
                              onChange={(e) => setIncidentDate(e.target.value)}
                            />
                          </div>
                          <div className="field">
                            <label htmlFor="cause">What happened</label>
                            <input
                              id="cause"
                              type="text"
                              value={cause}
                              onChange={(e) => setCause(e.target.value)}
                            />
                          </div>
                        </div>
                        <div className="field">
                          <label htmlFor="rawIntakeText">
                            Intake note (optional — IDP extracts fields, feeds fraud scoring)
                          </label>
                          <input
                            id="rawIntakeText"
                            type="text"
                            value={rawIntakeText}
                            onChange={(e) => setRawIntakeText(e.target.value)}
                          />
                        </div>
                        <button className="secondary" type="submit" disabled={busy}>
                          {busy ? "Filing…" : "File a claim (FNOL)"}
                        </button>
                      </form>
                    ) : (
                      <>
                        <span className="eyebrow">Claim {claim.claimId.slice(0, 8)}</span>
                        <div className="billing-row">
                          <span>Cause</span>
                          <span>{claim.cause}</span>
                        </div>
                        <div className="billing-row">
                          <span>Status</span>
                          <span>
                            {claim.priority && (
                              <span className={`pill priority-${claim.priority.toLowerCase()}`}>
                                {claim.priority}
                              </span>
                            )}{" "}
                            {claim.status}
                          </span>
                        </div>

                        {claim.claimType && (
                          <div className="trace">
                            <strong>{claim.claimType}</strong> &middot; {claim.complexity}{" "}
                            &middot; ~{claim.predictedHandlingDays}d handling &middot; SLA due{" "}
                            {claim.slaDeadline}
                            {claim.slaBreached && (
                              <span className="pill sla-breached"> SLA breached</span>
                            )}
                            {ruleApplied && <div>rule applied: {ruleApplied}</div>}
                          </div>
                        )}

                        {claim.fraudScore !== undefined && (
                          <div className="trace">
                            fraud risk:{" "}
                            <strong
                              className={claim.fraudScore > 0 ? "fraud-flag" : undefined}
                            >
                              {(claim.fraudScore * 100).toFixed(0)}%
                            </strong>
                            {claim.fraudSignals && claim.fraudSignals.length > 0 && (
                              <ul className="fraud-signals">
                                {claim.fraudSignals.map((s) => (
                                  <li key={s}>{s}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}

                        {claim.extractedFields &&
                          Object.keys(claim.extractedFields).length > 0 && (
                            <div className="trace">
                              extracted from intake note:
                              <ul className="fraud-signals">
                                {Object.entries(claim.extractedFields).map(([k, v]) => (
                                  <li key={k}>
                                    {k}: {v}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                        <div className="actionbtns">
                          {!claim.claimType && (
                            <button className="secondary" onClick={onClassify} disabled={busy}>
                              {busy ? "Classifying…" : "Classify claim"}
                            </button>
                          )}
                          {claim.claimType && !claim.assignedHandlerId && (
                            <button className="secondary" onClick={onAssign} disabled={busy}>
                              {busy ? "Assigning…" : "Auto-assign to a handler"}
                            </button>
                          )}
                        </div>

                        {assignResult && (
                          <table className="candidates">
                            <thead>
                              <tr>
                                <th>Handler</th>
                                <th>Score</th>
                                <th>Available</th>
                              </tr>
                            </thead>
                            <tbody>
                              {assignResult.candidates.map((c) => (
                                <tr
                                  key={c.handlerId}
                                  className={
                                    c.handlerId === assignResult.recommended.handlerId
                                      ? "picked"
                                      : !c.availability
                                        ? "unavailable"
                                        : ""
                                  }
                                >
                                  <td>{c.name}</td>
                                  <td>{c.score.toFixed(2)}</td>
                                  <td>{c.availability ? "yes" : "no"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
