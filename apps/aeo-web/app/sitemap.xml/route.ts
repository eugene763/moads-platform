const LASTMOD = "2026-04-30";

const urls = [
  {
    loc: "https://aeo.moads.agency/",
    changefreq: "weekly",
    priority: "1.0",
  },
  {
    loc: "https://aeo.moads.agency/scans",
    changefreq: "monthly",
    priority: "0.7",
  },
] as const;

export function GET(): Response {
  // Hash URLs are sections of the homepage, not standalone crawlable documents.
  // TODO: Add /how-it-works, /dimensions, /pricing, and /faq when they exist as real landing pages.
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `  <url>
    <loc>${url.loc}</loc>
    <lastmod>${LASTMOD}</lastmod>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`).join("\n")}
</urlset>
`;

  return new Response(body, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
    },
  });
}
