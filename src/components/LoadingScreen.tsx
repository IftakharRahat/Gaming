import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

// Using public folder assets for absolute reliability
const logoUrl = '/logo.png';
const backgroundUrl = '/image2/iphone16pro_background.jpg';

// ── Only preload small essential sprites (< 100KB each) ──
// Heavy backgrounds/decorations load naturally after game mounts
const CRITICAL_IMAGES = [
    // Game item sprites (~20-30KB each)
    '/image2/honey_jar.png',
    '/image2/tomato.png',
    '/image2/lemon.png',
    '/image2/milk_carton.png',
    '/image2/pumpkin.png',
    '/image2/zucchini.png',
    '/image2/cola_can.png',
    '/image2/water.png',
    // Chips (~11-22KB each)
    '/image2/chip_10.png',
    '/image2/chip_100.png',
    '/image2/chip_500_orange.png',
    '/image2/chip_1k.png',
    '/image2/chip_5k.png',
    // Chests (~30KB each)
    '/image2/chest_10k.png',
    '/image2/chest_50k.png',
    '/image2/chest_100k.png',
    '/image2/chest_500k.png',
    '/image2/chest_1m.png',
    // Small UI elements
    '/image2/gameboard.png',
    '/image2/ribbon.png',
    '/image2/flare_circular.png',
];

function preloadImage(src: string): Promise<void> {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve();
        img.onerror = () => resolve(); // Don't block on failure
        img.src = src;
    });
}

interface LoadingScreenProps {
    onLoadingComplete: () => void;
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ onLoadingComplete }) => {
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        let cancelled = false;
        const total = CRITICAL_IMAGES.length;
        let loaded = 0;

        /* Prefetch critical API data so GamePage doesn't show hardcoded defaults */
        const prefetchApis = async () => {
            const API_BASE = '';
            const API_BODY = JSON.stringify({ regisation: 3 });
            const mBody = JSON.stringify({ regisation: 3, mode: 2 });

            const endpoints = [
                { key: 'elements', path: '/game/game/elements', body: mBody },
                { key: 'buttons', path: '/game/sorce/buttons', body: mBody },
                { key: 'boxes', path: '/game/magic/boxs', body: mBody },
                { key: 'jackpotDetails', path: '/game/jackpot/details', body: mBody },
                { key: 'gameMode', path: '/game/game/mode', body: mBody },
                { key: 'winHistory', path: '/game/win/elements/list', body: mBody },
                { key: 'trophy', path: '/game/game/trophy', body: API_BODY },
                { key: 'coin', path: '/game/game/coin', body: API_BODY },
                { key: 'gameIcon', path: '/game/icon/during/gaming', body: API_BODY },
                { key: 'jackpot', path: '/game/jackpot', body: mBody },
                { key: 'prizeDistribution', path: '/game/game/rank/today', body: mBody },
            ];

            const results: Record<string, unknown> = {};
            await Promise.allSettled(
                endpoints.map(async ({ key, path, body }) => {
                    try {
                        const res = await fetch(`${API_BASE}${path}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: body ?? API_BODY,
                        });
                        if (res.ok) {
                            results[key] = await res.json();
                        }
                    } catch {
                        /* non-critical — GamePage will retry */
                    }
                })
            );

            /* Store in window for GamePage to consume */
            (window as unknown as Record<string, unknown>).__PREFETCHED_API__ = results;
        };

        const loadAll = async () => {
            // Load images and APIs concurrently
            const imagePromises = CRITICAL_IMAGES.map((src) =>
                preloadImage(src).then(() => {
                    loaded++;
                    if (!cancelled) {
                        const pct = Math.min(90, Math.round(10 + (loaded / total) * 80));
                        setProgress(pct);
                    }
                })
            );

            const apiPromise = prefetchApis().then(() => {
                if (!cancelled) setProgress((p) => Math.max(p, 92));
            });

            await Promise.all([...imagePromises, apiPromise]);

            if (!cancelled) {
                setProgress(100);
                // Short delay before transitioning
                setTimeout(() => {
                    if (!cancelled) onLoadingComplete();
                }, 400);
            }
        };

        // Timeout fallback — proceed after 8 seconds no matter what
        const timeout = setTimeout(() => {
            if (!cancelled) {
                cancelled = true;
                setProgress(100);
                setTimeout(() => onLoadingComplete(), 200);
            }
        }, 8000);

        setProgress(5);
        loadAll();

        return () => {
            cancelled = true;
            clearTimeout(timeout);
        };
    }, [onLoadingComplete]);

    return (
        <div className="relative w-full h-full flex flex-col items-center bg-[#8DA6DE] overflow-hidden">
            {/* Background Layer - Skyscrapers */}
            <div className="absolute inset-0 z-0">
                <img
                    src={backgroundUrl}
                    alt="City Background"
                    className="w-full h-full object-cover select-none pointer-events-none"
                    onError={(e) => {
                        console.error('LoadingScreen: Background image failed to load');
                        (e.target as HTMLImageElement).src = 'https://placehold.co/1080x1920/8DA6DE/white?text=Background+Missing';
                    }}
                />
                <div className="absolute inset-0 bg-black/5 backdrop-blur-[0.5px]" />
            </div>

            {/* Content Layer */}
            <div className="relative z-[999] flex flex-col items-center w-full pt-[242px]">

                {/* Logo */}
                <motion.div
                    className="mb-8 select-none pointer-events-none"
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 100, damping: 15 }}
                >
                    <img
                        src={logoUrl}
                        alt="Greedy Market Logo"
                        className="w-[214px] h-[212px] object-contain drop-shadow-[0_10px_30px_rgba(255,255,255,0.25)]"
                        onError={(e) => {
                            console.error('LoadingScreen: Logo image failed to load');
                            (e.target as HTMLImageElement).src = 'https://placehold.co/214x212/8b5cf6/white?text=Logo+Missing';
                        }}
                    />
                </motion.div>

                {/* Progress Bar */}
                <div className="w-[223px] h-[54px] bg-[#91a0b8]/30 rounded-full p-[5px] border-[2px] border-white/40 backdrop-blur-md relative overflow-hidden shadow-2xl">
                    <div className="absolute top-[4px] inset-x-8 h-[2.5px] bg-white/40 rounded-full z-10" />
                    <div className="w-full h-full bg-black/20 rounded-full overflow-hidden relative">
                        <motion.div
                            className="h-full rounded-full bg-gradient-to-r from-[#00d2ff] via-[#4facfe] to-[#3a7bd5] relative shadow-[0_0_15px_rgba(0,210,255,0.5)]"
                            initial={{ width: 0 }}
                            animate={{ width: `${progress}%` }}
                            transition={{ duration: 0.2, ease: "easeOut" }}
                        >
                            <div className="absolute inset-0 bg-gradient-to-b from-white/40 to-transparent rounded-full opacity-80" />
                        </motion.div>
                    </div>
                </div>

                {/* Loading Text */}
                <motion.div
                    className="mt-6 text-white text-[24px] font-[900] tracking-tight select-none uppercase"
                    style={{
                        textShadow: '0 3px 0 rgba(0,0,0,0.5), 0 5px 15px rgba(0,0,0,0.3)',
                        fontFamily: "'Outfit', sans-serif"
                    }}
                >
                    <span className="tabular-nums pr-1">{progress}%</span> Loading.....
                </motion.div>

            </div>
        </div>
    );
};

export default LoadingScreen;
