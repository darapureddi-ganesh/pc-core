import { describe, it, expect, vi, afterEach } from "vitest";
import { OpenAiCompatibleLlmClient } from "../src/index.js";

describe("OpenAiCompatibleLlmClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts to /v1/chat/completions and returns the message content", async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe("http://127.0.0.1:8080/v1/chat/completions");
      expect(JSON.parse(init.body as string)).toEqual({
        model: "qwen2.5-3b-instruct",
        messages: [{ role: "user", content: "extract fields from: ..." }],
        stream: false,
      });
      return new Response(
        JSON.stringify({ choices: [{ message: { content: '{"dates":[]}' } }] }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new OpenAiCompatibleLlmClient({ model: "qwen2.5-3b-instruct" });
    const reply = await client.complete("extract fields from: ...");

    expect(reply).toBe('{"dates":[]}');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("strips a trailing slash from a custom baseUrl and sends an api key", async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe("http://my-server:8080/v1/chat/completions");
      expect((init.headers as Record<string, string>).authorization).toBe(
        "Bearer local-secret",
      );
      return new Response(
        JSON.stringify({ choices: [{ message: { content: "ok" } }] }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new OpenAiCompatibleLlmClient({
      model: "mistral",
      baseUrl: "http://my-server:8080/",
      apiKey: "local-secret",
    });
    await client.complete("hi");
  });

  it("throws a clear error on a non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("model not found", { status: 404, statusText: "Not Found" }),
      ),
    );

    const client = new OpenAiCompatibleLlmClient({ model: "nonexistent" });
    await expect(client.complete("hi")).rejects.toThrow(/404/);
  });

  it("throws a clear error when the reply has no message content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ choices: [] }), { status: 200 })),
    );

    const client = new OpenAiCompatibleLlmClient({ model: "qwen2.5-3b-instruct" });
    await expect(client.complete("hi")).rejects.toThrow(/no message content/);
  });

  it("aborts the request if the server doesn't respond within timeoutMs", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const signal = init.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")));
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new OpenAiCompatibleLlmClient({
      model: "qwen2.5-3b-instruct",
      timeoutMs: 10,
    });
    await expect(client.complete("hi")).rejects.toThrow();
  });
});
