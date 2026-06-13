import { distanceNm } from '../aviation/coordinates'

export interface AerodromeEntry {
  icao: string
  name: string
  lat: number   // decimal degrees N
  lng: number   // decimal degrees E (negative = W)
}

// Full list of aerodromes
export const AERODROMES: AerodromeEntry[] = [
  // Île-de-France
  { icao: 'LFPG', name: 'Paris Charles de Gaulle', lat: 49.0097, lng: 2.5478 },
  { icao: 'LFPO', name: 'Paris Orly', lat: 48.7233, lng: 2.3794 },
  { icao: 'LFPB', name: 'Paris Le Bourget', lat: 48.9694, lng: 2.4414 },
  { icao: 'LFPN', name: 'Paris Toussus-le-Noble', lat: 48.7497, lng: 2.1119 },
  { icao: 'LFPH', name: 'Chavenay-Villepreux', lat: 48.8539, lng: 1.9778 },
  { icao: 'LFPM', name: 'Melun-Villaroche', lat: 48.6044, lng: 2.6711 },
  { icao: 'LFPC', name: 'Creil', lat: 49.2539, lng: 2.5192 },
  { icao: 'LFPF', name: 'Brétigny-sur-Orge', lat: 48.5194, lng: 2.3333 },
  // Centre
  { icao: 'LFOX', name: 'Étampes-Mondésir', lat: 48.3886, lng: 2.0672 },
  { icao: 'LFOJ', name: 'Orléans-Bricy', lat: 47.9878, lng: 1.7606 },
  { icao: 'LFON', name: 'Dreux-Vernouillet', lat: 48.7242, lng: 1.3681 },
  { icao: 'LFOR', name: 'Chartres-Champhol', lat: 48.4564, lng: 1.5211 },
  { icao: 'LFOP', name: 'Rouen-Vallée de Seine', lat: 49.3842, lng: 1.1747 },
  { icao: 'LFOK', name: 'Châlons-Vatry', lat: 48.7733, lng: 4.1847 },
  { icao: 'LFQE', name: 'Épernay-Plivot', lat: 49.0350, lng: 3.9517 },
  { icao: 'LFSR', name: 'Reims-Prunay', lat: 49.2089, lng: 4.1586 },
  { icao: 'LFQG', name: 'Nevers-Fourchambault', lat: 46.9997, lng: 3.1128 },
  { icao: 'LFLD', name: 'Bourges', lat: 47.0581, lng: 2.3703 },
  // Nord-Ouest
  { icao: 'LFRB', name: 'Brest Bretagne', lat: 48.4478, lng: -4.4183 },
  { icao: 'LFRN', name: 'Rennes Saint-Jacques', lat: 48.0695, lng: -1.7347 },
  { icao: 'LFRS', name: 'Nantes Atlantique', lat: 47.1531, lng: -1.6111 },
  { icao: 'LFRD', name: 'Dinard-Pleurtuit', lat: 48.5878, lng: -2.0797 },
  { icao: 'LFRG', name: 'Deauville-Normandie', lat: 49.3653, lng: 0.1544 },
  { icao: 'LFRK', name: 'Caen-Carpiquet', lat: 49.1733, lng: -0.4497 },
  { icao: 'LFRC', name: 'Cherbourg-Maupertus', lat: 49.6503, lng: -1.4703 },
  { icao: 'LFRO', name: 'Lannion-Côte de Granit', lat: 48.7539, lng: -3.4717 },
  { icao: 'LFRQ', name: 'Quimper-Cornouaille', lat: 47.9750, lng: -4.1678 },
  { icao: 'LFRT', name: 'Saint-Brieuc-Armor', lat: 48.5378, lng: -2.8544 },
  { icao: 'LFRU', name: 'Morlaix-Ploujean', lat: 48.6031, lng: -3.8158 },
  { icao: 'LFRH', name: 'Lorient-Bretagne Sud', lat: 47.7606, lng: -3.4400 },
  { icao: 'LFRI', name: 'La Roche-sur-Yon', lat: 46.7019, lng: -1.3786 },
  { icao: 'LFRM', name: 'Le Mans-Arnage', lat: 47.9489, lng: 0.2017 },
  { icao: 'LFRV', name: 'Vannes-Meucon', lat: 47.7233, lng: -2.7186 },
  { icao: 'LFRA', name: 'Angers-Loire', lat: 47.5603, lng: -0.3122 },
  { icao: 'LFOU', name: 'Cholet-Montfaucon', lat: 47.0811, lng: -0.8878 },
  { icao: 'LFOV', name: 'Laval-Entrammes', lat: 48.0314, lng: -0.7431 },
  // Est / Alsace
  { icao: 'LFST', name: 'Strasbourg-Entzheim', lat: 48.5382, lng: 7.6283 },
  { icao: 'LFSB', name: 'Bâle-Mulhouse', lat: 47.5900, lng: 7.5289 },
  { icao: 'LFSH', name: 'Haguenau', lat: 48.7947, lng: 7.8172 },
  { icao: 'LFSM', name: 'Montbéliard-Courcelles', lat: 47.4897, lng: 6.7908 },
  { icao: 'LFSP', name: 'Pontarlier', lat: 46.9033, lng: 6.3275 },
  { icao: 'LFSF', name: 'Metz-Nancy-Lorraine', lat: 48.9822, lng: 6.2508 },
  { icao: 'LFSO', name: 'Nancy-Essey', lat: 48.6922, lng: 6.2247 },
  { icao: 'LFQO', name: 'Lille-Lesquin', lat: 50.5636, lng: 3.0897 },
  { icao: 'LFQT', name: 'Merville-Calonne', lat: 50.6181, lng: 2.6428 },
  { icao: 'LFQV', name: 'Charleville-Mézières', lat: 49.7847, lng: 4.6475 },
  { icao: 'LFSD', name: 'Dijon-Bourgogne', lat: 47.2689, lng: 5.0900 },
  // Sud-Ouest
  { icao: 'LFBO', name: 'Toulouse-Blagnac', lat: 43.6293, lng: 1.3638 },
  { icao: 'LFBD', name: 'Bordeaux-Mérignac', lat: 44.8283, lng: -0.7156 },
  { icao: 'LFBH', name: 'La Rochelle-Île de Ré', lat: 46.1792, lng: -1.1953 },
  { icao: 'LFBZ', name: 'Biarritz-Pays Basque', lat: 43.4686, lng: -1.5231 },
  { icao: 'LFBT', name: 'Tarbes-Lourdes-Pyrénées', lat: 43.1786, lng: -0.0064 },
  { icao: 'LFBS', name: 'Biscarrosse-Parentis', lat: 44.3594, lng: -1.1322 },
  { icao: 'LFCL', name: 'Toulouse-Lasbordes', lat: 43.5858, lng: 1.4992 },
  // Sud-Est
  { icao: 'LFML', name: 'Marseille-Provence', lat: 43.4394, lng: 5.2214 },
  { icao: 'LFMN', name: "Nice Côte d'Azur", lat: 43.6584, lng: 7.2159 },
  { icao: 'LFLL', name: 'Lyon Saint-Exupéry', lat: 45.7256, lng: 5.0810 },
  { icao: 'LFLY', name: 'Lyon-Bron', lat: 45.7281, lng: 4.9428 },
  { icao: 'LFLS', name: 'Grenoble-Isère', lat: 45.3628, lng: 5.3294 },
  { icao: 'LFLU', name: 'Valence-Chabeuil', lat: 44.9217, lng: 4.9697 },
  { icao: 'LFLP', name: 'Annecy-Haute-Savoie', lat: 45.9294, lng: 6.1028 },
  { icao: 'LFLB', name: 'Chambéry-Savoie', lat: 45.6381, lng: 5.8803 },
  { icao: 'LFLC', name: 'Clermont-Ferrand Aulnat', lat: 45.7867, lng: 3.1692 },
  { icao: 'LFLH', name: 'Chalon-Champforgeuil', lat: 46.8261, lng: 4.8186 },
  { icao: 'LFLI', name: 'Annemasse', lat: 46.1920, lng: 6.2686 },
  { icao: 'LFLN', name: 'Saint-Yan', lat: 46.4125, lng: 4.0131 },
  { icao: 'LFLO', name: 'Roanne-Renaison', lat: 46.0583, lng: 4.0014 },
  { icao: 'LFLM', name: 'Mâcon-Charnay', lat: 46.2953, lng: 4.7958 },
  { icao: 'LFMA', name: 'Aix-en-Provence', lat: 43.5056, lng: 5.3678 },
  { icao: 'LFMD', name: 'Cannes-Mandelieu', lat: 43.5422, lng: 6.9536 },
  { icao: 'LFMC', name: 'Le Luc-Le Cannet', lat: 43.3847, lng: 6.3878 },
  { icao: 'LFMO', name: 'Orange-Caritat', lat: 44.1403, lng: 4.8667 },
  { icao: 'LFMP', name: 'Perpignan-Rivesaltes', lat: 42.7406, lng: 2.8703 },
  { icao: 'LFMT', name: 'Montpellier-Méditerranée', lat: 43.5762, lng: 3.9631 },
  { icao: 'LFMV', name: 'Avignon-Provence', lat: 43.9073, lng: 4.9019 },
  { icao: 'LFMK', name: 'Carcassonne-Salvaza', lat: 43.2158, lng: 2.3061 },
  { icao: 'LFMU', name: "Béziers-Cap d'Agde", lat: 43.3236, lng: 3.3539 },
  { icao: 'LFMS', name: 'Alès-Deaux', lat: 44.0603, lng: 4.1619 },
  // Belgique
  { icao: 'EBBR', name: 'Brussels National', lat: 50.9014, lng: 4.4844 },
  { icao: 'EBCI', name: 'Charleroi Brussels South', lat: 50.4592, lng: 4.4528 },
  { icao: 'EBLG', name: 'Liège', lat: 50.6374, lng: 5.4433 },
  { icao: 'EBAW', name: 'Antwerp Deurne', lat: 51.1894, lng: 4.4603 },
  { icao: 'EBOS', name: 'Ostend-Bruges', lat: 51.1989, lng: 2.8622 },
  // Suisse
  { icao: 'LSZH', name: 'Zürich', lat: 47.4581, lng: 8.5481 },
  { icao: 'LSGG', name: 'Geneva', lat: 46.2381, lng: 6.1089 },
  { icao: 'LSZB', name: 'Bern-Belp', lat: 46.9144, lng: 7.4972 },
  { icao: 'LSGC', name: 'Les Eplatures', lat: 47.0836, lng: 6.7917 },
  // Luxembourg
  { icao: 'ELLX', name: 'Luxembourg Findel', lat: 49.6233, lng: 6.2044 },
  // Divers
  { icao: 'LFGH', name: 'La Charité-sur-Loire', lat: 47.1753, lng: 3.0294 },
]

/**
 * Find the ICAO code for an aerodrome at the given coordinates.
 * Returns null if no aerodrome is found within thresholdNm nautical miles.
 */
export function findIcaoByCoords(
  lat: number,
  lng: number,
  thresholdNm = 2,
): string | null {
  let best: AerodromeEntry | null = null
  let bestDist = thresholdNm

  for (const a of AERODROMES) {
    const d = distanceNm(lat, lng, a.lat, a.lng)
    if (d < bestDist) {
      bestDist = d
      best = a
    }
  }
  return best?.icao ?? null
}

/**
 * Get aerodrome entry by ICAO code.
 */
export function getAerodrome(icao: string): AerodromeEntry | undefined {
  return AERODROMES.find(a => a.icao === icao)
}
