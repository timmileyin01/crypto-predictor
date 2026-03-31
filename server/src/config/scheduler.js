import cron from 'node-cron'
import { pool } from './db.js'
import axios from 'axios'
import { exec } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import { checkAndFireAlerts } from '../controllers/alertsController.js'
import { sendAlertEmail } from './mailer.js'

dotenv.config()

const ML_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FETCH_SCRIPT = path.join(__dirname, '../../../ml/fetch_data.py')
const IS_WINDOWS = process.platform === 'win32'
const PYTHON = IS_WINDOWS
  ? path.join(__dirname, '../../../ml/venv/Scripts/python.exe')
  : path.join(__dirname, '../../../ml/venv/bin/python')

function runPythonFetch() {
  return new Promise((resolve, reject) => {
    exec(`"${PYTHON}" "${FETCH_SCRIPT}" latest`, (error, stdout, stderr) => {
      if (error) {
        console.error('[Scheduler] Python fetch error:', stderr)
        reject(error)
      } else {
        console.log('[Scheduler] Python fetch output:', stdout)
        resolve(stdout)
      }
    })
  })
}

async function runDailyJob() {
  console.log('[Scheduler] Running daily fetch + predict job...')

  // 1. Fetch latest prices via yfinance
  try {
    console.log('[Scheduler] Fetching latest prices from Yahoo Finance...')
    await runPythonFetch()
    console.log('[Scheduler] ✅ Prices updated')
  } catch (err) {
    console.error('[Scheduler] ⚠️ Price fetch failed, continuing with existing data:', err.message)
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
      await checkAndFireAlerts(symbol, mlResult.predicted_close, predictedFor)

    } catch (err) {
      console.error(`[Scheduler] ❌ ${symbol}: ${err.message}`)
    }
  }

  console.log('[Scheduler] Daily job complete.')
}

export function startScheduler() {
  // Daily prediction job at 00:10 UTC
  cron.schedule('10 0 * * *', runDailyJob, { timezone: 'UTC' })
  console.log('[Scheduler] Daily prediction job scheduled at 00:10 UTC')

  // Live price alert check every 5 minutes
  cron.schedule('*/5 * * * *', checkLivePriceAlerts)
  console.log('[Scheduler] Live price alerts checking every 5 minutes')
}

export { runDailyJob }


async function checkLivePriceAlerts() {
  try {
    // Get all unique symbols that have active alerts
    const { rows: symbols } = await pool.query(
      `SELECT DISTINCT symbol FROM alerts`
    )

    if (symbols.length === 0) return

    for (const { symbol } of symbols) {
      try {
        // Get live price
        const { fetchCurrentPrice } = await import('./market.js')
        const ticker = await fetchCurrentPrice(symbol)
        const livePrice = ticker.price

        // Get all alerts for this symbol
        const { rows: alerts } = await pool.query(
          `SELECT a.*, u.email, u.name
           FROM alerts a
           JOIN users u ON u.id = a.user_id
           WHERE a.symbol = $1`,
          [symbol]
        )

        for (const alert of alerts) {
          const triggered =
            (alert.condition === 'above' && livePrice > alert.threshold) ||
            (alert.condition === 'below' && livePrice < alert.threshold)

          if (triggered) {
            // Only fire once per hour to avoid spam
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

            console.log(`[Alerts] 🔔 Live price alert fired for ${alert.email} — ${symbol} ${alert.condition} $${alert.threshold} (live: $${livePrice})`)
          } else {
            // Reset so it can fire again when price crosses threshold again
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