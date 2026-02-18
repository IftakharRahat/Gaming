import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';

const MAX_FRAME_WIDTH = 420;
const DEBUG = false;

const ARTBOARD = { width: 402, height: 735 } as const;

const BET_SECONDS = 20;
const DRAW_SECONDS = 4;
const SHOW_SECONDS = 3;

const GAME_ON_MS = 1200;
const ADVANCE_UNLOCK_BET = 500000;

const CHIP_VALUES = [10, 100, 500, 1000, 5000] as const;

type ItemId = 'honey' | 'tomato' | 'lemon' | 'milk' | 'pumpkin' | 'zucchini' | 'cola' | 'water';
type Phase = 'BETTING' | 'DRAWING' | 'SHOWTIME';
type Mode = 'BASIC' | 'ADVANCE';
type ModalType = 'NONE' | 'RULE' | 'RECORDS' | 'PRIZE' | 'RANK' | 'ADVANCED';
type RankTab = 'TODAY' | 'YESTERDAY';
type ResultKind = 'WIN' | 'LOSE' | 'NOBET';

const POINTER_BASE_POSITION = { left: 247, top: 115 } as const;
const POINTER_SIZE = { width: 125, height: 125} as const;
const POINTER_HOTSPOT = { x: 25, y: 35} as const;
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
  winner: ItemId;
  selected: ItemId | 'none';
  selectedAmount: number;
  win: number;
  balanceBefore: number;
  balanceAfter: number;
};

type ResultBoardRow = {
  name: string;
  amount: number;
};

type FloatingBetChip = {
  id: number;
  left: number;
  top: number;
  src: string;
};

type FireworkParticle = {
  id: string;
  originLeft: number;
  originTop: number;
  x: number;
  y: number;
  size: number;
  delay: number;
  color: string;
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

const buildFireworkParticles = (): FireworkParticle[] => {
  const burstAnchors = [
    { left: 98, top: 210 },
    { left: 206, top: 250 },
    { left: 315, top: 218 },
  ];
  const palette = ['#ffffff', '#ffeeb2', '#fff5df', '#ffd8ff', '#d9f7ff'];
  const particles: FireworkParticle[] = [];

  burstAnchors.forEach((anchor, burstIdx) => {
    const count = 12 + Math.floor(Math.random() * 9);
    for (let i = 0; i < count; i += 1) {
      const theta = Math.random() * Math.PI * 2;
      const distance = 34 + Math.random() * 62;
      particles.push({
        id: `burst-${burstIdx}-${i}-${Math.round(Math.random() * 100000)}`,
        originLeft: anchor.left + (Math.random() * 10 - 5),
        originTop: anchor.top + (Math.random() * 10 - 5),
        x: Math.cos(theta) * distance,
        y: Math.sin(theta) * distance,
        size: 3 + Math.random() * 6,
        delay: i * 0.015 + Math.random() * 0.09,
        color: palette[Math.floor(Math.random() * palette.length)],
      });
    }
  });

  return particles;
};

type FireworksOverlayProps = {
  seed: number;
};

const FireworksOverlay = ({ seed }: FireworksOverlayProps) => {
  const particles = useMemo(() => buildFireworkParticles(), [seed]);

  return (
    <motion.div
      className="pointer-events-none absolute inset-0 z-[560]"
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
    >
      {particles.map((particle) => (
        <motion.span
          key={particle.id}
          className="absolute rounded-full"
          style={{
            left: particle.originLeft,
            top: particle.originTop,
            width: particle.size,
            height: particle.size,
            background: particle.color,
            boxShadow: `0 0 9px ${particle.color}`,
          }}
          initial={{ opacity: 1, scale: 0, x: 0, y: 0 }}
          animate={{
            opacity: [1, 0.92, 0],
            scale: [0, 1.4, 0],
            x: [0, particle.x],
            y: [0, particle.y],
          }}
          transition={{ duration: 0.9, ease: 'easeOut', delay: particle.delay }}
        />
      ))}
    </motion.div>
  );
};

const ScaledArtboard = ({ width, height, metricsMode, children }: ScaledArtboardProps) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const node = hostRef.current;
    if (!node) return;

    const update = () => setViewport({ width: node.clientWidth, height: node.clientHeight });

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

    return { scale: s, scaledWidth: width * s, scaledHeight: height * s };
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
            className={`absolute left-0 top-0 overflow-hidden rounded-[26px] border border-white/15 shadow-[0_25px_60px_rgba(0,0,0,0.45)] ${debugClass(
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

const ITEM_MULTIPLIER: Record<ItemId, number> = {
  honey: 45,
  milk: 25,
  cola: 15,
  water: 10,
  tomato: 5,
  lemon: 5,
  pumpkin: 5,
  zucchini: 5,
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
  { src: '/image2/chip_10.png', left: 29 + 17, top: 523 + 24, width: 54, height: 54 },
  { src: '/image2/chip_100.png', left: 29 + 81, top: 523 + 26, width: 55, height: 53, shadow: true },
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

const RANK_ROWS_TODAY = [
  { name: 'Faruk', diamonds: 30000 },
  { name: 'Roy', diamonds: 10000 },
  { name: 'Ad Girl', diamonds: 7500 },
  { name: 'Apu', diamonds: 5200 },
  { name: 'Samee', diamonds: 5100 },
  { name: 'Kha', diamonds: 4500 },
  { name: 'Rambo', diamonds: 4300 },
];

const RANK_ROWS_YESTERDAY = [
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
        width: size * 2.75,
        height: size * 2.75,
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

  const [mode, setMode] = useState<Mode>('BASIC');
  const isAdvanceMode = mode === 'ADVANCE';
  const [phase, setPhase] = useState<Phase>('BETTING');
  const [timeLeft, setTimeLeft] = useState(BET_SECONDS);

  const [selectedChip, setSelectedChip] = useState<(typeof CHIP_VALUES)[number]>(100);

  const [balance, setBalance] = useState(129454);
  const [todayWin, setTodayWin] = useState(0);
  const [lifetimeBet, setLifetimeBet] = useState(21380);

  const [bets, setBets] = useState<BetsState>(buildEmptyBets());
  const [pendingWin, setPendingWin] = useState<PendingWin | null>(null);

  const [resultSrcs, setResultSrcs] = useState<string[]>(INITIAL_RESULT_SRCS);
  const [resultKind, setResultKind] = useState<ResultKind>('LOSE');

  const [showGameOn, setShowGameOn] = useState(true);

  const [showResultBoard, setShowResultBoard] = useState(false);

  const [winnerId, setWinnerId] = useState<ItemId | null>(null);
  const winnerRef = useRef<ItemId | null>(null);

  const [activeModal, setActiveModal] = useState<ModalType>('NONE');
  const [rankTab, setRankTab] = useState<RankTab>('TODAY');
  const [musicOn, setMusicOn] = useState(true);

  const [records, setRecords] = useState<GameRecord[]>([]);
  const roundRef = useRef(74612);

  const [itemPulse, setItemPulse] = useState<{ id: ItemId | null; key: number }>({ id: null, key: 0 });
  const [floatingBetChips, setFloatingBetChips] = useState<FloatingBetChip[]>([]);
  const [pointerStopIndex, setPointerStopIndex] = useState(0);
  const [drawHighlightIndex, setDrawHighlightIndex] = useState(0);
  const [showFireworks, setShowFireworks] = useState(false);
  const [fireworksSeed, setFireworksSeed] = useState(0);


  const floatingChipIdRef = useRef(0);
  const floatingChipTimeoutsRef = useRef<number[]>([]);

  const totalBet = useMemo(() => Object.values(bets).reduce((sum, val) => sum + val, 0), [bets]);
  const progressRatio = Math.max(0, Math.min(1, todayWin / 1000000));
  
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
    return CHIP_VALUES.reduce(
      (acc, value, idx) => {
        acc[value] = CHIPS[idx].src;
        return acc;
      },
      {} as Record<(typeof CHIP_VALUES)[number], string>
    );
  }, []);

  const hasBlockingOverlay = activeModal !== 'NONE' || showGameOn || showResultBoard;
  const canBet = phase === 'BETTING' && !hasBlockingOverlay;
  const canOpenSystemModal = phase === 'BETTING' && !showGameOn;

  useEffect(() => {
    if (!showGameOn) return;
    const id = window.setTimeout(() => setShowGameOn(false), GAME_ON_MS);
    return () => window.clearTimeout(id);
  }, [showGameOn]);

  useEffect(() => {
  if (activeModal !== 'NONE' || showGameOn) return;

  const id = window.setInterval(() => {
    setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
  }, 1000);

  return () => window.clearInterval(id);
}, [activeModal, showGameOn]);


  useEffect(() => {
    if (!canBet || pointerStops.length === 0) return;

    setPointerStopIndex(0);
    const id = window.setInterval(() => {
      setPointerStopIndex((prev) => (prev + 1) % pointerStops.length);
    }, 1000);

    return () => window.clearInterval(id);
  }, [canBet, pointerStops.length]);

  useEffect(() => {
    if (phase !== 'DRAWING') return;

    setDrawHighlightIndex(0);
    const id = window.setInterval(() => {
      setDrawHighlightIndex((prev) => (prev + 1) % DRAW_HIGHLIGHT_ORDER.length);
    }, 300);

    return () => window.clearInterval(id);
  }, [phase]);

  useEffect(
  () => () => {
    floatingChipTimeoutsRef.current.forEach((id) => window.clearTimeout(id));
    floatingChipTimeoutsRef.current = [];
  },
  []
);


  useEffect(() => {
    if (activeModal !== 'NONE' || showGameOn) return;
    if (timeLeft > 0) return;

    if (phase === 'BETTING') {
      const picked = ITEMS[Math.floor(Math.random() * ITEMS.length)].id;
      winnerRef.current = picked;
      setWinnerId(picked);
      setShowFireworks(false);
      setPhase('DRAWING');
      setTimeLeft(DRAW_SECONDS);
      return;
    }

    if (phase === 'DRAWING') {
      const winner = winnerRef.current;
      if (!winner) return;

      const betOnWinner = bets[winner] ?? 0;
      const winAmount = betOnWinner > 0 ? betOnWinner * ITEM_MULTIPLIER[winner] : 0;
      const hadAnyBet = totalBet > 0;

      setPendingWin({ itemId: winner, amount: winAmount, hadAnyBet, totalBet });
      setResultKind(!hadAnyBet ? 'NOBET' : winAmount > 0 ? 'WIN' : 'LOSE');

      setResultSrcs((prev) => {
        const next = prev.slice(1);
        next.push(itemMap[winner].src);
        return next;
      });

      setPhase('SHOWTIME');
      setTimeLeft(SHOW_SECONDS);
      setShowFireworks(true);
      setFireworksSeed((prev) => prev + 1);

      setShowResultBoard(true);

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

      setBets(buildEmptyBets());
      setPendingWin(null);
      setWinnerId(null);
      winnerRef.current = null;

      setShowResultBoard(false);
      
      setShowFireworks(false);

      setPhase('BETTING');
      setTimeLeft(BET_SECONDS);
      setShowGameOn(true);
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

    setBalance((prev) => prev - selectedChip);
    setLifetimeBet((prev) => prev + selectedChip);

    setBets((prev) => ({
      ...prev,
      [itemId]: prev[itemId] + selectedChip,
    }));

    setItemPulse((prev) => ({ id: itemId, key: prev.key + 1 }));

    if (phase === 'BETTING' && timeLeft <= 10) {
      const chipSrc = chipSrcByValue[selectedChip];
      const item = itemMap[itemId];
      if (chipSrc && item) {
        const chipId = floatingChipIdRef.current + 1;
        floatingChipIdRef.current = chipId;

        const chipLeft = item.left + item.width * 0.5 - 18;
        const chipTop = item.top + item.height * 0.78;
        setFloatingBetChips((prev) => [...prev, { id: chipId, left: chipLeft, top: chipTop, src: chipSrc }]);

        const removeId = window.setTimeout(() => {
          setFloatingBetChips((prev) => prev.filter((entry) => entry.id !== chipId));
          floatingChipTimeoutsRef.current = floatingChipTimeoutsRef.current.filter((id) => id !== removeId);
        }, 700);
        floatingChipTimeoutsRef.current.push(removeId);
      }
    }
  };

  const handleAdvanceClick = () => {
  // Always show popup first (as you requested)
  setActiveModal('ADVANCED');
};


  const remainingForAdvance = Math.max(0, ADVANCE_UNLOCK_BET - lifetimeBet);
  const timerUrgent = phase === 'BETTING' && timeLeft <= 5;
  const winnerItem = pendingWin ? itemMap[pendingWin.itemId] : null;
  const rankRows = rankTab === 'TODAY' ? RANK_ROWS_TODAY : RANK_ROWS_YESTERDAY;
  const winAmountLabel = pendingWin ? formatNum(pendingWin.amount) : '0';
  const winAmountFontSize = winAmountLabel.length >= 8 ? 18 : winAmountLabel.length >= 6 ? 21 : 24;
  const activePointerStop = pointerStops[pointerStopIndex] ?? POINTER_BASE_POSITION;
  const activeDrawHighlightId = phase === 'DRAWING' ? DRAW_HIGHLIGHT_ORDER[drawHighlightIndex] : null;

  return (
    <ScaledArtboard width={ARTBOARD.width} height={ARTBOARD.height} metricsMode={flags.metrics}>
      <div className={`relative h-full w-full ${debugClass(DEBUG)}`} style={{ background: '#8DA6DE' }}>
        <img
  src={isAdvanceMode ? '/image2/advance_bg.png' : '/image2/city_background.png'}
  alt=""
  className="absolute z-0 object-cover"
  style={{ left: 0, top: 0, width: 477, height: 735, mixBlendMode: 'overlay', opacity: 1 }}
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
          style={{ left: -27, top: 5, width: 149, height: 149 }}
          animate={{ opacity: [0.42, 0.9, 0.42], scale: [0.95, 1.05, 0.95] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
        />

        <motion.img
          src="/image2/flare.png"
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute z-10 object-contain"
          style={{ left: 276, top: 5, width: 149, height: 149 }}
          animate={{ opacity: [0.42, 0.95, 0.42], scale: [0.95, 1.05, 0.95] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut', delay: 0.18 }}
        />

        <div
          className="absolute z-30"
          style={{ left: 14, top: 11, width: 371.7438659667969, height: 34.34597396850586 }}
        >
          <img src="/image2/Group_23.png" alt="" className="h-full w-full object-contain" />
        </div>

        {/* Top action icon hitboxes (icons are baked into Group_23.png) */}
        <div className="absolute z-50" style={{ left: 258, top: 9, width: 124, height: 33 }}>
          {[
            {
              key: 'music',
              onClick: () => {
                if (!canOpenSystemModal) return;
                setMusicOn((prev) => !prev);
              },
            },
            {
              key: 'records',
              onClick: () => {
                if (!canOpenSystemModal) return;
                setActiveModal('RECORDS');
              },
            },
            {
              key: 'rules',
              onClick: () => {
                if (!canOpenSystemModal) return;
                setActiveModal('RULE');
              },
            },
            {
              key: 'close',
              onClick: () => setActiveModal('NONE'),
            },
          ].map((iconBtn, idx) => (
            <button
              key={iconBtn.key}
              type="button"
              onClick={iconBtn.onClick}
              className="absolute rounded-full"
              style={{
                left: idx * 31,
                top: 0,
                width: 30,
                height: 30,
                background: iconBtn.key === 'music' && !musicOn ? 'rgba(0,0,0,0.22)' : 'transparent',
                border: 'none',
                cursor: canOpenSystemModal || iconBtn.key === 'close' ? 'pointer' : 'default',
                pointerEvents: canOpenSystemModal || iconBtn.key === 'close' ? 'auto' : 'none',
              }}
              aria-label={iconBtn.key}
            />
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
          <img src="/image2/trophy.png" alt="" className="h-full w-full object-contain" />
        </button>

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
          className="absolute z-40 object-contain"
          style={{ left: 309, top: 46, width: 77, height: 57 }}
        >
          <motion.img
            src="/image2/jackpot.png"
            alt=""
            className="h-full w-full object-contain"
            animate={{ y: [0, -2.2, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          />
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

        <motion.img
          src="/image2/ferris-wheel.png"
          alt=""
          className="pointer-events-none absolute z-20 object-contain"
          style={{ left: 6, top: 101, width: 391, height: 391 }}
          animate={{ rotate: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        />

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
          const isShowWinner = phase === 'SHOWTIME' && winnerId === it.id;
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
                  ? { opacity: isDrawingActive ? 1 : 0.72, scale: isDrawingActive ? 1.04 : 1 }
                  : phase === 'SHOWTIME'
                  ? { opacity: 0.82 }
                  : justPulsed
                  ? { scale: [1, 1.12, 1] }
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
                        ? 'brightness(1) saturate(1)'
                        : 'brightness(0.62) saturate(0.55)'
                      : phase === 'SHOWTIME'
                      ? isShowWinner
                        ? 'brightness(0.98) saturate(0.98)'
                        : 'brightness(0.8) saturate(0.72)'
                      : undefined,
                }}
              />

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
                {it.badge.text}
              </motion.div>

              {betAmt > 0 && it.betLabel ? (
                <div
                  className="pointer-events-none absolute z-40 flex items-center rounded-full"
                  style={{
                    left: Number(it.betLabel.left) - Number(it.left),
                    top: Number(it.betLabel.top) - Number(it.top),
                    height: 16,
                    paddingLeft: 5,
                    paddingRight: 6,
                    gap: 2,
                    background: 'linear-gradient(180deg, #7CFF6A 0%, #25C640 100%)',
                    border: '1px solid rgba(0,0,0,0.25)',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
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
              style={{ left: chip.left, top: chip.top, width: 36, height: 36 }}
              initial={{ opacity: 0, scale: 0.78, y: 12 }}
              animate={{ opacity: [0, 1, 0], scale: [0.78, 1.02, 0.92], y: [12, -8, -32] }}
              exit={{ opacity: 0, scale: 0.9, y: -36 }}
              transition={{ duration: 0.62, ease: 'easeOut' }}
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
  <img
    src="/image2/tab_vegetables.png"
    alt=""
    className="absolute z-10 object-contain"
    style={{ left: 0, top: 0, width: 75, height: 72 }}
  />

  <img
    src="/image2/tab_drinks.png"
    alt=""
    className="absolute z-10 object-contain"
    style={{ left: 315, top: 1, width: 79, height: 68 }}
  />

          <div
  className="absolute z-20"
  style={{
    left: 77,
    top: 41,
    width: 234,
    height: 26,
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
                top: 6,
                height: 16,
                fontFamily: 'Inter, system-ui, sans-serif',
                fontWeight: 700,
                fontSize: 12,
                lineHeight: '15.34px',
                letterSpacing: '-0.02em',
                color: '#FFFFFF',
              }}
            >
              TODAY&apos;S WIN
            </div>

            <div
              className="absolute z-10 flex items-center justify-center"
              style={{
                right: 12,
                top: 4,
                fontFamily: 'Inria Serif, serif',
                fontWeight: 700,
                fontSize: 14.24,
                lineHeight: '15.34px',
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

          {CHIPS.map((c, idx) => {
            const value = CHIP_VALUES[idx] ?? 0;
            const active = value === selectedChip;

            return (
              <motion.button
                key={c.src}
                type="button"
                onClick={() => {
                  if (!canBet) return;
                  setSelectedChip(value);
                }}
                className="absolute z-20 border-none bg-transparent p-0"
                style={{
                  left: c.left - 4,
                  top: c.top - 444,
                  width: c.width,
                  height: c.height,
                  cursor: canBet ? 'pointer' : 'default',
                  filter: active
                    ? 'drop-shadow(0px 0px 16px rgba(255,255,255,0.65))'
                    : c.shadow
                    ? 'drop-shadow(0px 0px 12px rgba(0,0,0,0.55))'
                    : undefined,
                  borderRadius: 999,
                  pointerEvents: canBet ? 'auto' : 'none',
                }}
                animate={{ scale: active ? 1.08 : 1 }}
                transition={{ type: 'spring', stiffness: 360, damping: 26 }}
                whileTap={canBet ? { scale: 0.94 } : undefined}
              >
                <img src={c.src} alt="" className="h-full w-full object-contain" />
              </motion.button>
            );
          })}

          <div
            className="absolute z-10 overflow-hidden"
          style={{
  left: 25,
  top: 195,
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

          {CHESTS.map((c, idx) => (
            <img key={idx} src={c.src} alt="" className="absolute z-20 object-contain" style={{ left: c.left - 4, top: c.top - 444, width: c.width, height: c.height }} />
          ))}

          <div
  className="absolute z-10"
  style={{
    left: 27,
    top: 236,
    width: 343,
    height: 45,
    borderRadius: 12,
    background: isAdvanceMode ? '#D95B48' : '#0F6095',
    border: isAdvanceMode ? '2px solid #E92407' : '2px solid #1087C6',
    boxShadow: isAdvanceMode ? '0px 1px 0px 0px #A87C75' : '0px 1px 0px #4ABAF9',
  }}
/>


          <div className="absolute z-20 flex items-center" style={{ left: 40, top: 250, width: 43, height: 16, fontFamily: 'Inter, system-ui, sans-serif', fontWeight: 700, fontSize: 14.24, lineHeight: '15.34px', letterSpacing: '-0.02em', color: '#FFFFFF' }}>
            Result
          </div>

          <div className="absolute z-20" style={{ left: 92.5, top: 246, width: 0, height: 24, borderLeft: '1px solid', borderImageSource: isAdvanceMode
  ? 'linear-gradient(180deg, #D95B48 -6.25%, #FFFFFF 50%, #D95B48 106.25%)'
  : 'linear-gradient(180deg, #0F6095 -6.25%, #FFFFFF 50%, #0F6095 106.25%)',
 borderImageSlice: 1 }} />

          {RESULT_POSITIONS.map((pos, idx) => {
            const src = resultSrcs[idx] ?? INITIAL_RESULT_SRCS[idx];
            return (
              <img key={`${src}-${idx}`} src={src} alt="" className="absolute z-20 object-contain" style={{ left: pos.left - 4, top: pos.top - 444, width: pos.width, height: pos.height, transform: pos.rotate ? `rotate(${pos.rotate}deg)` : undefined, transformOrigin: 'center' }} />
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
  {showResultBoard && pendingWin ? (
    <motion.div
      className="absolute inset-0 z-[520]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.34)', backdropFilter: 'blur(2px)' }} />

      {/* ✅ WIN PANEL (match screenshot) */}
      {resultKind === 'WIN' && winnerItem ? (
        <div className="absolute" style={{ left: -6, top: 277, width: 414, height: 414 }}>
          <img src="/image2/panel_you_win.png" alt="" className="absolute inset-0 h-full w-full object-fill" />

          {/* winner row like your WIN screenshot */}
          <div className="absolute" style={{ left: 40, top: 166, width: 334, height: 40, overflow: 'hidden' }}>
            <div className="absolute flex items-center" style={{ left: 0, top: 0, height: 40, gap: 10 }}>
              <img src={winnerItem.src} alt="" className="h-[34px] w-[34px] object-contain" />
              <div
                style={{
                  color: '#fff',
                  fontFamily: 'Inter, system-ui, sans-serif',
                  fontWeight: 800,
                  fontSize: 20,
                  lineHeight: '20px',
                  textTransform: 'lowercase',
                }}
              >
                {winnerItem.id}
              </div>
            </div>

            <div
              className="absolute flex items-center justify-end"
              style={{
                right: 0,
                top: 0,
                height: 40,
                gap: 8,
                color: '#ffe56a',
                fontFamily: 'Inria Serif, serif',
                fontSize: 30,
                fontWeight: 800,
                textShadow: '0 2px 0 rgba(0,0,0,0.35)',
                whiteSpace: 'nowrap',
              }}
            >
              <BlumondIcon size={22} />
              <span>{winAmountLabel}</span>
            </div>
          </div>

          {/* leaderboard rows (same as your existing win panel) */}
          {rankRows.slice(0, 3).map((row, idx) => (
            <div
              key={`${row.name}-${idx}`}
              className="absolute"
              style={{ left: 56, top: 238 + idx * 52, width: 300, height: 44, overflow: 'hidden' }}
            >
              <div className="absolute" style={{ left: 0, top: 8, width: 28, height: 28 }}>
                <PodiumBadge index={idx} size={28} />
              </div>

              <div
                style={{
                  position: 'absolute',
                  left: 40,
                  top: 12,
                  width: 160,
                  color: '#fff',
                  fontFamily: 'Inter, system-ui, sans-serif',
                  fontWeight: 700,
                  fontSize: 20,
                  lineHeight: '20px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {row.name}
              </div>

              <div
                className="absolute flex items-center justify-end"
                style={{
                  right: 0,
                  top: 12,
                  width: 110,
                  gap: 6,
                  color: '#ffe9ff',
                  fontFamily: 'Inter, system-ui, sans-serif',
                  fontWeight: 800,
                  fontSize: 20,
                  lineHeight: '20px',
                  textShadow: '0 1px 0 rgba(0,0,0,0.35)',
                }}
              >
                <BlumondIcon size={16} />
                {formatK(row.diamonds)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ✅ NO BET + LOSE PANEL (match screenshot size/pos) */
        <div className="absolute" style={{ left: 13, top: 340, width: 374, height: 374 }}>
          <img src="/image2/panel_scoreboard_blank.png" alt="" className="absolute inset-0 h-full w-full object-fill" />

          {/* NO BET header (keep like screenshot) */}
          {resultKind === 'NOBET' ? (
            <div className="absolute flex items-center" style={{ left: 36, top: 52, width: 302, height: 48, gap: 14 }}>
              <img src={winnerItem ? winnerItem.src : '/image2/lemon.png'} alt="" className="h-[34px] w-[34px] object-contain" />
              <div
                style={{
                  color: '#fff',
                  fontFamily: 'Inter, system-ui, sans-serif',
                  fontSize: 20,
                  fontWeight: 800,
                  lineHeight: '20px',
                }}
              >
                You did not bet in this round
              </div>
            </div>
          ) : (
            /* ✅ LOSE header: same “winner row style” as WIN, but diamonds 0 */
            <div className="absolute" style={{ left: 34, top: 52, width: 306, height: 48, overflow: 'hidden' }}>
              <div className="absolute flex items-center" style={{ left: 0, top: 0, height: 48, gap: 10 }}>
                <img src={winnerItem ? winnerItem.src : '/image2/lemon.png'} alt="" className="h-[34px] w-[34px] object-contain" />
                <div
                  style={{
                    color: '#fff',
                    fontFamily: 'Inter, system-ui, sans-serif',
                    fontWeight: 800,
                    fontSize: 20,
                    lineHeight: '20px',
                    textTransform: 'lowercase',
                  }}
                >
                  {winnerItem ? winnerItem.id : 'none'}
                </div>
              </div>

              <div
                className="absolute flex items-center justify-end"
                style={{
                  right: 0,
                  top: 0,
                  height: 48,
                  gap: 8,
                  color: '#ffe56a',
                  fontFamily: 'Inria Serif, serif',
                  fontSize: 28,
                  fontWeight: 800,
                  textShadow: '0 2px 0 rgba(0,0,0,0.35)',
                  whiteSpace: 'nowrap',
                }}
              >
                <BlumondIcon size={20} />
                <span>0</span>
              </div>
            </div>
          )}

          {/* rows same as before */}
          {NO_BET_ROWS.map((row, idx) => (
            <div key={`${row.name}-${idx}`} className="absolute" style={{ left: 34, top: 140 + idx * 74, width: 306, height: 56, overflow: 'hidden' }}>
              <div className="absolute" style={{ left: 0, top: 12, width: 30, height: 30 }}>
                <PodiumBadge index={idx} size={30} />
              </div>

              <div
                style={{
                  position: 'absolute',
                  left: 44,
                  top: 16,
                  width: 170,
                  color: '#fff',
                  fontFamily: 'Inria Serif, serif',
                  fontSize: 24,
                  lineHeight: '24px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {row.name}
              </div>

              <div
                className="absolute flex items-center justify-end"
                style={{
                  right: 0,
                  top: 16,
                  width: 120,
                  gap: 8,
                  color: '#ffe8a9',
                  fontFamily: 'Inter, system-ui, sans-serif',
                  fontWeight: 800,
                  fontSize: 22,
                  lineHeight: '22px',
                  textShadow: '0 1px 0 rgba(0,0,0,0.35)',
                }}
              >
                <BlumondIcon size={18} />
                {formatK(row.amount)}
              </div>
            </div>
          ))}
        </div>
      )}
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
          <img src="/image2/popup_rules.png" alt="" className="h-full w-full object-fill" />
        ) : null}

        {activeModal === 'RECORDS' ? (
          <div className="relative h-full w-full">
            <img src="/image2/popup_game_records.png" alt="" className="h-full w-full object-fill" />
            <div className="absolute left-[28px] right-[30px] top-[90px] text-[13px] text-[#be6a31]">
              {records.length > 0
                ? `Round ${records[0].round} | Winner: ${records[0].winner} | Win: ${formatNum(records[0].win)}`
                : 'Display game records of the last 7 days, with a maximum of 200 records.'}
            </div>
          </div>
        ) : null}

        {activeModal === 'PRIZE' ? (
          <div className="h-full w-full rounded-[22px] border-[5px] border-[#f09c16] bg-gradient-to-b from-[#fff3cc] to-[#ffdd9d] p-4 text-[#8f4f1f]">
            <div className="mx-auto mb-3 flex h-[44px] w-[200px] items-center justify-center rounded-[14px] bg-gradient-to-b from-[#ffcb1d] to-[#f6a602] text-[22px] font-bold text-[#7a3c08]">
              Prize distribution
            </div>
            <div className="rounded-[10px] bg-[#e9b273] p-3 text-center text-[18px]">
              1st: 1,000,000 | 2nd: 800,000 | 3rd: 500,000
            </div>
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
                className={`h-full w-1/2 rounded-[16px] text-[14px] ${
                  rankTab === 'TODAY' ? 'bg-[#ffcf22] text-[#7c430f]' : 'text-[#6b4a25]'
                }`}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setRankTab('YESTERDAY')}
                className={`h-full w-1/2 rounded-[16px] text-[14px] ${
                  rankTab === 'YESTERDAY' ? 'bg-[#ffcf22] text-[#7c430f]' : 'text-[#6b4a25]'
                }`}
              >
                Yesterday
              </button>
            </div>

            <div className="space-y-1">
              {rankRows.slice(0, 7).map((row, idx) => (
                <div key={`${row.name}-${idx}`} className="relative h-[42px]">
                  <img src={rankBgByIndex(idx)} alt="" className="absolute inset-0 h-full w-full object-fill" />
                  <div className="absolute left-[14px] top-[8px] text-[20px] text-[#7b471d]">{idx + 1}</div>
                  <div className="absolute left-[70px] top-[8px] text-[18px] text-[#7b471d]">{row.name}</div>
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
            <img src="/image2/popup_small.png" alt="" className="absolute inset-0 h-full w-full object-fill" />

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
              className="absolute left-1/2 -translate-x-1/2 text-center"
              style={{
                top: 34,
                width: 250,
                fontFamily: 'Inria Serif, serif',
                fontWeight: 800,
                fontSize: 30,
                color: '#7a3c08',
                textShadow: '0 2px 0 rgba(0,0,0,0.15)',
              }}
            >
              Advanced Mode
            </div>

            <div
              className="absolute"
              style={{
                left: 28,
                right: 28,
                top: 120,
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
                <span style={{ color: '#E92407', fontWeight: 900 }}>{formatNum(remainingForAdvance)}</span>{' '}
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