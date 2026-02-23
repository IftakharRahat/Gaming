import { useState, lazy, Suspense } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import LoadingScreen from './components/LoadingScreen';
import './index.css';

// Lazy-load GamePage — this creates a separate chunk that loads only after the loading screen
const GamePage = lazy(() => import('./components/GamePage'));

function App() {
  const [gameState, setGameState] = useState<'loading' | 'game'>('loading');

  return (
    <div className="game-container bg-slate-950 overflow-hidden flex items-center justify-center">
      <AnimatePresence mode="wait">
        {gameState === 'loading' ? (
          <motion.div
            key="loading"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="w-full h-full"
          >
            <LoadingScreen onLoadingComplete={() => setGameState('game')} />
          </motion.div>
        ) : (
          <Suspense
            fallback={
              <div className="w-full h-full flex items-center justify-center bg-slate-950">
                <div className="text-white text-lg animate-pulse">Loading game...</div>
              </div>
            }
          >
            <motion.div
              key="game"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="w-full h-full"
            >
              <GamePage />
            </motion.div>
          </Suspense>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
