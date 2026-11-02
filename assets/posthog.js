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

  /* window.posthog is the loader stub until array.js arrives, then the real
     client replaces it. Calls made on the stub after that are never sent,
     so everything that runs later must read window.posthog at call time. */
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

  function capture(name, props) {
    window.posthog.capture(name, props);
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
      capture('Product Viewed', JSON.parse(productNode.textContent));
    } catch (e) { /* malformed payload, skip */ }
  }

  /* Add to cart: component-product-form.js dispatches this with the
     /cart/add.js response as detail (single line item or {items:[...]}). */
  document.addEventListener('ajaxProduct:added', function (event) {
    var json = event.detail;
    if (!json) { capture('Product Added'); return; }
    var items = json.items ? json.items : [json];
    items.forEach(function (item) {
      capture('Product Added', lineItemProps(item));
    });
  });

  /* Cart line changes from the cart page / drawer (cart.js). */
  document.addEventListener('cart:update', function (event) {
    var cart = event.detail;
    if (!cart) return;
    capture('Cart Updated', {
      item_count: cart.item_count,
      total_price: money(cart.total_price),
      currency: cart.currency
    });
  });

  /* Checkout click from cart page, cart drawer, or add-to-cart notification. */
  document.addEventListener('click', function (event) {
    var button = event.target.closest('button[name="checkout"], a[href="/checkout"]');
    if (!button) return;
    capture('Checkout Clicked', { source: button.closest('.cart-notification') ? 'notification' : 'cart' });
  }, true);

  /* Outbound clicks to the app, so the storefront -> app handoff is visible. */
  document.addEventListener('click', function (event) {
    var link = event.target.closest('a[href*="go.threaditate.com"]');
    if (!link) return;
    capture('App Link Clicked', { href: link.href, text: (link.textContent || '').trim().slice(0, 80) });
  }, true);

  /* ── Marketing pages ──
     Which section something happened in. The wrapper id ends in the
     template's section key (e.g. hero_dark_4Nid7U); the editor appends a
     random 6-character suffix, which is dropped for the readable name. */
  function sectionProps(el) {
    var wrapper = el && el.closest('.shopify-section');
    if (!wrapper || !wrapper.id) return {};
    var key = wrapper.id.split('__').pop().replace(/^shopify-section-/, '');
    var sections = document.querySelectorAll('main .shopify-section');
    return {
      section: key.replace(/_[A-Za-z0-9]{6}$/, ''),
      section_key: key,
      section_position: Array.prototype.indexOf.call(sections, wrapper) + 1
    };
  }

  function text(el) {
    return (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  }

  function assign(target, source) {
    for (var k in source) { if (Object.prototype.hasOwnProperty.call(source, k)) target[k] = source[k]; }
    return target;
  }

  /* Section Viewed: once per section per page, when half of it (or half the
     screen, for sections taller than the screen) is in view. Shows how far
     down the page people get, section by section. */
  if ('IntersectionObserver' in window) {
    var seen = new WeakSet();
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var target = entry.target;
        if (seen.has(target)) return;
        var visible = entry.intersectionRect.height;
        if (visible < Math.min(entry.boundingClientRect.height, window.innerHeight) * 0.5) return;
        seen.add(target);
        observer.unobserve(target);
        capture('Section Viewed', sectionProps(target));
      });
    }, { threshold: [0, 0.25, 0.5, 0.75, 1] });
    document.querySelectorAll('main .shopify-section').forEach(function (section) {
      if (section.offsetHeight > 0) observer.observe(section);
    });
  }

  /* CTA Clicked: any button-styled link or a link to a product, with the
     section it was in, so "Get my kit" in the hero vs the banner is clear. */
  document.addEventListener('click', function (event) {
    var cta = event.target.closest('main a[href]');
    if (!cta) return;
    var href = cta.getAttribute('href') || '';
    var isButton = /(^|\s)(btn|button)(\s|$|--)|__btn/.test(cta.className);
    if (!isButton && href.indexOf('/products/') === -1) return;
    capture('CTA Clicked', assign({ text: text(cta), href: cta.href }, sectionProps(cta)));
  }, true);

  /* FAQ Opened: accordion buttons and <details> questions. */
  document.addEventListener('click', function (event) {
    var toggle = event.target.closest('[class*="faq"] [aria-expanded="false"], details:not([open]) > summary');
    if (!toggle) return;
    capture('FAQ Opened', assign({ question: text(toggle) }, sectionProps(toggle)));
  }, true);

  /* Before/After Slider Used: first drag of each slider on the page. */
  document.addEventListener('input', function (event) {
    var slider = event.target.closest('before-after-slider');
    if (!slider || slider.dataset.phTracked) return;
    slider.dataset.phTracked = '1';
    capture('Before After Slider Used', sectionProps(slider));
  }, true);

  /* Video Clicked: clicks inside an embedded player can't be seen directly,
     but focus moving into the iframe means the visitor clicked it. */
  window.addEventListener('blur', function () {
    setTimeout(function () {
      var frame = document.activeElement;
      if (!frame || frame.tagName !== 'IFRAME' || frame.dataset.phTracked) return;
      frame.dataset.phTracked = '1';
      capture('Video Clicked', assign({ src: (frame.src || '').split('?')[0] }, sectionProps(frame)));
    }, 0);
  });

  /* Newsletter Submitted: the footer / section signup forms. */
  document.addEventListener('submit', function (event) {
    var form = event.target.closest('form.newsletter-form, form[id*="newsletter"], form[id*="Newsletter"]');
    if (!form) return;
    capture('Newsletter Submitted', sectionProps(form));
  }, true);

  /*
    Experiment helper. Two ways to mark variants:

    1. In the Theme Editor (no code): add an "A/B test" section directly
       above each version of a section, with the same flag key and the
       variant name. The marker hides or shows the section right after it.
       See sections/ab-test.liquid.

    2. In Liquid: <div data-ph-flag="hero-cta-test" data-ph-variant="control">...</div>
                  <div data-ph-flag="hero-cta-test" data-ph-variant="test">...</div>

    Until flags arrive, control stays in place (invisible) and other variants
    are hidden. If flags never arrive (blocked, timeout) control is shown, so
    the page never stays blank. Boolean flags map to test (on) / control (off).
  */
  var FLAG_TIMEOUT_MS = 1500;
  var resolved = false;

  function activeVariant(value) {
    if (value === true) return 'test';
    return value ? String(value) : 'control';
  }

  function resolveVariants(getVariant) {
    if (resolved) return;
    resolved = true;
    var nodes = document.querySelectorAll('[data-ph-flag]');
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var variant = node.getAttribute('data-ph-variant') || 'control';
      node.hidden = activeVariant(getVariant(node.getAttribute('data-ph-flag'))) !== variant;
    }
    var markers = document.querySelectorAll('.ab-test[data-ab-flag]');
    for (var j = 0; j < markers.length; j++) {
      var marker = markers[j];
      var wrapper = marker.closest('.shopify-section');
      var target = wrapper && wrapper.nextElementSibling;
      if (!target) continue;
      var show = activeVariant(getVariant(marker.getAttribute('data-ab-flag'))) === (marker.getAttribute('data-ab-variant') || 'control');
      target.classList.toggle('ab-test-shown', show);
      target.classList.toggle('ab-test-hidden', !show);
    }
    document.documentElement.classList.add('ph-flags-ready');
  }

  if (document.querySelector('[data-ph-flag], .ab-test[data-ab-flag]')) {
    ph.onFeatureFlags(function () {
      resolveVariants(function (flag) { return window.posthog.getFeatureFlag(flag); });
    });
    setTimeout(function () {
      resolveVariants(function () { return 'control'; });
    }, FLAG_TIMEOUT_MS);
  }
})();
