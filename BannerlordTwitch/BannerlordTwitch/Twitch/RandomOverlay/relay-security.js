'use strict';

// This relay is a local operator tool, not a public viewer command endpoint.
// Check Host as well as Origin to reject DNS rebinding and cross-site sockets.
const hosts = new Set(['localhost:3000', '127.0.0.1:3000']);
const origins = new Set([...hosts].map(host => `http://${host}`));

function isTrustedRequest(req) {
    return hosts.has(req.headers.host) &&
        (req.headers.origin === undefined || origins.has(req.headers.origin));
}

function isTrustedSocket(req) {
    if (!isTrustedRequest(req)) return false;
    // Native game connections have no browser Origin. Browsers must have one.
    return req.headers['x-client-type'] === 'game'
        ? req.headers.origin === undefined
        : origins.has(req.headers.origin);
}

module.exports = { isTrustedRequest, isTrustedSocket };
