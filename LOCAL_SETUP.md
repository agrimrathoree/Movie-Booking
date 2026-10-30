# Run iMovies Locally

This guide runs the existing customer app, admin app, and Express/MongoDB API on one development machine. It assumes Windows PowerShell; bash equivalents are included where they differ.

## Requirements

- Node.js 20 or newer and npm. Verify with `node --version` and `npm --version`.
- MongoDB running locally, or a MongoDB Atlas connection string.
- Git is optional if you already have the project files.

The three apps use these local addresses by default:

| Service | Address |
| --- | --- |
| Backend API | `http://localhost:4000` |
| API health check | `http://localhost:4000/api/health` |
| Customer app | `http://localhost:5173` |
| Admin app | `http://localhost:5174` |

## 1. Start MongoDB

Install MongoDB Community Server, or use an Atlas cluster. For a local installation that runs as a Windows service, check and start it from an elevated PowerShell window:

```powershell
Get-Service MongoDB
Start-Service MongoDB
```

If the service name is unavailable, start the MongoDB service using the name chosen during installation. For Atlas, copy the cluster connection URI and make sure your current IP is allowed by the cluster network access rules.

## 2. Configure the backend

Open a terminal at the project folder, then run:

```powershell
cd backend
Copy-Item .env.example .env
```

Open `backend/.env` and set at least:

```dotenv
NODE_ENV=development
PORT=4000
MONGODB_URI=mongodb://127.0.0.1:27017/Imovies
FRONTEND_ORIGINS=http://localhost:5173,http://localhost:5174
JWT_SECRET=replace-this-with-a-random-secret-of-at-least-32-characters
COOKIE_SAME_SITE=lax
COOKIE_SECURE=false
```

Generate a strong local JWT secret with Node.js:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Paste the generated value into `JWT_SECRET`. Do not commit `.env` or put backend secrets in frontend variables.

For MongoDB Atlas, replace `MONGODB_URI` with the Atlas URI, including the database name `Imovies`, for example:

```dotenv
MONGODB_URI=mongodb+srv://<db-user>:<db-password>@<cluster-host>/Imovies?retryWrites=true&w=majority
```

Keep the username/password URL-encoded if they contain reserved URI characters.

Install exact locked dependencies, run the additive migration, optionally seed starter records, then start the API:

```powershell
npm ci
npm run migrate
npm run seed
npm run dev
```

The migration preserves existing records and does not drop collections. The seed script only adds sample catalog/show data when the corresponding collections have no active records. It does not overwrite existing records.

To create an initial administrator during seeding, set these optional values in `backend/.env` before running `npm run seed`:

```dotenv
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=use-a-unique-password-of-at-least-12-characters
ADMIN_NAME=Movie Admin
```

The seed script will not replace an existing account. Public registration creates regular users only.

Leave this terminal running. The API starts listening only after MongoDB connects and its indexes are ready. Visit `http://localhost:4000/api/health`; a ready response confirms that the API can reach MongoDB.

## 3. Configure and start the customer app

Open a second terminal at the project folder:

```powershell
cd frontend
Copy-Item .env.example .env
npm ci
npm run dev
```

The default `frontend/.env` should contain:

```dotenv
VITE_API_BASE_URL=http://localhost:4000/api
VITE_SOCKET_URL=http://localhost:4000
```

Open `http://localhost:5173`. If the API is down, the site can show a local poster preview, but the preview movies cannot be booked.

## 4. Configure and start the admin app

Open a third terminal at the project folder:

```powershell
cd admin
Copy-Item .env.example .env
npm ci
npm run dev
```

The default `admin/.env` should contain:

```dotenv
VITE_API_BASE_URL=http://localhost:4000/api
VITE_CUSTOMER_URL=http://localhost:5173
```

Open `http://localhost:5174`. Sign in using an account whose backend role is `admin`. Hiding admin pages in the browser is not the security boundary; the API checks the role for each management endpoint.

## Stripe and email (optional)

Online checkout requires Stripe test credentials in `backend/.env`:

```dotenv
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

For local webhook testing, install and sign in to the Stripe CLI, then forward events to the backend:

```powershell
stripe listen --forward-to localhost:4000/api/payments/webhook
```

Use the webhook signing secret printed by the CLI as `STRIPE_WEBHOOK_SECRET`, restart the backend, and use Stripe test payment details. Without Stripe configuration the API returns an explicit unavailable response; it does not simulate a successful payment.

Email is optional. To enable booking notices, set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM` in `backend/.env`, then restart the API.

## Useful commands

Run these from the corresponding application folder:

```powershell
# Backend
npm run dev       # development server with Node watch mode
npm start         # regular server start
npm test          # backend automated tests
npm run migrate   # additive legacy-data migration and index setup
npm run seed      # non-destructive starter catalog/show data

# Customer app or admin app
npm run dev       # Vite development server
npm run lint      # ESLint
npm run build     # production build into dist/
npm run preview   # preview the production build locally
```

To install dependencies without a lockfile (only if `npm ci` cannot be used), run `npm install` in that app's folder. Repeat `npm ci` in `backend`, `frontend`, and `admin`; there is no root-level package install.

## Troubleshooting

- **API exits before listening:** confirm MongoDB is running and `MONGODB_URI` and `JWT_SECRET` are set in `backend/.env`.
- **Health check says database disconnected:** check the URI, Atlas IP allowlist/credentials, or local MongoDB service status.
- **Browser reports CORS or credentials errors:** verify `FRONTEND_ORIGINS` contains both exact local origins, with no trailing slash, and restart the backend after editing `.env`.
- **Login or mutations return CSRF errors:** use the customer/admin app through its configured origin and reload it to request a fresh CSRF token.
- **Checkout is unavailable:** configure Stripe test keys and the webhook secret; Stripe is optional for browsing and admin setup.
- **No live movies or shows:** run `npm run seed` in `backend` after configuring MongoDB. The API must be running for the customer app to fetch them.
- **Port already in use:** stop the process using that port or change `PORT` for the backend. Vite will report if the customer/admin port is occupied.

## Verify the project

From each folder, run the relevant checks:

```powershell
cd backend
npm test
cd ../frontend
npm run lint
npm run build
cd ../admin
npm run lint
npm run build
```

The MongoDB seat-lock concurrency integration test runs only when `MONGO_TEST_URI` points to a disposable test database. A successful frontend build does not verify MongoDB, Stripe payments, email delivery, or a completed real booking.
