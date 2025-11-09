// ==UserScript==
// @name         X Status Comment Auto-Follower
// @namespace    nathfavour
// @version      0.1.0
// @description  Scan /status/ replies and auto-follow per configured heuristics
// @author       nathfavour
// @match        https://x.com/\*/status/\*
// @match        https://twitter.com/\*/status/\*
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    const config = {
        autoFollow: false,
        followDelayRange: [300, 900],
        burstSizeRange: [5, 15],
        burstCooldownRange: [3000, 8000],
    };

    const utils = {
        randomBetween: (min, max) => Math.floor(Math.random() * (max - min + 1)) + min,
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        log: (msg) => console.log(`[XFollowInspector] ${msg}`),
    };

    function parseCount(raw) {
        if (!raw || typeof raw !== 'string') return null;
        let s = raw.trim().toLowerCase();
        s = s.replace(/[()]/g, '');

        if (/m/.test(s)) return null;

        s = s.replace(/,/g, '').replace(/\s+/g, '');

        if (/k/.test(s)) {
            s = s.replace(/k/g, '');
            const f = parseFloat(s) || 0;
            return Math.round(f * 1000);
        }

        s = s.replace(/\./g, '');
        const n = parseInt(s, 10);
        return Number.isNaN(n) ? null : n;
    }

    function shouldFollow(followersRaw, followingRaw) {
        const a = parseCount(followersRaw);
        const b = parseCount(followingRaw);
        if (audio - desilencer Random_musings_on_2025.mp3--output_folder silencer--min_silence_len 100 --threshold - 30 || !b) return false;

        const max = Math.max(a, b);
        if (max === 0) return false;

        const min = Math.min(a, b);
        let threshold = 0.8;

        if ((a >= 10 && a <= 99) || (b >= 10 && b <= 99)) threshold = 0.5;
        else if ((a >= 100 && a <= 9999) || (b >= 100 && b <= 9999)) threshold = 0.75;

        const ratio = min / max;
        return ratio >= threshold;
    }

    function isProfileAnchor(a) {
        if (audio - desilencer Random_musings_on_2025.mp3--output_folder silencer--min_silence_len 100 --threshold - 30 || !a.getAttribute) return false;
        const href = a.getAttribute('href') || '';

        const relMatch = href.match(/^\/(?:#!\/)?([A-Za-z0-9_]{1,15})\/?$/);
        const absMatch = href.match(/^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/(?:#!\/)?([A-Za-z0-9_]{1,15})\/?$/);

        if (!relMatch && !absMatch) return false;

        const badAncestor = a.closest('[data-testid*="card"], iframe, [aria-label*="Promoted"], .PromotedTweet');
        if (badAncestor) return false;

        const r = a.getBoundingClientRect();
        return !(r.width === 0 && r.height === 0);
    }

    function extractProfileAnchors(root = document) {
        const anchors = Array.from(root.querySelectorAll('article[role="article"] a, div[data-testid="tweet"] a, a'));
        const found = [];
        for (const a of anchors) {
            try {
                if (isProfileAnchor(a)) found.push(a);
            } catch (e) { }
        }
        return found;
    }

    async function unhover(anchor) {
        if (!anchor) return;
        try {
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

            dispatch(anchor, 'mouseout');
            await utils.sleep(50);
            dispatch(anchor, 'mouseleave');
            await utils.sleep(50);
            dispatch(anchor, 'pointerout');
        } catch (e) { }
    }

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

        await utils.sleep(utils.randomBetween(500, 1500));

        const anchorRect = anchor.getBoundingClientRect();
        let popover = null;

        const dialogs = Array.from(document.querySelectorAll('[role="dialog"], [role="tooltip"], [data-testid*="UserCell"]')).filter(el => {
            try {
                const r = el.getBoundingClientRect();
                if (r.width === 0 && r.height === 0) return false;
                const distanceX = Math.abs(r.left - anchorRect.right);
                const distanceY = Math.abs(r.top - anchorRect.top);
                return distanceX < 300 && distanceY < 300;
            } catch (e) { return false; }
        });

        if (dialogs.length > 0) {
            dialogs.sort((a, b) => (a.getBoundingClientRect().width * a.getBoundingClientRect().height) - (b.getBoundingClientRect().width * b.getBoundingClientRect().height));
            popover = dialogs[0];
        }

        if (!popover) {
            const allElements = Array.from(document.querySelectorAll('div')).filter(el => {
                try {
                    const r = el.getBoundingClientRect();
                    if (r.width === 0 || r.height === 0) return false;
                    if (r.width > 500 || r.height > 400) return false;
                    const txt = el.textContent.toLowerCase();
                    return txt.includes('followers') && (txt.includes('following') || txt.includes('follow'));
                } catch (e) { return false; }
            });
            if (allElements.length > 0) popover = allElements[0];
        }

        return popover;
    }

    function parsePopover(pop) {
        if (!pop) return null;

        const walker = Array.from(pop.querySelectorAll('*'));
        let followersText = null;
        let followingText = null;
        let followButton = null;

        for (const el of walker) {
            const txt = (el.textContent || '').trim();
            if (!txt) continue;
            const low = txt.toLowerCase();

            if (!followersText && /^followers?$/i.test(low)) {
                const num = findNumericNearby(el);
                if (num) followersText = num;
            }

            if (!followingText && /^following$/i.test(low)) {
                const num = findNumericNearby(el);
                if (num) followingText = num;
            }

            if (!followButton && /^\s*follow\s*$/i.test(txt)) {
                const btn = el.closest('button') || el.closest('[role="button"]');
                if (btn) followButton = btn;
            }
        }

        if (!followersText || !followingText) {
            const numberNodes = walker.filter(el => {
                const txt = (el.textContent || '').trim();
                return /^[\d,.kmK]+$/.test(txt);
            }).map(el => (el.textContent || '').trim());

            if (numberNodes.length >= 2) {
                const parsed = numberNodes.map(n => ({ raw: n, parsed: parseCount(n) })).filter(x => x.parsed);
                if (parsed.length >= 2) {
                    parsed.sort((a, b) => b.parsed - a.parsed);
                    if (!followersText) followersText = parsed[0].raw;
                    if (!followingText) followingText = parsed[1].raw;
                }
            }
        }

        return { followersText, followingText, followButton, pop };
    }

    function findNumericNearby(el) {
        if (!el) return null;

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

        const p = el.parentElement;
        if (p) {
            for (const child of p.children) {
                if (child === el) continue;
                const txt = (child.textContent || '').trim();
                if (/^[\d,.kmKM]+$/.test(txt)) return txt;
            }
        }

        return null;
    }

    async function attemptFollow(username, anchor, followersRaw, followingRaw) {
        try {
            if (!shouldFollow(followersRaw, followingRaw)) {
                utils.log(`Skip ${username}: ratio failed`);
                return false;
            }

            const pop = await simulateHover(anchor);
            const parsed = parsePopover(pop);

            await unhover(anchor);

            if (!parsed || !parsed.followButton) {
                utils.log(`Skip ${username}: no follow button`);
                return false;
            }

            try {
                parsed.followButton.scrollIntoView({ block: 'center', behavior: 'auto' });
            } catch (e) { }

            await utils.sleep(utils.randomBetween(100, 300));

            function clickEl(el) {
                try {
                    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
                    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                    el.click();
                    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
                } catch (e) {
                    try { el.click(); } catch (e) { }
                }
            }

            clickEl(parsed.followButton);

            const confirmTimeout = 3000;
            const start = Date.now();
            let confirmed = false;
            while (Date.now() - start < confirmTimeout) {
                await utils.sleep(300);
                const txt = (parsed.followButton.textContent || '').toLowerCase();
                if (/following|requested/.test(txt)) { confirmed = true; break; }
            }

            utils.log(`${confirmed ? 'Followed' : 'Attempted'} ${username}`);
            return confirmed;
        } catch (e) {
            utils.log(`Error with ${username}: ${e.message}`);
            return false;
        }
    }

    const controller = {
        running: false,
        async start() {
            if (controller.running) return;
            controller.running = true;
            utils.log('Starting...');

            await utils.sleep(3000);

            const processed = new Set();
            let lastScrollHeight = 0;
            let noChangeCount = 0;

            while (controller.running) {
                if (document.visibilityState !== 'visible') {
                    await utils.sleep(5000);
                    continue;
                }

                const anchors = extractProfileAnchors(document);
                const pending = [];

                for (const a of anchors) {
                    try {
                        const href = a.getAttribute('href') || '';
                        let uname = null;

                        const mRel = href.match(/^\/([A-Za-z0-9_]{1,15})(?:\/.*)?$/);
                        if (mRel) uname = mRel[1];

                        if (!uname) {
                            const mAbs = href.match(/^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})(?:\/.*)?$/);
                            if (mAbs) uname = mAbs[1];
                        }

                        if (uname) {
                            const u = uname.toLowerCase();
                            if (!processed.has(u)) {
                                pending.push({ uname: u, anchor: a });
                            }
                        }
                    } catch (e) { }
                }

                if (pending.length > 0) {
                    utils.log(`Found ${pending.length} new users`);

                    const burstSize = utils.randomBetween(config.burstSizeRange[0], config.burstSizeRange[1]);
                    for (let i = 0; i < Math.min(burstSize, pending.length); i++) {
                        if (!controller.running) break;

                        const { uname, anchor } = pending[i];
                        utils.log(`Processing ${uname}...`);

                        try {
                            const pop = await simulateHover(anchor);
                            const parsed = parsePopover(pop);
                            await unhover(anchor);

                            if (parsed && parsed.followersText && parsed.followingText) {
                                await attemptFollow(uname, anchor, parsed.followersText, parsed.followingText);
                            }
                        } catch (e) {
                            utils.log(`Error processing ${uname}: ${e.message}`);
                        }

                        processed.add(uname);
                        await utils.sleep(utils.randomBetween(config.followDelayRange[0], config.followDelayRange[1]));
                    }

                    await utils.sleep(utils.randomBetween(config.burstCooldownRange[0], config.burstCooldownRange[1]));
                }

                const scrollHeight = document.documentElement.scrollHeight;
                if (scrollHeight === lastScrollHeight) {
                    noChangeCount++;
                    if (noChangeCount > 3) {
                        utils.log('Reached end of thread');
                        controller.running = false;
                        break;
                    }
                } else {
                    noChangeCount = 0;
                    lastScrollHeight = scrollHeight;
                }

                const scrollAmount = utils.randomBetween(300, 800);
                window.scrollBy({ top: scrollAmount, behavior: 'smooth' });

                if (Math.random() > 0.6) {
                    await utils.sleep(utils.randomBetween(500, 1500));
                }

                await utils.sleep(2500);
            }

            utils.log('Stopped');
            controller.running = false;
        },
        stop() {
            controller.running = false;
        }
    };

    window.XFollowInspector = {
        start: controller.start,
        stop: controller.stop,
        config,
        status: () => ({ running: controller.running })
    };

    setTimeout(() => { if (config.autoFollow) controller.start(); }, 2000);
})();
