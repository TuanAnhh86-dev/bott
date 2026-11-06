import { describe, it, expect, vi, afterEach } from "vitest";
import { searchPublicWeb } from "@/lib/web/search";

describe("Web Access & Public Search Engine", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should return results parsed from the search provider", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(`
      <div class="result results_links">
        <a class="result__a" href="https://example.com/stock">Stock contributor guide</a>
        <a class="result__url" href="https://example.com/stock">example.com/stock</a>
        <a class="result__snippet">Provider snippet</a>
      </div>
    `)));

    const results = await searchPublicWeb("Adobe Stock contributor royalty rates", 3);

    expect(results).toBeDefined();
    expect(results).toEqual([{
      title: "Stock contributor guide",
      url: "https://example.com/stock",
      snippet: "Provider snippet",
      sourceDomain: "example.com",
    }]);
  });

  it("should not invent results when the provider fails or returns no matches", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("challenge page")));

    const results = await searchPublicWeb("Gumroad digital products fee", 2);
    expect(results).toEqual([]);

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network unavailable")));
    expect(await searchPublicWeb("Gumroad digital products fee", 2)).toEqual([]);
  });
});
