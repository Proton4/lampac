/*
 * Proton4 Nova One Fast v1.3.1-test: Original/English scan + movie UI fixes.
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

    var FLAG = 'p4_nova_one_fast_v1';
    var OPTION = 'p4_nova_fixed_preview_enabled';
    var DETAILS_OPTION = 'p4_nova_fixed_details_enabled';
    var cssId = 'p4-nova-one-fast-css';
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
        window.console.log('Nova Fixed Preview: ' + message);
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
            '.nova-plus-root.nova-plus.p4-nova-fixed.p4-nova-movie ',
                '.nova-plus__group[data-nova-group="voice"]>.nova-plus__row{',
                'max-height:9.6em!important;overflow-y:auto!important;overflow-x:hidden!important;',
                'align-content:flex-start!important;padding-right:.45em!important;',
                '-webkit-overflow-scrolling:touch!important;box-sizing:border-box!important;}',
            '.nova-plus-root.nova-plus.p4-nova-fixed.p4-nova-movie ',
                '.nova-plus__group[data-nova-group="voice"]>.nova-plus__row::-webkit-scrollbar{',
                'width:7px!important;}',
            '.nova-plus-root.nova-plus.p4-nova-fixed.p4-nova-movie ',
                '.nova-plus__group[data-nova-group="voice"]>.nova-plus__row::-webkit-scrollbar-thumb{',
                'background:rgba(255,255,255,.38)!important;border-radius:8px!important;}',
            '.nova-plus-root.nova-plus.p4-nova-fixed>.nova__rows{z-index:2!important;}',
            '.nova-plus-root.nova-plus.p4-nova-fixed>.nova-plus__strip{z-index:1!important;}',
            '.nova-plus-root.nova-plus.p4-nova-fixed .nova-plus__bar{',
              'display:-webkit-flex!important;display:flex!important;',
              '-webkit-flex-wrap:wrap!important;-ms-flex-wrap:wrap!important;',
              'flex-wrap:wrap!important;overflow:visible!important;}',
            '.nova-plus-root.nova-plus.p4-nova-fixed .p4-nova-refresh{',
              'display:inline-block!important;white-space:nowrap;',
              '-webkit-flex-shrink:0!important;flex-shrink:0!important;',
              'padding:.3em .7em!important;margin-right:.7em!important;',
              'background:rgba(255,255,255,.15)!important;}',
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
                'white-space:normal;word-wrap:break-word;overflow-wrap:break-word;}'
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
            prefix + '>.nova__rows{height:15em;}',
            prefix + '>.nova-plus__strip{top:15em;height:calc(100% - 15em);}'
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

    function p4IsMovie(view) {
        var activity = view && view.active || {};
        var movie = activity.movie || activity.card || {};
        var media = String(movie.media_type || movie.type || '').toLowerCase();
        if (media === 'tv' || media === 'serial' || media === 'series') return false;
        if (media === 'movie' || media === 'film') return true;
        if (movie.first_air_date || movie.number_of_seasons || movie.name) return false;
        if (movie.release_date || movie.title) return true;
        return false;
    }

    function p4MarkMovie(view) {
        if (!view || !view.root) return;
        if (p4IsMovie(view)) view.root.addClass('p4-nova-movie');
        else view.root.removeClass('p4-nova-movie');
    }

    function p4FitRows(view, element) {
        if (!view || !element) return;
        if (p4IsMovie(view)) {
            try {
                var voiceRow = $(element).closest(
                    '.nova-plus__group[data-nova-group="voice"]>.nova-plus__row'
                );
                if (voiceRow.length && voiceRow[0].scrollHeight > voiceRow[0].clientHeight + 2) {
                    fitInto(voiceRow, element);
                    return;
                }
            } catch (e) {}
        }
        fitInto(view.rows, element);
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
            '.selector,.nova-chip', function () { p4FitRows(view, this); });
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

        // Nova can reserve a large, empty min-height in its filter panel.
        // Measuring its scrollHeight creates a blank band over the voice chips.
        // Measure the BOTTOM of the actually visible filter groups instead.
        var inner = view.rows.children('.nova-plus__panel').first();
        var natural = 130;
        var measured = 0;
        if (inner.length && inner[0]) {
            var bounds = view.rows[0].getBoundingClientRect();
            var yScroll = view.rows[0].scrollTop || 0;
            inner.children('.nova-plus__bar,.nova-plus__group,.nova-drop')
                .each(function () {
                    if (!this.getBoundingClientRect) return;
                    var box = this.getBoundingClientRect();
                    if (!box.width || !box.height) return;
                    // Ignore invisible dropdowns and disabled filter groups.
                    var style = window.getComputedStyle ?
                        window.getComputedStyle(this, null) : this.currentStyle;
                    if (style && (style.display === 'none' ||
                        style.visibility === 'hidden')) return;
                    var bottom = box.bottom - bounds.top + yScroll;
                    if (bottom > 0 && bottom < available * 2)
                        measured = Math.max(measured, bottom);
                });
            if (measured > 0) natural = Math.max(100, measured);
            else if (inner[0].scrollHeight) natural = inner[0].scrollHeight;
        }
        // Leave room for many voices (their own scroll), but never reserve
        // space belonging only to the empty background of Nova's panel.
        var cap = Math.max(120, Math.min(Math.floor(available * 0.74), available - 170));
        var top = Math.max(100, Math.min(Math.ceil(natural + 10), cap));
        var stripHeight = Math.max(80, available - top - 8);

        // Write style only on actual dimension changes; never redraw Nova.
        var stamp = available + ':' + top + ':' + stripHeight;
        if (active && active.stamp === stamp) return true;

        view.root.css('height', available + 'px');
        view.rows.css('height', top + 'px');
        view.strip.css({top:(top + 8) + 'px',height:stripHeight + 'px'});
        view.stamp = stamp;
        return true;
    }


    // Only user-triggered actions. No periodic network polling is added here.
    function p4ShowAllSources() {
        var view = active;
        if (!view || !view.rows) return;
        var source = view.rows.find('[data-nova-focus="source"]').first();
        if (!source.length) {
            try { Lampa.Noty.show('Источники ещё загружаются'); } catch (e) {}
            return;
        }
        var opened = view.rows.find('.nova-drop[data-nova-menu="source"]').length;
        if (!opened) source.trigger('hover:enter');
        setTimeout(function () {
            var rows = active && active.rows;
            if (!rows) return;
            var more = rows.find('.nova-chip--more').first();
            if (more.length) more.trigger('hover:enter');
        }, 150);
    }

    function p4RecheckSources() {
        var now;
        try { now = Lampa.Activity.active(); } catch (e) { now = null; }

        // Nova is a universal online skin, not a 'lampac'-only activity.
        // The real source can be 'lampac', 'online', online_prestige, etc.
        // Only allow refresh when the same active Nova card is still open.
        var movie = now && (now.movie || now.card);
        if (!active || !now || !now.activity || !now.component ||
            active.active !== now || !movie || !movie.id ||
            !Lampa.Activity || typeof Lampa.Activity.replace !== 'function') {
            try { Lampa.Noty.show('Открой онлайн-карточку для обновления'); } catch (e) {}
            return;
        }

        // Forget only this movie's previously negative NOVA client results.
        // Other movies and all playback/translation choices remain unchanged.
        try {
            var box = Lampa.Storage.get('nova_probe', {});
            var entry = box && box[String(movie.id)];
            var changed = false;
            if (entry && entry.list) {
                for (var key in entry.list) {
                    if (!Object.prototype.hasOwnProperty.call(entry.list, key)) continue;
                    if (entry.list[key] && entry.list[key].s === 'empty') {
                        delete entry.list[key];
                        changed = true;
                    }
                }
                if (changed) Lampa.Storage.set('nova_probe', box);
            }
        } catch (e) { log('Probe reset: ' + e); }

        // Replay the same online component's actual startup search.
        // Lampa.Activity.replace recreates it, calling start()/initialize().
        // For Lampac that runs createSource() -> lifeSource() -> startSource().
        // Non-empty params bypass Nova's in-place Activity.replace wrapper.
        // DO NOT call createSource() on the live component: that may overlap
        // existing source requests and freeze the old Crosswalk engine.
        try {
            Lampa.Activity.replace({component:now.component});
        } catch (e) {
            log('Source recheck: ' + e);
            try { Lampa.Noty.show('Не удалось перезапустить поиск источников'); } catch (e2) {}
        }
    }


    // v1.3-test: user-triggered cross-source Original / English audio scan.
    // It intentionally uses Nova's existing UI actions instead of private
    // nova_plus.js internals, so the original plugin remains untouched.
    var P4_AUDIO_CACHE = 'p4_nova_audio_scan_cache_v1';
    var P4_AUDIO_TTL = 12 * 60 * 60 * 1000;
    var p4AudioScanBusy = false;

    function p4AudioNorm(text) {
        return String(text || '').toLowerCase()
            .replace(/\u0451/g, '\u0435')
            .replace(/\s+/g, ' ')
            .replace(/^\s+|\s+$/g, '');
    }

    function p4AudioSourceNorm(text) {
        return p4AudioNorm(text)
            .replace(/\b(2160|1440|1080|720|576|480|360)p?\b/g, '')
            .replace(/\b(4k|uhd|fhd|hd)\b/g, '')
            .replace(/[^0-9a-z\u0400-\u04ff]+/g, ' ')
            .replace(/\s+/g, ' ')
            .replace(/^\s+|\s+$/g, '');
    }

    function p4MovieOriginalLanguage() {
        var now, movie;
        try { now = Lampa.Activity.active(); } catch (e) { now = null; }
        movie = now && (now.movie || now.card) || {};
        return p4AudioNorm(movie.original_language || movie.originalLanguage || '');
    }

    function p4AudioTags(title) {
        var text = p4AudioNorm(title);
        var tags = [];
        var original = /(^|[^a-z])(original|orig)([^a-z]|$)|\u043e\u0440\u0438\u0433\u0438\u043d\u0430\u043b|\u043e\u0440\u0438\u0433(?:\.|[^a-z\u0400-\u04ff]|$)/i.test(text);
        var english = /(^|[^a-z])(english|eng)([^a-z]|$)|\u0430\u043d\u0433\u043b\u0438\u0439\u0441\u043a|\u0430\u043d\u0433\u043b(?:\.|[^a-z\u0400-\u04ff]|$)/i.test(text);
        if (original) tags.push('Original');
        if (english || (original && p4MovieOriginalLanguage() === 'en')) tags.push('EN');
        return tags;
    }

    function p4AudioButtonText(text) {
        try {
            if (!active || !active.rows) return;
            var button = active.rows.find('.p4-nova-refresh .nova-chip__label').first();
            if (button.length) button.text(text || '\u21bb \u0418\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u0438');
        } catch (e) {}
    }

    function p4AudioCacheKey() {
        var now, movie, id, season = 0;
        try { now = Lampa.Activity.active(); } catch (e) { now = null; }
        movie = now && (now.movie || now.card) || {};
        id = movie.tmdb_id || movie.id || '';
        try {
            var seasonNode = active && active.rows ?
                active.rows.find('[data-nova-group="season"] .nova-chip--active .nova-chip__label').first() : null;
            if (seasonNode && seasonNode.length) {
                var found = String(seasonNode.text() || '').match(/\d+/);
                if (found) season = parseInt(found[0], 10) || 0;
            }
        } catch (e) {}
        return String(id) + ':' + String(season || 0);
    }

    function p4AudioCacheGet() {
        var key = p4AudioCacheKey();
        if (!key || key === ':0') return null;
        try {
            var box = Lampa.Storage.get(P4_AUDIO_CACHE, {}) || {};
            var row = box[key];
            if (!row || !row.time || Date.now() - row.time > P4_AUDIO_TTL) return null;
            return row;
        } catch (e) {
            return null;
        }
    }

    function p4AudioCacheSet(list) {
        var key = p4AudioCacheKey();
        if (!key || key === ':0') return;
        try {
            var box = Lampa.Storage.get(P4_AUDIO_CACHE, {}) || {};
            box[key] = {
                time: Date.now(),
                lang: p4MovieOriginalLanguage(),
                list: list || []
            };
            var keys = [];
            for (var name in box) {
                if (Object.prototype.hasOwnProperty.call(box, name))
                    keys.push({key:name, time:(box[name] && box[name].time) || 0});
            }
            keys.sort(function (a, b) { return b.time - a.time; });
            for (var i = 40; i < keys.length; i++) delete box[keys[i].key];
            Lampa.Storage.set(P4_AUDIO_CACHE, box);
        } catch (e) {
            log('audio cache: ' + e);
        }
    }

    function p4AudioCurrentSourceTitle() {
        try {
            if (!active || !active.rows) return '';
            return active.rows.find('.nova-plus__bar [data-nova-focus="source"] .nova-chip__label').first().text() ||
                active.rows.find('[data-nova-focus="source"] .nova-chip__label').first().text() || '';
        } catch (e) {
            return '';
        }
    }

    function p4AudioOpenSources(done) {
        if (!active || !active.rows) return done(false);
        try { p4ShowAllSources(); } catch (e) {}
        setTimeout(function () {
            if (!active || !active.rows) return done(false);
            var drop = active.rows.find('.nova-drop[data-nova-menu="source"]').first();
            done(!!drop.length);
        }, 320);
    }

    function p4AudioCollectSources(done) {
        p4AudioOpenSources(function (ok) {
            if (!ok || !active || !active.rows) return done([], '');
            var list = [];
            var selected = '';
            active.rows.find('.nova-drop[data-nova-menu="source"] [data-nova-src]').each(function () {
                var node = $(this);
                var key = String(node.attr('data-nova-src') || '');
                var title = String(node.find('.nova-chip__label').first().text() || node.text() || '');
                if (!key || !title) return;
                if (node.hasClass('nova-chip--active')) selected = key;
                list.push({key:key, title:title});
            });
            done(list, selected);
        });
    }

    function p4AudioFindSourceChip(key) {
        var found = null;
        if (!active || !active.rows) return found;
        active.rows.find('.nova-drop[data-nova-menu="source"] [data-nova-src]').each(function () {
            if (String($(this).attr('data-nova-src') || '') === String(key || ''))
                found = $(this);
        });
        return found;
    }

    function p4AudioWaitSource(title, done) {
        var started = Date.now();
        var wanted = p4AudioSourceNorm(title);
        var tick = function () {
            if (!p4AudioScanBusy) return done(false);
            if (!active || !active.rows) {
                if (Date.now() - started > 8000) return done(false);
                return setTimeout(tick, 250);
            }
            var now = p4AudioSourceNorm(p4AudioCurrentSourceTitle());
            var source = active.rows.find('.nova-plus__bar [data-nova-focus="source"]').first();
            if (!source.length) source = active.rows.find('[data-nova-focus="source"]').first();
            var busy = source.hasClass('nova-chip--busy');
            if (now && wanted && now === wanted && !busy && Date.now() - started > 550)
                return done(true);
            if (Date.now() - started > 8000) return done(now === wanted);
            setTimeout(tick, 220);
        };
        tick();
    }

    function p4AudioSwitchSource(entry, done) {
        if (!entry) return done(false);
        if (p4AudioSourceNorm(p4AudioCurrentSourceTitle()) === p4AudioSourceNorm(entry.title))
            return setTimeout(function () { done(true); }, 150);

        p4AudioOpenSources(function (ok) {
            if (!ok) return done(false);
            var chip = p4AudioFindSourceChip(entry.key);
            if (!chip || !chip.length) return done(false);
            try { chip.trigger('hover:enter'); } catch (e) { return done(false); }
            p4AudioWaitSource(entry.title, done);
        });
    }

    function p4AudioInspect(entry) {
        var voices = [];
        var seen = {};
        if (!active || !active.rows) return {key:entry.key, title:entry.title, voices:voices};

        active.rows.find('[data-nova-group="voice"] [data-nova-focus^="voice:"]').each(function () {
            var node = $(this);
            var title = String(node.find('.nova-chip__label').first().text() || node.text() || '');
            var tags = p4AudioTags(title);
            if (!title || !tags.length) return;
            var mark = p4AudioNorm(title);
            if (seen[mark]) return;
            seen[mark] = true;
            voices.push({title:title, tags:tags});
        });

        // Classic Nova fallback: open voice dropdown only when the wide group is absent.
        if (!voices.length) {
            active.rows.find('.nova-drop[data-nova-menu="voice"] [data-nova-focus^="voice:"]').each(function () {
                var node = $(this);
                var title = String(node.find('.nova-chip__label').first().text() || node.text() || '');
                var tags = p4AudioTags(title);
                if (!title || !tags.length) return;
                var mark = p4AudioNorm(title);
                if (seen[mark]) return;
                seen[mark] = true;
                voices.push({title:title, tags:tags});
            });
        }

        return {key:entry.key, title:entry.title, voices:voices};
    }

    function p4AudioResultTitle(row) {
        var tags = [];
        var seen = {};
        (row.voices || []).forEach(function (voice) {
            (voice.tags || []).forEach(function (tag) {
                if (!seen[tag]) {
                    seen[tag] = true;
                    tags.push(tag);
                }
            });
        });
        return row.title + (tags.length ? '  \u00b7  ' + tags.join(' + ') : '');
    }

    function p4AudioChooseVoice(row) {
        var voices = row && row.voices || [];
        if (!voices.length) return;
        var items = voices.map(function (voice) {
            return {
                title: voice.title + '  \u00b7  ' + (voice.tags || []).join(' + '),
                p4_voice: voice.title
            };
        });
        Lampa.Select.show({
            title: row.title + ' \u2014 Original / English',
            items: items,
            onSelect: function (item) {
                if (!item || !item.p4_voice) return;
                p4AudioScanBusy = true;
                Lampa.Loading.start();
                p4AudioSwitchSource(row, function (ok) {
                    p4AudioScanBusy = false;
                    Lampa.Loading.stop();
                    if (!ok || !active || !active.rows) {
                        try { Lampa.Noty.show('\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043f\u0435\u0440\u0435\u043a\u043b\u044e\u0447\u0438\u0442\u044c \u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a'); } catch (e) {}
                        return;
                    }
                    var target = null;
                    active.rows.find('[data-nova-group="voice"] [data-nova-focus^="voice:"]').each(function () {
                        var title = String($(this).find('.nova-chip__label').first().text() || $(this).text() || '');
                        if (p4AudioNorm(title) === p4AudioNorm(item.p4_voice)) target = $(this);
                    });
                    if (target && target.length) {
                        try { target.trigger('hover:enter'); } catch (e) {}
                    } else {
                        try { Lampa.Noty.show('\u0418\u0441\u0442\u043e\u0447\u043d\u0438\u043a \u043e\u0442\u043a\u0440\u044b\u0442; \u0432\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u0430\u0443\u0434\u0438\u043e \u0432\u0440\u0443\u0447\u043d\u0443\u044e'); } catch (e) {}
                    }
                });
            },
            onBack: function () {
                try { Lampa.Controller.toggle('content'); } catch (e) {}
            }
        });
    }

    function p4AudioShowResults(list, cached) {
        list = list || [];
        if (!Lampa.Select || typeof Lampa.Select.show !== 'function') return;
        var items = [];
        list.forEach(function (row) {
            if (!row || !row.voices || !row.voices.length) return;
            items.push({title:p4AudioResultTitle(row), p4_row:row});
        });
        items.push({
            title: cached ? '\u21bb \u041f\u0435\u0440\u0435\u0441\u043a\u0430\u043d\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u0438' : '\u21bb \u041f\u043e\u0432\u0442\u043e\u0440\u0438\u0442\u044c \u0441\u043a\u0430\u043d\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u0435',
            p4_rescan:true
        });
        if (!list.length) {
            items.unshift({title:'\u041d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u043e Original / English', p4_info:true});
        }
        Lampa.Select.show({
            title:'Original / English \u2014 ' + String(list.length) + ' \u0438\u0441\u0442\u043e\u0447\u043d.',
            items:items,
            onSelect:function (item) {
                if (!item) return;
                if (item.p4_rescan) return setTimeout(function () { p4AudioStartScan(true); }, 80);
                if (item.p4_row) return p4AudioChooseVoice(item.p4_row);
            },
            onBack:function () {
                try { Lampa.Controller.toggle('content'); } catch (e) {}
            }
        });
    }

    function p4AudioStartScan(force) {
        if (p4AudioScanBusy) {
            try { Lampa.Noty.show('\u041f\u043e\u0438\u0441\u043a Original / English \u0443\u0436\u0435 \u0438\u0434\u0451\u0442'); } catch (e) {}
            return;
        }
        if (!active || !active.rows) {
            try { Lampa.Noty.show('\u041e\u0442\u043a\u0440\u043e\u0439\u0442\u0435 \u043e\u043d\u043b\u0430\u0439\u043d-\u043a\u0430\u0440\u0442\u043e\u0447\u043a\u0443'); } catch (e) {}
            return;
        }

        if (!force) {
            var cached = p4AudioCacheGet();
            if (cached && cached.list) return p4AudioShowResults(cached.list, true);
        }

        p4AudioScanBusy = true;
        p4AudioButtonText('EN\u2026');
        try {
            Lampa.Loading.start(function () {
                p4AudioScanBusy = false;
                p4AudioButtonText();
            });
        } catch (e) {}

        p4AudioCollectSources(function (sources, originalKey) {
            if (!p4AudioScanBusy) return;
            if (!sources.length) {
                p4AudioScanBusy = false;
                try { Lampa.Loading.stop(); } catch (e) {}
                p4AudioButtonText();
                try { Lampa.Noty.show('\u0418\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u0438 \u0435\u0449\u0451 \u043d\u0435 \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u043b\u0438\u0441\u044c'); } catch (e) {}
                return;
            }

            var original = null;
            for (var oi = 0; oi < sources.length; oi++) {
                if (sources[oi].key === originalKey) original = sources[oi];
            }
            if (!original) {
                var currentTitle = p4AudioSourceNorm(p4AudioCurrentSourceTitle());
                for (var oj = 0; oj < sources.length; oj++) {
                    if (p4AudioSourceNorm(sources[oj].title) === currentTitle) original = sources[oj];
                }
            }

            var results = [];
            var index = 0;

            var finish = function () {
                var afterRestore = function () {
                    p4AudioScanBusy = false;
                    try { Lampa.Loading.stop(); } catch (e) {}
                    p4AudioButtonText();
                    p4AudioCacheSet(results);
                    p4AudioShowResults(results, false);
                };
                if (original && p4AudioSourceNorm(p4AudioCurrentSourceTitle()) !== p4AudioSourceNorm(original.title)) {
                    p4AudioSwitchSource(original, function () { setTimeout(afterRestore, 180); });
                } else afterRestore();
            };

            var step = function () {
                if (!p4AudioScanBusy) return;
                if (index >= sources.length) return finish();

                var entry = sources[index++];
                p4AudioButtonText('EN ' + index + '/' + sources.length);

                p4AudioSwitchSource(entry, function (ok) {
                    if (!p4AudioScanBusy) return;
                    if (ok) {
                        var row = p4AudioInspect(entry);
                        if (row.voices && row.voices.length) results.push(row);
                    }
                    setTimeout(step, 120);
                });
            };

            step();
        });
    }

    function p4SourceMenu() {
        if (!Lampa.Select || typeof Lampa.Select.show !== 'function') return;
        Lampa.Select.show({
            title:'Источники — Nova One',
            items:[
                {title:'🔊 Найти Original / English', p4_action:'audio'},
                {title:'Показать все, включая скрытые', p4_action:'all'},
                {title:'Перезапустить поиск источников', p4_action:'refresh'}
            ],
            onSelect:function (item) {
                if (!item) return;
                if (item.p4_action === 'audio') setTimeout(function () { p4AudioStartScan(false); }, 75);
                else if (item.p4_action === 'all') setTimeout(p4ShowAllSources, 75);
                else if (item.p4_action === 'refresh') setTimeout(p4RecheckSources, 75);
            }
        });
    }

    function p4AddSourceButton(view) {
        if (!view || !view.rows) return;

        // Nova rebuilds the movie toolbar after file/voice data arrives.
        // Always target the final live bar; if it is temporarily absent,
        // create a small fallback bar inside the panel and let the next
        // Nova rebuild replace it naturally.
        var bars = view.rows.find('.nova-plus__bar');
        var bar = bars.length ? bars.last() : null;
        if (!bar || !bar.length) {
            var panel = view.rows.children('.nova-plus__panel').first();
            if (!panel.length) return;
            bar = panel.children('.p4-nova-fallback-bar').first();
            if (!bar.length) {
                bar = $('<div class="nova-toolbar nova-plus__bar p4-nova-fallback-bar"></div>');
                panel.prepend(bar);
            }
        }

        if (bar.find('.p4-nova-refresh').length) return;

        var button = $('<div class="nova-chip selector p4-nova-refresh"></div>');
        button.append($('<span class="nova-chip__label"></span>').text('↻ Источники'));
        // No data-nova-focus: Nova rebind() would overwrite its handler.
        button.on('hover:enter.p4src click.p4src', function () {
            p4SourceMenu();
        });
        bar.prepend(button);

        // Keep the newly inserted selector reachable by the TV remote.
        try {
            if (Lampa.Controller &&
                typeof Lampa.Controller.collectionAppend === 'function') {
                Lampa.Controller.collectionAppend(button[0]);
            }
        } catch (e) {}
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
        p4MarkMovie(active);
        if (!resize(active)) unpin();
        else {
            updateSummary(active);
            p4AddSourceButton(active);
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
                        // Movie mode can rebuild rows/bar once more after files
                        // and voice metadata arrive. Re-run after that paint.
                        setTimeout(schedule, 140);
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
        log('v1.3.1-test: movie voice scrolling + persistent source button');
    }

    window.P4NovaFixed = {
        version:'1.3.1-test',
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