import { AnimatePresence, motion } from 'framer-motion';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const MAX_FRAME_WIDTH = 420;
const DEBUG = false;

const ARTBOARD = { width: 402, height: 735 } as const;

const BET_SECONDS = 30;               // max fallback Ã¢â‚¬â€ actual countdown from server (~27-30s)
const DRAW_SECONDS = 7;               // expanded for 40s round Ã¢â‚¬â€ smooth wheel/jackpot animation
const SHOW_SECONDS = 6;               // expanded for 40s round Ã¢â‚¬â€ leaderboard visible longer
const PRE_DRAW_MS = 1200;             // pre-draw flash before drawing starts
const WINNER_POLL_INTERVAL_MS = 600;
const TIMER_SYNC_INTERVAL_MS = 5000;
const BETTING_TICK_INTERVAL_MS = 250;
const LIVE_REFRESH_INTERVAL_MS = 10000;
const WINNER_MAX_WAIT_MS = 10000;      // more time to wait for winner in 40s round

const GAME_ON_MS = 1200;
const ADVANCE_UNLOCK_BET = 500000;

const DEFAULT_CHIP_VALUES = [10, 100, 500, 1000, 5000] as const;

/* Map chip value ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ local image path */
const CHIP_IMAGE_MAP: Record<number, string> = {
  10: '/image2/chip_10.png',
  100: '/image2/chip_100.png',
  500: '/image2/chip_500_orange.png',
  1000: '/image2/chip_1k.png',
  5000: '/image2/chip_5k.png',
  10000: '/image2/chip_10k.png',
};

/* Map box value ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ local chest image */
const BOX_VALUE_TO_CHEST: Record<number, string> = {
  10: '/image2/chest_10k.png',
  20: '/image2/chest_50k.png',
  30: '/image2/chest_100k.png',
  40: '/image2/chest_500k.png',
  50: '/image2/chest_1m.png',
};

const DEFAULT_BOX_THRESHOLDS = [10, 20, 30, 40, 50] as const;
type RoundType = 'NORMAL' | 'JACKPOT';

/* Jackpot amount is loaded from /game/jackpot/details (jackpot_total) */
/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ API config ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */
const API_BASE = ''; // proxied via vite.config.ts
const URL_PARAMS = new URLSearchParams(window.location.search);
const RAW_REGISATION_ID =
  Number(URL_PARAMS.get('regisation') ?? URL_PARAMS.get('registration_id'))
  || Number((import.meta as { env?: Record<string, string | undefined> }).env?.VITE_REGISATION_ID)
  || 3;
const REGISATION_ID = RAW_REGISATION_ID;
const RAW_PLAYER_ID = Number(URL_PARAMS.get('player_id')) || 0;
const PLAYER_ID = RAW_PLAYER_ID < 10000 ? RAW_PLAYER_ID * 100 : RAW_PLAYER_ID;
const API_BODY = JSON.stringify({ regisation: REGISATION_ID });
/* Body with mode: 2 = general/basic, 1 = advance */
const apiBodyWithMode = (mode: number) => JSON.stringify({ regisation: REGISATION_ID, mode });
const apiBodyPlayer = (mode: number) => JSON.stringify({ regisation: REGISATION_ID, player_id: PLAYER_ID, mode });

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

type ApiBoxStatus = boolean | number | string | null | undefined;
type ApiBox = {
  id?: number;
  box_image?: string | null;
  box_image_close?: string | null;
  box_image_open?: string | null;
  box_source: number | string;
  box_win_weights?: number;
  status?: ApiBoxStatus;
};
type ApiOpenMagicBoxResponse = { message?: string };

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
type ApiMyRankResponse = {
  my_positon?: Record<string, unknown> | null;
  my_position?: Record<string, unknown> | null;
  data?: Record<string, unknown> | Record<string, unknown>[] | null;
};
type ApiGameRule = { general: { title: string; rules: string[]; version: string } };
type ApiJackpotDetails = { jackpot_total: number; awards: { round: number; win: number; time: string }[] };
type ApiGameMetadata = { game__name: string; game__icon: string; game_icon: string }[];
type ApiRecordBetRow = {
  element_name?: string | null;
  element__element_name?: string | null;
  element?: string | null;
  name?: string | null;
  element_icon?: string | null;
  element__element_icon?: string | null;
  bet?: number | string | null;
  bet_amount?: number | string | null;
  amount?: number | string | null;
};
type ApiRecordWinItemRow = {
  element_name?: string | null;
  element__element_name?: string | null;
  element?: string | null;
  name?: string | null;
  element_icon?: string | null;
  element__element_icon?: string | null;
};
type ApiPlayerRecordRow = {
  round?: number | string | null;
  round_no?: number | string | null;
  mode?: number | string | null;
  element__element_name?: string | null;
  element_name?: string | null;
  element?: string | null;
  bet?: number | string | null;
  bet_amount?: number | string | null;
  selected_bets?: ApiRecordBetRow[] | null;
  selectedBets?: ApiRecordBetRow[] | string | null;
  win?: number | string | null;
  win_amount?: number | string | null;
  time?: string | null;
  created_at?: string | null;
  balance_before?: number | string | null;
  balance?: number | string | null;
  current_balance?: number | string | null;
  last_balance?: number | string | null;
  balance_after?: number | string | null;
  total_balance?: number | string | null;
  winning_element_name?: string | null;
  winningElementName?: string | null;
  winning_element_icon?: string | null;
  winningElementIcon?: string | null;
  winning_items?: ApiRecordWinItemRow[] | null;
  winningItems?: ApiRecordWinItemRow[] | string | null;
  winning_bucket?: string | null;
  winningBucket?: string | null;
  gjp__jackpot_name?: string | null;
  jackport_element_name?: string[] | string | null;
  round_type?: string | null;
  mrs_in_time_balance?: number | string | null;
  in_time_balance?: number | string | null;
};
type ApiPlayerRecords = {
  data?: ApiPlayerRecordRow[] | null;
  records?: ApiPlayerRecordRow[] | null;
  results?: ApiPlayerRecordRow[] | null;
};

/* User info / balance API */
type ApiUserInfo = {
  registration_id?: number;
  balance: number;
  user_id?: number;
  user_photo?: string | null;
  player_name?: string | null;
  user_name?: string | null;
  username?: string | null;
  name?: string | null;
  profile_pic?: string | null;
  player_pic?: string | null;
};

/* Map API element_name ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ local ItemId */


/* Reverse map: local ItemId ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ API element_name */
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

function resolveMediaPath(path?: string | null): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return path.startsWith('/') ? path : `/${path}`;
}

function isTruthyBoxStatus(status: ApiBoxStatus): boolean {
  if (status === true || status === 1 || status === '1') return true;
  if (typeof status === 'string') return status.toLowerCase() === 'true';
  return false;
}

function buildChestState(thresholds: readonly number[]): Record<number, boolean> {
  const unique = Array.from(new Set(thresholds.filter((v) => Number.isFinite(v) && v > 0)));
  if (unique.length === 0) {
    return DEFAULT_BOX_THRESHOLDS.reduce((acc, threshold) => {
      acc[threshold] = false;
      return acc;
    }, {} as Record<number, boolean>);
  }
  return unique.reduce((acc, threshold) => {
    acc[threshold] = false;
    return acc;
  }, {} as Record<number, boolean>);
}

function mergeOpenedChestState(
  serverState: Record<number, boolean>,
  localState: Record<number, boolean>,
): Record<number, boolean> {
  const merged: Record<number, boolean> = { ...serverState };
  Object.entries(localState).forEach(([key, opened]) => {
    const threshold = Number(key);
    if (!Number.isFinite(threshold)) return;
    if (opened) merged[threshold] = true;
    else if (!(threshold in merged)) merged[threshold] = false;
  });
  return merged;
}

function formatThresholdLabel(threshold: number): string {
  if (!Number.isFinite(threshold) || threshold <= 0) return String(threshold);
  if (threshold >= 1000000) {
    const val = threshold / 1000000;
    return Number.isInteger(val) ? `${val}M` : `${val.toFixed(1)}M`;
  }
  if (threshold >= 1000) {
    const val = threshold / 1000;
    return Number.isInteger(val) ? `${val}K` : `${val.toFixed(1)}K`;
  }
  return String(threshold);
}

function resolveThresholdFromBoxSource(source: number | string): number | null {
  if (typeof source === 'number') {
    if (!Number.isFinite(source) || source <= 0) return null;
    return Math.round(source);
  }

  const raw = source.trim().toLowerCase();
  if (!raw) return null;

  const compact = raw.replace(/,/g, '').replace(/\s+/g, '');
  const direct = Number(compact);
  if (Number.isFinite(direct) && direct > 0) {
    return Math.round(direct);
  }

  const shortMatch = compact.match(/^(\d+(?:\.\d+)?)(k|m)$/);
  if (shortMatch) {
    const base = Number(shortMatch[1]);
    if (Number.isFinite(base) && base > 0) {
      const factor = shortMatch[2] === 'm' ? 1000000 : 1000;
      return Math.round(base * factor);
    }
  }

  return null;
}

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
      /* network error Ã¢â‚¬â€ suppress browser console noise */
    }
    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  throw new Error(`API ${path} failed`);
}

function toFiniteNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseJackpotElements(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
  return undefined;
}

function normalizeBucket(value: unknown): 'VEGETABLES' | 'DRINKS' | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  if (normalized === 'VEGETABLES' || normalized === 'DRINKS') return normalized;
  return null;
}

function inferItemIdFromIconPath(path?: string | null): ItemId | null {
  if (!path) return null;
  const raw = path.toLowerCase();
  if (raw.includes('tomato')) return 'tomato';
  if (raw.includes('milk')) return 'milk';
  if (raw.includes('lemon')) return 'lemon';
  if (raw.includes('pumpkin')) return 'pumpkin';
  if (raw.includes('blur') || raw.includes('zucchini')) return 'zucchini';
  if (raw.includes('coke') || raw.includes('cola')) return 'cola';
  if (raw.includes('water')) return 'water';
  if (raw.includes('honey')) return 'honey';
  return null;
}

function parseSelectedBets(value: unknown): Array<{ elementName: string; elementIcon: string | null; bet: number }> {
  let source: unknown = value;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch {
      source = [];
    }
  }
  if (!Array.isArray(source)) return [];

  return source
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const row = entry as ApiRecordBetRow;
      const elementNameRaw =
        row.element_name
        ?? row.element__element_name
        ?? row.element
        ?? row.name
        ?? '';
      const elementName = typeof elementNameRaw === 'string' ? elementNameRaw.trim() : '';
      const elementIcon =
        typeof row.element_icon === 'string'
          ? row.element_icon
          : typeof row.element__element_icon === 'string'
            ? row.element__element_icon
            : null;
      const bet = toFiniteNumber(row.bet ?? row.bet_amount ?? row.amount) ?? 0;
      const inferredId = inferItemIdFromIconPath(elementIcon);
      const finalName = elementName || (inferredId ? ID_TO_API_NAME[inferredId] : '');
      if (!finalName || bet <= 0) return null;
      return {
        elementName: finalName,
        elementIcon,
        bet,
      };
    })
    .filter((entry): entry is { elementName: string; elementIcon: string | null; bet: number } => entry !== null);
}

function parseWinningItems(value: unknown): Array<{ elementName: string; elementIcon: string | null }> {
  let source: unknown = value;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch {
      source = [];
    }
  }
  if (!Array.isArray(source)) return [];

  return source
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const row = entry as ApiRecordWinItemRow;
      const elementNameRaw =
        row.element_name
        ?? row.element__element_name
        ?? row.element
        ?? row.name
        ?? '';
      const elementName = typeof elementNameRaw === 'string' ? elementNameRaw.trim() : '';
      const elementIcon =
        typeof row.element_icon === 'string'
          ? row.element_icon
          : typeof row.element__element_icon === 'string'
            ? row.element__element_icon
            : null;
      const inferredId = inferItemIdFromIconPath(elementIcon);
      const finalName = elementName || (inferredId ? ID_TO_API_NAME[inferredId] : '');
      if (!finalName) return null;
      return {
        elementName: finalName,
        elementIcon,
      };
    })
    .filter((entry): entry is { elementName: string; elementIcon: string | null } => entry !== null);
}

function resolveProfilePic(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (/^https?:\/\//i.test(path)) return path;
  return encodeURI(path.startsWith('/') ? path : `/media/${path}`);
}

function normalizeDisplayName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseApiIdentity(payload: unknown): { name?: string; pic?: string } {
  if (!payload || typeof payload !== 'object') return {};
  const row = payload as Record<string, unknown>;

  const name = normalizeDisplayName(
    row.mrs_player_id_player_name
    ?? row.mrs__player_id__player_name
    ?? row.player_name
    ?? row.user_name
    ?? row.username
    ?? row.name,
  );

  const picRaw =
    typeof row.user_photo === 'string' ? row.user_photo
      : typeof row.profile_pic === 'string' ? row.profile_pic
        : typeof row.player_pic === 'string' ? row.player_pic
          : typeof row.pic === 'string' ? row.pic
            : typeof row.mrs_player_id_player_pic === 'string' ? row.mrs_player_id_player_pic
              : typeof row.mrs__player_id__player_pic === 'string' ? row.mrs__player_id__player_pic
                : null;

  return {
    name,
    pic: resolveProfilePic(picRaw),
  };
}

function parseMyRankResponse(payload: unknown): MyRankView | null {
  if (!payload || typeof payload !== 'object') return null;
  const obj = payload as Record<string, unknown>;
  const fuzzyMyPositionKey = Object.keys(obj).find((key) => {
    const normalized = key.toLowerCase().replace(/[^a-z]/g, '');
    return normalized.startsWith('mypos') || normalized.startsWith('myposit');
  });
  const candidate =
    (fuzzyMyPositionKey ? obj[fuzzyMyPositionKey] : null)
    ?? obj.my_positon
    ?? obj.my_position
    ?? (Array.isArray(obj.data) ? obj.data[0] : obj.data)
    ?? null;

  if (!candidate || typeof candidate !== 'object') return null;
  const row = candidate as Record<string, unknown>;

  const position =
    toFiniteNumber(row.position)
    ?? toFiniteNumber(row.rank)
    ?? null;

  const fuzzyDiamondsValue = (() => {
    const key = Object.keys(row).find((rawKey) => {
      const normalized = rawKey.toLowerCase().replace(/[^a-z]/g, '');
      return normalized.includes('dimondplay')
        || normalized.includes('diamondplay')
        || normalized.includes('diamond');
    });
    return key ? toFiniteNumber(row[key]) : undefined;
  })();

  const diamonds =
    fuzzyDiamondsValue
    ?? toFiniteNumber(row['dimond play'])
    ?? toFiniteNumber(row['diamond play'])
    ?? toFiniteNumber(row.diamond_play)
    ?? toFiniteNumber(row.diamondPlay)
    ?? toFiniteNumber(row.last_balance)
    ?? toFiniteNumber(row.balance)
    ?? 0;
  const identity = parseApiIdentity(row);

  return {
    position,
    diamonds,
    name: identity.name,
    pic: identity.pic,
  };
}

function extractPlayerRecordRows(payload: unknown): ApiPlayerRecordRow[] {
  if (Array.isArray(payload)) return payload as ApiPlayerRecordRow[];
  if (!payload || typeof payload !== 'object') return [];

  const obj = payload as Record<string, unknown>;
  const candidates: unknown[] = [obj.data, obj.records, obj.results];

  if (obj.data && typeof obj.data === 'object') {
    const nestedData = (obj.data as Record<string, unknown>).data;
    candidates.push(nestedData);
  }

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate as ApiPlayerRecordRow[];
  }
  return [];
}

function hasExplicitPlayerRecordArray(payload: unknown): boolean {
  if (Array.isArray(payload)) return true;
  if (!payload || typeof payload !== 'object') return false;
  const obj = payload as Record<string, unknown>;
  if (Array.isArray(obj.data) || Array.isArray(obj.records) || Array.isArray(obj.results)) return true;
  if (obj.data && typeof obj.data === 'object') {
    return Array.isArray((obj.data as Record<string, unknown>).data);
  }
  return false;
}

function mapApiPlayerRecord(row: ApiPlayerRecordRow): PlayerRecordView {
  const round = toFiniteNumber(row.round ?? row.round_no);
  const mode = toFiniteNumber(row.mode);
  const elementName = row.element__element_name ?? row.element_name ?? row.element ?? undefined;
  const bet = toFiniteNumber(row.bet ?? row.bet_amount) ?? 0;
  const win = toFiniteNumber(row.win ?? row.win_amount) ?? 0;
  const selectedBetsFromApi = parseSelectedBets(row.selected_bets ?? row.selectedBets ?? null);
  const selectedBets = selectedBetsFromApi.length > 0
    ? selectedBetsFromApi
    : (elementName && bet > 0
      ? [{ elementName, elementIcon: null, bet }]
      : []);
  const winningElementName = row.winning_element_name ?? row.winningElementName ?? null;
  const winningElementIcon = row.winning_element_icon ?? row.winningElementIcon ?? null;
  const winningItemsFromApi = parseWinningItems(row.winning_items ?? row.winningItems ?? null);
  const winningItems = winningItemsFromApi.length > 0
    ? winningItemsFromApi
    : (winningElementName
      ? [{ elementName: winningElementName, elementIcon: winningElementIcon }]
      : []);
  const winningBucket = normalizeBucket(row.winning_bucket ?? row.winningBucket);
  const currentBalance = toFiniteNumber(row.current_balance ?? row.last_balance);
  const afterBalance = toFiniteNumber(
    row.balance_after
    ?? row.current_balance
    ?? row.last_balance
    ?? row.mrs_in_time_balance
    ?? row.in_time_balance,
  );
  const beforeBalance = toFiniteNumber(
    row.balance_before
    ?? row.balance
    ?? row.total_balance
    ?? row.last_balance
    ?? currentBalance
    ?? afterBalance,
  );
  const totalBalance = toFiniteNumber(row.total_balance);
  const jackpotElements = parseJackpotElements(row.jackport_element_name);
  const time = row.time ?? row.created_at ?? undefined;

  return {
    round,
    mode,
    element: elementName ?? undefined,
    bet,
    win,
    time: time ?? undefined,
    balanceBefore: beforeBalance,
    balance: toFiniteNumber(row.balance),
    currentBalance,
    balanceAfter: afterBalance,
    totalBalance,
    jackpotName: row.gjp__jackpot_name ?? null,
    jackpotElements,
    selectedBets,
    winningElementName,
    winningElementIcon,
    winningItems,
    winningBucket,
    roundType: row.round_type ?? null,
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
type ModalType = 'NONE' | 'RULE' | 'RECORDS' | 'PRIZE' | 'RANK' | 'ADVANCED' | 'JACKPOT' | 'RECHARGE';
type RankTab = 'TODAY' | 'YESTERDAY';
type ResultKind = 'WIN' | 'LOSE' | 'NOBET';

const POINTER_BASE_POSITION = { left: 247, top: 115 } as const;
const POINTER_SIZE = { width: 125, height: 125 } as const;
const POINTER_HOTSPOT = { x: 25, y: 35 } as const;
const POINTER_TOUR_ORDER: ItemId[] = ['lemon', 'pumpkin', 'zucchini', 'water', 'cola', 'milk', 'honey', 'tomato'];
const DRAW_HIGHLIGHT_ORDER: ItemId[] = ['honey', 'tomato', 'lemon', 'pumpkin', 'zucchini', 'water', 'cola', 'milk'];

/* Map server-side element names Ã¢â€ â€™ local item IDs */
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
  winner: ItemId[]; // ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦
  selected: ItemId | 'none';
  selectedAmount: number;
  selectedBets: Array<{ itemId: ItemId; amount: number }>;
  winningBucket: 'VEGETABLES' | 'DRINKS' | null;
  win: number;
  balanceBefore: number;
  balanceAfter: number;
};

type PlayerRecordView = {
  round?: number;
  mode?: number;
  element?: string;
  bet?: number;
  win?: number;
  time?: string;
  balanceBefore?: number;
  balance?: number;
  currentBalance?: number;
  balanceAfter?: number;
  totalBalance?: number;
  jackpotName?: string | null;
  jackpotElements?: string[];
  selectedBets?: Array<{ elementName: string; elementIcon: string | null; bet: number }>;
  winningElementName?: string | null;
  winningElementIcon?: string | null;
  winningItems?: Array<{ elementName: string; elementIcon: string | null }>;
  winningBucket?: 'VEGETABLES' | 'DRINKS' | null;
  roundType?: string | null;
};

type MyRankView = {
  position: number | null;
  diamonds: number;
  name?: string;
  pic?: string;
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

/* Default multipliers ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â overridden by API data at runtime */
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

  // ÃƒÂ°Ã…Â¸Ã¢â‚¬ÂÃ‚Â§ SIZE SCALE CONTROL (this is what you adjust)
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

  // ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ Dynamic extras:
  // Top items (tÃƒÂ¢Ã¢â‚¬Â°Ã‹â€ 0) need MORE top expansion.
  // Bottom items (tÃƒÂ¢Ã¢â‚¬Â°Ã‹â€ 1) need LESS top expansion.
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
/* ÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚Â
   Trophy Win Overlay ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â chips fly to trophy ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ trophy explodes ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ panel pops up
   ÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚Â */
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
      0.0s  ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â chips fly to trophy
      0.7s  ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â coin explosion + fireworks start
      2.7s  ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â leaderboard panel appears (coins + fireworks still going)
      4.7s  ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â coin explosion stops (fireworks + panel continue)
    */
    const t1 = window.setTimeout(() => { setStage('TROPHY_EXPLODE'); setShowCoins(true); }, 700);
    const t2 = window.setTimeout(() => setStage('PANEL'), 2700);
    const t3 = window.setTimeout(() => setShowCoins(false), 4700);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  return (
    <>
      {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Stage 1: Chips fly from each bet position ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ trophy ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
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

      {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Coins bursting upward from trophy (independent of stage) ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
      {showCoins && (
        <div className="absolute z-[530] pointer-events-none">
          {/* Tiny flash ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â trophy stays visible */}
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


      {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Stage 3: Win panel pops up with spring bounce ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
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

            {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Content container with consistent padding ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
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
                  {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Reward Bar ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
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

                  {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Leaderboard rows (matching no-bet panel alignment) ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
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

type RankAvatarProps = {
  src?: string;
  size: number;
  borderColor?: string;
  borderWidth?: number;
  className?: string;
  style?: React.CSSProperties;
};

const RankAvatar = ({
  src,
  size,
  borderColor = 'rgba(255,255,255,0.6)',
  borderWidth = 2,
  className,
  style,
}: RankAvatarProps) => {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [src]);

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: '50%',
        overflow: 'hidden',
        border: `${borderWidth}px solid ${borderColor}`,
        background: 'linear-gradient(180deg, #f7d996 0%, #e9be6d 100%)',
        ...style,
      }}
    >
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(70% 70% at 30% 25%, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0) 100%)' }} />
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: size * 0.2,
          width: size * 0.28,
          height: size * 0.28,
          transform: 'translateX(-50%)',
          borderRadius: '50%',
          background: '#f5e6be',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: '50%',
          bottom: size * 0.12,
          width: size * 0.58,
          height: size * 0.36,
          transform: 'translateX(-50%)',
          borderRadius: '999px 999px 18px 18px',
          background: '#f5e6be',
        }}
      />

      {src && !imageFailed ? (
        <img
          src={src}
          alt=""
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          onError={() => setImageFailed(true)}
        />
      ) : null}
    </div>
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

  /* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ API state ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */
  const [itemMultiplier, setItemMultiplier] = useState<Record<ItemId, number>>(DEFAULT_MULTIPLIER);
  const [chipValues, setChipValues] = useState<number[]>([...DEFAULT_CHIP_VALUES]);
  const [badgeOverrides, setBadgeOverrides] = useState<Record<ItemId, string>>({} as Record<ItemId, string>);
  const [boxData, setBoxData] = useState<{ id: number | null; threshold: number; src: string; openSrc: string; label: string }[]>(
    Object.entries(BOX_VALUE_TO_CHEST).map(([val, src]) => ({
      id: null,
      threshold: resolveThresholdFromBoxSource(Number(val)) ?? DEFAULT_BOX_THRESHOLDS[0],
      src,
      openSrc: src.replace('.png', '_open.png'),
      label: formatThresholdLabel(resolveThresholdFromBoxSource(Number(val)) ?? Number(val)),
    }))
  );
  /* Dynamic chest rewards from API (threshold Ã¢â€ â€™ reward amount) */
  const boxRewardsRef = useRef<Record<number, number>>({
    10: 100,
    20: 200,
    30: 300,
    40: 400,
    50: 500,
  });
  const [maxPlayers, setMaxPlayers] = useState(8);
  const [trophySrc, setTrophySrc] = useState('/image2/trophy.png');
  const [elementApiIds, setElementApiIds] = useState<Record<string, number>>({});
  const elementApiIdsRef = useRef<Record<string, number>>({});
  const missingElementMapWarnedRef = useRef<Set<ItemId>>(new Set());
  const [coinIconSrc, setCoinIconSrc] = useState('/image2/diamond.png');
  const [gameLogoSrc] = useState('/image2/greedy_sign_board.png');
  const [jackpotAmount, setJackpotAmount] = useState(0);
  const [prizeData, setPrizeData] = useState<ApiPrizeDistribution | null>(null);
  const [advanceModeApi, setAdvanceModeApi] = useState<ApiGameMode | null>(null);
  const [rankRowsToday, setRankRowsToday] = useState<{ name: string; diamonds: number; pic?: string }[]>([]);
  const [rankRowsYesterday, setRankRowsYesterday] = useState<{ name: string; diamonds: number; pic?: string }[]>([]);
  const [myRankToday, setMyRankToday] = useState<MyRankView | null>(null);
  const [playerPosition, setPlayerPosition] = useState<number | null>(null);
  const [myRankYesterday, setMyRankYesterday] = useState<MyRankView | null>(null);
  const [myPlayerName, setMyPlayerName] = useState('');
  const [myPlayerPic, setMyPlayerPic] = useState<string | undefined>(undefined);
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
          /* 0ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“10: APIs that need mode */
          () => prefetched?.elements ? Promise.resolve(prefetched.elements) : apiFetch<ApiElement[]>('/game/game/elements', 2, mBody),
          () => prefetched?.buttons ? Promise.resolve(prefetched.buttons) : apiFetch<ApiButton[]>('/game/sorce/buttons', 2, mBody),
          () => prefetched?.boxes ? Promise.resolve(prefetched.boxes) : apiFetch<ApiBox[]>('/game/magic/boxs', 2, pBody),
          () => prefetched?.winHistory ? Promise.resolve(prefetched.winHistory) : apiFetch<ApiWinElement[]>('/game/win/elements/list', 2, mBody),
          () => apiFetch<ApiTopWinnerResponse>('/game/top/winers', 2, pBody),
          () => prefetched?.jackpot ? Promise.resolve(prefetched.jackpot) : apiFetch<ApiJackpot>('/game/jackpot', 2, mBody),
          () => prefetched?.jackpotDetails ? Promise.resolve(prefetched.jackpotDetails) : apiFetch<ApiJackpotDetails>('/game/jackpot/details', 2, mBody),
          () => prefetched?.gameMode ? Promise.resolve(prefetched.gameMode) : apiFetch<ApiGameMode>('/game/game/mode', 2, pBody),
          () => apiFetch<ApiRankRow[]>('/game/game/rank/today', 2, mBody),
          () => apiFetch<ApiRankRow[]>('/game/game/rank/yesterday', 2, mBody),
          () => apiFetch<ApiPlayerRecords>('/game/game/records/of/player', 2, pBody),
          /* 11ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“18: APIs that DON'T need mode */
          () => prefetched?.trophy ? Promise.resolve(prefetched.trophy) : apiFetch<ApiTrophy>('/game/game/trophy'),
          () => prefetched?.coin ? Promise.resolve(prefetched.coin) : apiFetch<ApiCoin>('/game/game/coin'),
          () => prefetched?.gameIcon ? Promise.resolve(prefetched.gameIcon) : apiFetch<ApiGameIcon>('/game/icon/during/gaming'),
          () => apiFetch<ApiMaxPlayers>('/game/maximum/fruits/per/turn'),
          () => apiFetch<ApiGameRule>('/game/game/rule'),
          () => apiFetch<ApiPrizeDistribution>('/game/game/prize/distribution'),
          () => apiFetch<ApiGameMetadata>('/game/game/icon/'),
          () => apiFetch<ApiTodayWin>('/game/today/win', 1, apiBodyPlayer(2)),
          /* 18: User info / balance */
          () => apiFetch<ApiUserInfo>('/game/game/balance/and/user/info', 2,
            JSON.stringify({ regisation: REGISATION_ID, player_id: PLAYER_ID })),
          /* 20: Player position */
          () => apiFetch<{ player_positon?: number }>('/game/position/', 1, pBody),
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

        /* Map results ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â order matches the API calls array above */
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
        const userInfo = val<ApiUserInfo>(19);
        const positionApi = val<{ player_positon?: number }>(20);

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
          const boxesSorted = [...boxes].sort((a, b) => {
            const ta = resolveThresholdFromBoxSource(a.box_source) ?? Number.MAX_SAFE_INTEGER;
            const tb = resolveThresholdFromBoxSource(b.box_source) ?? Number.MAX_SAFE_INTEGER;
            return ta - tb;
          });
          const thresholdsFromApi = boxesSorted.map((b, idx) => (
            resolveThresholdFromBoxSource(b.box_source)
            ?? DEFAULT_BOX_THRESHOLDS[idx]
            ?? DEFAULT_BOX_THRESHOLDS[DEFAULT_BOX_THRESHOLDS.length - 1]
          ));
          const openedFromApi = buildChestState(thresholdsFromApi);
          const bd = boxesSorted.map((b, idx) => {
            const threshold = resolveThresholdFromBoxSource(b.box_source)
              ?? DEFAULT_BOX_THRESHOLDS[idx]
              ?? DEFAULT_BOX_THRESHOLDS[DEFAULT_BOX_THRESHOLDS.length - 1];
            const closedSrc = resolveMediaPath(b.box_image_close ?? b.box_image)
              ?? BOX_VALUE_TO_CHEST[Number(b.box_source)]
              ?? '/image2/chest_10k.png';
            const openSrc = resolveMediaPath(b.box_image_open)
              ?? CHEST_OPEN_SRC_BY_THRESHOLD[threshold]
              ?? CHEST_OPEN_SRC_BY_THRESHOLD[Number(b.box_source)]
              ?? '/image2/chest_10k_open.png';

            if (threshold in openedFromApi) {
              openedFromApi[threshold] = isTruthyBoxStatus(b.status);
            }

            return {
              id: typeof b.id === 'number' ? b.id : null,
              threshold,
              src: closedSrc,
              openSrc,
              label: formatThresholdLabel(threshold),
            };
          });
          const mergedOpened = mergeOpenedChestState(openedFromApi, savedChestsBasicRef.current);
          setBoxData(bd);
          setOpenedChests(mergedOpened);
          savedChestsBasicRef.current = { ...mergedOpened };
          /* Store reward amounts from API */
          const rewards: Record<number, number> = {};
          for (const b of boxesSorted) {
            const threshold = resolveThresholdFromBoxSource(b.box_source);
            if (threshold && typeof b.box_win_weights === 'number') {
              rewards[threshold] = b.box_win_weights;
            }
          }
          if (Object.keys(rewards).length > 0) {
            boxRewardsRef.current = { ...boxRewardsRef.current, ...rewards };
            console.log('[API] Box rewards from API:', rewards);
          }
          console.log('[API] Boxes loaded:', bd);
        }



        /* Trophy image */
        if (trophy?.icon) {
          const imgUrl = trophy.icon.startsWith('/') ? trophy.icon : `/${trophy.icon}`;
          setTrophySrc(imgUrl);
          console.log('[API] Trophy loaded:', imgUrl);
        }

        /* Win history ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ result strip */
        if (winHistory && Array.isArray(winHistory) && winHistory.length > 0) {
          const latestWin = winHistory[winHistory.length - 1];
          if (typeof latestWin?.id === 'number') {
            lastWinIdRef.current = latestWin.id;
          }

          const itemSrcMap: Record<string, string> = {};
          for (const item of ITEMS) {
            const apiName = ID_TO_API_NAME[item.id];
            if (apiName) {
              itemSrcMap[apiName] = item.src;
              itemSrcMap[apiName.toLowerCase()] = item.src;
            }
          }

          const srcs = winHistory
            .map((w) => {
              if (w.element__element_name) return itemSrcMap[w.element__element_name];
              // Jackpot entry: pick vegetables or drinks bucket based on first jackpot item
              if (w.gjp__jackpot_name && w.jackport_element_name?.length) {
                const firstId = API_NAME_TO_ID[w.jackport_element_name[0]];
                if (firstId) return VEG_ITEMS.includes(firstId) ? '/image2/tab_vegetables.png' : '/image2/tab_drinks.png';
              }
              return undefined;
            })
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

        /* Game logo icon Ã¢â‚¬â€ keep the local signboard; the API icon lacks
           the wooden background and food decorations */
        if (gameIcon?.icon) {
          const imgUrl = gameIcon.icon.startsWith('/') ? gameIcon.icon : `/${gameIcon.icon}`;
          // setGameLogoSrc(imgUrl);  Ã¢â‚¬â€ intentionally disabled to preserve local signboard
          console.log('[API] Game logo loaded (not applied Ã¢â‚¬â€ using local signboard):', imgUrl);
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

        /* Game mode ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â auto-enable advance if API says so */
        if (gameMode) {
          setAdvanceModeApi(gameMode);
          if (gameMode.advance === true) {
            setMode('ADVANCE');
            console.log('[API] Advance mode ENABLED by server');
          }
          console.log('[API] Game mode loaded:', gameMode.advance, 'remaining:', gameMode.remanning_values);
        }

        /* Rank today ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â row-based array: [{mrs_player_id_player_name, mrs_player_id_player_pic, last_balance}] */
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

        /* Extract day-reset countdown timer from rank/today response */
        if (rankToday && typeof rankToday === 'object' && 'time' in (rankToday as object)) {
          const timeStr = (rankToday as { time?: string }).time;
          if (timeStr) {
            const parts = timeStr.split(':').map(Number);
            const totalSec = (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
            if (totalSec > 0) {
              setDayResetSeconds(totalSec);
              console.log('[API] Day reset timer:', timeStr, '=', totalSec, 'seconds');
            }
          }
        }

        /* Top Winners ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â use API data, fallback to rank today for profile pics */
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

        /* Rank yesterday ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â same row-based format */
        const parsedRankYesterday = parseRankRows(rankYesterday);
        if (parsedRankYesterday.length > 0) {
          setRankRowsYesterday(parsedRankYesterday);
          console.log('[API] Rank yesterday loaded:', parsedRankYesterday.length, 'rows');
        }

        /* My rank row (Today / Yesterday) for sticky bottom layout */
        const [myRankTodayRes, myRankYesterdayRes] = await Promise.allSettled([
          apiFetch<ApiMyRankResponse>('/game/my/game/rank/today/', 1, pBody),
          apiFetch<ApiMyRankResponse>('/game/my/game/rank/yesterday/', 1, pBody),
        ]);

        if (myRankTodayRes.status === 'fulfilled') {
          const parsed = parseMyRankResponse(myRankTodayRes.value);
          if (parsed) {
            setMyRankToday(parsed);
          }
        }

        if (myRankYesterdayRes.status === 'fulfilled') {
          const parsed = parseMyRankResponse(myRankYesterdayRes.value);
          if (parsed) {
            setMyRankYesterday(parsed);
          }
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
        if (hasExplicitPlayerRecordArray(playerRecords)) {
          const rows = extractPlayerRecordRows(playerRecords);
          setApiPlayerRecords(rows.map((r) => mapApiPlayerRecord(r)));
          setPlayerRecordsHydrated(true);
          console.log('[API] Player records loaded:', rows.length, 'records');
        } else {
          console.warn('[API] Player records payload had no array shape:', playerRecords);
        }

        /* User Info / Balance Ã¢â‚¬â€ authoritative from server */
        if (userInfo) {
          if (typeof userInfo.balance === 'number') {
            setBalance(userInfo.balance);
            console.log('[API] User info loaded Ã¢â‚¬â€ balance:', userInfo.balance, 'user_id:', userInfo.user_id);
          }
          const identity = parseApiIdentity(userInfo);
          if (identity.name) setMyPlayerName(identity.name);
          if (identity.pic) setMyPlayerPic(identity.pic);
        }

        /* Player Position */
        if (positionApi && typeof positionApi.player_positon === 'number') {
          setPlayerPosition(positionApi.player_positon);
          console.log('[API] Player position loaded:', positionApi.player_positon);
        }

      } catch (err) {
        console.warn('[API] Unexpected error:', err);
      }
    })();

    /* Fetch background music URL and create Audio element */
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/game/game/music`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ regisation: REGISATION_ID }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.music) {
            const url = `https://funint.site${data.music}`;
            musicUrlRef.current = url;
            const audio = new Audio(url);
            audio.loop = true;
            audio.volume = 0.3;
            musicAudioRef.current = audio;
            console.log('[API] Music loaded:', url);
            /* Try to autoplay (may be blocked by browser until user interaction) */
            audio.play().catch(() => {
              /* Retry on first user click */
              const handler = () => {
                if (musicAudioRef.current && musicUrlRef.current) {
                  musicAudioRef.current.play().catch(() => { });
                }
                document.removeEventListener('click', handler);
              };
              document.addEventListener('click', handler, { once: true });
            });
          }
        }
      } catch (err) {
        console.warn('[API] Music fetch error:', err);
      }
    })();

    return () => {
      /* cleanup Ã¢â‚¬â€ pause music on unmount */
      if (musicAudioRef.current) {
        musicAudioRef.current.pause();
        musicAudioRef.current = null;
      }
    };
  }, []);

  const [mode, setMode] = useState<Mode>('BASIC');
  const isAdvanceMode = mode === 'ADVANCE';
  const [phase, setPhase] = useState<Phase>('BETTING');
  const [timeLeft, setTimeLeft] = useState(0);
  const [showGameOn, setShowGameOn] = useState(true);

  const [showPreDraw, setShowPreDraw] = useState(false);
  const preDrawTimeoutRef = useRef<number | null>(null);

  const [selectedChip, setSelectedChip] = useState<number>(100);

  /* Ã¢â€â‚¬Ã¢â€â‚¬ localStorage persistence for balance (todayWin now from server API) Ã¢â€â‚¬Ã¢â€â‚¬ */
  const LS_KEY_BALANCE = `gm_balance_${PLAYER_ID}`;

  const readLS = (key: string): number | null => {
    try { const v = localStorage.getItem(key); return v != null ? Number(v) : null; } catch { return null; }
  };
  const writeLS = (key: string, val: number) => {
    try { localStorage.setItem(key, String(val)); } catch { /* quota */ }
  };

  const [balance, setBalance] = useState(() => readLS(LS_KEY_BALANCE) ?? 0);
  const [todayWin, setTodayWin] = useState(0); /* will be set from API on init */
  const [lifetimeBet, setLifetimeBet] = useState(0);

  /* Persist to localStorage whenever balance changes */
  useEffect(() => { writeLS(LS_KEY_BALANCE, balance); }, [balance, LS_KEY_BALANCE]);

  /* Bets saved per mode so switching modes preserves them */
  const savedBetsBasicRef = useRef<BetsState>(buildEmptyBets());
  const savedBetsAdvanceRef = useRef<BetsState>(buildEmptyBets());

  /* Opened chests saved per mode */
  const EMPTY_CHESTS: Record<number, boolean> = buildChestState(DEFAULT_BOX_THRESHOLDS);
  const savedChestsBasicRef = useRef<Record<number, boolean>>({ ...EMPTY_CHESTS });
  const savedChestsAdvanceRef = useRef<Record<number, boolean>>({ ...EMPTY_CHESTS });

  const [bets, setBets] = useState<BetsState>(buildEmptyBets());
  /* Per-mode bet snapshots frozen at BETTING→DRAWING transition.
     Both modes process wins in parallel during SHOWTIME. */
  const roundBetsBasicRef = useRef<BetsState>(buildEmptyBets());
  const roundBetsAdvanceRef = useRef<BetsState>(buildEmptyBets());
  const otherModeWinRef = useRef(0);
  const [pendingWin, setPendingWin] = useState<PendingWin | null>(null);

  const [resultSrcs, setResultSrcs] = useState<string[]>(INITIAL_RESULT_SRCS);
  const [resultKind, setResultKind] = useState<ResultKind>('LOSE');

  const [roundType, setRoundType] = useState<RoundType>('NORMAL');
  const transitioningRef = useRef(false); // guard: prevents double SHOWTIMEÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢BETTING transition

  const [showResultBoard, setShowResultBoard] = useState(false);
  const [winnerIds, setWinnerIds] = useState<ItemId[] | null>(null);
  const winnerRef = useRef<ItemId[] | null>(null);

  const [activeModal, setActiveModal] = useState<ModalType>('NONE');
  const [rankTab, setRankTab] = useState<RankTab>('TODAY');
  const [musicOn, setMusicOn] = useState(true);

  /* Ã¢â€â‚¬Ã¢â€â‚¬ Daily reset countdown (from rank/today API "time" field) Ã¢â€â‚¬Ã¢â€â‚¬ */
  const [dayResetSeconds, setDayResetSeconds] = useState(0);

  /* 1-second countdown interval for day reset */
  useEffect(() => {
    if (dayResetSeconds <= 0) return;
    const id = setInterval(() => {
      setDayResetSeconds((prev) => {
        if (prev <= 1) {
          /* Timer expired Ã¢â‚¬â€ reset today's data */
          setTodayWin(0);
          setOpenedChests({ ...EMPTY_CHESTS });
          /* Move today records to yesterday */
          setRankRowsYesterday(rankRowsToday);
          setRankRowsToday([]);
          /* Re-fetch fresh data */
          void refreshRoundStateFromServer();
          console.log('[TIMER] Day reset Ã¢â‚¬â€ todayWin, boxes, and rank reset');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [dayResetSeconds > 0]); // eslint-disable-line react-hooks/exhaustive-deps
  const musicUrlRef = useRef<string>('');
  const musicAudioRef = useRef<HTMLAudioElement | null>(null);

  /* Play/pause music when musicOn changes */
  useEffect(() => {
    const audio = musicAudioRef.current;
    if (!audio || !musicUrlRef.current) return;
    if (musicOn) {
      audio.play().catch(() => { /* autoplay blocked, will retry on user interaction */ });
    } else {
      audio.pause();
    }
  }, [musicOn]);

  const [records, setRecords] = useState<GameRecord[]>([]);
  const [apiRules, setApiRules] = useState<string[]>([]);
  const [apiRulesVersion, setApiRulesVersion] = useState('');
  const [jackpotAwards, setJackpotAwards] = useState<{ round: number; win: number; time: string }[]>([]);
  const [gameName, setGameName] = useState('Gready Market');
  const [apiPlayerRecords, setApiPlayerRecords] = useState<PlayerRecordView[]>([]);
  const [playerRecordsHydrated, setPlayerRecordsHydrated] = useState(false);
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

  /* Ã¢â€â‚¬Ã¢â€â‚¬ When mode changes (Basic Ã¢â€ â€ Advance), clear bets & re-fetch mode-specific data Ã¢â€â‚¬Ã¢â€â‚¬ */
  const prevModeRef = useRef<Mode>(mode);
  useEffect(() => {
    if (prevModeRef.current === mode) return; // skip initial mount
    prevModeRef.current = mode;

    console.log('[MODE] Switched to', mode, '— phase:', phaseRef.current);

    /* 1. Save/restore bets ONLY during BETTING phase.
       During DRAWING/SHOWTIME, bets must stay as-is so the round result
       (winner/no-bet) displays correctly with the frozen bet snapshot. */
    const oldMode = mode === 'ADVANCE' ? 'BASIC' : 'ADVANCE';
    if (phaseRef.current === 'BETTING') {
      if (oldMode === 'BASIC') {
        savedBetsBasicRef.current = { ...bets } as BetsState;
      } else {
        savedBetsAdvanceRef.current = { ...bets } as BetsState;
      }
      const restoredBets = mode === 'ADVANCE' ? savedBetsAdvanceRef.current : savedBetsBasicRef.current;
      setBets({ ...restoredBets });
    }

    /* 2. Reset todayWin temporarily, will be set from API below */
    setTodayWin(0);

    /* 3. Save openedChests for old mode, restore for new mode */
    if (oldMode === 'BASIC') {
      savedChestsBasicRef.current = { ...openedChests };
    } else {
      savedChestsAdvanceRef.current = { ...openedChests };
    }
    const restoredChests = mode === 'ADVANCE' ? savedChestsAdvanceRef.current : savedChestsBasicRef.current;
    setOpenedChests({ ...restoredChests });
    console.log('[MODE] Chests restored for', mode, ':', restoredChests);

    /* 4. Re-fetch mode-specific data (boxes, elements, buttons, win history, todayWin) */
    const modeNum = mode === 'ADVANCE' ? 1 : 2;
    const mBody = apiBodyWithMode(modeNum);
    const pBody = apiBodyPlayer(modeNum);

    (async () => {
      try {
        const [elemRes, btnRes, boxRes, winRes, todayWinRes, myRankTodayRes, myRankYesterdayRes] = await Promise.allSettled([
          apiFetch<ApiElement[]>('/game/game/elements', 1, mBody),
          apiFetch<ApiButton[]>('/game/sorce/buttons', 1, mBody),
          apiFetch<ApiBox[]>('/game/magic/boxs', 1, pBody),
          apiFetch<ApiWinElement[]>('/game/win/elements/list', 1, mBody),
          apiFetch<ApiTodayWin>('/game/today/win', 1, pBody),
          apiFetch<ApiMyRankResponse>('/game/my/game/rank/today/', 1, pBody),
          apiFetch<ApiMyRankResponse>('/game/my/game/rank/yesterday/', 1, pBody),
        ]);

        /* Elements Ã¢â‚¬â€ update multipliers & badges */
        if (elemRes.status === 'fulfilled' && elemRes.value?.length) {
          const multipliers = { ...DEFAULT_MULTIPLIER };
          const badges: Record<string, string> = {};
          const apiIds: Record<string, number> = {};
          for (const el of elemRes.value) {
            const id = API_NAME_TO_ID[el.element_name];
            if (id) {
              multipliers[id] = el.paytable;
              badges[id] = `x${el.paytable}`;
              apiIds[id] = el.id;
            }
          }
          setItemMultiplier(multipliers);
          setBadgeOverrides(badges as Record<ItemId, string>);
          setElementApiIds(apiIds);
          elementApiIdsRef.current = apiIds;
          missingElementMapWarnedRef.current.clear();
          console.log('[MODE] Elements reloaded for', mode);
        }

        /* Buttons */
        if (btnRes.status === 'fulfilled' && btnRes.value?.length) {
          const vals = btnRes.value.map((b) => b.source).filter(Boolean).sort((a, b) => a - b);
          if (vals.length > 0) {
            setChipValues(vals);
            /* Validate selectedChip Ã¢â‚¬â€ if current chip isn't in the new list, pick closest */
            setSelectedChip((prev) => {
              if (vals.includes(prev)) return prev;
              const closest = vals.reduce((best, v) => Math.abs(v - prev) < Math.abs(best - prev) ? v : best, vals[0]);
              console.log('[MODE] Chip', prev, 'not in new list, auto-selecting:', closest);
              return closest;
            });
            console.log('[MODE] Buttons reloaded:', vals);
          }
        }

        /* Boxes */
        if (boxRes.status === 'fulfilled' && boxRes.value?.length) {
          const boxesSorted = [...boxRes.value].sort((a, b) => {
            const ta = resolveThresholdFromBoxSource(a.box_source) ?? Number.MAX_SAFE_INTEGER;
            const tb = resolveThresholdFromBoxSource(b.box_source) ?? Number.MAX_SAFE_INTEGER;
            return ta - tb;
          });
          const thresholdsFromApi = boxesSorted.map((b, idx) => (
            resolveThresholdFromBoxSource(b.box_source)
            ?? DEFAULT_BOX_THRESHOLDS[idx]
            ?? DEFAULT_BOX_THRESHOLDS[DEFAULT_BOX_THRESHOLDS.length - 1]
          ));
          const openedFromApi = buildChestState(thresholdsFromApi);
          const bd = boxesSorted.map((b, idx) => {
            const threshold = resolveThresholdFromBoxSource(b.box_source)
              ?? DEFAULT_BOX_THRESHOLDS[idx]
              ?? DEFAULT_BOX_THRESHOLDS[DEFAULT_BOX_THRESHOLDS.length - 1];
            const closedSrc = resolveMediaPath(b.box_image_close ?? b.box_image)
              ?? BOX_VALUE_TO_CHEST[Number(b.box_source)]
              ?? '/image2/chest_10k.png';
            const openSrc = resolveMediaPath(b.box_image_open)
              ?? CHEST_OPEN_SRC_BY_THRESHOLD[threshold]
              ?? CHEST_OPEN_SRC_BY_THRESHOLD[Number(b.box_source)]
              ?? '/image2/chest_10k_open.png';

            if (threshold in openedFromApi) {
              openedFromApi[threshold] = isTruthyBoxStatus(b.status);
            }

            return {
              id: typeof b.id === 'number' ? b.id : null,
              threshold,
              src: closedSrc,
              openSrc,
              label: formatThresholdLabel(threshold),
            };
          });
          const preservedLocal = mode === 'ADVANCE'
            ? savedChestsAdvanceRef.current
            : savedChestsBasicRef.current;
          const mergedOpened = mergeOpenedChestState(openedFromApi, preservedLocal);
          setBoxData(bd);
          setOpenedChests(mergedOpened);
          if (mode === 'ADVANCE') {
            savedChestsAdvanceRef.current = { ...mergedOpened };
          } else {
            savedChestsBasicRef.current = { ...mergedOpened };
          }
          /* Store reward amounts from API */
          const rewards: Record<number, number> = {};
          for (const b of boxesSorted) {
            const threshold = resolveThresholdFromBoxSource(b.box_source);
            if (threshold && typeof b.box_win_weights === 'number') {
              rewards[threshold] = b.box_win_weights;
            }
          }
          if (Object.keys(rewards).length > 0) {
            boxRewardsRef.current = { ...boxRewardsRef.current, ...rewards };
          }
          console.log('[MODE] Boxes reloaded:', bd.length, 'boxes, rewards:', rewards);
        }

        /* Win history */
        if (winRes.status === 'fulfilled' && winRes.value?.length) {
          const itemSrcMap: Record<string, string> = {};
          for (const item of ITEMS) {
            const apiName = ID_TO_API_NAME[item.id];
            if (apiName) {
              itemSrcMap[apiName] = item.src;
              itemSrcMap[apiName.toLowerCase()] = item.src;
            }
          }
          const srcs = winRes.value
            .map((w) => w.element__element_name ? itemSrcMap[w.element__element_name] : undefined)
            .filter(Boolean) as string[];
          if (srcs.length > 0) setResultSrcs(srcs.reverse());
        }

        /* TodayWin Ã¢â‚¬â€ from server per-player per-mode */
        if (todayWinRes.status === 'fulfilled') {
          const total = todayWinRes.value?.today_win?.total_balance;
          if (typeof total === 'number' && Number.isFinite(total)) {
            setTodayWin(total);
            console.log('[MODE] TodayWin from API for', mode, ':', total);
          }
        }

        if (myRankTodayRes.status === 'fulfilled') {
          const parsed = parseMyRankResponse(myRankTodayRes.value);
          if (parsed) setMyRankToday(parsed);
        }

        if (myRankYesterdayRes.status === 'fulfilled') {
          const parsed = parseMyRankResponse(myRankYesterdayRes.value);
          if (parsed) setMyRankYesterday(parsed);
        }
      } catch (err) {
        console.warn('[MODE] Re-fetch failed:', err);
      }
    })();
  }, [mode]);
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
  const progressThresholds = useMemo(() => {
    const uniqueSorted = Array.from(new Set(
      boxData
        .map((box) => box.threshold)
        .filter((threshold) => Number.isFinite(threshold) && threshold > 0),
    )).sort((a, b) => a - b);
    return uniqueSorted.length > 0 ? uniqueSorted : [...DEFAULT_BOX_THRESHOLDS];
  }, [boxData]);

  // closed -> open chest image mapping (from your folder screenshot)
  const CHEST_OPEN_SRC_BY_THRESHOLD: Record<number, string> = {
    10: '/image2/chest_10k_open.png',
    20: '/image2/chest_50k_open.png',
    30: '/image2/chest_100k_open.png',
    40: '/image2/chest_500k_open.png',
    50: '/image2/chest_1m_open.png',
    10000: '/image2/chest_10k_open.png',
    50000: '/image2/chest_50k_open.png',
    100000: '/image2/chest_100k_open.png',
    500000: '/image2/chest_500k_open.png',
    1000000: '/image2/chest_1m_open.png',
  };
  const [openedChests, setOpenedChests] = useState<Record<number, boolean>>(() => buildChestState(DEFAULT_BOX_THRESHOLDS));
  const openingChestThresholdsRef = useRef<Set<number>>(new Set());
  // IMPORTANT: set your real reward amounts here (example values).
  // The popup in your screenshot shows 500, so adjust as needed per chest.
  /* Use API-driven rewards (boxRewardsRef) instead of hardcoded values */
  const isChestReady = (threshold: number) => todayWin >= threshold && !openedChests[threshold];
  const progressRatio = useMemo(() => {
    if (todayWin <= 0) return 0;
    if (progressThresholds.length === 0) return 0;
    const segmentWidth = 1 / progressThresholds.length;
    for (let i = 0; i < progressThresholds.length; i++) {
      const lo = i === 0 ? 0 : progressThresholds[i - 1];
      const hi = progressThresholds[i];
      if (todayWin <= hi) {
        const segmentProgress = (todayWin - lo) / (hi - lo);
        return segmentWidth * i + segmentWidth * segmentProgress;
      }
    }
    return 1; // exceeded all thresholds
  }, [progressThresholds, todayWin]);


  const openChest = async (threshold: number) => {
    // can ONLY open if it's ready (met threshold + currently not opened)
    if (!isChestReady(threshold)) return;
    if (openingChestThresholdsRef.current.has(threshold)) return;

    const amount = boxRewardsRef.current[threshold] ?? 0;
    const box = boxData.find((entry) => entry.threshold === threshold);

    openingChestThresholdsRef.current.add(threshold);
    try {
      // Optimistic UI: open immediately and keep it open even if save API fails.
      setOpenedChests((prev) => {
        const next = { ...prev, [threshold]: true };
        if (isAdvanceMode) {
          savedChestsAdvanceRef.current = { ...next };
        } else {
          savedChestsBasicRef.current = { ...next };
        }
        return next;
      });

      if (amount > 0) {
        setBalance((prev) => prev + amount);
      }

      // show popup
      setChestPopup({ threshold, amount });

      if (typeof box?.id === 'number') {
        const modeNum = isAdvanceMode ? 1 : 2;
        const pBody = apiBodyPlayer(modeNum);
        const res = await fetch(`${API_BASE}/game/magic/boxs/open`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            player_id: PLAYER_ID,
            box_id: box.id,
            mode: modeNum,
            regisation: REGISATION_ID,
          }),
        });
        if (res.ok) {
          try {
            const openResult = await res.json() as ApiOpenMagicBoxResponse;
            if (openResult?.message) {
              console.log('[API] Magic box open saved:', openResult.message);
            }
          } catch {
            console.log('[API] Magic box open saved');
          }

          /* Re-fetch box status from server to confirm persistence */
          try {
            const freshBoxes = await apiFetch<ApiBox[]>('/game/magic/boxs', 1, pBody);
            if (freshBoxes && Array.isArray(freshBoxes) && freshBoxes.length > 0) {
              const serverOpened: Record<number, boolean> = {};
              for (const b of freshBoxes) {
                const t = resolveThresholdFromBoxSource(b.box_source);
                if (t != null) {
                  serverOpened[t] = isTruthyBoxStatus(b.status);
                }
              }
              setOpenedChests((prev) => {
                const merged = { ...prev };
                for (const [key, val] of Object.entries(serverOpened)) {
                  merged[Number(key)] = val || prev[Number(key)] || false;
                }
                return merged;
              });
              // Sync local refs with server-confirmed state
              setOpenedChests((latest) => {
                if (isAdvanceMode) {
                  savedChestsAdvanceRef.current = { ...latest };
                } else {
                  savedChestsBasicRef.current = { ...latest };
                }
                return latest;
              });
              console.log('[API] Box status re-fetched after open, server state:', serverOpened);
            }
          } catch (refetchErr) {
            console.warn('[API] Re-fetch box status after open failed (not critical):', refetchErr);
          }
        } else {
          console.warn('[API] Magic box open save failed:', res.status, '(kept local open state)');
        }
      } else {
        console.warn('[API] Missing box_id for threshold', threshold, '; box open saved locally only');
      }
    } catch (err) {
      console.warn('[API] Failed to save opened magic box (kept local open state):', err);
    } finally {
      openingChestThresholdsRef.current.delete(threshold);
    }
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
      const allJackpotIds = (entry.jackport_element_name ?? [])
        .map((name) => API_NAME_TO_ID[name])
        .filter((id): id is ItemId => Boolean(id));

      if (allJackpotIds.length > 0) {
        // Always use the FULL category (all 4 items) based on the first matched element
        const firstId = allJackpotIds[0];
        const isVegCategory = VEG_ITEMS.includes(firstId);
        const jackpotIds = isVegCategory ? [...VEG_ITEMS] : [...DRINK_ITEMS];

        setRoundType('JACKPOT');
        winnerRef.current = jackpotIds;
        setWinnerIds(jackpotIds);
        console.log('[LIVE] Jackpot winner category:', isVegCategory ? 'VEG' : 'DRINKS', jackpotIds, '(server sent:', allJackpotIds, ')');
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

    const [recordsRes, todayWinRes, userInfoRes, boxesRes, myRankTodayRes, myRankYesterdayRes] = await Promise.allSettled([
      apiFetch<ApiPlayerRecords>('/game/game/records/of/player', 1, pBody),
      apiFetch<ApiTodayWin>('/game/today/win', 1, pBody),
      apiFetch<ApiUserInfo>('/game/game/balance/and/user/info', 1,
        JSON.stringify({ regisation: REGISATION_ID, player_id: PLAYER_ID })),
      apiFetch<ApiBox[]>('/game/magic/boxs', 1, pBody),
      apiFetch<ApiMyRankResponse>('/game/my/game/rank/today/', 1, pBody),
      apiFetch<ApiMyRankResponse>('/game/my/game/rank/yesterday/', 1, pBody),
    ]);

    /* Player records */
    if (recordsRes.status === 'fulfilled') {
      const payload = recordsRes.value;
      if (hasExplicitPlayerRecordArray(payload)) {
        const rows = extractPlayerRecordRows(payload);
        setApiPlayerRecords(rows.map((row) => mapApiPlayerRecord(row)));
        setPlayerRecordsHydrated(true);
      } else {
        console.warn('[LIVE] Player records payload had no array shape, keeping previous records:', payload);
      }
    }

    /* TodayWin Ã¢â‚¬â€ trust server value (API now returns per-player per-mode data) */
    if (todayWinRes.status === 'fulfilled') {
      const total = todayWinRes.value?.today_win?.total_balance;
      if (typeof total === 'number' && Number.isFinite(total)) {
        setTodayWin(total);
        console.log('[LIVE] TodayWin from API:', total);
      }
    }

    /* Boxes Ã¢â‚¬â€ trust per-player status from API */
    if (boxesRes.status === 'fulfilled' && boxesRes.value?.length) {
      const boxesSorted = [...boxesRes.value].sort((a, b) => {
        const ta = resolveThresholdFromBoxSource(a.box_source) ?? Number.MAX_SAFE_INTEGER;
        const tb = resolveThresholdFromBoxSource(b.box_source) ?? Number.MAX_SAFE_INTEGER;
        return ta - tb;
      });
      const thresholdsFromApi = boxesSorted.map((b, idx) => (
        resolveThresholdFromBoxSource(b.box_source)
        ?? DEFAULT_BOX_THRESHOLDS[idx]
        ?? DEFAULT_BOX_THRESHOLDS[DEFAULT_BOX_THRESHOLDS.length - 1]
      ));
      const openedFromApi = buildChestState(thresholdsFromApi);
      const bd = boxesSorted.map((b, idx) => {
        const threshold = resolveThresholdFromBoxSource(b.box_source)
          ?? DEFAULT_BOX_THRESHOLDS[idx]
          ?? DEFAULT_BOX_THRESHOLDS[DEFAULT_BOX_THRESHOLDS.length - 1];
        const closedSrc = resolveMediaPath(b.box_image_close ?? b.box_image)
          ?? BOX_VALUE_TO_CHEST[Number(b.box_source)]
          ?? '/image2/chest_10k.png';
        const openSrc = resolveMediaPath(b.box_image_open)
          ?? CHEST_OPEN_SRC_BY_THRESHOLD[threshold]
          ?? CHEST_OPEN_SRC_BY_THRESHOLD[Number(b.box_source)]
          ?? '/image2/chest_10k_open.png';

        if (threshold in openedFromApi) {
          openedFromApi[threshold] = isTruthyBoxStatus(b.status);
        }

        return {
          id: typeof b.id === 'number' ? b.id : null,
          threshold,
          src: closedSrc,
          openSrc,
          label: formatThresholdLabel(threshold),
        };
      });
      const preservedLocal = isAdvanceMode
        ? savedChestsAdvanceRef.current
        : savedChestsBasicRef.current;
      const mergedOpened = mergeOpenedChestState(openedFromApi, preservedLocal);
      setBoxData(bd);
      setOpenedChests(mergedOpened);
      if (isAdvanceMode) {
        savedChestsAdvanceRef.current = { ...mergedOpened };
      } else {
        savedChestsBasicRef.current = { ...mergedOpened };
      }

      const rewards: Record<number, number> = {};
      for (const b of boxesSorted) {
        const threshold = resolveThresholdFromBoxSource(b.box_source);
        if (threshold && typeof b.box_win_weights === 'number') {
          rewards[threshold] = b.box_win_weights;
        }
      }
      if (Object.keys(rewards).length > 0) {
        boxRewardsRef.current = { ...boxRewardsRef.current, ...rewards };
      }
      console.log('[LIVE] Boxes synced:', bd.length);
    }

    if (myRankTodayRes.status === 'fulfilled') {
      const parsed = parseMyRankResponse(myRankTodayRes.value);
      if (parsed) setMyRankToday(parsed);
    }

    if (myRankYesterdayRes.status === 'fulfilled') {
      const parsed = parseMyRankResponse(myRankYesterdayRes.value);
      if (parsed) setMyRankYesterday(parsed);
    }

    /* Balance Ã¢â‚¬â€ trust user info API (called AFTER balance/update has saved) */
    if (userInfoRes.status === 'fulfilled') {
      if (typeof userInfoRes.value?.balance === 'number') {
        setBalance(userInfoRes.value.balance);
        console.log('[LIVE] Balance from user info:', userInfoRes.value.balance);
      }
      const identity = parseApiIdentity(userInfoRes.value);
      if (identity.name) setMyPlayerName(identity.name);
      if (identity.pic) setMyPlayerPic(identity.pic);
    }
  }, [isAdvanceMode]);

  /* POST balance update to server, then fetch confirmed balance from user info */
  const updateBalanceOnServer = useCallback(async (newBalance: number) => {
    if (!PLAYER_ID) return;
    try {
      /* Step 1: POST the new absolute balance */
      const res = await fetch(`${API_BASE}/game/user/balance/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registration_id: REGISATION_ID, player_id: PLAYER_ID, amount: newBalance }),
      });
      if (!res.ok) {
        console.warn('[API] Balance update failed:', res.status);
        return;
      }
      const data = await res.json();
      console.log('[API] Balance update sent (amount:', newBalance, '):', data);

      /* Step 2: Fetch confirmed balance from user info */
      try {
        const infoRes = await fetch(`${API_BASE}/game/game/balance/and/user/info`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ regisation: REGISATION_ID, player_id: PLAYER_ID }),
        });
        if (infoRes.ok) {
          const info: ApiUserInfo = await infoRes.json();
          if (typeof info.balance === 'number') {
            setBalance(info.balance);
            console.log('[API] Confirmed balance from server:', info.balance);
          }
          const identity = parseApiIdentity(info);
          if (identity.name) setMyPlayerName(identity.name);
          if (identity.pic) setMyPlayerPic(identity.pic);
        }
      } catch { /* non-critical */ }
    } catch (err) {
      console.warn('[API] Balance update error:', err);
    }
  }, []);

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
          registration: REGISATION_ID,
          regisation: REGISATION_ID,
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
    console.warn('[LIVE] Could not get winner Ã¢â‚¬â€ skipping round');
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

    // Pick the EARLIEST (soonest) next_run_time Ã¢â‚¬â€ ensures all clients
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
          /* Session already expired Ã¢â‚¬â€ skip to DRAWING immediately */
          console.log('[TIMER] Session already expired, skipping to DRAWING');
          currentSessionEndRef.current = '';
          bettingEndMsRef.current = 0;
          /* Snapshot BOTH modes' bets for parallel SHOWTIME processing */
          if (isAdvanceMode) {
            savedBetsAdvanceRef.current = { ...bets };
          } else {
            savedBetsBasicRef.current = { ...bets };
          }
          roundBetsBasicRef.current = { ...savedBetsBasicRef.current };
          roundBetsAdvanceRef.current = { ...savedBetsAdvanceRef.current };
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
        return; // success Ã¢â‚¬â€ exit the retry loop
      } catch (err) {
        console.error(`[TIMER] beginRound attempt ${attempt} failed:`, err);
        if (attempt < 3) { await new Promise(r => setTimeout(r, 500)); continue; }
      }
    }

    /* All 3 attempts failed Ã¢â‚¬â€ fallback to local timer */
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
    if (balance < totalCost) {
      setActiveModal('RECHARGE');
      return; // require enough balance to bet on ALL items
    }

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
    /* Guard: don't restart the round if we're already in DRAWING or SHOWTIME.
       Mode switches cause beginRound to be recreated (via isAdvanceMode dep chain),
       which would otherwise re-fire this effect and reset the phase to BETTING mid-round. */
    if (phaseRef.current === 'DRAWING' || phaseRef.current === 'SHOWTIME') return;
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

  /* Ã¢â€â‚¬Ã¢â€â‚¬ Periodic timer sync during BETTING (with backoff) Ã¢â€â‚¬Ã¢â€â‚¬ */
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

  /* Ã¢â€â‚¬Ã¢â€â‚¬ Periodic live data refresh during BETTING Ã¢â€â‚¬Ã¢â€â‚¬ */
  useEffect(() => {
    if (phase !== 'BETTING') return;

    const refreshLiveData = async () => {
      const mBody = apiBodyWithMode(isAdvanceMode ? 1 : 2);
      const pBody = apiBodyPlayer(isAdvanceMode ? 1 : 2);

      const [jackpotRes, rankRes, topRes, winHistRes, myRankTodayRes, myRankYesterdayRes, positionRes] = await Promise.allSettled([
        apiFetch<ApiJackpot>('/game/jackpot', 1, mBody),
        apiFetch<ApiRankRow[]>('/game/game/rank/today', 1, mBody),
        apiFetch<ApiTopWinnerResponse>('/game/top/winers', 1, pBody),
        apiFetch<ApiWinElement[]>('/game/win/elements/list', 1, mBody),
        apiFetch<ApiMyRankResponse>('/game/my/game/rank/today/', 1, pBody),
        apiFetch<ApiMyRankResponse>('/game/my/game/rank/yesterday/', 1, pBody),
        apiFetch<{ player_positon?: number }>('/game/position/', 1, pBody),
      ]);

      /* Jackpot Ã¢â‚¬â€ only update if server returns a real value (avoids overwriting details total with 0) */
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

      if (myRankTodayRes.status === 'fulfilled') {
        const parsed = parseMyRankResponse(myRankTodayRes.value);
        if (parsed) setMyRankToday(parsed);
      }

      if (myRankYesterdayRes.status === 'fulfilled') {
        const parsed = parseMyRankResponse(myRankYesterdayRes.value);
        if (parsed) setMyRankYesterday(parsed);
      }

      /* Player Position */
      if (positionRes.status === 'fulfilled' && typeof positionRes.value?.player_positon === 'number') {
        setPlayerPosition(positionRes.value.player_positon);
      }

      /* Result strip (win history) Ã¢â‚¬â€ only update during BETTING, and only if
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
          .map((w) => {
            if (w.element__element_name) return itemSrcMap[w.element__element_name];
            // Jackpot entry: pick vegetables or drinks bucket based on first jackpot item
            if (w.gjp__jackpot_name && w.jackport_element_name?.length) {
              const firstId = API_NAME_TO_ID[w.jackport_element_name[0]];
              if (firstId) return VEG_ITEMS.includes(firstId) ? '/image2/tab_vegetables.png' : '/image2/tab_drinks.png';
            }
            return undefined;
          })
          .filter(Boolean) as string[];

        if (srcs.length > 0) {
          const serverResults = srcs.reverse();
          /* Only replace if server has at least as many results Ã¢â‚¬â€ avoids wiping
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
      /* Snapshot BOTH modes' bets for parallel SHOWTIME processing */
      if (isAdvanceMode) {
        savedBetsAdvanceRef.current = { ...bets };
      } else {
        savedBetsBasicRef.current = { ...bets };
      }
      roundBetsBasicRef.current = { ...savedBetsBasicRef.current };
      roundBetsAdvanceRef.current = { ...savedBetsAdvanceRef.current };
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

      /* Use snapshotted bets for the CURRENTLY VIEWED mode */
      const frozenBets = isAdvanceMode ? roundBetsAdvanceRef.current : roundBetsBasicRef.current;
      const frozenTotalBet = Object.values(frozenBets).reduce((sum, val) => sum + val, 0);
      const hadAnyBet = frozenTotalBet > 0;

      let winAmount = 0;
      let primaryId: ItemId = winners[0];

      if (roundType === 'JACKPOT') {
        const jackpotItems = winners;
        const j = computeJackpotWin({ jackpotItems, bets: frozenBets, itemMultiplier, jackpotBonus: jackpotAmount });
        winAmount = j.totalWin;
        primaryId = jackpotItems[0];
      } else {
        const winner = winners[0];
        const betOnWinner = frozenBets[winner] ?? 0;
        winAmount = betOnWinner > 0 ? betOnWinner * itemMultiplier[winner] : 0;
        primaryId = winner;
      }

      /* Parallel: calculate win for the OTHER mode in the background */
      const otherBets = isAdvanceMode ? roundBetsBasicRef.current : roundBetsAdvanceRef.current;
      const otherTotalBet = Object.values(otherBets).reduce((sum, val) => sum + val, 0);
      let otherWin = 0;
      if (otherTotalBet > 0) {
        if (roundType === 'JACKPOT') {
          const j2 = computeJackpotWin({ jackpotItems: winners, bets: otherBets, itemMultiplier, jackpotBonus: jackpotAmount });
          otherWin = j2.totalWin;
        } else {
          const betOther = otherBets[winners[0]] ?? 0;
          otherWin = betOther > 0 ? betOther * itemMultiplier[winners[0]] : 0;
        }
      }
      otherModeWinRef.current = otherWin;
      console.log('[MODE] Parallel win calc:', isAdvanceMode ? 'ADV' : 'BASIC', '=', winAmount, ', other =', otherWin);

      setPendingWin({ itemId: primaryId, amount: winAmount, hadAnyBet, totalBet: frozenTotalBet });
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
      const otherWin = otherModeWinRef.current;
      const totalWin = winAmount + otherWin;
      const balanceBefore = balance;
      const balanceAfter = balanceBefore + totalWin;

      if (totalWin > 0) {
        setBalance(balanceAfter);
        setTodayWin((prev) => prev + totalWin);
      }
      otherModeWinRef.current = 0;

      if (winner) {
        /* Use snapshotted bets for record-keeping (mode may have switched) */
        const frozenBets = isAdvanceMode ? roundBetsAdvanceRef.current : roundBetsBasicRef.current;
        const placedBets = (Object.entries(frozenBets) as Array<[ItemId, number]>)
          .filter(([, amount]) => amount > 0)
          .sort((a, b) => b[1] - a[1]);

        // Record only rounds where the user actually placed at least one bet.
        if (placedBets.length > 0) {
          const selected = placedBets[0][0];
          const selectedAmount = placedBets[0][1];
          const winningBucket: 'VEGETABLES' | 'DRINKS' | null = roundType === 'JACKPOT'
            ? (VEG_ITEMS.includes(winner[0]) ? 'VEGETABLES' : 'DRINKS')
            : null;

          const record: GameRecord = {
            round: roundRef.current,
            at: formatRoundTime(new Date()),
            winner,
            selected,
            selectedAmount,
            selectedBets: placedBets.map(([itemId, amount]) => ({ itemId, amount })),
            winningBucket,
            win: winAmount,
            balanceBefore,
            balanceAfter,
          };

          setRecords((prev) => [record, ...prev].slice(0, 30));
        }

        roundRef.current += 1;
      }

      void refreshRoundStateFromServer();

      /* Persist new absolute balance to server, then fetch confirmed value */
      void updateBalanceOnServer(balanceAfter);

      /* Clear bets for BOTH modes so they don't carry to next round */
      setBets(buildEmptyBets());
      savedBetsBasicRef.current = buildEmptyBets() as BetsState;
      savedBetsAdvanceRef.current = buildEmptyBets() as BetsState;
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
    if (balance < selectedChip) {
      setActiveModal('RECHARGE');
      return;
    }

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

    /* Submit bet to API Ã¢â‚¬â€ only revert on client-side rejection (4xx), not server errors */
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
        /* 'server_error' and 'ok' Ã¢â‚¬â€ don't revert (server may have accepted but returned error) */
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
  const myRankRow = rankTab === 'TODAY' ? myRankToday : myRankYesterday;
  const myRankLabel =
    typeof playerPosition === 'number' && playerPosition > 0
      ? (playerPosition > 99 ? '99+' : String(playerPosition))
      : typeof myRankRow?.position === 'number' && myRankRow.position > 0
        ? (myRankRow.position > 99 ? '99+' : String(myRankRow.position))
        : '99+';
  const myRankName = (myRankRow?.name ?? myPlayerName) || 'You';
  const myRankDiamonds = myRankRow?.diamonds ?? 0;
  const myRankPic = myRankRow?.pic ?? myPlayerPic;
  const isRechargeModal = activeModal === 'RECHARGE';
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




        {/* Dynamic diamond balance bar ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â layered from individual assets */}
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

            {/* Diamond icon ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â overlapping left edge */}
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
              style={{ right: -3, top: 1, width: 26, height: 26, cursor: 'pointer' }}
              onClick={() => setActiveModal('RECHARGE')}
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
              {typeof playerPosition === 'number' && playerPosition > 0
                ? (playerPosition > 99 ? '99+' : String(playerPosition))
                : myRankLabel}
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
          // - DRAWING => always 1 item at a time (even for jackpot)
          // - SHOWTIME => winnerIds (1 for normal, 4 for jackpot)
          const focusIds: ItemId[] = (() => {
            if (isSpinning && activeDrawHighlightId) {
              return [activeDrawHighlightId];
            }
            if (isShow && winnerIds && winnerIds.length > 0) return winnerIds;
            return [];
          })();

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

        {/* Wooden signboard ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â always visible */}
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

        {/* Text overlay ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â always use local wordmark for consistent display */}
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

              {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Winner starburst sparkle effect ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
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
              opacity: 1,                 // ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ never fade
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
              opacity: 1,                 // ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ never fade
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

          {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Dynamic chests from API ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
          {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Dynamic chests from API (shake + flare when ready, clickable only when ready) ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
          {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Dynamic chests from API (shake + flare when ready, clickable only when ready) ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
          {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Dynamic chests from API (shake + flare when ready, clickable only when ready) ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
          {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Dynamic chests from API (shake + flare when ready, clickable only when ready) ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
          {boxData.map((box, idx) => {
            const totalBoxes = boxData.length;
            const boxWidth = 56;
            // Align chests exactly with the progress bar (left: 25, width: 343)
            const barLeft = 25;
            const barRight = 25 + 345; // 370 Ã¢â‚¬â€ aligned with chip container right edge
            const firstChestLeft = barLeft + 15; // 40
            const lastChestLeft = barRight - boxWidth; // 314 Ã¢â‚¬â€ last chest right edge at 370
            const spacing = totalBoxes > 1 ? (lastChestLeft - firstChestLeft) / (totalBoxes - 1) : 0;
            const xPos = firstChestLeft + idx * spacing;

            const threshold = box.threshold;
            const opened = !!openedChests[threshold];
            const ready = isChestReady(threshold);

            const normalizedThreshold = Math.round(threshold);
            const fallbackThreshold = DEFAULT_BOX_THRESHOLDS[Math.min(idx, DEFAULT_BOX_THRESHOLDS.length - 1)];
            const closedFallback =
              BOX_VALUE_TO_CHEST[normalizedThreshold]
              ?? BOX_VALUE_TO_CHEST[fallbackThreshold]
              ?? '/image2/chest_10k.png';
            const openFallback =
              CHEST_OPEN_SRC_BY_THRESHOLD[normalizedThreshold]
              ?? CHEST_OPEN_SRC_BY_THRESHOLD[fallbackThreshold]
              ?? closedFallback;
            const closedSrc = box.src || closedFallback;
            const openSrc = box.openSrc || openFallback;
            const chestSrc = opened ? openSrc : closedSrc;

            const flareSize = boxWidth + 30;

            return (
              <button
                key={`${threshold}-${idx}`}
                type="button"
                onClick={() => { void openChest(threshold); }}
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
                  onError={(e) => {
                    const img = e.currentTarget as HTMLImageElement;
                    const step = img.dataset.fallbackStep ?? '0';

                    if (step === '0') {
                      img.dataset.fallbackStep = '1';
                      img.src = opened ? openFallback : closedFallback;
                      return;
                    }

                    if (step === '1' && opened) {
                      img.dataset.fallbackStep = '2';
                      img.src = closedFallback;
                      return;
                    }
                  }}
                  animate={
                    ready
                      ? { x: [0, -2, 2, -2, 2, 0], rotate: [0, -2, 2, -2, 2, 0], scale: [1, 1.03, 1] }
                      : { x: 0, rotate: 0, scale: 1 }
                  }
                  transition={ready ? { duration: 0.55, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
                />

                {/* Label removed Ã¢â‚¬â€ using API labels only from progress bar markers */}
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

          {/* Scrollable result strip ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â newest at left */}
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
                    height: 'auto',        // ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ keeps ratio (no stretch)
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

              {/* ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ WIN PANEL ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Trophy animation */}
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
                /* ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ NO BET + LOSE PANEL */
                <div className="absolute" style={{ left: 26, top: 330, width: 350, height: 340, overflow: 'hidden' }}>
                  <img src="/image2/panel_scoreboard_blank.png" alt="" className="absolute inset-0 h-full w-full object-fill" />

                  {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Header: inside the rounded pill-shaped strip ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
                  <div className="absolute flex items-center" style={{ left: 30, top: 72, width: 290, height: 42 }}>
                    <div
                      className="shrink-0 flex items-center justify-center"
                      style={{ width: 44, height: 44 }}
                    >
                      <img
                        src={roundType === 'JACKPOT'
                          ? (winnerIds && winnerIds.length > 0 && VEG_ITEMS.includes(winnerIds[0]) ? '/image2/tab_vegetables.png' : '/image2/tab_drinks.png')
                          : (winnerItem ? winnerItem.src : '/image2/lemon.png')}
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

                  {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Leaderboard rows ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â inside body area below header strip ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
                  {rankRows.slice(0, 3).map((row, idx) => (
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
                          {formatK((row as any).amount ?? (row as any).diamonds ?? 0)}
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

              <motion.div
                className={`absolute left-1/2 -translate-x-1/2 ${isRechargeModal ? '' : 'top-1/2 -translate-y-1/2'}`}
                style={{
                  width: activeModal === 'RECHARGE' ? 352 : 326,
                  height: activeModal === 'RECHARGE' ? 260 : 430,
                  top: isRechargeModal ? 470 : undefined,
                }}
                initial={activeModal === 'RECHARGE' ? { y: 80, opacity: 0 } : { y: 0, opacity: 1 }}
                animate={{ y: 0, opacity: 1 }}
                exit={activeModal === 'RECHARGE' ? { y: 55, opacity: 0 } : { y: 0, opacity: 1 }}
                transition={
                  activeModal === 'RECHARGE'
                    ? { type: 'spring', stiffness: 360, damping: 28 }
                    : { duration: 0.18 }
                }
              >
                {activeModal === 'RULE' ? (
                  <div className="relative h-full w-full" style={{ overflow: 'visible' }}>

                    {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ rules_board.png as the outer frame ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
                    <img
                      src="/image2/rules_board.png"
                      alt=""
                      className="absolute inset-0 w-full h-full"
                      style={{ objectFit: 'fill', borderRadius: 18, zIndex: 0 }}
                    />

                    {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ "Rule" title ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â same gold style as jackpot board, NO red pill ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
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

                    {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Red Ãƒâ€” close button ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
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
                      <span style={{ color: '#fff', fontSize: 14, fontWeight: 900, lineHeight: 1 }}>&times;</span>
                    </button>

                    {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ #FFEBBB content mask ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â hides baked-in board text ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
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
                      {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Scrollable rules list ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
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

                    {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Outer board frame ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
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
                    {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ "Prize distribution" gold title ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
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

                    {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Red Ãƒâ€” close button ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
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
                      <span style={{ color: '#fff', fontSize: 14, fontWeight: 900, lineHeight: 1 }}>&times;</span>
                    </button>

                    {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ #FFEBBB content mask ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
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
                      {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Scrollable content ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
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

                        {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Prize table ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
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

                          {/* Table rows ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â pull from API or use defaults */}
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

                        {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Numbered rules below table ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
                        {(() => {
                          // If API has a title, show it (not needed per ref ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â ref has no sub-title)
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

                    {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ game_record_board.png as outer frame ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
                    <img
                      src="/image2/game_record_board.png"
                      alt=""
                      className="absolute inset-0 w-full h-full"
                      style={{ objectFit: 'fill', borderRadius: 18, zIndex: 0 }}
                    />

                    {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Red Ãƒâ€” close button ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
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
                      <span style={{ color: '#fff', fontSize: 14, fontWeight: 900, lineHeight: 1 }}>&times;</span>
                    </button>

                    {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ #FFEBBB content mask ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
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
                      {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Scrollable records list ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
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
                          type DisplayRecord = {
                            round?: number;
                            time?: string;
                            selectedOptions: Array<{ itemId: ItemId; amount: number }>;
                            winningItems: ItemId[];
                            winningBucket: 'VEGETABLES' | 'DRINKS' | null;
                            win: number;
                            balanceBefore: number | null;
                            balanceAfter: number | null;
                          };

                          const toItemId = (name?: string | null): ItemId | null => {
                            if (!name) return null;
                            const normalized = name.trim();
                            return API_NAME_TO_ID[normalized] ?? API_NAME_TO_ID[normalized.toLowerCase()] ?? null;
                          };

                          const bucketFromItem = (itemId: ItemId | null): 'VEGETABLES' | 'DRINKS' | null => {
                            if (!itemId) return null;
                            return VEG_ITEMS.includes(itemId) ? 'VEGETABLES' : 'DRINKS';
                          };

                          const localDisplayRecords: DisplayRecord[] = records
                            .map((record) => {
                              const selectedOptions = Array.isArray(record.selectedBets) && record.selectedBets.length > 0
                                ? record.selectedBets.filter((entry) => entry.amount > 0)
                                : (
                                  record.selected !== 'none' && record.selectedAmount > 0
                                    ? [{ itemId: record.selected, amount: record.selectedAmount }]
                                    : []
                                );

                              const bucket = record.winningBucket
                                ?? (record.winner.length > 1 ? bucketFromItem(record.winner[0]) : null);
                              const winningItems = bucket === 'VEGETABLES'
                                ? [...VEG_ITEMS]
                                : bucket === 'DRINKS'
                                  ? [...DRINK_ITEMS]
                                  : [...record.winner];

                              return {
                                round: record.round,
                                time: record.at,
                                selectedOptions,
                                winningItems,
                                winningBucket: bucket,
                                win: record.win,
                                balanceBefore: record.balanceBefore,
                                balanceAfter: record.balanceAfter,
                              };
                            })
                            .filter((record) => record.selectedOptions.length > 0);

                          const apiDisplayRecords: DisplayRecord[] = (() => {
                            if (apiPlayerRecords.length === 0) return [];

                            const groups = new Map<string, {
                              order: number;
                              round?: number;
                              time?: string;
                              selectedMap: Map<ItemId, number>;
                              winningSet: Set<ItemId>;
                              fallbackWinning: ItemId | null;
                              winningBucket: 'VEGETABLES' | 'DRINKS' | null;
                              win: number;
                              balanceBefore: number | null;
                              balanceAfter: number | null;
                            }>();

                            apiPlayerRecords.forEach((row, rowIdx) => {
                              const roundKey = row.round != null ? `r:${row.round}` : 'r:na';
                              const timeKey = row.time ? `t:${row.time}` : '';
                              const key = timeKey ? `${roundKey}|${timeKey}` : roundKey;
                              const existing = groups.get(key) ?? {
                                order: rowIdx,
                                round: row.round,
                                time: row.time,
                                selectedMap: new Map<ItemId, number>(),
                                winningSet: new Set<ItemId>(),
                                fallbackWinning: null,
                                winningBucket: null,
                                win: 0,
                                balanceBefore: null,
                                balanceAfter: null,
                              };

                              const itemId = toItemId(row.element ?? null);
                              const winningElementId =
                                toItemId(row.winningElementName ?? null)
                                ?? inferItemIdFromIconPath(row.winningElementIcon ?? null);
                              const parsedBet = Number(row.bet ?? 0);
                              const parsedWin = Number(row.win ?? 0);
                              const betAmount = Number.isFinite(parsedBet) ? parsedBet : 0;
                              const winAmount = Number.isFinite(parsedWin) ? parsedWin : 0;

                              const selectedBets = Array.isArray(row.selectedBets) ? row.selectedBets : [];
                              const winningItems = Array.isArray(row.winningItems) ? row.winningItems : [];
                              if (selectedBets.length > 0) {
                                selectedBets.forEach((entry) => {
                                  const selectedItemId =
                                    toItemId(entry.elementName)
                                    ?? inferItemIdFromIconPath(entry.elementIcon);
                                  const selectedAmount = Number(entry.bet ?? 0);
                                  if (selectedItemId && Number.isFinite(selectedAmount) && selectedAmount > 0) {
                                    existing.selectedMap.set(selectedItemId, (existing.selectedMap.get(selectedItemId) ?? 0) + selectedAmount);
                                  }
                                });
                              } else if (itemId && betAmount > 0) {
                                existing.selectedMap.set(itemId, (existing.selectedMap.get(itemId) ?? 0) + betAmount);
                              }

                              if (winningElementId) {
                                existing.winningSet.add(winningElementId);
                              } else if (winningItems.length > 0) {
                                winningItems.forEach((entry) => {
                                  const winningItemId =
                                    toItemId(entry.elementName)
                                    ?? inferItemIdFromIconPath(entry.elementIcon);
                                  if (winningItemId) existing.winningSet.add(winningItemId);
                                });
                              } else if (itemId && winAmount > 0) {
                                existing.winningSet.add(itemId);
                              }

                              if (!existing.fallbackWinning) {
                                const firstWinningItemId = winningItems.length > 0
                                  ? (toItemId(winningItems[0].elementName)
                                    ?? inferItemIdFromIconPath(winningItems[0].elementIcon))
                                  : null;
                                existing.fallbackWinning = winningElementId ?? firstWinningItemId ?? itemId ?? null;
                              }
                              existing.win += winAmount;

                              if (existing.balanceBefore == null) {
                                existing.balanceBefore =
                                  typeof row.balanceBefore === 'number' ? row.balanceBefore
                                    : typeof row.balance === 'number' ? row.balance
                                      : typeof row.totalBalance === 'number' ? row.totalBalance
                                        : null;
                              }

                              const afterCandidate =
                                typeof row.balanceAfter === 'number' ? row.balanceAfter
                                  : typeof row.currentBalance === 'number' ? row.currentBalance
                                    : null;
                              if (afterCandidate != null) {
                                existing.balanceAfter = afterCandidate;
                              }

                              const explicitBucket = row.winningBucket ?? null;
                              if (explicitBucket) {
                                existing.winningBucket = explicitBucket;
                              }

                              const jackpotFirstName = Array.isArray(row.jackpotElements) && row.jackpotElements.length > 0
                                ? row.jackpotElements[0]
                                : null;
                              const jackpotItemId = toItemId(jackpotFirstName);
                              const fallbackJackpotItemId =
                                (winningElementId ?? itemId) && (row.roundType?.toUpperCase() === 'JACKPOT' || !!row.jackpotName)
                                  ? (winningElementId ?? itemId)
                                  : null;
                              const jackpotBucket = bucketFromItem(jackpotItemId ?? fallbackJackpotItemId);
                              if (jackpotBucket) {
                                existing.winningBucket = jackpotBucket;
                              }

                              groups.set(key, existing);
                            });

                            return Array.from(groups.values())
                              .sort((a, b) => a.order - b.order)
                              .map((group) => {
                                const selectedOptions = Array.from(group.selectedMap.entries())
                                  .map(([itemId, amount]) => ({ itemId, amount }))
                                  .sort((a, b) => b.amount - a.amount);

                                const winningItems = group.winningBucket === 'VEGETABLES'
                                  ? [...VEG_ITEMS]
                                  : group.winningBucket === 'DRINKS'
                                    ? [...DRINK_ITEMS]
                                    : (
                                      group.winningSet.size > 0
                                        ? Array.from(group.winningSet)
                                        : (group.fallbackWinning ? [group.fallbackWinning] : [])
                                    );

                                return {
                                  round: group.round,
                                  time: group.time,
                                  selectedOptions,
                                  winningItems,
                                  winningBucket: group.winningBucket,
                                  win: group.win,
                                  balanceBefore: group.balanceBefore,
                                  balanceAfter: group.balanceAfter,
                                };
                              })
                              .filter((record) => record.selectedOptions.length > 0);
                          })();

                          const displayRecords = playerRecordsHydrated
                            ? apiDisplayRecords
                            : localDisplayRecords;

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

                          return displayRecords.map((record, idx) => {
                            const balBefore = record.balanceBefore;
                            const balAfter = record.balanceAfter;

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
                                {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Row 1: Round + Time ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                  <span style={{
                                    fontFamily: 'Inter, system-ui, sans-serif',
                                    fontWeight: 700, fontSize: 13, color: '#5a2d0c',
                                  }}>
                                    Round: {record.round ?? '-'}
                                  </span>
                                  {record.time && (
                                    <span style={{
                                      fontFamily: 'Inter, system-ui, sans-serif',
                                      fontWeight: 400, fontSize: 10.5, color: '#8a5a2a',
                                    }}>
                                      {record.time}
                                    </span>
                                  )}
                                </div>

                                {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Row 2: Selected option ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 6 }}>
                                  <span style={{
                                    fontFamily: 'Inter, system-ui, sans-serif',
                                    fontWeight: 500, fontSize: 12.5, color: '#7b471d', flexShrink: 0, marginTop: 2,
                                  }}>
                                    Selected option:
                                  </span>
                                  {record.selectedOptions.length > 0 ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                                      {record.selectedOptions.map((option) => {
                                        const itemSpec = ITEMS.find((item) => item.id === option.itemId);
                                        if (!itemSpec) return null;
                                        return (
                                          <div key={`${record.round}-${record.time}-${option.itemId}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                            <img src={itemSpec.src} alt="" style={{ width: 20, height: 20, objectFit: 'contain', flexShrink: 0 }} />
                                            <div style={{
                                              display: 'inline-flex', alignItems: 'center', gap: 3,
                                              background: 'linear-gradient(180deg, #7CFF6A 0%, #25C640 100%)',
                                              borderRadius: 999, paddingLeft: 7, paddingRight: 7, height: 19,
                                              border: '1px solid rgba(0,0,0,0.15)',
                                            }}>
                                              <span style={{ fontFamily: 'Inter', fontWeight: 800, fontSize: 11, color: '#0b2a12' }}>
                                                {formatNum(option.amount)}
                                              </span>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  ) : (
                                    <span style={{ fontFamily: 'Inter', fontSize: 12, color: '#7b471d' }}>-</span>
                                  )}
                                </div>

                                {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Row 3: Winning items ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 6 }}>
                                  <span style={{
                                    fontFamily: 'Inter, system-ui, sans-serif',
                                    fontWeight: 500, fontSize: 12.5, color: '#7b471d', flexShrink: 0, marginTop: 2,
                                  }}>
                                    Winning items:
                                  </span>
                                  {record.winningBucket ? (
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                      <img
                                        src={record.winningBucket === 'VEGETABLES' ? '/image2/tab_vegetables.png' : '/image2/tab_drinks.png'}
                                        alt=""
                                        style={{ width: 22, height: 22, objectFit: 'contain' }}
                                      />
                                      <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: 12, color: '#7b471d', fontWeight: 600 }}>
                                        {record.winningBucket === 'VEGETABLES' ? 'Vegetables Bucket' : 'Drinks Bucket'}
                                      </span>
                                    </div>
                                  ) : record.winningItems.length > 0 ? (
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                                      {record.winningItems.map((itemId) => {
                                        const itemSpec = ITEMS.find((item) => item.id === itemId);
                                        if (!itemSpec) return null;
                                        return (
                                          <img
                                            key={`${record.round}-${record.time}-win-${itemId}`}
                                            src={itemSpec.src}
                                            alt=""
                                            style={{ width: 20, height: 20, objectFit: 'contain' }}
                                          />
                                        );
                                      })}
                                    </div>
                                  ) : (
                                    <span style={{ fontFamily: 'Inter', fontSize: 12, color: '#7b471d' }}>-</span>
                                  )}
                                </div>

                                {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Row 4: Win diamonds ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
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
                                      {formatNum(record.win)}
                                    </span>
                                  </div>
                                </div>

                                {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Row 5: Diamond Balance ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
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

                      {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Footer note pinned at bottom ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
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
                    /* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Jackpot number formatter: pad to 11 digits with leading zeros ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */
                    const jackpotStr = String(jackpotAmount).padStart(11, '0');

                    return (
                      <div
                        className="relative flex items-center justify-center"
                        style={{ width: 326, height: 430 }}
                      >
                        {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ LAYER 1: Outer orange board background ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
                        {/* jackpot_board_bg: 339ÃƒÆ’Ã¢â‚¬â€535, #EC9813, borderRadius 17 */}
                        {/* We scale it to fit the 326ÃƒÆ’Ã¢â‚¬â€430 modal container */}
                        <img
                          src="/image2/jackpot_board_bg.png"
                          alt=""
                          className="absolute inset-0 w-full h-full"
                          style={{ objectFit: 'fill', borderRadius: 17, zIndex: 0 }}
                        />

                        {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ LAYER 2: Inner front panel ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
                        {/* jackpot_front_bg: 323ÃƒÆ’Ã¢â‚¬â€517, borderRadius 17 */}
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

                        {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ LAYER 3: Ribbon at top center ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
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

                        {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ LAYER 4: "Jackpot" text on the ribbon ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
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

                        {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ LAYER 5: Close button ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
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
                          <span style={{ color: '#fff', fontSize: 14, fontWeight: 900, lineHeight: 1 }}>&times;</span>
                        </button>

                        {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ LAYER 6: Purple diamonds pile ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
                        {/* diamonds.png: 273ÃƒÆ’Ã¢â‚¬â€131, centered below ribbon */}
                        <img
                          src="/image2/diamonds.png"
                          alt=""
                          className="absolute"
                          style={{
                            left: '50%',
                            transform: 'translateX(-50%)',
                            top: 42, /* Below ribbon ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â adjust if ribbon top changes */
                            width: 260,
                            height: 125,
                            objectFit: 'contain',
                            zIndex: 5,
                          }}
                        />

                        {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ LAYER 7: Red number frame ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
                        {/* jackpot_red_frame: 296ÃƒÆ’Ã¢â‚¬â€65 */}
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

                            {/* Padded jackpot number ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â leading zeros dimmer, significant digits bright */}
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

                        {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ LAYER 8: Description text ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
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

                        {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ LAYER 9: Awards section ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
                        <div
                          className="absolute"
                          style={{
                            left: 14,   /* contained inside board, was -14 */
                            right: 14,  /* contained inside board, was -14 */
                            top: 258,
                            zIndex: 5,
                          }}
                        >

                          {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ "Awards" label ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â sits ABOVE the prize board strip ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
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

                          {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Prize board strip ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â column headers ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
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

                          {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Awards rows ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
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

                        {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ LAYER 10: Footer note ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
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
                    {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ 1. Gameboard background (ribbon + "Game Rank" baked in) ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
                    <img
                      src="/image2/gameboard.png"
                      alt=""
                      className="absolute inset-0 w-full h-full"
                      style={{ objectFit: 'fill', borderRadius: 18, zIndex: 0 }}
                    />
                    {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Title: Game Rank ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
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

                    {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ 2. Close button ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ top: 60, right: -5 ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ move these independently */}
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
                      <span style={{ color: '#fff', fontSize: 14, fontWeight: 900, lineHeight: 1 }}>&times;</span>
                    </button>

                    {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ 3. Timer pill ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ left/top independent */}
                    <div
                      className="absolute flex items-center justify-center"
                      style={{
                        left: '50%',
                        transform: 'translateX(-50%)',
                        top: 102.5,          /* ÃƒÂ¢Ã¢â‚¬Â Ã‚Â change only this to move timer */
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

                          <span style={{ fontSize: 13 }}>&#8987;</span>
                          {`${String(Math.floor(dayResetSeconds / 3600)).padStart(2, '0')}:${String(Math.floor((dayResetSeconds % 3600) / 60)).padStart(2, '0')}:${String(dayResetSeconds % 60).padStart(2, '0')}`}

                        </>

                      )}
                    </div>

                    {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ 4. Today / Yesterday sliding tab ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ left/top independent */}
                    <div
                      className="absolute"
                      style={{
                        left: '50.8%',
                        transform: 'translateX(-50%)',
                        top: 124,         /* ÃƒÂ¢Ã¢â‚¬Â Ã‚Â change only this to move tab row */
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

                      {/* ? help button ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â outside the pill, right side */}
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

                    {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ 5. Column headers ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ left/top independent */}
                    <div
                      className="absolute flex items-center"
                      style={{
                        left: 25,
                        right: 40,
                        top: 164,         /* ÃƒÂ¢Ã¢â‚¬Â Ã‚Â change only this to move headers */
                        height: 28,
                        zIndex: 5,
                      }}
                    >
                      <span style={{ width: 64, textAlign: 'center', fontFamily: 'Inter, system-ui, sans-serif', fontWeight: 400, fontSize: 13, color: '#fff' }}>Rank</span>
                      <span style={{ flex: 1, textAlign: 'center', fontFamily: 'Inter, system-ui, sans-serif', fontWeight: 400, fontSize: 13, color: '#fff' }}>Name</span>
                      <span style={{ width: 100, textAlign: 'center', fontFamily: 'Inter, system-ui, sans-serif', fontWeight: 400, fontSize: 13, color: '#fff' }}>Diamonds Play</span>
                    </div>

                    {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ 6. Scrollable rank rows ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ left/top independent */}
                    <div
                      className="absolute overflow-y-auto overflow-x-hidden"
                      style={{
                        left: 30,
                        right: 30,
                        top: 198,         /* ÃƒÂ¢Ã¢â‚¬Â Ã‚Â change only this to move the rows area */
                        height: 310,      /* ÃƒÂ¢Ã¢â‚¬Â Ã‚Â change only this to adjust rows height */
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
                            <RankAvatar
                              src={row.pic}
                              size={32}
                              borderColor="rgba(255,255,255,0.75)"
                              className="absolute"
                              style={{ left: 58, top: '50%', transform: 'translateY(-50%)' }}
                            />

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
                                width: 126,            // Wider value area for large balances
                                gap: 4,
                                display: 'flex',
                                justifyContent: 'flex-start', // Keeps the diamond on the left of this box
                                overflow: 'hidden',
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
                                  minWidth: 0,
                                  textAlign: 'right',   // Aligns the text to the right
                                  fontFamily: 'Inter, system-ui, sans-serif',
                                  fontWeight: 400,
                                  fontSize: 13,
                                  color: '#5a2d0c',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}
                              >
                                {formatNum(row.diamonds)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ 7. 99+ sticky bottom row ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ left/top independent */}
                    <div
                      className="absolute"
                      style={{
                        left: '50%',
                        transform: 'translateX(-50%)',
                        top: 530,         /* ÃƒÂ¢Ã¢â‚¬Â Ã‚Â change only this to move the 99+ row */
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
                          {myRankLabel}
                        </span>
                        <RankAvatar
                          src={myRankPic}
                          size={34}
                          borderColor="rgba(255,255,255,0.5)"
                        />
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
                          {myRankName}
                        </span>

                        {/* Diamond Container - Aligned with the rows above */}
                        <div
                          className="flex items-center"
                          style={{
                            gap: 4,
                            flexShrink: 0,
                            width: 126,            // Matches the wider list-row value area
                            justifyContent: 'flex-start',
                            overflow: 'hidden',
                          }}
                        >
                          <img src="/image2/diamond.png" alt="" style={{ width: 18, height: 18, flexShrink: 0 }} />
                          <span style={{
                            flex: 1,
                            minWidth: 0,
                            textAlign: 'right',    // Pushes the "0" to the right edge
                            fontFamily: 'Inter, system-ui, sans-serif',
                            fontWeight: 400,
                            fontSize: 15,
                            color: '#7a3c08',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}>
                            {formatNum(myRankDiamonds)}
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
                ) : activeModal === 'RECHARGE' ? (
                  <div className="relative h-full w-full flex flex-col items-center justify-center">
                    {/* Background panel */}
                    <div
                      className="absolute inset-0"
                      style={{
                        borderRadius: 20,
                        border: '7px solid #f09c16',
                        background: 'linear-gradient(180deg, #fff3cc 0%, #ffdd9d 100%)',
                        boxShadow: '0 10px 24px rgba(0,0,0,0.32)',
                      }}
                    />

                    {/* Question text */}
                    <div
                      className="relative"
                      style={{
                        fontFamily: 'Inter, system-ui, sans-serif',
                        fontWeight: 700,
                        fontSize: 17,
                        color: '#5a2d0c',
                        textAlign: 'center',
                        padding: '0 18px',
                        marginBottom: 20,
                      }}
                    >
                      Are you want to Recharge now?
                    </div>

                    {/* Buttons row */}
                    <div className="relative flex items-center" style={{ gap: 14 }}>
                      {/* Recharge button */}
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await fetch(`${API_BASE}/game/recharge/panal`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ regisation: REGISATION_ID, payer_id: PLAYER_ID }),
                            });
                            console.log('[API] Recharge request sent for player:', PLAYER_ID);
                          } catch (err) {
                            console.warn('[API] Recharge failed:', err);
                          }
                          setActiveModal('NONE');
                        }}
                        style={{
                          width: 132,
                          height: 46,
                          borderRadius: 12,
                          background: 'linear-gradient(180deg, #7CFF6A 0%, #25C640 100%)',
                          border: '2px solid rgba(0,0,0,0.15)',
                          boxShadow: '0 4px 10px rgba(0,0,0,0.2)',
                          fontFamily: 'Inter, system-ui, sans-serif',
                          fontWeight: 800,
                          fontSize: 16,
                          color: '#fff',
                          textShadow: '0 1px 2px rgba(0,0,0,0.25)',
                          cursor: 'pointer',
                        }}
                      >
                        Recharge
                      </button>

                      {/* Cancel button */}
                      <button
                        type="button"
                        onClick={() => setActiveModal('NONE')}
                        style={{
                          width: 132,
                          height: 46,
                          borderRadius: 12,
                          background: 'linear-gradient(180deg, #FFD84A 0%, #F5A623 100%)',
                          border: '2px solid rgba(0,0,0,0.15)',
                          boxShadow: '0 4px 10px rgba(0,0,0,0.2)',
                          fontFamily: 'Inter, system-ui, sans-serif',
                          fontWeight: 800,
                          fontSize: 16,
                          color: '#fff',
                          textShadow: '0 1px 2px rgba(0,0,0,0.25)',
                          cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>

      </div>
    </ScaledArtboard>
  );
};

export default GamePage;

