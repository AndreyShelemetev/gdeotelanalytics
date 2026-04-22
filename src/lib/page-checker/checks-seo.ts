import { SiteId } from './defaults'
import { ExtractedPage } from './extract'
import { countryPrepositional } from './prepositional'

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'skip'

export interface CheckItem {
  id: string
  title: string
  status: CheckStatus
  message?: string
  details?: Record<string, any>
}

export interface CheckGroup {
  id: string
  title: string
  items: CheckItem[]
}

const BRAND: Record<SiteId, string> = {
  hotelin: 'Hotelin.com',
  gdeotel: 'Где Отель',
}

// Требуемое окончание title: "<разделитель> <бренд>"
const BRAND_TAIL: Record<SiteId, RegExp> = {
  hotelin: /-\s*Hotelin\.com\s*$/i,
  gdeotel: /\|\s*Где\s*Отель\s*$/i,
}

// Смысловые блоки description (минимум 3 из 5)
interface SemanticBlocks {
  priceFrom: boolean
  comparePrices: boolean
  hotelsCount: boolean
  sourcesCount: boolean
  datesAvailability: boolean
  bonusPhotosReviews: boolean
}

function findSemantics(desc: string, site: SiteId): SemanticBlocks {
  if (site === 'hotelin') {
    return {
      priceFrom: /\bfrom\s+[\p{Sc}$€£]?\s?\d/iu.test(desc) || /\bfrom\s+[a-z$]+\s?\d/i.test(desc),
      comparePrices: /\bcompare (hotel )?(prices|deals|offers)\b/i.test(desc) || /\bprice[- ]?comparison\b/i.test(desc),
      hotelsCount: /\b\d[\d,\s]*\s+(hotels|properties|stays)\b/i.test(desc),
      sourcesCount: /\b\d[\d,\s]*\s+(sites|booking sites|sources|partners)\b/i.test(desc),
      datesAvailability: /\bavailability\b|\bavailable dates\b|\bfor your dates\b/i.test(desc),
      bonusPhotosReviews: /\bphotos?\b|\breviews?\b/i.test(desc),
    }
  }
  return {
    priceFrom: /\bот\s+[\d\p{Sc}₽$€£]/iu.test(desc),
    comparePrices: /сравни(ть|те|вайте)?\s+(цены|предложения|деалы)|сравнени[ея]\s+цен/i.test(desc),
    hotelsCount: /\d[\d\s\u00a0]*\s+(вариант|объект|отел|предложени)/i.test(desc),
    sourcesCount: /\d[\d\s\u00a0]*\s+(сайт|источник|партн[её]р)/i.test(desc),
    datesAvailability: /нали(чи[ея]|чие)\s+(на\s+)?дат|на ваши даты|доступност/i.test(desc),
    bonusPhotosReviews: /фото|отзыв/i.test(desc),
  }
}

function status(ok: boolean, warnOnly = false): CheckStatus {
  return ok ? 'pass' : (warnOnly ? 'warn' : 'fail')
}

// —————— COUNTRY ——————
export function checksCountrySEO(site: SiteId, p: ExtractedPage, countryName: string | null): CheckGroup {
  const items: CheckItem[] = []
  const title = p.title || ''
  const desc = p.description || ''
  const h1 = p.h1 || ''

  // Title
  items.push({
    id: 'title-present',
    title: 'Title присутствует',
    status: status(!!title),
    details: { title },
  })

  const titleLen = title.length
  items.push({
    id: 'title-length',
    title: 'Длина title (50–65, допустимо до 70)',
    status: titleLen === 0 ? 'fail' : (titleLen >= 50 && titleLen <= 65) ? 'pass' : (titleLen <= 70 ? 'warn' : 'fail'),
    message: `${titleLen} симв.`,
  })

  const countryLower = countryName?.toLowerCase() || ''
  const countryPrep = site === 'gdeotel' && countryName ? countryPrepositional(countryName).toLowerCase() : ''
  const titleHasCountry = !!countryName && (
    title.toLowerCase().includes(countryLower) ||
    (!!countryPrep && title.toLowerCase().includes(countryPrep))
  )
  items.push({
    id: 'title-country',
    title: 'Title содержит страну',
    status: status(titleHasCountry),
    details: { countryName, countryPrepositional: countryPrep || undefined },
  })

  items.push({
    id: 'title-min-price',
    title: 'Title содержит min_price',
    status: status(/\b(from|от)\s+[\p{Sc}₽$€£]?\s?\d|\d[\d\s.,]*\s?[\p{Sc}₽$€£]/iu.test(title), true),
  })

  items.push({
    id: 'title-brand',
    title: site === 'hotelin'
      ? 'Title оканчивается на "- Hotelin.com"'
      : 'Title оканчивается на "| Где Отель"',
    status: status(BRAND_TAIL[site].test(title)),
    details: { brand: BRAND[site] },
  })

  // Description
  items.push({
    id: 'desc-present',
    title: 'Description присутствует',
    status: status(!!desc),
    details: { description: desc },
  })

  const dLen = desc.length
  const descRange = site === 'hotelin' ? [140, 165] : [150, 190]
  items.push({
    id: 'desc-length',
    title: `Длина description (${descRange[0]}–${descRange[1]})`,
    status: dLen === 0 ? 'fail' : (dLen >= descRange[0] && dLen <= descRange[1]) ? 'pass' : 'warn',
    message: `${dLen} симв.`,
  })

  const sem = findSemantics(desc, site)
  const semHits = (Object.values(sem).filter(Boolean) as boolean[]).length
  items.push({
    id: 'desc-semantics',
    title: 'Description содержит ≥ 3 из 5 смысловых блоков',
    status: semHits >= 3 ? 'pass' : 'fail',
    message: `Найдено ${semHits}`,
    details: sem,
  })

  const partnerRe = site === 'hotelin' ? /\bpartner\b/i : /партн[её]р/i
  items.push({
    id: 'desc-partner',
    title: 'Description упоминает партнёра/partner',
    status: status(partnerRe.test(desc), true),
  })

  items.push({
    id: 'desc-not-equal-title',
    title: 'Description ≠ title (не дубль)',
    status: status(!!desc && desc.trim() !== title.trim()),
  })

  // Country variable — учитываем любую падежную форму (исходная или предложная)
  if (countryName) {
    const prep = site === 'gdeotel' ? countryPrepositional(countryName) : ''
    const descLower = desc.toLowerCase()
    const hasCountry = descLower.includes(countryName.toLowerCase())
      || (!!prep && descLower.includes(prep.toLowerCase()))
    items.push({
      id: 'desc-country',
      title: 'Description содержит <country>',
      status: status(hasCountry),
      details: { countryName, countryPrepositional: prep || undefined },
    })
    if (site === 'gdeotel') {
      items.push({
        id: 'desc-country-prepositional',
        title: `Description содержит страну в предложном падеже («в ${prep}»)`,
        status: status(new RegExp(`в\\s+${prep.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}`, 'i').test(desc)),
      })
    }
  }

  items.push({
    id: 'desc-min-price',
    title: 'Description содержит <min_price>',
    status: status(/\b(from|от)\s+[\p{Sc}₽$€£]?\s?\d|[\p{Sc}₽$€£]\s?\d/iu.test(desc), true),
  })

  items.push({
    id: 'desc-hotels-count',
    title: 'Description содержит <hotels_count>',
    status: status(sem.hotelsCount, true),
  })

  items.push({
    id: 'desc-sources-count',
    title: 'Description содержит <sources_count>',
    status: status(sem.sourcesCount, true),
  })

  // H1
  items.push({
    id: 'h1-present',
    title: 'H1 присутствует',
    status: status(!!h1),
    details: { h1 },
  })
  if (countryName) {
    if (site === 'gdeotel') {
      const prep = countryPrepositional(countryName)
      items.push({
        id: 'h1-country',
        title: 'H1 содержит страну (предложный падеж)',
        status: status(h1.toLowerCase().includes(prep.toLowerCase()) || h1.toLowerCase().includes(countryName.toLowerCase()), true),
      })
    } else {
      items.push({
        id: 'h1-country',
        title: 'H1 содержит страну',
        status: status(h1.toLowerCase().includes(countryName.toLowerCase())),
      })
    }
  }

  return { id: 'seo', title: 'SEO: Title / Description / H1', items }
}
