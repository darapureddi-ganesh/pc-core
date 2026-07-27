"use client";

import { useState } from "react";
import { bindPolicy, issuePolicy, quotePolicy } from "./actions";
import type { Policy, QuoteResult } from "./types";

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
  ["odNet", "OD net"],
  ["tp", "Third-party"],
  ["pa", "Personal accident"],
  ["premium", "Premium"],
  ["gst", "GST 18%"],
];

const inr = (n: number) =>
  "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2 });

export default function Page() {
  const [cc, setCc] = useState(1200);
  const [idv, setIdv] = useState(600000);
  const [zone, setZone] = useState("A");
  const [age, setAge] = useState(2);
  const [ncb, setNcb] = useState(25);
  const [addOns, setAddOns] = useState<string[]>(["ZERO_DEP"]);

  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
        vehicle: { cc, idv, rtoZone: zone, age },
        policy: { ncb },
        selectedAddOns: addOns,
        coverages: { tpSelected: true },
      });
      setQuote(result);
      setPolicy(null);
    });
  };

  const onBind = () =>
    quote && run(async () => setPolicy(await bindPolicy(quote.policyId)));
  const onIssue = () =>
    quote && run(async () => setPolicy(await issuePolicy(quote.policyId)));

  return (
    <main className="wrap">
      {/* ── Risk form ─────────────────────────────────────────── */}
      <form className="card" onSubmit={onQuote}>
        <span className="eyebrow">Risk</span>
        <h2>Private car details</h2>

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
                  const shown = key === "ncbDisc" ? -v : v;
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
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
