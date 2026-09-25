"use client";

import { useState, useTransition } from "react";
import { registerConnector, switchTenant } from "../tenant-actions";
import type { ConnectorRegistration } from "../types";

export default function ConnectorsPage() {
  const [name, setName] = useState("Gamma Insurance");
  const [policyBaseUrl, setPolicyBaseUrl] = useState("http://127.0.0.1:4000");
  const [ollamaModel, setOllamaModel] = useState("");
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState("");
  const [result, setResult] = useState<ConnectorRegistration | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        setResult(
          await registerConnector(
            name,
            policyBaseUrl,
            ollamaModel ? { model: ollamaModel, baseUrl: ollamaBaseUrl || undefined } : undefined,
          ),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setResult(null);
      }
    });
  };

  const onSwitchToNewTenant = () =>
    result &&
    startTransition(async () => {
      const formData = new FormData();
      formData.set("tenantId", result.tenantId);
      await switchTenant(formData);
    });

  return (
    <main className="wrap">
      <section className="card">
        <span className="eyebrow">Connector SDK</span>
        <h2>Register a connector</h2>
        <p className="note">
          Point OpenCover at a REST service implementing the policy connector
          contract (create/get/save/list/nextPolicyNumber — see{" "}
          <code>@pc-core/adapters</code>'s <code>RemoteHttpPolicyRepository</code>{" "}
          and <code>apps/mock-insurer</code> for a reference implementation) and
          get back a tenant + API key immediately. No restart, no code change on
          OpenCover's side — every service works against the connected company's
          own data from that point on.
        </p>

        <form onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="connectorName">Company name</label>
            <input
              id="connectorName"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="policyBaseUrl">Policy connector base URL</label>
            <input
              id="policyBaseUrl"
              type="text"
              value={policyBaseUrl}
              onChange={(e) => setPolicyBaseUrl(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="ollamaModel">
              Ollama model for IDP extraction (optional — leave blank for the
              default regex extractor)
            </label>
            <input
              id="ollamaModel"
              type="text"
              placeholder="e.g. llama3.1"
              value={ollamaModel}
              onChange={(e) => setOllamaModel(e.target.value)}
            />
          </div>
          {ollamaModel && (
            <div className="field">
              <label htmlFor="ollamaBaseUrl">Ollama server URL (optional)</label>
              <input
                id="ollamaBaseUrl"
                type="text"
                placeholder="default: http://127.0.0.1:11434"
                value={ollamaBaseUrl}
                onChange={(e) => setOllamaBaseUrl(e.target.value)}
              />
            </div>
          )}

          <button className="primary" type="submit" disabled={pending}>
            {pending ? "Registering…" : "Register connector"}
          </button>
        </form>

        {error && <div className="error">{error}</div>}

        {result && (
          <div className="claim-block">
            <div className="billing-row">
              <span>Tenant ID</span>
              <span>{result.tenantId}</span>
            </div>
            <div className="billing-row">
              <span>Name</span>
              <span>{result.name}</span>
            </div>
            <div className="billing-row">
              <span>API key</span>
              <span>{result.apiKey}</span>
            </div>
            {ollamaModel && (
              <div className="trace">
                claims-AI IDP extraction for this tenant now runs against{" "}
                <strong>{ollamaModel}</strong> via Ollama (
                {ollamaBaseUrl || "http://127.0.0.1:11434"}) instead of the
                default regex extractor.
              </div>
            )}
            <button className="secondary" onClick={onSwitchToNewTenant} disabled={pending}>
              {pending ? "Switching…" : "Switch the portal to this tenant"}
            </button>
          </div>
        )}
      </section>

      <section className="card">
        <span className="eyebrow">Try it against the reference connector</span>
        <h2>apps/mock-insurer</h2>
        <p className="note">
          The default URL above (<code>http://127.0.0.1:4000</code>) points at
          this repo's own stand-in "company system" — its own schema, own
          numbering (<code>BETA-000001</code>), reached only over HTTP. Start it
          with <code>pnpm platform</code> instead of <code>pnpm dev</code>, then
          register it here to see a brand-new tenant onboard against it live.
        </p>
      </section>

      <section className="card">
        <span className="eyebrow">Bring your own model</span>
        <h2>Open-source LLMs via Ollama</h2>
        <p className="note">
          OpenCover ships no hosted model — the default IDP extractor is
          deterministic regex. If you have a model running locally through{" "}
          <a href="https://ollama.com" target="_blank" rel="noreferrer">
            Ollama
          </a>{" "}
          (<code>ollama pull llama3.1</code>, etc.), fill in its model name
          above and this tenant's claim intake will run that model's
          extraction instead — see <code>OllamaLlmClient</code> in{" "}
          <code>@pc-core/claims-ai</code>. Any other model server works too:
          implement the small <code>LlmClient</code> interface
          (<code>complete(prompt): Promise&lt;string&gt;</code>) against it.
        </p>
      </section>
    </main>
  );
}
