import "./App.css";
import { useState, useEffect, useCallback, useRef } from "react";
import Auth from "./Auth";
import { authApi, cryptoApi } from "./api";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  LineChart,
  Line,
  Legend,
} from "recharts";
import { TrendingUp, TrendingDown, Brain, RefreshCw } from "lucide-react";
import Watchlist from "./Watchlist";
import Accuracy from "./Accuracy";
import AddSymbol from "./AddSymbol";
import { symbolsApi } from "./api";
import Alerts from "./Alerts";

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"];

const fmt = (n) =>
  n >= 1000
    ? n.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : (n?.toFixed(4) ?? "—");

const fmtDate = (iso) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function App() {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem("user");
    return stored ? JSON.parse(stored) : null;
  });

  const [symbol, setSymbol] = useState("BTCUSDT");
  const [history, setHistory] = useState([]);
  const [prediction, setPrediction] = useState(null);
  const [predHistory, setPredHistory] = useState([]);
  const [loading, setLoading] = useState({});
  const [status, setStatus] = useState("");
  const [days, setDays] = useState(90);
  const [ticker, setTicker] = useState(null);
  const [showAddSymbol, setShowAddSymbol] = useState(false);
  const [allSymbols, setAllSymbols] = useState(SYMBOLS);
  const watchlistRef = useRef(null);

  const setLoad = (key, val) => setLoading((l) => ({ ...l, [key]: val }));
  const toast = (msg) => {
    setStatus(msg);
    setTimeout(() => setStatus(""), 4000);
  };

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
  }

  async function handleSymbolAdded(newSymbol) {
    const { data } = await symbolsApi.getAll();
    setAllSymbols(data.data.map((s) => s.symbol));
    setSymbol(newSymbol);
    setShowAddSymbol(false);
    toast(`✅ ${newSymbol} added — train the model to get predictions`);
  }

  function handleSymbolDeleted(deletedSymbol) {
    setAllSymbols((prev) => prev.filter((s) => s !== deletedSymbol));
    if (symbol === deletedSymbol) setSymbol("BTCUSDT");
    toast(`✅ ${deletedSymbol} removed`);
  }

  const loadHistory = useCallback(async () => {
    setLoad("history", true);
    try {
      const { data } = await cryptoApi.getHistory(symbol, days);
      setHistory(
        data.data.map((d) => ({
          date: fmtDate(d.time),
          close: parseFloat(d.close),
        })),
      );
    } catch (e) {
      toast("⚠️ " + (e.response?.data?.error || e.message));
    } finally {
      setLoad("history", false);
    }
  }, [symbol, days]);

  const loadPrediction = useCallback(async () => {
    try {
      const { data } = await cryptoApi.getPrediction(symbol);
      setPrediction(data.data);
    } catch {
      setPrediction(null);
    }
  }, [symbol]);

  const loadPredHistory = useCallback(async () => {
    try {
      const { data } = await cryptoApi.getPredictionHistory(symbol);
      setPredHistory(
        data.data
          .map((d) => ({
            date: fmtDate(d.predicted_for),
            predicted: parseFloat(d.predicted_close),
            actual: d.actual_close ? parseFloat(d.actual_close) : null,
          }))
          .reverse(),
      );
    } catch {
      setPredHistory([]);
    }
  }, [symbol]);

  const loadTicker = useCallback(async () => {
    try {
      const { data } = await cryptoApi.getTicker(symbol);
      setTicker(data.data);
    } catch {
      setTicker(null);
    }
  }, [symbol]);

  useEffect(() => {
    loadHistory();
    loadPrediction();
    loadPredHistory();
    loadTicker();
  }, [symbol, days]);

  // Auto-refresh ticker every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      loadTicker();
    }, 30000);
    return () => clearInterval(interval);
  }, [symbol]);

  useEffect(() => {
    symbolsApi
      .getAll()
      .then(({ data }) => {
        setAllSymbols(data.data.map((s) => s.symbol));
      })
      .catch(() => {});
  }, []);

  async function handleTrain() {
    setLoad("train", true);
    toast("Training LSTM… this may take 1-2 minutes");
    try {
      await cryptoApi.trainModel(symbol);
      toast("✅ Model trained — generating prediction...");

      // Clear old cached prediction so a fresh one is generated
      await fetch(`/api/crypto/${symbol}/predictions`, { method: "DELETE" });

      // Load fresh prediction
      await loadPrediction();
      toast("✅ Model trained and prediction ready");
    } catch (e) {
      toast("❌ " + (e.response?.data?.error || e.message));
    } finally {
      setLoad("train", false);
    }
  }

  const lastClose =
    history.length > 0 ? history[history.length - 1].close : null;
  const predClose = prediction?.predicted_close;
  const isUp = predClose && lastClose ? predClose >= lastClose : null;

  if (!user) return <Auth onLogin={(u) => setUser(u)} />;

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <span className="logo">⬡ CryptoLSTM</span>
          <span className="tagline">Daily close prediction</span>
        </div>
        <div className="header-right">
          <span className="header-user">👋 {user.name}</span>
          <button className="btn btn-secondary" onClick={handleLogout}>
            Logout
          </button>
        </div>
        <nav className="symbol-tabs">
          {allSymbols.map((s) => (
            <button
              key={s}
              className={`sym-tab ${s === symbol ? "active" : ""}`}
              onClick={() => setSymbol(s)}
            >
              {s.replace("USDT", "")}
            </button>
          ))}
          <button
            className="sym-tab add-sym-tab"
            onClick={() => setShowAddSymbol(true)}
            title="Add symbol"
          >
            +
          </button>
        </nav>
      </header>

      {/* Toast */}
      {status && <div className="toast">{status}</div>}

      {/* Live ticker strip */}
      {ticker && (
        <div className="ticker-strip">
          <div className="ticker-left">
            <span className="ticker-symbol">{symbol.replace("USDT", "")}</span>
            <span className="ticker-price">
              $
              {ticker.price?.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: ticker.price >= 1 ? 2 : 6,
              })}
            </span>
            <span
              className={`ticker-change ${ticker.change24h >= 0 ? "up" : "down"}`}
            >
              {ticker.change24h >= 0 ? (
                <TrendingUp size={13} />
              ) : (
                <TrendingDown size={13} />
              )}
              {ticker.change24h >= 0 ? "+" : ""}
              {ticker.change24h?.toFixed(2)}% 24h
            </span>
            {ticker.change7d !== undefined && (
              <span
                className={`ticker-change ${ticker.change7d >= 0 ? "up" : "down"}`}
              >
                {ticker.change7d >= 0 ? (
                  <TrendingUp size={13} />
                ) : (
                  <TrendingDown size={13} />
                )}
                {ticker.change7d >= 0 ? "+" : ""}
                {ticker.change7d?.toFixed(2)}% 7d
              </span>
            )}
          </div>
          <div className="ticker-right">
            <span>
              Vol 24h: <b>${(ticker.volume24h / 1e9).toFixed(2)}B</b>
            </span>
            {ticker.marketCap && (
              <span>
                MCap: <b>${(ticker.marketCap / 1e9).toFixed(2)}B</b>
              </span>
            )}
          </div>
        </div>
      )}

      <main className="main">
        <div className="dashboard">
          <div className="dashboard-main">
            {/* Controls */}
            <div className="controls">
              <div className="days-tabs">
                {[30, 60, 90, 180, 365].map((d) => (
                  <button
                    key={d}
                    className={`day-tab ${days === d ? "active" : ""}`}
                    onClick={() => setDays(d)}
                  >
                    {d}d
                  </button>
                ))}
              </div>
              <div className="action-btns">
                <button
                  className="btn btn-secondary"
                  onClick={loadHistory}
                  disabled={loading.history}
                >
                  <RefreshCw size={14} />
                  {loading.history ? "Loading..." : "Refresh"}
                </button>
                {user?.is_admin && (
                  <button
                    className="btn btn-primary"
                    onClick={handleTrain}
                    disabled={loading.train}
                  >
                    <Brain size={14} />
                    {loading.train ? "Training..." : "Train Model"}
                  </button>
                )}
              </div>
            </div>

            {/* Prediction card */}
            {prediction && (
              <div className="pred-card">
                <div className="pred-left">
                  <div className="pred-label">
                    Next closing price prediction
                  </div>
                  <div className="pred-date">
                    For{" "}
                    {new Date(prediction.predicted_for).toLocaleDateString(
                      "en-CA",
                    )}
                  </div>
                </div>
                <div className="pred-right">
                  <div className={`pred-value ${isUp ? "up" : "down"}`}>
                    ${fmt(predClose)}
                    {isUp !== null && (
                      <span className="pred-icon">
                        {isUp ? (
                          <TrendingUp size={20} />
                        ) : (
                          <TrendingDown size={20} />
                        )}
                      </span>
                    )}
                  </div>
                  {lastClose && (
                    <div className="pred-vs">
                      vs last close ${fmt(lastClose)}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Price chart */}
            <section className="chart-card">
              <h2 className="chart-title">
                {symbol.replace("USDT", "/USDT")} — Closing price ({days}d)
              </h2>
              {loading.history ? (
                <div className="chart-placeholder">Loading...</div>
              ) : history.length === 0 ? (
                <div className="chart-placeholder">No data available.</div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart
                    data={history}
                    margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="5%"
                          stopColor="#6366f1"
                          stopOpacity={0.3}
                        />
                        <stop
                          offset="95%"
                          stopColor="#6366f1"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="rgba(255,255,255,.06)"
                    />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: "#94a3b8" }}
                      tickLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#94a3b8" }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => {
                        if (v >= 1000) return "$" + (v / 1000).toFixed(1) + "k";
                        if (v >= 1) return "$" + v.toFixed(2);
                        return "$" + v.toFixed(4);
                      }}
                      width={64}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#1e293b",
                        border: "1px solid #334155",
                        borderRadius: 8,
                      }}
                      labelStyle={{ color: "#94a3b8", fontSize: 12 }}
                      formatter={(v) => ["$" + fmt(v), "Close"]}
                    />
                    {prediction && (
                      <ReferenceLine
                        y={prediction.predicted_close}
                        stroke="#818cf8"
                        strokeDasharray="5 5"
                        label={{
                          value: "Predicted",
                          fill: "#818cf8",
                          fontSize: 11,
                          position: "insideTopRight",
                        }}
                      />
                    )}
                    <Area
                      type="monotone"
                      dataKey="close"
                      stroke="#6366f1"
                      strokeWidth={2}
                      fill="url(#grad)"
                      dot={false}
                      activeDot={{ r: 4, fill: "#6366f1" }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </section>

            {/* Prediction vs Actual chart */}
            {predHistory.length > 1 && (
              <section className="chart-card">
                <h2 className="chart-title">Predicted vs Actual</h2>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart
                    data={predHistory}
                    margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="rgba(255,255,255,.06)"
                    />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: "#94a3b8" }}
                      tickLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#94a3b8" }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => {
                        if (v >= 1000) return "$" + (v / 1000).toFixed(1) + "k";
                        if (v >= 1) return "$" + v.toFixed(2);
                        return "$" + v.toFixed(4);
                      }}
                      width={64}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#1e293b",
                        border: "1px solid #334155",
                        borderRadius: 8,
                      }}
                      labelStyle={{ color: "#94a3b8", fontSize: 12 }}
                      formatter={(v, name) => [
                        "$" + fmt(v),
                        name === "predicted" ? "Predicted" : "Actual",
                      ]}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, color: "#94a3b8" }} />
                    <Line
                      type="monotone"
                      dataKey="predicted"
                      stroke="#818cf8"
                      strokeWidth={2}
                      dot={false}
                      name="predicted"
                    />
                    <Line
                      type="monotone"
                      dataKey="actual"
                      stroke="#34d399"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      name="actual"
                      connectNulls={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </section>
            )}
          </div>

          {/* Sidebar */}
          <div className="dashboard-sidebar">
            <Watchlist
              key={allSymbols.join(",")}
              onSelectSymbol={(s) => setSymbol(s)}
            />
            <div style={{ marginTop: "16px" }}>
              <Alerts allSymbols={allSymbols} />
            </div>
          </div>
        </div>
        {/* Model accuracy */}
        <Accuracy symbol={symbol} data={predHistory} />
      </main>
      {showAddSymbol && (
        <AddSymbol
          onAdded={handleSymbolAdded}
          onDeleted={handleSymbolDeleted}
          onClose={() => setShowAddSymbol(false)}
        />
      )}
    </div>
  );
}
