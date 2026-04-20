import type { NextAuthOptions, Session } from 'next-auth'
import type { JWT } from 'next-auth/jwt'
import CredentialsProvider from 'next-auth/providers/credentials'

interface CustomSession extends Session {
  yandexToken?: {
    access_token: string
    expires_at: number
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Admin Login',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const adminUser = process.env.ADMIN_USER || 'admin'
        const adminPass = process.env.ADMIN_PASSWORD || 'admin123'

        if (
          credentials?.username === adminUser &&
          credentials?.password === adminPass
        ) {
          return { id: '1', name: 'Admin', email: 'admin@analytics.local' }
        }
        return null
      },
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.user = user
      }
      return token
    },
    async session({ session, token }) {
      const customSession = session as CustomSession
      if (token) {
        customSession.user = token.user as any
      }
      if ((token as any).yandexToken) {
        customSession.yandexToken = (token as any).yandexToken
      }
      return customSession
    },
  },
  pages: {
    signIn: '/login',
  },
  secret: process.env.NEXTAUTH_SECRET,
}
