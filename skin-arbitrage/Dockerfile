FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY arbitrage ./arbitrage

CMD ["python", "-m", "arbitrage.main", "--config", "/app/config.yaml"]
