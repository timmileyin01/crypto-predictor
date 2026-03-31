import cron from 'node-cron'
import { pool } from './db.js'
import axios from 'axios'
import yahooFinance from 'yahoo-finance2'
import dotenv from 'dotenv'

dotenv.config()

const ML_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000'

const SYMBOL_MAP = {
  BTCUSDT:  'BTC-USD',
  ETHUSDT:  'ETH-USD',
  SOLUSDT:  'SOL-USD',
  BNBUSDT:  'BNB-USD',
  DOGEUSDT: 'DOGE-USD',
  ADAUSDT:  'ADA-USD',
}

async function getYFSymbol(symbol) {
  // Check coin_map for dynamic symbols
  const base = symbol.replace('USDT', '')
  return SYMBOL_MAP[symbol] || `${base}-USD`
}

export async function fetchLatestPrices() {
  const { rows: symbols } = await pool.query('SELECT symbol FROM symbols')

  for (const { symbol } of symbols) {
    try {
      const yfSymbol = await getYFSymbol(symbol)

      const result = await yahooFinance.historical(yfSymbol, {
        period1: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // last 7 days
        interval: '1d',
      })

      if (!result || result.length === 0) {
        console.log(`[Fetch] No data for ${symbol}`)
        continue
      }

      for (const candle of result) {
        await pool.query(
          `INSERT INTO ohlcv (time, symbol, open, high, low, close, volume)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (time, symbol) DO UPDATE
             SET open=EXCLUDED.open, high=EXCLUDED.high,
                 low=EXCLUDED.low, close=EXCLUDED.close,
                 volume=EXCLUDED.volume`,
          [
            candle.date,
            symbol,
            candle.open,
            candle.high,
            candle.low,
            candle.close,
            candle.volume || 0,
          ]
        )
      }

      console.log(`[Fetch] ✅ ${symbol} — updated ${result.length} candles`)
    } catch (err) {
      console.error(`[Fetch] ❌ ${symbol}: ${err.message}`)
    }
  }
}

async function runDailyJob() {
  console.log('[Scheduler] Running daily fetch + predict job...')

  // 1. Fetch latest prices via yahoo-finance2
  try {
    console.log('[Scheduler] Fetching latest prices from Yahoo Finance...')
    await fetchLatestPrices()
    console.log('[Scheduler] ✅ Prices updated')
  } catch (err) {
    console.error('[Scheduler] ⚠️ Price fetch failed:', err.message)
  }

  // 2. Generate predictions for all symbols
  const { rows: symbols } = await pool.query('SELECT symbol FROM symbols')

  for (const { symbol } of symbols) {
    try {
      console.log(`[Scheduler] Processing ${symbol}...`)

      const { rows } = await pool.query(
        `SELECT close FROM ohlcv
         WHERE symbol = $1
           AND time >= NOW() - INTERVAL '3 years'
         ORDER BY time ASC`,
        [symbol]
      )

      if (rows.length < 60) {
        console.warn(`[Scheduler] Not enough data for ${symbol}, skipping`)
        continue
      }

      const prices = rows.map((r) => parseFloat(r.close))

      const { data: mlResult } = await axios.post(`${ML_URL}/predict`, {
        symbol,
        prices,
      })

      const now = new Date()
      const tomorrow = new Date(Date.UTC(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1
      ))
      const predictedFor = tomorrow.toISOString().split('T')[0]

      await pool.query(
        `INSERT INTO predictions (symbol, predicted_for, predicted_close, model_version)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (symbol, predicted_for) DO UPDATE
           SET predicted_close = EXCLUDED.predicted_close`,
        [symbol, predictedFor, mlResult.predicted_close, mlResult.model_version]
      )

      console.log(`[Scheduler] ✅ ${symbol} → $${mlResult.predicted_close} for ${predictedFor}`)

      const { checkAndFireAlerts } = await import('../controllers/alertsController.js')
      await checkAndFireAlerts(symbol, mlResult.predicted_close, predictedFor)

    } catch (err) {
      console.error(`[Scheduler] ❌ ${symbol}: ${err.message}`)
    }
  }

  console.log('[Scheduler] Daily job complete.')
}

async function checkLivePriceAlerts() {
  try {
    const { rows: symbols } = await pool.query(
      `SELECT DISTINCT symbol FROM alerts`
    )

    if (symbols.length === 0) return

    for (const { symbol } of symbols) {
      try {
        const { fetchCurrentPrice } = await import('./market.js')
        const ticker = await fetchCurrentPrice(symbol)
        const livePrice = ticker.price

        const { rows: alerts } = await pool.query(
          `SELECT a.*, u.email, u.name
           FROM alerts a
           JOIN users u ON u.id = a.user_id
           WHERE a.symbol = $1`,
          [symbol]
        )

        const { sendAlertEmail } = await import('./mailer.js')

        for (const alert of alerts) {
          const triggered =
            (alert.condition === 'above' && livePrice > alert.threshold) ||
            (alert.condition === 'below' && livePrice < alert.threshold)

          if (triggered) {
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
            if (alert.triggered_at && new Date(alert.triggered_at) > oneHourAgo) {
              continue
            }

            await sendAlertEmail({
              to: alert.email,
              name: alert.name,
              symbol,
              condition: alert.condition,
              threshold: alert.threshold,
              predictedClose: livePrice,
              predictedFor: 'Live price',
            })

            await pool.query(
              `UPDATE alerts SET triggered = TRUE, triggered_at = NOW()
               WHERE id = $1`,
              [alert.id]
            )

            console.log(`[Alerts] 🔔 Live alert fired for ${alert.email} — ${symbol} ${alert.condition} $${alert.threshold}`)
          } else {
            await pool.query(
              `UPDATE alerts SET triggered = FALSE WHERE id = $1`,
              [alert.id]
            )
          }
        }
      } catch (err) {
        console.error(`[LiveAlerts] ${symbol}: ${err.message}`)
      }
    }
  } catch (err) {
    console.error(`[LiveAlerts] Error: ${err.message}`)
  }
}

export function startScheduler() {
  cron.schedule('10 0 * * *', runDailyJob, { timezone: 'UTC' })
  console.log('[Scheduler] Daily prediction job scheduled at 00:10 UTC')

  cron.schedule('*/5 * * * *', checkLivePriceAlerts)
  console.log('[Scheduler] Live price alerts checking every 5 minutes')
}

export { runDailyJob }