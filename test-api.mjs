import https from 'https';
import fs from 'fs';

const BASE = 'gameadmin.nanovisionltd.com';
const BODY = JSON.stringify({ regisation: "3" });

const endpoints = [
    { path: '/game/magic/boxs', label: 'BOXES' },
    { path: '/game/sorce/buttons', label: 'BUTTONS' },
    { path: '/game/game/elements', label: 'ELEMENTS' },
    { path: '/game/maximum/fruits/per/turn', label: 'MAX_FRUITS' },
];

let output = '';

async function testEndpoint(ep) {
    return new Promise((resolve) => {
        const options = {
            hostname: BASE,
            path: ep.path,
            method: 'GET',
            headers: {
                'Content-Type': 'text/plain',
                'Content-Length': Buffer.byteLength(BODY),
            },
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                output += `\n========== ${ep.label} (HTTP ${res.statusCode}) ==========\n`;
                try {
                    const json = JSON.parse(data);
                    output += JSON.stringify(json, null, 2) + '\n';
                } catch {
                    output += '[ERROR - not JSON]\n';
                    output += data.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300) + '\n';
                }
                resolve();
            });
        });

        req.on('error', (e) => {
            output += `\n========== ${ep.label} ERROR ==========\n${e.message}\n`;
            resolve();
        });
        req.write(BODY);
        req.end();
    });
}

for (const ep of endpoints) {
    await testEndpoint(ep);
}

fs.writeFileSync('api-results.json', output, 'utf-8');
console.log('Done! Results saved to api-results.json');
