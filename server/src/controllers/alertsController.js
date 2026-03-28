import { pool } from '../config/db.js'
import { sendAlertEmail } from '../config/mailer.js'

export async function getAlerts(req, res) {
  try {
    const { rows } = await pool.query(
      `SELECT id, symbol, condition, threshold, triggered, triggered_at, created_at
       FROM alerts
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user.id]
    )
    res.json({ success: true, data: rows })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

export async function createAlert(req, res) {
  const { symbol, condition, threshold } = req.body

  if (!symbol || !condition || !threshold) {
    return res.status(400).json({
      success: false,
      error: 'symbol, condition and threshold are required',
    })
  }

  if (!['above', 'below'].includes(condition)) {
    return res.status(400).json({
      success: false,
      error: 'condition must be above or below',
    })
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO alerts (user_id, symbol, condition, threshold)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [req.user.id, symbol.toUpperCase(), condition, parseFloat(threshold)]
    )
    res.status(201).json({ success: true, data: rows[0] })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

export async function deleteAlert(req, res) {
  const { id } = req.params
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM alerts WHERE id = $1 AND user_id = $2`,
      [id, req.user.id]
    )
    if (rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Alert not found' })
    }
    res.json({ success: true, message: 'Alert deleted' })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

// Called by the scheduler after each prediction
export async function checkAndFireAlerts(symbol, predictedClose, predictedFor) {
  try {
    // Get ALL active alerts for this symbol (not just untriggered)
    const { rows: alerts } = await pool.query(
      `SELECT a.*, u.email, u.name
       FROM alerts a
       JOIN users u ON u.id = a.user_id
       WHERE a.symbol = $1`,
      [symbol]
    )

    for (const alert of alerts) {
      const triggered =
        (alert.condition === 'above' && predictedClose > alert.threshold) ||
        (alert.condition === 'below' && predictedClose < alert.threshold)

      if (triggered) {
        // Check if we already sent an email for this symbol+date combination
        // to avoid duplicate emails on same day
        const { rows: alreadySent } = await pool.query(
          `SELECT id FROM alerts
           WHERE id = $1
             AND triggered_at::date = CURRENT_DATE`,
          [alert.id]
        )

        if (alreadySent.length > 0) {
          console.log(`[Alerts] Already fired alert ${alert.id} today — skipping`)
          continue
        }

        // Send email
        await sendAlertEmail({
          to: alert.email,
          name: alert.name,
          symbol,
          condition: alert.condition,
          threshold: alert.threshold,
          predictedClose,
          predictedFor,
        })

        // Update triggered_at but keep alert active
        await pool.query(
          `UPDATE alerts
           SET triggered = TRUE, triggered_at = NOW()
           WHERE id = $1`,
          [alert.id]
        )

        console.log(`[Alerts] ✅ Fired alert for ${alert.email} — ${symbol} ${alert.condition} $${alert.threshold}`)
      } else {
        // Reset triggered flag when condition is no longer met
        // so it can fire again when threshold is crossed again
        await pool.query(
          `UPDATE alerts SET triggered = FALSE WHERE id = $1`,
          [alert.id]
        )
      }
    }
  } catch (err) {
    console.error(`[Alerts] Error checking alerts: ${err.message}`)
  }
}