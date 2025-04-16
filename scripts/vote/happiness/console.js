// ==UserScript==
// @name         Happiness-Adegbite Auto Vote
// @namespace    nathfavour
// @version      1.0.0
// @description  Automatically votes for Happiness-Adegbite on oyep.org
// @author       nathfavour
// @match        https://www.oyep.org/oyostateyouthsummit2025/vote/
// @icon         https://www.oyep.org/favicon.ico
// @grant        none
// @run-at       document-idle
// ==/UserScript==

// This script automates voting for "Happiness-Adegbite" on oyep.org.
// Please paste into your browser console

(async function voteLoop() {
    const targetUrl = "https://www.oyep.org/oyostateyouthsummit2025/vote/";

    // Navigate to the voting page if not already there
    if (window.location.href !== targetUrl) {
        window.location.href = targetUrl;
        return;
    }

    // Helper: Sleep for ms milliseconds
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Helper: Human-like scroll to happiness image
    async function humanScrollTo(element) {
        const rect = element.getBoundingClientRect();
        const targetY = window.scrollY + rect.top - 100;
        const startY = window.scrollY;
        const steps = 20 + Math.floor(Math.random() * 10);
        for (let i = 1; i <= steps; i++) {
            window.scrollTo(0, startY + ((targetY - startY) * i) / steps);
            await sleep(20 + Math.random() * 30);
        }
    }

    // Wait for the his image to appear incase of slow network lol
    async function waitForImage() {
        for (let i = 0; i < 50; i++) {
            const img = Array.from(document.images).find(img => img.src.includes('Happiness-Adegbite'));
            if (img) return img;
            await sleep(200);
        }
        throw new Error("Image not found");
    }

    // Wait for the Vote button to appear
    async function waitForVoteButton() {
        for (let i = 0; i < 50; i++) {
            const btn = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]'))
                .find(el => el.textContent.trim().toLowerCase().includes('vote'));
            if (btn) return btn;
            await sleep(200);
        }
        throw new Error("Vote button not found");
    }

    // Wait for the button text to include 'sending'
    async function waitForSending(btn) {
        for (let i = 0; i < 50; i++) {
            if (btn.textContent.toLowerCase().includes('sending')) return;
            await sleep(100);
        }
    }

    // Wait for the button text to no longer include 'sending'
    async function waitForNotSending(btn) {
        for (let i = 0; i < 100; i++) {
            if (!btn.textContent.toLowerCase().includes('sending')) return;
            await sleep(200);
        }
    }

    // Main voting logic, which I hope does not crash ;)
    // This will run in a loop until the script is stopped
    while (true) {
        try {
            const img = await waitForImage();
            await humanScrollTo(img);
            img.click();
            await sleep(500 + Math.random() * 500);

            const voteBtn = await waitForVoteButton();
            await humanScrollTo(voteBtn);
            voteBtn.click();

            await waitForSending(voteBtn);
            await waitForNotSending(voteBtn);

            await sleep(3000); // Wait 3 seconds to not crash the site mehnnn
            location.reload();
            break; // After reload, script will run over and over and over and over...
        } catch (e) {
            console.error(e);
            break;
        }
    }
})();

// Happiness must win XD XD