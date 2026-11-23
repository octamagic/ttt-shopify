/*
 * Sale notice (snippets/sale-notice.liquid).
 *
 * 1. Applies the sale's discount code to the shopper's cart, once per browser
 *    session, through Shopify's Cart API. The cart and checkout then show
 *    the sale price with no code to type.
 * 2. Hides the sale bar and the buy box note at the end time, in case the
 *    page was cached or left open past it.
 */
(function () {
  var script = document.currentScript;
  if (!script) return;

  var code = script.getAttribute('data-sale-code');
  var endTs = Date.parse(script.getAttribute('data-sale-end-at') || '');
  var ended = !isNaN(endTs) && Date.now() >= endTs;

  function hideNotices() {
    document.querySelectorAll('.sale-bar, .sale-note').forEach(function (el) {
      el.hidden = true;
    });
  }

  function whenReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  if (ended) {
    whenReady(hideNotices);
    return;
  }

  if (!isNaN(endTs)) {
    var remaining = endTs - Date.now();
    /* setTimeout overflows past about 24 days. */
    if (remaining < 2000000000) setTimeout(hideNotices, remaining);
  }

  if (!code) return;

  var key = 'sale-code-applied';
  try {
    if (sessionStorage.getItem(key) === code) return;
  } catch (e) {
    /* Storage blocked: apply on every page, which is harmless. */
  }

  var root = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '/';

  function remember() {
    try {
      sessionStorage.setItem(key, code);
    } catch (e) {}
  }

  /* Keep any code the shopper already has, and add the sale code to it. */
  fetch(root + 'cart.js', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
    .then(function (response) {
      return response.json();
    })
    .then(function (cart) {
      var codes = (cart.discount_codes || []).map(function (entry) {
        return entry.code;
      });
      var has = codes.some(function (existing) {
        return existing.toLowerCase() === code.toLowerCase();
      });
      if (has) return true;

      codes.push(code);
      return fetch(root + 'cart/update.js', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ discount: codes.join(',') }),
      }).then(function (response) {
        return response.ok;
      });
    })
    .then(function (applied) {
      if (applied) remember();
    })
    .catch(function () {});
})();
