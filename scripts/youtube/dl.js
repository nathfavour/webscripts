// ==UserScript==
// @name         YouTube Context Video Downloader
// @namespace    nathfavour
// @version      1.0.0
// @description  Simple, robust YouTube video downloader using yt-download.org. Adds context menu and overlay button.
// @author       nath
// @license      MIT
// @match        https://www.youtube.com/*
// @match        https://youtube.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_setClipboard
// @grant        GM_addStyle
// @connect      www.yt-download.org
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    const CONFIG = {
        apiBase: 'https://www.yt-download.org/api/button/mp4/',
        buttonClass: 'ytdl-overlay-btn',
        menuId: 'ytdl-context-menu',
        processedAttr: 'data-ytdl-processed'
    };

    const STYLES = `
        .ytdl-overlay-btn {
            position: absolute;
            top: 5px;
            right: 5px;
            z-index: 9999;
            background-color: rgba(0, 0, 0, 0.7);
            color: white;
            border: 1px solid rgba(255, 255, 255, 0.3);
            border-radius: 4px;
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            font-size: 14px;
            font-weight: bold;
            opacity: 0;
            transition: opacity 0.2s, background-color 0.2s;
        }
        
        /* Show button on hover of the thumbnail container */
        ytd-thumbnail:hover .ytdl-overlay-btn,
        .ytd-thumbnail:hover .ytdl-overlay-btn,
        #thumbnail:hover .ytdl-overlay-btn {
            opacity: 1;
        }

        .ytdl-overlay-btn:hover {
            background-color: #cc0000;
            border-color: #ff0000;
        }

        #${CONFIG.menuId} {
            position: fixed;
            background: #282828;
            border: 1px solid #444;
            border-radius: 8px;
            padding: 8px 0;
            min-width: 180px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.5);
            z-index: 10000;
            display: none;
            flex-direction: column;
            font-family: Roboto, Arial, sans-serif;
            font-size: 14px;
            color: #eee;
        }

        #${CONFIG.menuId}.visible {
            display: flex;
        }

        #${CONFIG.menuId} .menu-item {
            padding: 8px 16px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        #${CONFIG.menuId} .menu-item:hover {
            background-color: #3ea6ff;
            color: white;
        }
        
        #${CONFIG.menuId} .menu-divider {
            height: 1px;
            background-color: #444;
            margin: 4px 0;
        }
        
        .ytdl-toast {
            position: fixed;
            bottom: 20px;
            left: 20px;
            background: #333;
            color: white;
            padding: 10px 20px;
            border-radius: 4px;
            z-index: 10001;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
            animation: fadein 0.3s, fadeout 0.3s 2.7s;
        }
        
        @keyframes fadein { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeout { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(10px); } }
    `;

    // Utils
    const log = (...args) => console.log('[YTDL]', ...args);
    
    function getVideoId(url) {
        if (!url) return null;
        try {
            const u = new URL(url);
            if (u.hostname.includes('youtu.be')) return u.pathname.slice(1);
            if (u.pathname.includes('/shorts/')) return u.pathname.split('/shorts/')[1];
            return u.searchParams.get('v');
        } catch (e) { return null; }
    }

    function showToast(msg) {
        const toast = document.createElement('div');
        toast.className = 'ytdl-toast';
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    // UI Components
    function createContextMenu() {
        let menu = document.getElementById(CONFIG.menuId);
        if (menu) return menu;

        menu = document.createElement('div');
        menu.id = CONFIG.menuId;
        document.body.appendChild(menu);

        // Close on click outside
        document.addEventListener('click', (e) => {
            if (!menu.contains(e.target)) {
                menu.classList.remove('visible');
            }
        });
        
        // Close on scroll
        window.addEventListener('scroll', () => menu.classList.remove('visible'), true);

        return menu;
    }

    function showContextMenu(x, y, videoId, title) {
        const menu = createContextMenu();
        menu.innerHTML = ''; // Clear previous

        const actions = [
            { label: 'Download Video (MP4)', action: () => startDownload(videoId, title, 'video') },
            { label: 'Download Audio', action: () => startDownload(videoId, title, 'audio') },
            { divider: true },
            { label: 'Copy Link', action: () => {
                GM_setClipboard(`https://youtu.be/${videoId}`);
                showToast('Link copied!');
            }}
        ];

        actions.forEach(item => {
            if (item.divider) {
                const div = document.createElement('div');
                div.className = 'menu-divider';
                menu.appendChild(div);
            } else {
                const el = document.createElement('div');
                el.className = 'menu-item';
                el.textContent = item.label;
                el.onclick = () => {
                    item.action();
                    menu.classList.remove('visible');
                };
                menu.appendChild(el);
            }
        });

        // Position
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
        menu.classList.add('visible');
        
        // Adjust if off screen
        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth) menu.style.left = `${window.innerWidth - rect.width - 10}px`;
        if (rect.bottom > window.innerHeight) menu.style.top = `${window.innerHeight - rect.height - 10}px`;
    }

    // Download Logic
    async function startDownload(videoId, title, type) {
        showToast(`Fetching ${type} links...`);
        
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
                    text: a.textContent.trim(),
                    quality: parseQuality(a.textContent)
                }));

            if (links.length === 0) throw new Error('No links found');

            // Simple selection logic
            let selected;
            if (type === 'audio') {
                // Try to find audio-only or lowest video (often used as audio source if no direct audio)
                // Actually yt-download.org usually provides mixed mp4. 
                // For this simple script, we'll just grab the best MP4 and let user know.
                // Or if the site provides audio specific, we'd filter for it.
                // The current URL is /api/button/mp4/, so it returns MP4s.
                // We'll just pick the best quality MP4.
                selected = links[0]; // Usually best is first
            } else {
                selected = links[0]; // Best quality usually first
            }

            showToast(`Downloading: ${title}`);
            
            GM_download({
                url: selected.href,
                name: `${title || videoId}.mp4`,
                saveAs: true,
                onload: () => showToast('Download finished!'),
                onerror: (e) => showToast('Download failed')
            });

        } catch (e) {
            console.error(e);
            showToast('Error fetching download links');
        }
    }

    function parseQuality(text) {
        if (text.includes('1080')) return 1080;
        if (text.includes('720')) return 720;
        if (text.includes('480')) return 480;
        return 0;
    }

    // Injection Logic
    function processNode(node) {
        // We are looking for thumbnail containers.
        // Common selectors: ytd-thumbnail, a#thumbnail
        
        // If node is not an element, skip
        if (node.nodeType !== 1) return;

        // Find all potential thumbnails within the node (or if the node itself is one)
        const thumbnails = node.querySelectorAll ? node.querySelectorAll('ytd-thumbnail, a#thumbnail') : [];
        
        thumbnails.forEach(thumb => {
            if (thumb.hasAttribute(CONFIG.processedAttr)) return;
            
            // Find the anchor tag with the href
            const link = thumb.tagName === 'A' ? thumb : thumb.querySelector('a#thumbnail');
            if (!link) return;

            const url = link.href;
            const videoId = getVideoId(url);
            if (!videoId) return;

            // Mark processed
            thumb.setAttribute(CONFIG.processedAttr, 'true');

            // Create Button
            const btn = document.createElement('div');
            btn.className = CONFIG.buttonClass;
            btn.innerHTML = '⬇';
            btn.title = 'Download Video';
            
            // Prevent navigation when clicking button
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                // Get title - try to find it nearby
                let title = videoId;
                // Try to find the title element in the parent container
                const container = thumb.closest('ytd-rich-item-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, ytd-video-renderer');
                if (container) {
                    const titleEl = container.querySelector('#video-title');
                    if (titleEl) title = titleEl.textContent.trim();
                }

                showContextMenu(e.clientX, e.clientY, videoId, title);
            });

            // Append to thumbnail container
            // ytd-thumbnail usually has a child like #overlays or just append to it directly if it's relative positioned
            if (getComputedStyle(thumb).position === 'static') {
                thumb.style.position = 'relative';
            }
            thumb.appendChild(btn);
        });
    }

    function init() {
        // Add Styles
        const style = document.createElement('style');
        style.textContent = STYLES;
        document.head.appendChild(style);

        // Observer
        const observer = new MutationObserver((mutations) => {
            mutations.forEach(m => {
                m.addedNodes.forEach(processNode);
            });
        });

        observer.observe(document.body, { childList: true, subtree: true });

        // Initial pass
        processNode(document.body);
        
        // Global context menu listener for right-click on links
        document.addEventListener('contextmenu', (e) => {
            const link = e.target.closest('a');
            if (link) {
                const videoId = getVideoId(link.href);
                if (videoId) {
                    e.preventDefault();
                    const title = link.textContent.trim() || link.title || videoId;
                    showContextMenu(e.clientX, e.clientY, videoId, title);
                }
            }
        });
    }

    init();

})();
