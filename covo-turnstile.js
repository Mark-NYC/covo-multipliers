/*!
 * Covo Multipliers — shared Cloudflare Turnstile helper
 * =====================================================
 *
 * One place that holds the PUBLIC Turnstile site key and renders/reads/reset
 * the widget for every lab registration form. The site key is public and safe
 * to ship in browser code — the SECRET key lives only on the server
 * (register Edge Function) and is never exposed here.
 *
 * Usage on a page:
 *   <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
 *   <script src="/covo-turnstile.js"></script>
 *   ...
 *   <div id="turnstile-holder"></div>
 *   ...
 *   var ts = window.CovoTurnstile.create(document.getElementById('turnstile-holder'), {
 *     action: 'lab_register',
 *   });
 *   // On submit:  var token = ts.token();   // pass as `turnstile_token`
 *   // On failure: ts.reset();               // refresh the widget for a retry
 *
 * SITE KEY: this file contains NO hardcoded key. The public site key is
 * provided by `window.COVO_TURNSTILE_SITE_KEY`, which is set by
 * `turnstile-config.js` — a file generated at build time from the
 * PUBLIC_TURNSTILE_SITE_KEY Vercel environment variable (see
 * scripts/generate-turnstile-config.js). Rotating the key is an env-var change,
 * never a source edit. The SECRET key lives only in Supabase Edge Function
 * secrets and never appears in browser code.
 *
 * Load order on a page:
 *   <script src="/turnstile-config.js"></script>   <!-- sets the global -->
 *   <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
 *   <script src="/covo-turnstile.js"></script>
 */
(function (global) {
  'use strict';

  // Public site key comes exclusively from the global set by turnstile-config.js.
  var SITE_KEY = (global.COVO_TURNSTILE_SITE_KEY || '').trim();
  if (!SITE_KEY && global.console) {
    console.error(
      'CovoTurnstile: window.COVO_TURNSTILE_SITE_KEY is not set. Ensure /turnstile-config.js ' +
      'is loaded before covo-turnstile.js (it is generated at build from PUBLIC_TURNSTILE_SITE_KEY).'
    );
  }

  // Runs cb once the Turnstile API is available. The api.js script is loaded
  // async, so it may not be ready when a form wires itself up.
  function ready(cb) {
    if (global.turnstile && typeof global.turnstile.render === 'function') {
      cb();
      return;
    }
    var tries = 0;
    var iv = setInterval(function () {
      if (global.turnstile && typeof global.turnstile.render === 'function') {
        clearInterval(iv);
        cb();
      } else if (++tries > 150) { // ~15s
        clearInterval(iv);
      }
    }, 100);
  }

  // Renders a managed Turnstile widget into `el` and returns a small controller
  // with token()/reset(). Managed Turnstile usually solves without any user
  // interaction, so token() is populated by the time a real user submits.
  function create(el, opts) {
    opts = opts || {};
    var widgetId = null;
    var lastToken = '';

    ready(function () {
      if (!el || !SITE_KEY) return;
      try {
        widgetId = global.turnstile.render(el, {
          sitekey: SITE_KEY,
          action: opts.action || 'lab_register',
          // 'auto' respects the visitor's light/dark preference.
          theme: opts.theme || 'auto',
          callback: function (token) {
            lastToken = token || '';
            if (typeof opts.onToken === 'function') opts.onToken(token);
          },
          'error-callback': function () {
            lastToken = '';
            if (typeof opts.onError === 'function') opts.onError();
          },
          'expired-callback': function () {
            lastToken = '';
            if (typeof opts.onExpire === 'function') opts.onExpire();
          }
        });
      } catch (err) {
        // Leave widgetId null; token() returns '' and the server (once
        // enforcing) will reject with the friendly retry message.
        if (global.console) console.error('CovoTurnstile: render failed', err);
      }
    });

    return {
      token: function () {
        if (widgetId != null && global.turnstile) {
          try {
            return global.turnstile.getResponse(widgetId) || lastToken || '';
          } catch (err) { /* fall through */ }
        }
        return lastToken || '';
      },
      reset: function () {
        lastToken = '';
        if (widgetId != null && global.turnstile) {
          try { global.turnstile.reset(widgetId); } catch (err) { /* ignore */ }
        }
      }
    };
  }

  global.CovoTurnstile = { create: create, SITE_KEY: SITE_KEY };
})(typeof window !== 'undefined' ? window : this);
