import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

// Using public folder assets for absolute reliability
const logoUrl = '/logo.png';
const backgroundUrl = '/image2/iphone16pro_background.jpg';

interface LoadingScreenProps {
    onLoadingComplete: () => void;
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ onLoadingComplete }) => {
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        // Slow progress for verification
        const interval = setInterval(() => {
            setProgress((prev) => {
                if (prev >= 100) {
                    clearInterval(interval);
                    return 100;
                }
                const next = prev + Math.floor(Math.random() * 2) + 1;
                return next > 100 ? 100 : next;
            });
        }, 40);

        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (progress === 100) {
            const timer = setTimeout(() => {
                onLoadingComplete();
            }, 800);
            return () => clearTimeout(timer);
        }
    }, [progress, onLoadingComplete]);

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
                            transition={{ duration: 0.1, ease: "linear" }}
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
