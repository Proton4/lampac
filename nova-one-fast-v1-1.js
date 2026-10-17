/*
 * Proton4 Nova One Fast v1.1: adaptive translation height and manual source refresh.
 * This plugin loads the original amikdn Nova Plus at runtime; the author's
 * code is NOT redistributed or modified. Only install this one plugin.
 * Companion to the original Nova Plus by amikdn.
 *
 * Wide Nova only: pins the preview in the left column and scrolls
 * episode cards in the right column, independently of Lampa's outer scroll.
 * Does not replace Nova, modify server URLs or create virtual seasons.
 * Written using ES5 syntax for Crosswalk 5 / Chromium 34.
 */
(function () {
    'use strict';

    var FLAG = 'p4_nova_one_fast_v1_1';
    var OPTION = 'p4_nova_fixed_preview_enabled';
    var DETAILS_OPTION = 'p4_nova_fixed_details_enabled';
    var cssId = 'p4-nova-one-fast-v11-css';
    var NOVA_URL = 'https://amikdn.github.io/nova_plus.js';
    var bodyFlag = 'p4-nova-one-prepaint';
    var novaScriptId = 'p4-nova-one-author-script';
    var observed = null;
    var observer = null;
    var observing = false;
    var embeddedLoaded = false;
    var active = null;
    var timer = null;
    var started = false;
    var lastError = '';
    var checkingSources = false;
    var sourcePanelMovie = '';
    var refreshQueued = false;

    if (window[FLAG]) return;
    window[FLAG] = true;

    function value(name, fallback) {
        try { return Lampa.Storage.get(name, fallback); }
        catch (e) { return fallback; }
    }

    function isEnabled() {
        var val = value(OPTION, true);
        return val === true || val === 'true' || val === 1;
    }

    function isNovaWide() {
        return window.nova_plus &&
            value('nova_plus_enabled', true) !== false &&
            value('nova_plus_enabled', true) !== 'false' &&
            String(value('nova_plus_mode', 'wide')) === 'wide';
    }

    function log(message) {
        if (!window.console || !window.console.log) return;
        window.console.log('Nova One v1.1: ' + message);
    }

    function injectStyles() {
        if (document.getElementById(cssId)) return;
        var el = document.createElement('style');
        el.id = cssId;
        el.type = 'text/css';
        var baseCSS = [
            '.explorer.p4-nova-fixed-shell .explorer__files-body .scroll{',
                'overflow:hidden!important;overscroll-behavior:contain;}',
            '.explorer.p4-nova-fixed-shell .explorer__files-body .scroll__body{',
                '-webkit-transform:none!important;transform:none!important;',
                '-webkit-transition:none!important;transition:none!important;',
                'will-change:auto!important;}',
            '.explorer.p4-nova-fixed-shell .explorer__files-body .scroll__content{',
                'overflow:hidden!important;box-sizing:border-box!important;}',
            '.nova-plus-root.nova-plus.p4-nova-fixed{',
                'display:block!important;position:relative!important;',
                'width:100%!important;min-height:0!important;',
                'max-width:100%!important;',
                'padding:0!important;margin:0!important;',
                'overflow:hidden!important;box-sizing:border-box!important;}',
            '.nova-plus-root.nova-plus.p4-nova-fixed>.nova__hero{',
                'position:absolute!important;left:0!important;top:0!important;',
                'right:auto!important;bottom:auto!important;',
                'width:41%!important;max-width:41%!important;',
                'height:100%!important;max-height:100%!important;',
                '-webkit-flex:none!important;-ms-flex:none!important;flex:none!important;',
                'overflow-y:auto!important;overflow-x:hidden!important;',
                'padding:0 1.3em 0 0!important;margin:0!important;',
                'box-sizing:border-box!important;}',
            '.nova-plus-root.nova-plus.p4-nova-fixed>.nova__rows{',
                'position:absolute!important;left:41%!important;top:0!important;',
                'right:auto!important;bottom:auto!important;',
                'width:59%!important;max-width:59%!important;min-width:0!important;',
                '-webkit-flex:none!important;-ms-flex:none!important;flex:none!important;',
                'overflow-y:auto!important;overflow-x:hidden!important;',
                'padding:.12em .3em 0 .1em!important;margin:0!important;',
                'box-sizing:border-box!important;}',
            '.nova-plus-root.nova-plus.p4-nova-fixed>.nova-plus__strip{',
                'position:absolute!important;left:41%!important;',
                'right:auto!important;bottom:auto!important;',
                'width:59%!important;max-width:59%!important;min-width:0!important;',
                '-webkit-flex:none!important;-ms-flex:none!important;flex:none!important;',
                'overflow-y:auto!important;overflow-x:hidden!important;',
                'padding:.4em .6em .6em .1em!important;margin:0!important;',
                '-webkit-overflow-scrolling:touch;',
                'box-sizing:border-box!important;}',
            '.nova-plus-root.nova-plus.p4-nova-fixed>.nova-plus__strip>.nova__list{',
                'min-width:0!important;}',
            '.nova-plus-root.nova-plus.p4-nova-fixed>.nova-plus__strip::-webkit-scrollbar,',
                '.nova-plus-root.nova-plus.p4-nova-fixed>.nova__rows::-webkit-scrollbar{',
                'width:7px!important;}',
            '.nova-plus-root.nova-plus.p4-nova-fixed>.nova-plus__strip::-webkit-scrollbar-thumb,',
                '.nova-plus-root.nova-plus.p4-nova-fixed>.nova__rows::-webkit-scrollbar-thumb{',
                'background:rgba(255,255,255,.32);border-radius:8px;}',
            '.nova-plus-root.p4-nova-fixed>.nova__hero>.p4-nova-summary{',
                'position:relative;display:block!important;',
                'box-sizing:border-box;margin:.85em 1.15em 1.5em .15em;',
                'padding:.7em .5em .25em .5em;',
                'color:#fff;line-height:1.45;}',
            '.nova-plus-root.p4-nova-fixed .p4-nova-summary__rating{',
                'display:-webkit-box;display:-webkit-flex;display:-ms-flexbox;',
                'display:flex;-webkit-align-items:baseline;-ms-flex-align:baseline;',
                'align-items:baseline;margin:0 0 .72em 0;}',
            '.nova-plus-root.p4-nova-fixed .p4-nova-summary__label{',
                'display:inline-block;font-size:.76em;letter-spacing:.08em;',
                'opacity:.75;margin:0 .85em 0 0;}',
            '.nova-plus-root.p4-nova-fixed .p4-nova-summary__value{',
                'display:inline-block;font-size:1.45em;font-weight:700;}',
            '.nova-plus-root.p4-nova-fixed .p4-nova-summary__max{',
                'display:inline-block;font-size:.83em;opacity:.55;margin-left:.15em;}',
            '.nova-plus-root.p4-nova-fixed .p4-nova-summary__id{',
                'display:inline-block;font-size:.76em;opacity:.65;',
                'margin-left:auto;padding-left:.8em;white-space:nowrap;}',
            '.nova-plus-root.p4-nova-fixed .p4-nova-summary__heading{',
                'font-size:.78em;letter-spacing:.09em;opacity:.58;',
                'text-transform:uppercase;margin:.1em 0 .48em 0;}',
            '.nova-plus-root.p4-nova-fixed .p4-nova-summary__description{',
                'font-size:.98em;line-height:1.5;opacity:.86;',
                'white-space:normal;word-wrap:break-word;overflow-wrap:break-word;}',
            '.nova-plus-scope .nova-plus-root.nova-plus .nova-plus__bar{',
                '-webkit-flex-wrap:wrap!important;-ms-flex-wrap:wrap!important;',
                'flex-wrap:wrap!important;overflow:visible!important;}',
            '.nova-plus-scope .nova-plus-root.nova-plus .p4-nova-source-action{',
                'display:inline-flex!important;-webkit-align-items:center;',
                '-ms-flex-align:center;align-items:center;',
                'position:relative;white-space:nowrap;',
                'margin-left:auto!important;margin-right:.3em!important;',
                'padding:.38em .68em!important;',
                'background:rgba(255,255,255,.13)!important;',
                'border:1px solid rgba(255,255,255,.22)!important;}',
            '.nova-plus-scope .nova-plus-root.nova-plus .p4-nova-source-action.p4-source-busy{',
                'opacity:.65!important;}',
            '.nova-plus-scope .nova-plus-root.nova-plus .p4-nova-source-action.focus{',
                'box-shadow:0 0 0 .12em #fff!important;}'
        ].join('');
        // Layout must be available BEFORE Nova renders its first hero/card.
        // The selector is gated by a body class until the feature is disabled.
        var preCSS = baseCSS
            .replace(/\.explorer\.p4-nova-fixed-shell/g,
                'body.' + bodyFlag + ' .explorer.nova-plus-scope')
            .replace(/\.nova-plus-root\.nova-plus\.p4-nova-fixed/g,
                'body.' + bodyFlag + ' .nova-plus-scope .nova-plus-root.nova-plus')
            .replace(/\.nova-plus-root\.p4-nova-fixed/g,
                'body.' + bodyFlag + ' .nova-plus-scope .nova-plus-root.nova-plus');
        var prefix = 'body.' + bodyFlag + ' .nova-plus-scope .nova-plus-root.nova-plus';
        var firstFrame = [
            prefix + '{height:calc(100vh - 9em);}',
            prefix + '>.nova__rows{height:14em;}',
            prefix + '>.nova-plus__strip{top:14em;height:calc(100% - 14em);}'
        ].join('');
        el.textContent = baseCSS + preCSS + firstFrame;
        (document.head || document.body).appendChild(el);
    }

    function getView() {
        var now, render, explorer, container, root, strip, hero, rows, scroller;
        try {
            now = Lampa.Activity.active();
            if (!now || !now.activity || !now.activity.render) return null;
            render = $(now.activity.render());
            explorer = render.hasClass('explorer') ? render : render.find('.explorer').first();
            if (!explorer.length || !explorer.hasClass('nova-plus-scope')) return null;
            container = explorer.find('.explorer__files-body').first();
            if (!container.length) return null;
            root = container.find('.nova-plus-root.nova-plus').first();
            if (!root.length || !root.is(':visible')) return null;
            hero = root.children('.nova__hero').first();
            rows = root.children('.nova__rows').first();
            strip = root.children('.nova-plus__strip').first();
            if (!hero.length || !rows.length || !strip.length) return null;
            scroller = container.find('.scroll').first();
            if (!scroller.length) return null;
            return {
                explorer:explorer, root:root, hero:hero, rows:rows,
                strip:strip, scroller:scroller, active:now
            };
        } catch (e) {
            if (String(e) !== lastError) {
                lastError = String(e);
                log('view detection: ' + e);
            }
            return null;
        }
    }

    function stopBubble(e) {
        if (e && e.stopPropagation) e.stopPropagation();
    }

    function fitInto(panel, element) {
        if (!panel || !panel.length || !element || !element.getBoundingClientRect) return;
        var outer = panel[0].getBoundingClientRect();
        var inner = element.getBoundingClientRect();
        var padding = 18;
        var delta = 0;
        if (!outer.height || !inner.height) return;
        if (inner.top < outer.top + padding) delta = inner.top - outer.top - padding;
        else if (inner.bottom > outer.bottom - padding) {
            delta = inner.bottom - outer.bottom + padding;
        }
        if (delta) panel[0].scrollTop += Math.round(delta);
    }

    function bindPanelEvents(view) {
        var strip = view.strip, rows = view.rows, hero = view.hero;
        view.domListeners = [];
        function stopOuter(e) { stopBubble(e); }
        function attach(node, eventName) {
            node.addEventListener(eventName, stopOuter, false);
            view.domListeners.push({node:node, name:eventName, fn:stopOuter});
        }

        // The outer Lampa.Scroll listens for wheel and touch on ancestors.
        // Stop bubbling so native overflow scrolling remains local.
        attach(strip[0], 'wheel');
        attach(strip[0], 'mousewheel');
        attach(strip[0], 'touchstart');
        attach(strip[0], 'touchmove');
        attach(rows[0], 'wheel');
        attach(rows[0], 'mousewheel');
        attach(hero[0], 'wheel');
        attach(hero[0], 'mousewheel');

        // Both Lampa and Nova signal keyboard/remote focus through hover:focus.
        strip.on('hover:focus.p4fixed focusin.p4fixed',
            '.selector,.nova-card', function () { fitInto(strip, this); });
        rows.on('hover:focus.p4fixed focusin.p4fixed',
            '.selector,.nova-chip', function () { fitInto(rows, this); });
    }


    function patchOuterScroll(view) {
        var frame = view.scroller[0];
        var instance = frame && frame.Scroll;
        if (!instance || !instance.update || instance.__p4NovaFixed) return;
        var saved = {
            instance:instance,
            update:instance.update,
            immediate:instance.immediate,
            wheel:instance.wheel,
            shift:instance.shift
        };
        view.scrollPatch = saved;

        function panelFor(target) {
            if (!target) return null;
            var elem = target.jquery ? target[0] : target;
            if (!elem || !view.root[0]) return null;
            if (elem === view.strip[0] || $.contains(view.strip[0], elem))
                return view.strip;
            if (elem === view.rows[0] || $.contains(view.rows[0], elem))
                return view.rows;
            if (elem === view.hero[0] || $.contains(view.hero[0], elem))
                return view.hero;
            return null;
        }

        instance.update = function (target) {
            var pane = panelFor(target);
            if (pane) {
                fitInto(pane, target.jquery ? target[0] : target);
                return;
            }
            return saved.update.apply(this, arguments);
        };
        if (typeof saved.immediate === 'function') {
            instance.immediate = function (target) {
                var pane = panelFor(target);
                if (pane) {
                    fitInto(pane, target.jquery ? target[0] : target);
                    return;
                }
                return saved.immediate.apply(this, arguments);
            };
        }
        instance.wheel = function () {};
        instance.shift = function () {};
        instance.__p4NovaFixed = true;
    }

    function restoreOuterScroll(view) {
        var saved = view.scrollPatch;
        if (!saved || !saved.instance) return;
        var instance = saved.instance;
        instance.update = saved.update;
        if (saved.immediate) instance.immediate = saved.immediate;
        if (saved.wheel) instance.wheel = saved.wheel;
        if (saved.shift) instance.shift = saved.shift;
        delete instance.__p4NovaFixed;
        view.scrollPatch = null;
    }


    function showDetails() {
        var option = value(DETAILS_OPTION, true);
        return option !== false && option !== 'false' && option !== '0';
    }

    function normalizeDescription(description) {
        var txt = String(description || '').replace(/\s+/g, ' ')
            .replace(/^\s+|\s+$/g, '');
        if (txt.length > 450) {
            txt = txt.slice(0, 447).replace(/\s+\S*$/, '') + '\u2026';
        }
        return txt;
    }

    function updateSummary(view) {
        if (!view || !view.hero || !view.hero.length) return;
        var old = view.hero.children('.p4-nova-summary').first();

        if (!showDetails()) {
            if (old.length) old.remove();
            view.summaryStamp = '';
            return;
        }

        var activity = view.active || {};
        var movie = activity.movie || activity.card || {};
        var other = activity.card || {};
        var infoPanel = view.explorer.find('.explorer__card').first();
        var desc = movie.overview || other.overview || movie.description ||
            other.description || '';
        if (!desc && infoPanel.length) {
            desc = infoPanel.find('.explorer-card__descr').first().text();
        }
        desc = normalizeDescription(desc);

        var rating = parseFloat(movie.vote_average);
        if (!isFinite(rating)) rating = parseFloat(other.vote_average);
        var hasRating = isFinite(rating) && rating > 0 && rating <= 10;
        var source = String(movie.source || other.source || '');
        var tmdbId = parseInt(movie.tmdb_id || other.tmdb_id, 10);
        if ((!isFinite(tmdbId) || tmdbId < 1) && source === 'tmdb') {
            tmdbId = parseInt(movie.id || other.id, 10);
        }
        var hasId = isFinite(tmdbId) && tmdbId > 0;
        var title = String(movie.name || movie.title || other.name || other.title || '');
        var key = title + ':' + (hasRating ? rating.toFixed(2) : '') + ':' + (hasId ? tmdbId : '') + ':' + desc;

        // Rebuild only if metadata changed or Nova replaced the hero contents.
        if (view.summaryStamp === key && old.length) return;
        if (old.length) old.remove();

        if (!hasRating && !hasId && !desc) {
            view.summaryStamp = key;
            return;
        }

        var summary = $('<div class="p4-nova-summary"></div>');
        if (hasRating || hasId) {
            var row = $('<div class="p4-nova-summary__rating"></div>');
            row.append($('<span class="p4-nova-summary__label"></span>').text('TMDB'));
            if (hasRating) {
                row.append($('<span class="p4-nova-summary__value"></span>')
                    .text('\u2605 ' + rating.toFixed(1)));
                row.append($('<span class="p4-nova-summary__max"></span>').text('/10'));
            }
            if (hasId) {
                row.append($('<span class="p4-nova-summary__id"></span>').text('ID ' + tmdbId));
            }
            summary.append(row);
        }
        if (desc) {
            summary.append($('<div class="p4-nova-summary__heading"></div>')
                .text('О сериале'));
            summary.append($('<div class="p4-nova-summary__description"></div>')
                .text(desc));
        }
        view.hero.append(summary);
        view.summaryStamp = key;
    }

    function unpin() {
        if (!active) return;
        var view = active;
        try {
            restoreOuterScroll(view);
            view.hero.children('.p4-nova-summary').remove();
            if (view.domListeners) {
                for (var n = 0; n < view.domListeners.length; n++) {
                    var item = view.domListeners[n];
                    item.node.removeEventListener(item.name, item.fn, false);
                }
            }
            view.root.removeClass('p4-nova-fixed').css('height', '');
            view.rows.css('height', '');
            view.strip.css({top:'',height:''});
            view.explorer.removeClass('p4-nova-fixed-shell');
            view.strip.off('.p4fixed');
            view.rows.off('.p4fixed');
            if (view.scroller && view.scroller.length) {
                var scroll = view.scroller[0];
                if (view.scrollHandler) scroll.removeEventListener('scroll', view.scrollHandler, false);
                if (scroll.Scroll && scroll.Scroll.reset) scroll.Scroll.reset();
                scroll.scrollTop = 0;
            }
        } catch (e) {}
        active = null;
    }

    function pin(view) {
        view.explorer.addClass('p4-nova-fixed-shell');
        view.root.addClass('p4-nova-fixed');
        bindPanelEvents(view);
        patchOuterScroll(view);
        active = view;

        if (view.scroller[0]) {
            var scroll = view.scroller[0];
            view.scrollHandler = function () {
                if (active && active.scroller[0] === scroll && scroll.scrollTop !== 0)
                    scroll.scrollTop = 0;
            };
            scroll.addEventListener('scroll', view.scrollHandler, false);
            try {
                if (scroll.Scroll && scroll.Scroll.reset) scroll.Scroll.reset();
                scroll.scrollTop = 0;
            } catch (e) {}
        }
    }

    function resize(view) {
        var rect = view.root[0].getBoundingClientRect();
        var viewport = view.scroller[0].getBoundingClientRect();
        var available = Math.floor(window.innerHeight - rect.top - 10);
        if (viewport.bottom > rect.top + 170)
            available = Math.min(available, Math.floor(viewport.bottom - rect.top - 5));
        if (available < 260) return false;

        // Let Nova's *real content* determine the translation/filter area.
        // Never use view.rows.scrollHeight: its forced height fed back into itself.
        // Keep at least 165px for episodes even with many translations.
        var inner = view.rows.children('.nova-plus__panel').first();
        var natural = 145;
        if (inner.length && inner[0]) {
            var panelEl = inner[0];
            var panelBox = panelEl.getBoundingClientRect();
            var measured = 0;
            // Measure only visible children. The panel's own height can be
            // stretched by our forced row height on old WebKit; using it
            // would reintroduce the step-by-step downward drift.
            inner.children().each(function () {
                var box = this.getBoundingClientRect();
                if ((!box.height && !box.width) ||
                    box.bottom < panelBox.top - 3) return;
                measured = Math.max(measured, box.bottom - panelBox.top);
            });
            if (measured > 0) natural = Math.max(natural, measured + 4);
            else natural = Math.max(natural, panelEl.scrollHeight || 0);
        }
        var cap = Math.max(120, Math.min(available - 165,
            Math.floor(available * 0.76)));
        var top = Math.max(100, Math.min(Math.ceil(natural + 12), cap));
        var stripHeight = Math.max(80, available - top - 2);

        // Write style only on actual dimension changes; never redraw Nova.
        var stamp = available + ':' + top + ':' + stripHeight;
        if (active && active.stamp === stamp) return true;

        view.root.css('height', available + 'px');
        view.rows.css('height', top + 'px');
        view.strip.css({top:(top + 2) + 'px',height:stripHeight + 'px'});
        view.stamp = stamp;
        return true;
    }


    function message(text) {
        try {
            if (Lampa.Noty && typeof Lampa.Noty.show === 'function')
                Lampa.Noty.show(text);
        } catch (e) {}
    }

    function currentInfo() {
        var now;
        try { now = Lampa.Activity.active(); } catch (e) { return null; }
        if (!now || !now.movie || !now.movie.id || !now.activity) return null;
        return {
            movieId: String(now.movie.id),
            component: now.activity.component || null,
            active: now
        };
    }

    function showAllSources() {
        var view = active;
        if (!view || !view.rows || !view.rows.length) {
            message('Сначала открой карточку в Nova');
            return;
        }

        var source = view.rows.find('.nova-plus__bar [data-nova-focus="source"]').first();
        if (!source.length) {
            message('Nova ещё не загрузила список источников');
            return;
        }

        // Nova keeps "all sources" behind a "more" chip. Call its original
        // action instead of building a separate, potentially incorrect list.
        var drop = view.rows.find('.nova-drop[data-nova-menu="source"]').first();
        if (!drop.length) source.trigger('hover:enter');

        function expand() {
            var latest = active;
            if (!latest || !latest.rows) return;
            var more = latest.rows.find('.nova-chip--more').first();
            if (more.length) more.trigger('hover:enter');
        }
        setTimeout(expand, 50);
        setTimeout(expand, 190);
    }

    function clearNegativeProbe(movieId) {
        if (!movieId) return 0;
        var cache = value('nova_probe', {});
        if (!cache || typeof cache !== 'object') return 0;
        var mine = cache[movieId];
        if (!mine || typeof mine !== 'object' || !mine.list) return 0;
        var count = 0;
        for (var source in mine.list) {
            if (!Object.prototype.hasOwnProperty.call(mine.list, source)) continue;
            if (mine.list[source] && mine.list[source].s === 'empty') {
                delete mine.list[source];
                count++;
            }
        }
        if (count) {
            cache[movieId] = mine;
            Lampa.Storage.set('nova_probe', cache);
        }
        return count;
    }

    function recheckSources() {
        if (checkingSources) {
            message('Проверка источников уже выполняется');
            return;
        }
        var info = currentInfo();
        if (!info) {
            message('Сначала открой сериал в Lampac');
            return;
        }
        var comp = info.component;
        if (!comp || typeof comp.createSource !== 'function') {
            message('Этот онлайн-источник не поддерживает повторный поиск');
            return;
        }

        var movieId = info.movieId;
        var cleared = 0;
        try { cleared = clearNegativeProbe(movieId); }
        catch (e) { log('probe cache: ' + e); }
        checkingSources = true;
        refreshQueued = true;
        sourcePanelMovie = movieId;
        updateSourceButton();
        message('Повторный опрос источников Lampac. Это может занять до 15 секунд.');

        var job;
        try { job = comp.createSource(); }
        catch (err) {
            checkingSources = false;
            refreshQueued = false;
            updateSourceButton();
            message('Не удалось запустить повторную проверку');
            return;
        }

        if (!job || typeof job.then !== 'function') {
            checkingSources = false;
            refreshQueued = false;
            updateSourceButton();
            message('Источник не вернул результат проверки');
            return;
        }

        job.then(function () {
            checkingSources = false;
            refreshQueued = false;
            if (currentInfo() && currentInfo().movieId === movieId &&
                currentInfo().component === comp) {
                // Refresh its regular source/filter data from the provider.
                // Selection history (season, voice, viewed) remains untouched.
                try {
                    if (typeof comp.search === 'function') comp.search();
                    else if (typeof comp.find === 'function') comp.find();
                } catch (e) { log('source refresh: ' + e); }
                setTimeout(function () {
                    sync();
                    showAllSources();
                }, 100);
            }
            updateSourceButton();
            message('Список обновлён. Если результат прежний — сервер Lampac может хранить проверку до 5 минут.');
        }, function (err) {
            checkingSources = false;
            refreshQueued = false;
            updateSourceButton();
            log('Refresh sources failed: ' + err);
            message('Не все источники ответили. Можно показать скрытые или повторить позже.');
            setTimeout(showAllSources, 90);
        });
    }

    function openSourceMenu() {
        if (!Lampa.Select || typeof Lampa.Select.show !== 'function') {
            // If there is no Select API, show available sources safely.
            showAllSources();
            return;
        }
        Lampa.Select.show({
            title:'Источники — Nova One',
            items:[
                {title:'Показать все источники, включая скрытые', action:'all'},
                {title:'Повторно проверить источники для этого фильма', action:'refresh'}
            ],
            onSelect:function (item) {
                if (!item) return;
                setTimeout(function () {
                    if (item.action === 'all') showAllSources();
                    if (item.action === 'refresh') recheckSources();
                }, 80);
            }
        });
    }

    function updateSourceButton() {
        var view = active;
        if (!view || !view.rows) return;
        var button = view.rows.find('.p4-nova-source-action').first();
        if (!button.length) return;
        button.toggleClass('p4-source-busy', checkingSources);
        button.find('.nova-chip__label').first().text(
            checkingSources ? 'Проверка…' : '↻ Источники'
        );
    }

    function ensureSourceButton(view) {
        if (!view || !view.rows || !view.rows.length) return;
        var bar = view.rows.find('.nova-plus__bar').first();
        if (!bar.length) return;
        if (bar.find('.p4-nova-source-action').length) {
            updateSourceButton();
            return;
        }

        // This is a regular focusable Nova chip. It does not touch Nova's
        // private closure or register a second source manager.
        var item = $('<div class="nova-chip selector p4-nova-source-action"></div>');
        item.attr('data-p4-nova-action', 'sources');
        item.append($('<span class="nova-chip__label"></span>').text('↻ Источники'));
        item.on('hover:enter.p4src click.p4src', function (event) {
            if (event && event.preventDefault) event.preventDefault();
            if (event && event.stopPropagation) event.stopPropagation();
            openSourceMenu();
        });
        bar.append(item);
        updateSourceButton();
    }

    function shouldPin() {
        if (!isEnabled() || !isNovaWide()) return false;
        if (window.innerWidth < 960 || window.innerHeight < 390) return false;
        return true;
    }

    function sync() {
        var view, old;
        prepaint();
        if (!shouldPin()) {
            unpin();
            return;
        }
        view = getView();
        if (!view) {
            unpin();
            return;
        }
        if (!active || active.root[0] !== view.root[0] ||
            active.strip[0] !== view.strip[0] || active.rows[0] !== view.rows[0]) {
            unpin();
            pin(view);
        }
        if (active) active.active = view.active;
        if (!resize(active)) unpin();
        else {
            updateSummary(active);
            ensureSourceButton(active);
        }
    }

    function schedule() {
        if (timer) clearTimeout(timer);
        timer = setTimeout(function () {
            timer = null;
            try { sync(); } catch (e) { log('sync: ' + e); }
        }, 90);
    }

    function addSettings() {
        if (!Lampa.SettingsApi) return;
        Lampa.SettingsApi.addComponent({
            component:'p4_nova_fixed', name:'Nova One: быстрый интерфейс', icon:''
        });
        Lampa.SettingsApi.addParam({
            component:'p4_nova_fixed',
            param:{name:OPTION, type:'trigger', 'default':true},
            field:{
                name:'Закрепить предпросмотр слева',
                description:'Широкая Nova: фильтры справа сверху, прокрутка серий отдельно справа снизу'
            },
            onChange:function () { prepaint(); schedule(); }
        });
        Lampa.SettingsApi.addParam({
            component:'p4_nova_fixed',
            param:{name:DETAILS_OPTION, type:'trigger', 'default':true},
            field:{
                name:'Показывать TMDB и описание под постером',
                description:'Берёт рейтинг и текст из текущей карточки Lampa, без дополнительных запросов'
            },
            onChange:function () { schedule(); }
        });
    }


    function prepaint() {
        var enabled = isEnabled() &&
            String(value('nova_plus_mode', 'wide')) === 'wide' &&
            window.innerWidth >= 960 && window.innerHeight >= 390;
        var body = document.body;
        if (!body) return;
        var name = bodyFlag;
        var classes = String(body.className || '');
        var match = new RegExp('(?:^|\\s)' + name + '(?:\\s|$)').test(classes);
        if (enabled && !match) body.className = classes + (classes ? ' ' : '') + name;
        else if (!enabled && match)
            body.className = classes.replace(new RegExp('(?:^|\\s)' + name + '(?=\\s|$)', 'g'), '')
                .replace(/^\\s+|\\s+$/g, '');
    }

    function observeCurrentActivity() {
        if (!window.MutationObserver) return;
        var selected, explorer, container, root;
        try {
            selected = Lampa.Activity.active();
            if (!selected || !selected.activity || !selected.activity.render) return;
            explorer = $(selected.activity.render());
            if (!explorer.hasClass('explorer')) explorer = explorer.find('.explorer').first();
            container = explorer.find('.explorer__files-body').first();
            if (!container.length || observed === container[0]) return;
            if (observer) observer.disconnect();
            observed = container[0];
            observer = new MutationObserver(function (records) {
                // Nova creates .nova-plus-root in the same JS turn. A mutation
                // callback runs before the next browser paint, unlike polling.
                if (observing) return;
                observing = true;
                try {
                    if (isNovaWide()) {
                        prepaint();
                        sync();
                    }
                } catch (e) { log('observer: ' + e); }
                observing = false;
            });
            observer.observe(observed, {childList:true, subtree:true});
        } catch (e) {
            log('observer setup: ' + e);
        }
    }

    function loadNova() {
        if (window.nova_plus) {
            embeddedLoaded = true;
            observeCurrentActivity();
            sync();
            return;
        }
        if (document.getElementById(novaScriptId)) return;
        var tag = document.createElement('script');
        tag.id = novaScriptId;
        tag.src = NOVA_URL;
        tag.async = true;
        tag.onload = function () {
            embeddedLoaded = true;
            observeCurrentActivity();
            sync();
        };
        tag.onerror = function () {
            log('Could not load original Nova Plus: ' + NOVA_URL);
            if (Lampa.Noty && Lampa.Noty.show)
                Lampa.Noty.show('Nova One: не удалось загрузить оригинальную Nova Plus');
        };
        (document.head || document.body).appendChild(tag);
    }

    function start() {
        if (started) return;
        started = true;
        injectStyles();
        prepaint();
        addSettings();
        if (Lampa.Listener && Lampa.Listener.follow) {
            Lampa.Listener.follow('activity', function () {
                observeCurrentActivity();
                prepaint();
                schedule();
            });
        }
        window.addEventListener('resize', function () {
            prepaint();
            schedule();
        }, false);
        observeCurrentActivity();
        loadNova();
        setInterval(function () {
            // Periodic fallback only. Normal screen changes use MutationObserver.
            try {
                prepaint();
                observeCurrentActivity();
                sync();
            } catch (e) { log('fallback: ' + e); }
        }, 2500);
        schedule();
        log('v1.1 prepared Nova with adaptive voices and source refresh');
    }

    window.P4NovaFixed = {
        version:'1.1.0',
        sync:sync,
        enabled:isEnabled,
        status:function () {
            return {
                attached:!!active,
                height:active ? active.root[0].offsetHeight : 0,
                rows:active ? active.rows[0].offsetHeight : 0,
                episodes:active ? active.strip[0].clientHeight : 0,
                details:active ? !!active.hero.children('.p4-nova-summary').length : false,
                originalNova:!!window.nova_plus,
                novaLoaded:embeddedLoaded,
                checkingSources:checkingSources,
                prepaint:!!(document.body &&
                    new RegExp('(?:^|\\s)' + bodyFlag + '(?:\\s|$)')
                        .test(String(document.body.className || '')))
            };
        }
    };

    if (window.appready) start();
    else if (Lampa.Listener && Lampa.Listener.follow) {
        Lampa.Listener.follow('app', function (e) {
            if (e && e.type === 'ready') start();
        });
    }
})();