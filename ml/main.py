import os
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
os.environ['TF_ENABLE_ONEDNN_OPTS'] = '0'

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import numpy as np
import psycopg2
import pickle
import io
import tempfile
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title='Crypto LSTM Predictor', version='1.0.0')

predictors = {}

def get_db():
    return psycopg2.connect(
        host=os.getenv('DB_HOST'),
        port=os.getenv('DB_PORT'),
        dbname=os.getenv('DB_NAME'),
        user=os.getenv('DB_USER'),
        password=os.getenv('DB_PASSWORD'),
        sslmode='require',
    )

class TrainRequest(BaseModel):
    symbol: str
    prices: List[float]
    epochs: Optional[int] = 50
    lookback: Optional[int] = 60

    model_config = {'protected_namespaces': ()}

class PredictRequest(BaseModel):
    symbol: str
    prices: List[float]

class TrainResponse(BaseModel):
    symbol: str
    status: str
    epochs_trained: int
    training_samples: int
    final_loss: float
    model_version: str

    model_config = {'protected_namespaces': ()}

class PredictResponse(BaseModel):
    symbol: str
    predicted_close: float
    model_version: str

    model_config = {'protected_namespaces': ()}

def save_model_to_db(symbol: str, predictor):
    """Save trained model to TimescaleDB as binary."""
    from model import LSTMPredictor
    import tensorflow as tf

    # Save keras model to bytes
    with tempfile.NamedTemporaryFile(suffix='.keras', delete=False) as f:
        tmp_path = f.name
    predictor.model.save(tmp_path)
    with open(tmp_path, 'rb') as f:
        model_bytes = f.read()
    os.unlink(tmp_path)

    # Save scaler to bytes
    scaler_bytes = pickle.dumps({
        'scaler': predictor.scaler,
        'lookback': predictor.lookback,
        'version': predictor.version,
    })

    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO trained_models (symbol, model_data, scaler_data, lookback, version)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (symbol) DO UPDATE
          SET model_data=EXCLUDED.model_data,
              scaler_data=EXCLUDED.scaler_data,
              lookback=EXCLUDED.lookback,
              version=EXCLUDED.version,
              created_at=NOW()
        """,
        (symbol, psycopg2.Binary(model_bytes), psycopg2.Binary(scaler_bytes),
         predictor.lookback, predictor.version)
    )
    conn.commit()
    cur.close()
    conn.close()
    print(f'[DB] Model saved for {symbol}')

def load_model_from_db(symbol: str):
    """Load trained model from TimescaleDB."""
    from model import LSTMPredictor
    import tensorflow as tf

    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        'SELECT model_data, scaler_data, lookback, version FROM trained_models WHERE symbol = %s',
        (symbol,)
    )
    row = cur.fetchone()
    cur.close()
    conn.close()

    if not row:
        raise HTTPException(
            status_code=404,
            detail=f'No trained model found for {symbol}. POST /train first.'
        )

    model_bytes, scaler_bytes, lookback, version = row

    # Restore keras model from bytes
    with tempfile.NamedTemporaryFile(suffix='.keras', delete=False) as f:
        f.write(bytes(model_bytes))
        tmp_path = f.name

    from tensorflow.keras.models import load_model
    keras_model = load_model(tmp_path)
    os.unlink(tmp_path)

    # Restore scaler
    scaler_data = pickle.loads(bytes(scaler_bytes))

    predictor = LSTMPredictor(symbol, lookback=lookback)
    predictor.model = keras_model
    predictor.scaler = scaler_data['scaler']
    predictor.version = scaler_data['version']

    return predictor

def get_or_load(symbol: str):
    if symbol in predictors:
        return predictors[symbol]
    predictor = load_model_from_db(symbol)
    predictors[symbol] = predictor
    return predictor

@app.get("/health")
def health():
    return {'status': 'ok', 'loaded_models': list(predictors.keys())}

@app.post('/train', response_model=TrainResponse)
def train(req: TrainRequest):
    from model import LSTMPredictor
    symbol = req.symbol.upper()

    if len(req.prices) < req.lookback + 1:
        raise HTTPException(
            status_code=400,
            detail=f'Need at least {req.lookback + 1} prices, got {len(req.prices)}'
        )

    predictor = LSTMPredictor(symbol, lookback=req.lookback)
    result = predictor.train(
        prices=np.array(req.prices, dtype=np.float64),
        epochs=req.epochs,
    )

    # Save to database instead of disk
    save_model_to_db(symbol, predictor)
    predictors[symbol] = predictor

    return TrainResponse(
        symbol=symbol,
        status='trained',
        epochs_trained=req.epochs,
        training_samples=result['training_samples'],
        final_loss=result['final_loss'],
        model_version=predictor.version,
    )

@app.post('/predict', response_model=PredictResponse)
def predict(req: PredictRequest):
    symbol = req.symbol.upper()
    predictor = get_or_load(symbol)

    if len(req.prices) < predictor.lookback:
        raise HTTPException(
            status_code=400,
            detail=f'Need at least {predictor.lookback} prices, got {len(req.prices)}'
        )

    predicted = predictor.predict(np.array(req.prices, dtype=np.float64))

    return PredictResponse(
        symbol=symbol,
        predicted_close=round(float(predicted), 4),
        model_version=predictor.version,
    )

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port)