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

const router = Router()

router.get('/symbols', getSymbols)
router.get('/search', searchSymbols)
router.post('/symbols', addSymbol)
router.post('/:symbol/fetch', fetchAndStoreCandles)
router.get('/:symbol/history', getHistory)
router.post('/:symbol/train', trainModel)
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