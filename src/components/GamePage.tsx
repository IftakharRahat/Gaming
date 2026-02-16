import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';

const ARTBOARD_PRESET: '402x735' | '360x658' = '402x735';
const MAX_FRAME_WIDTH = 420;
const DEBUG = false;

const PRESET_SIZE = {
  '402x735': { width: 402, height: 735 },
  '360x658': { width: 360, height: 658 },
} as const;

type PresetKey = keyof typeof PRESET_SIZE;

type RingTile = {
  id: string;
  image: string;
  qty: string;
  dx: number;
  dy: number;
  rotate?: number;
};

type LayoutConfig = {
  safeTop: number;
  safeBottom: number;
  ringCenterX: number;
  ringCenterY: number;
  wheelSize: number;
  tileSize: number;
  tileInnerPadding: number;
  tileBadgeOffsetX: number;
  tileBadgeOffsetY: number;
  logoWidth: number;
  logoHeight: number;
  betOverlayOffsetY: number;
  betOverlayPxX: number;
  betOverlayPxY: number;
  bottomPanelHeight: number;
  bottomPanelRadius: number;
  bottomPanelLeft: number;
  bottomPanelTop: number;
  bottomPanelWidth: number;
  panelStripLeft: number;
  panelStripTop: number;
  panelStripWidth: number;
  panelStripHeight: number;
  tabsTop: number;
  tabWidth: number;
  tabHeight: number;
  vegTabLeft: number;
  drinkTabLeft: number;
  todayWinLeft: number;
  todayWinTop: number;
  todayWinWidth: number;
  todayWinHeight: number;
  chipsCardLeft: number;
  chipsCardTop: number;
  chipsCardWidth: number;
  chipsCardHeight: number;
  progressLeft: number;
  progressTop: number;
  progressWidth: number;
  progressHeight: number;
  chestRowLeft: number;
  chestRowTop: number;
  chestRowWidth: number;
  resultLeft: number;
  resultTop: number;
  resultWidth: number;
  resultHeight: number;
  trophyLeft: number;
  trophyTop: number;
  trophyWidth: number;
  trophyHeight: number;
  trophyRadius: number;
  jackpotLeft: number;
  jackpotTop: number;
  jackpotWidth: number;
  jackpotHeight: number;
};

const LAYOUTS: Record<PresetKey, LayoutConfig> = {
  '402x735': {
    safeTop: 16,
    safeBottom: 0,
    ringCenterX: 208,
    ringCenterY: 283,
    wheelSize: 408,
    tileSize: 90,
    tileInnerPadding: 6,
    tileBadgeOffsetX: 8,
    tileBadgeOffsetY: 6,
    logoWidth: 196,
    logoHeight: 196,
    betOverlayOffsetY: 44,
    betOverlayPxX: 24,
    betOverlayPxY: 5,
    bottomPanelHeight: 281,
    bottomPanelRadius: 32,
    bottomPanelLeft: 4,
    bottomPanelTop: 444,
    bottomPanelWidth: 394,
    panelStripLeft: -22,
    panelStripTop: 32.91,
    panelStripWidth: 439,
    panelStripHeight: 81.22,
    tabsTop: 29,
    tabWidth: 72,
    tabHeight: 48,
    vegTabLeft: 6,
    drinkTabLeft: 316,
    todayWinLeft: 77,
    todayWinTop: 41,
    todayWinWidth: 234,
    todayWinHeight: 26,
    chipsCardLeft: 25,
    chipsCardTop: 79,
    chipsCardWidth: 345,
    chipsCardHeight: 101,
    progressLeft: 29,
    progressTop: 189,
    progressWidth: 336,
    progressHeight: 16,
    chestRowLeft: 28,
    chestRowTop: 203,
    chestRowWidth: 338,
    resultLeft: 25,
    resultTop: 232,
    resultWidth: 345,
    resultHeight: 46,
    trophyLeft: 18,
    trophyTop: 53,
    trophyWidth: 51,
    trophyHeight: 50,
    trophyRadius: 19.5,
    jackpotLeft: 309,
    jackpotTop: 46,
    jackpotWidth: 77,
    jackpotHeight: 57,
  },
  '360x658': {
    safeTop: 14,
    safeBottom: -4,
    ringCenterX: 186,
    ringCenterY: 253,
    wheelSize: 365,
    tileSize: 81,
    tileInnerPadding: 5,
    tileBadgeOffsetX: 7,
    tileBadgeOffsetY: 5,
    logoWidth: 176,
    logoHeight: 176,
    betOverlayOffsetY: 60,
    betOverlayPxX: 22,
    betOverlayPxY: 5,
    bottomPanelHeight: 252,
    bottomPanelRadius: 29,
    bottomPanelLeft: 4,
    bottomPanelTop: 398,
    bottomPanelWidth: 353,
    panelStripLeft: -20,
    panelStripTop: 29,
    panelStripWidth: 393,
    panelStripHeight: 73,
    tabsTop: 26,
    tabWidth: 64,
    tabHeight: 43,
    vegTabLeft: 5,
    drinkTabLeft: 283,
    todayWinLeft: 69,
    todayWinTop: 37,
    todayWinWidth: 210,
    todayWinHeight: 23,
    chipsCardLeft: 22,
    chipsCardTop: 71,
    chipsCardWidth: 309,
    chipsCardHeight: 90,
    progressLeft: 26,
    progressTop: 169,
    progressWidth: 301,
    progressHeight: 14,
    chestRowLeft: 25,
    chestRowTop: 181,
    chestRowWidth: 303,
    resultLeft: 22,
    resultTop: 208,
    resultWidth: 309,
    resultHeight: 41,
    trophyLeft: 16,
    trophyTop: 47,
    trophyWidth: 46,
    trophyHeight: 45,
    trophyRadius: 17.5,
    jackpotLeft: 277,
    jackpotTop: 41,
    jackpotWidth: 69,
    jackpotHeight: 51,
  },
};

const RING_TILES: RingTile[] = [
  { id: 'jar', image: '/image2/honey_jar.png', qty: 'x45', dx: -141, dy: -161, rotate: -5 },
  { id: 'tomato', image: '/image2/tomato.png', qty: 'x5', dx: -46, dy: -184 },
  { id: 'lemon', image: '/image2/lemon.png', qty: 'x5', dx: 50, dy: -161 },
  { id: 'milk', image: '/image2/milk_carton.png', qty: 'x25', dx: -184, dy: -74 },
  { id: 'pumpkin', image: '/image2/pumpkin.png', qty: 'x5', dx: 94, dy: -74 },
  { id: 'cola', image: '/image2/cola_can.png', qty: 'x15', dx: -141, dy: 31, rotate: -10 },
  { id: 'water', image: '/image2/milk_carton.png', qty: 'x10', dx: -46, dy: 61 },
  { id: 'zucchini', image: '/image2/zucchini.png', qty: 'x5', dx: 50, dy: 31 },
];

const chips = [
  { value: 10, label: '10', image: '/image2/chip_10.png' },
  { value: 100, label: '100', image: '/image2/chip_100.png' },
  { value: 500, label: '500', image: '/image2/chip_500_orange.png' },
  { value: 1000, label: '1K', image: '/image2/chip_1k.png' },
  { value: 5000, label: '5K', image: '/image2/chip_5k.png' },
];

const chests = [
  { label: '10K', image: '/image2/chest_10k.png' },
  { label: '50K', image: '/image2/chest_50k.png' },
  { label: '100K', image: '/image2/chest_100k.png' },
  { label: '500K', image: '/image2/chest_500k.png' },
  { label: '1M', image: '/image2/chest_1m.png' },
];

const results = [
  '/image2/tomato.png',
  '/image2/cola_can.png',
  '/image2/honey_jar.png',
  '/image2/pumpkin.png',
  '/image2/pumpkin.png',
  '/image2/zucchini.png',
  '/image2/tomato.png',
  '/image2/pumpkin.png',
];

type BottomPanelMetrics = {
  todayWinHeight: number;
  todayWinPadLeft: number;
  todayWinPadRight: number;
  chipsInnerPadX: number;
  chipFrameSize: number;
  chipIconSize: number;
  progressTrackHeight: number;
  chestIconSize: number;
  chestLabelSize: number;
  chestLabelGap: number;
  resultRowHeight: number;
  resultRowRadius: number;
  resultIconSize: number;
  resultIconGap: number;
};

const BOTTOM_PANEL_METRICS: Record<PresetKey, BottomPanelMetrics> = {
  '402x735': {
    todayWinHeight: 24,
    todayWinPadLeft: 18,
    todayWinPadRight: 8,
    chipsInnerPadX: 5,
    chipFrameSize: 66,
    chipIconSize: 60,
    progressTrackHeight: 8,
    chestIconSize: 38,
    chestLabelSize: 12,
    chestLabelGap: 1,
    resultRowHeight: 38,
    resultRowRadius: 10,
    resultIconSize: 23,
    resultIconGap: 14,
  },
  '360x658': {
    todayWinHeight: 21,
    todayWinPadLeft: 15,
    todayWinPadRight: 7,
    chipsInnerPadX: 4,
    chipFrameSize: 60,
    chipIconSize: 54,
    progressTrackHeight: 7,
    chestIconSize: 34,
    chestLabelSize: 11,
    chestLabelGap: 1,
    resultRowHeight: 34,
    resultRowRadius: 9,
    resultIconSize: 20,
    resultIconGap: 12,
  },
};

const debugClass = (on: boolean) => (on ? 'outline outline-1 outline-fuchsia-500/55' : '');

const TileCard = ({
  image,
  qty,
  tileSize,
  inset,
  badgeOffsetX,
  badgeOffsetY,
  rotate,
}: {
  image: string;
  qty: string;
  tileSize: number;
  inset: number;
  badgeOffsetX: number;
  badgeOffsetY: number;
  rotate?: number;
}) => (
  <div className="relative" style={{ width: tileSize, height: tileSize }}>
    <img
      src={image}
      alt=""
      className="h-full w-full object-contain drop-shadow-[0_4px_3px_rgba(0,0,0,0.35)]"
      style={{ padding: inset, transform: `${rotate ? `rotate(${rotate}deg) ` : ''}scale(1.1)` }}
    />
    <span
      className="absolute rounded bg-black/42 px-2 text-[17px] font-black leading-none text-white"
      style={{ left: badgeOffsetX, bottom: badgeOffsetY }}
    >
      {qty}
    </span>
  </div>
);

const readFlags = () => {
  if (typeof window === 'undefined') {
    return {
      overlay: false,
      diff: false,
      grid: false,
      metrics: false,
      preset: ARTBOARD_PRESET as PresetKey,
    };
  }

  const params = new URLSearchParams(window.location.search);
  const presetParam = params.get('preset');
  const preset: PresetKey = presetParam === '360' ? '360x658' : ARTBOARD_PRESET;

  return {
    overlay: params.get('overlay') === '1',
    diff: params.get('diff') === '1',
    grid: params.get('grid') === '1',
    metrics: params.get('metrics') === '1',
    preset,
  };
};

type ScaledArtboardProps = {
  width: number;
  height: number;
  metricsMode: boolean;
  children: React.ReactNode;
};

const ScaledArtboard = ({ width, height, metricsMode, children }: ScaledArtboardProps) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const node = hostRef.current;
    if (!node) return;

    const update = () => {
      setViewport({ width: node.clientWidth, height: node.clientHeight });
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

    const availableWidth = Math.min(MAX_FRAME_WIDTH, Math.max(0, viewport.width - 16));
    const availableHeight = Math.max(0, viewport.height - 16);
    const s = Math.min(availableWidth / width, availableHeight / height);

    return {
      scale: s,
      scaledWidth: width * s,
      scaledHeight: height * s,
    };
  }, [viewport.width, viewport.height, width, height]);

  return (
    <div ref={hostRef} className="h-full w-full overflow-hidden bg-[#0f172a]">
      <div className="flex min-h-full w-full items-center justify-center py-2">
        <div style={{ width: scaledWidth, height: scaledHeight }} className="relative shrink-0">
          <div
            style={{
              width,
              height,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
            className={`absolute left-0 top-0 overflow-hidden rounded-[26px] border border-white/15 shadow-[0_25px_60px_rgba(0,0,0,0.45)] ${debugClass(DEBUG)}`}
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

const HeaderBar = ({
  activeTab,
  onTabChange,
  safeTop,
  artboardWidth,
  cfg,
}: {
  activeTab: 'basic' | 'advance';
  onTabChange: (value: 'basic' | 'advance') => void;
  safeTop: number;
  artboardWidth: number;
  cfg: LayoutConfig;
}) => {
  return (
    <div className={`absolute left-0 top-0 z-50 h-[132px] w-full ${debugClass(DEBUG)}`}>
      <div className="absolute flex h-9 items-center rounded-full border border-white/30 bg-[#5d8ec2]/90 pl-2 pr-1.5" style={{ left: 16, top: safeTop }}>
        <span className="relative mr-2 block h-4 w-4 rotate-45 rounded-[2px] bg-[#ffc92d] shadow-[0_0_8px_rgba(255,210,90,0.7)]" />
        <span className="text-[24px] font-bold leading-none text-white">129454</span>
        <button type="button" aria-label="Add currency" className="ml-2 flex h-6 w-6 items-center justify-center rounded-full bg-[#45b91e] text-[18px] font-black leading-none text-white">+</button>
      </div>

      <div
        className="absolute overflow-hidden"
        style={{
          left: cfg.trophyLeft,
          top: cfg.trophyTop,
          width: cfg.trophyWidth,
          height: cfg.trophyHeight,
          borderRadius: cfg.trophyRadius,
        }}
      >
        <img src="/image2/trophy.png" alt="Trophy" className="h-full w-full object-contain" />
        <span className="absolute -bottom-[1px] left-[5px] rounded bg-black/38 px-1 text-[12px] font-black leading-none text-white">99+</span>
      </div>

      <div className="absolute flex h-9 w-[178px] -translate-x-1/2 items-center rounded-full border border-[#dfab45] bg-[#6f98c6]/70 p-[3px]" style={{ left: artboardWidth / 2, top: safeTop + 50 }}>
        <button
          type="button"
          aria-label="Basic tab"
          onClick={() => onTabChange('basic')}
          className={`h-full flex-1 rounded-full text-[13px] font-bold leading-none ${activeTab === 'basic' ? 'bg-gradient-to-b from-[#ffea77] to-[#f4be23] text-[#7a4d16]' : 'text-white/85'}`}
        >
          Basic
        </button>
        <button
          type="button"
          aria-label="Advance tab"
          onClick={() => onTabChange('advance')}
          className={`h-full flex-1 rounded-full text-[13px] font-bold leading-none ${activeTab === 'advance' ? 'bg-gradient-to-b from-[#ffea77] to-[#f4be23] text-[#7a4d16]' : 'text-white/85'}`}
        >
          Advance
        </button>
      </div>

      <div className="absolute flex items-center gap-2" style={{ right: 16, top: safeTop }}>
        <button type="button" aria-label="Toggle music" className="h-9 w-9 rounded-full border border-white/25 bg-[#5f8abd]/80 text-[13px] font-black text-white">?</button>
        <button type="button" aria-label="Open clipboard" className="h-9 w-9 rounded-full border border-white/25 bg-[#5f8abd]/80 text-[12px] font-black text-white">?</button>
        <button type="button" aria-label="Open help" className="h-9 w-9 rounded-full border border-white/25 bg-[#5f8abd]/80 text-[14px] font-black text-white">?</button>
      </div>

      <img
        src="/image2/jackpot.png"
        alt="Jackpot 25127082"
        className="absolute object-contain"
        style={{
          left: cfg.jackpotLeft,
          top: cfg.jackpotTop,
          width: cfg.jackpotWidth,
          height: cfg.jackpotHeight,
        }}
      />
    </div>
  );
};

const GameRing = ({ timeLeft, cfg }: { timeLeft: number; cfg: LayoutConfig }) => {
  const wordmarkWidth = Math.round(cfg.logoWidth * 0.58);
  const wordmarkTop = Math.round(cfg.logoHeight * 0.36);
  const timerLabelSize = Math.round(cfg.logoHeight * 0.06);
  const timerValueSize = Math.round(cfg.logoHeight * 0.18);
  const timerBlockTop = Math.round(cfg.logoHeight * 0.72);

  return (
    <div className={`absolute inset-0 z-30 ${debugClass(DEBUG)}`}>
      <img
        src="/image2/ferris-wheel.png"
        alt="Wheel frame"
        className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 object-contain"
        style={{
          left: cfg.ringCenterX,
          top: cfg.ringCenterY,
          width: cfg.wheelSize,
          height: cfg.wheelSize,
          filter: 'drop-shadow(0 6px 0 #c88a1a) drop-shadow(0 12px 18px rgba(0,0,0,0.28))',
        }}
      />

      {RING_TILES.map((tile) => {
        const left = cfg.ringCenterX + tile.dx;
        const top = cfg.ringCenterY + tile.dy;

        return (
          <button key={tile.id} type="button" aria-label={`Select ${tile.id}`} className="absolute z-40" style={{ left, top }}>
            <TileCard
              image={tile.image}
              qty={tile.qty}
              tileSize={cfg.tileSize}
              inset={cfg.tileInnerPadding}
              badgeOffsetX={cfg.tileBadgeOffsetX}
              badgeOffsetY={cfg.tileBadgeOffsetY}
              rotate={tile.rotate}
            />
          </button>
        );
      })}

      <div className="absolute z-50 -translate-x-1/2 -translate-y-1/2" style={{ left: cfg.ringCenterX, top: cfg.ringCenterY }}>
        <div
          className="pointer-events-none relative"
          style={{ width: cfg.logoWidth, height: cfg.logoHeight }}
        >
          <img
            src="/image2/greedy_sign_board.png"
            alt="Greedy Market sign"
            className="h-full w-full object-contain drop-shadow-[0_8px_12px_rgba(0,0,0,0.34)]"
          />
          <img
            src="/image2/greedy_wordmark.png"
            alt=""
            aria-hidden="true"
            className="absolute left-1/2 -translate-x-1/2 object-contain"
            style={{ top: wordmarkTop, width: wordmarkWidth }}
          />
          <div className="absolute left-1/2 -translate-x-1/2 text-center" style={{ top: timerBlockTop }}>
            <div
              className="font-black leading-none text-white"
              style={{ fontSize: timerLabelSize, textShadow: '0 2px 0 rgba(82,45,20,0.85), 0 0 4px rgba(0,0,0,0.25)' }}
            >
              Bet Time
            </div>
          <motion.div
            className="font-black leading-none text-white"
            style={{ fontSize: timerValueSize, textShadow: '0 3px 0 rgba(71,40,18,0.9), 0 0 6px rgba(0,0,0,0.3)' }}
            animate={{ opacity: [1, 0.92, 1] }}
            transition={{ duration: 1.2, repeat: Infinity }}
          >
            {timeLeft}s
          </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
};

const BottomPanel = ({
  selectedChip,
  onSelectChip,
  cfg,
  preset,
  artboardWidth,
  artboardHeight,
}: {
  selectedChip: number;
  onSelectChip: (value: number) => void;
  cfg: LayoutConfig;
  preset: PresetKey;
  artboardWidth: number;
  artboardHeight: number;
}) => {
  const metrics = BOTTOM_PANEL_METRICS[preset];
  const panelContentLeft = cfg.bottomPanelLeft;
  const panelPaddingX = cfg.progressLeft;
  const innerWidth = artboardWidth - panelPaddingX * 2;
  const headerTopLift = Math.max(0, artboardHeight - cfg.bottomPanelHeight - cfg.bottomPanelTop);
  const tabsTop = cfg.todayWinTop + cfg.todayWinHeight / 2 - cfg.tabHeight / 2 - headerTopLift;
  const todayWinTop = cfg.todayWinTop + (cfg.todayWinHeight - metrics.todayWinHeight) / 2 - headerTopLift;
  const progressTop = cfg.progressTop + (cfg.progressHeight - metrics.progressTrackHeight) / 2;
  const resultTop = cfg.resultTop + (cfg.resultHeight - metrics.resultRowHeight) / 2;
  const chestRowTop = cfg.chestRowTop - 3;
  const panelHeight = Math.min(cfg.bottomPanelHeight, artboardHeight);

  return (
    <div
      className={`absolute z-[60] isolate overflow-hidden border-2 border-[#4fb9ff]/45 bg-[linear-gradient(180deg,#2da8ef_0%,#2097e3_44%,#127fce_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.28),inset_0_-12px_22px_rgba(8,73,132,0.34),inset_0_8px_16px_rgba(255,255,255,0.05),0_-5px_0_rgba(0,0,0,0.14)] ${debugClass(DEBUG)}`}
      style={{
        left: 0,
        top: 'auto',
        bottom: 0,
        width: artboardWidth,
        height: panelHeight,
        borderRadius: cfg.bottomPanelRadius,
      }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute z-0 overflow-hidden"
        style={{
          left: cfg.panelStripLeft + cfg.bottomPanelLeft,
          top: 0,
          width: cfg.panelStripWidth,
          height: cfg.panelStripHeight,
        }}
      >
        <img
          src="/image2/group24_curtain_top.png"
          alt=""
          className="h-full w-full object-fill"
        />
      </div>

      <button
        type="button"
        aria-label="Vegetables"
        className="absolute z-10"
        style={{ left: cfg.vegTabLeft + panelContentLeft, top: tabsTop, width: cfg.tabWidth, height: cfg.tabHeight }}
      >
        <img src="/image2/tab_vegetables.png" alt="" aria-hidden="true" className="h-full w-full object-contain" />
      </button>

      <button
        type="button"
        aria-label="Today win"
        className="absolute z-10 flex items-center justify-between rounded-full border-2 border-[#4ab8ff] bg-[#0f629e] shadow-[inset_0_1px_0_rgba(255,255,255,0.24),inset_0_-4px_8px_rgba(8,62,114,0.45)]"
        style={{
          left: cfg.todayWinLeft + panelContentLeft,
          top: todayWinTop,
          width: cfg.todayWinWidth,
          height: metrics.todayWinHeight,
          paddingLeft: metrics.todayWinPadLeft,
          paddingRight: metrics.todayWinPadRight,
        }}
      >
        <span className="text-[9px] font-black leading-none text-white">TODAY&apos;S WIN</span>
        <span className="text-[11px] font-black leading-none text-[#ffd53b]">0</span>
      </button>

      <button
        type="button"
        aria-label="Drinks"
        className="absolute z-10"
        style={{ left: cfg.drinkTabLeft + panelContentLeft, top: tabsTop, width: cfg.tabWidth, height: cfg.tabHeight }}
      >
        <img src="/image2/tab_drinks.png" alt="" aria-hidden="true" className="h-full w-full object-contain" />
      </button>

      <div
        className="absolute z-10 rounded-[20px] border-[4px] border-[#37b3ef] bg-[#0f74b6] shadow-[inset_0_2px_0_rgba(255,255,255,0.14),inset_0_-10px_18px_rgba(5,62,113,0.45)]"
        style={{
          left: cfg.chipsCardLeft + cfg.bottomPanelLeft,
          top: cfg.chipsCardTop,
          width: cfg.chipsCardWidth,
          height: cfg.chipsCardHeight,
        }}
      >
        <div className="flex h-full items-center justify-between" style={{ paddingLeft: metrics.chipsInnerPadX, paddingRight: metrics.chipsInnerPadX }}>
          {chips.map((chip) => (
            <motion.button
              key={chip.value}
              type="button"
              aria-label={`Select chip ${chip.label}`}
              whileTap={{ scale: 0.92 }}
              onClick={() => onSelectChip(chip.value)}
              className={`flex items-center justify-center transition ${selectedChip === chip.value ? 'scale-105 drop-shadow-[0_0_10px_rgba(255,255,255,0.65)]' : ''}`}
            >
              <img
                src={chip.image}
                alt={`Chip ${chip.label}`}
                className="object-contain drop-shadow-[0_4px_7px_rgba(0,0,0,0.3)]"
                style={{ width: metrics.chipIconSize, height: metrics.chipIconSize }}
              />
            </motion.button>
          ))}
        </div>
      </div>

      <div
        className="absolute z-10 rounded-full bg-[#0f5a91] shadow-[inset_0_2px_4px_rgba(0,0,0,0.38)]"
        style={{
          left: cfg.progressLeft,
          top: progressTop,
          width: cfg.progressWidth,
          height: metrics.progressTrackHeight,
        }}
      >
        <div className="h-full w-[53%] rounded-full bg-[linear-gradient(180deg,#84dced_0%,#70cee4_100%)]" />
      </div>

      <div
        className="absolute z-20 flex items-center justify-between"
        style={{ left: cfg.progressLeft, top: chestRowTop, width: cfg.progressWidth }}
      >
        {chests.map((chest) => (
          <button key={chest.label} type="button" aria-label={`Milestone ${chest.label}`} className="flex items-center justify-center">
            <img src={chest.image} alt={chest.label} className="object-contain" style={{ width: metrics.chestIconSize, height: metrics.chestIconSize }} />
          </button>
        ))}
      </div>

      <div
        className="absolute z-10 flex items-center border-2 border-[#4ab8ff]/55 bg-[#0f5f97] pl-4 pr-3"
        style={{
          left: panelPaddingX,
          top: resultTop,
          width: innerWidth,
          height: metrics.resultRowHeight,
          borderRadius: metrics.resultRowRadius,
        }}
      >
        <span className="border-r border-white/35 pr-3 text-[13px] font-black leading-none text-white">Result</span>
        <div className="ml-3 flex flex-1 items-center justify-start" style={{ gap: metrics.resultIconGap }}>
          {results.map((icon, idx) => (
            <img key={`${icon}-${idx}`} src={icon} alt="Result" className="object-contain" style={{ width: metrics.resultIconSize, height: metrics.resultIconSize }} />
          ))}
        </div>
      </div>
    </div>
  );
};

const GamePage = () => {
  const flags = useMemo(() => readFlags(), []);
  const artboard = PRESET_SIZE[flags.preset];
  const cfg = LAYOUTS[flags.preset];

  const [activeTab, setActiveTab] = useState<'basic' | 'advance'>('basic');
  const [selectedChip, setSelectedChip] = useState(0);
  const [timeLeft, setTimeLeft] = useState(22);
  const [overlayAlpha, setOverlayAlpha] = useState(flags.diff ? 0.5 : 0.35);

  useEffect(() => {
    const id = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!flags.diff) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'o') return;
      setOverlayAlpha((prev) => (prev > 0 ? 0 : 0.5));
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flags.diff]);

  return (
    <ScaledArtboard width={artboard.width} height={artboard.height} metricsMode={flags.metrics}>
      {/*
        Pixel Checklist:
        - Chosen preset: 402x735 (switch with ?preset=360 for 360x658)
        - SAFE_TOP / SAFE_BOTTOM: 16 / 0
        - Ring center: x=208, y=283
        - Bottom panel: x=4, y=444, w=394, h=281
        - Slot layer source: native slots in /image2/ferris-wheel.png (no synthetic overlay layer)
        - Scale formula: s = min(min(MAX_FRAME_WIDTH, viewportWidth - 16) / ARTBOARD_WIDTH, (viewportHeight - 16) / ARTBOARD_HEIGHT)
      */}
      <div className={`relative h-full w-full ${debugClass(DEBUG)}`}>
        <img src="/image2/iphone16pro_background.jpg" alt="City background" className="absolute inset-0 z-0 h-full w-full object-cover" />
        <div className="absolute inset-0 z-10 bg-[linear-gradient(180deg,rgba(139,192,255,0.45)_0%,rgba(127,183,242,0.18)_55%,rgba(17,136,214,0.5)_100%)]" />

        {flags.grid ? (
          <div
            className="pointer-events-none absolute inset-0 z-[120]"
            style={{
              backgroundImage:
                'linear-gradient(rgba(255,255,255,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.18) 1px, transparent 1px)',
              backgroundSize: '10px 10px',
            }}
          />
        ) : null}

        <div className="relative z-20 h-full w-full">
          <HeaderBar activeTab={activeTab} onTabChange={setActiveTab} safeTop={cfg.safeTop} artboardWidth={artboard.width} cfg={cfg} />
          <GameRing timeLeft={timeLeft} cfg={cfg} />
          <BottomPanel
            selectedChip={selectedChip}
            onSelectChip={setSelectedChip}
            cfg={cfg}
            preset={flags.preset}
            artboardWidth={artboard.width}
            artboardHeight={artboard.height}
          />
        </div>

        {flags.overlay ? (
          <img
            src="/image2/figma_ref.png"
            alt="Figma overlay"
            className="pointer-events-none absolute inset-0 z-[150] h-full w-full object-fill"
            style={{ opacity: overlayAlpha }}
          />
        ) : null}
      </div>
    </ScaledArtboard>
  );
};

export default GamePage;
