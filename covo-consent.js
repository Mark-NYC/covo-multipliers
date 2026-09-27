/*!
 * Covo Multipliers — consent + analytics helper
 * =============================================
 * 1. Renders a lightweight cookie-consent banner (first visit only).
 * 2. Wires Google Consent Mode v2: analytics stays "denied" until the
 *    visitor accepts, then is upgraded to "granted". Choice persists in
 *    localStorage. Ad signals stay denied (this site runs no ads).
 * 3. Auto-fires GA4 events for form submissions and primary CTA clicks so
 *    conversions are measurable without hand-wiring every page. Events send
 *    in consent-mode (cookieless/modeled) form even before acceptance.
 *
 * The gtag() stub and gtag('consent','default',{denied}) are set inline in
 * each page's <head> BEFORE this file loads, so nothing tracks until the
 * visitor opts in.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'covo_consent_v1';
  function gtag() { window.dataLayer = window.dataLayer || []; window.dataLayer.push(arguments); }

  function readChoice() {
    try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }
  function saveChoice(v) {
    try { localStorage.setItem(STORAGE_KEY, v); } catch (e) { /* private mode: ignore */ }
  }

  function grant() {
    gtag('consent', 'update', {
      analytics_storage: 'granted'
    });
  }

  // ---- Consent banner -------------------------------------------------
  function buildBanner() {
    var bar = document.createElement('div');
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-label', 'Cookie consent');
    bar.style.cssText = [
      'position:fixed', 'left:0', 'right:0', 'bottom:0', 'z-index:2147483000',
      'background:#1D2724', 'color:#FFFFFF', 'padding:16px 20px',
      'box-shadow:none', 'border-top:1px solid rgba(255,255,255,.18)', 'font:15px/1.5 var(--font-sans, system-ui,-apple-system,Segoe UI,Roboto,sans-serif)'
    ].join(';');

    var inner = document.createElement('div');
    inner.style.cssText = 'max-width:1100px;margin:0 auto;display:flex;flex-wrap:wrap;align-items:center;gap:12px 20px;justify-content:space-between;';

    var text = document.createElement('p');
    text.style.cssText = 'margin:0;flex:1 1 320px;';
    text.innerHTML = 'We use analytics cookies to understand how the site is used. ' +
      'See our <a href="/privacy" style="color:#DDE520;text-underline-offset:.2em;">Privacy Policy</a>.';

    var btns = document.createElement('div');
    btns.style.cssText = 'display:flex;gap:8px;flex:0 0 auto;';

    function mkBtn(label, primary) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.style.cssText = 'cursor:pointer;border:0;border-radius:6px;padding:9px 18px;font-weight:600;font-size:15px;letter-spacing:.06em;text-transform:uppercase;' +
        'font-family:var(--font-ui, system-ui, sans-serif);' +
        (primary ? 'background:#DDE520;color:#1D2724;' : 'background:transparent;color:#FFFFFF;border:1px solid rgba(255,255,255,.4);');
      return b;
    }

    var decline = mkBtn('Decline', false);
    var accept = mkBtn('Accept', true);

    function dismiss() { if (bar.parentNode) bar.parentNode.removeChild(bar); }

    accept.addEventListener('click', function () { saveChoice('granted'); grant(); dismiss(); });
    decline.addEventListener('click', function () { saveChoice('denied'); dismiss(); });

    btns.appendChild(decline);
    btns.appendChild(accept);
    inner.appendChild(text);
    inner.appendChild(btns);
    bar.appendChild(inner);
    return bar;
  }

  function initConsent() {
    var choice = readChoice();
    if (choice === 'granted') { grant(); return; }
    if (choice === 'denied') { return; }
    // No choice yet — show the banner.
    if (document.body) document.body.appendChild(buildBanner());
  }

  // ---- Auto event tracking -------------------------------------------
  function initEvents() {
    // Form submissions → generate_lead / form_submit
    document.addEventListener('submit', function (e) {
      var form = e.target;
      if (!form || form.tagName !== 'FORM') return;
      var id = form.id || form.getAttribute('name') || form.getAttribute('data-form') || 'unnamed_form';
      gtag('event', 'form_submit', { form_id: id, page_path: location.pathname });
    }, true);

    // Primary CTA clicks → cta_click
    document.addEventListener('click', function (e) {
      var el = e.target && e.target.closest ? e.target.closest('a.btn-primary, [data-cta]') : null;
      if (!el) return;
      var label = el.getAttribute('data-cta') || (el.textContent || '').trim().slice(0, 60) || 'cta';
      gtag('event', 'cta_click', {
        cta_label: label,
        link_url: el.getAttribute('href') || '',
        page_path: location.pathname
      });
    }, true);
  }

  function start() { initConsent(); initEvents(); }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
