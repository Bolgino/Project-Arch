# Azimut.Arch

Sito del gruppo per l'**Armadio** (distintivi, specialità, kit promessa) e la **Cambusa** (menu dei campi, lista della spesa, ricette, dispensa). È pensato per il telefono e si può installare come app.

## File

| File | A cosa serve |
| --- | --- |
| `index.html` | Portale con le due frecce: Armadio e Cambusa |
| `armadio.html`, `armadio.js` | Negozio con zaino, richieste "Serve!", gestione (inventario, ordine al Centro Forniture, carico, kit, movimenti, statistiche) |
| `cambusa.html`, `cambusa.js` | Menu dei campi salvati, lista della spesa, ricette per pasto, dispensa, gestione |
| `common.js`, `common.css` | Codice e stile comuni: configurazione, accesso admin, fogli, avvisi, icone |
| `sw.js`, `manifest.json` | App installabile e funzionamento offline |
| `fonts/` | Barlow Condensed e Atkinson Hyperlegible (licenza OFL) |
| `supabase/migrations/` | Modifiche al database, da applicare in ordine |
| `supabase/functions/notify-admin/` | Funzione che manda le email all'admin |
| `controlla-scadenze.js` | Controllo giornaliero delle scadenze della cambusa (GitHub Action) |

## Manutenzione

In `common.js` c'è `MANUTENZIONE = { portale, armadio, cambusa }`: metti `true` per chiudere una pagina al pubblico. L'admin la vede lo stesso.

## Database

1. `20261014090000_funzioni_armadio_cambusa.sql` aggiunge tabelle, colonne e funzioni. Funziona anche col sito vecchio.
2. `20261014090100_chiusura_accessi.sql` chiude il database: tutti leggono, solo l'admin scrive. Prelievi e rifornimenti passano dalle funzioni controllate. **Va applicata solo dopo che il sito nuovo è online**, perché il sito vecchio scriveva direttamente sulle tabelle.

L'admin è chi ha `ruolo = 'admin'` nella tabella `profili`.

## Email

`notify-admin` legge la chiave di Resend dal secret `RESEND_API_KEY` del progetto Supabase (Edge Functions → Secrets). Il destinatario è sempre l'admin, chi chiama la funzione non può cambiarlo.
