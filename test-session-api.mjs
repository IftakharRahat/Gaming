import https from 'node:https';

function callApi() {
    return new Promise((resolve) => {
        const postData = '{"regisatration":3}';
        const req = https.request({
            hostname: 'game-azure-eight.vercel.app',
            path: '/game/game/session/end/time',
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
        }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch { resolve({ raw: data.slice(0, 100) }); }
            });
        });
        req.on('error', e => resolve({ error: e.message }));
        req.setTimeout(15000, () => { req.destroy(); resolve({ error: 'timeout' }); });
        req.write(postData);
        req.end();
    });
}

async function main() {
    console.log('Call 1 at', new Date().toISOString());
    const r1 = await callApi();
    console.log('  next_run_time:', r1.next_run_time);
    const remaining1 = ((new Date(r1.next_run_time)).getTime() - Date.now()) / 1000;
    console.log('  remaining:', remaining1.toFixed(1), 'seconds');

    console.log('\nWaiting 10 seconds...');
    await new Promise(r => setTimeout(r, 10000));

    console.log('\nCall 2 at', new Date().toISOString());
    const r2 = await callApi();
    console.log('  next_run_time:', r2.next_run_time);
    const remaining2 = ((new Date(r2.next_run_time)).getTime() - Date.now()) / 1000;
    console.log('  remaining:', remaining2.toFixed(1), 'seconds');

    console.log('\n--- Analysis ---');
    console.log('Time between calls: 10 seconds');
    console.log('Remaining 1:', remaining1.toFixed(1), 's');
    console.log('Remaining 2:', remaining2.toFixed(1), 's');

    if (Math.abs(remaining1 - remaining2) < 3) {
        console.log('\n🔴 CONFIRMED: API always returns ~same remaining (now+30)');
        console.log('   The API is NOT returning the actual round end time.');
        console.log('   Backend fix needed: return the REAL round end time.');
    } else {
        console.log('\n✅ API returns different remaining — countdown is real');
    }
}

main().catch(e => console.error(e));
