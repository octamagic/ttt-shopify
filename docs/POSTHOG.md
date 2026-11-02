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
| `Section Viewed` | every page | half of a section (or half the screen) in view, once per section per page |
| `CTA Clicked` | every page | a button-styled link or a product link inside `<main>` |
| `FAQ Opened` | FAQ sections | opening an accordion question |
| `Before After Slider Used` | any before/after slider | first drag per slider per page |
| `Video Clicked` | embedded videos | focus moving into the player iframe (plays inside YouTube can't be seen directly) |
| `Newsletter Submitted` | signup forms | submitting a newsletter form |
| `Checkout Started`, `Checkout Contact Submitted`, `Checkout Shipping Submitted`, `Payment Info Submitted`, `Order Completed` | checkout | the custom pixel |

Every storefront event also carries `site: storefront`, the Shopify template
name and suffix, and the theme name, so you can filter app vs store traffic.

The marketing-page events carry `section` (readable, e.g. `hero_dark`),
`section_key` (the template key) and `section_position` (1 = top of page).
A funnel of `Section Viewed` by `section_position` shows how far down each
page people get.

**Testing note:** posthog-js drops events from automated browsers (it reads
`navigator.webdriver` and the HeadlessChrome brand). Playwright or Puppeteer
checks see `flags` requests but no events unless both are spoofed.

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

PostHog Experiments do the splitting and the stats. The theme renders the
assigned version. Tests work on any page of the store. Shopify's checkout
itself can't be changed from the theme, but checkout events from the pixel
can be the goal metric.

1. **PostHog > Experiments > New experiment.** Pick a flag key such as
   `home-hero-photo`, with variants `control` and `test`. For the goal metric,
   use `Order Completed` (needs the checkout pixel), or `Product Added` /
   `CTA Clicked` for faster reads.
2. **Mark the variants. In the Theme Editor (no code):**
   - Duplicate the section you want to test and edit the copy (new photo,
     heading, button text).
   - Add an **A/B test** section directly above the original: flag key
     `home-hero-photo`, variant `control`.
   - Add another directly above the copy: same flag key, variant `test`.
   - Save. The editor shows both versions under yellow labels. Customers
     only see their assigned one, and the markers take no space.

   **Or in Liquid**, for a change inside a section:
   ```liquid
   <div data-ph-flag="hero-cta-copy" data-ph-variant="control">
     {% render 'button', label: 'Get my kit' %}
   </div>
   <div data-ph-flag="hero-cta-copy" data-ph-variant="test">
     {% render 'button', label: 'Turn my photo into a kit' %}
   </div>
   ```
   For JS-driven changes read `window.posthog` at call time (not a copy
   saved before the library loaded):
   ```js
   posthog.onFeatureFlags(function () {
     if (window.posthog.getFeatureFlag('hero-cta-copy') === 'test') { /* swap */ }
   });
   ```
3. **Launch the experiment in PostHog.** Exposure is recorded the first time
   a visitor's flag is evaluated. Until flags arrive (usually well under a
   second), control holds its place invisibly. If PostHog is blocked or
   slow, control shows after 1.5 s.
4. **Preview a variant** in your own browser console:
   `posthog.featureFlags.overrideFeatureFlags({ flags: { 'home-hero-photo': 'test' } })`,
   then reload. Undo with `overrideFeatureFlags(false)`.
5. **Ship the winner.** Delete the losing section and both A/B test markers
   (or the losing Liquid block), then end the experiment and archive the flag.

Not suited to these tools: price and shipping-rate tests. Those change
checkout, so they need an app such as Intelligems or Shoplift.
