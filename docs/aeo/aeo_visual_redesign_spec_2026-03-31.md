# AEO / LAB — Visual Redesign Spec for Codex

Date: 2026-03-31  
Status: Ready for implementation  
Scope: **Frontend only** — no API, no backend, no DB, no auth logic changes  
Base commit: `308171c` (HEAD == origin/main, clean tree)  
Companion: `aeo_lab_final_spec_2026-03-30.md`

---

## 0. Golden rules for Codex

- **Do not touch** anything in `services/`, `packages/`, `infra/`, `prisma/`.
- **Do not touch** `lib/api.ts`, `lib/firebase.ts`, `lib/analytics.ts` in either app.
- **Do not touch** any API route call, auth flow, session logic, or GA4 tracking calls.
- **Do not add new npm dependencies** without explicit approval — use only what is already installed (`react`, `next`, native CSS, SVG).
- All changes live inside:
  - `apps/aeo-web/`
  - `apps/lab-web/`
- Lint must pass (`pnpm lint`) before any commit.
- No new files unless strictly necessary. Prefer extending existing ones.

---

## 1. Design system — tokens and palette

Replace the `:root` block in **both** `globals.css` files with the following unified token set.

```css
:root {
  /* backgrounds */
  --bg:          #F0F1FA;   /* lavender-tinted page bg */
  --surface:     #FFFFFF;   /* card / panel bg */
  --surface-2:   #F7F8FF;   /* subtle inner bg */

  /* ink */
  --ink:         #0F1035;   /* primary text, near-black indigo */
  --muted:       #5B6080;   /* secondary text */
  --faint:       #9AA0BF;   /* placeholder, disabled text */

  /* brand */
  --brand:       #2D2F7A;   /* deep indigo — nav, badges, CTA bg */
  --brand-mid:   #4547A9;   /* hover / active state */
  --brand-soft:  #ECEEFF;   /* tinted chip backgrounds */

  /* accent */
  --accent:      #0EA5A4;   /* teal — score ring, live dot */
  --accent-soft: #CCFBF1;   /* teal chip bg */

  /* status */
  --ok:          #16A34A;
  --ok-soft:     #DCFCE7;
  --warn:        #D97706;
  --warn-soft:   #FEF3C7;
  --danger:      #BE123C;
  --danger-soft: #FFE4E6;

  /* geometry */
  --radius-sm:   8px;
  --radius:      16px;
  --radius-lg:   24px;
  --radius-pill: 999px;

  /* shadow */
  --shadow-card: 0 2px 12px 0 rgba(45,47,122,0.07);
  --shadow-pop:  0 8px 32px 0 rgba(45,47,122,0.14);
}
```

**Font**: Keep `Coolvetica` for headings (h1–h3, `.eyebrow`). For body / UI labels / inputs use `Inter, "Segoe UI", sans-serif`. Add Inter via `<link rel="preconnect">` + `@font-face` or Google Fonts in `layout.tsx`.

---

## 2. Global base styles (both apps)

```css
body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font-family: Inter, "Segoe UI", sans-serif;
  -webkit-font-smoothing: antialiased;
}

h1, h2, h3, .eyebrow {
  font-family: "Coolvetica", Inter, sans-serif;
}

* { box-sizing: border-box; }
```

---

## 3. Navigation bar (`aeo-web` — `app/page.tsx` top-nav)

### Target look (from screenshots)
- White bar, full width, no border at top — subtle `box-shadow` on scroll (JS class toggle).
- Left: `logo-moads.svg` (existing, keep as-is).
- Center (or right-of-logo): `How It Works | Dimensions | Pricing | Agency` links, muted color, 600 weight, no underline, `gap: 32px`.
- Right: `Log In` ghost text link + `Get Free Score` pill CTA (dark indigo fill, white text).

### CSS additions to `globals.css`

```css
.top-nav {
  position: sticky;
  top: 0;
  z-index: 100;
  background: rgba(255,255,255,0.92);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid transparent;
  padding: 0 32px;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.top-nav.scrolled {
  border-bottom-color: var(--line, #E5E7EB);
  box-shadow: 0 1px 8px rgba(45,47,122,0.08);
}

.top-nav nav {
  display: flex;
  gap: 32px;
}

.top-nav nav a,
.top-nav .nav-login {
  color: var(--muted);
  text-decoration: none;
  font-size: 0.93rem;
  font-weight: 600;
  transition: color 0.15s;
}

.top-nav nav a:hover,
.top-nav .nav-login:hover {
  color: var(--ink);
}

.cta-nav {
  background: var(--brand);
  color: #fff !important;
  border-radius: var(--radius-pill);
  padding: 9px 20px;
  font-size: 0.9rem;
  font-weight: 700;
  text-decoration: none;
  transition: background 0.15s, transform 0.1s;
}

.cta-nav:hover {
  background: var(--brand-mid);
  transform: translateY(-1px);
}
```

### JS scroll-class toggle (add to `page.tsx` as a `"use client"` wrapper or small inline hook)

```tsx
// In HomePage, top of component:
useEffect(() => {
  const handler = () => document.querySelector('.top-nav')
    ?.classList.toggle('scrolled', window.scrollY > 8);
  window.addEventListener('scroll', handler, { passive: true });
  return () => window.removeEventListener('scroll', handler);
}, []);
```

> `page.tsx` needs `"use client"` added if this hook is used there, OR extract the nav into a `NavBar` client component (preferred to keep RSC for page body).

---

## 4. Hero section (`aeo-web`)

### Target look (from screenshots)
- Light lavender background (`var(--bg)`).
- Eyebrow pill badge: dark indigo bg, white text, `AI Engine Optimization for E-Commerce`.
- H1: "AI is the new search. Is your brand visible?" — bold, 3–4rem clamp, Coolvetica.
- Sub-copy: `See how your brand shows up in ChatGPT, Perplexity, Gemini, and 10+ AI engines — and what you can do about it.`
- Input row: single URL input with globe icon on the left inside the input, then a `Get Score` pill button (indigo fill) — all inside a white rounded pill container.
- Trust row below input: `✓ No credit card  ✓ Results in 60 seconds  ✓ 51+ checks` in small muted text.
- Below form: sample report preview card (white card, "Sample AI Visibility Report" header with green Live badge, stats row: 47/100 AI Score | 2/6 engines Visibility | 12 found Fixes, footer with engine dots).
- Floating AI engine logos around the hero area (absolutely positioned, subtle float animation).

### CSS additions

```css
.hero {
  background: var(--bg);
  border: none;
  border-radius: 0;
  padding: 64px 0 56px;
  text-align: center;
  position: relative;
  overflow: hidden;
}

.hero-eyebrow-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--brand);
  color: #fff;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  border-radius: var(--radius-pill);
  padding: 5px 14px;
  margin-bottom: 20px;
}

.hero h1 {
  font-size: clamp(2.4rem, 5vw, 4rem);
  line-height: 1.04;
  font-weight: 800;
  margin: 0 auto 16px;
  max-width: 720px;
  color: var(--ink);
}

.hero h1 .accent-line {
  color: var(--brand);
}

.hero-copy {
  color: var(--muted);
  font-size: 1.1rem;
  max-width: 520px;
  margin: 0 auto 28px;
  line-height: 1.55;
}

/* URL input row */
.scan-pill-row {
  display: flex;
  align-items: center;
  gap: 0;
  background: #fff;
  border: 1px solid #D4D7EE;
  border-radius: var(--radius-pill);
  padding: 6px 6px 6px 16px;
  max-width: 540px;
  margin: 0 auto;
  box-shadow: var(--shadow-card);
}

.scan-pill-row .globe-icon {
  color: var(--faint);
  margin-right: 8px;
  flex-shrink: 0;
}

.scan-pill-row input {
  flex: 1;
  border: none;
  outline: none;
  font: inherit;
  font-size: 0.97rem;
  color: var(--ink);
  background: transparent;
  min-width: 0;
}

.scan-pill-row input::placeholder {
  color: var(--faint);
}

.scan-pill-row .cta-primary {
  border-radius: var(--radius-pill);
  padding: 10px 22px;
  font-size: 0.93rem;
  white-space: nowrap;
  flex-shrink: 0;
}

/* trust badges */
.hero-trust {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  margin-top: 14px;
  font-size: 0.83rem;
  color: var(--muted);
}

.hero-trust span::before {
  content: "✓ ";
  color: var(--ok);
  font-weight: 700;
}

/* sample report preview */
.sample-report-card {
  background: #fff;
  border: 1px solid #E2E4F3;
  border-radius: var(--radius-lg);
  padding: 18px 20px;
  max-width: 480px;
  margin: 28px auto 0;
  box-shadow: var(--shadow-pop);
  text-align: left;
}

.sample-report-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--ink);
}

.live-badge {
  background: var(--ok-soft);
  color: var(--ok);
  font-size: 0.75rem;
  font-weight: 700;
  border-radius: var(--radius-pill);
  padding: 2px 10px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.live-badge::before {
  content: "";
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ok);
  animation: pulse-dot 1.4s ease infinite;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.5; transform: scale(0.7); }
}

.sample-stats-row {
  display: flex;
  gap: 16px;
}

.sample-stat {
  flex: 1;
  border-radius: var(--radius-sm);
  padding: 10px 12px;
}

.sample-stat.score  { background: #FFF7ED; }
.sample-stat.vis    { background: #EFF6FF; }
.sample-stat.fixes  { background: #FFF1F2; }

.sample-stat .stat-value {
  font-size: 1.3rem;
  font-weight: 800;
  line-height: 1;
  margin-bottom: 2px;
}

.sample-stat.score  .stat-value { color: #D97706; }
.sample-stat.vis    .stat-value { color: #2563EB; }
.sample-stat.fixes  .stat-value { color: #E11D48; }

.sample-stat .stat-label {
  font-size: 0.75rem;
  color: var(--muted);
}

/* Floating engine logos */
.hero-float-logos {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
}

.float-logo {
  position: absolute;
  background: #fff;
  border: 1px solid #E2E4F3;
  border-radius: var(--radius);
  padding: 8px 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--ink);
  box-shadow: var(--shadow-card);
  white-space: nowrap;
  animation: float-bob var(--bob-dur, 4s) ease-in-out infinite;
  animation-delay: var(--bob-delay, 0s);
}

@keyframes float-bob {
  0%, 100% { transform: translateY(0px); }
  50%       { transform: translateY(-8px); }
}
```

### Float logo positions (inline style for each chip in JSX)
Place these as `<div className="float-logo">` chips inside `.hero-float-logos`:

| Logo | CSS left | CSS top | --bob-dur | --bob-delay |
|------|----------|---------|-----------|-------------|
| ChatGPT | 2% | 28% | 4.2s | 0s |
| Perplexity | 3% | 58% | 3.8s | 0.6s |
| DeepSeek | 2% | 78% | 5s | 1.2s |
| Grok | 82% | 15% | 4s | 0.3s |
| Gemini | 84% | 42% | 4.5s | 0.9s |
| Claude | 81% | 68% | 3.6s | 1.5s |

Use simple 20×20 SVG letter-initial icons (inline) until real brand icons are available — just a coloured circle with a letter.

> **Hero content container** must have `position: relative; z-index: 1` so it sits above the float logos layer.

---

## 5. Platform marquee ticker

Add below the hero, full-width, before the `#how-it-works` section.

```css
/* Marquee */
.platform-ticker {
  overflow: hidden;
  padding: 12px 0;
  border-top: 1px solid #E2E4F3;
  border-bottom: 1px solid #E2E4F3;
  background: var(--surface);
  margin: 0;
}

.ticker-track {
  display: flex;
  gap: 40px;
  width: max-content;
  animation: ticker-scroll 28s linear infinite;
}

.platform-ticker:hover .ticker-track {
  animation-play-state: paused;
}

@keyframes ticker-scroll {
  from { transform: translateX(0); }
  to   { transform: translateX(-50%); }
}

.ticker-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--muted);
  white-space: nowrap;
}

.ticker-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--faint);
  flex-shrink: 0;
}
```

**Ticker items** (duplicate the array once to make seamless loop):  
`ChatGPT Shopping · Amazon · Google AI Overview · Walmart · Perplexity · TikTok Shop · eBay · Claude · Shopee · Gemini Shopping · Etsy · Shopify`

---

## 6. "How It Works" section

### Target look
Three cards in a row with:
- Pill step badge top-left (dark indigo bg, white text: "Step 01", "Step 02", "Step 03")
- Small icon (globe / bar-chart / check-circle, stroke SVG 28×28, `var(--brand)`)
- Card title bold
- Dashed connector line between cards (CSS pseudo-element on the grid)
- Cards: white surface, `var(--shadow-card)`, `var(--radius-lg)`, slight gap

```css
.how-section {
  padding: 64px 0;
}

.section-eyebrow {
  text-align: center;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--brand);
  margin-bottom: 12px;
}

.section-title {
  text-align: center;
  font-size: clamp(1.8rem, 3vw, 2.6rem);
  font-weight: 800;
  margin: 0 auto 40px;
  max-width: 640px;
  line-height: 1.15;
}

.step-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
  position: relative;
}

/* dashed connector line between cards */
.step-cards::before {
  content: "";
  position: absolute;
  top: 44px;
  left: calc(33.33% - 12px);
  width: calc(33.33% + 24px);
  border-top: 2px dashed #C8CAE8;
  pointer-events: none;
}

.step-card {
  background: var(--surface);
  border: 1px solid #E2E4F3;
  border-radius: var(--radius-lg);
  padding: 28px 24px;
  box-shadow: var(--shadow-card);
  transition: transform 0.2s, box-shadow 0.2s;
}

.step-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-pop);
}

.step-badge {
  display: inline-flex;
  background: var(--brand);
  color: #fff;
  font-size: 0.75rem;
  font-weight: 700;
  border-radius: var(--radius-pill);
  padding: 4px 12px;
  letter-spacing: 0.04em;
  margin-bottom: 16px;
}

.step-icon {
  display: block;
  margin-bottom: 14px;
  color: var(--brand);
}

.step-card h3 {
  margin: 0 0 8px;
  font-size: 1.1rem;
  font-weight: 700;
}

.step-card p {
  margin: 0;
  color: var(--muted);
  font-size: 0.93rem;
  line-height: 1.5;
}
```

**Step content** (update `page.tsx`):
- Step 01 — "Enter Your Store URL" / "Paste your URL. Shopify, Amazon, Walmart, TikTok Shop, and 5+ more supported."
- Step 02 — "We Analyze 8 Dimensions" / "51+ checks across product data, structured data, AEO readiness, content architecture, marketplace compliance, reviews, visuals, and technical performance."
- Step 03 — "Get Your Score + Fixes" / "Receive your 0–100 AI Discovery Score with specific, prioritized fixes ranked by revenue impact. Top 3 issues free, full roadmap with audit."

---

## 7. "Why MO ADS" tabbed section

### Target look
- Section eyebrow "WHY MO ADS" + h2 "Visibility, intelligence, and action in the age of AI commerce"
- Left column: vertical tab list (4 items, active = dark indigo bg + white text, inactive = plain)
- Right column: content panel with title, description, and a mock widget card

```css
.features-section {
  padding: 64px 0;
}

.features-layout {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 24px;
  align-items: start;
}

.feature-tabs {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.feature-tab {
  background: none;
  border: none;
  text-align: left;
  cursor: pointer;
  font: inherit;
  font-size: 0.95rem;
  font-weight: 600;
  padding: 12px 18px;
  border-radius: var(--radius);
  color: var(--muted);
  transition: background 0.15s, color 0.15s;
}

.feature-tab.active {
  background: var(--brand);
  color: #fff;
}

.feature-tab:not(.active):hover {
  background: var(--brand-soft);
  color: var(--brand);
}

.feature-content {
  background: var(--surface);
  border: 1px solid #E2E4F3;
  border-radius: var(--radius-lg);
  padding: 28px;
  box-shadow: var(--shadow-card);
  min-height: 320px;
}

.feature-content-title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  font-size: 1.15rem;
  font-weight: 700;
}

.feature-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--brand);
  flex-shrink: 0;
}

.feature-content p {
  color: var(--muted);
  line-height: 1.6;
  margin: 0 0 20px;
  font-size: 0.95rem;
}
```

**Tab items:**
1. AI Visibility Intelligence
2. Actionable Optimization
3. Marketplace Scale
4. Competitive Intelligence

Use `useState` to track active tab; switch right-panel content. This is purely visual/UI — no API calls.

---

## 8. Score display (report page — `report-view.tsx`)

Replace the plain text score with a visual score ring.

### ScoreRing component (new file `components/score-ring.tsx`)

```tsx
"use client";

interface ScoreRingProps {
  score: number; // 0–100
  size?: number; // px, default 120
}

export function ScoreRing({ score, size = 120 }: ScoreRingProps) {
  const r = (size - 16) / 2;
  const circ = 2 * Math.PI * r;
  const filled = (score / 100) * circ;
  const color = score >= 70 ? "#16A34A" : score >= 40 ? "#D97706" : "#E11D48";

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label={`Score: ${score}/100`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#E2E4F3" strokeWidth={8} />
      <circle
        cx={size/2} cy={size/2} r={r}
        fill="none"
        stroke={color}
        strokeWidth={8}
        strokeLinecap="round"
        strokeDasharray={`${filled} ${circ - filled}`}
        strokeDashoffset={circ / 4}
        style={{ transition: "stroke-dasharray 0.8s cubic-bezier(0.22,1,0.36,1)" }}
      />
      <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle"
        fontSize={size * 0.22} fontWeight={800} fill={color}>
        {score}
      </text>
      <text x="50%" y={size * 0.67} dominantBaseline="middle" textAnchor="middle"
        fontSize={size * 0.1} fill="#9AA0BF">
        /100
      </text>
    </svg>
  );
}
```

Update `report-view.tsx` `score-card` section to use `<ScoreRing score={report.publicScore ?? 0} />` instead of the raw `.score-value` paragraph.

### Score card CSS update

```css
.score-card {
  display: flex;
  align-items: center;
  gap: 24px;
  flex-wrap: wrap;
}

.score-text-block {
  flex: 1;
}
```

---

## 9. Fixes list — priority badges

Update the `.badge` class in the report list to support priority colours.

```css
.badge              { border-radius: var(--radius-pill); padding: 3px 10px; font-size: 0.78rem; font-weight: 700; white-space: nowrap; }
.badge-high         { background: var(--danger-soft); color: var(--danger); }
.badge-med          { background: var(--warn-soft);   color: var(--warn); }
.badge-low          { background: var(--ok-soft);      color: var(--ok); }
.badge-score        { background: var(--brand-soft);   color: var(--brand); }
```

In `report-view.tsx`, map `recommendation.impactScore` to badge variant:
```tsx
const variant = rec.impactScore >= 7 ? "badge-high" : rec.impactScore >= 4 ? "badge-med" : "badge-low";
// render: <span className={`badge ${variant}`}>+{rec.impactScore}</span>
```

For AI Tips, map `tip.priority` (`"high"` / `"medium"` / `"low"`) to same variants.

---

## 10. Pricing section

### Target look (from screenshots)
Three cards: Starter $49/mo | Pro $149/mo (Most Popular) | Deep Audit $690 one-time.

```css
.pricing-section {
  padding: 64px 0;
  text-align: center;
}

.pricing-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
  align-items: start;
  text-align: left;
  margin-top: 40px;
}

.pricing-card {
  background: var(--surface);
  border: 1.5px solid #E2E4F3;
  border-radius: var(--radius-lg);
  padding: 28px 24px;
  box-shadow: var(--shadow-card);
  position: relative;
  transition: transform 0.2s, box-shadow 0.2s;
}

.pricing-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-pop);
}

.pricing-card.popular {
  border-color: var(--brand);
  border-width: 2px;
}

.popular-badge {
  position: absolute;
  top: -14px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--brand);
  color: #fff;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  border-radius: var(--radius-pill);
  padding: 4px 16px;
}

.pricing-plan-name {
  font-size: 1.05rem;
  font-weight: 700;
  margin: 0 0 8px;
}

.pricing-price {
  font-size: 2.6rem;
  font-weight: 800;
  line-height: 1;
  margin: 0 0 4px;
  font-family: "Coolvetica", Inter, sans-serif;
}

.pricing-price span {
  font-size: 1rem;
  font-weight: 500;
  color: var(--muted);
}

.pricing-desc {
  color: var(--muted);
  font-size: 0.88rem;
  margin: 0 0 20px;
  line-height: 1.4;
}

.pricing-features {
  list-style: none;
  margin: 0 0 24px;
  padding: 0;
  display: grid;
  gap: 10px;
}

.pricing-features li {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 0.88rem;
  line-height: 1.4;
}

.pricing-features li::before {
  content: "✓";
  color: var(--brand);
  font-weight: 800;
  flex-shrink: 0;
  margin-top: 1px;
}

.pricing-card.popular .pricing-features li::before {
  content: "✓";
  color: var(--ok);
}

.pricing-cta {
  display: block;
  width: 100%;
  text-align: center;
  border-radius: var(--radius-pill);
  padding: 12px;
  font-weight: 700;
  font-size: 0.93rem;
  text-decoration: none;
  cursor: pointer;
  border: 1.5px solid var(--brand);
  background: transparent;
  color: var(--brand);
  transition: background 0.15s, color 0.15s;
}

.pricing-cta:hover {
  background: var(--brand-soft);
}

.pricing-card.popular .pricing-cta {
  background: var(--brand);
  color: #fff;
  border-color: var(--brand);
}

.pricing-card.popular .pricing-cta:hover {
  background: var(--brand-mid);
}
```

**Pricing card content** (update `page.tsx` pricing section):

| | Starter | Pro (Popular) | Deep Audit |
|---|---|---|---|
| Price | $49 | $149 | $690 |
| Period | /mo | /mo | one-time |
| Desc | For brands getting started with discovery optimization. | For brands serious about AI visibility and marketplace growth. | Comprehensive manual + AI analysis with a 30-day roadmap. |
| CTA text | Get Started | Start Pro | Request Audit |
| CTA link | `https://lab.moads.agency` | `https://lab.moads.agency` | `https://moads.agency/footer#form` |

Features per plan — see screenshots for complete list. Keep copy close to what's shown:
- **Starter**: Monthly AI Discovery Score · 8-dimension breakdown · Top 5 fixes per month · Email alerts on score changes · 1 store / 1 platform
- **Pro**: Everything in Starter · Weekly score monitoring · AI platform visibility tracking · Marketplace readiness scores · Priority fix recommendations · Competitor gap analysis · Up to 3 stores / 5 platforms · Email + Slack alerts
- **Deep Audit**: Full manual audit by AEO specialist · Top 10 fixes ranked by revenue impact · 30-day prioritized action plan · Competitive landscape mapping · Marketplace entry roadmap · 30-minute strategy call · Delivered in 5–7 business days

---

## 11. Dashboard (`dashboard-view.tsx`) — visual polish

No logic changes. Visual-only updates:

- Replace plain `<div className="state-card">Loading dashboard...</div>` skeleton with a styled shimmer card:

```css
.skeleton-pulse {
  background: linear-gradient(90deg, #E2E4F3 25%, #F0F1FA 50%, #E2E4F3 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s ease infinite;
  border-radius: var(--radius);
  height: 120px;
}

@keyframes shimmer {
  from { background-position: 200% 0; }
  to   { background-position: -200% 0; }
}
```

- Panel headers: keep `.panel h2` but add `border-bottom: 1px solid var(--line)` + `padding-bottom: 10px` + `margin-bottom: 14px`.
- Scan list items: add hover background `var(--brand-soft)` transition.
- Wallet credits: show as a styled badge next to the label (`.badge .badge-score`).
- Realtime stats: 2×2 stat grid (same pattern as sample-report-card stats) instead of raw `<p>` lines.

---

## 12. LAB pages visual polish

Apply the same token set to `lab-web/app/globals.css`.  
The LAB brand accent is kept at `--brand: #0F5F4F` (teal-green) per current spec — only update the shared tokens that are missing (`--bg`, `--surface-2`, `--faint`, `--shadow-*`, `--radius-sm`, `--radius-lg`, `--radius-pill`, animation classes).

Center view (`center-view.tsx`): add same panel header style + badge variants + shimmer loading.

---

## 13. Responsive breakpoints

```css
@media (max-width: 1024px) {
  .features-layout { grid-template-columns: 1fr; }
  .hero-float-logos { display: none; }
}

@media (max-width: 768px) {
  .step-cards,
  .pricing-cards { grid-template-columns: 1fr; }
  .step-cards::before { display: none; }
  .top-nav { padding: 0 16px; }
  .hero { padding: 40px 0 36px; }
}

@media (max-width: 480px) {
  .scan-pill-row { flex-direction: column; border-radius: var(--radius-lg); padding: 12px; gap: 8px; }
  .scan-pill-row .cta-primary { width: 100%; }
  .hero-trust { flex-direction: column; gap: 6px; }
}
```

---

## 14. Page layout container update

```css
.page-shell {
  max-width: 1120px;
  margin: 0 auto;
  padding: 0 24px 80px;
}

/* sections inside page-shell get their own padding */
.section-inner {
  max-width: 1080px;
  margin: 0 auto;
}
```

---

## 15. What must NOT change (hard constraint)

| Area | Reason |
|---|---|
| All API call URLs and request shapes | Deployed API contract |
| Firebase auth flow (`signInForAeoSession`, `signInForLabSession`) | Auth security |
| Session cookie logic | Security |
| GA4 `trackGa4()` calls | Analytics |
| SSE / EventSource realtime stream setup | Backend contract |
| Wallet debit logic and `generate-ai-tips` endpoint | Billing integrity |
| All TypeScript interfaces (`ScanDetail`, `CenterResponse`, etc.) | Type safety |
| `lib/api.ts`, `lib/firebase.ts`, `lib/analytics.ts` | Shared utility |
| `layout.tsx` GA4 scripts | Analytics |

---

## 16. Acceptance criteria for this spec

- [ ] `pnpm lint` passes with zero errors.
- [ ] `pnpm build` passes for both `aeo-web` and `lab-web`.
- [ ] Hero renders with pill eyebrow badge, correct h1 copy, pill input row, trust badges, and sample report card.
- [ ] Floating AI engine logos appear on desktop and are hidden on ≤1024px.
- [ ] Platform ticker scrolls infinitely, pauses on hover.
- [ ] Step cards show step badge + icon + dashed connector on desktop.
- [ ] Score ring animates on first render in the report page.
- [ ] Fix badges use colour-coded variants (High/Med/Low).
- [ ] Pricing section shows three cards with correct copy and Popular badge on Pro.
- [ ] Tabbed "Why MO ADS" section switches content on click.
- [ ] Nav bar becomes sticky with backdrop-blur and border on scroll.
- [ ] Dashboard uses shimmer skeleton during load.
- [ ] All pages render correctly on 375px, 768px, 1280px viewports.
- [ ] No new runtime errors in browser console.

---

## 17. Suggested improvements (Codex MAY implement if time allows, flag for review)

1. **Dark mode toggle** — Add `prefers-color-scheme: dark` media query with inverted tokens. Keep opt-in only via `data-theme="dark"` on `<html>`.
2. **Micro-interaction on CTA** — Add `scale(0.97)` active state on `.cta-primary` click.
3. **Score number count-up** — Animate score number from 0 to actual value over 0.8s using `requestAnimationFrame`.
4. **Favicon** — Use the MO ADS logo as `/favicon.svg` (copy from `/logo-moads.svg`) and reference in `layout.tsx`.
5. **Open Graph meta** — Add `og:title`, `og:description`, `og:image` to `layout.tsx` metadata object.

---

## 18. Tasks for the developer (manual steps — Codex cannot do these)

| # | Task | Where |
|---|---|---|
| M1 | Add `Inter` font to `layout.tsx` (Google Fonts link or `next/font/google`) | `apps/aeo-web/app/layout.tsx`, `apps/lab-web/app/layout.tsx` |
| M2 | Add actual SVG icon assets for AI engine logos (ChatGPT, Perplexity, Gemini, Claude, DeepSeek, Grok) to `apps/aeo-web/public/icons/` | Public assets |
| M3 | Verify Coolvetica font file is accessible in Cloud Run container (confirm `font-display: swap` works without FOUT in prod) | Infra check |
| M4 | Set `NEXT_PUBLIC_GA4_MEASUREMENT_ID` env var in Cloud Run for both services if not already set | Firebase / Cloud Run console |
| M5 | After deploy, verify floating logo position does not overlap form input on Safari iOS | Browser QA |
| M6 | Set `Lab` pricing CTA links (`https://lab.moads.agency`) to point to Dodo checkout once Starter checkout is live | `apps/aeo-web/app/page.tsx` |

---

## Appendix A — File change map

| File | Type of change |
|---|---|
| `apps/aeo-web/app/globals.css` | Replace `:root` tokens, add all new classes |
| `apps/aeo-web/app/page.tsx` | Update JSX: hero, how-it-works, dimensions tabs, pricing, add useEffect for nav scroll class, add marquee ticker |
| `apps/aeo-web/components/scan-form.tsx` | Wrap in pill input row, add globe icon SVG, update button class |
| `apps/aeo-web/components/report-view.tsx` | Add ScoreRing, update badge variants, update loading skeleton |
| `apps/aeo-web/components/score-ring.tsx` | **New file** — ScoreRing SVG component |
| `apps/aeo-web/app/layout.tsx` | Add Inter font link, update metadata title/description/og |
| `apps/lab-web/app/globals.css` | Add missing tokens, shadow vars, animation classes |
| `apps/lab-web/app/page.tsx` | Update hero copy and styling |
| `apps/lab-web/components/center-view.tsx` | Add shimmer skeleton, badge variants, panel header style |
