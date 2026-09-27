# Gugee

Gugee is a dark crypto analytics platform with live market data, research tools, user accounts, server-side watchlists, email verification, and password reset.

## Stack

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js + Express
- Database: PostgreSQL
- Authentication: bcrypt + JWT HttpOnly cookie
- Account email: Resend
- Market data: CoinGecko, CoinPaprika fallback, and exchange APIs

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

The server initializes its account, wallet, and community tables on startup.

## Financial flow status

Gugee records internal USDT and crypto balances in PostgreSQL. Those balances are not on-chain custody or exchange order matching. New deposits, card setup, card purchases, subscriptions, withdrawals, internal buy/sell trades, task claims, and new prize entries are paused by default. Their POST endpoints return HTTP 503 and the account page hides their controls. Existing balances, history, cancellation/review of existing obligations, and verified Stripe webhooks remain accessible. `GET /api/features` reports `transactionsEnabled: false`. Only set `GUGEE_TRANSACTIONS_ENABLED=true` after a merchant provider and business requirements are approved and the existing payment integration is tested. A success URL alone never confirms payment. Do not present internal balances as externally held crypto or advertise automated withdrawals.

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
