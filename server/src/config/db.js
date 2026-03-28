import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

export async function initDB() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ohlcv (
        time        TIMESTAMPTZ      NOT NULL,
        symbol      TEXT             NOT NULL,
        open        DOUBLE PRECISION NOT NULL,
        high        DOUBLE PRECISION NOT NULL,
        low         DOUBLE PRECISION NOT NULL,
        close       DOUBLE PRECISION NOT NULL,
        volume      DOUBLE PRECISION NOT NULL,
        PRIMARY KEY (time, symbol)
      );
    `);

    await client.query(`
      SELECT create_hypertable('ohlcv', 'time', if_not_exists => TRUE);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ohlcv_symbol ON ohlcv (symbol, time DESC);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS predictions (
        id              SERIAL PRIMARY KEY,
        symbol          TEXT             NOT NULL,
        predicted_for   DATE             NOT NULL,
        predicted_close DOUBLE PRECISION NOT NULL,
        actual_close    DOUBLE PRECISION,
        model_version   TEXT,
        created_at      TIMESTAMPTZ      DEFAULT NOW(),
        UNIQUE (symbol, predicted_for)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS symbols (
        symbol      TEXT PRIMARY KEY,
        base_asset  TEXT NOT NULL,
        quote_asset TEXT NOT NULL,
        added_at    TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      INSERT INTO symbols (symbol, base_asset, quote_asset) VALUES
        ('BTCUSDT', 'BTC', 'USDT'),
        ('ETHUSDT', 'ETH', 'USDT'),
        ('SOLUSDT', 'SOL', 'USDT'),
        ('BNBUSDT', 'BNB', 'USDT')
      ON CONFLICT DO NOTHING;
    `);

    // Users table
    await client.query(`
  CREATE TABLE IF NOT EXISTS users (
    id          SERIAL PRIMARY KEY,
    email       TEXT UNIQUE NOT NULL,
    password    TEXT NOT NULL,
    name        TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
  );
`);

    // User watchlists
    await client.query(`
  CREATE TABLE IF NOT EXISTS watchlists (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
    symbol     TEXT NOT NULL,
    added_at   TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, symbol)
  );
`);

// Maps our symbol names to CoinGecko coin IDs for dynamic symbols
await client.query(`
  CREATE TABLE IF NOT EXISTS coin_map (
    symbol   TEXT PRIMARY KEY,
    coin_id  TEXT NOT NULL,
    name     TEXT NOT NULL,
    added_at TIMESTAMPTZ DEFAULT NOW()
  );
`)

// Seed default coin mappings
await client.query(`
  INSERT INTO coin_map (symbol, coin_id, name) VALUES
    ('BTCUSDT', 'bitcoin',     'Bitcoin'),
    ('ETHUSDT', 'ethereum',    'Ethereum'),
    ('SOLUSDT', 'solana',      'Solana'),
    ('BNBUSDT', 'binancecoin', 'BNB')
  ON CONFLICT DO NOTHING;
`)

// Price alerts table
await client.query(`
  CREATE TABLE IF NOT EXISTS alerts (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER REFERENCES users(id) ON DELETE CASCADE,
    symbol          TEXT NOT NULL,
    condition       TEXT NOT NULL CHECK (condition IN ('above', 'below')),
    threshold       DOUBLE PRECISION NOT NULL,
    triggered       BOOLEAN DEFAULT FALSE,
    triggered_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
  );
`)

// Stores trained LSTM models as binary blobs
await client.query(`
  CREATE TABLE IF NOT EXISTS trained_models (
    symbol       TEXT PRIMARY KEY,
    model_data   BYTEA NOT NULL,
    scaler_data  BYTEA NOT NULL,
    lookback     INTEGER NOT NULL,
    version      TEXT NOT NULL,
    created_at   TIMESTAMPTZ DEFAULT NOW()
  );
`)


await client.query(`
  ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;
`)

// Make your account admin
await client.query(`
  UPDATE users SET is_admin = TRUE WHERE email = 'oluwasseyitimm03@gmail.com';
`)

    await client.query("COMMIT");
    console.log("✅ TimescaleDB schema ready");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
