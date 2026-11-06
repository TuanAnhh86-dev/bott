import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

function getCsp(request: NextRequest, nonce: string): string {
  const isDev = process.env.NODE_ENV === "development";
  const connectSources = new Set(["'self'"]);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (supabaseUrl) {
    try {
      const supabaseOrigin = new URL(supabaseUrl);
      connectSources.add(supabaseOrigin.origin);
      connectSources.add(`${supabaseOrigin.protocol === "https:" ? "wss:" : "ws:"}//${supabaseOrigin.host}`);
    } catch {
      console.error("[CSP] NEXT_PUBLIC_SUPABASE_URL is invalid; Supabase browser connections are not allowed by CSP.");
    }
  }

  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}' https://fonts.googleapis.com${isDev ? " 'unsafe-inline'" : ""}`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data: https://fonts.gstatic.com",
    `connect-src ${[...connectSources].join(" ")}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
  ];

  if (!isDev && request.nextUrl.protocol === "https:") {
    directives.push("upgrade-insecure-requests");
  }

  return directives.join("; ");
}

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(randomUUID()).toString("base64");
  const csp = getCsp(request, nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|.*\\.).*)"],
};
