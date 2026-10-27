# Change log — file by file

Compared with the package as supplied (`jus-lead-chase-claude-code-ready.zip`).

## Rewritten
**index.html**
- Header and footer now use the **official supplied logo**, on a white plate because the logo has no transparency and its navy lettering disappears on black. Previously a typed "JLC" box.
- Hero now shows the **supplied Dodge Journey concept** (front three-quarter view, background removed) instead of the legacy `fleet.svg`, with a "Concept rendering" caption.
- Tagline "We lead. We chase. You move." with the last line on an amber oversize-load plate.
- Services renamed to the brief's list: Lead & chase escorts, High-pole, Route surveys, **Oversize-load coordination** (was "Heavy-Haul Support"). Each "Request" link preselects the matching form option.
- Fleet section: driver side (unit 101) and passenger side (NY magnet captioned as concept), six equipment-detail tiles, a disclaimer and a link to the full concept sheet.
- New "How we work" section: three process-based differentiators, with no invented credentials or statistics.
- Coverage section separates **where we operate** from **certifications**. NY certification is not claimed. Washington is marked as a launch blocker in an HTML comment.
- Quote form: grouped fieldsets; added origin/destination as required; added height, width, length and gross weight fields; visible hints; required markers in words; trap field renamed `hp_field`; Turnstile container.
- SEO: unique title and description, OpenGraph and Twitter tags, favicon, touch icon, manifest, skip link, one h1, ordered h2/h3, descriptive alt text on every image.
- CSS and JS moved to external files so the security policy can block inline script.

**functions/api/quote.js**
- New `GET` returns only the public Turnstile site key (or null).
- Fails closed with 503 if required settings are missing, or if the Turnstile site key is set without its secret.
- Same-origin check, `application/json` required, 16 KB body cap read as a stream.
- Trap-field and minimum-fill-time checks now return **errors**. Previously the trap field returned a fake success.
- Only known fields accepted, each with its own length limit. Control characters stripped (line breaks kept in details only). Email, phone, service list and date range (today to +2 years) validated. Field errors returned so the form can show them inline.
- Turnstile checked server-side with the visitor's IP.
- Plain-text email with `reply_to` set to the requester. Subject built only from the service list and the trimmed name.
- 10-second timeout to Resend; 429 / non-200 / missing message ID / network error each become `delivery_failed`. **Success only when Resend returns a message ID.**
- Logs show error codes only, never form contents.

**README.md** — rewritten: status table, environment variables, local and full-stack preview, exact Git and Pages steps, Turnstile and rate-limit setup, launch checklist, known limitations.

## Added
- `assets/css/site.css`: design tokens, responsive layout from 320 px, visible focus, reduced-motion support, forced-colours fallback, print styles.
- `assets/js/main.js`: mobile menu (Escape closes it), field and summary validation linked for screen readers, Turnstile loader, submission with a 20-second timeout and a specific message for every failure.
- `assets/fonts/*`: Barlow 400/500/600 and Barlow Condensed 700/800 woff2, plus the OFL licence.
- `assets/img/*`: images derived from the two supplied files:
  - `fleet-hero-*.webp`, `fleet-driver-*.webp`, `fleet-passenger-*.webp` are cutouts from the concept sheet (background removed; captions from the sheet removed).
  - `detail-*.webp` are the six equipment tiles, cropped to the picture only.
  - `fleet-concept-sheet.webp` is the full sheet, compressed (2.3 MB to about 220 KB).
  - `og-image.jpg` is a 1200×675 social preview.
  - `jlc-wordmark.webp`, `jlc-logo-480.webp`, `favicon-32.png`, `apple-touch-icon.png` and `icon-512.png` come from the logo.
- `_headers`: CSP (self plus Cloudflare Turnstile only), nosniff, Referrer-Policy, Permissions-Policy, frame denial, and asset caching.
- `404.html`, `robots.txt`, `site.webmanifest`, `.gitignore`, `.dev.vars.example`.
- `COMPLIANCE.md`: claims audit and the list of requirements that vary by jurisdiction.
- `tests/quote.test.mjs`: 27 Function tests.

## Kept unchanged
- `assets/jlc-logo.png`, `assets/dodge-journey-fleet-mockup.png`, `assets/fleet.svg` (no longer referenced; kept as the brief asked).

## QA performed
- Node tests: 27/27 pass.
- Browser (Chromium) against `wrangler pages dev`, with and without settings, and against `python3 -m http.server`:
  - all 25 local paths load and all images decode;
  - no sideways overflow at 320, 390, 768, 1024, 1440 and 1920 px;
  - skip link, tab order, visible focus and the mobile menu work;
  - an empty submit flags exactly the six required fields;
  - every failure mode shows an honest error and keeps what the user typed.
- The only console messages are the browser logging the expected 4xx/5xx responses.
- **Not tested:** real Resend delivery, and Turnstile rendering in a live browser (the Cloudflare hosts can't be reached from the test sandbox).
