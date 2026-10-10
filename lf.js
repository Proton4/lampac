/*
 * LF - Lampac Card Filter
 * Replaces the movie card with a persistent season/source/voice panel.
 *
 * Crosswalk 5 / Chromium 34 compatible: ES5 syntax only.
 *
 * Load this file only. Do not also load:
 * - lampac-src-filter.js
 * - lampac-src-filter-sticky.js
 * - lampac-src-sidebar.js
 * - lampac-src-card-swap.js
 */
(function () {
    'use strict';

    var VERSION = '1.0.0';
    var FLAG = 'lf_card_filter_plugin';
    var SEASON_STORAGE = 'lampac_src_filter_pinned_seasons';
    var VIEW_STORAGE = 'lf_view_mode';

    var OriginalFilter;
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
    var intervalTimer = null;

    var viewMode = 'card';
    var originalSelectClose = null;
    var restoreSelectCloseTimer = null;

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
            lf_filter: {
                ru: 'Фильтр',
                uk: 'Фільтр',
                en: 'Filter'
            },
            lf_loading: {
                ru: 'обновление…',
                uk: 'оновлення…',
                en: 'updating…'
            },
            lf_pick_series: {
                ru: 'Выберите нужный сериал справа. Фильтр останется открыт.',
                uk: 'Виберіть потрібний серіал праворуч. Фільтр залишиться відкритим.',
                en: 'Choose the correct series on the right. The filter will stay open.'
            },
            lf_pick_season: {
                ru: 'Выберите сезон — он запомнится для этого сериала.',
                uk: 'Виберіть сезон — він запам’ятається для цього серіалу.',
                en: 'Choose a season — it will be remembered for this series.'
            },
            lf_actions: {
                ru: 'Действия',
                uk: 'Дії',
                en: 'Actions'
            },
            lf_footer: {
                ru: 'Сезон · источник · озвучка — без закрытия',
                uk: 'Сезон · джерело · озвучення — без закриття',
                en: 'Season · source · audio — stays open'
            },
            lf_close: {
                ru: 'Вернуть карточку',
                uk: 'Повернути картку',
                en: 'Restore card'
            },
            lf_conflict: {
                ru: 'Отключите старый Lampac Source Filter перед LF',
                uk: 'Вимкніть старий Lampac Source Filter перед LF',
                en: 'Disable the old Lampac Source Filter before LF'
            }
        });
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

    function activeLooksLikeLampac(active) {
        var componentName;

        if (
            !active ||
            !active.movie ||
            !active.search ||
            !active.search_one ||
            !active.search_two
        ) {
            return false;
        }

        componentName = String(active.component || '').toLowerCase();

        return componentName !== 'torrents' && componentName.indexOf('mod') === -1;
    }

    function sameActiveMovie(context) {
        var active = getActive();

        if (
            !activeLooksLikeLampac(active) ||
            !context ||
            !context.params ||
            !context.params.movie
        ) {
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
            if (items[i] && items[i].selected) {
                return String(items[i].title || '');
            }
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
        var i;
        var title;
        var match;
        var index;

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

                if (match && parseInt(match[0], 10) === wantedNumber) {
                    return items[i];
                }
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

    function callFilterSelect(context, args) {
        if (!context || !context.filter || typeof context.filter.onSelect !== 'function') {
            return;
        }

        /*
         * Lampac normally calls Lampa.Select.close() because the built-in
         * filter is modal. LF is persistent, so suppress those close calls
         * only while the selection callback is running.
         */
        if (
            Lampa.Select &&
            typeof Lampa.Select.close === 'function' &&
            !originalSelectClose
        ) {
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
        ) {
            return;
        }

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
        scheduleRender();

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
        return context &&
            !context.destroyed &&
            context.isLampac &&
            sameActiveMovie(context);
    }

    function injectStyle() {
        if (styleNode) return;

        styleNode = document.createElement('style');
        styleNode.id = 'lf-card-filter-style';
        styleNode.type = 'text/css';
        styleNode.textContent =
            '#lf-panel{' +
                'position:fixed;z-index:45;background:#111;color:#fff;' +
                'display:none;overflow:hidden;' +
                'border-right:1px solid rgba(255,255,255,.1);' +
                'box-shadow:0 0 1.4em rgba(0,0,0,.35);' +
                'font-size:1em;' +
            '}' +
            '#lf-panel *{box-sizing:border-box;}' +
            '.lf-head{' +
                'height:5.1em;padding:1.2em .7em .75em 1.25em;' +
                'display:flex;align-items:center;' +
                'border-bottom:1px solid rgba(255,255,255,.12);' +
            '}' +
            '.lf-title{' +
                'font-size:1.35em;white-space:nowrap;overflow:hidden;' +
                'text-overflow:ellipsis;flex:1;min-width:0;' +
            '}' +
            '.lf-close{' +
                'font-size:1.8em;width:2em;height:2em;line-height:2em;' +
                'text-align:center;border-radius:.35em;margin-left:.45em;' +
            '}' +
            '.lf-status{' +
                'min-height:3.4em;padding:.85em 1.25em;color:#aaa;' +
                'font-size:.9em;line-height:1.35;' +
                'border-bottom:1px solid rgba(255,255,255,.08);' +
            '}' +
            '.lf-body{' +
                'position:absolute;left:0;right:0;top:8.5em;bottom:3.35em;' +
                'overflow-y:auto;padding:.75em .85em 1.1em .85em;' +
            '}' +
            '.lf-section{margin-bottom:1.15em;}' +
            '.lf-section-title{' +
                'font-size:.82em;text-transform:uppercase;letter-spacing:.08em;' +
                'color:#8d8d8d;padding:.25em .55em .6em .55em;' +
            '}' +
            '.lf-item{' +
                'padding:.8em .9em;margin:.18em 0;border-radius:.45em;' +
                'background:rgba(255,255,255,.055);font-size:1.02em;' +
                'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;' +
            '}' +
            '.lf-item.selected{' +
                'background:rgba(255,255,255,.23);font-weight:600;' +
            '}' +
            '.lf-item.ghost{opacity:.45;}' +
            '.lf-item.focus,.lf-close.focus{' +
                'outline:.18em solid #fff;outline-offset:-.12em;' +
            '}' +
            '.lf-footer{' +
                'position:absolute;left:0;right:0;bottom:0;height:3.35em;' +
                'padding:.8em 1.25em;color:#858585;' +
                'border-top:1px solid rgba(255,255,255,.08);font-size:.82em;' +
            '}' +
            '.explorer.lf-filter-view .explorer__card{' +
                'visibility:hidden!important;pointer-events:none!important;' +
            '}' +
            '@media screen and (max-width:720px){' +
                '#lf-panel{font-size:.92em;}' +
            '}';

        document.head.appendChild(styleNode);
    }

    function bindActivate(element, callback) {
        var last = 0;

        function run(event) {
            var now = Date.now();

            if (now - last < 250) return;
            last = now;

            if (event && event.preventDefault) event.preventDefault();
            if (event && event.stopImmediatePropagation) event.stopImmediatePropagation();

            callback();
        }

        element.on('hover:enter', run);
        element.on('click', run);
    }

    function ensurePanel() {
        var closeButton;

        if (panel) return;

        injectStyle();

        panel = $(
            '<div id="lf-panel">' +
                '<div class="lf-head">' +
                    '<div class="lf-title"></div>' +
                    '<div class="lf-close selector" title="' + tr('lf_close') + '">&#215;</div>' +
                '</div>' +
                '<div class="lf-status"></div>' +
                '<div class="lf-body"></div>' +
                '<div class="lf-footer">' + tr('lf_footer') + '</div>' +
            '</div>'
        );

        $('body').append(panel);

        panelBody = panel.find('.lf-body');
        panelStatus = panel.find('.lf-status');
        panelTitle = panel.find('.lf-title');
        closeButton = panel.find('.lf-close');

        bindActivate(closeButton, function () {
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
        scheduleRender();
    }

    function restorePreviousLayout() {
        if (activeExplorer && activeExplorer.length) {
            activeExplorer.removeClass('lf-filter-view');
        }

        if (activeCard && activeCard.length) {
            activeCard.css({
                visibility: '',
                pointerEvents: ''
            });
        }

        activeExplorer = null;
        activeCard = null;
    }

    function alignPanel(leftColumn) {
        var rect;
        var top;
        var height;
        var width;

        if (!panel || !panel.length || !leftColumn || !leftColumn.length) return;

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
        if (!button.length) return;

        if (button.data('lf-bound')) return;

        /*
         * Replace the built-in modal filter action. The same visible Filter
         * button now opens LF in the movie-card slot.
         */
        button.off('hover:enter');
        button.data('lf-bound', true);

        function open(event) {
            var now = Date.now();

            if (now - last < 250) return;
            last = now;

            if (event && event.preventDefault) event.preventDefault();
            if (event && event.stopImmediatePropagation) event.stopImmediatePropagation();

            setViewMode('filter');
        }

        button.on('hover:enter.lf', open);
        button.on('click.lf', open);
    }

    function updateLayout() {
        var active = getActive();
        var context = currentContext || lastContext;
        var root;
        var explorer;
        var leftColumn;
        var card;

        layoutTimer = null;
        ensurePanel();

        if (
            !activeLooksLikeLampac(active) ||
            !context ||
            !sameActiveMovie(context)
        ) {
            if (panel) panel.hide();
            restorePreviousLayout();
            return;
        }

        root = activeRoot();
        explorer = root.find('.explorer').first();
        leftColumn = explorer.find('.explorer__left').first();
        card = explorer.find('.explorer__card').first();

        if (!explorer.length || !leftColumn.length || !card.length) {
            if (panel) panel.hide();
            return;
        }

        if (!activeExplorer || activeExplorer[0] !== explorer[0]) {
            restorePreviousLayout();
            activeExplorer = explorer;
            activeCard = card;
        }

        bindFilterButton(root);
        alignPanel(leftColumn);

        if (viewMode === 'filter') {
            explorer.addClass('lf-filter-view');
            card.css({
                visibility: 'hidden',
                pointerEvents: 'none'
            });
            panel.show();
        } else {
            explorer.removeClass('lf-filter-view');
            card.css({
                visibility: '',
                pointerEvents: ''
            });
            panel.hide();
        }

        scheduleControllerSync();
    }

    function scheduleLayout() {
        clearTimeout(layoutTimer);
        layoutTimer = setTimeout(updateLayout, 30);
    }

    function addSection(title, items, clickHandler) {
        var section;
        var sectionTitle;
        var i;
        var item;
        var button;

        if (!items || !items.length) return;

        section = $('<div class="lf-section"></div>');
        sectionTitle = $('<div class="lf-section-title"></div>').text(title);
        section.append(sectionTitle);

        for (i = 0; i < items.length; i++) {
            item = items[i];

            if (!item || item.hide) continue;

            button = $('<div class="lf-item selector"></div>');
            button.text(item.title || '—');

            if (item.selected) button.addClass('selected');
            if (item.ghost) button.addClass('ghost');

            (function (selectedItem, selectedButton) {
                bindActivate(selectedButton, function () {
                    clickHandler(selectedItem);
                });
            })(item, button);

            section.append(button);
        }

        panelBody.append(section);
    }

    function similarCandidatesVisible() {
        return activeRoot().find('.online-prestige__folder').length > 0;
    }

    function updateStatus(context) {
        var memory = getSeasonMemory(context);
        var source = selectedTitle(context && context.sortItems);
        var voice = selectedTitle(
            voiceGroup(context) && voiceGroup(context).items
        );
        var parts = [];

        if (memory && memory.label) parts.push(memory.label);
        if (source) parts.push(source);
        if (voice) parts.push(voice);

        if (context && context.loading) {
            if (parts.length) {
                panelStatus.text(parts.join(' · ') + ' — ' + tr('lf_loading'));
            } else {
                panelStatus.text(tr('lf_loading'));
            }
        } else if (similarCandidatesVisible()) {
            if (parts.length) {
                panelStatus.text(parts.join(' · ') + '. ' + tr('lf_pick_series'));
            } else {
                panelStatus.text(tr('lf_pick_series'));
            }
        } else if (parts.length) {
            panelStatus.text(parts.join(' · '));
        } else {
            panelStatus.text(tr('lf_pick_season'));
        }
    }

    function selectSeason(context, group, item) {
        var index;

        if (!isContextActive(context) || !group || !item) return;
        if (typeof context.filter.onSelect !== 'function') return;

        index = group.items.indexOf(item);
        if (index < 0) return;

        saveSeasonMemory(context, item, index);
        selectOnly(group.items, item);
        context.loading = true;
        scheduleRender();

        try {
            callFilterSelect(context, ['filter', group, item]);
        } catch (e) {
            context.loading = false;
            scheduleRender();
        }
    }

    function selectVoice(context, group, item) {
        if (!isContextActive(context) || !group || !item) return;
        if (typeof context.filter.onSelect !== 'function') return;

        selectOnly(group.items, item);
        context.loading = true;
        scheduleRender();

        try {
            callFilterSelect(context, ['filter', group, item]);
        } catch (e) {
            context.loading = false;
            scheduleRender();
        }
    }

    function selectSource(context, item) {
        if (!isContextActive(context) || !item) return;
        if (typeof context.filter.onSelect !== 'function') return;

        prefillSeasonForSource(context, item.source);
        selectOnly(context.sortItems, item);
        context.loading = true;
        scheduleRender();

        try {
            callFilterSelect(context, ['sort', item]);
        } catch (e) {
            context.loading = false;
            scheduleRender();
        }
    }

    function resetFilter(context, item) {
        if (!isContextActive(context) || !item) return;
        if (typeof context.filter.onSelect !== 'function') return;

        context.loading = true;
        scheduleRender();

        try {
            callFilterSelect(context, ['filter', item]);
        } catch (e) {
            context.loading = false;
            scheduleRender();
        }
    }

    function renderPanel() {
        var context = currentContext;
        var fallback = lastContext;
        var seasons;
        var voices;
        var reset;

        renderTimer = null;
        ensurePanel();
        scheduleLayout();

        /*
         * During Activity.replace() the old Filter is destroyed before the new
         * one is ready. Keep the previous title/items visible instead of
         * flashing an empty panel or losing the season label.
         */
        if (!isContextActive(context)) {
            if (
                viewMode === 'filter' &&
                fallback &&
                sameActiveMovie(fallback)
            ) {
                panelTitle.text(movieTitle(fallback));
                updateStatus(fallback);
            }

            return;
        }

        lastContext = context;
        panelTitle.text(movieTitle(context));
        panelBody.empty();

        seasons = seasonGroup(context);
        voices = voiceGroup(context);
        reset = resetItem(context);

        if (
            !similarCandidatesVisible() &&
            seasons &&
            seasons.items &&
            seasons.items.length
        ) {
            addSection(
                tr('torrent_serial_season'),
                seasons.items,
                function (item) {
                    selectSeason(context, seasons, item);
                }
            );
        }

        if (context.sortItems && context.sortItems.length) {
            addSection(
                tr('settings_rest_source'),
                context.sortItems,
                function (item) {
                    selectSource(context, item);
                }
            );
        }

        if (
            !similarCandidatesVisible() &&
            voices &&
            voices.items &&
            voices.items.length
        ) {
            addSection(
                tr('torrent_parser_voice'),
                voices.items,
                function (item) {
                    selectVoice(context, voices, item);
                }
            );
        }

        if (reset) {
            addSection(
                tr('lf_actions'),
                [{
                    title: tr('torrent_parser_reset'),
                    resetProxy: reset
                }],
                function (item) {
                    resetFilter(context, item.resetProxy);
                }
            );
        }

        updateStatus(context);
        scheduleControllerSync();

        setTimeout(function () {
            applyRememberedSeason(context);
        }, 80);
    }

    function scheduleRender() {
        clearTimeout(renderTimer);
        renderTimer = setTimeout(renderPanel, 30);
    }

    function scheduleControllerSync() {
        clearTimeout(controllerTimer);
        controllerTimer = setTimeout(syncController, 120);
    }

    function syncController() {
        var enabled;
        var active;
        var root;
        var focused;

        controllerTimer = null;

        if (
            viewMode !== 'filter' ||
            !panel ||
            !panel.is(':visible')
        ) {
            return;
        }

        try {
            enabled = Lampa.Controller.enabled();

            if (!enabled || enabled.name !== 'content') return;

            active = getActive();
            if (!active || !active.activity || !active.activity.body) return;

            root = $(active.activity.body);
            focused = root.find('.selector.focus:visible').first();

            if (!focused.length) {
                focused = panel.find('.lf-item.selected:visible').first();
            }

            if (!focused.length) {
                focused = root.find('.selector:visible').first();
            }

            Lampa.Controller.collectionSet(root, panel, true);

            if (focused.length) {
                Lampa.Controller.collectionFocus(focused, root, true);
            }
        } catch (e) {
            /*
             * Mouse/touch control still works if a particular Lampa build
             * exposes a slightly different Controller API.
             */
        }
    }

    function patchFilter() {
        if (!Lampa.Filter || Lampa.Filter.__lfWrapped) return;

        OriginalFilter = Lampa.Filter;

        function LfFilter(params) {
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
                    scheduleRender();
                    scheduleLayout();
                }

                if (originalDestroy) {
                    return originalDestroy.apply(filter, arguments);
                }
            };

            return filter;
        }

        for (var key in OriginalFilter) {
            if (Object.prototype.hasOwnProperty.call(OriginalFilter, key)) {
                LfFilter[key] = OriginalFilter[key];
            }
        }

        LfFilter.prototype = OriginalFilter.prototype;
        LfFilter.__lfWrapped = true;

        Lampa.Filter = LfFilter;
    }

    function followActivity() {
        if (!Lampa.Listener) return;

        Lampa.Listener.follow('activity', function () {
            setTimeout(function () {
                scheduleRender();
                scheduleLayout();
            }, 80);
        });

        if (Lampa.Controller && Lampa.Controller.listener) {
            Lampa.Controller.listener.follow('toggle', function (event) {
                if (event && event.name === 'content') {
                    scheduleControllerSync();
                }
            });
        }
    }

    function startLoop() {
        clearInterval(intervalTimer);

        intervalTimer = setInterval(function () {
            updateLayout();
        }, 350);

        window.addEventListener('resize', function () {
            setTimeout(updateLayout, 60);
        });

        updateLayout();
    }

    function conflictLoaded() {
        return window.lampac_src_filter_plugin ||
            window.lampac_src_filter_sticky_plugin ||
            window.lampac_persistent_sidebar_plugin ||
            window.lampac_card_swap_shell;
    }

    function start() {
        addLang();

        if (conflictLoaded()) {
            if (Lampa.Noty && Lampa.Noty.show) {
                Lampa.Noty.show(tr('lf_conflict'));
            }

            return;
        }

        window.lampac_src_filter_plugin = true;
        window.lampac_src_filter_sticky_plugin = true;

        viewMode = readViewMode();

        ensurePanel();
        patchFilter();
        followActivity();
        startLoop();

        console.log('LF', 'Lampac Card Filter v' + VERSION + ' loaded');
    }

    if (window.appready) {
        start();
    } else {
        Lampa.Listener.follow('app', function (event) {
            if (event.type === 'ready') start();
        });
    }
})();
