// =====================================================================
// Azimut.Arch · Armadio
// Negozio con zaino, richieste "Serve!", gestione admin (inventario,
// ordine al Centro Forniture, carico, kit, movimenti, statistiche).
// =====================================================================

const CATEGORIE = { LC: 'L/C', EG: 'E/G', RS: 'R/S', Capi: 'Capi', Generale: 'Generale' };
const ORDINE_CAT = ['LC', 'EG', 'RS', 'Capi', 'Generale'];

const state = {
    oggetti: [], mappa: new Map(),
    kit: [], compPerKit: new Map(),
    richieste: [], ordini: [],
    movimenti: null,                                   // caricati solo per l'admin
    zaino: store.get('zaino', []),                     // [{ tipo: 'item' | 'kit', id, qty }]
    filtro: { testo: '', categoria: 'tutte', esauriti: store.get('mostra_esauriti', false) },
    vista: 'negozio',
    tab: store.get('tab_admin', 'inventario'),
    inv: { testo: '', filtro: 'tutti' },
    carico: {},                                        // oggetto_id -> pezzi da caricare
    caricoTesto: '',
    bozza: store.get('bozza_ordine', {}),              // oggetto_id -> pezzi (modifiche alla proposta)
    statAnno: 'ultimi12',
    kitModifica: null,                                 // { id, nome, pezzi: [{ oggetto_id, qty }] }
    arrivo: null                                       // { ordine, qty: { id: n } }
};

// ---------- Utilità ----------
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const catDi = o => (CATEGORIE[o.categoria] ? o.categoria : 'Generale');
const disp = o => Number(o.quantita_disponibile) || 0;
const soglia = o => Number(o.soglia_minima) || 0;
const compDi = id => state.compPerKit.get(id) || [];
const bello = s => s.replace(/\bEG\b/g, 'E/G').replace(/\bLC\b/g, 'L/C').replace(/\bRS\b/g, 'R/S').replace(/Progressione Personale/i, 'Progressione personale');

function calcolaGruppi() {
    const primo = {};
    for (const o of state.oggetti) if (!o.nome.includes(':')) { const w = o.nome.trim().split(/\s+/)[0]; primo[w] = (primo[w] || 0) + 1; }
    for (const o of state.oggetti) {
        const n = o.nome.trim(), i = n.indexOf(':');
        if (i > 0) { o._gruppo = bello(n.slice(0, i).trim()); o._corto = n.slice(i + 1).trim(); continue; }
        const w = n.split(/\s+/)[0];
        o._gruppo = primo[w] >= 3 && n.length > w.length ? w : 'Altri distintivi';
        o._corto = bello(n);
    }
    for (const k of state.kit) {
        const conta = {};
        for (const c of compDi(k.id)) { const o = state.mappa.get(c.oggetto_id); if (o && catDi(o) !== 'Generale') conta[catDi(o)] = (conta[catDi(o)] || 0) + 1; }
        k._cat = Object.entries(conta).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Generale';
    }
}

// Pezzi già nello zaino per ogni oggetto (i kit contano i loro componenti)
function riservati() {
    const m = new Map();
    const add = (id, q) => m.set(id, (m.get(id) || 0) + q);
    for (const r of state.zaino) {
        if (r.tipo === 'item') add(r.id, r.qty);
        else for (const c of compDi(r.id)) add(c.oggetto_id, (c.quantita_necessaria || 1) * r.qty);
    }
    return m;
}
const rimasti = (o, ris) => disp(o) - (ris.get(o.id) || 0);
function kitMax(k, ris) {
    const comps = compDi(k.id);
    if (!comps.length) return 0;
    return Math.max(0, Math.min(...comps.map(c => { const o = state.mappa.get(c.oggetto_id); return o ? Math.floor(rimasti(o, ris) / (c.quantita_necessaria || 1)) : 0; })));
}
function kitMancanti(k, ris) {
    return compDi(k.id).filter(c => { const o = state.mappa.get(c.oggetto_id); return !o || rimasti(o, ris) < (c.quantita_necessaria || 1); })
        .map(c => state.mappa.get(c.oggetto_id)).filter(Boolean);
}
const qtaZaino = (tipo, id) => state.zaino.find(r => r.tipo === tipo && r.id === id)?.qty || 0;
function pezziZaino() { let n = 0; for (const v of riservati().values()) n += v; return n; }
const richiestaAperta = id => state.richieste.find(r => !r.completato && r.oggetto_id === id);
function inArrivo() {
    const m = new Map();
    for (const ord of state.ordini) if (ord.stato === 'inviato') for (const v of ord.voci || []) if (v.oggetto_id) m.set(v.oggetto_id, (m.get(v.oggetto_id) || 0) + Number(v.qty || 0));
    return m;
}

function stepper(tipo, id, q, puoPiu, etichetta) {
    return `<div class="stepper ${q > 0 ? 'attivo' : ''}" role="group" aria-label="${esc(etichetta)}">
        <button type="button" data-act="meno" data-tipo="${tipo}" data-ref="${id}" aria-label="Togli uno">${icon('meno')}</button>
        <output aria-live="polite">${q}</output>
        <button type="button" data-act="piu" data-tipo="${tipo}" data-ref="${id}" aria-label="Aggiungi uno" ${puoPiu ? '' : 'disabled'}>${icon('piu')}</button>
    </div>`;
}

// =====================================================================
// Dati
// =====================================================================
async function caricaDati() {
    ui.carica(true);
    const [o, k, c, r, ord] = await Promise.all([
        sb.from('oggetti').select('*').order('nome'),
        sb.from('pacchetti').select('*').order('nome'),
        sb.from('componenti_pacchetto').select('*'),
        sb.from('richieste').select('*').order('created_at', { ascending: false }).limit(200),
        sb.from('ordini_forniture').select('*').order('created_at', { ascending: false }).limit(30)
    ]);
    ui.carica(false);
    if (o.error) { ui.toast(errMsg(o.error), 'errore'); return; }
    state.oggetti = o.data || [];
    state.mappa = new Map(state.oggetti.map(x => [x.id, x]));
    state.kit = k.data || [];
    state.compPerKit = new Map();
    for (const x of c.data || []) { if (!state.compPerKit.has(x.pacchetto_id)) state.compPerKit.set(x.pacchetto_id, []); state.compPerKit.get(x.pacchetto_id).push(x); }
    state.richieste = (r.data || []).filter(x => !x.tipo || x.tipo === 'armadio');
    state.ordini = ord.error ? [] : (ord.data || []);
    // Toglie dallo zaino cose che non esistono più
    state.zaino = state.zaino.filter(z => z.tipo === 'item' ? state.mappa.has(z.id) : state.kit.some(x => x.id === z.id));
    salvaZaino();
    calcolaGruppi();
    $('#caricamento')?.remove();
    renderTutto();
}

function salvaZaino() { store.set('zaino', state.zaino); }

function renderTutto() {
    renderSottotitolo();
    renderNegozio();
    renderRichieste();
    renderBarra();
    if (ui.aperto('foglio-zaino')) renderZaino();
    if (state.vista === 'admin') renderAdmin();
}

function renderSottotitolo() {
    const ci = state.oggetti.filter(o => disp(o) > 0).length;
    $('#sottotitolo').textContent = state.oggetti.length ? `${ci} disponibili, ${state.oggetti.length - ci} esauriti` : 'Distintivi, specialità e kit promessa';
}

// =====================================================================
// Negozio
// =====================================================================
function corrisponde(testo, parole) { const t = norm(testo); return parole.every(p => t.includes(p)); }

function renderNegozio() {
    const ris = riservati();
    const f = state.filtro;
    const parole = norm(f.testo).split(/\s+/).filter(Boolean);
    const cerca = parole.length > 0;

    // Filtri per branca (solo quelle presenti)
    const presenti = ORDINE_CAT.filter(c => state.oggetti.some(o => catDi(o) === c));
    const contaCat = c => state.oggetti.filter(o => catDi(o) === c && disp(o) > 0).length;
    $('#chips-categorie').innerHTML = [`<button class="chip" data-act="categoria" data-cat="tutte" aria-pressed="${f.categoria === 'tutte'}">Tutti</button>`]
        .concat(presenti.map(c => `<button class="chip" data-act="categoria" data-cat="${c}" aria-pressed="${f.categoria === c}"><span class="pallino ${c}"></span>${CATEGORIE[c]} <span class="conta">${contaCat(c)}</span></button>`)).join('');
    const esauriti = state.oggetti.filter(o => disp(o) <= 0 && (f.categoria === 'tutte' || catDi(o) === f.categoria)).length;
    $('#mostra-esauriti').checked = f.esauriti;
    $('#mostra-esauriti-testo').textContent = `Mostra anche gli esauriti (${esauriti})`;

    // Kit
    const kits = state.kit.filter(k => (f.categoria === 'tutte' || k._cat === f.categoria) && (!cerca || corrisponde(k.nome + ' kit', parole)));
    $('#sez-kit').hidden = kits.length === 0;
    $('#conta-kit').textContent = kits.length;
    $('#kit-lista').innerHTML = kits.map(k => htmlKit(k, ris)).join('');

    // Distintivi raggruppati
    const visibili = state.oggetti.filter(o =>
        (f.categoria === 'tutte' || catDi(o) === f.categoria) &&
        (f.esauriti || cerca || disp(o) > 0 || qtaZaino('item', o.id) > 0) &&
        (!cerca || corrisponde(`${o.nome} ${o._gruppo} ${CATEGORIE[catDi(o)]}`, parole)));
    const gruppi = new Map();
    for (const o of visibili) { if (!gruppi.has(o._gruppo)) gruppi.set(o._gruppo, []); gruppi.get(o._gruppo).push(o); }
    const nomi = [...gruppi.keys()].sort((a, b) => (a === 'Altri distintivi') - (b === 'Altri distintivi') || a.localeCompare(b, 'it'));
    $('#gruppi').innerHTML = nomi.map(g => {
        const lista = gruppi.get(g).sort((a, b) => (disp(b) > 0) - (disp(a) > 0) || a._corto.localeCompare(b._corto, 'it'));
        return `<section class="sezione">
            <div class="sezione-testa"><h2>${esc(g)}</h2><span class="conta">${lista.length}</span></div>
            <div class="griglia">${lista.map(o => htmlScheda(o)).join('')}</div>
        </section>`;
    }).join('');
    aggiornaSchede(ris);
    $('#nessun-risultato').hidden = visibili.length > 0 || kits.length > 0;
}

function htmlScheda(o) {
    return `<article class="scheda" data-id="${o.id}">
        <div class="scheda-foto">${o.foto_url ? `<img src="${esc(o.foto_url)}" alt="" loading="lazy" decoding="async">` : icon('foto')}</div>
        <div class="scheda-corpo">
            <div class="scheda-gruppo"><span class="pallino ${catDi(o)}"></span>${CATEGORIE[catDi(o)]}</div>
            <h3 class="scheda-nome">${esc(o._corto)}</h3>
            <div class="scheda-piede"></div>
        </div>
    </article>`;
}

// Aggiorna solo numeri e bottoni delle schede (senza ridisegnare le foto)
function aggiornaSchede(ris = riservati()) {
    const arrivo = inArrivo();
    for (const el of $$('#gruppi .scheda')) {
        const o = state.mappa.get(el.dataset.id);
        if (!o) continue;
        const q = qtaZaino('item', o.id), r = rimasti(o, ris), tot = disp(o);
        el.classList.toggle('in-zaino', q > 0);
        el.classList.toggle('esaurita', tot <= 0);
        let html;
        if (tot <= 0) {
            const rich = richiestaAperta(o.id);
            html = `<div class="disp zero"><b>0</b>${arrivo.has(o.id) ? 'in arrivo' : 'esaurito'}</div>` +
                (arrivo.has(o.id) ? `<span class="etichetta accento">${icon('camion', 'ico-s')}Ordinato</span>`
                    : rich ? `<button class="btn btn-piccolo" disabled type="button">${icon('spunta', 'ico-s')}Già segnalato</button>`
                    : `<button class="btn btn-piccolo btn-largo" data-act="serve" data-ref="${o.id}" type="button">${icon('bandiera', 'ico-s')}Serve!</button>`);
        } else if (q > 0) {
            html = `<div class="disp ${r <= 0 ? 'zero' : ''}"><b>${r}</b>${r === 1 ? 'rimasto' : 'rimasti'}</div>` + stepper('item', o.id, q, r > 0, o.nome);
        } else {
            const basso = r <= soglia(o);
            html = `<div class="disp ${r <= 0 ? 'zero' : basso ? 'basso' : ''}"><b>${r}</b>${r === 1 ? 'disponibile' : 'disponibili'}</div>` +
                `<button class="btn btn-tenue btn-aggiungi" data-act="piu" data-tipo="item" data-ref="${o.id}" type="button" ${r > 0 ? '' : 'disabled'}>${icon('piu', 'ico-s')}Prendi</button>`;
        }
        $('.scheda-piede', el).innerHTML = html;
    }
}

function htmlKit(k, ris) {
    const comps = compDi(k.id);
    const q = qtaZaino('kit', k.id), max = kitMax(k, ris), manca = kitMancanti(k, ris);
    const nomi = comps.filter(c => state.mappa.has(c.oggetto_id))
        .map(c => ((c.quantita_necessaria || 1) > 1 ? `${c.quantita_necessaria}× ` : '') + state.mappa.get(c.oggetto_id).nome);
    let stato, azione;
    if (q > 0) { stato = max > 0 ? `<span class="etichetta ok">Ne puoi aggiungere ${max}</span>` : `<span class="etichetta">Pezzi finiti</span>`; azione = stepper('kit', k.id, q, max > 0, k.nome); }
    else if (max > 0) { stato = `<span class="etichetta ok">Pronti: ${max}</span>`; azione = `<button class="btn btn-tenue" data-act="piu" data-tipo="kit" data-ref="${k.id}" type="button">${icon('piu', 'ico-s')}Prendi il kit</button>`; }
    else {
        stato = `<span class="etichetta errore">Incompleto</span>`;
        const parziali = comps.length - manca.length;
        azione = parziali > 0 ? `<button class="btn" data-act="kit-parziale" data-ref="${k.id}" type="button">Prendi i ${parziali} pezzi che ci sono</button>` : '';
    }
    return `<article class="kit ${k._cat} ${q > 0 ? 'in-zaino' : ''}" data-kit="${k.id}">
        <div class="kit-testa"><h3>${esc(k.nome)}</h3>${stato}</div>
        <details class="kit-pezzi"><summary>${comps.length} pezzi nel kit</summary><ul>${nomi.map(n => `<li>${esc(n)}</li>`).join('')}</ul></details>
        ${q === 0 && manca.length ? `<p class="kit-manca">Manca: ${esc(manca.map(o => o.nome).join(', '))}</p>` : ''}
        ${azione}
    </article>`;
}

function aggiungi(tipo, id, delta) {
    const ris = riservati();
    if (delta > 0) {
        if (tipo === 'item') {
            const o = state.mappa.get(id);
            if (!o || rimasti(o, ris) <= 0) return ui.toast('Non ce ne sono altri', 'errore');
        } else {
            const k = state.kit.find(x => x.id === id);
            if (!k || kitMax(k, ris) <= 0) return ui.toast('Mancano pezzi per un altro kit', 'errore');
        }
        try { navigator.vibrate?.(8); } catch { /* niente vibrazione */ }
    }
    const r = state.zaino.find(x => x.tipo === tipo && x.id === id);
    if (r) { r.qty += delta; if (r.qty <= 0) state.zaino = state.zaino.filter(x => x !== r); }
    else if (delta > 0) state.zaino.push({ tipo, id, qty: delta });
    salvaZaino();
    // Il bottone toccato viene ridisegnato: rimetto il focus sul suo equivalente
    const a = document.activeElement?.dataset || {};
    const nelFoglio = !!document.activeElement?.closest('.foglio');
    aggiornaDopoZaino();
    if (a.act && a.ref) {
        const sel = `[data-act="${a.act}"][data-ref="${a.ref}"]`;
        const dove = nelFoglio ? $('#foglio-zaino') : $('#main');
        (dove?.querySelector(sel + ':not([disabled])') || dove?.querySelector(`[data-act="piu"][data-ref="${a.ref}"]`))?.focus({ preventScroll: true });
    }
}

function aggiornaDopoZaino() {
    const ris = riservati();
    aggiornaSchede(ris);
    for (const el of $$('#kit-lista .kit')) {
        const k = state.kit.find(x => x.id === el.dataset.kit);
        if (k) el.outerHTML = htmlKit(k, ris);
    }
    renderBarra();
    if (ui.aperto('foglio-zaino')) renderZaino();
}

function prendiPezziKit(id) {
    const ris = riservati();
    let presi = 0;
    for (const c of compDi(id)) {
        const o = state.mappa.get(c.oggetto_id), n = c.quantita_necessaria || 1;
        if (o && rimasti(o, ris) >= n) {
            const r = state.zaino.find(x => x.tipo === 'item' && x.id === o.id);
            if (r) r.qty += n; else state.zaino.push({ tipo: 'item', id: o.id, qty: n });
            ris.set(o.id, (ris.get(o.id) || 0) + n);
            presi += n;
        }
    }
    salvaZaino();
    aggiornaDopoZaino();
    ui.toast(`Nello zaino ${fmt.pezzi(presi)} del kit`);
}

// ---------- Barra e foglio dello zaino ----------
function renderBarra() {
    const pezzi = pezziZaino();
    const barra = $('#barra-zaino');
    barra.classList.toggle('nascosta', pezzi === 0 || state.vista !== 'negozio');
    $('#barra-conta').textContent = pezzi;
    const nk = state.zaino.filter(r => r.tipo === 'kit').reduce((a, r) => a + r.qty, 0);
    const ni = state.zaino.filter(r => r.tipo === 'item').reduce((a, r) => a + r.qty, 0);
    const parti = [];
    if (nk) parti.push(nk === 1 ? '1 kit' : `${nk} kit`);
    if (ni) parti.push(ni === 1 ? '1 distintivo' : `${ni} distintivi`);
    $('#barra-dettaglio').textContent = parti.join(' e ');
}

function renderZaino() {
    const ris = riservati();
    const el = $('#zaino-righe');
    if (!state.zaino.length) {
        el.innerHTML = `<div class="vuoto"><h3>Lo zaino è vuoto</h3><p>Tocca "Prendi" sui distintivi che ti servono.</p></div>`;
        $('#btn-preleva').disabled = true;
        $('#btn-preleva').textContent = 'Preleva';
        return;
    }
    const righe = state.zaino.map(r => {
        if (r.tipo === 'kit') {
            const k = state.kit.find(x => x.id === r.id);
            return `<div class="riga">${icon('pacco')}<div class="riga-testo"><div class="riga-titolo">${esc(k?.nome)}</div>
                <div class="riga-sotto">Kit da ${compDi(r.id).length} pezzi</div></div>${stepper('kit', r.id, r.qty, kitMax(k, ris) > 0, k?.nome || '')}</div>`;
        }
        const o = state.mappa.get(r.id), resto = rimasti(o, ris);
        return `<div class="riga">${o.foto_url ? `<img class="mini" src="${esc(o.foto_url)}" alt="">` : icon('foto')}
            <div class="riga-testo"><div class="riga-titolo">${esc(o.nome)}</div>
            <div class="riga-sotto">${resto < 0 ? `<span style="color:var(--errore)">Ne restano solo ${disp(o)}</span>` : `Ne restano ${resto}`}</div></div>
            ${stepper('item', r.id, r.qty, resto > 0, o.nome)}</div>`;
    });
    const pezzi = pezziZaino();
    el.innerHTML = `<div class="lista">${righe.join('')}</div>
        <p class="tenue piccolo" style="margin-top:10px">Escono dall'armadio ${fmt.pezzi(pezzi)} in tutto.</p>`;
    $('#btn-preleva').disabled = false;
    $('#btn-preleva').textContent = `Preleva ${fmt.pezzi(pezzi)}`;
}

async function preleva(e) {
    e.preventDefault();
    const nome = $('#zaino-nome').value.trim();
    const err = $('#zaino-errore');
    err.hidden = true;
    if (!nome) { err.textContent = 'Scrivi chi sta prelevando.'; err.hidden = false; return; }
    if (!state.zaino.length) return;
    store.set('nome', nome);
    const btn = $('#btn-preleva');
    btn.disabled = true; ui.carica(true);
    const { data, error } = await sb.rpc('preleva_armadio', { p_utente: nome, p_righe: state.zaino.map(r => ({ tipo: r.tipo, id: r.id, qty: r.qty })) });
    ui.carica(false); btn.disabled = false;
    if (error) {
        err.textContent = errMsg(error); err.hidden = false;
        await caricaDati();
        return;
    }
    const voci = data.voci || [], avvisi = data.avvisi || [];
    notifica(`Armadio: prelievo di ${nome}`,
        `${avvisi.length ? `<h3>Stanno finendo</h3><ul>${avvisi.map(a => `<li>${esc(a.nome)}: ne restano ${a.rimasti}</li>`).join('')}</ul><hr>` : ''}` +
        `<h3>Prelievo dall'Armadio</h3><p><b>Chi:</b> ${esc(nome)}</p><p>${esc(data.dettagli)}</p>` +
        `<ul>${voci.map(v => `<li>${esc(v.nome)} × ${v.qty}</li>`).join('')}</ul>`);
    state.zaino = []; salvaZaino();
    ui.chiudi();
    $('#esito-corpo').innerHTML = `
        <div style="display:flex;gap:12px;align-items:center;margin-bottom:12px">
            <span class="etichetta ok" style="padding:8px">${icon('spunta')}</span>
            <div><h2 id="esito-titolo">Fatto, buona strada!</h2><p class="tenue">Prelievo segnato a nome di ${esc(nome)}.</p></div>
        </div>
        <div class="lista">${voci.map(v => `<div class="riga"><div class="riga-testo"><div class="riga-titolo">${esc(v.nome)}</div></div><div class="riga-num">${v.qty}</div></div>`).join('')}</div>
        ${avvisi.length ? `<div class="avviso" style="margin-top:12px">${icon('attenzione')}<div>Stanno finendo: ${esc(avvisi.map(a => `${a.nome} (${a.rimasti})`).join(', '))}. L'admin riceve un avviso.</div></div>` : ''}`;
    ui.apri('foglio-esito');
    await caricaDati();
}

// ---------- "Serve!" ----------
let serveId = null;
async function serve(id) {
    serveId = id;
    const nome = store.get('nome', '');
    if (nome) return inviaServe(nome);
    const o = state.mappa.get(id);
    $('#serve-oggetto').textContent = o.nome;
    $('#serve-nome').value = '';
    ui.apri('foglio-serve');
}
async function inviaServe(nome) {
    const o = state.mappa.get(serveId);
    if (!o) return;
    ui.carica(true);
    const { error } = await sb.from('richieste').insert([{ oggetto: o.nome, oggetto_id: o.id, richiedente: nome || null, tipo: 'armadio' }]);
    ui.carica(false);
    if (error && error.code !== '23505') return ui.toast(errMsg(error), 'errore');
    if (ui.aperto('foglio-serve')) ui.chiudi();
    ui.toast(`Segnalato: ${o._corto}`);
    await ricaricaRichieste();
}

// =====================================================================
// Richieste
// =====================================================================
async function ricaricaRichieste() {
    const { data } = await sb.from('richieste').select('*').order('created_at', { ascending: false }).limit(200);
    state.richieste = (data || []).filter(x => !x.tipo || x.tipo === 'armadio');
    renderRichieste();
    aggiornaSchede();
    if (state.vista === 'admin' && state.tab === 'ordine') renderAdmin();
}

function renderRichieste() {
    const aperte = state.richieste.filter(r => !r.completato);
    const chiuse = state.richieste.filter(r => r.completato).slice(0, 10);
    const b = $('#bollino-richieste');
    b.hidden = aperte.length === 0; b.textContent = aperte.length;
    $('#conta-richieste').textContent = aperte.length || '';
    const riga = (r, aperta) => {
        const o = r.oggetto_id ? state.mappa.get(r.oggetto_id) : null;
        const chi = r.richiedente ? `Chiesto da ${esc(r.richiedente)}, ${fmt.quando(r.created_at)}` : `Chiesto ${fmt.quando(r.created_at)}`;
        return `<div class="riga ${aperta ? '' : 'fatta'}">
            ${o?.foto_url ? `<img class="mini" src="${esc(o.foto_url)}" alt="">` : icon('bandiera')}
            <div class="riga-testo"><div class="riga-titolo">${esc(r.oggetto)}</div><div class="riga-sotto">${chi}</div></div>
            ${auth.admin ? `<div class="riga-azioni">
                ${aperta ? `<button class="btn btn-icona btn-tenue" data-act="richiesta-fatta" data-ref="${r.id}" aria-label="Segna come preso" type="button">${icon('spunta')}</button>` : ''}
                <button class="btn btn-icona" data-act="richiesta-elimina" data-ref="${r.id}" aria-label="Elimina richiesta" type="button">${icon('cestino')}</button></div>` : ''}
        </div>`;
    };
    $('#richieste-aperte').innerHTML = aperte.length ? `<div class="lista">${aperte.map(r => riga(r, true)).join('')}</div>`
        : `<div class="vuoto"><h3>Non manca niente</h3><p>Quando qualcuno segnala che serve qualcosa, compare qui.</p></div>`;
    $('#richieste-chiuse').innerHTML = chiuse.length ? `<div class="lista">${chiuse.map(r => riga(r, false)).join('')}</div>` : `<p class="tenue">Ancora niente.</p>`;
}

async function inviaRichiesta(e) {
    e.preventDefault();
    const oggetto = $('#rich-oggetto').value.trim(), nome = $('#rich-nome').value.trim();
    if (!oggetto) return;
    if (nome) store.set('nome', nome);
    ui.carica(true);
    const { error } = await sb.from('richieste').insert([{ oggetto, richiedente: nome || null, tipo: 'armadio' }]);
    ui.carica(false);
    if (error) return ui.toast(errMsg(error), 'errore');
    $('#rich-oggetto').value = '';
    ui.toast('Richiesta inviata');
    await ricaricaRichieste();
}

// =====================================================================
// Navigazione
// =====================================================================
function nav(vista) {
    if (vista === 'admin' && !auth.admin) vista = 'negozio';
    state.vista = vista;
    for (const v of ['negozio', 'richieste', 'admin']) $('#vista-' + v).hidden = v !== vista;
    $$('.nav-voce').forEach(b => b.dataset.vista === vista ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'));
    try { history.replaceState(history.state, '', vista === 'negozio' ? location.pathname : '#' + vista); } catch { /* ignora */ }
    renderBarra();
    if (vista === 'admin') renderAdmin();
    window.scrollTo({ top: 0 });
}

// =====================================================================
// Gestione (admin)
// =====================================================================
async function caricaMovimenti(forza = false) {
    if (state.movimenti && !forza) return;
    const { data, error } = await sb.from('movimenti_armadio').select('*').order('created_at', { ascending: false }).limit(2000);
    if (error) { ui.toast(errMsg(error), 'errore'); state.movimenti = []; return; }
    state.movimenti = data || [];
}

async function renderAdmin() {
    $$('#tabs-admin .tab').forEach(t => t.setAttribute('aria-selected', t.dataset.tab === state.tab));
    const corpo = $('#admin-corpo');
    if (['ordine', 'movimenti', 'statistiche'].includes(state.tab) && !state.movimenti) {
        corpo.innerHTML = `<div class="scheletro" style="height:300px"></div>`;
        await caricaMovimenti();
    }
    ({ inventario: renderInventario, ordine: renderOrdine, carico: renderCarico, kit: renderKitAdmin,
       movimenti: renderMovimenti, statistiche: renderStatistiche })[state.tab]?.(corpo);
}

// ---------- Inventario ----------
function renderInventario(corpo) {
    const f = state.inv;
    const sotto = state.oggetti.filter(o => disp(o) > 0 && disp(o) <= soglia(o)).length;
    const zero = state.oggetti.filter(o => disp(o) <= 0).length;
    const noRiord = state.oggetti.filter(o => o.riordina === false).length;
    corpo.innerHTML = `
        <div style="display:flex;gap:8px;margin-bottom:4px">
            <div class="cerca" style="flex:1">${icon('cerca')}<input class="input" type="search" id="inv-cerca" placeholder="Cerca" value="${esc(f.testo)}"></div>
            <button class="btn btn-primario" data-act="nuovo-oggetto" type="button">${icon('piu', 'ico-s')}Nuovo</button>
        </div>
        <div class="chips" style="margin-bottom:12px">
            ${[['tutti', `Tutti ${state.oggetti.length}`], ['sotto', `Sotto soglia ${sotto}`], ['zero', `Esauriti ${zero}`], ['noriordina', `Da non riordinare ${noRiord}`]]
                .map(([k, t]) => `<button class="chip" data-act="inv-filtro" data-ref="${k}" aria-pressed="${f.filtro === k}">${t}</button>`).join('')}
        </div>
        <div class="lista" id="inv-lista"></div>`;
    renderInventarioLista();
}
function renderInventarioLista() {
    const f = state.inv, parole = norm(f.testo).split(/\s+/).filter(Boolean);
    const lista = state.oggetti.filter(o => corrisponde(o.nome, parole) &&
        (f.filtro === 'tutti' || (f.filtro === 'sotto' && disp(o) > 0 && disp(o) <= soglia(o)) || (f.filtro === 'zero' && disp(o) <= 0) || (f.filtro === 'noriordina' && o.riordina === false)));
    $('#inv-lista').innerHTML = lista.length ? lista.map(o => `
        <button class="riga" data-act="modifica-oggetto" data-ref="${o.id}" type="button">
            ${o.foto_url ? `<img class="mini" src="${esc(o.foto_url)}" alt="" loading="lazy">` : icon('foto')}
            <span class="riga-testo"><span class="riga-titolo" style="display:block">${esc(o.nome)}</span>
            <span class="riga-sotto" style="display:block">${CATEGORIE[catDi(o)]}, avviso sotto ${soglia(o)}${o.riordina === false ? ', non riordinare' : ''}</span></span>
            <span class="riga-num" style="color:${disp(o) <= 0 ? 'var(--errore)' : disp(o) <= soglia(o) ? 'var(--attenzione)' : 'inherit'}">${disp(o)}</span>
        </button>`).join('') : `<div class="vuoto"><p>Nessun oggetto.</p></div>`;
}

function apriOggetto(id) {
    const o = id ? state.mappa.get(id) : null;
    $('#oggetto-titolo').textContent = o ? 'Modifica oggetto' : 'Nuovo oggetto';
    $('#ogg-id').value = o?.id || '';
    $('#ogg-nome').value = o?.nome || '';
    $('#ogg-categoria').value = o ? catDi(o) : 'EG';
    $('#ogg-qta').value = o ? disp(o) : 0;
    $('#ogg-soglia').value = o ? soglia(o) : 2;
    $('#ogg-codice').value = o?.codice_fornitore || '';
    $('#ogg-riordina').checked = o ? o.riordina !== false : true;
    $('#ogg-foto').value = '';
    $('#ogg-foto-anteprima').src = o?.foto_url || 'icon-192.png';
    $('#ogg-errore').hidden = true;
    $('#btn-elimina-oggetto').hidden = !o;
    ui.apri('foglio-oggetto');
}

async function salvaOggetto(e) {
    e.preventDefault();
    const id = $('#ogg-id').value, err = $('#ogg-errore');
    err.hidden = true;
    const vecchio = id ? state.mappa.get(id) : null;
    const dati = {
        nome: $('#ogg-nome').value.trim(),
        categoria: $('#ogg-categoria').value,
        quantita_disponibile: parseInt($('#ogg-qta').value, 10) || 0,
        soglia_minima: parseInt($('#ogg-soglia').value, 10) || 0,
        codice_fornitore: $('#ogg-codice').value.trim() || null,
        riordina: $('#ogg-riordina').checked
    };
    if (!dati.nome) { err.textContent = 'Il nome è obbligatorio.'; err.hidden = false; return; }
    ui.carica(true);
    const file = $('#ogg-foto').files[0];
    if (file) {
        const nomeFile = `${Date.now()}_${file.name.replace(/[^\w.-]/g, '')}`;
        const up = await sb.storage.from(CONFIG.bucket).upload(nomeFile, file);
        if (up.error) { ui.carica(false); err.textContent = 'Foto non caricata: ' + errMsg(up.error); err.hidden = false; return; }
        dati.foto_url = sb.storage.from(CONFIG.bucket).getPublicUrl(nomeFile).data.publicUrl;
    }
    const res = id ? await sb.from('oggetti').update(dati).eq('id', id) : await sb.from('oggetti').insert([dati]);
    if (!res.error && vecchio && disp(vecchio) !== dati.quantita_disponibile) {
        const delta = dati.quantita_disponibile - disp(vecchio);
        await sb.from('movimenti_armadio').insert([{ utente: 'Admin', tipo: 'rettifica', dettagli: `Correzione: ${dati.nome} da ${disp(vecchio)} a ${dati.quantita_disponibile}`,
            voci: [{ oggetto_id: id, nome: dati.nome, qty: delta }] }]);
        state.movimenti = null;
    }
    ui.carica(false);
    if (res.error) { err.textContent = errMsg(res.error); err.hidden = false; return; }
    ui.chiudi();
    ui.toast(id ? 'Oggetto salvato' : 'Oggetto aggiunto');
    await caricaDati();
}

async function eliminaOggetto() {
    const id = $('#ogg-id').value, o = state.mappa.get(id);
    if (!o) return;
    const nei = state.kit.filter(k => compDi(k.id).some(c => c.oggetto_id === id)).map(k => k.nome);
    const ok = await ui.chiedi({ titolo: `Eliminare ${o.nome}?`, pericolo: true, ok: 'Elimina',
        testo: nei.length ? `Verrà tolto anche dai kit: ${esc(nei.join(', '))}.` : 'Non si può tornare indietro.' });
    if (!ok) return;
    ui.carica(true);
    const { error } = await sb.from('oggetti').delete().eq('id', id);
    ui.carica(false);
    if (error) return ui.toast(errMsg(error), 'errore');
    state.zaino = state.zaino.filter(z => !(z.tipo === 'item' && z.id === id)); salvaZaino();
    ui.chiudi();
    ui.toast('Oggetto eliminato');
    await caricaDati();
}

// ---------- Ordine al Centro Forniture ----------
function consumoUltimoAnno() {
    const da = Date.now() - 365 * 86400000, m = new Map();
    for (const mv of state.movimenti || []) {
        if (mv.tipo !== 'prelievo' || mv.annullato_il || !mv.voci || new Date(mv.created_at).getTime() < da) continue;
        for (const v of mv.voci) m.set(v.oggetto_id, (m.get(v.oggetto_id) || 0) + Number(v.qty || 0));
    }
    return m;
}

function proposteOrdine() {
    const arrivo = inArrivo(), consumo = consumoUltimoAnno();
    const richiesti = new Map();
    for (const r of state.richieste) if (!r.completato && r.oggetto_id) richiesti.set(r.oggetto_id, r);
    const righe = [];
    for (const o of state.oggetti) {
        const extra = Object.prototype.hasOwnProperty.call(state.bozza, 'extra:' + o.id);
        const daProporre = o.riordina !== false && !arrivo.has(o.id) && (disp(o) <= soglia(o) || richiesti.has(o.id));
        if (!daProporre && !extra) continue;
        const usati = consumo.get(o.id) || 0;
        const obiettivo = Math.max(soglia(o) * 2, usati, 1);
        const proposta = Math.max(1, obiettivo - disp(o));
        const motivi = [];
        motivi.push(disp(o) <= 0 ? 'Esaurito' : `Ne restano ${disp(o)}`);
        if (richiesti.has(o.id)) motivi.push(richiesti.get(o.id).richiedente ? `chiesto da ${richiesti.get(o.id).richiedente}` : 'richiesto');
        if (usati) motivi.push(`usati ${usati} nell'ultimo anno`);
        if (extra) motivi.push('aggiunto a mano');
        const q = state.bozza[o.id] ?? (extra ? state.bozza['extra:' + o.id] : proposta);
        righe.push({ o, q, motivi });
    }
    return righe;
}
function salvaBozza() { store.set('bozza_ordine', state.bozza); }

function testoOrdine(righe) {
    const dentro = righe.filter(r => r.q > 0);
    const tot = dentro.reduce((a, r) => a + r.q, 0);
    return `Ordine materiale – Azimut.Arch\n${new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}\n\n` +
        dentro.map(r => `• ${r.q} × ${r.o.nome}${r.o.codice_fornitore ? ` (cod. ${r.o.codice_fornitore})` : ''}`).join('\n') +
        `\n\nTotale: ${fmt.pezzi(tot)}`;
}

function renderOrdine(corpo) {
    const inviati = state.ordini.filter(o => o.stato === 'inviato');
    const righe = proposteOrdine();
    const dentro = righe.filter(r => r.q > 0);
    const tot = dentro.reduce((a, r) => a + r.q, 0);
    const perCat = new Map();
    for (const r of righe) { const c = catDi(r.o); if (!perCat.has(c)) perCat.set(c, []); perCat.get(c).push(r); }

    const htmlInviati = inviati.map(ord => {
        const pezzi = (ord.voci || []).reduce((a, v) => a + Number(v.qty || 0), 0);
        return `<div class="riquadro" style="margin-bottom:14px">
            <div class="sezione-testa"><h3>${icon('camion', 'ico-s')} Ordine in arrivo</h3><span class="conta">${fmt.pezzi(pezzi)}</span></div>
            <p class="tenue piccolo" style="margin-bottom:10px">Inviato il ${fmt.data(ord.inviato_il || ord.created_at)}</p>
            <details style="margin-bottom:12px"><summary style="cursor:pointer;font-weight:700">Vedi cosa hai ordinato</summary>
                <ul style="margin:8px 0 0;padding-left:20px">${(ord.voci || []).map(v => `<li>${v.qty} × ${esc(v.nome)}</li>`).join('')}</ul></details>
            <div class="fila-btn">
                <button class="btn btn-primario" data-act="ordine-arrivato" data-ref="${ord.id}" type="button">È arrivato</button>
                <button class="btn" data-act="ordine-annulla" data-ref="${ord.id}" type="button">Annulla ordine</button>
            </div>
        </div>`;
    }).join('');

    const gruppi = ORDINE_CAT.filter(c => perCat.has(c)).map(c => {
        const lista = perCat.get(c).sort((a, b) => a.o.nome.localeCompare(b.o.nome, 'it'));
        const n = lista.filter(r => r.q > 0).length;
        return `<div class="lista-titolo" style="display:flex;align-items:center;gap:8px"><span class="pallino ${c}"></span>
                <span style="flex:1">${CATEGORIE[c]}: ${n} di ${lista.length}</span>
                <button class="btn btn-testo btn-piccolo" data-act="ordine-gruppo" data-ref="${c}" data-val="${n > 0 ? 0 : 1}" type="button">${n > 0 ? 'Togli tutti' : 'Rimetti tutti'}</button></div>` +
            lista.map(r => `<div class="riga">
                <div class="riga-testo"><div class="riga-titolo">${esc(r.o.nome)}</div><div class="riga-sotto">${esc(r.motivi.join(', '))}</div>
                    <button class="btn btn-testo btn-piccolo" style="padding:0;min-height:30px" data-act="non-riordinare" data-ref="${r.o.id}" type="button">Non riordinarlo più</button></div>
                <div style="width:132px;flex:none">${stepperOrdine(r.o.id, r.q)}</div>
            </div>`).join('');
    }).join('');

    corpo.innerHTML = `${htmlInviati}
        <div class="sezione-testa"><h2>Prossimo ordine</h2><span class="conta">${fmt.pezzi(tot)}</span></div>
        <p class="tenue" style="margin-bottom:12px">Ho messo quello che è esaurito, sotto soglia o richiesto. Cambia le quantità e manda la lista al Centro Forniture.</p>
        ${righe.length ? `<div class="lista">${gruppi}</div>` : `<div class="vuoto"><h3>Non serve ordinare niente</h3><p>Tutto è sopra la soglia di avviso.</p></div>`}
        <div class="riquadro" style="margin-top:14px">
            <label class="campo" style="margin-bottom:8px"><span>Aggiungi altro all'ordine</span>
                <div class="cerca">${icon('cerca')}<input class="input" type="search" id="ordine-cerca" placeholder="Cerca un oggetto" autocomplete="off"></div></label>
            <div id="ordine-risultati" class="lista" hidden></div>
        </div>
        <div class="fila-btn" style="margin-top:16px">
            <button class="btn" data-act="ordine-copia" type="button" ${tot ? '' : 'disabled'}>${icon('copia', 'ico-s')}Copia testo</button>
            <button class="btn" data-act="ordine-condividi" type="button" ${tot ? '' : 'disabled'}>${icon('condividi', 'ico-s')}Condividi</button>
        </div>
        <button class="btn btn-primario btn-grande btn-largo" style="margin-top:8px" data-act="ordine-invia" type="button" ${tot ? '' : 'disabled'}>Segna come inviato</button>`;
}
function stepperOrdine(id, q) {
    return `<div class="stepper ${q > 0 ? 'attivo' : ''}">
        <button type="button" data-act="ordine-qta" data-ref="${id}" data-val="${Math.max(0, q - 1)}" aria-label="Togli uno">${icon('meno')}</button>
        <output>${q}</output>
        <button type="button" data-act="ordine-qta" data-ref="${id}" data-val="${q + 1}" aria-label="Aggiungi uno">${icon('piu')}</button></div>`;
}

async function inviaOrdine() {
    const righe = proposteOrdine().filter(r => r.q > 0);
    if (!righe.length) return;
    const ok = await ui.chiedi({ titolo: 'Ordine inviato?', ok: 'Sì, è inviato',
        testo: `Segno come ordinati ${fmt.pezzi(righe.reduce((a, r) => a + r.q, 0))}. Quando arriva il pacco tocca "È arrivato" e li carico nell'armadio.` });
    if (!ok) return;
    ui.carica(true);
    const { error } = await sb.from('ordini_forniture').insert([{ stato: 'inviato', inviato_il: new Date().toISOString(),
        voci: righe.map(r => ({ oggetto_id: r.o.id, nome: r.o.nome, codice: r.o.codice_fornitore || null, qty: r.q })) }]);
    ui.carica(false);
    if (error) return ui.toast(errMsg(error), 'errore');
    state.bozza = {}; salvaBozza();
    ui.toast('Ordine segnato come inviato');
    await caricaDati();
}

function apriArrivo(id) {
    const ord = state.ordini.find(o => String(o.id) === String(id));
    if (!ord) return;
    state.arrivo = { ordine: ord, qty: Object.fromEntries((ord.voci || []).map(v => [v.oggetto_id, Number(v.qty) || 0])) };
    renderArrivo();
    ui.apri('foglio-arrivo');
}
function renderArrivo() {
    const a = state.arrivo;
    $('#arrivo-righe').innerHTML = (a.ordine.voci || []).map(v => `<div class="riga">
        <div class="riga-testo"><div class="riga-titolo">${esc(v.nome)}</div><div class="riga-sotto">Ordinati ${v.qty}</div></div>
        <div style="width:132px;flex:none"><div class="stepper ${a.qty[v.oggetto_id] > 0 ? 'attivo' : ''}">
            <button type="button" data-act="arrivo-qta" data-ref="${v.oggetto_id}" data-val="${Math.max(0, a.qty[v.oggetto_id] - 1)}" aria-label="Togli uno">${icon('meno')}</button>
            <output>${a.qty[v.oggetto_id]}</output>
            <button type="button" data-act="arrivo-qta" data-ref="${v.oggetto_id}" data-val="${a.qty[v.oggetto_id] + 1}" aria-label="Aggiungi uno">${icon('piu')}</button></div></div>
    </div>`).join('');
    const tot = Object.values(a.qty).reduce((x, y) => x + y, 0);
    $('#btn-conferma-arrivo').textContent = `Carica ${fmt.pezzi(tot)} nell'armadio`;
    $('#btn-conferma-arrivo').disabled = tot === 0;
}
async function confermaArrivo() {
    const a = state.arrivo;
    const voci = Object.entries(a.qty).filter(([, q]) => q > 0).map(([oggetto_id, qty]) => ({ oggetto_id, qty }));
    if (!voci.length) return;
    ui.carica(true);
    const { error } = await sb.rpc('carica_armadio', { p_voci: voci, p_nota: 'Ordine arrivato', p_ordine_id: a.ordine.id });
    ui.carica(false);
    if (error) return ui.toast(errMsg(error), 'errore');
    ui.chiudi();
    ui.toast('Ordine caricato nell\'armadio');
    state.movimenti = null;
    await caricaDati();
}

// ---------- Carico veloce ----------
function renderCarico(corpo) {
    corpo.innerHTML = `
        <p class="tenue" style="margin-bottom:12px">Hai comprato o ricevuto materiale fuori da un ordine? Segna quanti pezzi metti nell'armadio.</p>
        <div class="cerca" style="margin-bottom:12px">${icon('cerca')}<input class="input" type="search" id="carico-cerca" placeholder="Cerca" value="${esc(state.caricoTesto)}"></div>
        <div class="lista" id="carico-lista"></div>
        <button class="btn btn-primario btn-grande btn-largo" style="margin-top:14px;position:sticky;bottom:calc(var(--nav-h) + 12px + var(--safe-b))" data-act="conferma-carico" id="btn-carico" type="button"></button>`;
    renderCaricoLista();
}
function renderCaricoLista() {
    const parole = norm(state.caricoTesto).split(/\s+/).filter(Boolean);
    const lista = state.oggetti.filter(o => corrisponde(o.nome, parole) || state.carico[o.id] > 0)
        .sort((a, b) => (state.carico[b.id] > 0) - (state.carico[a.id] > 0) || (disp(a) - soglia(a)) - (disp(b) - soglia(b)) || a.nome.localeCompare(b.nome, 'it'));
    $('#carico-lista').innerHTML = lista.slice(0, 80).map(o => {
        const q = state.carico[o.id] || 0;
        return `<div class="riga"><div class="riga-testo"><div class="riga-titolo">${esc(o.nome)}</div><div class="riga-sotto">Ora ${disp(o)}${q ? `, dopo ${disp(o) + q}` : ''}</div></div>
            <div style="width:132px;flex:none"><div class="stepper ${q ? 'attivo' : ''}">
                <button type="button" data-act="carico-qta" data-ref="${o.id}" data-val="${Math.max(0, q - 1)}" aria-label="Togli uno">${icon('meno')}</button>
                <output>${q}</output>
                <button type="button" data-act="carico-qta" data-ref="${o.id}" data-val="${q + 1}" aria-label="Aggiungi uno">${icon('piu')}</button></div></div></div>`;
    }).join('') || `<div class="vuoto"><p>Nessun oggetto.</p></div>`;
    const tot = Object.values(state.carico).reduce((a, b) => a + b, 0);
    const b = $('#btn-carico');
    b.textContent = tot ? `Carica ${fmt.pezzi(tot)}` : 'Scegli cosa caricare';
    b.disabled = !tot;
}
async function confermaCarico() {
    const voci = Object.entries(state.carico).filter(([, q]) => q > 0).map(([oggetto_id, qty]) => ({ oggetto_id, qty }));
    if (!voci.length) return;
    ui.carica(true);
    const { error } = await sb.rpc('carica_armadio', { p_voci: voci, p_nota: 'Rifornimento' });
    ui.carica(false);
    if (error) return ui.toast(errMsg(error), 'errore');
    state.carico = {}; state.caricoTesto = ''; state.movimenti = null;
    ui.toast(`Caricati ${fmt.pezzi(voci.reduce((a, v) => a + v.qty, 0))}`);
    await caricaDati();
}

// ---------- Kit ----------
function renderKitAdmin(corpo) {
    corpo.innerHTML = `
        <div class="sezione-testa"><h2>Kit</h2><button class="btn btn-primario" data-act="nuovo-kit" type="button">${icon('piu', 'ico-s')}Nuovo kit</button></div>
        <p class="tenue" style="margin-bottom:12px">Un kit è un gruppo di pezzi che si prendono insieme, come quelli per la promessa.</p>
        ${state.kit.length ? `<div class="lista">${state.kit.map(k => `
            <button class="riga" data-act="modifica-kit" data-ref="${k.id}" type="button">${icon('pacco')}
                <span class="riga-testo"><span class="riga-titolo" style="display:block">${esc(k.nome)}</span>
                <span class="riga-sotto" style="display:block">${compDi(k.id).length} pezzi, pronti ${kitMax(k, new Map())}</span></span>${icon('avanti')}</button>`).join('')}</div>`
            : `<div class="vuoto"><h3>Nessun kit</h3></div>`}`;
}
function apriKit(id) {
    const k = id ? state.kit.find(x => x.id === id) : null;
    state.kitModifica = { id: k?.id || null, pezzi: k ? compDi(k.id).map(c => ({ oggetto_id: c.oggetto_id, qty: c.quantita_necessaria || 1 })) : [] };
    $('#kit-titolo').textContent = k ? 'Modifica kit' : 'Nuovo kit';
    $('#kit-nome').value = k?.nome || '';
    $('#kit-cerca').value = '';
    $('#kit-risultati').hidden = true;
    $('#kit-errore').hidden = true;
    $('#btn-elimina-kit').hidden = !k;
    renderKitPezzi();
    ui.apri('foglio-kit');
}
function renderKitPezzi() {
    const p = state.kitModifica.pezzi;
    $('#kit-conta-pezzi').textContent = p.length ? fmt.pezzi(p.reduce((a, x) => a + x.qty, 0)) : '';
    $('#kit-pezzi').innerHTML = p.length ? p.map(x => {
        const o = state.mappa.get(x.oggetto_id);
        return `<div class="riga"><div class="riga-testo"><div class="riga-titolo">${esc(o?.nome || '?')}</div><div class="riga-sotto">Disponibili ${o ? disp(o) : 0}</div></div>
            <div style="width:132px;flex:none"><div class="stepper attivo">
                <button type="button" data-act="kit-pezzo" data-ref="${x.oggetto_id}" data-val="${x.qty - 1}" aria-label="Togli uno">${icon(x.qty > 1 ? 'meno' : 'cestino')}</button>
                <output>${x.qty}</output>
                <button type="button" data-act="kit-pezzo" data-ref="${x.oggetto_id}" data-val="${x.qty + 1}" aria-label="Aggiungi uno">${icon('piu')}</button></div></div></div>`;
    }).join('') : `<p class="tenue" style="padding:14px">Ancora nessun pezzo: cercalo qui sotto.</p>`;
}
function renderKitRisultati() {
    const parole = norm($('#kit-cerca').value).split(/\s+/).filter(Boolean);
    const box = $('#kit-risultati');
    if (!parole.length) { box.hidden = true; return; }
    const gia = new Set(state.kitModifica.pezzi.map(x => x.oggetto_id));
    const lista = state.oggetti.filter(o => !gia.has(o.id) && corrisponde(o.nome, parole)).slice(0, 8);
    box.hidden = false;
    box.innerHTML = lista.length ? lista.map(o => `<button class="riga" data-act="kit-aggiungi" data-ref="${o.id}" type="button">${icon('piu')}<span class="riga-testo">${esc(o.nome)}</span></button>`).join('')
        : `<p class="tenue" style="padding:12px 14px">Nessun oggetto con questo nome.</p>`;
}
async function salvaKit() {
    const km = state.kitModifica, nome = $('#kit-nome').value.trim(), err = $('#kit-errore');
    err.hidden = true;
    if (!nome || !km.pezzi.length) { err.textContent = 'Serve un nome e almeno un pezzo.'; err.hidden = false; return; }
    ui.carica(true);
    let id = km.id, res;
    if (id) res = await sb.from('pacchetti').update({ nome }).eq('id', id);
    else { res = await sb.from('pacchetti').insert([{ nome }]).select(); id = res.data?.[0]?.id; }
    if (!res.error && id) {
        res = await sb.from('componenti_pacchetto').delete().eq('pacchetto_id', id);
        if (!res.error) res = await sb.from('componenti_pacchetto').insert(km.pezzi.map(x => ({ pacchetto_id: id, oggetto_id: x.oggetto_id, quantita_necessaria: x.qty })));
    }
    ui.carica(false);
    if (res.error) { err.textContent = errMsg(res.error); err.hidden = false; return; }
    ui.chiudi();
    ui.toast('Kit salvato');
    await caricaDati();
}
async function eliminaKit() {
    const km = state.kitModifica, k = state.kit.find(x => x.id === km.id);
    if (!k || !await ui.chiedi({ titolo: `Eliminare il kit ${k.nome}?`, testo: 'I pezzi restano nell\'armadio.', ok: 'Elimina', pericolo: true })) return;
    ui.carica(true);
    const { error } = await sb.from('pacchetti').delete().eq('id', k.id);
    ui.carica(false);
    if (error) return ui.toast(errMsg(error), 'errore');
    state.zaino = state.zaino.filter(z => !(z.tipo === 'kit' && z.id === k.id)); salvaZaino();
    ui.chiudi();
    ui.toast('Kit eliminato');
    await caricaDati();
}

// ---------- Movimenti ----------
let movTesto = '';
function pezziMov(m) { return (m.voci || []).reduce((a, v) => a + Number(v.qty || 0), 0); }
function renderMovimenti(corpo) {
    corpo.innerHTML = `<div class="cerca" style="margin-bottom:12px">${icon('cerca')}<input class="input" type="search" id="mov-cerca" placeholder="Cerca per nome o distintivo" value="${esc(movTesto)}"></div>
        <div id="mov-lista"></div>`;
    renderMovimentiLista();
}
function renderMovimentiLista() {
    const parole = norm(movTesto).split(/\s+/).filter(Boolean);
    const lista = (state.movimenti || []).filter(m => corrisponde(`${m.utente} ${m.dettagli}`, parole)).slice(0, 200);
    const ico = { prelievo: 'zaino', carico: 'camion', rettifica: 'matita' };
    $('#mov-lista').innerHTML = lista.length ? `<div class="lista">${lista.map(m => {
        const n = pezziMov(m), segno = m.tipo === 'prelievo' ? '−' : m.tipo === 'carico' ? '+' : n >= 0 ? '+' : '−';
        return `<button class="riga ${m.annullato_il ? 'annullata' : ''}" data-act="apri-movimento" data-ref="${m.id}" type="button">${icon(ico[m.tipo] || 'lista')}
            <span class="riga-testo"><span class="riga-titolo" style="display:block">${esc(m.tipo === 'carico' ? 'Carico' : m.tipo === 'rettifica' ? 'Correzione' : m.utente || 'Senza nome')}</span>
            <span class="riga-sotto" style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${m.annullato_il ? 'Annullato. ' : ''}${fmt.quando(m.created_at)}: ${esc(m.dettagli || '')}</span></span>
            <span class="riga-num">${m.voci ? segno + Math.abs(n) : ''}</span></button>`;
    }).join('')}</div>` : `<div class="vuoto"><h3>Nessun movimento</h3></div>`;
}
function apriMovimento(id) {
    const m = (state.movimenti || []).find(x => String(x.id) === String(id));
    if (!m) return;
    const annullabile = !m.annullato_il && m.voci && ((m.tipo === 'prelievo' && m.righe) || m.tipo === 'carico');
    $('#mov-titolo').textContent = m.tipo === 'carico' ? 'Carico' : m.tipo === 'rettifica' ? 'Correzione' : `Prelievo di ${m.utente || 'sconosciuto'}`;
    $('#mov-corpo').innerHTML = `
        <p class="tenue" style="margin-bottom:12px">${fmt.giorno(m.created_at)}, ore ${fmt.ora(m.created_at)}${m.annullato_il ? `. Annullato il ${fmt.data(m.annullato_il)}` : ''}</p>
        ${m.righe ? `<h3 style="margin-bottom:8px">Nello zaino</h3><div class="lista" style="margin-bottom:14px">${m.righe.map(r => `<div class="riga">${icon(r.tipo === 'kit' ? 'pacco' : 'zaino')}<div class="riga-testo"><div class="riga-titolo">${esc(r.nome)}</div></div><div class="riga-num">${r.qty}</div></div>`).join('')}</div>` : ''}
        ${m.voci ? `<h3 style="margin-bottom:8px">Pezzi ${m.tipo === 'carico' ? 'entrati' : m.tipo === 'rettifica' ? 'corretti' : 'usciti'}</h3><div class="lista">${m.voci.map(v => `<div class="riga"><div class="riga-testo"><div class="riga-titolo">${esc(v.nome)}</div></div><div class="riga-num">${v.qty}</div></div>`).join('')}</div>`
            : `<p>${esc(m.dettagli || '')}</p>`}
        ${!annullabile && !m.annullato_il && m.tipo === 'prelievo' ? `<p class="tenue piccolo" style="margin-top:12px">Questo prelievo è stato fatto con la versione vecchia del sito: se va annullato, correggi le quantità a mano dall'inventario.</p>` : ''}`;
    $('#mov-piede').innerHTML = annullabile
        ? `<button class="btn btn-pericolo btn-grande" data-act="annulla-movimento" data-ref="${m.id}" type="button">${icon('annulla')}${m.tipo === 'carico' ? 'Annulla questo carico' : 'Annulla prelievo e rimetti i pezzi'}</button>`
        : `<button class="btn btn-grande" data-chiudi type="button">Chiudi</button>`;
    ui.apri('foglio-movimento');
}
async function annullaMovimento(id) {
    const m = state.movimenti.find(x => String(x.id) === String(id));
    const ok = await ui.chiedi({ titolo: m.tipo === 'carico' ? 'Annullare il carico?' : 'Annullare il prelievo?', ok: 'Annulla movimento', annulla: 'Lascia così', pericolo: true,
        testo: m.tipo === 'carico' ? `Tolgo dall'armadio ${fmt.pezzi(pezziMov(m))}.` : `Rimetto nell'armadio ${fmt.pezzi(pezziMov(m))}.` });
    if (!ok) return;
    ui.carica(true);
    const { error } = await sb.rpc('annulla_movimento_armadio', { p_id: m.id });
    ui.carica(false);
    if (error) return ui.toast(errMsg(error), 'errore');
    ui.chiudi();
    ui.toast('Movimento annullato');
    await caricaMovimenti(true);
    await caricaDati();
}

// ---------- Statistiche ----------
function renderStatistiche(corpo) {
    const prelievi = (state.movimenti || []).filter(m => m.tipo === 'prelievo' && !m.annullato_il && m.voci);
    const anni = [...new Set(prelievi.map(m => new Date(m.created_at).getFullYear()))].sort((a, b) => b - a);
    const sel = state.statAnno;
    const ora = new Date();
    const inPeriodo = m => {
        const d = new Date(m.created_at);
        return sel === 'ultimi12' ? d >= new Date(ora.getFullYear() - 1, ora.getMonth() + 1, 1) : d.getFullYear() === Number(sel);
    };
    const scelti = prelievi.filter(inPeriodo);
    const perOgg = new Map(), perCat = new Map(), perMese = new Array(12).fill(0);
    let pezzi = 0;
    for (const m of scelti) {
        const d = new Date(m.created_at);
        const idx = sel === 'ultimi12' ? (d.getMonth() - ora.getMonth() + 11 + 12) % 12 : d.getMonth();
        for (const v of m.voci) {
            const q = Number(v.qty || 0); pezzi += q; perMese[idx] += q;
            perOgg.set(v.oggetto_id, { nome: state.mappa.get(v.oggetto_id)?.nome || v.nome, q: (perOgg.get(v.oggetto_id)?.q || 0) + q });
            const o = state.mappa.get(v.oggetto_id), c = o ? catDi(o) : 'Generale';
            perCat.set(c, (perCat.get(c) || 0) + q);
        }
    }
    const top = [...perOgg.values()].sort((a, b) => b.q - a.q).slice(0, 12);
    const maxTop = top[0]?.q || 1, maxMese = Math.max(1, ...perMese), maxCat = Math.max(1, ...perCat.values());
    const nomiMesi = Array.from({ length: 12 }, (_, i) => {
        const m = sel === 'ultimi12' ? (ora.getMonth() + 1 + i) % 12 : i;
        return new Date(2026, m, 1).toLocaleDateString('it-IT', { month: 'short' }).replace('.', '');
    });
    const primo = prelievi.length ? prelievi[prelievi.length - 1].created_at : null;
    corpo.innerHTML = `
        <div class="chips" style="margin:0 -16px 14px">
            <button class="chip" data-act="stat-anno" data-ref="ultimi12" aria-pressed="${sel === 'ultimi12'}">Ultimi 12 mesi</button>
            ${anni.map(a => `<button class="chip" data-act="stat-anno" data-ref="${a}" aria-pressed="${String(sel) === String(a)}">${a}</button>`).join('')}
        </div>
        <div class="cifre">
            <div class="cifra"><b>${pezzi}</b><span>pezzi usciti</span></div>
            <div class="cifra"><b>${scelti.length}</b><span>prelievi</span></div>
            <div class="cifra"><b>${perOgg.size}</b><span>distintivi diversi</span></div>
        </div>
        ${pezzi ? `
        <section class="sezione riquadro"><h3 style="margin-bottom:12px">I più usati</h3>
            <div class="barre">${top.map(t => `<div class="barra"><span class="barra-nome">${esc(t.nome)}</span><span class="barra-val">${t.q}</span>
                <span class="barra-traccia"><i style="width:${(t.q / maxTop * 100).toFixed(1)}%"></i></span></div>`).join('')}</div></section>
        <section class="sezione riquadro"><h3 style="margin-bottom:12px">Mese per mese</h3>
            <div class="mesi">${perMese.map((v, i) => `<div class="mese" title="${nomiMesi[i]}: ${v}"><i style="height:${(v / maxMese * 100).toFixed(1)}%"></i><span>${nomiMesi[i]}</span></div>`).join('')}</div></section>
        <section class="sezione riquadro"><h3 style="margin-bottom:12px">Per branca</h3>
            <div class="barre">${ORDINE_CAT.filter(c => perCat.get(c)).map(c => `<div class="barra"><span class="barra-nome"><span class="pallino ${c}" style="display:inline-block;margin-right:6px"></span>${CATEGORIE[c]}</span><span class="barra-val">${perCat.get(c)}</span>
                <span class="barra-traccia"><i style="width:${(perCat.get(c) / maxCat * 100).toFixed(1)}%"></i></span></div>`).join('')}</div></section>`
        : `<div class="vuoto"><h3>Nessun prelievo in questo periodo</h3></div>`}
        ${primo ? `<p class="tenue piccolo" style="margin-top:14px">I dati partono dal ${fmt.data(primo)}. I prelievi annullati non contano.</p>` : ''}`;
}

// =====================================================================
// Eventi
// =====================================================================
function collegaEventi() {
    azioni(document.body, {
        piu: el => aggiungi(el.dataset.tipo, el.dataset.ref, 1),
        meno: el => aggiungi(el.dataset.tipo, el.dataset.ref, -1),
        'kit-parziale': el => prendiPezziKit(el.dataset.ref),
        serve: el => serve(el.dataset.ref),
        categoria: el => { state.filtro.categoria = el.dataset.cat; renderNegozio(); },
        'apri-zaino': () => { renderZaino(); $('#zaino-nome').value = store.get('nome', ''); $('#zaino-errore').hidden = true; ui.apri('foglio-zaino'); },
        'svuota-zaino': async () => {
            if (!state.zaino.length || !await ui.chiedi({ titolo: 'Svuotare lo zaino?', ok: 'Svuota', pericolo: true })) return;
            state.zaino = []; salvaZaino(); aggiornaDopoZaino();
        },
        'vai-richieste': () => { $('#rich-oggetto').value = state.filtro.testo; nav('richieste'); $('#rich-oggetto').focus(); },
        'richiesta-fatta': async el => { const { error } = await sb.from('richieste').update({ completato: true }).eq('id', el.dataset.ref); if (error) ui.toast(errMsg(error), 'errore'); await ricaricaRichieste(); },
        'richiesta-elimina': async el => {
            if (!await ui.chiedi({ titolo: 'Eliminare la richiesta?', ok: 'Elimina', pericolo: true })) return;
            const { error } = await sb.from('richieste').delete().eq('id', el.dataset.ref); if (error) ui.toast(errMsg(error), 'errore'); await ricaricaRichieste();
        },
        // admin
        'inv-filtro': el => { state.inv.filtro = el.dataset.ref; renderAdmin(); },
        'nuovo-oggetto': () => apriOggetto(null),
        'modifica-oggetto': el => apriOggetto(el.dataset.ref),
        'elimina-oggetto': () => eliminaOggetto(),
        'ordine-qta': el => { state.bozza[el.dataset.ref] = Number(el.dataset.val); salvaBozza(); renderAdmin(); },
        'ordine-gruppo': el => {
            for (const r of proposteOrdine()) if (catDi(r.o) === el.dataset.ref) {
                if (el.dataset.val === '0') state.bozza[r.o.id] = 0; else delete state.bozza[r.o.id];
            }
            salvaBozza(); renderAdmin();
        },
        'ordine-aggiungi': el => { state.bozza['extra:' + el.dataset.ref] = 1; salvaBozza(); renderAdmin(); },
        'non-riordinare': async el => {
            const o = state.mappa.get(el.dataset.ref);
            const { error } = await sb.from('oggetti').update({ riordina: false }).eq('id', o.id);
            if (error) return ui.toast(errMsg(error), 'errore');
            o.riordina = false; delete state.bozza['extra:' + o.id]; salvaBozza();
            ui.toast(`${o._corto}: non lo propongo più. Puoi cambiarlo dall'inventario.`);
            renderAdmin();
        },
        'ordine-copia': () => copiaTesto(testoOrdine(proposteOrdine())),
        'ordine-condividi': () => condividiTesto('Ordine materiale', testoOrdine(proposteOrdine())),
        'ordine-invia': () => inviaOrdine(),
        'ordine-arrivato': el => apriArrivo(el.dataset.ref),
        'ordine-annulla': async el => {
            if (!await ui.chiedi({ titolo: 'Annullare l\'ordine?', testo: 'Gli oggetti tornano tra quelli da ordinare.', ok: 'Annulla ordine', annulla: 'Lascia così', pericolo: true })) return;
            const { error } = await sb.from('ordini_forniture').update({ stato: 'annullato' }).eq('id', el.dataset.ref);
            if (error) return ui.toast(errMsg(error), 'errore');
            await caricaDati();
        },
        'arrivo-qta': el => { state.arrivo.qty[el.dataset.ref] = Number(el.dataset.val); renderArrivo(); },
        'conferma-arrivo': () => confermaArrivo(),
        'carico-qta': el => { state.carico[el.dataset.ref] = Number(el.dataset.val); if (!state.carico[el.dataset.ref]) delete state.carico[el.dataset.ref]; renderCaricoLista(); },
        'conferma-carico': () => confermaCarico(),
        'nuovo-kit': () => apriKit(null),
        'modifica-kit': el => apriKit(el.dataset.ref),
        'kit-pezzo': el => {
            const p = state.kitModifica.pezzi, x = p.find(y => y.oggetto_id === el.dataset.ref), v = Number(el.dataset.val);
            if (v <= 0) state.kitModifica.pezzi = p.filter(y => y !== x); else x.qty = v;
            renderKitPezzi();
        },
        'kit-aggiungi': el => { state.kitModifica.pezzi.push({ oggetto_id: el.dataset.ref, qty: 1 }); $('#kit-cerca').value = ''; renderKitRisultati(); renderKitPezzi(); },
        'salva-kit': () => salvaKit(),
        'elimina-kit': () => eliminaKit(),
        'apri-movimento': el => apriMovimento(el.dataset.ref),
        'annulla-movimento': el => annullaMovimento(el.dataset.ref),
        'stat-anno': el => { state.statAnno = el.dataset.ref; renderAdmin(); }
    });

    $$('.nav-voce').forEach(b => b.addEventListener('click', () => nav(b.dataset.vista)));
    $$('#tabs-admin .tab').forEach(t => t.addEventListener('click', () => { state.tab = t.dataset.tab; store.set('tab_admin', state.tab); renderAdmin(); }));

    const cerca = $('#cerca'), pulisci = $('#cerca-pulisci');
    const filtra = debounce(() => { state.filtro.testo = cerca.value.trim(); renderNegozio(); }, 150);
    cerca.addEventListener('input', () => { pulisci.hidden = !cerca.value; filtra(); });
    pulisci.addEventListener('click', () => { cerca.value = ''; pulisci.hidden = true; state.filtro.testo = ''; renderNegozio(); cerca.focus(); });
    $('#mostra-esauriti').addEventListener('change', e => { state.filtro.esauriti = e.target.checked; store.set('mostra_esauriti', e.target.checked); renderNegozio(); });

    $('#form-preleva').addEventListener('submit', preleva);
    $('#form-richiesta').addEventListener('submit', inviaRichiesta);
    $('#form-serve').addEventListener('submit', e => { e.preventDefault(); const n = $('#serve-nome').value.trim(); if (n) store.set('nome', n); inviaServe(n); });
    $('#form-oggetto').addEventListener('submit', salvaOggetto);
    $('#ogg-foto').addEventListener('change', e => { const f = e.target.files[0]; if (f) $('#ogg-foto-anteprima').src = URL.createObjectURL(f); });
    $('#kit-cerca').addEventListener('input', debounce(renderKitRisultati, 120));
    $('#rich-nome').value = store.get('nome', '');

    // Campi di ricerca dentro la gestione (ridisegnati a ogni cambio scheda)
    $('#admin-corpo').addEventListener('input', debounce(e => {
        if (e.target.id === 'inv-cerca') { state.inv.testo = e.target.value; renderInventarioLista(); }
        if (e.target.id === 'carico-cerca') { state.caricoTesto = e.target.value; renderCaricoLista(); }
        if (e.target.id === 'mov-cerca') { movTesto = e.target.value; renderMovimentiLista(); }
        if (e.target.id === 'ordine-cerca') {
            const parole = norm(e.target.value).split(/\s+/).filter(Boolean), box = $('#ordine-risultati');
            const gia = new Set(proposteOrdine().map(r => r.o.id));
            const lista = parole.length ? state.oggetti.filter(o => !gia.has(o.id) && corrisponde(o.nome, parole)).slice(0, 8) : [];
            box.hidden = !parole.length;
            box.innerHTML = lista.map(o => `<button class="riga" data-act="ordine-aggiungi" data-ref="${o.id}" type="button">${icon('piu')}<span class="riga-testo">${esc(o.nome)}</span><span class="riga-num">${disp(o)}</span></button>`).join('')
                || `<p class="tenue" style="padding:12px 14px">Niente da aggiungere con questo nome.</p>`;
        }
    }, 150));
}

function impostaAccount() {
    const b = $('#btn-account');
    if (auth.user) { b.innerHTML = icon('esci'); b.setAttribute('aria-label', 'Esci dall\'area admin'); b.onclick = async () => { if (await ui.chiedi({ titolo: 'Uscire dall\'area admin?', ok: 'Esci' })) auth.logout(); }; }
    else { b.innerHTML = icon('lucchetto'); b.setAttribute('aria-label', 'Accesso admin'); b.onclick = () => auth.apriLogin(); }
}

function riempiIcone() {
    $$('[data-ico]').forEach(el => { el.outerHTML = icon(el.dataset.ico); });
    $$('[data-chiudi]').forEach(el => { if (!el.innerHTML.trim()) el.innerHTML = icon('chiudi'); });
    $('#cerca-pulisci').innerHTML = icon('chiudi');
}

function attivaTempoReale() {
    try {
        const ricarica = debounce(() => caricaDati(), 600);
        sb.channel('armadio')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'oggetti' }, ricarica)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'richieste' }, debounce(ricaricaRichieste, 400))
            .subscribe();
    } catch (e) { console.warn('tempo reale non attivo', e); }
}

// =====================================================================
// Avvio
// =====================================================================
(async function avvio() {
    ui.montaFogliComuni();
    riempiIcone();
    await auth.init();
    impostaAccount();
    if (inManutenzione('armadio')) {
        mostraManutenzione($('#main'), 'Stiamo contando le patacche, torna più tardi.');
        $('.nav-basso').hidden = true;
        return;
    }
    $('#nav-admin').hidden = !auth.admin;
    collegaEventi();
    osservaBarraFiltri();
    const daIndirizzo = () => { const h = location.hash.slice(1); nav(['richieste', 'admin'].includes(h) ? h : 'negozio'); };
    daIndirizzo();
    window.addEventListener('hashchange', daIndirizzo);
    await caricaDati();
    attivaTempoReale();
})();
