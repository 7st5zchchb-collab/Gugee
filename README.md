# Gugee

Gugee is a dark crypto analytics platform with live market data, research tools, user accounts, and server-side watchlists.

## Stack

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js + Express
- Database: PostgreSQL
- Authentication: bcrypt + JWT HttpOnly cookie
- Market data: CoinGecko and exchange APIs

## Run locally

1. Install Node.js 20+.
2. Create a PostgreSQL database.
3. Copy `.env.example` to `.env`.
4. Set `DATABASE_URL` and a long random `JWT_SECRET`.
5. Run:

```bash
npm install
npm start
```

Then open `http://localhost:3000`.

## Render

The repository includes `render.yaml`. A Render Blueprint can create the web service and PostgreSQL database automatically.

Required environment variables:

- `DATABASE_URL`
- `JWT_SECRET`
- `NODE_ENV=production`

The server initializes the `users` and `watchlist` tables automatically on startup.

## API

- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `GET /api/watchlist`
- `PUT /api/watchlist`
