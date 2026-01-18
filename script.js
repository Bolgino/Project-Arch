// --- CONFIGURAZIONE ---
const CONFIG = {
    url: "https://jmildwxjaviqkrkhjzhl.supabase.co", // TUO URL
    key: "sb_publishable_PwYQxh8l7HLR49EC_wHa7A_gppKi_FS", // TUA KEY
    adminEmail: "marcobolge@gmail.com",
    bucket: "immagini-oggetti"
};

const _sb = supabase.createClient(CONFIG.url, CONFIG.key);

// --- STATO ---
const state = { cart: [], products: [], packs: [], user: null };

// --- LOADER UTILS ---
const loader = {
    phrases: [
        "Sto calcolando l'azimut...",
        "Sto orientando la cartina...",
        "Accendo il fuoco...",
        "Conto le scorte...",
        "Monto la tenda...",
        "Controllo i nodi..."
    ],
    show() {
        const el = document.getElementById('scout-loader');
        const txt = document.getElementById('loader-text');
        txt.innerText = this.phrases[Math.floor(Math.random() * this.phrases.length)];
        el.classList.remove('pointer-events-none', 'opacity-0');
    },
    hide() {
        setTimeout(() => {
            document.getElementById('scout-loader').classList.add('opacity-0', 'pointer-events-none');
        }, 2000); // MINIMO 2 SECONDI DI LOADER
    }
};

// --- APP CONTROLLER ---
const app = {
    async init() {
        loader.show(); // Mostra loader
        await auth.check();
        await this.loadData();
        loader.hide(); // Nascondi dopo caricamento
    },

    async loadData() {
        const { data: p } = await _sb.from('oggetti').select('*').order('nome');
        const { data: k } = await _sb.from('pacchetti').select('*');
        state.products = p || [];
        state.packs = k || [];
        
        if (state.user) {
            admin.renderStock();
            admin.renderRestock(); // Renderizza scheda rifornimento
            admin.renderPackBuilder();
            admin.checkMod();
        } else {
            this.renderShop();
            archive.load();
        }
    },

    nav(view) {
        document.querySelectorAll('section').forEach(el => el.classList.add('hidden'));
        document.getElementById(`view-${view}`).classList.remove('hidden');
        
        // Aggiorna visibilità navbar pubblica
        if(view === 'shop' || view === 'archive') {
           // Logica nav attiva
        }
    },

    renderShop() {
        document.getElementById('nav-public').classList.remove('hidden');
        
        // RENDER PRODOTTI
        document.getElementById('shop-products').innerHTML = state.products.map(p => `
            <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-lg transition flex flex-col h-full group">
                <div class="h-32 bg-gray-50 p-4 relative flex items-center justify-center">
                    <img src="${p.foto_url || 'https://placehold.co/200?text=📦'}" class="max-h-full max-w-full object-contain mix-blend-multiply transition group-hover:scale-110 duration-300">
                    ${p.quantita_disponibile <= p.soglia_minima ? 
                        '<span class="absolute top-2 right-2 bg-red-100 text-red-600 text-[10px] font-bold px-2 py-0.5 rounded-full border border-red-200 shadow-sm animate-pulse">SCORTA BASSA</span>' 
                        : ''}
                </div>
                
                <div class="p-3 flex flex-col flex-grow">
                    <h4 class="font-bold text-sm leading-tight mb-1 text-gray-800 line-clamp-2">${p.nome}</h4>
                    <p class="text-xs text-gray-500 mb-3 font-mono">Disponibili: <span class="text-green-700 font-bold">${p.quantita_disponibile}</span></p>
                    
                    <div class="mt-auto flex items-center gap-1">
                        <input type="number" id="shop-qty-${p.id}" value="1" min="1" max="${p.quantita_disponibile}" 
                               class="w-10 p-1 text-center border rounded text-sm focus:ring-2 focus:ring-green-500 outline-none bg-gray-50 font-bold">
                        
                        <button onclick="const q = document.getElementById('shop-qty-${p.id}').value; cart.add('${p.id}', '${p.nome}', 'item', parseInt(q), ${p.quantita_disponibile})" 
                                class="flex-1 bg-green-50 text-green-800 text-xs font-bold py-2 rounded hover:bg-green-700 hover:text-white transition border border-green-100">
                            AGGIUNGI
                        </button>
                    </div>
                </div>
            </div>
        `).join('');

        // RENDER PACCHETTI
        document.getElementById('shop-packs').innerHTML = state.packs.map(p => `
            <div class="bg-yellow-50 p-4 rounded-xl border-l-4 border-yellow-400 flex justify-between items-center shadow-sm hover:shadow-md transition">
                <div>
                    <h4 class="font-bold text-yellow-900 leading-tight text-lg">🎁 ${p.nome}</h4>
                    <span class="text-[10px] uppercase tracking-wide text-yellow-700 font-bold bg-yellow-100 px-1 rounded">Kit Pronto</span>
                </div>
                <button onclick="cart.add('${p.id}', '${p.nome}', 'pack', 1, 999)" 
                        class="bg-yellow-400 text-yellow-900 px-4 py-2 rounded-lg text-xs font-bold hover:bg-yellow-500 shadow-sm transform active:scale-95">
                    PRENDI
                </button>
            </div>
        `).join('');
    },

    async checkout() {
        const name = document.getElementById('checkout-name').value;
        if (!name || state.cart.length === 0) return ui.toast("Inserisci il tuo nome e riempi il carrello!", "error");

        loader.show(); // Mostra loader durante checkout
        let details = `<h3>Prelievo di: ${name}</h3><ul>`;

        for (let i of state.cart) {
            if (i.type === 'item') {
                const nQ = i.max - i.qty;
                await _sb.from('oggetti').update({ quantita_disponibile: nQ }).eq('id', i.id);
                details += `<li>${i.name} <b>(${i.qty})</b></li>`;
            } else {
                const { data: comps } = await _sb.from('componenti_pacchetto').select('*, oggetti(*)').eq('pacchetto_id', i.id);
                for (let c of comps) {
                    await _sb.from('oggetti').update({ quantita_disponibile: c.oggetti.quantita_disponibile - c.quantita_necessaria }).eq('id', c.oggetto_id);
                }
                details += `<li>KIT ${i.name}</li>`;
            }
        }
        details += `</ul>`;

        // Notifica Admin (Opzionale se hai la funzione configurata)
        try {
            await fetch(`${CONFIG.url}/functions/v1/notify-admin`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${CONFIG.key}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ details, admin_email: CONFIG.adminEmail })
            });
        } catch(e) { console.log("No notify func"); }

        cart.empty();
        ui.toggleCart();
        loader.hide();
        ui.toast("Buona Caccia! Materiale Prelevato.", "success");
        setTimeout(() => location.reload(), 1500);
    }
};

// --- CART LOGIC ---
const cart = {
    add(id, name, type, qty, max) {
        if(isNaN(qty) || qty < 1) return ui.toast("Quantità non valida", "error");
        const exists = state.cart.find(x => x.id === id);
        if (exists) {
            if (exists.qty + qty > max) return ui.toast("Non abbiamo abbastanza scorte!", "error");
            exists.qty += qty;
        } else {
            state.cart.push({ id, name, type, qty, max });
        }
        this.render();
        ui.toast(`${name} aggiunto allo zaino`, "success");
    },
    remove(idx) { state.cart.splice(idx, 1); this.render(); },
    empty() { state.cart = []; this.render(); },
    render() {
        document.getElementById('cart-count').innerText = state.cart.length;
        document.getElementById('cart-items').innerHTML = state.cart.length ? state.cart.map((i, idx) => `
            <div class="flex justify-between items-center bg-white p-3 rounded shadow-sm border-l-4 border-green-600">
                <div class="text-sm">
                    <div class="font-bold text-gray-800">${i.name}</div>
                    <span class="text-gray-500 text-xs bg-gray-100 px-1 rounded">Qta: ${i.qty}</span>
                </div>
                <button onclick="cart.remove(${idx})" class="text-red-400 hover:text-red-600 font-bold px-2 text-xl">&times;</button>
            </div>
        `).join('') : '<p class="text-gray-400 text-center text-sm py-4 italic">Lo zaino è vuoto...</p>';
    }
};

// --- ARCHIVE ---
const archive = {
    async load() {
        // Carica solo approvati
        const { data } = await _sb.from('archivio').select('*').eq('status', 'approved').order('created_at', { ascending: false });
        this.render(data, 'archive-list');
    },
    render(data, elId, isAdmin = false) {
        const el = document.getElementById(elId);
        if (!data || !data.length) { el.innerHTML = '<p class="text-gray-400 italic text-center w-full col-span-2">Nessun ricordo trovato.</p>'; return; }
        el.innerHTML = data.map(m => `
            <div class="bg-white p-5 rounded-xl shadow-md border-b-4 ${isAdmin ? 'border-red-400' : 'border-green-600'} hover:transform hover:-translate-y-1 transition duration-300">
                <div class="flex justify-between items-start mb-2">
                    <div>
                        <h4 class="font-bold text-lg text-gray-800 leading-none">${m.evento}</h4>
                        <span class="text-xs text-green-600 font-bold uppercase tracking-wider">${m.luogo}</span>
                    </div>
                    ${isAdmin ? `
                        <div class="flex gap-1">
                            <button onclick="admin.memAction('${m.id}', 'approved')" class="bg-green-100 text-green-700 p-1 rounded hover:bg-green-200 text-xs font-bold">ACCETTA</button>
                            <button onclick="admin.memAction('${m.id}', 'del')" class="bg-red-100 text-red-700 p-1 rounded hover:bg-red-200 text-xs font-bold">RIFIUTA</button>
                        </div>
                    ` : '<span class="text-2xl opacity-20">❝</span>'}
                </div>
                <p class="text-gray-600 text-sm italic border-l-2 border-gray-200 pl-3">"${m.aneddoto}"</p>
            </div>
        `).join('');
    },
    async submit() {
        const ev = document.getElementById('mem-ev').value;
        const pl = document.getElementById('mem-pl').value;
        const tx = document.getElementById('mem-tx').value;
        if (!ev || !tx) return ui.toast("Scrivi almeno evento e aneddoto!", "error");
        
        // NOTA PER L'UTENTE: Assicurati che su Supabase ci sia una policy INSERT per public sulla tabella 'archivio'
        const { error } = await _sb.from('archivio').insert([{ evento: ev, luogo: pl, aneddoto: tx, status: 'pending' }]);
        
        if(error) {
            console.error(error);
            ui.toast("Errore invio (Controlla permessi RLS)", "error");
        } else {
            ui.toast("Ricordo inviato ai Capi per approvazione!", "success");
            // Pulisci form
            document.getElementById('mem-ev').value = "";
            document.getElementById('mem-pl').value = "";
            document.getElementById('mem-tx').value = "";
            ui.closeModals();
        }
    }
};

// --- ADMIN ---
const admin = {
    tab(t) {
        document.querySelectorAll('.admin-tab').forEach(e => e.classList.add('hidden'));
        document.getElementById(`admin-tab-${t}`).classList.remove('hidden');
    },
    renderStock() {
        document.getElementById('admin-stock-list').innerHTML = state.products.map(p => `
            <div class="flex justify-between items-center py-3 hover:bg-gray-50 px-2 transition">
                <div class="flex items-center gap-3">
                    <img src="${p.foto_url || ''}" class="w-10 h-10 object-contain bg-white border rounded p-0.5">
                    <div>
                        <div class="font-bold text-gray-800">${p.nome}</div>
                        <div class="text-xs text-gray-500 font-mono">
                            Qty: <span class="${p.quantita_disponibile <= p.soglia_minima ? 'text-red-600 font-bold' : 'text-green-600'}">${p.quantita_disponibile}</span> 
                            | Min: ${p.soglia_minima}
                        </div>
                    </div>
                </div>
                <button onclick="admin.openEdit('${p.id}')" class="text-blue-600 text-xs font-bold bg-blue-50 px-3 py-1.5 rounded hover:bg-blue-100">MODIFICA</button>
            </div>
        `).join('');
    },
    // NUOVA FUNZIONE RIFORNIMENTO
    renderRestock() {
        document.getElementById('admin-restock-list').innerHTML = state.products.map(p => `
            <div class="bg-white border rounded p-3 flex justify-between items-center shadow-sm">
                <div class="truncate pr-2">
                    <div class="font-bold text-sm text-gray-700 truncate">${p.nome}</div>
                    <div class="text-xs text-gray-400">Attuali: ${p.quantita_disponibile}</div>
                </div>
                <div class="flex items-center bg-blue-50 rounded px-2">
                    <span class="text-blue-800 text-xs font-bold mr-2">+</span>
                    <input type="number" min="0" placeholder="0" data-id="${p.id}" data-current="${p.quantita_disponibile}" class="restock-input w-16 p-1 text-center bg-transparent outline-none font-bold text-blue-900 border-b border-blue-200 focus:border-blue-500">
                </div>
            </div>
        `).join('');
    },
    async processRestock() {
        const inputs = document.querySelectorAll('.restock-input');
        let updates = [];
        
        inputs.forEach(inp => {
            const val = parseInt(inp.value);
            if(val > 0) {
                const id = inp.dataset.id;
                const current = parseInt(inp.dataset.current);
                updates.push(_sb.from('oggetti').update({ quantita_disponibile: current + val }).eq('id', id));
            }
        });

        if(updates.length === 0) return ui.toast("Nessuna quantità inserita", "error");

        loader.show();
        await Promise.all(updates);
        
        // Reset inputs
        inputs.forEach(i => i.value = '');
        ui.toast("Magazzino Rifornito!", "success");
        await app.loadData(); // Ricarica dati
        loader.hide();
    },
    
    // Edit standard
    openEdit(id) {
        const p = state.products.find(x => x.id === id);
        document.getElementById('modal-prod-title').innerText = "Modifica Prodotto";
        document.getElementById('prod-id').value = id;
        document.getElementById('prod-name').value = p.nome;
        document.getElementById('prod-qty').value = p.quantita_disponibile;
        document.getElementById('prod-min').value = p.soglia_minima;
        document.getElementById('prod-img').value = p.foto_url || '';
        document.getElementById('btn-del').classList.remove('hidden');
        ui.modal('modal-prod');
    },
    openNewProd() {
        document.getElementById('modal-prod-title').innerText = "Nuovo Prodotto";
        document.getElementById('prod-id').value = "";
        document.querySelectorAll('#modal-prod input').forEach(i => i.value = "");
        document.getElementById('btn-del').classList.add('hidden');
        ui.modal('modal-prod');
    },
    async saveProd() {
        const id = document.getElementById('prod-id').value;
        const file = document.getElementById('prod-file').files[0];
        let imgUrl = document.getElementById('prod-img').value;

        if (file) {
            document.getElementById('upload-loader').classList.remove('hidden');
            const fileName = `${Date.now()}_${file.name.replace(/\s/g, '')}`;
            const { error } = await _sb.storage.from(CONFIG.bucket).upload(fileName, file);
            if (!error) {
                const { data } = _sb.storage.from(CONFIG.bucket).getPublicUrl(fileName);
                imgUrl = data.publicUrl;
            } else {
                alert("Errore Upload: " + error.message);
            }
            document.getElementById('upload-loader').classList.add('hidden');
        }

        const data = {
            nome: document.getElementById('prod-name').value,
            quantita_disponibile: document.getElementById('prod-qty').value,
            soglia_minima: document.getElementById('prod-min').value,
            foto_url: imgUrl
        };

        if (id) await _sb.from('oggetti').update(data).eq('id', id);
        else await _sb.from('oggetti').insert([data]);

        ui.toast("Salvato!", "success"); ui.closeModals(); app.loadData();
    },
    async deleteProd() {
        if (!confirm("Eliminare definitivamente?")) return;
        await _sb.from('oggetti').delete().eq('id', document.getElementById('prod-id').value);
        ui.closeModals(); app.loadData();
    },
    
    // Packs
    renderPackBuilder() {
        document.getElementById('pack-items').innerHTML = state.products.map(p => `
            <label class="flex items-center gap-2 text-xs p-2 border rounded hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" value="${p.id}" class="pack-chk accent-yellow-500"> ${p.nome}
            </label>
        `).join('');
    },
    async createPack() {
        const name = document.getElementById('pack-name').value;
        const chks = document.querySelectorAll('.pack-chk:checked');
        if (!name || !chks.length) return ui.toast("Nome o oggetti mancanti", "error");
        const { data } = await _sb.from('pacchetti').insert([{ nome: name }]).select();
        const items = Array.from(chks).map(c => ({ pacchetto_id: data[0].id, oggetto_id: c.value, quantita_necessaria: 1 }));
        await _sb.from('componenti_pacchetto').insert(items);
        ui.toast("Kit Creato", "success"); app.loadData();
    },
    
    // Moderazione Ricordi
    async checkMod() {
        const { data } = await _sb.from('archivio').select('*').eq('status', 'pending');
        if (data && data.length) {
            document.getElementById('mod-badge').innerText = data.length;
            document.getElementById('mod-badge').classList.remove('hidden');
            archive.render(data, 'mod-list', true);
        } else {
            document.getElementById('mod-badge').classList.add('hidden');
            document.getElementById('mod-list').innerHTML = "<p class='text-gray-400 italic text-center py-4'>Tutto tranquillo, nessun ricordo da approvare.</p>";
        }
    },
    async memAction(id, action) {
        if (action === 'del') await _sb.from('archivio').delete().eq('id', id);
        else await _sb.from('archivio').update({ status: 'approved' }).eq('id', id);
        this.checkMod();
        ui.toast("Azione effettuata", "success");
    }
};

// --- AUTH & UI ---
const auth = {
    async check() {
        const { data: { user } } = await _sb.auth.getUser();
        if (user) {
            state.user = user;
            document.getElementById('nav-public').classList.add('hidden');
            document.getElementById('nav-admin').classList.remove('hidden');
            app.nav('admin');
        }
    },
    async login() {
        const { error } = await _sb.auth.signInWithPassword({
            email: document.getElementById('log-mail').value,
            password: document.getElementById('log-pass').value
        });
        if (!error) location.reload(); else ui.toast("Email o password errati", "error");
    },
    logout() { _sb.auth.signOut().then(() => location.reload()); }
};

const ui = {
    modal(id) { document.getElementById(id).classList.remove('hidden'); },
    closeModals() { document.querySelectorAll('[id^="modal"], #login-modal').forEach(m => m.classList.add('hidden')); },
    toggleCart() { document.getElementById('cart-sidebar').classList.toggle('translate-x-full'); },
    toast(msg, type) {
        const t = document.createElement('div');
        t.className = `px-6 py-3 rounded-full shadow-2xl text-white text-sm font-bold animate-bounce ${type === 'error' ? 'bg-red-500' : 'bg-green-800'}`;
        t.innerText = msg;
        document.getElementById('toast-container').appendChild(t);
        setTimeout(() => t.remove(), 3000);
    }
};

app.init();
