// =====================================================================
// Azimut.Arch · Cambusa
// Menu dei campi salvati, lista della spesa da telefono, ricette per
// pasto, dispensa (uso e rifornimento), gestione admin.
// =====================================================================

const PASTI = { colazione: 'Colazione', pranzo: 'Pranzo', merenda: 'Merenda', cena: 'Cena', sacco: 'Al sacco' };
const ORDINE_PASTI = ['colazione', 'pranzo', 'merenda', 'cena'];
const CAT_DISPENSA = { colazione: 'Colazione', merenda: 'Merenda', pasti: 'Pasti', condimenti: 'Condimenti', extra: 'Extra' };
const UNITA = ['gr', 'kg', 'ml', 'lt', 'pz', 'conf'];

// Reparti nell'ordine in cui si gira il supermercato
const REPARTI = [
    ['frutta-verdura', 'Frutta e verdura'], ['pane', 'Pane e forno'], ['pasta-riso', 'Pasta, riso e farine'],
    ['carne-salumi', 'Carne e salumi'], ['pesce', 'Pesce'], ['latticini-uova', 'Latticini e uova'], ['surgelati', 'Surgelati'],
    ['dispensa', 'Scatolame e condimenti'], ['colazione-dolci', 'Colazione e dolci'], ['bevande', 'Bevande'], ['altro', 'Altro']
];
const NOME_REPARTO = Object.fromEntries(REPARTI);
// Prima ipotesi dal nome (l'ordine conta: "frutta secca" non è frutta fresca)
const INDOVINA = [
    ['surgelati', /bastoncin|surgel|gelat|sofficin/],
    ['colazione-dolci', /cappuc|caff|cioccolat|biscott|marmellat|nutella|zucchero|merendin|frutta secca|miele|cacao|fette biscottate|cereali|crostat/],
    ['frutta-verdura', /mel[ae]\b|pomodor|zucchin|cipoll|patat|limon|verdur|insalat|carot|banan|frutta|aglio|basilico|prezzemol|pere\b|arance|melanzan|peperon/],
    ['pane', /pane|panin|piadin|rosetta|cracker|grissin|focacc|tortill/],
    ['pasta-riso', /pasta|ditalin|pastina|riso|cous|farina|polenta|gnocch|tortellin|raviol|spaghett|penne|fusill/],
    ['latticini-uova', /latte|burro|formagg|mozzarell|uova|uovo|yogurt|parmigian|grana|ricotta|panna|stracchino|sottilet/],
    ['carne-salumi', /carne|macinat|salsicc|w[uü]e?rstel|wustel|pancetta|prosciutt|sopressa|salame|pollo|bresaola|speck|hamburger|cotolett/],
    ['pesce', /tonno|merluzz|pesce|sgombro|salmone/],
    ['bevande', /acqua|succo|\bthe\b|\bt[eè]\b|bibit|aranciata/],
    ['dispensa', /olio|sale|aceto|dado|passata|sugo|pesto|fagiol|ceci|lenticch|salvia|spezie|origano|pepe|maionese|ketchup|pur[eè]|brodo|piselli|mais/]
];

const state = {
    dispensa: [], ricette: [], menu: [], reparti: new Map(),
    vista: 'menu', menuId: null,
    filtroRic: { testo: '', pasto: 'tutti' },
    filtroDisp: { testo: '', cat: 'tutte' },
    uso: store.get('uso_cambusa', []),                 // [{ id, qty }]
    rifornisci: {},                                    // id -> { qty, scad }
    rifTesto: '',
    tab: store.get('tab_cambusa', 'approvazioni'),
    movimenti: null,
    pasto: null,                                       // { g, p } pasto aperto nel foglio
    ricMod: null,                                      // ricetta in modifica
    dopoRicetta: null,
    usaId: null,
    formMenu: null,                                    // { modo: 'nuovo' | 'duplica' | 'modifica', id }
    reparto: null
};

// ---------- Utilità ----------
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const corrisponde = (testo, parole) => { const t = norm(testo); return parole.every(p => t.includes(p)); };
const parole = s => norm(s).split(/\s+/).filter(Boolean);
const maiuscola = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const inAttesa = r => r.status && r.status !== 'approved';
const pastiDi = r => Array.isArray(r.pasti) && r.pasti.length ? r.pasti : ({ snack: ['colazione', 'merenda'], packed: ['sacco'] }[r.categoria] || ['pranzo', 'cena']);
const mie = (k) => store.get(k, []);
const aggiungiMio = (k, id) => store.set(k, [...new Set([...mie(k), id])]);

function base(unita) {
    const u = norm(unita);
    if (['g', 'gr', 'grammi'].includes(u)) return { dim: 'massa', f: 1 };
    if (u === 'hg') return { dim: 'massa', f: 100 };
    if (u === 'kg') return { dim: 'massa', f: 1000 };
    if (u === 'ml') return { dim: 'volume', f: 1 };
    if (u === 'cl') return { dim: 'volume', f: 10 };
    if (['l', 'lt', 'litri'].includes(u)) return { dim: 'volume', f: 1000 };
    if (u === 'conf') return { dim: 'conf', f: 1 };
    return { dim: 'pezzi', f: 1 };
}
function fmtQta(q, dim) {
    if (dim === 'massa') return q >= 1000 ? `${fmt.num(Math.ceil(q / 100) / 10, 1)} kg` : `${fmt.num(Math.ceil(q / 10) * 10)} g`;
    if (dim === 'volume') return q >= 1000 ? `${fmt.num(Math.ceil(q / 100) / 10, 1)} l` : `${fmt.num(Math.ceil(q / 10) * 10)} ml`;
    if (dim === 'conf') return `${Math.ceil(q - 1e-9)} conf.`;
    const n = Math.ceil(q - 1e-9);
    return n === 1 ? '1 pezzo' : `${n} pezzi`;
}
const fmtUnita = (q, u) => `${fmt.num(q)} ${u === 'pz' ? (Number(q) === 1 ? 'pezzo' : 'pezzi') : u === 'conf' ? 'conf.' : esc(u || '')}`;
const tre = n => Math.round(Number(n) * 1000) / 1000;
function repartoDi(nome) {
    const n = norm(nome);
    if (state.reparti.has(n)) return state.reparti.get(n);
    for (const [k, re] of INDOVINA) if (re.test(n)) return k;
    return 'altro';
}
function giorniAllaScadenza(d) { return d ? Math.ceil((new Date(d + 'T23:59:59') - new Date()) / 86400000) : null; }
function localeInput(d) { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16); }

// =====================================================================
// Dati
// =====================================================================
async function caricaDati() {
    ui.carica(true);
    const [d, r, m, rep] = await Promise.all([
        sb.from('cambusa').select('*').order('nome'),
        sb.from('ricette').select('*, ingredienti_ricetta(*)').order('nome'),
        sb.from('menu_campi').select('*').order('inizio', { ascending: false }),
        sb.from('ingredienti_reparto').select('*')
    ]);
    ui.carica(false);
    if (d.error || r.error) ui.toast(errMsg(d.error || r.error), 'errore');
    state.dispensa = d.data || [];
    state.ricette = r.data || [];
    state.menu = m.error ? [] : (m.data || []);
    // Se sto ancora salvando il menu aperto, tengo la mia versione
    if (menuInSospeso) state.menu = state.menu.map(x => String(x.id) === String(menuInSospeso.id) ? menuInSospeso : x);
    state.reparti = new Map((rep.data || []).map(x => [x.nome, x.reparto]));
    state.uso = state.uso.filter(u => state.dispensa.some(p => p.id === u.id));
    salvaUso();
    $('#nomi-ingredienti').innerHTML = [...new Set(state.ricette.flatMap(x => (x.ingredienti_ricetta || []).map(i => maiuscola(i.nome_ingrediente.trim()))))]
        .sort((a, b) => a.localeCompare(b, 'it')).map(n => `<option value="${esc(n)}">`).join('');
    renderTutto();
}
function renderTutto() {
    renderMenuLista();
    if (state.vista === 'menu-dettaglio') renderMenuDettaglio();
    if (state.vista === 'spesa') renderSpesa();
    renderRicette();
    renderDispensa();
    renderBarraUso();
    aggiornaBollini();
    if (state.vista === 'admin') renderAdmin();
    if (ui.aperto('foglio-pasto')) renderPasto();
}
const menuCorrente = () => state.menu.find(m => String(m.id) === String(state.menuId));

// =====================================================================
// Navigazione
// =====================================================================
function nav(vista, id = null) {
    if (vista === 'admin' && !auth.admin) vista = 'menu';
    if ((vista === 'menu-dettaglio' || vista === 'spesa') && !id) vista = 'menu';
    state.vista = vista;
    if (id) state.menuId = id;
    for (const v of ['menu', 'menu-dettaglio', 'spesa', 'ricette', 'dispensa', 'admin']) $('#vista-' + v).hidden = v !== vista;
    const sezione = vista.startsWith('menu') || vista === 'spesa' ? 'menu' : vista;
    $$('.nav-voce').forEach(b => b.dataset.vista === sezione ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'));
    const hash = vista === 'menu' ? '' : vista === 'menu-dettaglio' ? `#menu/${id}` : vista === 'spesa' ? `#spesa/${id}` : '#' + vista;
    try { history.replaceState(history.state, '', location.pathname + hash); } catch { /* ignora */ }
    if (vista === 'menu-dettaglio') renderMenuDettaglio();
    if (vista === 'spesa') renderSpesa();
    if (vista === 'admin') renderAdmin();
    renderBarraUso();
    window.scrollTo({ top: 0 });
}

// =====================================================================
// Menu dei campi
// =====================================================================
function generaGiorni(inizio, fine, vecchi = []) {
    const a = new Date(inizio), b = new Date(fine);
    const giorni = [];
    const g0 = new Date(a.getFullYear(), a.getMonth(), a.getDate());
    const gN = new Date(b.getFullYear(), b.getMonth(), b.getDate());
    for (let d = new Date(g0), i = 0; d <= gN && i < 60; d.setDate(d.getDate() + 1), i++) {
        const primo = i === 0, ultimo = d.getTime() === gN.getTime();
        const hA = a.getHours() + a.getMinutes() / 60, hB = b.getHours() + b.getMinutes() / 60;
        const serve = {
            colazione: !(primo && hA > 9) && !(ultimo && hB < 8),
            pranzo: !(primo && hA > 14) && !(ultimo && hB < 13),
            merenda: !(primo && hA > 17) && !(ultimo && hB < 16),
            cena: !(primo && hA > 20) && !(ultimo && hB < 20)
        };
        const prima = vecchi[i]?.pasti || [];
        giorni.push({ data: fmt.isoGiorno(d), pasti: ORDINE_PASTI.filter(t => serve[t]).map(t => prima.find(p => p.tipo === t) || { tipo: t, sacco: false, ricette: [] }) });
    }
    return giorni;
}
function statoMenu(m) {
    let pieni = 0, tot = 0;
    for (const g of m.giorni || []) for (const p of g.pasti) { tot++; if (p.ricette.length) pieni++; }
    return { pieni, tot };
}
function periodo(m) {
    const a = new Date(m.inizio), b = new Date(m.fine);
    const stessoMese = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
    return stessoMese ? `dal ${a.getDate()} al ${fmt.data(b)}` : `dal ${fmt.dataBreve(a)} al ${fmt.data(b)}`;
}

function renderMenuLista() {
    const el = $('#menu-lista');
    if (!state.menu.length) {
        el.innerHTML = `<div class="vuoto"><h3>Ancora nessun menu</h3><p>Crea il menu del prossimo campo: scegli le ricette per ogni pasto e la spesa si calcola da sola.</p></div>`;
        return;
    }
    const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
    const prossimi = state.menu.filter(m => new Date(m.fine) >= oggi).sort((a, b) => new Date(a.inizio) - new Date(b.inizio));
    const passati = state.menu.filter(m => new Date(m.fine) < oggi);
    const card = m => {
        const s = statoMenu(m), a = new Date(m.inizio);
        return `<button class="menu-card" data-act="apri-menu" data-ref="${m.id}" type="button">
            <span class="menu-data"><b>${a.getDate()}</b><span>${a.toLocaleDateString('it-IT', { month: 'short' }).replace('.', '')}</span></span>
            <span class="riga-testo"><span class="riga-titolo" style="display:block;font-size:17px">${esc(m.nome)}</span>
                <span class="riga-sotto" style="display:block">${periodo(m)}, ${m.persone} persone</span>
                <span class="riga-sotto" style="display:block">${s.pieni === s.tot ? 'Tutti i pasti pronti' : `${s.pieni} pasti pronti su ${s.tot}`}</span></span>
            ${icon('avanti')}</button>`;
    };
    el.innerHTML = (prossimi.length ? prossimi.map(card).join('') : `<p class="tenue">Nessun campo in programma.</p>`) +
        (passati.length ? `<div class="sezione"><div class="sezione-testa"><h2>Campi passati</h2><span class="conta">${passati.length}</span></div>
            <p class="tenue" style="margin-bottom:10px">Duplica un menu vecchio per non ripartire da zero.</p>${passati.map(card).join('')}</div>` : '');
}

function apriFormMenu(modo, id = null) {
    state.formMenu = { modo, id };
    const m = id ? state.menu.find(x => String(x.id) === String(id)) : null;
    $('#menu-titolo').textContent = { nuovo: 'Nuovo menu', duplica: 'Duplica il menu', modifica: 'Dati del campo' }[modo];
    $('#btn-salva-menu').textContent = { nuovo: 'Crea il menu', duplica: 'Crea la copia', modifica: 'Salva' }[modo];
    $('#menu-errore').hidden = true;
    if (modo === 'nuovo') {
        const a = new Date(); a.setDate(a.getDate() + 7); a.setHours(10, 0, 0, 0);
        const b = new Date(a); b.setDate(b.getDate() + 2); b.setHours(15, 0, 0, 0);
        $('#menu-nome').value = ''; $('#menu-inizio').value = localeInput(a); $('#menu-fine').value = localeInput(b); $('#menu-persone').value = 30;
    } else {
        $('#menu-nome').value = modo === 'duplica' ? `${m.nome} (copia)` : m.nome;
        $('#menu-persone').value = m.persone;
        if (modo === 'duplica') {
            const durata = new Date(m.fine) - new Date(m.inizio);
            const a = new Date(m.inizio); const oggi = new Date();
            while (a < oggi) a.setFullYear(a.getFullYear() + 1);
            $('#menu-inizio').value = localeInput(a); $('#menu-fine').value = localeInput(new Date(a.getTime() + durata));
        } else { $('#menu-inizio').value = localeInput(m.inizio); $('#menu-fine').value = localeInput(m.fine); }
    }
    ui.apri('foglio-menu');
}
async function salvaFormMenu(e) {
    e.preventDefault();
    const { modo, id } = state.formMenu, err = $('#menu-errore');
    err.hidden = true;
    const nome = $('#menu-nome').value.trim(), inizio = new Date($('#menu-inizio').value), fine = new Date($('#menu-fine').value);
    const persone = parseInt($('#menu-persone').value, 10);
    if (!nome || isNaN(inizio) || isNaN(fine)) { err.textContent = 'Compila nome e date.'; err.hidden = false; return; }
    if (fine <= inizio) { err.textContent = 'La partenza deve essere dopo l\'arrivo.'; err.hidden = false; return; }
    if ((fine - inizio) / 86400000 > 45) { err.textContent = 'Un menu può durare al massimo 45 giorni.'; err.hidden = false; return; }
    if (!(persone >= 1)) { err.textContent = 'Scrivi quante persone mangiano.'; err.hidden = false; return; }
    const vecchio = id ? state.menu.find(x => String(x.id) === String(id)) : null;
    const dati = { nome, inizio: inizio.toISOString(), fine: fine.toISOString(), persone, giorni: generaGiorni(inizio, fine, vecchio?.giorni || []), aggiornato_il: new Date().toISOString() };
    ui.carica(true);
    const res = modo === 'modifica'
        ? await sb.from('menu_campi').update(dati).eq('id', id).select()
        : await sb.from('menu_campi').insert([{ ...dati, spesa_spuntati: [] }]).select();
    ui.carica(false);
    if (res.error) { err.textContent = errMsg(res.error); err.hidden = false; return; }
    const nuovo = res.data?.[0];
    ui.chiudi();
    await caricaDati();
    if (nuovo) nav('menu-dettaglio', nuovo.id);
    ui.toast(modo === 'modifica' ? 'Menu aggiornato' : 'Menu creato');
}

// Salvataggio automatico del menu aperto
let timerSalva = null, menuInSospeso = null;
function salvaMenuPresto() {
    const m = menuCorrente();
    if (!m) return;
    menuInSospeso = m;
    indicatore('In salvataggio…');
    clearTimeout(timerSalva);
    timerSalva = setTimeout(async () => {
        const daSalvare = menuInSospeso;
        const { error } = await sb.from('menu_campi').update({ giorni: daSalvare.giorni, persone: daSalvare.persone, aggiornato_il: new Date().toISOString() }).eq('id', daSalvare.id);
        if (menuInSospeso === daSalvare) menuInSospeso = null;
        indicatore(error ? 'Non salvato: riprova' : 'Salvato');
        if (error) ui.toast(errMsg(error), 'errore');
    }, 700);
}
function indicatore(t) { const el = $('#salvataggio'); if (el) el.innerHTML = (t === 'Salvato' ? icon('spunta', 'ico-s') : '') + esc(t); }

function renderMenuDettaglio() {
    const m = menuCorrente(), el = $('#vista-menu-dettaglio');
    if (!m) { el.innerHTML = `<div class="vuoto"><h3>Menu non trovato</h3><button class="btn" data-act="vai" data-ref="menu" type="button">Torna ai menu</button></div>`; return; }
    const s = statoMenu(m);
    el.innerHTML = `
        <button class="btn btn-testo no-stampa" style="margin:-8px 0 6px -10px" data-act="vai" data-ref="menu" type="button">${icon('indietro', 'ico-s')}Tutti i menu</button>
        <h2 style="font-size:28px">${esc(m.nome)}</h2>
        <p class="tenue" style="margin:4px 0 2px">${periodo(m)}, ${m.persone} persone</p>
        <p class="salvataggio" id="salvataggio" aria-live="polite">${icon('spunta', 'ico-s')}Salvato</p>
        <div class="fila-btn" style="margin:14px 0 6px">
            <button class="btn btn-primario" data-act="vai-spesa" type="button">${icon('carrello', 'ico-s')}Lista della spesa</button>
            <button class="btn" data-act="modifica-menu" type="button">${icon('matita', 'ico-s')}Date e persone</button>
            <button class="btn" data-act="duplica-menu" type="button">${icon('copia', 'ico-s')}Duplica</button>
            ${auth.admin ? `<button class="btn btn-pericolo" data-act="elimina-menu" type="button">${icon('cestino', 'ico-s')}Elimina</button>` : ''}
        </div>
        ${s.pieni < s.tot ? `<p class="tenue piccolo" style="margin:8px 0 12px">Tocca un pasto per scegliere le ricette. Ne mancano ${s.tot - s.pieni}.</p>` : '<div style="height:12px"></div>'}
        ${m.giorni.map((g, gi) => `<div class="giorno"><div class="giorno-testa">${maiuscola(fmt.giorno(g.data + 'T12:00:00'))}</div>
            ${g.pasti.map((p, pi) => `<button class="pasto" data-act="apri-pasto" data-g="${gi}" data-p="${pi}" type="button">
                <span class="pasto-nome">${PASTI[p.tipo]}${p.sacco ? `<br><span class="etichetta" style="margin-top:4px">al sacco</span>` : ''}</span>
                <span class="pasto-ricette">${p.ricette.length ? p.ricette.map(id => {
                    const r = state.ricette.find(x => String(x.id) === String(id));
                    return `<span class="piatto">${esc(r ? r.nome : 'Ricetta eliminata')}</span>`;
                }).join('') : '<span class="vuoto-pasto">Scegli cosa si mangia</span>'}</span>
            </button>`).join('')}</div>`).join('')}`;
}

// ---------- Pasto ----------
function apriPasto(g, p) {
    state.pasto = { g: Number(g), p: Number(p) };
    const m = menuCorrente(), pasto = m.giorni[g].pasti[p];
    $('#pasto-titolo').textContent = `${PASTI[pasto.tipo]}, ${fmt.giorno(m.giorni[g].data + 'T12:00:00')}`;
    $('#pasto-sacco').checked = !!pasto.sacco;
    $('#pasto-cerca').value = '';
    renderPasto();
    ui.apri('foglio-pasto');
}
function pastoAperto() { const m = menuCorrente(); return m && state.pasto ? m.giorni[state.pasto.g]?.pasti[state.pasto.p] : null; }
function renderPasto() {
    const pasto = pastoAperto();
    if (!pasto) return;
    const m = menuCorrente();
    $('#pasto-scelti').innerHTML = pasto.ricette.length ? `<div class="lista">${pasto.ricette.map((id, i) => {
        const r = state.ricette.find(x => String(x.id) === String(id));
        return `<div class="riga"><div class="riga-testo"><div class="riga-titolo">${esc(r ? r.nome : 'Ricetta eliminata')}</div>
            <div class="riga-sotto">${r ? `Dosi ×${fmt.num(m.persone / (Number(r.porzioni) || 1), 1)} per ${m.persone} persone` : ''}${r && inAttesa(r) ? ', da approvare' : ''}</div></div>
            <button class="btn btn-icona" data-act="pasto-togli" data-ref="${i}" aria-label="Togli ${esc(r?.nome || '')}" type="button">${icon('chiudi')}</button></div>`;
    }).join('')}</div>` : `<p class="tenue">Nessuna ricetta scelta.</p>`;
    const q = parole($('#pasto-cerca').value);
    const tipo = pasto.sacco ? 'sacco' : pasto.tipo;
    let lista, titolo;
    if (q.length) { lista = state.ricette.filter(r => corrisponde(r.nome, q)); titolo = 'Risultati'; }
    else { lista = state.ricette.filter(r => pastiDi(r).includes(tipo)); titolo = `Adatte a ${pasto.sacco ? 'un pasto al sacco' : PASTI[pasto.tipo].toLowerCase()}`; }
    $('#pasto-proposte').innerHTML = `<h3 style="margin-bottom:8px">${titolo}</h3>` + (lista.length ? `<div class="lista">${lista.map(r => `
        <button class="riga" data-act="pasto-aggiungi" data-ref="${r.id}" type="button">${icon('piu')}
            <span class="riga-testo"><span class="riga-titolo" style="display:block">${esc(r.nome)}</span>
            <span class="riga-sotto" style="display:block">${pastiDi(r).map(x => PASTI[x]).join(', ')}${inAttesa(r) ? ', da approvare' : ''}</span></span></button>`).join('')}</div>`
        : `<p class="tenue">${q.length ? 'Nessuna ricetta con questo nome.' : 'Nessuna ricetta segnata per questo pasto: cerca tra tutte qui sopra.'}</p>`);
}
function pastoCambiato() { salvaMenuPresto(); renderPasto(); renderMenuDettaglio(); }

// ---------- Lista della spesa ----------
function calcolaSpesa(m) {
    const righe = new Map();
    let vuoti = 0;
    for (const g of m.giorni || []) for (const p of g.pasti) {
        if (!p.ricette.length) { vuoti++; continue; }
        for (const id of p.ricette) {
            const r = state.ricette.find(x => String(x.id) === String(id));
            if (!r) continue;
            const ratio = m.persone / (Number(r.porzioni) || 1);
            for (const ing of r.ingredienti_ricetta || []) {
                const { dim, f } = base(ing.unita);
                const nome = norm(ing.nome_ingrediente);
                if (!nome) continue;
                const k = `${nome}|${dim}`;
                if (!righe.has(k)) righe.set(k, { chiave: k, nome: maiuscola(ing.nome_ingrediente.trim()), nomeNorm: nome, dim, qta: 0, usi: new Set() });
                const x = righe.get(k);
                x.qta += (Number(ing.quantita_necessaria) || 0) * f * ratio;
                x.usi.add(r.nome);
            }
        }
    }
    const inizio = new Date(m.inizio);
    for (const x of righe.values()) {
        const trovati = state.dispensa.filter(p => p.stato !== 'pending' && Number(p.quantita) > 0 && base(p.unita).dim === x.dim &&
            (!p.scadenza || new Date(p.scadenza) >= inizio) && (norm(p.nome).includes(x.nomeNorm) || x.nomeNorm.includes(norm(p.nome))));
        x.inDispensa = trovati.reduce((a, p) => a + Number(p.quantita) * base(p.unita).f, 0);
        x.daComprare = Math.max(0, x.qta - x.inDispensa);
        x.reparto = repartoDi(x.nomeNorm);
    }
    return { righe: [...righe.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'it')), vuoti };
}

function renderSpesa() {
    const m = menuCorrente(), el = $('#vista-spesa');
    if (!m) { el.innerHTML = `<div class="vuoto"><h3>Menu non trovato</h3></div>`; return; }
    const { righe, vuoti } = calcolaSpesa(m);
    const presi = new Set(m.spesa_spuntati || []);
    const daComprare = righe.filter(r => r.daComprare > 0);
    const coperti = righe.filter(r => r.daComprare <= 0);
    const fatti = daComprare.filter(r => presi.has(r.chiave)).length;
    const gruppi = REPARTI.map(([k, nome]) => [k, nome, daComprare.filter(r => r.reparto === k)]).filter(([, , l]) => l.length);
    const riga = r => `<div class="spesa-riga ${presi.has(r.chiave) ? 'presa' : ''}">
        <button class="spunta" data-act="spesa-spunta" data-ref="${esc(r.chiave)}" type="button" aria-pressed="${presi.has(r.chiave)}" aria-label="${esc(r.nome)}: preso">${icon('spunta', 'ico-s')}</button>
        <div class="riga-testo"><div class="riga-titolo">${esc(r.nome)}</div>
            <details><summary>Per ${r.usi.size === 1 ? '1 ricetta' : `${r.usi.size} ricette`}${r.inDispensa > 0 ? `, in dispensa ${fmtQta(r.inDispensa, r.dim)}` : ''}</summary>
            <span class="piccolo tenue">${esc([...r.usi].join(', '))}</span></details></div>
        <div class="riga-num" style="font-size:19px">${fmtQta(r.daComprare, r.dim)}</div>
        <button class="btn btn-icona btn-testo no-stampa" data-act="cambia-reparto" data-ref="${esc(r.nomeNorm)}" data-nome="${esc(r.nome)}" aria-label="Cambia reparto di ${esc(r.nome)}" type="button">${icon('lista', 'ico-s')}</button>
    </div>`;
    el.innerHTML = `
        <button class="btn btn-testo no-stampa" style="margin:-8px 0 6px -10px" data-act="apri-menu" data-ref="${m.id}" type="button">${icon('indietro', 'ico-s')}${esc(m.nome)}</button>
        <h2 style="font-size:28px">Lista della spesa</h2>
        <p class="tenue" style="margin:4px 0 12px">${esc(m.nome)}: ${periodo(m)}, ${m.persone} persone</p>
        ${vuoti ? `<div class="avviso no-stampa" style="margin-bottom:12px">${icon('attenzione')}<div>${vuoti === 1 ? 'Un pasto non ha' : `${vuoti} pasti non hanno`} ancora ricette: la lista non è completa.</div></div>` : ''}
        ${daComprare.length ? `
        <div class="riquadro no-stampa" style="margin-bottom:14px;padding:12px 14px">
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px"><b>${fatti} di ${daComprare.length} presi</b>
                ${fatti ? `<button class="btn btn-testo btn-piccolo" data-act="spesa-azzera" type="button">Togli le spunte</button>` : ''}</div>
            <div class="barra-traccia" style="height:8px;border-radius:4px;background:var(--superficie-2);overflow:hidden"><i style="display:block;height:100%;width:${(fatti / daComprare.length * 100).toFixed(1)}%;background:var(--ok)"></i></div>
        </div>
        <div class="fila-btn no-stampa" style="margin-bottom:14px">
            <button class="btn" data-act="spesa-condividi" type="button">${icon('condividi', 'ico-s')}Condividi</button>
            <button class="btn" data-act="spesa-copia" type="button">${icon('copia', 'ico-s')}Copia</button>
            <button class="btn" data-act="spesa-stampa" type="button">${icon('stampa', 'ico-s')}Stampa</button>
        </div>
        <div class="lista">${gruppi.map(([, nome, l]) => `<div class="lista-titolo">${nome}</div>${l.map(riga).join('')}`).join('')}</div>`
        : `<div class="vuoto"><h3>Niente da comprare</h3><p>${righe.length ? 'Hai già tutto in dispensa.' : 'Scegli le ricette dei pasti e qui compare cosa comprare.'}</p></div>`}
        ${coperti.length ? `<div class="sezione"><div class="sezione-testa"><h2>Già in dispensa</h2></div>
            <div class="lista">${coperti.map(r => `<div class="riga"><div class="riga-testo"><div class="riga-titolo">${esc(r.nome)}</div><div class="riga-sotto">Servono ${fmtQta(r.qta, r.dim)}, ce ne sono ${fmtQta(r.inDispensa, r.dim)}</div></div></div>`).join('')}</div></div>` : ''}`;
}

function testoSpesa(m) {
    const { righe } = calcolaSpesa(m);
    const presi = new Set(m.spesa_spuntati || []);
    const resto = righe.filter(r => r.daComprare > 0 && !presi.has(r.chiave));
    let t = `Spesa: ${m.nome}\n${m.persone} persone, ${periodo(m)}\n`;
    for (const [k, nome] of REPARTI) {
        const l = resto.filter(r => r.reparto === k);
        if (l.length) t += `\n*${nome}*\n` + l.map(r => `- ${r.nome}: ${fmtQta(r.daComprare, r.dim)}`).join('\n') + '\n';
    }
    return t.trim();
}

async function spunta(chiave) {
    const m = menuCorrente();
    const s = new Set(m.spesa_spuntati || []);
    const presa = !s.has(chiave);
    presa ? s.add(chiave) : s.delete(chiave);
    m.spesa_spuntati = [...s];
    renderSpesa();
    try { navigator.vibrate?.(8); } catch { /* niente */ }
    // Unisco con le spunte di chi sta facendo la spesa insieme a me
    const { data } = await sb.from('menu_campi').select('spesa_spuntati').eq('id', m.id).maybeSingle();
    const unite = new Set(data?.spesa_spuntati || []);
    presa ? unite.add(chiave) : unite.delete(chiave);
    m.spesa_spuntati = [...unite];
    const { error } = await sb.from('menu_campi').update({ spesa_spuntati: m.spesa_spuntati }).eq('id', m.id);
    if (error) ui.toast(errMsg(error), 'errore');
    if (state.vista === 'spesa') renderSpesa();
}

function apriReparto(nomeNorm, nome) {
    state.reparto = nomeNorm;
    $('#reparto-ingrediente').textContent = nome;
    const att = repartoDi(nomeNorm);
    $('#reparto-scelte').innerHTML = REPARTI.map(([k, n]) => `<button class="riga" data-act="scegli-reparto" data-ref="${k}" type="button">
        <span class="riga-testo">${n}</span>${k === att ? icon('spunta') : ''}</button>`).join('');
    ui.apri('foglio-reparto');
}
async function scegliReparto(k) {
    const nome = state.reparto;
    state.reparti.set(nome, k);
    ui.chiudi();
    renderSpesa();
    const { error } = await sb.from('ingredienti_reparto').upsert([{ nome, reparto: k }], { onConflict: 'nome' });
    if (error) ui.toast(errMsg(error), 'errore');
}

// =====================================================================
// Ricette
// =====================================================================
function renderRicette() {
    const f = state.filtroRic, q = parole(f.testo);
    const conta = t => state.ricette.filter(r => pastiDi(r).includes(t)).length;
    $('#ricette-chips').innerHTML = `<button class="chip" data-act="ric-filtro" data-ref="tutti" aria-pressed="${f.pasto === 'tutti'}">Tutte <span class="conta">${state.ricette.length}</span></button>` +
        Object.keys(PASTI).map(t => `<button class="chip" data-act="ric-filtro" data-ref="${t}" aria-pressed="${f.pasto === t}">${PASTI[t]} <span class="conta">${conta(t)}</span></button>`).join('');
    const mieR = mie('mie_ricette');
    const lista = state.ricette.filter(r => (f.pasto === 'tutti' || pastiDi(r).includes(f.pasto)) &&
        (!q.length || corrisponde(r.nome + ' ' + (r.ingredienti_ricetta || []).map(i => i.nome_ingrediente).join(' '), q)))
        .sort((a, b) => inAttesa(b) - inAttesa(a) || a.nome.localeCompare(b.nome, 'it'));
    $('#ricette-lista').innerHTML = lista.length ? lista.map(r => {
        const puoModificare = auth.admin || inAttesa(r);
        const puoEliminare = auth.admin || (inAttesa(r) && mieR.includes(r.id));
        return `<article class="ricetta-card ${inAttesa(r) ? 'attesa' : ''}">
            <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
                <h3 style="font-size:21px">${esc(r.nome)}</h3>${inAttesa(r) ? '<span class="etichetta attenzione">Da approvare</span>' : ''}</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px">${pastiDi(r).map(t => `<span class="etichetta accento">${PASTI[t]}</span>`).join('')}</div>
            <p class="tenue piccolo">Dosi per ${r.porzioni} ${Number(r.porzioni) === 1 ? 'persona' : 'persone'}</p>
            <ul>${(r.ingredienti_ricetta || []).map(i => `<li><span>${esc(i.nome_ingrediente)}</span><b class="num">${fmtUnita(i.quantita_necessaria, i.unita)}</b></li>`).join('') || '<li class="tenue">Nessun ingrediente</li>'}</ul>
            <div class="fila-btn" style="margin-top:4px">
                ${puoModificare ? `<button class="btn btn-piccolo" data-act="modifica-ricetta" data-ref="${r.id}" type="button">${icon('matita', 'ico-s')}Modifica</button>`
                    : `<button class="btn btn-piccolo" data-act="variante-ricetta" data-ref="${r.id}" type="button">${icon('copia', 'ico-s')}Proponi una variante</button>`}
                ${puoEliminare ? `<button class="btn btn-piccolo btn-pericolo" data-act="elimina-ricetta" data-ref="${r.id}" type="button">${icon('cestino', 'ico-s')}Elimina</button>` : ''}
            </div>
        </article>`;
    }).join('') : `<div class="vuoto" style="grid-column:1/-1"><h3>Nessuna ricetta</h3><p>Scrivine una nuova con il tasto +.</p></div>`;
}

function apriRicetta(id = null, variante = false, daPasto = false) {
    const r = id ? state.ricette.find(x => String(x.id) === String(id)) : null;
    const pa = daPasto ? pastoAperto() : null;
    state.ricMod = {
        id: variante ? null : r?.id || null,
        pasti: new Set(r ? pastiDi(r) : pa ? [pa.sacco ? 'sacco' : pa.tipo] : ['pranzo', 'cena']),
        ingredienti: r ? (r.ingredienti_ricetta || []).map(i => ({ nome: i.nome_ingrediente, qty: i.quantita_necessaria, unita: UNITA.includes(i.unita) ? i.unita : (i.unita === 'g' ? 'gr' : 'pz') })) : [{ nome: '', qty: '', unita: 'gr' }]
    };
    $('#ricetta-titolo').textContent = variante ? 'Variante della ricetta' : r ? 'Modifica ricetta' : 'Nuova ricetta';
    $('#ric-nome').value = r ? (variante ? `${r.nome} (variante)` : r.nome) : '';
    $('#ric-porzioni').value = r?.porzioni || 1;
    $('#ric-errore').hidden = true;
    const nota = $('#ric-nota');
    nota.hidden = auth.admin;
    nota.textContent = 'La ricetta la approva l\'admin. Intanto puoi già usarla nei menu.';
    $('#btn-elimina-ricetta').hidden = !(state.ricMod.id && (auth.admin || (inAttesa(r) && mie('mie_ricette').includes(r.id))));
    renderRicettaForm();
    ui.apri('foglio-ricetta');
}
function renderRicettaForm() {
    const rm = state.ricMod;
    $('#ric-pasti').innerHTML = Object.keys(PASTI).map(t => `<button class="chip chip-pasto" type="button" data-act="ric-pasto" data-ref="${t}" aria-pressed="${rm.pasti.has(t)}">${PASTI[t]}</button>`).join('');
    $('#ric-ingredienti').innerHTML = rm.ingredienti.map((i, n) => `<div class="ing-riga" data-n="${n}">
        <input list="nomi-ingredienti" data-campo="nome" value="${esc(i.nome)}" placeholder="Ingrediente" aria-label="Ingrediente" maxlength="80">
        <input type="number" inputmode="decimal" step="any" min="0" data-campo="qty" value="${esc(i.qty)}" placeholder="Qtà" aria-label="Quantità">
        <select data-campo="unita" aria-label="Unità">${UNITA.map(u => `<option value="${u}" ${u === i.unita ? 'selected' : ''}>${u}</option>`).join('')}</select>
        <button class="btn btn-icona btn-testo" type="button" data-act="ing-togli" data-ref="${n}" aria-label="Togli ingrediente">${icon('chiudi', 'ico-s')}</button></div>`).join('');
}
function leggiIngredienti() {
    $$('#ric-ingredienti .ing-riga').forEach(el => {
        const i = state.ricMod.ingredienti[Number(el.dataset.n)];
        i.nome = $('[data-campo=nome]', el).value; i.qty = $('[data-campo=qty]', el).value; i.unita = $('[data-campo=unita]', el).value;
    });
}
async function salvaRicetta(e) {
    e.preventDefault();
    leggiIngredienti();
    const rm = state.ricMod, err = $('#ric-errore');
    err.hidden = true;
    const nome = $('#ric-nome').value.trim(), porzioni = Number($('#ric-porzioni').value);
    const ingredienti = rm.ingredienti.filter(i => i.nome.trim() && Number(i.qty) > 0);
    if (!nome) { err.textContent = 'Scrivi il nome della ricetta.'; err.hidden = false; return; }
    if (!rm.pasti.size) { err.textContent = 'Scegli almeno un pasto.'; err.hidden = false; return; }
    if (!ingredienti.length) { err.textContent = 'Aggiungi almeno un ingrediente con la quantità.'; err.hidden = false; return; }
    if (!(porzioni >= 1)) { err.textContent = 'Scrivi per quante persone sono le dosi.'; err.hidden = false; return; }
    const pasti = Object.keys(PASTI).filter(t => rm.pasti.has(t));
    const categoria = pasti.every(t => ['colazione', 'merenda'].includes(t)) ? 'snack' : pasti.length === 1 && pasti[0] === 'sacco' ? 'packed' : 'pasti';
    const esistente = rm.id ? state.ricette.find(x => String(x.id) === String(rm.id)) : null;
    const dati = { nome, porzioni, pasti, categoria, status: auth.admin ? (esistente?.status || 'approved') : 'pending' };
    ui.carica(true);
    let id = rm.id, res;
    if (id) { res = await sb.from('ricette').update(dati).eq('id', id).select(); if (!res.error && !res.data?.length) id = null; }
    else { res = await sb.from('ricette').insert([dati]).select(); id = res.data?.[0]?.id; }
    if (!res.error && id) {
        if (!rm.id && !auth.admin) aggiungiMio('mie_ricette', id);
        res = await sb.from('ingredienti_ricetta').delete().eq('ricetta_id', id);
        if (!res.error) res = await sb.from('ingredienti_ricetta').insert(ingredienti.map(i => ({ ricetta_id: id, nome_ingrediente: i.nome.trim(), quantita_necessaria: Number(i.qty), unita: i.unita })));
    } else if (!res.error && !id) res = { error: { message: 'Non hai il permesso di modificare questa ricetta.' } };
    ui.carica(false);
    if (res.error) { err.textContent = errMsg(res.error); err.hidden = false; return; }
    ui.chiudi();
    ui.toast(auth.admin ? 'Ricetta salvata' : 'Ricetta salvata: la vede l\'admin per approvarla');
    if (!auth.admin) notifica('Cambusa: ricetta da approvare', `<p>Nuova ricetta o modifica in attesa: <b>${esc(nome)}</b></p>`);
    await caricaDati();
    if (state.dopoRicetta) { const cb = state.dopoRicetta; state.dopoRicetta = null; cb(id); }
}
async function eliminaRicetta(id) {
    const r = state.ricette.find(x => String(x.id) === String(id));
    if (!r) return;
    const usata = state.menu.filter(m => (m.giorni || []).some(g => g.pasti.some(p => p.ricette.map(String).includes(String(r.id))))).map(m => m.nome);
    if (!await ui.chiedi({ titolo: `Eliminare ${r.nome}?`, ok: 'Elimina', pericolo: true,
        testo: usata.length ? `È usata nei menu: ${esc(usata.join(', '))}. Lì comparirà come ricetta eliminata.` : 'Non si può tornare indietro.' })) return;
    ui.carica(true);
    const { error } = await sb.from('ricette').delete().eq('id', r.id);
    ui.carica(false);
    if (error) return ui.toast(errMsg(error), 'errore');
    if (ui.aperto('foglio-ricetta')) ui.chiudi();
    ui.toast('Ricetta eliminata');
    await caricaDati();
}

// =====================================================================
// Dispensa
// =====================================================================
function renderDispensa() {
    const f = state.filtroDisp, q = parole(f.testo);
    const visibili = state.dispensa;
    $('#dispensa-chips').innerHTML = `<button class="chip" data-act="disp-filtro" data-ref="tutte" aria-pressed="${f.cat === 'tutte'}">Tutto</button>` +
        Object.entries(CAT_DISPENSA).map(([k, n]) => `<button class="chip" data-act="disp-filtro" data-ref="${k}" aria-pressed="${f.cat === k}">${n} <span class="conta">${visibili.filter(p => p.categoria === k).length}</span></button>`).join('');
    const lista = visibili.filter(p => (f.cat === 'tutte' || p.categoria === f.cat) && corrisponde(p.nome, q));
    const inUso = new Map(state.uso.map(u => [u.id, u.qty]));
    const mieP = mie('mie_prodotti');
    $('#dispensa-griglia').innerHTML = lista.length ? lista.map(p => {
        const attesa = p.stato === 'pending', qta = Number(p.quantita) || 0, usato = inUso.get(p.id) || 0, resto = qta - usato;
        const gg = giorniAllaScadenza(p.scadenza);
        const scad = p.scadenza ? (gg < 0 ? `<span class="etichetta errore">Scaduto</span>` : gg <= 12 ? `<span class="etichetta attenzione">Scade tra ${gg} ${gg === 1 ? 'giorno' : 'giorni'}</span>` : `<span class="tenue piccolo">Scade il ${fmt.data(p.scadenza)}</span>`) : '';
        let azione;
        if (attesa) azione = (auth.admin || mieP.includes(p.id)) ? `<button class="btn btn-piccolo" data-act="modifica-prodotto" data-ref="${p.id}" type="button">${icon('matita', 'ico-s')}Modifica</button>` : '';
        else if (resto <= 0 && !usato) azione = `<span class="etichetta errore">Finito</span>`;
        else azione = `<button class="btn btn-tenue btn-aggiungi" data-act="usa" data-ref="${p.id}" type="button" ${resto > 0 ? '' : 'disabled'}>${usato ? `${icon('spunta', 'ico-s')}Usi ${fmtUnita(usato, p.unita)}` : `${icon('meno', 'ico-s')}Usa`}</button>`;
        return `<article class="scheda scheda-dispensa ${usato ? 'in-zaino' : ''}">
            <div class="scheda-corpo">
                <div class="scheda-gruppo">${esc(CAT_DISPENSA[p.categoria] || 'Extra')}${attesa ? ' <span class="etichetta attenzione">Da approvare</span>' : ''}</div>
                <h3 class="scheda-nome">${esc(p.nome)}</h3>
                <div class="disp ${resto <= 0 ? 'zero' : resto <= Number(p.soglia || 0) ? 'basso' : ''}"><b>${fmt.num(resto)}</b>${esc(p.unita === 'pz' ? (resto === 1 ? 'pezzo' : 'pezzi') : p.unita)}</div>
                ${scad}
                <div class="scheda-piede">${azione}</div>
            </div></article>`;
    }).join('') : `<div class="vuoto" style="grid-column:1/-1">${state.dispensa.length ? '<h3>Niente con questo nome</h3>'
        : `<h3>La dispensa è vuota</h3><p>Aggiungi quello che c'è in cambusa: così la lista della spesa toglie quello che avete già.</p>
           <button class="btn btn-tenue" data-act="nuovo-prodotto" type="button">${icon('piu', 'ico-s')}Aggiungi prodotto</button>`}</div>`;
}

function salvaUso() { store.set('uso_cambusa', state.uso); }
function renderBarraUso() {
    const n = state.uso.length;
    $('#barra-uso').classList.toggle('nascosta', n === 0 || state.vista !== 'dispensa');
    $('#barra-conta').textContent = n;
    $('#barra-dettaglio').textContent = n === 1 ? '1 prodotto' : `${n} prodotti`;
}
function apriUsa(id) {
    const p = state.dispensa.find(x => x.id === id);
    state.usaId = id;
    const gia = state.uso.find(u => u.id === id)?.qty || 0;
    const resto = Number(p.quantita) - gia;
    $('#usa-prodotto').textContent = p.nome;
    $('#usa-disponibile').textContent = `Ce ne sono ${fmtUnita(resto, p.unita)}${gia ? ` (più ${fmtUnita(gia, p.unita)} già in lista)` : ''}.`;
    $('#usa-qta').value = '';
    $('#usa-qta').max = resto;
    $('#usa-errore').hidden = true;
    const rapidi = { pz: [1, 2, 5], conf: [1, 2], kg: [0.5, 1, 2], lt: [0.5, 1, 2], gr: [100, 250, 500], ml: [100, 250, 500] }[p.unita] || [1];
    $('#usa-rapidi').innerHTML = rapidi.filter(v => v <= resto).map(v => `<button class="chip" type="button" data-act="usa-rapido" data-ref="${v}">${fmtUnita(v, p.unita)}</button>`).join('') +
        `<button class="chip" type="button" data-act="usa-rapido" data-ref="${resto}">Tutto</button>`;
    ui.apri('foglio-usa');
}
function confermaUsa(e) {
    e.preventDefault();
    const p = state.dispensa.find(x => x.id === state.usaId);
    const q = tre(String($('#usa-qta').value).replace(',', '.'));
    const gia = state.uso.find(u => u.id === p.id);
    const resto = Number(p.quantita) - (gia?.qty || 0);
    if (!(q > 0)) { $('#usa-errore').textContent = 'Scrivi quanto ne usi.'; $('#usa-errore').hidden = false; return; }
    if (q > resto + 1e-9) { $('#usa-errore').textContent = `Ce ne sono solo ${fmtUnita(resto, p.unita)}.`; $('#usa-errore').hidden = false; return; }
    if (gia) gia.qty = tre(gia.qty + q); else state.uso.push({ id: p.id, qty: q });
    salvaUso();
    ui.chiudi();
    renderDispensa(); renderBarraUso();
}
function renderUso() {
    $('#uso-righe').innerHTML = state.uso.length ? `<div class="lista">${state.uso.map((u, i) => {
        const p = state.dispensa.find(x => x.id === u.id);
        return `<div class="riga"><div class="riga-testo"><div class="riga-titolo">${esc(p?.nome)}</div><div class="riga-sotto">Ce ne sono ${fmtUnita(p?.quantita, p?.unita)}</div></div>
            <div class="riga-num" style="font-size:19px">${fmtUnita(u.qty, p?.unita)}</div>
            <button class="btn btn-icona btn-testo" data-act="uso-togli" data-ref="${i}" aria-label="Togli" type="button">${icon('chiudi')}</button></div>`;
    }).join('')}</div>` : `<div class="vuoto"><p>Niente in lista.</p></div>`;
    $('#btn-uso').disabled = !state.uso.length;
}
async function confermaUso(e) {
    e.preventDefault();
    const nome = $('#uso-nome').value.trim();
    if (nome) store.set('nome', nome);
    const err = $('#uso-errore'); err.hidden = true;
    ui.carica(true);
    const { data, error } = await sb.rpc('usa_cambusa', { p_utente: nome || 'Utente', p_righe: state.uso.map(u => ({ id: u.id, qty: u.qty })) });
    ui.carica(false);
    if (error) { err.textContent = errMsg(error); err.hidden = false; await caricaDati(); renderUso(); return; }
    const voci = data?.voci || [], avvisi = data?.avvisi || [];
    notifica('Cambusa: prodotti usati',
        `<h3>Usati dalla dispensa${nome ? ` (${esc(nome)})` : ''}</h3><ul>${voci.map(v => `<li>${esc(v.nome)}: ${fmt.num(v.qty)} ${esc(v.unita || '')}, restano ${fmt.num(v.rimasti)}</li>`).join('')}</ul>` +
        (avvisi.length ? `<p><b>Stanno finendo:</b> ${esc(avvisi.map(a => a.nome).join(', '))}</p>` : ''));
    state.uso = []; salvaUso();
    ui.chiudi();
    ui.toast('Segnati come usati');
    await caricaDati();
}

// ---------- Rifornimento ----------
function renderRifornisci() {
    const q = parole(state.rifTesto);
    const lista = state.dispensa.filter(p => corrisponde(p.nome, q));
    $('#rif-righe').innerHTML = lista.length ? lista.map(p => {
        const r = state.rifornisci[p.id] || {};
        return `<div class="riga" style="flex-wrap:wrap">
            <div class="riga-testo" style="flex-basis:100%"><div class="riga-titolo">${esc(p.nome)}</div>
                <div class="riga-sotto">Ora ${fmtUnita(p.quantita, p.unita)}${p.scadenza ? `, scade il ${fmt.data(p.scadenza)}` : ''}</div></div>
            <div class="campi-2" style="flex:1">
                <label class="campo" style="margin:0"><span class="piccolo">Aggiungi (${esc(p.unita)})</span><input type="number" inputmode="decimal" min="0" step="any" data-rif="qty" data-ref="${p.id}" value="${esc(r.qty || '')}"></label>
                <label class="campo" style="margin:0"><span class="piccolo">Nuova scadenza</span><input type="date" data-rif="scad" data-ref="${p.id}" value="${esc(r.scad || '')}"></label>
            </div></div>`;
    }).join('') : `<div class="vuoto"><p>${state.dispensa.length ? 'Niente con questo nome.' : 'La dispensa è vuota: aggiungi prima i prodotti.'}</p></div>`;
}
async function confermaRifornisci(e) {
    e.preventDefault();
    const righe = Object.entries(state.rifornisci).map(([id, r]) => ({ id, qty: Number(String(r.qty || '').replace(',', '.')) > 0 ? tre(String(r.qty).replace(',', '.')) : null, scadenza: r.scad || null }))
        .filter(r => r.qty || r.scadenza);
    if (!righe.length) return ui.toast('Scrivi almeno una quantità o una scadenza', 'errore');
    const nome = $('#rif-nome').value.trim();
    if (nome) store.set('nome', nome);
    ui.carica(true);
    const { error } = await sb.rpc('rifornisci_cambusa', { p_utente: nome || 'Utente', p_righe: righe });
    ui.carica(false);
    if (error) return ui.toast(errMsg(error), 'errore');
    state.rifornisci = {};
    ui.chiudi();
    ui.toast(`Aggiornati ${righe.length === 1 ? '1 prodotto' : `${righe.length} prodotti`}`);
    await caricaDati();
}

// ---------- Prodotto (nuovo o in modifica) ----------
function apriProdotto(id = null) {
    const p = id ? state.dispensa.find(x => x.id === id) : null;
    $('#prod-titolo').textContent = p ? 'Modifica prodotto' : 'Nuovo prodotto';
    $('#prod-id').value = p?.id || '';
    $('#prod-nome').value = p?.nome || '';
    $('#prod-cat').value = p?.categoria || 'pasti';
    $('#prod-qta').value = p ? p.quantita : '';
    $('#prod-unita').value = p?.unita && ['pz', 'conf', 'kg', 'gr', 'lt', 'ml'].includes(p.unita) ? p.unita : 'pz';
    $('#prod-scad').value = p?.scadenza || '';
    $('#prod-soglia').value = p?.soglia ?? 1;
    $('#campo-soglia').hidden = !auth.admin;
    $('#prod-nota').hidden = auth.admin;
    $('#prod-errore').hidden = true;
    $('#btn-elimina-prodotto').hidden = !p;
    ui.apri('foglio-prodotto');
}
async function salvaProdotto(e) {
    e.preventDefault();
    const id = $('#prod-id').value, err = $('#prod-errore');
    err.hidden = true;
    const dati = {
        nome: $('#prod-nome').value.trim(), categoria: $('#prod-cat').value,
        quantita: tre(String($('#prod-qta').value).replace(',', '.')) || 0,
        unita: $('#prod-unita').value, scadenza: $('#prod-scad').value || null
    };
    if (!dati.nome) { err.textContent = 'Scrivi il nome.'; err.hidden = false; return; }
    if (auth.admin) dati.soglia = Number($('#prod-soglia').value) || 0;
    const vecchio = id ? state.dispensa.find(x => x.id === id) : null;
    if (!vecchio) dati.stato = auth.admin ? 'approved' : 'pending';
    ui.carica(true);
    const res = id ? await sb.from('cambusa').update(dati).eq('id', id).select() : await sb.from('cambusa').insert([dati]).select();
    ui.carica(false);
    if (res.error) { err.textContent = errMsg(res.error); err.hidden = false; return; }
    if (!res.data?.length) { err.textContent = 'Non hai il permesso di modificare questo prodotto.'; err.hidden = false; return; }
    if (!id && !auth.admin) {
        aggiungiMio('mie_prodotti', res.data[0].id);
        notifica('Cambusa: prodotto da approvare', `<p>Nuovo prodotto in attesa: <b>${esc(dati.nome)}</b>, ${fmt.num(dati.quantita)} ${esc(dati.unita)}</p>`);
    }
    ui.chiudi();
    ui.toast(id ? 'Prodotto salvato' : auth.admin ? 'Prodotto aggiunto' : 'Prodotto proposto: lo approva l\'admin');
    await caricaDati();
}
async function eliminaProdotto() {
    const id = $('#prod-id').value, p = state.dispensa.find(x => x.id === id);
    if (!p || !await ui.chiedi({ titolo: `Eliminare ${p.nome}?`, ok: 'Elimina', pericolo: true })) return;
    ui.carica(true);
    const { error } = await sb.from('cambusa').delete().eq('id', id);
    ui.carica(false);
    if (error) return ui.toast(errMsg(error), 'errore');
    state.uso = state.uso.filter(u => u.id !== id); salvaUso();
    ui.chiudi();
    ui.toast('Prodotto eliminato');
    await caricaDati();
}

// =====================================================================
// Gestione (admin)
// =====================================================================
function aggiornaBollini() {
    const n = state.dispensa.filter(p => p.stato === 'pending').length + state.ricette.filter(inAttesa).length;
    for (const id of ['#bollino-approvazioni', '#bollino-admin']) { const b = $(id); b.hidden = !n || !auth.admin; b.textContent = n; }
}
async function renderAdmin() {
    $$('#tabs-admin .tab').forEach(t => t.setAttribute('aria-selected', t.dataset.tab === state.tab));
    const corpo = $('#admin-corpo');
    if (state.tab === 'approvazioni') {
        const prodotti = state.dispensa.filter(p => p.stato === 'pending'), ricette = state.ricette.filter(inAttesa);
        corpo.innerHTML = (!prodotti.length && !ricette.length) ? `<div class="vuoto"><h3>Niente da approvare</h3><p>Quando qualcuno propone un prodotto o una ricetta, compare qui.</p></div>` : `
            ${prodotti.length ? `<div class="sezione-testa"><h2>Prodotti</h2><span class="conta">${prodotti.length}</span></div><div class="lista" style="margin-bottom:20px">${prodotti.map(p => `
                <div class="riga" style="flex-wrap:wrap"><div class="riga-testo"><div class="riga-titolo">${esc(p.nome)}</div>
                    <div class="riga-sotto">${fmtUnita(p.quantita, p.unita)}, ${esc(CAT_DISPENSA[p.categoria] || p.categoria)}${p.scadenza ? `, scade il ${fmt.data(p.scadenza)}` : ''}</div></div>
                    <div class="riga-azioni"><button class="btn btn-piccolo" data-act="modifica-prodotto" data-ref="${p.id}" type="button">Modifica</button>
                    <button class="btn btn-piccolo btn-pericolo" data-act="rifiuta-prodotto" data-ref="${p.id}" type="button">Rifiuta</button>
                    <button class="btn btn-piccolo btn-primario" data-act="approva-prodotto" data-ref="${p.id}" type="button">Approva</button></div></div>`).join('')}</div>` : ''}
            ${ricette.length ? `<div class="sezione-testa"><h2>Ricette</h2><span class="conta">${ricette.length}</span></div><div class="lista">${ricette.map(r => `
                <div class="riga" style="flex-wrap:wrap"><div class="riga-testo"><div class="riga-titolo">${esc(r.nome)}</div>
                    <div class="riga-sotto">${pastiDi(r).map(t => PASTI[t]).join(', ')}, ${(r.ingredienti_ricetta || []).length} ingredienti</div></div>
                    <div class="riga-azioni"><button class="btn btn-piccolo" data-act="modifica-ricetta" data-ref="${r.id}" type="button">Modifica</button>
                    <button class="btn btn-piccolo btn-pericolo" data-act="elimina-ricetta" data-ref="${r.id}" type="button">Elimina</button>
                    <button class="btn btn-piccolo btn-primario" data-act="approva-ricetta" data-ref="${r.id}" type="button">Approva</button></div></div>`).join('')}</div>` : ''}`;
    } else if (state.tab === 'scorte') {
        const lista = state.dispensa.filter(p => p.stato !== 'pending');
        corpo.innerHTML = `<div class="sezione-testa"><h2>Dispensa</h2><button class="btn btn-primario" data-act="nuovo-prodotto" type="button">${icon('piu', 'ico-s')}Nuovo</button></div>
            ${lista.length ? `<div class="lista">${lista.map(p => {
                const gg = giorniAllaScadenza(p.scadenza);
                return `<button class="riga" data-act="modifica-prodotto" data-ref="${p.id}" type="button"><span class="riga-testo">
                    <span class="riga-titolo" style="display:block">${esc(p.nome)}</span>
                    <span class="riga-sotto" style="display:block;${gg !== null && gg < 0 ? 'color:var(--errore)' : ''}">${p.scadenza ? `Scade il ${fmt.data(p.scadenza)}` : 'Senza scadenza'}, avviso sotto ${fmt.num(p.soglia)}</span></span>
                    <span class="riga-num" style="font-size:19px">${fmtUnita(p.quantita, p.unita)}</span></button>`;
            }).join('')}</div>` : `<div class="vuoto"><h3>Dispensa vuota</h3></div>`}`;
    } else {
        if (!state.movimenti) {
            corpo.innerHTML = `<div class="scheletro" style="height:240px"></div>`;
            const { data, error } = await sb.from('movimenti_cambusa').select('*').order('created_at', { ascending: false }).limit(300);
            if (error) ui.toast(errMsg(error), 'errore');
            state.movimenti = data || [];
        }
        const ico = { consumo: 'pentola', rifornimento: 'camion' };
        corpo.innerHTML = state.movimenti.length ? `<div class="lista">${state.movimenti.map(m => `<div class="riga">${icon(ico[m.azione] || 'lista')}
            <div class="riga-testo"><div class="riga-titolo">${esc(m.prodotto)}</div><div class="riga-sotto">${esc(m.utente || '')}, ${fmt.quando(m.created_at)}</div></div>
            <div class="riga-num" style="font-size:19px;color:${Number(m.quantita) < 0 ? 'var(--errore)' : 'var(--ok)'}">${Number(m.quantita) > 0 ? '+' : ''}${fmt.num(m.quantita)} <small class="tenue">${esc(m.unita || '')}</small></div></div>`).join('')}</div>`
            : `<div class="vuoto"><h3>Nessun movimento</h3></div>`;
    }
}

// =====================================================================
// Eventi
// =====================================================================
function collegaEventi() {
    azioni(document.body, {
        vai: el => nav(el.dataset.ref),
        'nuovo-menu': () => apriFormMenu('nuovo'),
        'apri-menu': el => nav('menu-dettaglio', el.dataset.ref),
        'modifica-menu': () => apriFormMenu('modifica', state.menuId),
        'duplica-menu': () => apriFormMenu('duplica', state.menuId),
        'elimina-menu': async () => {
            const m = menuCorrente();
            if (!await ui.chiedi({ titolo: `Eliminare ${m.nome}?`, testo: 'Le ricette restano, sparisce solo questo menu.', ok: 'Elimina', pericolo: true })) return;
            const { error } = await sb.from('menu_campi').delete().eq('id', m.id);
            if (error) return ui.toast(errMsg(error), 'errore');
            ui.toast('Menu eliminato');
            await caricaDati(); nav('menu');
        },
        'vai-spesa': () => nav('spesa', state.menuId),
        'apri-pasto': el => apriPasto(el.dataset.g, el.dataset.p),
        'pasto-aggiungi': el => { pastoAperto().ricette.push(Number(el.dataset.ref) || el.dataset.ref); pastoCambiato(); },
        'pasto-togli': el => { pastoAperto().ricette.splice(Number(el.dataset.ref), 1); pastoCambiato(); },
        'ricetta-da-pasto': () => { state.dopoRicetta = (id) => { if (id && pastoAperto()) { pastoAperto().ricette.push(id); pastoCambiato(); } }; apriRicetta(null, false, true); },
        'spesa-spunta': el => spunta(el.dataset.ref),
        'spesa-azzera': async () => {
            const m = menuCorrente(); m.spesa_spuntati = []; renderSpesa();
            const { error } = await sb.from('menu_campi').update({ spesa_spuntati: [] }).eq('id', m.id);
            if (error) ui.toast(errMsg(error), 'errore');
        },
        'spesa-condividi': () => condividiTesto('Lista della spesa', testoSpesa(menuCorrente())),
        'spesa-copia': () => copiaTesto(testoSpesa(menuCorrente())),
        'spesa-stampa': () => window.print(),
        'cambia-reparto': el => apriReparto(el.dataset.ref, el.dataset.nome),
        'scegli-reparto': el => scegliReparto(el.dataset.ref),
        'ric-filtro': el => { state.filtroRic.pasto = el.dataset.ref; renderRicette(); },
        'nuova-ricetta': () => { state.dopoRicetta = null; apriRicetta(); },
        'modifica-ricetta': el => { state.dopoRicetta = null; apriRicetta(el.dataset.ref); },
        'variante-ricetta': el => { state.dopoRicetta = null; apriRicetta(el.dataset.ref, true); },
        'elimina-ricetta': el => eliminaRicetta(el.dataset.ref || state.ricMod?.id),
        'ric-pasto': el => { leggiIngredienti(); const s = state.ricMod.pasti; s.has(el.dataset.ref) ? s.delete(el.dataset.ref) : s.add(el.dataset.ref); renderRicettaForm(); },
        'ing-aggiungi': () => { leggiIngredienti(); state.ricMod.ingredienti.push({ nome: '', qty: '', unita: 'gr' }); renderRicettaForm(); $$('#ric-ingredienti [data-campo=nome]').pop()?.focus(); },
        'ing-togli': el => { leggiIngredienti(); state.ricMod.ingredienti.splice(Number(el.dataset.ref), 1); renderRicettaForm(); },
        'approva-ricetta': async el => {
            const { error } = await sb.from('ricette').update({ status: 'approved' }).eq('id', el.dataset.ref);
            if (error) return ui.toast(errMsg(error), 'errore');
            ui.toast('Ricetta approvata'); await caricaDati();
        },
        'disp-filtro': el => { state.filtroDisp.cat = el.dataset.ref; renderDispensa(); },
        usa: el => apriUsa(el.dataset.ref),
        'usa-rapido': el => { $('#usa-qta').value = el.dataset.ref; },
        'apri-uso': () => { renderUso(); $('#uso-nome').value = store.get('nome', ''); $('#uso-errore').hidden = true; ui.apri('foglio-uso'); },
        'uso-togli': el => { state.uso.splice(Number(el.dataset.ref), 1); salvaUso(); renderUso(); renderDispensa(); renderBarraUso(); if (!state.uso.length) ui.chiudi(); },
        'svuota-uso': () => { state.uso = []; salvaUso(); renderDispensa(); renderBarraUso(); ui.chiudi(); },
        'apri-rifornisci': () => { state.rifornisci = {}; state.rifTesto = ''; $('#rif-cerca').value = ''; $('#rif-nome').value = store.get('nome', ''); renderRifornisci(); ui.apri('foglio-rifornisci'); },
        'nuovo-prodotto': () => apriProdotto(),
        'modifica-prodotto': el => apriProdotto(el.dataset.ref),
        'elimina-prodotto': () => eliminaProdotto(),
        'approva-prodotto': async el => {
            const { error } = await sb.from('cambusa').update({ stato: 'approved' }).eq('id', el.dataset.ref);
            if (error) return ui.toast(errMsg(error), 'errore');
            ui.toast('Prodotto approvato'); await caricaDati();
        },
        'rifiuta-prodotto': async el => {
            if (!await ui.chiedi({ titolo: 'Rifiutare la proposta?', testo: 'Il prodotto viene eliminato.', ok: 'Rifiuta', pericolo: true })) return;
            const { error } = await sb.from('cambusa').delete().eq('id', el.dataset.ref);
            if (error) return ui.toast(errMsg(error), 'errore');
            await caricaDati();
        }
    });

    $$('.nav-voce').forEach(b => b.addEventListener('click', () => nav(b.dataset.vista)));
    $$('#tabs-admin .tab').forEach(t => t.addEventListener('click', () => { state.tab = t.dataset.tab; store.set('tab_cambusa', state.tab); renderAdmin(); }));
    $('#ricette-cerca').addEventListener('input', debounce(e => { state.filtroRic.testo = e.target.value; renderRicette(); }, 150));
    $('#dispensa-cerca').addEventListener('input', debounce(e => { state.filtroDisp.testo = e.target.value; renderDispensa(); }, 150));
    $('#pasto-cerca').addEventListener('input', debounce(renderPasto, 120));
    $('#pasto-sacco').addEventListener('change', e => { pastoAperto().sacco = e.target.checked; pastoCambiato(); });
    $('#rif-cerca').addEventListener('input', debounce(e => { state.rifTesto = e.target.value; renderRifornisci(); }, 150));
    $('#rif-righe').addEventListener('input', e => {
        const t = e.target; if (!t.dataset.rif) return;
        state.rifornisci[t.dataset.ref] = { ...(state.rifornisci[t.dataset.ref] || {}), [t.dataset.rif]: t.value };
    });
    $('#form-menu').addEventListener('submit', salvaFormMenu);
    $('#form-ricetta').addEventListener('submit', salvaRicetta);
    $('#form-usa').addEventListener('submit', confermaUsa);
    $('#form-uso').addEventListener('submit', confermaUso);
    $('#form-rifornisci').addEventListener('submit', confermaRifornisci);
    $('#form-prodotto').addEventListener('submit', salvaProdotto);
}

function impostaAccount() {
    const b = $('#btn-account');
    if (auth.user) { b.innerHTML = icon('esci'); b.setAttribute('aria-label', 'Esci dall\'area admin'); b.onclick = async () => { if (await ui.chiedi({ titolo: 'Uscire dall\'area admin?', ok: 'Esci' })) auth.logout(); }; }
    else { b.innerHTML = icon('lucchetto'); b.setAttribute('aria-label', 'Accesso admin'); b.onclick = () => auth.apriLogin(); }
}
function riempiIcone() {
    $$('[data-ico]').forEach(el => { el.outerHTML = icon(el.dataset.ico, el.closest('.btn') && !el.closest('.btn-icona') ? 'ico-s' : ''); });
    $$('[data-chiudi]').forEach(el => { if (!el.innerHTML.trim()) el.innerHTML = icon('chiudi'); });
}
function attivaTempoReale() {
    try {
        const ricarica = debounce(() => caricaDati(), 600);
        sb.channel('cambusa')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'cambusa' }, ricarica)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'ricette' }, ricarica)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'ingredienti_ricetta' }, ricarica)
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
    if (inManutenzione('cambusa')) {
        mostraManutenzione($('#main'), 'Stiamo riordinando la cambusa, torna più tardi.');
        $('.nav-basso').hidden = true;
        return;
    }
    $('#nav-admin').hidden = !auth.admin;
    collegaEventi();
    osservaBarraFiltri();
    await caricaDati();
    const daIndirizzo = () => {
        const [v, id] = location.hash.slice(1).split('/');
        if (v === 'menu' && id) nav('menu-dettaglio', id);
        else if (v === 'spesa' && id) nav('spesa', id);
        else nav(['ricette', 'dispensa', 'admin'].includes(v) ? v : 'menu');
    };
    daIndirizzo();
    window.addEventListener('hashchange', daIndirizzo);
    attivaTempoReale();
})();
