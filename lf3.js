/*
 * LF3 - compact Lampac filter layout with visible section scrollbars.
 *
 * Loads LF2, then adds:
 * - always-visible scrollbars for season/source/voice sections;
 * - compact rows so more sources fit on screen;
 * - fixed season and translation heights with independent scrolling;
 * - a larger flexible source area;
 * - a compact, self-explanatory Reset filter action without the redundant
 *   ACTIONS heading;
 * - a small scroll indicator on sections that contain hidden rows.
 *
 * Crosswalk 5 / Chromium 34 compatible: ES5 syntax only.
 * Load LF3 only. Do not also load LF/LF2 or older Lampac filter plugins.
 */
(function () {
    'use strict';

    var VERSION = '3.0.0';
    var FLAG = 'lf3_compact_scroll_plugin';
    var CORE_URL = 'https://proton4.github.io/lampac/lf2.js?v=4';

    var styleNode = null;
    var observer = null;
    var observedBody = null;
    var tuneTimer = null;
    var waitTimer = null;
    var waitCount = 0;

    if (window[FLAG]) return;
    window[FLAG] = true;

    function injectStyle() {
        if (styleNode) return;

        styleNode = document.createElement('style');
        styleNode.id = 'lf3-compact-scroll-style';
        styleNode.type = 'text/css';
        styleNode.textContent =
            /* Reclaim vertical space from the panel chrome. */
            '#lf-panel .lf-head{' +
                'height:4.35em!important;padding:.85em .65em .55em 1.05em!important;' +
            '}' +
            '#lf-panel .lf-title{font-size:1.23em!important;}' +
            '#lf-panel .lf-close{' +
                'font-size:1.55em!important;width:1.85em!important;height:1.85em!important;' +
                'line-height:1.85em!important;' +
            '}' +
            '#lf-panel .lf-status{' +
                'min-height:2.85em!important;padding:.55em 1.05em!important;' +
                'font-size:.82em!important;' +
            '}' +
            '#lf-panel .lf-body{' +
                'top:7.2em!important;bottom:2.45em!important;' +
                'padding:.25em .55em .45em!important;' +
            '}' +
            '#lf-panel .lf-footer{' +
                'height:2.45em!important;padding:.55em 1.05em!important;' +
                'font-size:.72em!important;' +
            '}' +

            /* Compact list rows. */
            '#lf-panel .lf-section-title{' +
                'padding:.30em .42em .34em!important;font-size:.76em!important;' +
            '}' +
            '#lf-panel .lf-item{' +
                'padding:.56em .72em!important;margin:.10em 0!important;' +
                'font-size:.96em!important;line-height:1.2!important;' +
            '}' +

            /* Independent, permanently visible scroll areas. */
            '#lf-panel .lf-scroll{' +
                'overflow-y:scroll!important;overflow-x:hidden!important;' +
                'padding-right:.20em!important;' +
                'scrollbar-width:thin;scrollbar-color:#777 #202020;' +
            '}' +
            '#lf-panel .lf-scroll::-webkit-scrollbar{width:.48em;height:.48em;}' +
            '#lf-panel .lf-scroll::-webkit-scrollbar-track{' +
                'background:#202020;border-radius:.3em;' +
            '}' +
            '#lf-panel .lf-scroll::-webkit-scrollbar-thumb{' +
                'background:#777;border-radius:.3em;border:1px solid #202020;' +
            '}' +
            '#lf-panel .lf-scroll::-webkit-scrollbar-thumb:hover{background:#aaa;}' +

            /* Three-season area, flexible source area, two-translation area. */
            '#lf-panel .lf-section-season{' +
                'flex:0 0 9.7em!important;max-height:9.7em!important;' +
                'min-height:0!important;' +
            '}' +
            '#lf-panel .lf-section-source{' +
                'flex:1 1 auto!important;min-height:10.5em!important;max-height:none!important;' +
            '}' +
            '#lf-panel .lf-section-voice{' +
                'flex:0 0 7.15em!important;max-height:7.15em!important;' +
                'min-height:0!important;' +
            '}' +

            /* The one reset button is clear enough; remove the ACTIONS heading. */
            '#lf-panel .lf-section-actions{' +
                'flex:0 0 auto!important;max-height:3.15em!important;' +
                'border-bottom:0!important;margin:.12em 0 0!important;padding:0!important;' +
            '}' +
            '#lf-panel .lf-section-actions .lf-section-title{display:none!important;}' +
            '#lf-panel .lf-section-actions .lf-scroll{' +
                'overflow:hidden!important;padding-right:0!important;' +
            '}' +
            '#lf-panel .lf-section-actions .lf-item{' +
                'padding:.46em .72em!important;font-size:.87em!important;' +
                'background:rgba(255,255,255,.075)!important;' +
            '}' +

            /* Visible hint that more rows exist below/above. */
            '#lf-panel .lf-section.lf3-has-overflow>.lf-section-title:after{' +
                'content:"↕";float:right;font-size:1.15em;color:#b5b5b5;' +
                'margin-left:.5em;line-height:.8;' +
            '}' +

            '@media screen and (max-height:720px){' +
                '#lf-panel .lf-section-season{' +
                    'flex-basis:8.55em!important;max-height:8.55em!important;' +
                '}' +
                '#lf-panel .lf-section-voice{' +
                    'flex-basis:6.25em!important;max-height:6.25em!important;' +
                '}' +
                '#lf-panel .lf-item{' +
                    'padding:.48em .66em!important;font-size:.91em!important;' +
                '}' +
            '}';

        document.head.appendChild(styleNode);
    }

    function tunePanel() {
        var panel = $('#lf-panel');
        var body;

        tuneTimer = null;

        if (!panel.length) return false;

        injectStyle();
        body = panel.find('.lf-body').first();
        if (!body.length) return false;

        body.children('.lf-section').each(function () {
            var section = $(this);
            var scroll = section.children('.lf-scroll').first();
            var overflow = false;

            if (section.hasClass('lf-section-actions')) {
                section.removeClass('lf3-has-overflow');
                return;
            }

            if (scroll.length && scroll[0]) {
                overflow = scroll[0].scrollHeight > scroll[0].clientHeight + 2;
            }

            section.toggleClass('lf3-has-overflow', overflow);
        });

        return true;
    }

    function scheduleTune() {
        clearTimeout(tuneTimer);
        tuneTimer = setTimeout(tunePanel, 35);
    }

    function observePanel() {
        var panel = document.getElementById('lf-panel');
        var body;

        if (!panel) return false;

        body = panel.querySelector('.lf-body');
        if (!body) return false;

        if (observedBody === body && observer) {
            scheduleTune();
            return true;
        }

        if (observer) observer.disconnect();

        observedBody = body;
        observer = new MutationObserver(function () {
            scheduleTune();
        });

        observer.observe(body, {
            childList: true,
            subtree: true
        });

        window.addEventListener('resize', scheduleTune);
        scheduleTune();

        return true;
    }

    function waitForPanel() {
        clearInterval(waitTimer);
        waitCount = 0;

        waitTimer = setInterval(function () {
            waitCount++;

            if (observePanel()) {
                clearInterval(waitTimer);
                waitTimer = null;
                console.log('LF3', 'compact scroll layout v' + VERSION + ' active');
                return;
            }

            if (waitCount > 100) {
                clearInterval(waitTimer);
                waitTimer = null;

                if (Lampa.Noty && Lampa.Noty.show) {
                    Lampa.Noty.show('LF3: панель LF не найдена. Отключите старые фильтры.');
                }
            }
        }, 125);
    }

    function startPatch() {
        injectStyle();
        waitForPanel();
    }

    function loadCore() {
        if (window.lf2_layout_plugin) {
            startPatch();
            return;
        }

        if (
            window.lf_card_filter_plugin ||
            window.lampac_src_filter_plugin ||
            window.lampac_src_filter_sticky_plugin ||
            window.lampac_persistent_sidebar_plugin ||
            window.lampac_card_swap_shell
        ) {
            if (Lampa.Noty && Lampa.Noty.show) {
                Lampa.Noty.show('LF3: отключите LF/LF2 и старые Lampac-фильтры.');
            }
            return;
        }

        Lampa.Utils.putScriptAsync([CORE_URL], function () {
            setTimeout(startPatch, 100);
        });
    }

    function start() {
        loadCore();
    }

    if (window.appready) {
        start();
    } else {
        Lampa.Listener.follow('app', function (event) {
            if (event.type === 'ready') start();
        });
    }
})();
