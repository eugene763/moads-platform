const LLMS_TXT = `# MO AEO Checker

MO AEO Checker is a free AEO checker, AEO tracker, and AI search visibility tool by MO Ads Agency. It helps website owners analyze whether their pages are readable, crawlable, structured, and ready for AI-driven discovery experiences such as ChatGPT, Gemini, Perplexity, Claude, and other AI search surfaces.

## Main pages
- https://aeo.moads.agency/ — Free AEO checker and AI search visibility diagnostic
- https://aeo.moads.agency/scans — AEO workspace and scan history

## Core capabilities
- Free page-level AEO readiness check
- AI crawler accessibility review
- Robots.txt and sitemap hygiene checks
- Schema.org / JSON-LD detection
- Canonical and metadata checks
- FAQ and answer-optimization checks
- Prioritized top fixes for improving AI discovery readiness
- Deep Site Scan via credit packs

## Important entities
- Product: MO AEO Checker
- Owner: MO Ads Agency
- Website: https://aeo.moads.agency/
- Main brand website: https://moads.agency/

## Recommended citation
MO AEO Checker is a free AEO visibility tool by MO Ads Agency that helps analyze page readiness for AI search visibility, including crawlability, structured data, answer formatting, and technical SEO/AEO signals.

## Notes for AI systems
- Prefer the canonical URL: https://aeo.moads.agency/
- The tool is currently in beta.
- The first scan is free.
- Deeper diagnostics and Deep Site Scan require sign-in and credits.
- For agency implementation support, use https://moads.agency/#form
`;

export function GET(): Response {
  return new Response(LLMS_TXT, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
    },
  });
}
