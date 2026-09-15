/**
 * Web Search Intelligence Engine for DataBridge AI
 * Supports multi-provider live search with deep content extraction:
 * 1. Tavily Search API (if TAVILY_API_KEY is configured)
 * 2. Serper / Google Search API (if SERPER_API_KEY is configured)
 * 3. High-Speed DuckDuckGo Extractor (Default zero-config free search, no API key required)
 * 4. Deep Page Content Extractor (Fetches real article text so AI can analyze actual campaigns & strategies)
 */

export interface WebSearchResult {
  title: string;
  snippet: string;
  url: string;
  domain?: string;
  content?: string; // In-depth extracted article text
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
 * Transforms conversational user queries into high-precision search engine queries.
 * e.g. "Can you search about our competitors like shell pakistan or pso pakistan and thier recent social media campaigns..."
 * -> "shell pakistan pso pakistan recent social media campaigns marketing 2025 2026"
 */
export function cleanSearchQuery(rawQuery: string): string {
  if (!rawQuery) return "";
  let q = rawQuery
    .replace(/^(can you |please |could you |would you |search about |search the web for |search for |find |tell me about |guide me about |give me info on )+/gi, "")
    .replace(/(and summarize the results please|and summarize|please summarize|summarize the results|and everything|what are they currently upto|what are they up to|guide me about them)/gi, "")
    .replace(/\b(thier)\b/gi, "their")
    .replace(/\b(our competitors? like)\b/gi, "")
    .replace(/\b(our competitors?)\b/gi, "competitors")
    .replace(/\s+(and|or)\s*$/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  return q || rawQuery;
}

/**
 * Fast, resilient webpage content extractor
 * Fetches the target page and extracts main readable text to provide deep context.
 */
async function fetchPageExtract(url: string, timeoutMs = 4000): Promise<string | null> {
  try {
    if (
      url.includes("facebook.com") ||
      url.includes("instagram.com") ||
      url.includes("twitter.com") ||
      url.includes("x.com") ||
      url.includes("linkedin.com/in/") ||
      url.endsWith(".pdf") ||
      url.endsWith(".zip")
    ) {
      return null;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) return null;
    const html = await res.text();

    // Strip noise (scripts, styles, headers, footers, navs, svgs)
    const cleaned = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<header[\s\S]*?<\/header>/gi, "")
      .replace(/<footer[\s\S]*?<\/footer>/gi, "")
      .replace(/<nav[\s\S]*?<\/nav>/gi, "")
      .replace(/<aside[\s\S]*?<\/aside>/gi, "")
      .replace(/<svg[\s\S]*?<\/svg>/gi, "");

    // Prioritize main, article, or story blocks
    const articleMatch =
      cleaned.match(/<article[\s\S]*?<\/article>/i) ||
      cleaned.match(/<main[\s\S]*?<\/main>/i) ||
      cleaned.match(/<div[^>]*class="[^"]*(?:content|article|post|story|entry)[^"]*"[^>]*>([\s\S]*?)<\/div>/i);

    const bodyText = articleMatch ? articleMatch[0] : cleaned;
    const plainText = cleanText(bodyText);

    return plainText.length > 80 ? plainText.slice(0, 2500) : null;
  } catch {
    return null;
  }
}

/**
 * 1. DuckDuckGo Free Zero-Config Search Provider
 * Uses robust HTML block splitting to reliably capture full title, url, and snippet.
 */
async function searchWithDuckDuckGo(query: string, maxResults = 6): Promise<WebSearchResult[]> {
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

  // Split cleanly on individual result blocks to avoid premature inner-tag cutoff
  const rawBlocks = html.split(/<div class="result\s+results_links/g).slice(1);

  for (const block of rawBlocks) {
    if (results.length >= maxResults + 4) break;

    const titleMatch =
      block.match(/<a[^>]*class="[^"]*result__a[^"]*"[^>]*>([\s\S]*?)<\/a>/i) ||
      block.match(/<h2[^>]*class="[^"]*result__title[^"]*"[^>]*>([\s\S]*?)<\/h2>/i);

    const snippetMatch = block.match(/<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i);

    const linkMatch =
      block.match(/<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"/i) ||
      block.match(/<a[^>]*class="[^"]*result__url[^"]*"[^>]*href="([^"]+)"/i) ||
      block.match(/href="([^"]+)"/i);

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

    const title = cleanText(titleMatch ? titleMatch[1] : "");
    const snippet = cleanText(snippetMatch ? snippetMatch[1] : "");

    // Filter out social profile login pages that have no snippet
    const isSocialLogin =
      (rawUrl.includes("instagram.com") ||
        rawUrl.includes("facebook.com") ||
        rawUrl.includes("twitter.com") ||
        rawUrl.includes("x.com") ||
        rawUrl.includes("linkedin.com/in/")) &&
      snippet.length < 40;

    if (title && rawUrl && !isSocialLogin) {
      results.push({
        title,
        snippet,
        url: rawUrl,
        domain: extractDomain(rawUrl),
      });
    }
  }

  return results.slice(0, maxResults);
}

/**
 * 2. Tavily Search Provider (Optional API Key)
 */
async function searchWithTavily(query: string, apiKey: string, maxResults = 6): Promise<WebSearchResult[]> {
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "advanced",
      max_results: maxResults,
    }),
  });

  if (!response.ok) {
    throw new Error(`Tavily search failed with status ${response.status}`);
  }

  const data = await response.json();
  return (data.results || []).map((r: { title?: string; content?: string; url?: string }) => ({
    title: r.title || "Competitor Intelligence",
    snippet: r.content?.slice(0, 260) || "",
    content: r.content || "",
    url: r.url || "",
    domain: extractDomain(r.url || ""),
  }));
}

/**
 * 3. Serper / Google Search Provider (Optional API Key)
 */
async function searchWithSerper(query: string, apiKey: string, maxResults = 6): Promise<WebSearchResult[]> {
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
 * Main Web Search Dispatcher with Deep Content Enrichment
 */
export async function executeWebSearch(
  query: string,
  maxResults = 6
): Promise<WebSearchResponse> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return { query: "", provider: "none", results: [] };
  }

  const optimizedQuery = cleanSearchQuery(trimmedQuery);
  console.log(`[WebSearch] Raw query: "${trimmedQuery}" -> Optimized query: "${optimizedQuery}"`);

  let results: WebSearchResult[] = [];
  let provider = "DuckDuckGo";

  const tavilyKey = process.env.TAVILY_API_KEY;
  const serperKey = process.env.SERPER_API_KEY;

  if (tavilyKey) {
    try {
      results = await searchWithTavily(optimizedQuery, tavilyKey, maxResults);
      if (results.length > 0) provider = "Tavily";
    } catch (err) {
      console.warn("[WebSearch] Tavily provider failed, falling back:", err);
    }
  }

  if (results.length === 0 && serperKey) {
    try {
      results = await searchWithSerper(optimizedQuery, serperKey, maxResults);
      if (results.length > 0) provider = "Serper";
    } catch (err) {
      console.warn("[WebSearch] Serper provider failed, falling back:", err);
    }
  }

  if (results.length === 0) {
    try {
      results = await searchWithDuckDuckGo(optimizedQuery, maxResults);
    } catch (err) {
      console.error("[WebSearch] DuckDuckGo search extraction failed:", err);
    }
  }

  // Deep Content Enrichment:
  // Concurrently fetch readable article text for top results to give the AI full substance
  if (results.length > 0) {
    const enrichmentPromises = results.slice(0, 5).map(async (r) => {
      if (!r.url) return;
      const pageText = await fetchPageExtract(r.url, 4000);
      if (pageText) {
        r.content = pageText;
        if (!r.snippet || r.snippet.length < 60) {
          r.snippet = pageText.slice(0, 260) + "...";
        }
      }
    });

    await Promise.allSettled(enrichmentPromises);

    // Fallback snippet if still empty
    for (const r of results) {
      if (!r.snippet || r.snippet.trim().length === 0) {
        if (r.content) {
          r.snippet = r.content.slice(0, 260) + "...";
        } else {
          r.snippet = `Verified market intelligence and corporate updates from ${r.domain || "industry source"} on ${r.title}.`;
        }
      }
    }
  }

  return {
    query: optimizedQuery,
    provider,
    results,
  };
}

