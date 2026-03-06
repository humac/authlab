import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIronSession } from "iron-session";
import type { UserSessionData } from "@/types/user-session";

const PUBLIC_PATH_PREFIXES = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/test/",
  "/invite/",
];

const PUBLIC_API_PREFIXES = [
  "/api/auth/callback/",
  "/api/auth/logout",
  "/api/user/login",
  "/api/user/login/mfa/totp",
  "/api/user/register",
  "/api/user/verify-email",
  "/api/user/verify-email/resend",
  "/api/user/password-reset/request",
  "/api/user/password-reset/complete",
  "/api/user/passkeys/login/options",
  "/api/user/passkeys/login/verify",
];

const ADMIN_PATH_PREFIXES = ["/admin"];
const ADMIN_API_PREFIXES = ["/api/admin/"];

function isPublicRoute(pathname: string): boolean {
  return (
    PUBLIC_PATH_PREFIXES.some((p) => pathname.startsWith(p)) ||
    PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p))
  );
}

function isAdminRoute(pathname: string): boolean {
  return (
    ADMIN_PATH_PREFIXES.some((p) => pathname.startsWith(p)) ||
    ADMIN_API_PREFIXES.some((p) => pathname.startsWith(p))
  );
}

function isAuthPage(pathname: string): boolean {
  return pathname === "/login" || pathname === "/register";
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const nonce = crypto.randomUUID().replace(/-/g, "");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-csp-nonce", nonce);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join("; ");

  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  if (
    pathname.startsWith("/api/") &&
    ["POST", "PUT", "DELETE"].includes(request.method)
  ) {
    const isSamlCallback = pathname.startsWith("/api/auth/callback/saml");
    const isProfileImageUpload = pathname === "/api/user/profile-image";

    if (!isSamlCallback) {
      const contentType = request.headers.get("content-type") || "";
      const origin = request.headers.get("origin");
      const host = request.headers.get("host");

      if (origin && host && !origin.includes(host)) {
        return NextResponse.json(
          { error: "CSRF validation failed" },
          { status: 403 },
        );
      }

      const contentLength = request.headers.get("content-length");
      const transferEncoding = request.headers.get("transfer-encoding");
      const hasRequestBody =
        (contentLength !== null && contentLength !== "0") ||
        Boolean(transferEncoding);

      if (
        request.method !== "DELETE" &&
        !pathname.includes("/logout") &&
        !isProfileImageUpload &&
        hasRequestBody &&
        !contentType.includes("application/json")
      ) {
        return NextResponse.json(
          { error: "Content-Type must be application/json" },
          { status: 415 },
        );
      }
    }
  }

  if (pathname.startsWith("/_next/") || pathname === "/favicon.ico") {
    return response;
  }

  if (isPublicRoute(pathname) && !isAuthPage(pathname)) {
    return response;
  }

  const session = await getIronSession<UserSessionData>(request, response, {
    password: process.env.SESSION_PASSWORD!,
    cookieName: "authlab_user",
  });

  const isAuthenticated = !!session.userId;
  const mustChangePassword = Boolean(session.mustChangePassword);

  if (isAuthPage(pathname) && isAuthenticated) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (isPublicRoute(pathname)) {
    return response;
  }

  if (!isAuthenticated) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (mustChangePassword) {
    const isSettingsPage = pathname === "/settings";
    const isAllowedUserApi = pathname === "/api/user/me" || pathname === "/api/user/logout";
    const isAllowedAuthApi = pathname === "/api/auth/logout";

    if (pathname.startsWith("/api/")) {
      if (!isAllowedUserApi && !isAllowedAuthApi) {
        return NextResponse.json(
          { error: "Password change required before continuing" },
          { status: 403 },
        );
      }
    } else if (!isSettingsPage) {
      return NextResponse.redirect(new URL("/settings?forcePasswordChange=1", request.url));
    }
  }

  if (isAdminRoute(pathname) && !session.isSystemAdmin) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
