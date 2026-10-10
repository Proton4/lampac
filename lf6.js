/*
 * LF6 - unified Lampac card filter.
 *
 * Standalone implementation: does NOT load LF/LF2/LF3/LF4/LF5.
 * Goals:
 * - replace the movie-card area with one persistent filter panel;
 * - keep Season / Source / Translation as independent scroll areas;
 * - remember the selected season per title and carry it across sources;
 * - keep the panel visible while Lampac asks to choose a matching series;
 * - deterministic reset: first season + default/first translation, same source;
 * - direct mouse control on desktop without controller-focus jumping;
 * - TV remote navigation with larger TV-only sizing;
 * - explicit custom scrollbars and up/down buttons for old Crosswalk;
 * - avoid periodic DOM rebuild loops and layered MutationObservers.
 *
 * Crosswalk 5 / Chromium 34 compatible: ES5 syntax only.
 */
(function () {
    'use strict';

    var VERSION = '6.0.0';
    var FLAG = 'lf6_unified_filter';
    var SEASON_STORAGE = 'lampac_src_filter_pinned_seasons';
    var VIEW_STORAGE = 'lf6_view_mode';

    var OriginalFilter = null;
    var currentContext = null;
    var lastContext = null;

    var panel = null;
    var panelBody = null;
    var panelStatus = null;
    var panelTitle = null;
    var styleNode = null;

    var activeExplorer = null;
    var activeCard = null;
    var renderTimer = null;
    var layoutTimer = null;
    var controllerTimer = null;
    var originalSelectClose = null;
    var restoreSelectCloseTimer = null;
    var viewMode = 'card';

    if (window[FLAG]) return;
    window[FLAG] = true;

    function tr(key) {
        try {
            return Lampa.Lang.translate(key);
        } catch (e) {
            return key;
        }
    }

    function addLang() {
        if (!Lampa.Lang || !Lampa.Lang.add) return;

        Lampa.Lang.add({
            lf6_filter: { ru: 'Фильтр', uk: 'Фільтр', en: 'Filter' },
            lf6_loading: { ru: 'Обновление…', uk: 'Оновлення…', en: 'Updating…' },
            lf6_pick_series: {
                ru: 'Выберите нужный сериал справа. Фильтр останется открыт.',
                uk: 'Виберіть потрібний серіал праворуч. Фільтр залишиться відкритим.',
                en: 'Choose the correct series on the right. The filter will stay open.'
            },
            lf6_pick_season: {
                ru: 'Выберите сезон — он запомнится для этого сериала.',
                uk: 'Виберіть сезон — він запам’ятається для цього серіалу.',
                en: 'Choose a season — it will be remembered for this series.'
            },
            lf6_reset: {
                ru: 'Сбросить сезон и озвучку',
                uk: 'Скинути сезон і озвучення',
                en: 'Reset season & audio'
            },
            lf6_footer: {
                ru: 'Сезон · источник · озвучка',
                uk: 'Сезон · джерело · озвучення',
                en: 'Season · source · audio'
            },
            lf6_close: {
                ru: 'Вернуть карточку',
                uk: 'Повернути картку',
                en: 'Restore card'
            },
            lf6_conflict: {
                ru: 'Отключите старые LF/Lampac-фильтры перед LF6',
                uk: 'Вимкніть старі LF/Lampac-фільтри перед LF6',
                en: 'Disable old LF/Lampac filters before LF6'
            }
        });
    }

    function isTv() {
        var ua = String(navigator.userAgent || '').toLowerCase();
        var result = false;

        try {
            if (Lampa.Platform && typeof Lampa.Platform.screen === 'function') {
                result = !!Lampa.Platform.screen('tv');
            }
        } catch (e) {}

        if (result) return true;

        return ua.indexOf('android') !== -1 && (
            ua.indexOf('crosswalk') !== -1 ||
            ua.indexOf('xwalk') !== -1 ||
            ua.indexOf('tv') !== -1
        );
    }

    function getActive() {
        try {
            return Lampa.Activity.active();
        } catch (e) {
            return null;
        }
    }

    function activeRoot() {
        var active = getActive();

        if (active && active.activity && active.activity.body) {
            return $(active.activity.body);
        }

        return $();
    }

    function activeLooksLikeLampac(active) {
        var name;

        if (!active || !active.movie || !active.search || !active.search_one || !active.search_two) {
            return false;
        }

        name = String(active.component || '').toLowerCase();

        return name !== 'torrents' && name.indexOf('mod') === -1;
    }

    function safeObject(value) {
        return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    }

    function storageObject(name) {
        return safeObject(Lampa.Storage.get(name, {}));
    }

    function movieId(context) {
        var id;

        if (!context || !context.params || !context.params.movie) return '';

        id = context.params.movie.id;

        return typeof id === 'undefined' || id === null ? '' : String(id);
    }

    function movieKey(context) {
        var movie;
        var id;

        if (!context || !context.params || !context.params.movie) return '';

        movie = context.params.movie;
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

    function movieTitle(context) {
        var movie;

        if (!context || !context.params || !context.params.movie) return 'Lampac';

        movie = context.params.movie;

        return movie.title ||
            movie.name ||
            movie.original_title ||
            movie.original_name ||
            'Lampac';
    }

    function sameActiveMovie(context) {
        var active = getActive();

        if (!activeLooksLikeLampac(active) || !context || !context.params || !context.params.movie) {
            return false;
        }

        return String(active.movie.id) === String(context.params.movie.id);
    }

    function getSeasonMemory(context) {
        var key = movieKey(context);
        var all = storageObject(SEASON_STORAGE);

        return key && all[key] ? all[key] : null;
    }

    function saveSeasonMemory(context, item, index) {
        var key = movieKey(context);
        var all;
        var title;
        var match;
        var number;

        if (!key) return;

        all = storageObject(SEASON_STORAGE);
        title = item && item.title ? String(item.title) : '';
        match = title.match(/\d+/);
        number = match ? parseInt(match[0], 10) : index + 1;

        all[key] = {
            index: index,
            number: number,
            label: title || (tr('torrent_serial_season') + ' ' + number)
        };

        Lampa.Storage.set(SEASON_STORAGE, all);
    }

    function clearSeasonMemory(context) {
        var key = movieKey(context);
        var all;

        if (!key) return;

        all = storageObject(SEASON_STORAGE);
        delete all[key];
        Lampa.Storage.set(SEASON_STORAGE, all);
    }

    function normalizeText(value) {
        return String(value || '')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .replace(/^\s+|\s+$/g, '');
    }

    function seasonGroup(context) {
        var items = context && context.filterItems ? context.filterItems : [];
        var i;

        for (i = 0; i < items.length; i++) {
            if (items[i] && items[i].stype === 'season' && items[i].items) {
                return items[i];
            }
        }

        return null;
    }

    function voiceGroup(context) {
        var items = context && context.filterItems ? context.filterItems : [];
        var i;

        for (i = 0; i < items.length; i++) {
            if (items[i] && items[i].stype === 'voice' && items[i].items) {
                return items[i];
            }
        }

        return null;
    }

    function resetItem(context) {
        var items = context && context.filterItems ? context.filterItems : [];
        var i;

        for (i = 0; i < items.length; i++) {
            if (items[i] && items[i].reset) return items[i];
        }

        return null;
    }

    function selectedIndex(items) {
        var i;

        if (!items) return -1;

        for (i = 0; i < items.length; i++) {
            if (items[i] && items[i].selected) return i;
        }

        return -1;
    }

    function selectedTitle(items) {
        var i;

        if (!items) return '';

        for (i = 0; i < items.length; i++) {
            if (items[i] && items[i].selected) return String(items[i].title || '');
        }

        return '';
    }

    function selectOnly(items, selected) {
        var i;

        if (!items) return;

        for (i = 0; i < items.length; i++) {
            if (items[i]) items[i].selected = items[i] === selected;
        }
    }

    function findRememberedSeason(group, memory) {
        var items = group && group.items ? group.items : [];
        var wantedLabel = memory ? normalizeText(memory.label) : '';
        var wantedNumber = memory ? parseInt(memory.number, 10) : NaN;
        var index;
        var title;
        var match;
        var i;

        if (!memory || !items.length) return null;

        if (wantedLabel) {
            for (i = 0; i < items.length; i++) {
                if (normalizeText(items[i].title) === wantedLabel) return items[i];
            }
        }

        if (!isNaN(wantedNumber)) {
            for (i = 0; i < items.length; i++) {
                title = String(items[i].title || '');
                match = title.match(/\d+/);

                if (match && parseInt(match[0], 10) === wantedNumber) return items[i];
            }
        }

        index = parseInt(memory.index, 10);

        if (!isNaN(index) && items[index]) return items[index];

        return null;
    }

    function prefillSeasonForSource(context, sourceName) {
        var memory = getSeasonMemory(context);
        var id = movieId(context);
        var data;
        var choice;

        if (!memory || !id || !sourceName) return;

        data = storageObject('online_choice_' + sourceName);
        choice = safeObject(data[id]);

        choice.season = parseInt(memory.index, 10) || 0;
        data[id] = choice;

        Lampa.Storage.set('online_choice_' + sourceName, data, true);
    }

    function currentBalancer() {
        return String(
            Lampa.Storage.get('active_balanser', '') ||
            Lampa.Storage.get('online_balanser', '') ||
            ''
        );
    }

    function resetStoredChoice(context) {
        var id = movieId(context);
        var source = currentBalancer();
        var storageName;
        var data;
        var choice;

        if (!id || !source) return;

        storageName = 'online_choice_' + source;
        data = storageObject(storageName);
        choice = safeObject(data[id]);

        choice.season = 0;
        choice.voice = 0;
        choice.voice_id = 0;
        choice.voice_name = '';
        choice.voice_url = '';

        data[id] = choice;
        Lampa.Storage.set(storageName, data, true);
    }

    function callFilterSelect(context, args) {
        if (!context || !context.filter || typeof context.filter.onSelect !== 'function') return;

        if (Lampa.Select && typeof Lampa.Select.close === 'function' && !originalSelectClose) {
            originalSelectClose = Lampa.Select.close;
            Lampa.Select.close = function () {};
        }

        clearTimeout(restoreSelectCloseTimer);

        try {
            context.filter.onSelect.apply(context.filter, args);
        } finally {
            restoreSelectCloseTimer = setTimeout(function () {
                if (originalSelectClose && Lampa.Select) {
                    Lampa.Select.close = originalSelectClose;
                    originalSelectClose = null;
                }
            }, 220);
        }
    }

    function similarCandidatesVisible() {
        return activeRoot().find('.online-prestige__folder').length > 0;
    }

    function applyRememberedSeason(context) {
        var memory;
        var group;
        var target;
        var index;
        var selected;

        if (
            !context ||
            context.destroyed ||
            context.autoSeasonApplying ||
            !context.isLampac ||
            !sameActiveMovie(context)
        ) return;

        memory = getSeasonMemory(context);
        group = seasonGroup(context);

        if (!memory || !group || !group.items || !group.items.length) return;

        target = findRememberedSeason(group, memory);
        if (!target) return;

        index = group.items.indexOf(target);
        selected = selectedIndex(group.items);

        if (index < 0 || selected === index) return;
        if (typeof context.filter.onSelect !== 'function') return;

        context.autoSeasonApplying = true;
        selectOnly(group.items, target);
        context.loading = true;
        updateStatusOnly(context);

        setTimeout(function () {
            if (
                context.destroyed ||
                currentContext !== context ||
                !sameActiveMovie(context)
            ) {
                context.autoSeasonApplying = false;
                return;
            }

            try {
                callFilterSelect(context, ['filter', group, target]);
            } catch (e) {
                context.autoSeasonApplying = false;
            }

            setTimeout(function () {
                context.autoSeasonApplying = false;
            }, 1200);
        }, 40);
    }

    function hasSourceItems(items) {
        var i;

        if (!items || !items.length) return false;

        for (i = 0; i < items.length; i++) {
            if (items[i] && typeof items[i].source !== 'undefined') return true;
        }

        return false;
    }

    function isContextActive(context) {
        return context && !context.destroyed && context.isLampac && sameActiveMovie(context);
    }

    function injectStyle() {
        var tv = isTv();

        if (styleNode) return;

        styleNode = document.createElement('style');
        styleNode.id = 'lf6-style';
        styleNode.type = 'text/css';
        styleNode.textContent =
            '#lf6-panel{' +
                'position:fixed;z-index:45;background:#111;color:#fff;' +
                'display:none;overflow:hidden;border-right:1px solid rgba(255,255,255,.1);' +
                'box-shadow:0 0 1em rgba(0,0,0,.28);font-size:1em;' +
                'transition:none!important;animation:none!important;' +
            '}' +
            '#lf6-panel *{' +
                'box-sizing:border-box;transition:none!important;animation:none!important;' +
                '-webkit-transition:none!important;-webkit-animation:none!important;' +
            '}' +
            '.lf6-head{' +
                'height:4.45em;padding:.85em .6em .55em 1em;display:flex;align-items:center;' +
                'border-bottom:1px solid rgba(255,255,255,.12);' +
            '}' +
            '.lf6-title{' +
                'font-size:1.25em;font-weight:600;white-space:nowrap;overflow:hidden;' +
                'text-overflow:ellipsis;flex:1;min-width:0;' +
            '}' +
            '.lf6-close{' +
                'font-size:1.55em;width:1.85em;height:1.85em;line-height:1.85em;' +
                'text-align:center;border-radius:.35em;margin-left:.4em;' +
            '}' +
            '.lf6-status{' +
                'min-height:2.9em;padding:.55em 1em;color:#aaa;font-size:.82em;' +
                'line-height:1.3;border-bottom:1px solid rgba(255,255,255,.08);' +
            '}' +
            '.lf6-body{' +
                'position:absolute;left:0;right:0;top:7.35em;bottom:2.4em;' +
                'display:flex;flex-direction:column;overflow:hidden;padding:.25em .55em .4em;' +
            '}' +
            '.lf6-footer{' +
                'position:absolute;left:0;right:0;bottom:0;height:2.4em;' +
                'padding:.55em 1em;color:#858585;font-size:.72em;' +
                'border-top:1px solid rgba(255,255,255,.08);' +
            '}' +
            '.lf6-section{' +
                'display:flex;flex-direction:column;min-height:0;overflow:hidden;' +
                'position:relative;border-bottom:1px solid rgba(255,255,255,.09);' +
                'padding-bottom:.2em;margin-bottom:.2em;' +
            '}' +
            '.lf6-section-title{' +
                'flex:0 0 auto;font-size:.76em;text-transform:uppercase;letter-spacing:.07em;' +
                'color:#999;padding:.28em .42em .35em;background:#111;' +
            '}' +
            '.lf6-scroll{' +
                'position:relative;flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;' +
                'padding:0 1.1em .25em 0;-webkit-overflow-scrolling:touch;' +
            '}' +
            '.lf6-item{' +
                'padding:.58em .7em;margin:.1em 0;border-radius:.4em;' +
                'background:rgba(255,255,255,.055);font-size:.96em;line-height:1.22;' +
                'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;' +
            '}' +
            '.lf6-item.selected{background:rgba(255,255,255,.25);font-weight:700;}' +
            '.lf6-item.ghost{opacity:.45;}' +
            '.lf6-item.focus,.lf6-close.focus,.lf6-scrollbtn.focus{' +
                'outline:.18em solid #fff;outline-offset:-.1em;' +
            '}' +
            '.lf6-section-season{flex:0 0 9.4em;max-height:9.4em;}' +
            '.lf6-section-source{flex:1 1 auto;min-height:8em;max-height:none;}' +
            '.lf6-section-voice{flex:0 0 6.8em;max-height:6.8em;}' +
            '.lf6-section-actions{' +
                'flex:0 0 3em;max-height:3em;min-height:3em;border-bottom:0;margin-bottom:0;' +
            '}' +
            '.lf6-section-actions .lf6-section-title{display:none;}' +
            '.lf6-section-actions .lf6-scroll{overflow:hidden;padding-right:0;}' +
            '.lf6-section-actions .lf6-item{font-size:.87em;padding:.48em .7em;}' +
            '.lf6-scrollbar{' +
                'position:absolute;right:.12em;top:1.75em;bottom:.2em;width:.5em;' +
                'background:#242424;border-radius:.28em;z-index:5;pointer-events:none;' +
            '}' +
            '.lf6-scrollthumb{' +
                'position:absolute;left:.05em;right:.05em;top:0;height:25%;' +
                'background:#999;border-radius:.22em;' +
            '}' +
            '.lf6-scrollbuttons{' +
                'position:absolute;right:.78em;top:.08em;z-index:6;display:flex;gap:.18em;' +
            '}' +
            '.lf6-scrollbtn{' +
                'width:1.5em;height:1.34em;line-height:1.28em;text-align:center;' +
                'background:rgba(255,255,255,.12);border-radius:.22em;font-size:.82em;' +
                'font-weight:700;' +
            '}' +
            '.lf6-no-overflow .lf6-scrollbar,.lf6-no-overflow .lf6-scrollbuttons{' +
                'display:none!important;' +
            '}' +
            '.explorer.lf6-filter-view .explorer__card{' +
                'visibility:hidden!important;pointer-events:none!important;' +
            '}' +
            (tv ?
                '.explorer.lf6-filter-view .explorer__left{' +
                    'width:40%!important;min-width:40%!important;' +
                '}' +
                '.explorer.lf6-filter-view .explorer__files{' +
                    'width:60%!important;min-width:60%!important;' +
                '}' +
                '#lf6-panel{font-size:1.38em!important;}' +
                '#lf6-panel .lf6-head{height:4.15em;padding:.72em .52em .45em .88em;}' +
                '#lf6-panel .lf6-title{font-size:1.16em;}' +
                '#lf6-panel .lf6-status{min-height:2.65em;padding:.46em .88em;font-size:.77em;}' +
                '#lf6-panel .lf6-body{top:6.8em;bottom:2.2em;padding:.18em .42em .32em;}' +
                '#lf6-panel .lf6-footer{height:2.2em;padding:.44em .88em;font-size:.66em;}' +
                '#lf6-panel .lf6-section-title{font-size:.71em;padding:.22em .32em .27em;}' +
                '#lf6-panel .lf6-item{font-size:.94em;padding:.64em .66em;margin:.09em 0;}' +
                '#lf6-panel .lf6-section-season{flex-basis:10.4em;max-height:10.4em;}' +
                '#lf6-panel .lf6-section-source{min-height:8.7em;}' +
                '#lf6-panel .lf6-section-voice{flex-basis:7.8em;max-height:7.8em;}' +
                '#lf6-panel .lf6-section-actions{flex-basis:3.15em;max-height:3.15em;min-height:3.15em;}' +
                '#lf6-panel .lf6-scrollbar{width:.66em;}' +
                '#lf6-panel .lf6-scrollbuttons{right:.92em;}' +
                '#lf6-panel .lf6-scrollbtn{width:1.62em;height:1.42em;line-height:1.36em;}' +
                '@media screen and (max-height:760px){' +
                    '#lf6-panel{font-size:1.28em!important;}' +
                    '#lf6-panel .lf6-section-season{flex-basis:9.2em;max-height:9.2em;}' +
                    '#lf6-panel .lf6-section-voice{flex-basis:6.8em;max-height:6.8em;}' +
                    '#lf6-panel .lf6-item{padding:.56em .62em;}' +
                '}' :
                ''
            );

        document.head.appendChild(styleNode);
    }

    function bindActivate(element, callback) {
        var last = 0;

        function run(event) {
            var now = Date.now();

            if (now - last < 230) return;
            last = now;

            if (event && event.preventDefault) event.preventDefault();
            if (event && event.stopPropagation) event.stopPropagation();

            callback();
        }

        element.on('hover:enter.lf6', run);
        element.on('click.lf6', run);
    }

    function ensurePanel() {
        var close;

        if (panel) return;

        injectStyle();

        panel = $(
            '<div id="lf6-panel">' +
                '<div class="lf6-head">' +
                    '<div class="lf6-title"></div>' +
                    '<div class="lf6-close selector" title="' + tr('lf6_close') + '">&#215;</div>' +
                '</div>' +
                '<div class="lf6-status"></div>' +
                '<div class="lf6-body"></div>' +
                '<div class="lf6-footer">' + tr('lf6_footer') + '</div>' +
            '</div>'
        );

        $('body').append(panel);

        panelTitle = panel.find('.lf6-title');
        panelStatus = panel.find('.lf6-status');
        panelBody = panel.find('.lf6-body');
        close = panel.find('.lf6-close');

        bindActivate(close, function () {
            setViewMode('card');
        });
    }

    function readViewMode() {
        var saved = String(Lampa.Storage.get(VIEW_STORAGE, 'card') || 'card');
        return saved === 'filter' ? 'filter' : 'card';
    }

    function setViewMode(mode) {
        viewMode = mode === 'filter' ? 'filter' : 'card';
        Lampa.Storage.set(VIEW_STORAGE, viewMode);

        scheduleLayout();
        if (viewMode === 'filter') scheduleRender();
    }

    function restorePreviousLayout() {
        if (activeExplorer && activeExplorer.length) {
            activeExplorer.removeClass('lf6-filter-view');
        }

        if (activeCard && activeCard.length) {
            activeCard.css({ visibility: '', pointerEvents: '' });
        }

        activeExplorer = null;
        activeCard = null;
    }

    function alignPanel(leftColumn) {
        var rect;
        var top;
        var height;
        var width;

        if (!panel || !leftColumn || !leftColumn.length) return;

        rect = leftColumn[0].getBoundingClientRect();
        top = Math.max(0, Math.round(rect.top));
        height = Math.max(260, Math.round(window.innerHeight - top));
        width = Math.max(260, Math.round(rect.width));

        panel.css({
            left: Math.round(rect.left) + 'px',
            top: top + 'px',
            width: width + 'px',
            height: height + 'px',
            bottom: 'auto'
        });
    }

    function bindFilterButton(root) {
        var button;
        var last = 0;

        if (!root || !root.length) return;

        button = root.find('.torrent-filter .filter--filter').first();
        if (!button.length || button.data('lf6-bound')) return;

        button.off('hover:enter');
        button.data('lf6-bound', true);

        function open(event) {
            var now = Date.now();

            if (now - last < 230) return;
            last = now;

            if (event && event.preventDefault) event.preventDefault();
            if (event && event.stopPropagation) event.stopPropagation();

            setViewMode('filter');
        }

        button.on('hover:enter.lf6', open);
        button.on('click.lf6', open);
    }

    function updateLayout() {
        var active = getActive();
        var context = currentContext || lastContext;
        var root;
        var explorer;
        var left;
        var card;

        layoutTimer = null;
        ensurePanel();

        if (!activeLooksLikeLampac(active) || !context || !sameActiveMovie(context)) {
            if (panel) panel.hide();
            restorePreviousLayout();
            return;
        }

        root = activeRoot();
        explorer = root.find('.explorer').first();
        left = explorer.find('.explorer__left').first();
        card = explorer.find('.explorer__card').first();

        if (!explorer.length || !left.length || !card.length) {
            if (panel) panel.hide();
            return;
        }

        if (!activeExplorer || activeExplorer[0] !== explorer[0]) {
            restorePreviousLayout();
            activeExplorer = explorer;
            activeCard = card;
        }

        bindFilterButton(root);

        if (viewMode === 'filter') {
            explorer.addClass('lf6-filter-view');
            card.css({ visibility: 'hidden', pointerEvents: 'none' });
            panel.show();
            alignPanel(left);
        } else {
            explorer.removeClass('lf6-filter-view');
            card.css({ visibility: '', pointerEvents: '' });
            panel.hide();
        }

        if (isTv()) scheduleControllerSync();
    }

    function scheduleLayout() {
        clearTimeout(layoutTimer);
        layoutTimer = setTimeout(updateLayout, 25);
    }

    function createScrollChrome(section, scroll) {
        var buttons;
        var up;
        var down;
        var bar;
        var thumb;

        buttons = $('<div class="lf6-scrollbuttons"></div>');
        up = $('<div class="lf6-scrollbtn selector">&#9650;</div>');
        down = $('<div class="lf6-scrollbtn selector">&#9660;</div>');
        bar = $('<div class="lf6-scrollbar"></div>');
        thumb = $('<div class="lf6-scrollthumb"></div>');

        bar.append(thumb);
        buttons.append(up).append(down);
        section.append(buttons).append(bar);

        function move(direction) {
            scroll[0].scrollTop += direction * Math.max(70, Math.round(scroll[0].clientHeight * 0.72));
            updateScrollChrome(section, scroll, bar, thumb);
        }

        bindActivate(up, function () { move(-1); });
        bindActivate(down, function () { move(1); });

        scroll.on('scroll.lf6', function () {
            updateScrollChrome(section, scroll, bar, thumb);
        });

        return { bar: bar, thumb: thumb };
    }

    function updateScrollChrome(section, scroll, bar, thumb) {
        var node;
        var maxScroll;
        var trackHeight;
        var thumbHeight;
        var ratio;
        var top;

        if (!scroll || !scroll.length || !scroll[0]) return;

        node = scroll[0];
        maxScroll = Math.max(0, node.scrollHeight - node.clientHeight);

        if (maxScroll <= 2) {
            section.addClass('lf6-no-overflow');
            return;
        }

        section.removeClass('lf6-no-overflow');

        trackHeight = bar[0].clientHeight || node.clientHeight;
        ratio = node.clientHeight / node.scrollHeight;
        thumbHeight = Math.max(18, Math.round(trackHeight * ratio));
        top = Math.round((trackHeight - thumbHeight) * (node.scrollTop / maxScroll));

        thumb.css({ height: thumbHeight + 'px', top: top + 'px' });
    }

    function addSection(title, type, items, clickHandler, options) {
        var section;
        var sectionTitle;
        var scroll;
        var chrome;
        var i;
        var item;
        var button;
        var noClick;

        if (!items || !items.length) return null;

        options = options || {};
        noClick = !!options.noClick;

        section = $('<div class="lf6-section lf6-section-' + type + '"></div>');
        sectionTitle = $('<div class="lf6-section-title"></div>').text(title);
        scroll = $('<div class="lf6-scroll"></div>');

        section.append(sectionTitle).append(scroll);

        for (i = 0; i < items.length; i++) {
            item = items[i];
            if (!item || item.hide) continue;

            button = $('<div class="lf6-item"></div>');
            button.text(item.title || '—');

            if (!noClick) button.addClass('selector');
            if (item.selected) button.addClass('selected');
            if (item.ghost) button.addClass('ghost');

            if (!noClick) {
                (function (selectedItem, selectedButton) {
                    bindActivate(selectedButton, function () {
                        clickHandler(selectedItem);
                    });
                })(item, button);
            }

            scroll.append(button);
        }

        panelBody.append(section);

        if (type !== 'actions') {
            chrome = createScrollChrome(section, scroll);

            setTimeout(function () {
                updateScrollChrome(section, scroll, chrome.bar, chrome.thumb);
            }, 0);
        }

        return section;
    }

    function updateStatusOnly(context) {
        var memory = getSeasonMemory(context);
        var source = selectedTitle(context && context.sortItems);
        var voiceGroupData = voiceGroup(context);
        var voice = selectedTitle(voiceGroupData && voiceGroupData.items);
        var parts = [];

        if (!panelStatus) return;

        if (memory && memory.label) parts.push(memory.label);
        if (source) parts.push(source);
        if (voice) parts.push(voice);

        if (context && context.loading) {
            panelStatus.text((parts.length ? parts.join(' · ') + ' — ' : '') + tr('lf6_loading'));
        } else if (similarCandidatesVisible()) {
            panelStatus.text((parts.length ? parts.join(' · ') + '. ' : '') + tr('lf6_pick_series'));
        } else if (parts.length) {
            panelStatus.text(parts.join(' · '));
        } else {
            panelStatus.text(tr('lf6_pick_season'));
        }
    }

    function markSelectedInSection(type, itemTitle) {
        var section = panel && panel.find('.lf6-section-' + type).first();
        var wanted = normalizeText(itemTitle);

        if (!section || !section.length) return;

        section.find('.lf6-item').each(function () {
            var row = $(this);
            row.toggleClass('selected', normalizeText(row.text()) === wanted);
        });
    }

    function selectSeason(context, group, item) {
        var index;

        if (!isContextActive(context) || !group || !item) return;

        index = group.items.indexOf(item);
        if (index < 0) return;

        saveSeasonMemory(context, item, index);
        selectOnly(group.items, item);
        markSelectedInSection('season', item.title);

        context.loading = true;
        updateStatusOnly(context);

        try {
            callFilterSelect(context, ['filter', group, item]);
        } catch (e) {
            context.loading = false;
            updateStatusOnly(context);
        }
    }

    function selectVoice(context, group, item) {
        if (!isContextActive(context) || !group || !item) return;

        selectOnly(group.items, item);
        markSelectedInSection('voice', item.title);

        context.loading = true;
        updateStatusOnly(context);

        try {
            callFilterSelect(context, ['filter', group, item]);
        } catch (e) {
            context.loading = false;
            updateStatusOnly(context);
        }
    }

    function selectSource(context, item) {
        if (!isContextActive(context) || !item) return;

        prefillSeasonForSource(context, item.source);
        selectOnly(context.sortItems, item);
        markSelectedInSection('source', item.title);

        context.loading = true;
        updateStatusOnly(context);

        try {
            callFilterSelect(context, ['sort', item]);
        } catch (e) {
            context.loading = false;
            updateStatusOnly(context);
        }
    }

    function resetFilter(context) {
        var seasons;
        var voices;
        var firstSeason;
        var reset;

        if (!isContextActive(context)) return;

        seasons = seasonGroup(context);
        voices = voiceGroup(context);
        firstSeason = seasons && seasons.items && seasons.items.length ? seasons.items[0] : null;
        reset = resetItem(context);

        if (firstSeason) saveSeasonMemory(context, firstSeason, 0);
        else clearSeasonMemory(context);

        resetStoredChoice(context);

        if (seasons && firstSeason) {
            selectOnly(seasons.items, firstSeason);
            markSelectedInSection('season', firstSeason.title);
        }

        if (voices && voices.items && voices.items.length) {
            selectOnly(voices.items, voices.items[0]);
            markSelectedInSection('voice', voices.items[0].title);
        }

        context.loading = true;
        updateStatusOnly(context);

        if (reset) {
            try {
                callFilterSelect(context, ['filter', reset]);
            } catch (e) {
                context.loading = false;
                updateStatusOnly(context);
            }
        } else if (firstSeason) {
            try {
                callFilterSelect(context, ['filter', seasons, firstSeason]);
            } catch (e2) {
                context.loading = false;
                updateStatusOnly(context);
            }
        }
    }

    function renderPanel() {
        var context = currentContext;
        var fallback = lastContext;
        var seasons;
        var voices;
        var memory;
        var seasonItems;

        renderTimer = null;
        ensurePanel();
        scheduleLayout();

        /*
         * During Lampac Activity.replace(), keep the current DOM intact.
         * Only change the status line. This prevents blank flashes/ghosting.
         */
        if (!isContextActive(context)) {
            if (fallback && sameActiveMovie(fallback)) {
                panelTitle.text(movieTitle(fallback));
                fallback.loading = true;
                updateStatusOnly(fallback);
            }
            return;
        }

        lastContext = context;
        panelTitle.text(movieTitle(context));
        panelBody.empty();

        seasons = seasonGroup(context);
        voices = voiceGroup(context);
        memory = getSeasonMemory(context);

        if (!similarCandidatesVisible() && seasons && seasons.items && seasons.items.length) {
            addSection(
                tr('torrent_serial_season'),
                'season',
                seasons.items,
                function (item) {
                    selectSeason(context, seasons, item);
                }
            );
        } else if (memory && memory.label) {
            seasonItems = [{
                title: memory.label,
                selected: true
            }];

            addSection(
                tr('torrent_serial_season'),
                'season',
                seasonItems,
                function () {},
                { noClick: true }
            );
        }

        if (context.sortItems && context.sortItems.length) {
            addSection(
                tr('settings_rest_source'),
                'source',
                context.sortItems,
                function (item) {
                    selectSource(context, item);
                }
            );
        }

        if (!similarCandidatesVisible() && voices && voices.items && voices.items.length) {
            addSection(
                tr('torrent_parser_voice'),
                'voice',
                voices.items,
                function (item) {
                    selectVoice(context, voices, item);
                }
            );
        }

        addSection(
            '',
            'actions',
            [{ title: tr('lf6_reset') }],
            function () {
                resetFilter(context);
            }
        );

        context.loading = false;
        updateStatusOnly(context);

        setTimeout(function () {
            applyRememberedSeason(context);
        }, 70);

        if (isTv()) scheduleControllerSync();
    }

    function scheduleRender() {
        clearTimeout(renderTimer);
        renderTimer = setTimeout(renderPanel, 30);
    }

    function scheduleControllerSync() {
        if (!isTv()) return;

        clearTimeout(controllerTimer);
        controllerTimer = setTimeout(syncController, 100);
    }

    function syncController() {
        var enabled;
        var active;
        var root;
        var focused;

        controllerTimer = null;

        if (!isTv() || viewMode !== 'filter' || !panel || !panel.is(':visible')) return;

        try {
            enabled = Lampa.Controller.enabled();
            if (!enabled || enabled.name !== 'content') return;

            active = getActive();
            if (!active || !active.activity || !active.activity.body) return;

            root = $(active.activity.body);
            focused = root.find('.selector.focus:visible').first();

            if (!focused.length) {
                focused = panel.find('.lf6-item.selected:visible').first();
            }

            if (!focused.length) {
                focused = panel.find('.selector:visible').first();
            }

            Lampa.Controller.collectionSet(root, panel, true);

            if (focused.length) {
                Lampa.Controller.collectionFocus(focused, root, true);
            }
        } catch (e) {}
    }

    function patchFilter() {
        if (!Lampa.Filter || Lampa.Filter.__lf6Wrapped) return;

        OriginalFilter = Lampa.Filter;

        function Lf6Filter(params) {
            var filter = new OriginalFilter(params);
            var originalSet = filter.set;
            var originalDestroy = filter.destroy;

            var context = {
                filter: filter,
                params: params || {},
                sortItems: [],
                filterItems: [],
                isLampac: false,
                destroyed: false,
                loading: false,
                autoSeasonApplying: false
            };

            filter.set = function (type, items) {
                var result = originalSet.apply(filter, arguments);

                context.loading = false;

                if (type === 'sort') {
                    context.sortItems = items || [];

                    if (hasSourceItems(context.sortItems)) {
                        context.isLampac = true;
                    }
                }

                if (type === 'filter') {
                    context.filterItems = items || [];
                }

                if (context.isLampac) {
                    currentContext = context;
                    lastContext = context;
                    scheduleRender();
                    scheduleLayout();
                }

                return result;
            };

            filter.destroy = function () {
                context.destroyed = true;

                if (currentContext === context) {
                    currentContext = null;

                    if (lastContext === context) {
                        lastContext.loading = true;
                        updateStatusOnly(lastContext);
                    }
                }

                if (originalDestroy) {
                    return originalDestroy.apply(filter, arguments);
                }
            };

            return filter;
        }

        for (var key in OriginalFilter) {
            if (Object.prototype.hasOwnProperty.call(OriginalFilter, key)) {
                Lf6Filter[key] = OriginalFilter[key];
            }
        }

        Lf6Filter.prototype = OriginalFilter.prototype;
        Lf6Filter.__lf6Wrapped = true;

        Lampa.Filter = Lf6Filter;
    }

    function followActivity() {
        if (!Lampa.Listener) return;

        Lampa.Listener.follow('activity', function () {
            setTimeout(function () {
                scheduleLayout();
                if (currentContext && isContextActive(currentContext)) scheduleRender();
            }, 70);
        });

        if (Lampa.Controller && Lampa.Controller.listener) {
            Lampa.Controller.listener.follow('toggle', function (event) {
                if (event && event.name === 'content') scheduleControllerSync();
            });
        }

        window.addEventListener('resize', function () {
            scheduleLayout();
            scheduleRender();
        });
    }

    function conflictLoaded() {
        return window.lf_card_filter_plugin ||
            window.lf2_layout_plugin ||
            window.lf3_compact_scroll_plugin ||
            window.lf4_stability_plugin ||
            window.lf5_tv_ui_plugin ||
            window.lampac_src_filter_plugin ||
            window.lampac_src_filter_sticky_plugin ||
            window.lampac_persistent_sidebar_plugin ||
            window.lampac_card_swap_shell;
    }

    function start() {
        addLang();

        if (conflictLoaded()) {
            if (Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show(tr('lf6_conflict'));
            return;
        }

        viewMode = readViewMode();

        if (isTv()) $('body').addClass('lf6-tv');

        ensurePanel();
        patchFilter();
        followActivity();

        console.log('LF6', 'Unified Lampac filter v' + VERSION + ' loaded');
    }

    if (window.appready) {
        start();
    } else {
        Lampa.Listener.follow('app', function (event) {
            if (event.type === 'ready') start();
        });
    }
})();
