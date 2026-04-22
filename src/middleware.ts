import { withAuth } from 'next-auth/middleware'

export default withAuth({
  pages: {
    signIn: '/login',
  },
})

export const config = {
  matcher: ['/dashboard/:path*', '/matching/:path*', '/single-source/:path*', '/page-checker/:path*', '/api/countries', '/api/regions', '/api/cities', '/api/stats/:path*', '/api/page-checker/:path*'],
}
