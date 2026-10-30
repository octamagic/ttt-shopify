/*
  PostHog checkout pixel for Threaditate.
  Paste into Shopify admin: Settings > Customer events > Add custom pixel.
  Name it "PostHog checkout". Permission: "Not required" is fine for now;
  set the matching data-sale setting when you adopt a consent banner.

  Why a pixel: theme JS does not run on checkout, so the storefront snippet
  never sees checkout_started / checkout_completed. This pixel runs in
  Shopify's sandbox and posts those events straight to PostHog.

  Identity: the pixel reads the posthog cookie the theme set on .threaditate.com
  and reuses its distinct_id, so the purchase lands on the same person as the
  product views and add-to-carts.
*/
const POSTHOG_TOKEN = 'phc_kAjV7TfyUfu7MX9zLLS6UMDE7HJPMEXVPsC2kGyb7bfM';
const POSTHOG_HOST = 'https://us.i.posthog.com';

async function distinctId() {
  try {
    const raw = await browser.cookie.get(`ph_${POSTHOG_TOKEN}_posthog`);
    if (raw) {
      const parsed = JSON.parse(decodeURIComponent(raw));
      if (parsed.distinct_id) return String(parsed.distinct_id);
    }
  } catch (e) { /* fall through */ }
  return `shopify-client:${init.context.document.location.host}:${init.data.checkout?.token ?? 'anon'}`;
}

function lineItems(checkout) {
  return (checkout.lineItems || []).map((li) => ({
    product_id: li.variant?.product?.id,
    variant_id: li.variant?.id,
    name: li.variant?.product?.title,
    variant_name: li.variant?.title,
    sku: li.variant?.sku,
    quantity: li.quantity,
    price: li.variant?.price?.amount,
    currency: li.variant?.price?.currencyCode,
  }));
}

async function capture(eventName, event, extra = {}) {
  const checkout = event.data.checkout;
  const body = {
    api_key: POSTHOG_TOKEN,
    event: eventName,
    distinct_id: await distinctId(),
    timestamp: event.timestamp,
    properties: {
      $current_url: event.context.document.location.href,
      $lib: 'shopify-pixel',
      site: 'storefront',
      shopify_client_id: event.clientId,
      checkout_token: checkout?.token,
      currency: checkout?.currencyCode,
      subtotal: checkout?.subtotalPrice?.amount,
      total: checkout?.totalPrice?.amount,
      shipping: checkout?.shippingLine?.price?.amount,
      discount_codes: (checkout?.discountApplications || []).map((d) => d.title),
      item_count: (checkout?.lineItems || []).reduce((n, li) => n + li.quantity, 0),
      products: lineItems(checkout || {}),
      ...extra,
    },
  };
  await fetch(`${POSTHOG_HOST}/i/v0/e/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    keepalive: true,
  });
}

analytics.subscribe('checkout_started', (event) => capture('Checkout Started', event));
analytics.subscribe('checkout_contact_info_submitted', (event) => capture('Checkout Contact Submitted', event));
analytics.subscribe('checkout_shipping_info_submitted', (event) => capture('Checkout Shipping Submitted', event));
analytics.subscribe('payment_info_submitted', (event) => capture('Payment Info Submitted', event));
analytics.subscribe('checkout_completed', (event) =>
  capture('Order Completed', event, {
    order_id: event.data.checkout?.order?.id,
    email: event.data.checkout?.email,
  })
);
