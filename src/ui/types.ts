export type Stock = {
  id: number;
  code: string;
  providerSymbol: string;
  note: string | null;
  noteUpdatedAt: string | null;
  last: number | null;
  change: number | null;
  changePercent: number | null;
};
export type MarketStock = { code: string; name: string; sector: string };
export type Watchlist = { id: number; name: string };
export type Bar = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};
export type Alert = {
  id: number;
  code: string;
  direction: string;
  target: number;
  armed: number;
};
export type ZoneScan = {
  matches: Array<{ id: number; code: string }>;
  added: number;
};
export type ZoneSettings = {
  swingMultiplier: number;
  fvgMinAtr: number;
  fvgLimit: number;
  obDisplacementAtr: number;
  obLimit: number;
};
