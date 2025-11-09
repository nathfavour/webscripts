// ==UserScript==
// @name         X Status Comment Auto-Follower
// @namespace    nathfavour
// @version      0.1.0
// @description  Scan /status/ replies, inspect profile popovers, and auto-follow per configured heuristics
// @author       nathfavour
// @match        https://x.com/*/status/*
// @match        https://twitter.com/*/status/*
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';



    // Config (exposed on window.XFollowInspector.config)
    const config = {
        autoFollow: true, // per user instruction: run automatically
        dailyCapRange: [90, 110], // randomized each day
        burstMaxDefault: 50, // discretionary upper bound for bursts
        fastDelayRange: [300, 900], // ms between follow clicks in a burst
        slowDelayRange: [3000, 10000], // ms between actions in slow mode
        burstCooldownRange: [5 * 60 * 1000, 15 * 60 * 1000], // 5-15 minutes between bursts
        pauseAfter100Range: [180000, 240000], // 3-4 minutes
        seenKey: 'x_follow_seen',
        historyKey: 'x_follow_history',
        metaKey: 'x_follow_meta',
        ignoreDays: 60, // 2 months ~ 60 days
        safeMode: false // if true, more conservative defaults can be used
    };

    // Utilities
    const utils = {
        randomBetween: (min, max) => Math.floor(Math.random() * (max - min + 1)) + min,
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        getTodayISO: () => new Date().toISOString().slice(0, 10),
        nowISO: () => new Date().toISOString(),
        log: (msg) => {
            const t = new Date().toISOString().replace('T', ' ').substr(0, 19);
            console.log(`[XFollowInspector ${t}] ${msg}`);
        },
        safeGet: (key, fallback) => {
            try {
                if (typeof GM_getValue === 'function') return GM_getValue(key, fallback);
            } catch (e) { }
            try {
                const raw = localStorage.getItem(key);
                return raw ? JSON.parse(raw) : fallback;
            } catch (e) { return fallback; }
        },
        safeSet: (key, value) => {
            try {
                if (typeof GM_setValue === 'function') return GM_setValue(key, value);
            } catch (e) { }
            try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { }
        }
    };

    // Storage wrappers
    const storage = {
        loadSeen: () => utils.safeGet(config.seenKey, {}),
        saveSeen: (obj) => utils.safeSet(config.seenKey, obj),
        loadHistory: () => utils.safeGet(config.historyKey, []),
        saveHistory: (arr) => utils.safeSet(config.historyKey, arr),
        loadMeta: () => utils.safeGet(config.metaKey, {}),
        saveMeta: (m) => utils.safeSet(config.metaKey, m)
    };

    // Parsing helpers
    function parseCount(raw) {
        if (!raw || typeof raw !== 'string') return { parsed: null, hadK: false, hadM: false, raw };
        let s = raw.trim().toLowerCase();
        // remove parentheses or other wrappers
        s = s.replace(/[()]/g, '');
        const hadM = /m/.test(s);
        const hadK = /k/.test(s);
        if (hadM) return { parsed: null, hadK, hadM, raw: s }; // skip M
        // remove commas and spaces
        s = s.replace(/,/g, '').replace(/\s+/g, '');
        // if has k -> parse float and *1000
        if (hadK) {
            s = s.replace(/k/g, '');
            const f = parseFloat(s) || 0;
            return { parsed: Math.round(f * 1000), hadK: true, hadM: false, raw };
        }
        // no suffix: handle dots. If dot and only one dot and there are <=3 digits after dot, treat as decimal thousands only if used with k earlier; otherwise remove dots as thousands separators
        // Common formats: "1.234" (rare) or "7.8" (with k would be 7.8k). Without k, remove dots.
        s = s.replace(/\./g, '');
        const n = parseInt(s, 10);
        if (Number.isNaN(n)) return { parsed: null, hadK: false, hadM: false, raw };
        return { parsed: n, hadK: false, hadM: false, raw };
    }

    function shouldFollow(followersRaw, followingRaw) {
        const a = parseCount(followersRaw);
        const b = parseCount(followingRaw);
        if (!a.parsed || !b.parsed) return { follow: false, reason: 'zero-or-M-or-parse-fail' };
        const v1 = a.parsed;
        const v2 = b.parsed;
        const max = Math.max(v1, v2);
        const min = Math.min(v1, v2);
        if (max === 0) return { follow: false, reason: 'max-zero' };
        // determine threshold
        let threshold = 0.8;
        if (a.hadK || b.hadK) threshold = 0.8;
        else if ((v1 >= 10 && v1 <= 99) || (v2 >= 10 && v2 <= 99)) threshold = 0.5; // two-digit
        else if ((v1 >= 100 && v1 <= 9999) || (v2 >= 100 && v2 <= 9999)) threshold = 0.75; // 3-4 digits
        else threshold = 0.8;
        const ratio = min / max;
        const follow = ratio >= threshold;
        return { follow, ratio, threshold, v1, v2 };
    }

    // DOM helpers
    function isProfileAnchor(a) {
        if (!a || !a.getAttribute) return false;
        const href = a.getAttribute('href') || '';
        // ignore links that are status, lists, i/spaces etc.
        // Accept: /username or https://x.com/username
        const relMatch = href.match(/^\/(?:#!\/)?([A-Za-z0-9_]{1,15})\/?$/);
        const absMatch = href.match(/^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/(?:#!\/)?([A-Za-z0-9_]{1,15})\/?$/);
        if (relMatch || absMatch) {
            // ensure not inside a card or promoted container
            const badAncestor = a.closest('[data-testid*="card"], iframe, [aria-label*="Promoted"], .PromotedTweet');
            if (badAncestor) return false;
            // ensure visible
            const r = a.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) return false;
            return true;
        }
        return false;
    }

    function extractProfileAnchors(root = document) {
        const anchors = Array.from(root.querySelectorAll('article[role="article"] a, div[data-testid="tweet"] a, a'));
        const found = [];
        for (const a of anchors) {
            try {
                if (isProfileAnchor(a)) found.push(a);
            } catch (e) { /* ignore */ }
        }
        return found;
    }

    // Hover simulation
    async function simulateHover(anchor) {
        if (!anchor) return null;
        try {
            anchor.scrollIntoView({ block: 'center', behavior: 'auto' });
        } catch (e) { }
        await utils.sleep(utils.randomBetween(150, 400));

        function dispatch(el, type) {
            try {
                const rect = el.getBoundingClientRect();
                const ev = new PointerEvent(type, {
                    bubbles: true,
                    cancelable: true,
                    composed: true,
                    clientX: rect.x + rect.width / 2,
                    clientY: rect.y + rect.height / 2
                });
                el.dispatchEvent(ev);
            } catch (e) {
                try {
                    const rect = el.getBoundingClientRect();
                    el.dispatchEvent(new MouseEvent(type, {
                        bubbles: true,
                        cancelable: true,
                        clientX: rect.x + rect.width / 2,
                        clientY: rect.y + rect.height / 2
                    }));
                } catch (e) { }
            }
        }

        dispatch(anchor, 'pointermove');
        await utils.sleep(50);
        dispatch(anchor, 'mousemove');
        await utils.sleep(50);
        dispatch(anchor, 'mouseover');
        await utils.sleep(50);
        dispatch(anchor, 'mouseenter');

        // Wait for popover to appear
        await utils.sleep(utils.randomBetween(500, 1500));

        // Heuristic: find the actual popover card near the anchor
        // X typically uses role="dialog" or specific data-testid for popovers
        const anchorRect = anchor.getBoundingClientRect();
        let popover = null;

        // First, try to find a dialog or popover by role
        const dialogs = Array.from(document.querySelectorAll('[role="dialog"], [role="tooltip"], [data-testid*="UserCell"]')).filter(el => {
            try {
                const r = el.getBoundingClientRect();
                if (r.width === 0 && r.height === 0) return false;
                // Popover should be near the anchor or to the right/below
                const distanceX = Math.abs(r.left - anchorRect.right);
                const distanceY = Math.abs(r.top - anchorRect.top);
                return distanceX < 300 && distanceY < 300;
            } catch (e) { return false; }
        });

        if (dialogs.length > 0) {
            // Pick the smallest (most specific) dialog
            dialogs.sort((a, b) => (a.getBoundingClientRect().width * a.getBoundingClientRect().height) - (b.getBoundingClientRect().width * b.getBoundingClientRect().height));
            popover = dialogs[0];
        }

        // Fallback: look for elements with both followers and following text
        if (!popover) {
            const allElements = Array.from(document.querySelectorAll('div')).filter(el => {
                try {
                    const r = el.getBoundingClientRect();
                    if (r.width === 0 || r.height === 0) return false;
                    if (r.width > 500 || r.height > 400) return false; // Popover should be reasonably small
                    const txt = el.textContent.toLowerCase();
                    return txt.includes('followers') && (txt.includes('following') || txt.includes('follow'));
                } catch (e) { return false; }
            });
            if (allElements.length > 0) popover = allElements[0];
        }

        return popover;
    }

    // Popover parsing: get follower & following counts and the Follow button element
    function parsePopover(pop) {
        if (!pop) return null;
        // Search for text labels and numbers within the popover
        const walker = Array.from(pop.querySelectorAll('*'));
        let followersText = null;
        let followingText = null;
        let followButton = null;

        // Strategy: find text nodes that say 'followers' or 'following', then grab nearby number
        for (const el of walker) {
            const txt = (el.textContent || '').trim();
            if (!txt) continue;
            const low = txt.toLowerCase();

            // Match 'Followers' (with count)
            if (!followersText && /^followers?$/i.test(low)) {
                const num = findNumericNearby(el);
                if (num) followersText = num;
            }

            // Match 'Following' (with count)  
            if (!followingText && /^following$/i.test(low)) {
                const num = findNumericNearby(el);
                if (num) followingText = num;
            }

            // Find the Follow button
            if (!followButton && /^\s*follow\s*$/i.test(txt)) {
                const btn = el.closest('button') || el.closest('[role="button"]');
                if (btn) followButton = btn;
            }
        }

        // Fallback: search for numeric elements that look like counts
        if (!followersText || !followingText) {
            // Extract all text nodes with numbers from direct children of popover
            const numberNodes = walker.filter(el => {
                const txt = (el.textContent || '').trim();
                return /^[\d,.kmK]+$/.test(txt);
            }).map(el => (el.textContent || '').trim());

            if (numberNodes.length >= 2) {
                const parsed = numberNodes.map(n => ({ raw: n, parsed: parseCount(n).parsed })).filter(x => x.parsed);
                if (parsed.length >= 2) {
                    // Assume larger is followers, smaller is following
                    parsed.sort((a, b) => b.parsed - a.parsed);
                    if (!followersText) followersText = parsed[0].raw;
                    if (!followingText) followingText = parsed[1].raw;
                }
            }
        }

        return { followersText, followingText, followButton, pop };
    }

    function findNumericNearby(el) {
        // look for immediate sibling or close text nodes that contain numbers
        if (!el) return null;
        // check previousSibling
        const prev = el.previousElementSibling;
        if (prev) {
            const txt = (prev.textContent || '').trim();
            if (/\d/.test(txt)) return txt;
        }
        const next = el.nextElementSibling;
        if (next) {
            const txt = (next.textContent || '').trim();
            if (/\d/.test(txt)) return txt;
        }
        // check parent's children for numeric elements
        const p = el.parentElement;
        if (p) {
            // look at immediate children first
            for (const child of p.children) {
                if (child === el) continue;
                const txt = (child.textContent || '').trim();
                if (/^[\d,.kmKM]+$/.test(txt)) return txt; // numeric-like string
            }
        }
        return null;
    }

    // Follow attempt
    async function attemptFollow(username, anchor, followersRaw, followingRaw) {
        try {
            const { follow, ratio, threshold } = shouldFollow(followersRaw, followingRaw);
            if (!follow) {
                utils.log(`Decision: skip ${username} ratio=${ratio?.toFixed?.(2)} threshold=${threshold}`);
                return { success: false, reason: 'decision-skip', ratio, threshold };
            }

            // check seen/ignored
            const seen = storage.loadSeen();
            if (seen[username]) {
                const now = new Date();
                if (new Date(seen[username].ignoredUntilISO) > now) {
                    utils.log(`Skipping ${username} — in seen/ignored window`);
                    return { success: false, reason: 'ignored' };
                }
            }

            // check meta/daily cap
            const meta = storage.loadMeta() || {};
            const today = utils.getTodayISO();
            if (!meta.todayDateISO || meta.todayDateISO !== today) {
                meta.todayDateISO = today;
                meta.todayCap = utils.randomBetween(config.dailyCapRange[0], config.dailyCapRange[1]);
                meta.todayCount = 0;
                storage.saveMeta(meta);
            }
            if ((meta.todayCount || 0) >= (meta.todayCap || config.dailyCapRange[1])) {
                utils.log('Daily cap reached — not following now');
                return { success: false, reason: 'daily-cap' };
            }

            // ensure visible & re-query follow button
            const pop = await simulateHover(anchor);
            const parsed = parsePopover(pop);
            if (!parsed || !parsed.followButton) {
                utils.log(`No follow button found for ${username}`);
                return { success: false, reason: 'no-follow-button' };
            }

            // pre-click jitter
            await utils.sleep(utils.randomBetween(config.fastDelayRange[0], config.fastDelayRange[1]));

            // perform synthetic click
            try {
                const btn = parsed.followButton;
                btn.scrollIntoView({ block: 'center', behavior: 'auto' });
            } catch (e) { }
            await utils.sleep(utils.randomBetween(100, 300));

            function clickEl(el) {
                try {
                    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
                    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                    el.click();
                    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
                } catch (e) { try { el.click(); } catch (e) { } }
            }

            clickEl(parsed.followButton);

            // wait for confirmation
            const confirmTimeout = 3000;
            const start = Date.now();
            let confirmed = false;
            while (Date.now() - start < confirmTimeout) {
                await utils.sleep(300);
                const txt = (parsed.followButton.textContent || '').toLowerCase();
                if (/following/.test(txt) || /requested/.test(txt)) { confirmed = true; break; }
            }

            // update meta and history
            const history = storage.loadHistory() || [];
            history.push({ username, followersRaw, followingRaw, followersParsed: parseCount(followersRaw).parsed, followingParsed: parseCount(followingRaw).parsed, ratio: (Math.min(parseCount(followersRaw).parsed, parseCount(followingRaw).parsed) / Math.max(parseCount(followersRaw).parsed, parseCount(followingRaw).parsed)), threshold, followedAtISO: utils.nowISO(), confirmed: !!confirmed });
            storage.saveHistory(history);

            // mark as seen & ignored for the TTL
            const seenObj = storage.loadSeen();
            const now = new Date();
            const ignoredUntil = new Date(now.getTime() + config.ignoreDays * 24 * 60 * 60 * 1000);
            seenObj[username] = { addedAtISO: utils.nowISO(), ignoredUntilISO: ignoredUntil.toISOString(), sourceStatusURL: location.href };
            storage.saveSeen(seenObj);

            // increment meta.todayCount
            const meta2 = storage.loadMeta() || {};
            meta2.todayCount = (meta2.todayCount || 0) + (confirmed ? 1 : 1); // count attempts as well
            storage.saveMeta(meta2);

            utils.log(`Follow attempt for ${username} recorded, confirmed=${confirmed}`);
            return { success: confirmed, reason: confirmed ? 'ok' : 'unconfirmed' };
        } catch (e) {
            utils.log(`Error in attemptFollow for ${username}: ${e.message}`);
            return { success: false, reason: 'error', error: e.message };
        }
    }

    // Prune seen entries whose TTL expired
    function pruneSeen() {
        const seen = storage.loadSeen() || {};
        const now = new Date();
        let changed = false;
        for (const u of Object.keys(seen)) {
            if (seen[u] && seen[u].ignoredUntilISO && new Date(seen[u].ignoredUntilISO) <= now) {
                delete seen[u];
                changed = true;
            }
        }
        if (changed) storage.saveSeen(seen);
    }

    // Controller
    const controller = {
        running: false,
        async start() {
            if (controller.running) return;
            controller.running = true;
            utils.log('Starting X Follow Inspector...');

            // initial prune & meta init
            pruneSeen();
            const meta = storage.loadMeta() || {};
            const today = utils.getTodayISO();
            if (!meta.todayDateISO || meta.todayDateISO !== today) {
                meta.todayDateISO = today;
                meta.todayCap = utils.randomBetween(config.dailyCapRange[0], config.dailyCapRange[1]);
                meta.todayCount = 0;
                storage.saveMeta(meta);
                utils.log(`New day cap chosen: ${meta.todayCap}`);
            } else {
                utils.log(`Today cap: ${meta.todayCap}, used: ${meta.todayCount || 0}`);
            }

            const seen = storage.loadSeen() || {};
            const seenUsernames = new Set(Object.keys(seen));
            const pending = [];
            let lastScrollHeight = 0;
            let noChangeCount = 0;

            while (controller.running) {
                if (document.visibilityState !== 'visible') {
                    utils.log('Tab not visible — pausing heavy actions');
                    await utils.sleep(5000);
                    continue;
                }

                // extract anchors from current DOM
                const anchors = extractProfileAnchors(document);
                if (anchors.length > 0) {
                    utils.log(`Found ${anchors.length} profile anchors on page`);
                    for (const a of anchors) {
                        try {
                            const href = a.getAttribute('href') || '';
                            // Match /username format
                            let uname = null;
                            const mRel = href.match(/^\/([A-Za-z0-9_]{1,15})(?:\/.*)?$/);
                            if (mRel) uname = mRel[1];
                            if (!uname) {
                                const mAbs = href.match(/^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})(?:\/.*)?$/);
                                if (mAbs) uname = mAbs[1];
                            }
                            if (!uname) continue;
                            const u = uname.toLowerCase();
                            if (!seenUsernames.has(u) && !pending.includes(u)) {
                                pending.push(u);
                                utils.log(`Added ${u} to pending queue`);
                            }
                        } catch (e) { continue; }
                    }
                }

                if (pending.length === 0) {
                    // scroll to load more comments
                    const scrollHeight = document.documentElement.scrollHeight;
                    if (scrollHeight === lastScrollHeight) {
                        noChangeCount++;
                        if (noChangeCount > 3) {
                            utils.log('No new content loaded after 3 scroll attempts — stopping');
                            controller.running = false;
                            break;
                        }
                    } else {
                        noChangeCount = 0;
                        lastScrollHeight = scrollHeight;
                    }
                    utils.log('No pending users — scrolling to load more comments...');
                    await utils.sleep(500);
                    try { window.scrollBy({ top: utils.randomBetween(300, 800), behavior: 'smooth' }); } catch (e) { }
                    await utils.sleep(utils.randomBetween(1500, 2500));
                    continue;
                }

                // Determine burst size
                const meta2 = storage.loadMeta() || {};
                const remainingCap = (meta2.todayCap || config.dailyCapRange[1]) - (meta2.todayCount || 0);
                if (remainingCap <= 0) { utils.log('Reached daily cap, stopping follows for today'); controller.running = false; break; }
                const maxBurst = Math.min(config.burstMaxDefault, remainingCap);
                const burstSize = utils.randomBetween(Math.max(1, Math.floor(maxBurst / 4)), maxBurst);
                utils.log(`Starting burst of up to ${burstSize} follow attempts (remainingCap=${remainingCap})`);

                let attempts = 0;
                while (attempts < burstSize && pending.length > 0 && controller.running) {
                    const uname = pending.shift();
                    utils.log(`Processing user: ${uname}`);
                    
                    // locate a fresh anchor for this username
                    const allAnchors = Array.from(document.querySelectorAll('a'));
                    const anchor = allAnchors.find(a => {
                        if (!a) return false;
                        const href = (a.getAttribute('href') || '').toLowerCase();
                        // Match /username or /username/...
                        return href === '/' + uname.toLowerCase() || href.startsWith('/' + uname.toLowerCase() + '/');
                    });
                    if (!anchor) {
                        utils.log(`No anchor found for ${uname}`);
                        continue;
                    }
                    // simulate hover & parse
                    const pop = await simulateHover(anchor);
                    const parsed = parsePopover(pop);
                    if (!parsed || !parsed.followersText || !parsed.followingText) {
                        utils.log(`Insufficient popover data for ${uname} — skipping`);
                        seenUsernames.add(uname);
                        // still add to seen to avoid repeated attempts
                        const seenObj = storage.loadSeen();
                        const now = new Date();
                        const ignoredUntil = new Date(now.getTime() + config.ignoreDays * 24 * 60 * 60 * 1000);
                        seenObj[uname] = { addedAtISO: utils.nowISO(), ignoredUntilISO: ignoredUntil.toISOString(), sourceStatusURL: location.href };
                        storage.saveSeen(seenObj);
                        continue;
                    }

                    // attempt follow if heuristics allow
                    const result = await attemptFollow(uname, anchor, parsed.followersText, parsed.followingText);
                    seenUsernames.add(uname);
                    attempts += 1;

                    // random fast delay between attempts
                    await utils.sleep(utils.randomBetween(config.fastDelayRange[0], config.fastDelayRange[1]));
                }

                // after burst, enter cooldown
                const cooldown = utils.randomBetween(config.burstCooldownRange[0], config.burstCooldownRange[1]);
                utils.log(`Burst finished, entering cooldown ~${Math.round(cooldown / 1000)}s`);
                await utils.sleep(cooldown);

                // if seenUsernames too big, pause 3-4 minutes
                if (seenUsernames.size >= 100) {
                    const p = utils.randomBetween(config.pauseAfter100Range[0], config.pauseAfter100Range[1]);
                    utils.log(`Seen >=100 unique users, pausing ${Math.round(p / 1000)}s`);
                    await utils.sleep(p);
                }
            }

            utils.log('X Follow Inspector stopped');
            controller.running = false;
        },
        stop() {
            controller.running = false;
            utils.log('Stop requested for X Follow Inspector');
        }
    };

    // Expose API
    window.XFollowInspector = {
        start: controller.start,
        stop: controller.stop,
        config,
        getSeen: (username) => {
            const seen = storage.loadSeen();
            return seen[username] || null;
        },
        status: () => ({ running: controller.running })
    };

    // Auto-start
    setTimeout(() => { if (config.autoFollow) controller.start(); }, 2000);

})();

