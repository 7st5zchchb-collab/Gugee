# Gugee

Gugee is a dark crypto analytics platform with live market data, research tools, user accounts, server-side watchlists, email verification, and password reset.

## Stack

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js + Express
- Database: PostgreSQL
- Authentication: bcrypt + JWT HttpOnly cookie
- Account email: Resend
- Market data: CoinGecko and exchange APIs

## Run locally

1. Install Node.js 20+.
2. Create a PostgreSQL database.
3. Copy `.env.example` to `.env`.
4. Set `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL`, `RESEND_API_KEY`, and `EMAIL_FROM`.
5. Run:

```bash
npm install
npm start
```

Then open `http://localhost:3000`.

## Render

The repository includes `render.yaml`. A Render Blueprint can create the web service and PostgreSQL database automatically.

Required environment variables on the Gugee Web Service:

- `DATABASE_URL`
- `JWT_SECRET`
- `NODE_ENV=production`
- `FRONTEND_URL` — the public Gugee URL, currently `https://gugee.onrender.com` unless a custom domain is configured
- `RESEND_API_KEY`
- `EMAIL_FROM` — for example `Gugee <noreply@gugee.com>`

Resend must have the sending domain verified before email delivery from `noreply@gugee.com` can work.

The server initializes the `users` and `watchlist` tables automatically on startup.

## Account email flows

- Register creates a 24-hour email verification token.
- Verification is handled by `GET /api/auth/verify-email`.
- Forgot password creates a 1-hour reset token.
- Password reset is handled by `POST /api/auth/reset-password`.

## API

- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `GET /api/auth/verify-email`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `GET /api/watchlist`
- `PUT /api/watchlist`
