// Tavily web-search connector (A-4). Server-only. Opt-in: the caller decides
// whether to invoke this at all, and it is a no-op (returns []) when no API key
// is configured, so the feature degrades gracefully to OFF.

export interface WebSearchResult {
  title: string;
  url: string;
  content: string;
}

export function isWebSearchAvailable(): boolean {
  return !!process.env.TAVILY_API_KEY;
}

export async function webSearch(
  query: string,
  maxResults = 3,
): Promise<WebSearchResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return [];

  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: maxResults,
        search_depth: 'basic',
      }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: WebSearchResult[] };
    return (data.results ?? []).map((r) => ({
      title: r.title,
      url: r.url,
      content: r.content,
    }));
  } catch {
    return [];
  }
}
