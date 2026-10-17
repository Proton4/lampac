/*
 * Proton4 Nova One Fast v1.2: stable v1 with audio spacing and manual source controls.
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

        // Measure the *unconstrained inner content* of Nova's filter panel.
        // Measuring view.rows.scrollHeight creates a feedback loop: its own
        // forced height becomes next interval's height (+6px every 1.1s).
        var inner = view.rows.children('.nova-plus__panel').first();
        var natural = inner.length && inner[0].scrollHeight ?
            inner[0].scrollHeight : 130;
        var cap = Math.max(120, Math.min(Math.floor(available * 0.74), available - 170));
        var top = Math.max(100, Math.min(Math.ceil(natural + 12), cap));
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
        else updateSummary(active);
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
        log('v1.2 stable v1 layout with source controls');
    }

    window.P4NovaFixed = {
        version:'1.2.0',
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