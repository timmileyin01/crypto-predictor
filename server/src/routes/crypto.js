import { Router } from 'express'
import {
  getSymbols,
  fetchAndStoreCandles,
  getHistory,
  trainModel,
  getPrediction,
  getLiveTicker,
  getPredictionHistory,
  clearPredictions,
  searchSymbols,
  addSymbol,
  deleteSymbol,
} from '../controllers/cryptoController.js'
import { runDailyJob } from '../config/scheduler.js'

import jwt from 'jsonwebtoken'
import dotenv from 'dotenv'
dotenv.config()


function adminOnly(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Not authorized' })
  }
  const token = authHeader.split(' ')[1]
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    if (!decoded.is_admin) {
      return res.status(403).json({ success: false, error: 'Admin access required' })
    }
    req.user = decoded
    next()
  } catch {
    return res.status(401).json({ success: false, error: 'Invalid token' })
  }
}

const router = Router()

router.get('/symbols', getSymbols)
router.get('/search', searchSymbols)
router.post('/symbols', addSymbol)
router.post('/:symbol/fetch', fetchAndStoreCandles)
router.get('/:symbol/history', getHistory)
router.post('/:symbol/train', adminOnly, trainModel)
router.get('/:symbol/prediction', getPrediction)
router.get('/:symbol/prediction-history', getPredictionHistory)
router.get('/:symbol/ticker', getLiveTicker)
router.delete('/:symbol/predictions', clearPredictions)

router.post('/run-daily-job', async (req, res) => {
  try {
    await runDailyJob()
    res.json({ success: true, message: 'Daily job completed' })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.delete('/symbols/:symbol', deleteSymbol)

export default router