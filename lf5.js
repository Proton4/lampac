/*
 * LF5 - TV-friendly large interface for Lampac Card Filter.
 *
 * Loads LF4, then applies a large-screen TV layout only on TV/Android TV
 * environments. Desktop browsers keep the LF4 desktop sizing.
 *
 * Crosswalk 5 / Chromium 34 compatible: ES5 syntax only.
 * v5.1 adds explicit TV scroll controls because old Crosswalk can hide
 * native/overlay scrollbars even when CSS requests them.
 *
 * Load LF5 only. Do not also load LF/LF2/LF3/LF4 or older Lampac filters.
 */
(function () {
    'use strict';

    var VERSION = '5.1.0';
    var FLAG = 'lf5_tv_ui_plugin';
    var CORE_URL = 'https://proton4.github.io/lampac/lf4.js?v=2';

    var styleNode = null;
    var waitTimer = null;
    var waitCount = 0;
    var resizeBound = false;
    var scrollUiTimer = null;
    var scrollUiObserver = null;
    var scrollUiBody = null;

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
                '-webkit-backface-visibility:visible!important;' +
                'backface-visibility:visible!important;' +
                '-webkit-transform:none!important;transform:none!important;' +
            '}' +
            '#lf-panel .lf-section{position:relative!important;}' +
            '#lf-panel .lf-scroll{position:relative!important;padding-right:1.05em!important;}' +
            '#lf-panel .lf5-scrollbar{' +
                'position:absolute;right:.12em;top:1.85em;bottom:.18em;width:.54em;' +
                'background:#242424;border-radius:.28em;z-index:8;pointer-events:none;' +
            '}' +
            '#lf-panel .lf5-scrollthumb{' +
                'position:absolute;left:.06em;right:.06em;top:0;height:24%;' +
                'background:#a0a0a0;border-radius:.22em;' +
            '}' +
            '#lf-panel .lf5-scrollbuttons{' +
                'position:absolute;right:.82em;top:.08em;z-index:9;display:flex;gap:.18em;' +
            '}' +
            '#lf-panel .lf5-scrollbtn{' +
                'width:1.55em;height:1.38em;line-height:1.32em;text-align:center;' +
                'background:rgba(255,255,255,.12);border-radius:.22em;font-size:.82em;' +
                'font-weight:700;pointer-events:auto;' +
            '}' +
            '#lf-panel .lf5-scrollbtn.focus{' +
                'outline:.16em solid #fff;outline-offset:-.08em;' +
            '}' +
            '#lf-panel .lf5-no-overflow .lf5-scrollbar,' +
            '#lf-panel .lf5-no-overflow .lf5-scrollbuttons{display:none!important;}' +

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


    function sectionScrollAmount(scroll) {
        var h = scroll && scroll.clientHeight ? scroll.clientHeight : 0;
        return Math.max(70, Math.round(h * 0.72));
    }

    function updateSectionScrollUi(section) {
        var scroll = section.querySelector('.lf-scroll');
        var track = section.querySelector('.lf5-scrollbar');
        var thumb = section.querySelector('.lf5-scrollthumb');
        var maxScroll;
        var ratio;
        var trackHeight;
        var thumbHeight;
        var top;

        if (!scroll || !track || !thumb) return;

        maxScroll = Math.max(0, scroll.scrollHeight - scroll.clientHeight);

        if (maxScroll <= 2) {
            section.classList.add('lf5-no-overflow');
            thumb.style.top = '0px';
            thumb.style.height = '100%';
            return;
        }

        section.classList.remove('lf5-no-overflow');

        trackHeight = track.clientHeight || scroll.clientHeight;
        ratio = scroll.clientHeight / scroll.scrollHeight;
        thumbHeight = Math.max(18, Math.round(trackHeight * ratio));
        top = Math.round((trackHeight - thumbHeight) * (scroll.scrollTop / maxScroll));

        thumb.style.height = thumbHeight + 'px';
        thumb.style.top = top + 'px';
    }

    function bindScrollButton(button, scroll, direction) {
        if (!button || button.__lf5Bound) return;
        button.__lf5Bound = true;

        function run(event) {
            if (event && event.preventDefault) event.preventDefault();
            if (event && event.stopPropagation) event.stopPropagation();

            scroll.scrollTop += direction * sectionScrollAmount(scroll);

            setTimeout(function () {
                var section = $(scroll).closest('.lf-section')[0];
                if (section) updateSectionScrollUi(section);
            }, 20);
        }

        $(button).on('hover:enter.lf5 click.lf5', run);
    }

    function ensureSectionScrollUi(section) {
        var scroll = section.querySelector('.lf-scroll');
        var buttons;
        var up;
        var down;
        var track;
        var thumb;

        if (!scroll) return;

        buttons = section.querySelector('.lf5-scrollbuttons');
        if (!buttons) {
            buttons = document.createElement('div');
            buttons.className = 'lf5-scrollbuttons';

            up = document.createElement('div');
            up.className = 'lf5-scrollbtn selector';
            up.innerHTML = '&#9650;';
            up.title = 'Scroll up';

            down = document.createElement('div');
            down.className = 'lf5-scrollbtn selector';
            down.innerHTML = '&#9660;';
            down.title = 'Scroll down';

            buttons.appendChild(up);
            buttons.appendChild(down);
            section.appendChild(buttons);

            bindScrollButton(up, scroll, -1);
            bindScrollButton(down, scroll, 1);
        }

        track = section.querySelector('.lf5-scrollbar');
        if (!track) {
            track = document.createElement('div');
            track.className = 'lf5-scrollbar';

            thumb = document.createElement('div');
            thumb.className = 'lf5-scrollthumb';
            track.appendChild(thumb);
            section.appendChild(track);
        }

        if (!scroll.__lf5ScrollBound) {
            scroll.__lf5ScrollBound = true;
            scroll.addEventListener('scroll', function () {
                updateSectionScrollUi(section);
            });
        }

        updateSectionScrollUi(section);
    }

    function refreshScrollUi() {
        var panel = document.getElementById('lf-panel');
        var sections;
        var i;

        scrollUiTimer = null;
        if (!panel) return;

        sections = panel.querySelectorAll(
            '.lf-section-season, .lf-section-source, .lf-section-voice'
        );

        for (i = 0; i < sections.length; i++) {
            ensureSectionScrollUi(sections[i]);
        }
    }

    function scheduleScrollUi() {
        clearTimeout(scrollUiTimer);
        scrollUiTimer = setTimeout(refreshScrollUi, 40);
    }

    function observeScrollUi() {
        var panel = document.getElementById('lf-panel');
        var foundBody;

        if (!panel) return false;

        foundBody = panel.querySelector('.lf-body');
        if (!foundBody) return false;

        if (scrollUiBody === foundBody && scrollUiObserver) {
            scheduleScrollUi();
            return true;
        }

        if (scrollUiObserver) scrollUiObserver.disconnect();

        scrollUiBody = foundBody;
        scrollUiObserver = new MutationObserver(function () {
            scheduleScrollUi();
        });

        scrollUiObserver.observe(foundBody, {
            childList: true,
            subtree: true
        });

        scheduleScrollUi();
        return true;
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
                observeScrollUi();
                scheduleScrollUi();

                if (!resizeBound) {
                    resizeBound = true;
                    window.addEventListener('resize', function () {
                        injectStyle();
                        scheduleScrollUi();
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
