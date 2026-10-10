/*
 * LF4 - Lampac Card Filter stability/reset update.
 *
 * Loads LF3, then adds:
 * - stable mouse focus in desktop browsers;
 * - persistent remembered-season row during source/series transitions;
 * - deterministic Reset behavior: first season + default/first translation;
 * - current source is preserved by Reset;
 * - clearer Reset label.
 *
 * Crosswalk 5 / Chromium 34 compatible: ES5 syntax only.
 * Load LF4 only. Do not also load LF/LF2/LF3 or older Lampac filters.
 */
(function () {
    'use strict';

    var VERSION = '4.0.0';
    var FLAG = 'lf4_stability_plugin';
    var CORE_URL = 'https://proton4.github.io/lampac/lf3.js?v=2';
    var SEASON_STORAGE = 'lampac_src_filter_pinned_seasons';

    var panel = null;
    var body = null;
    var observer = null;
    var observedBody = null;
    var tuneTimer = null;
    var waitTimer = null;
    var waitCount = 0;
    var intervalTimer = null;

    var mouseUntil = 0;
    var mouseTarget = null;
    var resetUntil = 0;

    if (window[FLAG]) return;
    window[FLAG] = true;

    function tr(key) {
        try {
            return Lampa.Lang.translate(key);
        } catch (e) {
            return key;
        }
    }

    function safeObject(value) {
        return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    }

    function getActive() {
        try {
            return Lampa.Activity.active();
        } catch (e) {
            return null;
        }
    }

    function movieId() {
        var active = getActive();

        if (!active || !active.movie || typeof active.movie.id === 'undefined') {
            return '';
        }

        return String(active.movie.id);
    }

    function movieKey() {
        var active = getActive();
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

    function rememberedSeason() {
        var key = movieKey();
        var all = safeObject(Lampa.Storage.get(SEASON_STORAGE, {}));

        return key && all[key] ? all[key] : null;
    }

    function setSeasonMemory(label, index) {
        var key = movieKey();
        var all;
        var match;
        var number;

        if (!key) return;

        all = safeObject(Lampa.Storage.get(SEASON_STORAGE, {}));

        if (!label) {
            delete all[key];
            Lampa.Storage.set(SEASON_STORAGE, all);
            return;
        }

        match = String(label).match(/\d+/);
        number = match ? parseInt(match[0], 10) : (parseInt(index, 10) || 0) + 1;

        all[key] = {
            index: parseInt(index, 10) || 0,
            number: number,
            label: String(label)
        };

        Lampa.Storage.set(SEASON_STORAGE, all);
    }

    function normalizeText(value) {
        return String(value || '')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .replace(/^\s+|\s+$/g, '');
    }

    function currentLanguage() {
        var language = '';

        try {
            language = String(Lampa.Storage.field('language') || '');
        } catch (e) {
            language = String(Lampa.Storage.get('language', '') || '');
        }

        return language.toLowerCase();
    }

    function resetLabel() {
        var language = currentLanguage();

        if (language.indexOf('uk') === 0) return 'Скинути сезон і озвучення';
        if (language.indexOf('ru') === 0) return 'Сбросить сезон и озвучку';

        return 'Reset season & audio';
    }

    function resetHint() {
        var language = currentLanguage();

        if (language.indexOf('uk') === 0) {
            return 'Перший сезон і стандартне озвучення; джерело не змінюється';
        }

        if (language.indexOf('ru') === 0) {
            return 'Первый сезон и озвучка по умолчанию; источник не меняется';
        }

        return 'First season and default audio; source stays selected';
    }

    function markMouse(event) {
        var target;

        mouseUntil = Date.now() + 1600;

        target = event && event.target ? $(event.target).closest('#lf-panel .lf-item, #lf-panel .lf-close') : $();
        mouseTarget = target.length ? target[0] : null;

        panel = $('#lf-panel');
        if (panel.length) panel.addClass('lf4-mouse-active');
    }

    function mouseActive() {
        return Date.now() < mouseUntil;
    }

    function bindMouse() {
        if (document.__lf4MouseBound) return;
        document.__lf4MouseBound = true;

        document.addEventListener('mousemove', markMouse, true);
        document.addEventListener('mousedown', markMouse, true);
        document.addEventListener('wheel', markMouse, true);

        $(document).on('mouseenter.lf4', '#lf-panel .lf-item, #lf-panel .lf-close', function () {
            mouseTarget = this;
            mouseUntil = Date.now() + 1600;

            $('#lf-panel .focus').not(this).removeClass('focus');
            $(this).addClass('focus');
        });
    }

    function patchController() {
        var controller;
        var originalSet;
        var originalFocus;

        if (!Lampa.Controller || Lampa.Controller.__lf4FocusPatched) return;

        controller = Lampa.Controller;
        originalSet = controller.collectionSet;
        originalFocus = controller.collectionFocus;

        if (typeof originalSet !== 'function' || typeof originalFocus !== 'function') return;

        controller.collectionSet = function (html, append) {
            var appendIsLf = false;

            try {
                appendIsLf = append && (
                    $(append).is('#lf-panel') ||
                    $(append).closest('#lf-panel').length > 0
                );
            } catch (e) {}

            /*
             * LF refreshes the navigation collection often. During mouse use,
             * collectionSet clears the current hover focus and causes the
             * visible highlight to jump to another selected block. Direct LF
             * click handlers do not need that refresh, so postpone it until
             * mouse activity has stopped.
             */
            if (mouseActive() && appendIsLf) return;

            return originalSet.apply(controller, arguments);
        };

        controller.collectionFocus = function (target) {
            var node = target;

            try {
                if (target && target.jquery) node = target[0];
            } catch (e) {}

            if (mouseActive()) {
                if (!mouseTarget || node !== mouseTarget) return;
            }

            return originalFocus.apply(controller, arguments);
        };

        controller.__lf4FocusPatched = true;
    }

    function seasonSection() {
        return $('#lf-panel .lf-section-season').first();
    }

    function voiceSection() {
        return $('#lf-panel .lf-section-voice').first();
    }

    function ensureRememberedSeason() {
        var memory = rememberedSeason();
        var season = seasonSection();
        var items;
        var wanted;
        var i;
        var item;
        var text;
        var match;
        var title;
        var scroll;
        var row;

        if (!body || !body.length || !memory || !memory.label) return;

        if (!season.length) {
            season = $('<div class="lf-section lf-section-season lf-section-memory"></div>');
            title = $('<div class="lf-section-title"></div>').text(tr('torrent_serial_season'));
            scroll = $('<div class="lf-scroll"></div>');
            row = $('<div class="lf-item selected"></div>').text(memory.label);

            scroll.append(row);
            season.append(title).append(scroll);
            body.prepend(season);
            return;
        }

        items = season.find('.lf-item');
        if (!items.length) {
            season.find('.lf-scroll').append(
                $('<div class="lf-item selected"></div>').text(memory.label)
            );
            return;
        }

        if (items.filter('.selected').length) return;

        wanted = normalizeText(memory.label);

        for (i = 0; i < items.length; i++) {
            item = items.eq(i);
            text = normalizeText(item.text());

            if (text === wanted) {
                item.addClass('selected');
                return;
            }
        }

        if (typeof memory.number !== 'undefined') {
            for (i = 0; i < items.length; i++) {
                item = items.eq(i);
                match = String(item.text()).match(/\d+/);

                if (match && parseInt(match[0], 10) === parseInt(memory.number, 10)) {
                    item.addClass('selected');
                    return;
                }
            }
        }
    }

    function firstItem(section) {
        if (!section || !section.length) return $();

        return section.find('.lf-scroll .lf-item').first();
    }

    function resetStoredChoice() {
        var id = movieId();
        var source = String(
            Lampa.Storage.get('active_balanser', '') ||
            Lampa.Storage.get('online_balanser', '') ||
            ''
        );
        var storageName;
        var data;
        var choice;

        if (!id || !source) return;

        storageName = 'online_choice_' + source;
        data = safeObject(Lampa.Storage.get(storageName, {}));
        choice = safeObject(data[id]);

        /* Preserve watched episode history, but reset filter selections. */
        choice.season = 0;
        choice.voice = 0;
        choice.voice_id = 0;
        choice.voice_name = '';
        choice.voice_url = '';

        data[id] = choice;
        Lampa.Storage.set(storageName, data, true);
    }

    function prepareReset() {
        var now = Date.now();
        var season = seasonSection();
        var voice = voiceSection();
        var firstSeason;
        var firstVoice;
        var label;

        if (now < resetUntil) return;
        resetUntil = now + 450;

        firstSeason = firstItem(season);
        firstVoice = firstItem(voice);

        label = firstSeason.length ? firstSeason.text().trim() : '';
        setSeasonMemory(label, 0);
        resetStoredChoice();

        if (season.length && firstSeason.length) {
            season.find('.lf-item').removeClass('selected');
            firstSeason.addClass('selected');
        }

        if (voice.length && firstVoice.length) {
            voice.find('.lf-item').removeClass('selected');
            firstVoice.addClass('selected');
        }
    }

    function bindReset() {
        var reset = $('#lf-panel .lf-section-actions .lf-item').first();

        if (!reset.length) return;

        reset.text(resetLabel());
        reset.attr('title', resetHint());

        if (!reset.data('lf4-reset-bound')) {
            reset.data('lf4-reset-bound', true);

            /* Mouse: run before LF's normal click callback. */
            reset[0].addEventListener('mousedown', prepareReset, true);

            /* Remote/keyboard: runs in the same event turn, before Lampac's
             * delayed Activity.replace().
             */
            reset.on('hover:enter.lf4 click.lf4', prepareReset);
        }
    }

    function tunePanel() {
        tuneTimer = null;

        panel = $('#lf-panel');
        if (!panel.length) return false;

        body = panel.find('.lf-body').first();
        if (!body.length) return false;

        ensureRememberedSeason();
        bindReset();

        if (!mouseActive()) {
            panel.removeClass('lf4-mouse-active');
            mouseTarget = null;
        }

        return true;
    }

    function scheduleTune() {
        clearTimeout(tuneTimer);
        tuneTimer = setTimeout(tunePanel, 30);
    }

    function observePanel() {
        var found = document.getElementById('lf-panel');
        var foundBody;

        if (!found) return false;

        foundBody = found.querySelector('.lf-body');
        if (!foundBody) return false;

        if (observedBody === foundBody && observer) {
            scheduleTune();
            return true;
        }

        if (observer) observer.disconnect();

        observedBody = foundBody;
        observer = new MutationObserver(function () {
            scheduleTune();
        });

        observer.observe(foundBody, {
            childList: true,
            subtree: true
        });

        scheduleTune();
        return true;
    }

    function startGuard() {
        clearInterval(intervalTimer);

        intervalTimer = setInterval(function () {
            patchController();
            observePanel();
            tunePanel();
        }, 250);
    }

    function waitForCore() {
        clearInterval(waitTimer);
        waitCount = 0;

        waitTimer = setInterval(function () {
            waitCount++;
            patchController();

            if (observePanel()) {
                clearInterval(waitTimer);
                waitTimer = null;
                startGuard();
                console.log('LF4', 'stability/reset update v' + VERSION + ' active');
                return;
            }

            if (waitCount > 100) {
                clearInterval(waitTimer);
                waitTimer = null;

                if (Lampa.Noty && Lampa.Noty.show) {
                    Lampa.Noty.show('LF4: панель LF не найдена. Отключите старые фильтры.');
                }
            }
        }, 125);
    }

    function startPatch() {
        bindMouse();
        patchController();
        waitForCore();
    }

    function loadCore() {
        if (window.lf3_compact_scroll_plugin) {
            startPatch();
            return;
        }

        if (
            window.lf_card_filter_plugin ||
            window.lf2_layout_plugin ||
            window.lampac_src_filter_plugin ||
            window.lampac_src_filter_sticky_plugin ||
            window.lampac_persistent_sidebar_plugin ||
            window.lampac_card_swap_shell
        ) {
            if (Lampa.Noty && Lampa.Noty.show) {
                Lampa.Noty.show('LF4: отключите LF/LF2/LF3 и старые Lampac-фильтры.');
            }
            return;
        }

        Lampa.Utils.putScriptAsync([CORE_URL], function () {
            setTimeout(startPatch, 120);
        });
    }

    function start() {
        loadCore();
    }

    if (window.appready) {
        start();
    } else {
        Lampa.Listener.follow('app', function (event) {
            if (event.type === 'ready') start();
        });
    }
})();
