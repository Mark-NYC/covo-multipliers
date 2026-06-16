// Covo Multipliers — UTM Attribution Tracking
// Captures first-touch and latest-touch attribution from URL parameters.
// Loaded on every page; safe to call before forms submit.
//
// localStorage keys:
//   covo_attribution_first  — written once, never overwritten
//   covo_attribution_latest — overwritten whenever UTM params are present

(function () {
  'use strict';

  var FIRST_KEY  = 'covo_attribution_first';
  var LATEST_KEY = 'covo_attribution_latest';
  var MAX_URL    = 500;
  var MAX_UTM    = 200;

  // Safe localStorage wrapper — fails silently when unavailable
  function store() {
    try {
      localStorage.setItem('__covo_t__', '1');
      localStorage.removeItem('__covo_t__');
      return localStorage;
    } catch (_) {
      return null;
    }
  }

  function readParams() {
    var p = new URLSearchParams(window.location.search);
    return {
      utm_source:   (p.get('utm_source')   || '').slice(0, MAX_UTM),
      utm_medium:   (p.get('utm_medium')   || '').slice(0, MAX_UTM),
      utm_campaign: (p.get('utm_campaign') || '').slice(0, MAX_UTM),
      utm_content:  (p.get('utm_content')  || '').slice(0, MAX_UTM),
      utm_term:     (p.get('utm_term')     || '').slice(0, MAX_UTM),
    };
  }

  function hasUtm(params) {
    return params.utm_source.length > 0 || params.utm_medium.length > 0 || params.utm_campaign.length > 0;
  }

  function buildTouch(params) {
    return {
      utm_source:   params.utm_source,
      utm_medium:   params.utm_medium,
      utm_campaign: params.utm_campaign,
      utm_content:  params.utm_content,
      utm_term:     params.utm_term,
      landing_page: window.location.href.slice(0, MAX_URL),
      referrer:     (document.referrer || '').slice(0, MAX_URL),
      touch_at:     new Date().toISOString(),
    };
  }

  function safeGet(key, ls) {
    try { return JSON.parse(ls.getItem(key) || 'null') || null; } catch (_) { return null; }
  }

  function safeSet(key, value, ls) {
    try { ls.setItem(key, JSON.stringify(value)); } catch (_) {}
  }

  // Run on every page load
  function init() {
    var ls = store();
    if (!ls) return;

    var params = readParams();

    // First-touch: write once, never overwrite
    if (!ls.getItem(FIRST_KEY)) {
      safeSet(FIRST_KEY, buildTouch(params), ls);
    }

    // Latest-touch: update only when UTM params are present on the current URL
    if (hasUtm(params)) {
      safeSet(LATEST_KEY, buildTouch(params), ls);
    }
  }

  // Returns a flat object ready to spread into any JSON fetch payload.
  // All fields are plain strings (empty string when unknown, never null from this function).
  function get() {
    var ls = store();
    var empty = {
      utm_source: '', utm_medium: '', utm_campaign: '',
      utm_content: '', utm_term: '', landing_page: '',
      referrer: '', touch_at: '',
    };

    var first  = (ls && safeGet(FIRST_KEY, ls))  || empty;
    var latest = (ls && safeGet(LATEST_KEY, ls)) || empty;

    return {
      // Latest-touch (the most recent tagged session)
      utm_source:     latest.utm_source   || '',
      utm_medium:     latest.utm_medium   || '',
      utm_campaign:   latest.utm_campaign || '',
      utm_content:    latest.utm_content  || '',
      utm_term:       latest.utm_term     || '',
      landing_page:   latest.landing_page || '',
      referrer:       latest.referrer     || '',
      latest_touch_at: latest.touch_at   || '',
      // First-touch (the original session)
      first_utm_source:   first.utm_source   || '',
      first_utm_medium:   first.utm_medium   || '',
      first_utm_campaign: first.utm_campaign || '',
      first_utm_content:  first.utm_content  || '',
      first_utm_term:     first.utm_term     || '',
      first_landing_page: first.landing_page || '',
      first_referrer:     first.referrer     || '',
      first_touch_at:     first.touch_at     || '',
    };
  }

  init();
  window.CovoAttribution = { get: get };
})();
