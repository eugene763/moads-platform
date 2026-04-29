import {DEV_ROBOTS_HEADER, isDevAeoEnvironment} from "../../lib/search-indexing";

export function GET(request: Request): Response {
  const hostname = new URL(request.url).hostname;
  const body = isDevAeoEnvironment(hostname) ?
    "User-agent: *\nDisallow: /\n" :
    "User-agent: *\nAllow: /\n";

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      ...(isDevAeoEnvironment(hostname) ? {"X-Robots-Tag": DEV_ROBOTS_HEADER} : {}),
    },
  });
}

