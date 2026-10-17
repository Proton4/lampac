/*
 * Mirrored for Proton4/lampac.
 * Upstream: https://github.com/ipavlin98/lmp-plugins/blob/main/season-fix.js
 * Adapted: preserves Lampa's native season splitting, adds TVmaze fallback and user-selected mini-season sizes.
 */
(function () {
	"use strict";

	function cloneEpisode(episode) {
		var copy = {};

		Object.keys(episode).forEach(function (key) {
			copy[key] = episode[key];
		});

		return copy;
	}

	function isInteger(value, min) {
		return (
			typeof value === "number" &&
			isFinite(value) &&
			value >= min &&
			Math.floor(value) === value
		);
	}

	var SEASON_FIX = {
		id: "season_fix",
		version: "4.1",
		settingsReady: false,

		cache: {},
		pending: {},
		currentTvId: null,
		hooked: false,

		splitExistingSeasons: function (episodes) {
			var seasons = {};

			for (var i = 0; i < episodes.length; i++) {
				var episode = episodes[i];

				if (!episode || !isInteger(episode.season_number, 0)) {
					return null;
				}

				var season = episode.season_number;

				if (!seasons[season]) {
					seasons[season] = [];
				}

				seasons[season].push(cloneEpisode(episode));
			}

			Object.keys(seasons).forEach(function (season) {
				seasons[season].sort(function (a, b) {
					return (a.episode_number || 0) - (b.episode_number || 0);
				});
			});

			return seasons;
		},

		buildSeasonMap: function (videos) {
			if (!Array.isArray(videos)) {
				return null;
			}

			var seasons = {};

			for (var i = 0; i < videos.length; i++) {
				var video = videos[i];

				if (!video) {
					continue;
				}

				var season = Number(video.season);

				if (season === 0) {
					continue;
				}

				var episode = Number(
					video.episode == null ? video.number : video.episode
				);

				if (!isInteger(season, 1) || !isInteger(episode, 1)) {
					return null;
				}

				if (!seasons[season]) {
					seasons[season] = {};
				}

				seasons[season][episode] = true;
			}

			var seasonNumbers = Object.keys(seasons)
				.map(Number)
				.sort(function (a, b) {
					return a - b;
				});

			if (!seasonNumbers.length) {
				return null;
			}

			var map = {};

			for (var s = 0; s < seasonNumbers.length; s++) {
				var seasonNumber = seasonNumbers[s];

				if (seasonNumber !== s + 1) {
					return null;
				}

				var episodeNumbers = Object.keys(seasons[seasonNumber])
					.map(Number)
					.sort(function (a, b) {
						return a - b;
					});

				for (var e = 0; e < episodeNumbers.length; e++) {
					if (episodeNumbers[e] !== e + 1) {
						return null;
					}
				}

				map[seasonNumber] = episodeNumbers.length;
			}

			return map;
		},

		splitByMap: function (episodes, map) {
			var sorted = episodes.slice().sort(function (a, b) {
				return (a.episode_number || 0) - (b.episode_number || 0);
			});

			var total = Object.keys(map).reduce(function (sum, season) {
				return sum + map[season];
			}, 0);

			if (sorted.length > total) {
				return null;
			}

			var result = {};
			var season = 1;
			var number = 0;

			for (var i = 0; i < sorted.length; i++) {
				var episode = sorted[i];

				if (
					!episode ||
					episode.season_number !== 1 ||
					episode.episode_number !== i + 1
				) {
					return null;
				}

				if (number === map[season]) {
					season++;
					number = 0;
				}

				if (!map[season]) {
					return null;
				}

				var copy = cloneEpisode(episode);

				copy.season_number = season;
				copy.episode_number = ++number;

				if (!result[season]) {
					result[season] = [];
				}

				result[season].push(copy);
			}

			return result;
		},

		request: function (url, method, callback) {
			var done = false;
			var network;
			var timer;

			function finish(data, error) {
				if (done) {
					return;
				}

				done = true;

				clearTimeout(timer);

				if (network) {
					network.clear();
				}

				callback(data, error);
			}

			timer = setTimeout(function () {
				finish(null, true);
			}, 8500);

			try {
				network = new Lampa.Reguest();
				network.timeout(8000);

				network[method](
					url,
					function (data) {
						if (typeof data === "string") {
							try {
								data = JSON.parse(data);
							} catch (e) {
								finish(null, true);
								return;
							}
						}

						finish(data, !data);
					},
					function () {
						finish(null, true);
					}
				);
			} catch (e) {
				finish(null, true);
			}
		},

		loadSeasonMap: function (tvId, callback) {
			var _this = this;
			var cached = this.cache[tvId];

			var ttl = cached && cached.map
				? 21600000
				: 60000;

			if (cached && Date.now() - cached.time < ttl) {
				if (callback) {
					callback(cached);
				}

				return;
			}

			if (this.pending[tvId]) {
				if (callback) {
					this.pending[tvId].push(callback);
				}

				return;
			}

			this.pending[tvId] = callback
				? [callback]
				: [];

			function finish(map) {
				var entry = {
					time: Date.now(),
					map: map || null
				};

				var waiting = _this.pending[tvId] || [];

				_this.cache[tvId] = entry;
				delete _this.pending[tvId];

				waiting.forEach(function (ready) {
					try {
						ready(entry);
					} catch (e) {}
				});
			}

			if (
				!Lampa.TMDB ||
				!Lampa.TMDB.api ||
				!Lampa.TMDB.key
			) {
				finish(null);
				return;
			}

			var externalIdsUrl = Lampa.TMDB.api(
				"tv/" +
					tvId +
					"/external_ids?api_key=" +
					encodeURIComponent(Lampa.TMDB.key())
			);

			this.request(
				externalIdsUrl,
				"silent",
				function (ids, error) {
					if (
						error ||
						!ids ||
						!/^tt\d+$/.test(ids.imdb_id || "")
					) {
						finish(null);
						return;
					}

					var imdbId = ids.imdb_id;

					var cinemetaUrl =
						"https://v3-cinemeta.strem.io/meta/series/" +
						imdbId +
						".json";

					_this.request(
						cinemetaUrl,
						"native",
						function (data, cinemetaError) {
							var meta = data && data.meta;

							if (
								cinemetaError ||
								!meta ||
								(meta.imdb_id || meta.id) !== imdbId
							) {
								_this.loadFromTVMaze(imdbId, finish);
                                return;
                            }

                            var cinemetaMap = _this.buildSeasonMap(meta.videos);
                            if (!cinemetaMap || Object.keys(cinemetaMap).length < 2) {
                                _this.loadFromTVMaze(imdbId, finish);
                                return;
                            }
                            finish(cinemetaMap);
						}
					);
				}
			);
		},

        loadFromTVMaze: function(imdbId, finish) {
            var that = this;
            this.request(
                "https://api.tvmaze.com/lookup/shows?imdb=" + encodeURIComponent(imdbId),
                "native",
                function(show, error) {
                    if (error || !show || !isInteger(Number(show.id), 1)) {
                        finish(null);
                        return;
                    }
                    that.request(
                        "https://api.tvmaze.com/shows/" + Number(show.id) + "/episodes",
                        "native",
                        function(data, error2) {
                            if (error2 || !Array.isArray(data)) {
                                finish(null);
                                return;
                            }
                            var videos = [];
                            for (var i = 0; i < data.length; i++) {
                                var ep = data[i];
                                if (!ep || !isInteger(Number(ep.season), 1) ||
                                    !isInteger(Number(ep.number), 1)) continue;
                                videos.push({season: ep.season, episode: ep.number});
                            }
                            var map = that.buildSeasonMap(videos);
                            finish(map && Object.keys(map).length > 1 ? map : null);
                        }
                    );
                }
            );
        },

        setupSettings: function() {
            if (this.settingsReady || !Lampa.SettingsApi) return;
            Lampa.SettingsApi.addComponent({
                component: "season_fix_v41", name: "Season Fix (подсезоны)", icon: ""
            });
            Lampa.SettingsApi.addParam({
                component: "season_fix_v41",
                param: {name: "season_fix_v41_size", type: "select",
                    values: {
                        "0": "Авто (Cinemeta, TVmaze или даты)",
                        "6": "По 6 серий", "8": "По 8 серий",
                        "10": "По 10 серий", "12": "По 12 серий",
                        "13": "По 13 серий", "16": "По 16 серий",
                        "24": "По 24 серии", "26": "По 26 серий"
                    },
                    "default": "0"
                },
                field: {name: "Разбивка первого сезона",
                    description: "Авто: внешние базы, затем штатное разделение Lampa; число: принудительно по N серий"}
            });
            this.settingsReady = true;
        },

		hookRequest: function (params) {
			if (
				!params ||
				params.season_fix_wrapped ||
				typeof params.complite !== "function"
			) {
				return;
			}

			var match = String(params.url || "").match(
				/\/tv\/(\d+)\/season\/(\d+)(?:\?|$)/
			);

			if (!match) {
				return;
			}

			params.season_fix_wrapped = true;

			var _this = this;
			var tvId = match[1];
			var requestedSeason = Number(match[2]);
			var complete = params.complite;

			if (requestedSeason === 1 && !Number(Lampa.Storage.get("season_fix_v41_size", "0"))) {
                this.loadSeasonMap(tvId);
            }

			params.complite = function (data) {
				var context = this;
				var args = arguments;

				if (
					!data ||
					!Array.isArray(data.episodes)
				) {
					return complete.apply(context, args);
				}

				function deliver() {
					var previousTvId = _this.currentTvId;

					_this.currentTvId = tvId;

					try {
						return complete.apply(context, args);
					} finally {
						_this.currentTvId = previousTvId;
					}
				}

				if (requestedSeason === 1 && !Number(Lampa.Storage.get("season_fix_v41_size", "0"))) {
					_this.loadSeasonMap(
						tvId,
						deliver
					);

					return;
				}

				return deliver();
			};
		},

		hook: function () {
			if (this.hooked) {
				return true;
			}

			if (
				typeof Lampa === "undefined" ||
				!Lampa.Utils ||
				typeof Lampa.Utils.splitEpisodesIntoSeasons !== "function" ||
				!Lampa.Listener ||
				!Lampa.Reguest
			) {
				return false;
			}

			var _this = this;
			var originalSplit =
				Lampa.Utils.splitEpisodesIntoSeasons;

			Lampa.Utils.splitEpisodesIntoSeasons =
				function (episodes) {
					if (
						!Array.isArray(episodes) ||
						!episodes.length
					) {
						return originalSplit.apply(
							this,
							arguments
						);
					}

					var seasons =
						_this.splitExistingSeasons(
							episodes
						);

					if (!seasons) {
						return originalSplit.apply(
							this,
							arguments
						);
					}

					var first = episodes[0] || {};

					var tvId =
						first.show_id ||
						first.series_id ||
						_this.currentTvId;

					var groupSize = Number(Lampa.Storage.get("season_fix_v41_size", "0"));
                    if (isInteger(groupSize, 1) && groupSize <= 100 && episodes.length > groupSize) {
                        var groups = {}, left = episodes.length, nextSeason = 1;
                        while (left > 0) {
                            groups[nextSeason++] = Math.min(groupSize, left);
                            left -= groupSize;
                        }
                        var manual = _this.splitByMap(episodes, groups);
                        if (manual) return manual;
                    }

                    var cached = tvId && _this.cache[tvId];

					var mapped =
						cached &&
						cached.map &&
						_this.splitByMap(
							episodes,
							cached.map
						);

					return mapped || originalSplit.apply(this, arguments);
				};

			Lampa.Listener.follow(
				"request_before",
				function (event) {
					if (event) {
						_this.hookRequest(
							event.params
						);
					}
				}
			);

			this.hooked = true;

			return true;
		},

		init: function () {
			var _this = this;

			function waitForLampa() {
                if (typeof Lampa !== "undefined") _this.setupSettings();
                if (!_this.hook()) {
					setTimeout(
						waitForLampa,
						500
					);
				}
			}

			waitForLampa();
		}
	};

	if (window.SEASON_FIX) {
		return;
	}

	window.SEASON_FIX_LOADED = true;
	window.SEASON_FIX = SEASON_FIX;

	SEASON_FIX.init();
})();
