import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIronSession } from "iron-session";
import type { UserSessionData } from "@/types/user-session";

const PUBLIC_PATH_PREFIXES = ["/login", "/register", "/test/", "/invite/"];
const PUBLIC_API_PREFIXES = [
  "/api/auth/callback/",
  "/api/auth/logout",
  "/api/user/login",
  "/api/user/register",
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

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const { pathname } = request.nextUrl;

  // Security headers
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // CSRF protection on mutation API routes
  if (
    pathname.startsWith("/api/") &&
    ["POST", "PUT", "DELETE"].includes(request.method)
  ) {
    // Allow SAML callback (IdP POST) and form submissions
    const isSamlCallback = pathname.startsWith("/api/auth/callback/saml");
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

      // Require JSON content type for API mutations (except logout/DELETE)
      if (
        request.method !== "DELETE" &&
        !pathname.includes("/logout") &&
        !contentType.includes("application/json")
      ) {
        return NextResponse.json(
          { error: "Content-Type must be application/json" },
          { status: 415 },
        );
      }
    }
  }

  // Skip auth checks for static files
  if (pathname.startsWith("/_next/") || pathname === "/favicon.ico") {
    return response;
  }

  // Skip auth checks for public routes (except auth pages where we redirect logged-in users)
  if (isPublicRoute(pathname) && !isAuthPage(pathname)) {
    return response;
  }

  // Read user session
  const session = await getIronSession<UserSessionData>(request, response, {
    password: process.env.SESSION_PASSWORD!,
    cookieName: "authlab_user",
  });

  const isAuthenticated = !!session.userId;
  const mustChangePassword = Boolean(session.mustChangePassword);

  // Redirect authenticated users away from login/register
  if (isAuthPage(pathname) && isAuthenticated) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Public routes don't need further checks
  if (isPublicRoute(pathname)) {
    return response;
  }

  // Protected routes require authentication
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
    const isAllowedUserApi =
      pathname === "/api/user/me" || pathname === "/api/user/logout";
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

  // Admin routes require system admin
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
