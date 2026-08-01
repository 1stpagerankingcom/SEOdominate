// Stripe billing scaffold for SEODominate.
//
// This is intentionally a *scaffold*: it wires the plumbing (checkout session,
// customer upsert, webhook signature verification, entitlement lookup) so a paid
// tier can be switched on without restructuring. Nothing activates unless
// STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET are present in the environment.
//
// Activation:
//   1. npm install stripe
//   2. Set STRIPE_SECRET_KEY, STRIPE_PRICE_ID (one-time or monthly), STRIPE_WEBHOOK_SECRET.
//   3. In Stripe, create a webhook to {APP_URL}/api/billing/webhook with events:
//      checkout.session.completed, customer.subscription.updated/deleted, invoice.paid.
//   4. Call POST /api/billing/checkout { email, agencyId } from the agency dashboard
//      to open a Stripe Checkout session; the webhook stores entitlement in Teable
//      (Agencies.Integration Health -> 'Active subscriber') or a billing table.
//
// Without the env vars every endpoint returns 501 so the platform keeps working.

let stripe = null;
function getStripe() {
  if (stripe) return stripe;
  if (!process.env.STRIPE_SECRET_KEY) return null;
  try {
    // Lazy require so the module loads even when the package isn't installed.
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  } catch {
    return null;
  }
  return stripe;
}

const PRICE_IDS = (process.env.STRIPE_PRICE_ID || '').split(',').map(s => s.trim()).filter(Boolean);

async function createCheckoutSession({ email, agencyId, successUrl, cancelUrl }) {
  const s = getStripe();
  if (!s) return null;
  const customer = await s.customers.create({
    email,
    metadata: { agencyId: agencyId || '' },
  });
  const session = await s.checkout.sessions.create({
    mode: PRICE_IDS.length ? 'subscription' : 'payment',
    customer: customer.id,
    line_items: PRICE_IDS.length
      ? PRICE_IDS.map(price => ({ price, quantity: 1 }))
      : [{ price_data: { currency: 'usd', product_data: { name: 'SEODominate Pro' }, unit_amount: 4900 }, quantity: 1 }],
    success_url: successUrl || `${process.env.APP_URL || 'https://seodominate.vercel.app'}/agency?billing=success`,
    cancel_url: cancelUrl || `${process.env.APP_URL || 'https://seodominate.vercel.app'}/agency?billing=cancelled`,
    metadata: { agencyId: agencyId || '', email: email || '' },
  });
  return session;
}

async function handleWebhookEvent(payload, signature) {
  const s = getStripe();
  if (!s || !process.env.STRIPE_WEBHOOK_SECRET) return null;
  const event = s.webhooks.constructEvent(payload, signature, process.env.STRIPE_WEBHOOK_SECRET);
  // Persist entitlement. In production, write to Teable here:
  //   const agencyId = event.data.object.metadata?.agencyId;
  //   -> set Agencies table 'Integration Health' = 'Active subscriber'
  //      (or create a row in a Billing table scoped to the agency).
  switch (event.type) {
    case 'checkout.session.completed':
      return { ok: true, event: event.type, customer: event.data.object.customer, metadata: event.data.object.metadata || {} };
    case 'invoice.paid':
      return { ok: true, event: event.type, subscription: event.data.object.subscription };
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      return { ok: true, event: event.type, subscription: event.data.object.id, status: event.data.object.status };
    default:
      return { ok: true, event: event.type };
  }
}

module.exports = { createCheckoutSession, handleWebhookEvent, isConfigured: () => !!getStripe() };
