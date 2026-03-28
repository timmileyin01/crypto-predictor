#!/bin/bash
pip install --upgrade pip
pip install --only-binary=:all: numpy==1.26.4
pip install --only-binary=:all: pandas==2.2.2
pip install --only-binary=:all: scikit-learn==1.5.0
pip install tensorflow-cpu==2.16.1
pip install fastapi==0.111.0
pip install uvicorn[standard]==0.30.1
pip install pydantic==2.7.4
pip install yfinance==0.2.40
pip install psycopg2-binary==2.9.9
pip install python-dotenv==1.0.1
