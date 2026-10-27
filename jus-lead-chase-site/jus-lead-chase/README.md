# Jus Lead & Chase Services — website

A static one-page site with a Cloudflare Pages Function (`/api/quote`) that emails quote requests to dispatch through Resend. There is no build step.

## Status

| Area | State |
|---|---|
| Design, layout, responsive (320–1920 px) | Done, QA'd |
| Quote form: validation, loading and error states | Done, QA'd |
| `/api/quote` validation and anti-spam | Done; 27 automated tests pass |
| Real email delivery | **Not tested.** Needs a real Resend key and a verified sending domain |
| Coverage copy | **Blocked:** Washington State or Washington, D.C.? |
| Domain, canonical tag, absolute OpenGraph URLs, sitemap | **Blocked:** domain not confirmed |
| Structured data (JSON-LD) | Left out until the legal name and facts are confirmed |
| Deployment | Not done. Needs owner approval |

## Structure

```
index.html               Homepage
404.html                 Not-found page (Pages serves it automatically)
_headers                 Security headers (CSP etc.) and caching
robots.txt, site.webmanifest
assets/css/site.css      All styles
assets/js/main.js        Menu, form validation, Turnstile loader, submission
assets/fonts/            Self-hosted Barlow + Barlow Condensed (SIL OFL, licence included)
assets/img/              Images derived from the supplied artwork (see CHANGES.md)
assets/jlc-logo.png      Original supplied logo (kept unmodified)
assets/dodge-journey-fleet-mockup.png  Original supplied concept art (kept unmodified)
assets/fleet.svg         Legacy fallback vector (no longer used on the page)
functions/api/quote.js   Pages Function: GET = public form config, POST = send request
tests/quote.test.mjs     Node tests for the function (stubs fetch; sends no email)
.dev.vars.example        Template for local secrets
```

## Environment variables

Set these in Cloudflare: **Workers & Pages → your project → Settings → Variables and Secrets**. Set them for Production, and for Preview if you test previews.

| Name | Type | Required | Purpose |
|---|---|---|---|
| `RESEND_API_KEY` | Secret | Yes | Resend API key |
| `QUOTE_TO_EMAIL` | Text | Yes | Dispatch inbox you own. Comma-separate for several |
| `QUOTE_FROM_EMAIL` | Text | Yes | Sender on a domain verified in Resend, e.g. `Jus Lead & Chase <quotes@YOUR-DOMAIN>` |
| `TURNSTILE_SITE_KEY` | Text | Optional | Turns on the Turnstile widget |
| `TURNSTILE_SECRET_KEY` | Secret | Only with the site key | Server-side Turnstile check |

If any required variable is missing, the form shows "Online requests aren't being accepted yet" and returns 503. It never fakes a success.

## Local preview

Frontend only (the form will correctly report that nothing was sent):
```bash
cd jus-lead-chase
python3 -m http.server 8080      # http://localhost:8080
```

Full stack with the Function:
```bash
cd jus-lead-chase
cp .dev.vars.example .dev.vars   # fill in values; .dev.vars is git-ignored
npx wrangler@3 pages dev . --port 8788
# http://localhost:8788
```

Function tests (no network, no email sent):
```bash
cd jus-lead-chase/tests && node quote.test.mjs
```

## Deploy: Cloudflare Pages via Git

Nothing has been pushed or connected. Run these yourself, or approve me to run them.

```bash
cd jus-lead-chase
git init
git add .
git status                       # confirm no .dev.vars or secrets are listed
git commit -m "Jus Lead & Chase Services site"
git branch -M main
git remote add origin https://github.com/<YOUR-ACCOUNT>/jus-lead-chase.git   # create the empty repo first
git push -u origin main
```

Then in Cloudflare:
1. **Workers & Pages → Create → Pages → Connect to Git**, then choose the repository.
2. Framework preset: **None**. Build command: *(leave empty)*. Build output directory: `/`. Root directory: `/`, or `jus-lead-chase` if the repo contains the parent folder.
3. Add the environment variables above, then **Save and Deploy**.
4. Open the `*.pages.dev` URL and send a test request. Check the inbox and spam folder. Confirm the success message only appears when the email arrives.
5. **Custom domains → Set up a domain**, only for a domain you own and have authorised.

### Turnstile (recommended before marketing)
Cloudflare dashboard → **Turnstile → Add widget**. Add your domain and `*.pages.dev`, then put the keys in the two Turnstile variables. The widget appears automatically; no HTML edit is needed.

### Rate limiting (recommended)
Pages Functions have no built-in rate limit. Once on a Cloudflare zone, add a WAF rate-limiting rule. For example: path equals `/api/quote` and method `POST`, more than 5 requests per 10 minutes per IP, then Block.

## Launch checklist

- [ ] **Washington: State or D.C.?** Edit the entry marked `LAUNCH BLOCKER` in `index.html`.
- [ ] Confirm the domain. Then add `<link rel="canonical" href="https://DOMAIN/">`, set `og:url`, make `og:image` absolute (`https://DOMAIN/assets/img/og-image.jpg`), and add a sitemap line to `robots.txt`.
- [ ] Dispatch inbox you own, plus a Resend-verified sending domain (SPF/DKIM set in DNS). `juslead@chase.com` is **not** used: chase.com is a third-party domain.
- [ ] Phone number, if you want one published. None is on the site.
- [ ] New York escort certification: provide the credential. Then the coverage line can change from "confirmed with each quote" to a direct claim (see COMPLIANCE.md).
- [ ] Exact legal business name. Then optionally add `LocalBusiness` JSON-LD with verified facts only.
- [ ] Privacy policy page. The form collects names, emails and phone numbers.
- [ ] Insurance and other credentials: only add them to the site once documented.
- [ ] Replace concept renderings with real fleet photos when available, and update captions and alt text.
- [ ] Real end-to-end test on the deployed site.

## Known limitations
- The hero image is cut out of the supplied 1672 px sheet (the vehicle is about 1058 px wide). It looks slightly soft on very large high-DPI screens. A higher-resolution render or real photo would fix this.
- The concept artwork includes a "New York Certified" magnet. It is captioned as a concept, but the graphic itself makes that claim visually. If the certification turns out not to be current, remove the passenger-side view and the NY tile.
- The alternate homepage concept named in the handoff was not in the package and was not used.
