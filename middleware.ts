import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. Allow public static assets, PWA manifest, service worker, and auth APIs
  if (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/organizations") ||
    pathname === "/manifest.webmanifest" ||
    pathname.startsWith("/icons") ||
    pathname === "/sw.js" ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  // 2. Check for active session token in cookies (NextAuth / Auth.js)
  const sessionToken =
    req.cookies.get("authjs.session-token")?.value ||
    req.cookies.get("__Secure-authjs.session-token")?.value ||
    req.cookies.get("next-auth.session-token")?.value ||
    req.cookies.get("__Secure-next-auth.session-token")?.value;

  const isAuthPage = pathname === "/login" || pathname === "/register";

  // 3. If already authenticated and visiting /login or /register, redirect to dashboard
  if (isAuthPage) {
    if (sessionToken) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    return NextResponse.next();
  }

  // 4. Must be logged in to view dashboard or settings
  if (!sessionToken) {
    const loginUrl = new URL("/login", req.url);
    if (pathname !== "/") {
      loginUrl.searchParams.set("callbackUrl", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files and images
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
