// --- CONFIGURAZIONE ---
const MAINTENANCE_MODE = true;
const CONFIG = {
    url: "https://jmildwxjaviqkrkhjzhl.supabase.co", 
    key: "sb_publishable_PwYQxh8l7HLR49EC_wHa7A_gppKi_FS", 
    adminEmail: "marcobolge@gmail.com"
};

const _sb = supabase.createClient(CONFIG.url, CONFIG.key);

// --- STATO ---
const state = { 
    inventory: [], 
    cart: [], 
    user: null, 
    currentCategory: 'all',
    viewMode: 'items', // 'items' o 'cassoni'
    activeCassone: null // Se sto guardando dentro un cassone
};

// --- APP CONTROLLER ---
const app = {
    async init() {
        ui.loader(true);
        await auth.check();

        if (MAINTENANCE_MODE && !state.user) {
            document.querySelectorAll('section').forEach(el => el.classList.add('hidden'));
            document.getElementById('view-maintenance').classList.remove('hidden');
            ui.loader(false);
            return;
        }

        await this.loadData();
        ui.loader(false);
    },

    async loadData() {
        // Tabella magazzino: id, nome, categoria, quantita, cassone, note
        const { data } = await _sb.from('magazzino').select('*').order('nome');
        state.inventory = data || [];
        
        this.renderInventory();

        if (state.user) {
            admin.renderStock();
            admin.renderLoans(); // Carica i prestiti attivi
        } else {
            this.nav('inventory');
        }
    },

    nav(view) {
        document.querySelectorAll('section').forEach(el => el.classList.add('hidden'));
        const el = document.getElementById(`view-${view}`);
        if(el) el.classList.remove('hidden');
    },

    // --- FILTRI & CASSONI ---
    setCategory(cat) {
        state.currentCategory = cat;
        state.viewMode = 'items';
        state.activeCassone = null;
        
        document.getElementById('btn-mode-cassoni').classList.replace('bg-blue-600', 'bg-gray-800');
        document.querySelectorAll('.filter-btn:not(#btn-mode-cassoni)').forEach(b => b.classList.remove('active', 'bg-opacity-100', 'ring-2'));
        
        const btn = document.getElementById(`btn-cat-${cat}`);
        if(btn) btn.classList.add('active', 'ring-2', 'ring-offset-1');
        
        this.filterProducts();
    },

    toggleCassoniView() {
        state.viewMode = 'cassoni';
        state.currentCategory = 'all';
        state.activeCassone = null;
        
        // Reset stile bottoni categorie
        document.querySelectorAll('.filter-btn:not(#btn-mode-cassoni)').forEach(b => b.classList.remove('active', 'ring-2'));
        
        // Evidenzia bottone Cassoni
        const btn = document.getElementById('btn-mode-cassoni');
        btn.classList.remove('bg-gray-800');
        btn.classList.add('bg-blue-600', 'ring-2', 'ring-white');
        
        this.renderCassoni();
    },

    openCassone(cassoneName) {
        state.activeCassone = cassoneName;
        state.viewMode = 'items'; // Torniamo a vista item ma filtrata
        this.filterProducts();
    },

    filterProducts() {
        const term = document.getElementById('search-bar').value.toLowerCase().trim();
        const listEl = document.getElementById('inventory-list');
        listEl.innerHTML = ''; // Reset

        // Se siamo in modalità visualizzazione items (normale o dentro un cassone)
        let filtered = state.inventory.filter(p => {
            const matchesText = p.nome.toLowerCase().includes(term) || (p.cassone && p.cassone.toLowerCase().includes(term));
            const matchesCat = state.currentCategory === 'all' || p.categoria === state.currentCategory;
            const matchesCassone = state.activeCassone ? p.cassone === state.activeCassone : true;

            return matchesText && matchesCat && matchesCassone;
        });

        // Se c'è un cassone attivo, mostriamo header speciale
        if (state.activeCassone) {
            listEl.innerHTML = `
                <div class="col-span-full bg-gray-800 text-white p-4 rounded-xl flex justify-between items-center mb-4 shadow-lg">
                    <div>
                        <div class="text-xs text-gray-400 uppercase tracking-widest">Contenuto Cassone</div>
                        <h2 class="text-2xl font-bold">📦 ${state.activeCassone}</h2>
                    </div>
                    <button onclick="app.toggleCassoniView()" class="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded text-sm font-bold">⬅ Torna ai Cassoni</button>
                </div>
            `;
        }

        if (filtered.length === 0) {
            listEl.innerHTML += `<div class="col-span-full text-center py-10 text-gray-400 font-bold">Nessun oggetto trovato.</div>`;
            return;
        }

        filtered.forEach(p => {
            const isOut = p.quantita <= 0;
            const btnClass = isOut ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 shadow-sm active:transform active:scale-95';
            
            const card = `
            <div class="bg-white rounded-xl shadow-sm border border-blue-100 p-4 hover:shadow-md transition relative overflow-hidden">
                ${p.cassone ? `<div class="absolute top-0 right-0 bg-gray-100 text-[9px] text-gray-500 font-bold px-2 py-1 rounded-bl-lg border-l border-b border-gray-200">📦 ${p.cassone}</div>` : ''}
                
                <div class="flex justify-between items-start mb-2 mt-2">
                    <div>
                        <span class="text-[10px] font-bold uppercase text-blue-500 bg-blue-50 px-2 py-1 rounded">${p.categoria || 'Generico'}</span>
                        <h4 class="font-bold text-lg text-gray-800 leading-tight mt-1">${p.nome}</h4>
                    </div>
                    <div class="text-right pt-4">
                        <span class="block font-mono font-bold text-xl ${isOut ? 'text-red-500' : 'text-blue-900'}">${p.quantita}</span>
                    </div>
                </div>
                
                ${p.note ? `<p class="text-xs text-gray-500 italic mb-3 bg-gray-50 p-2 rounded border border-gray-100">ℹ️ ${p.note}</p>` : ''}

                <div class="flex items-center gap-2 mt-auto">
                    <input type="number" id="qty-${p.id}" value="1" min="1" max="${p.quantita}" ${isOut ? 'disabled' : ''} class="w-14 p-2 text-center border rounded font-bold outline-none focus:border-blue-500">
                    <button ${isOut ? 'disabled' : ''} onclick="cart.add('${p.id}')" class="flex-1 text-white text-xs font-bold py-2.5 rounded transition ${btnClass}">
                        ${isOut ? 'NON DISPONIBILE' : 'PRENDI'}
                    </button>
                </div>
            </div>`;
            listEl.innerHTML += card;
        });
    },

    renderCassoni() {
        const listEl = document.getElementById('inventory-list');
        listEl.innerHTML = '';

        // Estrai cassoni unici (ignora null o vuoti)
        const cassoni = [...new Set(state.inventory.map(i => i.cassone).filter(c => c))]; 
        
        if (cassoni.length === 0) {
            listEl.innerHTML = `<div class="col-span-full text-center text-gray-400">Nessun cassone configurato.</div>`;
            return;
        }

        cassoni.forEach(c => {
            const count = state.inventory.filter(i => i.cassone === c).length;
            
            const card = `
            <div onclick="app.openCassone('${c}')" class="bg-gradient-to-br from-gray-800 to-gray-700 text-white rounded-xl shadow-lg p-6 cursor-pointer hover:scale-[1.02] transition border-b-8 border-gray-900 relative">
                <div class="text-4xl mb-2">📦</div>
                <h3 class="text-xl font-bold uppercase tracking-wider">${c}</h3>
                <p class="text-gray-300 text-xs mt-1">${count} oggetti all'interno</p>
                <div class="absolute bottom-4 right-4 text-gray-400 text-2xl">➔</div>
            </div>`;
            listEl.innerHTML += card;
        });
    },

    renderInventory() {
        if(state.viewMode === 'items') this.filterProducts();
        else this.renderCassoni();
    }
};

// --- GESTIONE PRESTITI (ZAINO) ---
const cart = {
    add(id) {
        const item = state.inventory.find(x => x.id == id);
        const qtyInput = document.getElementById(`qty-${id}`);
        const qty = parseInt(qtyInput.value);
        
        if(isNaN(qty) || qty < 1) return ui.toast("Quantità non valida", "error");
        if(qty > item.quantita) return ui.toast("Non disponibile abbastanza materiale", "error");

        const exists = state.cart.find(x => x.id == id);
        if (exists) {
            if (exists.qty + qty > item.quantita) return ui.toast("Limite superato!", "error");
            exists.qty += qty;
        } else {
            state.cart.push({ id, name: item.nome, qty, max: item.quantita, cassone: item.cassone });
        }
        this.render();
        ui.toast("Aggiunto allo zaino", "success");
        qtyInput.value = 1;
    },
    remove(idx) { state.cart.splice(idx, 1); this.render(); },
    empty() { state.cart = []; this.render(); },
    render() {
        document.getElementById('cart-count-mobile').innerText = state.cart.length;
        document.getElementById('cart-items').innerHTML = state.cart.length ? state.cart.map((i, idx) => `
            <div class="bg-white p-3 rounded shadow-sm border-l-4 border-blue-600 flex justify-between items-center">
                <div>
                    <div class="font-bold text-gray-800 leading-tight">${i.name}</div>
                    <div class="text-[10px] text-gray-500">${i.cassone || 'Sfuso'}</div>
                </div>
                <div class="flex items-center gap-3">
                    <span class="text-blue-900 font-bold text-lg">x${i.qty}</span>
                    <button onclick="cart.remove(${idx})" class="text-red-400 font-bold px-2 hover:text-red-600">✕</button>
                </div>
            </div>
        `).join('') : '<p class="text-center text-gray-400 italic text-sm">Zaino vuoto</p>';
    },
    
    async checkout() {
        const name = document.getElementById('checkout-name').value;
        if (!name || state.cart.length === 0) return ui.toast("Chi sta prendendo il materiale?", "error");
    
        ui.loader(true); 
        
        // 1. Aggiorna quantità Magazzino
        for (let i of state.cart) {
            const nQ = i.max - i.qty;
            await _sb.from('magazzino').update({ quantita: nQ }).eq('id', i.id);
        }

        // 2. Crea record Prestito in tabella 'prestiti'
        const loanItems = state.cart.map(i => ({ id: i.id, name: i.name, qty: i.qty }));
        
        // Salva array JSON degli oggetti prestati per poterli restituire dopo
        const { error } = await _sb.from('prestiti').insert([{
            utente: name,
            oggetti: loanItems, 
            attivo: true
        }]);

        if(error) {
            console.error(error);
            ui.toast("Errore nel salvataggio prestito (Tabella 'prestiti' mancante?)", "error");
            ui.loader(false);
            return;
        }
    
        cart.empty();
        ui.toggleCart();
        ui.toast("Prestito registrato. Buon campo!", "success");
        setTimeout(() => location.reload(), 1500);
    }
};

// --- ADMIN ---
const admin = {
    tab(t) {
        document.querySelectorAll('.admin-tab').forEach(e => e.classList.add('hidden'));
        document.getElementById(`admin-tab-${t}`).classList.remove('hidden');
    },
    
    renderStock() {
        document.getElementById('admin-stock-list').innerHTML = state.inventory.map(p => `
            <div class="flex justify-between items-center py-3 px-2 hover:bg-gray-50 border-b border-gray-100">
                <div>
                    <div class="font-bold text-gray-800">${p.nome}</div>
                    <div class="text-xs text-gray-500">${p.categoria} | ${p.cassone ? '📦 ' + p.cassone : 'Sfuso'}</div>
                </div>
                <div class="flex items-center gap-2">
                     <span class="font-mono font-bold ${p.quantita < 3 ? 'text-red-500':'text-blue-900'}">${p.quantita}</span>
                    <button onclick="admin.openEdit('${p.id}')" class="text-blue-600 text-xs font-bold bg-blue-50 px-3 py-1.5 rounded hover:bg-blue-100">EDIT</button>
                </div>
            </div>
        `).join('');
    },

    filterStock() {
        const term = document.getElementById('admin-search-bar').value.toLowerCase();
        document.querySelectorAll('#admin-stock-list > div').forEach(row => {
            row.classList.toggle('hidden', !row.innerText.toLowerCase().includes(term));
        });
    },

    // --- NUOVA LOGICA PRESTITI ---
    async renderLoans() {
        const { data } = await _sb.from('prestiti').select('*').eq('attivo', true).order('created_at', {ascending: false});
        const el = document.getElementById('loans-list');
        
        if(!data || data.length === 0) {
            el.innerHTML = '<p class="text-gray-400 italic text-center">Nessun prestito attivo.</p>';
            return;
        }

        el.innerHTML = data.map(loan => {
            // Parsa oggetti se necessario (Supabase li da già come array se colonna è jsonb)
            const items = (typeof loan.oggetti === 'string') ? JSON.parse(loan.oggetti) : loan.oggetti;
            const itemsHtml = items.map(i => `<li>${i.name} <b class="text-red-600">x${i.qty}</b></li>`).join('');
            
            return `
            <div class="bg-red-50 p-4 rounded-xl border border-red-100 shadow-sm relative">
                <div class="flex justify-between items-start mb-2">
                    <h4 class="font-bold text-red-900 text-lg">${loan.utente}</h4>
                    <span class="text-[10px] text-red-400">${new Date(loan.created_at).toLocaleDateString()}</span>
                </div>
                <ul class="text-sm text-gray-700 list-disc list-inside mb-4 bg-white p-3 rounded-lg border border-red-100">
                    ${itemsHtml}
                </ul>
                <button onclick="admin.returnLoan('${loan.id}')" class="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 rounded shadow transition">
                    🔄 RESTITUISCI TUTTO
                </button>
            </div>
            `;
        }).join('');
    },

    async returnLoan(loanId) {
        if(!confirm("Confermi che TUTTO il materiale è stato restituito?")) return;
        ui.loader(true);

        // 1. Recupera il prestito
        const { data: loan } = await _sb.from('prestiti').select('*').eq('id', loanId).single();
        const items = (typeof loan.oggetti === 'string') ? JSON.parse(loan.oggetti) : loan.oggetti;

        // 2. Cicla e incrementa magazzino
        for (let item of items) {
            const { data: currentProd } = await _sb.from('magazzino').select('quantita').eq('id', item.id).single();
            if(currentProd) {
                const newQty = currentProd.quantita + item.qty;
                await _sb.from('magazzino').update({ quantita: newQty }).eq('id', item.id);
            }
        }

        // 3. Chiudi prestito
        await _sb.from('prestiti').update({ attivo: false }).eq('id', loanId);
        
        // 4. Logga movimento di chiusura
        await _sb.from('movimenti').insert([{
            utente: `ADMIN (Reso da ${loan.utente})`,
            dettagli: `Restituzione completa ordine #${loanId}`,
            created_at: new Date()
        }]);

        ui.loader(false);
        ui.toast("Materiale rientrato!", "success");
        await app.loadData(); // Ricarica tutto
    },

    openEdit(id) {
        const p = state.inventory.find(x => x.id === id);
        document.getElementById('modal-prod-title').innerText = "Modifica Attrezzo";
        document.getElementById('prod-id').value = id;
        document.getElementById('prod-name').value = p.nome;
        document.getElementById('prod-cat').value = p.categoria || 'pioneristica';
        document.getElementById('prod-cassone').value = p.cassone || '';
        document.getElementById('prod-qty').value = p.quantita;
        document.getElementById('prod-notes').value = p.note || '';
        document.getElementById('btn-del').classList.remove('hidden');
        ui.modal('modal-prod');
    },

    openNewProd() {
        document.getElementById('modal-prod-title').innerText = "Nuovo Attrezzo";
        document.getElementById('prod-id').value = "";
        document.querySelectorAll('#modal-prod input, #modal-prod textarea').forEach(i => i.value = "");
        document.getElementById('prod-cat').value = 'pioneristica';
        document.getElementById('btn-del').classList.add('hidden');
        ui.modal('modal-prod');
    },

    async saveProd() {
        const id = document.getElementById('prod-id').value;
        const data = {
            nome: document.getElementById('prod-name').value,
            categoria: document.getElementById('prod-cat').value,
            cassone: document.getElementById('prod-cassone').value, // Nuovo campo
            quantita: parseInt(document.getElementById('prod-qty').value),
            note: document.getElementById('prod-notes').value
        };

        if (id) await _sb.from('magazzino').update(data).eq('id', id);
        else await _sb.from('magazzino').insert([data]);

        ui.toast("Salvato!", "success"); ui.closeModals(); app.loadData();
    },

    async deleteProd() {
        if (!confirm("Eliminare definitivamente?")) return;
        await _sb.from('magazzino').delete().eq('id', document.getElementById('prod-id').value);
        ui.closeModals(); app.loadData();
    },

    async renderMovements() {
        const { data } = await _sb.from('movimenti').select('*').order('created_at', { ascending: false }).limit(20);
        const el = document.getElementById('movements-list');
        if(!el) return;
        
        el.innerHTML = (data || []).map(m => `
            <div class="bg-gray-50 p-3 rounded border border-gray-200 text-xs mb-2">
                <span class="font-bold block text-gray-900">${m.utente}</span>
                <span class="text-gray-500">${new Date(m.created_at).toLocaleDateString()}</span>
                <p class="mt-1">${m.dettagli}</p>
            </div>
        `).join('');
    }
};

// --- AUTH & UI ---
const auth = {
    async check() {
        const { data: { user } } = await _sb.auth.getUser();
        if (user) {
            state.user = user;
            document.getElementById('nav-admin-mobile').classList.remove('hidden');
            document.getElementById('nav-admin-mobile').classList.add('flex');
            document.getElementById('btn-login-mobile').classList.add('hidden');
            
            if (MAINTENANCE_MODE) document.getElementById('nav-public-links').classList.remove('hidden');
            else document.getElementById('nav-public-links').classList.add('hidden');
            
            app.nav('admin');
        }
    },
    async login() {
        const { error } = await _sb.auth.signInWithPassword({
            email: document.getElementById('log-mail').value,
            password: document.getElementById('log-pass').value
        });
        if (!error) location.reload(); else ui.toast("Login errato", "error");
    },
    logout() { _sb.auth.signOut().then(() => location.reload()); }
};

const ui = {
    loader(show) {
        const el = document.getElementById('mag-loader');
        if(show) { el.classList.remove('hidden'); setTimeout(() => el.classList.remove('opacity-0'), 10); }
        else { el.classList.add('opacity-0'); setTimeout(() => el.classList.add('hidden'), 500); }
    },
    modal(id) { document.getElementById(id).classList.remove('hidden'); },
    closeModals() { document.querySelectorAll('[id^="modal"], #login-modal').forEach(m => m.classList.add('hidden')); },
    toggleCart() { document.getElementById('cart-sidebar').classList.toggle('translate-x-full'); },
    toggleMenu() {
        const menu = document.getElementById('mobile-menu');
        const panel = document.getElementById('mobile-menu-panel');
        if (menu.classList.contains('hidden')) {
            menu.classList.remove('hidden');
            setTimeout(() => panel.classList.remove('translate-x-full'), 10);
        } else {
            panel.classList.add('translate-x-full');
            setTimeout(() => menu.classList.add('hidden'), 300);
        }
    },
    toast(msg, type) {
        const t = document.createElement('div');
        t.className = `px-6 py-3 rounded-full shadow-2xl text-white text-sm font-bold animate-bounce fixed bottom-5 left-1/2 -translate-x-1/2 z-[200] ${type === 'error' ? 'bg-red-500' : 'bg-blue-800'}`;
        t.innerText = msg;
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 3000);
    }
};

app.init();
