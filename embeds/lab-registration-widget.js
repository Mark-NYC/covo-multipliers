/*!
 * Covo Multipliers — shared lab registration widget
 * =====================================================
 *
 * The single reusable implementation of the registration form used on
 * every Covo Multipliers lab landing page (church-circle-lab.html,
 * 4-questions.html, aquila-and-priscilla-pattern.html,
 * disciple-making-rhythm.html, from-lost-to-leader.html,
 * rhythms-of-a-covo-multiplier.html). It talks to the exact same
 * backend those pages use — the `events_with_availability` REST view to
 * read the event, and the `register` Edge Function (which calls the
 * atomic `register_for_event()` RPC) to submit — so a registration
 * submitted through this widget is indistinguishable from one submitted
 * on the full lab page: same validation, same capacity/duplicate
 * handling, same confirmation email.
 *
 * This file is designed to be embedded cross-origin (e.g. from
 * https://multiplyingdisciples.us) via a plain <script> tag:
 *
 *   <script src="https://www.covomultipliers.com/embeds/lab-registration-widget.js"></script>
 *   <div id="my-container"></div>
 *   <script>
 *     CovoLabRegistration.mount(document.getElementById('my-container'), {
 *       eventSlug: 'church-circle-september-2026', // events.slug
 *       submitLabel: 'Reserve My Seat',            // optional, defaults below
 *       consentLabel: 'Yes, email me...',          // optional, defaults below
 *       contentTag: 'home__featured-lab__form',    // optional utm_content
 *       onEvent(name, detail) { ... },              // optional analytics hook
 *     });
 *   </script>
 *
 * The marketing-opt-in checkbox is rendered after the submit button by
 * design — it's a secondary, de-emphasized action that should never
 * compete with the primary "reserve seat" conversion path. This does
 * not affect what gets stored: the server (register/index.ts) owns the
 * authoritative consent-disclosure text regardless of what's displayed
 * here, so `consentLabel` only changes the visible copy, not compliance.
 *
 * Markup is unstyled-by-default (BEM-ish `covo-reg-*` classes, no
 * `all: initial` reset) so a host site can restyle it at the
 * presentation layer to match its own design system, the same way this
 * file's own default styles are just one possible skin. Functional
 * behavior — fields, validation, submit flow, success/error states —
 * must not be changed by a host site's CSS.
 */
(function (global) {
  'use strict';

  var SUPABASE_URL = 'https://mryjrvinzbxebzvxtggi.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yeWpydmluemJ4ZWJ6dnh0Z2dpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNzQ3MzksImV4cCI6MjA5MTg1MDczOX0.U1JJQTBVKePsVFXr2oFRCdUZasWaZiTQg6g8QrFdRyw';
  var REGISTER_FUNCTION_URL = SUPABASE_URL + '/functions/v1/register';
  var CALENDAR_FUNCTION_URL = SUPABASE_URL + '/functions/v1/lab-calendar';
  var LAB_TIMEZONE = 'America/New_York';

  // Public Cloudflare Turnstile site key — safe to expose in browser code. The
  // SECRET key lives only on the server (register Edge Function). The committed
  // default is Cloudflare's "always passes" TEST key; replace with your
  // production site key at go-live (must match the server's TURNSTILE_SECRET_KEY).
  var TURNSTILE_SITE_KEY = '0x4AAAAAAD6wlX7Wg73UGvGH';
  var TURNSTILE_API_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

  // This widget is embedded cross-origin (e.g. on multiplyingdisciples.us), so
  // the host page will not have loaded the Turnstile API. Inject it once and
  // invoke cb when window.turnstile is ready.
  function ensureTurnstile(cb) {
    if (global.turnstile && typeof global.turnstile.render === 'function') { cb(); return; }
    if (!document.querySelector('script[data-covo-turnstile]')) {
      var sc = document.createElement('script');
      sc.src = TURNSTILE_API_URL;
      sc.async = true;
      sc.defer = true;
      sc.setAttribute('data-covo-turnstile', '1');
      document.head.appendChild(sc);
    }
    var tries = 0;
    var iv = setInterval(function () {
      if (global.turnstile && typeof global.turnstile.render === 'function') {
        clearInterval(iv); cb();
      } else if (++tries > 150) { clearInterval(iv); } // ~15s
    }, 100);
  }

  // Renders a managed Turnstile widget and returns a token()/reset() controller.
  function mountTurnstile(holderEl, action) {
    var widgetId = null;
    var lastToken = '';
    ensureTurnstile(function () {
      if (!holderEl) return;
      try {
        widgetId = global.turnstile.render(holderEl, {
          sitekey: TURNSTILE_SITE_KEY,
          action: action || 'lab_register',
          theme: 'auto',
          callback: function (t) { lastToken = t || ''; },
          'error-callback': function () { lastToken = ''; },
          'expired-callback': function () { lastToken = ''; }
        });
      } catch (err) {
        if (global.console) console.error('CovoLabRegistration: Turnstile render failed', err);
      }
    });
    return {
      token: function () {
        if (widgetId != null && global.turnstile) {
          try { return global.turnstile.getResponse(widgetId) || lastToken || ''; } catch (e) {}
        }
        return lastToken || '';
      },
      reset: function () {
        lastToken = '';
        if (widgetId != null && global.turnstile) {
          try { global.turnstile.reset(widgetId); } catch (e) {}
        }
      }
    };
  }

  var STYLE_ID = 'covo-reg-widget-styles';
  var STYLE_CSS =
    '.covo-reg{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;}' +
    '.covo-reg *{box-sizing:border-box;}' +
    '.covo-reg h2{margin:0 0 0.4rem;font-size:1.4rem;font-weight:800;}' +
    '.covo-reg .covo-reg__intro{margin:0 0 1.25rem;font-size:0.92rem;color:#555;}' +
    '.covo-reg__field{margin-bottom:1rem;}' +
    '.covo-reg__field label{display:block;margin-bottom:0.35rem;font-size:0.85rem;font-weight:700;color:#1a1a1a;}' +
    '.covo-reg__field input[type=text],.covo-reg__field input[type=email]{width:100%;padding:0.85rem 1rem;font-size:1rem;border:1px solid #d1d5db;border-radius:8px;background:#fff;}' +
    '.covo-reg__field input:focus{outline:2px solid #1b4d3e;outline-offset:1px;}' +
    '.covo-reg__field input:disabled{opacity:0.6;}' +
    '.covo-reg__opt-in{display:flex;align-items:flex-start;gap:0.6rem;margin-bottom:1.25rem;}' +
    '.covo-reg__opt-in input{margin-top:0.2rem;width:1.05rem;height:1.05rem;flex-shrink:0;}' +
    '.covo-reg__opt-in label{font-size:0.82rem;color:#555;line-height:1.5;}' +
    '.covo-reg__submit{display:block;width:100%;padding:1rem 1.5rem;border:none;border-radius:8px;background:#1b4d3e;color:#fff;font-size:1.05rem;font-weight:800;cursor:pointer;}' +
    '.covo-reg__submit:hover:not(:disabled){background:#10281f;}' +
    '.covo-reg__submit:disabled{opacity:0.65;cursor:not-allowed;}' +
    '.covo-reg__message{margin-top:1rem;font-size:0.9rem;line-height:1.5;}' +
    '.covo-reg__message.is-error{color:#b91c1c;font-weight:600;}' +
    '.covo-reg__loading{padding:1.5rem 0;color:#666;font-size:0.9rem;}' +
    '.covo-reg__full-notice{padding:1rem 0;}' +
    '.covo-reg__full-notice a{color:#1b4d3e;font-weight:700;}' +
    '.covo-reg__success{text-align:center;}' +
    '.covo-reg__success-icon{display:inline-flex;align-items:center;justify-content:center;width:3rem;height:3rem;border-radius:50%;background:#dcfce7;color:#15803d;font-size:1.5rem;margin-bottom:0.75rem;}' +
    '.covo-reg__success h3{margin:0 0 0.5rem;font-size:1.3rem;}' +
    '.covo-reg__success p{margin:0 0 0.75rem;font-size:0.95rem;color:#444;}' +
    '.covo-reg__cta-btn{display:inline-block;padding:0.9rem 2rem;background:#1b4d3e;color:#fff !important;font-weight:700;text-decoration:none;border-radius:8px;margin:0.75rem 0;}' +
    '.covo-reg__whatsapp{margin-top:1.25rem;padding:1.1rem 1.25rem;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;text-align:left;}' +
    '.covo-reg__whatsapp p:first-child{font-size:0.75rem;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:#15803d;margin:0 0 0.4rem;}' +
    '.covo-reg__whatsapp a{display:block;text-align:center;padding:0.7rem 1rem;background:#25D366;color:#fff !important;font-size:0.9rem;font-weight:800;text-decoration:none;border-radius:8px;}';

  function injectStylesOnce() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = STYLE_CSS;
    document.head.appendChild(style);
  }

  function esc(str) {
    var div = document.createElement('div');
    div.textContent = String(str == null ? '' : str);
    return div.innerHTML;
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function formatDate(iso) {
    try {
      return new Date(iso).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: LAB_TIMEZONE,
        timeZoneName: 'short',
      });
    } catch (err) {
      return iso;
    }
  }

  function fire(onEvent, name, detail) {
    if (typeof onEvent === 'function') {
      try {
        onEvent(name, detail || {});
      } catch (err) {
        // Never let a host page's analytics handler break registration.
        console.error('CovoLabRegistration onEvent handler threw:', err);
      }
    }
  }

  function mount(container, opts) {
    if (!container) throw new Error('CovoLabRegistration.mount: container is required.');
    opts = opts || {};
    var eventSlug = opts.eventSlug;
    if (!eventSlug) throw new Error('CovoLabRegistration.mount: opts.eventSlug is required.');
    var submitLabel = opts.submitLabel || 'Reserve Your Seat →';
    var consentLabel = opts.consentLabel || 'Yes, email me about future CoVo Multipliers labs, resources, and training. I can unsubscribe at any time.';
    var contentTag = opts.contentTag || null;
    var onEvent = opts.onEvent;

    injectStylesOnce();
    container.classList.add('covo-reg');
    container.innerHTML = '<p class="covo-reg__loading">Loading registration form&hellip;</p>';

    loadEvent(container, eventSlug, submitLabel, consentLabel, contentTag, onEvent);
  }

  function loadEvent(container, eventSlug, submitLabel, consentLabel, contentTag, onEvent) {
    var url = new URL(SUPABASE_URL + '/rest/v1/events_with_availability');
    url.searchParams.set('slug', 'eq.' + eventSlug);
    url.searchParams.set('select', '*');
    url.searchParams.set('limit', '1');

    fetch(url, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
      },
    })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (rows) {
        var event = rows && rows[0] ? rows[0] : null;
        if (!event) {
          renderUnavailable(container);
          return;
        }
        if (!event.has_availability) {
          renderFull(container);
          return;
        }
        renderForm(container, event, submitLabel, consentLabel, contentTag, onEvent);
      })
      .catch(function (err) {
        console.error('CovoLabRegistration: failed to load event', err);
        renderUnavailable(container);
      });
  }

  function renderUnavailable(container) {
    container.innerHTML =
      '<div class="covo-reg__full-notice">' +
      '<p>Registration is not available for this lab right now.</p>' +
      '<a href="https://www.covomultipliers.com/#upcoming-labs">See all upcoming labs →</a>' +
      '</div>';
  }

  function renderFull(container) {
    container.innerHTML =
      '<div class="covo-reg__full-notice">' +
      '<p>This lab is full. Check back for future labs with open seats.</p>' +
      '<a href="https://www.covomultipliers.com/#upcoming-labs">See all upcoming labs →</a>' +
      '</div>';
  }

  function renderForm(container, event, submitLabel, consentLabel, contentTag, onEvent) {
    var uid = 'covo-reg-' + Math.random().toString(36).slice(2, 8);
    container.innerHTML =
      '<form class="covo-reg__form" novalidate>' +
      '<div class="covo-reg__field">' +
      '<label for="' + uid + '-name">Full name</label>' +
      '<input type="text" id="' + uid + '-name" name="name" autocomplete="name" placeholder="Your name" required />' +
      '</div>' +
      '<div class="covo-reg__field">' +
      '<label for="' + uid + '-email">Email address</label>' +
      '<input type="email" id="' + uid + '-email" name="email" autocomplete="email" placeholder="you@example.com" required />' +
      '</div>' +
      // Honeypot: hidden off-screen (not display:none), never shown to real users.
      '<div aria-hidden="true" style="position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden;">' +
      '<label for="' + uid + '-company-website">Company website</label>' +
      '<input type="text" id="' + uid + '-company-website" name="company_website" tabindex="-1" autocomplete="off" />' +
      '</div>' +
      '<div class="covo-reg__turnstile" id="' + uid + '-turnstile" style="margin:0 0 1rem;"></div>' +
      '<button type="submit" class="covo-reg__submit">' + esc(submitLabel) + '</button>' +
      '<div class="covo-reg__message" role="alert" aria-live="polite"></div>' +
      '<div class="covo-reg__opt-in">' +
      '<input type="checkbox" id="' + uid + '-opt-in" name="marketing_opt_in" value="true" />' +
      '<label for="' + uid + '-opt-in">' + esc(consentLabel) + '</label>' +
      '</div>' +
      '</form>';

    var form = container.querySelector('.covo-reg__form');
    var nameInput = container.querySelector('#' + uid + '-name');
    var emailInput = container.querySelector('#' + uid + '-email');
    var optInInput = container.querySelector('#' + uid + '-opt-in');
    var honeypotInput = container.querySelector('#' + uid + '-company-website');
    var submitBtn = container.querySelector('.covo-reg__submit');
    var messageEl = container.querySelector('.covo-reg__message');

    // Render the Turnstile widget (managed; usually solves without interaction).
    var covoTs = mountTurnstile(container.querySelector('#' + uid + '-turnstile'), 'lab_register');

    function showError(msg) {
      messageEl.className = 'covo-reg__message is-error';
      messageEl.textContent = msg;
    }

    function clearMessage() {
      messageEl.className = 'covo-reg__message';
      messageEl.textContent = '';
    }

    function setSubmitting(active) {
      submitBtn.disabled = active;
      nameInput.disabled = active;
      emailInput.disabled = active;
      optInInput.disabled = active;
      submitBtn.textContent = active ? 'Registering…' : submitLabel;
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      clearMessage();

      var name = nameInput.value.trim();
      var email = emailInput.value.trim();

      if (name.length < 2) {
        showError('Please enter your full name.');
        nameInput.focus();
        return;
      }
      if (!isValidEmail(email)) {
        showError('Please enter a valid email address.');
        emailInput.focus();
        return;
      }

      setSubmitting(true);
      fire(onEvent, 'registration_started', { slug: event.slug });

      var attribution = (global.CovoAttribution && typeof global.CovoAttribution.get === 'function')
        ? global.CovoAttribution.get()
        : {
            landing_page: global.location ? global.location.href : null,
            referrer: document.referrer || null,
          };

      var payload = Object.assign(
        {
          event_id: event.id,
          event_slug: event.slug,
          name: name,
          email: email,
          marketing_opt_in: optInInput.checked,
          turnstile_token: covoTs ? covoTs.token() : '',
          company_website: honeypotInput ? honeypotInput.value : '',
        },
        attribution,
        contentTag ? { utm_content: attribution.utm_content || contentTag } : {}
      );

      fetch(REGISTER_FUNCTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then(function (res) {
          return res.json().then(function (data) {
            return { ok: res.ok, data: data };
          });
        })
        .then(function (result) {
          if (!result.ok) {
            setSubmitting(false);
            if (covoTs) covoTs.reset();
            var errMsg = (result.data && result.data.error) || 'Registration failed. Please try again.';
            showError(errMsg);
            fire(onEvent, 'registration_failed', { slug: event.slug, error: errMsg });
            return;
          }
          renderSuccess(container, event, email);
          fire(onEvent, 'registration_completed', { slug: event.slug });
        })
        .catch(function (err) {
          console.error('CovoLabRegistration: registration request failed', err);
          setSubmitting(false);
          if (covoTs) covoTs.reset();
          var errMsg = 'Something went wrong. Please check your connection and try again.';
          showError(errMsg);
          fire(onEvent, 'registration_failed', { slug: event.slug, error: errMsg });
        });
    });
  }

  function renderSuccess(container, event, email) {
    var calendarUrl = CALENDAR_FUNCTION_URL + '?event=' + encodeURIComponent(event.slug);
    container.innerHTML =
      '<div class="covo-reg__success">' +
      '<div class="covo-reg__success-icon" aria-hidden="true">✓</div>' +
      '<h3>You’re in.</h3>' +
      '<p>' + esc(formatDate(event.event_date)) + '</p>' +
      '<p>Add this to your calendar now so you don’t miss it.</p>' +
      '<p><a class="covo-reg__cta-btn" href="' + esc(calendarUrl) + '">Add to Calendar</a></p>' +
      '<p>A confirmation email is on its way to <strong>' + esc(email) + '</strong>.</p>' +
      '<div class="covo-reg__whatsapp">' +
      '<p>WhatsApp Field Room</p>' +
      '<p style="font-size:0.9rem;color:#374151;margin-bottom:0.75rem;">Don’t just attend the lab. Practice with us afterward. Join the field room for weekly practice prompts and next steps.</p>' +
      '<a href="https://www.covomultipliers.com/join-whatsapp?utm_source=registration_confirmation&utm_medium=cta&utm_campaign=whatsapp_field_room" target="_blank" rel="noopener">Join the WhatsApp Field Room</a>' +
      '</div>' +
      '</div>';
    if (typeof container.scrollIntoView === 'function') {
      container.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  global.CovoLabRegistration = { mount: mount };
})(typeof window !== 'undefined' ? window : this);
