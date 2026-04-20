// Shared token storage for Yandex OAuth tokens
// In production, this should be replaced with a database or session store
export const userTokens = new Map<string, { access_token: string; expires_at: number }>()
