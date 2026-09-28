(function () {
    'use strict';

    if (window.lme_diagnostics_plugin_ready) return;
    window.lme_diagnostics_plugin_ready = true;

    var PLUGIN_VERSION = '0.1.0';
    var COMPONENT = 'lme_diagnostics';
    var MENU_TITLE = 'LME Диагностика';
    var REQUEST_TIMEOUT = 12000;

    var SOURCES = [
        {
            name: 'Uaflix',
            page: 'https://uafix.net/films/nozhi-nagolo-3/',
            probe: ''
        },
        {
            name: 'AnimeON',
            page: 'https://animeon.club/anime/924-provodzhalnicya-friren',
            probe: 'https://animeon.club/api/player/47960/episode'
        },
        {
            name: 'Bamboo',
            page: 'https://bambooua.com/dorama/938-18_again.html',
            probe: ''
        },
        {
            name: 'Mikai',
            page: 'https://mikai.me/anime/1272-friren-shcho-provodzhaie-v-ostanniu-put',
            probe: 'https://api.mikai.me/v1/anime/1272'
        },
        {
            name: 'KlonFUN',
            page: 'https://klon.fun/filmy/3887-marsianyn-marsiianyn-rozshyrena-versiia.html',
            probe: ''
        }
    ];

    var PROVIDERS = ['Ashdi', 'Zetvideo', 'Moonanime', 'Tortuga', 'BambooPlayer', 'HdvbUA'];

    var LAMPAME_CONFIG = 'https://monitor.lme.isroot.in/api/status-page/lmeuk';
    var LAMPAME_HEARTBEAT = 'https://monitor.lme.isroot.in/api/status-page/heartbeat/lmeuk';

    var IP_SERVICES = [
        'https://ipwho.is/',
        'https://ipapi.co/json/'
    ];

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function unique(list) {
        var out = [];
        var seen = {};
        (list || []).forEach(function (item) {
            item = String(item || '');
            if (!item || seen[item]) return;
            seen[item] = true;
            out.push(item);
        });
        return out;
    }

    function safeJson(data) {
        if (data && typeof data === 'object') return data;
        try { return JSON.parse(String(data || '')); }
        catch (e) { return null; }
    }

    function errorCode(error) {
        if (!error) return 0;
        if (typeof error.status !== 'undefined') return parseInt(error.status, 10) || 0;
        if (typeof error.code !== 'undefined') return parseInt(error.code, 10) || 0;
        if (error.responseJSON && error.responseJSON.code) return parseInt(error.responseJSON.code, 10) || 0;
        return 0;
    }

    function errorText(error) {
        if (!error) return 'Network error';
        if (error.responseText) return String(error.responseText).slice(0, 180);
        if (error.message) return String(error.message).slice(0, 180);
        var code = errorCode(error);
        return code ? 'HTTP ' + code : 'Network error';
    }

    function providerFromUrl(url) {
        var value = String(url || '').toLowerCase();
        if (value.indexOf('ashdi.vip') >= 0) return 'Ashdi';
        if (value.indexOf('zetvideo.net') >= 0) return 'Zetvideo';
        if (value.indexOf('moonanime.art') >= 0) return 'Moonanime';
        if (value.indexOf('tortuga') >= 0) return 'Tortuga';
        if (value.indexOf('friends.bambooua.com') >= 0) return 'BambooPlayer';
        if (value.indexOf('hdvbua.pro') >= 0) return 'HdvbUA';
        return 'Unknown';
    }

    function normalizeHtml(html) {
        return String(html == null ? '' : html).replace(/\\\//g, '/');
    }

    function extractProviderUrls(html) {
        var text = normalizeHtml(html);
        var out = [];
        var re1 = /(?:https?:)?\/\/[^\s"'()<>,]*(?:ashdi\.vip|zetvideo\.net|moonanime\.art|tortuga|hdvbua\.pro)[^\s"'()<>,]*/ig;
        var re2 = /(?:ashdi\.vip|zetvideo\.net|moonanime\.art|tortuga|hdvbua\.pro)[^\s"'()<>,]*/ig;
        var match;

        while ((match = re1.exec(text)) !== null) {
            var u1 = match[0];
            if (u1.indexOf('//') === 0) u1 = 'https:' + u1;
            out.push(u1);
        }

        while ((match = re2.exec(text)) !== null) {
            var u2 = match[0];
            if (!/^https?:\/\//i.test(u2)) u2 = 'https://' + u2;
            out.push(u2);
        }

        return unique(out);
    }

    function extractStreamUrls(html) {
        var text = normalizeHtml(html);
        var out = [];
        var re = /(?:https?:)?\/\/[^\s"'()<>,]+?\.(?:m3u8|mp4)(?:\?[^\s"'()<>,]*)?/ig;
        var match;

        while ((match = re.exec(text)) !== null) {
            var url = match[0];
            if (url.indexOf('//') === 0) url = 'https:' + url;
            out.push(url);
        }

        return unique(out);
    }

    function reverseString(value) {
        return String(value || '').split('').reverse().join('');
    }

    function tryBase64(value) {
        try { return window.atob(value); }
        catch (e) { return ''; }
    }

    function extractFileValues(html) {
        var text = normalizeHtml(html).replace(/[\r\n]+/g, ' ');
        var out = [];
        var re = /file\s*:\s*["']([^"']+)["']/ig;
        var match;

        while ((match = re.exec(text)) !== null) {
            if (match[1]) out.push(match[1]);
        }

        return unique(out);
    }

    function extractStreamsFromPlayer(html) {
        var out = extractStreamUrls(html);

        extractFileValues(html).forEach(function (raw) {
            if (/^(?:https?:)?\/\//i.test(raw)) {
                if (raw.indexOf('//') === 0) raw = 'https:' + raw;
                out.push(raw);
                return;
            }

            if (!/^[A-Za-z0-9+/=]+$/.test(raw)) return;

            var decoded = tryBase64(raw);
            if (!decoded) return;

            var reversed = reverseString(decoded);
            [reversed, decoded].forEach(function (candidate) {
                if (/^(?:https?:)?\/\//i.test(candidate)) {
                    if (candidate.indexOf('//') === 0) candidate = 'https:' + candidate;
                    out.push(candidate);
                }
            });
        });

        return unique(out);
    }

    function addQuery(url, param) {
        return url + (url.indexOf('?') >= 0 ? '&' : '?') + param;
    }

    function providerCandidates(provider, url) {
        var out = [url];

        if (provider === 'Moonanime' && !/[?&]player=/i.test(url)) {
            out.push(addQuery(url, 'player=animeon.club'));
            out.push(addQuery(url, 'player=mikai.me'));
        }

        return unique(out);
    }

    function providerReferer(provider) {
        if (provider === 'Ashdi') return 'https://ashdi.vip/';
        if (provider === 'Zetvideo') return 'https://zetvideo.net/';
        if (provider === 'Moonanime') return 'https://animeon.club/';
        if (provider === 'Tortuga') return 'https://tortuga.tw/';
        if (provider === 'HdvbUA') return 'https://uaserials.fm/';
        return '';
    }

    function isUaflixGeoBlocked(html) {
        var text = String(html || '');
        return /geo.?block|бачите\s+тільки\s+трейлер|пройдіть\s+авторизацію|недоступн.{0,30}(країні|регіоні)|доступн.{0,40}(лише|тільки).{0,40}україн/i.test(text);
    }

    function DiagnosticsComponent(object) {
        var self = this;
        var scroll = new Lampa.Scroll({ mask: true, over: true, step: 220, end_ratio: 2 });
        var networkList = [];
        var html = $('<div class="lme-diag"></div>');
        var content = $('<div class="lme-diag__content"></div>');
        var last = null;
        var running = false;
        var runToken = 0;

        var rows = {};

        function newNetwork() {
            var net = new Lampa.Reguest();
            net.timeout(REQUEST_TIMEOUT);
            networkList.push(net);
            return net;
        }

        function nativeRequest(url, options) {
            options = options || {};

            return new Promise(function (resolve) {
                var net = newNetwork();
                var started = Date.now();
                var params = {
                    dataType: options.dataType || 'text',
                    timeout: options.timeout || REQUEST_TIMEOUT
                };

                if (options.headers) params.headers = options.headers;
                if (options.type) params.type = options.type;
                if (options.contentType) params.contentType = options.contentType;

                net['native'](
                    url,
                    function (data) {
                        resolve({
                            ok: true,
                            code: 200,
                            data: data,
                            ms: Date.now() - started,
                            url: url
                        });
                    },
                    function (err) {
                        resolve({
                            ok: false,
                            code: errorCode(err),
                            error: errorText(err),
                            data: '',
                            ms: Date.now() - started,
                            url: url
                        });
                    },
                    options.body || null,
                    params
                );
            });
        }

        function addSection(title, id) {
            var section = $(
                '<div class="lme-diag__section">' +
                    '<div class="lme-diag__section-title">' + escapeHtml(title) + '</div>' +
                    '<div class="lme-diag__rows" data-section="' + escapeHtml(id) + '"></div>' +
                '</div>'
            );
            content.append(section);
            return section.find('.lme-diag__rows');
        }

        function addRow(parent, key, label) {
            var row = $(
                '<div class="lme-diag__row selector" data-key="' + escapeHtml(key) + '">' +
                    '<div class="lme-diag__row-main">' +
                        '<div class="lme-diag__label">' + escapeHtml(label) + '</div>' +
                        '<div class="lme-diag__value">—</div>' +
                    '</div>' +
                    '<div class="lme-diag__detail"></div>' +
                '</div>'
            );

            row.on('hover:focus', function () {
                last = row[0];
                try { scroll.update(row, true); } catch (e) {}
            });

            parent.append(row);
            rows[key] = row;
            return row;
        }

        function setRow(key, state, value, detail) {
            var row = rows[key];
            if (!row || !row.length) return;

            row.removeClass('is-ok is-bad is-warn is-run is-muted');

            if (state === 'ok') row.addClass('is-ok');
            else if (state === 'bad') row.addClass('is-bad');
            else if (state === 'warn') row.addClass('is-warn');
            else if (state === 'run') row.addClass('is-run');
            else row.addClass('is-muted');

            row.find('.lme-diag__value').text(value == null ? '—' : String(value));
            row.find('.lme-diag__detail').text(detail == null ? '' : String(detail));
        }

        function resetRows() {
            Object.keys(rows).forEach(function (key) {
                if (key === 'device_platform' || key === 'device_lampa') return;
                setRow(key, 'run', 'Проверка…', '');
            });
        }

        function setSummary(state, text, detail) {
            setRow('summary', state, text, detail || '');
        }

        function buildUi() {
            var head = $(
                '<div class="lme-diag__hero">' +
                    '<div class="lme-diag__hero-title">LME Diagnostics</div>' +
                    '<div class="lme-diag__hero-sub">Проверка именно с этого устройства</div>' +
                '</div>'
            );
            content.append(head);

            var summary = addSection('Итог', 'summary');
            addRow(summary, 'summary', 'Состояние');

            var device = addSection('Устройство / Интернет', 'device');
            addRow(device, 'device_platform', 'HTTP режим');
            addRow(device, 'device_lampa', 'Lampa');
            addRow(device, 'ip', 'Публичный IP');
            addRow(device, 'country', 'Страна');
            addRow(device, 'isp', 'Провайдер');

            var server = addSection('LampaME — серверная инфраструктура', 'server');
            addRow(server, 'srv_Bandera', 'Bandera');
            addRow(server, 'srv_Makhno API', 'Makhno API');
            addRow(server, 'srv_Makhno Base', 'Makhno Base');
            addRow(server, 'srv_Service', 'Notifications Service');
            addRow(server, 'srv_Cache', 'Cache');
            addRow(server, 'srv_Proxy', 'Proxy');

            var sources = addSection('Источники — проверка с устройства', 'sources');
            SOURCES.forEach(function (source) {
                addRow(sources, 'src_' + source.name, source.name);
            });

            var players = addSection('Плееры / стримы — проверка с устройства', 'players');
            PROVIDERS.forEach(function (provider) {
                addRow(players, 'pl_' + provider, provider);
            });

            var actions = $('<div class="lme-diag__actions"></div>');
            var refresh = $(
                '<div class="lme-diag__button selector">' +
                    '<span class="lme-diag__button-icon">↻</span>' +
                    '<span>Проверить заново</span>' +
                '</div>'
            );

            refresh.on('hover:focus', function () {
                last = refresh[0];
                try { scroll.update(refresh, true); } catch (e) {}
            });

            refresh.on('hover:enter', function () {
                runAll();
            });

            actions.append(refresh);
            content.append(actions);

            setRow(
                'device_platform',
                Lampa.Platform.is('android') ? 'ok' : 'warn',
                Lampa.Platform.is('android') ? 'Android native HTTP' : 'XHR / platform HTTP',
                Lampa.Platform.is('android')
                    ? 'Lampa.Reguest.native → AndroidJS.httpReq'
                    : 'На не-Android платформах внешние сайты могут ограничиваться CORS'
            );

            setRow(
                'device_lampa',
                'ok',
                (Lampa.Manifest.app_version || 'unknown'),
                'Diagnostics plugin v' + PLUGIN_VERSION
            );
        }

        function checkPublicIp(token) {
            function tryService(index) {
                if (token !== runToken) return Promise.resolve(false);
                if (index >= IP_SERVICES.length) {
                    setRow('ip', 'bad', 'Недоступно', 'Не удалось определить внешний IP');
                    setRow('country', 'bad', 'Недоступно', '');
                    setRow('isp', 'bad', 'Недоступно', '');
                    return Promise.resolve(false);
                }

                return nativeRequest(IP_SERVICES[index], { dataType: 'text', timeout: 8000 })
                    .then(function (res) {
                        if (token !== runToken) return false;
                        if (!res.ok) return tryService(index + 1);

                        var data = safeJson(res.data);
                        if (!data || !data.ip) return tryService(index + 1);

                        var country = data.country || data.country_name || '';
                        var cc = data.country_code || '';
                        var region = data.region || '';
                        var city = data.city || '';
                        var isp = '';

                        if (data.connection) isp = data.connection.isp || data.connection.org || '';
                        if (!isp) isp = data.org || '';

                        setRow('ip', 'ok', data.ip, 'Ответ ' + res.ms + ' ms');
                        setRow(
                            'country',
                            'ok',
                            country + (cc ? ' (' + cc + ')' : ''),
                            [region, city].filter(Boolean).join(' / ')
                        );
                        setRow('isp', 'ok', isp || '—', IP_SERVICES[index].replace(/^https?:\/\//, '').split('/')[0]);
                        return true;
                    });
            }

            return tryService(0);
        }

        function checkLampaMeStatus(token) {
            return Promise.all([
                nativeRequest(LAMPAME_CONFIG, { dataType: 'text', timeout: 8000 }),
                nativeRequest(LAMPAME_HEARTBEAT, { dataType: 'text', timeout: 8000 })
            ]).then(function (responses) {
                if (token !== runToken) return false;

                var cfgRes = responses[0];
                var hbRes = responses[1];

                if (!cfgRes.ok || !hbRes.ok) {
                    ['Bandera', 'Makhno API', 'Makhno Base', 'Service', 'Cache', 'Proxy'].forEach(function (name) {
                        setRow('srv_' + name, 'bad', 'API недоступно', '');
                    });
                    return false;
                }

                var cfg = safeJson(cfgRes.data);
                var hb = safeJson(hbRes.data);

                if (!cfg || !cfg.publicGroupList || !hb || !hb.heartbeatList) {
                    ['Bandera', 'Makhno API', 'Makhno Base', 'Service', 'Cache', 'Proxy'].forEach(function (name) {
                        setRow('srv_' + name, 'bad', 'Ошибка данных', '');
                    });
                    return false;
                }

                var found = {};
                cfg.publicGroupList.forEach(function (group) {
                    (group.monitorList || []).forEach(function (monitor) {
                        var name = String(monitor.name || '');
                        found[name] = true;

                        var beats = hb.heartbeatList[String(monitor.id)] || [];
                        var latest = beats.length ? beats[beats.length - 1] : null;
                        var uptime = hb.uptimeList ? hb.uptimeList[String(monitor.id) + '_24'] : null;

                        if (!latest) {
                            setRow('srv_' + name, 'warn', 'Нет heartbeat', monitor.type || '');
                            return;
                        }

                        var status = parseInt(latest.status, 10);
                        var statusText = status === 1 ? 'UP' :
                                         status === 0 ? 'DOWN' :
                                         status === 2 ? 'PENDING' :
                                         status === 3 ? 'MAINTENANCE' : 'UNKNOWN';

                        var state = status === 1 ? 'ok' :
                                    status === 3 ? 'warn' : 'bad';

                        var bits = [];
                        if (latest.ping != null && latest.ping !== '') bits.push(latest.ping + ' ms');
                        if (uptime != null && uptime !== '') bits.push('24h ' + (Number(uptime) * 100).toFixed(1) + '%');
                        if (latest.time) bits.push('last ' + latest.time + ' UTC');

                        setRow('srv_' + name, state, statusText, (monitor.type || '') + (bits.length ? ' · ' + bits.join(' · ') : ''));
                    });
                });

                ['Bandera', 'Makhno API', 'Makhno Base', 'Service', 'Cache', 'Proxy'].forEach(function (name) {
                    if (!found[name]) setRow('srv_' + name, 'warn', 'Не опубликован', '');
                });

                return true;
            });
        }

        function checkSources(token) {
            var providerRecords = [];
            var sourceResults = {};

            var chain = Promise.resolve();

            SOURCES.forEach(function (source) {
                chain = chain.then(function () {
                    if (token !== runToken) return false;

                    setRow('src_' + source.name, 'run', 'Проверка…', source.page);

                    return nativeRequest(source.page, { dataType: 'text' })
                        .then(function (pageRes) {
                            if (token !== runToken) return false;

                            var fetchUrl = source.probe || source.page;
                            var fetchPromise;

                            if (fetchUrl === source.page && pageRes.ok) {
                                fetchPromise = Promise.resolve(pageRes);
                            } else {
                                fetchPromise = nativeRequest(fetchUrl, { dataType: 'text' });
                            }

                            return fetchPromise.then(function (probeRes) {
                                if (token !== runToken) return false;

                                var body = probeRes.ok ? String(probeRes.data || '') : '';
                                var providerUrls = extractProviderUrls(body);
                                var providerNames = [];

                                providerUrls.forEach(function (url) {
                                    var provider = providerFromUrl(url);
                                    if (provider === 'Unknown') return;

                                    providerNames.push(provider);
                                    providerRecords.push({
                                        source: source.name,
                                        provider: provider,
                                        url: url
                                    });
                                });

                                if (source.name === 'Bamboo') {
                                    var bambooStreams = extractStreamUrls(body);
                                    if (bambooStreams.length) {
                                        providerNames.push('BambooPlayer');
                                        providerRecords.push({
                                            source: source.name,
                                            provider: 'BambooPlayer',
                                            url: bambooStreams[0]
                                        });
                                    }
                                }

                                providerNames = unique(providerNames);

                                var geo = source.name === 'Uaflix' && isUaflixGeoBlocked(body);

                                var state;
                                var value;
                                if (!pageRes.ok) {
                                    state = 'bad';
                                    value = 'FAIL' + (pageRes.code ? ' (' + pageRes.code + ')' : '');
                                } else if (geo) {
                                    state = 'warn';
                                    value = 'GEO BLOCK';
                                } else if (!providerNames.length) {
                                    state = 'warn';
                                    value = 'OK / player ?';
                                } else {
                                    state = 'ok';
                                    value = 'OK';
                                }

                                var detail = [];
                                detail.push(pageRes.ms + ' ms');
                                if (providerNames.length) detail.push('player: ' + providerNames.join(', '));
                                if (!probeRes.ok && fetchUrl !== source.page) detail.push('probe failed');

                                setRow('src_' + source.name, state, value, detail.join(' · '));

                                sourceResults[source.name] = {
                                    page: pageRes,
                                    probe: probeRes,
                                    providers: providerNames,
                                    geo: geo
                                };

                                return true;
                            });
                        });
                });
            });

            return chain.then(function () {
                return {
                    providerRecords: providerRecords,
                    sourceResults: sourceResults
                };
            });
        }

        function bestSample(records, provider) {
            var list = records.filter(function (item) {
                return item.provider === provider;
            });

            if (provider === 'Ashdi' || provider === 'Zetvideo' || provider === 'Tortuga') {
                for (var i = 0; i < list.length; i++) {
                    if (String(list[i].url).indexOf('/vod/') >= 0) return list[i].url;
                }
            }

            if (list.length) return list[0].url;
            if (provider === 'HdvbUA') return 'https://hdvbua.pro/embed/2389';
            return '';
        }

        function testDirectStream(url, provider) {
            var headers = {};
            var referer = providerReferer(provider);

            if (referer) headers.Referer = referer;
            if (/\.mp4(?:\?|$)/i.test(url)) headers.Range = 'bytes=0-1023';

            return nativeRequest(url, {
                dataType: 'text',
                timeout: 10000,
                headers: headers
            });
        }

        function checkProvider(provider, records, token) {
            if (token !== runToken) return Promise.resolve(false);

            var sample = bestSample(records, provider);
            if (!sample) {
                setRow('pl_' + provider, 'warn', 'NOT FOUND', 'На проверочных страницах URL плеера не найден');
                return Promise.resolve(false);
            }

            setRow('pl_' + provider, 'run', 'Проверка…', sample);

            if (/\.(?:m3u8|mp4)(?:\?|$)/i.test(sample)) {
                return testDirectStream(sample, provider).then(function (res) {
                    if (token !== runToken) return false;
                    setRow(
                        'pl_' + provider,
                        res.ok ? 'ok' : 'bad',
                        res.ok ? 'OK' : 'FAIL',
                        (res.ok ? res.ms + ' ms' : res.error)
                    );
                    return res.ok;
                });
            }

            var candidates = providerCandidates(provider, sample);
            var referer = providerReferer(provider);

            function tryCandidate(index) {
                if (token !== runToken) return Promise.resolve(false);

                if (index >= candidates.length) {
                    setRow(
                        'pl_' + provider,
                        'warn',
                        'STREAM NOT FOUND',
                        'Плеер доступен, но URL m3u8/mp4 не извлечён; возможен GEO/anti-bot'
                    );
                    return Promise.resolve(false);
                }

                var headers = {};
                if (referer) headers.Referer = referer;

                return nativeRequest(candidates[index], {
                    dataType: 'text',
                    timeout: 10000,
                    headers: headers
                }).then(function (res) {
                    if (token !== runToken) return false;
                    if (!res.ok) return tryCandidate(index + 1);

                    var streams = extractStreamsFromPlayer(String(res.data || ''));
                    if (!streams.length) return tryCandidate(index + 1);

                    var streamUrl = streams[0];

                    return testDirectStream(streamUrl, provider).then(function (streamRes) {
                        if (token !== runToken) return false;

                        setRow(
                            'pl_' + provider,
                            streamRes.ok ? 'ok' : 'bad',
                            streamRes.ok ? 'OK' : 'FAIL',
                            streamRes.ok
                                ? ('stream ' + streamRes.ms + ' ms')
                                : ('stream: ' + streamRes.error)
                        );

                        return streamRes.ok;
                    });
                });
            }

            return tryCandidate(0);
        }

        function checkPlayers(records, token) {
            var chain = Promise.resolve();

            PROVIDERS.forEach(function (provider) {
                chain = chain.then(function () {
                    return checkProvider(provider, records, token);
                });
            });

            return chain;
        }

        function countStates(prefix) {
            var result = { ok: 0, bad: 0, warn: 0, run: 0 };

            Object.keys(rows).forEach(function (key) {
                if (key.indexOf(prefix) !== 0) return;
                var row = rows[key];
                if (row.hasClass('is-ok')) result.ok++;
                else if (row.hasClass('is-bad')) result.bad++;
                else if (row.hasClass('is-warn')) result.warn++;
                else if (row.hasClass('is-run')) result.run++;
            });

            return result;
        }

        function finishSummary(token) {
            if (token !== runToken) return;

            var srv = countStates('srv_');
            var src = countStates('src_');
            var pl = countStates('pl_');

            var bad = srv.bad + src.bad + pl.bad;
            var warn = srv.warn + src.warn + pl.warn;

            if (bad > 0) {
                setSummary('bad', 'Есть ошибки', bad + ' ошибок · ' + warn + ' предупреждений');
            } else if (warn > 0) {
                setSummary('warn', 'Есть предупреждения', warn + ' проверок требуют внимания');
            } else {
                setSummary('ok', 'Всё доступно', 'Серверы, источники и плееры отвечают');
            }
        }

        function runAll() {
            if (running) {
                runToken++;
                networkList.forEach(function (n) {
                    try { n.clear(); } catch (e) {}
                });
                networkList = [];
            }

            running = true;
            runToken++;
            var token = runToken;

            resetRows();
            setSummary('run', 'Проверка…', 'Не закрывайте экран');

            try { self.activity.loader(true); } catch (e) {}

            var providerRecords = [];

            Promise.all([
                checkPublicIp(token),
                checkLampaMeStatus(token),
                checkSources(token).then(function (result) {
                    providerRecords = result.providerRecords || [];
                    return result;
                })
            ]).then(function () {
                if (token !== runToken) return false;
                return checkPlayers(providerRecords, token);
            }).then(function () {
                if (token !== runToken) return;

                running = false;
                try { self.activity.loader(false); } catch (e) {}
                finishSummary(token);
                try { self.activity.toggle(); } catch (e) {}
            }).catch(function (err) {
                if (token !== runToken) return;

                running = false;
                try { self.activity.loader(false); } catch (e) {}
                setSummary('bad', 'Ошибка диагностики', err && err.message ? err.message : String(err));
                try { self.activity.toggle(); } catch (e) {}
            });
        }

        this.create = function () {
            scroll.minus();
            buildUi();
            scroll.append(content);
            runAll();
            return this.render();
        };

        this.start = function () {
            if (Lampa.Activity.active().activity !== this.activity) return;

            Lampa.Controller.add('content', {
                link: self,
                invisible: true,
                toggle: function () {
                    try { Lampa.Controller.collectionSet(scroll.render(true)); } catch (e) {}
                    try { Lampa.Controller.collectionFocus(last || false, scroll.render(true)); } catch (e) {}
                },
                left: function () {
                    if (typeof Navigator !== 'undefined' && Navigator.canmove && Navigator.canmove('left')) Navigator.move('left');
                    else Lampa.Controller.toggle('menu');
                },
                right: function () {
                    if (typeof Navigator !== 'undefined' && Navigator.canmove && Navigator.canmove('right')) Navigator.move('right');
                },
                up: function () {
                    if (typeof Navigator !== 'undefined' && Navigator.canmove && Navigator.canmove('up')) Navigator.move('up');
                    else Lampa.Controller.toggle('head');
                },
                down: function () {
                    if (typeof Navigator !== 'undefined' && Navigator.canmove && Navigator.canmove('down')) Navigator.move('down');
                },
                back: function () {
                    Lampa.Activity.backward();
                }
            });

            Lampa.Controller.toggle('content');
        };

        this.pause = function () {};
        this.stop = function () {};

        this.render = function (js) {
            return js ? scroll.render(true) : $(scroll.render(true));
        };

        this.destroy = function () {
            runToken++;
            running = false;

            networkList.forEach(function (net) {
                try { net.clear(); } catch (e) {}
            });
            networkList = [];

            try { scroll.destroy(); } catch (e) {}
            try { html.remove(); } catch (e) {}
            rows = {};
        };
    }

    function registerTemplates() {
        Lampa.Template.add('lme_diagnostics_style', `
            <style>
                .lme-diag {
                    padding: 0 1.4em 3em;
                    max-width: 82em;
                    margin: 0 auto;
                    box-sizing: border-box;
                }

                .lme-diag__content {
                    padding-bottom: 4em;
                }

                .lme-diag__hero {
                    padding: 0.8em 0 1.2em;
                }

                .lme-diag__hero-title {
                    font-size: 2em;
                    font-weight: 700;
                }

                .lme-diag__hero-sub {
                    opacity: 0.65;
                    margin-top: 0.3em;
                    font-size: 1.05em;
                }

                .lme-diag__section {
                    margin: 0 0 1.5em;
                }

                .lme-diag__section-title {
                    font-size: 1.25em;
                    font-weight: 700;
                    margin-bottom: 0.55em;
                    opacity: 0.95;
                }

                .lme-diag__rows {
                    display: grid;
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    gap: 0.55em;
                }

                .lme-diag__row {
                    border-radius: 0.7em;
                    padding: 0.85em 1em;
                    background: rgba(255,255,255,0.07);
                    border: 0.12em solid transparent;
                    min-height: 3.6em;
                    box-sizing: border-box;
                }

                .lme-diag__row.focus,
                .lme-diag__button.focus {
                    border-color: rgba(255,255,255,0.95);
                    transform: scale(1.015);
                }

                .lme-diag__row-main {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 1em;
                }

                .lme-diag__label {
                    font-size: 1.05em;
                    font-weight: 600;
                    min-width: 0;
                }

                .lme-diag__value {
                    flex-shrink: 0;
                    font-size: 0.95em;
                    font-weight: 700;
                    border-radius: 999px;
                    padding: 0.25em 0.7em;
                    background: rgba(255,255,255,0.10);
                }

                .lme-diag__detail {
                    opacity: 0.58;
                    font-size: 0.78em;
                    margin-top: 0.45em;
                    white-space: normal;
                    overflow-wrap: anywhere;
                }

                .lme-diag__row.is-ok .lme-diag__value {
                    background: rgba(53, 199, 89, 0.24);
                }

                .lme-diag__row.is-bad .lme-diag__value {
                    background: rgba(255, 69, 58, 0.26);
                }

                .lme-diag__row.is-warn .lme-diag__value {
                    background: rgba(255, 159, 10, 0.28);
                }

                .lme-diag__row.is-run .lme-diag__value {
                    background: rgba(10, 132, 255, 0.25);
                }

                .lme-diag__actions {
                    padding: 0.3em 0 1em;
                }

                .lme-diag__button {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.55em;
                    border: 0.12em solid transparent;
                    background: rgba(255,255,255,0.12);
                    border-radius: 0.7em;
                    padding: 0.85em 1.15em;
                    font-weight: 700;
                }

                .lme-diag__button-icon {
                    font-size: 1.35em;
                    line-height: 1;
                }

                @media (max-width: 800px) {
                    .lme-diag__rows {
                        grid-template-columns: 1fr;
                    }

                    .lme-diag {
                        padding-left: 0.8em;
                        padding-right: 0.8em;
                    }
                }
            </style>
        `);

        $('body').append(Lampa.Template.get('lme_diagnostics_style', {}, true));
    }

    function openDiagnostics() {
        Lampa.Activity.push({
            url: '',
            title: MENU_TITLE,
            component: COMPONENT,
            page: 1
        });
    }

    function addMenu() {
        if ($('.menu__item[data-action="' + COMPONENT + '"]').length) return;

        var icon = [
            '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">',
            '<path fill="currentColor" d="M4 4h2v9a4 4 0 0 0 8 0V7h2v6a6 6 0 0 1-12 0V4zm1-2a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm10 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm3 12a3 3 0 1 1 2 2.83V20h-2v-3.17A3 3 0 0 1 18 14z"/>',
            '</svg>'
        ].join('');

        if (Lampa.Menu && Lampa.Menu.addButton) {
            Lampa.Menu.addButton(icon, MENU_TITLE, openDiagnostics)
                .attr('data-action', COMPONENT);
        } else {
            var button = $(
                '<li class="menu__item selector" data-action="' + COMPONENT + '">' +
                    '<div class="menu__ico">' + icon + '</div>' +
                    '<div class="menu__text">' + MENU_TITLE + '</div>' +
                '</li>'
            );

            button.on('hover:enter', openDiagnostics);
            $('.menu .menu__list').eq(0).append(button);
        }
    }

    function init() {
        if (!Lampa.Component.get(COMPONENT)) {
            Lampa.Component.add(COMPONENT, DiagnosticsComponent);
        }

        registerTemplates();
        setTimeout(addMenu, 300);

        console.log('[LME Diagnostics] loaded v' + PLUGIN_VERSION);
    }

    if (window.appready) {
        init();
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') init();
        });
    }
})();
