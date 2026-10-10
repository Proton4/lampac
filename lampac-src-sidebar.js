/*
 * Lampac Persistent Sidebar Filter
 * Experimental split-screen source/season/voice selector for Lampa.
 *
 * Crosswalk 5 / Chromium 34 compatible: ES5 syntax only.
 *
 * Use this plugin instead of lampac-src-filter.js or
 * lampac-src-filter-sticky.js. Do not load them together.
 */
(function () {
    'use strict';

    var FLAG = 'lampac_persistent_sidebar_plugin';
    var SEASON_STORAGE = 'lampac_src_filter_pinned_seasons';
    var OPEN_STORAGE = 'lampac_sidebar_open';

    var OriginalFilter;
    var currentContext = null;
    var lastContext = null;
    var panel = null;
    var panelBody = null;
    var panelStatus = null;
    var panelTitle = null;
    var panelTab = null;
    var styleNode = null;
    var renderTimer = null;
    var controllerTimer = null;
    var panelOpen = true;
    var originalSelectClose = null;
    var restoreSelectCloseTimer = null;

    if (window[FLAG]) return;
    window[FLAG] = true;

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
        if (!context || !context.params || !context.params.movie) return '';

        var id = context.params.movie.id;

        return typeof id === 'undefined' || id === null ? '' : String(id);
    }

    function movieKey(context) {
        if (!context || !context.params || !context.params.movie) return '';

        var movie = context.params.movie;
        var id = movie.tmdb_id || movie.id;

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
        if (!context || !context.params || !context.params.movie) {
            return 'Lampac';
        }

        var movie = context.params.movie;

        return movie.title || movie.name || movie.original_title || movie.original_name || 'Lampac';
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
        if (!key) return;

        var all = storageObject(SEASON_STORAGE);
        var title = item && item.title ? String(item.title) : '';
        var match = title.match(/\d+/);
        var number = match ? parseInt(match[0], 10) : index + 1;

        all[key] = {
            index: index,
            number: number,
            label: title || (Lampa.Lang.translate('torrent_serial_season') + ' ' + number)
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

        if (
            typeof memory.index !== 'undefined' &&
            items[parseInt(memory.index, 10)]
        ) {
            return items[parseInt(memory.index, 10)];
        }

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
         * Lampac's filter callback closes Lampa.Select because it normally
         * runs from the modal selectbox. The sidebar does not use that modal,
         * so suppress only those immediate/delayed close calls.
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
            }, 180);
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
        return context && !context.destroyed && context.isLampac && sameActiveMovie(context);
    }

    function injectStyle() {
        if (styleNode) return;

        styleNode = document.createElement('style');
        styleNode.id = 'lampac-persistent-sidebar-style';
        styleNode.type = 'text/css';
        styleNode.textContent =
            '#lampac-persistent-sidebar{' +
                'position:fixed;left:0;top:0;bottom:0;width:30vw;' +
                'z-index:46;background:#111;color:#fff;' +
                'box-shadow:0 0 2em rgba(0,0,0,.75);' +
                'display:none;overflow:hidden;' +
                'font-size:1em;' +
            '}' +
            '#lampac-persistent-sidebar *{box-sizing:border-box;}' +
            '.lampac-sidebar-head{' +
                'height:5.2em;padding:1.25em 1.2em .8em 1.4em;' +
                'display:flex;align-items:center;border-bottom:1px solid rgba(255,255,255,.12);' +
            '}' +
            '.lampac-sidebar-title{' +
                'font-size:1.35em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;' +
                'flex:1;min-width:0;' +
            '}' +
            '.lampac-sidebar-close{' +
                'font-size:1.8em;width:2em;height:2em;line-height:2em;text-align:center;' +
                'border-radius:.35em;margin-left:.5em;' +
            '}' +
            '.lampac-sidebar-status{' +
                'min-height:3.3em;padding:.85em 1.4em;color:#aaa;' +
                'font-size:.9em;line-height:1.35;border-bottom:1px solid rgba(255,255,255,.08);' +
            '}' +
            '.lampac-sidebar-body{' +
                'position:absolute;left:0;right:0;top:8.5em;bottom:3.4em;' +
                'overflow-y:auto;padding:.8em 1em 1.2em 1em;' +
            '}' +
            '.lampac-sidebar-section{margin-bottom:1.25em;}' +
            '.lampac-sidebar-section-title{' +
                'font-size:.82em;text-transform:uppercase;letter-spacing:.08em;' +
                'color:#8d8d8d;padding:.25em .55em .65em .55em;' +
            '}' +
            '.lampac-sidebar-item{' +
                'padding:.82em .9em;margin:.18em 0;border-radius:.45em;' +
                'background:rgba(255,255,255,.055);font-size:1.02em;' +
                'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;' +
            '}' +
            '.lampac-sidebar-item.selected{' +
                'background:rgba(255,255,255,.22);font-weight:600;' +
            '}' +
            '.lampac-sidebar-item.ghost{opacity:.45;}' +
            '.lampac-sidebar-item.focus,.lampac-sidebar-close.focus,.lampac-sidebar-tab.focus{' +
                'outline:.18em solid #fff;outline-offset:-.12em;' +
            '}' +
            '.lampac-sidebar-footer{' +
                'position:absolute;left:0;right:0;bottom:0;height:3.4em;' +
                'padding:.8em 1.4em;color:#858585;border-top:1px solid rgba(255,255,255,.08);' +
                'font-size:.82em;' +
            '}' +
            '.lampac-sidebar-tab{' +
                'position:fixed;left:0;top:40%;z-index:46;' +
                'display:none;background:#111;color:#fff;' +
                'padding:.9em .55em;border-radius:0 .55em .55em 0;' +
                'box-shadow:0 0 1em rgba(0,0,0,.65);' +
                'font-size:.88em;' +
            '}' +
            'body.lampac-sidebar-open .activity--active .activity__body{' +
                'padding-left:30vw!important;box-sizing:border-box!important;' +
            '}' +
            '@media screen and (max-width:900px){' +
                '#lampac-persistent-sidebar{width:42vw;}' +
                'body.lampac-sidebar-open .activity--active .activity__body{' +
                    'padding-left:42vw!important;' +
                '}' +
            '}' +
            '@media screen and (max-width:520px){' +
                '#lampac-persistent-sidebar{width:100vw;}' +
                'body.lampac-sidebar-open .activity--active .activity__body{' +
                    'padding-left:0!important;' +
                '}' +
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
            '<div id="lampac-persistent-sidebar">' +
                '<div class="lampac-sidebar-head">' +
                    '<div class="lampac-sidebar-title"></div>' +
                    '<div class="lampac-sidebar-close selector">&#215;</div>' +
                '</div>' +
                '<div class="lampac-sidebar-status"></div>' +
                '<div class="lampac-sidebar-body"></div>' +
                '<div class="lampac-sidebar-footer">Сезон и источник — одним нажатием</div>' +
            '</div>'
        );

        panelTab = $('<div class="lampac-sidebar-tab selector">Фильтр</div>');

        $('body').append(panel).append(panelTab);

        panelBody = panel.find('.lampac-sidebar-body');
        panelStatus = panel.find('.lampac-sidebar-status');
        panelTitle = panel.find('.lampac-sidebar-title');
        closeButton = panel.find('.lampac-sidebar-close');

        bindActivate(closeButton, function () {
            panelOpen = false;
            Lampa.Storage.set(OPEN_STORAGE, false);
            showOrHidePanel();
        });

        bindActivate(panelTab, function () {
            panelOpen = true;
            Lampa.Storage.set(OPEN_STORAGE, true);
            showOrHidePanel();
            scheduleRender();
        });
    }

    function showOrHidePanel() {
        var context = currentContext || lastContext;
        var relevant = context && sameActiveMovie(context);

        ensurePanel();

        if (panelOpen && relevant) {
            panel.show();
            panelTab.hide();
            $('body').addClass('lampac-sidebar-open');
        } else {
            panel.hide();
            $('body').removeClass('lampac-sidebar-open');

            if (relevant) panelTab.show();
            else panelTab.hide();
        }

        scheduleControllerSync();
    }

    function addSection(title, items, clickHandler) {
        var section;
        var sectionTitle;
        var i;
        var item;
        var button;

        if (!items || !items.length) return;

        section = $('<div class="lampac-sidebar-section"></div>');
        sectionTitle = $('<div class="lampac-sidebar-section-title"></div>').text(title);
        section.append(sectionTitle);

        for (i = 0; i < items.length; i++) {
            item = items[i];
            if (!item || item.hide) continue;

            button = $('<div class="lampac-sidebar-item selector"></div>');
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
        var root = activeRoot();

        return root.find('.online-prestige__folder').length > 0;
    }

    function updateStatus(context) {
        var memory = getSeasonMemory(context);
        var selectedSource = '';
        var i;

        if (context && context.sortItems) {
            for (i = 0; i < context.sortItems.length; i++) {
                if (context.sortItems[i] && context.sortItems[i].selected) {
                    selectedSource = context.sortItems[i].title || '';
                    break;
                }
            }
        }

        if (context && context.loading) {
            panelStatus.text('Загрузка выбранного варианта…');
        } else if (similarCandidatesVisible()) {
            panelStatus.text('Выберите нужный сериал справа. Меню останется открытым.');
        } else if (memory && selectedSource) {
            panelStatus.text(memory.label + ' · ' + selectedSource);
        } else if (memory) {
            panelStatus.text(memory.label);
        } else {
            panelStatus.text('Выберите сезон — он запомнится для этого сериала.');
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
        var seasons;
        var voices;
        var reset;

        renderTimer = null;
        ensurePanel();

        if (!isContextActive(context)) {
            showOrHidePanel();

            if (panelOpen && lastContext && sameActiveMovie(lastContext)) {
                panelTitle.text(movieTitle(lastContext));
                panelStatus.text('Обновление источника…');
                panelBody.empty();
            }

            return;
        }

        lastContext = context;

        showOrHidePanel();
        if (!panelOpen) return;

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
                Lampa.Lang.translate('torrent_serial_season'),
                seasons.items,
                function (item) {
                    selectSeason(context, seasons, item);
                }
            );
        }

        if (context.sortItems && context.sortItems.length) {
            addSection(
                Lampa.Lang.translate('settings_rest_source'),
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
                Lampa.Lang.translate('torrent_parser_voice'),
                voices.items,
                function (item) {
                    selectVoice(context, voices, item);
                }
            );
        }

        if (reset) {
            addSection(
                'Действия',
                [{ title: Lampa.Lang.translate('torrent_parser_reset'), resetProxy: reset }],
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

        if (!panelOpen || !panel || !panel.is(':visible')) return;

        try {
            enabled = Lampa.Controller.enabled();
            if (!enabled || enabled.name !== 'content') return;

            active = getActive();
            if (!active || !active.activity || !active.activity.body) return;

            root = $(active.activity.body);
            focused = root.find('.selector.focus:visible').first();

            if (!focused.length) {
                focused = panel.find('.lampac-sidebar-item.selected:visible').first();
            }

            if (!focused.length) {
                focused = root.find('.selector:visible').first();
            }

            Lampa.Controller.collectionSet(root, panel, true);

            if (focused.length) {
                Lampa.Controller.collectionFocus(focused, root, true);
            }
        } catch (e) {
            // Mouse/touch control still works even if a Lampa build has a
            // different controller API.
        }
    }

    function patchFilter() {
        if (!Lampa.Filter || Lampa.Filter.__lampacSidebarWrapped) return;

        OriginalFilter = Lampa.Filter;

        function SidebarFilter(params) {
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
                }

                return result;
            };

            filter.destroy = function () {
                context.destroyed = true;

                if (currentContext === context) {
                    currentContext = null;
                    scheduleRender();
                }

                if (originalDestroy) {
                    return originalDestroy.apply(filter, arguments);
                }
            };

            return filter;
        }

        for (var key in OriginalFilter) {
            if (Object.prototype.hasOwnProperty.call(OriginalFilter, key)) {
                SidebarFilter[key] = OriginalFilter[key];
            }
        }

        SidebarFilter.prototype = OriginalFilter.prototype;
        SidebarFilter.__lampacSidebarWrapped = true;

        Lampa.Filter = SidebarFilter;
    }

    function followActivity() {
        if (!Lampa.Listener) return;

        Lampa.Listener.follow('activity', function () {
            setTimeout(function () {
                var context = currentContext || lastContext;

                if (!context || !sameActiveMovie(context)) {
                    if (panel) {
                        panel.hide();
                        panelTab.hide();
                        $('body').removeClass('lampac-sidebar-open');
                    }
                } else {
                    showOrHidePanel();
                    scheduleRender();
                }
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

    function start() {
        if (window.lampac_src_filter_plugin || window.lampac_src_filter_sticky_plugin) {
            if (Lampa.Noty && Lampa.Noty.show) {
                Lampa.Noty.show(
                    'Отключите старый Lampac Source Filter перед Sidebar Filter'
                );
            }
            return;
        }

        window.lampac_src_filter_plugin = true;
        window.lampac_src_filter_sticky_plugin = true;

        panelOpen = Lampa.Storage.get(OPEN_STORAGE, true) !== false;

        ensurePanel();
        patchFilter();
        followActivity();
    }

    if (window.appready) {
        start();
    } else {
        Lampa.Listener.follow('app', function (event) {
            if (event.type === 'ready') start();
        });
    }
})();
