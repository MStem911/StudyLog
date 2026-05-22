# StudyLog

Offline-fähige PWA zur Protokollierung von Studiendurchführungen.  
Entwickelt für die Universität der Bundeswehr München.

## Funktionen

- **Probandenverwaltung** – Anlegen mit Pseudonym + Sensoriknummer (1–12), keine Klarnamen
- **Sitzungsprotokoll** – Start/Stopp-Timer mit automatischem Datum/Zeitstempel
- **Abweichungs-Tags** – Schnelles Markieren von Standardabweichungen
- **Freitextnotizen** – Pro Sitzung
- **Export** – CSV und JSON mit allen Metadaten
- **Vollständig offline** – Alle Daten lokal im Browser (localStorage), kein Server, kein Backend
- **PWA** – Kann auf iPhone als App installiert werden

## Datenschutz

- Keine Klarnamen in der App
- Alle Daten verbleiben lokal auf dem Gerät
- Export enthält nur: Pseudonym, Sensoriknummer, Station, Zeitstempel, Szenario, Abweichungen, Notizen
- Zuordnungsliste Pseudonym ↔ Klarname liegt separat bei der Studienleitung

## GitHub Pages Deployment

1. Repository auf GitHub anlegen (privat)
2. Alle Dateien pushen
3. Unter `Settings → Pages → Source` den Branch `main` und Ordner `/ (root)` wählen
4. Nach ~1 Minute ist die App unter `https://<username>.github.io/<reponame>/` erreichbar

### Auf iPhone installieren

1. App-URL in Safari öffnen
2. Teilen-Button → „Zum Home-Bildschirm"
3. App erscheint wie eine native App, funktioniert vollständig offline

## Mehrere Geräte / Parallelbetrieb

Jedes Gerät speichert Daten lokal und unabhängig. Nach der Studie:

1. Auf jedem Gerät: Export → CSV exportieren (Gerät/Betreuer-Label setzen!)
2. Alle CSV-Dateien zusammenführen (z.B. in R, Python oder Excel)
3. Matching über Pseudonym + Sensoriknummer mit Zuordnungsliste

## Dateistruktur

```
studylog-app/
├── index.html      # App-Shell
├── style.css       # Dark-Mode Styles
├── app.js          # Logik + localStorage
├── sw.js           # Service Worker (Offline)
├── manifest.json   # PWA Manifest
├── icons/          # App Icons
└── .nojekyll       # GitHub Pages Config
```

## CSV-Spalten

| Spalte | Beschreibung |
|--------|--------------|
| ID | Eindeutige Sitzungs-ID |
| Datum | Datum (DD.MM.YYYY) |
| Pseudonym | z.B. P-042 |
| Sensoriknummer | 1–12 |
| Station | A–E |
| Szenario | Szenario 1/2/3 |
| Start | ISO 8601 Zeitstempel |
| Ende | ISO 8601 Zeitstempel |
| Dauer_s | Dauer in Sekunden |
| Dauer_mm:ss | Lesbare Dauer |
| Abweichungen | Semikolon-getrennt |
| Anmerkungen | Freitext |
| Geraet_Betreuer | Gerätebezeichnung |
