import cron from 'node-cron'
import { pool } from './db.js'
import axios from 'axios'
import { exec } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

dotenv.config()

const ML_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000'
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const IS_WINDOWS = process.platform === 'win32'
const PYTHON = IS_WINDOWS ? 'python' : 'python3'
const FETCH_SCRIPT = path.join(__dirname, '../../../ml/fetch_data.py')

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

  try {
    console.log('[Scheduler] Fetching latest prices from Yahoo Finance...')
    await runPythonFetch()
    console.log('[Scheduler] ✅ Prices updated')
  } catch (err) {
    console.error('[Scheduler] ⚠️ Price fetch failed, continuing with existing data:', err.message)
  }

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