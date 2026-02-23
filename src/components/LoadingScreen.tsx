import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';

// Using public folder assets for absolute reliability
const logoUrl = '/logo.png';
const backgroundUrl = '/image2/iphone16pro_background.jpg';

// ── Critical images that GamePage needs immediately ──
// These are preloaded during the loading screen so they're cached when the game mounts.
const CRITICAL_IMAGES = [
    // Backgrounds
    '/image2/advance_bg.png',
    '/image2/background_city_scene.png',
    // Ferris wheel & game elements
    '/image2/ferris-wheel.png',
    '/image2/game-elements.png',
    '/image2/game_elements_sheet.png',
    // Sign board & branding
    '/image2/greedy_sign_board.png',
    '/image2/greedy_wordmark.png',
    // Game items (sprites)
    '/image2/honey_jar.png',
    '/image2/tomato.png',
    '/image2/lemon.png',
    '/image2/milk_carton.png',
    '/image2/pumpkin.png',
    '/image2/zucchini.png',
    '/image2/cola_can.png',
    '/image2/water.png',
    // Chips
    '/image2/chip_10.png',
    '/image2/chip_100.png',
    '/image2/chip_500_orange.png',
    '/image2/chip_1k.png',
    '/image2/chip_5k.png',
    // Chests
    '/image2/chest_10k.png',
    '/image2/chest_50k.png',
    '/image2/chest_100k.png',
    '/image2/chest_500k.png',
    '/image2/chest_1m.png',
    // UI elements
    '/image2/gameboard.png',
    '/image2/flare.png',
    '/image2/flare_circular.png',
    '/image2/trophy.png',
    '/image2/ribbon.png',
    '/image2/banner_game_on.png',
    '/image2/curtain.png',
    '/image2/select_items.png',
    // Rank badges
    '/image2/leaderboard_rank_1.png',
    '/image2/leaderboard_rank_2.png',
    '/image2/leaderboard_rank_3.png',
    '/image2/leaderboard_rank_4_plus.png',
];

function preloadImage(src: string): Promise<void> {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve();
        img.onerror = () => {
            console.warn(`[Preload] Failed to load: ${src}`);
            resolve(); // Don't block loading on a failed image
        };
        img.src = src;
    });
}

interface LoadingScreenProps {
    onLoadingComplete: () => void;
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ onLoadingComplete }) => {
    const [progress, setProgress] = useState(0);
    const [preloadDone, setPreloadDone] = useState(false);

    // Preload critical images and track real progress
    useEffect(() => {
        let cancelled = false;
        const total = CRITICAL_IMAGES.length;
        let loaded = 0;

        const loadAll = async () => {
            // Load in batches of 6 to avoid overwhelming the network
            const batchSize = 6;
            for (let i = 0; i < total; i += batchSize) {
                if (cancelled) return;
                const batch = CRITICAL_IMAGES.slice(i, i + batchSize);
                await Promise.all(batch.map(preloadImage));
                loaded += batch.length;
                if (!cancelled) {
                    // Map actual progress to 10-95% range (reserve 0-10 for initial render, 95-100 for transition)
                    const realProgress = Math.min(95, Math.round(10 + (loaded / total) * 85));
                    setProgress(realProgress);
                }
            }
            if (!cancelled) {
                setProgress(100);
                setPreloadDone(true);
            }
        };

        // Start with a small initial progress to feel responsive immediately
        setProgress(5);
        loadAll();

        return () => { cancelled = true; };
    }, []);

    // Transition to game after preload completes
    useEffect(() => {
        if (preloadDone) {
            const timer = setTimeout(() => {
                onLoadingComplete();
            }, 600);
            return () => clearTimeout(timer);
        }
    }, [preloadDone, onLoadingComplete]);

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

            {/* Content Layer - Explicitly High Z-Index with Figma Top Position */}
            <div className="relative z-[999] flex flex-col items-center w-full pt-[242px]">

                {/* Logo Area - 214x212 from Figma */}
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

                {/* Progress Bar Container - Capsule Style 223x54 */}
                <div className="w-[223px] h-[54px] bg-[#91a0b8]/30 rounded-full p-[5px] border-[2px] border-white/40 backdrop-blur-md relative overflow-hidden shadow-2xl">
                    <div className="absolute top-[4px] inset-x-8 h-[2.5px] bg-white/40 rounded-full z-10" />

                    <div className="w-full h-full bg-black/20 rounded-full overflow-hidden relative">
                        <motion.div
                            className="h-full rounded-full bg-gradient-to-r from-[#00d2ff] via-[#4facfe] to-[#3a7bd5] relative shadow-[0_0_15px_rgba(0,210,255,0.5)]"
                            initial={{ width: 0 }}
                            animate={{ width: `${progress}%` }}
                            transition={{ duration: 0.3, ease: "easeOut" }}
                        >
                            <div className="absolute inset-0 bg-gradient-to-b from-white/40 to-transparent rounded-full opacity-80" />
                        </motion.div>
                    </div>
                </div>

                {/* Loading Text - Thicker, Logo-style typography (Outfit Black 900) */}
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
