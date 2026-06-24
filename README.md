# BlueMind Docs Frontend

Frontend-only repository for BlueMind Docs.

Contains only UI files, styling, assets, routing, and the document editor interface. Backend APIs, database, authentication, uploads, and business logic live in `bluemind-docs-backend`.

## Local Run

```powershell
npm.cmd start
```

Open `http://127.0.0.1:3000`.

## Backend API URL

The frontend reads `window.BLUE_MIND_DOCS_API_URL` from `config.js`. For production, set this to the deployed backend API origin.
