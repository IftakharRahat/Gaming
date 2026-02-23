import https from 'https';

const BASE = 'gameadmin.nanovisionltd.com';
const BODY = JSON.stringify({ regisation: '3' });
const BODY_PLAYER = JSON.stringify({ regisation: 3, player_id: 1065465 });

const endpoints = [
    { path: '/game/game/elements', label: 'Call 0: elements', body: BODY },
    { path: '/game/sorce/buttons', label: 'Call 1: buttons', body: BODY },
    { path: '/game/magic/boxs', label: 'Call 2: boxs', body: BODY },
    { path: '/game/game/trophy', label: 'Call 3: trophy', body: BODY },
    { path: '/game/win/elements/list', label: 'Call 4: win/elements', body: BODY },
    { path: '/game/game/coin', label: 'Call 5: coin', body: BODY },
    { path: '/game/icon/during/gaming', label: 'Call 6: icon/during', body: BODY },
    { path: '/game/today/win', label: 'Call 7: today/win', body: BODY },
    { path: '/game/jackpot', label: 'Call 8: jackpot', body: BODY },
    { path: '/game/game/session/end/time', label: 'Call 9: session/end/time', body: BODY },
    { path: '/game/game/prize/distribution', label: 'Call 10: prize/dist', body: BODY },
    { path: '/game/game/mode', label: 'Call 11: mode', body: BODY },
    { path: '/game/game/rank/today', label: 'Call 12: rank/today', body: BODY },
    { path: '/game/top/winers', label: 'Call 13: top/winers', body: BODY_PLAYER },
    { path: '/game/maximum/fruits/per/turn', label: 'Call 14: max/fruits', body: JSON.stringify({ regisation: 3 }) },
    { path: '/game/game/rank/yesterday', label: 'Call 15: rank/yesterday', body: BODY },
    { path: '/game/game/rule', label: 'Call 16: rule', body: BODY },
    { path: '/game/jackpot/details', label: 'Call 17: jackpot/details', body: BODY },
    { path: '/game/game/icon/', label: 'Call 18: game/icon/', body: BODY },
    { path: '/game/game/records/of/player', label: 'Call 19: records/of/player', body: BODY_PLAYER },
];

async function testEndpoint(ep) {
    return new Promise((resolve) => {
        const options = {
            hostname: BASE,
            path: ep.path,
            method: 'GET',
            headers: {
                'Content-Type': 'text/plain',
                'Content-Length': Buffer.byteLength(ep.body),
            },
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                const status = res.statusCode;
                const preview = data.slice(0, 120).replace(/\n/g, ' ');
                const icon = status === 200 ? '✓' : '✗';
                console.log(`${icon} ${ep.label} → HTTP ${status} | ${preview}`);
                resolve();
            });
        });

        req.on('error', (e) => {
            console.log(`✗ ${ep.label} → ERROR: ${e.message}`);
            resolve();
        });
        req.write(ep.body);
        req.end();
    });
}

console.log(`Testing ${endpoints.length} endpoints against ${BASE}...\n`);
for (const ep of endpoints) {
    await testEndpoint(ep);
}
console.log('\nDone!');
