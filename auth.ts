import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = String(credentials.email).toLowerCase().trim();
        const password = String(credentials.password);

        try {
          const user = await prisma.user.findUnique({
            where: { email },
            include: {
              organizationUsers: {
                include: {
                  organization: true,
                },
              },
            },
          });

          if (!user || !user.password) {
            return null;
          }

          const isValid = await bcrypt.compare(password, user.password);
          if (!isValid) {
            return null;
          }

          return {
            id: user.id,
            name: user.name,
            email: user.email,
          };
        } catch (err) {
          console.error("Auth error in credentials authorize:", err);
          return null;
        }
      },
    }),
  ],
  trustHost: true,
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        try {
          const membership = await prisma.organizationUser.findFirst({
            where: { userId: user.id },
            include: { organization: true },
          });
          if (membership) {
            token.orgId = membership.orgId;
            token.orgName = membership.organization.name;
            token.role = membership.role;
          }
        } catch (e) {
          console.warn("Could not populate org membership in token:", e);
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token?.sub) {
        session.user.id = token.sub;
        const userObj = session.user as unknown as Record<string, unknown>;
        userObj.orgId = token.orgId;
        userObj.orgName = token.orgName;
        userObj.role = token.role;
      }
      return session;
    },
  },
});
