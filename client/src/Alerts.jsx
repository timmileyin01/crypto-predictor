import { useState, useEffect } from "react";
import { alertsApi } from "./api";
import { Bell, Trash2, Plus, TrendingUp, TrendingDown } from "lucide-react";

const SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "DOGEUSDT",
  "ADAUSDT",
];

const fmt = (n) =>
  n >= 1000
    ? n.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : (n?.toFixed(6) ?? "—");

export default function Alerts({ allSymbols }) {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [symbol, setSymbol] = useState(allSymbols[0] || "BTCUSDT");
  const [condition, setCondition] = useState("above");
  const [threshold, setThreshold] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function loadAlerts() {
    setLoading(true);
    try {
      const { data } = await alertsApi.get();
      setAlerts(data.data);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAlerts();
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await alertsApi.create({
        symbol,
        condition,
        threshold: parseFloat(threshold),
      });
      setThreshold("");
      setShowForm(false);
      await loadAlerts();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to create alert");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id) {
    try {
      await alertsApi.delete(id);
      setAlerts((prev) => prev.filter((a) => a.id !== id));
    } catch {
      /* silent */
    }
  }

  return (
    <div className="alerts-panel">
      <div className="alerts-header">
        <div className="alerts-title">
          <Bell size={14} />
          Price Alerts
        </div>
        <button
          className="btn btn-primary"
          style={{ padding: "5px 10px", fontSize: "12px" }}
          onClick={() => setShowForm(!showForm)}
        >
          <Plus size={12} /> New Alert
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <form className="alert-form" onSubmit={handleCreate}>
          <select
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            className="alert-select"
          >
            {allSymbols.map((s) => (
              <option key={s} value={s}>
                {s.replace("USDT", "/USDT")}
              </option>
            ))}
          </select>

          <div className="alert-form-row">
            <select
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              className="alert-select"
            >
              <option value="above">Predicted above</option>
              <option value="below">Predicted below</option>
            </select>
            <input
              type="number"
              placeholder="Price threshold"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="alert-input"
              step="any"
              required
            />
          </div>

          {error && <div className="alert-error">{error}</div>}

          <div className="alert-form-btns">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowForm(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting || !threshold}
            >
              {submitting ? "Creating..." : "Create Alert"}
            </button>
          </div>
        </form>
      )}

      {/* Alerts list */}
      {loading ? (
        <div className="alerts-empty">Loading...</div>
      ) : alerts.length === 0 ? (
        <div className="alerts-empty">
          No alerts yet. Create one to get notified by email.
        </div>
      ) : (
        <div className="alerts-list">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`alert-item ${alert.triggered ? "triggered" : ""}`}
            >
              <div className="alert-item-left">
                <div className="alert-symbol">
                  {alert.symbol.replace("USDT", "")}
                </div>
                <div className="alert-condition">
                  {alert.condition === "above" ? (
                    <TrendingUp size={11} color="#34d399" />
                  ) : (
                    <TrendingDown size={11} color="#f87171" />
                  )}
                  {alert.condition} ${fmt(parseFloat(alert.threshold))}
                </div>
              </div>
              <div className="alert-item-right">
                {alert.triggered_at ? (
                  <span
                    className="alert-fired"
                    title={`Last fired: ${new Date(alert.triggered_at).toLocaleDateString()}`}
                  >
                    Last fired{" "}
                    {new Date(alert.triggered_at).toLocaleDateString("en-CA")}
                  </span>
                ) : (
                  <span className="alert-active">Active</span>
                )}
                <button
                  className="wl-remove"
                  onClick={() => handleDelete(alert.id)}
                  title="Delete alert"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
