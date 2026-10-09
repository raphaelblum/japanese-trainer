# Japanisch Trainer

Kana Trainer und Vokabeltrainer als Web-App, wahlweise als Home-Assistant-App.

## Lokal starten

```
python3 japanisch_trainer/server.py --port 5178 --data data
```

Dann <http://localhost:5178> öffnen. Die Daten landen im Ordner `data/`.
Ohne Server (z. B. `index.html` direkt geöffnet) speichert die App alles im Browser.

## In Home Assistant installieren

Alles im Browser, ohne Dateizugriff auf den Pi. Vorausgesetzt ist Home Assistant OS
oder Supervised (dort gibt es den App-Store).

1. *Einstellungen → Apps*, dann **App installieren**, im ⋮-Menü **Repositories**,
   und dort `https://github.com/raphaelblum/japanese-trainer` eintragen.
2. Die Liste neu laden. **Japanisch Trainer** steht jetzt als eigener Abschnitt in der Liste.
3. Installieren und starten. Die App erscheint als Eintrag „Japanisch“ in der Seitenleiste.

Home Assistant klont das Repository selbst, es muss also vom Pi aus erreichbar und
deshalb öffentlich sein.

Nach einer neuen Version: `version` in `japanisch_trainer/config.yaml` erhöhen und
pushen. Home Assistant bietet die Aktualisierung dann von selbst an (notfalls im
⋮-Menü des App-Stores **Nach Updates suchen**), `/data` mit Profilen und Statistik
bleibt erhalten.

## Aufbau

Dieses Repository ist ein **App-Repository**: `repository.yaml` an der Wurzel meldet es
bei Home Assistant an, die App selbst liegt in `japanisch_trainer/`. Home Assistant baut
jede App mit ihrem eigenen Ordner als Docker-Kontext, alles fürs Image muss also darin liegen.

- `repository.yaml` – meldet das Repository bei Home Assistant an
- `japanisch_trainer/www/` – die Web-App (HTML, CSS, JavaScript)
- `japanisch_trainer/server.py` – kleiner Python-Server ohne Abhängigkeiten: liefert die App
  aus und speichert Profile, gemeinsame Wörter und die Statistik pro Profil als JSON
- `japanisch_trainer/config.yaml`, `Dockerfile` – Home-Assistant-App
