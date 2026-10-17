/*
 * Lampac Virtual Seasons v1.0
 * Turn a single long Lampac season into selectable episode groups.
 * - Keeps the provider's real season/episode numbers and playback URLs.
 * - Adds virtual season choices to Lampac's existing Filter -> Season menu.
 * - Groups are local: no requests for invented season URLs.
 * - 32-bit Android TV / Crosswalk 5 / Chromium 34: ES5 only.
 * - Targets the Lampac online component only, not TMDB card metadata.
 */
(function () {
    'use strict';

    var MARKER = '__proton4_virtual_seasons_v1';
    var SIZE_SETTING = 'lampac_virtual_season_size';
    var MEMORY_SETTING = 'lampac_virtual_season_pages';
    var installed = false;
    var attempts = 0;

    if (window[MARKER]) return;
    window[MARKER] = true;

    function log(message) {
        if (window.console && console.log) console.log('Lampac Virtual Seasons:', message);
    }

    function readSize() {
        var n = parseInt(Lampa.Storage.get(SIZE_SETTING, '24'), 10);
        return (n >= 6 && n <= 100) ? n : 0;
    }

    function getBalancer() {
        return String(Lampa.Storage.get('active_balanser', '') ||
            Lampa.Storage.get('online_balanser', '') || '');
    }

    function memoryKey(params) {
        var movie = params && params.movie;
        if (!movie) return '';
        var id = movie.id || movie.tmdb_id || movie.imdb_id;
        return id ? String(movie.source || 'tmdb') + ':' + String(id) + ':' + getBalancer() : '';
    }

    function loadPage(params) {
        var key = memoryKey(params);
        var map = Lampa.Storage.get(MEMORY_SETTING, {});
        if (!map || typeof map !== 'object' || !key) return 0;
        var page = parseInt(map[key], 10);
        return (page >= -1 && page <= 1000) ? page : 0;
    }

    function savePage(params, page) {
        var key = memoryKey(params);
        if (!key) return;
        var map = Lampa.Storage.get(MEMORY_SETTING, {});
        if (!map || typeof map !== 'object' || Object.prototype.toString.call(map) !== '[object Object]') {
            map = {};
        }
        map[key] = page;
        Lampa.Storage.set(MEMORY_SETTING, map);
    }

    function episodeNum(video) {
        if (!video) return 0;
        return parseInt(video.episode, 10) || 0;
    }

    function eligible(videos, size) {
        var season = 0;
        var i, v, s;
        if (!size || !videos || !videos.length || videos.length <= size) return false;
        for (i = 0; i < videos.length; i++) {
            v = videos[i];
            s = parseInt(v && v.season, 10);
            if (!s || !episodeNum(v)) return false;
            if (season && season !== s) return false;
            season = s;
        }
        return true;
    }

    function makeLabels(videos, size) {
        var labels = [];
        var i, from, to, first, last;
        for (i = 0; i < videos.length; i += size) {
            first = videos[i];
            last = videos[Math.min(i + size, videos.length) - 1];
            from = episodeNum(first);
            to = episodeNum(last);
            labels.push('Подсезон ' + (Math.floor(i / size) + 1) +
                (from === to ? ' (серия ' + from + ')' : ' (серии ' + from + '\u2013' + to + ')'));
        }
        labels.push('Все серии (' + videos.length + ')');
        return labels;
    }

    function wrapComponent(Original) {
        if (!Original || Original[MARKER]) return Original;

        function LampacVirtualSeasons(params) {
            var savedFilter = null;
            var PreviousFilter = Lampa.Filter;
            var activity;
            var state = {
                active: false,
                all: null,
                page: 0,
                labels: [],
                size: 24,
                initialized: false,
                realSeasons: 0
            };

            // Lampac constructs its one Filter synchronously in the constructor.
            // Capture that instance without altering global Filter after construction.
            function CaptureFilter(options) {
                var obj = new PreviousFilter(options);
                if (!savedFilter) savedFilter = obj;
                return obj;
            }
            CaptureFilter.prototype = PreviousFilter.prototype;
            Lampa.Filter = CaptureFilter;
            try {
                activity = new Original(params);
            } finally {
                Lampa.Filter = PreviousFilter;
            }
            if (!activity || !savedFilter) return activity;

            var oldInitialize = activity.initialize;
            var oldDisplay = activity.display;
            var oldFilter = activity.filter;
            var oldGetEpisodes = activity.getEpisodes;
            var oldParse = activity.parse;
            var savedOnSelect;

            function selectedVideos() {
                if (!state.active || !state.all) return null;
                if (state.page === -1) return state.all.slice();
                var start = state.page * state.size;
                return state.all.slice(start, start + state.size);
            }

            function installOnSelect() {
                var candidate = savedFilter.onSelect;
                if (typeof candidate !== 'function' || candidate.__lampacVirtualWrapped) return;
                savedOnSelect = candidate;
                savedFilter.onSelect = function (type, group, item) {
                    if (type === 'filter' && group && group.reset) {
                        state.page = 0;
                        savePage(params, 0);
                    }
                    if (type === 'filter' && group && group.stype === 'season' &&
                        item && typeof item.__lampacVirtualPage === 'number' && state.active) {
                        state.page = item.__lampacVirtualPage;
                        savePage(params, state.page);
                        if (state.all && state.all.length) {
                            // Redraw locally. Never pass a fake season index into Lampac's
                            // own filter_find.season[index].url lookup.
                            activity.display(state.all);
                        }
                        return;
                    }
                    return savedOnSelect.apply(this, arguments);
                };
                savedFilter.onSelect.__lampacVirtualWrapped = true;
            }

            if (typeof oldInitialize === 'function') {
                activity.initialize = function () {
                    var ret = oldInitialize.apply(this, arguments);
                    installOnSelect();
                    return ret;
                };
            }

            // The provider sends actual season links before episode links. Record
            // their count before display(): never replace a real multi-season menu.
            if (typeof oldParse === 'function' && typeof activity.parseJsonDate === 'function') {
                activity.parse = function (response) {
                    try {
                        var seasonLinks = this.parseJsonDate(response, '.videos__item') || [];
                        var looksLikeLinks = seasonLinks.length > 0;
                        for (var k = 0; k < seasonLinks.length; k++) {
                            if (seasonLinks[k].method === 'play' || seasonLinks[k].method === 'call' ||
                                seasonLinks[k].similar) looksLikeLinks = false;
                        }
                        if (looksLikeLinks) state.realSeasons = seasonLinks.length;
                    } catch (err) {}
                    return oldParse.apply(this, arguments);
                };
            }

            // Keep original TMDB episode metadata only for episodes on screen:
            // prevents Lampac from appending future placeholders on a 24-card page.
            if (typeof oldGetEpisodes === 'function') {
                activity.getEpisodes = function (season, callback) {
                    if (!state.active || state.page === -1) {
                        return oldGetEpisodes.apply(this, arguments);
                    }
                    var wanted = {};
                    var currentVideos = selectedVideos() || [];
                    var i, n;
                    for (i = 0; i < currentVideos.length; i++) {
                        n = episodeNum(currentVideos[i]);
                        wanted[n] = true;
                    }
                    return oldGetEpisodes.call(this, season, function (episodes) {
                        if (!episodes || !episodes.length) return callback([]);
                        var filtered = [];
                        for (var j = 0; j < episodes.length; j++) {
                            if (wanted[parseInt(episodes[j].episode_number, 10)]) {
                                filtered.push(episodes[j]);
                            }
                        }
                        callback(filtered);
                    });
                };
            }

            if (typeof oldDisplay === 'function') {
                activity.display = function (videos) {
                    var size = readSize();
                    if (state.realSeasons <= 1 && eligible(videos, size)) {
                        var copy = videos.slice();
                        copy.sort(function (a, b) {
                            return episodeNum(a) - episodeNum(b);
                        });
                        var newSource = !state.active || state.size !== size ||
                            !state.all || state.all.length !== copy.length ||
                            (state.all.length && copy.length && state.all[0].url !== copy[0].url);
                        state.active = true;
                        state.all = copy;
                        state.size = size;
                        state.labels = makeLabels(copy, size);
                        if (newSource) state.page = loadPage(params);
                        var pages = Math.ceil(copy.length / size);
                        if (state.page >= pages || state.page < -1) state.page = 0;
                        return oldDisplay.call(this, selectedVideos());
                    }
                    state.active = false;
                    state.all = null;
                    state.labels = [];
                    return oldDisplay.apply(this, arguments);
                };
            }

            if (typeof oldFilter === 'function') {
                activity.filter = function (filterItems, choice) {
                    if (!state.active || !filterItems || !filterItems.season ||
                        filterItems.season.length > 1 || !state.labels.length) {
                        return oldFilter.apply(this, arguments);
                    }

                    // Choice.season stays the real provider season index (usually 0).
                    var originalSeasonNames = filterItems.season;
                    filterItems.season = state.labels.slice();
                    var out;
                    try {
                        out = oldFilter.call(this, filterItems, choice);
                    } finally {
                        filterItems.season = originalSeasonNames;
                    }
                    installOnSelect();
                    var groups = savedFilter.get && savedFilter.get('filter');
                    if (groups && groups.length) {
                        for (var g = 0; g < groups.length; g++) {
                            var group = groups[g];
                            if (!group || group.stype !== 'season' || !group.items) continue;
                            for (var i = 0; i < group.items.length; i++) {
                                group.items[i].__lampacVirtualPage = i < group.items.length - 1 ? i : -1;
                                group.items[i].selected =
                                    group.items[i].__lampacVirtualPage === state.page;
                            }
                            group.subtitle = state.labels[state.page === -1 ? state.labels.length - 1 : state.page];
                            // Inform optional LF6 sidebar that selections have changed.
                            if (savedFilter.set) savedFilter.set('filter', groups);
                            if (savedFilter.chosen) {
                                savedFilter.chosen('filter', [group.subtitle]);
                            }
                            break;
                        }
                    }
                    return out;
                };
            }

            return activity;
        }
        LampacVirtualSeasons.prototype = Original.prototype;
        LampacVirtualSeasons[MARKER] = true;
        LampacVirtualSeasons.__originalLampac = Original;
        return LampacVirtualSeasons;
    }

    function registerSettings() {
        if (!Lampa.SettingsApi) return;
        Lampa.SettingsApi.addComponent({
            component: 'lampac_virtual_seasons',
            name: 'Lampac: подсезоны',
            icon: ''
        });
        Lampa.SettingsApi.addParam({
            component: 'lampac_virtual_seasons',
            param: {
                name: SIZE_SETTING,
                type: 'select',
                values: {
                    '0': 'Отключено',
                    '12': 'По 12 серий',
                    '16': 'По 16 серий',
                    '20': 'По 20 серий',
                    '24': 'По 24 серии',
                    '26': 'По 26 серий',
                    '30': 'По 30 серий',
                    '50': 'По 50 серий'
                },
                'default': '24'
            },
            field: {
                name: 'Размер виртуального подсезона',
                description: 'Только Lampac: длинный сезон группируется локально без изменения URL серий'
            }
        });
    }

    function install() {
        if (!Lampa.Component || !Lampa.Component.get || !Lampa.Component.add) return false;
        var comp = Lampa.Component.get('lampac');
        if (!comp || typeof comp !== 'function') return false;
        if (!comp[MARKER]) Lampa.Component.add('lampac', wrapComponent(comp));
        installed = true;
        log('v1.0 registered for lampac component');
        return true;
    }

    function start() {
        registerSettings();
        (function poll() {
            if (install()) return;
            if (++attempts <= 90) setTimeout(poll, 1000);
            else log('Lampac component not found; enable online.js first.');
        })();
    }

    if (window.appready) start();
    else if (Lampa.Listener) {
        Lampa.Listener.follow('app', function (event) {
            if (event && event.type === 'ready') start();
        });
    }
})();