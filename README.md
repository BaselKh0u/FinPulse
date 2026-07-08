# FinPulse

React Native mobile application for financial sentiment and stock monitoring.

## Tech Stack
- React Native (Expo)
- ASP.NET Core Web API
- SQL Server
- Python (NLTK/VADER) — NLP sentiment microservice

## Project Structure
- `mobile/`           → React Native App
- `server/`           → ASP.NET Core Web API
- `sentiment_service/`→ Python NLP microservice (VADER)
- `docs/`             → Documentation

## Running the Project

### 1. Sentiment Service (Python) — port 8765
Must be started **before** the server so sentiment scoring uses the NLP model.

```bash
cd sentiment_service
pip install -r requirements.txt   # first time only
python -m uvicorn main:app --host 0.0.0.0 --port 8765
```

> If the service is not running, the server falls back to keyword-based scoring automatically — ingestion still works.

### 2. Server (ASP.NET Core) — port 5179
```bash
cd server
powershell -ExecutionPolicy Bypass -File .\dev-run.ps1
```

### 3. Mobile (Expo)
```bash
cd mobile
npx expo start
```
Scan the QR code with Expo Go on your phone.

## Team
- Basel → Frontend
- Eden → Backend
- Ofek → Data & Charts
