import axios from 'axios'
import { pool } from './db.js'

const coingecko = axios.create({
  baseURL: 'https://api.coingecko.com/api/v3',
  timeout: 30000,
})

// Fallback static map for when DB is not available
const SYMBOL_MAP = {
  BTCUSDT: 'bitcoin',
  ETHUSDT: 'ethereum',
  SOLUSDT: 'solana',
  BNBUSDT: 'binancecoin',
}

async function getCoinId(symbol) {
  try {
    const { rows } = await pool.query(
      'SELECT coin_id FROM coin_map WHERE symbol = $1',
      [symbol.toUpperCase()]
    )
    if (rows.length > 0) return rows[0].coin_id
  } catch { /* fall through */ }

  // Fallback to static map
  const coinId = SYMBOL_MAP[symbol.toUpperCase()]
  if (!coinId) throw new Error(`Unsupported symbol: ${symbol}`)
  return coinId
}

export async function fetchDailyCandles(symbol, limit = 365) {
  const coinId = await getCoinId(symbol)

  const { data } = await coingecko.get(`/coins/${coinId}/ohlc`, {
    params: { vs_currency: 'usd', days: 90 },
  })

  return data.map((k) => ({
    time: new Date(k[0]).toISOString(),
    symbol: symbol.toUpperCase(),
    open: k[1],
    high: k[2],
    low: k[3],
    close: k[4],
    volume: 0,
  }))
}

export async function fetchCurrentPrice(symbol) {
  const coinId = await getCoinId(symbol)

  const { data } = await coingecko.get('/simple/price', {
    params: {
      ids: coinId,
      vs_currencies: 'usd',
      include_24hr_change: true,
      include_24hr_vol: true,
      include_market_cap: true,
    },
  })

  const coin = data[coinId]
  return {
    symbol: symbol.toUpperCase(),
    price: coin.usd,
    change24h: coin.usd_24h_change,
    high24h: null,
    low24h: null,
    volume24h: coin.usd_24h_vol,
    marketCap: coin.usd_market_cap,
    change7d: null,
  }
}

export async function searchCoins(query) {
  const { data } = await coingecko.get('/search', {
    params: { query },
  })

  return data.coins.slice(0, 10).map((c) => ({
    id: c.id,
    name: c.name,
    symbol: c.symbol.toUpperCase() + 'USDT',
    coinId: c.id,
    thumb: c.thumb,
  }))
}

export async function fetchCoinOHLC(coinId, symbol) {
  const { data } = await coingecko.get(`/coins/${coinId}/ohlc`, {
    params: { vs_currency: 'usd', days: 90 },
  })

  return data.map((k) => ({
    time: new Date(k[0]).toISOString(),
    symbol: symbol.toUpperCase(),
    open: k[1],
    high: k[2],
    low: k[3],
    close: k[4],
    volume: 0,
  }))
}