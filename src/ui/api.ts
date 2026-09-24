import type { Stock, Watchlist } from "./types";

export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  if (path === "/api/sync" && method === "POST") {
    const stocks = new Map<number, Stock>();
    for (const watchlist of await api<Watchlist[]>("/api/watchlists"))
      for (const stock of await api<Stock[]>(
        `/api/watchlists/${watchlist.id}/stocks`,
      ))
        stocks.set(stock.id, stock);
    for (const stock of stocks.values())
      await api(`/api/stocks/${stock.id}/sync`, "POST");
    return { ok: true } as T;
  }
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "request failed");
  return data;
}
