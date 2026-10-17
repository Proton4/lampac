/*
 * Proton4: S1Exdivider (independent of LF6 and Nova Plus)
 * Purpose: paginate already-rendered Lampac episode cards without inventing
 * seasons, changing real season numbers or touching playback URLs.
 * Inspired by the UX of Nova Plus; original implementation, no third-party code.
 * Pinned range toolbar is placed outside the transformed scrolling body.
 * ES5, Crosswalk 5 / Chromium 34 compatible.
 */
(function () {
    'use strict';

    var FLAG = 'P4_LAMPAC_EPISODE_PAGES_1';
    var SETTING = 'p4_episode_pages_size';
    var MEMORY = 'p4_episode_pages_selected';
    var VERSION = '1.1.0';
    var current = null;
    var observer = null;
    var observedBody = null;
    var scheduled = null;
    var started = false;
    var conflictNotice = false;

    if (window[FLAG]) return;
    window[FLAG] = true;

    function log(message) {
        try {
            if (window.console && window.console.log)
                window.console.log('S1Exdivider ' + VERSION + ': ' + message);
        } catch (e) {}
    }

    function stored(name, fallback) {
        try { return Lampa.Storage.get(name, fallback); } catch (e) { return fallback; }
    }

    function mode() {
        var m = String(stored(SETTING, '24'));
        return m === 'off' || m === 'auto' || m === '10' || m === '12' ||
            m === '16' || m === '20' || m === '24' || m === '26' ||
            m === '30' || m === '50' ? m : '24';
    }

    function pageSize(total, m) {
        if (m === 'off') return 0;
        if (m === 'auto') return total > 200 ? 50 : total > 80 ? 20 : 10;
        return parseInt(m, 10) || 24;
    }

    function makePages(total, m) {
        var size = pageSize(total, m);
        var out = [], start, tail, prev;
        if (!size || total < 2) return out;
        for (start = 0; start < total; start += size) {
            out.push({start:start, end:Math.min(start + size, total) - 1});
        }
        if (out.length > 1) {
            tail = out[out.length - 1];
            if (tail.end - tail.start + 1 <= Math.floor(size / 2)) {
                prev = out[out.length - 2];
                prev.end = tail.end;
                out.pop();
            }
        }
        return out;
    }

    function episodeNumber(node, index) {
        var text = '';
        try {
            text = $(node).find('.online-prestige__episode-number, .onl-online-prestige__episode-number')
                .first().text();
        } catch (e) {}
        var num = parseInt(String(text || '').replace(/[^0-9].*$/, ''), 10);
        return (isFinite(num) && num >= 1) ? num : index + 1;
    }

    function contextKey(data) {
        var active = data.active || {};
        var movie = active.movie || active.card || {};
        var balancer = String(stored('active_balanser', '') ||
            stored('online_balanser', '') || '');
        var source = String(movie.source || 'tmdb');
        var choice = stored('online_choice_' + balancer, {});
        if (choice && typeof choice === 'object') choice = choice[movie.id] || {};
        else choice = {};
        var season = choice.season || 0;
        var voice = choice.voice_name || choice.voice || 0;
        return source + ':' + (movie.id || movie.tmdb_id || '') + ':' +
            balancer + ':' + season + ':' + voice;
    }

    function readIndex(key) {
        var data = stored(MEMORY, {});
        if (!data || typeof data !== 'object') return 0;
        var idx = parseInt(data[key], 10);
        return isFinite(idx) && idx >= 0 ? idx : 0;
    }

    function saveIndex(key, index) {
        var data = stored(MEMORY, {});
        if (!data || Object.prototype.toString.call(data) !== '[object Object]') data = {};
        data[key] = index;
        var keys = Object.keys(data);
        if (keys.length > 300) {
            for (var i = 0; i < keys.length - 250; i++) delete data[keys[i]];
        }
        try { Lampa.Storage.set(MEMORY, data); } catch (e) {}
    }

    function addStyle() {
        if (document.getElementById('p4-episode-pages-css')) return;
        var el = document.createElement('style');
        el.id = 'p4-episode-pages-css';
        el.type = 'text/css';
        el.textContent = [
            '.p4-episode-pages{padding:.65em .25em .65em .25em;margin:0 0 .45em 0;',
                'color:#fff;position:relative;box-sizing:border-box;}',
            '.p4-episode-pages__label{font-size:.72em;letter-spacing:.1em;',
                'opacity:.7;margin:0 0 .35em .25em;text-transform:uppercase;}',
            '.p4-episode-pages__pages{display:-webkit-box;display:-webkit-flex;',
                'display:-ms-flexbox;display:flex;-webkit-flex-wrap:wrap;',
                '-ms-flex-wrap:wrap;flex-wrap:wrap;align-items:center;}',
            '.p4-episode-pages__button{display:inline-block;padding:.48em .8em;',
                'font-size:.95em;margin:0 .4em .35em 0;',
                'background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.16);',
                'border-radius:.38em;color:#fff;white-space:nowrap;cursor:pointer;}',
            '.p4-episode-pages__button.p4-active{background:rgba(255,255,255,.24);',
                'border-color:rgba(255,255,255,.68);}',
            '.p4-episode-pages__button.focus,.p4-episode-pages__button:focus{',
                'background:rgba(255,255,255,.3);box-shadow:0 0 0 .13em #fff;}',
            '.p4-episode-pages__hidden{display:none!important;}',
            '.explorer__files.p4-episode-pages--pinned{position:relative;}',
            '.explorer__files.p4-episode-pages--pinned>.explorer__files-head{',
                'position:relative;z-index:3;}',
            '.explorer__files.p4-episode-pages--pinned>.explorer__files-body{',
                'position:relative;z-index:1;}',
            '.explorer__files-head>.p4-episode-pages{',
                'margin:.6em 0 .2em 0;padding:.35em .2em .25em;',
                'background:rgba(25,27,29,.95);border-radius:.35em;}'
        ].join('');
        (document.head || document.body).appendChild(el);
    }

    function novaActive() {
        var flag = stored('nova_plus_enabled', true);
        return !!window.nova_plus && flag !== false && flag !== 'false' && flag !== '0';
    }

    function locate() {
        var active, root, explorer, body, rows, component, head, files;
        try {
            active = Lampa.Activity.active();
            if (!active || !active.activity || !active.activity.render) return null;
            component = String(active.component || '').toLowerCase();
            root = $(active.activity.render());
            explorer = root.hasClass('explorer') ? root : root.find('.explorer').first();
            if (!explorer.length) return null;
            if (component === 'torrents' || component === 'full') return null;
            head = explorer.find('.explorer__files-head').first();
            files = explorer.find('.explorer__files').first();
            body = explorer.find('.explorer__files-body .scroll__body').first();
            if (!body.length) return null;
            rows = body.find('.online-prestige--full, .onl-online-prestige--full').filter(function () {
                return !$(this).closest('.nova-plus-root').length;
            });
            if (!rows.length) return {active:active, root:explorer, body:body, rows:rows,
                head:head, files:files};
            if (!active.movie && !active.card) return null;
            return {active:active, root:explorer, body:body, rows:rows,
                head:head, files:files};
        } catch (e) {
            log('locate error: ' + e);
            return null;
        }
    }

    function detachObserver() {
        if (observer) {
            observer.disconnect();
            observer = null;
        }
        observedBody = null;
    }

    function watchBody(data) {
        if (!data || !data.body || !data.body.length) {
            detachObserver();
            return;
        }
        if (observedBody === data.body[0]) return;
        detachObserver();
        observedBody = data.body[0];
        if (typeof MutationObserver !== 'undefined') {
            observer = new MutationObserver(function () { schedule(); });
            observer.observe(observedBody, {childList:true, subtree:false});
        }
    }

    function pinAvailable(data) {
        return !!(data && data.root && data.root.length &&
            data.head && data.head.length &&
            data.files && data.files.length &&
            !data.head.hasClass('hide') &&
            $.contains(data.root[0], data.head[0]));
    }

    function updateLayout(data) {
        try {
            if (data && Lampa.Layer &&
                typeof Lampa.Layer.update === 'function')
                Lampa.Layer.update(data.root[0]);
        } catch (e) { log('layout error: ' + e); }
    }

    function release() {
        if (!current) return;
        var old = current;
        try { old.rows.removeClass('p4-episode-pages__hidden'); } catch (e) {}
        try { if (old.toolbar) old.toolbar.remove(); } catch (e2) {}
        try {
            if (old.pinned && old.data.files)
                old.data.files.removeClass('p4-episode-pages--pinned');
        } catch (e3) {}
        current = null;
        if (old.pinned) updateLayout(old.data);
    }

    function focusFirstRow() {
        if (!current || !current.rows || !current.rows.length) return;
        var page = current.pages[current.index];
        var node = page && current.rows.eq(page.start);
        if (!node || !node.length) return;
        try {
            if (Lampa.Controller && Lampa.Controller.collectionFocus) {
                Lampa.Controller.collectionFocus(node,
                    current.data.active.activity.body || current.data.root);
            }
        } catch (e) {}
    }

    function pageLabel(state, page) {
        var a = episodeNumber(state.rows[page.start], page.start);
        var b = episodeNumber(state.rows[page.end], page.end);
        return a === b ? String(a) : a + '\u2013' + b;
    }

    function rebuildButtons() {
        if (!current || !current.toolbar || !current.toolbar.length) return;
        var state = current;
        var section = state.toolbar.find('.p4-episode-pages__pages').empty();

        function makeButton(title, idx, main) {
            var btn = $('<div class="p4-episode-pages__button selector"></div>');
            btn.text(title);
            if (idx === state.index) btn.addClass('p4-active');
            btn.on('hover:enter.p4ep click.p4ep', function () {
                if (main) {
                    if (Lampa.Select && Lampa.Select.show) {
                        var options = [];
                        for (var k = 0; k < state.pages.length; k++) {
                            options.push({title:pageLabel(state, state.pages[k]), index:k,
                                selected:k === state.index});
                        }
                        Lampa.Select.show({
                            title:'Выбрать диапазон серий',
                            items:options,
                            onSelect:function(item) { selectPage(item.index, true); }
                        });
                    }
                } else selectPage(idx, true);
            });
            section.append(btn);
        }

        if (state.pages.length <= 10) {
            for (var i = 0; i < state.pages.length; i++) {
                makeButton(pageLabel(state, state.pages[i]), i, false);
            }
        } else {
            makeButton('Серии ' + pageLabel(state, state.pages[state.index]) + ' \u25be',
                state.index, true);
        }
    }

    function selectPage(index, moveFocus) {
        var state = current;
        if (!state || !state.pages.length) return;
        index = Math.max(0, Math.min(state.pages.length - 1, index));
        state.index = index;
        saveIndex(state.key, index);
        var page = state.pages[index];
        state.rows.each(function (i) {
            $(this).toggleClass('p4-episode-pages__hidden',
                i < page.start || i > page.end);
        });
        rebuildButtons();
        if (moveFocus) setTimeout(focusFirstRow, 60);
    }

    function sync() {
        var modeValue = mode();
        var data = locate();
        if (!data || modeValue === 'off' || novaActive()) {
            if (novaActive() && !conflictNotice) {
                conflictNotice = true;
                log('Nova Plus is enabled; disable Nova Plus to use this independent paging plugin');
            }
            release();
            watchBody(null);
            return;
        }
        watchBody(data);
        var size = pageSize(data.rows.length, modeValue);
        // Nova only shows jump pages when the list contains more than 20 cards.
        if ((modeValue === 'auto' && data.rows.length <= 20) ||
            data.rows.length <= size || size === 0) {
            release();
            return;
        }
        var key = contextKey(data);
        var first = data.rows[0];
        var last = data.rows[data.rows.length - 1];
        if (current && current.data.body[0] === data.body[0] &&
            current.first === first && current.last === last &&
            current.rows.length === data.rows.length &&
            current.key === key && current.mode === modeValue &&
            current.pinned === pinAvailable(data) &&
            current.toolbar && current.toolbar.length &&
            $.contains(data.root[0], current.toolbar[0])) return;

        release();
        var pages = makePages(data.rows.length, modeValue);
        if (pages.length <= 1) return;

        var toolbar = $('<div class="p4-episode-pages"></div>');
        toolbar.append('<div class="p4-episode-pages__label">СЕРИИ · ' +
            data.rows.length + '</div>');
        toolbar.append('<div class="p4-episode-pages__pages"></div>');
        // Lampa TV scrolls by translating .scroll__body. "position:sticky"
        // INSIDE that element cannot keep the range selector visible.
        // Mount it in the stationary .explorer__files-head instead.
        var pinned = pinAvailable(data);
        if (pinned) {
            data.head.append(toolbar);
            data.files.addClass('p4-episode-pages--pinned');
        } else {
            data.rows.first().before(toolbar);
        }
        current = {
            data:data, toolbar:toolbar, rows:data.rows, first:first, last:last,
            key:key, mode:modeValue, pages:pages, index:0, pinned:pinned
        };
        selectPage(Math.min(readIndex(key), pages.length - 1), false);
        if (pinned) updateLayout(data);
        log('ready: ' + data.rows.length + ' episodes, ' + pages.length +
            ' pages; size=' + size);
    }

    function schedule() {
        if (scheduled) clearTimeout(scheduled);
        scheduled = setTimeout(function () {
            scheduled = null;
            try { sync(); } catch (e) { log('sync error: ' + e); }
        }, 90);
    }

    function addSettings() {
        if (!Lampa.SettingsApi) return;
        Lampa.SettingsApi.addComponent({
            component:'p4_episode_pages', name:'S1Exdivider', icon:''
        });
        Lampa.SettingsApi.addParam({
            component:'p4_episode_pages',
            param:{
                name:SETTING, type:'select',
                values:{
                    'off':'Выключено',
                    'auto':'Как Nova (10/20/50 автоматически)',
                    '10':'По 10 серий', '12':'По 12 серий',
                    '16':'По 16 серий', '20':'По 20 серий',
                    '24':'По 24 серии', '26':'По 26 серий',
                    '30':'По 30 серий', '50':'По 50 серий'
                }, 'default':'24'
            },
            field:{
                name:'Сколько серий на странице',
                description:'Группирует видимые серии в Online/Lampac. Настоящие сезоны и ссылки не меняются.'
            },
            onChange:function () { release(); schedule(); }
        });
    }

    function start() {
        if (started) return;
        started = true;
        addStyle();
        addSettings();
        if (Lampa.Listener && Lampa.Listener.follow) {
            Lampa.Listener.follow('activity', function () { schedule(); });
        }
        setInterval(function () {
            try { sync(); } catch (e) { log('poll error: ' + e); }
        }, 1400);
        schedule();
        log('started');
    }

    // Exposed for diagnostics and test; no network calls or source modifications.
    window.P4EpisodePages = {
        version:VERSION,
        makePages:makePages,
        status:function () {
            return {
                started:started,
                mode:mode(),
                novaConflict:novaActive(),
                count:current ? current.rows.length : 0,
                pages:current ? current.pages.length : 0,
                selected:current ? current.index + 1 : 0,
                pinned:current ? !!current.pinned : false,
                key:current ? current.key : ''
            };
        }
    };

    window.S1Exdivider = window.P4EpisodePages;

    if (window.appready) start();
    else if (Lampa.Listener && Lampa.Listener.follow) {
        Lampa.Listener.follow('app', function (event) {
            if (event && event.type === 'ready') start();
        });
    }
})();