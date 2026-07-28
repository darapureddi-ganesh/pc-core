import { describe, it, expect, vi, afterEach } from "vitest";
import { OllamaLlmClient } from "../src/index.js";

describe("OllamaLlmClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts to /api/generate with stream:false and returns the response text", async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe("http://127.0.0.1:11434/api/generate");
      expect(JSON.parse(init.body as string)).toEqual({
        model: "llama3.1",
        prompt: "extract fields from: ...",
        stream: false,
      });
      return new Response(JSON.stringify({ response: '{"dates":[]}' }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new OllamaLlmClient({ model: "llama3.1" });
    const reply = await client.complete("extract fields from: ...");

    expect(reply).toBe('{"dates":[]}');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("strips a trailing slash from a custom baseUrl", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe("http://my-server:11434/api/generate");
      return new Response(JSON.stringify({ response: "ok" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new OllamaLlmClient({
      model: "mistral",
      baseUrl: "http://my-server:11434/",
    });
    await client.complete("hi");
  });

  it("throws a clear error on a non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("model not found", { status: 404, statusText: "Not Found" })),
    );

    const client = new OllamaLlmClient({ model: "nonexistent" });
    await expect(client.complete("hi")).rejects.toThrow(/404/);
  });
});
