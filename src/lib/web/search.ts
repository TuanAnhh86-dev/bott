/**
 * Web Access & Real-Time Search Utility for Em Mì
 * Provides live web search and content extraction from public websites and platforms.
 */

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  sourceDomain: string;
}

/**
 * Searches the public web using DuckDuckGo HTML / public search endpoints
 * without requiring any paid external API keys.
 */
export async function searchPublicWeb(query: string, maxResults: number = 5): Promise<WebSearchResult[]> {
  try {
    if (!query.trim() || query.length > 500 || !Number.isInteger(maxResults) || maxResults < 1 || maxResults > 10) {
      throw new Error("Invalid web search parameters.");
    }

    const encodedQuery = encodeURIComponent(query);
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;

    const res = await fetch(searchUrl, {
      headers: {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      next: { revalidate: 300 }, // Cache search results for 5 mins
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      console.warn(`[WebSearch] Search provider returned status ${res.status}.`);
      return [];
    }

    const html = await res.text();
    const results: WebSearchResult[] = [];

    // Parse HTML search results using regex
    const resultBlocks = html.split('<div class="result results_links');

    for (let i = 1; i < resultBlocks.length && results.length < maxResults; i++) {
      const block = resultBlocks[i];

      // Extract title and URL
      const linkMatch = block.match(/<a class="result__url" href="([^"]+)">([^<]+)<\/a>/) ||
                         block.match(/<a class="result__snippet[^>]*href="([^"]+)"[^>]*>/);
      const titleMatch = block.match(/<a class="result__a"[^>]*>([\s\S]*?)<\/a>/);
      const snippetMatch = block.match(/<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);

      let rawUrl = linkMatch ? linkMatch[1] : "";
      const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "";
      const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, "").trim() : "";

      // Decode DDG redirect URL if needed (e.g. //duckduckgo.com/l/?uddg=https%3A%2F%2F...)
      if (rawUrl.includes("uddg=")) {
        const match = rawUrl.match(/uddg=([^&]+)/);
        if (match) {
          rawUrl = decodeURIComponent(match[1]);
        }
      }

      if (rawUrl.startsWith("//")) {
        rawUrl = "https:" + rawUrl;
      }

      if (rawUrl && title) {
        try {
          const parsedUrl = new URL(rawUrl);
          if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") continue;
          const domain = parsedUrl.hostname;
          results.push({
            title,
            url: parsedUrl.toString(),
            snippet: snippet || title,
            sourceDomain: domain,
          });
        } catch {
          // Ignore invalid URLs
        }
      }
    }

    if (results.length > 0) {
      return results;
    }

    return [];
  } catch (error) {
    console.warn("[WebSearch] Search request failed:", error);
    return [];
  }
}
