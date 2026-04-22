'use client'

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { IndexingChecker } from '@/components/IndexingChecker'
import { SitemapMonitor } from '@/components/SitemapMonitor'

function WebmasterContent() {
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [tab, setTab] = useState<'single' | 'sitemap'>('sitemap')
  const searchParams = useSearchParams()

  useEffect(() => {
    const success = searchParams.get('success')
    const error = searchParams.get('error')

    if (success === 'true') {
      setNotification({ type: 'success', message: 'Успешно авторизованы в Яндекс Вебмастер!' })
      window.history.replaceState({}, document.title, '/webmaster')
    } else if (error) {
      const errorMessages: Record<string, string> = {
        token_exchange_failed: 'Ошибка обмена кода на токен. Попробуйте авторизоваться снова.',
        no_code: 'Код авторизации не получен от Яндекса.',
        callback_failed: 'Ошибка обработки авторизации.',
      }
      setNotification({
        type: 'error',
        message: errorMessages[error] || `Ошибка авторизации: ${error}`,
      })
      window.history.replaceState({}, document.title, '/webmaster')
    }
  }, [searchParams])

  return (
    <>
      {notification && (
        <div className={`mb-6 p-4 rounded-lg flex items-center justify-between ${
          notification.type === 'success'
            ? 'bg-green-50 border border-green-200'
            : 'bg-red-50 border border-red-200'
        }`}>
          <p className={notification.type === 'success' ? 'text-green-800' : 'text-red-800'}>
            {notification.type === 'success' ? '✓ ' : '✕ '}
            {notification.message}
          </p>
          <button
            onClick={() => setNotification(null)}
            className="text-gray-400 hover:text-gray-600 ml-4"
          >
            ✕
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="mb-6 border-b border-gray-200">
        <nav className="flex gap-4 -mb-px">
          <button
            onClick={() => setTab('sitemap')}
            className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
              tab === 'sitemap'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            📋 Мониторинг Sitemap
          </button>
          <button
            onClick={() => setTab('single')}
            className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
              tab === 'single'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            🔍 Проверка одной страницы
          </button>
        </nav>
      </div>

      {tab === 'sitemap' ? <SitemapMonitor /> : <IndexingChecker />}
    </>
  )
}

export default function WebmasterPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-3 flex items-center justify-between sticky top-0 z-10">
        <h1 className="text-xl font-bold">Hotel Analytics</h1>
        <nav className="flex gap-2 text-sm">
          <Link href="/dashboard" className="px-3 py-1.5 rounded hover:bg-gray-100 text-gray-600">Dashboard</Link>
          <Link href="/matching" className="px-3 py-1.5 rounded hover:bg-gray-100 text-gray-600">Matching</Link>
          <Link href="/single-source" className="px-3 py-1.5 rounded hover:bg-gray-100 text-gray-600">Single Source</Link>
          <Link href="/webmaster" className="px-3 py-1.5 rounded bg-blue-100 text-blue-700 font-medium">Webmaster</Link>
          <Link href="/page-checker" className="px-3 py-1.5 rounded hover:bg-gray-100 text-gray-600">Page Checker</Link>
        </nav>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Мониторинг индексации</h1>
          <p className="text-sm text-gray-500 mt-1">Яндекс Вебмастер — проверка статуса индексации страниц</p>
        </div>

        <Suspense fallback={<div className="text-center py-8 text-gray-500">Загрузка...</div>}>
          <WebmasterContent />
        </Suspense>
      </div>
    </div>
  )
}
