/*
 * LF5 - TV-friendly large interface for Lampac Card Filter.
 *
 * Loads LF4, then applies a large-screen TV layout only on TV/Android TV
 * environments. Desktop browsers keep the LF4 desktop sizing.
 *
 * Crosswalk 5 / Chromium 34 compatible: ES5 syntax only.
 * Load LF5 only. Do not also load LF/LF2/LF3/LF4 or older Lampac filters.
 */
(function () {
    'use strict';

    var VERSION = '5.0.0';
    var FLAG = 'lf5_tv_ui_plugin';
    var CORE_URL = 'https://proton4.github.io/lampac/lf4.js?v=2';

    var styleNode = null;
    var waitTimer = null;
    var waitCount = 0;
    var resizeBound = false;

    if (window[FLAG]) return;
    window[FLAG] = true;

    function isTvEnvironment() {
        var ua = String(navigator.userAgent || '').toLowerCase();
        var tv = false;

        try {
            if (Lampa.Platform && typeof Lampa.Platform.screen === 'function') {
                tv = !!Lampa.Platform.screen('tv');
            }
        } catch (e) {}

        if (tv) return true;

        /*
         * Old Android TV boxes running Crosswalk often do not expose a
         * reliable Lampa TV flag, so keep a conservative fallback.
         */
        if (
            ua.indexOf('android') !== -1 &&
            (
                ua.indexOf('crosswalk') !== -1 ||
                ua.indexOf('xwalk') !== -1 ||
                ua.indexOf('tv') !== -1
            )
        ) {
            return true;
        }

        return false;
    }

    function injectStyle() {
        if (styleNode || !isTvEnvironment()) return;

        styleNode = document.createElement('style');
        styleNode.id = 'lf5-tv-ui-style';
        styleNode.type = 'text/css';
        styleNode.textContent =
            /*
             * Give the filter more horizontal space on TV.
             * The series/content side remains the larger pane.
             */
            '.explorer.lf-filter-view .explorer__left{' +
                'width:40%!important;min-width:40%!important;' +
            '}' +
            '.explorer.lf-filter-view .explorer__files{' +
                'width:60%!important;min-width:60%!important;' +
            '}' +

            /*
             * Larger panel typography and controls for sofa viewing.
             */
            '#lf-panel{' +
                'font-size:1.42em!important;' +
                'background:#111!important;' +
                'box-shadow:none!important;' +
            '}' +
            '#lf-panel .lf-head{' +
                'height:4.15em!important;' +
                'padding:.72em .55em .48em .88em!important;' +
            '}' +
            '#lf-panel .lf-title{' +
                'font-size:1.16em!important;font-weight:600!important;' +
            '}' +
            '#lf-panel .lf-close{' +
                'font-size:1.65em!important;' +
                'width:1.8em!important;height:1.8em!important;line-height:1.8em!important;' +
            '}' +
            '#lf-panel .lf-status{' +
                'min-height:2.7em!important;' +
                'padding:.48em .88em!important;' +
                'font-size:.78em!important;line-height:1.25!important;' +
            '}' +
            '#lf-panel .lf-body{' +
                'top:6.85em!important;bottom:2.25em!important;' +
                'padding:.18em .42em .35em!important;' +
            '}' +
            '#lf-panel .lf-footer{' +
                'height:2.25em!important;' +
                'padding:.45em .88em!important;' +
                'font-size:.68em!important;' +
            '}' +

            /*
             * Bigger rows, but still keep several items visible in each block.
             */
            '#lf-panel .lf-section-title{' +
                'font-size:.73em!important;' +
                'padding:.24em .34em .28em!important;' +
                'letter-spacing:.07em!important;' +
            '}' +
            '#lf-panel .lf-item{' +
                'font-size:.96em!important;' +
                'line-height:1.22!important;' +
                'padding:.68em .68em!important;' +
                'margin:.10em 0!important;' +
                'border-radius:.38em!important;' +
            '}' +
            '#lf-panel .lf-item.selected{' +
                'background:rgba(255,255,255,.28)!important;' +
                'font-weight:700!important;' +
            '}' +
            '#lf-panel .lf-item.focus,' +
            '#lf-panel .lf-close.focus{' +
                'outline:.20em solid #fff!important;' +
                'outline-offset:-.11em!important;' +
            '}' +

            /*
             * TV-sized independent scroll areas.
             */
            '#lf-panel .lf-section-season:not(.lf-section-memory){' +
                'flex:0 0 10.6em!important;' +
                'max-height:10.6em!important;' +
                'min-height:0!important;' +
            '}' +
            '#lf-panel .lf-section-memory{' +
                'flex:0 0 3.7em!important;' +
                'max-height:3.7em!important;' +
                'min-height:0!important;' +
            '}' +
            '#lf-panel .lf-section-source{' +
                'flex:1 1 auto!important;' +
                'min-height:9em!important;' +
                'max-height:none!important;' +
            '}' +
            '#lf-panel .lf-section-voice{' +
                'flex:0 0 8em!important;' +
                'max-height:8em!important;' +
                'min-height:0!important;' +
            '}' +
            '#lf-panel .lf-section-actions{' +
                'flex:0 0 3.25em!important;' +
                'max-height:3.25em!important;' +
                'min-height:3.25em!important;' +
            '}' +
            '#lf-panel .lf-section-actions .lf-scroll{' +
                'height:3.15em!important;min-height:3.15em!important;' +
            '}' +

            /*
             * Thicker, clearly visible scrollbars for a TV screen.
             */
            '#lf-panel .lf-scroll{' +
                'overflow-y:scroll!important;' +
                'scrollbar-width:auto!important;' +
                'scrollbar-color:#8a8a8a #202020!important;' +
                'padding-right:.20em!important;' +
            '}' +
            '#lf-panel .lf-scroll::-webkit-scrollbar{' +
                'width:.72em!important;height:.72em!important;' +
            '}' +
            '#lf-panel .lf-scroll::-webkit-scrollbar-track{' +
                'background:#202020!important;border-radius:.32em!important;' +
            '}' +
            '#lf-panel .lf-scroll::-webkit-scrollbar-thumb{' +
                'background:#888!important;border-radius:.32em!important;' +
                'border:1px solid #202020!important;' +
            '}' +

            /*
             * Reduce old-GPU redraw artifacts on Crosswalk/Android TV.
             * LF itself remains fully opaque and does not animate between
             * source/season refreshes.
             */
            '#lf-panel,#lf-panel *{' +
                'transition:none!important;' +
                'animation:none!important;' +
                '-webkit-transition:none!important;' +
                '-webkit-animation:none!important;' +
            '}' +
            '#lf-panel{' +
                '-webkit-backface-visibility:hidden!important;' +
                'backface-visibility:hidden!important;' +
            '}' +

            /*
             * On lower-height 720p TV UIs keep the same readable font but
             * reclaim some vertical room from the section allocations.
             */
            '@media screen and (max-height:760px){' +
                '#lf-panel{font-size:1.32em!important;}' +
                '#lf-panel .lf-section-season:not(.lf-section-memory){' +
                    'flex-basis:9.5em!important;max-height:9.5em!important;' +
                '}' +
                '#lf-panel .lf-section-voice{' +
                    'flex-basis:7.1em!important;max-height:7.1em!important;' +
                '}' +
                '#lf-panel .lf-item{' +
                    'padding:.60em .64em!important;' +
                '}' +
            '}';

        document.head.appendChild(styleNode);
        document.body.className += ' lf5-tv-ui';

        console.log('LF5', 'TV UI v' + VERSION + ' active');
    }

    function applyWhenReady() {
        clearInterval(waitTimer);
        waitCount = 0;

        waitTimer = setInterval(function () {
            waitCount++;

            if (document.getElementById('lf-panel')) {
                clearInterval(waitTimer);
                waitTimer = null;
                injectStyle();

                if (!resizeBound) {
                    resizeBound = true;
                    window.addEventListener('resize', function () {
                        injectStyle();
                    });
                }

                return;
            }

            if (waitCount > 100) {
                clearInterval(waitTimer);
                waitTimer = null;
            }
        }, 125);
    }

    function startPatch() {
        applyWhenReady();
    }

    function loadCore() {
        if (window.lf4_stability_plugin) {
            startPatch();
            return;
        }

        if (
            window.lf_card_filter_plugin ||
            window.lf2_layout_plugin ||
            window.lf3_compact_scroll_plugin ||
            window.lampac_src_filter_plugin ||
            window.lampac_src_filter_sticky_plugin ||
            window.lampac_persistent_sidebar_plugin ||
            window.lampac_card_swap_shell
        ) {
            if (Lampa.Noty && Lampa.Noty.show) {
                Lampa.Noty.show('LF5: отключите LF/LF2/LF3/LF4 и старые Lampac-фильтры.');
            }
            return;
        }

        Lampa.Utils.putScriptAsync([CORE_URL], function () {
            setTimeout(startPatch, 140);
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
