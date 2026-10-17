/*
 * Nova One Fast v1 — emergency safety rollback, 2026-10-18.
 *
 * This version intentionally does not modify Lampa, does not load Nova,
 * and does not install DOM observers or intercept input/scroll events.
 * It exists solely to allow Lampa to start again if an outdated v1 URL
 * is still enabled in the user's plugin list.
 *
 * Original source is preserved in:
 * https://github.com/Proton4/lampac/blob/main/nova-one-fast-v1-backup-20261017.js
 *
 * Once Lampa is responsive, disable/remove this v1 URL. To keep Nova,
 * install the author's plugin separately:
 * https://amikdn.github.io/nova_plus.js
 *
 * Lampa.
 */
(function () {
    'use strict';
    if (window.p4_nova_one_fast_v1) return;
    window.p4_nova_one_fast_v1 = true;
    try {
        if (window.console && console.warn) {
            console.warn('Nova One Fast v1: emergency rollback active; custom layout disabled.');
        }
    } catch (error) {}
})();
