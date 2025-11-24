// ==UserScript==
// @name         YouTube Context Download
// @namespace    nathfavour
// @version      0.1.0
// @description  Adds a context menu item on YouTube that grabs the highest-quality MP4 download link via yt-download.org
// @author       nath
// @license      MIT
// @match        https://www.youtube.com/*
// @match        https://youtube.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_setClipboard
// @connect      www.yt-download.org
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const config = {
        menuId: 'ytdl-context-menu',
        statusId: 'ytdl-status',
        downloadSource: 'https://www.yt-download.org/api/button/mp4/',
        statusFadeMs: 4500
    };

    const state = {
        currentVideoId: null,
        currentVideoUrl: null,
        menuVisible: false,
        hideTimeout: null
    };

    const helpers = {
        extractVideoId(url) {
            try {
                const parsed = new URL(url, 'https://www.youtube.com');
                if (parsed.hostname.endsWith('youtu.be')) {
                    return parsed.pathname.slice(1).split('?')[0];
                }

                if (parsed.pathname.startsWith('/shorts/')) {
                    return parsed.pathname.split('/')[2];
                }

                if (parsed.searchParams.has('v')) {
                    return parsed.searchParams.get('v');
                }

                if (parsed.pathname.includes('/watch/')) {
                    return parsed.pathname.split('/').pop();
                }

                return null;
            } catch (error) {
                console.warn('ytdl: invalid URL', url, error);
                return null;
            }
        },

        sanitizeFileName(name) {
            return name.replace(/[<>:"/\\|?*]/g, '_').trim();
        },

        showStatus(message, type = 'info') {
            const badge = document.getElementById(config.statusId);
            if (!badge) return;
            badge.textContent = message;
            badge.dataset.type = type;
            badge.classList.add('visible');
            if (state.hideTimeout) {
                clearTimeout(state.hideTimeout);
            }
            state.hideTimeout = setTimeout(() => {
                badge.classList.remove('visible');
            }, config.statusFadeMs);
        },

        fetchDownloadPage(videoId) {
            const url = `${config.downloadSource}${videoId}`;
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url,
                    responseType: 'text',
                    headers: {
                        Referer: 'https://www.youtube.com/',
                        'User-Agent': 'Mozilla/5.0'
                    },
                    onload(response) {
                        if (response.status >= 400) {
                            reject(new Error(`Download service returned ${response.status}`));
                            return;
                        }
                        resolve(response.responseText);
                    },
                    onerror(error) {
                        reject(new Error(error.statusText || 'Network error'));
                    }
                });
            });
        },

        parseDownloadCandidates(html) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const title = (doc.querySelector('h1') || {}).textContent || document.title;
            const downloadButtons = Array.from(doc.querySelectorAll('a.btn'))
                .map(anchor => {
                    const label = anchor.textContent.trim();
                    return {
                        label,
                        url: anchor.href
                    };
                })
                .filter(item => item.url && item.url.startsWith('http'));

            return { title: title.trim(), candidates: downloadButtons };
        },

        pickBestCandidate(candidates) {
            if (!candidates.length) return null;
            const priority = ['2160p', '1440p', '1080p', '720p', '480p', '360p'];
            for (const quality of priority) {
                const match = candidates.find(candidate => candidate.label.includes(quality));
                if (match) return match;
            }
            return candidates[0];
        }
    };

    const ui = {
        createContextMenu() {
            const menu = document.createElement('div');
            menu.id = config.menuId;
            menu.innerHTML = `
                <button type="button" data-action="download">Download video</button>
                <button type="button" data-action="copy">Copy link</button>
            `;
            menu.addEventListener('click', event => {
                const action = event.target.dataset.action;
                if (action === 'download') {
                    download.start();
                } else if (action === 'copy') {
                    if (state.currentVideoUrl) {
                        GM_setClipboard(state.currentVideoUrl);
                        helpers.showStatus('Video link copied to clipboard');
                    }
                }
                ui.hideMenu();
            });
            document.body.appendChild(menu);
        },

        positionMenu(x, y) {
            const menu = document.getElementById(config.menuId);
            if (!menu) return;
            const { innerWidth, innerHeight } = window;
            const rect = menu.getBoundingClientRect();
            const computedX = x + rect.width > innerWidth ? innerWidth - rect.width - 10 : x;
            const computedY = y + rect.height > innerHeight ? innerHeight - rect.height - 10 : y;
            menu.style.left = `${computedX}px`;
            menu.style.top = `${computedY}px`;
            menu.classList.add('visible');
            state.menuVisible = true;
        },

        hideMenu() {
            const menu = document.getElementById(config.menuId);
            if (!menu) return;
            menu.classList.remove('visible');
            state.menuVisible = false;
        },

        createStatusBadge() {
            const badge = document.createElement('div');
            badge.id = config.statusId;
            document.body.appendChild(badge);
        }
    };

    const download = {
        async start() {
            if (!state.currentVideoId) {
                helpers.showStatus('No video detected', 'error');
                return;
            }

            helpers.showStatus('Preparing download...');

            try {
                const html = await helpers.fetchDownloadPage(state.currentVideoId);
                const { title, candidates } = helpers.parseDownloadCandidates(html);
                const best = helpers.pickBestCandidate(candidates);
                if (!best) {
                    throw new Error('No downloadable MP4 stream was found');
                }

                const name = `${helpers.sanitizeFileName(title)} (${best.label})`.replace(/\s+/g, ' ').trim();
                helpers.showStatus(`Starting download ${best.label}...`);
                GM_download({
                    url: best.url,
                    name: `${name || 'youtube-video'}.mp4`,
                    onload: () => helpers.showStatus('Download started', 'success'),
                    onerror: error => helpers.showStatus(`Download failed: ${error.error}`, 'error')
                });
            } catch (error) {
                console.error('ytdl', error);
                helpers.showStatus(error.message || 'Download failed', 'error');
            }
        }
    };

    const bindings = {
        install() {
            ui.createContextMenu();
            ui.createStatusBadge();

            document.addEventListener('contextmenu', event => {
                const anchor = event.target.closest('a[href]');
                if (!anchor) return;
                const videoId = helpers.extractVideoId(anchor.href);
                if (!videoId) return;

                event.preventDefault();
                state.currentVideoId = videoId;
                state.currentVideoUrl = anchor.href;
                ui.positionMenu(event.pageX, event.pageY);
                helpers.showStatus('Context download ready');
            });

            document.addEventListener('click', () => {
                if (state.menuVisible) {
                    ui.hideMenu();
                }
            });

            window.addEventListener('blur', () => ui.hideMenu());
            window.addEventListener('resize', () => ui.hideMenu());
            window.addEventListener('scroll', () => ui.hideMenu());
        }
    };

    const styles = `
        #${config.menuId} {
            position: fixed;
            background: #1f1f1f;
            border-radius: 6px;
            padding: 6px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
            z-index: 999999;
            display: flex;
            flex-direction: column;
            gap: 4px;
            opacity: 0;
            transition: opacity 0.15s ease;
            font-family: inherit;
        }

        #${config.menuId}.visible {
            opacity: 1;
        }

        #${config.menuId} button {
            background: #2d2d2d;
            color: #fff;
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            text-align: left;
            font-size: 13px;
        }

        #${config.menuId} button:hover {
            background: #3d3d3d;
        }

        #${config.statusId} {
            position: fixed;
            bottom: 18px;
            right: 18px;
            padding: 10px 14px;
            border-radius: 20px;
            font-size: 12px;
            background: rgba(17, 17, 17, 0.9);
            color: #fff;
            z-index: 999999;
            opacity: 0;
            transition: opacity 0.2s ease;
        }

        #${config.statusId}.visible {
            opacity: 1;
        }

        #${config.statusId}[data-type='error'] {
            background: #8b1b1b;
        }

        #${config.statusId}[data-type='success'] {
            background: #1b8b3f;
        }
    `;

    const injectStyles = () => {
        const style = document.createElement('style');
        style.textContent = styles;
        document.head.appendChild(style);
    };

    const init = () => {
        injectStyles();
        bindings.install();
        helpers.showStatus('YouTube download helper ready');
    };

    init();
})();