import { IconX } from "@tabler/icons-react";
import { api } from "./api";
import type { Alert } from "./types";

export function AlertsPanel({
  stockId,
  alerts,
  refresh,
  message,
  close,
}: {
  stockId: number | undefined;
  alerts: Alert[];
  refresh: () => Promise<void>;
  message: (value: string) => void;
  close: () => void;
}) {
  return (
    <div
      className="alert-panel-backdrop"
      role="presentation"
      onMouseDown={close}
    >
      <section
        className="alert-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="alerts-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <h2 id="alerts-title">Price alerts</h2>
          <button
            className="icon-button"
            aria-label="Close alerts"
            onClick={close}
          >
            <IconX size={20} />
          </button>
        </header>
        <form
          className="alert-form"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void api("/api/alerts", "POST", {
              stockId,
              direction: form.get("direction"),
              target: form.get("target"),
            })
              .then(() => {
                event.currentTarget.reset();
                return refresh();
              })
              .catch((error) => message(error.message));
          }}
        >
          <select name="direction">
            <option value="above">crosses above</option>
            <option value="below">crosses below</option>
          </select>
          <input
            name="target"
            type="number"
            min="0.01"
            step="0.01"
            placeholder="DKK target"
            required
          />
          <button disabled={!stockId}>Create alert</button>
        </form>
        <section className="alerts">
          {alerts.length ? (
            alerts.map((alert) => (
              <div key={alert.id}>
                {alert.code} {alert.direction} {alert.target.toFixed(2)} DKK ·{" "}
                {alert.armed ? (
                  "armed"
                ) : (
                  <button
                    className="quiet-button"
                    onClick={() =>
                      void api(`/api/alerts/${alert.id}/rearm`, "POST").then(
                        refresh,
                      )
                    }
                  >
                    Re-arm
                  </button>
                )}
              </div>
            ))
          ) : (
            <p>No price alerts yet.</p>
          )}
        </section>
      </section>
    </div>
  );
}
