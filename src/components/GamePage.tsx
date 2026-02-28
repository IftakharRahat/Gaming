import { AnimatePresence, motion } from 'framer-motion';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const MAX_FRAME_WIDTH = 420;
const DEBUG = false;

const ARTBOARD = { width: 402, height: 735 } as const;

const BET_SECONDS = 20;
const DRAW_SECONDS = 4;       // was 8 — compressed to fit 30s round
const SHOW_SECONDS = 3;       // was 5 — compressed to fit 30s round
const PRE_DRAW_MS = 800;      // was 2000 — faster pre-draw flash
const WINNER_POLL_INTERVAL_MS = 600;   // was 800 — poll faster
const WINNER_POLL_MAX_ATTEMPTS = 12;   // was 20 — fewer attempts since less time
const TIMER_SYNC_INTERVAL_MS = 5000;
const BETTING_TICK_INTERVAL_MS = 250;
const LIVE_REFRESH_INTERVAL_MS = 10000;
const WINNER_MAX_WAIT_MS = 6000;       // was 15000 — can't wait this long in a 30s round

const GAME_ON_MS = 1200;
const ADVANCE_UNLOCK_BET = 500000;

const DEFAULT_CHIP_VALUES = [10, 100, 500, 1000, 5000] as const;

/* Map chip value â†’ local image path */
const CHIP_IMAGE_MAP: Record<number, string> = {
  10: '/image2/chip_10.png',
  100: '/image2/chip_100.png',
  500: '/image2/chip_500_orange.png',
  1000: '/image2/chip_1k.png',
  5000: '/image2/chip_5k.png',
  10000: '/image2/chip_10k.png',
};

/* Map box value â†’ local chest image */
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

/* Jackpot amount is loaded from /game/jackpot/details (jackpot_total) */
/* â”€â”€ API config â”€â”€ */
const API_BASE = ''; // proxied via vite.config.ts
const API_BODY = JSON.stringify({ regisation: 3 });
/* Body with mode: 2 = general/basic, 1 = advance */
const apiBodyWithMode = (mode: number) => JSON.stringify({ regisation: 3, mode });
const apiBodyPlayer = (mode: number) => JSON.stringify({ regisation: 3, player_id: PLAYER_ID, mode });

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
  id: number;
  element__element_name: string | null;
  element__element_icon: string;
  gjp__jackpot_name?: string | null;
  gjp__jackpot_icon?: string | null;
  jackport_element_name?: string[];
};

type ApiCoin = { icon: string };
type ApiGameIcon = { icon: string };
type ApiTodayWin = { today_win: { total_balance: number | null } };
type ApiJackpot = { Jackpot: number };
type ApiSessionTime = { started_at: string; next_run_time: string };
type ApiTopWinnerResponse = { mrs_player_id_player_name: string; mrs_player_id_player_pic?: string; last_balance: number }[];
type ApiMaxPlayers = { max_players: number };
type ApiPrizeRank = { rank: string; prize: number };
type ApiPrizeDistribution = {
  general: { title: string; ranks: ApiPrizeRank[] };
  advance: { title: string; ranks: ApiPrizeRank[] };
};
type ApiGameMode = { advance: boolean; remanning_values: number };
/* Rank endpoints return row-based array */
type ApiRankRow = {
  mrs_player_id_player_name: string;
  mrs_player_id_player_pic: string | null;
  last_balance: number;
};
type ApiGameRule = { general: { title: string; rules: string[]; version: string } };
type ApiJackpotDetails = { jackpot_total: number; awards: { round: number; win: number; time: string }[] };
type ApiGameMetadata = { game__name: string; game__icon: string; game_icon: string }[];
type ApiPlayerRecordRow = {
  round?: number;
  element__element_name?: string | null;
  bet?: number;
  win?: number;
  time?: string;
  balance?: number;
  current_balance?: number;
  last_balance?: number;
  balance_after?: number;
  total_balance?: number;
};
type ApiPlayerRecords = { data: ApiPlayerRecordRow[] };

/* Map API element_name â†’ local ItemId */


/* Reverse map: local ItemId â†’ API element_name */
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

/* Read player_id from URL query param, e.g. ?player_id=2610 */
const URL_PARAMS = new URLSearchParams(window.location.search);
const RAW_PLAYER_ID = Number(URL_PARAMS.get('player_id')) || 0;
const PLAYER_ID = RAW_PLAYER_ID < 10000 ? RAW_PLAYER_ID * 100 : RAW_PLAYER_ID;

async function apiFetch<T>(path: string, retries = 0, customBody?: string): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: customBody ?? API_BODY,
      });
      if (res.ok) return res.json();
    } catch {
      /* network error — suppress browser console noise */
    }
    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  throw new Error(`API ${path} failed`);
}

function mapApiPlayerRecord(row: ApiPlayerRecordRow): PlayerRecordView {
  return {
    round: row.round,
    element: row.element__element_name ?? undefined,
    bet: row.bet,
    win: row.win,
    time: row.time,
    balance: row.balance,
    currentBalance: row.current_balance ?? row.last_balance,
    balanceAfter: row.balance_after,
    totalBalance: row.total_balance,
  };
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
type ModalType = 'NONE' | 'RULE' | 'RECORDS' | 'PRIZE' | 'RANK' | 'ADVANCED' | 'JACKPOT';
type RankTab = 'TODAY' | 'YESTERDAY';
type ResultKind = 'WIN' | 'LOSE' | 'NOBET';

const POINTER_BASE_POSITION = { left: 247, top: 115 } as const;
const POINTER_SIZE = { width: 125, height: 125 } as const;
const POINTER_HOTSPOT = { x: 25, y: 35 } as const;
const POINTER_TOUR_ORDER: ItemId[] = ['lemon', 'pumpkin', 'zucchini', 'water', 'cola', 'milk', 'honey', 'tomato'];
const DRAW_HIGHLIGHT_ORDER: ItemId[] = ['honey', 'tomato', 'lemon', 'pumpkin', 'zucchini', 'water', 'cola', 'milk'];

/* Map server-side element names → local item IDs */
const API_NAME_TO_ID: Record<string, ItemId> = {
  Honey: 'honey', honey: 'honey',
  Tomato: 'tomato', tomato: 'tomato',
  lemon: 'lemon', Lemon: 'lemon',
  pumpkin: 'pumpkin', Pumpkin: 'pumpkin',
  Blur: 'zucchini', blur: 'zucchini', Zucchini: 'zucchini', zucchini: 'zucchini',
  Water: 'water', water: 'water',
  Coke: 'cola', coke: 'cola', Cola: 'cola', cola: 'cola',
  Milk: 'milk', milk: 'milk',
};

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
  winner: ItemId[]; // âœ…
  selected: ItemId | 'none';
  selectedAmount: number;
  win: number;
  balanceBefore: number;
  balanceAfter: number;
};

type PlayerRecordView = {
  round?: number;
  element?: string;
  bet?: number;
  win?: number;
  time?: string;
  balanceBefore?: number;
  balance?: number;
  currentBalance?: number;
  balanceAfter?: number;
  totalBalance?: number;
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

const computeRemainingSecondsFromEndMs = (endMs: number, nowMs = Date.now()) => {
  return Math.max(0, Math.ceil((endMs - nowMs) / 1000));
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

/* Default multipliers â€” overridden by API data at runtime */
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

/* Recent winners strip defaults */
const INITIAL_RESULT_SRCS = [
  '/image2/pumpkin.png',
  '/image2/tomato.png',
  '/image2/zucchini.png',
  '/image2/pumpkin.png',
  '/image2/pumpkin.png',
  '/image2/honey_jar.png',
  '/image2/cola_can.png',
  '/image2/tomato.png',
];


const NO_BET_ROWS: ResultBoardRow[] = [];

// Ferris wheel placement (must match your render)
const WHEEL = { left: 6, top: 101, width: 391, height: 391 } as const;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function getWheelFocusRect(item: ItemSpec) {
  const base = Math.min(item.width, item.height);

  const pad = clamp(Math.round(base * 0.08), 4, 10);

  // ðŸ”§ SIZE SCALE CONTROL (this is what you adjust)
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

  // âœ… Dynamic extras:
  // Top items (tâ‰ˆ0) need MORE top expansion.
  // Bottom items (tâ‰ˆ1) need LESS top expansion.
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
/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   Trophy Win Overlay â€” chips fly to trophy â†’ trophy explodes â†’ panel pops up
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
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
  coinSize: number;
  duration: number;
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
        coinSize: 3 + Math.random() * 4,
        duration: 1.2 + Math.random() * 0.4,
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
      0.0s  â€” chips fly to trophy
      0.7s  â€” coin explosion + fireworks start
      2.7s  â€” leaderboard panel appears (coins + fireworks still going)
      4.7s  â€” coin explosion stops (fireworks + panel continue)
    */
    const t1 = window.setTimeout(() => { setStage('TROPHY_EXPLODE'); setShowCoins(true); }, 700);
    const t2 = window.setTimeout(() => setStage('PANEL'), 2700);
    const t3 = window.setTimeout(() => setShowCoins(false), 4700);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  return (
    <>
      {/* â”€â”€ Stage 1: Chips fly from each bet position â†’ trophy â”€â”€ */}
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

      {/* â”€â”€ Coins bursting upward from trophy (independent of stage) â”€â”€ */}
      {showCoins && (
        <div className="absolute z-[530] pointer-events-none">
          {/* Tiny flash â€” trophy stays visible */}
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
            return (
              <motion.div
                key={p.id}
                className="absolute rounded-full"
                style={{
                  left: TROPHY_CENTER.left,
                  top: TROPHY_CENTER.top,
                  width: p.coinSize,
                  height: p.coinSize,
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
                  duration: p.duration,
                  delay: p.delay,
                  ease: [0.22, 0.68, 0.36, 1],
                }}
              />
            );
          })}
        </div>
      )}


      {/* â”€â”€ Stage 3: Win panel pops up with spring bounce â”€â”€ */}
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

            {/* â”€â”€ Content container with consistent padding â”€â”€ */}
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
                  {/* â”€â”€ Reward Bar â”€â”€ */}
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

                  {/* â”€â”€ Leaderboard rows (matching no-bet panel alignment) â”€â”€ */}
                  {rankRows.slice(0, 3).map((row, idx) => (
                    <motion.div
                      key={`${row.name}-${idx}`}
                      className="absolute flex items-center"
                      style={{
                        left: PX + 30,
                        top: LB_TOP + idx * (ROW_H + ROW_GAP),
                        width: CONTENT_W - 80,
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

  /* â”€â”€ API state â”€â”€ */
  const [itemMultiplier, setItemMultiplier] = useState<Record<ItemId, number>>(DEFAULT_MULTIPLIER);
  const [chipValues, setChipValues] = useState<number[]>([...DEFAULT_CHIP_VALUES]);
  const [badgeOverrides, setBadgeOverrides] = useState<Record<ItemId, string>>({} as Record<ItemId, string>);
  const [boxData, setBoxData] = useState<{ src: string; openSrc: string; label: string }[]>(
    Object.entries(BOX_VALUE_TO_CHEST).map(([val, src]) => ({ src, openSrc: src.replace('.png', '_open.png'), label: BOX_LABELS[Number(val)] || '' }))
  );
  const [maxPlayers, setMaxPlayers] = useState(8);
  const [trophySrc, setTrophySrc] = useState('/image2/trophy.png');
  const [elementApiIds, setElementApiIds] = useState<Record<string, number>>({});
  const elementApiIdsRef = useRef<Record<string, number>>({});
  const missingElementMapWarnedRef = useRef<Set<ItemId>>(new Set());
  const [coinIconSrc, setCoinIconSrc] = useState('/image2/diamond.png');
  const [gameLogoSrc, setGameLogoSrc] = useState('/image2/greedy_sign_board.png');
  const [jackpotAmount, setJackpotAmount] = useState(0);
  const [prizeData, setPrizeData] = useState<ApiPrizeDistribution | null>(null);
  const [advanceModeApi, setAdvanceModeApi] = useState<ApiGameMode | null>(null);
  const [rankRowsToday, setRankRowsToday] = useState<{ name: string; diamonds: number; pic?: string }[]>([]);
  const [rankRowsYesterday, setRankRowsYesterday] = useState<{ name: string; diamonds: number; pic?: string }[]>([]);
  const [topWinnersRows, setTopWinnersRows] = useState<ResultBoardRow[]>(NO_BET_ROWS);

  /* Fetch API data on mount */
  const apiCalledRef = useRef(false);
  useEffect(() => {
    if (apiCalledRef.current) return;
    apiCalledRef.current = true;

    (async () => {
      try {
        /* mode: 2 = general/basic, 1 = advance */
        const modeNum = 2; // default to general on init
        const mBody = apiBodyWithMode(modeNum);
        const pBody = apiBodyPlayer(modeNum);

        /* Check if LoadingScreen already prefetched API data */
        const prefetched = (window as unknown as Record<string, unknown>).__PREFETCHED_API__ as
          Record<string, unknown> | undefined;

        /* Build the list of API calls (they won't execute until we call them) */
        const apiCalls: (() => Promise<unknown>)[] = [
          /* 0â€“10: APIs that need mode */
          () => prefetched?.elements ? Promise.resolve(prefetched.elements) : apiFetch<ApiElement[]>('/game/game/elements', 2, mBody),
          () => prefetched?.buttons ? Promise.resolve(prefetched.buttons) : apiFetch<ApiButton[]>('/game/sorce/buttons', 2, mBody),
          () => prefetched?.boxes ? Promise.resolve(prefetched.boxes) : apiFetch<ApiBox[]>('/game/magic/boxs', 2, mBody),
          () => prefetched?.winHistory ? Promise.resolve(prefetched.winHistory) : apiFetch<ApiWinElement[]>('/game/win/elements/list', 2, mBody),
          () => apiFetch<ApiTopWinnerResponse>('/game/top/winers', 2, pBody),
          () => prefetched?.jackpot ? Promise.resolve(prefetched.jackpot) : apiFetch<ApiJackpot>('/game/jackpot', 2, mBody),
          () => prefetched?.jackpotDetails ? Promise.resolve(prefetched.jackpotDetails) : apiFetch<ApiJackpotDetails>('/game/jackpot/details', 2, mBody),
          () => prefetched?.gameMode ? Promise.resolve(prefetched.gameMode) : apiFetch<ApiGameMode>('/game/game/mode', 2, pBody),
          () => apiFetch<ApiRankRow[]>('/game/game/rank/today', 2, mBody),
          () => apiFetch<ApiRankRow[]>('/game/game/rank/yesterday', 2, mBody),
          () => apiFetch<ApiPlayerRecords>('/game/game/records/of/player', 2, pBody),
          /* 11â€“18: APIs that DON'T need mode */
          () => prefetched?.trophy ? Promise.resolve(prefetched.trophy) : apiFetch<ApiTrophy>('/game/game/trophy'),
          () => prefetched?.coin ? Promise.resolve(prefetched.coin) : apiFetch<ApiCoin>('/game/game/coin'),
          () => prefetched?.gameIcon ? Promise.resolve(prefetched.gameIcon) : apiFetch<ApiGameIcon>('/game/icon/during/gaming'),
          () => apiFetch<ApiMaxPlayers>('/game/maximum/fruits/per/turn'),
          () => apiFetch<ApiGameRule>('/game/game/rule'),
          () => apiFetch<ApiPrizeDistribution>('/game/game/prize/distribution'),
          () => apiFetch<ApiGameMetadata>('/game/game/icon/'),
          () => apiFetch<ApiTodayWin>('/game/today/win'),
        ];

        /* If prefetched data exists, all calls resolve fast; otherwise batch them */
        const results: PromiseSettledResult<unknown>[] = [];

        if (prefetched && Object.keys(prefetched).length > 0) {
          /* Fast path: most data is already cached from LoadingScreen */
          const batchResults = await Promise.allSettled(apiCalls.map((fn) => fn()));
          results.push(...batchResults);
          /* Clean up prefetched data */
          delete (window as unknown as Record<string, unknown>).__PREFETCHED_API__;
        } else {
          /* Slow path: no prefetch, batch to avoid overwhelming server */
          const BATCH_SIZE = 2;
          const BATCH_DELAY = 300;
          for (let i = 0; i < apiCalls.length; i += BATCH_SIZE) {
            const batch = apiCalls.slice(i, i + BATCH_SIZE);
            const batchResults = await Promise.allSettled(batch.map((fn) => fn()));
            results.push(...batchResults);
            if (i + BATCH_SIZE < apiCalls.length) {
              await new Promise((r) => setTimeout(r, BATCH_DELAY));
            }
          }
        }

        /* Map results â€” order matches the API calls array above */
        const val = <T,>(i: number): T | null =>
          results[i]?.status === 'fulfilled' ? (results[i].value as T) : null;

        const elements = val<ApiElement[]>(0);
        const buttons = val<ApiButton[]>(1);
        const boxes = val<ApiBox[]>(2);
        const winHistory = val<ApiWinElement[]>(3);
        const topWinners = val<ApiTopWinnerResponse>(4);
        const jackpotApi = val<ApiJackpot>(5);
        const jackpotDetails = val<ApiJackpotDetails>(6);
        const gameMode = val<ApiGameMode>(7);
        const rankToday = val<ApiRankRow[]>(8);
        const rankYesterday = val<ApiRankRow[]>(9);
        const playerRecords = val<ApiPlayerRecords>(10);
        const trophy = val<ApiTrophy>(11);
        const coin = val<ApiCoin>(12);
        const gameIcon = val<ApiGameIcon>(13);
        const maxFruits = val<ApiMaxPlayers>(14);
        const gameRules = val<ApiGameRule>(15);
        const prizeDistrib = val<ApiPrizeDistribution>(16);
        const gameMetadata = val<ApiGameMetadata>(17);
        const todayWinApi = val<ApiTodayWin>(18);

        /* Log failures */
        results.forEach((r, i) => {
          if (r.status === 'rejected') console.warn(`[API] Call ${i} failed:`, r.reason);
        });

        /* Build multiplier + badges from elements API */
        if (elements) {
          const multipliers = { ...DEFAULT_MULTIPLIER };
          const badges: Record<string, string> = {};

          for (const el of elements) {
            const id = API_NAME_TO_ID[el.element_name];
            if (id) {
              multipliers[id] = el.paytable;
              badges[id] = `x${el.paytable}`;
            }
          }

          setItemMultiplier(multipliers);
          setBadgeOverrides(badges as Record<ItemId, string>);

          /* Store element database IDs for bet API */
          const apiIds: Record<string, number> = {};
          elements.forEach((el) => {
            const id = API_NAME_TO_ID[el.element_name];
            if (id) apiIds[id] = el.id;
          });
          setElementApiIds(apiIds);
          elementApiIdsRef.current = apiIds;
          missingElementMapWarnedRef.current.clear();
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
            src: BOX_VALUE_TO_CHEST[b.box_source] || '/image2/chest_10k.png',
            openSrc: CHEST_OPEN_SRC_BY_THRESHOLD[b.box_source] || '/image2/chest_10k_open.png',
            label: BOX_LABELS[b.box_source] || `${b.box_source}`,
          }));
          setBoxData(bd);
          console.log('[API] Boxes loaded:', bd);
        }



        /* Trophy image */
        if (trophy?.icon) {
          const imgUrl = trophy.icon.startsWith('/') ? trophy.icon : `/${trophy.icon}`;
          setTrophySrc(imgUrl);
          console.log('[API] Trophy loaded:', imgUrl);
        }

        /* Win history â†’ result strip */
        if (winHistory && Array.isArray(winHistory) && winHistory.length > 0) {
          const latestWin = winHistory[winHistory.length - 1];
          if (typeof latestWin?.id === 'number') {
            lastWinIdRef.current = latestWin.id;
          }

          const itemSrcMap: Record<string, string> = {};
          for (const item of ITEMS) {
            const apiName = ID_TO_API_NAME[item.id];
            if (apiName) itemSrcMap[apiName] = item.src;
          }

          const srcs = winHistory
            .map((w) => w.element__element_name ? itemSrcMap[w.element__element_name] : undefined)
            .filter(Boolean) as string[];

          if (srcs.length > 0) {
            // Reverse so newest is first (leftmost)
            setResultSrcs(srcs.reverse());
            console.log('[API] Win history loaded:', srcs.length, 'results');
          }
        }

        /* Coin icon */
        if (coin?.icon) {
          const imgUrl = coin.icon.startsWith('/') ? coin.icon : `/${coin.icon}`;
          setCoinIconSrc(imgUrl);
          console.log('[API] Coin icon loaded:', imgUrl);
        }

        /* Game logo icon — keep the local signboard; the API icon lacks
           the wooden background and food decorations */
        if (gameIcon?.icon) {
          const imgUrl = gameIcon.icon.startsWith('/') ? gameIcon.icon : `/${gameIcon.icon}`;
          // setGameLogoSrc(imgUrl);  — intentionally disabled to preserve local signboard
          console.log('[API] Game logo loaded (not applied — using local signboard):', imgUrl);
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

        /* Game mode â€” auto-enable advance if API says so */
        if (gameMode) {
          setAdvanceModeApi(gameMode);
          if (gameMode.advance === true) {
            setMode('ADVANCE');
            console.log('[API] Advance mode ENABLED by server');
          }
          console.log('[API] Game mode loaded:', gameMode.advance, 'remaining:', gameMode.remanning_values);
        }

        /* Rank today â€” row-based array: [{mrs_player_id_player_name, mrs_player_id_player_pic, last_balance}] */
        console.log('[API] Rank today RAW:', JSON.stringify(rankToday));
        type RankParsedRow = { name: string; diamonds: number; pic?: string };

        /** Convert row-based rank response into display rows */
        const parseRankRows = (data: unknown): RankParsedRow[] => {
          // Handle both {data: [...]} wrapper and direct array
          const rows = Array.isArray(data) ? data
            : (data && typeof data === 'object' && 'data' in data && Array.isArray((data as { data: unknown }).data))
              ? (data as { data: unknown[] }).data
              : null;
          if (!rows || rows.length === 0) return [];
          // Log actual keys for debugging
          if (rows[0]) console.log('[API] Rank row keys:', Object.keys(rows[0]));
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return rows.map((row: any) => {
            // Try multiple field name patterns (single/double underscores)
            const name = row.mrs_player_id_player_name
              ?? row.mrs__player_id__player_name
              ?? row.player_name
              ?? row.name
              ?? 'Unknown';
            const pic = row.mrs_player_id_player_pic
              ?? row.mrs__player_id__player_pic
              ?? row.player_pic
              ?? row.pic
              ?? null;
            const balance = row.last_balance ?? row.balance ?? 0;
            return {
              name,
              diamonds: balance,
              pic: pic ? encodeURI(`/media/${pic}`) : undefined,
            };
          });
        };

        const parsedRankRows = parseRankRows(rankToday);
        if (parsedRankRows.length > 0) {
          setRankRowsToday(parsedRankRows);
          console.log('[API] Rank today loaded:', parsedRankRows.length, 'rows, pics:', parsedRankRows.slice(0, 3).map(r => r.pic));
        }

        /* Top Winners â€” use API data, fallback to rank today for profile pics */
        console.log('[API] Top Winners RAW:', JSON.stringify(topWinners));
        let topWinnersMapped: ResultBoardRow[] | null = null;

        // Try top winners API first
        if (topWinners && Array.isArray(topWinners) && topWinners.length > 0) {
          topWinnersMapped = topWinners.slice(0, 3).map((r: { mrs_player_id_player_name: string; mrs_player_id_player_pic?: string; last_balance: number }) => ({
            name: r.mrs_player_id_player_name,
            amount: r.last_balance,
            pic: r.mrs_player_id_player_pic
              ? encodeURI(`/media/${r.mrs_player_id_player_pic}`)
              : undefined,
          }));
          console.log('[API] Top Winners from API:', topWinnersMapped.length, 'rows');
        }

        // Fallback: use rank today data (which includes profile pics)
        if (!topWinnersMapped && parsedRankRows.length > 0) {
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

        /* Max players per turn */
        if (maxFruits && typeof (maxFruits as ApiMaxPlayers).max_players === 'number') {
          setMaxPlayers((maxFruits as ApiMaxPlayers).max_players);
          console.log('[API] Max bets per turn loaded:', (maxFruits as ApiMaxPlayers).max_players);
        }

        /* Rank yesterday â€” same row-based format */
        const parsedRankYesterday = parseRankRows(rankYesterday);
        if (parsedRankYesterday.length > 0) {
          setRankRowsYesterday(parsedRankYesterday);
          console.log('[API] Rank yesterday loaded:', parsedRankYesterday.length, 'rows');
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
          setApiPlayerRecords(playerRecords.data.map((r) => mapApiPlayerRecord(r)));
          console.log('[API] Player records loaded:', playerRecords.data.length, 'records');
        }

      } catch (err) {
        console.warn('[API] Unexpected error:', err);
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
  const transitioningRef = useRef(false); // guard: prevents double SHOWTIMEâ†’BETTING transition

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
  const [apiPlayerRecords, setApiPlayerRecords] = useState<PlayerRecordView[]>([]);
  const roundRef = useRef(0);

  const [itemPulse, setItemPulse] = useState<{ id: ItemId | null; key: number }>({ id: null, key: 0 });
  const [floatingBetChips, setFloatingBetChips] = useState<FloatingBetChip[]>([]);
  const [pointerStopIndex, setPointerStopIndex] = useState(0);
  const [drawHighlightIndex, setDrawHighlightIndex] = useState(0);
  const lastWinIdRef = useRef<number>(0); // tracks last processed win entry ID from server
  const latestPolledWinRef = useRef<ApiWinElement | null>(null);
  const participantSubmitFailuresRef = useRef(0);
  const participantSubmitDisabledRef = useRef(false);
  const participantSubmitDisabledLoggedRef = useRef(false);
  const winnerPollTokenRef = useRef(0);
  const phaseRef = useRef<Phase>('BETTING');
  const [showFireworks, setShowFireworks] = useState(false);
  const [fireworksSeed, setFireworksSeed] = useState(0);
  const [trophyCoins, setTrophyCoins] = useState<{ id: number; x: number; y: number; size: number; delay: number }[]>([]);
  const trophyCoinIdRef = useRef(0);

  /* Set document title from API game name */
  useEffect(() => { document.title = gameName; }, [gameName]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { elementApiIdsRef.current = elementApiIds; }, [elementApiIds]);
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

    // credit reward to balance
    const amount = CHEST_REWARD_AMOUNT_BY_THRESHOLD[threshold] ?? 0;
    if (amount > 0) {
      setBalance((prev) => prev + amount);
    }

    // show popup
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

  const applyWinnerFromServer = useCallback((entry: ApiWinElement): boolean => {
    if (entry.gjp__jackpot_name && (entry.jackport_element_name?.length ?? 0) > 0) {
      const jackpotIds = (entry.jackport_element_name ?? [])
        .map((name) => API_NAME_TO_ID[name])
        .filter((id): id is ItemId => Boolean(id));

      if (jackpotIds.length > 0) {
        setRoundType('JACKPOT');
        winnerRef.current = jackpotIds;
        setWinnerIds(jackpotIds);
        console.log('[LIVE] Jackpot winner:', jackpotIds);
        return true;
      }
    }

    if (entry.element__element_name) {
      const winnerId = API_NAME_TO_ID[entry.element__element_name];
      if (winnerId) {
        setRoundType('NORMAL');
        winnerRef.current = [winnerId];
        setWinnerIds([winnerId]);
        console.log('[LIVE] Winner:', winnerId, '(' + entry.element__element_name + ')');
        return true;
      }
    }

    console.warn('[LIVE] Unmappable winner payload:', entry);
    return false;
  }, []);

  const refreshRoundStateFromServer = useCallback(async () => {
    const modeNum = isAdvanceMode ? 1 : 2;
    const pBody = apiBodyPlayer(modeNum);
    const mBody = apiBodyWithMode(modeNum);

    const [recordsRes, todayWinRes] = await Promise.allSettled([
      apiFetch<ApiPlayerRecords>('/game/game/records/of/player', 1, pBody),
      apiFetch<ApiTodayWin>('/game/today/win', 1, mBody),
    ]);

    if (recordsRes.status === 'fulfilled') {
      const rows = recordsRes.value?.data ?? [];
      setApiPlayerRecords(rows.map((row) => mapApiPlayerRecord(row)));

      const serverBalance =
        rows
          .map((row) => row.current_balance ?? row.balance_after ?? row.last_balance ?? row.balance ?? row.total_balance)
          .find((value): value is number => typeof value === 'number' && Number.isFinite(value))
        ?? null;

      if (serverBalance != null) {
        setBalance(serverBalance);
      }
    }

    if (todayWinRes.status === 'fulfilled') {
      const total = todayWinRes.value?.today_win?.total_balance;
      if (typeof total === 'number' && Number.isFinite(total)) {
        setTodayWin(total);
      }
    }
  }, [isAdvanceMode]);

  const submitParticipantBet = useCallback(async (params: { itemId: ItemId; bet: number; balanceAfterBet: number }) => {
    if (!PLAYER_ID || participantSubmitDisabledRef.current) return 'server_error';

    const { itemId, bet, balanceAfterBet } = params;
    let elementId = elementApiIdsRef.current[itemId] || 0;

    if (!elementId) {
      // Startup race: allow a short wait for /game/game/elements to finish and populate IDs.
      for (let retry = 0; retry < 6 && !elementId; retry++) {
        await new Promise((resolve) => setTimeout(resolve, 150));
        elementId = elementApiIdsRef.current[itemId] || 0;
      }
    }

    if (!elementId) {
      if (!missingElementMapWarnedRef.current.has(itemId)) {
        missingElementMapWarnedRef.current.add(itemId);
        console.warn('[API] Skipping bet submit: missing element mapping for', itemId);
      }
      return 'server_error';
    }

    try {
      const res = await fetch('/game/player/gaming/participants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player_id: PLAYER_ID,
          balance: balanceAfterBet,
          bet,
          element: elementId,
          mode: isAdvanceMode ? 1 : 2,
          registration: 3,
        }),
      });

      if (!res.ok) {
        participantSubmitFailuresRef.current += 1;
        const isServerError = res.status >= 500;
        const disableNow = isServerError || participantSubmitFailuresRef.current >= 3;

        if (disableNow) {
          participantSubmitDisabledRef.current = true;
          if (!participantSubmitDisabledLoggedRef.current) {
            participantSubmitDisabledLoggedRef.current = true;
            console.warn('[API] Participants submit disabled after repeated failures:', {
              player_id: PLAYER_ID,
              status: res.status,
            });
          }
        } else {
          console.warn('[API] Bet submit failed:', { status: res.status, item: itemId, element: elementId });
        }
        /* Return 'rejected' for client errors (4xx), 'server_error' for 5xx */
        return isServerError ? 'server_error' : 'rejected';
      }

      participantSubmitFailuresRef.current = 0;
      console.log('[API] Bet submitted:', { item: itemId, bet, element: elementId });
      return 'ok';
    } catch {
      participantSubmitFailuresRef.current += 1;
      if (participantSubmitFailuresRef.current >= 3) {
        participantSubmitDisabledRef.current = true;
        if (!participantSubmitDisabledLoggedRef.current) {
          participantSubmitDisabledLoggedRef.current = true;
          console.warn('[API] Participants submit disabled after repeated network failures:', {
            player_id: PLAYER_ID,
          });
        }
      }
      return 'server_error';
    }
  }, [isAdvanceMode]);

  const pollWinnerUntilNewResult = useCallback(async (token: number) => {
    const mBody = apiBodyWithMode(isAdvanceMode ? 1 : 2);

    /* The server's win/elements/list updates when a new round result is declared.
       Fetch it and apply the latest entry. Retry a few times if the fetch fails. */
    for (let attempt = 0; attempt < 3; attempt++) {
      if (winnerPollTokenRef.current !== token || phaseRef.current !== 'DRAWING') return;

      try {
        const results = await apiFetch<ApiWinElement[]>('/game/win/elements/list', 0, mBody);
        if (winnerPollTokenRef.current !== token || phaseRef.current !== 'DRAWING') return;

        if (Array.isArray(results) && results.length > 0) {
          const latest = results[results.length - 1];
          latestPolledWinRef.current = latest;
          if (typeof latest.id === 'number') lastWinIdRef.current = latest.id;
          if (applyWinnerFromServer(latest)) return;
        }
      } catch {
        /* retry */
      }

      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }

    /* If we still don't have a winner, skip the round */
    if (winnerPollTokenRef.current !== token || phaseRef.current !== 'DRAWING') return;
    console.warn('[LIVE] Could not get winner — skipping round');
    setPhase('SHOWTIME');
    phaseRef.current = 'SHOWTIME';
    setTimeLeft(1);
    setPendingWin(null);
    setResultKind('NOBET');
    setShowResultBoard(false);
  }, [applyWinnerFromServer, isAdvanceMode]);

  const currentSessionEndRef = useRef<string>('');
  const bettingEndMsRef = useRef<number>(0);
  const serverClockOffsetMsRef = useRef<number>(0);
  const getAlignedNowMs = useCallback(() => Date.now() + serverClockOffsetMsRef.current, []);
  const updateServerClockOffsetFromResponse = useCallback((res: Response) => {
    const serverDateHeader = res.headers.get('date');
    if (!serverDateHeader) return;

    const serverNowMs = Date.parse(serverDateHeader);
    if (!Number.isFinite(serverNowMs)) return;

    serverClockOffsetMsRef.current = serverNowMs - Date.now();
  }, []);
  const fetchSessionClock = useCallback(async (): Promise<{ session: ApiSessionTime; response: Response } | null> => {
    try {
      const response = await fetch(`${API_BASE}/game/game/session/end/time`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: API_BODY,
      });
      if (!response.ok) return null;

      const session = await response.json() as ApiSessionTime;
      if (!session?.next_run_time) return null;
      if (!Number.isFinite(Date.parse(session.next_run_time))) return null;

      return { session, response };
    } catch {
      return null;
    }
  }, []);
  const fetchBestSessionClock = useCallback(async (sampleCount = 3): Promise<{ session: ApiSessionTime; response: Response } | null> => {
    const samplePromises = Array.from({ length: sampleCount }, () => fetchSessionClock());
    const sampled = await Promise.all(samplePromises);
    const valid = sampled.filter((entry): entry is { session: ApiSessionTime; response: Response } => Boolean(entry));
    if (valid.length === 0) return null;

    // Pick the EARLIEST (soonest) next_run_time — ensures all clients
    // join the same current round even if the load balancer hits different servers
    let best = valid[0];
    let bestEndMs = Date.parse(best.session.next_run_time);
    for (let i = 1; i < valid.length; i++) {
      const candidate = valid[i];
      const candidateEndMs = Date.parse(candidate.session.next_run_time);
      if (candidateEndMs < bestEndMs) {
        best = candidate;
        bestEndMs = candidateEndMs;
      }
    }
    console.log(`[TIMER] Sampled ${valid.length}/${sampleCount} sessions, picked earliest:`, best.session.next_run_time);
    return best;
  }, [fetchSessionClock]);
  const applyServerSessionClock = useCallback((
    session: ApiSessionTime,
    options?: { allowForwardJump?: boolean; maxForwardSeconds?: number; maxBackwardSeconds?: number }
  ): number | null => {
    const serverEndMs = Date.parse(session.next_run_time);
    if (!Number.isFinite(serverEndMs)) return null;

    const nowMs = getAlignedNowMs();
    const nextRemaining = computeRemainingSecondsFromEndMs(serverEndMs, nowMs);
    const hasCurrentEnd = bettingEndMsRef.current > 0;
    const allowForwardJump = options?.allowForwardJump ?? true;
    const maxForwardSeconds = options?.maxForwardSeconds ?? 1;
    const maxBackwardSeconds = options?.maxBackwardSeconds;

    if (!allowForwardJump && hasCurrentEnd) {
      const currentRemaining = computeRemainingSecondsFromEndMs(bettingEndMsRef.current, nowMs);
      if (nextRemaining > currentRemaining + maxForwardSeconds) {
        /* Ignore backend session jumps that would restart the countdown mid-round. */
        return currentRemaining;
      }
      if (typeof maxBackwardSeconds === 'number' && nextRemaining < currentRemaining - maxBackwardSeconds) {
        /* Ignore stale backend nodes that would abruptly cut the countdown. */
        return currentRemaining;
      }
    }

    currentSessionEndRef.current = session.next_run_time;
    bettingEndMsRef.current = serverEndMs;
    return nextRemaining;
  }, [getAlignedNowMs]);

  const beginRound = useCallback(async () => {
    transitioningRef.current = false; // clear gate so next SHOWTIME can transition
    winnerPollTokenRef.current += 1; // cancel any previous winner poll loop
    participantSubmitDisabledRef.current = false; // re-enable bet submissions each round
    participantSubmitFailuresRef.current = 0;

    setRoundType('NORMAL');
    setItemPulse({ id: null, key: 0 }); // clear stale pulse from previous round
    latestPolledWinRef.current = null;

    /* Try up to 3 times to sync with server session clock */
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`[TIMER] beginRound attempt ${attempt}/3`);
        const bestSession = await fetchBestSessionClock(3);
        if (!bestSession) {
          console.warn(`[TIMER] Attempt ${attempt}: No valid session clock response`);
          if (attempt < 3) { await new Promise(r => setTimeout(r, 500)); continue; }
          throw new Error('No valid session clock response after 3 attempts');
        }

        updateServerClockOffsetFromResponse(bestSession.response);
        const session = bestSession.session;
        console.log('[TIMER] Server session:', session.next_run_time);
        const remaining = applyServerSessionClock(session);
        console.log('[TIMER] Computed remaining:', remaining, 'seconds');
        if (remaining == null) {
          console.warn(`[TIMER] Attempt ${attempt}: Invalid remaining`);
          if (attempt < 3) { await new Promise(r => setTimeout(r, 500)); continue; }
          throw new Error('Invalid session next_run_time after 3 attempts');
        }

        if (remaining <= 0) {
          /* Session already expired — skip to DRAWING immediately */
          console.log('[TIMER] Session already expired, skipping to DRAWING');
          currentSessionEndRef.current = '';
          bettingEndMsRef.current = 0;
          setPhase('DRAWING');
          phaseRef.current = 'DRAWING';
          setTimeLeft(DRAW_SECONDS);
          setWinnerIds(null);
          winnerRef.current = null;

          const token = Date.now();
          winnerPollTokenRef.current = token;
          void pollWinnerUntilNewResult(token);
          return;
        }

        console.log(`[TIMER] Synced! Starting BETTING with ${remaining}s remaining`);
        setPhase('BETTING');
        phaseRef.current = 'BETTING';
        setShowPreDraw(true);
        setTimeLeft(remaining);
        return; // success — exit the retry loop
      } catch (err) {
        console.error(`[TIMER] beginRound attempt ${attempt} failed:`, err);
        if (attempt < 3) { await new Promise(r => setTimeout(r, 500)); continue; }
      }
    }

    /* All 3 attempts failed — fallback to local timer */
    console.warn('[TIMER] All session sync attempts failed, falling back to BET_SECONDS =', BET_SECONDS);
    currentSessionEndRef.current = '';
    bettingEndMsRef.current = 0;
    setPhase('BETTING');
    phaseRef.current = 'BETTING';
    setShowPreDraw(true);
    setTimeLeft(BET_SECONDS);
  }, [applyServerSessionClock, fetchBestSessionClock, pollWinnerUntilNewResult, updateServerClockOffsetFromResponse]);


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

    // 4) Submit bets to API sequentially (server can't handle concurrent writes)
    if (PLAYER_ID) {
      let runningBalance = balance;
      (async () => {
        for (const itemId of ids) {
          runningBalance -= selectedChip;
          const result = await submitParticipantBet({ itemId, bet: selectedChip, balanceAfterBet: runningBalance });
          if (result !== 'ok' && participantSubmitDisabledRef.current) break;
          if (ids.length > 1) await new Promise((r) => setTimeout(r, 200));
        }
      })();
    }
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
    void beginRound();
  }, [beginRound]);

  useEffect(() => {
    if (!showGameOn) return;
    const id = window.setTimeout(() => setShowGameOn(false), GAME_ON_MS);
    return () => window.clearTimeout(id);
  }, [showGameOn]);

  useEffect(() => {
    if (phase === 'BETTING' || activeModal !== 'NONE' || showGameOn || showPreDraw) return;

    const id = window.setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => window.clearInterval(id);
  }, [activeModal, showGameOn, showPreDraw, phase]);

  useEffect(() => {
    if (phase !== 'BETTING') return;

    const tickBettingClock = () => {
      if (!bettingEndMsRef.current) return;
      setTimeLeft(computeRemainingSecondsFromEndMs(bettingEndMsRef.current, getAlignedNowMs()));
    };

    tickBettingClock();
    const id = window.setInterval(tickBettingClock, BETTING_TICK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [getAlignedNowMs, phase]);

  /* ── Periodic timer sync during BETTING (with backoff) ── */
  const timerSyncFailCountRef = useRef(0);
  useEffect(() => {
    if (phase !== 'BETTING') {
      timerSyncFailCountRef.current = 0; // reset on phase change
      return;
    }

    const syncTimer = async () => {
      /* Back off after 3 consecutive failures - stop spamming broken endpoint */
      if (timerSyncFailCountRef.current >= 3) return;
      if (phaseRef.current !== 'BETTING') return;

      try {
        const res = await fetch(`${API_BASE}/game/game/session/end/time`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: API_BODY,
        });
        if (phaseRef.current !== 'BETTING') return;
        if (!res.ok) {
          timerSyncFailCountRef.current += 1;
          return;
        }

        updateServerClockOffsetFromResponse(res);
        const session = await res.json() as ApiSessionTime;
        if (phaseRef.current !== 'BETTING') return;
        const remaining = applyServerSessionClock(session, {
          allowForwardJump: false,
          maxForwardSeconds: 1,
          maxBackwardSeconds: 2,
        });
        if (remaining == null) {
          timerSyncFailCountRef.current += 1;
          return;
        }

        if (phaseRef.current !== 'BETTING') return;
        timerSyncFailCountRef.current = 0;
        setTimeLeft(remaining);
      } catch {
        timerSyncFailCountRef.current += 1;
      }
    };

    void syncTimer();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void syncTimer();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    const id = window.setInterval(syncTimer, TIMER_SYNC_INTERVAL_MS);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.clearInterval(id);
    };
  }, [applyServerSessionClock, phase, updateServerClockOffsetFromResponse]);

  /* ── Periodic live data refresh during BETTING ── */
  useEffect(() => {
    if (phase !== 'BETTING') return;

    const refreshLiveData = async () => {
      const mBody = apiBodyWithMode(isAdvanceMode ? 1 : 2);
      const pBody = apiBodyPlayer(isAdvanceMode ? 1 : 2);

      const [jackpotRes, rankRes, topRes, winHistRes] = await Promise.allSettled([
        apiFetch<ApiJackpot>('/game/jackpot', 1, mBody),
        apiFetch<ApiRankRow[]>('/game/game/rank/today', 1, mBody),
        apiFetch<ApiTopWinnerResponse>('/game/top/winers', 1, pBody),
        apiFetch<ApiWinElement[]>('/game/win/elements/list', 1, mBody),
      ]);

      /* Jackpot — only update if server returns a real value (avoids overwriting details total with 0) */
      if (jackpotRes.status === 'fulfilled' && jackpotRes.value?.Jackpot != null && jackpotRes.value.Jackpot > 0) {
        setJackpotAmount(jackpotRes.value.Jackpot);
      }

      /* Rank today */
      if (rankRes.status === 'fulfilled' && Array.isArray(rankRes.value) && rankRes.value.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const parsed = rankRes.value.map((row: any) => ({
          name: row.mrs_player_id_player_name ?? row.player_name ?? row.name ?? 'Unknown',
          diamonds: row.last_balance ?? row.balance ?? 0,
          pic: (row.mrs_player_id_player_pic ?? row.player_pic ?? null)
            ? encodeURI(`/media/${row.mrs_player_id_player_pic ?? row.player_pic}`)
            : undefined,
        }));
        if (parsed.length > 0) {
          setRankRowsToday(parsed);
        }
      }

      /* Top winners */
      if (topRes.status === 'fulfilled' && Array.isArray(topRes.value) && topRes.value.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mapped = topRes.value.slice(0, 3).map((r: any) => ({
          name: r.mrs_player_id_player_name,
          amount: r.last_balance,
          pic: r.mrs_player_id_player_pic
            ? encodeURI(`/media/${r.mrs_player_id_player_pic}`)
            : undefined,
        }));
        setTopWinnersRows(mapped);
      }

      /* Result strip (win history) — only update during BETTING, and only if
         the server has caught up (more entries than current state) to avoid
         wiping locally-added winners with stale server data */
      if (phase === 'BETTING' && winHistRes.status === 'fulfilled' && Array.isArray(winHistRes.value) && winHistRes.value.length > 0) {
        const latestWin = winHistRes.value[winHistRes.value.length - 1];
        if (typeof latestWin?.id === 'number') {
          lastWinIdRef.current = latestWin.id;
          latestPolledWinRef.current = latestWin;
        }

        const itemSrcMap: Record<string, string> = {};
        for (const item of ITEMS) {
          const apiName = ID_TO_API_NAME[item.id];
          if (apiName) itemSrcMap[apiName] = item.src;
        }

        const srcs = winHistRes.value
          .map((w) => w.element__element_name ? itemSrcMap[w.element__element_name] : undefined)
          .filter(Boolean) as string[];

        if (srcs.length > 0) {
          const serverResults = srcs.reverse();
          /* Only replace if server has at least as many results — avoids wiping
             locally-added winners when server data is stale */
          setResultSrcs((prev) => serverResults.length >= prev.length ? serverResults : prev);
        }
      }
    };

    const id = window.setInterval(refreshLiveData, LIVE_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [phase, isAdvanceMode]);

  useEffect(() => {
    if (!canBet || pointerStops.length === 0) return;

    setPointerStopIndex(0);
    const id = window.setInterval(() => {
      setPointerStopIndex((prev) => (prev + 1) % pointerStops.length);
    }, 1000);

    return () => window.clearInterval(id);
  }, [canBet, pointerStops.length]);

  // -- Sequential lottery-style spinning during DRAWING --
  // Phase 1: fast spin loop while waiting for server winner
  // Phase 2: decelerate and land on winner once winnerIds arrives
  const drawStartRef = useRef<number>(0);

  useEffect(() => {
    if (phase !== 'DRAWING') return;

    const order = DRAW_HIGHLIGHT_ORDER;
    const winners = winnerRef.current;

    if (!winners || winners.length === 0) {
      drawStartRef.current = Date.now();
      let step = 0;
      const spinInterval = window.setInterval(() => {
        step++;
        setDrawHighlightIndex(step % order.length);
      }, 100);
      return () => window.clearInterval(spinInterval);
    }

    const landingId = winners[0];
    const winnerIdx = order.indexOf(landingId);

    const elapsed = Date.now() - drawStartRef.current;
    const remainingMs = Math.max(2000, DRAW_SECONDS * 1000 - elapsed - 100);

    /* Continue from where the fast-spin left off instead of restarting from 0 */
    const currentStep = drawHighlightIndex;
    const fullLoops = 2;
    /* Calculate how many steps from current position to winner, going forward */
    const stepsToWinner = ((winnerIdx - currentStep) % order.length + order.length) % order.length;
    const totalSteps = fullLoops * order.length + stepsToWinner + 1;

    const rawDelays: number[] = [];
    for (let i = 0; i < totalSteps; i++) {
      const p = totalSteps > 1 ? i / (totalSteps - 1) : 0;
      rawDelays.push(1 + 5 * p * p * p);
    }
    const rawSum = rawDelays.reduce((a, b) => a + b, 0);
    const delays = rawDelays.map(d => d * (remainingMs / rawSum));

    let cumulative = 0;
    const timers: number[] = [];

    for (let i = 0; i < totalSteps; i++) {
      cumulative += delays[i];
      const step = i;
      const timerId = window.setTimeout(() => {
        setDrawHighlightIndex((currentStep + step) % order.length);
      }, cumulative);
      timers.push(timerId);
    }

    return () => {
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [phase, winnerIds]);

  useEffect(() => {
    if (phase !== 'DRAWING') return;
    if (timeLeft > 0) return;
    if (winnerIds && winnerIds.length > 0) return;

    // Drawing timer ended with no winner yet: resolve immediately using latest polled entry.
    winnerPollTokenRef.current += 1; // invalidate older polling loops
    let cancelled = false;

    const resolveWinnerNow = async () => {
      const tryApply = (entry: ApiWinElement | null) => {
        if (!entry || cancelled || phaseRef.current !== 'DRAWING') return false;
        if (typeof entry.id === 'number') {
          lastWinIdRef.current = entry.id;
        }
        return applyWinnerFromServer(entry);
      };

      if (tryApply(latestPolledWinRef.current)) return;

      try {
        const results = await apiFetch<ApiWinElement[]>('/game/win/elements/list', 1, apiBodyWithMode(isAdvanceMode ? 1 : 2));
        if (cancelled || phaseRef.current !== 'DRAWING') return;
        if (Array.isArray(results) && results.length > 0) {
          const latest = results[results.length - 1];
          latestPolledWinRef.current = latest;
          if (tryApply(latest)) return;
        }
      } catch (err) {
        console.warn('[LIVE] Final winner fetch failed at draw timeout:', err);
      }

      if (cancelled || phaseRef.current !== 'DRAWING') return;

      /* Extended retry: keep trying for up to WINNER_MAX_WAIT_MS instead of hardcoding a fallback */
      console.warn('[LIVE] Draw timeout with no winner, entering extended retry...');
      const extStart = Date.now();
      while (Date.now() - extStart < WINNER_MAX_WAIT_MS) {
        await new Promise((resolve) => setTimeout(resolve, WINNER_POLL_INTERVAL_MS));
        if (cancelled || phaseRef.current !== 'DRAWING') return;

        try {
          const retryResults = await apiFetch<ApiWinElement[]>('/game/win/elements/list', 1, apiBodyWithMode(isAdvanceMode ? 1 : 2));
          if (cancelled || phaseRef.current !== 'DRAWING') return;
          if (Array.isArray(retryResults) && retryResults.length > 0) {
            const latest = retryResults[retryResults.length - 1];
            latestPolledWinRef.current = latest;
            if (tryApply(latest)) return;
          }
        } catch { /* keep retrying */ }
      }

      if (cancelled || phaseRef.current !== 'DRAWING') return;

      /* Absolute last resort: skip round entirely rather than show wrong winner */
      console.error('[LIVE] No winner after extended retry \u2014 skipping round');
      setPhase('SHOWTIME');
      phaseRef.current = 'SHOWTIME';
      setTimeLeft(1);
      setPendingWin(null);
      setResultKind('NOBET');
      setShowResultBoard(false);
    };

    void resolveWinnerNow();

    return () => {
      cancelled = true;
    };
  }, [applyWinnerFromServer, isAdvanceMode, phase, timeLeft, winnerIds]);

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
      setShowPreDraw(false);
    }, PRE_DRAW_MS);

    return () => {
      if (preDrawTimeoutRef.current) window.clearTimeout(preDrawTimeoutRef.current);
    };
  }, [showPreDraw]);

  useEffect(() => {
    if (timeLeft > 0) return;

    if (phase === 'BETTING') {
      /* Timer sync keeps countdown accurate; transition immediately to DRAWING */
      currentSessionEndRef.current = '';
      bettingEndMsRef.current = 0;
      setPhase('DRAWING');
      phaseRef.current = 'DRAWING';
      setTimeLeft(DRAW_SECONDS);
      setWinnerIds(null);
      winnerRef.current = null;
      latestPolledWinRef.current = null;

      const token = Date.now();
      winnerPollTokenRef.current = token;
      void pollWinnerUntilNewResult(token);
      return;
    }

    if (activeModal !== 'NONE' || showGameOn) return;

    if (phase === 'DRAWING') {
      const winners = winnerRef.current;
      if (!winners || winners.length === 0) return;

      const hadAnyBet = totalBet > 0;

      let winAmount = 0;
      let primaryId: ItemId = winners[0];

      if (roundType === 'JACKPOT') {
        const jackpotItems = winners;
        const j = computeJackpotWin({ jackpotItems, bets, itemMultiplier, jackpotBonus: jackpotAmount });
        winAmount = j.totalWin;
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
        let newSrc: string;
        if (roundType === 'JACKPOT') {
          const isVeg = VEG_ITEMS.includes(primaryId);
          newSrc = isVeg ? '/image2/tab_vegetables.png' : '/image2/tab_drinks.png';
        } else {
          newSrc = itemMap[primaryId].src;
        }
        return [newSrc, ...prev];
      });

      setPhase('SHOWTIME');
      setTimeLeft(roundType === 'JACKPOT' ? 5 : SHOW_SECONDS);

      if (winAmount > 0) {
        setShowFireworks(true);
        setFireworksSeed((prev) => prev + 1);
      } else {
        setShowFireworks(false);
      }

      if (roundType === 'JACKPOT') {
        setTimeout(() => setShowResultBoard(true), 2500);
      } else {
        setShowResultBoard(true);
      }
      return;
    }

    if (phase === 'SHOWTIME') {
      if (transitioningRef.current) return;
      transitioningRef.current = true;
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

      void refreshRoundStateFromServer();

      setBets(buildEmptyBets());
      setPendingWin(null);
      setDrawHighlightIndex(0);

      setShowResultBoard(false);
      setShowFireworks(false);

      setWinnerIds(null);
      winnerRef.current = null;
      setItemPulse({ id: null, key: 0 }); // clear stale pulse so last-bet item doesn't bump next round

      setTimeout(() => void beginRound(), 150);
    }
  }, [
    activeModal,
    balance,
    bets,
    beginRound,
    itemMap,
    itemMultiplier,
    jackpotAmount,
    pendingWin,
    phase,
    pollWinnerUntilNewResult,
    refreshRoundStateFromServer,
    roundType,
    showGameOn,
    timeLeft,
    totalBet,
    winnerIds,
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

    /* Submit bet to API — only revert on client-side rejection (4xx), not server errors */
    if (PLAYER_ID) {
      const chipAmount = selectedChip;
      submitParticipantBet({ itemId, bet: chipAmount, balanceAfterBet: balance - chipAmount }).then((status) => {
        if (status === 'rejected') {
          /* Server explicitly rejected the bet (insufficient balance, betting closed, etc.) */
          console.warn('[API] Bet rejected by server, reverting:', { itemId, bet: chipAmount });
          setBalance((prev) => prev + chipAmount);
          setLifetimeBet((prev) => prev - chipAmount);
          setBets((prev) => ({
            ...prev,
            [itemId]: Math.max(0, prev[itemId] - chipAmount),
          }));
        }
        /* 'server_error' and 'ok' — don't revert (server may have accepted but returned error) */
      });
    }

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
    const totalW = n * baseSize;
    const gap = (containerWidth - totalW) / (n + 1);
    const centerX = containerLeft + gap * (index + 1) + baseSize * index + baseSize / 2;
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




        {/* Dynamic diamond balance bar â€” layered from individual assets */}
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

            {/* Diamond icon â€” overlapping left edge */}
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
                width: 32,
                height: 32,
                left: 25,
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
                style={{
                  width: iconBtn.key === 'close' ? 15 : 22,
                  height: iconBtn.key === 'close' ? 20 : 22,
                  marginTop: iconBtn.key === 'close' ? 0 : 0,
                }}
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
            setActiveModal('JACKPOT');
          }}
          className="absolute z-40"
          style={{ left: 295, top: 38, width: 100, height: 72 }}
        >
          <motion.div
            className="relative h-full w-full"
            animate={{ y: [0, -2.2, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          >
            <img
              src="/image2/jackpot2.png"
              alt=""
              className="h-full w-full object-contain"
            />
            <div
              className="absolute"
              style={{
                bottom: 8, left: '50%', transform: 'translateX(-50%)',
                fontFamily: 'Inter, system-ui, sans-serif', fontWeight: 700, fontSize: 10,
                color: '#FFD700',
                textShadow: `
      1px 0 0 #4a1a00, -1px 0 0 #4a1a00,
      0 1px 0 #4a1a00, 0 -1px 0 #4a1a00,
      0 1px 3px rgba(0,0,0,0.9), 0 0 6px rgba(255,180,0,0.4)
    `,
                whiteSpace: 'nowrap', letterSpacing: '0.05em',
              }}
            >
              {formatNum(jackpotAmount)}
            </div>
          </motion.div>
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

        {/* Wooden signboard â€” always visible */}
        <motion.img
          src={gameLogoSrc}
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

        {/* Text overlay â€” always use local wordmark for consistent display */}
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
              onPointerDown={(e) => { e.preventDefault(); placeBet(it.id); }}
              className="absolute z-30 border-none bg-transparent p-0"
              style={{ left: it.left, top: it.top, width: it.width, height: it.height, touchAction: 'none', cursor: canBet ? 'pointer' : 'default' }}
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
                      : { duration: 0.3, ease: 'easeOut' }
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

              {/* â”€â”€ Winner starburst sparkle effect â”€â”€ */}
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
              opacity: 1,                 // âœ… never fade
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
              opacity: 1,                 // âœ… never fade
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

          <div
            className="absolute z-20 flex items-center overflow-x-auto overflow-y-hidden select-none"
            style={{
              left: 30,
              top: 93,
              width: 340,
              height: 80,
              pointerEvents: canBet ? 'auto' : 'none',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              WebkitOverflowScrolling: 'touch',
              paddingLeft: 10, // starting padding
              gap: 0, // disable auto gap
              cursor: 'grab',
              userSelect: 'none',
            }}
            onMouseDown={(e) => {
              const slider = e.currentTarget;
              slider.style.cursor = 'grabbing';
              const startX = e.pageX - slider.offsetLeft;
              const scrollLeft = slider.scrollLeft;

              const onMouseMove = (e: MouseEvent) => {
                const x = e.pageX - slider.offsetLeft;
                const walk = (x - startX) * 1.5;
                slider.scrollLeft = scrollLeft - walk;
              };

              const onMouseUp = () => {
                slider.style.cursor = 'grab';
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
              };

              document.addEventListener('mousemove', onMouseMove);
              document.addEventListener('mouseup', onMouseUp);
            }}
          >
            <style>{`
    div::-webkit-scrollbar {
      display: none;
    }
  `}</style>

            {chipValues.map((value, idx) => {
              const active = value === selectedChip;
              const imgSrc = CHIP_IMAGE_MAP[value] || '/image2/chip_10.png';

              const isLargeChip = value === 100 || value === 10000;
              const baseSize = isLargeChip ? 67 : 54;
              const chipSize = baseSize;
              const marginTop = isLargeChip ? -5 : 0;

              // Manual gap control - adjust each value as needed
              const gaps = [0, 4, 7, 11, 11, 4.5]; // gap before each chip (index 0 is first chip)
              const marginLeft = idx === 0 ? 0 : (gaps[idx] ?? 10);

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
                    width: baseSize,
                    height: baseSize,
                    marginLeft: marginLeft,
                    marginTop: marginTop,
                    cursor: canBet ? 'pointer' : 'default',
                    borderRadius: 999,
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'transparent',
                    WebkitAppearance: 'none',
                    outline: 'none',
                    flexShrink: 0,
                  }}
                  whileTap={canBet ? { scale: 0.94 } : undefined}
                >
                  {/* Smooth white fade background - only when selected */}
                  <motion.div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      borderRadius: 999,
                      background: 'radial-gradient(circle, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0.15) 50%, transparent 70%)',
                    }}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{
                      opacity: active ? 1 : 0,
                      scale: active ? 1.1 : 0.8,
                    }}
                    transition={{
                      duration: 0.25,
                      ease: [0.4, 0, 0.2, 1]
                    }}
                  />

                  <motion.img
                    src={imgSrc}
                    alt={`${value}`}
                    className="object-contain relative z-10"
                    draggable={false}
                    style={{
                      width: chipSize,
                      height: chipSize,
                    }}
                    animate={{
                      scale: active ? 1.15 : 1,
                    }}
                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  />
                </motion.button>
              );
            })}
          </div>

          <div
            className="absolute z-10 overflow-hidden"
            style={{
              left: 25,
              top: 203,
              width: 340,
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

          {/* â”€â”€ Dynamic chests from API â”€â”€ */}
          {/* â”€â”€ Dynamic chests from API (shake + flare when ready, clickable only when ready) â”€â”€ */}
          {/* â”€â”€ Dynamic chests from API (shake + flare when ready, clickable only when ready) â”€â”€ */}
          {/* â”€â”€ Dynamic chests from API (shake + flare when ready, clickable only when ready) â”€â”€ */}
          {/* â”€â”€ Dynamic chests from API (shake + flare when ready, clickable only when ready) â”€â”€ */}
          {boxData.map((box, idx) => {
            const totalBoxes = boxData.length;
            const boxWidth = 56;
            // Align chests exactly with the progress bar (left: 25, width: 343)
            const barLeft = 25;
            const barRight = 25 + 345; // 370 — aligned with chip container right edge
            const firstChestLeft = barLeft + 15; // 40
            const lastChestLeft = barRight - boxWidth; // 314 — last chest right edge at 370
            const spacing = totalBoxes > 1 ? (lastChestLeft - firstChestLeft) / (totalBoxes - 1) : 0;
            const xPos = firstChestLeft + idx * spacing;

            const threshold = BOX_THRESHOLDS[idx] ?? BOX_THRESHOLDS[BOX_THRESHOLDS.length - 1];
            const opened = !!openedChests[threshold];
            const ready = isChestReady(threshold);

            const closedSrc = box.src;
            const openSrc = box.openSrc || CHEST_OPEN_SRC_BY_THRESHOLD[threshold] || closedSrc;
            const chestSrc = opened ? openSrc : closedSrc;

            const flareSize = boxWidth + 30;

            return (
              <button
                key={`${threshold}-${idx}`}
                type="button"
                onClick={() => openChest(threshold)}
                className="absolute z-20 p-0 border-none bg-transparent"
                style={{
                  left: xPos,
                  top: 188,
                  width: boxWidth,
                  height: boxWidth + 20,
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
                      animate={{ opacity: 1, scale: 1, filter: 'brightness(1.4)' }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ opacity: { duration: 0.2 }, scale: { duration: 0.2 } }}
                    >
                      <motion.img
                        src="/image2/flare_circular.png"
                        alt=""
                        aria-hidden="true"
                        className="absolute inset-0"
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          transformOrigin: 'center center',
                        }}
                        animate={{ rotate: 360 }}
                        transition={{
                          repeat: Infinity,
                          duration: 1,
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

                {/* Label removed — using API labels only from progress bar markers */}
              </button>
            );
          })}
          <div
            className="absolute z-10"
            style={{
              left: 27,
              top: 245,
              width: 343,
              height: 35,
              borderRadius: 12,
              background: isAdvanceMode ? '#D95B48' : '#0F6095',
              border: isAdvanceMode ? '2px solid #E92407' : '2px solid #1087C6',
              boxShadow: isAdvanceMode ? '0px 1px 0px 0px #A87C75' : '0px 1px 0px #4ABAF9',
            }}
          />


          <div className="absolute z-20 flex items-center" style={{ left: 40, top: 255, width: 43, height: 16, fontFamily: 'Inter, system-ui, sans-serif', fontWeight: 700, fontSize: 14.24, lineHeight: '15.34px', letterSpacing: '-0.02em', color: '#FFFFFF' }}>
            Result
          </div>

          <div className="absolute z-20" style={{
            left: 92.5, top: 250, width: 0, height: 24, borderLeft: '1px solid', borderImageSource: isAdvanceMode
              ? 'linear-gradient(180deg, #D95B48 -6.25%, #FFFFFF 50%, #D95B48 106.25%)'
              : 'linear-gradient(180deg, #0F6095 -6.25%, #FFFFFF 50%, #0F6095 106.25%)',
            borderImageSlice: 1
          }} />

          {/* Scrollable result strip â€” newest at left */}
          <div
            className="absolute z-20"
            style={{
              left: 100,
              top: 246,
              width: 260,
              height: 35,
              overflow: 'hidden',
            }}
          >
            <div
              className="result-strip-scroll"
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                height: '100%',
                paddingLeft: 4,
                paddingRight: 4,
                overflowX: 'auto',
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
              }}
            >
              {resultSrcs.map((src, idx) => {
                if (!src) return null;
                return (
                  <img
                    key={`result-${idx}-${src}`}
                    src={src}
                    alt=""
                    style={{
                      width: 26,
                      height: 26,
                      minWidth: 26,
                      objectFit: 'contain',
                      animation: idx === 0 && phase === 'SHOWTIME' ? 'slideInResult 0.3s ease-out' : undefined,
                    }}
                  />
                );
              })}
            </div>
          </div>
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
                    height: 'auto',        // âœ… keeps ratio (no stretch)
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

              {/* âœ… WIN PANEL â€” Trophy animation */}
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
                /* âœ… NO BET + LOSE PANEL */
                <div className="absolute" style={{ left: 26, top: 300, width: 350, height: 340, overflow: 'hidden' }}>
                  <img src="/image2/panel_scoreboard_blank.png" alt="" className="absolute inset-0 h-full w-full object-fill" />

                  {/* â”€â”€ Header: inside the rounded pill-shaped strip â”€â”€ */}
                  <div className="absolute flex items-center" style={{ left: 30, top: 72, width: 290, height: 42 }}>
                    <div
                      className="shrink-0 flex items-center justify-center"
                      style={{ width: 44, height: 44 }}
                    >
                      <img
                        src={roundType === 'JACKPOT' ? '/image2/bucket.png' : (winnerItem ? winnerItem.src : '/image2/lemon.png')}
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

                  {/* â”€â”€ Leaderboard rows â€” inside body area below header strip â”€â”€ */}
                  {topWinnersRows.slice(0, 3).map((row, idx) => (
                    <div
                      key={`${row.name}-${idx}`}
                      className="absolute flex items-center"
                      style={{ left: 40, top: 130 + idx * 52, width: 250, height: 50 }}
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
                          width: 70,
                          flexShrink: 0,
                          color: '#fff',
                          fontFamily: 'Inria Serif, serif',
                          fontStyle: 'italic',
                          fontSize: 18,
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

                      <div className="absolute flex items-center" style={{ gap: 3, left: 190, top: 0, bottom: 0 }}>
                        <img src="/image2/diamond.png" alt="" style={{ width: 16, height: 16, flexShrink: 0 }} />
                        <span
                          style={{
                            color: '#ffe8a9',
                            fontFamily: 'Inter, system-ui, sans-serif',
                            fontWeight: 700,
                            fontSize: 14,
                            lineHeight: '18px',
                            textShadow: '0 1px 2px rgba(0,0,0,0.6)',
                            whiteSpace: 'nowrap',
                            width: 50,
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
                  <div className="relative h-full w-full" style={{ overflow: 'visible' }}>

                    {/* â”€â”€ rules_board.png as the outer frame â”€â”€ */}
                    <img
                      src="/image2/rules_board.png"
                      alt=""
                      className="absolute inset-0 w-full h-full"
                      style={{ objectFit: 'fill', borderRadius: 18, zIndex: 0 }}
                    />

                    {/* â”€â”€ "Rule" title â€” same gold style as jackpot board, NO red pill â”€â”€ */}
                    <div
                      className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center"
                      style={{
                        top: 14,
                        zIndex: 10,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <span
                        style={{
                          fontFamily: 'Inter, system-ui, sans-serif',
                          fontWeight: 700,
                          fontSize: 26,
                          color: '#ffd900',
                          textTransform: 'uppercase',
                          letterSpacing: '1px',
                          textShadow: `
            0.8px  0.8px 0 #7a3c08,
            -0.8px -0.8px 0 #7a3c08,
             0.8px -0.8px 0 #7a3c08,
            -0.8px  0.8px 0 #7a3c08
          `,
                        }}
                      >

                      </span>
                    </div>

                    {/* â”€â”€ Red × close button â”€â”€ */}
                    <button
                      type="button"
                      onClick={() => setActiveModal('NONE')}
                      className="absolute flex items-center justify-center"
                      style={{
                        right: -1,
                        top: 28,
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        background: 'linear-gradient(180deg, #FF4444 0%, #CC1111 100%)',
                        border: '3px solid #fff',
                        boxShadow: '0 3px 8px rgba(0,0,0,0.4)',
                        zIndex: 20,
                        cursor: 'pointer',
                      }}
                      aria-label="Close rules"
                    >
                      <span style={{ color: '#fff', fontSize: 14, fontWeight: 900, lineHeight: 1 }}>×</span>
                    </button>

                    {/* â”€â”€ #FFEBBB content mask â€” hides baked-in board text â”€â”€ */}
                    <div
                      style={{
                        position: 'absolute',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        top: 60,
                        width: 290,
                        height: 357,
                        borderRadius: 13,
                        background: '#FFEBBB',
                        zIndex: 5,
                        overflow: 'hidden',
                      }}
                    >
                      {/* â”€â”€ Scrollable rules list â”€â”€ */}
                      <div
                        style={{
                          height: '100%',
                          overflowY: 'auto',
                          overflowX: 'hidden',
                          paddingTop: 14,
                          paddingBottom: 14,
                          paddingLeft: 16,
                          paddingRight: 10,
                          scrollbarWidth: 'none',
                          msOverflowStyle: 'none',
                        }}
                      >
                        <ol style={{ margin: 0, padding: '0 0 0 18px', listStyleType: 'decimal' }}>
                          {(apiRules.length > 0
                            ? apiRules
                            : [
                              'Choose the quantity of diamonds and then select an option to place a bet on.',
                              'The time for betting is 30 seconds each round and the winners will be announced after betting.',
                              'If you bet diamonds on the winning option, you will receive the corresponding diamonds.',
                              'You can bet on up to 6 options each round.',
                              'The Prize Pool enlarges as more and more players join in, the chances to choose Vegetables or Animals increase when the pool reaches a certain scale.',
                              'If the winning option is a vegetable, then all players who bet on vegetables will receive rewards.',
                              'Players who bet on the exact winning item will receive a higher reward multiplier.',
                            ]
                          ).map((rule, idx) => (
                            <li
                              key={idx}
                              style={{
                                fontFamily: 'Inter, system-ui, sans-serif',
                                fontWeight: 400,
                                fontSize: 13,
                                lineHeight: '20px',
                                color: '#7b471d',
                                marginBottom: 8,
                              }}
                            >
                              {rule}
                            </li>
                          ))}
                        </ol>

                        {apiRulesVersion && (
                          <div
                            style={{
                              marginTop: 6,
                              textAlign: 'right',
                              fontFamily: 'Inter, system-ui, sans-serif',
                              fontSize: 11,
                              color: '#b58a55',
                              paddingRight: 4,
                            }}
                          >
                            {apiRulesVersion}
                          </div>
                        )}
                      </div>
                    </div>

                  </div>
                ) : null}

                {activeModal === 'PRIZE' ? (
                  <div className="relative h-full w-full" style={{ overflow: 'visible' }}>

                    {/* â”€â”€ Outer board frame â”€â”€ */}
                    <img
                      src="/image2/rules_board.png"
                      alt=""
                      className="absolute inset-0 w-full h-full"
                      style={{ objectFit: 'fill', borderRadius: 18, zIndex: 0 }}
                    />
                    <div
                      className="absolute left-1/2 -translate-x-1/2"
                      style={{
                        top: 14,
                        zIndex: 9,
                        width: 200,
                        height: 35,
                        background: 'linear-gradient(180deg, #FFC100 0%, #FFAE03 100%)',
                        borderRadius: 8,
                      }}
                    />
                    {/* â”€â”€ "Prize distribution" gold title â”€â”€ */}
                    <div
                      className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center"
                      style={{ top: 18, zIndex: 10, whiteSpace: 'nowrap' }}
                    >
                      <span
                        style={{
                          fontFamily: 'Inter, system-ui, sans-serif',
                          fontWeight: 600,
                          fontSize: 20,
                          color: '#fff4d9',
                          top: -20,
                          letterSpacing: '0.5px',
                          textShadow: `
            0.8px  0.8px 0 #7a3c08,
            -0.8px -0.8px 0 #7a3c08,
             0.8px -0.8px 0 #7a3c08,
            -0.8px  0.8px 0 #7a3c08
          `,
                        }}
                      >
                        Prize distribution
                      </span>
                    </div>

                    {/* â”€â”€ Red × close button â”€â”€ */}
                    <button
                      type="button"
                      onClick={() => setActiveModal('NONE')}
                      className="absolute flex items-center justify-center"
                      style={{
                        right: -1,
                        top: 28,
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        background: 'linear-gradient(180deg, #FF4444 0%, #CC1111 100%)',
                        border: '3px solid #fff',
                        boxShadow: '0 3px 8px rgba(0,0,0,0.4)',
                        zIndex: 20,
                        cursor: 'pointer',
                      }}
                      aria-label="Close prize"
                    >
                      <span style={{ color: '#fff', fontSize: 14, fontWeight: 900, lineHeight: 1 }}>×</span>
                    </button>

                    {/* â”€â”€ #FFEBBB content mask â”€â”€ */}
                    <div
                      style={{
                        position: 'absolute',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        top: 58,
                        width: 290,
                        height: 359,
                        borderRadius: 13,
                        background: '#FFEBBB',
                        zIndex: 5,
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                      }}
                    >
                      {/* â”€â”€ Scrollable content â”€â”€ */}
                      <div
                        style={{
                          flex: 1,
                          overflowY: 'auto',
                          overflowX: 'hidden',
                          padding: '12px 12px 10px',
                          scrollbarWidth: 'none',
                          msOverflowStyle: 'none',
                        }}
                      >

                        {/* â”€â”€ Prize table â”€â”€ */}
                        <div
                          style={{
                            width: '100%',
                            borderRadius: 10,
                            overflow: 'hidden',
                            marginBottom: 16,
                            border: '1.5px solid rgba(180,110,40,0.25)',
                          }}
                        >
                          {/* Table header */}
                          <div
                            style={{
                              display: 'flex',
                              background: 'linear-gradient(180deg, #e8a43a 0%, #d4881c 100%)',
                              padding: '9px 16px',
                            }}
                          >
                            <span style={{
                              flex: 1,
                              fontFamily: 'Inter, system-ui, sans-serif',
                              fontWeight: 400,
                              fontSize: 16,
                              color: '#fff',
                              textAlign: 'center',

                            }}>
                              Rank
                            </span>
                            <span style={{
                              flex: 1,
                              fontFamily: 'Inter, system-ui, sans-serif',
                              fontWeight: 400,
                              fontSize: 16,
                              color: '#fff',
                              textAlign: 'center',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 4,
                            }}>
                              Prize <img src="/image2/diamond.png" alt="" style={{ width: 18, height: 18 }} />
                            </span>
                          </div>

                          {/* Table rows â€” pull from API or use defaults */}
                          {(() => {
                            const defaultRows = [
                              { rank: '1', prize: 1000000 },
                              { rank: '2', prize: 800000 },
                              { rank: '3', prize: 500000 },
                              { rank: '4~9', prize: 100000 },
                              { rank: '10~15', prize: 80000 },
                            ];

                            // Try to build rows from prizeData API
                            const apiRows: { rank: string; prize: number }[] = [];
                            if (prizeData) {
                              const src = isAdvanceMode ? prizeData.advance : prizeData.general;
                              if (src?.ranks?.length) {
                                src.ranks.forEach(r => apiRows.push({ rank: r.rank, prize: r.prize }));
                              }
                            }

                            const rows = apiRows.length > 0 ? apiRows : defaultRows;

                            return rows.map((row, idx) => {
                              const isAlt = idx % 2 === 1;
                              return (
                                <div
                                  key={idx}
                                  style={{
                                    display: 'flex',
                                    padding: '10px 16px',
                                    background: isAlt
                                      ? 'rgba(220,150,60,0.18)'
                                      : 'rgba(255,240,200,0.55)',
                                    borderTop: '1px solid rgba(180,110,40,0.12)',
                                  }}
                                >
                                  <span style={{
                                    flex: 1,
                                    fontFamily: 'Inter, system-ui, sans-serif',
                                    fontWeight: 400,
                                    fontSize: 14,
                                    color: '#7b471d',
                                    textAlign: 'center',
                                  }}>
                                    {row.rank}
                                  </span>
                                  <span style={{
                                    flex: 1,
                                    fontFamily: 'Inter, system-ui, sans-serif',
                                    fontWeight: 400,
                                    fontSize: 14,
                                    color: '#7b471d',
                                    textAlign: 'center',
                                  }}>
                                    {row.prize.toLocaleString('en-US')}
                                  </span>
                                </div>
                              );
                            });
                          })()}
                        </div>

                        {/* â”€â”€ Numbered rules below table â”€â”€ */}
                        {(() => {
                          // If API has a title, show it (not needed per ref â€” ref has no sub-title)
                          const rules = [
                            'The prize diamond will increase after each game round.',
                            'The top 15 players can display in the ranking list. The list will updated at 0 o\'clock every day.',
                            'The ranking of the leaderboard depends on the amount of players\' diamonds Played. The more diamonds Played in the game, the higher the ranking and the richer the rewards.',
                          ];

                          return (
                            <ol style={{ margin: 0, padding: '0 0 0 18px', listStyleType: 'decimal' }}>
                              {rules.map((rule, idx) => (
                                <li
                                  key={idx}
                                  style={{
                                    fontFamily: 'Inter, system-ui, sans-serif',
                                    fontWeight: 400,
                                    fontSize: 13,
                                    lineHeight: '21px',
                                    color: '#7b471d',
                                    marginBottom: 10,
                                  }}
                                >
                                  {rule}
                                </li>
                              ))}
                            </ol>
                          );
                        })()}

                      </div>
                    </div>

                  </div>
                ) : null}

                {activeModal === 'RECORDS' ? (
                  <div className="relative h-full w-full" style={{ overflow: 'visible' }}>

                    {/* â”€â”€ game_record_board.png as outer frame â”€â”€ */}
                    <img
                      src="/image2/game_record_board.png"
                      alt=""
                      className="absolute inset-0 w-full h-full"
                      style={{ objectFit: 'fill', borderRadius: 18, zIndex: 0 }}
                    />

                    {/* â”€â”€ Red × close button â”€â”€ */}
                    <button
                      type="button"
                      onClick={() => setActiveModal('NONE')}
                      className="absolute flex items-center justify-center"
                      style={{
                        right: -1,
                        top: 18,
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        background: 'linear-gradient(180deg, #FF4444 0%, #CC1111 100%)',
                        border: '3px solid #fff',
                        boxShadow: '0 3px 8px rgba(0,0,0,0.4)',
                        zIndex: 20,
                        cursor: 'pointer',
                      }}
                      aria-label="Close records"
                    >
                      <span style={{ color: '#fff', fontSize: 14, fontWeight: 900, lineHeight: 1 }}>×</span>
                    </button>

                    {/* â”€â”€ #FFEBBB content mask â”€â”€ */}
                    <div
                      style={{
                        position: 'absolute',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        top: 55,
                        width: 290,
                        height: 362,
                        borderRadius: 13,
                        background: '#FFEBBB',
                        zIndex: 5,
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                      }}
                    >
                      {/* â”€â”€ Scrollable records list â”€â”€ */}
                      <div
                        style={{
                          flex: 1,
                          overflowY: 'auto',
                          overflowX: 'hidden',
                          padding: '10px 10px 6px 10px',
                          scrollbarWidth: 'none',
                          msOverflowStyle: 'none',
                        }}
                      >
                        {(() => {
                          const displayRecords = apiPlayerRecords.length > 0
                            ? apiPlayerRecords
                            : records.map(r => ({
                              round: r.round,
                              element: ID_TO_API_NAME[r.winner[0]] ?? r.winner[0],
                              bet: r.selectedAmount,
                              win: r.win,
                              time: r.at,
                              balanceBefore: r.balanceBefore,
                              balanceAfter: r.balanceAfter,
                            }));

                          if (displayRecords.length === 0) {
                            return (
                              <div style={{
                                paddingTop: 60,
                                textAlign: 'center',
                                fontFamily: 'Inter, system-ui, sans-serif',
                                fontSize: 13,
                                color: '#b58a55',
                              }}>
                                No records yet. Play some rounds!
                              </div>
                            );
                          }

                          return displayRecords.map((r, idx) => {
                            // Resolve element â†’ ItemSpec for icon
                            const itemId = r.element ? (API_NAME_TO_ID[r.element] ?? null) : null;
                            const itemSpec = itemId ? ITEMS.find(it => it.id === itemId) : null;

                            // Balances
                            const balBefore = r.balanceBefore ?? null;
                            const balAfter = r.balanceAfter ?? null;

                            return (
                              <div
                                key={idx}
                                style={{
                                  background: 'rgba(255,255,255,0.6)',
                                  borderRadius: 10,
                                  padding: '10px 12px 10px 12px',
                                  marginBottom: 8,
                                  border: '1px solid rgba(180,120,50,0.15)',
                                }}
                              >
                                {/* â”€â”€ Row 1: Round + Time â”€â”€ */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                  <span style={{
                                    fontFamily: 'Inter, system-ui, sans-serif',
                                    fontWeight: 700, fontSize: 13, color: '#5a2d0c',
                                  }}>
                                    Round: {r.round ?? '-'}
                                  </span>
                                  {r.time && (
                                    <span style={{
                                      fontFamily: 'Inter, system-ui, sans-serif',
                                      fontWeight: 400, fontSize: 10.5, color: '#8a5a2a',
                                    }}>
                                      {r.time}
                                    </span>
                                  )}
                                </div>

                                {/* â”€â”€ Row 2: Selected option â”€â”€ */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                                  <span style={{
                                    fontFamily: 'Inter, system-ui, sans-serif',
                                    fontWeight: 500, fontSize: 12.5, color: '#7b471d', flexShrink: 0,
                                  }}>
                                    Selected option:
                                  </span>
                                  {itemSpec && (
                                    <img src={itemSpec.src} alt="" style={{ width: 20, height: 20, objectFit: 'contain', flexShrink: 0 }} />
                                  )}
                                  {r.bet != null && r.bet > 0 && (
                                    <div style={{
                                      display: 'inline-flex', alignItems: 'center', gap: 3,
                                      background: 'linear-gradient(180deg, #7CFF6A 0%, #25C640 100%)',
                                      borderRadius: 999, paddingLeft: 7, paddingRight: 7, height: 19,
                                      border: '1px solid rgba(0,0,0,0.15)',
                                    }}>
                                      <span style={{ fontFamily: 'Inter', fontWeight: 800, fontSize: 11, color: '#0b2a12' }}>
                                        {formatNum(r.bet)}
                                      </span>
                                    </div>
                                  )}
                                </div>

                                {/* â”€â”€ Row 3: Winning items â”€â”€ */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                                  <span style={{
                                    fontFamily: 'Inter, system-ui, sans-serif',
                                    fontWeight: 500, fontSize: 12.5, color: '#7b471d', flexShrink: 0,
                                  }}>
                                    Winning items:
                                  </span>
                                  {itemSpec ? (
                                    <img src={itemSpec.src} alt="" style={{ width: 20, height: 20, objectFit: 'contain' }} />
                                  ) : (
                                    <span style={{ fontFamily: 'Inter', fontSize: 12, color: '#7b471d' }}>-</span>
                                  )}
                                </div>

                                {/* â”€â”€ Row 4: Win diamonds â”€â”€ */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                                  <span style={{
                                    fontFamily: 'Inter, system-ui, sans-serif',
                                    fontWeight: 500, fontSize: 12.5, color: '#7b471d', flexShrink: 0,
                                  }}>
                                    Win diamonds:
                                  </span>
                                  <div style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 3,
                                    background: 'linear-gradient(180deg, #b06ef3 0%, #7c3aed 100%)',
                                    borderRadius: 999, paddingLeft: 6, paddingRight: 8, height: 20,
                                    border: '1px solid rgba(0,0,0,0.12)',
                                  }}>
                                    <img src="/image2/diamond.png" alt="" style={{ width: 13, height: 13, flexShrink: 0 }} />
                                    <span style={{
                                      fontFamily: 'Inter, system-ui, sans-serif',
                                      fontWeight: 700, fontSize: 11.5, color: '#fff',
                                    }}>
                                      {r.win != null ? formatNum(r.win) : '0'}
                                    </span>
                                  </div>
                                </div>

                                {/* â”€â”€ Row 5: Diamond Balance â”€â”€ */}
                                {(balBefore != null || balAfter != null) && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{
                                      fontFamily: 'Inter, system-ui, sans-serif',
                                      fontWeight: 500, fontSize: 12.5, color: '#7b471d', flexShrink: 0,
                                    }}>
                                      Diamond Balance:
                                    </span>
                                    <div style={{
                                      display: 'inline-flex', alignItems: 'center', gap: 4,
                                      background: 'linear-gradient(180deg, #b06ef3 0%, #7c3aed 100%)',
                                      borderRadius: 999, paddingLeft: 7, paddingRight: 8, height: 20,
                                      border: '1px solid rgba(0,0,0,0.12)',
                                    }}>
                                      <img src="/image2/diamond.png" alt="" style={{ width: 12, height: 12, flexShrink: 0 }} />
                                      <span style={{
                                        fontFamily: 'Inter, system-ui, sans-serif',
                                        fontWeight: 600, fontSize: 11, color: '#fff', whiteSpace: 'nowrap',
                                      }}>
                                        {formatNum(balBefore ?? 0)} -&gt; {formatNum(balAfter ?? 0)}
                                      </span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          });
                        })()}
                      </div>

                      {/* â”€â”€ Footer note pinned at bottom â”€â”€ */}
                      <div style={{
                        flexShrink: 0,
                        padding: '7px 12px 9px',
                        fontFamily: 'Inter, system-ui, sans-serif',
                        fontWeight: 400, fontSize: 11,
                        color: '#a07040',
                        textAlign: 'center',
                        borderTop: '1px solid rgba(180,120,50,0.15)',
                      }}>
                        Display game records of the last 7 days, with a maximum of 200 records.
                      </div>
                    </div>

                  </div>
                ) : null}

                {activeModal === 'JACKPOT' ? (
                  (() => {
                    /* â”€â”€ Jackpot number formatter: pad to 11 digits with leading zeros â”€â”€ */
                    const jackpotStr = String(jackpotAmount).padStart(11, '0');

                    return (
                      <div
                        className="relative flex items-center justify-center"
                        style={{ width: 326, height: 430 }}
                      >
                        {/* â”€â”€ LAYER 1: Outer orange board background â”€â”€ */}
                        {/* jackpot_board_bg: 339Ã—535, #EC9813, borderRadius 17 */}
                        {/* We scale it to fit the 326Ã—430 modal container */}
                        <img
                          src="/image2/jackpot_board_bg.png"
                          alt=""
                          className="absolute inset-0 w-full h-full"
                          style={{ objectFit: 'fill', borderRadius: 17, zIndex: 0 }}
                        />

                        {/* â”€â”€ LAYER 2: Inner front panel â”€â”€ */}
                        {/* jackpot_front_bg: 323Ã—517, borderRadius 17 */}
                        {/* Centered, ~8px inset on each side */}
                        <img
                          src="/image2/jackpot_front_bg.png"
                          alt=""
                          className="absolute"
                          style={{
                            left: 8, right: 8, top: 8, bottom: 8,
                            width: 'calc(100% - 16px)',
                            height: 'calc(100% - 16px)',
                            objectFit: 'fill',
                            borderRadius: 17,
                            zIndex: 1,
                          }}
                        />

                        {/* â”€â”€ LAYER 3: Ribbon at top center â”€â”€ */}
                        {/* ribbon.png sits on the top edge, overlapping both panels */}
                        <img
                          src="/image2/ribbon.png"
                          alt=""
                          className="absolute"
                          style={{
                            left: '50%',
                            transform: 'translateX(-50%)',
                            top: -80, /* Overlaps the top edge */
                            width: 260,
                            height: 'auto',
                            zIndex: 10,
                          }}
                        />

                        {/* â”€â”€ LAYER 4: "Jackpot" text on the ribbon â”€â”€ */}
                        {/* Match Game Rank text style: gold with brown border */}
                        <div
                          className="absolute"
                          style={{
                            left: '50%',
                            transform: 'translateX(-50%)',
                            top: -11, /* Adjust if ribbon height changes */
                            zIndex: 11,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <span
                            style={{
                              fontFamily: 'Inter, system-ui, sans-serif',
                              fontWeight: 400,
                              fontSize: 22,
                              color: '#ffd900',
                              textTransform: 'uppercase',
                              letterSpacing: '1px',
                              textShadow: `
                                0.8px 0.8px 0 #7a3c08,
                                -0.8px -0.8px 0 #7a3c08,
                                0.8px -0.8px 0 #7a3c08,
                                -0.8px 0.8px 0 #7a3c08
                              `,
                            }}
                          >
                            Jackpot
                          </span>
                        </div>

                        {/* â”€â”€ LAYER 5: Close button â”€â”€ */}
                        <button
                          type="button"
                          onClick={() => setActiveModal('NONE')}
                          className="absolute flex items-center justify-center"
                          style={{
                            right: -4, top: -4,
                            width: 32, height: 32,
                            borderRadius: '50%',
                            background: 'linear-gradient(180deg,#FF4444 0%,#CC1111 100%)',
                            border: '3px solid #fff',
                            boxShadow: '0 3px 8px rgba(0,0,0,0.4)',
                            zIndex: 20,
                            cursor: 'pointer',
                          }}
                          aria-label="Close jackpot"
                        >
                          <span style={{ color: '#fff', fontSize: 14, fontWeight: 900, lineHeight: 1 }}>×</span>
                        </button>

                        {/* â”€â”€ LAYER 6: Purple diamonds pile â”€â”€ */}
                        {/* diamonds.png: 273Ã—131, centered below ribbon */}
                        <img
                          src="/image2/diamonds.png"
                          alt=""
                          className="absolute"
                          style={{
                            left: '50%',
                            transform: 'translateX(-50%)',
                            top: 42, /* Below ribbon â€” adjust if ribbon top changes */
                            width: 260,
                            height: 125,
                            objectFit: 'contain',
                            zIndex: 5,
                          }}
                        />

                        {/* â”€â”€ LAYER 7: Red number frame â”€â”€ */}
                        {/* jackpot_red_frame: 296Ã—65 */}
                        <div
                          className="absolute"
                          style={{
                            left: '50%',
                            transform: 'translateX(-50%)',
                            top: 140, /* Below the diamonds pile */
                            width: 290,
                            height: 63,
                            zIndex: 6,
                          }}
                        >
                          <img
                            src="/image2/jackpot_red_frame.png"
                            alt=""
                            className="absolute inset-0 w-full h-full"
                            style={{ objectFit: 'fill', borderRadius: 8 }}
                          />

                          {/* Number display: diamond icon + padded number */}
                          {/* Leading zeros in a dimmer color, significant digits in bright gold */}
                          <div
                            className="absolute inset-0 flex items-center justify-center"
                            style={{ gap: 6, paddingLeft: 8, paddingRight: 8 }}
                          >
                            {/* Small diamond icon inside frame */}
                            <img
                              src="/image2/diamond.png"
                              alt=""
                              style={{ width: 22, height: 22, flexShrink: 0 }}
                            />

                            {/* Padded jackpot number â€” leading zeros dimmer, significant digits bright */}
                            <div
                              className="flex items-center"
                              style={{
                                fontFamily: 'Inter, system-ui, sans-serif',
                                fontWeight: 900,
                                fontSize: 22,
                                letterSpacing: '0.06em',
                                lineHeight: 1,
                              }}
                            >
                              {jackpotStr.split('').map((ch, ci) => {
                                /* Find first non-zero digit index */
                                const firstSig = jackpotStr.search(/[1-9]/);
                                const isLeading = firstSig === -1 ? ci < jackpotStr.length - 1 : ci < firstSig;
                                return (
                                  <span
                                    key={ci}
                                    style={{
                                      color: isLeading ? 'rgba(255,200,50,0.38)' : '#FFD700',
                                      textShadow: isLeading
                                        ? 'none'
                                        : '0 0 8px rgba(255,200,0,0.7), 0 2px 0 rgba(0,0,0,0.5)',
                                    }}
                                  >
                                    {ch}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        {/* â”€â”€ LAYER 8: Description text â”€â”€ */}
                        <div
                          className="absolute"
                          style={{
                            left: 24, right: 24,
                            top: 210, /* Below number frame */
                            zIndex: 5,
                            fontFamily: 'Inter, system-ui, sans-serif',
                            fontWeight: 400,
                            fontSize: 13,
                            color: '#8f5a1f',
                            textAlign: 'center',
                            lineHeight: '19px',
                          }}
                        >
                          All players can win the Jackpot. The more you play,
                          the higher your chances.
                        </div>

                        {/* â”€â”€ LAYER 9: Awards section â”€â”€ */}
                        <div
                          className="absolute"
                          style={{
                            left: 14,   /* contained inside board, was -14 */
                            right: 14,  /* contained inside board, was -14 */
                            top: 258,
                            zIndex: 5,
                          }}
                        >

                          {/* â”€â”€ "Awards" label â€” sits ABOVE the prize board strip â”€â”€ */}
                          <div
                            className="flex items-center justify-center"
                            style={{ marginBottom: 6 }}
                          >
                            <div style={{ flex: 1, height: 1, background: 'rgba(180,110,40,0.4)', marginRight: 8 }} />
                            <span
                              style={{
                                fontFamily: 'Inter, system-ui, sans-serif',
                                fontWeight: 700,
                                fontSize: 13,
                                color: '#8f5a1f',
                                letterSpacing: '0.5px',
                              }}
                            >
                              Awards
                            </span>
                            <div style={{ flex: 1, height: 1, background: 'rgba(180,110,40,0.4)', marginLeft: 8 }} />
                          </div>

                          {/* â”€â”€ Prize board strip â€” column headers â”€â”€ */}
                          <div
                            className="relative flex items-center"
                            style={{ width: '100%', height: 28 }}
                          >
                            <img
                              src="/image2/jackpot_prize_board.png"
                              alt=""
                              className="absolute inset-0 w-full h-full"
                              style={{ objectFit: 'fill', borderRadius: 6 }}
                            />
                            {['Round', 'Win', 'Time'].map((h) => (
                              <span
                                key={h}
                                style={{
                                  position: 'relative',
                                  zIndex: 1,
                                  flex: h === 'Time' ? 1.4 : 1,
                                  fontFamily: 'Inter, system-ui, sans-serif',
                                  fontWeight: 700,
                                  fontSize: 11,
                                  color: '#fff',
                                  textAlign: h === 'Win' ? 'center' : h === 'Time' ? 'right' : 'left',
                                  paddingLeft: h === 'Round' ? 10 : 0,
                                  paddingRight: h === 'Time' ? 10 : 0,
                                  textShadow: '0 1px 2px rgba(0,0,0,0.3)',
                                }}
                              >
                                {h}
                              </span>
                            ))}
                          </div>

                          {/* â”€â”€ Awards rows â”€â”€ */}
                          <div
                            style={{
                              marginTop: 2,
                              paddingLeft: 10,
                              paddingRight: 10,
                              maxHeight: 88,
                              overflowY: 'auto',
                              scrollbarWidth: 'none',
                              msOverflowStyle: 'none',
                            }}
                          >
                            {jackpotAwards.length > 0 ? (
                              jackpotAwards.slice(0, 7).map((award, ai) => (
                                <div
                                  key={ai}
                                  className="flex items-center"
                                  style={{
                                    height: 24,
                                    borderBottom: '1px solid rgba(200,140,70,0.25)',
                                  }}
                                >
                                  <span style={{ flex: 1, fontFamily: 'Inter', fontSize: 11, color: '#8f5a1f', fontWeight: 500 }}>
                                    {award.round}
                                  </span>
                                  <span style={{ flex: 1, fontFamily: 'Inter', fontSize: 11, color: '#8f5a1f', fontWeight: 500, textAlign: 'center' }}>
                                    {formatNum(award.win)}
                                  </span>
                                  <span style={{ flex: 1.4, fontFamily: 'Inter', fontSize: 10, color: '#8f5a1f', fontWeight: 400, textAlign: 'right' }}>
                                    {award.time}
                                  </span>
                                </div>
                              ))
                            ) : (
                              <div style={{ height: 56 }} />
                            )}
                          </div>
                        </div>

                        {/* â”€â”€ LAYER 10: Footer note â”€â”€ */}
                        <div
                          className="absolute"
                          style={{
                            left: 0, right: 0,
                            bottom: 14,
                            zIndex: 5,
                            fontFamily: 'Inter, system-ui, sans-serif',
                            fontWeight: 500,
                            fontSize: 11,
                            color: '#c07830',
                            textAlign: 'center',
                          }}
                        >
                          Display game records of the last 7 days.
                        </div>
                      </div>
                    );
                  })()
                ) : null}




                {activeModal === 'RANK' ? (
                  <div
                    className="absolute"
                    style={{
                      left: -24,
                      top: -84,
                      width: 374,
                      height: 597,
                      overflow: 'visible',
                    }}
                  >
                    {/* â”€â”€ 1. Gameboard background (ribbon + "Game Rank" baked in) â”€â”€ */}
                    <img
                      src="/image2/gameboard.png"
                      alt=""
                      className="absolute inset-0 w-full h-full"
                      style={{ objectFit: 'fill', borderRadius: 18, zIndex: 0 }}
                    />
                    {/* â”€â”€ Title: Game Rank â”€â”€ */}
                    <div
                      className="absolute"
                      style={{
                        left: '49%',
                        transform: 'translateX(-50%)',
                        top: 61,               /* Adjust this to move it up or down on the ribbon */
                        zIndex: 10,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <span
                        style={{
                          fontFamily: 'Inter, system-ui, sans-serif',
                          fontWeight: 400,      /* Extra bold for that game title look */
                          fontSize: 18,         /* Large title size */
                          color: '#ffd900',     /* Bright Gold/Yellow */
                          textTransform: 'uppercase',
                          letterSpacing: '1px',
                          // Thin brown border (0.8px)
                          textShadow: `
        0.8px 0.8px 0 #7a3c08, 
        -0.8px -0.8px 0 #7a3c08, 
         0.8px -0.8px 0 #7a3c08, 
        -0.8px 0.8px 0 #7a3c08
      `,
                        }}
                      >
                        Game Rank
                      </span>
                    </div>

                    {/* â”€â”€ 2. Close button â”€â”€ top: 60, right: -5 â†’ move these independently */}
                    <button
                      type="button"
                      onClick={() => setActiveModal('NONE')}
                      className="absolute flex items-center justify-center"
                      style={{
                        right: -5,
                        top: 60,
                        width: 30,
                        height: 30,
                        borderRadius: '50%',
                        background: 'linear-gradient(180deg,#FF4444 0%,#CC1111 100%)',
                        border: '3px solid #fff',
                        boxShadow: '0 3px 8px rgba(0,0,0,0.4)',
                        zIndex: 20,
                        cursor: 'pointer',
                      }}
                      aria-label="Close rank"
                    >
                      <span style={{ color: '#fff', fontSize: 14, fontWeight: 900, lineHeight: 1 }}>×</span>
                    </button>

                    {/* â”€â”€ 3. Timer pill â”€â”€ left/top independent */}
                    <div
                      className="absolute flex items-center justify-center"
                      style={{
                        left: '50%',
                        transform: 'translateX(-50%)',
                        top: 102.5,          /* â† change only this to move timer */
                        width: rankTab === 'YESTERDAY' ? 190 : 135,
                        height: 20,
                        borderRadius: 13,
                        background: 'rgba(140,90,30,0.22)',
                        border: '1.5px solid rgba(160,110,50,0.35)',
                        gap: 5,
                        fontFamily: 'Inter, system-ui, sans-serif',
                        fontSize: 13,
                        fontWeight: 300,
                        color: '#fff',
                        zIndex: 5,
                      }}
                    >
                      {rankTab === 'YESTERDAY' ? (

                        <span>Yesterday  Ranking</span>

                      ) : (

                        <>

                          <span style={{ fontSize: 13 }}>⌛</span>
                          {`${String(Math.floor(timeLeft / 3600)).padStart(2, '0')}:${String(Math.floor((timeLeft % 3600) / 60)).padStart(2, '0')}:${String(timeLeft % 60).padStart(2, '0')}`}

                        </>

                      )}
                    </div>

                    {/* â”€â”€ 4. Today / Yesterday sliding tab â”€â”€ left/top independent */}
                    <div
                      className="absolute"
                      style={{
                        left: '50.8%',
                        transform: 'translateX(-50%)',
                        top: 124,         /* â† change only this to move tab row */
                        width: 245,
                        height: 38,
                        zIndex: 5,
                      }}
                    >
                      {/* Outer pill container */}
                      <div
                        className="relative flex items-center w-full h-full"
                        style={{

                        }}
                      >
                        {/* Sliding button_gameboard.png indicator */}
                        <motion.div
                          className="absolute top-[3px] bottom-[3px]"
                          style={{
                            width: 'calc(50% - 3px)',
                            left: 3,
                            borderRadius: 16,
                            overflow: 'hidden',
                            zIndex: 1,
                          }}
                          animate={{ x: rankTab === 'TODAY' ? 0 : '100%' }}
                          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                        >
                          <img
                            src="/image2/button_gameboard.png"
                            alt=""
                            className="absolute inset-0 w-full h-full"
                            style={{ objectFit: 'fill' }}
                          />
                        </motion.div>

                        {/* Today */}
                        <button
                          type="button"
                          onClick={() => setRankTab('TODAY')}
                          className="relative flex items-center justify-center"
                          style={{ flex: 1, height: '100%', background: 'transparent', border: 'none', cursor: 'pointer', zIndex: 2 }}
                        >
                          <span
                            style={{
                              fontFamily: 'Inter, system-ui, sans-serif',
                              fontWeight: 500,
                              fontSize: 14.5,
                              // White text when active, Brown text when inactive
                              color: rankTab === 'TODAY' ? '#fff' : '#7a3c08',

                              // Thin border (0.8px) only when active
                              textShadow: rankTab === 'TODAY'
                                ? `0.8px 0.8px 0 #7a3c08, 
        -0.8px -0.8px 0 #7a3c08, 
         0.8px -0.8px 0 #7a3c08, 
        -0.8px 0.8px 0 #7a3c08`
                                : 'none',

                              transition: 'all 0.2s ease-in-out',
                            }}
                          >
                            Today
                          </span>
                        </button>

                        {/* Yesterday */}
                        <button
                          type="button"
                          onClick={() => setRankTab('YESTERDAY')}
                          className="relative flex items-center justify-center"
                          style={{ flex: 1, height: '100%', background: 'transparent', border: 'none', cursor: 'pointer', zIndex: 2 }}
                        >
                          <span
                            style={{
                              fontFamily: 'Inter, system-ui, sans-serif',
                              fontWeight: 500,
                              fontSize: 14.5,
                              // White text when active (YESTERDAY), brown when inactive
                              color: rankTab === 'YESTERDAY' ? '#fff' : '#7a3c08',

                              // Thin 0.8px border only when active
                              textShadow: rankTab === 'YESTERDAY'
                                ? `0.8px 0.8px 0 #7a3c08, 
        -0.8px -0.8px 0 #7a3c08, 
         0.8px -0.8px 0 #7a3c08, 
        -0.8px 0.8px 0 #7a3c08`
                                : 'none',

                              transition: 'all 0.2s ease-in-out',
                            }}
                          >
                            Yesterday
                          </span>
                        </button>
                      </div>

                      {/* ? help button â€” outside the pill, right side */}
                      <button
                        type="button"
                        onClick={() => setActiveModal('PRIZE')}
                        style={{
                          position: 'absolute',
                          right: -40,
                          top: '46%',
                          transform: 'translateY(-50%)',
                          width: 30,
                          height: 30,
                          borderRadius: '50%',
                          border: '2px solid #c8a05a',
                          background: 'rgba(240,220,170,0.65)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#8b5e20',
                          fontWeight: 900,
                          fontSize: 17,
                          zIndex: 6,
                          cursor: 'pointer',
                        }}
                      >
                        ?
                      </button>
                    </div>

                    {/* â”€â”€ 5. Column headers â”€â”€ left/top independent */}
                    <div
                      className="absolute flex items-center"
                      style={{
                        left: 25,
                        right: 40,
                        top: 164,         /* â† change only this to move headers */
                        height: 28,
                        zIndex: 5,
                      }}
                    >
                      <span style={{ width: 64, textAlign: 'center', fontFamily: 'Inter, system-ui, sans-serif', fontWeight: 400, fontSize: 13, color: '#fff' }}>Rank</span>
                      <span style={{ flex: 1, textAlign: 'center', fontFamily: 'Inter, system-ui, sans-serif', fontWeight: 400, fontSize: 13, color: '#fff' }}>Name</span>
                      <span style={{ width: 100, textAlign: 'center', fontFamily: 'Inter, system-ui, sans-serif', fontWeight: 400, fontSize: 13, color: '#fff' }}>Diamonds Play</span>
                    </div>

                    {/* â”€â”€ 6. Scrollable rank rows â”€â”€ left/top independent */}
                    <div
                      className="absolute overflow-y-auto overflow-x-hidden"
                      style={{
                        left: 30,
                        right: 30,
                        top: 198,         /* â† change only this to move the rows area */
                        height: 310,      /* â† change only this to adjust rows height */
                        zIndex: 5,
                        scrollbarWidth: 'none',
                        msOverflowStyle: 'none',
                      }}
                    >
                      {rankRows.map((row, idx) => {
                        const rowBg =
                          idx === 0 ? '/image2/rank1_gameboard.png'
                            : idx === 1 ? '/image2/rank2_gameboard.png'
                              : idx === 2 ? '/image2/rank3_gameboard.png'
                                : '/image2/defaultrank_gameboard.png';

                        const rowH = idx === 0 ? 47 : 48;
                        const isTop3 = idx < 3;

                        return (
                          <div
                            key={`rank-row-${row.name}-${idx}`}
                            className="relative"
                            style={{ width: '100%', height: rowH, marginBottom: 4, flexShrink: 0 }}
                          >
                            <img
                              src={rowBg}
                              alt=""
                              className="absolute inset-0 w-full h-full"
                              style={{ objectFit: 'fill', borderRadius: 8 }}
                            />

                            {/* Rank badge / number */}
                            <div className="absolute flex items-center justify-center" style={{ left: 0, top: 0, width: 56, height: rowH }}>

                            </div>

                            {/* Profile picture */}
                            {row.pic ? (
                              <img
                                src={row.pic}
                                alt=""
                                className="absolute"
                                style={{ left: 59, top: '50%', transform: 'translateY(-50%)', width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.75)' }}
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                              />
                            ) : (
                              <div className="absolute" style={{ left: 56, top: '50%', transform: 'translateY(-50%)', width: 32, height: 32, borderRadius: '50%', background: 'rgba(180,130,60,0.35)', border: '2px solid rgba(255,255,255,0.5)' }} />
                            )}

                            {/* Name */}
                            <div
                              className="absolute"
                              style={{ left: 96, top: '50%', transform: 'translateY(-50%)', width: 96, fontFamily: 'Inter, system-ui, sans-serif', fontWeight: 500, fontSize: 13, color: '#5a2d0c', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                            >
                              {row.name}
                            </div>

                            {/* Divider */}
                            {isTop3 && (
                              <div className="absolute" style={{ left: 199, top: '50%', transform: 'translateY(-50%)', width: 1.5, height: 22, background: 'rgba(120,80,30,0.28)', borderRadius: 1 }} />
                            )}

                            {/* Diamond + amount */}
                            {/* Diamond + amount container */}
                            <div
                              className="absolute flex items-center"
                              style={{
                                right: 12,             // Fixed distance from the right edge of the row
                                top: '50%',
                                transform: 'translateY(-50%)',
                                width: 90,             // Fixed width so the diamond doesn't move
                                gap: 4,
                                display: 'flex',
                                justifyContent: 'flex-start' // Keeps the diamond on the left of this box
                              }}
                            >
                              {/* The Diamond: Locked at the start of the 90px box */}
                              <img
                                src="/image2/diamond.png"
                                alt=""
                                style={{ width: 18, height: 18, flexShrink: 0 }}
                              />

                              {/* The Number: Fills remaining space and pushes text to the right */}
                              <span
                                style={{
                                  flex: 1,              // Takes up all space between diamond and right edge
                                  textAlign: 'right',   // Aligns the text to the right
                                  fontFamily: 'Inter, system-ui, sans-serif',
                                  fontWeight: 400,
                                  fontSize: 13,
                                  color: '#5a2d0c',
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                {formatNum(row.diamonds)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* â”€â”€ 7. 99+ sticky bottom row â”€â”€ left/top independent */}
                    <div
                      className="absolute"
                      style={{
                        left: '50%',
                        transform: 'translateX(-50%)',
                        top: 530,         /* â† change only this to move the 99+ row */
                        width: 340,
                        height: 55,
                        zIndex: 5,
                      }}
                    >
                      <img
                        src="/image2/99_rankboard.png"
                        alt=""
                        className="absolute inset-0 w-full h-full"
                        style={{ objectFit: 'fill', borderRadius: 10 }}
                      />
                      <div className="absolute flex items-center" style={{ left: 22, right: 12, top: 0, bottom: 0, gap: 8 }}>
                        <span
                          style={{
                            fontFamily: 'Inter, system-ui, sans-serif',
                            fontWeight: 600, // Increased to 800 to match the tab thickness
                            fontSize: 15,
                            color: '#fff', // White text
                            minWidth: 42,
                            flexShrink: 0,
                            // Thin brown border (0.8px) to match the Today tab
                            textShadow: `
      0.8px 0.8px 0 #7a3c08, 
      -0.8px -0.8px 0 #7a3c08, 
       0.8px -0.8px 0 #7a3c08, 
      -0.8px 0.8px 0 #7a3c08
    `,
                          }}
                        >
                          99+
                        </span>
                        {/* Profile Picture Circle */}
                        <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(180,130,60,0.4)', flexShrink: 0, border: '2px solid rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                          ðŸ‘¤
                        </div>

                        {/* "You" Text - Now White with Brown Border */}
                        <span style={{
                          fontFamily: 'Inter, system-ui, sans-serif',
                          fontWeight: 400,
                          fontSize: 14,
                          color: '#7a3c08',
                          flex: 1,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',

                        }}>
                          You
                        </span>

                        {/* Diamond Container - Aligned with the rows above */}
                        <div
                          className="flex items-center"
                          style={{
                            gap: 4,
                            flexShrink: 0,
                            width: 90,             // Matches the width we gave the list rows
                            justifyContent: 'flex-start'
                          }}
                        >
                          <img src="/image2/diamond.png" alt="" style={{ width: 18, height: 18, flexShrink: 0 }} />
                          <span style={{
                            flex: 1,
                            textAlign: 'right',    // Pushes the "0" to the right edge
                            fontFamily: 'Inter, system-ui, sans-serif',
                            fontWeight: 400,
                            fontSize: 15,
                            color: '#7a3c08',
                          }}>
                            0
                          </span>
                        </div>
                      </div>
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
                      <div>Users who have placed bets exceeding the required threshold in the past 7 days can unlock premium mode.</div>

                      {remainingForAdvanceApi > 0 ? (
                        <div style={{ marginTop: 18 }}>
                          Keep going! Only{' '}
                          <span style={{ color: '#E92407', fontWeight: 900 }}>{formatNum(remainingForAdvanceApi)}</span>{' '}
                          diamonds to unlock!
                        </div>
                      ) : (
                        <div style={{ marginTop: 18, color: '#25C640', fontWeight: 700 }}>
                          You have unlocked Advanced Mode!
                        </div>
                      )}
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
                        if (advanceModeApi?.advance === true || remainingForAdvanceApi <= 0) {
                          setMode('ADVANCE');
                        }
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
