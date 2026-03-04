import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // Security headers
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // CSRF protection on mutation API routes
  if (
    request.nextUrl.pathname.startsWith("/api/") &&
    ["POST", "PUT", "DELETE"].includes(request.method)
  ) {
    // Allow SAML callback (IdP POST) and form submissions
    const isSamlCallback =
      request.nextUrl.pathname === "/api/auth/callback/saml";
    if (!isSamlCallback) {
      const contentType = request.headers.get("content-type") || "";
      const origin = request.headers.get("origin");
      const host = request.headers.get("host");

      // Check origin matches host for non-SAML mutations
      if (origin && host && !origin.includes(host)) {
        return NextResponse.json(
          { error: "CSRF validation failed" },
          { status: 403 },
        );
      }

      // Require JSON content type for API mutations (except logout)
      if (
        request.method !== "DELETE" &&
        !request.nextUrl.pathname.includes("/logout") &&
        !contentType.includes("application/json")
      ) {
        return NextResponse.json(
          { error: "Content-Type must be application/json" },
          { status: 415 },
        );
      }
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
