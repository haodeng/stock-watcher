import { api } from "./api";
import type { Stock } from "./types";

function formatNoteTime(value: string | null) {
  return value ? new Date(`${value.replace(" ", "T")}Z`).toLocaleString() : "";
}

export function StockNote({
  stock,
  refresh,
  message,
}: {
  stock: Stock | undefined;
  refresh: () => Promise<void>;
  message: (value: string) => void;
}) {
  if (!stock) return null;
  return (
    <form
      className="note-form"
      key={stock.id}
      onSubmit={(event) => {
        event.preventDefault();
        const note = new FormData(event.currentTarget).get("note");
        void api(`/api/stocks/${stock.id}/note`, "PUT", { note })
          .then(refresh)
          .then(() => message("Note saved."))
          .catch((error) => message(error.message));
      }}
    >
      <label>
        <textarea
          name="note"
          defaultValue={stock.note ?? ""}
          maxLength={2000}
          placeholder="Add a note…"
          aria-label="Stock note"
        />
      </label>
      {stock.noteUpdatedAt && (
        <small className="note-time">
          Updated {formatNoteTime(stock.noteUpdatedAt)}
        </small>
      )}
      <div>
        <button>Save</button>
        {stock.note && (
          <button
            type="button"
            className="quiet-button"
            onClick={() =>
              void api(`/api/stocks/${stock.id}/note`, "DELETE")
                .then(refresh)
                .then(() => message("Note removed."))
                .catch((error) => message(error.message))
            }
          >
            Remove
          </button>
        )}
      </div>
    </form>
  );
}
