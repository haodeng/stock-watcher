import { api } from "./api";
import type { Stock, Watchlist } from "./types";

export async function syncAllStocks() {
  const stocks = new Map<number, Stock>();
  for (const watchlist of await api<Watchlist[]>("/api/watchlists"))
    for (const stock of await api<Stock[]>(
      `/api/watchlists/${watchlist.id}/stocks`,
    ))
      stocks.set(stock.id, stock);
  for (const stock of stocks.values())
    await api(`/api/stocks/${stock.id}/sync`, "POST");
}
