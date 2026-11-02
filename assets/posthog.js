/*
  PostHog for the storefront: loader, init, custom events, experiment helper.
  Rendered by snippets/posthog.liquid only when a project token is set; config
  comes from the #ph-config JSON block. Event names follow PostHog's ecommerce
  spec so they line up with the checkout pixel (docs/posthog-checkout-pixel.js).
*/
(function () {
  var configNode = document.getElementById('ph-config');
  if (!configNode) return;
  var config;
  try { config = JSON.parse(configNode.textContent); } catch (e) { return; }
  if (!config.token) return;

  /* Official posthog-js loader stub (queues calls until array.js arrives). */
  !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSurveysLoaded onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey canRenderSurveyAsync identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug getPageViewId captureTraceFeedback captureTraceMetric".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);

  var ph = window.posthog;
  ph.init(config.token, {
    api_host: config.api_host,
    ui_host: 'https://us.posthog.com',
    defaults: '2026-01-30',
    autocapture: true,
    capture_pageview: true,
    capture_pageleave: true,
    disable_session_recording: !config.session_replay,
    session_recording: { maskAllInputs: true, maskTextSelector: '[data-ph-mask]' },
    person_profiles: 'identified_only'
  });

  /* Page context: every event on this page carries these. */
  ph.register(config.context || {});

  if (config.customer && config.customer.id) {
    ph.identify(String(config.customer.id), {
      email: config.customer.email,
      shopify_customer_id: config.customer.id,
      orders_count: config.customer.orders_count
    });
  }

  function money(cents) {
    return typeof cents === 'number' ? cents / 100 : undefined;
  }

  function lineItemProps(item) {
    return {
      product_id: item.product_id,
      variant_id: item.variant_id,
      name: item.product_title || item.title,
      variant_name: item.variant_title,
      sku: item.sku,
      handle: item.handle,
      quantity: item.quantity,
      price: money(item.price),
      currency: (window.Shopify && window.Shopify.currency && window.Shopify.currency.active) || undefined
    };
  }

  /* Product page view, from the product payload the snippet renders. */
  var productNode = document.getElementById('ph-product');
  if (productNode) {
    try {
      ph.capture('Product Viewed', JSON.parse(productNode.textContent));
    } catch (e) { /* malformed payload, skip */ }
  }

  /* Add to cart: component-product-form.js dispatches this with the
     /cart/add.js response as detail (single line item or {items:[...]}). */
  document.addEventListener('ajaxProduct:added', function (event) {
    var json = event.detail;
    if (!json) { ph.capture('Product Added'); return; }
    var items = json.items ? json.items : [json];
    items.forEach(function (item) {
      ph.capture('Product Added', lineItemProps(item));
    });
  });

  /* Cart line changes from the cart page / drawer (cart.js). */
  document.addEventListener('cart:update', function (event) {
    var cart = event.detail;
    if (!cart) return;
    ph.capture('Cart Updated', {
      item_count: cart.item_count,
      total_price: money(cart.total_price),
      currency: cart.currency
    });
  });

  /* Checkout click from cart page, cart drawer, or add-to-cart notification. */
  document.addEventListener('click', function (event) {
    var button = event.target.closest('button[name="checkout"], a[href="/checkout"]');
    if (!button) return;
    ph.capture('Checkout Clicked', { source: button.closest('.cart-notification') ? 'notification' : 'cart' });
  }, true);

  /* Outbound clicks to the app, so the storefront -> app handoff is visible. */
  document.addEventListener('click', function (event) {
    var link = event.target.closest('a[href*="go.threaditate.com"]');
    if (!link) return;
    ph.capture('App Link Clicked', { href: link.href, text: (link.textContent || '').trim().slice(0, 80) });
  }, true);

  /*
    Experiment helper.
    Markup: <div data-ph-flag="hero-cta-test" data-ph-variant="control">...</div>
            <div data-ph-flag="hero-cta-test" data-ph-variant="test">...</div>
    All variants start hidden (CSS in the snippet). Once flags arrive the
    matching variant is shown; if flags never arrive (blocked, timeout) the
    'control' variant is shown so the page never stays blank.
  */
  var FLAG_TIMEOUT_MS = 1500;
  var resolved = false;

  function resolveVariants(getVariant) {
    if (resolved) return;
    resolved = true;
    var nodes = document.querySelectorAll('[data-ph-flag]');
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var flag = node.getAttribute('data-ph-flag');
      var variant = node.getAttribute('data-ph-variant') || 'control';
      var active = getVariant(flag);
      if (active === true) active = 'test';
      if (!active) active = 'control';
      node.hidden = String(active) !== variant;
    }
    document.documentElement.classList.add('ph-flags-ready');
  }

  if (document.querySelector('[data-ph-flag]')) {
    ph.onFeatureFlags(function () {
      resolveVariants(function (flag) { return ph.getFeatureFlag(flag); });
    });
    setTimeout(function () {
      resolveVariants(function () { return 'control'; });
    }, FLAG_TIMEOUT_MS);
  }
})();
