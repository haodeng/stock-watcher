ALTER TABLE stocks ADD COLUMN last_daily_close REAL;
ALTER TABLE stocks ADD COLUMN previous_daily_close REAL;
UPDATE stocks SET
  last_daily_close = (SELECT close FROM daily_bars WHERE stock_id = stocks.id ORDER BY trading_date DESC LIMIT 1),
  previous_daily_close = (SELECT close FROM daily_bars WHERE stock_id = stocks.id ORDER BY trading_date DESC LIMIT 1 OFFSET 1);
