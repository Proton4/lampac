/*
 * Lampac Source Filter + Sticky Season
 * Based on Levende's lampac-src-filter.js.
 *
 * Crosswalk 5 / Chromium 34 compatible: ES5 syntax only.
 *
 * Extra features:
 * - pin the currently selected season for a movie/series;
 * - carry that season to another Lampac source (balancer);
 * - reopen the expanded filter after a source switch;
 * - focus the source row after automatic reopening.
 */
(function () {
    'use strict';

    var FLAG = 'lampac_src_filter_sticky_plugin';
    var PIN_STORAGE = 'lampac_src_filter_pinned_seasons';
    var sourceSwitchArmed = null;
    var reopenTimer = null;
    var autoOpening = false;
    var internalStorageWrite = false;

    function activeActivity() {
        try {
            return Lampa.Activity.active();
        } catch (e) {
            return null;
        }
    }

    function isLampacActivity(active) {
        if (!active || !active.movie || !active.search || !active.search_one || !active.search_two) {
            return false;
        }

        var componentName = String(active.component || '').toLowerCase();

        return componentName.indexOf('mod') === -1 && componentName !== 'torrents';
    }

    function activityRoot(active) {
        if (active && active.activity && active.activity.body) {
            return $(active.activity.body);
        }

        return $('body');
    }

    function choiceMovieId(active) {
        if (!active || !active.movie || typeof active.movie.id === 'undefined' || active.movie.id === null) {
            return '';
        }

        return String(active.movie.id);
    }

    function pinMovieKey(active) {
        if (!active || !active.movie) return '';

        var movie = active.movie;
        var id = movie.tmdb_id || movie.id;

        if (!id) {
            id = Lampa.Utils.hash(movie.original_name || movie.original_title || movie.name || movie.title || '');
        }

        return String(movie.source || 'tmdb') + ':' + String(id);
    }

    function objectValue(name) {
        var value = Lampa.Storage.get(name, {});

        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return {};
        }

        return value;
    }

    function pinMap() {
        return objectValue(PIN_STORAGE);
    }

    function getPin(active) {
        var key = pinMovieKey(active);
        var all = pinMap();

        return key && all[key] ? all[key] : null;
    }

    function setPin(active, pin) {
        var key = pinMovieKey(active);
        if (!key) return;

        var all = pinMap();
        all[key] = pin;
        Lampa.Storage.set(PIN_STORAGE, all);
    }

    function clearPin(active) {
        var key = pinMovieKey(active);
        if (!key) return;

        var all = pinMap();
        delete all[key];
        Lampa.Storage.set(PIN_STORAGE, all);
    }

    function currentBalancer() {
        return String(
            Lampa.Storage.get('active_balanser', '') ||
            Lampa.Storage.get('online_balanser', '') ||
            ''
        );
    }

    function choiceFor(active, balancer) {
        var id = choiceMovieId(active);
        if (!id || !balancer) return {};

        var data = objectValue('online_choice_' + balancer);
        var choice = data[id];

        return choice && typeof choice === 'object' && !Array.isArray(choice) ? choice : {};
    }

    function findSeasonRow() {
        var result = $();
        var title = Lampa.Lang.translate('torrent_serial_season');

        $('body > .selectbox .selectbox-item').each(function () {
            var item = $(this);
            var itemTitle = item.find('.selectbox-item__title').text().trim();

            if (itemTitle === title) {
                result = item;
                return false;
            }
        });

        return result;
    }

    function currentSeason(active) {
        var choice = choiceFor(active, currentBalancer());
        var index = parseInt(choice.season, 10);

        if (isNaN(index) || index < 0) index = 0;

        var row = findSeasonRow();
        var label = row.length ? row.find('.selectbox-item__subtitle').text().trim() : '';
        var numberMatch = label.match(/\d+/);
        var number = numberMatch ? parseInt(numberMatch[0], 10) : index + 1;

        if (!label) {
            label = Lampa.Lang.translate('torrent_serial_season') + ' ' + number;
        }

        return {
            index: index,
            number: number,
            label: label
        };
    }

    function applyPinToBalancer(active, balancer, pin) {
        var id = choiceMovieId(active);

        if (!id || !balancer || !pin || typeof pin.index === 'undefined') return;

        var storageName = 'online_choice_' + balancer;
        var data = objectValue(storageName);
        var choice = data[id];

        if (!choice || typeof choice !== 'object' || Array.isArray(choice)) {
            choice = {};
        }

        choice.season = parseInt(pin.index, 10) || 0;
        data[id] = choice;

        internalStorageWrite = true;
        Lampa.Storage.set(storageName, data, true);
        internalStorageWrite = false;
    }

    function pinSubtitle(active) {
        var pin = getPin(active);

        if (!pin) return Lampa.Lang.translate('sticky_season_not_pinned');

        return Lampa.Lang.translate('sticky_season_pinned') + ': ' + pin.label;
    }

    function notify(message) {
        if (Lampa.Noty && typeof Lampa.Noty.show === 'function') {
            Lampa.Noty.show(message);
        }
    }

    function armSourceSwitch(active) {
        sourceSwitchArmed = {
            movie: pinMovieKey(active),
            expires: Date.now() + 30000
        };
    }

    function scheduleFilterReopen(expectedMovie) {
        var attempts = 0;

        if (reopenTimer) clearInterval(reopenTimer);

        reopenTimer = setInterval(function () {
            attempts++;

            var active = activeActivity();

            if (
                attempts > 80 ||
                !active ||
                pinMovieKey(active) !== expectedMovie
            ) {
                clearInterval(reopenTimer);
                reopenTimer = null;
                return;
            }

            if ($('body > .selectbox').length) return;

            var root = activityRoot(active);
            var button = root.find('.torrent-filter .filter--filter').first();
            var contentReady =
                root.find('.online-prestige.online-prestige--full').length ||
                root.find('.online-prestige-watched').length ||
                root.find('.empty').length;

            if (!button.length || !contentReady) return;

            clearInterval(reopenTimer);
            reopenTimer = null;

            setTimeout(function () {
                var nowActive = activeActivity();

                if (!nowActive || pinMovieKey(nowActive) !== expectedMovie) return;

                autoOpening = true;
                activityRoot(nowActive).find('.torrent-filter .filter--filter').first().trigger('hover:enter');

                setTimeout(function () {
                    autoOpening = false;
                }, 1000);
            }, 150);
        }, 150);
    }

    function updatePinnedSeasonFromChoice(event) {
        var active = activeActivity();
        var pin = getPin(active);

        if (!pin || !isLampacActivity(active)) return;

        var balancer = currentBalancer();
        if (!balancer || event.name !== 'online_choice_' + balancer) return;

        var data = event.value;
        var id = choiceMovieId(active);
        var choice = data && id ? data[id] : null;
        var season = choice ? parseInt(choice.season, 10) : NaN;

        if (isNaN(season) || season < 0 || season === parseInt(pin.index, 10)) return;

        setPin(active, {
            index: season,
            number: season + 1,
            label: Lampa.Lang.translate('torrent_serial_season') + ' ' + (season + 1)
        });
    }

    function followStorage() {
        if (!Lampa.Storage || !Lampa.Storage.listener) return;

        Lampa.Storage.listener.follow('change', function (event) {
            if (internalStorageWrite || !event || !event.name) return;

            var active = activeActivity();
            if (!isLampacActivity(active)) return;

            if (event.name === 'online_balanser') {
                var pin = getPin(active);
                var targetBalancer = String(event.value || '');

                if (pin) applyPinToBalancer(active, targetBalancer, pin);

                if (
                    sourceSwitchArmed &&
                    sourceSwitchArmed.movie === pinMovieKey(active) &&
                    sourceSwitchArmed.expires > Date.now()
                ) {
                    var movieKey = sourceSwitchArmed.movie;
                    sourceSwitchArmed = null;
                    scheduleFilterReopen(movieKey);
                }

                return;
            }

            if (event.name === 'active_balanser') {
                var activePin = getPin(active);
                if (activePin) applyPinToBalancer(active, String(event.value || ''), activePin);
                return;
            }

            if (event.name.indexOf('online_choice_') === 0) {
                updatePinnedSeasonFromChoice(event);
            }
        });
    }

    function start() {
        if (window[FLAG] || window.lampac_src_filter_plugin) return;
        window[FLAG] = true;
        window.lampac_src_filter_plugin = true;

        Lampa.Lang.add({
            change_filter_series_order: {
                uk: 'Змінити порядок серій',
                en: 'Change series order',
                ru: 'Изменить порядок серий'
            },
            order_standard: {
                uk: 'Стандартно',
                en: 'Standard',
                ru: 'Стандартно'
            },
            order_invert: {
                uk: 'Інвертовано',
                en: 'Inverted',
                ru: 'Инвертировано'
            },
            find_episode: {
                uk: 'Знайти серію',
                en: 'Find episode',
                ru: 'Найти серию'
            },
            find_episode_subtitle: {
                uk: 'Пошук серії за номером',
                en: 'Search episode by number',
                ru: 'Поиск серии по номеру'
            },
            sticky_season_title: {
                uk: 'Закріпити сезон',
                en: 'Pin season',
                ru: 'Закрепить сезон'
            },
            sticky_season_not_pinned: {
                uk: 'Не закріплено',
                en: 'Not pinned',
                ru: 'Не закреплён'
            },
            sticky_season_pinned: {
                uk: 'Закріплено',
                en: 'Pinned',
                ru: 'Закреплён'
            },
            sticky_season_enabled: {
                uk: 'Сезон закріплено: ',
                en: 'Season pinned: ',
                ru: 'Сезон закреплён: '
            },
            sticky_season_disabled: {
                uk: 'Закріплення сезону вимкнено',
                en: 'Season pin disabled',
                ru: 'Закрепление сезона выключено'
            }
        });

        followStorage();

        Lampa.Controller.listener.follow('toggle', function (event) {
            if (event.name !== 'select') return;

            var active = activeActivity();
            if (!isLampacActivity(active)) return;

            var selectbox = $('body > .selectbox');
            var filterTitle = selectbox.find('.selectbox__title');

            if (
                filterTitle.length !== 1 ||
                filterTitle.text() !== Lampa.Lang.translate('title_filter')
            ) return;

            var root = activityRoot(active);
            var sourceButton = root.find('.simple-button--filter.filter--sort');

            if (sourceButton.length !== 1 || sourceButton.hasClass('hide')) return;

            var listBody = selectbox.find('.scroll__body');
            var sourceItem = Lampa.Template.get('selectbox_item', {
                title: Lampa.Lang.translate('settings_rest_source'),
                subtitle: sourceButton.find('div').text()
            }).addClass('lampac-sticky-source');

            sourceItem.on('hover:enter', function () {
                armSourceSwitch(active);
                sourceButton.trigger('hover:enter');
            });

            var selectOptions = selectbox.find('.selectbox-item');

            if (selectOptions.length > 0) {
                selectOptions.first().after(sourceItem);
            } else {
                listBody.prepend(sourceItem);
            }

            if (!active.movie.first_air_date) {
                Lampa.Controller.collectionSet(listBody);
                Lampa.Controller.collectionFocus(autoOpening ? sourceItem : selectbox.find('.selectbox-item').first());
                autoOpening = false;
                return;
            }

            var seasonRow = findSeasonRow();
            var pinItem = $();

            if (seasonRow.length) {
                pinItem = Lampa.Template.get('selectbox_item', {
                    title: Lampa.Lang.translate('sticky_season_title'),
                    subtitle: pinSubtitle(active)
                }).addClass('lampac-sticky-season');

                pinItem.on('hover:enter', function () {
                    var existing = getPin(active);

                    if (existing) {
                        clearPin(active);
                        pinItem.find('.selectbox-item__subtitle').text(
                            Lampa.Lang.translate('sticky_season_not_pinned')
                        );
                        notify(Lampa.Lang.translate('sticky_season_disabled'));
                    } else {
                        var season = currentSeason(active);
                        setPin(active, season);
                        applyPinToBalancer(active, currentBalancer(), season);
                        pinItem.find('.selectbox-item__subtitle').text(
                            Lampa.Lang.translate('sticky_season_pinned') + ': ' + season.label
                        );
                        notify(Lampa.Lang.translate('sticky_season_enabled') + season.label);
                    }
                });

                sourceItem.after(pinItem);
            }

            active.invertedTv = !!active.invertedTv;

            var invertItem = Lampa.Template.get('selectbox_item', {
                title: Lampa.Lang.translate('change_filter_series_order'),
                subtitle: active.invertedTv
                    ? Lampa.Lang.translate('order_invert')
                    : Lampa.Lang.translate('order_standard')
            }).addClass('lampac-sticky-invert');

            invertItem.on('hover:enter', function () {
                var seriesElements = root.find('.online-prestige.online-prestige--full');
                seriesElements.parent().append(seriesElements.get().reverse());

                active.invertedTv = !active.invertedTv;

                invertItem.find('.selectbox-item__subtitle').text(
                    active.invertedTv
                        ? Lampa.Lang.translate('order_invert')
                        : Lampa.Lang.translate('order_standard')
                );
            });

            var findEpisodeItem = Lampa.Template.get('selectbox_item', {
                title: Lampa.Lang.translate('find_episode'),
                subtitle: Lampa.Lang.translate('find_episode_subtitle')
            }).addClass('lampac-sticky-find-episode');

            findEpisodeItem.on('hover:enter', function () {
                Lampa.Controller.toggle('content');

                Lampa.Input.edit({
                    free: true,
                    title: Lampa.Lang.translate('find_episode'),
                    nosave: true,
                    value: '',
                    layout: 'nums',
                    keyboard: 'lampa'
                }, function (episode) {
                    Lampa.Controller.toggle('content');

                    var targetEpisode = root.find('.online-prestige--full').filter(function () {
                        var number = parseInt(
                            $(this).find('.online-prestige__episode-number').text().trim(),
                            10
                        );

                        return number === parseInt(episode, 10);
                    });

                    if (targetEpisode.length) {
                        Lampa.Controller.collectionFocus(targetEpisode, active.activity.body);
                    }
                });
            });

            listBody.append(invertItem);
            listBody.append(findEpisodeItem);

            Lampa.Controller.collectionSet(listBody);
            Lampa.Controller.collectionFocus(
                autoOpening && sourceItem.length
                    ? sourceItem
                    : selectbox.find('.selectbox-item').first()
            );

            autoOpening = false;
        });
    }

    if (window.appready) {
        start();
    } else {
        Lampa.Listener.follow('app', function (event) {
            if (event.type === 'ready') start();
        });
    }
})();
