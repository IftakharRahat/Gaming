const fs = require('fs');
let c = fs.readFileSync('src/components/GamePage.tsx', 'utf8');

// ─── 1. Replace the BETTING handler (complex polling) with simple delayed fetch ───
const oldBetting = `    if (phase === 'BETTING') {
      /* ── LIVE: poll server for winning element ── */
      setPhase('DRAWING');
      setTimeLeft(DRAW_SECONDS);

      // Poll /game/win/elements/list until a NEW result appears
      (async () => {
        const mBody = JSON.stringify({ regisation: 3, mode: isAdvanceMode ? 1 : 2 });
        let attempts = 0;
        const maxAttempts = 30;
        while (attempts < maxAttempts) {
          attempts++;
          try {
            const results = await apiFetch<Array<{
              id: number;
              element__element_name: string | null;
              gjp__jackpot_name: string | null;
              jackport_element_name: string[];
            }>>('/game/win/elements/list', 1, mBody);

            if (results && results.length > 0) {
              const latest = results[results.length - 1];
              if (latest.id > lastWinIdRef.current) {
                lastWinIdRef.current = latest.id;

                if (latest.gjp__jackpot_name && latest.jackport_element_name.length > 0) {
                  const jackpotIds = latest.jackport_element_name
                    .map(name => API_NAME_TO_ID[name])
                    .filter(Boolean) as ItemId[];
                  setRoundType('JACKPOT');
                  winnerRef.current = jackpotIds.length > 0 ? jackpotIds : ['honey'];
                  setWinnerIds(jackpotIds.length > 0 ? jackpotIds : ['honey']);
                  console.log('[LIVE] Jackpot winner:', jackpotIds);
                } else if (latest.element__element_name) {
                  const winnerId = API_NAME_TO_ID[latest.element__element_name] || 'honey';
                  winnerRef.current = [winnerId];
                  setWinnerIds([winnerId]);
                  console.log('[LIVE] Winner:', winnerId, '(' + latest.element__element_name + ')');
                }
                break;
              }
            }
          } catch (e) {
            console.warn('[LIVE] Poll error:', e);
          }
          await new Promise(r => setTimeout(r, 1000));
        }

        if (attempts >= maxAttempts) {
          console.warn('[LIVE] Timeout, using fallback');
          const fallback = ITEMS[Math.floor(Math.random() * ITEMS.length)].id;
          winnerRef.current = [fallback];
          setWinnerIds([fallback]);
        }
      })();
      return;
    }`;

const newBetting = `    if (phase === 'BETTING') {
      /* ── LIVE: fetch server winner after a short delay ── */
      setPhase('DRAWING');
      setTimeLeft(DRAW_SECONDS);

      // Wait 3s (let server finalize), then fetch winner
      (async () => {
        await new Promise(r => setTimeout(r, 3000));
        const mBody = JSON.stringify({ regisation: 3, mode: isAdvanceMode ? 1 : 2 });

        // Try up to 3 times with 2s interval
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const results = await apiFetch<Array<{
              id: number;
              element__element_name: string | null;
              gjp__jackpot_name: string | null;
              jackport_element_name: string[];
            }>>('/game/win/elements/list', 1, mBody);

            if (results && results.length > 0) {
              const latest = results[results.length - 1];

              if (latest.gjp__jackpot_name && latest.jackport_element_name.length > 0) {
                const jackpotIds = latest.jackport_element_name
                  .map(name => API_NAME_TO_ID[name])
                  .filter(Boolean) as ItemId[];
                setRoundType('JACKPOT');
                winnerRef.current = jackpotIds.length > 0 ? jackpotIds : ['honey'];
                setWinnerIds(jackpotIds.length > 0 ? jackpotIds : ['honey']);
                console.log('[LIVE] Jackpot winner:', jackpotIds);
              } else if (latest.element__element_name) {
                const winnerId = API_NAME_TO_ID[latest.element__element_name] || 'honey';
                winnerRef.current = [winnerId];
                setWinnerIds([winnerId]);
                console.log('[LIVE] Winner:', winnerId, '(' + latest.element__element_name + ')');
              } else {
                // No name — use fallback
                const fallback = ITEMS[Math.floor(Math.random() * ITEMS.length)].id;
                winnerRef.current = [fallback];
                setWinnerIds([fallback]);
                console.log('[LIVE] No element name, using fallback');
              }
              return; // success — exit
            }
          } catch (e) {
            console.warn('[LIVE] Fetch attempt', attempt + 1, 'error:', e);
          }
          if (attempt < 2) await new Promise(r => setTimeout(r, 2000));
        }

        // All retries failed — fallback
        console.warn('[LIVE] All retries failed, using fallback');
        const fallback = ITEMS[Math.floor(Math.random() * ITEMS.length)].id;
        winnerRef.current = [fallback];
        setWinnerIds([fallback]);
      })();
      return;
    }`;

if (c.includes(oldBetting)) {
    c = c.replace(oldBetting, newBetting);
    console.log('1. OK: BETTING handler simplified');
} else {
    console.log('1. FAIL: old BETTING handler not found');
    process.exit(1);
}

// ─── 2. Remove lastWinIdRef (no longer needed) ───
// Keep the ref decl but it's harmless. Just leave it.

// ─── 3. Fix DRAWING handler: remove the early return when winners is null ───
// Instead, use the auto-transition effect to handle it
const oldDraw = `    if (phase === 'DRAWING') {
      const winners = winnerRef.current;
      if (!winners || winners.length === 0) {
        // Server winner not received yet — keep waiting, poll will set it
        console.log('[LIVE] Drawing timer expired, waiting for server winner...');
        return;
      }`;
const newDraw = `    if (phase === 'DRAWING') {
      const winners = winnerRef.current;
      if (!winners || winners.length === 0) return; // wait for fetch to complete`;

if (c.includes(oldDraw)) {
    c = c.replace(oldDraw, newDraw);
    console.log('2. OK: DRAWING handler simplified');
} else {
    console.log('2. FAIL: old DRAWING handler not found');
}

fs.writeFileSync('src/components/GamePage.tsx', c);
console.log('\nDONE');
