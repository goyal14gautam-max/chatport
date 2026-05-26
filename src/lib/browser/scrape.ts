export interface ScrapeSuccess {
  ok: true;
  source: 'chatgpt' | 'claude';
  data: unknown;
}

export interface ScrapeFailure {
  ok: false;
  code: string;
  message: string;
}

export type ScrapeResponse = ScrapeSuccess | ScrapeFailure;

export async function scrapeUrl(url: string): Promise<ScrapeResponse> {
  let response: Response;
  try {
    response = await fetch('/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
  } catch {
    return { ok: false, code: 'NETWORK', message: "Couldn't reach the server. Check your connection and try again." };
  }
  try {
    return (await response.json()) as ScrapeResponse;
  } catch {
    return { ok: false, code: 'INTERNAL', message: 'Got an unexpected response from the server.' };
  }
}
