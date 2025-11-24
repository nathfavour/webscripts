// ==UserScript==
// @name         YouTube Context Video Downloader
// @namespace    nathfavour
// @version      2.0.0
// @description  Adds a download button to the video metadata line (feed) and action bar (watch page).
// @author       nath
// @license      MIT
// @match        https://www.youtube.com/*
// @match        https://youtube.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_addStyle
// @connect      www.yt-download.org
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    const CONFIG = {
        apiBase: 'https://www.yt-download.org/api/button/mp4/',
        feedButtonClass: 'ytdl-feed-btn',
        watchButtonClass: 'ytdl-watch-btn',
        processedAttr: 'data-ytdl-processed'
    };

    const STYLES = `
        /* Feed Button (Metadata style) */
        .ytdl-feed-btn {
            display: inline-block;
            margin-left: 8px;
            cursor: pointer;
            color: var(--yt-spec-text-secondary);
            font-family: "Roboto","Arial",sans-serif;
            font-size: 1.2rem;
            line-height: 1.8rem;
            font-weight: 500;
            text-decoration: none;
            opacity: 0.8;
            transition: opacity 0.2s, color 0.2s;
        }
        .ytdl-feed-btn:hover {
            opacity: 1;
            color: var(--yt-spec-text-primary);
            text-decoration: underline;
        }
        .ytdl-feed-btn::before {
            content: "•";
            margin-right: 8px;
            color: var(--yt-spec-text-secondary);
        }

        /* Watch Page Button (Chip style) */
        .ytdl-watch-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            background-color: rgba(255, 255, 255, 0.1);
            color: var(--yt-spec-text-primary);
            border-radius: 18px;
            padding: 0 16px;
            height: 36px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            margin-left: 8px;
            font-family: "Roboto","Arial",sans-serif;
            border: none;
            transition: background-color 0.2s;
        }
        .ytdl-watch-btn:hover {
            background-color: rgba(255, 255, 255, 0.2);
        }
        
        /* Toast */
        .ytdl-toast {
            position: fixed;
            bottom: 40px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 12px 24px;
            border-radius: 24px;
            z-index: 10001;
            font-size: 14px;
            font-family: Roboto, Arial, sans-serif;
            animation: fadein 0.3s, fadeout 0.3s 2.7s;
            pointer-events: none;
        }
        @keyframes fadein { from { opacity: 0; transform: translate(-50%, 10px); } to { opacity: 1; transform: translate(-50%, 0); } }
        @keyframes fadeout { from { opacity: 1; transform: translate(-50%, 0); } to { opacity: 0; transform: translate(-50%, 10px); } }
    `;

    // --- Utils ---

    function log(...args) {
        // console.log('[YTDL]', ...args);
    }

    function getVideoId(url) {
        if (!url) return null;
        try {
            const u = new URL(url, window.location.href);
            if (u.hostname.includes('youtu.be')) return u.pathname.slice(1);
            if (u.pathname.includes('/shorts/')) return u.pathname.split('/shorts/')[1];
            if (u.searchParams.has('v')) return u.searchParams.get('v');
            return null;
        } catch (e) { return null; }
    }

    function showToast(msg) {
        const toast = document.createElement('div');
        toast.className = 'ytdl-toast';
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    // --- Download Logic ---

    async function startDownload(videoId, title) {
        showToast(`Fetching download links...`);
        
        try {
            const response = await new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: CONFIG.apiBase + videoId,
                    onload: resolve,
                    onerror: reject
                });
            });

            if (response.status !== 200) throw new Error('API Error');

            const parser = new DOMParser();
            const doc = parser.parseFromString(response.responseText, 'text/html');
            const links = Array.from(doc.querySelectorAll('a[href]'))
                .filter(a => a.href.includes('download'))
                .map(a => ({
                    href: a.href,
                    text: a.textContent.trim()
                }));

            if (links.length === 0) throw new Error('No links found');

            // Pick the first one (usually best quality MP4)
            const selected = links[0];

            showToast(`Downloading: ${title || videoId}`);
            
            GM_download({
                url: selected.href,
                name: `${title || videoId}.mp4`,
                saveAs: true,
                onload: () => showToast('Download finished!'),
                onerror: (e) => showToast('Download failed')
            });

        } catch (e) {
            console.error(e);
            showToast('Error: ' + (e.message || 'Failed to get links'));
        }
    }

    // --- Injection Logic ---

    function injectFeedButtons(node) {
        // Target: #metadata-line inside ytd-video-meta-block
        // This appears in Home feed, Search results, Related videos
        const metaLines = (node.querySelectorAll ? node.querySelectorAll('#metadata-line') : []);
        
        metaLines.forEach(line => {
            if (line.hasAttribute(CONFIG.processedAttr)) return;
            
            // Find the video link to get ID
            // Usually up the tree: ytd-video-meta-block -> ytd-rich-grid-media / ytd-compact-video-renderer -> a#thumbnail
            // Or simpler: look for the main link in the container
            const container = line.closest('ytd-rich-item-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, ytd-video-renderer, ytd-playlist-panel-video-renderer');
            if (!container) return;

            const link = container.querySelector('a#thumbnail, a.ytd-thumbnail');
            if (!link) return;

            const videoId = getVideoId(link.href);
            if (!videoId) return;

            // Mark processed
            line.setAttribute(CONFIG.processedAttr, 'true');

            // Create "Download" text link
            const btn = document.createElement('span');
            btn.className = CONFIG.feedButtonClass;
            btn.textContent = 'Download';
            btn.title = 'Download Video';
            
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                // Try to get title
                const titleEl = container.querySelector('#video-title');
                const title = titleEl ? titleEl.textContent.trim() : videoId;
                
                startDownload(videoId, title);
            });

            // Append to the metadata line
            line.appendChild(btn);
        });
    }

    function injectWatchButton() {
        // Target: #top-level-buttons-computed inside ytd-menu-renderer (The main action bar)
        // This is for the main video player page
        const actionsBar = document.querySelector('ytd-menu-renderer #top-level-buttons-computed');
        if (!actionsBar) return;
        
        // Check if we already injected
        if (actionsBar.querySelector('.' + CONFIG.watchButtonClass)) return;

        // Get current video ID from URL
        const videoId = getVideoId(window.location.href);
        if (!videoId) return;

        const btn = document.createElement('button');
        btn.className = CONFIG.watchButtonClass;
        btn.textContent = 'Download';
        
        btn.addEventListener('click', () => {
            const title = document.title.replace(' - YouTube', '');
            startDownload(videoId, title);
        });

        // Insert as the first item or append
        actionsBar.insertBefore(btn, actionsBar.firstChild);
    }

    function process(mutations) {
        // Feed injection
        mutations.forEach(m => {
            m.addedNodes.forEach(node => {
                if (node.nodeType === 1) {
                    injectFeedButtons(node);
                    // Also check if the node itself is a target
                    if (node.matches && node.matches('#metadata-line')) {
                        // wrap in a dummy parent for the function
                        const wrapper = document.createElement('div');
                        wrapper.appendChild(node.cloneNode(true)); 
                        // Actually, injectFeedButtons searches inside, so we can just pass document.body if needed, 
                        // but for performance we want to be specific.
                        // If #metadata-line is added directly, we need to handle it.
                        // But usually it's part of a larger component.
                    }
                }
            });
        });
        
        // Watch page injection (simpler to just check existence periodically or on nav)
        injectWatchButton();
    }

    function init() {
        // Add Styles
        const style = document.createElement('style');
        style.textContent = STYLES;
        document.head.appendChild(style);

        // Observer
        const observer = new MutationObserver(process);
        observer.observe(document.body, { childList: true, subtree: true });

        // Initial pass
        injectFeedButtons(document.body);
        injectWatchButton();
        
        // Handle navigation events (SPA)
        window.addEventListener('yt-navigate-finish', () => {
            setTimeout(() => {
                injectWatchButton();
                injectFeedButtons(document.body);
            }, 1000); // Slight delay for render
        });
    }

    init();

})();
