UPDATE daily_bars SET trading_date = 'timezone-fix:' || trading_date;
UPDATE daily_bars SET trading_date = date(substr(trading_date, 14), '+1 day');
