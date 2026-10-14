// Controllo giornaliero delle scadenze della cambusa (lo lancia la GitHub Action "Supabase Keep Alive").
// Manda una sola email all'admin per i prodotti che scadono tra 10 giorni, tra 3 giorni o oggi.
// Prima questo controllo lo faceva ogni telefono che apriva la cambusa, con email doppie.
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;
if (!url || !key) { console.error('Mancano SUPABASE_URL o SUPABASE_KEY'); process.exit(1); }
const sb = createClient(url, key);

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const giorno = n => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

async function main() {
    const avvisi = { [giorno(10)]: 'tra 10 giorni', [giorno(3)]: 'tra 3 giorni', [giorno(0)]: 'oggi' };
    const { data, error } = await sb.from('cambusa')
        .select('nome, quantita, unita, scadenza, stato')
        .in('scadenza', Object.keys(avvisi))
        .gt('quantita', 0);
    if (error) throw error;
    const prodotti = (data || []).filter(p => p.stato !== 'pending');
    if (!prodotti.length) { console.log('Nessuna scadenza da segnalare oggi.'); return; }

    const html = '<h3>Prodotti della cambusa in scadenza</h3><ul>' +
        prodotti.map(p => `<li><b>${esc(p.nome)}</b>: ${esc(p.quantita)} ${esc(p.unita)}, scade ${avvisi[p.scadenza]}</li>`).join('') + '</ul>';
    const res = await fetch(`${url}/functions/v1/notify-admin`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: 'Cambusa: prodotti in scadenza', details: html })
    });
    console.log(`Avviso inviato per ${prodotti.length} prodotti (risposta ${res.status}).`);
}

main().catch(e => { console.error('Errore controllo scadenze:', e.message); process.exit(1); });
