// Pulls the PseudonameGames community and its public games from the Roblox API
// and writes assets/roblox.json plus game icons in assets/games/.
//
// Runs in the Pages deploy workflow (on push and every few hours), because the
// Roblox API doesn't allow requests from other websites' browsers. If Roblox is
// unreachable the existing files are left alone, so a deploy never breaks.
//
//   node scripts/fetch-roblox.mjs

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const GROUP = 897448846;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outFile = path.join(root, 'assets/roblox.json');
const iconDir = path.join(root, 'assets/games');

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(url, { json = true } = {}) {
    for (let attempt = 1; attempt <= 4; attempt++) {
        const res = await fetch(url, { headers: { accept: json ? 'application/json' : '*/*' } });
        if (res.ok) return json ? res.json() : Buffer.from(await res.arrayBuffer());
        if (res.status === 429 || res.status >= 500) { await sleep(1500 * attempt); continue; }
        throw new Error(`${res.status} for ${url}`);
    }
    throw new Error(`gave up on ${url}`);
}

const chunks = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

async function main() {
    const group = await get(`https://groups.roblox.com/v1/groups/${GROUP}`);

    const listed = [];
    let cursor = '';
    do {
        const page = await get(`https://games.roblox.com/v2/groups/${GROUP}/gamesV2?accessFilter=Public&limit=50&sortOrder=Desc${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
        listed.push(...page.data);
        cursor = page.nextPageCursor;
    } while (cursor);

    const details = new Map(), votes = new Map(), icons = new Map();
    for (const ids of chunks(listed.map(g => g.id), 50)) {
        const q = ids.join(',');
        (await get(`https://games.roblox.com/v1/games?universeIds=${q}`)).data.forEach(d => details.set(d.id, d));
        (await get(`https://games.roblox.com/v1/games/votes?universeIds=${q}`)).data.forEach(v => votes.set(v.id, v));
        (await get(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${q}&size=256x256&format=Webp&isCircular=false`)).data
            .forEach(t => t.state === 'Completed' && icons.set(t.targetId, t.imageUrl));
    }

    await fs.mkdir(iconDir, { recursive: true });
    const games = [];
    for (const g of listed) {
        const d = details.get(g.id) || {};
        let icon = null;
        if (icons.has(g.id)) {
            try {
                await fs.writeFile(path.join(iconDir, `${g.id}.webp`), await get(icons.get(g.id), { json: false }));
                icon = `assets/games/${g.id}.webp`;
            } catch (err) {
                console.warn(`icon for ${g.id}: ${err.message}`);
            }
        }
        games.push({
            id: g.id,
            placeId: g.rootPlace?.id,
            name: d.name || g.name,
            description: d.description || g.description || '',
            visits: d.visits ?? g.placeVisits ?? 0,
            favorites: d.favoritedCount ?? 0,
            likes: votes.get(g.id)?.upVotes ?? 0,
            dislikes: votes.get(g.id)?.downVotes ?? 0,
            created: g.created,
            updated: d.updated || g.updated,
            icon,
            url: `https://www.roblox.com/games/${g.rootPlace?.id}`
        });
    }
    games.sort((a, b) => b.visits - a.visits);

    const data = {
        updated: new Date().toISOString(),
        community: {
            id: GROUP,
            name: group.name,
            members: group.memberCount,
            url: `https://www.roblox.com/communities/${GROUP}/${encodeURIComponent(group.name)}`
        },
        games
    };
    await fs.writeFile(outFile, JSON.stringify(data, null, 2) + '\n');
    console.log(`roblox.json: ${games.length} games, ${group.memberCount} members`);
}

main().catch(err => {
    console.warn(`Couldn't refresh Roblox data, keeping what's there: ${err.message}`);
});
