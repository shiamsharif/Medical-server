# MediCare Connect — Server Application

You are a senior backend engineer, API architect, database engineer, and security-conscious software developer.

Build a complete production-quality backend for **MediCare Connect**, a hospital appointment and healthcare management platform.

This is a technical assessment project.

Correct architecture, security, authorization, database integrity, clean code, meaningful comments, validation, payment security, and maintainability are extremely important.

This repository is **SERVER SIDE ONLY**.

The Next.js client exists in a completely separate repository.

---

# 1. Mandatory Backend Stack

Use:

* Node.js
* Express.js
* TypeScript
* MongoDB
* Official MongoDB Node.js Driver
* Better Auth
* Better Auth MongoDB Adapter
* Better Auth JWT/JWKS functionality
* Zod
* Stripe
* Resend or Nodemailer
* Helmet
* CORS
* express-rate-limit
* Pino or another lightweight structured logger

Use strict TypeScript.

---

# 2. Database Rule

MongoDB must be the **ONLY persistent database**.

Do NOT use:

* PostgreSQL
* MySQL
* MariaDB
* SQLite
* Redis as a database
* Firebase
* Firestore
* Supabase
* Prisma backed by another database
* SQL databases
* secondary persistent databases

Authentication and application data should use MongoDB.

MongoDB stores:

* Better Auth users
* Better Auth accounts
* Better Auth sessions
* Better Auth verification information
* Better Auth JWKS data if required
* Doctor profiles
* Schedules
* Appointments
* Payments
* Reviews
* Prescriptions
* Favorites
* Contact messages
* Reminder state

Use one central MongoDB client/database configuration.

---

# 3. Repository Separation

This repository contains only:

* Express API
* Authentication
* MongoDB access
* Payments
* Email
* Business logic
* Backend validation
* Backend authorization

Do NOT generate a Next.js frontend here.

Client and server are completely separate repositories.

---

# 4. Suggested Server Structure

Use modular architecture.

Example:

src/
├── config/
│   ├── env.ts
│   ├── database.ts
│   └── logger.ts
│
├── auth/
│   ├── auth.ts
│   ├── auth.middleware.ts
│   ├── permissions.ts
│   └── auth.types.ts
│
├── modules/
│   ├── users/
│   ├── doctors/
│   ├── schedules/
│   ├── appointments/
│   ├── reviews/
│   ├── payments/
│   ├── prescriptions/
│   ├── favorites/
│   ├── contact/
│   └── analytics/
│
├── middleware/
├── errors/
├── constants/
├── utils/
├── types/
├── routes/
├── app.ts
└── server.ts

Within modules, use only the layers actually needed.

Common pattern:

Route
↓
Middleware
↓
Controller
↓
Service
↓
Repository/database

Controllers should remain thin.

Business logic should normally live in services.

Database-specific queries should remain organized.

Do not over-engineer generic repository abstractions.

---

# 5. Clean Code Requirements

Clean code is mandatory.

Use:

* Strict TypeScript
* Descriptive names
* Small functions
* Single responsibility
* Reusable middleware
* Centralized validation
* Centralized errors
* Centralized configuration
* Status constants
* Typed services
* Typed repositories
* Consistent API responses
* Proper async/await
* No duplicated business logic
* No giant controllers
* No giant route files
* No magic strings
* No dead code
* No debug console logs

Prefer:

appointmentStatus.COMPLETED

over repeatedly writing:

"completed"

Use clear domain naming.

---

# 6. Meaningful Comments

Write comments when they explain an important reason.

Comments should explain:

* security decisions
* authentication behavior
* role restrictions
* MongoDB concurrency protection
* appointment collision protection
* payment state transitions
* Stripe webhook behavior
* idempotency
* unusual indexes
* email reminder deduplication
* non-obvious date/time rules

Good:

// The consultation fee is loaded from MongoDB rather than request.amount
// so a client cannot reduce the Stripe charge by modifying the request.

Good:

// Stripe may retry webhook events, therefore event processing must be
// idempotent before changing appointment or payment state.

Good:

// The unique appointment-slot constraint is the final database-level
// safeguard when two booking requests arrive at nearly the same time.

Bad:

// Get appointment

Bad:

// Check user

Bad:

// Return response

Do not comment every line.

Code should explain WHAT.

Comments explain WHY.

Use JSDoc selectively for reusable public utilities/services whose contract is not obvious.

---

# 7. Environment Configuration

Create:

.env

and:

.env.sample

The real `.env` file must NEVER be committed.

Add `.env` to `.gitignore`.

`.env.sample` MUST be committed.

---

# 8. Server `.env`

The actual development `.env` may contain:

NODE_ENV=development
PORT=5000

CLIENT_URL=http://localhost:3000
SERVER_URL=http://localhost:5000

MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/medicare_connect

BETTER_AUTH_SECRET=replace_with_secure_secret
BETTER_AUTH_URL=http://localhost:5000

GOOGLE_CLIENT_ID=replace_me
GOOGLE_CLIENT_SECRET=replace_me

STRIPE_SECRET_KEY=sk_test_replace_me
STRIPE_WEBHOOK_SECRET=whsec_replace_me

EMAIL_FROM=MediCare Connect [noreply@example.com](mailto:noreply@example.com)
RESEND_API_KEY=re_replace_me

ADMIN_NAME=System Admin
ADMIN_EMAIL=[admin@example.com](mailto:admin@example.com)
ADMIN_PASSWORD=replace_with_secure_password

CRON_SECRET=replace_with_secure_secret

Never commit these actual secrets.

---

# 9. `.env.sample`

Create:

.env.sample

containing safe placeholders:

NODE_ENV=development
PORT=5000

CLIENT_URL=http://localhost:3000
SERVER_URL=http://localhost:5000

MONGODB_URI=your_mongodb_connection_string

BETTER_AUTH_SECRET=your_better_auth_secret
BETTER_AUTH_URL=http://localhost:5000

GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret

EMAIL_FROM=your_verified_sender_email
RESEND_API_KEY=your_resend_api_key

ADMIN_NAME=System Admin
ADMIN_EMAIL=[admin@example.com](mailto:admin@example.com)
ADMIN_PASSWORD=your_secure_admin_password

CRON_SECRET=your_secure_cron_secret

Never put real production credentials into `.env.sample`.

---

# 10. Environment Validation

Create:

src/config/env.ts

Use Zod to validate environment variables at startup.

For example:

* PORT
* MONGODB_URI
* BETTER_AUTH_SECRET
* BETTER_AUTH_URL
* CLIENT_URL

Additional integration variables may be required depending on enabled features.

If a mandatory environment variable is missing:

Fail application startup with a clear developer-facing error.

Do not allow the application to silently run in a broken configuration.

Never print secret values in validation errors.

---

# 11. Secret Security

Never hardcode:

* MongoDB URI
* Better Auth secret
* Google OAuth secret
* Stripe secret
* Stripe webhook secret
* Email provider API key
* Admin password
* Cron secret

Never:

* include secrets in API responses
* include secrets in README
* log secrets
* commit `.env`

---

# 12. MongoDB Connection

Create one centralized MongoDB connection.

Example:

src/config/database.ts

Use:

MongoClient

Reuse the connection.

Do not open a new connection for every request.

Handle:

* startup connection failure
* graceful shutdown
* connection health

Use MongoDB database:

medicare_connect

or environment-configured database.

---

# 13. Better Auth

Use Better Auth as the ONLY authentication system.

Use the official MongoDB adapter.

Better Auth handles:

* Email/password authentication
* Password hashing/security
* Google OAuth
* Accounts
* Sessions
* Verification records
* Auth-related user records

Do NOT manually build password hashing/login flows unless explicitly required by Better Auth integration.

Do NOT use Firebase.

Do NOT use custom duplicate authentication systems.

---

# 14. Better Auth Express Integration

Integrate Better Auth correctly with Express.

Important:

Mount the Better Auth handler in the proper middleware order required by the installed Better Auth version.

Do not allow Express JSON parsing or other middleware to break authentication requests.

Follow Better Auth's installed package typings/current integration requirements rather than inventing outdated APIs.

A conceptual order may be:

Security/CORS middleware
↓
Better Auth handler
↓
Body parsing for application APIs
↓
Application routes
↓
404
↓
Error middleware

Adapt based on actual Better Auth requirements.

---

# 15. Better Auth Client Origins

Configure trusted origins properly.

Development:

http://localhost:3000

Production:

actual frontend domain

Do not use unrestricted:

*

for authenticated production CORS.

---

# 16. Authentication Features

Support:

* Register with email/password
* Login with email/password
* Login with Google
* Logout
* Persistent sessions
* Current authenticated user
* Secure account/session management

---

# 17. User Roles

Roles:

* patient
* doctor
* admin

Public registration can create:

* patient
* doctor

Never allow public registration to directly create:

admin

Do not trust:

req.body.role === "admin"

---

# 18. Safe Registration Workflow

Recommended flow:

1. Better Auth creates account.
2. Application accepts only allowed onboarding role:

   * patient
   * doctor
3. Backend validates role.
4. Backend stores trusted role.
5. Doctor profile begins with:
   verificationStatus = pending
6. Admin accounts are created separately.

Use server-controlled role assignment.

If Better Auth custom user fields are used for role, prevent users from arbitrarily writing privileged role values.

---

# 19. Admin Bootstrap

Do NOT create a public admin registration endpoint.

Create an idempotent bootstrap/seed script.

Admin data comes from:

ADMIN_NAME
ADMIN_EMAIL
ADMIN_PASSWORD

Running the bootstrap multiple times must NOT create duplicate administrators.

Document admin bootstrap instructions.

Do not run destructive seed logic automatically in normal production startup.

---

# 20. JWT Challenge Requirement

The assignment explicitly requires:

* JWT authentication
* JWT verification
* protected private APIs
* backend token verification
* role-based authorization

Implement this clearly using Better Auth's JWT/JWKS capabilities where suitable.

Do NOT hand-roll unsafe JWT logic.

---

# 21. JWT Verification

For protected API routes designed to use Bearer JWT:

Read:

Authorization: Bearer <token>

Then:

1. Verify cryptographic signature
2. Validate expiration
3. Validate issuer where applicable
4. Validate audience where applicable
5. Resolve authenticated identity
6. Load trusted user role/status if required
7. Attach authenticated principal to request
8. Continue to authorization

Never treat:

JWT decode only

as verification.

Signature verification is mandatory.

---

# 22. Better Auth Sessions and JWT

Use Better Auth sessions for normal web authentication.

Use Better Auth JWT/JWKS where required by the assignment/API architecture.

Do not unnecessarily replace Better Auth's session system with your own custom authentication mechanism.

Document:

* Session authentication
* JWT usage
* JWT verification
* JWKS
* protected REST APIs

in README.

---

# 23. Authentication Middleware

Create reusable middleware such as:

authenticate

requireRole(...roles)

requireActiveUser

requireVerifiedDoctor

requireOwnership(...)

Names may differ if clearer.

Do not duplicate role checks inside every controller.

---

# 24. RBAC

Patient permissions:

* Manage own profile
* Create own appointment
* View own appointments
* Reschedule own allowed appointments
* Cancel own allowed appointments
* View own payments
* Manage own reviews
* View own prescriptions
* Manage own favorite doctors

Doctor permissions:

* Manage own doctor profile
* Manage own schedules
* View assigned appointments
* Accept assigned appointments
* Reject assigned appointments
* Complete assigned appointments
* Create/update prescriptions for assigned patients

Admin permissions:

* Manage users
* Manage doctor verification
* View all appointments
* View payments
* View analytics

---

# 25. RBAC Is Not Enough

Always combine:

Role-Based Access Control

with:

Ownership authorization

Example:

A doctor role does NOT mean a doctor can access another doctor's appointment.

A patient role does NOT mean a patient can view another patient's prescriptions.

---

# 26. Suspended Users

If user status is:

suspended

protect relevant private actions.

A suspended user should not retain normal protected privileges.

Centralize this logic.

---

# 27. User Data

Application user data should support:

* Better Auth user ID
* Name
* Email
* Image/photo
* Phone
* Gender
* Role
* Status
* CreatedAt
* UpdatedAt

Statuses:

* active
* suspended

Do not duplicate Better Auth-managed data unnecessarily unless domain requirements justify it.

---

# 28. Doctor Collection

Create a Doctors collection.

Recommended fields:

* _id
* userId
* doctorName
* specialization
* qualifications
* experience
* consultationFee
* hospitalName
* profileImage
* biography
* availableDays
* verificationStatus
* averageRating
* reviewCount
* createdAt
* updatedAt

Verification statuses:

* pending
* verified
* rejected

Doctor registrations start:

pending

---

# 29. Doctor Verification

Admin can:

* Verify doctor
* Reject doctor
* Revoke verification

Only verified doctors should normally appear in public doctor search.

Keep verification updates server-controlled.

---

# 30. Schedule Collection

Use a separate schedules collection.

Recommended fields:

* _id
* doctorId
* day/date
* startTime
* endTime
* slotDuration
* active
* createdAt
* updatedAt

A doctor can:

* Create own schedule
* Update own schedule
* Remove own schedule
* List own schedules

Prevent invalid overlaps.

Validate:

start < end

slot duration reasonable

---

# 31. Doctor Availability

Create API functionality to determine availability.

Account for:

* Doctor schedule
* Existing appointments
* Date
* Slot duration
* Inactive schedule
* Already booked slots

Never make the browser responsible for deciding whether a slot is actually available.

---

# 32. Appointment Collection

Recommended fields:

* _id
* patientId
* doctorId
* appointmentDate
* appointmentTime
* symptoms
* appointmentStatus
* paymentStatus
* consultationFeeSnapshot
* paymentId
* createdAt
* updatedAt

---

# 33. Appointment Status Constants

Use defined constants/enums.

Appointment statuses:

* payment_pending
* pending
* accepted
* rejected
* cancelled
* completed

Payment statuses:

* unpaid
* pending
* paid
* failed
* refunded

Do not scatter free-form status strings throughout code.

---

# 34. Consultation Fee Snapshot

Store:

consultationFeeSnapshot

on appointments.

Reason:

If a doctor changes their consultation fee later, previous appointments/payment history must still retain the original booked amount.

Add a meaningful comment explaining this business reason.

---

# 35. Appointment Booking Rules

Patient can:

* Select verified doctor
* Select available date
* Select available slot
* Provide symptoms/reason
* Start payment
* Confirm booking through payment flow

Prevent:

* Booking unverified doctor
* Booking unavailable slot
* Double booking
* Duplicate submission
* Invalid past dates
* Manipulating another patient's appointment

---

# 36. Double Booking Prevention

This is critical.

Do NOT rely only on:

find available
then insert

because concurrent requests can race.

Use MongoDB database-level protection.

Create an appropriate compound unique constraint/index or reservation strategy for active booked slots.

The final protection should prevent two valid appointments from occupying the same:

doctor + date + appointmentTime

where applicable.

Handle duplicate conflicts gracefully.

Return:

HTTP 409 Conflict

with a useful error such as:

APPOINTMENT_SLOT_CONFLICT

Add a meaningful comment explaining the race condition.

---

# 37. Appointment State Transitions

Enforce valid transitions on the server.

Examples:

payment_pending
→ pending/confirmed workflow

pending
→ accepted

pending
→ rejected

accepted
→ completed

allowed states
→ cancelled

Do not allow arbitrary:

PATCH status = anything

Use explicit service methods.

---

# 38. Patient Appointment APIs

Patient can:

* Create appointment/payment attempt
* List own appointments
* View own appointment
* Reschedule allowed appointment
* Cancel allowed appointment

Apply ownership checks.

---

# 39. Doctor Appointment APIs

Doctor can:

* List assigned appointment requests
* View assigned appointment
* Accept
* Reject
* Mark completed

Only assigned doctor can perform these actions.

---

# 40. Admin Appointment APIs

Admin can:

* View all appointments
* Search
* Filter
* View status
* View payment status

Admin monitoring should not arbitrarily corrupt appointment state unless a clearly defined administrative action exists.

---

# 41. Stripe Payment

Use Stripe.

Patients must pay consultation fees before the final appointment confirmation workflow.

Use secure server-side amount calculation.

---

# 42. Stripe Payment Flow

Correct architecture:

Patient chooses doctor/date/slot
↓
Server validates authenticated patient
↓
Server loads verified doctor
↓
Server loads authoritative consultation fee
↓
Server validates slot
↓
Server creates pending appointment/reservation
↓
Server creates Stripe PaymentIntent
↓
Client completes Stripe payment
↓
Stripe calls server webhook
↓
Server verifies Stripe webhook signature
↓
Server updates payment
↓
Server updates appointment payment status
↓
Appointment becomes properly confirmed/pending according to business workflow

---

# 43. Payment Amount Security

Never trust:

req.body.amount

for authoritative consultation fee.

Load fee from MongoDB.

Good comment:

// Never trust the amount submitted by the browser.
// The doctor's persisted fee is the authoritative payment source.

---

# 44. Payment Collection

Recommended fields:

* _id
* appointmentId
* patientId
* doctorId
* amount
* currency
* stripePaymentIntentId
* transactionId
* paymentStatus
* paymentDate
* createdAt
* updatedAt

Create a unique index for:

stripePaymentIntentId

where appropriate.

---

# 45. Stripe Webhook

Implement Stripe webhook securely.

Verify webhook signature using:

STRIPE_WEBHOOK_SECRET

Do not parse/modify the webhook payload in a way that breaks signature verification.

Follow Stripe's required raw-body handling.

Make webhook handling idempotent.

Stripe can retry events.

Do not duplicate:

* Payment record updates
* Appointment confirmation
* Email notifications

because a webhook is delivered twice.

---

# 46. Frontend Success Is Not Payment Confirmation

Never mark payment successful solely because the frontend:

* redirects to success page
* returns success UI
* says payment completed

The Stripe webhook is authoritative.

---

# 47. Reviews Collection

Recommended fields:

* _id
* patientId
* doctorId
* appointmentId
* rating
* reviewText
* createdAt
* updatedAt

Rating:

1 to 5

---

# 48. Review Business Rules

A patient can review a doctor only when:

* Patient owns the appointment
* Appointment belongs to that doctor
* Appointment is completed

Prevent duplicate review for the same appointment.

Create an appropriate unique constraint.

---

# 49. Doctor Rating Calculation

Do not trust:

averageRating

submitted by frontend.

Whenever review changes require rating recalculation:

calculate from MongoDB/server data.

Maintain:

* averageRating
* reviewCount

correctly.

Use MongoDB aggregation if helpful.

---

# 50. Prescription Collection

Recommended fields:

* _id
* doctorId
* patientId
* appointmentId
* diagnosis
* medications
* notes
* createdAt
* updatedAt

Medication structure:

* name
* dosage
* frequency
* duration
* instructions

---

# 51. Prescription Authorization

Only the assigned doctor can create/update prescription for that appointment.

Patient can view prescriptions belonging to them.

The appointment should normally be completed before final prescription creation.

Enforce these rules on the backend.

---

# 52. Favorites Collection

Create Favorites collection.

Fields:

* patientId
* doctorId
* createdAt

Create compound unique index:

patientId + doctorId

Prevent duplicate favorites.

Patient can:

* Add favorite
* Remove favorite
* List favorites

---

# 53. Doctor Search API

Create server-side doctor discovery.

Support:

* Search doctor name
* Search specialization
* Filter specialization
* Filter hospital if implemented
* Fee sorting
* Experience sorting
* Rating sorting
* Pagination

Example:

GET /api/doctors?page=1&limit=10&search=rahman&specialization=Cardiology&sort=rating_desc

---

# 54. Search Requirements

Search must not expose unverified doctors to normal public results.

Implement case-insensitive/search-friendly behavior appropriately.

Do not fetch every doctor into application memory and filter there.

Use MongoDB queries.

---

# 55. Sorting

Support:

* fee_asc
* fee_desc
* experience_desc
* rating_desc

Validate sorting query values with Zod.

Do not directly pass arbitrary client field names to MongoDB sort operations.

Map safe sort options to approved database fields.

---

# 56. Pagination

Pagination is mandatory.

Return:

{
"data": [...],
"meta": {
"page": 1,
"limit": 10,
"total": 100,
"totalPages": 10,
"hasNextPage": true,
"hasPreviousPage": false
}
}

Validate:

page >= 1

reasonable max limit

Do not allow unlimited responses.

---

# 57. Public Doctor Details

Create endpoint returning safe public information:

* Professional profile
* Qualifications
* Experience
* Hospital
* Consultation fee
* Rating
* Review count
* Availability
* Public reviews

Do not expose:

* private user information
* session data
* internal authentication information

---

# 58. Platform Statistics

Create public statistics endpoint.

Return:

* Total verified doctors
* Total patients
* Total appointments
* Total reviews

Use efficient queries.

---

# 59. Patient Dashboard API

Provide efficient dashboard data.

Possible response:

* Upcoming appointments
* Appointment history count
* Total paid amount
* Favorite doctors count
* Next appointment
* Recent activity

Avoid requiring many unnecessary round trips if one dashboard aggregation endpoint is appropriate.

---

# 60. Doctor Dashboard API

Return only authenticated doctor's data:

* Total unique patients
* Today's appointments
* Pending requests
* Completed appointments
* Reviews received
* Average rating

---

# 61. Admin — Manage Users

Admin APIs:

* List users
* Search users
* Filter by role/status
* Suspend
* Reactivate
* Delete where safe

Use pagination.

Do not allow insecure mass assignment.

---

# 62. Admin — Manage Doctors

Admin can:

* List pending
* List verified
* List rejected
* Verify
* Reject
* Revoke verification

Log meaningful audit information without logging secrets.

---

# 63. Admin — Appointments

Admin can:

* List appointments
* Search
* Filter
* Inspect appointment status
* Inspect payment status

Use pagination.

---

# 64. Admin — Payments

Admin can view:

* Transaction
* Patient
* Doctor
* Appointment
* Amount
* Date
* Status

Do not expose Stripe secret information.

---

# 65. Admin Analytics

Create analytics endpoints suitable for Recharts.

Use MongoDB aggregation.

Return data for:

* Total patients
* Total doctors
* Total appointments
* Appointment statuses
* Appointments over time
* Revenue/payments over time
* Doctor performance
* Highest-rated doctors

Do heavy aggregation in the backend rather than browser.

---

# 66. Contact Form

Create contact collection/API.

Fields:

* Name
* Email
* Subject
* Message
* CreatedAt

Validate using Zod.

Rate-limit the endpoint.

Optionally send admin notification email.

---

# 67. Email Appointment Reminders

Implement the optional email reminder feature.

Use:

Resend

or:

Nodemailer

Choose one clean implementation.

Do not implement multiple email providers unless needed.

---

# 68. Reminder Emails

Include:

* Patient name
* Doctor name
* Appointment date
* Appointment time
* Hospital
* Useful reminder message

Also optionally support notifications for:

* Appointment accepted
* Appointment rejected
* Appointment cancelled

Centralize email templates.

---

# 69. Reminder Deduplication

Prevent duplicate reminder emails.

Store reminder state where needed.

Examples:

reminderSentAt

or dedicated reminder record.

Add a meaningful comment explaining why this prevents scheduler retries from duplicating emails.

---

# 70. Scheduler

Use a deployment-compatible approach.

If using:

cron endpoint

protect it using:

CRON_SECRET

Do not expose an unprotected endpoint that anyone can trigger.

If deployment platform has limitations, document the recommended external scheduler approach in README.

---

# 71. Zod Validation

Use Zod for:

* Request body
* Query parameters
* Route parameters
* Environment variables

Validate:

* MongoDB ObjectId
* Email
* Role
* Status
* Rating
* Fee
* Pagination
* Dates
* Times
* Search values
* Sort values

Frontend validation is NEVER enough.

---

# 72. MongoDB ObjectId

Validate ObjectIds before executing database operations.

Invalid IDs should return:

400

instead of causing confusing internal errors.

---

# 73. MongoDB Indexes

Create indexes based on actual query patterns.

Recommended:

Users:

* email
* Better Auth user identity where needed

Doctors:

* userId
* specialization
* verificationStatus
* consultationFee
* experience
* averageRating

Appointments:

* patientId
* doctorId
* appointmentStatus
* appointmentDate
* booking slot uniqueness strategy

Reviews:

* doctorId
* appointmentId unique

Payments:

* stripePaymentIntentId unique

Favorites:

* patientId + doctorId unique

Do not create random indexes.

Document important unique constraints.

---

# 74. API Response Format

Use consistent responses.

Example success:

{
"success": true,
"message": "Appointment created successfully",
"data": {}
}

Example error:

{
"success": false,
"message": "This appointment slot is no longer available",
"error": {
"code": "APPOINTMENT_SLOT_CONFLICT"
}
}

Keep response format consistent.

---

# 75. HTTP Status Codes

Use correct statuses.

Examples:

200 OK

201 Created

204 No Content where appropriate

400 Bad Request

401 Unauthorized

403 Forbidden

404 Not Found

409 Conflict

422 Unprocessable Entity where appropriate

429 Too Many Requests

500 Internal Server Error

Do not return 200 for actual failures.

---

# 76. Centralized Error Handling

Create application error classes/structures.

Handle:

* Zod validation errors
* Authentication errors
* Authorization errors
* Better Auth errors
* Invalid ObjectId
* MongoDB duplicate key
* Missing resource
* Appointment conflict
* Invalid state transition
* Stripe errors
* Email errors
* Unexpected failures

Do not expose stack traces in production.

---

# 77. Security Middleware

Use:

Helmet

CORS

Rate limiting

Configure production security intentionally.

Do not use:

cors({ origin: "*" })

for credentialed production authentication.

---

# 78. Rate Limiting

Apply reasonable rate limits to sensitive endpoints such as:

* Contact form
* Auth-related endpoints where compatible with Better Auth
* Booking attempts
* Payment initialization
* Administrative actions if useful

Do not accidentally block normal application use with overly aggressive limits.

---

# 79. Logging

Use structured logging.

Log:

* Request failures
* Important admin actions
* Payment processing failures
* Webhook processing results
* Startup/shutdown
* Database errors

Never log:

* Password
* Session token
* JWT token
* Better Auth secret
* Google secret
* Stripe secret
* Webhook secret
* MongoDB password

---

# 80. Health Endpoint

Create:

GET /api/health

Return safe information such as:

{
"success": true,
"data": {
"status": "healthy",
"database": "connected",
"timestamp": "..."
}
}

Do not expose infrastructure credentials.

---

# 81. 404 API Handling

Unknown API routes should return structured JSON 404.

Example:

{
"success": false,
"message": "API route not found"
}

---

# 82. Graceful Shutdown

Handle:

SIGINT

SIGTERM

Close:

* HTTP server
* MongoDB client

cleanly where possible.

---

# 83. Stripe Raw Body

Ensure Stripe webhook raw body handling is configured correctly.

Do not let general JSON middleware break Stripe signature verification.

Use correct middleware order.

Add a meaningful comment because this behavior is non-obvious.

---

# 84. CORS Deployment

Development:

Allow:

http://localhost:3000

Production:

Allow only configured frontend URL(s).

Support Better Auth authentication across frontend/backend according to production domains.

---

# 85. README

Create a professional server README.

Include:

# MediCare Connect API

## Overview

## Technologies

## Architecture

## Folder Structure

## MongoDB Architecture

Clearly state:

MongoDB is the only database.

## Better Auth

Explain:

* Email/password
* Google OAuth
* Sessions
* MongoDB adapter

## JWT Verification

Explain clearly:

* JWT issuance/availability
* JWKS
* Signature verification
* Protected API flow

## RBAC

Explain:

* Patient
* Doctor
* Admin

## Ownership Authorization

Explain difference between:

role authorization

and:

resource ownership

## Doctor Verification

## Appointment Lifecycle

## Double Booking Protection

## Stripe Integration

## Stripe Webhook

## Review Rules

## Prescription Rules

## Search

## Sorting

## Pagination

## Email Reminders

## Installation

## Environment Variables

## `.env.sample`

## Local Development

## Admin Bootstrap

## Deployment

## API Endpoints

## Client Repository

Placeholder

Do not put actual credentials in README.

---

# 86. API Documentation

Document endpoints in README or an organized API section.

For each endpoint include:

* Method
* URL
* Authentication
* Allowed role
* Purpose

Example:

GET /api/doctors
Public
Search verified doctors

POST /api/appointments
Patient
Create appointment/payment attempt

PATCH /api/admin/doctors/:id/verify
Admin
Verify doctor

---

# 87. Testing

Add tests for critical business logic where practical.

Prioritize:

* Authentication middleware
* JWT verification
* RBAC
* Ownership checks
* Doctor verification
* Appointment slot conflicts
* Appointment state transitions
* Payment amount security
* Stripe webhook idempotency
* Review eligibility
* Prescription authorization

Do not add meaningless tests merely to increase test count.

---

# 88. Server Git Commit Requirement

Original project requirement requires at least 12 meaningful server commits.

Target:

18–22 meaningful backend commits

to safely exceed the requirement.

Do NOT fake commit history.

Make commits when real milestones are completed.

Recommended server commit plan:

1.

chore: initialize Express TypeScript API

2.

chore: configure environment validation and MongoDB

3.

feat: integrate Better Auth with MongoDB

4.

feat: add email and Google authentication

5.

feat: implement user roles and account status

6.

feat: add JWT verification and authorization middleware

7.

feat: implement doctor profiles

8.

feat: add admin doctor verification workflow

9.

feat: implement doctor search sorting and pagination

10.

feat: add doctor schedule management

11.

feat: implement appointment booking and slot protection

12.

feat: add appointment lifecycle management

13.

feat: integrate Stripe payment intents

14.

feat: implement secure Stripe webhook processing

15.

feat: add review management and doctor ratings

16.

feat: implement prescription management

17.

feat: add favorite doctor functionality

18.

feat: implement dashboard statistics

19.

feat: add admin analytics aggregations

20.

feat: implement appointment email reminders

21.

test: add authentication payment and appointment tests

22.

docs: document API architecture and deployment

Only create each commit when the relevant work actually exists.

---

# 89. Bad Git Commit Messages

Never use:

update

done

changes

final

new

fix

fix again

code

server update

last change

---

# 90. Meaningful Commit Principles

A meaningful commit should represent one understandable unit of work.

Good:

feat: prevent duplicate appointment slot booking

Good:

security: enforce doctor ownership on prescription routes

Good:

fix: preserve raw Stripe webhook body for signature verification

Good:

refactor: extract appointment state transition service

Good:

docs: document Better Auth JWT verification flow

---

# 91. Final Server Verification

Before considering the backend complete:

Authentication:

* Better Auth works
* Email/password works
* Google OAuth works
* Sessions persist
* No Firebase exists

Database:

* MongoDB connects
* MongoDB is the only persistent database
* Required indexes exist
* Unique constraints work

Security:

* `.env` is ignored
* `.env.sample` exists
* No secrets are hardcoded
* No secrets are logged
* CORS works correctly
* Helmet is enabled
* Rate limiting works
* Validation works

JWT:

* JWT signature verification works
* Expired JWT fails
* Invalid JWT fails
* Protected routes work

RBAC:

* Patient permissions work
* Doctor permissions work
* Admin permissions work
* Suspended users are restricted
* Ownership rules work

Doctors:

* Doctor profiles work
* Pending verification works
* Admin verification works
* Revoke verification works
* Only verified doctors appear publicly

Search:

* Name search works
* Specialization search works
* Sorting works
* Pagination works

Appointments:

* Booking works
* Double-booking is prevented
* Reschedule works according to rules
* Cancel works according to rules
* Doctor accept/reject works
* Completion works
* Invalid status transitions fail

Payments:

* Stripe PaymentIntent works
* Backend controls amount
* Webhook signature verification works
* Webhook is idempotent
* Payment record is stored
* Appointment payment state updates correctly

Reviews:

* Completed appointment requirement works
* Duplicate reviews are prevented
* Ratings calculate correctly

Prescriptions:

* Assigned doctor restriction works
* Patient can read own prescription

Favorites:

* Add works
* Remove works
* Duplicate favorite prevented

Analytics:

* Public statistics work
* Patient dashboard stats work
* Doctor stats work
* Admin analytics work

Email:

* Reminder logic works
* Duplicate reminder prevention works

Deployment:

* Production CORS works
* Health endpoint works
* No 404 on intended API routes
* No hanging requests
* Graceful errors
* TypeScript build succeeds
* Lint succeeds
* Tests succeed

Documentation:

* README complete
* `.env.sample` complete
* JWT challenge documented
* RBAC documented
* Stripe webhook documented
* MongoDB-only architecture documented

Code Quality:

* No unnecessary `any`
* No giant controllers
* No duplicated business logic
* No obvious comments
* Meaningful comments explain technical reasoning
* Clear naming
* Consistent errors
* Clean modular architecture

Do not weaken security, validation, payment verification, or authorization just to make a feature appear functional.

Implement features incrementally and keep each logical milestone suitable for a meaningful Git commit.
