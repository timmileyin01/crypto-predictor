import yfinance as yf
import psycopg2
import os
import sys
from dotenv import load_dotenv

load_dotenv('../server/.env')

# Default symbol map — extended automatically from coin_map table
DEFAULT_MAP = {
    'BTCUSDT':  'BTC-USD',
    'ETHUSDT':  'ETH-USD',
    'SOLUSDT':  'SOL-USD',
    'BNBUSDT':  'BNB-USD',
    'DOGEUSDT': 'DOGE-USD',
}

def get_db():
    return psycopg2.connect(
        host=os.getenv('DB_HOST'),
        port=os.getenv('DB_PORT'),
        dbname=os.getenv('DB_NAME'),
        user=os.getenv('DB_USER'),
        password=os.getenv('DB_PASSWORD'),
        sslmode='require',
    )

def get_symbol_map():
    """Load symbol -> yfinance ticker mapping from coin_map table."""
    conn = get_db()
    cur  = conn.cursor()
    cur.execute("SELECT symbol, coin_id FROM coin_map")
    rows = cur.fetchall()
    cur.close()
    conn.close()

    symbol_map = dict(DEFAULT_MAP)

    for symbol, coin_id in rows:
        if symbol not in symbol_map:
            # Convert CoinGecko ID to Yahoo Finance ticker
            # e.g. "cardano" -> "ADA-USD", "avalanche-2" -> "AVAX-USD"
            yf_ticker = coin_id_to_yf(symbol, coin_id)
            if yf_ticker:
                symbol_map[symbol] = yf_ticker

    return symbol_map

def coin_id_to_yf(symbol, coin_id):
    """
    Convert a symbol to Yahoo Finance ticker format.
    e.g. ADAUSDT -> ADA-USD
    """
    base = symbol.replace('USDT', '').replace('USD', '')
    return f'{base}-USD'

def fetch_and_store(symbol, yf_symbol, period='2y'):
    print(f'[{symbol}] Downloading {yf_symbol} from Yahoo Finance...')
    df = yf.download(yf_symbol, period=period, interval='1d', auto_adjust=True, progress=False)

    if df.empty:
        print(f'[{symbol}] No data returned for {yf_symbol}')
        return 0

    if isinstance(df.columns, type(df.columns)) and hasattr(df.columns, 'levels'):
        df.columns = df.columns.get_level_values(0)

    df = df.dropna(subset=['Close'])

    conn = get_db()
    cur  = conn.cursor()

    count = 0
    for date, row in df.iterrows():
        try:
            cur.execute(
                """
                INSERT INTO ohlcv (time, symbol, open, high, low, close, volume)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (time, symbol) DO UPDATE
                  SET open=EXCLUDED.open, high=EXCLUDED.high,
                      low=EXCLUDED.low, close=EXCLUDED.close,
                      volume=EXCLUDED.volume
                """,
                (
                    date.to_pydatetime(),
                    symbol,
                    float(row['Open']),
                    float(row['High']),
                    float(row['Low']),
                    float(row['Close']),
                    float(row['Volume']),
                )
            )
            count += 1
        except Exception as e:
            print(f'  Row error: {e}')

    conn.commit()
    cur.close()
    conn.close()

    print(f'[{symbol}] OK Upserted {count} candles')
    return count

def fetch_latest(symbol=None):
    symbol_map = get_symbol_map()
    symbols = [symbol] if symbol else list(symbol_map.keys())
    for s in symbols:
        yf_sym = symbol_map.get(s) or coin_id_to_yf(s, s)
        if yf_sym:
            fetch_and_store(s, yf_sym, period='5d')
        else:
            print(f'Warning: No Yahoo Finance mapping for {s}')

def fetch_all_history(symbol=None):
    symbol_map = get_symbol_map()
    symbols = [symbol] if symbol else list(symbol_map.keys())
    for s in symbols:
        yf_sym = symbol_map.get(s) or coin_id_to_yf(s, s)
        if yf_sym:
            fetch_and_store(s, yf_sym, period='2y')
        else:
            print(f'Warning: No Yahoo Finance mapping for {s}')
if __name__ == '__main__':
    mode   = sys.argv[1] if len(sys.argv) > 1 else 'latest'
    symbol = sys.argv[2] if len(sys.argv) > 2 else None

    if mode == 'history':
        fetch_all_history(symbol)
    else:
        fetch_latest(symbol)

    print('Done!')