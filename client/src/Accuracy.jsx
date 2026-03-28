import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp, Target, AlertTriangle } from "lucide-react";

const fmt = (n) =>
  n >= 1000
    ? n.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : (n?.toFixed(4) ?? "—");

function calcMAPE(data) {
  const withActuals = data.filter(
    (d) => d.actual !== null && d.actual !== undefined,
  );
  if (withActuals.length === 0) return null;
  const sum = withActuals.reduce((acc, d) => {
    return acc + Math.abs((d.actual - d.predicted) / d.actual);
  }, 0);
  return ((sum / withActuals.length) * 100).toFixed(2);
}

function getMAPELabel(mape) {
  if (mape === null)
    return { label: "No data yet", color: "#94a3b8", icon: "none" };
  if (mape < 3) return { label: "Excellent", color: "#34d399", icon: "good" };
  if (mape < 7) return { label: "Good", color: "#818cf8", icon: "good" };
  if (mape < 10) return { label: "Fair", color: "#fbbf24", icon: "warn" };
  return { label: "Needs retraining", color: "#f87171", icon: "warn" };
}

export default function Accuracy({ data, symbol }) {
  const withActuals = data.filter(
    (d) => d.actual !== null && d.actual !== undefined,
  );
  const mape = calcMAPE(data);
  const { label, color, icon } = getMAPELabel(mape);

  return (
    <section className="chart-card">
      <div className="accuracy-header">
        <h2 className="chart-title">
          Model accuracy — {symbol.replace("USDT", "/USDT")}
        </h2>
        <div className="accuracy-badge" style={{ color, borderColor: color }}>
          {icon === "good" && <Target size={13} />}
          {icon === "warn" && <AlertTriangle size={13} />}
          {mape !== null ? `MAPE ${mape}% — ${label}` : label}
        </div>
      </div>

      {/* Stats row */}
      <div className="accuracy-stats">
        <div className="acc-stat">
          <div className="acc-stat-label">Predictions made</div>
          <div className="acc-stat-value">{data.length}</div>
        </div>
        <div className="acc-stat">
          <div className="acc-stat-label">Actuals available</div>
          <div className="acc-stat-value">{withActuals.length}</div>
        </div>
        <div className="acc-stat">
          <div className="acc-stat-label">Avg error</div>
          <div className="acc-stat-value" style={{ color }}>
            {mape !== null ? `${mape}%` : "—"}
          </div>
        </div>
        {withActuals.length > 0 && (
          <div className="acc-stat">
            <div className="acc-stat-label">Last actual</div>
            <div className="acc-stat-value">
              ${fmt(parseFloat(withActuals[withActuals.length - 1].actual))}
            </div>
          </div>
        )}
      </div>

      {/* Chart */}
      {data.length === 0 ? (
        <div className="chart-placeholder">
          No prediction history yet. Check back tomorrow.
        </div>
      ) : withActuals.length === 0 ? (
        <div className="chart-placeholder">
          Predictions exist but actuals not yet available. Check back tomorrow.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <LineChart
            data={data}
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
                v ? "$" + fmt(v) : "—",
                name === "predicted" ? "Predicted" : "Actual",
              ]}
            />
            <Legend wrapperStyle={{ fontSize: 12, color: "#94a3b8" }} />
            <Line
              type="monotone"
              dataKey="predicted"
              stroke="#818cf8"
              strokeWidth={2}
              dot={{ r: 3, fill: "#818cf8" }}
              name="predicted"
            />
            <Line
              type="monotone"
              dataKey="actual"
              stroke="#34d399"
              strokeWidth={2}
              dot={{ r: 3, fill: "#34d399" }}
              name="actual"
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </section>
  );
}
