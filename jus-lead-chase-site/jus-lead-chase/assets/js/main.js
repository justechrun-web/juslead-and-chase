/* Jus Lead & Chase Services — client script. No third-party code unless Turnstile is configured server-side. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };

  // Footer year
  var year = $('year'); if (year) year.textContent = String(new Date().getFullYear());

  // Mobile menu
  var menu = $('menu'), links = $('links');
  function setMenu(open) { links.classList.toggle('open', open); menu.setAttribute('aria-expanded', String(open)); }
  if (menu && links) {
    menu.addEventListener('click', function () { setMenu(!links.classList.contains('open')); });
    links.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && links.classList.contains('open')) { setMenu(false); menu.focus(); }
    });
  }

  var form = $('quoteForm');
  if (!form) return;
  var button = $('submitButton'), status = $('formStatus'), summary = $('formErrors');
  var BUTTON_LABEL = button.textContent;
  var loadedAt = Date.now();

  // Service links preselect the matching option
  document.querySelectorAll('[data-service]').forEach(function (a) {
    a.addEventListener('click', function () { form.elements.service.value = a.getAttribute('data-service'); });
  });

  // Move date cannot be in the past
  var date = form.elements.date;
  function isoToday() { var d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }
  date.min = isoToday();

  // ---------- Validation ----------
  var LABELS = { name: 'Contact name', email: 'Email', phone: 'Phone', service: 'Service needed', date: 'Preferred move date', origin: 'Origin', destination: 'Destination', details: 'Load and project details' };
  function messageFor(el) {
    var v = el.validity, label = LABELS[el.name] || el.name;
    if (v.valueMissing) return el.tagName === 'SELECT' ? 'Choose a service.' : 'Enter the ' + label.toLowerCase() + '.';
    if (v.typeMismatch && el.type === 'email') return 'Enter an email address like name@company.com.';
    if (v.patternMismatch && el.name === 'phone') return 'Use digits, spaces, + ( ) and - only, at least 7 characters.';
    if (v.tooShort) return 'Add a little more detail (at least ' + el.minLength + ' characters).';
    if (v.tooLong) return 'Shorten this to ' + el.maxLength + ' characters or fewer.';
    if (v.rangeUnderflow && el.name === 'date') return 'Choose today or a later date.';
    if (v.badInput) return 'Enter a valid ' + label.toLowerCase() + '.';
    return '';
  }
  function fieldError(el, msg) {
    var err = $(el.id + '-err'); if (!err) return;
    err.textContent = msg;
    if (msg) {
      el.setAttribute('aria-invalid', 'true');
      var ids = (el.getAttribute('aria-describedby') || '').split(' ').filter(Boolean);
      if (ids.indexOf(err.id) === -1) { ids.push(err.id); el.setAttribute('aria-describedby', ids.join(' ')); }
    } else {
      el.removeAttribute('aria-invalid');
    }
  }
  function checkField(el) {
    if (!el.willValidate || el.name === 'hp_field') return true;
    el.setCustomValidity('');
    if (el.value && el.value.trim() === '' && el.required) el.setCustomValidity('blank');
    var msg = el.validity.customError ? 'Enter the ' + (LABELS[el.name] || el.name).toLowerCase() + '.' : messageFor(el);
    fieldError(el, msg);
    return !msg;
  }
  Array.prototype.forEach.call(form.elements, function (el) {
    if (!el.name) return;
    el.addEventListener('blur', function () { if (el.value || el.hasAttribute('aria-invalid')) checkField(el); });
    el.addEventListener('input', function () { if (el.hasAttribute('aria-invalid')) checkField(el); });
  });

  function showSummary(invalid) {
    if (!invalid.length) { summary.hidden = true; summary.innerHTML = ''; return; }
    var p = document.createElement('p');
    p.textContent = invalid.length === 1 ? 'One field needs attention:' : invalid.length + ' fields need attention:';
    var ul = document.createElement('ul');
    invalid.forEach(function (el) {
      var li = document.createElement('li'), a = document.createElement('a');
      a.href = '#' + el.id; a.textContent = $(el.id + '-err').textContent;
      a.addEventListener('click', function (e) { e.preventDefault(); el.focus(); });
      li.appendChild(a); ul.appendChild(li);
    });
    summary.innerHTML = ''; summary.appendChild(p); summary.appendChild(ul); summary.hidden = false; summary.focus();
  }

  function setStatus(state, text) { status.dataset.state = state || ''; status.textContent = text || ''; }
  function setBusy(busy) {
    button.disabled = busy; button.setAttribute('aria-busy', String(busy));
    button.textContent = busy ? 'Sending request…' : BUTTON_LABEL;
  }

  // ---------- Turnstile (only if the server reports a site key) ----------
  var turnstile = { required: false, widgetId: null };
  fetch('/api/quote', { method: 'GET', headers: { Accept: 'application/json' } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (cfg) {
      if (!cfg || !cfg.turnstileSiteKey) return;
      turnstile.required = true;
      window.jlcTurnstileReady = function () {
        turnstile.widgetId = window.turnstile.render('#turnstile', { sitekey: cfg.turnstileSiteKey, theme: 'dark', action: 'quote' });
      };
      var s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=jlcTurnstileReady';
      s.async = true; s.defer = true;
      s.onerror = function () { setStatus('error', 'The spam check failed to load. Disable content blockers for this site, then reload the page.'); };
      document.head.appendChild(s);
    })
    .catch(function () { /* No backend (e.g. static preview). Submission will report that honestly. */ });

  // ---------- Submit ----------
  var ERRORS = {
    not_configured: 'Online requests aren’t being accepted yet. Please try again later.',
    verification_failed: 'The spam check didn’t pass. Complete the check above and send again.',
    too_fast: 'That was sent very quickly. Review your details and send again.',
    rate_limited: 'Too many requests from this connection. Wait a few minutes and try again.',
    delivery_failed: 'Your request couldn’t be delivered to dispatch. Your details are still in the form; try again in a few minutes.'
  };

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    setStatus('', '');
    var invalid = [];
    Array.prototype.forEach.call(form.elements, function (el) { if (el.name && !checkField(el)) invalid.push(el); });
    showSummary(invalid);
    if (invalid.length) return;

    var data = {};
    new FormData(form).forEach(function (v, k) { data[k] = typeof v === 'string' ? v.trim() : ''; });
    data.elapsedMs = Date.now() - loadedAt;
    if (turnstile.required) {
      var token = window.turnstile && turnstile.widgetId !== null ? window.turnstile.getResponse(turnstile.widgetId) : '';
      if (!token) { setStatus('error', 'Complete the spam check above, then send your request.'); return; }
      data.turnstileToken = token;
    }

    setBusy(true);
    setStatus('', 'Sending your request to dispatch…');
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 20000) : null;

    fetch('/api/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(data),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (json) { return { res: res, json: json }; });
    }).then(function (r) {
      // Success is shown ONLY when the backend confirms delivery.
      if (r.res.ok && r.json && r.json.ok === true) {
        form.reset(); date.min = isoToday(); loadedAt = Date.now(); showSummary([]);
        setStatus('ok', 'Request sent. Dispatch has your details and will follow up. This is not yet a booking.');
        return;
      }
      if (!r.json) throw new Error('The request service isn’t available on this server. Nothing was sent.');
      if (r.json.fields) {
        var bad = [];
        Object.keys(r.json.fields).forEach(function (k) { var el = form.elements[k]; if (el) { fieldError(el, r.json.fields[k]); bad.push(el); } });
        showSummary(bad);
      }
      throw new Error(ERRORS[r.json.code] || r.json.error || 'Your request wasn’t sent. Check the form and try again.');
    }).catch(function (err) {
      var msg = err && err.name === 'AbortError' ? 'The request timed out and may not have been sent. Wait a minute before trying again.'
        : (err && err.name === 'TypeError' ? 'No connection to the server. Check your connection; nothing was sent.' : (err && err.message) || 'Your request wasn’t sent. Try again.');
      setStatus('error', msg);
    }).then(function () {
      if (timer) clearTimeout(timer);
      setBusy(false);
      if (turnstile.required && window.turnstile && turnstile.widgetId !== null) window.turnstile.reset(turnstile.widgetId);
    });
  });
})();
