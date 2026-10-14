# PayPilot AI

PayPilot AI is a React/Vite client with an Express, MongoDB-backed API.

## Project layout

- `client/` — React application
- `server/` — Express API and MongoDB models

## Run locally

1. Install dependencies in `client/` and `server/` with `npm install`.
2. Copy `server/.env.example` to `server/.env` and set `MONGODB_URI`.
3. Start the API from `server/` with `npm run dev`.
4. Start the client from `client/` with `npm run dev`.

The API listens on port `5000` by default. Set `VITE_API_URL` in
`client/.env.local` to override the API base URL; it defaults to
`http://localhost:5000/api`.

The checkout page is a UI scaffold only; it does not create or charge payments.
