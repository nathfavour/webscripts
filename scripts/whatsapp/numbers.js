// ==UserScript==
// @name            WhatsApp Number Extractor
// @namespace       nathfavour
// @version         0.1.0
// @description     Extracts phone numbers from new WhatsApp Web messages and downloads the latest as latest.wh
// @author          nath
// @match           https://web.whatsapp.com/*
// @grant           GM_download
// @run-at          document-idle
// ==/UserScript==

(function () {
    'use strict';

    // Utility: Extract phone numbers from text
    function extractPhoneNumbers(text) {
        // Simple regex for international and local numbers
        const regex = /(\+?\d[\d\s\-().]{7,}\d)/g;
        const matches = text.match(regex);
        return matches ? matches.map(s => s.replace(/\s+/g, '').replace(/[-().]/g, '')) : [];
    }

    // Utility: Download the latest phone number as latest.wh
    function downloadNumber(number) {
        const blob = new Blob([number], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        GM_download({
            url,
            name: 'latest.wh',
            onload: () => URL.revokeObjectURL(url)
        });
    }

    // Observe new messages in the chat
    function observeMessages() {
        // WhatsApp message container selector (robust for most layouts)
        const chatPane = document.querySelector('#main .copyable-area');
        if (!chatPane) return;

        const messageList = chatPane.querySelector('[role="region"]');
        if (!messageList) return;

        const observer = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (!(node instanceof HTMLElement)) continue;
                    // Try to get message text
                    const textSpans = node.querySelectorAll
                        ? node.querySelectorAll('span.selectable-text, span[dir="ltr"], span[dir="auto"]')
                        : [];
                    for (const span of textSpans) {
                        const numbers = extractPhoneNumbers(span.textContent || '');
                        if (numbers.length > 0) {
                            downloadNumber(numbers[0]);
                            return; // Only save the first found in the latest message
                        }
                    }
                }
            }
        });

        observer.observe(messageList, { childList: true, subtree: true });
    }

    // Wait for chat to load
    function waitForChat() {
        const interval = setInterval(() => {
            if (document.querySelector('#main .copyable-area')) {
                clearInterval(interval);
                observeMessages();
            }
        }, 1000);
    }

    waitForChat();
})();
