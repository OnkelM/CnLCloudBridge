# MyJDownloader (Manifest V3)

Chrome-Extension, die Click'n'Load-Aufrufe abfängt und sie über MyJDownloader an eine ausgewählte JDownloader-Instanz weiterleitet.

## Setup

1. Repository klonen.
2. `chrome://extensions/` öffnen → Entwicklermodus aktivieren → "Entpackte Erweiterung laden" → diesen Ordner wählen.
3. Extension-Icon klicken → mit MyJDownloader-Account einloggen.
4. Auf einer Seite mit Click'n'Load-Button ausprobieren.

## Architektur

- Service Worker (`background/`) hält die Session und kommuniziert mit der MyJDownloader-API.
- Content Script (`content/cnl-hook.js`) läuft im MAIN-World jeder Seite und hooked `fetch`/`XHR`.
- Popup (`popup/`) ist eine Mini-State-Machine: `loggedOut`, `idle`, `picker`.

Mehr in [docs/superpowers/specs/](docs/superpowers/specs/).

## Testen

Siehe [docs/test-pages/manual-checklist.md](docs/test-pages/manual-checklist.md).
