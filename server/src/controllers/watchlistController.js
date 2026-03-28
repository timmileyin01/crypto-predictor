import { pool } from '../config/db.js'

export async function getWatchlist(req, res) {
  try {
    const { rows } = await pool.query(
      `SELECT w.id, w.symbol, w.added_at
       FROM watchlists w
       WHERE w.user_id = $1
       ORDER BY w.added_at DESC`,
      [req.user.id]
    )
    res.json({ success: true, data: rows })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

export async function addToWatchlist(req, res) {
  const { symbol } = req.body

  if (!symbol) {
    return res.status(400).json({ success: false, error: 'Symbol is required' })
  }

  try {
    // Check symbol exists in our symbols table
    const { rows: valid } = await pool.query(
      'SELECT symbol FROM symbols WHERE symbol = $1',
      [symbol.toUpperCase()]
    )

    if (valid.length === 0) {
      return res.status(400).json({
        success: false,
        error: `${symbol} is not a supported symbol`,
      })
    }

    const { rows } = await pool.query(
      `INSERT INTO watchlists (user_id, symbol)
       VALUES ($1, $2)
       ON CONFLICT (user_id, symbol) DO NOTHING
       RETURNING *`,
      [req.user.id, symbol.toUpperCase()]
    )

    if (rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: `${symbol} is already in your watchlist`,
      })
    }

    res.status(201).json({ success: true, data: rows[0] })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

export async function removeFromWatchlist(req, res) {
  const { symbol } = req.params

  try {
    const { rowCount } = await pool.query(
      `DELETE FROM watchlists WHERE user_id = $1 AND symbol = $2`,
      [req.user.id, symbol.toUpperCase()]
    )

    if (rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: `${symbol} not found in your watchlist`,
      })
    }

    res.json({ success: true, message: `${symbol} removed from watchlist` })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

export async function getWatchlistWithPredictions(req, res) {
  try {
    const { rows } = await pool.query(
      `SELECT
         w.symbol,
         p.predicted_close,
         p.predicted_for,
         o.close AS last_close
       FROM watchlists w
       LEFT JOIN predictions p ON p.symbol = w.symbol
         AND p.predicted_for = (
           SELECT MAX(predicted_for) FROM predictions
           WHERE symbol = w.symbol
         )
       LEFT JOIN (
         SELECT DISTINCT ON (symbol) symbol, close
         FROM ohlcv ORDER BY symbol, time DESC
       ) o ON o.symbol = w.symbol
       WHERE w.user_id = $1
       ORDER BY w.added_at DESC`,
      [req.user.id]
    )
    res.json({ success: true, data: rows })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}