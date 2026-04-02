import { pool } from "../config/db.js";
import { fetchDailyCandles, fetchCurrentPrice } from "../config/market.js";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const ML_URL = process.env.ML_SERVICE_URL || "http://localhost:8000";

export async function getSymbols(req, res) {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM symbols ORDER BY symbol ASC",
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function fetchAndStoreCandles(req, res) {
  const { symbol } = req.params;
  const limit = parseInt(req.query.limit) || 365;

  try {
    const candles = await fetchDailyCandles(symbol.toUpperCase(), limit);

    const times = candles.map((c) => c.time);
    const opens = candles.map((c) => c.open);
    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);
    const closes = candles.map((c) => c.close);
    const volumes = candles.map((c) => c.volume);
    const symbols = candles.map((c) => c.symbol);

    await pool.query(
      `INSERT INTO ohlcv (time, symbol, open, high, low, close, volume)
       SELECT * FROM unnest(
         $1::timestamptz[], $2::text[],
         $3::float8[], $4::float8[], $5::float8[], $6::float8[], $7::float8[]
       )
       ON CONFLICT (time, symbol) DO UPDATE
         SET open=EXCLUDED.open, high=EXCLUDED.high, low=EXCLUDED.low,
             close=EXCLUDED.close, volume=EXCLUDED.volume`,
      [times, symbols, opens, highs, lows, closes, volumes],
    );

    res.json({
      success: true,
      message: `Stored ${candles.length} candles for ${symbol.toUpperCase()}`,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function getHistory(req, res) {
  const { symbol } = req.params;
  const days = parseInt(req.query.days) || 90;

  try {
    const { rows } = await pool.query(
      `SELECT time, open, high, low, close, volume
       FROM ohlcv
       WHERE symbol = $1
         AND time >= NOW() - ($2 || ' days')::interval
       ORDER BY time ASC`,
      [symbol.toUpperCase(), days],
    );
    res.json({ success: true, symbol: symbol.toUpperCase(), data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function trainModel(req, res) {
  const { symbol } = req.params;

  try {
    // Only use last 3 years — avoids massive price range distorting the scaler
    const { rows } = await pool.query(
      `SELECT time, close FROM ohlcv
       WHERE symbol = $1
         AND time >= NOW() - INTERVAL '3 years'
       ORDER BY time ASC`,
      [symbol.toUpperCase()],
    );

    if (rows.length < 60) {
      return res.status(400).json({
        success: false,
        error: "Need at least 60 days of data to train. Fetch data first.",
      });
    }

    const prices = rows.map((r) => parseFloat(r.close));
    console.log(
      `[Train] ${symbol}: ${prices.length} rows, min=$${Math.min(...prices).toFixed(2)}, max=$${Math.max(...prices).toFixed(2)}`,
    );

    const { data } = await axios.post(`${ML_URL}/train`, {
      symbol: symbol.toUpperCase(),
      prices,
    });

    res.json({ success: true, data });
  } catch (err) {
    const detail = err.response?.data?.detail || err.message;
    res.status(500).json({ success: false, error: detail });
  }
}

export async function getPrediction(req, res) {
  const { symbol } = req.params;

  try {
    // Always return the most recent prediction without date filtering
    const { rows: cached } = await pool.query(
      `SELECT * FROM predictions 
   WHERE symbol = $1 
   ORDER BY predicted_for DESC 
   LIMIT 1`,
      [symbol.toUpperCase()],
    );

    // Only use cache if prediction is for today or future
    const today = new Date().toISOString().split("T")[0];
    if (cached.length > 0 && cached[0].predicted_for >= today) {
      return res.json({ success: true, source: "cache", data: cached[0] });
    }

    // Send ALL historical prices so the scaler has the full range
    const { rows } = await pool.query(
      `SELECT close FROM ohlcv
       WHERE symbol = $1
       ORDER BY time ASC`,
      [symbol.toUpperCase()],
    );

    if (rows.length < 60) {
      return res.status(400).json({
        success: false,
        error: "Need 60 days of data. Fetch data and train the model first.",
      });
    }

    const prices = rows.map((r) => parseFloat(r.close));

    const { data: mlResult } = await axios.post(`${ML_URL}/predict`, {
      symbol: symbol.toUpperCase(),
      prices,
    });

    const now = new Date();
    const tomorrow = new Date(
      Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + 1),
    );
    const predictedFor = tomorrow.toISOString().split("T")[0];

    await pool.query(
      `INSERT INTO predictions (symbol, predicted_for, predicted_close, model_version)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (symbol, predicted_for) DO UPDATE
         SET predicted_close = EXCLUDED.predicted_close`,
      [
        symbol.toUpperCase(),
        predictedFor,
        mlResult.predicted_close,
        mlResult.model_version,
      ],
    );

    // Check and fire any matching alerts immediately
    const { checkAndFireAlerts } = await import("./alertsController.js");
    await checkAndFireAlerts(
      symbol.toUpperCase(),
      mlResult.predicted_close,
      predictedFor,
    );

    res.json({
      success: true,
      source: "model",
      data: {
        symbol: symbol.toUpperCase(),
        predicted_for: predictedFor,
        predicted_close: mlResult.predicted_close,
        model_version: mlResult.model_version,
      },
    });
  } catch (err) {
    const detail = err.response?.data?.detail || err.message;
    res.status(500).json({ success: false, error: detail });
  }
}

export async function getLiveTicker(req, res) {
  const { symbol } = req.params;
  try {
    const data = await fetchCurrentPrice(symbol.toUpperCase());
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function getPredictionHistory(req, res) {
  const { symbol } = req.params;
  try {
    await pool.query(
      `UPDATE predictions p
       SET actual_close = o.close
       FROM (
         SELECT DISTINCT ON (DATE(time)) DATE(time) AS day, close
         FROM ohlcv WHERE symbol = $1
         ORDER BY DATE(time), time DESC
       ) o
       WHERE p.symbol = $1
         AND p.predicted_for = o.day
         AND p.actual_close IS NULL`,
      [symbol.toUpperCase()],
    );

    const { rows } = await pool.query(
      `SELECT 
     TO_CHAR(predicted_for, 'YYYY-MM-DD') AS predicted_for,
     predicted_close,
     actual_close,
     created_at
   FROM predictions
   WHERE symbol = $1
   ORDER BY predicted_for DESC
   LIMIT 30`,
      [symbol.toUpperCase()],
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function clearPredictions(req, res) {
  const { symbol } = req.params;
  try {
    await pool.query(`DELETE FROM predictions WHERE symbol = $1`, [
      symbol.toUpperCase(),
    ]);
    res.json({ success: true, message: `Cleared predictions for ${symbol}` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function searchSymbols(req, res) {
  const { q } = req.query;
  if (!q)
    return res.status(400).json({ success: false, error: "Query is required" });

  try {
    const { searchCoins } = await import("../config/market.js");
    const results = await searchCoins(q);
    res.json({ success: true, data: results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function addSymbol(req, res) {
  const { symbol, coinId, name } = req.body;

  if (!symbol || !coinId) {
    return res
      .status(400)
      .json({ success: false, error: "symbol and coinId are required" });
  }

  try {
    // Check if already exists
    const { rows: existing } = await pool.query(
      "SELECT symbol FROM symbols WHERE symbol = $1",
      [symbol.toUpperCase()],
    );

    if (existing.length > 0) {
      return res
        .status(400)
        .json({ success: false, error: `${symbol} already exists` });
    }

    // Add to symbols table
    await pool.query(
      `INSERT INTO symbols (symbol, base_asset, quote_asset)
       VALUES ($1, $2, 'USDT')`,
      [symbol.toUpperCase(), symbol.replace("USDT", "").toUpperCase()],
    );

    // Store coinId mapping
    await pool.query(
      `INSERT INTO coin_map (symbol, coin_id, name)
       VALUES ($1, $2, $3)
       ON CONFLICT (symbol) DO NOTHING`,
      [symbol.toUpperCase(), coinId, name],
    );

    // Fetch 2 years of history via yfinance
    const { exec } = await import("child_process");
    const { fileURLToPath } = await import("url");
    const path = await import("path");

    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const FETCH_SCRIPT = path.join(__dirname, "../../../ml/fetch_data.py");
    const PYTHON = path.join(__dirname, "../../../ml/venv/Scripts/python.exe");

    await new Promise((resolve, reject) => {
      exec(
        `"${PYTHON}" "${FETCH_SCRIPT}" history ${symbol.toUpperCase()}`,
        (error, stdout, stderr) => {
          if (error) {
            console.warn(`[addSymbol] yfinance fetch warning: ${stderr}`);
            resolve(); // Don't fail the whole request if fetch fails
          } else {
            console.log(`[addSymbol] ${stdout}`);
            resolve();
          }
        },
      );
    });

    // Check how many candles we got
    const { rows: candles } = await pool.query(
      "SELECT COUNT(*) FROM ohlcv WHERE symbol = $1",
      [symbol.toUpperCase()],
    );

    const count = parseInt(candles[0].count);

    res.json({
      success: true,
      message: `${symbol} added with ${count} candles of historical data`,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function deleteSymbol(req, res) {
  const { symbol } = req.params;

  const defaultSymbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"];
  if (defaultSymbols.includes(symbol.toUpperCase())) {
    return res.status(400).json({
      success: false,
      error: `${symbol} is a default symbol and cannot be deleted`,
    });
  }

  try {
    await pool.query("DELETE FROM watchlists WHERE symbol = $1", [
      symbol.toUpperCase(),
    ]);
    await pool.query("DELETE FROM predictions WHERE symbol = $1", [
      symbol.toUpperCase(),
    ]);
    await pool.query("DELETE FROM alerts WHERE symbol = $1", [
      symbol.toUpperCase(),
    ]);
    await pool.query("DELETE FROM ohlcv WHERE symbol = $1", [
      symbol.toUpperCase(),
    ]);
    await pool.query("DELETE FROM coin_map WHERE symbol = $1", [
      symbol.toUpperCase(),
    ]);
    await pool.query("DELETE FROM symbols WHERE symbol = $1", [
      symbol.toUpperCase(),
    ]);

    res.json({ success: true, message: `${symbol} deleted successfully` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}
