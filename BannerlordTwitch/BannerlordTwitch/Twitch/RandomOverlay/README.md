# Local overlay

Run `npm install`, then `npm start`. Open
`http://localhost:3000/RandomOverlay.html` in your browser or OBS.

The command relay is restricted to this computer (127.0.0.1). Browser
connections must originate from http://localhost:3000 or http://127.0.0.1:3000.
Opening the HTML directly as a file or hosting it elsewhere does not authorize
access to the local relay. Do not expose it through a reverse proxy: the supplied
viewer name is not an authenticated Twitch identity.

Overlay commands no longer receive moderator or broadcaster privileges.
Use authenticated Twitch chat for privileged commands.

Run `npm test` for injection and relay access regression tests. Display text must
be HTML-encoded with `esc`; values inside JavaScript string literals in event
attributes must use `jsText`. These are different encoding contexts. Do not pass
HTML-encoded command strings to `actBtn`, which encodes raw commands itself.
