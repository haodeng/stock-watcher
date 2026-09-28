CREATE TABLE chart_drawings (
  stock_id INTEGER NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
  timeframe TEXT NOT NULL CHECK(timeframe IN ('1d', '1h', '4h', '1wk', '1mo')),
  drawing TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (stock_id, timeframe)
);
