import http from 'http';

function callApi(label, path, body) {
    const data = JSON.stringify(body);
    return new Promise((resolve) => {
        const start = Date.now();
        const req = http.request({
            hostname: 'funint.site',
            path,
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data),
            },
        }, (res) => {
            let d = '';
            res.on('data', (c) => (d += c));
            res.on('end', () => {
                const ms = Date.now() - start;
                const isJson = d.trim().startsWith('{') || d.trim().startsWith('[');
                const preview = isJson ? d.substring(0, 100) : '(HTML error page)';
                resolve({ label, status: res.statusCode, ms, preview });
            });
        });
        req.on('error', (e) => resolve({ label, status: 0, ms: Date.now() - start, preview: e.message }));
        req.write(data);
        req.end();
    });
}

async function main() {
    console.log('=== SESSION END TIME API TEST ===');
    console.log('Host: http://funint.site');
    console.log('Time: ' + new Date().toISOString());
    console.log('');

    // Test 1: Session API with 3 different spellings
    console.log('--- Test 1: Body Spelling Variants ---');
    const spellings = [
        { label: 'regisatration:3', body: { regisatration: 3 } },
        { label: 'regisation:3', body: { regisation: 3 } },
        { label: 'registration:3', body: { registration: 3 } },
    ];
    for (const s of spellings) {
        const r = await callApi(s.label, '/game/game/session/end/time', s.body);
        console.log(`  ${r.status === 200 ? 'OK' : 'FAIL'} [${r.status}] ${r.label} (${r.ms}ms) => ${r.preview}`);
    }

    // Test 2: Reliability - call session API 5 times
    console.log('\n--- Test 2: Reliability (5 calls with regisatration:3) ---');
    let okCount = 0;
    for (let i = 1; i <= 5; i++) {
        const r = await callApi(`Call ${i}`, '/game/game/session/end/time', { regisatration: 3 });
        console.log(`  ${r.status === 200 ? 'OK' : 'FAIL'} [${r.status}] ${r.label} (${r.ms}ms) => ${r.preview}`);
        if (r.status === 200) okCount++;
        await new Promise((r) => setTimeout(r, 1000));
    }
    console.log(`  Result: ${okCount}/5 succeeded`);

    // Test 3: Other APIs for comparison
    console.log('\n--- Test 3: Other APIs (should all be 200) ---');
    const others = [
        { label: 'elements', path: '/game/game/elements', body: { regisation: 3, mode: 2 } },
        { label: 'jackpot', path: '/game/jackpot', body: { regisation: 3, mode: 2 } },
        { label: 'mode', path: '/game/game/mode', body: { regisation: 3, mode: 2 } },
        { label: 'trophy', path: '/game/game/trophy', body: { regisation: 3 } },
        { label: 'win history', path: '/game/win/elements/list', body: { regisation: 3, mode: 2 } },
    ];
    for (const o of others) {
        const r = await callApi(o.label, o.path, o.body);
        console.log(`  ${r.status === 200 ? 'OK' : 'FAIL'} [${r.status}] ${r.label} (${r.ms}ms) => ${r.preview}`);
    }

    // Test 4: Check if server_time is now included
    console.log('\n--- Test 4: Response format check ---');
    const r = await callApi('format check', '/game/game/session/end/time', { regisatration: 3 });
    if (r.status === 200) {
        console.log(`  Response: ${r.preview}`);
        const hasServerTime = r.preview.includes('server_time');
        console.log(`  Has server_time field: ${hasServerTime ? 'YES' : 'NO'}`);
    } else {
        console.log(`  Cannot check format - API returned ${r.status}`);
    }

    console.log('\n=== TEST COMPLETE ===');
}

main();
