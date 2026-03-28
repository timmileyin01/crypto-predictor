import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { initDB } from './config/db.js'
import { startScheduler } from './config/scheduler.js'
import { verifyMailer } from './config/mailer.js'
import cryptoRoutes from './routes/crypto.js'
import authRoutes from './routes/auth.js'
import watchlistRoutes from './routes/watchlist.js'
import alertsRoutes from './routes/alerts.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 5000

app.use(cors({
  origin: [
    process.env.CLIENT_URL,
    'http://localhost:5173',
    /\.vercel\.app$/,
  ],
  credentials: true,
}))
app.use(express.json())

app.use('/api/crypto', cryptoRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/watchlist', watchlistRoutes)
app.use('/api/alerts', alertsRoutes)

app.get('/health', (_, res) => res.json({ status: 'ok' }))

async function bootstrap() {
  await initDB()
  await verifyMailer()
  startScheduler()
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`)
  })
}

bootstrap().catch((err) => {
  console.error('Fatal startup error:', err)
  process.exit(1)
})