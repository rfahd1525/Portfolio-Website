// Content shown inside the 3D room. The 2D page has its own copy in index.html.

export const projects = [
    {
        id: 'codeless',
        name: 'CodelessEngine',
        stack: 'C++20 · OpenGL 4.1 · Box2D · wxWidgets',
        blurb: 'A 2D game engine with a visual editor. You lay out a game, give things behaviours and hit play, no code required.',
        url: 'https://github.com/rfahd1525/CodelessEngine',
        color: '#d94660'
    },
    {
        id: 'blockblast-rl',
        name: 'Block Blast RL Agent',
        stack: 'Python · PyTorch',
        blurb: 'PPO with action masking, trained through self-play until it plays Block Blast better than I do.',
        url: 'https://github.com/rfahd1525/Block-Blast-AI-Reinforcement-Learning-Agent',
        color: '#3d6fd8'
    },
    {
        id: 'scenify',
        name: 'Scenify',
        stack: 'Python · Roblox Studio',
        blurb: 'Pulls the unique meshes out of an FBX/OBJ/GLB scene, exports them as GLB, and writes the Lua that rebuilds the whole scene in Studio.',
        url: 'https://github.com/rfahd1525/Scenify',
        color: '#2f9e6e'
    },
    {
        id: 'ghostkeys',
        name: 'Ghost-Keys',
        stack: 'Python · Win32',
        blurb: 'An auto-typer that sends input through low-level Windows APIs, so to the OS it looks like someone typing.',
        url: 'https://github.com/rfahd1525/Ghost-Keys',
        color: '#7a5cc9'
    },
    {
        id: 'talkingboard',
        name: 'AI Talking Board',
        stack: 'JavaScript',
        blurb: 'An Ouija board with a language model on the other side. Ask it something and the planchette answers.',
        url: 'https://github.com/rfahd1525/AI-Powered-Talking-Board',
        color: '#c9862f'
    },
    {
        id: 'blockblast-solver',
        name: 'Block Blast Solver',
        stack: 'JavaScript',
        blurb: 'Takes a board and a hand of pieces and works out where they should go.',
        url: 'https://github.com/rfahd1525/Block-Blast-Solver',
        color: '#d4567f'
    },
    {
        id: 'brobot',
        name: 'BroBot',
        stack: 'JavaScript',
        blurb: 'An assistant that is confidently wrong about everything and calls you bro far too often. Comes with a talking avatar.',
        url: 'https://github.com/rfahd1525/BroBot',
        color: '#2a8fa8'
    },
    {
        id: 'blackwood',
        name: 'Murder at Blackwood Manor',
        stack: 'Python',
        blurb: 'A text adventure murder mystery. Search the manor, question the suspects, name the killer.',
        url: 'https://github.com/rfahd1525/Murder-at-Blackwood-Manor',
        color: '#5a4a3f'
    },
    {
        id: 'tiktok',
        name: 'TikTok Repost Logger',
        stack: 'Python',
        blurb: 'Watches an account and keeps a log of what it reposts.',
        url: 'https://github.com/rfahd1525/Tiktok-Repost-Logger',
        color: '#2b2b36'
    }
];

// Roblox games come from assets/roblox.json, which the deploy workflow refreshes
// from the Roblox API (scripts/fetch-roblox.mjs). New games show up on their own;
// the blurbs below just read better than the store descriptions.
const BLURBS = {
    10084260628: { name: 'Westhaven RP', blurb: 'City roleplay. Jobs, cars, houses you can furnish, a phone that works, instruments you can play. Still in alpha.' },
    10768484463: { name: 'Steal a Ghost', blurb: 'Vacuum up ghosts, carry them home, then sneak into other players\u2019 manors and take theirs.' },
    10769094310: { name: 'Wreck Range', blurb: 'Launch cars down a range and watch them come apart on the targets.' },
    10768202465: { name: 'FLYBALL', blurb: '4v4 on brooms. Chasers, keepers, a seeker and busters. Bots fill empty slots.' }
};

// Used if roblox.json can't be loaded.
const FALLBACK = {
    updated: '2026-10-08T20:32:35Z',
    community: { name: 'PseudonameGames', members: 1267, url: 'https://www.roblox.com/communities/897448846/PseudonameGames' },
    games: [
        { id: 10084260628, visits: 40602, icon: 'assets/games/10084260628.webp', url: 'https://www.roblox.com/games/110422210684606' },
        { id: 10768484463, visits: 2714, icon: 'assets/games/10768484463.webp', url: 'https://www.roblox.com/games/89281860269650' },
        { id: 10769094310, visits: 2438, icon: 'assets/games/10769094310.webp', url: 'https://www.roblox.com/games/104850311133949' },
        { id: 10768202465, visits: 168, icon: 'assets/games/10768202465.webp', url: 'https://www.roblox.com/games/80408636452165' }
    ]
};

const stripEmoji = s => s.replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '').replace(/\s{2,}/g, ' ').trim();
const firstSentence = s => {
    const text = stripEmoji(s.split('\n').find(l => l.trim()) || '');
    const m = text.match(/^.{20,160}?[.!?](\s|$)/);
    return (m ? m[0] : text.slice(0, 140)).trim();
};

export const formatCount = n => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '')}k` : String(n));

export function shapeRoblox(data) {
    const games = (data.games || []).map(g => ({
        name: BLURBS[g.id]?.name || stripEmoji(g.name || ''),
        blurb: BLURBS[g.id]?.blurb || firstSentence(g.description || ''),
        visits: g.visits || 0,
        img: g.icon,
        url: g.url
    }));
    return {
        name: data.community?.name || 'PseudonameGames',
        url: data.community?.url,
        members: data.community?.members || 0,
        updated: new Date(data.updated),
        totalVisits: games.reduce((a, g) => a + g.visits, 0),
        games
    };
}

let roblox = null;
export function loadRoblox() {
    roblox ||= fetch(new URL('../assets/roblox.json', import.meta.url), { cache: 'no-cache' })
        .then(r => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
        .catch(() => FALLBACK)
        .then(shapeRoblox);
    return roblox;
}

export const fallbackRoblox = () => shapeRoblox(FALLBACK);

export const contact = {
    email: 'rfahd15@gmail.com',
    github: 'https://github.com/rfahd1525',
    linkedin: 'https://www.linkedin.com/in/rawad-fahd-03b326196'
};
