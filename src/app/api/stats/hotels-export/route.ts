import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/mysql'

/**
 * Экспорт активных отелей города (проект gdeotel) с готовыми URL:
 *  - url_gdeotel:  https://gdeotel.ru/отель/{country_name_ru}/{hotels.link}-{hotels.id}
 *  - url_ostrovok: https://www.ostrovok.ru/rooms/{hotel_services.text_id}  (service_type='ostrovok')
 *  - url_yandex:   https://travel.yandex.ru/hotels/{hotel_services.text_id} (service_type='yandex')
 *
 * GET /api/stats/hotels-export?city_id=NNN
 */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const cityId = searchParams.get('city_id')
  const premisesTypesRaw = searchParams.get('premises_types') // CSV
  if (!cityId) {
    return NextResponse.json({ error: 'city_id is required' }, { status: 400 })
  }

  const premisesTypes = premisesTypesRaw
    ? premisesTypesRaw.split(',').map((s) => s.trim()).filter(Boolean)
    : []

  const params: any[] = [parseInt(cityId, 10)]
  let typeFilter = ''
  if (premisesTypes.length > 0) {
    typeFilter = ` AND h.premises_type IN (${premisesTypes.map(() => '?').join(',')})`
    params.push(...premisesTypes)
  }

  const rows = await query<any>(
    `SELECT
       h.id          AS hotel_id,
       h.name        AS hotel_name,
       h.link        AS link,
       h.premises_type AS premises_type,
       co.link_ru    AS country_slug_ru,
       hs_o.text_id  AS ostrovok_text_id,
       hs_y.text_id  AS yandex_text_id
     FROM hotels h
     INNER JOIN loc_countries co ON co.id = h.loc_country_id
     LEFT JOIN hotel_services hs_o
       ON hs_o.entity_type = 'hotel'
       AND hs_o.entity_id = h.id
       AND hs_o.service_type = 'ostrovok'
     LEFT JOIN hotel_services hs_y
       ON hs_y.entity_type = 'hotel'
       AND hs_y.entity_id = h.id
       AND hs_y.service_type = 'yandex'
     WHERE h.is_active_ru = 1
       AND h.loc_city_id = ?${typeFilter}
     ORDER BY h.name`,
    params
  )

  const data = rows.map((r) => {
    const country = r.country_slug_ru ? String(r.country_slug_ru).trim() : ''
    const link = r.link ? String(r.link).trim() : ''
    const url_gdeotel = country && link
      ? `https://gdeotel.ru/отель/${country}/${link}-${r.hotel_id}`
      : ''
    const url_ostrovok = r.ostrovok_text_id
      ? `https://www.ostrovok.ru/rooms/${r.ostrovok_text_id}`
      : ''
    const url_yandex = r.yandex_text_id
      ? `https://travel.yandex.ru/hotels/${r.yandex_text_id}`
      : ''
    return {
      hotel_id: r.hotel_id,
      hotel_name: r.hotel_name,
      premises_type: r.premises_type || '',
      url_gdeotel,
      url_ostrovok,
      url_yandex,
    }
  })

  return NextResponse.json({ total: data.length, hotels: data })
}
