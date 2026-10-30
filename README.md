# iMovies

iMovies is a React movie discovery and ticket booking application backed by a modular Express API and MongoDB. The maintained customer app lives in **frontend/**, the protected operations panel in **admin/**, and the API in **backend/**. Movie poster and trailer artwork in **frontend/src/assets/** is preserved and reused by the preview catalog and seeded movies.

The **merge/** directory was inspected. It contains another Vite starter and incomplete copies of customer components, but it is not wired to either maintained app or the backend. It remains separate and is not part of the supported run commands.

## Architecture

    Customer React/Vite app ─┐
                             ├─ HTTP-only session + CSRF ─ Express API ─ Mongoose ─ MongoDB
    Admin React/Vite app ────┘                            ├─ Socket.IO seat updates
                                                          ├─ Stripe Checkout/webhooks (optional)
                                                          └─ SMTP booking email (optional)

The backend is a modular monolith. MongoDB is the only application database; there is no MySQL or AMQP/RabbitMQ implementation. Booking correctness is enforced with a unique (showId, seatId) index in SeatLock. Temporary holds expire through a TTL index. Checkout uses server-calculated show prices; the UI never confirms payment. If Stripe is not configured, checkout returns an explicit 503 and held seats are released by the customer app.

## Project layout

    frontend/
      src/App.jsx                 customer routes and screens
      src/api.js                  cookie/CSRF API client
      src/catalog.js              local poster preview when the API is offline
      src/assets/                 existing movie posters, banners and video
    admin/
      src/App.jsx                 role-protected administration screens
      src/api.js                  cookie/CSRF API client
    backend/
      src/config/                 environment and MongoDB
      src/controllers/            route handlers
      src/middleware/              session, CSRF, sanitization and errors
      src/models/                 users, movies, theaters, shows, seat locks, bookings, payments
      src/routes/                 auth, users, movies, theaters, shows, bookings, payments, admin
      src/services/               booking, payment, notifications and Socket.IO
      src/scripts/                additive migration and seed scripts
      test/                       business-rule and optional MongoDB integration tests

## Local setup

For copy-ready Windows commands and optional Stripe/email setup, see [LOCAL_SETUP.md](LOCAL_SETUP.md).

Use Node.js 20 or later and MongoDB 6 or later (a local replica set or MongoDB Atlas is recommended). No application database is created by the migration command until it connects to the configured URI.

1. Configure MongoDB and the API:

        cd backend
        Copy-Item .env.example .env

   Edit **backend/.env**. Set **MONGODB_URI** and generate a private JWT secret, for example:

        node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"

   Set **ADMIN_EMAIL** and a unique **ADMIN_PASSWORD** of at least 12 characters before seeding if you need an initial administrator account.

2. Install, migrate and seed the backend:

        npm install
        npm run migrate
        npm run seed
        npm test
        npm run dev

   The migration is additive and idempotent. It assigns a stable username to legacy users that lack one, copies legacy title/category movie values into movieName/categories when absent, and creates indexes. It never deletes records or drops indexes. It stops if duplicate email accounts prevent a unique index from being created. Legacy bookings stay in the existing collection; records without a showId are historical and cannot be used to reserve new show seats.

   The seed script adds sample movies only when no active movies exist, sample theaters only when none exist, and future showtimes only when no shows exist. It does not replace existing catalog or schedule records. The optional admin is created only when ADMIN_EMAIL and ADMIN_PASSWORD are supplied and that email does not already exist.

3. Configure and run the customer app:

        cd ../frontend
        Copy-Item .env.example .env
        npm install
        npm run dev

   The customer app defaults to **http://localhost:5173**.

4. Configure and run the admin app:

        cd ../admin
        Copy-Item .env.example .env
        npm install
        npm run dev

   The admin app defaults to **http://localhost:5174**. Only users with the server-side admin role can access management endpoints. Public account registration always creates a user.

5. Check API readiness at **http://localhost:4000/api/health**.

The API loads configuration from **backend/.env**. The frontend and admin .env files use **VITE_API_URL**, and the frontend also uses **VITE_SOCKET_URL**. **FRONTEND_ORIGINS** must list both local app origins. Keep all real .env files out of Git.

## Environment variables

| Variable | Used by | Purpose |
| --- | --- | --- |
| PORT | backend | API port; defaults to 4000 |
| MONGODB_URI | backend | MongoDB connection |
| FRONTEND_ORIGINS | backend | Comma-separated allowed browser origins |
| JWT_SECRET | backend | Session signing secret; at least 32 characters |
| JWT_EXPIRES_IN | backend | JWT lifetime; defaults to 8h |
| COOKIE_SAME_SITE, COOKIE_SECURE | backend | Session and CSRF cookie policy |
| SEAT_LOCK_MINUTES | backend | Initial seat-hold lifetime; defaults to 10 minutes |
| CANCELLATION_CUTOFF_HOURS | backend | Paid-booking cancellation window; defaults to 2 hours before showtime |
| STRIPE_SECRET_KEY | backend | Optional Stripe test/live secret key; checkout is disabled when empty |
| STRIPE_WEBHOOK_SECRET | backend | Stripe webhook signature verification |
| SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD, SMTP_FROM | backend | Optional booking emails |
| ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME | backend seed | Create the first administrator if the email is not already registered |
| VITE_API_URL | frontend/admin | API base URL, including /api |
| VITE_SOCKET_URL | frontend | Socket.IO server origin |
| VITE_CUSTOMER_URL | admin | Customer app link shown in the admin header |

The example files contain placeholders only. Do not put Stripe or JWT secrets in a VITE_* variable.

## API overview

All API responses use JSON. Collection routes return success, items, page, limit and total where applicable.

| Route | Access | Purpose |
| --- | --- | --- |
| GET /api/health | public | API and database readiness |
| GET /api/auth/csrf | public | Issue a CSRF cookie/token |
| POST /api/auth/register, POST /api/auth/login | public, rate limited | Create account or sign in |
| GET /api/auth/me, POST /api/auth/logout | session | Current user and session invalidation |
| GET /api/movies, GET /api/movies/:id | public | Search/filter catalog and movie details |
| GET /api/theaters, GET /api/shows?movieId=&date= | public | Theater and future showtimes |
| GET /api/shows/:showId/seats | public | Per-show seat state and server prices |
| POST /api/bookings/lock-seats | session | Atomically reserve 1–10 seats for a short hold |
| POST /api/payments/create-order | session | Create/reuse a Stripe Checkout session |
| GET /api/payments/sessions/:sessionId | owner session | Ask Stripe for the verified checkout status |
| POST /api/payments/webhook | Stripe signature | Idempotent payment completion, failure and expiry events |
| GET /api/users/me, PATCH /api/users/me | owner session | Read/update profile |
| GET /api/users/me/favorites, PUT/DELETE /api/users/me/favorites/:movieId | owner session | Watchlist management |
| GET /api/users/me/bookings, POST /api/bookings/:id/cancel | owner session | Booking history and cancellation/refund |
| GET /api/reviews/movie/:movieId | public | Paginated movie reviews |
| POST /api/reviews/movie/:movieId, PATCH /api/reviews/:id, DELETE /api/reviews/:id | session (owner or admin for edits/deletes) | Create and manage one review per user/movie |
| /api/admin/* | admin session | Dashboard, catalog CRUD, theater CRUD, show scheduling/rescheduling/archive, and booking management |

POST /api/bookings/lock-seats accepts a showId and seatIds array. Prices are read from the show. A successful response returns the pending booking ID, reference, amount and hold expiry. Pass booking.id to POST /api/payments/create-order. Stripe Checkout redirects back to /checkout/return; that page asks the server and Stripe for payment state. Only verified payment changes the booking to confirmed.

The API uses an HttpOnly session cookie and a double-submit CSRF token for browser mutations. The customer and admin clients request the CSRF token automatically. Socket connections require an authenticated session and join an individual room with show:join. The server emits seats:changed with seat IDs, state and lock expiry only; it does not send customer identity.

## Payments, email and deployment

- Set Stripe test keys in backend/.env to enable Checkout. Configure a Stripe webhook endpoint at https://<api-host>/api/payments/webhook for checkout.session.completed, checkout.session.expired, checkout.session.async_payment_succeeded, and checkout.session.async_payment_failed. Set the endpoint signing secret in STRIPE_WEBHOOK_SECRET.
- A checkout hold is extended to 35 minutes to match Stripe's minimum Checkout Session expiry. Expired pending holds are cleaned up by the API worker. If payment arrives after the unique seat lock has expired, the API requests an idempotent refund instead of confirming seats.
- SMTP is optional. Booking and cancellation succeed independently of email delivery; delivery failures are logged without exposing credentials.
- For deployment, use HTTPS, a MongoDB replica set/Atlas URI, a long random JWT secret, COOKIE_SECURE=true, and COOKIE_SAME_SITE=none only when the browser apps are cross-site. Set exact frontend origins, API URLs, and customer URL for deployed hosts. Terminate TLS at the hosting proxy and configure the Express trusted-proxy setting for that environment.
- Host each Vite build as a static site (npm run build, then deploy dist/). Host the backend as a Node.js service with the backend environment variables. Configure SPA fallback to index.html for React Router deep links.

## Checks

Run backend tests and build each application:

    cd backend
    npm test
    cd ../frontend
    npm run build
    cd ../admin
    npm run build

The automated unit tests cover seat ID normalization, layout validation and server-side price calculation. A MongoDB concurrency integration test runs when MONGO_TEST_URI points to a disposable test database. Stripe payment/webhook flows require Stripe test credentials and a configured webhook endpoint; SMTP requires a mail server. Those external flows are not simulated as successful.
