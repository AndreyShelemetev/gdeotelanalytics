import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  
  // Use NEXTAUTH_URL for redirects to ensure proper hostname
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'

  if (error) {
    return NextResponse.redirect(new URL('/webmaster?error=' + encodeURIComponent(error), baseUrl))
  }

  if (!code) {
    return NextResponse.redirect(new URL('/webmaster?error=no_code', baseUrl))
  }

  try {
    const clientId = process.env.YANDEX_CLIENT_ID
    const clientSecret = process.env.YANDEX_CLIENT_SECRET
    const redirectUri = process.env.YANDEX_REDIRECT_URI

    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error('Missing Yandex OAuth configuration')
    }

    // Exchange code for access token
    const response = await fetch('https://oauth.yandex.ru/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('Yandex token exchange error:', data)
      return NextResponse.redirect(new URL('/webmaster?error=token_exchange_failed', baseUrl))
    }

    // Store token in an httpOnly cookie for secure storage
    const expiresAt = Date.now() + (data.expires_in * 1000)
    const tokenData = JSON.stringify({
      access_token: data.access_token,
      expires_at: expiresAt,
    })

    const redirectUrl = new URL('/webmaster?success=true', baseUrl)
    const res = NextResponse.redirect(redirectUrl)

    res.cookies.set('yandex_token', tokenData, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: data.expires_in,
    })

    console.log('✓ Yandex token stored in secure cookie')
    return res
  } catch (error) {
    console.error('OAuth callback error:', error)
    return NextResponse.redirect(new URL('/webmaster?error=callback_failed', baseUrl))
  }
}