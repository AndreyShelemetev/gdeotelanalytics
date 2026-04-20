import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { cookies } from 'next/headers'

// Yandex OAuth configuration
const YANDEX_CLIENT_ID = process.env.YANDEX_CLIENT_ID || ''
const YANDEX_CLIENT_SECRET = process.env.YANDEX_CLIENT_SECRET || ''
const YANDEX_REDIRECT_URI = process.env.YANDEX_REDIRECT_URI || 'http://localhost:3000/api/webmaster/oauth/callback'

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action')

  if (action === 'auth_url') {
    if (!YANDEX_CLIENT_ID) {
      return NextResponse.json({
        error: 'YANDEX_CLIENT_ID not configured. Please check your .env.local file.'
      }, { status: 500 })
    }

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: YANDEX_CLIENT_ID,
      redirect_uri: YANDEX_REDIRECT_URI
    })
    const authUrl = `https://oauth.yandex.ru/authorize?${params.toString()}`
    return NextResponse.json({ auth_url: authUrl })
  }

  if (action === 'status') {
    // Check if user has valid Yandex OAuth token
    const cookieStore = cookies()
    const tokenCookie = cookieStore.get('yandex_token')
    
    if (!tokenCookie?.value) {
      return NextResponse.json({ authenticated: false })
    }

    try {
      const tokenData = JSON.parse(tokenCookie.value)
      const isValid = tokenData.access_token && Date.now() < tokenData.expires_at
      return NextResponse.json({
        authenticated: !!isValid,
        message: isValid ? 'Authenticated with Yandex Webmaster' : 'Not authenticated'
      })
    } catch (err) {
      return NextResponse.json({ authenticated: false })
    }
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { code } = body

  if (!code) {
    return NextResponse.json({ error: 'Authorization code required' }, { status: 400 })
  }

  try {
    if (!YANDEX_CLIENT_ID || !YANDEX_CLIENT_SECRET) {
      return NextResponse.json({
        error: 'Yandex OAuth credentials not configured. Please check your .env.local file.'
      }, { status: 500 })
    }

    // Exchange authorization code for access token
    const tokenResponse = await fetch('https://oauth.yandex.ru/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: YANDEX_CLIENT_ID,
        client_secret: YANDEX_CLIENT_SECRET,
        redirect_uri: YANDEX_REDIRECT_URI,
      }),
    })

    if (!tokenResponse.ok) {
      throw new Error('Failed to exchange code for token')
    }

    const tokenData = await tokenResponse.json()

    // Store the token in a cookie (will be sent back to the response)
    const expiresAt = Date.now() + (tokenData.expires_in * 1000)
    const cookieData = JSON.stringify({
      access_token: tokenData.access_token,
      expires_at: expiresAt,
    })

    const response = NextResponse.json({
      success: true,
      message: 'Yandex Webmaster authenticated successfully',
      token_type: tokenData.token_type,
      expires_in: tokenData.expires_in
    })

    // Set secure cookie with token
    response.cookies.set('yandex_token', cookieData, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: tokenData.expires_in,
    })

    return response
  } catch (error) {
    console.error('Yandex OAuth error:', error)
    return NextResponse.json({ error: 'Failed to authenticate with Yandex' }, { status: 500 })
  }
}