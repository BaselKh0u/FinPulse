# FinPulse

React Native mobile application for financial sentiment and stock monitoring.

## Tech Stack
- React Native (Expo)
- ASP.NET Core Web API
- SQL Server

## Project Structure
- mobile/ → React Native App
- server/ → Web API
- docs/ → Documentation

## Run Server (Windows)
- From `server/`, run: `powershell -ExecutionPolicy Bypass -File .\dev-run.ps1`
- This script auto-stops anything listening on port `5179`, builds, and starts the API.

## Team
- Basel → Frontend
- Eden → Backend
- Ofek → Data & Charts
