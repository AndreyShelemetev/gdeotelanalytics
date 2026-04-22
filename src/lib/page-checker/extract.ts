// Лёгкое извлечение нужных полей из HTML без внешних DOM-парсеров.
// Мы целенаправленно извлекаем только то, что требуется бизнес-логикой
// (title, meta description, h1, canonical, счётчик карточек, спец-блоки).

export interface ExtractedPage {
  title: string | null
  description: string | null
  h1: string | null
  canonical: string | null
  hotelCardCount: number
  hasNotFoundBlock: boolean
  hasPagination: boolean
  subTitleText: string | null
  notificationText: string | null
  hotelsCount: number | null
  minPriceText: string | null
}

function decodeHtml(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
}

function pickAttr(tag: string, name: string): string | null {
  const re = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i')
  const m = tag.match(re)
  if (!m) return null
  return (m[1] ?? m[2] ?? m[3] ?? '').trim()
}

function firstTagWithClassPrefix(html: string, tag: string, classPrefix: string): { outer: string; inner: string } | null {
  const re = new RegExp(`<${tag}\\b[^>]*\\bclass\\s*=\\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi')
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const cls = (m[1] ?? m[2] ?? '') as string
    if (cls.split(/\s+/).some(c => c.startsWith(classPrefix))) {
      return { outer: m[0], inner: m[3] }
    }
  }
  return null
}

function countTagsWithClassPrefix(html: string, tag: string, classPrefix: string): number {
  const re = new RegExp(`<${tag}\\b[^>]*\\bclass\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'gi')
  let m: RegExpExecArray | null
  let count = 0
  while ((m = re.exec(html)) !== null) {
    const cls = (m[1] ?? m[2] ?? '') as string
    if (cls.split(/\s+/).some(c => c.startsWith(classPrefix))) count++
  }
  return count
}

function stripTags(s: string): string {
  return decodeHtml(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
}

export function extractPage(html: string): ExtractedPage {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const title = titleMatch ? decodeHtml(titleMatch[1]).trim() : null

  let description: string | null = null
  const metaRe = /<meta\b[^>]*>/gi
  let mm: RegExpExecArray | null
  while ((mm = metaRe.exec(html)) !== null) {
    const tag = mm[0]
    const nm = pickAttr(tag, 'name') || pickAttr(tag, 'property')
    if (nm && nm.toLowerCase() === 'description') {
      description = decodeHtml(pickAttr(tag, 'content') || '').trim()
      break
    }
  }

  const h1Match = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)
  const h1 = h1Match ? stripTags(h1Match[1]) : null

  let canonical: string | null = null
  const linkRe = /<link\b[^>]*>/gi
  let lm: RegExpExecArray | null
  while ((lm = linkRe.exec(html)) !== null) {
    const tag = lm[0]
    const rel = pickAttr(tag, 'rel')
    if (rel && rel.toLowerCase() === 'canonical') {
      canonical = pickAttr(tag, 'href')
      break
    }
  }

  // Считаем количество вхождений класса HotelCard_root... (устойчиво к любому
  // суффиксу CSS-модуля и к тому, что карточка может быть на <a>/<article>/<div>).
  const hotelCardCount = (html.match(/\bHotelCard_root\b/g) || []).length
  const hasNotFoundBlock = /class\s*=\s*(?:"|')[^"']*HotelsList_notFound/i.test(html)
  const hasPagination = /class\s*=\s*(?:"|')[^"']*Pagination_root/i.test(html)
    || /class\s*=\s*(?:"|')[^"']*InfinityPagination_pagination/i.test(html)

  const subTitle = firstTagWithClassPrefix(html, 'div', 'HotelsPage_main__subTitle')
  const subTitleText = subTitle ? stripTags(subTitle.inner) : null

  const notification = firstTagWithClassPrefix(html, 'div', 'HotelsList_notification')
  const notificationText = notification ? stripTags(notification.inner) : null

  let hotelsCount: number | null = null
  let minPriceText: string | null = null
  if (subTitleText) {
    const num = subTitleText.match(/(\d[\d\s\u00a0]*)/)
    if (num) hotelsCount = parseInt(num[1].replace(/[\s\u00a0]/g, ''), 10)
    const price = subTitleText.match(/(?:от|from)\s+([^\s.]+(?:\s?[$₽€£])?|[$₽€£]\s?\d[\d\s\u00a0.,]*)/i)
    if (price) minPriceText = price[1].trim()
  }

  return {
    title, description, h1, canonical,
    hotelCardCount, hasNotFoundBlock, hasPagination,
    subTitleText, notificationText, hotelsCount, minPriceText,
  }
}
