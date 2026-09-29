import { api } from "./api";

export async function syncAllStocks() {
  for (const stock of await api<Array<{ id: number }>>("/api/stocks/sync"))
    await api(`/api/stocks/${stock.id}/sync`, "POST");
}
