import fs from 'fs'
import path from 'path'
import { parse } from 'csv-parse/sync'
import { pool, initDB } from './src/config/db.js'
import dotenv from 'dotenv'

dotenv.config()

// Auto-detect all CSV files in the data folder
const DATA_DIR = './data'
const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('.csv'))
const SYMBOLS = files.map((f) => f.replace('.csv', ''))

async function importSymbol(symbol) {
  const filePath = path.join(DATA_DIR, `${symbol}.csv`)

  if (!fs.existsSync(filePath)) {
    console.warn(`⚠️  File not found: ${filePath} — skipping`)
    return
  }

  const content = fs.readFileSync(filePath, 'utf-8')
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
  })

  const candles = records
    .filter((r) => r.Date && r.Close && r.Close !== 'null')
    .map((r) => ({
      time: new Date(r.Date).toISOString(),
      symbol,
      open: parseFloat(r.Open),
      high: parseFloat(r.High),
      low: parseFloat(r.Low),
      close: parseFloat(r.Close),
      volume: parseFloat(r.Volume) || 0,
    }))
    .filter((c) => !isNaN(c.close))

  if (candles.length === 0) {
    console.warn(`⚠️  No valid rows found in ${symbol}.csv`)
    return
  }

  const times   = candles.map((c) => c.time)
  const opens   = candles.map((c) => c.open)
  const highs   = candles.map((c) => c.high)
  const lows    = candles.map((c) => c.low)
  const closes  = candles.map((c) => c.close)
  const volumes = candles.map((c) => c.volume)
  const symbols = candles.map((c) => c.symbol)

  await pool.query(
    `INSERT INTO ohlcv (time, symbol, open, high, low, close, volume)
     SELECT * FROM unnest(
       $1::timestamptz[], $2::text[],
       $3::float8[], $4::float8[], $5::float8[], $6::float8[], $7::float8[]
     )
     ON CONFLICT (time, symbol) DO UPDATE
       SET open=EXCLUDED.open, high=EXCLUDED.high, low=EXCLUDED.low,
           close=EXCLUDED.close, volume=EXCLUDED.volume`,
    [times, symbols, opens, highs, lows, closes, volumes]
  )

  console.log(`✅ ${symbol}: imported ${candles.length} candles`)
}

async function main() {
  await initDB()

  for (const symbol of SYMBOLS) {
    await importSymbol(symbol)
  }

  console.log('🎉 All done!')
  await pool.end()
}

main().catch((err) => {
  console.error('Import failed:', err)
  process.exit(1)
})