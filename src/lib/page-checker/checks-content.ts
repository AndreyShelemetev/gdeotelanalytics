import { SiteId } from './defaults'
import { ExtractedPage } from './extract'
import { CheckGroup, CheckItem, CheckStatus } from './checks-seo'

function status(ok: boolean, warnOnly = false): CheckStatus {
  return ok ? 'pass' : (warnOnly ? 'warn' : 'fail')
}

export function checksContent(site: SiteId, p: ExtractedPage): CheckGroup {
  const items: CheckItem[] = []

  // Карточки отелей
  const n = p.hotelCardCount
  items.push({
    id: 'hotel-cards-count',
    title: 'Количество карточек отелей (идеал 27, минимум 2)',
    status: n >= 27 ? 'pass' : n >= 2 ? 'warn' : 'fail',
    message: `Найдено: ${n}`,
  })

  // notFound — такого быть не должно (страница должна быть 404)
  items.push({
    id: 'has-not-found-block',
    title: 'Отсутствует блок HotelsList_notFound (иначе страница должна отдавать 404)',
    status: p.hasNotFoundBlock ? 'fail' : 'pass',
    message: p.hasNotFoundBlock ? 'Обнаружен HotelsList_notFound — страница должна быть 404' : 'OK',
  })

  // Отсутствие пагинации на странице страны
  items.push({
    id: 'no-pagination',
    title: 'Отсутствие пагинации (Pagination_root / InfinityPagination_pagination)',
    status: p.hasPagination ? 'fail' : 'pass',
  })

  // SubTitle "We found N from price"
  const expectPriceSign = site === 'hotelin' ? '$' : '₽'
  const subOk = !!p.subTitleText && (
    site === 'hotelin'
      ? /we found\s+\d[\d,\s]*\s+from price\s+\$?\d/i.test(p.subTitleText)
      : /мы нашли\s+\d[\d\s\u00a0]*\s+с ценой от\s+\d|\bот\s+\d[\d\s\u00a0]*\s?₽/i.test(p.subTitleText)
  )
  items.push({
    id: 'subtitle-text',
    title: site === 'hotelin'
      ? 'Блок subTitle: "We found N from price $..."'
      : 'Блок subTitle: "Мы нашли N с ценой от ... ₽"',
    status: subOk ? 'pass' : (p.subTitleText ? 'warn' : 'fail'),
    message: p.subTitleText || 'Блок не найден',
    details: { expectedCurrency: expectPriceSign },
  })

  // Notification текст
  const notifExpectedRu = /цены и наличие мест могут меняться.*gdeotel/i
  const notifExpectedEn = /prices and availability are subject to change.*hotelin/i
  const notifOk = !!p.notificationText && (site === 'hotelin'
    ? notifExpectedEn.test(p.notificationText)
    : notifExpectedRu.test(p.notificationText))
  items.push({
    id: 'notification-text',
    title: 'Блок HotelsList_notification содержит корректный дисклеймер',
    status: notifOk ? 'pass' : (p.notificationText ? 'warn' : 'fail'),
    message: p.notificationText || 'Блок не найден',
  })

  return { id: 'content', title: 'Контент страницы', items }
}

export function checksCanonical(p: ExtractedPage, pageUrl: string): CheckGroup {
  const items: CheckItem[] = []
  const canon = p.canonical?.trim() || ''
  items.push({
    id: 'canonical-present',
    title: 'Canonical присутствует',
    status: status(!!canon),
    details: { canonical: canon },
  })

  const norm = (u: string) => {
    try {
      const x = new URL(u)
      return (x.origin + x.pathname).replace(/\/+$/, '')
    } catch { return u.replace(/\/+$/, '') }
  }
  const same = canon ? norm(canon) === norm(pageUrl) : false
  items.push({
    id: 'canonical-self',
    title: 'Canonical указывает на саму себя',
    status: status(same),
    details: { pageUrl, canonical: canon },
  })

  return { id: 'canonical', title: 'Canonical', items }
}
