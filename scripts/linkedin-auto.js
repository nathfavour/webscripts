// ==UserScript==
// @name            LinkedIn Hackathon Link Finder
// @namespace       nathfavour
// @version         0.1.0
// @description     Automatically scrolls LinkedIn search results for hackathons and extracts lnkd.in/external links
// @author          nath
// @license         MIT
// @match           https://www.linkedin.com/search/results/content/?datePosted=%22past-24h%22&keywords=hackathon*
// @grant           GM_setValue
// @grant           GM_getValue
// @grant           GM_download
// @run-at          document-idle
// @homepage        https://gitlab.com/nathfavour/webscripts
// ==/UserScript==

(function() {
    'use strict';

    // --- Configuration ---
    const MAX_LINKEDIN_TIME = 60 * 60 * 1000; // 1 hour in ms
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
            console.log(`[LinkedIn Hackathon Finder ${timestamp}] ${msg}`);
        },
        isHackathonSearchPage: () =>
            window.location.href.startsWith('https://www.linkedin.com/search/results/content/?datePosted=%22past-24h%22&keywords=hackathon')
    };

    // --- File Handling ---
    const fileManager = {
        saveLinks: (forceDownload = false) => {
            try {
                const linksArray = Array.from(config.foundLinksCache);
                GM_setValue('linkedinLinks', linksArray);
                if ((forceDownload || config.alwaysDownloadFile) && linksArray.length > 0) {
                    const content = linksArray.join('\n');
                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                    const filename = `linkedin_hackathon_links_${timestamp}.txt`;
                    GM_download({
                        url: URL.createObjectURL(new Blob([content], {type: 'text/plain'})),
                        name: filename,
                        onload: () => {
                            utils.log(`Downloaded ${linksArray.length} links to ${filename}`);
                            GM_setValue('linkedinLinks', []);
                        },
                        onerror: (error) => utils.log(`Error downloading file: ${error}`)
                    });
                } else {
                    GM_setValue('linkedinLinks', []);
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
        extractLinks: () => {
            // LinkedIn search results: links are in <a> tags, ignore internal linkedin.com except lnkd.in
            const anchors = document.querySelectorAll('a[href]');
            let foundNewLinks = false;
            anchors.forEach(anchor => {
                const href = anchor.getAttribute('href');
                if (!href) return;
                // Only lnkd.in or external (not linkedin.com) links
                if (
                    href.includes('lnkd.in') ||
                    (!href.includes('linkedin.com') && !href.startsWith('/'))
                ) {
                    if (!config.foundLinksCache.has(href)) {
                        config.foundLinksCache.add(href);
                        utils.log(`Found link: ${href}`);
                        foundNewLinks = true;
                    }
                }
            });
            return foundNewLinks;
        },
        scrollResults: async () => {
            // Scroll the window to load more results
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
            utils.log('Starting LinkedIn hackathon link finder process...');
            // Stop after MAX_LINKEDIN_TIME
            config.stopTimer = setTimeout(() => {
                controller.stop();
                utils.log('Stopped after max run time.');
            }, MAX_LINKEDIN_TIME);
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
                    const foundNewLinks = dom.extractLinks();
                    await dom.scrollResults();
                    if (!foundNewLinks) {
                        await utils.sleep(LOAD_WAIT_TIME);
                    }
                    // Stop if max run time exceeded
                    if (Date.now() - config.startTime > MAX_LINKEDIN_TIME) {
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
            utils.log('Stopped LinkedIn hackathon link finder process.');
        }
    };

    // --- Initialization ---
    setTimeout(() => {
        if (utils.isHackathonSearchPage()) {
            controller.start();
        }
    }, 2000);

    // --- Expose API ---
    window.LinkedInHackathonFinder = {
        start: controller.start,
        stop: controller.stop,
        config: config,
        downloadLinks: fileManager.downloadLinksFile,
        toggleAutoDownload: (enabled) => {
            config.alwaysDownloadFile = enabled;
            utils.log(`Auto-download ${enabled ? 'enabled' : 'disabled'}`);
        }
    };
    utils.log('API exposed as window.LinkedInHackathonFinder');
})();
