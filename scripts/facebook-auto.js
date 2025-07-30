// ==UserScript==
// @name            Facebook Hackathon Link Finder
// @namespace       nathfavour
// @version         0.1.0
// @description     Automatically scrolls Facebook search results for hackathons and extracts external links
// @author          nath
// @license         MIT
// @match           https://web.facebook.com/search/posts?q=hackathon*
// @grant           GM_setValue
// @grant           GM_getValue
// @grant           GM_download
// @run-at          document-idle
// @homepage        https://gitlab.com/nathfavour/webscripts
// ==/UserScript==

(function() {
    'use strict';

    // --- Configuration ---
    const MAX_FACEBOOK_DATE = 12 * 60 * 60 * 1000; // 12 hours in ms
    const MAX_FACEBOOK_TIME = 20 * 60 * 1000; // 20 minutes in ms
    const SCROLL_DELAY_MIN = 1000;
    const SCROLL_DELAY_MAX = 2500;
    const LOAD_WAIT_TIME = 1500;
    const AUTO_SAVE_INTERVAL = 300000; // 5 minutes
    const RESET_INTERVAL = 1800000; // 30 minutes
    const ALWAYS_DOWNLOAD_FILE = true;

    const config = {
        foundLinksCache: new Set(),
        startTime: Date.now(),
        running: false,
        autoSaveTimer: null,
        stopTimer: null,
        alwaysDownloadFile: ALWAYS_DOWNLOAD_FILE
    };

    // --- Utilities ---
    const utils = {
        randomBetween: (min, max) => Math.floor(Math.random() * (max - min + 1)) + min,
        sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
        log: msg => {
            const timestamp = new Date().toISOString().replace('T', ' ').substr(0, 19);
            console.log(`[Facebook Hackathon Finder ${timestamp}] ${msg}`);
        },
        isHackathonSearchPage: () => window.location.href.startsWith('https://web.facebook.com/search/posts?q=hackathon'),
        todayDate: () => {
            const now = new Date();
            return { month: now.getMonth(), date: now.getDate(), year: now.getFullYear() };
        },
        parseFacebookDate: (dateStr) => {
            // Handles: "July 10 at 11:38 AM", "April 14", "17h", "3 hours ago", "14 hours ago", "4 days ago"
            dateStr = dateStr.trim();
            const now = new Date();
            // "17h" or "3 hours ago"
            let m;
            if ((m = dateStr.match(/^(\d+)\s*h(ours)?\s*ago?$/i)) || (m = dateStr.match(/^(\d+)h$/))) {
                return new Date(now.getTime() - parseInt(m[1]) * 60 * 60 * 1000);
            }
            // "14m" or "14 minutes ago"
            if ((m = dateStr.match(/^(\d+)\s*m(in(utes)?)?\s*ago?$/i)) || (m = dateStr.match(/^(\d+)m$/))) {
                return new Date(now.getTime() - parseInt(m[1]) * 60 * 1000);
            }
            // "4 days ago"
            if ((m = dateStr.match(/^(\d+)\s*d(ays)?\s*ago?$/i)) || (m = dateStr.match(/^(\d+)d$/))) {
                return new Date(now.getTime() - parseInt(m[1]) * 24 * 60 * 60 * 1000);
            }
            // "July 10 at 11:38 AM"
            if ((m = dateStr.match(/^([A-Za-z]+)\s+(\d+)\s+at\s+(\d{1,2}:\d{2}\s*[AP]M)$/i))) {
                const [_, monthStr, dayStr, timeStr] = m;
                const month = new Date(`${monthStr} 1, 2000`).getMonth();
                const year = now.getFullYear();
                const date = new Date(`${monthStr} ${dayStr}, ${year} ${timeStr}`);
                // If the date is in the future (e.g. Dec 31 when today is Jan 1), use previous year
                if (date > now) date.setFullYear(year - 1);
                return date;
            }
            // "April 14"
            if ((m = dateStr.match(/^([A-Za-z]+)\s+(\d+)$/i))) {
                const [_, monthStr, dayStr] = m;
                const month = new Date(`${monthStr} 1, 2000`).getMonth();
                const year = now.getFullYear();
                const date = new Date(`${monthStr} ${dayStr}, ${year}`);
                if (date > now) date.setFullYear(year - 1);
                return date;
            }
            // "Yesterday at 11:38 AM"
            if ((m = dateStr.match(/^Yesterday at (\d{1,2}:\d{2}\s*[AP]M)$/i))) {
                const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
                const time = m[1];
                const date = new Date(`${yesterday.toDateString()} ${time}`);
                return date;
            }
            // "Just now"
            if (/just now/i.test(dateStr)) {
                return now;
            }
            // fallback: try Date.parse
            const parsed = Date.parse(dateStr);
            if (!isNaN(parsed)) return new Date(parsed);
            return null;
        },
        isDateWithinLimit: (dateObj) => {
            if (!dateObj) return false;
            const now = new Date();
            return (now - dateObj) <= MAX_FACEBOOK_DATE;
        },
        isToday: (dateObj) => {
            if (!dateObj) return false;
            const now = new Date();
            return dateObj.getDate() === now.getDate() &&
                   dateObj.getMonth() === now.getMonth() &&
                   dateObj.getFullYear() === now.getFullYear();
        }
    };

    // --- File Handling ---
    const fileManager = {
        saveLinks: (forceDownload = false) => {
            try {
                const linksArray = Array.from(config.foundLinksCache);
                GM_setValue('facebookLinks', linksArray);
                if ((forceDownload || config.alwaysDownloadFile) && linksArray.length > 0) {
                    const content = linksArray.join('\n');
                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                    const filename = `facebook_hackathon_links_${timestamp}.txt`;
                    GM_download({
                        url: URL.createObjectURL(new Blob([content], {type: 'text/plain'})),
                        name: filename,
                        onload: () => {
                            utils.log(`Downloaded ${linksArray.length} links to ${filename}`);
                            GM_setValue('facebookLinks', []);
                        },
                        onerror: (error) => utils.log(`Error downloading file: ${error}`)
                    });
                } else {
                    GM_setValue('facebookLinks', []);
                }
                return linksArray.length;
            } catch (error) {
                utils.log(`Error saving links: ${error.message}`);
                return 0;
            }
        },
        downloadLinksFile: () => fileManager.saveLinks(true)
    };

    // --- DOM Interaction ---
    const dom = {
        getPostElements: () => {
            // Facebook search results: posts are usually in <div role="article"> or similar
            // We'll look for articles or divs with data-pagelet or role="article"
            const selectors = [
                'div[role="article"]',
                'div[data-pagelet^="FeedUnit_"]'
            ];
            for (const selector of selectors) {
                const elements = document.querySelectorAll(selector);
                if (elements && elements.length > 0) return Array.from(elements);
            }
            return [];
        },
        extractPostTimestamp: (postElement) => {
            // Facebook post time is often in <span> or <a> with aria-label or title or text
            // Try to find a span or a with a date string
            let timeText = null;
            // aria-label or title
            const timeNode = postElement.querySelector('a[aria-label], span[aria-label], a[title], span[title]');
            if (timeNode) {
                timeText = timeNode.getAttribute('aria-label') || timeNode.getAttribute('title');
            }
            // fallback: visible text
            if (!timeText) {
                // Try to find a span or a with a date-like text
                const candidates = postElement.querySelectorAll('a, span');
                for (const el of candidates) {
                    const txt = el.textContent.trim();
                    if (txt.match(/\d{1,2}:\d{2}\s*[AP]M/) || txt.match(/\d+\s*[hm]|\d+\s*days? ago/i) || txt.match(/[A-Za-z]+\s+\d+/)) {
                        timeText = txt;
                        break;
                    }
                }
            }
            if (!timeText) return null;
            return utils.parseFacebookDate(timeText);
        },
        isPostOlderThanLimit: (dateObj) => {
            if (!dateObj) return false;
            return !utils.isDateWithinLimit(dateObj);
        },
        extractLinksFromPost: (postElement) => {
            const links = [];
            const anchors = postElement.querySelectorAll('a[href]');
            anchors.forEach(anchor => {
                const href = anchor.getAttribute('href');
                if (!href) return;
                // Skip Facebook internal links
                if (href.startsWith('/') || href.includes('facebook.com') || href.includes('fb.com')) return;
                // Add only if not already in cache
                if (!config.foundLinksCache.has(href)) {
                    links.push(href);
                }
            });
            return links;
        },
        processPosts: () => {
            const postElements = dom.getPostElements();
            let foundOldPost = false;
            let foundNewLinks = false;
            postElements.forEach(post => {
                const timestamp = dom.extractPostTimestamp(post);
                if (timestamp && dom.isPostOlderThanLimit(timestamp)) {
                    foundOldPost = true;
                }
                const links = dom.extractLinksFromPost(post);
                if (links.length > 0) {
                    links.forEach(link => {
                        if (!config.foundLinksCache.has(link)) {
                            config.foundLinksCache.add(link);
                            utils.log(`Found link: ${link}`);
                            foundNewLinks = true;
                        }
                    });
                }
            });
            return { foundOldPost, foundNewLinks };
        },
        scrollPostsList: async () => {
            // Always scroll the window for reliability
            const scrollAmount = utils.randomBetween(200, 500);
            window.scrollBy({ top: scrollAmount, behavior: 'smooth' });
            await utils.sleep(utils.randomBetween(SCROLL_DELAY_MIN, SCROLL_DELAY_MAX));
        }
    };

    // --- Controller ---
    const controller = {
        start: async () => {
            if (config.running) return;
            config.running = true;
            config.startTime = Date.now();
            utils.log('Starting Facebook hackathon link finder process...');
            // Stop after MAX_FACEBOOK_TIME
            config.stopTimer = setTimeout(() => {
                controller.stop();
                utils.log('Stopped after max run time.');
            }, MAX_FACEBOOK_TIME);
            // Auto-save interval
            config.autoSaveTimer = setInterval(() => {
                const savedCount = fileManager.saveLinks(false);
                utils.log(`Auto-saved ${savedCount} links to storage and file.`);
            }, AUTO_SAVE_INTERVAL);
            // Cache clearing interval
            setInterval(() => {
                const cacheSize = config.foundLinksCache.size;
                fileManager.saveLinks(false);
                config.foundLinksCache.clear();
                utils.log(`Cleared ${cacheSize} links from cache after saving to file.`);
            }, RESET_INTERVAL);

            try {
                while (config.running) {
                    const { foundOldPost, foundNewLinks } = dom.processPosts();
                    // If we found an old post, stop scrolling
                    if (foundOldPost) {
                        utils.log('Found posts older than max date. Stopping...');
                        controller.stop();
                        break;
                    }
                    await dom.scrollPostsList();
                    if (!foundNewLinks) {
                        await utils.sleep(LOAD_WAIT_TIME);
                    }
                    // Stop if max run time exceeded
                    if (Date.now() - config.startTime > MAX_FACEBOOK_TIME) {
                        utils.log('Max run time exceeded. Stopping...');
                        controller.stop();
                        break;
                    }
                }
            } catch (error) {
                utils.log(`Error in main process: ${error.message}`);
                config.running = false;
                setTimeout(() => controller.start(), 5000);
            }
        },
        stop: () => {
            config.running = false;
            if (config.autoSaveTimer) clearInterval(config.autoSaveTimer);
            if (config.stopTimer) clearTimeout(config.stopTimer);
            fileManager.saveLinks(true);
            utils.log('Stopped Facebook hackathon link finder process.');
        }
    };

    // --- Initialization ---
    setTimeout(() => {
        if (utils.isHackathonSearchPage()) {
            controller.start();
        }
    }, 2000);

    // --- Expose API ---
    window.FacebookHackathonFinder = {
        start: controller.start,
        stop: controller.stop,
        config: config,
        downloadLinks: fileManager.downloadLinksFile,
        toggleAutoDownload: (enabled) => {
            config.alwaysDownloadFile = enabled;
            utils.log(`Auto-download ${enabled ? 'enabled' : 'disabled'}`);
        }
    };
    utils.log('API exposed as window.FacebookHackathonFinder');
})();
          