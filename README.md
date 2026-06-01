# Drivers On Deck Recruiting

Professional, mobile-responsive website and lightweight intake CRM for a direct-hire CDL driver recruiting and placement agency.

Slogan: Empty seats don’t pay. We help fill them.

## Tech Stack

This build is a static HTML/CSS/JavaScript site with a Netlify Functions backend for production.

- Static frontend: HTML, CSS, JavaScript
- Server-side form handling: Netlify Functions
- Database and admin auth: Supabase
- Email notifications: Resend
- Payments: Stripe Checkout or Stripe Payment Links

## Run Locally

For the visual/static preview, open `index.html` directly in a browser, or serve the folder:

```bash
python3 -m http.server 4173
```

Then visit `http://localhost:4173`.

For production-style local testing with functions, install dependencies and run:

```bash
npm install
npm run dev
```

Then visit the Netlify Dev URL, usually `http://localhost:8888`.

## Admin Login

Demo admin URL: `admin.html`

Static preview demo password:

```text
RaxAdmin2026!
```

Production admin login uses Supabase Auth. Create a Supabase Auth user, then add that email to `ADMIN_EMAILS`.

## Environment Variables

See `.env.example`.

## Supabase Setup

Run the SQL in `supabase/schema.sql` inside the Supabase SQL editor. It creates:

- `driver_leads`
- `carrier_leads`
- `job_orders`
- `placements`
- `tasks`
- `contact_messages`
- `payment_records`

RLS is enabled. Public visitors do not read CRM data directly. Netlify Functions use `SUPABASE_SERVICE_ROLE_KEY` for controlled server-side writes and admin reads.

## Email Setup

Production form submissions route through Netlify Functions and send:

- Admin notification for new carrier lead
- Admin notification for new driver lead
- Confirmation email to carrier
- Confirmation email to driver

Set:

- `RESEND_API_KEY`
- `FROM_EMAIL`
- `ADMIN_NOTIFICATION_EMAIL`

## Payment Portal

The site includes `payments.html` for carrier placement-fee payments. It can use Stripe Checkout or a Stripe Payment Link.

Setup:

1. Set `STRIPE_SECRET_KEY` to use Stripe Checkout sessions, or set `STRIPE_PAYMENT_LINK_URL` to redirect to a Payment Link.
2. Set `PUBLIC_SITE_URL` to your live website URL.
3. Set `STRIPE_WEBHOOK_SECRET` after creating a webhook that points to `/.netlify/functions/stripe-webhook`.
4. Test with Stripe test mode before taking live payments.

Payment attempts are stored in `payment_records`.

## Deploy

Recommended deployment: Netlify.

1. Push this folder to a Git repo.
2. Create a Netlify site from the repo.
3. Add all variables from `.env.example` in Netlify Site Configuration > Environment Variables.
4. Run `supabase/schema.sql` in Supabase.
5. Create a Supabase Auth admin user and add the email to `ADMIN_EMAILS`.
6. Deploy.

The static pages will publish from the project root and functions will publish from `netlify/functions`.

## Compliance Language

Use:

- We connect CDL drivers with carriers that are hiring.
- We support direct-hire CDL driver recruiting and placement.
- Carriers make the final hiring decision.
- Drivers are hired directly by the carrier/client.
- We help organize candidate information and coordinate interviews.

Avoid:

- Finding loads, booking freight, dispatching freight, operating as a motor carrier, guaranteeing DOT compliance, handling freight payments, employing drivers, leasing drivers.
