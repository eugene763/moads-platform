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

  it("rejects unreachable domains before scoring", async () => {
    await expect(runAeoDeterministicScan({
      siteUrl: "https://missing.example",
      fetchImpl: async () => {
        throw Object.assign(new Error("getaddrinfo ENOTFOUND missing.example"), {code: "ENOTFOUND"});
      },
    })).rejects.toMatchObject({
      code: "domain_not_found",
      message: "We couldn’t reach this website. Check the URL and try again.",
    });
  });

  it("rejects 404 pages before scoring", async () => {
    await expect(runAeoDeterministicScan({
      siteUrl: "https://example.com/missing",
      fetchImpl: async () => new Response("<html><body>Missing</body></html>", {
        status: 404,
        headers: {"content-type": "text/html; charset=utf-8"},
      }),
    })).rejects.toMatchObject({
      code: "page_not_found",
      message: "This page was not found. Check the URL and try again.",
    });
  });

  it("rejects non-HTML responses before scoring", async () => {
    await expect(runAeoDeterministicScan({
      siteUrl: "https://example.com/file.pdf",
      fetchImpl: async () => new Response("%PDF-1.4", {
        status: 200,
        headers: {"content-type": "application/pdf"},
      }),
    })).rejects.toMatchObject({
      code: "non_html_response",
      message: "This URL does not return a readable HTML page.",
    });
  });

  it("accepts readable HTML when content-type is unreliable", async () => {
    const html = `
      <!doctype html>
      <html>
        <head><title>Readable Page</title><meta name="description" content="Readable page" /></head>
        <body>
          <h1>Readable Page</h1>
          <p>This page returns HTML in the body even though the server sends an unreliable content type.</p>
        </body>
      </html>
    `;

    const result = await runAeoDeterministicScan({
      siteUrl: "https://example.com/unreliable-content-type",
      fetchImpl: async () => new Response(html, {
        status: 200,
        headers: {"content-type": "application/octet-stream"},
      }),
    });

    expect(result.status).toBe("completed");
    expect(result.publicScore).toBeGreaterThan(0);
  });

  it("does not require aggregate rating for generic pages", async () => {
    const html = `
      <html>
        <head>
          <title>Basic Page</title>
        </head>
        <body>
          <h1>Basic Page</h1>
          <p>This is a generic page with enough visible text for crawl confidence.</p>
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
    expect(result.issuesJson.some((issue) => issue.code === "aggregate_rating_missing")).toBe(false);
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
          <p>Store home page with enough crawlable text for AI discovery checks and product navigation.</p>
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

        if (url === "https://example.com/pricing") {
          return new Response(pageHtml("Pricing", "/pricing"), {
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

  it("does not enqueue stylesheet links as pages during site scan", async () => {
    const fetchedUrls: string[] = [];
    const pageHtml = (title: string, head = "", links = "") => `
      <html>
        <head><title>${title}</title><meta name="description" content="${title} description" />${head}</head>
        <body><h1>${title}</h1><p>${title} page with enough readable content for scanning.</p>${links}</body>
      </html>
    `;

    const result = await runAeoFullSiteScan({
      siteUrl: "https://example.com",
      maxPages: 3,
      fetchImpl: async (input) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        fetchedUrls.push(url);
        if (url === "https://example.com/" || url === "https://example.com") {
          return new Response(pageHtml("Home", "<link rel=\"stylesheet\" href=\"/cdn/theme.css\" />", "<a href=\"/pricing\">Pricing</a>"), {
            status: 200,
            headers: {"content-type": "text/html"},
          });
        }
        if (url === "https://example.com/pricing") {
          return new Response(pageHtml("Pricing"), {status: 200, headers: {"content-type": "text/html"}});
        }
        return new Response("", {status: 404});
      },
    });

    expect(result.status).toBe("completed");
    expect(result.scannedPages.map((page) => page.requestedUrl)).toContain("https://example.com/pricing");
    expect(fetchedUrls).not.toContain("https://example.com/cdn/theme.css");
  });

  it("skips discovered JS PDF and image assets during site scan", async () => {
    const result = await runAeoFullSiteScan({
      siteUrl: "https://example.com",
      maxPages: 5,
      fetchImpl: async (input) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url === "https://example.com/" || url === "https://example.com") {
          return new Response(`
            <html>
              <head><title>Home</title><meta name="description" content="Home description" /></head>
              <body>
                <h1>Home</h1>
                <p>Home page with enough readable content for scanner tests.</p>
                <a href="/assets/app.js">JS</a>
                <a href="/docs/file.pdf">PDF</a>
                <a href="/images/photo.webp">Image</a>
                <a href="/pricing">Pricing</a>
              </body>
            </html>
          `, {status: 200, headers: {"content-type": "text/html"}});
        }
        if (url === "https://example.com/pricing") {
          return new Response(`
            <html><head><title>Pricing</title></head><body><h1>Pricing</h1><p>Pricing page content for scan.</p></body></html>
          `, {status: 200, headers: {"content-type": "text/html"}});
        }
        return new Response("asset", {status: 200, headers: {"content-type": "application/octet-stream"}});
      },
    });

    const selectedUrls = ((result.reportJson as {discovery?: {selectedUrls?: string[]}}).discovery?.selectedUrls ?? []);
    expect(selectedUrls).toEqual([
      "https://example.com/",
      "https://example.com/pricing",
    ]);
    expect(result.scannedPages.map((page) => page.requestedUrl)).toEqual(selectedUrls);
  });

  it("skips an internal non-HTML page and completes with partial site scan results", async () => {
    const result = await runAeoFullSiteScan({
      siteUrl: "https://example.com",
      maxPages: 2,
      fetchImpl: async (input) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url === "https://example.com/" || url === "https://example.com") {
          return new Response(`
            <html>
              <head><title>Home</title><meta name="description" content="Home description" /></head>
              <body>
                <h1>Home</h1>
                <p>Home page with enough readable content for partial scan behavior.</p>
                <a href="/pricing">Pricing</a>
              </body>
            </html>
          `, {status: 200, headers: {"content-type": "text/html"}});
        }
        if (url === "https://example.com/pricing") {
          return new Response("not html", {status: 200, headers: {"content-type": "text/plain"}});
        }
        return new Response("", {status: 404});
      },
    });

    const report = result.reportJson as {
      summary?: {softWarnings?: string[]; scannedPages?: number};
      discovery?: {skippedPages?: Array<{host?: string; pathname?: string; reason?: string; contentType?: string | null}>};
    };
    expect(result.status).toBe("completed");
    expect(result.scannedPages).toHaveLength(1);
    expect(report.summary?.scannedPages).toBe(1);
    expect(report.summary?.softWarnings).toContain("Some pages could not be scanned because they did not return readable HTML.");
    expect(report.discovery?.skippedPages?.[0]).toMatchObject({
      host: "example.com",
      pathname: "/pricing",
      reason: "non_html_response",
      contentType: "text/plain",
    });
  });

  it("fails a site scan when the homepage is non-HTML", async () => {
    await expect(runAeoFullSiteScan({
      siteUrl: "https://example.com",
      fetchImpl: async () => new Response("body { color: red; }", {
        status: 200,
        headers: {"content-type": "text/css"},
      }),
    })).rejects.toMatchObject({
      code: "non_html_response",
    });
  });

  it("fails a site scan when zero readable HTML pages are scanned", async () => {
    let homepageFetches = 0;
    await expect(runAeoFullSiteScan({
      siteUrl: "https://example.com",
      fetchImpl: async (input) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url === "https://example.com/" || url === "https://example.com") {
          homepageFetches += 1;
          if (homepageFetches === 1) {
            return new Response("<html><head><title>Home</title></head><body><h1>Home</h1><p>Readable homepage preflight content.</p></body></html>", {
              status: 200,
              headers: {"content-type": "text/html"},
            });
          }
          return new Response("not html", {status: 200, headers: {"content-type": "text/plain"}});
        }
        return new Response("", {status: 404});
      },
    })).rejects.toMatchObject({
      code: "non_html_response",
    });
  });

  it("does not enqueue private or local links discovered from a public page", async () => {
    const result = await runAeoFullSiteScan({
      siteUrl: "https://example.com",
      maxPages: 3,
      fetchImpl: async (input) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url.includes("localhost") || url.includes("127.0.0.1")) {
          throw new Error("Private URL should not be fetched.");
        }
        if (url === "https://example.com/" || url === "https://example.com") {
          return new Response(`
            <html>
              <head><title>Home</title></head>
              <body>
                <h1>Home</h1>
                <p>Readable homepage content with private links that must be ignored.</p>
                <a href="http://localhost/admin">Localhost</a>
                <a href="http://127.0.0.1/private">Private IP</a>
                <a href="/pricing">Pricing</a>
              </body>
            </html>
          `, {status: 200, headers: {"content-type": "text/html"}});
        }
        if (url === "https://example.com/pricing") {
          return new Response("<html><head><title>Pricing</title></head><body><h1>Pricing</h1><p>Readable pricing page.</p></body></html>", {
            status: 200,
            headers: {"content-type": "text/html"},
          });
        }
        return new Response("", {status: 404});
      },
    });

    expect(result.scannedPages.map((page) => page.requestedUrl)).toEqual([
      "https://example.com/",
      "https://example.com/pricing",
    ]);
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
              <body>
                <h1>Home</h1>
                <p>Home page with crawlable text for AI discovery and pricing navigation.</p>
                <a href="/pricing">Pricing</a>
              </body>
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
