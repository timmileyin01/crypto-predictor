# ⬡ CryptoLSTM — Daily Crypto Price Predictor

A full-stack cryptocurrency price prediction app powered by LSTM neural networks. Predicts daily closing prices for crypto assets using historical OHLCV data, with a real-time dashboard, user authentication, watchlists, and email alerts.

![Stack](https://img.shields.io/badge/Stack-MERN%20%2B%20Python-6366f1)
![ML](https://img.shields.io/badge/ML-LSTM%20%2F%20TensorFlow-34d399)
![DB](https://img.shields.io/badge/DB-TimescaleDB-f59e0b)
![License](https://img.shields.io/badge/License-MIT-blue)

---

## 📸 Features

- 🤖 **LSTM predictions** — daily closing price predictions for any crypto
- 📈 **Live ticker** — real-time price with 24h change and market cap
- 🔔 **Price alerts** — email notifications when live price or predicted price crosses a threshold
- 👤 **User authentication** — JWT-based register/login
- ⭐ **Watchlist** — personal list of tracked symbols with predictions
- ➕ **Add any coin** — search and add any CoinGecko-listed cryptocurrency
- 📊 **Model accuracy** — track predicted vs actual prices over time (MAPE score)
- 🔄 **Fully automated** — daily data fetch + predictions via cron job

---

## 🏗️ Architecture

```
React (Vite) → Express API → TimescaleDB Cloud
                           → Python FastAPI (LSTM)
                           ← Yahoo Finance (yfinance)
                           → Gmail (nodemailer)
```

### Services
| Service | Technology | Port |
|---------|-----------|------|
| Frontend | React + Vite + Recharts | 5173 |
| Backend API | Node.js + Express | 5000 |
| ML Service | Python + FastAPI + TensorFlow | 8000 |
| Database | TimescaleDB Cloud (PostgreSQL) | 36704 |

---

## 🧠 ML Model

- **Architecture**: LSTM (128 units) → Dropout(0.2) → LSTM(64) → Dropout(0.2) → Dense(1)
- **Input**: Last 60 days of daily closing prices (MinMax scaled)
- **Output**: Next day's predicted closing price
- **Training data**: Last 3 years of daily OHLCV from Yahoo Finance
- **Early stopping**: Patience of 10 epochs (prevents overfitting)
- **Optimizer**: Adam | **Loss**: Mean Squared Error

---

## 📁 Project Structure

```
crypto-predictor/
├── client/                  # React frontend (Vite)
│   ├── src/
│   │   ├── App.jsx          # Main dashboard
│   │   ├── Auth.jsx         # Login / Register
│   │   ├── Watchlist.jsx    # Personal watchlist
│   │   ├── Alerts.jsx       # Price alerts UI
│   │   ├── Accuracy.jsx     # Model accuracy chart
│   │   ├── AddSymbol.jsx    # Add new coin modal
│   │   ├── App.css          # Dark theme styles
│   │   └── api.js           # Axios API client
│   ├── package.json
│   └── vite.config.js
│
├── server/                  # Node.js + Express backend
│   ├── src/
│   │   ├── config/
│   │   │   ├── db.js        # TimescaleDB connection + schema
│   │   │   ├── market.js    # CoinGecko price fetcher
│   │   │   ├── mailer.js    # Gmail email service
│   │   │   └── scheduler.js # Cron jobs
│   │   ├── controllers/
│   │   │   ├── cryptoController.js
│   │   │   ├── authController.js
│   │   │   ├── watchlistController.js
│   │   │   └── alertsController.js
│   │   ├── routes/
│   │   │   ├── crypto.js
│   │   │   ├── auth.js
│   │   │   ├── watchlist.js
│   │   │   └── alerts.js
│   │   ├── middleware/
│   │   │   └── auth.js      # JWT middleware
│   │   └── index.js         # Entry point
│   ├── data/                # CSV files for bulk import
│   ├── importCSV.js         # CSV import script
│   ├── package.json
│   └── .env.example
│
└── ml/                      # Python ML service
    ├── main.py              # FastAPI entry point
    ├── model.py             # LSTMPredictor class
    ├── fetch_data.py        # yfinance data fetcher
    ├── models/              # Saved .keras model files
    ├── requirements.txt
    └── venv/                # Python virtual environment
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js v18+
- Python 3.10+
- TimescaleDB Cloud account (free tier)

### 1. Clone the repository
```bash
git clone https://github.com/YOUR_USERNAME/crypto-predictor.git
cd crypto-predictor
```

### 2. Set up TimescaleDB Cloud
1. Sign up at https://cloud.timescale.com (free tier)
2. Create a new service
3. Copy your connection credentials

### 3. Backend setup
```bash
cd server
npm install
cp .env.example .env
# Fill in your credentials in .env
npx nodemon src/index.js
```

### 4. ML service setup
```bash
cd ml
python -m venv venv
source venv/Scripts/activate   # Windows
# source venv/bin/activate     # Mac/Linux
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 5. Fetch historical data
```bash
cd ml
python fetch_data.py history
```

### 6. Train models
```bash
# Train for each symbol
curl -X POST http://localhost:5000/api/crypto/BTCUSDT/train
curl -X POST http://localhost:5000/api/crypto/ETHUSDT/train
curl -X POST http://localhost:5000/api/crypto/SOLUSDT/train
curl -X POST http://localhost:5000/api/crypto/BNBUSDT/train
curl -X POST http://localhost:5000/api/crypto/DOGEUSDT/train
```

### 7. Frontend setup
```bash
cd client
npm install
npm run dev
```

Open http://localhost:5173

---

## ⚙️ Environment Variables

Create `server/.env` from `server/.env.example`:

```env
PORT=5000

# TimescaleDB Cloud
DB_HOST=your_host.tsdb.cloud.timescale.com
DB_PORT=36704
DB_NAME=tsdb
DB_USER=tsdbadmin
DB_PASSWORD=your_password

# Python ML service
ML_SERVICE_URL=http://localhost:8000

# CORS
CLIENT_URL=http://localhost:5173

# JWT
JWT_SECRET=your_jwt_secret_key

# Gmail alerts
GMAIL_USER=your@gmail.com
GMAIL_APP_PASSWORD=your_app_password
```

---

## 🔌 API Endpoints

### Auth
| Method | Endpoint | Description |
|--------|---------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login |
| GET | `/api/auth/me` | Get current user |

### Crypto
| Method | Endpoint | Description |
|--------|---------|-------------|
| GET | `/api/crypto/symbols` | List all symbols |
| GET | `/api/crypto/search?q=` | Search coins |
| POST | `/api/crypto/symbols` | Add new symbol |
| POST | `/api/crypto/:symbol/fetch` | Fetch candles from CoinGecko |
| GET | `/api/crypto/:symbol/history` | OHLCV history |
| POST | `/api/crypto/:symbol/train` | Train LSTM model |
| GET | `/api/crypto/:symbol/prediction` | Get prediction |
| GET | `/api/crypto/:symbol/prediction-history` | Prediction vs actual |
| GET | `/api/crypto/:symbol/ticker` | Live price ticker |

### Watchlist (protected)
| Method | Endpoint | Description |
|--------|---------|-------------|
| GET | `/api/watchlist` | Get user watchlist |
| GET | `/api/watchlist/predictions` | Watchlist with predictions |
| POST | `/api/watchlist` | Add symbol |
| DELETE | `/api/watchlist/:symbol` | Remove symbol |

### Alerts (protected)
| Method | Endpoint | Description |
|--------|---------|-------------|
| GET | `/api/alerts` | Get user alerts |
| POST | `/api/alerts` | Create alert |
| DELETE | `/api/alerts/:id` | Delete alert |

---

## 🤖 ML Service Endpoints

| Method | Endpoint | Description |
|--------|---------|-------------|
| GET | `/health` | Health check + loaded models |
| POST | `/train` | Train LSTM for a symbol |
| POST | `/predict` | Predict next closing price |

---

## 📅 Automated Jobs

The scheduler runs two jobs automatically:

### Daily job (00:10 UTC)
1. Fetches latest OHLCV from Yahoo Finance via Python
2. Generates predictions for all symbols
3. Stores predictions in TimescaleDB
4. Checks prediction-based alerts and sends emails

### Live price check (every 5 minutes)
1. Fetches current price from CoinGecko for all symbols with active alerts
2. Checks against user alert thresholds
3. Sends email if threshold is crossed (max once per hour per alert)

---

## 🗄️ Database Schema

```sql
-- Time-series OHLCV data (TimescaleDB hypertable)
ohlcv (time, symbol, open, high, low, close, volume)

-- ML predictions
predictions (id, symbol, predicted_for, predicted_close, actual_close, model_version, created_at)

-- Tracked symbols
symbols (symbol, base_asset, quote_asset, added_at)

-- CoinGecko ID mapping
coin_map (symbol, coin_id, name, added_at)

-- Users
users (id, email, password, name, created_at)

-- User watchlists
watchlists (id, user_id, symbol, added_at)

-- Price alerts
alerts (id, user_id, symbol, condition, threshold, triggered, triggered_at, created_at)
```

---

## 🚢 Deployment

| Service | Platform |
|---------|---------|
| Frontend | Vercel (free) |
| Express API | Render (free) |
| Python ML | Render (free) |
| Database | TimescaleDB Cloud (free) |

See deployment guide in `DEPLOY.md`.

---

## 🛠️ Tech Stack

**Frontend**
- React 18 + Vite
- Recharts (charts)
- Lucide React (icons)
- Axios (HTTP client)

**Backend**
- Node.js + Express
- PostgreSQL (pg) + TimescaleDB
- JWT (jsonwebtoken)
- bcryptjs (password hashing)
- nodemailer (email)
- node-cron (scheduling)

**ML Service**
- Python 3.10
- FastAPI + Uvicorn
- TensorFlow / Keras (LSTM)
- scikit-learn (MinMaxScaler)
- yfinance (market data)
- psycopg2 (PostgreSQL)

**Database**
- TimescaleDB Cloud (PostgreSQL extension)
- Hypertable for time-series OHLCV data

---

## 📄 License

MIT — free to use, modify and distribute.

---

Built with ❤️ using MERN Stack + Python LSTM
