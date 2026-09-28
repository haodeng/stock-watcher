import { api } from "./api";

export async function syncAllStocks() {
  await api("/api/stocks/sync", "POST");
}
