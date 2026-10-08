# Japanisch Trainer

Kana Trainer und Vokabeltrainer als Web-App, wahlweise als Home-Assistant-App.

## Lokal starten

```
python3 japanisch_trainer/server.py --port 5178 --data data
```

Dann <http://localhost:5178> öffnen. Die Daten landen im Ordner `data/`.
Ohne Server (z. B. `index.html` direkt geöffnet) speichert die App alles im Browser.

## Als Home-Assistant-App installieren

Voraussetzung: Home Assistant OS oder Supervised (dort gibt es den App-Store).

1. Den Ordner `japanisch_trainer` in den Ordner `addons` von Home Assistant kopieren,
   z. B. mit der App „Samba share“ (Freigabe `addons`) oder „Advanced SSH & Web Terminal“
   (`/addons/japanisch_trainer`).
2. In Home Assistant **Einstellungen → Apps → App-Store** öffnen, oben rechts im Menü
   **Nach Updates suchen** wählen.
3. Unter **Lokale Apps** erscheint „Japanisch Trainer“ → **Installieren** → **Starten**,
   dann **In der Seitenleiste anzeigen** aktivieren.

Nach Änderungen am Code die `version` in `japanisch_trainer/config.yaml` erhöhen,
den Ordner erneut kopieren und in der App auf **Neu erstellen** bzw. **Aktualisieren** klicken.

## Aufbau

- `japanisch_trainer/www/` – die Web-App (HTML, CSS, JavaScript)
- `japanisch_trainer/server.py` – kleiner Python-Server ohne Abhängigkeiten: liefert die App
  aus und speichert Profile, gemeinsame Wörter und die Statistik pro Profil als JSON
- `japanisch_trainer/config.yaml`, `Dockerfile` – Home-Assistant-App
