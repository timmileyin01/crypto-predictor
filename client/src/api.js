import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export const cryptoApi = {
  getSymbols: () => api.get('/crypto/symbols'),
  getHistory: (symbol, days = 90) =>
    api.get(`/crypto/${symbol}/history`, { params: { days } }),
  trainModel: (symbol) => api.post(`/crypto/${symbol}/train`),
  getPrediction: (symbol) => api.get(`/crypto/${symbol}/prediction`),
  getPredictionHistory: (symbol) => api.get(`/crypto/${symbol}/prediction-history`),
  getTicker: (symbol) => api.get(`/crypto/${symbol}/ticker`),
}

export const authApi = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
}

export const watchlistApi = {
  get: () => api.get('/watchlist'),
  getWithPredictions: () => api.get('/watchlist/predictions'),
  add: (symbol) => api.post('/watchlist', { symbol }),
  remove: (symbol) => api.delete(`/watchlist/${symbol}`),
}

export const symbolsApi = {
  search: (q) => api.get(`/crypto/search?q=${encodeURIComponent(q)}`),
  add: (symbol, coinId, name) => api.post('/crypto/symbols', { symbol, coinId, name }),
  getAll: () => api.get('/crypto/symbols'),
  delete: (symbol) => api.delete(`/crypto/symbols/${symbol}`),
}

export const alertsApi = {
  get: () => api.get('/alerts'),
  create: (data) => api.post('/alerts', data),
  delete: (id) => api.delete(`/alerts/${id}`),
}