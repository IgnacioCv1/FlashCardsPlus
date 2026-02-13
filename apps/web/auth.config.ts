import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!googleClientId || !googleClientSecret) {
  throw new Error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in apps/web/.env");
}

const authConfig: NextAuthConfig = {
  providers: [
    Google({
      clientId: googleClientId,
      clientSecret: googleClientSecret
    })
  ],
  pages: {
    signIn: "/login"
  },
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const isDashboardRoute = request.nextUrl.pathname.startsWith("/dashboard");
      const isLoginRoute = request.nextUrl.pathname.startsWith("/login");

      if (isDashboardRoute) {
        return isLoggedIn;
      }

      if (isLoginRoute && isLoggedIn) {
        return Response.redirect(new URL("/dashboard", request.nextUrl));
      }

      return true;
    }
  }
};

export default authConfig;
