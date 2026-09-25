import type { LlmClient } from "./providers.js";

export interface OllamaClientOptions {
  /** e.g. "llama3.1", "mistral" — whatever you've pulled locally */
  model: string;
  /** default: a local Ollama server's default port */
  baseUrl?: string;
  /** abort the request if the server hasn't responded within this many ms
   * (default 15000). Every caller of LlmClient (fraud scoring, IDP
   * extraction, claim-queue triage) treats a failed call as "no opinion" and
   * degrades safely — but only if the call actually fails instead of hanging
   * forever, which an unresponsive local model server otherwise would. */
  timeoutMs?: number;
}

/**
 * LlmClient adapter for a self-hosted Ollama server (https://ollama.com).
 * Ollama ships no model of its own — point this at whatever open-source model
 * you've pulled (`ollama pull llama3.1`), and it plugs straight into
 * LlmDocumentExtractor behind the same DocumentExtractor interface every
 * tenant's ClaimsService already depends on.
 */
export class OllamaLlmClient implements LlmClient {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(options: OllamaClientOptions) {
    this.model = options.model;
    this.baseUrl = (options.baseUrl ?? "http://127.0.0.1:11434").replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  async complete(prompt: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: this.model, prompt, stream: false }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) {
      throw new Error(`Ollama request failed: ${res.status} ${res.statusText}`);
    }
    const body = (await res.json()) as { response: string };
    return body.response;
  }
}
