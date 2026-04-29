import {DEV_ROBOTS_HEADER, isDevAeoEnvironment} from "../../lib/search-indexing";

const PROD_ROBOTS_TXT = `User-agent: GPTBot
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Claude-User
Allow: /

User-agent: anthropic-ai
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: Googlebot
Allow: /

User-agent: Bingbot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Perplexity-User
Allow: /

User-agent: Applebot
Allow: /

User-agent: CCBot
Allow: /

User-agent: *
Allow: /

Sitemap: https://aeo.moads.agency/sitemap.xml
`;

export function GET(request: Request): Response {
  const hostname = new URL(request.url).hostname;
  const body = isDevAeoEnvironment(hostname) ?
    "User-agent: *\nDisallow: /\n" :
    PROD_ROBOTS_TXT;

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      ...(isDevAeoEnvironment(hostname) ? {"X-Robots-Tag": DEV_ROBOTS_HEADER} : {}),
    },
  });
}
