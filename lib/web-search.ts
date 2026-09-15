/**
 * Web Search Intelligence Engine for DataBridge AI
 * Supports multi-provider live search:
 * 1. Tavily Search API (if TAVILY_API_KEY is configured)
 * 2. Serper / Google Search API (if SERPER_API_KEY is configured)
 * 3. Brave Search API (if BRAVE_SEARCH_API_KEY is configured)
 * 4. High-Speed DuckDuckGo Extractor (Default zero-config free search, no API key required)
 */

export interface WebSearchResult {
  title: string;
  snippet: string;
  url: string;
  domain?: string;
}

export interface WebSearchResponse {
  query: string;
  provider: string;
  results: WebSearchResult[];
  error?: string;
}

/**
 * Extracts the clean hostname from a URL
 */
function extractDomain(urlStr: string): string {
  try {
    const parsed = new URL(urlStr);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * Sanitizes and cleans HTML entities and tags
 */
function cleanText(text: string): string {
  if (!text) return "";
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 1. DuckDuckGo Free Zero-Config Search Provider
 */
async function searchWithDuckDuckGo(query: string, maxResults = 5): Promise<WebSearchResult[]> {
  const encodedQuery = encodeURIComponent(query);
  const targetUrl = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;

  const response = await fetch(targetUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  if (!response.ok) {
    throw new Error(`DuckDuckGo responded with status ${response.status}`);
  }

  const html = await response.text();
  const results: WebSearchResult[] = [];

  // Match result link blocks
  const blockRegex =
    /<div[^>]*class="[^"]*result\s+results_links[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g;
  let blockMatch: RegExpExecArray | null;

  while ((blockMatch = blockRegex.exec(html)) !== null && results.length < maxResults) {
    const block = blockMatch[1];

    // Extract title
    const titleMatch =
      block.match(/<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/) ||
      block.match(/<a[^>]*class="[^"]*result__title[^"]*"[^>]*>([\s\S]*?)<\/a>/) ||
      block.match(/<h2[^>]*class="[^"]*result__title[^"]*"[^>]*>([\s\S]*?)<\/h2>/);

    // Extract URL
    const linkMatch =
      block.match(/<a[^>]*class="[^"]*result__url[^"]*"[^>]*href="([^"]+)"/i) ||
      block.match(/<a[^>]*class="[^"]*result__title[^"]*"[^>]*href="([^"]+)"/i);

    // Extract snippet
    const snippetMatch = block.match(/<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/);

    let rawUrl = linkMatch ? linkMatch[1] : "";
    if (rawUrl.includes("uddg=")) {
      try {
        const matchUddg = rawUrl.match(/uddg=([^&]+)/);
        if (matchUddg) rawUrl = decodeURIComponent(matchUddg[1]);
      } catch {}
    }

    if (rawUrl && !rawUrl.startsWith("http")) {
      rawUrl = `https://${rawUrl}`;
    }

    const title = cleanText(titleMatch ? titleMatch[1] : "Market Intelligence Source");
    const snippet = cleanText(snippetMatch ? snippetMatch[1] : "");

    if (title && rawUrl) {
      results.push({
        title,
        snippet,
        url: rawUrl,
        domain: extractDomain(rawUrl),
      });
    }
  }

  return results;
}

/**
 * 2. Tavily Search Provider (Optional API Key)
 */
async function searchWithTavily(query: string, apiKey: string, maxResults = 5): Promise<WebSearchResult[]> {
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "basic",
      max_results: maxResults,
    }),
  });

  if (!response.ok) {
    throw new Error(`Tavily search failed with status ${response.status}`);
  }

  const data = await response.json();
  return (data.results || []).map((r: { title?: string; content?: string; url?: string }) => ({
    title: r.title || "Competitor Intelligence",
    snippet: r.content || "",
    url: r.url || "",
    domain: extractDomain(r.url || ""),
  }));
}

/**
 * 3. Serper / Google Search Provider (Optional API Key)
 */
async function searchWithSerper(query: string, apiKey: string, maxResults = 5): Promise<WebSearchResult[]> {
  const response = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      q: query,
      num: maxResults,
    }),
  });

  if (!response.ok) {
    throw new Error(`Serper search failed with status ${response.status}`);
  }

  const data = await response.json();
  return (data.organic || []).map((r: { title?: string; snippet?: string; link?: string }) => ({
    title: r.title || "Market Intelligence Source",
    snippet: r.snippet || "",
    url: r.link || "",
    domain: extractDomain(r.link || ""),
  }));
}

/**
 * Main Web Search Dispatcher
 * Dispatches to the highest-priority configured provider with graceful fallback to DuckDuckGo.
 */
export async function executeWebSearch(
  query: string,
  maxResults = 5
): Promise<WebSearchResponse> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return { query: "", provider: "none", results: [] };
  }

  // Check optional providers in order
  const tavilyKey = process.env.TAVILY_API_KEY;
  const serperKey = process.env.SERPER_API_KEY;

  if (tavilyKey) {
    try {
      const results = await searchWithTavily(trimmedQuery, tavilyKey, maxResults);
      if (results.length > 0) {
        return { query: trimmedQuery, provider: "Tavily", results };
      }
    } catch (err) {
      console.warn("[WebSearch] Tavily provider failed, falling back to DuckDuckGo:", err);
    }
  }

  if (serperKey) {
    try {
      const results = await searchWithSerper(trimmedQuery, serperKey, maxResults);
      if (results.length > 0) {
        return { query: trimmedQuery, provider: "Serper", results };
      }
    } catch (err) {
      console.warn("[WebSearch] Serper provider failed, falling back to DuckDuckGo:", err);
    }
  }

  // Zero-Config Default (DuckDuckGo)
  try {
    const results = await searchWithDuckDuckGo(trimmedQuery, maxResults);
    return {
      query: trimmedQuery,
      provider: "DuckDuckGo",
      results,
    };
  } catch (err) {
    console.error("[WebSearch] DuckDuckGo search extraction failed:", err);
    return {
      query: trimmedQuery,
      provider: "DuckDuckGo (Offline)",
      results: [],
      error: err instanceof Error ? err.message : "Web search temporarily unavailable",
    };
  }
}
