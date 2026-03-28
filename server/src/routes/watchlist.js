import { Router } from 'express'
import {
  getWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  getWatchlistWithPredictions,
} from '../controllers/watchlistController.js'
import { protect } from '../middleware/auth.js'

const router = Router()

// All watchlist routes are protected
router.use(protect)

router.get('/', getWatchlist)
router.get('/predictions', getWatchlistWithPredictions)
router.post('/', addToWatchlist)
router.delete('/:symbol', removeFromWatchlist)

export default router