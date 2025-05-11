// ==UserScript==
// @name            Twitter Hackathon Link Finder
// @namespace       nathfavour
// @version         0.1.0
// @description     Automatically scrolls Twitter search results for hackathons and extracts external links
// @author          nath
// @license         MIT
// @match           https://twitter.com/search*
// @match           https://x.com/search*
// @grant           GM_setValue
// @grant           GM_getValue
// @grant           GM_download
// @run-at          document-idle
// @homepage        https://gitlab.com/nathfavour/webscripts
// ==/UserScript==

(function() {
    'use strict';

    // Configuration
    const config = {
        searchQuery: 'hackathon',
        timeLimitHours: 12,
        scrollDelayMin: 1000,  // Minimum time between scrolls (ms)
        scrollDelayMax: 3000,  // Maximum time between scrolls (ms)
        scrollAmount: {
            min: 100,          // Minimum pixels to scroll each time
            max: 400           // Maximum pixels to scroll each time
        },
        loadWaitTime: 1500,    // Time to wait for content to load (ms)
        foundLinksCache: new Set(), // Store found links to avoid duplicates
        resetInterval: 1800000,  // Clear cache every 30 minutes (ms)
        autoSaveInterval: 300000, // Save links to file every 5 minutes (ms)
        fileName: "hackathon_links.txt", // Default file name
        alwaysDownloadFile: true // Always download file when saving
    };

    // Load previously saved links if available
    const initializeCache = () => {
        try {
            const savedLinks = GM_getValue('hackathonLinks', []);
            if (Array.isArray(savedLinks) && savedLinks.length > 0) {
                savedLinks.forEach(link => config.foundLinksCache.add(link));
                utils.log(`Loaded ${savedLinks.length} saved links from storage`);
            }
        } catch (error) {
            utils.log(`Error loading saved links: ${error.message}`);
        }
    };

    // File handling functions
    const fileManager = {
        /**
         * Save links to storage and download as file
         */
        saveLinks: (forceDownload = false) => {
            try {
                // Convert Set to Array for storage
                const linksArray = Array.from(config.foundLinksCache);
                
                // Save to GM storage
                GM_setValue('hackathonLinks', linksArray);
                
                // Download file if forced or if always download is enabled
                if ((forceDownload || config.alwaysDownloadFile) && linksArray.length > 0) {
                    const content = linksArray.join('\n');
                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                    const filename = `hackathon_links_${timestamp}.txt`;
                    
                    GM_download({
                        url: URL.createObjectURL(new Blob([content], {type: 'text/plain'})),
                        name: filename,
                        onload: () => {
                            utils.log(`Downloaded ${linksArray.length} links to ${filename}`);
                            // Clear storage after saving
                            GM_setValue('hackathonLinks', []);
                            utils.log('Cleared storage after saving');
                        },
                        onerror: (error) => utils.log(`Error downloading file: ${error}`)
                    });
                } else {
                    // Clear storage even if no download was performed
                    GM_setValue('hackathonLinks', []);
                    utils.log('Cleared storage after saving');
                }
                
                return linksArray.length;
            } catch (error) {
                utils.log(`Error saving links: ${error.message}`);
                return 0;
            }
        },
        
        /**
         * Download all collected links as a text file
         */
        downloadLinksFile: () => {
            fileManager.saveLinks(true);
        }
    };

    // Utility functions
    const utils = {
        /**
         * Generate a random number between min and max
         */
        randomBetween: (min, max) => {
            return Math.floor(Math.random() * (max - min + 1)) + min;
        },

        /**
         * Sleep for a given amount of time
         */
        sleep: (ms) => {
            return new Promise(resolve => setTimeout(resolve, ms));
        },

        /**
         * Get a random delay for scrolling
         */
        getRandomDelay: () => {
            return utils.randomBetween(config.scrollDelayMin, config.scrollDelayMax);
        },

        /**
         * Log with timestamp
         */
        log: (message) => {
            const timestamp = new Date().toISOString().replace('T', ' ').substr(0, 19);
            console.log(`[Twitter Hackathon Finder ${timestamp}] ${message}`);
        },

        /**
         * Check if URL contains search query for hackathons
         */
        isHackathonSearchPage: () => {
            const url = window.location.href.toLowerCase();
            return (
                url.includes('twitter.com/search') || 
                url.includes('x.com/search')
            ) && url.includes(config.searchQuery);
        },
        
        /**
         * Check if URL contains 'live'
         */
        isLiveSearchPage: () => {
            return window.location.href.toLowerCase().includes('live');
        },
        
        /**
         * Scroll to the top of the page quickly
         */
        scrollToTop: async () => {
            window.scrollTo({ top: 0, behavior: 'auto' });
            await utils.sleep(1000);
        },
        
        /**
         * Reload the page
         */
        reloadPage: () => {
            window.location.reload();
        }
    };

    // DOM interaction functions
    const dom = {
        /**
         * Perform a human-like scroll
         */
        humanLikeScroll: async () => {
            const scrollAmount = utils.randomBetween(config.scrollAmount.min, config.scrollAmount.max);
            window.scrollBy({
                top: scrollAmount,
                behavior: 'smooth'
            });
            
            // Sometimes pause briefly during scrolling to simulate human behavior
            if (Math.random() > 0.7) {
                await utils.sleep(utils.randomBetween(200, 800));
            }
            
            await utils.sleep(utils.getRandomDelay());
            return scrollAmount;
        },

        /**
         * Get all tweet elements currently in the DOM
         */
        getTweetElements: () => {
            // Multiple selectors to try and find tweet elements for resilience
            const selectors = [
                'article[role="article"]',
                'div[data-testid="tweet"]',
                'div[data-testid="tweetText"]',
                'div.css-175oi2r[tabindex="0"]'
            ];
            
            // Try each selector and return the first one that finds elements
            for (const selector of selectors) {
                const elements = document.querySelectorAll(selector);
                if (elements && elements.length > 0) {
                    return Array.from(elements);
                }
            }
            
            return [];
        },

        /**
         * Extract timestamp from a tweet element
         */
        extractTweetTimestamp: (tweetElement) => {
            try {
                // Try multiple ways to find the timestamp
                const timeSelectors = [
                    'time',
                    'a[href*="status"] time',
                    'span[data-testid="timestamp"]',
                    'a[role="link"][aria-label*="ago"]'
                ];
                
                let timeElement = null;
                for (const selector of timeSelectors) {
                    timeElement = tweetElement.querySelector(selector);
                    if (timeElement) break;
                }
                
                if (!timeElement) return null;
                
                // Try to get the datetime attribute first
                if (timeElement.getAttribute('datetime')) {
                    return new Date(timeElement.getAttribute('datetime'));
                }
                
                // Fallback to text content parsing
                const timeText = timeElement.textContent.trim();
                if (timeText.includes('h')) {
                    const hours = parseInt(timeText.match(/(\d+)h/)?.[1] || '0');
                    const now = new Date();
                    return new Date(now.getTime() - hours * 60 * 60 * 1000);
                } else if (timeText.includes('m')) {
                    const minutes = parseInt(timeText.match(/(\d+)m/)?.[1] || '0');
                    const now = new Date();
                    return new Date(now.getTime() - minutes * 60 * 1000);
                } else if (timeText.includes('s')) {
                    const seconds = parseInt(timeText.match(/(\d+)s/)?.[1] || '0');
                    const now = new Date();
                    return new Date(now.getTime() - seconds * 1000);
                } else if (timeText.includes('d')) {
                    // If we see days, it's definitely older than 12 hours
                    return new Date(0); // Very old date
                }
                
                return null;
            } catch (error) {
                utils.log(`Error extracting timestamp: ${error.message}`);
                return null;
            }
        },

        /**
         * Check if a tweet is older than the time limit
         */
        isTweetOlderThanLimit: (timestamp) => {
            if (!timestamp) return false;
            
            const now = new Date();
            const diffHours = (now - timestamp) / (1000 * 60 * 60);
            return diffHours > config.timeLimitHours;
        },

        /**
         * Extract external links from a tweet
         */
        extractLinksFromTweet: (tweetElement) => {
            try {
                const links = [];
                const anchorElements = tweetElement.querySelectorAll('a[href]');
                
                anchorElements.forEach(anchor => {
                    const href = anchor.getAttribute('href');
                    if (!href) return;
                    
                    // Skip Twitter/X internal links
                    if (href.startsWith('/') || 
                        href.includes('twitter.com') || 
                        href.includes('x.com') ||
                        href.includes('t.co')) {
                        
                        // For t.co links, we need to click or extract the final URL
                        if (href.includes('t.co')) {
                            // Store the t.co link as a fallback
                            if (!config.foundLinksCache.has(href)) {
                                links.push(href);
                            }
                        }
                        return;
                    }
                    
                    // Add external links only if not already in cache
                    if (!config.foundLinksCache.has(href)) {
                        links.push(href);
                    }
                });
                
                return links;
            } catch (error) {
                utils.log(`Error extracting links: ${error.message}`);
                return [];
            }
        },

        /**
         * Process all currently visible tweets
         */
        processTweets: () => {
            const tweetElements = dom.getTweetElements();
            let foundOldTweet = false;
            let foundNewLinks = false;
            
            tweetElements.forEach(tweet => {
                // Check if tweet is old
                const timestamp = dom.extractTweetTimestamp(tweet);
                if (timestamp && dom.isTweetOlderThanLimit(timestamp)) {
                    foundOldTweet = true;
                }
                
                // Extract and log links regardless of tweet age
                const links = dom.extractLinksFromTweet(tweet);
                if (links.length > 0) {
                    links.forEach(link => {
                        // Add to cache and log
                        if (!config.foundLinksCache.has(link)) {
                            config.foundLinksCache.add(link);
                            utils.log(`Found link: ${link}`);
                            foundNewLinks = true;
                        }
                    });
                }
            });
            
            return { foundOldTweet, foundNewLinks };
        }
    };

    // Main process controller
    const controller = {
        running: false,
        autoSaveTimer: null,
        
        /**
         * Initialize the script
         */
        init: () => {
            // Load previously saved links
            initializeCache();
            
            if (!utils.isHackathonSearchPage()) {
                utils.log('Not on a hackathon search page. Script will wait for navigation.');
                
                // Set up a mutation observer to detect URL changes
                const observer = new MutationObserver((mutations) => {
                    if (utils.isHackathonSearchPage() && !controller.running) {
                        controller.start();
                    }
                });
                
                observer.observe(document.body, { childList: true, subtree: true });
                
                // Also check URL changes
                let lastUrl = location.href;
                new MutationObserver(() => {
                    const url = location.href;
                    if (url !== lastUrl) {
                        lastUrl = url;
                        if (utils.isHackathonSearchPage() && !controller.running) {
                            controller.start();
                        }
                    }
                }).observe(document, { subtree: true, childList: true });
                
                return;
            }
            
            controller.start();
            
            // Set up auto-save interval
            controller.autoSaveTimer = setInterval(() => {
                const savedCount = fileManager.saveLinks(false);
                utils.log(`Auto-saved ${savedCount} links to storage and file.`);
            }, config.autoSaveInterval);
            
            // Set up cache clearing interval
            setInterval(() => {
                const cacheSize = config.foundLinksCache.size;
                // Save before clearing
                fileManager.saveLinks(false);
                config.foundLinksCache.clear();
                utils.log(`Cleared ${cacheSize} links from cache after saving to file.`);
            }, config.resetInterval);
        },
        
        /**
         * Start the scrolling process
         */
        start: async () => {
            if (controller.running) return;
            
            controller.running = true;
            utils.log('Starting Twitter hackathon link finder process...');
            
            try {
                while (controller.running) {
                    // Process current tweets
                    const { foundOldTweet, foundNewLinks } = dom.processTweets();
                    
                    // If we found a tweet older than the limit, restart only if URL has 'live'
                    if (foundOldTweet && utils.isLiveSearchPage()) {
                        utils.log('Found tweets older than 12 hours and URL contains "live". Restarting...');
                        // Save links before restarting
                        fileManager.saveLinks(false);
                        await utils.scrollToTop();
                        utils.reloadPage();
                        break;
                    }
                    
                    // Scroll down to load more content
                    await dom.humanLikeScroll();
                    
                    // If we scrolled but didn't find new content, wait a bit longer for loading
                    if (!foundNewLinks) {
                        await utils.sleep(config.loadWaitTime);
                    }
                }
            } catch (error) {
                utils.log(`Error in main process: ${error.message}`);
                controller.running = false;
                
                // Attempt recovery after error
                setTimeout(() => {
                    controller.start();
                }, 5000);
            }
        },
        
        /**
         * Stop the scrolling process
         */
        stop: () => {
            controller.running = false;
            if (controller.autoSaveTimer) {
                clearInterval(controller.autoSaveTimer);
            }
            // Save links when stopping
            fileManager.saveLinks(true);
            utils.log('Stopping Twitter hackathon link finder process...');
        }
    };

    // Initialize after a short delay to ensure page is fully loaded
    setTimeout(() => {
        controller.init();
    }, 2000);

    // Create a more robust way to expose the API
    const exposeAPI = () => {
        window.TwitterHackathonFinder = {
            start: controller.start,
            stop: controller.stop,
            config: config,
            downloadLinks: fileManager.downloadLinksFile,
            toggleAutoDownload: (enabled) => {
                config.alwaysDownloadFile = enabled;
                utils.log(`Auto-download ${enabled ? 'enabled' : 'disabled'}`);
            }
        };
        // Log that API is available
        utils.log('API exposed as window.TwitterHackathonFinder');
    };
    
    // Attempt to expose API and retry if needed
    exposeAPI();
    setTimeout(exposeAPI, 5000);  // Try again after 5 seconds
})();
