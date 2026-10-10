'use strict';
// Rebuild using npm ci --prefix tools/easytorrent-xwalk, then run this file.
// This compiler does not execute the downloaded plugin.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const babel = require('@babel/core');
const presetEnv = require('@babel/preset-env');
const browserify = require('browserify');
const acorn = require('acorn');
const terser = require('terser');
const rewritePattern = require('regexpu-core');

const ROOT = path.resolve(__dirname, '../..');
const NAME = 'easytorrent2.1.0.5-xwalk5';
const COMMIT = '1b492d8c418703ce2469742f3eb951e967896000';
const BLOB = '04ea78a6a1daa62e67a0a458519cada4873e07c5';
const URL = 'https://raw.githubusercontent.com/cevamnelampaplagin/plugins/' + COMMIT + '/easytorrent2.1.0.5.js';
const WORK = path.join(__dirname, '.build');
const modifications = [];
const tests = [];
function sha256(v) { return crypto.createHash('sha256').update(v).digest('hex'); }

// Babel transforms regexp literals, but not dynamically constructed patterns.
// Preserve full Unicode letter/number boundaries around escaped audio aliases.
function dynamicRegex({ types: t }) {
    return { visitor: { NewExpression(p) {
        if (!t.isIdentifier(p.node.callee, { name: 'RegExp' })) return;
        const args = p.node.arguments;
        if (!t.isStringLiteral(args[1]) || !args[1].value.includes('u')) return;
        let pattern;
        const expressions = [];
        const markers = [];
        if (t.isTemplateLiteral(args[0])) {
            const tpl = args[0];
            pattern = tpl.quasis[0].value.cooked;
            tpl.expressions.forEach((ex, i) => {
                const marker = '99887766554433221100' + i + '00998877665544332211';
                expressions.push(ex); markers.push(marker);
                pattern += marker + tpl.quasis[i + 1].value.cooked;
            });
        } else if (t.isStringLiteral(args[0])) {
            pattern = args[0].value;
        } else {
            throw p.buildCodeFrameError('Unreviewed dynamic Unicode regexp');
        }
        const flags = args[1].value;
        let rest = rewritePattern(pattern, flags, { unicodeFlag: 'transform', unicodePropertyEscapes: 'transform' });
        // Test the constant boundary pattern without running the plugin.
        const samples = ['abc', ' ukr ', 'Українська', 'ДБ', '2x2', 'Тест 1 сезон: 1-7 серії', 'Japanese 日本語', '123'];
        const native = new RegExp(pattern, flags);
        const compiled = new RegExp(rest, flags.replace('u', ''));
        samples.forEach(sample => { native.lastIndex = compiled.lastIndex = 0; assert.equal(compiled.test(sample), native.test(sample)); });
        let out = null;
        expressions.forEach((ex, i) => {
            const pos = rest.indexOf(markers[i]);
            assert(pos >= 0 && rest.indexOf(markers[i], pos + 1) === -1, 'One marker per expression');
            const part = t.stringLiteral(rest.slice(0, pos));
            out = out ? t.binaryExpression('+', out, part) : part;
            out = t.binaryExpression('+', out, ex);
            rest = rest.slice(pos + markers[i].length);
        });
        args[0] = out ? t.binaryExpression('+', out, t.stringLiteral(rest)) : t.stringLiteral(rest);
        args[1] = t.stringLiteral(flags.replace('u', ''));
        modifications.push('Dynamic Unicode regexp compiled at source line ' + p.node.loc.start.line);
    } } };
}

function compile(source, filename, usage) {
    const options = {
        targets: { chrome: '34' }, forceAllTransforms: true, bugfixes: true,
        modules: 'commonjs', useBuiltIns: usage ? 'usage' : false
    };
    if (usage) options.corejs = { version: '3.46', proposals: false };
    return babel.transformSync(source, {
        filename, babelrc: false, configFile: false, sourceType: 'script',
        comments: false, compact: false,
        plugins: usage ? [dynamicRegex] : [],
        presets: [[presetEnv, options]]
    }).code;
}
function bundle(file) {
    return new Promise((resolve, reject) => {
        browserify(file, { basedir: __dirname, debug: false }).bundle((err, result) => {
            if (err) reject(err); else resolve(result.toString('utf8'));
        });
    });
}
function licenses() {
    let text = 'EasyTorrent original author: DarkestClouds (@darkestclouds).\nUkrainian adaptation: cevamnelampaplagin.\nSource: ' + URL + '\nOriginal rights remain with the authors; no new license is asserted for their code.\n\n';
    for (const name of ['core-js', 'whatwg-fetch', '@babel/helpers', 'browser-pack']) {
        const dir = path.dirname(require.resolve(name + '/package.json'));
        const f = ['LICENSE', 'LICENSE.txt', 'LICENSE.md'].map(x => path.join(dir, x)).find(x => fs.existsSync(x));
        assert(f, 'License required for ' + name);
        const meta = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
        text += '\n===== ' + name + '@' + meta.version + ' =====\n' + fs.readFileSync(f, 'utf8') + '\n';
    }
    return text;
}
async function main() {
    fs.mkdirSync(WORK, { recursive: true });
    const response = await fetch(URL, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error('Source HTTP ' + response.status);
    const bytes = Buffer.from(await response.arrayBuffer());
    const blob = crypto.createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');
    assert.equal(blob, BLOB, 'Pinned upstream blob identity');
    tests.push('Original source verified against immutable Git blob SHA-1');
    const source = bytes.toString('utf8');
    assert.throws(() => acorn.parse(source, { ecmaVersion: 5 }));
    tests.push('Confirmed original source does not parse as ES5');
    fs.writeFileSync(path.join(WORK, 'plugin.js'), compile(source, path.join(WORK, 'upstream.js'), true));
    fs.writeFileSync(path.join(WORK, 'entry.js'), [
        "require('core-js/es/symbol');",
        "require('core-js/es/promise');",
        "require('core-js/es/map');",
        "require('core-js/es/set');",
        "require('core-js/es/array/from');",
        "require('core-js/es/string/match-all');",
        "require('core-js/web/dom-collections');",
        "require('whatwg-fetch');",
        "require('./plugin.js');"
    ].join('\n'));
    const bundled = await bundle(path.join(WORK, 'entry.js'));
    const es5 = compile(bundled, path.join(WORK, 'bundle.js'), false);
    const wrapper = '(function(w){if(w.EasyTorrentXWalk5&&w.EasyTorrentXWalk5.loaded)return;var state={build:"2.1.0.5-xwalk5-r1",target:"Chromium 34 / ES5",loaded:false};w.EasyTorrentXWalk5=state;try{' + es5 + '\nstate.loaded=true;}catch(e){state.error=String(e&&e.stack||e);throw e;}})(window);';
    const minified = await terser.minify(wrapper, {
        ecma: 5, compress: { ecma: 5, passes: 2, unsafe: false }, mangle: true,
        format: { ecma: 5, ascii_only: true, comments: /^!/, max_line_len: 1000 }
    });
    const header = '/*! EasyTorrent ' + NAME + '\n' +
        ' * Original: DarkestClouds (@darkestclouds). Ukrainian adaptation: cevamnelampaplagin.\n' +
        ' * Compatibility build: Proton4/lampac. Standalone ES5 + polyfills, target Chromium 34.\n' +
        ' * Source commit: ' + COMMIT + '; source blob: ' + BLOB + '\n' +
        ' * Notices: ' + NAME + '.LICENSES.txt. Disable original EasyTorrent before enabling this file.\n */\n';
    const output = header + minified.code + '\n';
    acorn.parse(output, { ecmaVersion: 5, sourceType: 'script' });
    tests.push('Entire final standalone minified file parses as ECMAScript 5');
    tests.push('Dynamic Unicode boundary transformation checked with regexp samples');
    const report = {
        file: NAME + '.js', target: { chrome: '34' }, syntax: 'ES5', build: 'r1',
        source: { requested_url: 'https://cevamnelampaplagin.github.io/plugins/easytorrent2.1.0.5.js', pinned_url: URL, commit: COMMIT, blob_sha1: BLOB, sha256: sha256(bytes), bytes: bytes.length },
        output: { sha256: sha256(output), bytes: Buffer.byteLength(output) },
        transformations: ['Babel preset-env, Chromium 34 target, forceAllTransforms', 'Bundled core-js and whatwg-fetch; no runtime library CDN', ...modifications, 'Duplicate-load guard for the compatible file'],
        tests,
        limitations: ['Static compilation and syntax tests, not physical TV Box testing', 'Actual Lampa UI, remote services and TLS/certificate trust still require device testing', 'Disable original EasyTorrent to avoid duplicate hooks', 'Original settings schema 2.1 and scoring logic retained']
    };
    const notices = licenses();
    fs.writeFileSync(path.join(ROOT, NAME + '.js'), output);
    fs.writeFileSync(path.join(ROOT, NAME + '.LICENSES.txt'), notices);
    fs.writeFileSync(path.join(ROOT, NAME + '.build.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
}
main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
