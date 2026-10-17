/*
 * Proton4 Nova Fixed Preview v0.1.0 (experimental)
 * Companion to the original Nova Plus by amikdn.
 *
 * Wide Nova only: pins the preview in the left column and scrolls
 * episode cards in the right column, independently of Lampa's outer scroll.
 * Does not replace Nova, modify server URLs or create virtual seasons.
 * Written using ES5 syntax for Crosswalk 5 / Chromium 34.
 */
(function () {
    'use strict';

    var FLAG = 'p4_nova_fixed_preview_v01';
    var OPTION = 'p4_nova_fixed_preview_enabled';
    var cssId = 'p4-nova-fixed-preview-css';
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
        el.textContent = [
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
                'background:rgba(255,255,255,.32);border-radius:8px;}'
        ].join('');
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
                strip:strip, scroller:scroller
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

    function unpin() {
        if (!active) return;
        var view = active;
        try {
            restoreOuterScroll(view);
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

        var panel = view.rows[0];
        var natural = panel.scrollHeight || view.rows.outerHeight() || 120;
        var cap = Math.max(120, Math.floor(available * 0.53));
        var top = Math.max(100, Math.min(Math.ceil(natural + 6), cap));
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

    function shouldPin() {
        if (!isEnabled() || !isNovaWide()) return false;
        if (window.innerWidth < 960 || window.innerHeight < 390) return false;
        return true;
    }

    function sync() {
        var view, old;
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
        if (!resize(active)) unpin();
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
            component:'p4_nova_fixed', name:'Nova: прокрутка серий', icon:''
        });
        Lampa.SettingsApi.addParam({
            component:'p4_nova_fixed',
            param:{name:OPTION, type:'trigger', 'default':true},
            field:{
                name:'Закрепить предпросмотр слева',
                description:'Широкая Nova: фильтры справа сверху, прокрутка серий отдельно справа снизу'
            },
            onChange:function () { schedule(); }
        });
    }

    function start() {
        if (started) return;
        started = true;
        injectStyles();
        addSettings();
        if (Lampa.Listener && Lampa.Listener.follow)
            Lampa.Listener.follow('activity', function () { schedule(); });
        window.addEventListener('resize', schedule, false);
        setInterval(function () {
            try { sync(); } catch (e) { log('poll: ' + e); }
        }, 1100);
        schedule();
        log('v0.1.0 running (Nova must be installed separately)');
    }

    window.P4NovaFixed = {
        version:'0.1.0',
        sync:sync,
        enabled:isEnabled,
        status:function () {
            return {
                attached:!!active,
                height:active ? active.root[0].offsetHeight : 0,
                rows:active ? active.rows[0].offsetHeight : 0,
                episodes:active ? active.strip[0].clientHeight : 0
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