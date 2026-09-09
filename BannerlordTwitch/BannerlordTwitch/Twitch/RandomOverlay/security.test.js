'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { isTrustedRequest, isTrustedSocket } = require('./relay-security');

const html = fs.readFileSync(path.join(__dirname, 'public/RandomOverlay.html'), 'utf8');
const script = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
function overlay() {
    const elements = new Map();
    const element = () => ({ innerHTML: '', value: '', style: {}, appendChild(e) { this.innerHTML += e.innerHTML; } });
    const context = vm.createContext({ setTimeout() {}, window: { addEventListener() {} }, document: {
        createElement: element,
        getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
    } });
    vm.runInContext(script, context);
    return { context, elements };
}
const payloads = ["O'Brien", "');globalThis.pwned=true;//", '\\',
    '\"><img src=x onerror="globalThis.pwned=true">',
    '&quot;&#39;&lt;script&gt;', '</script><script>globalThis.pwned=true</script>', '\r\n\u2028\u2029', '王国 🏰'];

test('console feed retains messages as text parts instead of executable markup', {
    skip: !fs.existsSync(path.join(__dirname, '../../Overlay/ConsoleFeed/ConsoleFeed.js')) &&
        'Console feed belongs to the full mod source, not the standalone overlay archive',
}, () => {
    const source = fs.readFileSync(path.join(__dirname, '../../Overlay/ConsoleFeed/ConsoleFeed.js'), 'utf8');
    const template = fs.readFileSync(path.join(__dirname, '../../Overlay/ConsoleFeed/ConsoleFeed.html'), 'utf8');
    let feed;
    function Vue(options) { feed = options.data; return feed; }
    const $ = () => ({ready(fn) { fn(); }});
    $.connection = {};
    const context = vm.createContext({Vue, $, document:{}, twitch:{getUserColor:()=>'red'}});
    vm.runInContext(source.replace('    if(typeof $.connection', '    globalThis.addFeedMessage = addMessage;\n    if(typeof $.connection'), context);
    for (const value of payloads) {
        context.addFeedMessage({id:42, message:value, style:'response'});
        const last = feed.items.at(-1);
        assert.equal(last.parts.map(part => part.text).join(''), value);
        assert.equal(last.message, undefined);
    }
    assert.doesNotMatch(template, /v-html/);
    assert.match(template, /\{\{ part.text \}\}/);
    assert.equal(context.pwned, undefined);
});

test('JS attribute string encoding preserves names without executing them', () => {
    const { context } = overlay();
    for (const value of payloads) {
        context.value = value;
        const encoded = vm.runInContext('jsText(value)', context);
        assert.match(encoded, /^(?:\\u[0-9a-f]{4})*$/);
        assert.equal(vm.runInContext(`'${encoded}'`, context), value);
        assert.equal(context.pwned, undefined);
    }
});

test('rendered name-bearing handlers preserve data across all diplomacy views', () => {
    for (const name of payloads) {
        const { context, elements } = overlay();
        context.name = name;
        context.computeActions = () => Object.fromEntries(['war','peaceOffer','peaceDemand','nap','alliance','trade','breakNap','breakAlliance','ctw'].map(key => [key, {ok:true}]));
        vm.runInContext(`G.diplomacy = { isLeader: true, kingdoms: [{name, relation:'war', isBLT:true}],
            proposals:[{from:name,type:'nap'}], ctwProposals:[{caller:name,target:name}],
            independentClans:[{name,allied:true},{name,proposalFrom:true},{name}] };
            renderKdomList(); renderKdomDetail(G.diplomacy.kingdoms[0]); renderDiploOverview();
            renderProposals(); renderWars(); renderClanDiplo(); notifProp({from:name,proposalType:'nap'});`, context);
        const calls = [];
        for (const fn of ['cmd','selectKdom','setStance','sendPeace','sendCTW','togglePeaceForm','confirmWar','openStanceModal','clanCTW','clanWar','openDiplo'])
            context[fn] = (...args) => calls.push([fn, ...args]);
        let count = 0;
        for (const el of elements.values()) {
            assert.doesNotMatch(el.innerHTML, /<img|<script/i);
            for (const match of el.innerHTML.matchAll(/onclick="([^"]*)"/g)) {
                // Decode entities exactly once, as the HTML parser does.
                const handler = match[1].replace(/&(quot|lt|gt|amp);/g, (_, e) => ({quot:'"',lt:'<',gt:'>',amp:'&'}[e]));
                vm.runInContext(`(function(){${handler}}).call({closest(){return {remove(){}}}})`, context);
                count++;
            }
        }
        assert.ok(count > 35, `Expected all controls, got ${count}`);
        assert.ok(calls.some(c => c[0] === 'selectKdom' && c[1] === name));
        assert.ok(calls.some(c => c[0] === 'cmd' && c[1] === 'diplomacy clan break ' + name));
        assert.equal(context.pwned, undefined);
    }
});

test('relay rejects cross-site, originless browser, and DNS rebinding requests', () => {
    const req = (host, origin, game = false) => ({headers:{host, ...(origin === undefined ? {} : {origin}), ...(game ? {'x-client-type':'game'} : {})}});
    assert.ok(isTrustedRequest(req('localhost:3000')));
    assert.ok(isTrustedSocket(req('localhost:3000', undefined, true)));
    assert.ok(isTrustedSocket(req('127.0.0.1:3000', 'http://localhost:3000')));
    for (const origin of ['https://attacker.example', 'null', 'http://localhost:3000.attacker.example']) {
        assert.equal(isTrustedSocket(req('localhost:3000', origin)), false);
        assert.equal(isTrustedRequest(req('localhost:3000', origin)), false);
    }
    assert.equal(isTrustedSocket(req('localhost:3000')), false);
    assert.equal(isTrustedSocket(req('localhost:3000', 'http://localhost:3000', true)), false);
    assert.equal(isTrustedRequest(req('attacker.example:3000')), false);
});
