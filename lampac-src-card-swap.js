/*
 * Lampac Card / Filter Swap
 * Uses Proton4's persistent Lampac sidebar engine, but places it into the
 * Explorer movie-card slot. The original card and the filter can be swapped.
 *
 * Crosswalk 5 / Chromium 34 compatible: ES5 syntax only.
 *
 * Load this file only. Do not also load lampac-src-filter.js,
 * lampac-src-filter-sticky.js or lampac-src-sidebar.js.
 */
(function () {
    'use strict';

    var FLAG = 'lampac_card_swap_shell';
    var SIDEBAR_URL = 'https://proton4.github.io/lampac/lampac-src-sidebar.js?v=1';
    var DEFAULT_MODE = 'filter';

    var modes = {};
    var timer = null;
    var styleNode = null;
    var panel = null;
    var hiddenTab = null;
    var openButton = null;
    var activeExplorer = null;
    var activeCard = null;
    var activeMovieKey = '';
    var opening = false;
    var closing = false;

    if (window[FLAG]) return;
    window[FLAG] = true;

    function getActive() {
        try {
            return Lampa.Activity.active();
        } catch (e) {
            return null;
        }
    }

    function isLampacActivity(active) {
        var component;

        if (
            !active ||
            !active.movie ||
            !active.search ||
            !active.search_one ||
            !active.search_two
        ) {
            return false;
        }

        component = String(active.component || '').toLowerCase();

        return component !== 'torrents' && component.indexOf('mod') === -1;
    }

    function movieKey(active) {
        var movie;
        var id;

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

    function activeRoot(active) {
        if (active && active.activity && active.activity.body) {
            return $(active.activity.body);
        }

        return $();
    }

    function modeFor(key) {
        return modes[key] || DEFAULT_MODE;
    }

    function setMode(key, mode) {
        if (!key || (mode !== 'filter' && mode !== 'card')) return;

        modes[key] = mode;
    }

    function injectStyle() {
        if (styleNode) return;

        styleNode = document.createElement('style');
        styleNode.id = 'lampac-card-swap-style';
        styleNode.type = 'text/css';
        styleNode.textContent =
            'body.lampac-sidebar-open .activity--active .activity__body{' +
                'padding-left:0!important;' +
            '}' +
            '.explorer.lampac-card-swap-enabled .explorer__left{' +
                'display:block!important;width:31%!important;min-width:0;' +
            '}' +
            '.explorer.lampac-card-swap-enabled .explorer__files{' +
                'width:69%!important;min-width:0;' +
            '}' +
            '#lampac-persistent-sidebar.lampac-card-slot{' +
                'position:fixed!important;right:auto!important;bottom:0!important;' +
                'width:auto!important;height:auto!important;max-width:none!important;' +
                'box-shadow:none!important;border-right:1px solid rgba(255,255,255,.1);' +
                'z-index:45!important;' +
            '}' +
            '#lampac-persistent-sidebar.lampac-card-slot .lampac-sidebar-head{' +
                'padding-left:1.2em;padding-right:.65em;' +
            '}' +
            '#lampac-persistent-sidebar.lampac-card-slot .lampac-sidebar-body{' +
                'padding-left:.8em;padding-right:.8em;' +
            '}' +
            '.lampac-sidebar-tab.lampac-card-hidden-tab{' +
                'display:none!important;' +
            '}' +
            '.lampac-card-swap-open{' +
                'display:flex;align-items:center;justify-content:center;gap:.65em;' +
                'padding:.72em .9em;margin:0 1.1em 1em 2.2em;' +
                'border-radius:.55em;background:rgba(255,255,255,.08);' +
                'font-size:1em;font-weight:600;' +
            '}' +
            '.lampac-card-swap-open svg{' +
                'width:1.35em;height:1.35em;fill:currentColor;flex-shrink:0;' +
            '}' +
            '.lampac-card-swap-open.focus{' +
                'outline:.18em solid #fff;outline-offset:-.12em;' +
            '}' +
            '.explorer.lampac-card-filter-visible .explorer__card{' +
                'visibility:hidden!important;pointer-events:none!important;' +
            '}' +
            '.explorer.lampac-card-filter-visible .lampac-card-swap-open{' +
                'display:none!important;' +
            '}' +
            '@media screen and (max-width:1100px){' +
                '.explorer.lampac-card-swap-enabled .explorer__left{' +
                    'width:38%!important;' +
                '}' +
                '.explorer.lampac-card-swap-enabled .explorer__files{' +
                    'width:62%!important;' +
                '}' +
                '#lampac-persistent-sidebar.lampac-card-slot{' +
                    'font-size:.92em!important;' +
                '}' +
                '.lampac-card-swap-open{' +
                    'margin-left:1.2em;margin-right:.7em;' +
                '}' +
            '}';

        document.head.appendChild(styleNode);
    }

    function bindOnce(element, eventName, handler) {
        if (!element || !element.length) return;

        element.off(eventName + '.lampacCardSwap');
        element.on(eventName + '.lampacCardSwap', handler);
    }

    function captureUi() {
        panel = $('#lampac-persistent-sidebar');
        hiddenTab = $('.lampac-sidebar-tab').first();

        if (!panel.length || !hiddenTab.length) return false;

        panel.addClass('lampac-card-slot');
        hiddenTab.addClass('lampac-card-hidden-tab');

        bindOnce(panel.find('.lampac-sidebar-close'), 'hover:enter', function () {
            setMode(activeMovieKey, 'card');
        });
        bindOnce(panel.find('.lampac-sidebar-close'), 'click', function () {
            setMode(activeMovieKey, 'card');
        });

        return true;
    }

    function ensureOpenButton(explorer, card, key) {
        var scrollBody;
        var icon;

        if (!explorer || !explorer.length || !card || !card.length) return;

        scrollBody = card.parent();

        if (
            openButton &&
            openButton.length &&
            openButton.closest('.explorer')[0] === explorer[0]
        ) {
            return;
        }

        if (openButton) openButton.remove();

        icon =
            '<svg viewBox="0 0 24 24" aria-hidden="true">' +
                '<path d="M6.99 11 3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 9z"></path>' +
            '</svg>';

        openButton = $(
            '<div class="lampac-card-swap-open selector" title="Открыть фильтр">' +
                icon +
                '<span>Фильтр</span>' +
            '</div>'
        );

        openButton.insertBefore(card);

        bindOnce(openButton, 'hover:enter', function () {
            setMode(key, 'filter');
            requestPanelOpen();
        });
        bindOnce(openButton, 'click', function () {
            setMode(key, 'filter');
            requestPanelOpen();
        });
    }

    function requestPanelOpen() {
        if (opening || !hiddenTab || !hiddenTab.length) return;

        opening = true;

        try {
            hiddenTab.trigger('hover:enter');
        } catch (e) {}

        setTimeout(function () {
            opening = false;
        }, 350);
    }

    function requestPanelClose() {
        var closeButton;

        if (closing || !panel || !panel.length) return;

        closeButton = panel.find('.lampac-sidebar-close').first();
        if (!closeButton.length) return;

        closing = true;

        try {
            closeButton.trigger('hover:enter');
        } catch (e) {}

        setTimeout(function () {
            closing = false;
        }, 350);
    }

    function alignPanel(explorer, card) {
        var left;
        var rect;
        var top;
        var height;

        if (!panel || !panel.length || !explorer || !explorer.length) return;

        left = explorer.find('.explorer__left').first();
        if (!left.length) return;

        rect = left[0].getBoundingClientRect();
        top = Math.max(0, Math.round(rect.top));
        height = Math.max(260, window.innerHeight - top);

        panel.css({
            left: Math.round(rect.left) + 'px',
            top: top + 'px',
            width: Math.max(260, Math.round(rect.width)) + 'px',
            height: height + 'px',
            bottom: 'auto'
        });

        ensureOpenButton(explorer, card, activeMovieKey);
    }

    function panelVisible() {
        return panel && panel.length && panel.css('display') !== 'none';
    }

    function updateController() {
        var enabled;

        if (!openButton || !openButton.length || !openButton.is(':visible')) return;

        try {
            enabled = Lampa.Controller.enabled();

            if (enabled && enabled.name === 'explorer') {
                Lampa.Controller.collectionAppend(openButton);
            }
        } catch (e) {}
    }

    function restorePreviousCard() {
        if (activeExplorer && activeExplorer.length) {
            activeExplorer
                .removeClass('lampac-card-filter-visible')
                .removeClass('lampac-card-swap-enabled');
        }

        if (activeCard && activeCard.length) {
            activeCard.css({ visibility: '', pointerEvents: '' });
        }

        if (openButton && openButton.length) {
            openButton.remove();
        }

        activeExplorer = null;
        activeCard = null;
        openButton = null;
    }

    function updateLayout() {
        var active = getActive();
        var key;
        var root;
        var explorer;
        var card;
        var desired;
        var visible;

        if (!captureUi()) return;

        if (!isLampacActivity(active)) {
            restorePreviousCard();
            return;
        }

        key = movieKey(active);
        root = activeRoot(active);
        explorer = root.find('.explorer').first();
        card = explorer.find('.explorer__card').first();

        if (!key || !explorer.length || !card.length) {
            restorePreviousCard();
            return;
        }

        if (!modes[key]) modes[key] = DEFAULT_MODE;

        if (!activeExplorer || activeExplorer[0] !== explorer[0]) {
            restorePreviousCard();
            activeExplorer = explorer;
            activeCard = card;
            explorer.addClass('lampac-card-swap-enabled');
        }

        explorer.addClass('lampac-card-swap-enabled');

        activeMovieKey = key;
        desired = modeFor(key);
        visible = panelVisible();

        alignPanel(explorer, card);

        if (desired === 'filter' && !visible) {
            requestPanelOpen();
        } else if (desired === 'card' && visible) {
            requestPanelClose();
        }

        visible = panelVisible();

        if (visible) {
            explorer.addClass('lampac-card-filter-visible');
            card.css({ visibility: 'hidden', pointerEvents: 'none' });
            if (openButton) openButton.hide();
        } else {
            explorer.removeClass('lampac-card-filter-visible');
            card.css({ visibility: '', pointerEvents: '' });
            if (openButton) openButton.show();
            updateController();
        }
    }

    function startLoop() {
        injectStyle();

        clearInterval(timer);
        timer = setInterval(updateLayout, 250);

        updateLayout();

        window.addEventListener('resize', function () {
            setTimeout(updateLayout, 60);
        });

        if (Lampa.Listener) {
            Lampa.Listener.follow('activity', function () {
                setTimeout(updateLayout, 80);
            });
        }

        if (Lampa.Controller && Lampa.Controller.listener) {
            Lampa.Controller.listener.follow('toggle', function (event) {
                if (event && event.name === 'explorer') {
                    setTimeout(updateController, 50);
                }
            });
        }
    }

    function loadSidebar() {
        if ($('#lampac-persistent-sidebar').length) {
            startLoop();
            return;
        }

        if (
            window.lampac_src_filter_plugin ||
            window.lampac_src_filter_sticky_plugin ||
            window.lampac_persistent_sidebar_plugin
        ) {
            if (Lampa.Noty && Lampa.Noty.show) {
                Lampa.Noty.show(
                    'Отключите старый Lampac Source Filter / Sidebar перед Card Swap'
                );
            }
            return;
        }

        Lampa.Utils.putScriptAsync([SIDEBAR_URL], function () {
            setTimeout(startLoop, 100);
        });
    }

    function start() {
        loadSidebar();
    }

    if (window.appready) {
        start();
    } else {
        Lampa.Listener.follow('app', function (event) {
            if (event.type === 'ready') start();
        });
    }
})();
