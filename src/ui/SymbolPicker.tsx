import { IconCheck, IconPlus, IconSearch, IconX } from "@tabler/icons-react";
import { useState } from "react";
import type { MarketStock } from "./types";

export function SymbolPicker({
  stocks,
  loading,
  error,
  adding,
  onAdd,
  onClose,
}: {
  stocks: MarketStock[];
  loading: boolean;
  error: string;
  adding: boolean;
  onAdd: (codes: string[]) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const filtered = stocks.filter((stock) =>
    `${stock.code} ${stock.name}`.toLowerCase().includes(query.toLowerCase()),
  );
  const toggle = (code: string) =>
    setSelected((current) =>
      current.includes(code)
        ? current.filter((value) => value !== code)
        : [...current, code],
    );
  return (
    <div className="symbol-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="symbol-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby="symbol-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <h2 id="symbol-title">Add symbol</h2>
          <button className="icon-button" aria-label="Close" onClick={onClose}>
            <IconX size={26} />
          </button>
        </header>
        <label className="symbol-search">
          <IconSearch size={22} />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search Denmark stocks"
            aria-label="Search Denmark stocks"
          />
        </label>
        <p className="market-filter">🇩🇰 Denmark · Stocks · Nasdaq Copenhagen</p>
        <div className="symbol-results">
          {loading ? (
            <p>Loading Denmark stocks…</p>
          ) : error ? (
            <p className="error">{error}</p>
          ) : (
            filtered.map((stock) => {
              const checked = selected.includes(stock.code);
              return (
                <button
                  key={stock.code}
                  className={`symbol-result ${checked ? "selected" : ""}`}
                  aria-pressed={checked}
                  disabled={adding}
                  onClick={() => toggle(stock.code)}
                >
                  <span>
                    <strong>{stock.code}</strong>
                    <small>{stock.name}</small>
                  </span>
                  <small>CPH</small>
                  {checked ? <IconCheck size={24} /> : <IconPlus size={26} />}
                </button>
              );
            })
          )}
          {!loading && !error && !filtered.length && (
            <p>No Denmark stock found.</p>
          )}
        </div>
        <footer className="symbol-actions">
          <span>
            {selected.length
              ? `${selected.length} selected`
              : "Select stocks to add"}
          </span>
          <button
            disabled={!selected.length || adding}
            onClick={() => onAdd(selected)}
          >
            {adding ? "Adding…" : "Add selected"}
          </button>
        </footer>
      </section>
    </div>
  );
}
