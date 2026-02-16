import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';

const MAX_FRAME_WIDTH = 420;
const DEBUG = false;

const ARTBOARD = { width: 402, height: 735 } as const;

const debugClass = (on: boolean) => (on ? 'outline outline-1 outline-fuchsia-500/55' : '');

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
  id: string;
  src: string;
  left: number;
  top: number;
  width: number;
  height: number;
  rotate?: number;
  badge: BadgeSpec;
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
  },
  {
    id: 'tomato',
    src: '/image2/tomato.png',
    left: 168,
    top: 113,
    width: 67,
    height: 65,
    badge: { text: 'x5', left: 192, top: 165, width: 20, height: 16, fontSize: 12, letterSpacing: '0.08em' },
  },
  {
    id: 'lemon',
    src: '/image2/lemon.png',
    left: 277,
    top: 133,
    width: 62,
    height: 69,
    badge: { text: 'x5', left: 302, top: 188, width: 20, height: 16, fontSize: 12, letterSpacing: '0.08em' },
  },
  {
    id: 'milk',
    src: '/image2/milk_carton.png',
    left: 15,
    top: 231,
    width: 64,
    height: 81,
    badge: { text: 'x25', left: 33, top: 301, width: 31, height: 16, fontSize: 12, letterSpacing: '0.08em' },
  },
  {
    id: 'pumpkin',
    src: '/image2/pumpkin.png',
    left: 317,
    top: 243,
    width: 71,
    height: 72,
    badge: { text: 'x5', left: 348, top: 304, width: 20, height: 16, fontSize: 12, letterSpacing: '0.08em' },
  },
  {
    id: 'zucchini',
    src: '/image2/zucchini.png',
    left: 272,
    top: 326,
    width: 67.9999993852268,
    height: 94.99999889804803,
    rotate: 1.79,
    badge: { text: 'x5', left: 309, top: 403, width: 20, height: 16, fontSize: 12, letterSpacing: '0.08em' },
  },
  {
    id: 'cola',
    src: '/image2/cola_can.png',
    left: 62,
    top: 336,
    width: 59,
    height: 83,
    badge: { text: 'x15', left: 83, top: 403, width: 27, height: 16, fontSize: 12, letterSpacing: '0.08em' },
  },
  {
    id: 'water',
    src: '/image2/water.png',
    left: 169,
    top: 356,
    width: 67,
    height: 97,
    badge: { text: 'x10', left: 189, top: 433, width: 29, height: 16, fontSize: 12, letterSpacing: '0.08em' },
  },
];

type ResultIconSpec = {
  src: string;
  left: number;
  top: number;
  width: number;
  height: number;
  rotate?: number;
};

const RESULT_ICONS: ResultIconSpec[] = [
  { src: '/image2/tomato.png', left: 105, top: 691, width: 26, height: 25 },
  { src: '/image2/cola_can.png', left: 139, top: 687, width: 22, height: 32 },
  { src: '/image2/honey_jar.png', left: 169, top: 687, width: 27, height: 31 },
  { src: '/image2/pumpkin.png', left: 204, top: 690, width: 26, height: 26 },
  { src: '/image2/pumpkin.png', left: 238, top: 690, width: 26, height: 26 },
  { src: '/image2/zucchini.png', left: 272, top: 686.34, width: 17.926160604443528, height: 32.193923576762074, rotate: 11.79 },
  { src: '/image2/tomato.png', left: 304.13, top: 691, width: 26, height: 25 },
  { src: '/image2/pumpkin.png', left: 338.13, top: 690, width: 26, height: 26 },
];

type ChipSpec = {
  src: string;
  left: number;
  top: number;
  width: number;
  height: number;
  shadow?: boolean;
};

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

  const [timeLeft, setTimeLeft] = useState(30);

  useEffect(() => {
    const id = setInterval(() => setTimeLeft((p) => (p > 0 ? p - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <ScaledArtboard width={ARTBOARD.width} height={ARTBOARD.height} metricsMode={flags.metrics}>
      {/* PAGE BACKGROUND */}
      <div
        className={`relative h-full w-full ${debugClass(DEBUG)}`}
        style={{
          background: '#8DA6DE',
        }}
      >
        {/* CITY BG */}
        <img
          src="/image2/city_background.png"
          alt=""
          className="absolute z-0 object-cover"
          style={{
            left: 0,
            top: 0,
            width: 477,
            height: 735,
            mixBlendMode: 'overlay',
            opacity: 1,
          }}
        />
        
        {/* City background overlay */}
        <div
          className="absolute z-[1]"
          style={{
            left: -47,
            top: 0,
            width: 477,
            height: 735,
            background: '#00000033',
            pointerEvents: 'none',
          }}
        />

        {/* Debug grid */}
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

        {/* FLARE TROPHY */}
        <img
          src="/image2/flare.png"
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute z-10 object-contain"
          style={{ left: -27, top: 5, width: 149, height: 149 }}
        />

        {/* FLARE JACKPOT */}
        <img
          src="/image2/flare.png"
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute z-10 object-contain"
          style={{ left: 276, top: 5, width: 149, height: 149 }}
        />

        {/* TOP ELEMS FRAME (as a single image) */}
<div
  className="absolute z-30"
  style={{
    left: 14,
    top: 11,
    width: 371.7438659667969,
    height: 34.34597396850586,
  }}
>
  <img
    src="/image2/Group_23.png"
    alt=""
    className="h-full w-full object-contain"
    style={{
      pointerEvents: 'none',
      userSelect: 'none',
    }}
  />
</div>


        {/* TROPHY */}
        <div
          className="absolute z-40 overflow-hidden"
          style={{
            left: 18,
            top: 53,
            width: 51,
            height: 50,
            borderRadius: 19.5,
          }}
        >
          <img src="/image2/trophy.png" alt="" className="h-full w-full object-contain" />
        </div>

        {/* 99+ badge */}
<div
  className="absolute z-50"
  style={{
    left: 29,
    top: 98,
    height: 16,
  }}
>
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




        {/* JACKPOT */}
        <img
          src="/image2/jackpot.png"
          alt=""
          className="absolute z-40 object-contain"
          style={{ left: 309, top: 46, width: 77, height: 57 }}
        />

        {/* BASIC/ADVANCE FRAME */}
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
          {/* BASIC BUTTON */}
          <div
            className="flex items-center justify-center"
            style={{
              width: 86,
              height: 24.764331817626953,
              borderRadius: 109.55,
              background: 'linear-gradient(178.63deg, #FFDB19 31.27%, #E09613 98.84%)',
              paddingTop: 4.38,
              paddingBottom: 4.38,
              paddingLeft: 26.02,
              paddingRight: 26.02,
              gap: 4.38,
              border: '0.55px solid #A45721',
            }}
          >
            <span
              style={{
                width: 34,
                height: 16,
                fontFamily: 'Inria Serif, serif',
                fontWeight: 700,
                fontSize: 14.24,
                lineHeight: '15.34px',
                letterSpacing: '-0.02em',
                color: '#4A2A12',
              }}
            >
              Basic
            </span>
          </div>

          {/* ADVANCE BUTTON */}
          <div
            className="flex items-center justify-center"
            style={{
              width: 86,
              height: 24.764331817626953,
              borderRadius: 109.55,
              background: 'transparent',
              paddingTop: 4.38,
              paddingBottom: 4.38,
              paddingLeft: 15.5,
              paddingRight: 15.5,
              gap: 4.38,
            }}
          >
            <span
              style={{
                width: 55,
                height: 16,
                fontFamily: 'Inria Serif, serif',
                fontWeight: 700,
                fontSize: 14.24,
                lineHeight: '15.34px',
                letterSpacing: '-0.02em',
                color: '#FFFFFF',
              }}
            >
              Advance
            </span>
          </div>
        </div>

        {/* WHEEL */}
        <img
          src="/image2/ferris-wheel.png"
          alt=""
          className="pointer-events-none absolute z-20 object-contain"
          style={{ left: 6, top: 101, width: 391, height: 391 }}
        />

        {/* SIGN BOARD */}
        <img
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
        />

        {/* WORDMARK / BANNER */}
        <img
          src="/image2/greedy_wordmark.png"
          alt=""
          className="absolute z-31 object-contain"
          style={{ left: 122, top: 193, width: 171, height: 114 }}
        />

        {/* POINTER */}
        <img
          src="/image2/select_items.png"
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute z-35 object-contain"
          style={{ left: 247, top: 115, width: 189, height: 189 }}
        />

        {/* BET TIME */}
        <div
          className="absolute z-40 flex items-center justify-center"
          style={{
            left: 182,
            top: 304,
            width: 60,
            height: 16,
            fontFamily: 'Inter, system-ui, sans-serif',
            fontWeight: 700,
            fontSize: 14.24,
            lineHeight: '15.34px',
            letterSpacing: '-0.02em',
            color: '#FFFFFF',
          }}
        >
          Bet Time
        </div>

        {/* TIMER */}
        <motion.div
          className="absolute z-40 flex items-center justify-center"
          style={{
            left: 192.56,
            top: 324.69,
            width: 39.999999279138166,
            height: 15.999999711655265,
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
          animate={{ opacity: [1, 0.92, 1] }}
          transition={{ duration: 1.2, repeat: Infinity }}
        >
          {timeLeft}s
        </motion.div>

{ITEMS.map((it) => (
  <div
    key={it.id}
    className="absolute z-30"
    style={{
      left: it.left,
      top: it.top,
      width: it.width,
      height: it.height,
    }}
  >
    <img
      src={it.src}
      alt=""
      className="h-full w-full object-contain"
      style={{
        transform: it.rotate != null ? `rotate(${it.rotate}deg)` : undefined,
        transformOrigin: 'center',
      }}
    />

    {it.badge?.text && (
      <div
        className="absolute flex items-center justify-center"
        style={{
          left: Number(it.badge.left) - Number(it.left),
          top: Number(it.badge.top) - Number(it.top),
          height: it.badge.height,
          paddingLeft: 3,
          paddingRight: 3,
          fontFamily: 'Inter, system-ui, sans-serif',
          fontWeight: 700,
          fontSize: 15,
          lineHeight: '15.34px',
          letterSpacing: '0.08em',
          WebkitTextFillColor: '#FFFFFF',
          WebkitTextStroke: '2px #A45721',
          paintOrder: 'stroke fill',
        }}
      >
        {it.badge.text}
      </div>
    )}
  </div>
))}




        {/* GROUP 31 - TABS SECTION */}
        <div className="absolute z-50" style={{ left: 4, top: 444, width: 394, height: 72 }}>
          {/* FLARE BACK VEG */}
          <img
            src="/image2/flare.png"
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute object-contain"
            style={{ left: -45 - 4, top: 340 - 444, width: 180, height: 272, zIndex: 0 }}
          />
          
          {/* FLARE BACK DRINKS */}
          <img
            src="/image2/flare.png"
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute object-contain"
            style={{ left: 260 - 4, top: 335 - 444, width: 180, height: 272, zIndex: 0 }}
          />

          {/* TAB VEG */}
          <img 
            src="/image2/tab_vegetables.png" 
            alt="" 
            className="absolute z-10 object-contain" 
            style={{ left: 0, top: 0, width: 75, height: 72 }} 
          />

          {/* TAB DRINKS */}
          <img
            src="/image2/tab_drinks.png"
            alt=""
            className="absolute z-10 object-contain"
            style={{ left: 319 - 4, top: 445 - 444, width: 79, height: 68 }}
          />

          {/* TODAY'S WIN CONTAINER */}
          <div
            className="absolute z-20"
            style={{
              left: 81 - 4,
              top: 485 - 444,
              width: 234,
              height: 26,
              borderRadius: 200,
              background: '#0F6095',
              border: '1.5px solid #92D0F9',
              boxShadow: 'inset 0px 0px 8px rgba(0,0,0,0.30), 0px 0px 12px rgba(0,0,0,0.40)',
            }}
          >
            {/* TODAY'S WIN TEXT */}
            <div
              className="absolute z-10 flex items-center whitespace-nowrap"
              style={{
                left: 95 - 81,
                top: 491 - 485,
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

            {/* WIN VALUE */}
            <div
  className="absolute z-10 flex items-center justify-center"
  style={{
    left: 254 - 81,
    top: 491 - 485,
    fontFamily: 'Inria Serif, serif',
    fontWeight: 700,
    fontSize: 14.24,
    lineHeight: '15.34px',
    letterSpacing: '-0.02em',

    // Text stroke
    WebkitTextFillColor: '#ffee00',  // fill color inside text
    WebkitTextStrokeWidth: '1px',    // thickness of border
    WebkitTextStrokeColor: '#A45721', // border color
    paintOrder: 'stroke fill',       // ensures stroke shows correctly

    // Optional: keep small padding to avoid clipping
    paddingLeft: 2,
    paddingRight: 2,
  }}
>
  0
</div>

          </div>
        </div>

        {/* FRAME 1 - BOTTOM PANEL BACKGROUND */}
        <div
          className="absolute"
          style={{
            left: 0,
            top: 477,
            width: 402,
            height: 297,
            background: '#2B93CA',
            zIndex: 5,
          }}
        />

        {/* GROUP 32 / PANEL */}
        <div
          className="absolute z-40 overflow-hidden"
          style={{
            left: 4,
            top: 444,
            width: 394,
            height: 281,
            borderRadius: 32,
          }}
        >
          {/* Curtain */}
          <img
            src="/image2/curtain.png"
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute z-0"
            style={{ 
              left: 0, 
              right: 0,
              top: 476.91 - 444, 
              width: '100%',
              height: 81.2218246459961,
              objectFit: 'fill',
            }}
          />

          {/* Frame 5 - Chips container */}
          <div
            className="absolute z-10"
            style={{
              left: 29 - 4,
              top: 523 - 444,
              width: 345,
              height: 101,
              borderRadius: 20,
              background: '#0F6095',
              border: '5px solid #1087C6',
            }}
          />

          {/* Chips */}
          {CHIPS.map((c, idx) => (
            <img
              key={idx}
              src={c.src}
              alt=""
              className="absolute z-20 object-contain"
              style={{
                left: c.left - 4,
                top: c.top - 444,
                width: c.width,
                height: c.height,
                filter: c.shadow ? 'drop-shadow(0px 0px 12px rgba(0,0,0,0.55))' : undefined,
              }}
            />
          ))}

          {/* Rectangle progress */}
          <div
            className="absolute z-10"
            style={{
              left: 29 - 4,
              top: 639 - 444,
              width: 343,
              height: 18,
              borderRadius: 20,
              background: '#0F6095',
              border: '1px solid #1087C6',
            }}
          />

          {/* Chests */}
          {CHESTS.map((c, idx) => (
            <img
              key={idx}
              src={c.src}
              alt=""
              className="absolute z-20 object-contain"
              style={{ left: c.left - 4, top: c.top - 444, width: c.width, height: c.height }}
            />
          ))}

          {/* Result rectangle */}
          <div
            className="absolute z-10"
            style={{
              left: 31 - 4,
              top: 680 - 444,
              width: 343,
              height: 45,
              borderRadius: 12,
              background: '#0F6095',
              border: '2px solid #1087C6',
              boxShadow: '0px 1px 0px #4ABAF9',
            }}
          />

          {/* Result text */}
          <div
            className="absolute z-20 flex items-center"
            style={{
              left: 44 - 4,
              top: 694 - 444,
              width: 43,
              height: 16,
              fontFamily: 'Inter, system-ui, sans-serif',
              fontWeight: 700,
              fontSize: 14.24,
              lineHeight: '15.34px',
              letterSpacing: '-0.02em',
              color: '#FFFFFF',
            }}
          >
            Result
          </div>

          {/* Vector 2 - Separator line */}
          <div
            className="absolute z-20"
            style={{
              left: 96.5 - 4,
              top: 690 - 444,
              width: 0,
              height: 24,
              borderLeft: '1px solid',
              borderImageSource: 'linear-gradient(180deg, #0F6095 -6.25%, #FFFFFF 50%, #0F6095 106.25%)',
              borderImageSlice: 1,
            }}
          />

          {/* Result icons */}
          {RESULT_ICONS.map((ri, idx) => (
            <img
              key={idx}
              src={ri.src}
              alt=""
              className="absolute z-20 object-contain"
              style={{
                left: ri.left - 4,
                top: ri.top - 444,
                width: ri.width,
                height: ri.height,
                transform: ri.rotate ? `rotate(${ri.rotate}deg)` : undefined,
                transformOrigin: 'center',
              }}
            />
          ))}
        </div>

        {/* Optional Figma overlay */}
        {flags.overlay ? (
          <img
            src="/image2/figma_ref.png"
            alt="Figma overlay"
            className="pointer-events-none absolute inset-0 z-[9999] h-full w-full object-fill"
            style={{ opacity: 0.4 }}
          />
        ) : null}
      </div>
    </ScaledArtboard>
  );
};

export default GamePage;