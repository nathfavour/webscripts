// ==UserScript==
// @name            WhatsApp-mention
// @namespace       nathfavour
// @version         0.1.5
// @description     Automatically tag everyone in a group chat on WhatsApp Web
// @author          Alejandro Akbal
// @license         AGPL-3.0
// @icon            https://www.google.com/s2/favicons?sz=64&domain=whatsapp.com
// @homepage        https://github.com/AlejandroAkbal/WhatsApp-Web-Mention-Everyone-Userscript
// @downloadURL     https://raw.githubusercontent.com/AlejandroAkbal/WhatsApp-Web-Mention-Everyone-Userscript/main/src/main.user.js
// @updateURL       https://raw.githubusercontent.com/AlejandroAkbal/WhatsApp-Web-Mention-Everyone-Userscript/main/src/main.user.js
// @match           https://web.whatsapp.com/*
// @grant           none
// @run-at          document-idle
// ==/UserScript==

/** @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

(function () {
    'use strict';

    console.info('WhatsApp Web Mention Everyone loaded.');

    let buffer = '';

    document.addEventListener('keyup', async (event) => {
        buffer += event.key;

        // Keep the last 2 characters
        buffer = buffer.slice(-2);

        if (buffer === '@@') {
            buffer = '';

            // Delete the last 2 written characters ("@@")
            const chatInput = document.activeElement;
            if (chatInput && typeof chatInput.value === 'string') {
                // Remove last 2 characters from input value
                chatInput.value = chatInput.value.slice(0, -2);
                // Trigger input event to update WhatsApp's internal state
                chatInput.dispatchEvent(new Event('input', { bubbles: true }));
            } else {
                // Fallback: try to send backspaces
                document.execCommand('delete', false, null);
                document.execCommand('delete', false, null);
            }

            try {
                await tagEveryone();
            } catch (error) {
                alert(error.message);
                throw error;
            }
        }
    });

    function extractGroupUsers() {
        const groupSubtitle = document.querySelector("#main > header span.selectable-text.copyable-text");

        if (!groupSubtitle) {
            throw new Error('No chat subtitle found. Please open a group chat.');
        }

        // Check if users are separated with '，' (Chinese) or ',' (English)
        const separator = groupSubtitle.textContent.includes('，') ? '，' : ',';

        let groupUsers = groupSubtitle.textContent.split(separator);

        groupUsers = groupUsers.map((user) => user.trim());

        if (groupUsers.length === 1) {
            throw new Error(
                'No users found in the group chat. Please wait a second and try again.' +
                'If the error persists, it might be that your Locale is not supported. Please open an issue on GitHub.'
            );
        }

        // Remove last user (the user itself)
        groupUsers.pop();

        // Normalize user's names without accents or special characters
        return groupUsers.map((user) => user.normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
    }

    async function tagEveryone() {
        const groupUsers = extractGroupUsers();

        // Identify the current text box
        const chatInput = document.activeElement;

        if (!chatInput) {
            throw new Error('No chat input found. Please type a letter in the chat input.');
        }

        for (const user of groupUsers) {
            // Insert @username
            document.execCommand('insertText', false, `@${user}`);

            await sleep(10);

            // Send "tab" key to autocomplete the user
            const keyboardEvent = new KeyboardEvent('keydown', {
                key: 'Tab',
                code: 'Tab',
                keyCode: 9,
                which: 9,
                bubbles: true,
                cancelable: true,
                view: window
            });

            chatInput.dispatchEvent(keyboardEvent);

            document.execCommand('insertText', false, ' ');
        }
    }
})();
