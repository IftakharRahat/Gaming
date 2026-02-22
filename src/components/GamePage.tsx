import { AnimatePresence, motion } from 'framer-motion';
import React, { useEffect, useMemo, useRef, useState } from 'react';

const MAX_FRAME_WIDTH = 420;
const DEBUG = false;

const ARTBOARD = { width: 402, height: 735 } as const;

const BET_SECONDS = 20;
const DRAW_SECONDS = 8;
const SHOW_SECONDS = 5;
const PRE_DRAW_MS = 2000;

const GAME_ON_MS = 1200;
const ADVANCE_UNLOCK_BET = 500000;

const DEFAULT_CHIP_VALUES = [10, 100, 500, 1000, 5000] as const;

/* Map chip value → local image path */
const CHIP_IMAGE_MAP: Record<number, string> = {
  10: '/image2/chip_10.png',
  100: '/image2/chip_100.png',
  500: '/image2/chip_500_orange.png',
  1000: '/image2/chip_1k.png',
  5000: '/image2/chip_5k.png',
  10000: '/image2/chip_10k.png',
};

/* Map box value → local chest image */
const BOX_VALUE_TO_CHEST: Record<number, string> = {
  10: '/image2/chest_10k.png',
  20: '/image2/chest_50k.png',
  30: '/image2/chest_100k.png',
  40: '/image2/chest_500k.png',
  50: '/image2/chest_1m.png',
};

/* Format box value label */
const BOX_LABELS: Record<number, string> = {
  10: '10K',
  20: '50K',
  30: '100K',
  40: '500K',
  50: '1M',
};
type RoundType = 'NORMAL' | 'JACKPOT';

const JACKPOT_EVERY_N_NORMAL_ROUNDS = 3;

// placeholder until API
const JACKPOT_BONUS_AMOUNT = 500000;
/* ── API config ── */
const API_BASE = ''; // proxied via vite.config.ts
const API_BODY = JSON.stringify({ regisation: '3' });

type ApiElement = {
  id: number;
  element_name: string;
  element_icon: string;
  paytable: number;
  win_weights: number;
};

type ApiButton = {
  source_image: string;
  source: number;
};

type ApiBox = {
  box_image: string;
  box_image_close: string;
  box_image_open: string;
  box_source: number;
  box_win_weights?: number;
};

type ApiTrophy = {
  icon: string;
};

type ApiWinElement = {
  element__element_name: string;
  element__element_icon: string;
};

type ApiCoin = { icon: string };
type ApiGameIcon = { icon: string };
type ApiTodayWin = { today_win: { total_balance: number | null } };
type ApiJackpot = { Jackpot: number };
type ApiSessionTime = { started_at: string; next_run_time: string };
type ApiTopWinner = { name?: string; amount?: number };
type ApiTopWinnerResponse = { mrs__player_id__player_name: string; mrs__player_id__player_pic?: string; last_balance: number }[];
type ApiMaxFruits = { max_fruits?: number;[key: string]: unknown };
type ApiPrizeRank = { rank: string; prize: number };
type ApiPrizeDistribution = {
  general: { title: string; ranks: ApiPrizeRank[] };
  advance: { title: string; ranks: ApiPrizeRank[] };
};
type ApiGameMode = { advance: boolean; remanning_values: number };
type ApiRankRow = {
  mrs__player_id__player_name: string;
  mrs__player_id__player_pic?: string;
  last_balance: number;
};
type ApiRankToday = { data: ApiRankRow[]; time?: string };
type ApiRankYesterday = { data: ApiRankRow[]; time?: string };
type ApiGameRule = { general: { title: string; rules: string[]; version: string } };
type ApiJackpotDetails = { jackpot_total: number; awards: { round: number; win: number; time: string }[] };
type ApiGameMetadata = { game__name: string; game__icon: string; game_icon: string }[];
type ApiPlayerRecords = { data: { round?: number; element__element_name?: string; bet?: number; win?: number; time?: string }[] };

/* Map API element_name → local ItemId */
const API_NAME_TO_ID: Record<string, ItemId> = {
  Honey: 'honey',
  Tomato: 'tomato',
  lemon: 'lemon',
  Milk: 'milk',
  pumpkin: 'pumpkin',
  Blur: 'zucchini',
  Coke: 'cola',
  Water: 'water',
};

/* Reverse map: local ItemId → API element_name */
const ID_TO_API_NAME: Record<ItemId, string> = {
  honey: 'Honey',
  tomato: 'Tomato',
  lemon: 'lemon',
  milk: 'Milk',
  pumpkin: 'pumpkin',
  zucchini: 'Blur',
  cola: 'Coke',
  water: 'Water',
};

const PLAYER_ID = 1065465; // TODO: make dynamic per user

async function apiFetch<T>(path: string, retries = 2, customBody?: string): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: customBody ?? API_BODY,
    });
    if (res.ok) return res.json();
    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, 300));
      continue;
    }
    throw new Error(`API ${path} failed: ${res.status}`);
  }
  throw new Error(`API ${path} failed after retries`);
}

/* Weighted random pick */
function weightedRandomPick(items: ItemSpec[], weights: Record<ItemId, number>): ItemId {
  const totalWeight = items.reduce((sum, item) => sum + (weights[item.id] || 1), 0);
  let r = Math.random() * totalWeight;
  for (const item of items) {
    r -= weights[item.id] || 1;
    if (r <= 0) return item.id;
  }
  return items[items.length - 1].id;
}
function pickJackpotGroup(): ItemId[] {
  // placeholder: 50/50
  return Math.random() < 0.5 ? VEG_ITEMS : DRINK_ITEMS;
}

function computeJackpotWin(params: {
  jackpotItems: ItemId[];
  bets: BetsState;
  itemMultiplier: Record<ItemId, number>;
  jackpotBonus: number;
}) {
  const { jackpotItems, bets, itemMultiplier, jackpotBonus } = params;

  const matchedItems = jackpotItems.filter((id) => (bets[id] ?? 0) > 0);
  const matchedCount = matchedItems.length;

  const baseWin = matchedItems.reduce((sum, id) => {
    const bet = bets[id] ?? 0;
    return sum + bet * (itemMultiplier[id] ?? 1);
  }, 0);

  // exact 4 means: user bet on all 4 and bet NOTHING outside them
  const hasAll4 = matchedCount === 4;
  const hasOutsideBet = (Object.keys(bets) as ItemId[]).some(
    (id) => !jackpotItems.includes(id) && (bets[id] ?? 0) > 0
  );
  const isExact4 = hasAll4 && !hasOutsideBet;

  const bonus = isExact4 ? jackpotBonus : Math.round(jackpotBonus * (matchedCount / 4));
  const totalWin = matchedCount > 0 ? baseWin + bonus : 0;

  return { totalWin, matchedItems, matchedCount, isExact4, bonus, baseWin };
}
type ItemId = 'honey' | 'tomato' | 'lemon' | 'milk' | 'pumpkin' | 'zucchini' | 'cola' | 'water';
type Phase = 'BETTING' | 'DRAWING' | 'SHOWTIME';
type Mode = 'BASIC' | 'ADVANCE';
type ModalType = 'NONE' | 'RULE' | 'RECORDS' | 'PRIZE' | 'RANK' | 'ADVANCED';
type RankTab = 'TODAY' | 'YESTERDAY';
type ResultKind = 'WIN' | 'LOSE' | 'NOBET';

const POINTER_BASE_POSITION = { left: 247, top: 115 } as const;
const POINTER_SIZE = { width: 125, height: 125 } as const;
const POINTER_HOTSPOT = { x: 25, y: 35 } as const;
const POINTER_TOUR_ORDER: ItemId[] = ['lemon', 'pumpkin', 'zucchini', 'water', 'cola', 'milk', 'honey', 'tomato'];
const DRAW_HIGHLIGHT_ORDER: ItemId[] = ['honey', 'tomato', 'lemon', 'pumpkin', 'zucchini', 'water', 'cola', 'milk'];

type ScaledArtboardProps = {
  width: number;
  height: number;
  metricsMode: boolean;
  children: React.ReactNode;
};

type BadgeSpec = {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  fontSize: number;
  letterSpacing: string;
};

type ItemSpec = {
  id: ItemId;
  src: string;
  left: number;
  top: number;
  width: number;
  height: number;
  rotate?: number;
  badge: BadgeSpec;
  betLabel?: { left: number; top: number };
};

type ChipSpec = {
  src: string;
  left: number;
  top: number;
  width: number;
  height: number;
  shadow?: boolean;
};

type ResultPos = {
  left: number;
  top: number;
  width: number;
  height: number;
  rotate?: number;
};

type BetsState = Record<ItemId, number>;

type PendingWin = {
  itemId: ItemId;
  amount: number;
  hadAnyBet: boolean;
  totalBet: number;
};

type GameRecord = {
  round: number;
  at: string;
  winner: ItemId[]; // ✅
  selected: ItemId | 'none';
  selectedAmount: number;
  win: number;
  balanceBefore: number;
  balanceAfter: number;
};

type ResultBoardRow = {
  name: string;
  amount: number;
  pic?: string;
};

type FloatingBetChip = {
  id: number;
  left: number;
  top: number;
  endLeft: number;
  endTop: number;
  src: string;
};


type FireworkDot = {
  id: string;
  cx: number;
  cy: number;
  dx: number;
  dy: number;
  size: number;
  delay: number;
};

type FireworkGroup = {
  id: string;
  dots: FireworkDot[];
  flashX: number;
  flashY: number;
  flashDelay: number;
};

const buildFireworkGroups = (): FireworkGroup[] => {
  const origins = [
    { x: 80, y: 120 },
    { x: 320, y: 100 },
    { x: 200, y: 80 },
    { x: 60, y: 250 },
    { x: 340, y: 240 },
    { x: 150, y: 170 },
    { x: 280, y: 180 },
    { x: 100, y: 50 },
    { x: 300, y: 60 },
  ];

  const groups: FireworkGroup[] = [];
  const waves = 3;

  for (let wave = 0; wave < waves; wave++) {
    const waveDelay = wave * 2.2;
    origins.forEach((origin, gi) => {
      const dotCount = 22 + Math.floor(Math.random() * 12);
      const burstDelay = waveDelay + gi * 0.25;
      const dots: FireworkDot[] = [];

      for (let i = 0; i < dotCount; i++) {
        const angle = (i / dotCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
        const dist = 35 + Math.random() * 65;
        dots.push({
          id: `fw-${wave}-${gi}-${i}`,
          cx: origin.x + (Math.random() - 0.5) * 30 * wave,
          cy: origin.y + (Math.random() - 0.5) * 30 * wave,
          dx: Math.cos(angle) * dist,
          dy: Math.sin(angle) * dist,
          size: 2.5 + Math.random() * 4,
          delay: burstDelay + Math.random() * 0.08,
        });
      }

      groups.push({
        id: `fwg-${wave}-${gi}`,
        dots,
        flashX: origin.x + (Math.random() - 0.5) * 30 * wave,
        flashY: origin.y + (Math.random() - 0.5) * 30 * wave,
        flashDelay: burstDelay,
      });
    });
  }

  return groups;
};

type FireworksOverlayProps = { seed: number };

const FireworksOverlay = ({ seed }: FireworksOverlayProps) => {
  const groups = useMemo(() => buildFireworkGroups(), [seed]);

  return (
    <motion.div
      className="pointer-events-none absolute inset-0 z-[900]"
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      {groups.map((group) => (
        <React.Fragment key={group.id}>
          {/* Bright center flash */}
          <motion.div
            className="absolute rounded-full"
            style={{
              left: group.flashX - 8,
              top: group.flashY - 8,
              width: 16,
              height: 16,
              background: '#fff',
              boxShadow: '0 0 20px 10px rgba(255,255,255,0.9), 0 0 50px 20px rgba(255,255,255,0.5), 0 0 80px 35px rgba(220,200,255,0.3)',
            }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: [0, 3, 0], opacity: [0, 1, 0] }}
            transition={{ duration: 0.6, delay: group.flashDelay, ease: 'easeOut' }}
          />

          {/* Exploding dots */}
          {group.dots.map((dot) => (
            <motion.span
              key={dot.id}
              className="absolute rounded-full"
              style={{
                left: dot.cx,
                top: dot.cy,
                width: dot.size,
                height: dot.size,
                background: '#fff',
                boxShadow: '0 0 6px 3px rgba(255,255,255,0.9), 0 0 14px 6px rgba(255,255,255,0.5), 0 0 24px 10px rgba(220,210,255,0.25)',
              }}
              initial={{ opacity: 0, x: 0, y: 0, scale: 0.3 }}
              animate={{
                opacity: [0, 1, 1, 0.6, 0],
                x: [0, dot.dx * 0.4, dot.dx],
                y: [0, dot.dy * 0.4, dot.dy + 15],
                scale: [0.3, 1.3, 0.4],
              }}
              transition={{
                duration: 1.1,
                delay: dot.delay,
                ease: [0.2, 0.8, 0.3, 1],
              }}
            />
          ))}
        </React.Fragment>
      ))}
    </motion.div>
  );
};


const debugClass = (on: boolean) => (on ? 'outline outline-1 outline-fuchsia-500/55' : '');
const formatNum = (n: number) => n.toLocaleString('en-US');
const formatK = (n: number) => {
  if (n >= 1000) {
    const v = n / 1000;
    return Number.isInteger(v) ? `${v}K` : `${v.toFixed(1)}K`;
  }
  return `${n}`;
};

const formatRoundTime = (date: Date) => {
  const d = `${date.getDate()}`.padStart(2, '0');
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const y = date.getFullYear();
  const hh = `${date.getHours()}`.padStart(2, '0');
  const mm = `${date.getMinutes()}`.padStart(2, '0');
  const ss = `${date.getSeconds()}`.padStart(2, '0');
  return `${d}/${m}/${y} ${hh}:${mm}:${ss}`;
};

const buildEmptyBets = (): BetsState => ({
  honey: 0,
  tomato: 0,
  lemon: 0,
  milk: 0,
  pumpkin: 0,
  zucchini: 0,
  cola: 0,
  water: 0,
});

const ScaledArtboard = ({ width, height, metricsMode, children }: ScaledArtboardProps) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const node = hostRef.current;
    if (!node) return;

    const update = () => {
      const w = node.clientWidth || window.innerWidth;
      const h = Math.min(node.clientHeight || window.innerHeight, window.innerHeight);
      setViewport({ width: w, height: h });
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(node);
    window.addEventListener('resize', update);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  const { scale, scaledWidth, scaledHeight } = useMemo(() => {
    if (viewport.width === 0 || viewport.height === 0) {
      return { scale: 1, scaledWidth: width, scaledHeight: height };
    }

    const isMobile = viewport.width <= 480;
    const pad = isMobile ? 0 : 16;
    const maxW = isMobile ? viewport.width : MAX_FRAME_WIDTH;
    const availableWidth = Math.min(maxW, Math.max(0, viewport.width - pad));
    const availableHeight = Math.max(0, viewport.height - pad);
    const s = Math.min(availableWidth / width, availableHeight / height);

    return { scale: s, scaledWidth: width * s, scaledHeight: height * s };
  }, [viewport.width, viewport.height, width, height]);

  return (
    <div ref={hostRef} className="h-full w-full overflow-hidden bg-[#0f172a]" style={{ minHeight: '100dvh', height: '100dvh' }}>
      <div
        className="flex w-full justify-center"
        style={{
          padding: viewport.width <= 480 ? 0 : '8px',
          alignItems: viewport.width <= 480 ? 'flex-start' : 'center',
          minHeight: '100%',
          height: '100%',
        }}
      >
        <div style={{ width: scaledWidth, height: scaledHeight }} className="relative shrink-0">
          <div
            style={{
              width,
              height,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
            className={`absolute left-0 top-0 overflow-hidden ${viewport.width <= 480 ? '' : 'rounded-[26px]'} border border-white/15 shadow-[0_25px_60px_rgba(0,0,0,0.45)] ${debugClass(
              DEBUG
            )}`}
          >
            {children}
          </div>

          {metricsMode ? (
            <div className="pointer-events-none absolute left-2 top-2 z-[200] rounded bg-black/65 px-2 py-1 text-[11px] leading-tight text-white">
              <div>{`viewport: ${viewport.width} x ${viewport.height}`}</div>
              <div>{`artboard: ${width} x ${height}`}</div>
              <div>{`scale: ${scale.toFixed(4)}`}</div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
// --- Tab groups ---
const VEG_ITEMS: ItemId[] = ['tomato', 'lemon', 'pumpkin', 'zucchini'];
const DRINK_ITEMS: ItemId[] = ['milk', 'cola', 'water', 'honey']; // honey treated as "drinks" bucket here

const ITEMS: ItemSpec[] = [
  {
    id: 'honey',
    src: '/image2/honey_jar.png',
    left: 55,
    top: 123,
    width: 67,
    height: 76,
    badge: { text: 'x45', left: 79, top: 188, width: 30, height: 16, fontSize: 12, letterSpacing: '0.08em' },
    betLabel: { left: 90, top: 205 },
  },
  {
    id: 'tomato',
    src: '/image2/tomato.png',
    left: 168,
    top: 113,
    width: 67,
    height: 65,
    badge: { text: 'x5', left: 192, top: 165, width: 20, height: 16, fontSize: 12, letterSpacing: '0.08em' },
    betLabel: { left: 200, top: 178 },
  },
  {
    id: 'lemon',
    src: '/image2/lemon.png',
    left: 277,
    top: 133,
    width: 62,
    height: 69,
    badge: { text: 'x5', left: 302, top: 188, width: 20, height: 16, fontSize: 12, letterSpacing: '0.08em' },
    betLabel: { left: 300, top: 205 },
  },
  {
    id: 'milk',
    src: '/image2/milk_carton.png',
    left: 15,
    top: 231,
    width: 64,
    height: 81,
    badge: { text: 'x25', left: 33, top: 301, width: 31, height: 16, fontSize: 12, letterSpacing: '0.08em' },
    betLabel: { left: 55, top: 314 },
  },
  {
    id: 'pumpkin',
    src: '/image2/pumpkin.png',
    left: 317,
    top: 243,
    width: 71,
    height: 72,
    badge: { text: 'x5', left: 348, top: 304, width: 20, height: 16, fontSize: 12, letterSpacing: '0.08em' },
    betLabel: { left: 345, top: 318 },
  },
  {
    id: 'zucchini',
    src: '/image2/zucchini.png',
    left: 272,
    top: 326,
    width: 68,
    height: 95,
    rotate: 1.79,
    badge: { text: 'x5', left: 309, top: 403, width: 20, height: 16, fontSize: 12, letterSpacing: '0.08em' },
    betLabel: { left: 310, top: 416 },
  },
  {
    id: 'cola',
    src: '/image2/cola_can.png',
    left: 62,
    top: 336,
    width: 59,
    height: 83,
    badge: { text: 'x15', left: 83, top: 403, width: 27, height: 16, fontSize: 12, letterSpacing: '0.08em' },
    betLabel: { left: 90, top: 418 },
  },
  {
    id: 'water',
    src: '/image2/water.png',
    left: 169,
    top: 356,
    width: 67,
    height: 97,
    badge: { text: 'x10', left: 189, top: 433, width: 29, height: 16, fontSize: 12, letterSpacing: '0.08em' },
    betLabel: { left: 200, top: 452 },
  },
];

/* Default multipliers — overridden by API data at runtime */
const DEFAULT_MULTIPLIER: Record<ItemId, number> = {
  honey: 8,
  milk: 7,
  cola: 6,
  water: 5,
  tomato: 4,
  lemon: 1,
  pumpkin: 1,
  zucchini: 2,
};

/* Default win weights — overridden by API data at runtime */
const DEFAULT_WIN_WEIGHTS: Record<ItemId, number> = {
  honey: 8,
  milk: 7,
  cola: 6,
  water: 5,
  tomato: 4,
  lemon: 1,
  pumpkin: 3,
  zucchini: 2,
};

const RESULT_POSITIONS: ResultPos[] = [
  { left: 105, top: 691, width: 26, height: 25 },
  { left: 139, top: 687, width: 22, height: 32 },
  { left: 169, top: 687, width: 27, height: 31 },
  { left: 204, top: 690, width: 26, height: 26 },
  { left: 238, top: 690, width: 26, height: 26 },
  { left: 272, top: 686.34, width: 17.926160604443528, height: 32.193923576762074, rotate: 11.79 },
  { left: 304.13, top: 691, width: 26, height: 25 },
  { left: 338.13, top: 690, width: 26, height: 26 },
];

const INITIAL_RESULT_SRCS = [
  '/image2/tomato.png',
  '/image2/cola_can.png',
  '/image2/honey_jar.png',
  '/image2/pumpkin.png',
  '/image2/pumpkin.png',
  '/image2/zucchini.png',
  '/image2/tomato.png',
  '/image2/pumpkin.png',
];

const CHIPS: ChipSpec[] = [
  { src: '/image2/chip_10.png', left: 29 + 17, top: 526 + 24, width: 54, height: 54 },
  { src: '/image2/chip_100.png', left: 20 + 81, top: 512 + 26, width: 70, height: 70, shadow: true },
  { src: '/image2/chip_500_orange.png', left: 29 + 146, top: 523 + 25, width: 55, height: 54, shadow: true },
  { src: '/image2/chip_1k.png', left: 29 + 211, top: 523 + 24, width: 54, height: 53, shadow: true },
  { src: '/image2/chip_5k.png', left: 29 + 275, top: 523 + 24, width: 54, height: 54, shadow: true },
];

const CHESTS = [
  { src: '/image2/chest_10k.png', left: 71, top: 628, width: 48, height: 48 },
  { src: '/image2/chest_50k.png', left: 137, top: 628, width: 48, height: 48 },
  { src: '/image2/chest_100k.png', left: 203, top: 628, width: 48, height: 48 },
  { src: '/image2/chest_500k.png', left: 269, top: 628, width: 48, height: 48 },
  { src: '/image2/chest_1m.png', left: 335, top: 628, width: 48, height: 48 },
];

const RANK_ROWS_TODAY: { name: string; diamonds: number; pic?: string }[] = [
  { name: 'Faruk', diamonds: 30000 },
  { name: 'Roy', diamonds: 10000 },
  { name: 'Ad Girl', diamonds: 7500 },
  { name: 'Apu', diamonds: 5200 },
  { name: 'Samee', diamonds: 5100 },
  { name: 'Kha', diamonds: 4500 },
  { name: 'Rambo', diamonds: 4300 },
];

const RANK_ROWS_YESTERDAY: { name: string; diamonds: number; pic?: string }[] = [
  { name: 'Apu', diamonds: 29000 },
  { name: 'Roy', diamonds: 12500 },
  { name: 'Faruk', diamonds: 8900 },
  { name: 'Nim', diamonds: 6400 },
  { name: 'Sha', diamonds: 5300 },
  { name: 'Mia', diamonds: 4700 },
  { name: 'Rambo', diamonds: 3900 },
];

const NO_BET_ROWS: ResultBoardRow[] = [
  { name: 'Miller', amount: 129400 },
  { name: 'Aha OG', amount: 194000 },
  { name: 'Steven', amount: 94000 },
];

const rankBgByIndex = (idx: number) => {
  if (idx === 0) return '/image2/leaderboard_rank_1.png';
  if (idx === 1) return '/image2/leaderboard_rank_2.png';
  if (idx === 2) return '/image2/leaderboard_rank_3.png';
  return '/image2/leaderboard_rank_4_plus.png';
};

const podiumBadgeByIndex = (idx: number) => {
  if (idx === 0) return '/image2/first.png';
  if (idx === 1) return '/image2/second.png';
  return '/image2/third.png';
};

type BlumondIconProps = {
  size: number;
  className?: string;
};

const BlumondIcon = ({ size, className }: BlumondIconProps) => (
  <span
    className={className}
    style={{
      width: size,
      height: size,
      position: 'relative',
      display: 'inline-block',
      overflow: 'hidden',
      clipPath: 'polygon(50% 0%, 100% 42%, 50% 100%, 0% 42%)',
      WebkitClipPath: 'polygon(50% 0%, 100% 42%, 50% 100%, 0% 42%)',
    }}
  >
    <img
      src="/image2/blumond.png"
      alt=""
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: size * 3,
        height: size * 3,
        objectFit: 'cover',
        transform: 'translate(-50%, -48%)',
      }}
    />
  </span>
);

type PodiumBadgeProps = {
  index: number;
  size: number;
};
// Ferris wheel placement (must match your render)
const WHEEL = { left: 6, top: 101, width: 391, height: 391 } as const;

// Smaller + adaptive pad (wheel box is tighter than item bounds)
const WHEEL_PAD_MIN = 4;
const WHEEL_PAD_MAX = 10;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function getWheelFocusRect(item: ItemSpec) {
  const base = Math.min(item.width, item.height);

  const pad = clamp(Math.round(base * 0.08), 4, 10);

  // 🔧 SIZE SCALE CONTROL (this is what you adjust)
  const SCALE_X = .7; // width scale
  const SCALE_Y = 0.6; // height scale

  const centerX = item.left + item.width / 2;
  const centerY = item.top + item.height / 2;

  const width = (item.width + pad * 2) * SCALE_X;
  const height = (item.height + pad * 2) * SCALE_Y;

  const left = centerX - width / 2;
  const top = centerY - height / 2;

  const L = clamp(left, WHEEL.left, WHEEL.left + WHEEL.width);
  const T = clamp(top, WHEEL.top, WHEEL.top + WHEEL.height);
  const R = clamp(left + width, WHEEL.left, WHEEL.left + WHEEL.width);
  const B = clamp(top + height, WHEEL.top, WHEEL.top + WHEEL.height);

  return { left: L, top: T, width: R - L, height: B - T };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function wheelClipPathForRect(
  rect: { left: number; top: number; width: number; height: number },
  itemCenterY?: number
) {
  const localLeftRaw = rect.left - WHEEL.left;
  const localTopRaw = rect.top - WHEEL.top;

  const localRightRaw = WHEEL.width - (localLeftRaw + rect.width);
  const localBottomRaw = WHEEL.height - (localTopRaw + rect.height);

  // Normalize item Y position inside wheel (0=top, 1=bottom)
  const t = itemCenterY != null
    ? clamp((itemCenterY - WHEEL.top) / WHEEL.height, 0, 1)
    : 0.5;

  // ✅ Dynamic extras:
  // Top items (t≈0) need MORE top expansion.
  // Bottom items (t≈1) need LESS top expansion.
  const EXTRA_LEFT = 18;
  const EXTRA_RIGHT = 20;

  const EXTRA_TOP = Math.round(lerp(20, -15, t));      // 26px at top -> 10px at bottom
  const EXTRA_BOTTOM = Math.round(lerp(15, 40, t));   // 12px at top -> 22px at bottom

  // Use floor/ceil to avoid 1px subpixel gaps
  const localLeft = Math.max(0, Math.floor(localLeftRaw) - EXTRA_LEFT);
  const localTop = Math.max(0, Math.floor(localTopRaw) - EXTRA_TOP);

  const localRight = Math.max(0, Math.floor(localRightRaw) - EXTRA_RIGHT);
  const localBottom = Math.max(0, Math.floor(localBottomRaw) - EXTRA_BOTTOM);

  return `inset(${localTop}px ${localRight}px ${localBottom}px ${localLeft}px round 10px)`;
}
const PodiumBadge = ({ index, size }: PodiumBadgeProps) => (
  <span
    style={{
      width: size,
      height: size,
      position: 'relative',
      display: 'inline-block',
      backgroundImage: `url(${podiumBadgeByIndex(index)})`,
      backgroundRepeat: 'no-repeat',
      backgroundSize: '220% auto',
      backgroundPosition: '50% 44%',
      borderRadius: 999,
    }}
  />
);

/* ═══════════════════════════════════════════════════════════
   Trophy Win Overlay — chips fly to trophy → trophy explodes → panel pops up
   ═══════════════════════════════════════════════════════════ */
type WinAnimStage = 'FLY_TO_TROPHY' | 'TROPHY_EXPLODE' | 'PANEL';

type TrophyWinOverlayProps = {
  chipSrc: string;
  bets: BetsState;
  winnerItems: ItemSpec[];   // <-- instead of winnerItem
  winAmountLabel: string;
  rankRows: { name: string; diamonds: number; pic?: string }[];
  roundType: 'NORMAL' | 'JACKPOT';
  winnerIds: ItemId[];
};

/* Trophy icon center in artboard coordinates */
const TROPHY_CENTER = { left: 43, top: 78 } as const;

/* Golden explosion particles for the trophy burst */
type TrophyParticle = {
  id: number;
  angle: number;
  dist: number;
  size: number;
  delay: number;
};

const buildTrophyExplosion = (): TrophyParticle[] => {
  const particles: TrophyParticle[] = [];
  const waves = 3;
  const perWave = 20;
  let id = 0;
  for (let w = 0; w < waves; w++) {
    for (let i = 0; i < perWave; i++) {
      particles.push({
        id: id++,
        angle: (i / perWave) * Math.PI * 2 + (Math.random() - 0.5) * 0.4,
        dist: 25 + Math.random() * 55,
        size: 3 + Math.random() * 5,
        delay: w * 0.8 + Math.random() * 0.15,
      });
    }
  }
  return particles;
};

const TrophyWinOverlay = ({ chipSrc, bets, winnerItems, winAmountLabel, rankRows, roundType, winnerIds }: TrophyWinOverlayProps) => {
  const [stage, setStage] = useState<WinAnimStage>('FLY_TO_TROPHY');
  const [showCoins, setShowCoins] = useState(false);
  const explosionParticles = useMemo(() => buildTrophyExplosion(), []);

  /* Collect items that have bets on them */
  const betChips = useMemo(() => {
    const chips: { id: ItemId; left: number; top: number }[] = [];
    for (const item of ITEMS) {
      if (bets[item.id] > 0) {
        chips.push({
          id: item.id,
          left: item.left + item.width / 2 - 20,
          top: item.top + item.height / 2 - 20,
        });
      }
    }
    return chips;
  }, [bets]);

  useEffect(() => {
    /*
      Timeline (from start):
      0.0s  — chips fly to trophy
      0.7s  — coin explosion + fireworks start
      2.7s  — leaderboard panel appears (coins + fireworks still going)
      4.7s  — coin explosion stops (fireworks + panel continue)
    */
    const t1 = window.setTimeout(() => { setStage('TROPHY_EXPLODE'); setShowCoins(true); }, 700);
    const t2 = window.setTimeout(() => setStage('PANEL'), 2700);
    const t3 = window.setTimeout(() => setShowCoins(false), 4700);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  return (
    <>
      {/* ── Stage 1: Chips fly from each bet position → trophy ── */}
      {stage === 'FLY_TO_TROPHY' && betChips.map((chip, i) => (
        <motion.div
          key={chip.id}
          className="absolute z-[530] pointer-events-none"
          style={{ width: 40, height: 40 }}
          initial={{ left: chip.left, top: chip.top, scale: 1, opacity: 1 }}
          animate={{
            left: TROPHY_CENTER.left - 20,
            top: TROPHY_CENTER.top - 20,
            scale: 0.5,
            opacity: [1, 1, 0.7],
          }}
          transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1], delay: i * 0.06 }}
        >
          <img src={chipSrc} alt="" className="h-full w-full object-contain" />
        </motion.div>
      ))}

      {/* ── Coins bursting upward from trophy (independent of stage) ── */}
      {showCoins && (
        <div className="absolute z-[530] pointer-events-none">
          {/* Tiny flash — trophy stays visible */}
          <motion.div
            className="absolute rounded-full"
            style={{
              left: TROPHY_CENTER.left - 6,
              top: TROPHY_CENTER.top - 6,
              width: 12,
              height: 12,
              background: 'radial-gradient(circle, rgba(255,255,200,0.8) 0%, rgba(255,215,0,0.3) 60%, transparent 100%)',
            }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: [0, 2, 0], opacity: [0, 0.8, 0] }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          />

          {/* Coins fountain: up then arc down */}
          {explosionParticles.map((p) => {
            const spreadX = Math.cos(p.angle) * p.dist * 0.8;
            const peakY = -(45 + p.dist * 0.9);
            const fallY = 40 + p.dist * 0.6;
            const coinSize = 3 + Math.random() * 4;
            return (
              <motion.div
                key={p.id}
                className="absolute rounded-full"
                style={{
                  left: TROPHY_CENTER.left,
                  top: TROPHY_CENTER.top,
                  width: coinSize,
                  height: coinSize,
                  background: `radial-gradient(circle at 35% 35%, #FFE066, #FFB800, #E8960C)`,
                  boxShadow: '0 0 3px rgba(255,200,50,0.7)',
                  border: '0.5px solid rgba(255,230,150,0.5)',
                }}
                initial={{ opacity: 0, x: 0, y: 0, scale: 0.3 }}
                animate={{
                  opacity: [0, 1, 1, 0.8, 0],
                  x: [0, spreadX * 0.3, spreadX * 0.6, spreadX],
                  y: [0, peakY, peakY * 0.3, fallY],
                  scale: [0.3, 1, 0.9, 0.4],
                }}
                transition={{
                  duration: 1.2 + Math.random() * 0.4,
                  delay: p.delay,
                  ease: [0.22, 0.68, 0.36, 1],
                }}
              />
            );
          })}
        </div>
      )}


      {/* ── Stage 3: Win panel pops up with spring bounce ── */}
      <AnimatePresence>
        {stage === 'PANEL' && (
          <motion.div
            key="win-panel"
            className="absolute z-[550]"
            style={{ left: 0, top: 260, width: 402, height: 430 }}
            initial={{ scale: 0, opacity: 0, y: 60 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 18 }}
          >
            <img src="/image2/panel_you_win.png" alt="" className="absolute inset-0 h-full w-full object-fill" />

            {/* ── Content container with consistent padding ── */}
            {(() => {
              const PX = 28;           // horizontal padding
              const CONTENT_W = 402 - PX * 2; // 346px
              const SPACING = 18;      // equal spacing between sections
              const REWARD_TOP = 158;  // reward bar Y
              const REWARD_H = 48;     // reward bar height
              const LB_TOP = REWARD_TOP + REWARD_H + SPACING; // leaderboard Y start (equal gap)
              const ROW_H = 50;        // leaderboard row height
              const ROW_GAP = 10;      // gap between rows

              return (
                <>
                  {/* ── Reward Bar ── */}
                  <motion.div
                    className="absolute flex items-center justify-center"
                    style={{
                      left: PX,
                      top: REWARD_TOP,
                      width: CONTENT_W,
                      height: REWARD_H,
                      paddingLeft: 16,
                      paddingRight: 16,
                      boxSizing: 'border-box',
                    }}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3, duration: 0.3 }}
                  >
                    {/* Centered group: icon + divider + diamond value */}
                    <div className="flex items-center" style={{ gap: 14 }}>
                      {/* Item / bucket icon */}
                      <div className="flex items-center justify-center" style={{ flexShrink: 0, width: 40, height: 40 }}>
                        {roundType === 'JACKPOT' ? (
                          <img
                            src={winnerIds.every(id => VEG_ITEMS.includes(id)) ? '/image2/tab_vegetables.png' : '/image2/tab_drinks.png'}
                            alt=""
                            style={{ width: 40, height: 40, objectFit: 'contain' }}
                          />
                        ) : (
                          <img src={winnerItems[0]?.src} alt="" style={{ width: 40, height: 40, objectFit: 'contain' }} />
                        )}
                      </div>

                      {/* Vertical divider */}
                      <div style={{ width: 1.5, height: 26, background: 'rgba(255,255,255,0.35)', flexShrink: 0, borderRadius: 1 }} />

                      {/* Diamond + amount */}
                      <div className="flex items-center" style={{ gap: 6 }}>
                        <img src="/image2/diamond.png" alt="" style={{ width: 24, height: 24, flexShrink: 0 }} />
                        <span
                          style={{
                            color: '#ffe56a',
                            fontFamily: 'Inria Serif, serif',
                            fontSize: 26,
                            fontWeight: 800,
                            textShadow: '0 2px 0 rgba(0,0,0,0.35)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {winAmountLabel}
                        </span>
                      </div>
                    </div>
                  </motion.div>

                  {/* ── Leaderboard rows (matching no-bet panel alignment) ── */}
                  {rankRows.slice(0, 3).map((row, idx) => (
                    <motion.div
                      key={`${row.name}-${idx}`}
                      className="absolute flex items-center"
                      style={{
                        left: PX + 30,
                        top: LB_TOP + idx * (ROW_H + ROW_GAP),
                        width: CONTENT_W - 60,
                        height: ROW_H,
                      }}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.4 + idx * 0.12, duration: 0.3 }}
                    >
                      <img
                        src={['/image2/first1.png', '/image2/second2.png', '/image2/third3.png'][idx]}
                        alt=""
                        style={{ width: 38, height: 38, objectFit: 'contain', flexShrink: 0 }}
                      />
                      {row.pic && (
                        <img
                          src={row.pic}
                          alt=""
                          style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, marginLeft: 4, border: '2px solid rgba(255,255,255,0.5)' }}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      )}
                      <div
                        style={{
                          marginLeft: 10,
                          width: 100,
                          flexShrink: 0,
                          color: '#fff',
                          fontFamily: 'Inria Serif, serif',
                          fontStyle: 'italic',
                          fontWeight: 700,
                          fontSize: 22,
                          lineHeight: '24px',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                        }}
                      >
                        {row.name}
                      </div>

                      <div className="flex items-center" style={{ gap: 5, marginLeft: 'auto', flexShrink: 0, width: 75, paddingLeft: 4 }}>
                        <img src="/image2/diamond.png" alt="" style={{ width: 20, height: 20, flexShrink: 0 }} />
                        <span
                          style={{
                            color: '#ffe8a9',
                            fontFamily: 'Inter, system-ui, sans-serif',
                            fontWeight: 700,
                            fontSize: 18,
                            lineHeight: '18px',
                            textShadow: '0 1px 2px rgba(0,0,0,0.6)',
                            whiteSpace: 'nowrap',
                            width: 65,
                            textAlign: 'right',
                          }}
                        >
                          {formatK(row.diamonds)}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </>
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

const GamePage = () => {
  const flags = useMemo(() => {
    if (typeof window === 'undefined') return { overlay: false, grid: false, metrics: false };
    const params = new URLSearchParams(window.location.search);
    return {
      overlay: params.get('overlay') === '1',
      grid: params.get('grid') === '1',
      metrics: params.get('metrics') === '1',
    };
  }, []);

  const itemMap = useMemo(() => {
    return ITEMS.reduce((acc, item) => {
      acc[item.id] = item;
      return acc;
    }, {} as Record<ItemId, ItemSpec>);
  }, []);

  /* ── API state ── */
  const [apiLoaded, setApiLoaded] = useState(false);
  const [itemMultiplier, setItemMultiplier] = useState<Record<ItemId, number>>(DEFAULT_MULTIPLIER);
  const [winWeights, setWinWeights] = useState<Record<ItemId, number>>(DEFAULT_WIN_WEIGHTS);
  const [chipValues, setChipValues] = useState<number[]>([...DEFAULT_CHIP_VALUES]);
  const [badgeOverrides, setBadgeOverrides] = useState<Record<ItemId, string>>({} as Record<ItemId, string>);
  const [boxData, setBoxData] = useState<{ src: string; openSrc: string; label: string }[]>(
    Object.entries(BOX_VALUE_TO_CHEST).map(([val, src]) => ({ src, openSrc: src.replace('.png', '_open.png'), label: BOX_LABELS[Number(val)] || '' }))
  );
  const [maxPlayers, setMaxPlayers] = useState(8);
  const [trophySrc, setTrophySrc] = useState('/image2/trophy.png');
  const [elementApiIds, setElementApiIds] = useState<Record<string, number>>({});
  const [coinIconSrc, setCoinIconSrc] = useState('/image2/diamond.png');
  const [gameLogoSrc, setGameLogoSrc] = useState('/image2/greedy_sign_board.png');
  const [jackpotAmount, setJackpotAmount] = useState(JACKPOT_BONUS_AMOUNT);
  const [sessionEndTime, setSessionEndTime] = useState<string | null>(null);
  const [prizeData, setPrizeData] = useState<ApiPrizeDistribution | null>(null);
  const [advanceModeApi, setAdvanceModeApi] = useState<ApiGameMode | null>(null);
  const [rankRowsToday, setRankRowsToday] = useState<{ name: string; diamonds: number; pic?: string }[]>(RANK_ROWS_TODAY);
  const [rankRowsYesterday, setRankRowsYesterday] = useState<{ name: string; diamonds: number; pic?: string }[]>(RANK_ROWS_YESTERDAY);
  const [topWinnersRows, setTopWinnersRows] = useState<ResultBoardRow[]>(NO_BET_ROWS);

  /* Fetch API data on mount */
  const apiCalledRef = useRef(false);
  useEffect(() => {
    if (apiCalledRef.current) return;
    apiCalledRef.current = true;

    (async () => {
      try {
        const results = await Promise.allSettled([
          apiFetch<ApiElement[]>('/game/game/elements'),
          apiFetch<ApiButton[]>('/game/sorce/buttons'),
          apiFetch<ApiBox[]>('/game/magic/boxs'),
          apiFetch<ApiTrophy>('/game/game/trophy'),
          apiFetch<ApiWinElement[]>('/game/win/elements/list'),
          apiFetch<ApiCoin>('/game/game/coin'),
          apiFetch<ApiGameIcon>('/game/icon/during/gaming'),
          apiFetch<ApiTodayWin>('/game/today/win'),
          apiFetch<ApiJackpot>('/game/jackpot'),
          apiFetch<ApiSessionTime>('/game/game/session/end/time'),
          apiFetch<ApiPrizeDistribution>('/game/game/prize/distribution'),
          apiFetch<ApiGameMode>('/game/game/mode'),
          apiFetch<ApiRankToday>('/game/game/rank/today'),
          apiFetch<ApiTopWinnerResponse>('/game/top/winers', 2, JSON.stringify({ regisation: 3, player_id: PLAYER_ID })),
          apiFetch<ApiMaxFruits>('/game/maximum/fruits/per/turn', 2, JSON.stringify({ regisation: 3 })),
          apiFetch<ApiRankYesterday>('/game/game/rank/yesterday'),
          apiFetch<ApiGameRule>('/game/game/rule'),
          apiFetch<ApiJackpotDetails>('/game/jackpot/details'),
          apiFetch<ApiGameMetadata>('/game/game/icon/'),
          apiFetch<ApiPlayerRecords>('/game/game/records/of/player', 2, JSON.stringify({ regisation: 3, player_id: PLAYER_ID })),
        ]);

        const elements = results[0].status === 'fulfilled' ? results[0].value : null;
        const buttons = results[1].status === 'fulfilled' ? results[1].value : null;
        const boxes = results[2].status === 'fulfilled' ? results[2].value : null;
        const trophy = results[3].status === 'fulfilled' ? results[3].value : null;
        const winHistory = results[4].status === 'fulfilled' ? results[4].value : null;
        const coin = results[5].status === 'fulfilled' ? results[5].value : null;
        const gameIcon = results[6].status === 'fulfilled' ? results[6].value : null;
        const todayWinApi = results[7].status === 'fulfilled' ? results[7].value : null;
        const jackpotApi = results[8].status === 'fulfilled' ? results[8].value : null;
        const sessionTime = results[9].status === 'fulfilled' ? results[9].value : null;
        const prizeDistrib = results[10].status === 'fulfilled' ? results[10].value : null;
        const gameMode = results[11].status === 'fulfilled' ? results[11].value : null;
        const rankToday = results[12].status === 'fulfilled' ? results[12].value : null;
        const topWinners = results[13].status === 'fulfilled' ? results[13].value : null;
        const maxFruits = results[14].status === 'fulfilled' ? results[14].value : null;
        const rankYesterday = results[15].status === 'fulfilled' ? results[15].value : null;
        const gameRules = results[16].status === 'fulfilled' ? results[16].value : null;
        const jackpotDetails = results[17].status === 'fulfilled' ? results[17].value : null;
        const gameMetadata = results[18].status === 'fulfilled' ? results[18].value : null;
        const playerRecords = results[19].status === 'fulfilled' ? results[19].value : null;

        /* Log failures */
        results.forEach((r, i) => {
          if (r.status === 'rejected') console.warn(`[API] Call ${i} failed:`, r.reason);
        });

        /* Build multiplier + weights + badges from elements API */
        if (elements) {
          const multipliers = { ...DEFAULT_MULTIPLIER };
          const weights = { ...DEFAULT_WIN_WEIGHTS };
          const badges: Record<string, string> = {};

          for (const el of elements) {
            const id = API_NAME_TO_ID[el.element_name];
            if (id) {
              multipliers[id] = el.paytable;
              weights[id] = el.win_weights;
              badges[id] = `x${el.paytable}`;
            }
          }

          setItemMultiplier(multipliers);
          setWinWeights(weights);
          setBadgeOverrides(badges as Record<ItemId, string>);

          /* Store element database IDs for bet API */
          const apiIds: Record<string, number> = {};
          elements.forEach((el) => {
            const id = API_NAME_TO_ID[el.element_name];
            if (id) apiIds[id] = el.id;
          });
          setElementApiIds(apiIds);
          console.log('[API] Elements loaded:', multipliers);
        }

        /* Build chip values from buttons API */
        if (buttons && buttons.length > 0) {
          const vals = buttons.map((b) => b.source).sort((a, b) => a - b);
          setChipValues(vals);
          console.log('[API] Buttons loaded:', vals);
        }

        /* Build box/chest data from boxes API */
        if (boxes && boxes.length > 0) {
          const bd = boxes.map((b) => ({
            src: b.box_image_close
              ? `https://gameadmin.nanovisionltd.com/${b.box_image_close}`
              : (BOX_VALUE_TO_CHEST[b.box_source] || '/image2/chest_10k.png'),
            openSrc: b.box_image_open
              ? `https://gameadmin.nanovisionltd.com/${b.box_image_open}`
              : (CHEST_OPEN_SRC_BY_THRESHOLD[b.box_source] || '/image2/chest_10k_open.png'),
            label: BOX_LABELS[b.box_source] || `${b.box_source}`,
          }));
          setBoxData(bd);
          console.log('[API] Boxes loaded:', bd);
        }



        /* Trophy image */
        if (trophy?.icon) {
          const imgUrl = `https://gameadmin.nanovisionltd.com${trophy.icon}`;
          setTrophySrc(imgUrl);
          console.log('[API] Trophy loaded:', imgUrl);
        }

        /* Win history → result strip */
        if (winHistory && Array.isArray(winHistory) && winHistory.length > 0) {
          const itemSrcMap: Record<string, string> = {};
          for (const item of ITEMS) {
            const apiName = ID_TO_API_NAME[item.id];
            if (apiName) itemSrcMap[apiName] = item.src;
          }

          const srcs = winHistory
            .map((w) => itemSrcMap[w.element__element_name])
            .filter(Boolean) as string[];

          if (srcs.length > 0) {
            // Fill rightmost slots with API data, leave leftmost empty
            const slotCount = RESULT_POSITIONS.length;
            const filled = srcs.length >= slotCount
              ? srcs.slice(-slotCount)
              : [...Array(slotCount - srcs.length).fill(''), ...srcs];
            setResultSrcs(filled);
            console.log('[API] Win history loaded:', srcs.length, 'results');
          }
        }

        /* Coin icon */
        if (coin?.icon) {
          const imgUrl = `https://gameadmin.nanovisionltd.com${coin.icon}`;
          setCoinIconSrc(imgUrl);
          console.log('[API] Coin icon loaded:', imgUrl);
        }

        /* Game logo icon */
        if (gameIcon?.icon) {
          const imgUrl = `https://gameadmin.nanovisionltd.com${gameIcon.icon}`;
          setGameLogoSrc(imgUrl);
          console.log('[API] Game logo loaded:', imgUrl);
        }

        /* Today's win */
        if (todayWinApi?.today_win?.total_balance != null) {
          setTodayWin(todayWinApi.today_win.total_balance);
          console.log('[API] Today win loaded:', todayWinApi.today_win.total_balance);
        }

        /* Jackpot */
        console.log('[API] Jackpot RAW response:', JSON.stringify(jackpotApi));
        if (jackpotApi?.Jackpot != null) {
          setJackpotAmount(jackpotApi.Jackpot);
          console.log('[API] Jackpot loaded:', jackpotApi.Jackpot);
        } else if (jackpotApi && typeof jackpotApi === 'object') {
          // Try to find the jackpot value from any key
          const keys = Object.keys(jackpotApi);
          console.log('[API] Jackpot keys:', keys);
          for (const key of keys) {
            const val = (jackpotApi as Record<string, unknown>)[key];
            if (typeof val === 'number' && val > 0) {
              setJackpotAmount(val);
              console.log('[API] Jackpot loaded from key', key, ':', val);
              break;
            }
          }
        }

        /* Prize distribution */
        if (prizeDistrib) {
          setPrizeData(prizeDistrib);
          console.log('[API] Prize distribution loaded');
        }

        /* Game mode — auto-enable advance if API says so */
        if (gameMode) {
          setAdvanceModeApi(gameMode);
          if (gameMode.advance === true) {
            setMode('ADVANCE');
            console.log('[API] Advance mode ENABLED by server');
          }
          console.log('[API] Game mode loaded:', gameMode.advance, 'remaining:', gameMode.remanning_values);
        }

        /* Rank today */
        console.log('[API] Rank today RAW:', JSON.stringify(rankToday));
        /* Handle both { data: [...] } and direct array responses */
        const rankTodayArr: ApiRankRow[] | null =
          rankToday?.data?.length ? rankToday.data
            : Array.isArray(rankToday) && rankToday.length ? rankToday
              : null;

        let parsedRankRows: { name: string; diamonds: number; pic?: string }[] | null = null;
        if (rankTodayArr) {
          console.log('[API] Rank today entries:', rankTodayArr.length);
          parsedRankRows = rankTodayArr.map((r) => ({
            name: r.mrs__player_id__player_name,
            diamonds: r.last_balance,
            pic: r.mrs__player_id__player_pic
              ? `https://gameadmin.nanovisionltd.com/${r.mrs__player_id__player_pic.startsWith('media/') ? '' : 'media/'}${r.mrs__player_id__player_pic}`
              : undefined,
          }));
          setRankRowsToday(parsedRankRows);
          console.log('[API] Rank today loaded:', parsedRankRows.length, 'rows, pics:', parsedRankRows.slice(0, 3).map(r => r.pic));
        }

        /* Top Winners — use API data, fallback to rank today for profile pics */
        console.log('[API] Top Winners RAW:', JSON.stringify(topWinners));
        let topWinnersMapped: ResultBoardRow[] | null = null;

        // Try top winners API first
        if (topWinners && Array.isArray(topWinners) && topWinners.length > 0) {
          topWinnersMapped = topWinners.slice(0, 3).map((r: { mrs__player_id__player_name: string; mrs__player_id__player_pic?: string; last_balance: number }) => ({
            name: r.mrs__player_id__player_name,
            amount: r.last_balance,
            pic: r.mrs__player_id__player_pic
              ? `https://gameadmin.nanovisionltd.com/${r.mrs__player_id__player_pic}`
              : undefined,
          }));
          console.log('[API] Top Winners from API:', topWinnersMapped.length, 'rows');
        }

        // Fallback: use rank today data (which includes profile pics)
        if (!topWinnersMapped && parsedRankRows && parsedRankRows.length > 0) {
          topWinnersMapped = parsedRankRows.slice(0, 3).map((r) => ({
            name: r.name,
            amount: r.diamonds,
            pic: r.pic,
          }));
          console.log('[API] Top Winners fallback from rank today:', topWinnersMapped.length, 'rows');
        }

        if (topWinnersMapped) {
          setTopWinnersRows(topWinnersMapped);
          console.log('[API] Top Winners SET:', topWinnersMapped.map(r => ({ name: r.name, pic: r.pic })));
        }

        /* Max Fruits Per Turn → max bets per round */
        if (maxFruits) {
          const mf = maxFruits as Record<string, unknown>;
          const limit = typeof mf.max_fruits === 'number' ? mf.max_fruits
            : typeof mf.max_players === 'number' ? mf.max_players
              : null;
          if (limit != null) {
            setMaxPlayers(limit);
            console.log('[API] Max bets per turn loaded:', limit);
          }
        }

        /* Rank yesterday */
        if (rankYesterday?.data?.length) {
          const mapped = rankYesterday.data.map((r) => ({
            name: r.mrs__player_id__player_name,
            diamonds: r.last_balance,
            pic: r.mrs__player_id__player_pic
              ? `https://gameadmin.nanovisionltd.com/${r.mrs__player_id__player_pic.startsWith('media/') ? '' : 'media/'}${r.mrs__player_id__player_pic}`
              : undefined,
          }));
          setRankRowsYesterday(mapped);
          console.log('[API] Rank yesterday loaded:', mapped.length, 'rows');
        }

        /* Session end time → timer */
        if (sessionTime?.next_run_time) {
          setSessionEndTime(sessionTime.next_run_time);
          console.log('[API] Session end time:', sessionTime.next_run_time);
        }

        /* Game Rules */
        if (gameRules?.general?.rules?.length) {
          setApiRules(gameRules.general.rules);
          setApiRulesVersion(gameRules.general.version || '');
          console.log('[API] Rules loaded:', gameRules.general.rules.length, 'rules, version:', gameRules.general.version);
        }

        /* Jackpot Details */
        if (jackpotDetails?.awards?.length) {
          setJackpotAwards(jackpotDetails.awards);
          console.log('[API] Jackpot details loaded:', jackpotDetails.awards.length, 'awards, total:', jackpotDetails.jackpot_total);
        }
        /* Use jackpot_total from details as fallback when main jackpot endpoint returns 0 */
        if (jackpotDetails?.jackpot_total && jackpotDetails.jackpot_total > 0 && (jackpotApi?.Jackpot == null || jackpotApi.Jackpot === 0)) {
          setJackpotAmount(jackpotDetails.jackpot_total);
          console.log('[API] Jackpot amount set from details total:', jackpotDetails.jackpot_total);
        }

        /* Game Metadata */
        if (gameMetadata && Array.isArray(gameMetadata) && gameMetadata.length > 0) {
          if (gameMetadata[0].game__name) {
            setGameName(gameMetadata[0].game__name);
            console.log('[API] Game name:', gameMetadata[0].game__name);
          }
        }

        /* Player Records */
        if (playerRecords?.data?.length) {
          setApiPlayerRecords(playerRecords.data.map(r => ({
            round: r.round,
            element: r.element__element_name,
            bet: r.bet,
            win: r.win,
            time: r.time,
          })));
          console.log('[API] Player records loaded:', playerRecords.data.length, 'records');
        }

        setApiLoaded(true);
      } catch (err) {
        console.warn('[API] Unexpected error:', err);
        setApiLoaded(true);
      }
    })();

    return () => { /* cleanup */ };
  }, []);

  const [mode, setMode] = useState<Mode>('BASIC');
  const isAdvanceMode = mode === 'ADVANCE';
  const [phase, setPhase] = useState<Phase>('BETTING');
  const [timeLeft, setTimeLeft] = useState(0);
  const [showGameOn, setShowGameOn] = useState(true);

  const [showPreDraw, setShowPreDraw] = useState(false);
  const preDrawTimeoutRef = useRef<number | null>(null);

  const [selectedChip, setSelectedChip] = useState<number>(100);

  const [balance, setBalance] = useState(129454);
  const [todayWin, setTodayWin] = useState(0);
  const [lifetimeBet, setLifetimeBet] = useState(21380);

  const [bets, setBets] = useState<BetsState>(buildEmptyBets());
  const [pendingWin, setPendingWin] = useState<PendingWin | null>(null);

  const [resultSrcs, setResultSrcs] = useState<string[]>(INITIAL_RESULT_SRCS);
  const [resultKind, setResultKind] = useState<ResultKind>('LOSE');

  const [roundType, setRoundType] = useState<RoundType>('NORMAL');
  const normalRoundsSinceJackpotRef = useRef(0);

  const [showResultBoard, setShowResultBoard] = useState(false);
  const [winnerIds, setWinnerIds] = useState<ItemId[] | null>(null);
  const winnerRef = useRef<ItemId[] | null>(null);

  const [activeModal, setActiveModal] = useState<ModalType>('NONE');
  const [rankTab, setRankTab] = useState<RankTab>('TODAY');
  const [musicOn, setMusicOn] = useState(true);

  const [records, setRecords] = useState<GameRecord[]>([]);
  const [apiRules, setApiRules] = useState<string[]>([]);
  const [apiRulesVersion, setApiRulesVersion] = useState('');
  const [jackpotAwards, setJackpotAwards] = useState<{ round: number; win: number; time: string }[]>([]);
  const [gameName, setGameName] = useState('Gready Market');
  const [apiPlayerRecords, setApiPlayerRecords] = useState<{ round?: number; element?: string; bet?: number; win?: number; time?: string }[]>([]);
  const roundRef = useRef(74612);

  const [itemPulse, setItemPulse] = useState<{ id: ItemId | null; key: number }>({ id: null, key: 0 });
  const [floatingBetChips, setFloatingBetChips] = useState<FloatingBetChip[]>([]);
  const [pointerStopIndex, setPointerStopIndex] = useState(0);
  const [drawHighlightIndex, setDrawHighlightIndex] = useState(0);
  const [showFireworks, setShowFireworks] = useState(false);
  const [fireworksSeed, setFireworksSeed] = useState(0);
  const [trophyCoins, setTrophyCoins] = useState<{ id: number; x: number; y: number; size: number; delay: number }[]>([]);
  const trophyCoinIdRef = useRef(0);

  /* Set document title from API game name */
  useEffect(() => { document.title = gameName; }, [gameName]);
  /* Continuous trophy coin explosion during BETTING */
  useEffect(() => {
    if (phase !== 'BETTING') {
      setTrophyCoins([]);
      return;
    }

    const spawnBurst = () => {
      const count = 5 + Math.floor(Math.random() * 4);
      const newCoins = Array.from({ length: count }, (_, i) => {
        const id = trophyCoinIdRef.current + i + 1;
        const angle = Math.random() * Math.PI * 2;
        const dist = 18 + Math.random() * 30;
        return {
          id,
          x: Math.cos(angle) * dist,
          y: Math.sin(angle) * dist - 10,
          size: 5 + Math.random() * 6,
          delay: Math.random() * 0.08,
        };
      });
      trophyCoinIdRef.current += count;
      setTrophyCoins((prev) => [...prev, ...newCoins]);
      const coinIds = newCoins.map((c) => c.id);
      window.setTimeout(() => {
        setTrophyCoins((prev) => prev.filter((c) => !coinIds.includes(c.id)));
      }, 700);
    };

    spawnBurst();
    const interval = window.setInterval(spawnBurst, 800);
    return () => window.clearInterval(interval);
  }, [phase]);


  const floatingChipIdRef = useRef(0);
  const floatingChipTimeoutsRef = useRef<number[]>([]);

  const totalBet = useMemo(() => Object.values(bets).reduce((sum, val) => sum + val, 0), [bets]);

  /* Progress bar reaches each chest box at its threshold value */

  // thresholds in order (must match visual order)
  const BOX_THRESHOLDS = [10000, 50000, 100000, 500000, 1000000] as const;

  // closed -> open chest image mapping (from your folder screenshot)
  const CHEST_OPEN_SRC_BY_THRESHOLD: Record<number, string> = {
    10000: '/image2/chest_10k_open.png',
    50000: '/image2/chest_50k_open.png',
    100000: '/image2/chest_100k_open.png',
    500000: '/image2/chest_500k_open.png',
    1000000: '/image2/chest_1m_open.png',
  };
  const [openedChests, setOpenedChests] = useState<Record<number, boolean>>({
    10000: false,
    50000: false,
    100000: false,
    500000: false,
    1000000: false,
  });
  // IMPORTANT: set your real reward amounts here (example values).
  // The popup in your screenshot shows 500, so adjust as needed per chest.
  const CHEST_REWARD_AMOUNT_BY_THRESHOLD: Record<number, number> = {
    10000: 100,
    50000: 200,
    100000: 300,
    500000: 400,
    1000000: 500,
  };
  const isChestReady = (threshold: number) => todayWin >= threshold && !openedChests[threshold];
  const progressRatio = useMemo(() => {
    if (todayWin <= 0) return 0;
    const segmentWidth = 1 / BOX_THRESHOLDS.length; // each box = 20%
    for (let i = 0; i < BOX_THRESHOLDS.length; i++) {
      const lo = i === 0 ? 0 : BOX_THRESHOLDS[i - 1];
      const hi = BOX_THRESHOLDS[i];
      if (todayWin <= hi) {
        const segmentProgress = (todayWin - lo) / (hi - lo);
        return segmentWidth * i + segmentWidth * segmentProgress;
      }
    }
    return 1; // exceeded all thresholds
  }, [todayWin]);
  const openChest = (threshold: number) => {
    // can ONLY open if it's ready (met threshold + currently not opened)
    if (!isChestReady(threshold)) return;

    // mark opened
    setOpenedChests((prev) => ({ ...prev, [threshold]: true }));

    // show popup
    const amount = CHEST_REWARD_AMOUNT_BY_THRESHOLD[threshold] ?? 0;
    setChestPopup({ threshold, amount });
  };
  // FIXED: Pointer stops now correctly point to the center of each item
  const pointerStops = useMemo(() => {
    return POINTER_TOUR_ORDER.map((id) => {
      const item = itemMap[id];
      // Calculate the center of the item
      const centerX = item.left + item.width / 2;
      const centerY = item.top + item.height / 2;
      // Position pointer so its hotspot points at the item center
      const left = centerX - POINTER_HOTSPOT.x;
      const top = centerY - POINTER_HOTSPOT.y;
      return { left, top };
    });
  }, [itemMap]);

  const chipSrcByValue = useMemo(() => {
    return chipValues.reduce(
      (acc: Record<number, string>, value: number, idx: number) => {
        if (CHIPS[idx]) acc[value] = CHIPS[idx].src;
        return acc;
      },
      {} as Record<number, string>
    );
  }, [chipValues]);

  const beginRound = () => {
    // Decide next round type (placeholder logic)
    const isJackpotNext =
      normalRoundsSinceJackpotRef.current > 0 &&
      normalRoundsSinceJackpotRef.current % JACKPOT_EVERY_N_NORMAL_ROUNDS === 0;

    setRoundType(isJackpotNext ? 'JACKPOT' : 'NORMAL');

    setPhase('BETTING');

    /* Sync timer with server session end time when available */
    let betSeconds = BET_SECONDS;
    if (sessionEndTime) {
      const serverEnd = new Date(sessionEndTime).getTime();
      const now = Date.now();
      const remaining = Math.max(1, Math.round((serverEnd - now) / 1000));
      if (remaining > 0 && remaining < 300) { // sanity: max 5 minutes
        betSeconds = remaining;
        console.log('[TIMER] Synced with server:', remaining, 'seconds remaining');
      }
      /* Clear after first use so subsequent rounds use default BET_SECONDS */
      setSessionEndTime(null);
    }
    setTimeLeft(betSeconds);
    setShowPreDraw(true);
  };


  const [chestPopup, setChestPopup] = useState<null | { threshold: number; amount: number }>(null);
  const placeGroupBet = (group: ItemId[]) => {
    if (!canBet) return;

    /* Enforce max bets per turn from API */
    const currentBettedCount = (Object.values(bets) as number[]).filter(v => v > 0).length;
    const newItems = group.filter(id => (bets[id] ?? 0) === 0);
    if (currentBettedCount + newItems.length > maxPlayers) return;

    // Unique + valid ids only
    const ids = Array.from(new Set(group));

    const totalCost = selectedChip * ids.length;
    if (balance < totalCost) return; // require enough balance to bet on ALL items

    // 1) Update local UI state in one shot
    setBalance((prev) => prev - totalCost);
    setLifetimeBet((prev) => prev + totalCost);

    setBets((prev) => {
      const next = { ...prev };
      for (const id of ids) next[id] = (next[id] ?? 0) + selectedChip;
      return next;
    });

    // 2) Pulse each item quickly (nice feedback)
    ids.forEach((id, idx) => {
      window.setTimeout(() => {
        setItemPulse((prev) => ({ id, key: prev.key + 1 }));
      }, idx * 70);
    });

    // 3) Optional: small floating chips (same rules as single bet)
    // 3) Floating chips: ALWAYS during BETTING, from selected chip -> each item
    if (phase === 'BETTING') {
      const chipSrc = CHIP_IMAGE_MAP[selectedChip] || '/image2/chip_100.png';
      const start = getSelectedChipStartPosition();

      ids.forEach((id, idx) => {
        const item = itemMap[id];
        if (!item) return;

        window.setTimeout(() => {
          const chipId = floatingChipIdRef.current + 1;
          floatingChipIdRef.current = chipId;

          const endLeft = item.left + item.width / 2 - 22;
          const endTop = item.top + item.height / 2 - 22;

          setFloatingBetChips((prev) => [
            ...prev,
            { id: chipId, left: start.left, top: start.top, endLeft, endTop, src: chipSrc },
          ]);

          const removeId = window.setTimeout(() => {
            setFloatingBetChips((prev) => prev.filter((entry) => entry.id !== chipId));
            floatingChipTimeoutsRef.current = floatingChipTimeoutsRef.current.filter((t) => t !== removeId);
          }, 700);

          floatingChipTimeoutsRef.current.push(removeId);
        }, idx * 60);
      });
    }

    // 4) Submit bets to API in sequence with a running balance
    let runningBalance = balance;
    ids.forEach((itemId) => {
      runningBalance -= selectedChip;

      const elementId = elementApiIds[itemId] || 0;
      fetch('/game/player/gaming/participants', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          player_id: PLAYER_ID,
          balance: runningBalance,
          bet: selectedChip,
          element: elementId,
        }),
      })
        .then((res) => {
          if (!res.ok && res.status !== 500) console.warn('[API] Bet submit failed:', res.status);
        })
        .catch(() => { /* silently ignore bet errors */ });
    });
  };


  const hasBlockingOverlay =
    activeModal !== 'NONE' || showGameOn || showPreDraw || showResultBoard || chestPopup !== null;
  const canBet = phase === 'BETTING' && !hasBlockingOverlay;
  const canOpenSystemModal = phase === 'BETTING' && !showGameOn;

  useEffect(() => {
    return () => {
      if (preDrawTimeoutRef.current) window.clearTimeout(preDrawTimeoutRef.current);
    };
  }, []);
  useEffect(() => {
    beginRound();

  }, []);


  useEffect(() => {
    if (!showGameOn) return;
    const id = window.setTimeout(() => setShowGameOn(false), GAME_ON_MS);
    return () => window.clearTimeout(id);
  }, [showGameOn]);



  useEffect(() => {
    if (activeModal !== 'NONE' || showGameOn || showPreDraw) return;

    const id = window.setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => window.clearInterval(id);
  }, [activeModal, showGameOn, showPreDraw]);



  useEffect(() => {
    if (!canBet || pointerStops.length === 0) return;

    setPointerStopIndex(0);
    const id = window.setInterval(() => {
      setPointerStopIndex((prev) => (prev + 1) % pointerStops.length);
    }, 1000);

    return () => window.clearInterval(id);
  }, [canBet, pointerStops.length]);

  // ── Sequential lottery-style spinning during DRAWING ──
  // Cycles through items in order (like a roulette wheel) with decelerating speed,
  // landing on the winner
  useEffect(() => {
    if (phase !== 'DRAWING') return;

    const winners = winnerRef.current;
    if (!winners || winners.length === 0) return;

    // during spinning we still “land” on something.
    // for NORMAL: winners[0]
    // for JACKPOT: choose one representative to land on (e.g. first item)
    const landingId = winners[0];

    const order = DRAW_HIGHLIGHT_ORDER;
    const winnerIdx = order.indexOf(landingId);

    // Calculate total steps: 3 full loops + extra to land on winner
    const fullLoops = 3 + Math.floor(Math.random() * 2); // 3-4 full loops
    const totalSteps = fullLoops * order.length + winnerIdx + 1;

    // Schedule each step with decelerating delay
    let elapsed = 0;
    const timers: number[] = [];

    for (let i = 0; i < totalSteps; i++) {
      const progress = i / (totalSteps - 1); // 0 → 1
      // Starts at ~100ms, slows to ~600ms near the end
      const delay = 100 + 500 * (progress * progress * progress); // cubic easing
      elapsed += delay;

      const step = i;
      const timerId = window.setTimeout(() => {
        setDrawHighlightIndex(step % order.length);
      }, elapsed);

      timers.push(timerId);
    }

    return () => {
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [phase]);

  useEffect(
    () => () => {
      floatingChipTimeoutsRef.current.forEach((id) => window.clearTimeout(id));
      floatingChipTimeoutsRef.current = [];
    },
    []
  );
  useEffect(() => {
    if (!showPreDraw) return;

    if (preDrawTimeoutRef.current) window.clearTimeout(preDrawTimeoutRef.current);

    preDrawTimeoutRef.current = window.setTimeout(() => {
      setShowPreDraw(false); // ✅ after this, BET countdown starts automatically
    }, PRE_DRAW_MS);

    return () => {
      if (preDrawTimeoutRef.current) window.clearTimeout(preDrawTimeoutRef.current);
    };
  }, [showPreDraw]);


  useEffect(() => {
    if (activeModal !== 'NONE' || showGameOn) return;
    if (timeLeft > 0) return;

    if (phase === 'BETTING') {
      if (roundType === 'JACKPOT') {
        const jackpotGroup = pickJackpotGroup(); // always 4 items
        winnerRef.current = jackpotGroup;
        setWinnerIds(jackpotGroup);
      } else {
        const picked = weightedRandomPick(ITEMS, winWeights);
        winnerRef.current = [picked];
        setWinnerIds([picked]);
      }

      setPhase('DRAWING');
      setTimeLeft(DRAW_SECONDS);
      return;
    }


    if (phase === 'DRAWING') {
      const winners = winnerRef.current;
      if (!winners || winners.length === 0) return;

      const hadAnyBet = totalBet > 0;

      let winAmount = 0;
      let primaryId: ItemId = winners[0]; // for UI panels that expect one item

      if (roundType === 'JACKPOT') {
        const jackpotItems = winners; // exactly 4 items from one bucket
        const j = computeJackpotWin({ jackpotItems, bets, itemMultiplier, jackpotBonus: jackpotAmount });
        winAmount = j.totalWin;

        // optional: choose a better “primaryId” for header/icon
        primaryId = jackpotItems[0];
      } else {
        const winner = winners[0];
        const betOnWinner = bets[winner] ?? 0;
        winAmount = betOnWinner > 0 ? betOnWinner * itemMultiplier[winner] : 0;
        primaryId = winner;
      }

      setPendingWin({ itemId: primaryId, amount: winAmount, hadAnyBet, totalBet });

      setResultKind(!hadAnyBet ? 'NOBET' : winAmount > 0 ? 'WIN' : 'LOSE');

      setResultSrcs((prev) => {
        const next = prev.slice(1);
        /* For jackpot rounds, show the bucket icon (vegetables/drinks) instead of single item */
        if (roundType === 'JACKPOT') {
          const isVeg = VEG_ITEMS.includes(primaryId);
          next.push(isVeg ? '/image2/tab_vegetables.png' : '/image2/tab_drinks.png');
        } else {
          next.push(itemMap[primaryId].src);
        }
        return next;
      });

      setPhase('SHOWTIME');
      /* Jackpot needs extra time: 2.5s highlight + full trophy animation */
      setTimeLeft(roundType === 'JACKPOT' ? 10 : SHOW_SECONDS);

      if (winAmount > 0) {
        setShowFireworks(true);
        setFireworksSeed((prev) => prev + 1);
      } else {
        setShowFireworks(false);
      }

      /* For jackpot rounds, keep the 4 highlighted cells visible for 2.5s
         before showing the result board (chips → trophy). Normal rounds show immediately. */
      if (roundType === 'JACKPOT') {
        setTimeout(() => setShowResultBoard(true), 2500);
      } else {
        setShowResultBoard(true);
      }
      return;
    }

    if (phase === 'SHOWTIME') {
      const winner = winnerRef.current;
      const winAmount = pendingWin?.amount ?? 0;
      const balanceBefore = balance;
      const balanceAfter = balanceBefore + winAmount;

      if (winAmount > 0) {
        setBalance(balanceAfter);
        setTodayWin((prev) => prev + winAmount);
      }

      if (winner) {
        const sortedBets = (Object.entries(bets) as Array<[ItemId, number]>).sort((a, b) => b[1] - a[1]);
        const selected = sortedBets[0] && sortedBets[0][1] > 0 ? sortedBets[0][0] : 'none';
        const selectedAmount = sortedBets[0] && sortedBets[0][1] > 0 ? sortedBets[0][1] : 0;

        const record: GameRecord = {
          round: roundRef.current,
          at: formatRoundTime(new Date()),
          winner,
          selected,
          selectedAmount,
          win: winAmount,
          balanceBefore,
          balanceAfter,
        };

        roundRef.current += 1;
        setRecords((prev) => [record, ...prev].slice(0, 30));
      }

      // update jackpot counter AFTER a round completes
      if (roundType === 'JACKPOT') {
        normalRoundsSinceJackpotRef.current = 0;
      } else {
        normalRoundsSinceJackpotRef.current += 1;
      }

      setBets(buildEmptyBets());
      setPendingWin(null);
      setWinnerIds(null);
      winnerRef.current = null;
      setDrawHighlightIndex(0);

      setShowResultBoard(false);
      setShowFireworks(false);

      beginRound();


    }
  }, [
    activeModal,
    balance,
    bets,
    itemMap,
    pendingWin,
    phase,
    showGameOn,

    timeLeft,
    totalBet,
  ]);

  const placeBet = (itemId: ItemId) => {
    if (!canBet) return;
    if (balance < selectedChip) return;

    /* Enforce max bets per turn from API */
    const bettedItemCount = (Object.values(bets) as number[]).filter(v => v > 0).length;
    if (bets[itemId] === 0 && bettedItemCount >= maxPlayers) return;

    setBalance((prev) => prev - selectedChip);
    setLifetimeBet((prev) => prev + selectedChip);

    setBets((prev) => ({
      ...prev,
      [itemId]: prev[itemId] + selectedChip,
    }));

    setItemPulse((prev) => ({ id: itemId, key: prev.key + 1 }));

    /* Submit bet to API */
    const elementId = elementApiIds[itemId] || 0;
    fetch('/game/player/gaming/participants', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        player_id: PLAYER_ID,
        balance: balance - selectedChip,
        bet: selectedChip,
        element: elementId,
      }),
    })
      .then((res) => {
        if (res.ok) console.log('[API] Bet submitted:', { item: itemId, bet: selectedChip, element: elementId });
      })
      .catch(() => { /* silently ignore bet errors */ });


    if (phase === 'BETTING') {
      const chipSrc = CHIP_IMAGE_MAP[selectedChip] || '/image2/chip_100.png';
      const item = itemMap[itemId];
      if (!chipSrc || !item) return;

      const chipId = floatingChipIdRef.current + 1;
      floatingChipIdRef.current = chipId;

      const start = getSelectedChipStartPosition();

      const endLeft = item.left + item.width / 2 - 22;
      const endTop = item.top + item.height / 2 - 22;

      setFloatingBetChips((prev) => [
        ...prev,
        { id: chipId, left: start.left, top: start.top, endLeft, endTop, src: chipSrc },
      ]);

      const removeId = window.setTimeout(() => {
        setFloatingBetChips((prev) => prev.filter((entry) => entry.id !== chipId));
        floatingChipTimeoutsRef.current = floatingChipTimeoutsRef.current.filter((t) => t !== removeId);
      }, 700);

      floatingChipTimeoutsRef.current.push(removeId);
    }
  };

  const handleAdvanceClick = () => {
    // Always show popup first (as you requested)
    setActiveModal('ADVANCED');
  };

  const getSelectedChipStartPosition = (value = selectedChip) => {
    const index = chipValues.indexOf(value);
    if (index === -1) return { left: 200, top: 520 };

    // Matches your chip container hierarchy:
    // Parent: <div style={{ left: 4, top: 444 }}>
    //   Child:  <div style={{ left: 30, top: 88 }}>
    const parentLeft = 4;
    const parentTop = 444;
    const containerLeft = 30 + parentLeft;
    const containerTop = 88 + parentTop;
    const containerWidth = 340;
    const containerHeight = 80;

    const n = chipValues.length;

    // Must match the sizing logic in your render
    const baseSize = n > 5 ? 48 : 54;
    const activeSize = baseSize + 12;

    // Build the exact widths array (because active chip is bigger)
    const widths = chipValues.map((v) => (v === value ? activeSize : baseSize));
    const totalW = widths.reduce((s, w) => s + w, 0);

    // justify-evenly => (n + 1) equal gaps
    const gap = (containerWidth - totalW) / (n + 1);

    // X position = left + gap + widths before + half current width
    const beforeW = widths.slice(0, index).reduce((s, w) => s + w, 0);
    const centerX = containerLeft + gap * (index + 1) + beforeW + widths[index] / 2;
    const centerY = containerTop + containerHeight / 2;

    // flying chip rendered 44x44 => offset by 22
    return { left: centerX - 22, top: centerY - 22 };
  };

  const remainingForAdvance = Math.max(0, ADVANCE_UNLOCK_BET - lifetimeBet);
  const timerUrgent = phase === 'BETTING' && timeLeft <= 5;
  const winnerItem = pendingWin ? itemMap[pendingWin.itemId] : null;
  const rankRows = rankTab === 'TODAY' ? rankRowsToday : rankRowsYesterday;
  const remainingForAdvanceApi = advanceModeApi ? advanceModeApi.remanning_values : remainingForAdvance;
  const winAmountLabel = pendingWin ? formatNum(pendingWin.amount) : '0';
  const winAmountFontSize = winAmountLabel.length >= 8 ? 18 : winAmountLabel.length >= 6 ? 21 : 24;
  const activePointerStop = pointerStops[pointerStopIndex] ?? POINTER_BASE_POSITION;
  const activeDrawHighlightId = phase === 'DRAWING' ? DRAW_HIGHLIGHT_ORDER[drawHighlightIndex] : null;

  return (
    <ScaledArtboard width={ARTBOARD.width} height={ARTBOARD.height} metricsMode={flags.metrics}>
      <div className={`relative h-full w-full ${debugClass(DEBUG)}`} style={{ background: isAdvanceMode ? '#C46B5A' : '#8DA6DE' }}>
        <img
          src={isAdvanceMode ? '/image2/advance_bg.png' : '/image2/city_background.png'}
          alt=""
          className="absolute z-0 object-cover"
          style={{ left: 0, top: 0, width: 477, height: 735, mixBlendMode: isAdvanceMode ? 'normal' : 'overlay', opacity: 1 }}
        />


        <div
          className="absolute z-[1]"
          style={{ left: -47, top: 0, width: 477, height: 735, background: '#00000033', pointerEvents: 'none' }}
        />

        {flags.grid ? (
          <div
            className="pointer-events-none absolute inset-0 z-[999]"
            style={{
              backgroundImage:
                'linear-gradient(rgba(255,255,255,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.18) 1px, transparent 1px)',
              backgroundSize: '10px 10px',
            }}
          />
        ) : null}

        <motion.img
          src="/image2/flare.png"
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute z-10 object-contain"
          style={{ left: -27, top: 5, width: 145, height: 145 }}
          animate={{ opacity: [0.42, 0.9, 0.42], scale: [0.95, 1.05, 0.95] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* Flare behind jackpot - FIXED */}
        {/* Flare behind jackpot - FIXED VERSION */}
        {/* Flare behind jackpot - FIXED VERSION */}
        {/* Flare behind jackpot - FIXED VERSION */}
        <motion.div
          className="pointer-events-none absolute z-10 flex items-center justify-center"
          style={{
            left: 276,
            top: 5,
            width: 149,
            height: 149,
            transformOrigin: "center center", // <-- Locks the rotation point to the exact middle
          }}
          animate={{ rotate: [0, 360] }} // <-- Explicitly forces a 0 to 360 loop
          transition={{
            repeat: Infinity,
            duration: 4, // Note: 1 second is very fast! Change to 3-5 if you want a slower, glowing spin
            ease: "linear"
          }}
        >
          <img
            src="/image2/flare_circular.png"
            alt=""
            aria-hidden="true"
            className="h-full w-full object-contain"
          />
        </motion.div>




        {/* Dynamic diamond balance bar — layered from individual assets */}
        <div
          className="absolute z-30 flex items-center"
          style={{
            left: 20,
            top: 14,
            height: 28,
          }}
        >
          {/* Pill background (Rectangle 4) */}
          <div className="relative" style={{ width: 140, height: 28 }}>
            <img
              src="/image2/Rectangle 4.png"
              alt=""
              className="absolute inset-0 h-full w-full object-fill"
              style={{ borderRadius: 14 }}
            />

            {/* Diamond icon — overlapping left edge */}
            <img
              src={coinIconSrc}
              alt=""
              className="absolute object-contain"
              style={{ left: -8, top: -3, width: 32, height: 32 }}
            />

            {/* Balance text */}
            <span
              className="absolute"
              style={{
                left: 28,
                top: 0,
                height: 28,
                lineHeight: '28px',
                fontFamily: 'Inter, system-ui, sans-serif',
                fontWeight: 700,
                fontSize: 13,
                color: '#FFFFFF',
                textShadow: '0 1px 2px rgba(0,0,0,0.45)',
                letterSpacing: '0.03em',
                whiteSpace: 'nowrap',
              }}
            >
              {formatNum(balance)}
            </span>

            {/* Green + button (Ellipse 5 + Plus icon) */}
            <div
              className="absolute flex items-center justify-center"
              style={{ right: -3, top: 1, width: 26, height: 26 }}
            >
              <img
                src="/image2/Ellipse 5.png"
                alt=""
                className="absolute inset-0 h-full w-full object-contain"
              />
              <img
                src="/image2/Plus.png"
                alt=""
                className="relative object-contain"
                style={{ width: 12, height: 12 }}
              />
            </div>
          </div>
        </div>




        {/* Top action icon buttons */}
        <div className="absolute z-50 flex items-center" style={{ left: 228, top: 9, gap: 2 }}>
          {[
            {
              key: 'music',
              icon: '/image2/music.png',
              onClick: () => {
                if (!canOpenSystemModal) return;
                setMusicOn((prev) => !prev);
              },
            },
            {
              key: 'records',
              icon: '/image2/clipboard.png',
              onClick: () => {
                if (!canOpenSystemModal) return;
                setActiveModal('RECORDS');
              },
            },
            {
              key: 'rules',
              icon: '/image2/help.png',
              onClick: () => {
                if (!canOpenSystemModal) return;
                setActiveModal('RULE');
              },
            },
            {
              key: 'close',
              icon: '/image2/close.png',
              onClick: () => setActiveModal('NONE'),
            },
          ].map((iconBtn) => (
            <button
              key={iconBtn.key}
              type="button"
              onClick={iconBtn.onClick}
              className="relative flex items-center justify-center"
              style={{
                width: 40,
                height: 40,
                border: 'none',
                background: 'transparent',
                cursor: canOpenSystemModal || iconBtn.key === 'close' ? 'pointer' : 'default',
                pointerEvents: canOpenSystemModal || iconBtn.key === 'close' ? 'auto' : 'none',
                opacity: iconBtn.key === 'music' && !musicOn ? 0.5 : 1,
              }}
              aria-label={iconBtn.key}
            >
              <img
                src="/image2/Ellipse 4.png"
                alt=""
                className="absolute inset-0 h-full w-full object-contain"
              />
              <img
                src={iconBtn.icon}
                alt=""
                className="relative object-contain"
                style={{ width: 20, height: 20 }}
              />
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => {
            if (!canOpenSystemModal) return;
            setActiveModal('RANK');
          }}
          className="absolute z-40 overflow-hidden"
          style={{ left: 18, top: 53, width: 51, height: 50, borderRadius: 19.5 }}
        >
          <motion.img
            src={trophySrc}
            alt=""
            className="h-full w-full object-contain"
            animate={{ y: [0, -2.2, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          />

        </button>

        {/* Trophy coin explosion particles */}
        <AnimatePresence>
          {trophyCoins.map((coin) => (
            <motion.div
              key={coin.id}
              className="pointer-events-none absolute z-[60] rounded-full"
              style={{
                left: 43,
                top: 78,
                width: coin.size,
                height: coin.size,
                background: `radial-gradient(circle at 35% 35%, #FFE066, #FFB800, #E8960C)`,
                boxShadow: '0 0 4px rgba(255,200,50,0.8), 0 0 8px rgba(255,165,0,0.4)',
                border: '0.5px solid rgba(255,230,150,0.6)',
              }}
              initial={{ opacity: 1, scale: 0.3, x: 0, y: 0 }}
              animate={{
                x: coin.x,
                y: coin.y,
                scale: [0.3, 1.1, 0.6],
                opacity: [1, 1, 0],
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.55, ease: 'easeOut', delay: coin.delay }}
            />
          ))}
        </AnimatePresence>

        <div className="absolute z-50" style={{ left: 29, top: 98, height: 16 }}>
          <svg height="16">
            <text
              x="4"
              y="12"
              fontFamily="Inter, system-ui, sans-serif"
              fontWeight="700"
              fontSize="12"
              letterSpacing="0.08em"
              fill="#FFFFFF"
              stroke="#A45721"
              strokeWidth="1"
              strokeLinejoin="round"
              paintOrder="stroke"
            >
              99+
            </text>
          </svg>
        </div>

        <button
          type="button"
          onClick={() => {
            if (!canOpenSystemModal) return;
            setActiveModal('PRIZE');
          }}
          className="absolute z-40"
          style={{ left: 295, top: 38, width: 100, height: 72 }}
        >
          <motion.img
            src="/image2/jackpot2.png"
            alt=""
            className="h-full w-full object-contain"
            animate={{ y: [0, -2.2, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          />
          <div
            className="absolute"
            style={{
              bottom: 10, left: '50%', transform: 'translateX(-50%)',
              fontFamily: 'Inter, system-ui, sans-serif', fontWeight: 900, fontSize: 11,
              color: '#FFD700',
              WebkitTextStroke: '0.5px #4a1a00',
              textShadow: '0 1px 3px rgba(0,0,0,0.9), 0 0 6px rgba(255,180,0,0.4)',
              whiteSpace: 'nowrap', letterSpacing: '0.05em',
            }}
          >
            {formatNum(jackpotAmount)}
          </div>
        </button>

        <div
          className="absolute z-40 flex items-center"
          style={{
            left: 104,
            top: 63,
            width: 180,
            height: 27.764331817626953,
            borderRadius: 109.55,
            paddingTop: 1.5,
            paddingBottom: 1.5,
            paddingLeft: 1,
            paddingRight: 1,
            gap: 2,
            background: '#0D0D0D1A',
            border: '0.5px solid #C4530D',
          }}
        >
          <motion.div
            className="absolute"
            style={{
              left: 3,
              top: .5,
              width: 86,
              height: 24.764331817626953,
              borderRadius: 109.55,
              background: isAdvanceMode
                ? 'linear-gradient(359.93deg, #C22F19 0.06%, #E92407 61.53%)'
                : 'linear-gradient(178.63deg, #FFDB19 31.27%, #E09613 98.84%)',
              border: '0.55px solid #A45721',
            }}
            animate={{ x: mode === 'BASIC' ? 0 : 88 }}
            transition={{ type: 'spring', stiffness: 360, damping: 30 }}
          />


          <button
            type="button"
            onClick={() => setMode('BASIC')}
            className="relative z-10 flex items-center justify-center"
            style={{ width: 86, height: 24.764331817626953, borderRadius: 109.55 }}
          >
            <span
              style={{
                fontFamily: 'Inria Serif, serif',
                fontWeight: 700,
                fontSize: 14.24,
                lineHeight: '15.34px',
                letterSpacing: '-0.02em',
                color: mode === 'BASIC' ? '#4A2A12' : '#FFFFFF',
              }}
            >
              Basic
            </span>
          </button>

          <button
            type="button"
            onClick={handleAdvanceClick}
            className="relative z-10 flex items-center justify-center"
            style={{ width: 86, height: 24.764331817626953, borderRadius: 109.55 }}
          >
            <span
              style={{
                fontFamily: 'Inria Serif, serif',
                fontWeight: 700,
                fontSize: 14.24,
                lineHeight: '15.34px',
                letterSpacing: '-0.02em',
                color: mode === 'ADVANCE' ? '#4A2A12' : '#FFFFFF',
              }}
            >
              Advance
            </span>
          </button>
        </div>

        {/* ===== Ferris wheel: dim during DRAWING/SHOWTIME, spotlight only active/winner box ===== */}
        {(() => {
          const isSpinning = phase === 'DRAWING';
          const isShow = phase === 'SHOWTIME';

          const dimWheel = isSpinning || isShow;

          // Build focus ids:
          // - DRAWING => 1 (activeDrawHighlightId)
          // - SHOWTIME => winnerIds (1 for normal, 4 for jackpot)
          const focusIds: ItemId[] =
            isSpinning && activeDrawHighlightId
              ? [activeDrawHighlightId]
              : isShow && winnerIds && winnerIds.length > 0
                ? winnerIds
                : [];

          // Precompute rects + centerY for clip math
          const focusRects = focusIds
            .map((id) => {
              const item = itemMap[id];
              if (!item) return null;
              return {
                id,
                rect: getWheelFocusRect(item),
                centerY: item.top + item.height / 2,
              };
            })
            .filter(Boolean) as Array<{ id: ItemId; rect: { left: number; top: number; width: number; height: number }; centerY: number }>;

          return (
            <>
              {/* base wheel (dimmed when spinning/showing) */}
              <motion.img
                src="/image2/ferris-wheel.png"
                alt=""
                className="pointer-events-none absolute z-20 object-contain"
                style={{
                  left: WHEEL.left,
                  top: WHEEL.top,
                  width: WHEEL.width,
                  height: WHEEL.height,
                  opacity: dimWheel ? 0.55 : 1,
                  filter: dimWheel ? 'brightness(0.85) saturate(0.85)' : undefined,
                }}
              />

              {/* spotlight wheel areas (1 in normal, 4 in jackpot) */}
              {focusRects.length > 0 ? (
                <>
                  {focusRects.map(({ id, rect, centerY }) => (
                    <div
                      key={`spot-${id}`}
                      className="pointer-events-none absolute z-[23]"
                      style={{
                        left: WHEEL.left,
                        top: WHEEL.top,
                        width: WHEEL.width,
                        height: WHEEL.height,
                        clipPath: wheelClipPathForRect(rect, centerY),
                        WebkitClipPath: wheelClipPathForRect(rect, centerY),
                      }}
                    >
                      <img
                        src="/image2/ferris-wheel.png"
                        alt=""
                        className="h-full w-full object-contain"
                        style={{ filter: 'brightness(1.02) saturate(1.02)' }}
                        draggable={false}
                      />
                    </div>
                  ))}
                </>
              ) : null}
            </>
          );
        })()}

        {/* Wooden signboard — always visible */}
        <motion.img
          src="/image2/greedy_sign_board.png"
          alt=""
          className="absolute z-30 object-contain"
          style={{
            left: 110,
            top: 185,
            width: 196,
            height: 196,
            filter: 'drop-shadow(0px 4px 4px rgba(0,0,0,0.25))',
          }}
          transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* Text overlay — always use local wordmark for consistent display */}
        <img
          src="/image2/greedy_wordmark.png"
          alt=""
          className="absolute z-31 object-contain"
          style={{ left: 122, top: 193, width: 171, height: 114 }}
        />

        <AnimatePresence>
          {canBet ? (
            <motion.img
              key="betting-pointer"
              src="/image2/select_items.png"
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute z-35 object-contain"
              style={{ width: POINTER_SIZE.width, height: POINTER_SIZE.height }}
              initial={{ opacity: 0 }}
              animate={{
                opacity: 1,
                left: activePointerStop.left,
                top: activePointerStop.top,
                y: [0, 5, 0],
                scale: [1, 0.96, 1],
                rotate: 0,
              }}
              exit={{ opacity: 0 }}
              transition={{
                opacity: { duration: 0.14 },
                left: { duration: 0.6, ease: 'easeInOut' },
                top: { duration: 0.6, ease: 'easeInOut' },
                y: { duration: 0.46, times: [0, 0.5, 1], ease: 'easeInOut' },
                scale: { duration: 0.46, times: [0, 0.5, 1], ease: 'easeInOut' },
              }}
            />
          ) : null}
        </AnimatePresence>

        <div
          className="absolute z-40 flex items-center justify-center"
          style={{
            left: 150,
            top: 304,
            width: 120,
            height: 16,
            fontFamily: 'Inter, system-ui, sans-serif',
            fontWeight: 700,
            fontSize: 14.24,
            lineHeight: '15.34px',
            letterSpacing: '-0.02em',
            color: '#FFFFFF',
          }}
        >
          {phase === 'BETTING' ? 'Bet Time' : phase === 'DRAWING' ? 'Drawing' : 'Show Time'}
        </div>

        <motion.div
          className="absolute z-40 flex items-center justify-center"
          style={{
            left: 170,
            top: 324.69,
            width: 80,
            height: 16,
            transform: 'rotate(1.88deg)',
            transformOrigin: 'center',
            fontFamily: 'Inter, system-ui, sans-serif',
            fontWeight: 700,
            fontSize: 22,
            lineHeight: '15.34px',
            letterSpacing: '-0.02em',
            color: '#FFFFFF',
            textShadow: '1px 2px 0px #000000',
          }}
          animate={{
            scale: phase === 'BETTING' ? [1, 1.08, 1] : [1, 1.02, 1],
            x: timerUrgent ? [0, -1.4, 1.2, -1, 0] : 0,
            textShadow: timerUrgent
              ? ['1px 2px 0px #000000', '0px 0px 10px #FFFFFF, 1px 2px 0px #000000', '1px 2px 0px #000000']
              : ['1px 2px 0px #000000', '1px 2px 3px #000000', '1px 2px 0px #000000'],
          }}
          transition={{ duration: timerUrgent ? 0.65 : 1, repeat: Infinity, ease: 'easeInOut' }}
        >
          {timeLeft}s
        </motion.div>

        {ITEMS.map((it) => {
          const betAmt = bets[it.id] ?? 0;
          const isDrawingActive = phase === 'DRAWING' && activeDrawHighlightId === it.id;
          const isShowWinner = phase === 'SHOWTIME' && (winnerIds?.includes(it.id) ?? false);
          const justPulsed = itemPulse.id === it.id;

          return (
            <motion.button
              key={it.id}
              type="button"
              onClick={() => placeBet(it.id)}
              className="absolute z-30 border-none bg-transparent p-0"
              style={{ left: it.left, top: it.top, width: it.width, height: it.height, cursor: canBet ? 'pointer' : 'default' }}
              whileTap={canBet ? { scale: 0.95 } : undefined}
              whileHover={canBet ? { scale: 1.03 } : undefined}
              animate={
                isShowWinner
                  ? { scale: [1, 1.1, 1], opacity: 1 }
                  : phase === 'DRAWING'
                    ? { opacity: isDrawingActive ? 1 : 0.55, scale: isDrawingActive ? 1.06 : 0.98 }
                    : phase === 'SHOWTIME'
                      ? { opacity: isShowWinner ? 1 : 0.65, scale: isShowWinner ? 1.06 : 1 }
                      : justPulsed
                        ? { scale: [1, 1.12, 1], opacity: 1 }
                        : { scale: 1, opacity: 1 }
              }
              transition={
                isShowWinner
                  ? { duration: 0.6, repeat: Infinity, ease: 'easeInOut' }
                  : phase === 'DRAWING'
                    ? { duration: 0.14, ease: 'easeOut' }
                    : justPulsed
                      ? { duration: 0.28, ease: 'easeOut' }
                      : { duration: 0.2 }
              }
              disabled={!canBet}
            >
              <img
                src={it.src}
                alt=""
                className="h-full w-full object-contain"
                style={{
                  transform: it.rotate != null ? `rotate(${it.rotate}deg)` : undefined,
                  filter:
                    phase === 'DRAWING'
                      ? isDrawingActive
                        ? 'brightness(1.05) saturate(1.1) drop-shadow(0 0 12px rgba(255,235,110,0.55))'
                        : 'brightness(0.75) saturate(0.75)'
                      : phase === 'SHOWTIME'
                        ? isShowWinner
                          ? 'brightness(1.05) saturate(1.1) drop-shadow(0 0 14px rgba(255,235,110,0.65))'
                          : 'brightness(0.7) saturate(0.7)'
                        : undefined,
                }}
              />

              {/* ── Winner starburst sparkle effect ── */}
              {isShowWinner && (
                <div className="pointer-events-none absolute inset-0 z-[-1] overflow-visible" style={{ left: '50%', top: '50%', width: 0, height: 0 }}>
                  {/* Radial light rays */}
                  {Array.from({ length: 12 }).map((_, i) => (
                    <motion.div
                      key={`ray-${i}`}
                      className="absolute"
                      style={{
                        left: 0,
                        top: 0,
                        width: 3,
                        height: 50,
                        background: 'linear-gradient(180deg, rgba(255,255,200,0.9) 0%, rgba(255,255,100,0) 100%)',
                        transformOrigin: '50% 0%',
                        transform: `rotate(${i * 30}deg)`,
                        borderRadius: 2,
                      }}
                      initial={{ opacity: 0, scaleY: 0.3 }}
                      animate={{
                        opacity: [0, 0.9, 0.5, 0.9],
                        scaleY: [0.3, 1.2, 0.8, 1.2],
                      }}
                      transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut', delay: i * 0.05 }}
                    />
                  ))}

                  {/* Sparkle dots */}
                  {Array.from({ length: 16 }).map((_, i) => {
                    const angle = (i / 16) * Math.PI * 2;
                    const dist = 30 + Math.random() * 25;
                    return (
                      <motion.div
                        key={`spark-${i}`}
                        className="absolute rounded-full"
                        style={{
                          width: 4 + Math.random() * 4,
                          height: 4 + Math.random() * 4,
                          background: ['#FFCC00', '#FFE866', '#FFFFFF', '#FF9500'][i % 4],
                          boxShadow: `0 0 8px ${['#FFCC00', '#FFE866', '#FFFFFF', '#FF9500'][i % 4]}`,
                        }}
                        initial={{ opacity: 0, x: 0, y: 0, scale: 0 }}
                        animate={{
                          opacity: [0, 1, 0.8, 0],
                          x: [0, Math.cos(angle) * dist, Math.cos(angle) * (dist + 15)],
                          y: [0, Math.sin(angle) * dist, Math.sin(angle) * (dist + 15)],
                          scale: [0, 1.3, 0.5],
                        }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'easeOut', delay: i * 0.06 }}
                      />
                    );
                  })}

                  {/* Central glow */}
                  <motion.div
                    className="absolute rounded-full"
                    style={{
                      left: -30,
                      top: -30,
                      width: 60,
                      height: 60,
                      background: 'radial-gradient(circle, rgba(255,255,200,0.6) 0%, rgba(255,200,0,0.2) 50%, transparent 70%)',
                    }}
                    animate={{ scale: [0.8, 1.3, 0.8], opacity: [0.5, 0.9, 0.5] }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
                  />
                </div>
              )}

              <motion.div
                className="absolute flex items-center justify-center"
                style={{
                  left: Number(it.badge.left) - Number(it.left),
                  top: Number(it.badge.top) - Number(it.top),
                  height: it.badge.height,
                  paddingLeft: 3,
                  paddingRight: 3,
                  fontFamily: 'Inter, system-ui, sans-serif',
                  fontWeight: 800,
                  fontSize: 15,
                  lineHeight: '15.34px',
                  letterSpacing: '0.08em',
                  WebkitTextFillColor: '#FFFFFF',
                  WebkitTextStroke: '2px #A45721',
                  paintOrder: 'stroke fill',
                }}
                animate={isShowWinner ? { opacity: [0.4, 1, 0.4, 1] } : { opacity: 1 }}
                transition={isShowWinner ? { duration: 0.8, repeat: Infinity } : { duration: 0.2 }}
              >
                {badgeOverrides[it.id] || it.badge.text}
              </motion.div>

              {betAmt > 0 ? ( // REMOVED: `&& it.betLabel` dependency
                <div
                  className="pointer-events-none absolute z-40 flex items-center justify-center rounded-full"
                  style={{
                    // 1. Center horizontally by setting left to 50% and translating back by 50%
                    left: '50%',
                    transform: 'translateX(-50%)',

                    // 2. Position it at the bottom edge of the item (adjust -8 or -12 if you want it higher/lower)
                    bottom: -20,

                    height: 16,
                    paddingLeft: 6,
                    paddingRight: 6,
                    gap: 3,
                    background: 'linear-gradient(180deg, #7CFF6A 0%, #25C640 100%)',
                    border: '1px solid rgba(0,0,0,0.25)',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
                    whiteSpace: 'nowrap', // Prevents it from wrapping if the number gets big
                  }}
                >
                  <span
                    style={{
                      color: '#0b2a12',
                      fontFamily: 'Inter, system-ui, sans-serif',
                      fontWeight: 800,
                      fontSize: 10.5,
                      lineHeight: '10px',
                    }}
                  >
                    Bet
                  </span>
                  <img src="/image2/blumond.png" alt="" className="h-[10px] w-[10px] rounded-full object-cover" />
                  <span
                    style={{
                      color: '#0b2a12',
                      fontFamily: 'Inter, system-ui, sans-serif',
                      fontWeight: 800,
                      fontSize: 10.5,
                      lineHeight: '10px',
                    }}
                  >
                    {formatNum(betAmt)}
                  </span>
                </div>
              ) : null}
            </motion.button>
          );
        })}

        <AnimatePresence initial={false}>
          {floatingBetChips.map((chip) => (
            <motion.img
              key={chip.id}
              src={chip.src}
              alt=""
              className="pointer-events-none absolute z-[130] object-contain"
              style={{ left: chip.left, top: chip.top, width: 44, height: 44 }}
              initial={{ scale: 1, x: 0, y: 0, opacity: 1 }}
              animate={{
                x: chip.endLeft - chip.left,
                y: chip.endTop - chip.top,
                scale: [1, 1.1, 0.95],
              }}
              exit={{ opacity: 0 }}
              transition={{
                duration: 0.55,
                ease: [0.22, 1, 0.36, 1], // smooth arc feeling
              }}
            />

          ))}
        </AnimatePresence>

        <div className="absolute z-50" style={{ left: 4, top: 444, width: 394, height: 72 }}>
          {/* flares behind tabs (both modes) */}
          <motion.img
            src="/image2/flare.png"
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute z-[1] object-contain"
            style={{ left: -60, top: -83, width: 200, height: 200 }}
            animate={{ opacity: [0.35, 0.85, 0.35], scale: [0.92, 1.06, 0.92] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.img
            src="/image2/flare.png"
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute z-[1] object-contain"
            style={{ left: 256, top: -85, width: 200, height: 200 }}
            animate={{ opacity: [0.35, 0.9, 0.35], scale: [0.92, 1.08, 0.92] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut', delay: 0.15 }}
          />

          {/* tabs (stay above flare) */}
          <button
            type="button"
            onClick={() => placeGroupBet(VEG_ITEMS)}
            disabled={!canBet}
            className="absolute z-10 p-0 border-none bg-transparent"
            style={{
              left: 0,
              top: 0,
              width: 75,
              height: 72,
              cursor: canBet ? 'pointer' : 'default',
              opacity: 1,                 // ✅ never fade
              pointerEvents: canBet ? 'auto' : 'none',
            }}
          >
            <img
              src="/image2/tab_vegetables.png"
              alt="Vegetables"
              className="h-full w-full object-contain"
              draggable={false}
            />
          </button>

          <button
            type="button"
            onClick={() => placeGroupBet(DRINK_ITEMS)}
            disabled={!canBet}
            className="absolute z-10 p-0 border-none bg-transparent"
            style={{
              left: 315,
              top: 1,
              width: 79,
              height: 68,
              cursor: canBet ? 'pointer' : 'default',
              opacity: 1,                 // ✅ never fade
              pointerEvents: canBet ? 'auto' : 'none',
            }}
          >
            <img
              src="/image2/tab_drinks.png"
              alt="Drinks"
              className="h-full w-full object-contain"
              draggable={false}
            />
          </button>


          <div
            className="absolute z-20"
            style={{
              left: 77,
              top: 38, // Shifted up slightly from 41 to keep it visually balanced with the new height
              width: 234,
              height: 34, // <-- Increased height (was 26)
              borderRadius: 200,

              background: isAdvanceMode ? '#6F372F' : '#0F6095',
              border: isAdvanceMode ? '1.5px solid #E92407' : '1.5px solid #92D0F9',

              // advance mode shadows exactly as you gave
              boxShadow: isAdvanceMode
                ? 'inset 0px 0px 8px 0px #0000004D, 0px 0px 12px 0px #00000066'
                : 'inset 0px 0px 8px rgba(0,0,0,0.30), 0px 0px 12px rgba(0,0,0,0.40)',
            }}
          >

            <div
              className="absolute z-10 flex items-center whitespace-nowrap"
              style={{
                left: 14,
                top: '50%', // Centers text vertically perfectly
                transform: 'translateY(-50%)',
                fontFamily: 'Inter, system-ui, sans-serif',
                fontWeight: 700,
                fontSize: 15, // <-- Increased text size (was 12)
                letterSpacing: '-0.02em',
                color: '#FFFFFF',
              }}
            >
              TODAY&apos;S WIN
            </div>

            <div
              className="absolute z-10 flex items-center justify-center"
              style={{
                right: 14, // Bumped slightly from 12 for better padding with larger text
                top: '50%', // Centers amount vertically perfectly
                transform: 'translateY(-50%)',
                fontFamily: 'Inria Serif, serif',
                fontWeight: 800, // Made slightly bolder for the larger font
                fontSize: 19, // <-- Increased amount text size (was 14.24)
                letterSpacing: '-0.02em',
                WebkitTextFillColor: '#ffee00',
                WebkitTextStrokeWidth: '1px',
                WebkitTextStrokeColor: '#A45721',
                paintOrder: 'stroke fill',
              }}
            >
              {formatNum(todayWin)}
            </div>
          </div>
        </div>

        <div
          className="absolute"
          style={{
            left: 0,
            top: 477,
            width: 402,
            height: 297,
            background: isAdvanceMode ? '#72342B' : '#2B93CA',
            zIndex: 5,
          }}
        />


        <div className="absolute z-40 overflow-hidden" style={{ left: 4, top: 444, width: 394, height: 281, borderRadius: 32 }}>
          <img
            src={isAdvanceMode ? '/image2/curtain_red.png' : '/image2/curtain.png'}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute z-0"
            style={{ left: 0, right: 0, top: 32.91, width: '100%', height: 81.2218246459961, objectFit: 'fill' }}
          />


          <motion.div
            className="absolute z-10"
            style={{
              left: 25,
              top: 79,
              width: 345,
              height: 101,
              borderRadius: 20,
              background: isAdvanceMode ? '#D95B48' : '#0F6095',
              border: isAdvanceMode ? '5px solid #E92407' : '5px solid #1087C6',
            }}

            animate={phase === 'DRAWING' ? { opacity: 0.72 } : { opacity: 1 }}
            transition={{ duration: 0.24 }}
          />

          {/* ── Dynamic chip slider ── */}
          <div
            className="absolute z-20 flex items-center justify-evenly"
            style={{
              left: 30,
              top: 88,
              width: 340,
              height: 80,
              pointerEvents: canBet ? 'auto' : 'none',
            }}
          >
            {chipValues.map((value) => {
              const active = value === selectedChip;
              const imgSrc = CHIP_IMAGE_MAP[value] || '/image2/chip_10.png';
              const chipSize = chipValues.length > 5 ? 48 : 54;
              const activeSize = chipSize + 12;

              return (
                <motion.button
                  key={value}
                  type="button"
                  onClick={() => {
                    if (!canBet) return;
                    setSelectedChip(value);
                  }}
                  className="shrink-0 border-none bg-transparent p-0"
                  style={{
                    width: active ? activeSize : chipSize,
                    height: active ? activeSize : chipSize,
                    cursor: canBet ? 'pointer' : 'default',
                    filter: active
                      ? 'drop-shadow(0px 0px 16px rgba(255,255,255,0.65))'
                      : 'drop-shadow(0px 0px 12px rgba(0,0,0,0.55))',
                    borderRadius: 999,
                  }}
                  animate={{ scale: active ? 1.08 : 1 }}
                  transition={{ type: 'spring', stiffness: 360, damping: 26 }}
                  whileTap={canBet ? { scale: 0.94 } : undefined}
                >
                  <img src={imgSrc} alt={`${value}`} className="h-full w-full object-contain" />
                </motion.button>
              );
            })}
          </div>

          <div
            className="absolute z-10 overflow-hidden"
            style={{
              left: 25,
              top: 203,
              width: 343,
              height: 18,
              borderRadius: 20,
              background: isAdvanceMode ? '#D95B48' : '#0F6095',
              border: isAdvanceMode ? '1px solid #E92407' : '1px solid #1087C6',
            }}
          >
            <motion.div
              style={{ height: '100%', background: 'linear-gradient(180deg, #7CFF6A 0%, #25C640 100%)' }}
              animate={{ width: `${Math.max(0, Math.min(100, progressRatio * 100))}%` }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
            />
          </div>

          {/* ── Dynamic chests from API ── */}
          {/* ── Dynamic chests from API (shake + flare when ready, clickable only when ready) ── */}
          {/* ── Dynamic chests from API (shake + flare when ready, clickable only when ready) ── */}
          {/* ── Dynamic chests from API (shake + flare when ready, clickable only when ready) ── */}
          {/* ── Dynamic chests from API (shake + flare when ready, clickable only when ready) ── */}
          {boxData.map((box, idx) => {
            const totalBoxes = boxData.length;
            const containerWidth = 310;
            const boxWidth = 56;
            const spacing = totalBoxes > 1 ? (containerWidth - boxWidth) / (totalBoxes - 1) : 0;
            const xPos = 47 + idx * spacing;

            const threshold = BOX_THRESHOLDS[idx] ?? BOX_THRESHOLDS[BOX_THRESHOLDS.length - 1];
            const opened = !!openedChests[threshold];
            const ready = isChestReady(threshold);

            const closedSrc = box.src;
            const openSrc = box.openSrc || CHEST_OPEN_SRC_BY_THRESHOLD[threshold] || closedSrc;
            const chestSrc = opened ? openSrc : closedSrc;

            const flareSize = boxWidth + 60;

            return (
              <button
                key={`${threshold}-${idx}`}
                type="button"
                onClick={() => openChest(threshold)}
                className="absolute z-20 p-0 border-none bg-transparent"
                style={{
                  left: xPos,
                  top: 180,
                  width: boxWidth,
                  height: boxWidth,
                  cursor: ready ? 'pointer' : 'default',
                  pointerEvents: ready ? 'auto' : 'none',
                }}
                aria-label={`Chest ${threshold}`}
              >
                <AnimatePresence>
                  {ready ? (
                    <motion.div
                      className="pointer-events-none absolute"
                      style={{
                        left: (boxWidth - flareSize) / 2,
                        top: (boxWidth - flareSize) / 2 - 8,
                        width: flareSize,
                        height: flareSize,
                        zIndex: 0,
                      }}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 0.95, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ opacity: { duration: 0.2 }, scale: { duration: 0.2 } }}
                    >
                      <motion.img
                        src="/image2/flare_circular.png"
                        alt=""
                        aria-hidden="true"
                        className="absolute object-contain"
                        style={{
                          left: 0,
                          top: 0,
                          width: '100%',
                          height: '100%',
                          transformOrigin: '50% 50%',
                        }}
                        animate={{ rotate: 360 }}
                        transition={{
                          repeat: Infinity,
                          duration: 4,
                          ease: 'linear',
                          repeatType: 'loop',
                        }}
                      />
                    </motion.div>
                  ) : null}
                </AnimatePresence>

                <motion.img
                  src={chestSrc}
                  alt=""
                  className="absolute object-contain"
                  style={{ left: 0, top: 0, width: boxWidth, height: boxWidth, zIndex: 1 }}
                  animate={
                    ready
                      ? { x: [0, -2, 2, -2, 2, 0], rotate: [0, -2, 2, -2, 2, 0], scale: [1, 1.03, 1] }
                      : { x: 0, rotate: 0, scale: 1 }
                  }
                  transition={ready ? { duration: 0.55, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
                />

                {/* Label below chest */}
                <span
                  className="absolute text-center pointer-events-none"
                  style={{
                    left: '50%',
                    transform: 'translateX(-50%)',
                    top: boxWidth - 10,
                    width: 70,
                    color: '#FFD866',
                    fontFamily: 'Inter, system-ui, sans-serif',
                    fontWeight: 700,
                    fontSize: 11,
                    lineHeight: '13px',
                    textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                    zIndex: 2,
                  }}
                >
                  {box.label}
                </span>
              </button>
            );
          })}
          <div
            className="absolute z-10"
            style={{
              left: 27,
              top: 244,
              width: 343,
              height: 45,
              borderRadius: 12,
              background: isAdvanceMode ? '#D95B48' : '#0F6095',
              border: isAdvanceMode ? '2px solid #E92407' : '2px solid #1087C6',
              boxShadow: isAdvanceMode ? '0px 1px 0px 0px #A87C75' : '0px 1px 0px #4ABAF9',
            }}
          />


          <div className="absolute z-20 flex items-center" style={{ left: 40, top: 258, width: 43, height: 16, fontFamily: 'Inter, system-ui, sans-serif', fontWeight: 700, fontSize: 14.24, lineHeight: '15.34px', letterSpacing: '-0.02em', color: '#FFFFFF' }}>
            Result
          </div>

          <div className="absolute z-20" style={{
            left: 92.5, top: 254, width: 0, height: 24, borderLeft: '1px solid', borderImageSource: isAdvanceMode
              ? 'linear-gradient(180deg, #D95B48 -6.25%, #FFFFFF 50%, #D95B48 106.25%)'
              : 'linear-gradient(180deg, #0F6095 -6.25%, #FFFFFF 50%, #0F6095 106.25%)',
            borderImageSlice: 1
          }} />

          {RESULT_POSITIONS.map((pos, idx) => {
            const src = resultSrcs[idx];
            if (!src) return null;
            return (
              <img key={`${src}-${idx}`} src={src} alt="" className="absolute z-20 object-contain" style={{ left: pos.left - 4, top: pos.top - 436, width: pos.width, height: pos.height, transform: pos.rotate ? `rotate(${pos.rotate}deg)` : undefined, transformOrigin: 'center' }} />
            );
          })}
        </div>

        <AnimatePresence>
          {showGameOn ? (
            <motion.div className="absolute inset-0 z-[140]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
              <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(2.6px)' }} />
              <motion.div className="absolute left-0 overflow-hidden" style={{ top: 353, width: 402, height: 74 }} initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -8, opacity: 0 }} transition={{ type: 'spring', stiffness: 340, damping: 26 }}>
                <img src="/image2/banner_game_on.png" alt="Game on" className="absolute left-0" style={{ width: 402, height: 408, top: -334 }} />
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {showPreDraw ? (
            <motion.div
              className="absolute inset-0 z-[160]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              {/* background dim + blur */}
              <div
                className="absolute inset-0"
                style={{ background: 'rgba(0,0,0,0.22)', backdropFilter: 'blur(3px)' }}
              />

              {/* banner centered, NOT stretched */}
              <motion.div
                className="absolute left-0 right-0 flex justify-center"
                style={{ top: 120 }}
                initial={{ scale: 0.98, opacity: 0, y: 10 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.995, opacity: 0, y: -8 }}
                transition={{ type: 'spring', stiffness: 260, damping: 22 }}
              >
                <img
                  src="/image2/game_on.png"
                  alt="Game On"
                  style={{
                    width: ARTBOARD.width, // 402
                    height: 'auto',        // ✅ keeps ratio (no stretch)
                    display: 'block',
                  }}
                />
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>



        <AnimatePresence>
          {showResultBoard && pendingWin ? (
            <motion.div
              className="absolute inset-0 z-[520]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.34)', backdropFilter: 'blur(2px)' }} />

              {/* ✅ WIN PANEL — Trophy animation */}
              {resultKind === 'WIN' && winnerIds && winnerIds.length > 0 ? (
                <TrophyWinOverlay
                  chipSrc={CHIP_IMAGE_MAP[selectedChip] || '/image2/chip_100.png'}
                  bets={bets}
                  winnerItems={winnerIds.map((id) => itemMap[id]).filter(Boolean)}
                  winAmountLabel={winAmountLabel}
                  rankRows={topWinnersRows.map(r => ({ name: r.name, diamonds: r.amount, pic: r.pic }))}
                  roundType={roundType}
                  winnerIds={winnerIds}
                />
              ) : (
                /* ✅ NO BET + LOSE PANEL */
                <div className="absolute" style={{ left: 26, top: 300, width: 350, height: 340, overflow: 'hidden' }}>
                  <img src="/image2/panel_scoreboard_blank.png" alt="" className="absolute inset-0 h-full w-full object-fill" />

                  {/* ── Header: inside the rounded pill-shaped strip ── */}
                  <div className="absolute flex items-center" style={{ left: 30, top: 72, width: 290, height: 42 }}>
                    <div
                      className="shrink-0 flex items-center justify-center"
                      style={{ width: 44, height: 44 }}
                    >
                      <img
                        src={winnerItem ? winnerItem.src : '/image2/lemon.png'}
                        alt=""
                        className="h-[34px] w-[34px] object-contain drop-shadow-md"
                      />
                    </div>

                    <div className="mx-2 shrink-0" style={{ width: 2, height: 24, background: 'rgba(255,255,255,0.3)' }} />

                    <div
                      className="flex-1 flex items-center justify-start pl-2"
                      style={{
                        color: '#fff',
                        fontFamily: 'Inter, system-ui, sans-serif',
                        fontSize: 15,
                        fontWeight: 700,
                        lineHeight: '18px',
                        textShadow: '0 1px 2px rgba(0,0,0,0.6)',
                      }}
                    >
                      {resultKind === 'NOBET'
                        ? 'You did not bet in this round'
                        : 'Better luck next round'}
                    </div>
                  </div>

                  {/* ── Leaderboard rows — inside body area below header strip ── */}
                  {topWinnersRows.slice(0, 3).map((row, idx) => (
                    <div
                      key={`${row.name}-${idx}`}
                      className="absolute flex items-center"
                      style={{ left: 33, top: 130 + idx * 52, width: 270, height: 50 }}
                    >
                      <img
                        src={['/image2/first1.png', '/image2/second2.png', '/image2/third3.png'][idx]}
                        alt=""
                        style={{ width: 38, height: 38, objectFit: 'contain', flexShrink: 0 }}
                      />
                      {row.pic && (
                        <img
                          src={row.pic}
                          alt=""
                          style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, marginLeft: 4, border: '2px solid rgba(255,255,255,0.5)' }}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      )}
                      <div
                        style={{
                          marginLeft: 10,
                          width: 100,
                          flexShrink: 0,
                          color: '#fff',
                          fontFamily: 'Inria Serif, serif',
                          fontStyle: 'italic',
                          fontSize: 22,
                          fontWeight: 700,
                          lineHeight: '24px',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                        }}
                      >
                        {row.name}
                      </div>

                      <div className="flex items-center" style={{ gap: 5, marginLeft: 'auto', flexShrink: 0, width: 90, paddingLeft: 8 }}>
                        <img src="/image2/diamond.png" alt="" style={{ width: 20, height: 20, flexShrink: 0 }} />
                        <span
                          style={{
                            color: '#ffe8a9',
                            fontFamily: 'Inter, system-ui, sans-serif',
                            fontWeight: 700,
                            fontSize: 18,
                            lineHeight: '18px',
                            textShadow: '0 1px 2px rgba(0,0,0,0.6)',
                            whiteSpace: 'nowrap',
                            width: 65,
                            textAlign: 'right',
                          }}
                        >
                          {formatK(row.amount)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {chestPopup ? (
            <motion.div
              className="absolute inset-0 z-[800]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              {/* dim + blur */}
              <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)' }} />

              {/* popup content */}
              <motion.div
                className="absolute left-1/2 -translate-x-1/2"
                style={{ top: 120, width: 340, height: 520 }}
                initial={{ scale: 0.92, y: 18, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.95, y: 10, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 280, damping: 22 }}
              >
                {/* Congratulations image */}
                <img
                  src="/image2/congratulations.png"
                  alt="Congratulations"
                  className="absolute left-1/2 -translate-x-1/2 object-contain"
                  style={{
                    top: -10,
                    width: 340,     // bigger
                    height: 'auto', // keep ratio (no stretch)
                  }}
                />

                {/* Diamonds pile */}
                <img
                  src="/image2/diamonds.png"
                  alt=""
                  className="absolute left-1/2 -translate-x-1/2 object-contain"
                  style={{ top: 92, width: 260, height: 200 }}
                />

                {/* Blumond + amount (matches your typography requirements) */}
                <div
                  className="absolute left-1/2 -translate-x-1/2 flex items-center"
                  style={{ top: 305, gap: 10 }}
                >
                  <img src="/image2/blumond.png" alt="" className="object-contain" style={{ width: 60, height: 40 }} />
                  <span
                    style={{
                      fontFamily: 'Inria Serif, serif',
                      fontWeight: 700,
                      fontStyle: 'normal',
                      fontSize: 26,
                      lineHeight: '100%',
                      letterSpacing: '0%',
                      color: '#FFFFFF',
                      textShadow: '0 2px 0 rgba(0,0,0,0.35)',
                    }}
                  >
                    {formatNum(chestPopup.amount)}
                  </span>
                </div>

                {/* Close button */}
                <button
                  type="button"
                  onClick={() => setChestPopup(null)}
                  className="absolute left-1/2 -translate-x-1/2"
                  style={{ top: 360, width: 54, height: 54 }}
                  aria-label="Close chest reward"
                >
                  <img src="/image2/close.png" alt="" className="h-full w-full object-contain" />
                </button>
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>
        <AnimatePresence>{showFireworks ? <FireworksOverlay key={`fireworks-${fireworksSeed}`} seed={fireworksSeed} /> : null}</AnimatePresence>

        <AnimatePresence>
          {activeModal !== 'NONE' ? (
            <motion.div
              className="absolute inset-0 z-[700]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <button
                type="button"
                onClick={() => setActiveModal('NONE')}
                className="absolute inset-0"
                style={{ background: 'rgba(0,0,0,0.48)', backdropFilter: 'blur(4px)' }}
              />

              <div
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                style={{ width: 326, height: 430 }}
              >
                {activeModal === 'RULE' ? (
                  <div className="h-full w-full rounded-[22px] border-[5px] border-[#f09c16] bg-gradient-to-b from-[#fff3cc] to-[#ffdd9d] p-3">
                    <div className="mx-auto mb-2 flex h-[44px] w-[160px] items-center justify-center rounded-[999px] bg-gradient-to-b from-[#d81f2f] to-[#900f16] text-[24px] font-bold text-[#ffd64f]">
                      Rules
                    </div>
                    <div className="overflow-y-auto" style={{ maxHeight: 340 }}>
                      {apiRules.length > 0 ? (
                        <ol className="list-decimal space-y-2 pl-5 text-[14px] text-[#7b471d]">
                          {apiRules.map((rule, idx) => (
                            <li key={idx}>{rule}</li>
                          ))}
                        </ol>
                      ) : (
                        <img src="/image2/popup_rules.png" alt="" className="h-full w-full object-fill" />
                      )}
                      {apiRulesVersion && (
                        <div className="mt-3 text-right text-[11px] text-[#b58a55]">{apiRulesVersion}</div>
                      )}
                    </div>
                  </div>
                ) : null}

                {activeModal === 'RECORDS' ? (
                  <div className="h-full w-full rounded-[22px] border-[5px] border-[#f09c16] bg-gradient-to-b from-[#fff3cc] to-[#ffdd9d] p-3">
                    <div className="mx-auto mb-2 flex h-[44px] w-[210px] items-center justify-center rounded-[999px] bg-gradient-to-b from-[#d81f2f] to-[#900f16] text-[22px] font-bold text-[#ffd64f]">
                      Game Records
                    </div>
                    <div className="overflow-y-auto" style={{ maxHeight: 340 }}>
                      {apiPlayerRecords.length > 0 ? (
                        <>
                          <div className="mb-1 flex items-center justify-between rounded-[8px] bg-[#e9b273] px-2 py-1 text-[12px] font-bold text-[#6d3712]">
                            <span style={{ width: 50 }}>Round</span>
                            <span style={{ width: 70 }}>Element</span>
                            <span style={{ width: 50, textAlign: 'right' }}>Bet</span>
                            <span style={{ width: 50, textAlign: 'right' }}>Win</span>
                          </div>
                          {apiPlayerRecords.map((r, idx) => (
                            <div key={idx} className="flex items-center justify-between border-b border-[#e9c08a] px-2 py-[4px] text-[12px] text-[#7b471d]">
                              <span style={{ width: 50 }}>{r.round ?? '-'}</span>
                              <span style={{ width: 70 }}>{r.element ?? '-'}</span>
                              <span style={{ width: 50, textAlign: 'right' }}>{r.bet != null ? formatNum(r.bet) : '-'}</span>
                              <span style={{ width: 50, textAlign: 'right', color: (r.win ?? 0) > 0 ? '#2d8a1e' : '#7b471d' }}>{r.win != null ? formatNum(r.win) : '-'}</span>
                            </div>
                          ))}
                        </>
                      ) : records.length > 0 ? (
                        records.map((rec, idx) => (
                          <div key={idx} className="border-b border-[#e9c08a] px-2 py-[4px] text-[12px] text-[#7b471d]">
                            Round {rec.round} | {rec.winner.join(', ')} | Win: {formatNum(rec.win)}
                          </div>
                        ))
                      ) : (
                        <div className="py-8 text-center text-[14px] text-[#b58a55]">
                          No records yet. Play some rounds!
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}

                {activeModal === 'PRIZE' ? (
                  <div className="h-full w-full rounded-[22px] border-[5px] border-[#f09c16] bg-gradient-to-b from-[#fff3cc] to-[#ffdd9d] p-4 text-[#8f4f1f]">
                    <div className="mx-auto mb-3 flex h-[44px] w-[200px] items-center justify-center rounded-[14px] bg-gradient-to-b from-[#ffcb1d] to-[#f6a602] text-[22px] font-bold text-[#7a3c08]">
                      Prize distribution
                    </div>
                    {(prizeData ? (isAdvanceMode ? prizeData.advance : prizeData.general) : null)?.ranks ? (
                      <div className="rounded-[10px] bg-[#e9b273] p-2 text-[15px]">
                        <div className="mb-1 flex items-center justify-between border-b border-[#d4994a] pb-1 text-[13px] font-bold text-[#6d3712]">
                          <span style={{ width: 60 }}>Rank</span>
                          <span>Prize</span>
                        </div>
                        {(isAdvanceMode ? prizeData!.advance : prizeData!.general).ranks.map((r) => (
                          <div key={r.rank} className="flex items-center justify-between py-[2px] text-[#7b471d]">
                            <span style={{ width: 60, fontWeight: 700 }}>{r.rank}</span>
                            <span>{formatNum(r.prize)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-[10px] bg-[#e9b273] p-3 text-center text-[18px]">
                        1st: 1,000,000 | 2nd: 800,000 | 3rd: 500,000
                      </div>
                    )}
                  </div>
                ) : null}

                {activeModal === 'RANK' ? (
                  <div className="h-full w-full rounded-[22px] border-[5px] border-[#f09c16] bg-gradient-to-b from-[#fff4d4] to-[#ffe3b3] p-3">
                    <div className="mx-auto mb-2 flex h-[44px] w-[210px] items-center justify-center rounded-[999px] bg-gradient-to-b from-[#d81f2f] to-[#900f16] text-[24px] font-bold text-[#ffd64f]">
                      Game Rank
                    </div>

                    <div className="mx-auto mb-2 flex h-[30px] w-[230px] items-center rounded-[18px] bg-[#dfa66e] p-[2px]">
                      <button
                        type="button"
                        onClick={() => setRankTab('TODAY')}
                        className={`h-full w-1/2 rounded-[16px] text-[14px] ${rankTab === 'TODAY' ? 'bg-[#ffcf22] text-[#7c430f]' : 'text-[#6b4a25]'
                          }`}
                      >
                        Today
                      </button>
                      <button
                        type="button"
                        onClick={() => setRankTab('YESTERDAY')}
                        className={`h-full w-1/2 rounded-[16px] text-[14px] ${rankTab === 'YESTERDAY' ? 'bg-[#ffcf22] text-[#7c430f]' : 'text-[#6b4a25]'
                          }`}
                      >
                        Yesterday
                      </button>
                    </div>

                    <div className="space-y-1 overflow-y-auto" style={{ maxHeight: 320 }}>
                      {rankRows.map((row, idx) => (
                        <div key={`${row.name}-${idx}`} className="relative h-[42px]">
                          <img src={rankBgByIndex(idx)} alt="" className="absolute inset-0 h-full w-full object-fill" />
                          {row.pic && (
                            <img
                              src={row.pic}
                              alt=""
                              className="absolute"
                              style={{ left: 38, top: 5, width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(123,71,29,0.4)' }}
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          )}
                          <div className="absolute top-[8px] text-[18px] text-[#7b471d]" style={{ left: row.pic ? 72 : 70 }}>{row.name}</div>
                          <div className="absolute right-[12px] top-[8px] text-[18px] text-[#7b471d]">
                            {formatNum(row.diamonds)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {activeModal === 'ADVANCED' ? (
                  <div className="relative h-full w-full">
                    {/* CSS-built popup background (no baked-in text) */}
                    <div
                      className="absolute inset-0"
                      style={{
                        borderRadius: 22,
                        border: '5px solid #f09c16',
                        background: 'linear-gradient(180deg, #fff3cc 0%, #ffdd9d 100%)',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                      }}
                    />
                    {/* Header banner */}
                    <div
                      className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center"
                      style={{
                        top: -6,
                        width: 200,
                        height: 44,
                        borderRadius: 14,
                        background: 'linear-gradient(180deg, #ffcb1d 0%, #f6a602 100%)',
                        boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
                      }}
                    >
                      <span
                        style={{
                          fontFamily: 'Inria Serif, serif',
                          fontWeight: 800,
                          fontSize: 22,
                          color: '#7a3c08',
                        }}
                      >
                        Advanced Mode
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setActiveModal('NONE')}
                      className="absolute"
                      style={{ right: 6, top: 10, width: 44, height: 44 }}
                      aria-label="Close"
                    >
                      <img src="/image2/close.png" alt="" className="h-full w-full object-contain" />
                    </button>

                    <div
                      className="absolute"
                      style={{
                        left: 28,
                        right: 28,
                        top: 70,
                        fontFamily: 'Inter, system-ui, sans-serif',
                        fontWeight: 600,
                        fontSize: 18,
                        lineHeight: '26px',
                        color: '#be6a31',
                      }}
                    >
                      <div>Users who have placed bets exceeding 500,000 coins in the past 7 days can unlock the premium mode.</div>

                      <div style={{ marginTop: 18 }}>
                        Keep going! Only{' '}
                        <span style={{ color: '#E92407', fontWeight: 900 }}>{formatNum(remainingForAdvanceApi)}</span>{' '}
                        diamonds to unlock!
                      </div>
                    </div>

                    <img
                      src="/image2/diamonds.png"
                      alt=""
                      className="absolute left-1/2 -translate-x-1/2 object-contain"
                      style={{ top: 235, width: 210, height: 120 }}
                    />

                    <button
                      type="button"
                      onClick={() => {
                        setMode('ADVANCE');
                        setActiveModal('NONE');
                      }}
                      className="absolute left-1/2 -translate-x-1/2"
                      style={{
                        bottom: 30,
                        width: 240,
                        height: 62,
                        borderRadius: 999,
                        background: 'linear-gradient(180deg, #7CFF6A 0%, #25C640 100%)',
                        border: '2px solid rgba(0,0,0,0.18)',
                        boxShadow: '0 10px 18px rgba(0,0,0,0.22)',
                        fontFamily: 'Inter, system-ui, sans-serif',
                        fontWeight: 900,
                        fontSize: 28,
                        color: '#ffffff',
                        textShadow: '0 2px 0 rgba(0,0,0,0.25)',
                      }}
                    >
                      OK
                    </button>
                  </div>
                ) : null}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

      </div>
    </ScaledArtboard>
  );
};

export default GamePage;