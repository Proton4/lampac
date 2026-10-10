/*
 * LF2 - Lampac Card Filter layout/focus update
 *
 * Loads LF core, then adds:
 * - a fixed season area with its own scroll;
 * - an independent source scroll;
 * - an independent voice scroll;
 * - remembered season label while Lampac asks to choose a matching series;
 * - mouse-focus protection for desktop browsers;
 * - automatic scroll-to-focused-item for Android TV / remote navigation.
 *
 * Crosswalk 5 / Chromium 34 compatible: ES5 syntax only.
 * Load LF2 only. Do not load lf.js or older Lampac filter plugins separately.
 */
(function () {
    'use strict';

    var VERSION = '2.0.0';
    var FLAG = 'lf2_layout_plugin';
    var CORE_URL = 'https://proton4.github.io/lampac/lf.js?v=1';
    var SEASON_STORAGE = 'lampac_src_filter_pinned_seasons';

    var styleNode = null;
    var observer = null;
    var normalizeTimer = null;
    var normalizing = false;
    var waitTimer = null;
    var waitCount = 0;
    var mouseActiveUntil = 0;
    var ignoreFocusUntil = 0;

    if (window[FLAG]) return;
    window[FLAG] = true;

    function tr(key) {
        try {
            return Lampa.Lang.translate(key);
        } catch (e) {
            return key;
        }
    }

    function markMouse() {
        mouseActiveUntil = Date.now() + 2500;
    }

    function mouseIsActive() {
        return Date.now() < mouseActiveUntil;
    }

    function bindMouseDetector() {
        if (document.__lf2MouseBound) return;
        document.__lf2MouseBound = true;

        document.addEventListener('mousemove', markMouse, true);
        document.addEventListener('mousedown', markMouse, true);
        document.addEventListener('wheel', markMouse, true);
    }

    function safeObject(value) {
        return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    }

    function movieKey() {
        var active;
        var movie;
        var id;

        try {
            active = Lampa.Activity.active();
        } catch (e) {
            return '';
        }

        if (!active || !active.movie) return '';

        movie = active.movie;
        id = movie.tmdb_id || movie.id;

        if (!id) {
            id = Lampa.Utils.hash(
                movie.original_name ||
                movie.original_title ||
                movie.name ||
                movie.title ||
                ''
            );
        }

        return String(movie.source || 'tmdb') + ':' + String(id);
    }

    function rememberedSeason() {
        var key = movieKey();
        var all = safeObject(Lampa.Storage.get(SEASON_STORAGE, {}));

        return key && all[key] ? all[key] : null;
    }

    function injectStyle() {
        if (styleNode) return;

        styleNode = document.createElement('style');
        styleNode.id = 'lf2-layout-style';
        styleNode.type = 'text/css';
        styleNode.textContent =
            '#lf-panel .lf-body{' +
                'display:flex!important;flex-direction:column!important;' +
                'overflow:hidden!important;padding:.35em .75em .65em!important;' +
            '}' +
            '#lf-panel .lf-section{' +
                'display:flex!important;flex-direction:column!important;' +
                'min-height:0!important;margin:0!important;' +
            '}' +
            '#lf-panel .lf-section-title{' +
                'flex:0 0 auto!important;padding:.55em .55em .48em!important;' +
                'background:#111!important;position:relative!important;z-index:2!important;' +
            '}' +
            '#lf-panel .lf-scroll{' +
                'min-height:0!important;overflow-y:auto!important;overflow-x:hidden!important;' +
                'padding:0 0 .45em 0!important;' +
                '-webkit-overflow-scrolling:touch;' +
            '}' +
            '#lf-panel .lf-section-season{' +
                'flex:0 1 29%!important;max-height:29%!important;' +
                'border-bottom:1px solid rgba(255,255,255,.10);' +
                'padding-bottom:.28em!important;margin-bottom:.28em!important;' +
            '}' +
            '#lf-panel .lf-section-source{' +
                'flex:1 1 auto!important;min-height:8em!important;' +
                'border-bottom:1px solid rgba(255,255,255,.10);' +
                'padding-bottom:.28em!important;margin-bottom:.28em!important;' +
            '}' +
            '#lf-panel .lf-section-voice{' +
                'flex:0 1 27%!important;max-height:27%!important;' +
                'border-bottom:1px solid rgba(255,255,255,.08);' +
                'padding-bottom:.2em!important;margin-bottom:.2em!important;' +
            '}' +
            '#lf-panel .lf-section-actions{' +
                'flex:0 0 auto!important;max-height:7.2em!important;' +
            '}' +
            '#lf-panel .lf-section-memory .lf-item{' +
                'opacity:.92;pointer-events:none;' +
            '}' +
            '#lf-panel .lf-item{' +
                'margin:.15em 0!important;' +
            '}' +
            '#lf-panel .lf-item:hover{' +
                'background:rgba(255,255,255,.15);' +
            '}' +
            '#lf-panel.lf2-mouse-active .lf-item.focus,' +
            '#lf-panel.lf2-mouse-active .lf-close.focus{' +
                'outline:none!important;' +
            '}' +
            '#lf-panel.lf2-mouse-active .lf-item:hover{' +
                'outline:.14em solid rgba(255,255,255,.85);outline-offset:-.10em;' +
            '}' +
            '@media screen and (max-height:650px){' +
                '#lf-panel .lf-section-season{flex-basis:25%!important;max-height:25%!important;}' +
                '#lf-panel .lf-section-voice{flex-basis:22%!important;max-height:22%!important;}' +
            '}';

        document.head.appendChild(styleNode);
    }

    function normalizeText(value) {
        return String(value || '')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .replace(/^\s+|\s+$/g, '');
    }

    function sectionType(section) {
        var title = normalizeText(section.find('.lf-section-title').first().text());
        var season = normalizeText(tr('torrent_serial_season'));
        var source = normalizeText(tr('settings_rest_source'));
        var voice = normalizeText(tr('torrent_parser_voice'));
        var actionsRu = normalizeText('Действия');
        var actionsUk = normalizeText('Дії');
        var actionsEn = normalizeText('Actions');

        if (title === season || title.indexOf('season') !== -1 || title.indexOf('сезон') !== -1) {
            return 'season';
        }

        if (
            title === source ||
            title.indexOf('source') !== -1 ||
            title.indexOf('источник') !== -1 ||
            title.indexOf('джерел') !== -1
        ) {
            return 'source';
        }

        if (
            title === voice ||
            title.indexOf('voice') !== -1 ||
            title.indexOf('озвуч') !== -1
        ) {
            return 'voice';
        }

        if (title === actionsRu || title === actionsUk || title === actionsEn) {
            return 'actions';
        }

        return 'other';
    }

    function ensureScroll(section) {
        var title = section.children('.lf-section-title').first();
        var scroll = section.children('.lf-scroll').first();
        var loose;

        if (!scroll.length) {
            scroll = $('<div class="lf-scroll"></div>');
            title.after(scroll);
        }

        loose = section.children().not(title).not(scroll);
        if (loose.length) scroll.append(loose);

        return scroll;
    }

    function ensureVisible(item) {
        var scroll = item.closest('.lf-scroll');
        var scrollNode;
        var itemRect;
        var scrollRect;
        var gap = 10;

        if (!scroll.length || !item.length) return;

        scrollNode = scroll[0];
        itemRect = item[0].getBoundingClientRect();
        scrollRect = scrollNode.getBoundingClientRect();

        if (itemRect.top < scrollRect.top + gap) {
            scrollNode.scrollTop -= (scrollRect.top + gap - itemRect.top);
        } else if (itemRect.bottom > scrollRect.bottom - gap) {
            scrollNode.scrollTop += (itemRect.bottom - (scrollRect.bottom - gap));
        }
    }

    function bindSectionFocus(section) {
        var items = section.find('.lf-item');
        var scroll = section.children('.lf-scroll').first();

        items.off('hover:focus.lf2 mouseenter.lf2');
        items.on('hover:focus.lf2', function () {
            ensureVisible($(this));
        });
        items.on('mouseenter.lf2', function () {
            markMouse();
            ensureVisible($(this));
        });

        scroll.off('wheel.lf2');
        scroll.on('wheel.lf2', function (event) {
            markMouse();
            if (event && event.stopPropagation) event.stopPropagation();
        });
    }

    function createSeasonMemorySection(body) {
        var memory = rememberedSeason();
        var section;
        var title;
        var scroll;
        var item;

        if (!memory || !memory.label) return;
        if (body.children('.lf-section-season').length) return;

        section = $('<div class="lf-section lf-section-season lf-section-memory"></div>');
        title = $('<div class="lf-section-title"></div>').text(tr('torrent_serial_season'));
        scroll = $('<div class="lf-scroll"></div>');
        item = $('<div class="lf-item selected"></div>').text(memory.label);

        scroll.append(item);
        section.append(title).append(scroll);
        body.prepend(section);
    }

    function normalizePanel() {
        var panel = $('#lf-panel');
        var body;
        var sections;
        var order = {
            season: 1,
            source: 2,
            voice: 3,
            actions: 4,
            other: 5
        };

        normalizeTimer = null;

        if (!panel.length || normalizing) return;

        normalizing = true;

        try {
            injectStyle();
            body = panel.find('.lf-body').first();

            if (!body.length) return;

            sections = body.children('.lf-section');

            sections.each(function () {
                var section = $(this);
                var type = sectionType(section);

                section
                    .removeClass(
                        'lf-section-season lf-section-source lf-section-voice ' +
                        'lf-section-actions lf-section-other'
                    )
                    .addClass('lf-section-' + type)
                    .attr('data-lf2-order', order[type] || 5);

                ensureScroll(section);
                bindSectionFocus(section);
            });

            createSeasonMemorySection(body);

            sections = body.children('.lf-section');
            sections.sort(function (a, b) {
                return parseInt($(a).attr('data-lf2-order') || '5', 10) -
                    parseInt($(b).attr('data-lf2-order') || '5', 10);
            });
            body.append(sections);

            if (mouseIsActive()) panel.addClass('lf2-mouse-active');
            else panel.removeClass('lf2-mouse-active');
        } finally {
            normalizing = false;
        }
    }

    function scheduleNormalize() {
        clearTimeout(normalizeTimer);
        normalizeTimer = setTimeout(normalizePanel, 20);
    }

    function observePanel() {
        var panel = document.getElementById('lf-panel');
        var body;

        if (!panel) return false;

        body = panel.querySelector('.lf-body');
        if (!body) return false;

        if (observer) observer.disconnect();

        observer = new MutationObserver(function () {
            scheduleNormalize();
        });

        observer.observe(body, {
            childList: true,
            subtree: true
        });

        scheduleNormalize();
        return true;
    }

    function patchControllerFocus() {
        var controller;
        var originalSet;
        var originalFocus;

        if (!Lampa.Controller || Lampa.Controller.__lf2FocusPatched) return;

        controller = Lampa.Controller;
        originalSet = controller.collectionSet;
        originalFocus = controller.collectionFocus;

        if (typeof originalSet !== 'function' || typeof originalFocus !== 'function') return;

        controller.collectionSet = function (html, append, visibleOnly) {
            var appendIsLf = false;

            try {
                appendIsLf = append && (
                    $(append).is('#lf-panel') ||
                    $(append).closest('#lf-panel').length > 0
                );
            } catch (e) {}

            if (mouseIsActive() && appendIsLf) {
                ignoreFocusUntil = Date.now() + 140;
                return;
            }

            return originalSet.apply(controller, arguments);
        };

        controller.collectionFocus = function () {
            if (mouseIsActive() && Date.now() < ignoreFocusUntil) return;

            return originalFocus.apply(controller, arguments);
        };

        controller.__lf2FocusPatched = true;
    }

    function waitForCore() {
        clearInterval(waitTimer);
        waitCount = 0;

        waitTimer = setInterval(function () {
            waitCount++;

            patchControllerFocus();

            if (observePanel()) {
                clearInterval(waitTimer);
                waitTimer = null;
                console.log('LF2', 'layout/focus update v' + VERSION + ' active');
                return;
            }

            if (waitCount > 80) {
                clearInterval(waitTimer);
                waitTimer = null;

                if (Lampa.Noty && Lampa.Noty.show) {
                    Lampa.Noty.show('LF2: панель LF не найдена. Отключите старые фильтры.');
                }
            }
        }, 125);
    }

    function startPatch() {
        bindMouseDetector();
        injectStyle();
        patchControllerFocus();
        waitForCore();
    }

    function loadCore() {
        if (window.lf_card_filter_plugin) {
            startPatch();
            return;
        }

        if (
            window.lampac_src_filter_plugin ||
            window.lampac_src_filter_sticky_plugin ||
            window.lampac_persistent_sidebar_plugin ||
            window.lampac_card_swap_shell
        ) {
            if (Lampa.Noty && Lampa.Noty.show) {
                Lampa.Noty.show('LF2: отключите старый Lampac Filter / Sidebar.');
            }
            return;
        }

        Lampa.Utils.putScriptAsync([CORE_URL], function () {
            setTimeout(startPatch, 80);
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
