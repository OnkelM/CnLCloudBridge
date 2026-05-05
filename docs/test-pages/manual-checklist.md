# Manuelle Test-Checkliste

## Setup
- [ ] Extension geladen, keine Manifest-Fehler in `chrome://extensions/`.
- [ ] Service-Worker-Konsole zeigt `service worker started`.

## Login & Idle
- [ ] Storage leer → Popup zeigt Login-Form.
- [ ] Login mit gültigen Credentials → Idle-View mit Email + Geräteliste.
- [ ] Falsche Credentials → Inline-Error "Login fehlgeschlagen: …".
- [ ] Browser neu starten → Popup zeigt direkt Idle (Auto-Reconnect ohne Prompt).
- [ ] CnL-Toggle OFF/ON → `chrome.storage.local.get("cnlEnabled", …)` reflektiert den Status.
- [ ] "Aktualisieren"-Button → Geräteliste wird neu geladen.
- [ ] Logout → Storage geleert, Popup zeigt Login-Form.

## Click'n'Load
- [ ] `docs/test-pages/jdcheck-test.html` → Button liefert `jdownloader=true; …`.
- [ ] `docs/test-pages/cnl-test.html` → "flash/add" öffnet Picker mit zwei URLs, Senden landet im JDownloader.
- [ ] `cnl-test.html` → "flash/addcrypted2" öffnet Picker mit zwei entschlüsselten URLs, Senden landet im JDownloader.
- [ ] Echte CnL-Webseite (z. B. die ursprünglich getestete Seite) → Picker öffnet, Senden klappt.

## Fehler-Pfade
- [ ] Toggle OFF + CnL-Trigger → Notification "Click'n'Load über die Extension ist deaktiviert.".
- [ ] Logout + CnL-Trigger → Notification "Bitte erst einloggen…".
- [ ] Alle Geräte offline + CnL-Trigger → Notification "Keine Geräte verbunden.".
- [ ] Picker-Cancel-Button → schließt Popup, Pending wird verworfen.
- [ ] Pending älter als 5 min → wird beim nächsten `GET_PENDING` aussortiert.

## Mehrere Geräte
- [ ] Account mit mindestens zwei Geräten → Picker zeigt beide.
- [ ] Online-Indikator: grün für ONLINE, grau sonst.
- [ ] Klick auf offline-Gerät → cursor: not-allowed (kein Senden).

## iFrames
- [ ] CnL-Trigger aus iFrame (z. B. `cnl-test.html` in `<iframe>` einbetten) → Picker öffnet, Senden klappt.
