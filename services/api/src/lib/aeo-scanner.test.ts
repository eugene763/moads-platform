import {describe, expect, it} from "vitest";

import {
  normalizeSiteUrl,
  runAeoDeterministicScan,
  runAeoFullSiteScan,
} from "./aeo-scanner.js";

describe("aeo scanner", () => {
  it("normalizes host and protocol", () => {
    const normalized = normalizeSiteUrl("Example.com/product-1/");
    expect(normalized.requestedUrl).toBe("https://example.com/product-1/");
    expect(normalized.normalizedUrl).toBe("https://example.com/product-1");
  });

  it("scores schema-backed page higher", async () => {
    const html = `
      <html>
        <head>
          <title>Test Product</title>
          <meta name="description" content="Great product" />
          <link rel="canonical" href="https://example.com/p" />
          <script type="application/ld+json">
            {"@context":"https://schema.org","@type":"Product","name":"Test","aggregateRating":{"@type":"AggregateRating","ratingValue":4.8,"reviewCount":128}}
          </script>
        </head>
        <body>
          <h1>Test Product</h1>
          <p>Rated 4.8 out of 5 stars from 128 reviews.</p>
        </body>
      </html>
    `;

    const result = await runAeoDeterministicScan({
      siteUrl: "https://example.com/p",
      fetchImpl: async () => {
        return new Response(html, {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8",
          },
        });
      },
    });

    expect(result.status).toBe("completed");
    expect(result.publicScore).toBeGreaterThanOrEqual(70);
    expect(result.issuesJson.find((issue) => issue.code === "aggregate_rating_missing")).toBeUndefined();
    expect(result.issuesJson.find((issue) => issue.code === "canonical_missing")).toBeUndefined();
  });

  it("reports missing aggregate rating", async () => {
    const html = `
      <html>
        <head>
          <title>Basic Page</title>
        </head>
        <body>
          <h1>Basic Page</h1>
          <p>No schema here.</p>
        </body>
      </html>
    `;

    const result = await runAeoDeterministicScan({
      siteUrl: "https://example.com/no-schema",
      fetchImpl: async () => {
        return new Response(html, {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8",
          },
        });
      },
    });

    expect(result.publicScore).toBeLessThan(70);
    expect(result.issuesJson.some((issue) => issue.code === "aggregate_rating_missing")).toBe(true);
  });

  it("accepts canonical from HTTP Link header", async () => {
    const html = `
      <html>
        <head>
          <title>Header Canonical Product</title>
          <meta name="description" content="Product with canonical in headers" />
          <script type="application/ld+json">
            {"@context":"https://schema.org","@type":"Product","name":"Header Canonical","aggregateRating":{"@type":"AggregateRating","ratingValue":4.7,"reviewCount":56}}
          </script>
        </head>
        <body>
          <h1>Header Canonical Product</h1>
          <p>Rated 4.7 out of 5 stars from 56 reviews.</p>
        </body>
      </html>
    `;

    const result = await runAeoDeterministicScan({
      siteUrl: "https://example.com/header-canonical",
      fetchImpl: async () => new Response(html, {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
          link: "<https://example.com/products/header-canonical>; rel=\"canonical\"",
        },
      }),
    });

    expect(result.status).toBe("completed");
    expect(result.issuesJson.find((issue) => issue.code === "canonical_missing")).toBeUndefined();
  });

  it("uses nested sitemap product URLs instead of sitemap index files", async () => {
    const homepageHtml = `
      <html>
        <head>
          <title>Store Home</title>
          <meta name="description" content="Home page" />
        </head>
        <body>
          <a href="/collections/featured">Featured</a>
        </body>
      </html>
    `;

    const robotsTxt = `
      User-agent: *
      Allow: /
      Sitemap: https://example.com/sitemap.xml
    `;

    const sitemapIndexXml = `
      <sitemapindex>
        <sitemap><loc>https://example.com/ae/shop/sitemap-index.xml</loc></sitemap>
      </sitemapindex>
    `;

    const nestedSitemapXml = `
      <urlset>
        <url><loc>https://example.com/products/test-product</loc></url>
      </urlset>
    `;

    const productHtml = `
      <html>
        <head>
          <title>Test Product</title>
          <script type="application/ld+json">
            {"@context":"https://schema.org","@type":"Product","name":"Test","aggregateRating":{"@type":"AggregateRating","ratingValue":4.6,"reviewCount":42}}
          </script>
        </head>
        <body>
          <h1>Test Product</h1>
          <p>Rated 4.6 out of 5 stars from 42 reviews.</p>
        </body>
      </html>
    `;

    const result = await runAeoDeterministicScan({
      siteUrl: "https://example.com",
      fetchImpl: async (input) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

        if (url === "https://example.com/" || url === "https://example.com") {
          return new Response(homepageHtml, {
            status: 200,
            headers: {
              "content-type": "text/html; charset=utf-8",
            },
          });
        }

        if (url === "https://example.com/robots.txt") {
          return new Response(robotsTxt, {
            status: 200,
            headers: {
              "content-type": "text/plain; charset=utf-8",
            },
          });
        }

        if (url === "https://example.com/sitemap.xml") {
          return new Response(sitemapIndexXml, {
            status: 200,
            headers: {
              "content-type": "application/xml; charset=utf-8",
            },
          });
        }

        if (url === "https://example.com/ae/shop/sitemap-index.xml") {
          return new Response(nestedSitemapXml, {
            status: 200,
            headers: {
              "content-type": "application/xml; charset=utf-8",
            },
          });
        }

        if (url === "https://example.com/products/test-product") {
          return new Response(productHtml, {
            status: 200,
            headers: {
              "content-type": "text/html; charset=utf-8",
            },
          });
        }

        return new Response("", {status: 404});
      },
    });

    const report = result.reportJson as {
      evidence?: {
        productPage?: {
          url?: string | null;
          sampled?: boolean;
          source?: string;
        };
      };
      summary?: {
        score?: number;
      };
    };

    expect(report.evidence?.productPage?.sampled).toBe(true);
    expect(report.evidence?.productPage?.url).toBe("https://example.com/products/test-product");
    expect(report.evidence?.productPage?.source).toBe("sitemap");
    expect(result.publicScore).toBeGreaterThan(40);
  });

  it("runs a capped key-page site scan across same-origin pages", async () => {
    const pageHtml = (title: string, canonicalPath: string, links = "") => `
      <html>
        <head>
          <title>${title}</title>
          <meta name="description" content="${title} description" />
          <link rel="canonical" href="https://example.com${canonicalPath}" />
        </head>
        <body>
          <h1>${title}</h1>
          <p>What is ${title}? ${title} is a test page with enough text for scan confidence.</p>
          ${links}
        </body>
      </html>
    `;

    const result = await runAeoFullSiteScan({
      siteUrl: "https://example.com",
      maxPages: 2,
      fetchImpl: async (input) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

        if (url === "https://example.com/" || url === "https://example.com") {
          return new Response(pageHtml("Home", "/", `
            <a href="/about">About</a>
            <a href="/pricing">Pricing</a>
            <a href="https://other.example.com/skip">Skip</a>
          `), {
            status: 200,
            headers: {"content-type": "text/html; charset=utf-8"},
          });
        }

        if (url === "https://example.com/about") {
          return new Response(pageHtml("About", "/about"), {
            status: 200,
            headers: {"content-type": "text/html; charset=utf-8"},
          });
        }

        return new Response("", {status: 404});
      },
    });

    const report = result.reportJson as {
      summary?: {
        scope?: string;
        scannedPages?: number;
        maxPages?: number;
      };
      evidence?: {
        pages?: Array<{url: string}>;
      };
    };

    expect(report.summary?.scope).toBe("site");
    expect(report.summary?.scannedPages).toBe(2);
    expect(report.summary?.maxPages).toBe(2);
    expect(report.evidence?.pages?.map((page) => page.url)).toEqual([
      "https://example.com/",
      "https://example.com/pricing",
    ]);
    expect(result.scannedPages).toHaveLength(2);
  });

  it("prioritizes sitemap URLs over random homepage links", async () => {
    const pageHtml = (title: string, links = "") => `
      <html>
        <head><title>${title}</title><meta name="description" content="${title} description" /></head>
        <body><h1>${title}</h1><p>${title} page with crawlable content for AEO scanning.</p>${links}</body>
      </html>
    `;

    const result = await runAeoFullSiteScan({
      siteUrl: "https://example.com",
      maxPages: 3,
      fetchImpl: async (input) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url === "https://example.com/" || url === "https://example.com") {
          return new Response(pageHtml("Home", `
            <a href="/legal">Legal</a>
            <a href="/random">Random</a>
          `), {status: 200, headers: {"content-type": "text/html"}});
        }
        if (url === "https://example.com/robots.txt") {
          return new Response("Sitemap: https://example.com/sitemap.xml", {status: 200});
        }
        if (url === "https://example.com/sitemap.xml") {
          return new Response(`
            <urlset>
              <url><loc>https://example.com/products/widget</loc></url>
              <url><loc>https://example.com/pricing</loc></url>
            </urlset>
          `, {status: 200, headers: {"content-type": "application/xml"}});
        }
        if (url === "https://example.com/products/widget") {
          return new Response(pageHtml("Widget"), {status: 200, headers: {"content-type": "text/html"}});
        }
        if (url === "https://example.com/pricing") {
          return new Response(pageHtml("Pricing"), {status: 200, headers: {"content-type": "text/html"}});
        }
        return new Response(pageHtml("Other"), {status: 200, headers: {"content-type": "text/html"}});
      },
    });

    const discovery = (result.reportJson as {
      discovery?: {
        selectedUrls?: string[];
        selectionReasonByUrl?: Record<string, string>;
      };
    }).discovery;

    expect(discovery?.selectedUrls).toEqual([
      "https://example.com/",
      "https://example.com/pricing",
      "https://example.com/products/widget",
    ]);
    expect(discovery?.selectionReasonByUrl?.["https://example.com/pricing"]).toBe("Pricing or plans page");
    expect(result.scannedPages.map((page) => page.requestedUrl)).toEqual(discovery?.selectedUrls);
  });

  it("selects product pricing and category pages before blog pages", async () => {
    const pageHtml = (title: string, links = "") => `
      <html>
        <head><title>${title}</title><meta name="description" content="${title} description" /></head>
        <body><h1>${title}</h1><p>${title} content for key-page site scan testing.</p>${links}</body>
      </html>
    `;

    const result = await runAeoFullSiteScan({
      siteUrl: "https://example.com",
      maxPages: 5,
      fetchImpl: async (input) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url === "https://example.com/" || url === "https://example.com") {
          return new Response(pageHtml("Home", `
            <a href="/blog/launch">Blog</a>
            <a href="/products/widget">Product</a>
            <a href="/pricing">Pricing</a>
            <a href="/collections/new">Collection</a>
            <a href="/about">About</a>
          `), {status: 200, headers: {"content-type": "text/html"}});
        }
        return new Response(pageHtml(url), {status: 200, headers: {"content-type": "text/html"}});
      },
    });

    const selectedUrls = ((result.reportJson as {discovery?: {selectedUrls?: string[]}}).discovery?.selectedUrls ?? []);
    expect(selectedUrls).toEqual([
      "https://example.com/",
      "https://example.com/pricing",
      "https://example.com/products/widget",
      "https://example.com/collections/new",
      "https://example.com/about",
    ]);
    expect(selectedUrls).not.toContain("https://example.com/blog/launch");
  });

  it("records llms.txt discovery without scanning it as a page", async () => {
    const result = await runAeoFullSiteScan({
      siteUrl: "https://example.com",
      maxPages: 2,
      fetchImpl: async (input) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url === "https://example.com/" || url === "https://example.com") {
          return new Response(`
            <html>
              <head><title>Home</title><meta name="description" content="Home description" /></head>
              <body><h1>Home</h1><a href="/pricing">Pricing</a></body>
            </html>
          `, {status: 200, headers: {"content-type": "text/html"}});
        }
        if (url === "https://example.com/llms.txt") {
          return new Response("AI guidance", {status: 200, headers: {"content-type": "text/plain"}});
        }
        if (url === "https://example.com/pricing") {
          return new Response(`
            <html>
              <head><title>Pricing</title><meta name="description" content="Pricing description" /></head>
              <body><h1>Pricing</h1><p>Plans and prices.</p></body>
            </html>
          `, {status: 200, headers: {"content-type": "text/html"}});
        }
        return new Response("", {status: 404});
      },
    });

    const discovery = (result.reportJson as {
      discovery?: {
        aiFilesFound?: string[];
        selectedUrls?: string[];
      };
    }).discovery;

    expect(discovery?.aiFilesFound).toContain("https://example.com/llms.txt");
    expect(discovery?.selectedUrls).toEqual([
      "https://example.com/",
      "https://example.com/pricing",
    ]);
    expect(result.scannedPages.map((page) => page.requestedUrl)).not.toContain("https://example.com/llms.txt");
  });
});
