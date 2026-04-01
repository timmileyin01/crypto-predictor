import os
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
os.environ['TF_ENABLE_ONEDNN_OPTS'] = '0'

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Optional
import numpy as np

app = FastAPI(title='Crypto LSTM Predictor', version='1.0.0')

predictors = {}
MODELS_DIR = "./models"
os.makedirs(MODELS_DIR, exist_ok=True)


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


def get_or_load(symbol: str):
    if symbol in predictors:
        return predictors[symbol]
    from model import LSTMPredictor
    model_path = os.path.join(MODELS_DIR, f'{symbol}.keras')
    if os.path.exists(model_path):
        p = LSTMPredictor(symbol)
        p.load(model_path)
        predictors[symbol] = p
        return p
    raise HTTPException(
        status_code=404,
        detail=f'No trained model found for {symbol}. POST /train first.'
    )


@app.api_route("/health", methods=["GET", "HEAD"])
def health(request: Request):
    if request.method == "HEAD":
        return JSONResponse(content={}, status_code=200)
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

    model_path = os.path.join(MODELS_DIR, f'{symbol}.keras')
    predictor.save(model_path)
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