// ==UserScript==
// @name         YouTube Context Video Downloader
// @namespace    nathfavour
// @version      2.1.0
// @description  Adds a download button to the video metadata line (feed) and action bar (watch page) with a quality selection overlay.
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

        /* Modal Overlay */
        .ytdl-modal-overlay {
            position: fixed;
            top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.6);
            z-index: 10002;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: Roboto, Arial, sans-serif;
        }
        .ytdl-modal {
            background: #212121;
            color: #fff;
            padding: 20px;
            border-radius: 12px;
            width: 320px;
            max-width: 90%;
            box-shadow: 0 10px 25px rgba(0,0,0,0.5);
            border: 1px solid #333;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .ytdl-modal h3 {
            margin: 0 0 8px 0;
            font-size: 18px;
            font-weight: 500;
            border-bottom: 1px solid #333;
            padding-bottom: 12px;
        }
        .ytdl-option {
            display: flex;
            justify-content: space-between;
            align-items: center;
            width: 100%;
            padding: 12px;
            background: #333;
            border: none;
            border-radius: 6px;
            color: #fff;
            text-align: left;
            cursor: pointer;
            font-size: 14px;
            transition: background 0.2s;
        }
        .ytdl-option:hover {
            background: #444;
        }
        .ytdl-close {
            margin-top: 8px;
            background: transparent;
            border: 1px solid #555;
            color: #aaa;
            width: 100%;
            padding: 10px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
        }
        .ytdl-close:hover {
            background: #333;
            color: #fff;
        }
    `;

    // --- Utils ---

    // Trusted Types Policy Creation
    let policy = null;
    if (window.trustedTypes && window.trustedTypes.createPolicy) {
        try {
            policy = window.trustedTypes.createPolicy('ytdl_policy', {
                createHTML: (string) => string
            });
        } catch (e) {
            // Policy might already exist or be blocked
        }
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

    async function fetchAndShowOptions(videoId, title) {
        showToast(`Fetching options...`);
        
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

            const htmlContent = response.responseText;
            let links = [];

            // Attempt to parse HTML safely
            try {
                const parser = new DOMParser();
                const safeHtml = policy ? policy.createHTML(htmlContent) : htmlContent;
                const doc = parser.parseFromString(safeHtml, 'text/html');
                
                links = Array.from(doc.querySelectorAll('a[href]'))
                    .filter(a => a.href.includes('download'))
                    .map(a => ({
                        href: a.href,
                        text: a.textContent.trim()
                    }));
            } catch (e) {
                // Fallback: Regex extraction if TrustedHTML blocks DOMParser
                console.warn('YTDL: DOMParser failed, using regex fallback');
                const regex = /<a[^>]+href="([^"]+)"[^>]*class="[^"]*btn[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
                let match;
                while ((match = regex.exec(htmlContent)) !== null) {
                    links.push({
                        href: match[1],
                        text: match[2].replace(/<[^>]+>/g, '').trim()
                    });
                }
            }

            if (links.length === 0) throw new Error('No links found');

            showModal(links, title, videoId);

        } catch (e) {
            console.error(e);
            showToast('Error: ' + (e.message || 'Failed to get links'));
        }
    }

    function showModal(links, title, videoId) {
        // Remove existing
        const existing = document.querySelector('.ytdl-modal-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.className = 'ytdl-modal-overlay';
        
        const modal = document.createElement('div');
        modal.className = 'ytdl-modal';
        
        const header = document.createElement('h3');
        header.textContent = 'Download Options';
        modal.appendChild(header);

        links.forEach(link => {
            const btn = document.createElement('button');
            btn.className = 'ytdl-option';
            btn.textContent = link.text;
            btn.onclick = () => {
                overlay.remove();
                downloadFile(link.href, title || videoId);
            };
            modal.appendChild(btn);
        });

        const closeBtn = document.createElement('button');
        closeBtn.className = 'ytdl-close';
        closeBtn.textContent = 'Cancel';
        closeBtn.onclick = () => overlay.remove();
        modal.appendChild(closeBtn);

        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        
        // Close on background click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });
    }

    function downloadFile(url, title) {
        showToast(`Starting download...`);
        GM_download({
            url: url,
            name: `${title}.mp4`,
            saveAs: true,
            onload: () => showToast('Download finished!'),
            onerror: (e) => showToast('Download failed')
        });
    }

    // --- Injection Logic ---

    function injectFeedButtons(node) {
        // Target: #metadata-line inside ytd-video-meta-block
        const metaLines = (node.querySelectorAll ? node.querySelectorAll('#metadata-line') : []);
        
        metaLines.forEach(line => {
            if (line.hasAttribute(CONFIG.processedAttr)) return;
            
            const container = line.closest('ytd-rich-item-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, ytd-video-renderer, ytd-playlist-panel-video-renderer');
            if (!container) return;

            const link = container.querySelector('a#thumbnail, a.ytd-thumbnail');
            if (!link) return;

            const videoId = getVideoId(link.href);
            if (!videoId) return;

            line.setAttribute(CONFIG.processedAttr, 'true');

            const btn = document.createElement('span');
            btn.className = CONFIG.feedButtonClass;
            btn.textContent = 'Download';
            btn.title = 'Download Video';
            
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                const titleEl = container.querySelector('#video-title');
                const title = titleEl ? titleEl.textContent.trim() : videoId;
                
                fetchAndShowOptions(videoId, title);
            });

            line.appendChild(btn);
        });
    }

    function injectWatchButton() {
        const actionsBar = document.querySelector('ytd-menu-renderer #top-level-buttons-computed');
        if (!actionsBar) return;
        
        if (actionsBar.querySelector('.' + CONFIG.watchButtonClass)) return;

        const videoId = getVideoId(window.location.href);
        if (!videoId) return;

        const btn = document.createElement('button');
        btn.className = CONFIG.watchButtonClass;
        btn.textContent = 'Download';
        
        btn.addEventListener('click', () => {
            const title = document.title.replace(' - YouTube', '');
            fetchAndShowOptions(videoId, title);
        });

        actionsBar.insertBefore(btn, actionsBar.firstChild);
    }

    function process(mutations) {
        mutations.forEach(m => {
            m.addedNodes.forEach(node => {
                if (node.nodeType === 1) {
                    injectFeedButtons(node);
                }
            });
        });
        injectWatchButton();
    }

    function init() {
        const style = document.createElement('style');
        style.textContent = STYLES;
        document.head.appendChild(style);

        const observer = new MutationObserver(process);
        observer.observe(document.body, { childList: true, subtree: true });

        injectFeedButtons(document.body);
        injectWatchButton();
        
        window.addEventListener('yt-navigate-finish', () => {
            setTimeout(() => {
                injectWatchButton();
                injectFeedButtons(document.body);
            }, 1000);
        });
    }

    init();

})();
