// ==UserScript==
// @name         YouTube Context Video Downloader
// @namespace    nathfavour
// @version      0.4.0
// @description  Adds a Violentmonkey context menu, quality picker, audio/video switches, and thumbnail widget to download YouTube media through yt-download.org
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
        contextId: 'yt-context-downloader',
        statusId: 'yt-context-status',
        downloadPrefix: 'https://www.yt-download.org/api/button/mp4/',
        statusVisibleMs: 4200,
        videoQualities: ['auto', '2160p', '1440p', '1080p', '720p', '480p'],
        cardButtonClass: 'yt-dl-card-trigger',
        cardSelector: [
            'ytd-rich-item-renderer',
            'ytd-compact-video-renderer',
            'ytd-grid-video-renderer',
            'ytd-video-renderer',
            'ytd-rich-grid-media'
        ].join(',')
    };

    const state = {
        latestMeta: null,
        menuVisible: false,
        hideTimer: null,
        selectedVideoQuality: 'auto'
    };

    const selectors = {
        metaVideoId: 'meta[itemprop="videoId"]',
        metaTitle: 'meta[property="og:title"]',
        metaUrl: 'meta[property="og:url"]'
    };

    const helpers = {
        resolveVideoInfoFromMeta() {
            const videoId = document.querySelector(selectors.metaVideoId)?.content || null;
            const title = document.querySelector(selectors.metaTitle)?.content?.trim() || document.title;
            const canonical = document.querySelector(selectors.metaUrl)?.content || window.location.href;
            return videoId ? { videoId, title, url: canonical } : null;
        },

        resolveVideoInfoFromPlayer() {
            const resp = window.ytInitialPlayerResponse || (window.ytplayer && window.ytplayer.config && window.ytplayer.config.args && window.ytplayer.config.args.player_response && JSON.parse(window.ytplayer.config.args.player_response));
            const details = resp?.videoDetails;
            if (!details) {
                return null;
            }
            return {
                videoId: details.videoId,
                title: details.title || document.title,
                url: `https://www.youtube.com/watch?v=${details.videoId}`
            };
        },

        extractIdFromUrl(url) {
            try {
                const parsed = new URL(url, 'https://www.youtube.com');
                if (parsed.hostname.endsWith('youtu.be')) {
                    return parsed.pathname.slice(1).split('?')[0];
                }
                if (parsed.searchParams.has('v')) {
                    return parsed.searchParams.get('v');
                }
                if (parsed.pathname.includes('/shorts/')) {
                    return parsed.pathname.split('/')[2];
                }
                if (parsed.pathname.startsWith('/watch/')) {
                    return parsed.pathname.split('/').pop();
                }
            } catch (error) {
                console.warn('yt-dl: extract failed', url, error);
            }
            return null;
        },

        getCurrentVideoInfo() {
            const fromMeta = helpers.resolveVideoInfoFromMeta();
            if (fromMeta) {
                return fromMeta;
            }
            const fromPlayer = helpers.resolveVideoInfoFromPlayer();
            if (fromPlayer) {
                return fromPlayer;
            }
            const url = window.location.href;
            const extracted = helpers.extractIdFromUrl(url);
            if (!extracted) {
                return null;
            }
            return {
                videoId: extracted,
                title: document.title,
                url
            };
        },

        sanitizeFilename(text) {
            return text.replace(/[<>:\\"/|?*]+/g, '_').trim();
        },

        formatQualityLabel(key) {
            return key === 'auto' ? 'Auto / Best' : key;
        },

        showStatus(message, type = 'info') {
            const badge = document.getElementById(config.statusId);
            if (!badge) return;
            badge.textContent = message;
            badge.dataset.type = type;
            badge.classList.add('visible');
            if (state.hideTimer) {
                clearTimeout(state.hideTimer);
            }
            state.hideTimer = setTimeout(() => badge.classList.remove('visible'), config.statusVisibleMs);
        },

        async fetchQualityPage(videoId) {
            const url = `${config.downloadPrefix}${videoId}`;
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url,
                    responseType: 'text',
                    headers: {
                        Referer: 'https://www.youtube.com/',
                        'User-Agent': navigator.userAgent
                    },
                    onload(response) {
                        if (response.status >= 400) {
                            reject(new Error(`service returned ${response.status}`));
                            return;
                        }
                        resolve(response.responseText);
                    },
                    onerror(error) {
                        reject(new Error(error.statusText || 'network failure'));
                    }
                });
            });
        },

        parseDownloadLinks(html) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            return Array.from(doc.querySelectorAll('a.btn'))
                .map(anchor => ({ label: anchor.textContent.trim(), url: anchor.href }))
                .filter(item => item.url && item.url.startsWith('http'));
        },

        chooseDefaultVideoCandidate(candidates) {
            if (!candidates.length) return null;
            const order = ['2160p', '1440p', '1080p', '720p', '480p'];
            for (const quality of order) {
                const match = candidates.find(candidate => candidate.label.includes(quality));
                if (match) return match;
            }
            return candidates[0];
        },

        pickVideoCandidate(candidates) {
            if (!candidates.length) return null;
            const preferred = state.selectedVideoQuality;
            if (preferred && preferred !== 'auto') {
                const normalized = preferred.toLowerCase();
                const match = candidates.find(candidate => candidate.label.toLowerCase().includes(normalized));
                if (match) return match;
            }
            return helpers.chooseDefaultVideoCandidate(candidates);
        },

        pickAudioCandidate(candidates) {
            if (!candidates.length) return null;
            const audioHints = ['audio', 'm4a', 'aac', 'ogg', '192kbps', '128kbps', '320kbps'];
            for (const candidate of candidates) {
                const label = candidate.label.toLowerCase();
                if (audioHints.some(term => label.includes(term))) {
                    return candidate;
                }
            }
            return candidates[0];
        },

        applyQualitySelectionUI() {
            const buttons = document.querySelectorAll(`#${config.contextId} button[data-quality]`);
            buttons.forEach(button => {
                button.classList.toggle('active', button.dataset.quality === state.selectedVideoQuality);
            });
        }
    };

    const ui = {
        createMenu() {
            const menu = document.createElement('div');
            menu.id = config.contextId;
            menu.innerHTML = `
                <button data-action="download-video">Download video</button>
                <button data-action="download-audio">Download audio</button>
                <div class="quality-group">
                    <span class="quality-label">Preferred quality:</span>
                    <div class="quality-options">
                        ${config.videoQualities.map(q => `<button type="button" data-quality="${q}">${helpers.formatQualityLabel(q)}</button>`).join('')}
                    </div>
                </div>
                <button data-action="copy">Copy link</button>
            `;
            menu.addEventListener('click', event => {
                const target = event.target;
                const action = target.dataset.action;
                const qualityKey = target.dataset.quality;
                if (action === 'download-video') {
                    download.trigger('video');
                    ui.hide();
                } else if (action === 'download-audio') {
                    download.trigger('audio');
                    ui.hide();
                } else if (action === 'copy') {
                    if (state.latestMeta?.url) {
                        GM_setClipboard(state.latestMeta.url);
                        helpers.showStatus('Video link copied');
                    }
                    ui.hide();
                } else if (qualityKey) {
                    state.selectedVideoQuality = qualityKey;
                    helpers.applyQualitySelectionUI();
                    helpers.showStatus(`Preferred quality set to ${helpers.formatQualityLabel(qualityKey)}`);
                }
            });
            document.body.appendChild(menu);
            helpers.applyQualitySelectionUI();
        },

        createStatus() {
            const badge = document.createElement('div');
            badge.id = config.statusId;
            badge.dataset.type = 'info';
            document.body.appendChild(badge);
        },

        positionMenu(x, y) {
            const menu = document.getElementById(config.contextId);
            if (!menu) return;
            const rect = menu.getBoundingClientRect();
            const left = x + rect.width > window.innerWidth ? window.innerWidth - rect.width - 8 : x;
            const top = y + rect.height > window.innerHeight ? window.innerHeight - rect.height - 8 : y;
            menu.style.left = `${left}px`;
            menu.style.top = `${top}px`;
            menu.classList.add('visible');
            state.menuVisible = true;
        },

        hide() {
            const menu = document.getElementById(config.contextId);
            if (!menu) return;
            menu.classList.remove('visible');
            state.menuVisible = false;
        }
    };

    const download = {
        async trigger(type = 'video') {
            const info = state.latestMeta || helpers.getCurrentVideoInfo();
            if (!info?.videoId) {
                helpers.showStatus('Unable to resolve a video', 'error');
                return;
            }

            helpers.showStatus('Fetching download options…');

            try {
                const html = await helpers.fetchQualityPage(info.videoId);
                const candidates = helpers.parseDownloadLinks(html);
                const chosen = type === 'audio'
                    ? helpers.pickAudioCandidate(candidates)
                    : helpers.pickVideoCandidate(candidates);
                if (!chosen) {
                    throw new Error('No downloadable link found');
                }

                const normalizedTitle = helpers.sanitizeFilename(info.title || 'youtube-video');
                const descriptor = type === 'audio' ? 'audio' : chosen.label;
                const extension = type === 'audio' ? 'm4a' : 'mp4';
                const baseName = `${normalizedTitle} (${descriptor})`.trim().replace(/\s+/g, ' ') || `youtube-${type}`;
                helpers.showStatus(`Starting ${type} download…`);
                GM_download({
                    url: chosen.url,
                    name: `${baseName}.${extension}`,
                    onload: () => helpers.showStatus('Download started', 'success'),
                    onerror: err => helpers.showStatus(`Download failed: ${err.error || err.statusText}`, 'error')
                });
            } catch (error) {
                console.error('yt-dl', error);
                helpers.showStatus(error.message || 'Download failed', 'error');
            }
        }
    };

    const nav = {
        syncVideoInfo() {
            const info = helpers.getCurrentVideoInfo();
            if (info) {
                state.latestMeta = info;
            }
        },

        install() {
            nav.syncVideoInfo();
            window.addEventListener('yt-navigate-finish', nav.syncVideoInfo);
            window.addEventListener('yt-page-data-updated', nav.syncVideoInfo);
            window.addEventListener('popstate', nav.syncVideoInfo);
            const observer = new MutationObserver(nav.syncVideoInfo);
            observer.observe(document.documentElement, { childList: true, subtree: true });
        }
    };

    const widget = {
        install() {
            this.observer = new MutationObserver(() => this.scan());
            this.observer.observe(document.body, { childList: true, subtree: true });
            this.scan();
        },

        scan() {
            document.querySelectorAll(config.cardSelector).forEach(card => {
                if (card.dataset.ytdlInjected === 'true') {
                    return;
                }

                const anchor = card.querySelector('a#thumbnail') || card.querySelector('a#video-title') || card.querySelector('a[href*="/watch"]');
                if (!anchor) {
                    return;
                }

                const videoId = helpers.extractIdFromUrl(anchor.href);
                if (!videoId) {
                    return;
                }

                const button = document.createElement('button');
                button.type = 'button';
                button.className = config.cardButtonClass;
                button.title = 'Open YouTube download menu';
                button.dataset.videoId = videoId;
                button.dataset.videoTitle = (anchor.textContent || anchor.getAttribute('title') || '').trim() || document.title;
                button.dataset.videoUrl = anchor.href;
                button.addEventListener('click', event => {
                    event.stopPropagation();
                    event.preventDefault();
                    state.latestMeta = {
                        videoId,
                        title: button.dataset.videoTitle,
                        url: button.dataset.videoUrl
                    };
                    ui.positionMenu(event.clientX, event.clientY);
                    helpers.showStatus('Download menu ready');
                });

                const anchorContainer = anchor.closest('#thumbnail') || anchor.closest('ytd-thumbnail-overlay-slot-renderer') || card;
                if (anchorContainer) {
                    const computedStyle = window.getComputedStyle(anchorContainer);
                    if (computedStyle.position === 'static') {
                        anchorContainer.style.position = 'relative';
                    }
                    anchorContainer.appendChild(button);
                    card.dataset.ytdlInjected = 'true';
                }
            });
        }
    };

    const styleSheet = `
        #${config.contextId} {
            position: fixed;
            display: flex;
            flex-direction: column;
            gap: 6px;
            padding: 10px;
            border-radius: 10px;
            background: #111;
            box-shadow: 0 20px 80px rgba(0,0,0,0.55);
            border: 1px solid rgba(255,255,255,0.08);
            z-index: 999999;
            opacity: 0;
            transition: opacity 0.18s ease;
            font-family: Roboto, Arial, sans-serif;
        }

        #${config.contextId}.visible {
            opacity: 1;
        }

        #${config.contextId} button {
            background: rgba(255,255,255,0.05);
            color: #fff;
            border: none;
            padding: 8px 14px;
            border-radius: 6px;
            cursor: pointer;
            text-align: left;
            font-size: 0.9rem;
            transition: background 0.15s ease;
        }

        #${config.contextId} button:hover {
            background: rgba(255,255,255,0.15);
        }

        #${config.contextId} .quality-group {
            display: flex;
            flex-direction: column;
            gap: 6px;
            padding: 6px 0;
            border-top: 1px solid rgba(255,255,255,0.08);
        }

        #${config.contextId} .quality-options {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
        }

        #${config.contextId} button[data-quality] {
            font-size: 0.8rem;
            padding: 4px 10px;
        }

        #${config.contextId} button.active {
            background: #1e8cff;
            color: #fff;
        }

        #${config.statusId} {
            position: fixed;
            bottom: 16px;
            right: 16px;
            padding: 10px 14px;
            border-radius: 999px;
            font-size: 12px;
            background: rgba(0,0,0,0.72);
            color: #fff;
            box-shadow: 0 12px 30px rgba(0,0,0,0.45);
            opacity: 0;
            transition: opacity 0.2s ease;
            z-index: 999999;
        }

        #${config.statusId}.visible {
            opacity: 1;
        }

        #${config.statusId}[data-type='error'] {
            background: #8c1c1c;
        }

        #${config.statusId}[data-type='success'] {
            background: #1c8d3f;
        }

        .${config.cardButtonClass} {
            position: absolute;
            top: 6px;
            right: 6px;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            border: none;
            background: rgba(0,0,0,0.7);
            color: #fff;
            font-size: 16px;
            line-height: 32px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 6px 18px rgba(0,0,0,0.5);
            z-index: 10;
        }

        .${config.cardButtonClass}:hover {
            background: rgba(30,140,255,0.9);
        }
    `;

    const injectStyles = () => {
        const style = document.createElement('style');
        style.textContent = styleSheet;
        document.head.appendChild(style);
    };

    const registerEvents = () => {
        document.addEventListener('contextmenu', event => {
            const anchor = event.target.closest('a[href]');
            if (!anchor) return;
            const videoId = helpers.extractIdFromUrl(anchor.href);
            if (!videoId) return;

            state.latestMeta = {
                videoId,
                title: anchor.textContent.trim() || document.title,
                url: anchor.href
            };

            event.preventDefault();
            ui.positionMenu(event.clientX, event.clientY);
            helpers.showStatus('Right-click menu ready');
        });

        ['click', 'scroll', 'resize', 'blur'].forEach(type =>
            document.addEventListener(type, () => ui.hide())
        );
    };

    const init = () => {
        injectStyles();
        ui.createMenu();
        ui.createStatus();
        nav.install();
        widget.install();
        registerEvents();
        helpers.showStatus('YouTube context downloader ready');
    };

    init();
})();// ==UserScript==
// @name         YouTube Context Video Downloader
// @namespace    nathfavour
// @version      0.2.0
// @description  Adds a Violentmonkey context menu option that resolves the current YouTube video and queues a download from yt-download.org
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
        contextId: 'yt-context-downloader',
        statusId: 'yt-context-status',
        downloadPrefix: 'https://www.yt-download.org/api/button/mp4/',
        statusVisibleMs: 4200
    };

    const state = {
        latestMeta: null,
        menuVisible: false,
        hideTimer: null
    };

    const selectors = {
        metaVideoId: 'meta[itemprop="videoId"]',
        metaTitle: 'meta[property="og:title"]',
        metaUrl: 'meta[property="og:url"]'
    };

    const helpers = {
        resolveVideoInfoFromMeta() {
            const videoId = document.querySelector(selectors.metaVideoId)?.content || null;
            const title = document.querySelector(selectors.metaTitle)?.content?.trim() || document.title;
            const canonical = document.querySelector(selectors.metaUrl)?.content || window.location.href;
            return videoId ? { videoId, title, url: canonical } : null;
        },

        resolveVideoInfoFromPlayer() {
            const resp = window.ytInitialPlayerResponse || (window.ytplayer && window.ytplayer.config && window.ytplayer.config.args && window.ytplayer.config.args.player_response && JSON.parse(window.ytplayer.config.args.player_response));
            const details = resp?.videoDetails;
            if (!details) {
                return null;
            }
            return {
                videoId: details.videoId,
                title: details.title || document.title,
                url: `https://www.youtube.com/watch?v=${details.videoId}`
            };
        },

        extractIdFromUrl(url) {
            try {
                const parsed = new URL(url, 'https://www.youtube.com');
                if (parsed.hostname.endsWith('youtu.be')) {
                    return parsed.pathname.slice(1).split('?')[0];
                }
                if (parsed.searchParams.has('v')) {
                    return parsed.searchParams.get('v');
                }
                if (parsed.pathname.includes('/shorts/')) {
                    return parsed.pathname.split('/')[2];
                }
                if (parsed.pathname.startsWith('/watch/')) {
                    return parsed.pathname.split('/').pop();
                }
            } catch (error) {
                console.warn('yt-dl: extract failed', url, error);
            }
            return null;
        },

        getCurrentVideoInfo() {
            const fromMeta = helpers.resolveVideoInfoFromMeta();
            if (fromMeta) {
                return fromMeta;
            }
            const fromPlayer = helpers.resolveVideoInfoFromPlayer();
            if (fromPlayer) {
                return fromPlayer;
            }
            const url = window.location.href;
            const extracted = helpers.extractIdFromUrl(url);
            if (!extracted) {
                return null;
            }
            return {
                videoId: extracted,
                title: document.title,
                url
            };
        },

        sanitizeFilename(text) {
            return text.replace(/[<>:\\"/|?*]+/g, '_').trim();
        },

        showStatus(message, type = 'info') {
            const badge = document.getElementById(config.statusId);
            if (!badge) return;
            badge.textContent = message;
            badge.dataset.type = type;
            badge.classList.add('visible');
            if (state.hideTimer) {
                clearTimeout(state.hideTimer);
            }
            state.hideTimer = setTimeout(() => badge.classList.remove('visible'), config.statusVisibleMs);
        },

        async fetchQualityPage(videoId) {
            const url = `${config.downloadPrefix}${videoId}`;
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url,
                    responseType: 'text',
                    headers: {
                        Referer: 'https://www.youtube.com/',
                        'User-Agent': navigator.userAgent
                    },
                    onload(response) {
                        if (response.status >= 400) {
                            reject(new Error(`service returned ${response.status}`));
                            return;
                        }
                        resolve(response.responseText);
                    },
                    onerror(error) {
                        reject(new Error(error.statusText || 'network failure'));
                    }
                });
            });
        },

        parseDownloadLinks(html) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const buttons = Array.from(doc.querySelectorAll('a.btn'))
                .map(anchor => ({ label: anchor.textContent.trim(), url: anchor.href }))
                .filter(item => item.url && item.url.startsWith('http'));
            return buttons;
        },

        chooseHighestQuality(candidates) {
            if (!candidates.length) {
                return null;
            }
            const order = ['2160p', '1440p', '1080p', '720p', '480p'];
            for (const quality of order) {
                const match = candidates.find(candidate => candidate.label.includes(quality));
                if (match) return match;
            }
            return candidates[0];
        }
    };

    const ui = {
        createMenu() {
            const menu = document.createElement('div');
            menu.id = config.contextId;
            menu.innerHTML = `
                <button data-action="download">Download video</button>
                <button data-action="copy">Copy link</button>
            `;
            menu.addEventListener('click', event => {
                const action = event.target.dataset.action;
                if (action === 'download') {
                    download.trigger();
                } else if (action === 'copy') {
                    if (state.latestMeta?.url) {
                        GM_setClipboard(state.latestMeta.url);
                        helpers.showStatus('Video link copied');
                    }
                }
                ui.hide();
            });
            document.body.appendChild(menu);
        },

        createStatus() {
            const badge = document.createElement('div');
            badge.id = config.statusId;
            badge.dataset.type = 'info';
            document.body.appendChild(badge);
        },

        positionMenu(x, y) {
            const menu = document.getElementById(config.contextId);
            if (!menu) return;
            const rect = menu.getBoundingClientRect();
            const left = x + rect.width > window.innerWidth ? window.innerWidth - rect.width - 8 : x;
            const top = y + rect.height > window.innerHeight ? window.innerHeight - rect.height - 8 : y;
            menu.style.left = `${left}px`;
            menu.style.top = `${top}px`;
            menu.classList.add('visible');
            state.menuVisible = true;
        },

        hide() {
            const menu = document.getElementById(config.contextId);
            if (!menu) return;
            menu.classList.remove('visible');
            state.menuVisible = false;
        }
    };

    const download = {
        async trigger() {
            const info = state.latestMeta || helpers.getCurrentVideoInfo();
            if (!info?.videoId) {
                helpers.showStatus('Unable to resolve a video', 'error');
                return;
            }

            helpers.showStatus('Fetching download options…');

            try {
                const html = await helpers.fetchQualityPage(info.videoId);
                const candidates = helpers.parseDownloadLinks(html);
                const best = helpers.chooseHighestQuality(candidates);
                if (!best) {
                    throw new Error('No MP4 link found');
                }

                const fileName = `${helpers.sanitizeFilename(info.title)} (${best.label})`.trim() || 'youtube-video';
                GM_download({
                    url: best.url,
                    name: `${fileName}.mp4`,
                    onload: () => helpers.showStatus('Download started', 'success'),
                    onerror: err => helpers.showStatus(`Download failed: ${err.error}`, 'error')
                });
            } catch (error) {
                console.error('yt-dl', error);
                helpers.showStatus(error.message || 'Download failed', 'error');
            }
        }
    };

    const nav = {
        syncVideoInfo() {
            const info = helpers.getCurrentVideoInfo();
            if (info) {
                state.latestMeta = info;
            }
        },

        install() {
            nav.syncVideoInfo();
            window.addEventListener('yt-navigate-finish', nav.syncVideoInfo);
            window.addEventListener('yt-page-data-updated', nav.syncVideoInfo);
            window.addEventListener('popstate', nav.syncVideoInfo);
            const observer = new MutationObserver(() => nav.syncVideoInfo());
            observer.observe(document.documentElement, { childList: true, subtree: true });
        }
    };

    const styleSheet = `
        #${config.contextId} {
            position: fixed;
            display: flex;
            flex-direction: column;
            gap: 4px;
            padding: 6px;
            border-radius: 8px;
            background: #181818;
            box-shadow: 0 20px 60px rgba(0,0,0,0.45);
            border: 1px solid rgba(255,255,255,0.08);
            z-index: 999999;
            opacity: 0;
            transition: opacity 0.2s ease;
            font-family: Roboto, Arial, sans-serif;
        }

        #${config.contextId}.visible {
            opacity: 1;
        }

        #${config.contextId} button {
            background: rgba(255,255,255,0.05);
            color: #fff;
            border: none;
            padding: 6px 14px;
            border-radius: 6px;
            cursor: pointer;
            text-align: left;
            font-size: 0.9rem;
        }

        #${config.contextId} button:hover {
            background: rgba(255,255,255,0.15);
        }

        #${config.statusId} {
            position: fixed;
            bottom: 16px;
            right: 16px;
            padding: 10px 14px;
            border-radius: 999px;
            font-size: 12px;
            background: rgba(0,0,0,0.72);
            color: #fff;
            box-shadow: 0 12px 30px rgba(0,0,0,0.45);
            opacity: 0;
            transition: opacity 0.2s ease;
            z-index: 999999;
        }

        #${config.statusId}.visible {
            opacity: 1;
        }

        #${config.statusId}[data-type='error'] {
            background: #8c1c1c;
        }

        #${config.statusId}[data-type='success'] {
            background: #1c8d3f;
        }
    `;

    const injectStyles = () => {
        const style = document.createElement('style');
        style.textContent = styleSheet;
        document.head.appendChild(style);
    };

    const registerEvents = () => {
        document.addEventListener('contextmenu', event => {
            const anchor = event.target.closest('a[href]');
            if (!anchor) return;
            const videoId = helpers.extractIdFromUrl(anchor.href);
            if (!videoId) return;

            state.latestMeta = {
                videoId,
                title: anchor.textContent.trim() || document.title,
                url: anchor.href
            };

            event.preventDefault();
            if (!state.menuVisible) {
                ui.positionMenu(event.clientX, event.clientY);
            }
            helpers.showStatus('Right-click menu ready');
        });

        ['click', 'scroll', 'resize', 'blur'].forEach(eventType =>
            document.addEventListener(eventType, () => ui.hide())
        );
    };

    const init = () => {
        injectStyles();
        ui.createMenu();
        ui.createStatus();
        nav.install();
        registerEvents();
        helpers.showStatus('YouTube context downloader ready');
    };

    init();
})();// ==UserScript==
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