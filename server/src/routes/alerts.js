import { Router } from 'express'
import { getAlerts, createAlert, deleteAlert } from '../controllers/alertsController.js'
import { protect } from '../middleware/auth.js'

const router = Router()

router.use(protect)

router.get('/', getAlerts)
router.post('/', createAlert)
router.delete('/:id', deleteAlert)

export default router