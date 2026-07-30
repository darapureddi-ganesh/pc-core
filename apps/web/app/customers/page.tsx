"use client";

import { useEffect, useState, useTransition } from "react";
import {
  getCustomerHistory,
  getCustomers,
  registerCustomer,
} from "../customer-actions";
import type { Customer, CustomerHistory } from "../types";

export default function CustomersPage() {
  const [name, setName] = useState("A. Sharma");
  const [email, setEmail] = useState("a.sharma@example.com");
  const [phone, setPhone] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selected, setSelected] = useState<CustomerHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const refresh = () => getCustomers().then(setCustomers);

  useEffect(() => {
    refresh();
  }, []);

  const onRegister = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await registerCustomer({ name, email: email || undefined, phone: phone || undefined });
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  };

  const onSelect = (customerId: string) =>
    startTransition(async () => {
      setError(null);
      try {
        setSelected(await getCustomerHistory(customerId));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });

  return (
    <main className="wrap">
      <section className="card">
        <span className="eyebrow">Customer identity</span>
        <h2>Register a customer</h2>
        <p className="note">
          Links a person's policies together across renewals and multiple
          vehicles, and their claims across every one of those policies —
          the "Customer" system-of-record entity, and the prerequisite for a
          future customer-facing portal. Paste the resulting Customer ID into
          the quote form's "Customer ID" field to link a new policy to them.
        </p>

        <form onSubmit={onRegister}>
          <div className="row">
            <div className="field">
              <label htmlFor="custName">Name</label>
              <input id="custName" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="custEmail">Email (optional)</label>
              <input id="custEmail" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="custPhone">Phone (optional)</label>
            <input id="custPhone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <button className="secondary" type="submit" disabled={pending}>
            {pending ? "Registering…" : "Register customer"}
          </button>
        </form>

        {error && <div className="error">{error}</div>}
      </section>

      <section className="card">
        <span className="eyebrow">Registered customers</span>
        <h2>Directory</h2>
        {customers.length === 0 ? (
          <div className="placeholder">No customers registered yet.</div>
        ) : (
          <table className="queue-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Contact</th>
                <th>Customer ID</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.customerId}>
                  <td>{c.name}</td>
                  <td>{c.email ?? c.phone ?? "—"}</td>
                  <td>
                    <code>{c.customerId.slice(0, 8)}</code>
                  </td>
                  <td>
                    <button className="secondary" onClick={() => onSelect(c.customerId)}>
                      View history
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {selected && (
          <div className="claim-block">
            <span className="eyebrow">History for {selected.customer.name}</span>

            <h2 style={{ fontSize: "0.95rem", marginTop: "0.6rem" }}>
              Policies ({selected.policies.length})
            </h2>
            {selected.policies.length === 0 ? (
              <div className="placeholder">No policies yet.</div>
            ) : (
              <ul className="fraud-signals">
                {selected.policies.map((p) => (
                  <li key={p.policyId}>
                    {p.policyNumber ?? p.policyId.slice(0, 8)} — {p.status} (
                    {p.term.from} → {p.term.to})
                  </li>
                ))}
              </ul>
            )}

            <h2 style={{ fontSize: "0.95rem", marginTop: "0.9rem" }}>
              Claims ({selected.claims.length})
            </h2>
            {selected.claims.length === 0 ? (
              <div className="placeholder">No claims yet.</div>
            ) : (
              <ul className="fraud-signals">
                {selected.claims.map((c) => (
                  <li key={c.claimId}>
                    {c.claimId.slice(0, 8)} — {c.cause}, {c.status}
                    {c.priority && ` (${c.priority})`}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
