import pickle
import numpy as np
import sys
sys.path.append('.')

with open('models/BTCUSDT_scaler.pkl', 'rb') as f:
    data = pickle.load(f)

scaler = data['scaler']
print('data_min:', scaler.data_min_)
print('data_max:', scaler.data_max_)

# Check the actual CSV data
import csv
with open('../server/data/BTCUSDT.csv', 'r') as f:
    reader = csv.DictReader(f)
    rows = list(reader)

print('Total rows:', len(rows))
print('First row:', rows[0])
print('Last row:', rows[-1])
print('Sample closes:', [rows[i]['Close'] for i in [0, 100, 500, 1000, -1]])