# PostHog on the storefront

Behavioral tracking and A/B experiments for threaditate.com. Same PostHog
project as go.threaditate.com, so a visitor is one person from the first ad
click, through the storefront, into the app.

## What is in the theme

| File | Job |
| --- | --- |
| `snippets/posthog.liquid` | Loads posthog-js, registers page context, identifies logged-in customers, emits the product payload on product pages, anti-flicker CSS. |
| `assets/posthog.js` | Custom events (below) and the experiment helper. |
| `config/settings_schema.json` (Analytics) | Token, API host, replay toggle. Blank token turns PostHog off. Editable in Theme Editor > Theme settings > Analytics. |
| `docs/posthog-checkout-pixel.js` | Custom pixel for checkout events. Lives in Shopify admin, not the theme. |

The project token (`phc_...`) is a public client key by design; it is the
same one shipped in the go.threaditate.com bundle.

## Events

Autocapture is on, so every click, pageview, and pageleave is recorded
without code. On top of that:

| Event | Where | Fired by |
| --- | --- | --- |
| `Product Viewed` | product pages | `posthog.js`, from the `#ph-product` JSON the snippet renders |
| `Product Added` | any add-to-cart form | `ajaxProduct:added` event, now carrying the `/cart/add.js` response |
| `Cart Updated` | cart page and drawer | `cart:update` event from `cart.js` |
| `Checkout Clicked` | cart, drawer, add-to-cart notification | click on `button[name="checkout"]` |
| `App Link Clicked` | anywhere | click on a link to go.threaditate.com |
| `Checkout Started`, `Checkout Contact Submitted`, `Checkout Shipping Submitted`, `Payment Info Submitted`, `Order Completed` | checkout | the custom pixel |

Every storefront event also carries `site: storefront`, the Shopify template
name and suffix, and the theme name, so you can filter app vs store traffic.

## One-time admin setup

1. **Merge the PR.** The token default in the schema means it works on deploy.
   To change or blank it: Theme Editor > Theme settings > Analytics.
2. **Add the checkout pixel.** Shopify admin > Settings > Customer events >
   Add custom pixel > name it `PostHog checkout` > paste
   `docs/posthog-checkout-pixel.js` > Save > Connect.
3. **Verify.** Place a test order (or use a 100% discount code) and check
   PostHog > Activity for `Product Viewed` > `Product Added` > `Checkout
   Started` > `Order Completed` on one person.
4. **Session replay** (optional). Tick the theme setting and also enable
   replay in PostHog > Settings > Session replay. Replay is off by default
   on the store to keep the page light until you want it.
5. **Reverse proxy** (optional, later). Ad blockers drop a share of events sent
   straight to `us.i.posthog.com`. Shopify themes cannot rewrite requests,
   but a Cloudflare worker on something like `ph.threaditate.com` can proxy
   them; then change the API host setting. PostHog docs: "Reverse proxy".

## Running an A/B test

PostHog Experiments do the splitting and the stats. The theme only needs to
render the right variant.

1. PostHog > Experiments > New experiment. Pick a flag key such as
   `hero-cta-copy`, variants `control` and `test`, goal metric e.g. funnel
   `$pageview` on `/products/...` to `Order Completed`.
2. In the theme, tag the markup:

   ```liquid
   <div data-ph-flag="hero-cta-copy" data-ph-variant="control">
     {% render 'button', label: 'Get my kit' %}
   </div>
   <div data-ph-flag="hero-cta-copy" data-ph-variant="test">
     {% render 'button', label: 'Turn my photo into a kit' %}
   </div>
   ```

   Both start hidden; `posthog.js` shows the matching one when flags
   load, and falls back to `control` after 1.5 s or if PostHog is blocked.
   Boolean flags map to `test` when on, `control` when off.

   For JS-driven changes use the API directly:

   ```js
   posthog.onFeatureFlags(function () {
     if (posthog.getFeatureFlag('hero-cta-copy') === 'test') { /* swap */ }
   });
   ```

3. Launch the experiment in PostHog. Exposure is recorded automatically the
   first time the flag is evaluated for a visitor.
4. Ship the winner by removing the losing block and the attributes, then
   archive the flag.

Good first candidates from the Oct 2026 PDP conversion pass: hero CTA copy,
buy-box ordering, and whether the guarantee line sits above or below the
price. Keep to one experiment per page at a time.

### What this approach does not cover

Variants are chosen in the browser, so this suits copy, layout, and section
swaps. Price tests, shipping-threshold tests, and checkout changes need a
Shopify app (Intelligems, Shoplift) or Shopify Functions.
