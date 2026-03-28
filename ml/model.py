import numpy as np
import pickle
import os
from datetime import datetime
from sklearn.preprocessing import MinMaxScaler
from tensorflow.keras.models import Sequential, load_model
from tensorflow.keras.layers import LSTM, Dense, Dropout, Input
from tensorflow.keras.callbacks import EarlyStopping


class LSTMPredictor:
    def __init__(self, symbol: str, lookback: int = 60):
        self.symbol = symbol
        self.lookback = lookback
        self.model = None
        self.scaler = MinMaxScaler(feature_range=(0, 1))
        self.version = datetime.utcnow().strftime("%Y%m%d_%H%M%S")

    def _make_sequences(self, scaled):
        X, y = [], []
        for i in range(self.lookback, len(scaled)):
            X.append(scaled[i - self.lookback:i, 0])
            y.append(scaled[i, 0])
        return np.array(X)[..., np.newaxis], np.array(y)

    def _build(self):
        model = Sequential([
            Input(shape=(self.lookback, 1)),
            LSTM(128, return_sequences=True),
            Dropout(0.2),
            LSTM(64, return_sequences=False),
            Dropout(0.2),
            Dense(1),
        ])
        model.compile(optimizer='adam', loss='mean_squared_error')
        return model

    def train(self, prices: np.ndarray, epochs: int = 50, batch_size: int = 32):
        prices = prices.reshape(-1, 1)

        # Fit scaler on ALL prices so it knows the full range
        self.scaler.fit(prices)
        scaled = self.scaler.transform(prices)

        X, y = self._make_sequences(scaled)

        split = int(len(X) * 0.8)
        X_train, X_val = X[:split], X[split:]
        y_train, y_val = y[:split], y[split:]

        self.model = self._build()

        early_stop = EarlyStopping(
            monitor='val_loss',
            patience=10,
            restore_best_weights=True,
            verbose=1,
        )

        history = self.model.fit(
            X_train, y_train,
            validation_data=(X_val, y_val),
            epochs=epochs,
            batch_size=batch_size,
            callbacks=[early_stop],
            verbose=1,
        )

        self.version = datetime.utcnow().strftime("%Y%m%d_%H%M%S")

        return {
            'training_samples': len(X_train),
            'final_loss': float(history.history['val_loss'][-1]),
        }

    def predict(self, prices: np.ndarray) -> float:
        if self.model is None:
            raise RuntimeError('Model not trained or loaded.')

        # Use the last `lookback` prices
        window = prices[-self.lookback:].reshape(-1, 1)

        # Scale using the scaler fitted on full training data
        scaled = self.scaler.transform(window)
        scaled = np.clip(scaled, 0, 1)

        X = scaled.reshape(1, self.lookback, 1)
        pred_scaled = self.model.predict(X, verbose=0)

        # Inverse transform to get real price
        predicted = self.scaler.inverse_transform(pred_scaled)
        return float(predicted[0, 0])

    def save(self, model_path: str):
        self.model.save(model_path)
        scaler_path = model_path.replace('.keras', '_scaler.pkl')
        with open(scaler_path, 'wb') as f:
            pickle.dump(
                {
                    'scaler': self.scaler,
                    'lookback': self.lookback,
                    'version': self.version
                }, f
            )

    def load(self, model_path: str):
        self.model = load_model(model_path)
        scaler_path = model_path.replace('.keras', '_scaler.pkl')
        with open(scaler_path, 'rb') as f:
            data = pickle.load(f)
        self.scaler = data['scaler']
        self.lookback = data['lookback']
        self.version = data['version']