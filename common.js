// =====================================================================
// Azimut.Arch · codice comune a Portale, Armadio e Cambusa
// =====================================================================

const CONFIG = {
    url: "https://jmildwxjaviqkrkhjzhl.supabase.co",
    key: "sb_publishable_PwYQxh8l7HLR49EC_wHa7A_gppKi_FS",
    adminEmail: "marcobolge@gmail.com",
    bucket: "immagini-oggetti"
};

// Metti true per chiudere una pagina al pubblico (l'admin la vede lo stesso)
const MANUTENZIONE = { portale: false, armadio: false, cambusa: false };

const sb = supabase.createClient(CONFIG.url, CONFIG.key);

// ---------- Utilità ----------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// Rende sicuro il testo scritto dagli utenti prima di metterlo nella pagina
function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const store = {
    get(k, def = null) { try { const v = localStorage.getItem('arch_' + k); return v === null ? def : JSON.parse(v); } catch { return def; } },
    set(k, v) { try { localStorage.setItem('arch_' + k, JSON.stringify(v)); } catch { /* memoria piena o bloccata */ } }
};

const fmt = {
    num(n, max = 2) { return Number(n || 0).toLocaleString('it-IT', { maximumFractionDigits: max }); },
    data(d) { return d ? new Date(d).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' }) : ''; },
    dataBreve(d) { return d ? new Date(d).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }) : ''; },
    giorno(d) { return new Date(d).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }); },
    ora(d) { return new Date(d).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }); },
    quando(d) {
        const ms = Date.now() - new Date(d).getTime(), g = Math.floor(ms / 86400000);
        if (ms < 3600000) return 'poco fa';
        if (g < 1) return 'oggi alle ' + fmt.ora(d);
        if (g < 2) return 'ieri alle ' + fmt.ora(d);
        return fmt.data(d);
    },
    pezzi(n) { return n === 1 ? '1 pezzo' : `${fmt.num(n)} pezzi`; },
    isoGiorno(d) { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; }
};

const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

// Messaggio d'errore comprensibile
function errMsg(error) {
    if (!error) return 'Errore sconosciuto';
    const m = error.message || String(error);
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Non riesco a raggiungere il server: controlla la connessione e riprova.';
    if (error.code === '23505') return 'Era già stato segnalato.';
    if (error.code === '42501' || /row-level security/i.test(m)) return 'Non hai il permesso di farlo. Se sei admin, accedi e riprova.';
    return m;
}

// ---------- Icone ----------
const ICONE = {
    cerca: '<circle cx="11" cy="11" r="7"/><path d="M16.5 16.5 21 21"/>',
    piu: '<path d="M12 5v14M5 12h14"/>',
    meno: '<path d="M5 12h14"/>',
    chiudi: '<path d="M6 6l12 12M18 6 6 18"/>',
    zaino: '<path d="M9 7V5.5a3 3 0 0 1 6 0V7"/><rect x="4.5" y="7" width="15" height="14" rx="4"/><path d="M8.5 13h7v4h-7z"/>',
    utente: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    spunta: '<path d="M5 12.5 9.5 17 19 7"/>',
    casa: '<path d="M3 11 12 4l9 7"/><path d="M5 9.5V20h5v-6h4v6h5V9.5"/>',
    lista: '<path d="M9 6h12M9 12h12M9 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01" stroke-width="3"/>',
    grafico: '<path d="M4 20V11M10 20V5M16 20v-6M2 20h20"/>',
    camion: '<path d="M2 6h12v10H2zM14 9h4l3 3.5V16h-7"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
    pacco: '<path d="M21 8 12 3 3 8l9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8"/>',
    annulla: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
    condividi: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
    copia: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
    stampa: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>',
    calendario: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    pentola: '<path d="M4 10h16v5a6 6 0 0 1-6 6h-4a6 6 0 0 1-6-6zM2 10h2M20 10h2"/><path d="M9 6.5c0-1.2 1.2-1.2 1.2-2.5M14 6.5c0-1.2 1.2-1.2 1.2-2.5"/>',
    libro: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H19v3H6.5"/>',
    matita: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    cestino: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    lucchetto: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    esci: '<path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10"/>',
    attenzione: '<path d="M12 3 22 20H2z"/><path d="M12 10v4M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    bandiera: '<path d="M5 21V4h11l-2 4 2 4H5"/>',
    orologio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    persone: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8"/>',
    avanti: '<path d="M9 5l7 7-7 7"/>',
    indietro: '<path d="M15 5l-7 7 7 7"/>',
    foto: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="m21 16-5-5-8 8"/>',
    carrello: '<path d="M3 4h2l2.4 11h11L21 7H6"/><circle cx="9" cy="19.5" r="1.5"/><circle cx="18" cy="19.5" r="1.5"/>',
    impostazioni: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z"/>',
    sacco: '<path d="M7 8c0-3 2-5 5-5s5 2 5 5"/><path d="M5 8h14l-1.5 12a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1z"/>'
};
function icon(nome, cls = '') {
    return `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONE[nome] || ''}</svg>`;
}

// ---------- Interfaccia ----------
const ui = {
    _pila: [],
    _caricamenti: 0,

    toast(msg, tipo = 'ok') {
        let box = $('.toast-box');
        if (!box) { box = document.createElement('div'); box.className = 'toast-box'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
        const t = document.createElement('div');
        t.className = `toast ${tipo}`;
        t.innerHTML = icon(tipo === 'errore' ? 'attenzione' : 'spunta') + `<span>${esc(msg)}</span>`;
        box.appendChild(t);
        while (box.children.length > 2) box.firstElementChild.remove();
        setTimeout(() => t.remove(), tipo === 'errore' ? 6000 : 3200);
    },

    // Barra di caricamento sottile in alto (non blocca la pagina)
    carica(attivo) {
        this._caricamenti = Math.max(0, this._caricamenti + (attivo ? 1 : -1));
        let b = $('.carica-barra');
        if (this._caricamenti > 0 && !b) { b = document.createElement('div'); b.className = 'carica-barra'; document.body.appendChild(b); }
        if (this._caricamenti === 0 && b) b.remove();
    },

    // Fogli dal basso: aperti uno sopra l'altro, il tasto Indietro del telefono chiude quello in cima
    _ignoraPop: 0,
    apri(id) {
        const f = document.getElementById(id);
        if (!f || this._pila.some(p => p.id === id)) return;
        let sfondo = $('#foglio-sfondo');
        if (!sfondo) {
            sfondo = document.createElement('div');
            sfondo.id = 'foglio-sfondo'; sfondo.className = 'foglio-sfondo'; sfondo.hidden = true;
            sfondo.addEventListener('click', () => ui.chiudi());
            document.body.appendChild(sfondo);
        }
        if (!this._pila.length) { try { history.pushState({ foglio: true }, ''); } catch { /* ignora */ } }
        this._pila.push({ id, focus: document.activeElement });
        sfondo.hidden = false;
        sfondo.style.zIndex = 79 + this._pila.length * 2;
        f.style.zIndex = 80 + this._pila.length * 2;
        f.hidden = false;
        requestAnimationFrame(() => { sfondo.classList.add('aperto'); f.classList.add('aperto'); });
        document.body.style.overflow = 'hidden';
        setTimeout(() => {
            const primo = f.querySelector('[autofocus], .foglio-corpo input:not([type=hidden]), .foglio-corpo textarea, .foglio-corpo select');
            if (primo && window.matchMedia('(min-width: 700px)').matches) primo.focus();
            else f.querySelector('.foglio-testa button, button')?.focus({ preventScroll: true });
        }, 60);
    },
    chiudi() {
        if (!this._pila.length) return;
        this._chiudiCima();
        if (!this._pila.length && history.state && history.state.foglio) { this._ignoraPop++; history.back(); }
    },
    _daIndietro() {
        if (this._ignoraPop > 0) { this._ignoraPop--; return; }
        if (!this._pila.length) return;
        this._chiudiCima();
        if (this._pila.length) { try { history.pushState({ foglio: true }, ''); } catch { /* ignora */ } }
    },
    _chiudiCima() {
        const cima = this._pila.pop();
        if (!cima) return;
        const f = document.getElementById(cima.id);
        if (f) { f.classList.remove('aperto'); setTimeout(() => { if (!f.classList.contains('aperto')) f.hidden = true; }, 260); f.dispatchEvent(new CustomEvent('chiuso')); }
        const sfondo = $('#foglio-sfondo');
        if (!this._pila.length) {
            if (sfondo) { sfondo.classList.remove('aperto'); setTimeout(() => { if (!this._pila.length) sfondo.hidden = true; }, 220); }
            document.body.style.overflow = '';
        } else if (sfondo) sfondo.style.zIndex = 79 + this._pila.length * 2;
        if (cima.focus && document.contains(cima.focus)) cima.focus.focus({ preventScroll: true });
    },
    aperto(id) { return this._pila.some(p => p.id === id); },

    // Conferma al posto di confirm(): restituisce true/false
    chiedi({ titolo, testo = '', ok = 'Conferma', annulla = 'Annulla', pericolo = false }) {
        return new Promise(resolve => {
            const f = $('#foglio-chiedi');
            $('#chiedi-titolo').textContent = titolo;
            $('#chiedi-testo').innerHTML = testo;
            const bOk = $('#chiedi-ok'), bNo = $('#chiedi-annulla');
            bOk.textContent = ok; bNo.textContent = annulla;
            bOk.className = 'btn btn-grande ' + (pericolo ? 'btn-pericolo pieno' : 'btn-primario');
            let risposta = false;
            const fine = () => { f.removeEventListener('chiuso', fine); resolve(risposta); };
            f.addEventListener('chiuso', fine);
            bOk.onclick = () => { risposta = true; ui.chiudi(); };
            bNo.onclick = () => ui.chiudi();
            ui.apri('foglio-chiedi');
        });
    },

    // Fogli comuni a tutte le pagine: conferma e accesso admin
    montaFogliComuni() {
        document.body.insertAdjacentHTML('beforeend', `
        <section class="foglio" id="foglio-chiedi" role="alertdialog" aria-modal="true" aria-labelledby="chiedi-titolo" hidden>
            <div class="maniglia"></div>
            <div class="foglio-corpo">
                <h2 id="chiedi-titolo" style="margin-bottom:8px"></h2>
                <div id="chiedi-testo" class="tenue"></div>
            </div>
            <div class="foglio-piede">
                <button id="chiedi-ok" class="btn btn-primario btn-grande"></button>
                <button id="chiedi-annulla" class="btn btn-grande"></button>
            </div>
        </section>
        <section class="foglio" id="foglio-login" role="dialog" aria-modal="true" aria-labelledby="login-titolo" hidden>
            <div class="maniglia"></div>
            <div class="foglio-testa">
                <h2 id="login-titolo">Accesso admin</h2>
                <button class="btn btn-icona btn-testo" data-chiudi aria-label="Chiudi">${icon('chiudi')}</button>
            </div>
            <form class="foglio-corpo" id="login-form">
                <label class="campo"><span>Email</span><input type="email" id="log-mail" autocomplete="username" required></label>
                <label class="campo"><span>Password</span><input type="password" id="log-pass" autocomplete="current-password" required></label>
                <p id="login-errore" class="avviso errore" hidden></p>
                <button class="btn btn-primario btn-grande btn-largo" type="submit">Entra</button>
            </form>
        </section>`);
        $('#login-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const err = $('#login-errore'); err.hidden = true;
            const ok = await auth.login($('#log-mail').value.trim(), $('#log-pass').value);
            if (!ok) { err.textContent = 'Email o password sbagliate.'; err.hidden = false; }
        });
        document.addEventListener('click', (e) => { if (e.target.closest('[data-chiudi]')) ui.chiudi(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ui._pila.length) ui.chiudi(); });
        window.addEventListener('popstate', () => ui._daIndietro());
    }
};

// Gestione click con data-act="nome" (niente onclick con stringhe dentro l'HTML)
function azioni(root, handlers) {
    root.addEventListener('click', (e) => {
        const el = e.target.closest('[data-act]');
        if (!el || !root.contains(el) || el.disabled) return;
        const fn = handlers[el.dataset.act];
        if (fn) { e.preventDefault(); fn(el, e); }
    });
}

// ---------- Accesso ----------
const auth = {
    user: null,
    admin: false,
    async init() {
        try {
            const { data } = await sb.auth.getSession();
            this.user = data?.session?.user || null;
            if (this.user) this.admin = await this.verificaAdmin();
        } catch (e) { console.warn('auth', e); }
        return this;
    },
    async verificaAdmin() {
        const { data, error } = await sb.rpc('is_admin');
        if (error) return this.user?.email === CONFIG.adminEmail;
        return data === true;
    },
    apriLogin() { ui.apri('foglio-login'); },
    async login(email, password) {
        ui.carica(true);
        const { error } = await sb.auth.signInWithPassword({ email, password });
        ui.carica(false);
        if (error) return false;
        location.reload();
        return true;
    },
    async logout() {
        await sb.auth.signOut();
        location.reload();
    }
};

// Pagina chiusa per manutenzione? (l'admin passa comunque)
function inManutenzione(pagina) {
    return MANUTENZIONE[pagina] && !auth.admin;
}
function mostraManutenzione(contenitore, testo) {
    contenitore.innerHTML = `
        <div class="manutenzione"><div>
            ${icon('impostazioni')}
            <h2>Chiuso per manutenzione</h2>
            <p class="tenue">${esc(testo)}</p>
            <button class="btn btn-testo" style="margin-top:18px" onclick="auth.apriLogin()">Accesso admin</button>
        </div></div>`;
}

// ---------- Email all'admin ----------
async function notifica(oggetto, html) {
    try {
        await fetch(`${CONFIG.url}/functions/v1/notify-admin`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${CONFIG.key}`, 'apikey': CONFIG.key, 'Content-Type': 'application/json' },
            body: JSON.stringify({ subject: oggetto, details: html, admin_email: CONFIG.adminEmail })
        });
    } catch (e) { console.warn('Email non inviata', e); }
}

// ---------- Condivisione ----------
async function condividiTesto(titolo, testo) {
    if (navigator.share) {
        try { await navigator.share({ title: titolo, text: testo }); return; }
        catch (e) { if (e.name === 'AbortError') return; }
    }
    window.open('https://wa.me/?text=' + encodeURIComponent(testo), '_blank', 'noopener');
}
async function copiaTesto(testo) {
    try { await navigator.clipboard.writeText(testo); ui.toast('Copiato'); }
    catch {
        const t = document.createElement('textarea'); t.value = testo; document.body.appendChild(t); t.select();
        try { document.execCommand('copy'); ui.toast('Copiato'); } catch { ui.toast('Non riesco a copiare: seleziona il testo a mano', 'errore'); }
        t.remove();
    }
}

// ---------- App installabile ----------
const pwa = {
    richiesta: null,
    init() {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
        }
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.richiesta = e;
            $$('[data-installa]').forEach(b => b.hidden = false);
        });
        document.addEventListener('click', async (e) => {
            if (!e.target.closest('[data-installa]') || !this.richiesta) return;
            this.richiesta.prompt();
            await this.richiesta.userChoice;
            this.richiesta = null;
            $$('[data-installa]').forEach(b => b.hidden = true);
        });
    }
};

// Bordo sotto la barra dei filtri quando si scorre
function osservaBarraFiltri() {
    for (const barra of $$('.barra-filtri')) {
        const sentinella = document.createElement('div');
        barra.before(sentinella);
        new IntersectionObserver(([e]) => barra.classList.toggle('staccata', !e.isIntersecting)).observe(sentinella);
    }
}

pwa.init();
