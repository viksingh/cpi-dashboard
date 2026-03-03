export { auth as middleware } from "@/auth";

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api/auth (NextAuth routes)
     * - login page
     * - _next/static, _next/image (Next.js internals)
     * - favicon.ico, public assets
     */
    "/((?!api/auth|login|_next/static|_next/image|favicon\\.ico).*)",
  ],
};
