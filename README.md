# Vienna Road Trip

Mini esperienza interattiva mobile-first con:

- Hero emozionale con overlay caldo
- Mappa Leaflet con marker tappabili e rotta
- Timeline trascinabile (drag and drop) con aggiornamento live della mappa
- Aggiunta/modifica/rimozione tappe da mappa e timeline
- Card tappa con icone categoria (escursione, bar, ristorante, dolci, museo, panorama)
- Link Spotify fisso per aggiungere brani alla playlist del viaggio
- Toast non bloccanti e popup di conferma personalizzato

## Avvio locale

```bash
cd /Users/gianmarcozironelli/Desktop/projects/trips
python3 -m http.server 4173
```

Apri `http://localhost:4173`.

## Modello dati

Le tappe iniziali sono in `data/stops.json`.

```json
{
  "id": "id-univoco",
  "title": "Titolo tappa",
  "note": "Nota breve",
  "category": "bar",
  "links": [
    { "label": "Google Maps", "url": "https://..." },
    { "label": "Instagram", "url": "https://..." }
  ],
  "lat": 48.2084,
  "lng": 16.3731
}
```

Le modifiche fatte in pagina vengono salvate in `localStorage` con chiave:

- `vienna-road-trip-stops-v3`

## Deploy su GitHub personale (GitHub Pages)

1. Crea un repository vuoto su GitHub, ad esempio `vienna-road-trip`.
2. Da questa cartella esegui:

```bash
cd /Users/gianmarcozironelli/Desktop/projects/trips
git init
git add .
git commit -m "Vienna Road Trip"
git branch -M main
git remote add origin https://github.com/<tuo-username>/vienna-road-trip.git
git push -u origin main
```

3. Su GitHub vai in `Settings` -> `Pages`:
- `Source`: `Deploy from a branch`
- `Branch`: `main`
- `Folder`: `/ (root)`

4. Dopo 1-2 minuti il sito sarà disponibile su:
- `https://<tuo-username>.github.io/vienna-road-trip/`
