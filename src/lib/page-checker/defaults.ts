export type SiteId = 'gdeotel' | 'hotelin'
export type PageType = 'country' | 'region' | 'city' | 'hotel'

export const SITES: Record<SiteId, { domain: string; label: string; lang: 'ru' | 'en' }> = {
  gdeotel: { domain: 'https://gdeotel.ru', label: 'GdeOtel.ru', lang: 'ru' },
  hotelin: { domain: 'https://hotelin.com', label: 'Hotelin.com', lang: 'en' },
}

export const PAGE_TYPES: { id: PageType; label: string }[] = [
  { id: 'country', label: 'Страна' },
  { id: 'region', label: 'Регион' },
  { id: 'city', label: 'Город' },
  { id: 'hotel', label: 'Карточка отеля' },
]

export function defaultSitemap(site: SiteId, pageType: PageType): string {
  const base = SITES[site].domain
  switch (pageType) {
    case 'country': return `${base}/countries-sitemap.xml`
    case 'region': return `${base}/regions-sitemap.xml`
    case 'city': return `${base}/cities-sitemap.xml`
    case 'hotel': return `${base}/hotels-sitemap.xml`
  }
}
