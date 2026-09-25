import type { LlmClient } from "./providers.js";

export interface OpenAiCompatibleClientOptions {
  /** model name as the local server knows it, e.g. "qwen2.5-3b-instruct" */
  model: string;
  /** default: a local server's common default port for this API shape */
  baseUrl?: string;
  /** most local servers ignore this, but the field is part of the standard request shape */
  apiKey?: string;
  /** abort the request if the server hasn't responded within this many ms
   * (default 15000) — keeps an unresponsive local model from blocking a
   * caller (fraud scoring, IDP extraction, claim-queue triage) indefinitely;
   * every LlmClient caller already treats a failed call as "no opinion". */
  timeoutMs?: number;
}

/**
 * LlmClient adapter for any local model server that speaks the OpenAI
 * chat-completions HTTP shape — llama.cpp's `llama-server`, LM Studio, vLLM,
 * text-generation-webui, and Ollama's own `/v1/chat/completions` endpoint all
 * implement it. This is the "bring literally any local server" seam: a
 * company runs whatever runtime they already have on their own infrastructure
 * and points PC Core at it — no cloud call, no model shipped by PC Core.
 *
 * Same swappable-provider shape as OllamaLlmClient: implements LlmClient's
 * single `complete` method, so it drops straight into LlmDocumentExtractor
 * and LlmFraudScorer.
 */
export class OpenAiCompatibleLlmClient implements LlmClient {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;

  constructor(options: OpenAiCompatibleClientOptions) {
    this.model = options.model;
    this.baseUrl = (options.baseUrl ?? "http://127.0.0.1:8080").replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  async complete(prompt: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.apiKey && { authorization: `Bearer ${this.apiKey}` }),
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: "user", content: prompt }],
        stream: false,
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) {
      throw new Error(
        `local model request failed: ${res.status} ${res.statusText}`,
      );
    }
    const body = (await res.json()) as {
      choices: { message: { content: string } }[];
    };
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new Error("local model reply had no message content");
    }
    return content;
  }
}
