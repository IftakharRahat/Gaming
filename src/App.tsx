import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import LoadingScreen from './components/LoadingScreen';
import GamePage from './components/GamePage';
import './index.css';

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
          <motion.div
            key="game"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full h-full"
          >
            <GamePage />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
