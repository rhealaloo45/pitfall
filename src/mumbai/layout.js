/* Mumbai GP — fictionalised, compressed layout of the city (metres).
   +X east, +Z south (so north is −Z, matching the minimap's "up").
   Geography follows the real arrangement — Colaba/Gateway in the south-east,
   Marine Drive curving round Back Bay, Malabar & Cumballa Hill, Worli,
   the Sea Link across Mahim Bay to Bandra, BKC to the east, Sion inland and
   the Eastern Freeway along the docks — but distances are squeezed ~6×. */

/* Land outline (everything outside is the Arabian Sea / harbour). */
export const COAST = [
  [640, 1320], [760, 1240], [860, 1150], [935, 1065],
  [965, 960], [995, 820], [1060, 700], [1080, 400], [1100, 0], [1120, -400], [1100, -800], [1150, -1200], [1160, -2140],
  [-445, -2140],
  [-470, -1880], [-520, -1770], [-560, -1660], [-595, -1575], [-565, -1515],
  [-480, -1465], [-380, -1425], [-280, -1380], [-225, -1342],
  [-190, -1290], [-182, -1200], [-200, -1100], [-240, -1000], [-300, -930], [-360, -880], [-385, -830],
  [-372, -760], [-352, -620], [-345, -480], [-336, -360], [-350, -250], [-382, -120],
  [-432, 0], [-500, 110], [-560, 220], [-582, 300], [-530, 352],
  [-430, 362], [-330, 344], [-240, 330],
  [-130, 368], [-20, 438], [80, 538], [150, 648], [195, 768], [215, 880], [220, 992],
  [280, 1062], [380, 1112], [480, 1182], [560, 1262],
];

/* Mithi river (water channel inside the land): centreline + half-widths. */
export const RIVER = { pts: [[-215, -1335], [-120, -1365], [0, -1392], [200, -1420], [380, -1442], [520, -1480], [640, -1520]], hw: [34, 30, 26, 22, 18, 14, 9] };

/* Hills — smooth bumps added to the land height. */
export const HILLS = [
  { x: -475, z: 160, r: 230, h: 30 },   // Malabar Hill
  { x: -275, z: -70, r: 230, h: 23 },   // Cumballa Hill (Peddar Road crosses it)
  { x: -330, z: -800, r: 120, h: 5 },   // Worli headland
  { x: -520, z: -1600, r: 140, h: 9 },  // Bandra headland (fort)
  { x: -330, z: -1760, r: 220, h: 7 },  // Pali Hill, Bandra
  { x: 690, z: -960, r: 130, h: 8 },    // Sion hillock
];

/* Road nodes (junctions / ends). Marine Drive nodes are computed from the shoreline. */
export const NODES = {
  gateway: [884, 1036], colaba: [700, 1012], churchgate: [360, 800], flora: [622, 790], fwySouth: [872, 758],
  kemps: [-276, 236], hajiAli: [-300, -330], worli: [-290, -760], toll: [-318, -850],
  bandraLanding: [-468, -1532], bandra: [-360, -1622], bandstandN: [-398, -1832],
  bkcW: [80, -1622], bkcE: [420, -1602], sion: [790, -1090], kjsit: [930, -1172],
  dadar: [100, -1000], opera: [122, 312], lowerParel: [64, -520],
};

/* Road classes: half-width of the carriageway, sidewalk width, lanes per direction, median. */
export const ROAD_TYPES = {
  boulevard: { hw: 12.5, sidewalk: 6, lanes: 3, median: 2.6, lamp: 'necklace', speed: 'urban' },
  arterial: { hw: 9.5, sidewalk: 4, lanes: 2, median: 1.4, lamp: 'pole' },
  street: { hw: 5.5, sidewalk: 3, lanes: 1, median: 0, lamp: 'pole' },
  freeway: { hw: 9.5, sidewalk: 0, lanes: 2, median: 0.9, barrier: true, lamp: 'freeway' },
  sealink: { hw: 12, sidewalk: 0, lanes: 3, median: 1.6, barrier: true, lamp: 'sealink' },
  bridge: { hw: 9.5, sidewalk: 1.2, lanes: 2, median: 1.4, barrier: true, lamp: 'pole' },
};

/* Roads. `shore` roads are generated as an inland offset of a coastline slice.
   deck: elevated profile {h: height above the end nodes, ramp: length of each ramp (m)}. */
export const ROADS = [
  { id: 'marineDrive', name: 'Marine Drive', type: 'boulevard', shore: { from: [-240, 330], to: [220, 992], offset: 27 }, split: { churchgateMD: 800 }, ends: ['chowpatty', 'nariman'] },
  { id: 'vnr1', name: 'Veer Nariman Road', type: 'arterial', from: 'churchgateMD', to: 'churchgate', pts: [] },
  { id: 'vnr2', name: 'Veer Nariman Road', type: 'arterial', from: 'churchgate', to: 'flora', pts: [[490, 806]] },
  { id: 'cuffe', name: 'Cuffe Parade Road', type: 'arterial', from: 'nariman', to: 'colaba', pts: [[350, 1034], [520, 1046]] },
  { id: 'causeway', name: 'Colaba Causeway', type: 'arterial', from: 'flora', to: 'colaba', pts: [[650, 900]] },
  { id: 'apollo', name: 'Apollo Bunder', type: 'arterial', from: 'colaba', to: 'gateway', pts: [[800, 1032]] },
  { id: 'fortLink', name: 'P. D\'Mello Road', type: 'arterial', from: 'flora', to: 'fwySouth', pts: [[750, 772]] },
  { id: 'freeway', name: 'Eastern Freeway', type: 'freeway', from: 'fwySouth', to: 'sion', pts: [[950, 640], [1010, 380], [1030, 0], [1012, -480], [905, -900]], deck: { h: 11, ramp: 170 } },
  { id: 'chowKemps', name: 'Babulnath Road', type: 'street', from: 'chowpatty', to: 'kemps', pts: [] },
  { id: 'girgaon', name: 'Girgaon Road', type: 'street', from: 'chowpatty', to: 'opera', pts: [[-60, 330]] },
  { id: 'girgaon2', name: 'Girgaon Road', type: 'street', from: 'opera', to: 'flora', pts: [[330, 480], [480, 650]] },
  { id: 'peddar', name: 'Peddar Road', type: 'arterial', from: 'kemps', to: 'hajiAli', pts: [[-262, 100], [-250, -40], [-252, -180]] },
  { id: 'worliSeaFace', name: 'Worli Sea Face', type: 'arterial', from: 'hajiAli', to: 'worli', pts: [[-306, -480], [-302, -620]] },
  { id: 'toll', name: 'Worli Toll Plaza', type: 'arterial', from: 'worli', to: 'toll', pts: [] },
  { id: 'seaLink', name: 'Bandra–Worli Sea Link', type: 'sealink', from: 'toll', to: 'bandraLanding', pts: [[-362, -935], [-412, -1085], [-456, -1250], [-482, -1400]], deck: { h: 17, ramp: 235 } },
  { id: 'landing', name: 'Bandra Reclamation', type: 'arterial', from: 'bandraLanding', to: 'bandra', pts: [[-420, -1584]] },
  { id: 'bandstand', name: 'Bandstand Promenade', type: 'street', from: 'bandraLanding', to: 'bandstandN', pts: [[-522, -1586], [-536, -1662], [-506, -1752], [-460, -1822]] },
  { id: 'paliHill', name: 'Pali Hill Road', type: 'street', from: 'bandstandN', to: 'bandra', pts: [[-372, -1742]] },
  { id: 'bandraBkc', name: 'BKC Link Road', type: 'arterial', from: 'bandra', to: 'bkcW', pts: [[-200, -1642], [-60, -1632]] },
  { id: 'bkcAve', name: 'BKC Avenue', type: 'boulevard', from: 'bkcW', to: 'bkcE', pts: [[250, -1616]] },
  { id: 'bkcSion', name: 'Sion–BKC Connector', type: 'bridge', from: 'bkcE', to: 'sion', pts: [[560, -1468], [680, -1262]], deck: { h: 7, ramp: 110 } },
  { id: 'kjsitRd', name: 'Somaiya Ayurvihar Road', type: 'street', from: 'sion', to: 'kjsit', pts: [[862, -1132]] },
  { id: 'hajiLp', name: 'Mahalaxmi Road', type: 'arterial', from: 'hajiAli', to: 'lowerParel', pts: [[-120, -420]] },
  { id: 'central', name: 'Tardeo Road', type: 'arterial', from: 'opera', to: 'lowerParel', pts: [[170, 100], [172, -250]] },
  { id: 'lpDadar', name: 'Senapati Bapat Marg', type: 'arterial', from: 'lowerParel', to: 'dadar', pts: [[96, -760]] },
  { id: 'worliDadar', name: 'Worli Naka Road', type: 'arterial', from: 'worli', to: 'dadar', pts: [[-150, -862]] },
  { id: 'dadarSion', name: 'Sion Road', type: 'arterial', from: 'dadar', to: 'sion', pts: [[300, -1050], [550, -1082]] },
];

/* Districts drive building style (nearest centre wins). h = floors range. */
export const DISTRICTS = [
  { id: 'colaba', x: 640, z: 1150, styles: ['heritage', 'deco', 'mid'], h: [3, 8], tree: 0.3 },
  { id: 'fort', x: 560, z: 860, styles: ['heritage', 'heritage', 'mid'], h: [3, 7], tree: 0.35 },
  { id: 'nariman', x: 330, z: 1040, styles: ['office', 'tower', 'glass'], h: [16, 30], tree: 0.2 },
  { id: 'churchgate', x: 380, z: 640, styles: ['deco', 'mid', 'heritage'], h: [5, 11], tree: 0.4 },
  { id: 'girgaon', x: 120, z: 420, styles: ['mid', 'chawl', 'mid'], h: [4, 9], tree: 0.3 },
  { id: 'malabar', x: -440, z: 160, styles: ['tower', 'tower', 'bungalow'], h: [14, 34], tree: 0.9 },
  { id: 'cumballa', x: -200, z: -120, styles: ['tower', 'mid', 'tower'], h: [10, 28], tree: 0.8 },
  { id: 'tardeo', x: 160, z: -120, styles: ['mid', 'tower', 'chawl'], h: [6, 22], tree: 0.35 },
  { id: 'worli', x: -180, z: -640, styles: ['tower', 'glass', 'tower'], h: [24, 56], tree: 0.4 },
  { id: 'lowerParel', x: 200, z: -560, styles: ['glass', 'office', 'industrial'], h: [10, 44], tree: 0.3 },
  { id: 'dadar', x: 150, z: -960, styles: ['mid', 'chawl', 'mid'], h: [4, 12], tree: 0.4 },
  { id: 'bandra', x: -400, z: -1700, styles: ['bungalow', 'mid', 'bungalow'], h: [2, 10], tree: 1.0 },
  { id: 'bkc', x: 250, z: -1690, styles: ['glass', 'glass', 'office'], h: [10, 34], tree: 0.5 },
  { id: 'sion', x: 640, z: -1060, styles: ['mid', 'industrial', 'mid'], h: [4, 10], tree: 0.45 },
  { id: 'kurla', x: 760, z: -1700, styles: ['mid', 'industrial', 'tower'], h: [5, 18], tree: 0.4 },
  { id: 'docks', x: 1050, z: 0, styles: ['warehouse'], h: [1, 2], tree: 0.05 },
  { id: 'byculla', x: 600, z: 200, styles: ['mid', 'industrial', 'chawl'], h: [4, 12], tree: 0.35 },
  { id: 'wadala', x: 700, z: -500, styles: ['mid', 'tower', 'industrial'], h: [6, 26], tree: 0.35 },
];

/* Open spaces (no buildings): maidans and gardens. */
export const PARKS = [
  { id: 'oval', name: 'Oval Maidan', x: 470, z: 690, rx: 70, rz: 95, rot: 0.1, kind: 'maidan' },
  { id: 'azad', name: 'Azad Maidan', x: 700, z: 640, rx: 60, rz: 70, rot: 0.3, kind: 'maidan' },
  { id: 'hanging', name: 'Hanging Gardens', x: -470, z: 190, rx: 55, rz: 50, rot: 0, kind: 'garden' },
  { id: 'shivaji', name: 'Shivaji Park', x: -60, z: -1120, rx: 70, rz: 60, rot: 0, kind: 'maidan' },
  { id: 'joggers', name: 'Joggers Park', x: -520, z: -1720, rx: 30, rz: 45, rot: 0.4, kind: 'garden' },
  { id: 'mahim', name: 'Mahim Nature Park', x: 260, z: -1330, rx: 70, rz: 40, rot: -0.15, kind: 'garden' },
  { id: 'ayurvihar', name: 'Somaiya Ayurvihar grounds', x: 1010, z: -1260, rx: 60, rz: 50, rot: 0, kind: 'garden' },
];

/* Places with a reserved footprint (landmarks build here; generic buildings stay clear). */
export const RESERVED = [
  { x: 905, z: 1050, r: 75 },     // Gateway of India plaza
  { x: 835, z: 1100, r: 55 },     // Taj hotel
  { x: 300, z: 755, r: 38 },      // K. C. College
  { x: -212, z: -48, r: 52 },     // Villa Theresa High School
  { x: 945, z: -1210, r: 80 },    // KJSIT campus
  { x: -548, z: -1570, r: 40 },   // Bandra Fort
  { x: 260, z: -1700, r: 50 },    // BKC plaza
  { x: -250, z: 360, r: 40 },     // Chowpatty beach
];

/* Portfolio destinations & discoveries. kind: 'chapter' (portfolio) | 'discovery' (landmark) */
export const PLACES = [
  { id: 'gateway', kind: 'discovery', name: 'Gateway of India', x: 902, z: 1046, r: 26, icon: 'landmark' },
  { id: 'pitwall', kind: 'chapter', name: 'Pit Wall — Career HQ', short: 'Career HQ', x: 852, z: 1012, r: 18, icon: 'finish' },
  { id: 'kccollege', kind: 'chapter', name: 'K. C. College, Churchgate', short: 'K. C. College', x: 300, z: 785, r: 18, icon: 'school' },
  { id: 'marineDrive', kind: 'discovery', name: 'Marine Drive — Queen\'s Necklace', x: 132, z: 586, r: 30, icon: 'landmark' },
  { id: 'chowpatty', kind: 'discovery', name: 'Girgaum Chowpatty', x: -236, z: 352, r: 28, icon: 'landmark' },
  { id: 'villaTheresa', kind: 'discovery', name: 'Villa Theresa High School', short: 'Villa Theresa', x: -228, z: -48, r: 18, icon: 'school' },
  { id: 'seaLink', kind: 'discovery', name: 'Bandra–Worli Sea Link', x: -420, z: -1110, r: 30, icon: 'landmark', elevated: true },
  { id: 'bandraFort', kind: 'discovery', name: 'Bandra Fort', x: -528, z: -1578, r: 24, icon: 'landmark' },
  { id: 'bkc', kind: 'discovery', name: 'Bandra Kurla Complex', x: 250, z: -1640, r: 30, icon: 'landmark' },
  { id: 'kjsit', kind: 'chapter', name: 'K. J. Somaiya Institute of Technology', short: 'KJSIT', x: 925, z: -1185, r: 20, icon: 'school', final: true },
];

/* Guided Mumbai GP route: an ordered list of waypoints (place ids or raw points).
   The Pit Wall (career) briefing opens on the grid before the lights, so the race
   itself is a short sprint (~4 km): Marine Drive, Churchgate, then the Eastern
   Freeway to the finish at KJSIT. Everything else stays open in free roam. */
export const GP_ROUTE = ['start', 'marineDrive', 'kccollege', 'kjsit'];

export const SPAWN = { x: 846, z: 1035, heading: -Math.PI / 2 - 0.05 };   // Apollo Bunder grid, facing west under the start gantry
export const WORLD_BOUNDS = { minX: -760, maxX: 1300, minZ: -2100, maxZ: 1420 };
export const SEA_LEVEL = 0;

/* Paved / flattened areas (landmark forecourts). surface: paved | sand | dirt */
export const PLAZAS = [
  { id: 'gatewayPlaza', x: 902, z: 1046, r: 58, surface: 'paved' },
  { id: 'bkcPlaza', x: 262, z: -1700, r: 46, surface: 'paved' },
  { id: 'kjsitForecourt', x: 948, z: -1206, r: 52, surface: 'paved' },
  { id: 'vtCourt', x: -200, z: -48, r: 42, surface: 'paved' },
  { id: 'kcCourt', x: 300, z: 752, r: 30, surface: 'paved' },
  { id: 'fortGround', x: -548, z: -1572, r: 36, surface: 'dirt' },
  { id: 'tollPlaza', x: -312, z: -836, r: 30, surface: 'paved' },
];
