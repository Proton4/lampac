/*
 * Lampac Source Filter + Auto Sticky Season
 * Based on Levende's lampac-src-filter.js.
 *
 * Crosswalk 5 / Chromium 34 compatible: ES5 syntax only.
 *
 * Extra features:
 * - automatically remembers the last explicitly selected season per title;
 * - carries that season to another Lampac source (balancer);
 * - reopens the filter after a season or source change;
 * - immediately opens the source list, minimizing clicks while comparing sources.
 */
(function () {
    'use strict';

    var FLAG = 'lampac_src_filter_sticky_plugin';

    /*
     * Keep the original key for backward compatibility with the first
     * test build that used manual "pin season".
     */
    var SEASON_STORAGE = 'lampac_src_filter_pinned_seasons';

    var sourceSwitchArmed = null;
    var seasonSelectArmed = null;
    var reopenTimer = null;
    var autoOpening = false;
    var autoOpenSources = false;
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

    function seasonMovieKey(active) {
        if (!active || !active.movie) return '';

        var movie = active.movie;
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

    function objectValue(name) {
        var value = Lampa.Storage.get(name, {});

        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return {};
        }

        return value;
    }

    function seasonMap() {
        return objectValue(SEASON_STORAGE);
    }

    function getRememberedSeason(active) {
        var key = seasonMovieKey(active);
        var all = seasonMap();

        return key && all[key] ? all[key] : null;
    }

    function setRememberedSeason(active, season) {
        var key = seasonMovieKey(active);
        if (!key) return;

        var all = seasonMap();
        all[key] = season;
        Lampa.Storage.set(SEASON_STORAGE, all);
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

    function selectedSeasonIndex(active, balancer) {
        var choice = choiceFor(active, balancer);
        var index = parseInt(choice.season, 10);

        return isNaN(index) || index < 0 ? 0 : index;
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

    function applySeasonToBalancer(active, balancer, season) {
        var id = choiceMovieId(active);

        if (
            !id ||
            !balancer ||
            !season ||
            typeof season.index === 'undefined'
        ) {
            return;
        }

        var storageName = 'online_choice_' + balancer;
        var data = objectValue(storageName);
        var choice = data[id];

        if (!choice || typeof choice !== 'object' || Array.isArray(choice)) {
            choice = {};
        }

        choice.season = parseInt(season.index, 10) || 0;
        data[id] = choice;

        internalStorageWrite = true;
        Lampa.Storage.set(storageName, data, true);
        internalStorageWrite = false;
    }

    function armSourceSwitch(active) {
        sourceSwitchArmed = {
            movie: seasonMovieKey(active),
            expires: Date.now() + 30000
        };
    }

    function armSeasonSelection(active) {
        var balancer = currentBalancer();

        seasonSelectArmed = {
            movie: seasonMovieKey(active),
            balancer: balancer,
            before: selectedSeasonIndex(active, balancer),
            expires: Date.now() + 30000
        };
    }

    function isValidArm(arm, active) {
        return !!(
            arm &&
            arm.movie === seasonMovieKey(active) &&
            arm.expires > Date.now()
        );
    }

    function scheduleFilterReopen(expectedMovie, openSources) {
        var attempts = 0;

        if (reopenTimer) clearInterval(reopenTimer);

        reopenTimer = setInterval(function () {
            attempts++;

            var active = activeActivity();

            if (
                attempts > 80 ||
                !active ||
                seasonMovieKey(active) !== expectedMovie
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

                if (
                    !nowActive ||
                    seasonMovieKey(nowActive) !== expectedMovie
                ) {
                    return;
                }

                autoOpening = true;
                autoOpenSources = !!openSources;

                activityRoot(nowActive)
                    .find('.torrent-filter .filter--filter')
                    .first()
                    .trigger('hover:enter');

                /*
                 * Safety reset in case this Lampa build does not emit
                 * Controller "toggle/select" for some reason.
                 */
                setTimeout(function () {
                    autoOpening = false;
                    autoOpenSources = false;
                }, 1500);
            }, 150);
        }, 150);
    }

    function rememberExplicitSeason(event) {
        var active = activeActivity();

        if (!isLampacActivity(active) || !isValidArm(seasonSelectArmed, active)) {
            return;
        }

        var balancer = currentBalancer();

        if (
            !balancer ||
            seasonSelectArmed.balancer !== balancer ||
            event.name !== 'online_choice_' + balancer
        ) {
            return;
        }

        var data = event.value;
        var id = choiceMovieId(active);
        var choice = data && id ? data[id] : null;
        var seasonIndex = choice ? parseInt(choice.season, 10) : NaN;

        if (isNaN(seasonIndex) || seasonIndex < 0) return;

        /*
         * Ignore storage writes caused by opening/closing other filter rows.
         * Only a real change from the season that was active when the season
         * row was opened is considered an explicit season choice.
         */
        if (seasonIndex === seasonSelectArmed.before) return;

        var movieKey = seasonSelectArmed.movie;
        seasonSelectArmed = null;

        setRememberedSeason(active, {
            index: seasonIndex,
            number: seasonIndex + 1,
            label:
                Lampa.Lang.translate('torrent_serial_season') +
                ' ' +
                (seasonIndex + 1)
        });

        /*
         * Lampac reloads the episode list after season selection. Reopen the
         * filter when the new list is ready and immediately show sources.
         */
        scheduleFilterReopen(movieKey, true);
    }

    function followStorage() {
        if (!Lampa.Storage || !Lampa.Storage.listener) return;

        Lampa.Storage.listener.follow('change', function (event) {
            if (internalStorageWrite || !event || !event.name) return;

            var active = activeActivity();
            if (!isLampacActivity(active)) return;

            if (event.name === 'online_balanser') {
                var remembered = getRememberedSeason(active);
                var targetBalancer = String(event.value || '');

                if (remembered) {
                    applySeasonToBalancer(active, targetBalancer, remembered);
                }

                if (isValidArm(sourceSwitchArmed, active)) {
                    var movieKey = sourceSwitchArmed.movie;
                    sourceSwitchArmed = null;

                    /*
                     * After changing source, Lampac rebuilds the activity.
                     * Reopen directly into the source list, so the next source
                     * takes only one click.
                     */
                    scheduleFilterReopen(movieKey, true);
                }

                return;
            }

            if (event.name === 'active_balanser') {
                var activeSeason = getRememberedSeason(active);

                if (activeSeason) {
                    applySeasonToBalancer(
                        active,
                        String(event.value || ''),
                        activeSeason
                    );
                }

                return;
            }

            if (event.name.indexOf('online_choice_') === 0) {
                rememberExplicitSeason(event);
            }
        });
    }

    function finishFilterOpen(active, selectbox, listBody, sourceItem) {
        Lampa.Controller.collectionSet(listBody);

        Lampa.Controller.collectionFocus(
            autoOpening && sourceItem.length
                ? sourceItem
                : selectbox.find('.selectbox-item').first()
        );

        var openSourcesNow = autoOpenSources && sourceItem.length;

        autoOpening = false;
        autoOpenSources = false;

        if (openSourcesNow) {
            setTimeout(function () {
                var nowActive = activeActivity();

                if (
                    !nowActive ||
                    seasonMovieKey(nowActive) !== seasonMovieKey(active) ||
                    !sourceItem.closest('body').length
                ) {
                    return;
                }

                sourceItem.trigger('hover:enter');
            }, 120);
        }
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
            ) {
                return;
            }

            /*
             * Avoid duplicate augmentation if a particular Lampa build emits
             * the same toggle event more than once for one selectbox.
             */
            if (selectbox.find('.lampac-sticky-source').length) return;

            var root = activityRoot(active);
            var sourceButton = root.find(
                '.simple-button--filter.filter--sort'
            );

            if (
                sourceButton.length !== 1 ||
                sourceButton.hasClass('hide')
            ) {
                return;
            }

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
                finishFilterOpen(active, selectbox, listBody, sourceItem);
                return;
            }

            /*
             * The season becomes "sticky" automatically only after the user
             * explicitly opens the Season row and chooses a different season.
             */
            var seasonRow = findSeasonRow();

            if (seasonRow.length) {
                seasonRow.on('hover:enter', function () {
                    armSeasonSelection(active);
                });
            }

            active.invertedTv = !!active.invertedTv;

            var invertItem = Lampa.Template.get('selectbox_item', {
                title: Lampa.Lang.translate('change_filter_series_order'),
                subtitle: active.invertedTv
                    ? Lampa.Lang.translate('order_invert')
                    : Lampa.Lang.translate('order_standard')
            }).addClass('lampac-sticky-invert');

            invertItem.on('hover:enter', function () {
                var seriesElements = root.find(
                    '.online-prestige.online-prestige--full'
                );

                seriesElements
                    .parent()
                    .append(seriesElements.get().reverse());

                active.invertedTv = !active.invertedTv;

                invertItem
                    .find('.selectbox-item__subtitle')
                    .text(
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

                Lampa.Input.edit(
                    {
                        free: true,
                        title: Lampa.Lang.translate('find_episode'),
                        nosave: true,
                        value: '',
                        layout: 'nums',
                        keyboard: 'lampa'
                    },
                    function (episode) {
                        Lampa.Controller.toggle('content');

                        var targetEpisode = root
                            .find('.online-prestige--full')
                            .filter(function () {
                                var number = parseInt(
                                    $(this)
                                        .find(
                                            '.online-prestige__episode-number'
                                        )
                                        .text()
                                        .trim(),
                                    10
                                );

                                return number === parseInt(episode, 10);
                            });

                        if (targetEpisode.length) {
                            Lampa.Controller.collectionFocus(
                                targetEpisode,
                                active.activity.body
                            );
                        }
                    }
                );
            });

            listBody.append(invertItem);
            listBody.append(findEpisodeItem);

            finishFilterOpen(active, selectbox, listBody, sourceItem);
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