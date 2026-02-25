import { useMemo, useState, lazy, Suspense } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import LoadingScreen from './components/LoadingScreen';
import './index.css';

// Lazy-load pages so each route-like view has its own chunk.
const GamePage = lazy(() => import('./components/GamePage'));
const AdminPanel = lazy(() => import('./components/AdminPanel'));

function App() {
  const isAdminView = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const path = window.location.pathname.toLowerCase();
    return path.includes('/admin') || params.get('view')?.toLowerCase() === 'admin' || params.get('admin') === '1';
  }, []);

  const [gameState, setGameState] = useState<'loading' | 'game'>('loading');

  if (isAdminView) {
    return (
      <Suspense
        fallback={
          <div className="h-full w-full bg-[#edf6ff] p-6">
            <div className="h-4 w-64 animate-pulse rounded bg-[#c9def7]" />
          </div>
        }
      >
        <div className="h-full w-full overflow-auto bg-[#edf6ff]">
          <AdminPanel />
        </div>
      </Suspense>
    );
  }

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
