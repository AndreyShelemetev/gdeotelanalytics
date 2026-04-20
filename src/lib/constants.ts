// Mapping of premises_type values to normalized groups
const HOTELS_TYPES = new Set([
  'hotel',
  'mini hotel', 'mini-hotel', 'mini_hotel', 'MINI_HOTEL', 'Mini-hotel',
  'boutique hotel', 'boutique-hotel', 'boutique_hotel', 'BOUTIQUE', 'Boutique_and_Design',
  'resort', 'resort hotel',
  'hostel',
  'aparthotel', 'apart-hotel', 'apart_hotel', 'APART_HOTEL', 'Apart-hotel',
  'inn', 'motel', 'lodge', 'ryokan',
])

const APARTMENTS_TYPES = new Set([
  'apartment', 'apartments',
  'holiday_home', 'holiday home',
  'villa', 'VILLA_AND_BUNGALOWS', 'Villas_and_Bungalows',
  'guest_house', 'guesthouse', 'GUESTHOUSE',
  'country_house', 'chalet', 'gite', 'farm_holiday', 'riad', 'Farm',
  'COTTAGE', 'Cottages_and_Houses', 'cottage',
  'BNB', 'bnb', 'Camping', 'camping',
])

export type ObjectGroup = 'hotels' | 'apartments' | 'other'

export function classifyPremisesType(premisesType: string): ObjectGroup {
  const lower = premisesType.toLowerCase().replace(/[-_\s]+/g, '_')
  
  // Check against normalized sets
  if (HOTELS_TYPES.has(premisesType)) return 'hotels'
  if (APARTMENTS_TYPES.has(premisesType)) return 'apartments'
  
  // Fallback: pattern matching on normalized value
  if (lower.includes('hotel') || lower.includes('hostel') || lower.includes('resort') || lower.includes('inn') || lower.includes('motel') || lower.includes('lodge')) {
    return 'hotels'
  }
  if (lower.includes('apart') || lower.includes('house') || lower.includes('villa') || lower.includes('cottage') || lower.includes('home') || lower.includes('guest') || lower.includes('chalet') || lower.includes('bnb') || lower.includes('camping')) {
    return 'apartments'
  }
  
  return 'other'
}

// Project definitions
export type ProjectId = 'gdeotel' | 'hotelin'

export interface ProjectConfig {
  id: ProjectId
  label: string
  activeField: 'is_active_ru' | 'is_active_en'
  providers: string[] // extensible list of provider service_types
  frequencyTable: string
  frequencyField: string
}

export const PROJECTS: Record<ProjectId, ProjectConfig> = {
  gdeotel: {
    id: 'gdeotel',
    label: 'Gdeotel.ru',
    activeField: 'is_active_ru',
    providers: ['ostrovok', 'yandex'],
    frequencyTable: 'city_frequencies_ru',
    frequencyField: 'total_vol',
  },
  hotelin: {
    id: 'hotelin',
    label: 'Hotelin.com',
    activeField: 'is_active_en',
    providers: ['booking', 'ostrovok'],
    frequencyTable: 'city_frequencies',
    frequencyField: 'frequency',
  },
}

// SQL CASE expression for classifying premises_type in DB queries
export const PREMISES_GROUP_SQL = `
  CASE
    WHEN h.premises_type IN ('hotel','hostel','resort','inn','motel','lodge','ryokan',
      'aparthotel','Apart-hotel','APART_HOTEL',
      'Mini-hotel','MINI_HOTEL',
      'Boutique_and_Design','BOUTIQUE',
      'Camping') THEN 'hotels'
    WHEN h.premises_type IN ('apartment','apartments','holiday_home',
      'villa','VILLA_AND_BUNGALOWS','Villas_and_Bungalows',
      'guest_house','GUESTHOUSE',
      'country_house','chalet','gite','farm_holiday','riad','Farm',
      'COTTAGE','Cottages_and_Houses',
      'BNB') THEN 'apartments'
    WHEN LOWER(h.premises_type) LIKE '%hotel%' OR LOWER(h.premises_type) LIKE '%hostel%'
      OR LOWER(h.premises_type) LIKE '%resort%' THEN 'hotels'
    WHEN LOWER(h.premises_type) LIKE '%apart%' OR LOWER(h.premises_type) LIKE '%house%'
      OR LOWER(h.premises_type) LIKE '%villa%' OR LOWER(h.premises_type) LIKE '%cottage%'
      OR LOWER(h.premises_type) LIKE '%home%' OR LOWER(h.premises_type) LIKE '%bnb%' THEN 'apartments'
    ELSE 'other'
  END`
