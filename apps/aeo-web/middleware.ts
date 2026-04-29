import {NextResponse} from "next/server";
import type {NextRequest} from "next/server";

import {DEV_ROBOTS_HEADER, isDevAeoEnvironment} from "./lib/search-indexing";

export function middleware(request: NextRequest): NextResponse {
  const response = NextResponse.next();
  if (isDevAeoEnvironment(request.nextUrl.hostname)) {
    response.headers.set("X-Robots-Tag", DEV_ROBOTS_HEADER);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

