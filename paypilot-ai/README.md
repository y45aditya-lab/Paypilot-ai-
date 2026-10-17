# PayPilot AI

PayPilot is a full-stack procurement and spend-management demo. It combines a
live software catalog, an AI purchase assistant, PayPal sandbox checkout,
organization-scoped purchase approvals, account-scoped transaction records,
refunds, analytics, and explainable review signals.

> **Payment environment:** PayPilot is configured for PayPal Sandbox by default.
> It is a demo project, not a certified payment or fraud-detection product. Never
> use real payment credentials until the application, deployment, and operational
> controls have been independently reviewed.

## Product capabilities

- **PayPal Sandbox checkout and capture:** the API snapshots and prices orders,
  creates PayPal orders server-side, verifies captures against the stored amount
  and currency, and records successful captures. Retries use stable
  `PayPal-Request-Id` values.
- **Transaction and order status:** authenticated users can search and page
  through their own payment records, inspect lifecycle counts and follow pending
  confirmations. Payments are persisted only after verified capture.
- **Verified, idempotent webhooks:** PayPal signatures are verified before
  processing. Event IDs are uniquely stored, concurrent deliveries are not
  acknowledged prematurely, and capture/refund handlers can safely reconcile
  retries.
- **Full-refund workspace:** eligible completed captures can be refunded through
  PayPal. Refund state is persisted, pending refunds are finalized from webhooks,
  and repeated requests reuse the same provider idempotency key.
- **Append-only audit trail and notifications:** payment, refund, reconciliation,
  and risk-review actions are recorded. In-app notifications are account-scoped
  and can be marked read.
- **Transaction-grounded AI:** users can ask about their own last 90 days of
  activity. The API sends only minimized transaction fields and account totals
  to the configured AI provider for open-ended questions; PayPal identifiers
  and user identity are excluded. Common spend, refund, and risk-signal questions
  are answered directly from verified records and work without an AI API key.
  If the AI provider is unavailable, catalog recommendations also fall back to
  deterministic live-catalog matching.
- **Analytics and explainable risk signals:** payment/refund totals remain
  separated by currency, with order statuses, daily activity, top products,
  and readable rules-based review signals for high-value and unusual purchases,
  purchase bursts, and repeated checkout attempts. Signals are a prompt for
  human review, not a fraud finding.
- **Vendor and inventory management:** administrators manage vendors and
  product-specific INR quotes, compare suppliers, update reported license stock,
  and deactivate vendors or offers. The marketplace displays available stock
  and vendor price comparisons; these are supplier-reported and do not alter
  the canonical catalog checkout price.
- **Organization workspaces and approvals:** each signup creates an isolated
  workspace. Invite employees, managers, and finance reviewers; every request
  requires a manager decision, and requests above ₹10,000 require an additional
  finance approval. Requesters cannot approve their own purchases. PayPal order
  creation is rejected unless an approved purchase request and purchase order
  exist. Budgets, policy text, vendors, offers, notifications, reports, and
  purchasing records are scoped to the organization.
- **Procurement controls:** purchase justifications, approval history/comments,
  monthly department budgets, duplicate-subscription review flags, purchase
  orders, paid subscription renewal dates, and scheduled in-app renewal reminders.
- **Local document and policy tools:** PDF and plain-text invoice uploads are
  limited to 5 MB and parsed on the API server; uploads are not sent to AI
  providers. Extracted invoice fields are marked for human review. The policy
  assistant searches the administrator-maintained approved text locally and
  returns the matching evidence.
- **Email notifications:** notifications can be delivered through SMTP when
  `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM` are
  configured. Delivery errors are logged and stored; in-app notifications
  remain available when SMTP is not configured.
- **Full transaction reports:** export all matching account transactions and
  currency-separated spending totals to CSV, or use the browser print dialog
  to print or save a PDF. Exports honor the active search and status filters.
- **Procurement tools:** marketplace search and comparison, CRM category
  discovery, AI product recommendations, a budget-aware stack optimizer, growth
  scenarios, and spreadsheet-safe CSV exports.
- **INR demo pricing:** seeded fictional products use sample monthly prices in
  Indian rupees. Catalog amounts and recommendations use paise internally, and
  budgets are enforced against server-calculated totals. These sample prices
  are not real merchant quotes or currency conversions.
- **Optional automation integration:** configured HTTPS webhook receivers get
  signed, minimal notification events for tools such as n8n, Make, or a custom
  workflow endpoint. Delivery is best-effort; the in-app notification remains
  the source of truth.

## Architecture

- `client/` — React 19, Vite, Tailwind CSS, PayPal React SDK.
- `server/` — Express 5, MongoDB/Mongoose, PayPal REST API, OpenAI SDK.
- `docker-compose.yml` — local container deployment with authenticated MongoDB.
- `../.github/workflows/ci.yml` — server checks/tests and client lint/build on
  pushes and pull requests; also validates and builds the Compose deployment.

## Local development

Requirements: Node.js 22+, npm, and MongoDB 7+.

1. Install dependencies:

   ```powershell
   cd server
   npm ci
   cd ..\client
   npm ci
   ```

2. Configure the server:

   ```powershell
   cd ..\server
   Copy-Item .env.example .env
   ```

   Set `MONGODB_URI` and `JWT_SECRET` (at least 32 random characters).    Add sandbox PayPal and OpenAI credentials to enable those provider-backed
   features. SMTP and signed outbound webhook credentials are optional.
   Existing databases must be migrated before launching the new organization
   access controls:

   ```powershell
   npm run migrate:organizations
   npm run seed
   ```

   The organization migration assigns existing users and their historical
   records to isolated workspaces, then provisions sample vendor offers. Run it
   once during a maintenance window before deploying the new server version.

3. Start the API and client in separate terminals:

   ```powershell
   # Terminal 1, from server/
   npm run dev

   # Terminal 2, from client/
   npm run dev
   ```

   The API health check is `http://localhost:5000/api/health`. Vite proxies
   `/api` requests to the API. Seed or update the demo catalog with `npm run seed`
   from `server/`; it upserts fictional INR-priced products and organization offers
   without clearing existing tenant data.

4. Set `VITE_PAYPAL_CLIENT_ID` in the client environment to display PayPal
   checkout buttons. Use sandbox buyer accounts for sandbox payments.

5. Sign up to create an Admin workspace. If upgrading an existing database,
   choose an account to promote from `server/`:

   ```powershell
   npm run promote-admin -- admin@example.com
   ```

   Sign out and back in to refresh the account role. To edit the shared product
   catalog (as distinct from organization-owned vendors and offers), configure
   `PLATFORM_ADMIN_EMAIL` to the specific trusted platform account. Never expose this command
   as a public API; it updates the named account using the server's database
   credentials.

## Environment configuration

| Variable | Required | Purpose |
|---|---:|---|
| `MONGODB_URI` | Yes | MongoDB connection string |
| `JWT_SECRET` | Yes | Access-token signing key; at least 32 characters |
| `CLIENT_ORIGIN` | Production | Exact browser origin allowed by the API |
| `PAYPAL_BASE_URL` | No | Defaults to PayPal Sandbox |
| `PAYPAL_CLIENT_ID` | For checkout | PayPal REST app client ID |
| `PAYPAL_CLIENT_SECRET` | For checkout | PayPal REST app secret; server-side only |
| `PAYPAL_WEBHOOK_ID` | For webhooks | Webhook ID used for signature verification |
| `VITE_PAYPAL_CLIENT_ID` | For checkout UI | Public PayPal SDK client ID, baked into client build |
| `OPENAI_API_KEY` | For AI | Enables recommendation and transaction copilot |
| `OPENAI_MODEL` | No | Defaults to `gpt-4o-mini` |
| `PLATFORM_ADMIN_EMAIL` | No | Email of the single account allowed to edit the shared catalog |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | For email | Server-side SMTP configuration |
| `PAYPILOT_EVENTS_WEBHOOK_URL` | No | HTTPS automation receiver URL |
| `PAYPILOT_EVENTS_WEBHOOK_SECRET` | With webhook URL | HMAC signing secret, at least 32 characters |

Copy the keys from `server/.env.example`. Never put the PayPal secret, OpenAI
key, JWT secret, or automation signing secret in the client environment.

### PayPal webhook setup

Register the public URL `https://<your-host>/api/webhooks/paypal` in the PayPal
developer dashboard. Configure its webhook ID as `PAYPAL_WEBHOOK_ID` and
subscribe to:

- `PAYMENT.CAPTURE.COMPLETED`
- `PAYMENT.CAPTURE.DENIED`
- `PAYMENT.CAPTURE.REFUNDED`
- `PAYMENT.REFUND.PENDING`
- `PAYMENT.REFUND.COMPLETED`
- `PAYMENT.REFUND.FAILED`

Webhook requests must reach the server unchanged as JSON; the Express route uses
the raw request body for provider verification. Do not put authentication or a
browser-origin check in front of PayPal's webhook endpoint.

### Optional outbound notifications

Set both `PAYPILOT_EVENTS_WEBHOOK_URL` and
`PAYPILOT_EVENTS_WEBHOOK_SECRET`. PayPilot sends a JSON notification envelope to
the HTTPS URL and signs the exact body using HMAC-SHA256 in the
`X-PayPilot-Signature: sha256=<hex>` header. Receivers should compare signatures
in constant time and return a 2xx response. Only set a URL you control; delivery
is best-effort and does not block payment confirmation.

## Tests and build checks

```powershell
# From server/
npm run check
npm test

# From client/
npm run lint
npm test
npm run build
```

The server tests cover PayPal money conversion and risk-signal boundaries; the
client tests cover report escaping and output. CI runs the checks, lint, tests,
and production builds on pushes and pull requests, then validates the Compose
configuration and builds both deployable images. Full provider-backed
payment/webhook tests require a configured MongoDB instance and PayPal sandbox
app; do not use real payment credentials in automated tests.

## Container deployment

Docker Compose runs the client, API, and a MongoDB instance with an internal
authenticated database. From the project root:

```powershell
Copy-Item .env.example .env
```

Edit `.env` with a unique `MONGO_USER`, URL-safe `MONGO_PASSWORD`, a random
32+-character `JWT_SECRET`, and provider credentials as needed. Then run:

```powershell
docker compose up --build -d
```

Open `http://localhost:8080`; the Nginx client container serves the SPA and
proxies `/api` to the API container. For a public deployment, terminate HTTPS at
a trusted reverse proxy/load balancer, set `CLIENT_ORIGIN` to the exact HTTPS
origin, use production PayPal credentials only after review, and use a managed
MongoDB service with TLS, backups, restricted network access, and least-privilege
credentials. Do not expose MongoDB publicly. Configure a public PayPal webhook
URL after deployment as described above. CI builds deployment images; publishing
to a public hosting provider still requires configuring that provider's
credentials and deployment target.

## Core API

Authenticated API routes use bearer access tokens except the verified PayPal
webhook:

- `POST /api/requests`, `GET /api/requests`,
  `PATCH /api/requests/:id/decision`, `POST /api/requests/:id/order`
- `POST /api/orders/:id/paypal`,
  `POST /api/orders/:id/capture`, `POST /api/orders/:id/cancel`
- `GET /api/transactions`, `POST /api/transactions/:id/refund`,
  `GET /api/transactions/audit`
- `GET /api/analytics?days=30`, `GET /api/notifications`,
  `PATCH /api/notifications/:id/read`
- `POST /api/copilot/transactions`
- `GET /api/subscriptions`, `PATCH /api/subscriptions/:id/cancel`
- `POST/GET /api/documents/invoices` (multipart upload/list)
- Admin: `GET/PATCH /api/admin/organization`, `POST /api/admin/invites`,
  `GET/PUT /api/admin/budgets`, `POST /api/admin/organization/policy-answer`
- `POST /api/webhooks/paypal` — signature-verified, provider-authenticated
- Admin-only `GET/POST/PATCH /api/admin/vendors`,
  `GET/POST/PATCH/DELETE /api/admin/offers`, and `/api/admin/products`

Direct `POST /api/orders` is intentionally disabled: checkout must be created
from an approved request through `POST /api/requests/:id/order`. Request, vendor,
budget, document, and administrative endpoints enforce organization and role
scope; transaction history remains requester-account scoped. Refunds currently
support full capture refunds only. PayPal is the final source
of truth for payment and refund settlement; the dashboard reports pending
operations until confirmed.
