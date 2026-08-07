# MediCare Connect API

## Overview

MediCare Connect is a server-only Express API for doctor discovery, appointment booking, secure payment, prescriptions, reviews, favorites, dashboards, administration, and reminder emails. The frontend belongs in a separate repository.

## Technologies

Node.js, Express 5, strict TypeScript, the official MongoDB driver, Better Auth and its MongoDB adapter, Better Auth JWT/JWKS, Zod, Stripe, Resend, Helmet, CORS, express-rate-limit, Pino, Vitest, and ESLint.

## Architecture

Requests flow through security middleware, authentication, active-account and role checks, route validation, thin route handlers/domain services, and the shared MongoDB database. Errors and responses are centralized. `src/modules` owns domain routes, while `src/config`, `src/auth`, `src/middleware`, and `src/errors` hold cross-cutting behavior.

```text
src/
  auth/          Better Auth, JWT/session authentication, doctor verification
  config/        environment, MongoDB, indexes, logger
  constants/     trusted domain states
  errors/        application errors
  middleware/    validation and error handling
  modules/       users, doctors, schedules, appointments, payments, reviews,
                 prescriptions, favorites, contact, analytics, admin, reminders
  scripts/       idempotent administrator bootstrap
  types/         MongoDB documents and Express principal
  utils/         validation, response, async helpers
```

## MongoDB architecture

MongoDB is the only persistent database. One `MongoClient` is connected at startup and shared by Better Auth and application collections. Startup creates query indexes and unique constraints for application identities, doctor profiles, schedules, active doctor/date/time slots, Stripe PaymentIntent IDs, appointment reviews, prescriptions, and patient/doctor favorites.

The partial unique appointment index is the final concurrency barrier against two active bookings for the same doctor, date, and time. Cancelled/rejected/completed records no longer reserve that slot.

## Better Auth and JWT verification

Better Auth exclusively manages email/password and optional Google OAuth accounts, password security, sessions, accounts, and verification data through its MongoDB adapter. Auth endpoints are mounted at `/api/auth/*`; JSON parsing is deliberately mounted afterward. Add Google environment variables to enable Google sign-in.

Browser clients normally use Better Auth's secure session cookie. A signed JWT is available through Better Auth's JWT plugin (`GET /api/auth/token`) and keys are published at `/api/auth/jwks`. Private API middleware accepts either a session or a Bearer JWT. JWTs are verified with `jose` against that JWKS, including signature, expiry, issuer, and audience; decoding without verification is never accepted. JWT is additive and does not replace sessions.

After registration, call `POST /api/users/onboarding` with the authenticated account's email and either `patient` or `doctor`. Public onboarding cannot assign `admin`. Doctor profiles begin as `pending`.

## Authorization model

- Patients control only their own appointments, payments, reviews, prescriptions, and favorites.
- Doctors control only their own profile/schedules and appointments/prescriptions assigned to that doctor.
- Administrators manage user status, doctor verification, monitoring, and analytics.

Role checks do not imply ownership. Resource queries include the authenticated patient/doctor identity. Suspended accounts are rejected centrally, and verified-doctor operations additionally require a currently verified profile.

## Appointment and payment lifecycle

The lifecycle is `payment_pending → pending → accepted → completed`; pending appointments can be rejected, and allowed active states can be cancelled. Explicit actions enforce every transition.

Booking verifies a public verified doctor and a server-generated schedule slot, snapshots the persisted consultation fee, inserts the race-safe reservation, then creates a Stripe PaymentIntent using that persisted fee. Browser amounts are ignored. If PaymentIntent creation fails, the reservation is cancelled.

Stripe sends signed events to `POST /api/webhooks/stripe`. This route receives raw bytes before JSON parsing, verifies `STRIPE_WEBHOOK_SECRET`, records event IDs, and idempotently updates payment and appointment state. A frontend redirect never marks a payment paid.

## Reviews, prescriptions, search, and pagination

A patient may create one review per completed appointment. Ratings are recalculated in MongoDB and never accepted from a doctor-profile request. Only an appointment's assigned verified doctor may create/update its prescription after completion; only its patient may read it.

Public doctor search returns verified profiles only. It supports text search, specialization/hospital filters and allow-listed `fee_asc`, `fee_desc`, `experience_desc`, and `rating_desc` sorts. Paginated endpoints cap `limit` at 100 and return `page`, `limit`, `total`, `totalPages`, `hasNextPage`, and `hasPreviousPage`.

## Email reminders

Call `POST /api/cron/appointments` daily from an external scheduler with `X-Cron-Secret`. The API claims `reminderSentAt` atomically before using Resend, preventing scheduler concurrency/retries from sending duplicates. Failed deliveries release the claim for retry. Production schedulers should store the cron secret in their secret manager.

## Installation and local development

```bash
npm install
cp .env.sample .env
npm run dev
```

Populate `.env` with a MongoDB connection, a 32+ character Better Auth secret, Stripe test keys/webhook secret, and any integrations being exercised. `.env` is ignored and must never be committed. The server validates mandatory configuration on startup and uses `medicare_connect` by default.

Run quality checks:

```bash
npm run build
npm run lint
npm test
```

Create the initial administrator (never exposed as a public endpoint):

```bash
npm run bootstrap:admin
```

The script uses `ADMIN_NAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` and is idempotent for an existing application administrator.

## Deployment

Set `CLIENT_URL`, `SERVER_URL`, and `BETTER_AUTH_URL` to their public HTTPS origins. CORS and Better Auth trusted origins allow only the configured client. Configure Stripe to deliver events to `/api/webhooks/stripe`, configure the external daily scheduler, and ensure MongoDB supports the declared indexes. The process handles `SIGINT`/`SIGTERM`, closes HTTP and MongoDB cleanly, and exposes `GET /api/health` for readiness checks.

## API endpoints

| Method | URL | Access | Purpose |
|---|---|---|---|
| ALL | `/api/auth/*` | Public/session | Better Auth registration, login, Google, logout, session, token and JWKS |
| POST | `/api/users/onboarding` | Auth session | Assign trusted patient/doctor application role |
| GET/PATCH | `/api/users/me` | Active user | Read/update own profile |
| GET | `/api/doctors` | Public | Search verified doctors with sorting/pagination |
| GET | `/api/doctors/:id` | Public | Safe profile and public reviews |
| GET/PATCH | `/api/doctors/me/profile` | Doctor | Manage own profile |
| GET/POST/PATCH/DELETE | `/api/schedules/...` | Doctor | Manage own schedules |
| GET | `/api/schedules/doctor/:doctorId/availability?date=YYYY-MM-DD` | Public | Server-authoritative open slots |
| POST | `/api/appointments` | Patient | Reserve slot and create PaymentIntent |
| GET | `/api/appointments/mine` | Patient | List own appointments |
| PATCH | `/api/appointments/:id/reschedule` | Patient owner | Reschedule an allowed appointment |
| PATCH | `/api/appointments/:id/cancel` | Patient owner | Cancel an allowed appointment |
| GET | `/api/appointments/assigned` | Verified doctor | List assigned appointments |
| PATCH | `/api/appointments/:id/{accept,reject,complete}` | Assigned doctor | Explicit lifecycle action |
| POST | `/api/webhooks/stripe` | Stripe signature | Authoritative payment result |
| GET | `/api/payments/mine` | Patient | Own payment history |
| POST/PATCH/DELETE | `/api/reviews/...` | Patient owner | Manage eligible reviews |
| PUT | `/api/prescriptions` | Assigned doctor | Create/update completed-visit prescription |
| GET | `/api/prescriptions/mine` | Patient | Own prescriptions |
| GET/POST/DELETE | `/api/favorites/...` | Patient | Manage favorite verified doctors |
| POST | `/api/contact` | Public, limited | Submit a validated contact message |
| GET | `/api/analytics/public` | Public | Platform statistics |
| GET | `/api/analytics/patient` | Patient | Patient dashboard |
| GET | `/api/analytics/doctor` | Verified doctor | Doctor dashboard |
| GET | `/api/analytics/admin` | Admin | Chart-ready administrative analytics |
| GET/PATCH/DELETE | `/api/admin/users/...` | Admin | User administration |
| GET/PATCH | `/api/admin/doctors/...` | Admin | Doctor verification workflow |
| GET | `/api/admin/{appointments,payments}` | Admin | Paginated monitoring |
| POST | `/api/cron/appointments` | Cron secret | Send tomorrow's reminders |
| GET | `/api/health` | Public | Safe API/database health |

## Client repository

The client is maintained separately: _add the client repository URL here_.
