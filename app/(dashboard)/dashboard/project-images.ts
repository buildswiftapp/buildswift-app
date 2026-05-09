const photos = [
  // Waterfront condominium / harbor view
  'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=480&q=80',
  // Modern medical / hospital building
  'https://images.unsplash.com/photo-1586773860418-d37222d8fce3?auto=format&fit=crop&w=480&q=80',
  // Downtown office tower (looking up)
  'https://images.unsplash.com/photo-1486325212027-8081e485255e?auto=format&fit=crop&w=480&q=80',
  // Glass commercial building
  'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=480&q=80',
  // Construction crane skyline
  'https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=480&q=80',
  // Modern residential complex
  'https://images.unsplash.com/photo-1460317442991-0ec209397118?auto=format&fit=crop&w=480&q=80',
]

const keywordMap: Array<{ match: RegExp; index: number }> = [
  { match: /harbor|waterfront|coast|marina|residence|apartment|condo/i, index: 0 },
  { match: /medical|hospital|health|clinic/i, index: 1 },
  { match: /office|tower|downtown|corporate|commercial/i, index: 2 },
  { match: /glass|business|center|plaza/i, index: 3 },
  { match: /construction|crane|highrise|skyline/i, index: 4 },
  { match: /shopping|mall|retail|market|valley|green/i, index: 5 },
]

export function pickProjectImage(name: string, fallbackIndex: number): string {
  for (const { match, index } of keywordMap) {
    if (match.test(name)) return photos[index]!
  }
  return photos[fallbackIndex % photos.length]!
}
