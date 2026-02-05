// --- CONFIGURAZIONE ---
const MAINTENANCE_MODE = true; // Metti TRUE per manutenzione
const CONFIG = {
    url: "https://jmildwxjaviqkrkhjzhl.supabase.co", 
    key: "sb_publishable_PwYQxh8l7HLR49EC_wHa7A_gppKi_FS", 
    adminEmail: "marcobolge@gmail.com"
};

const _sb = supabase.createClient(CONFIG.url, CONFIG.key);

// --- STATO ---
const state = { inventory: [], cart: [], cassoni: [], user: null, currentCategory: 'all' };


// --- LOADER ---
const loader = {
    show() { 
        const el = document.getElementById('mag-loader');
        if(el) { el.classList.remove('hidden'); setTimeout(() => el.classList.remove('opacity-0'), 10); }
    },
    hide() { 
        const el = document.getElementById('mag-loader');
        if(el) { el.classList.add('opacity-0'); setTimeout(() => el.classList.add('hidden'), 500); }
    }
};

// --- APP CONTROLLER ---
const app = {
    async init() {
        loader.show();
        await auth.check();

        // MODIFICA: Rimosso il blocco che nascondeva tutto e il menu nav-public-links.
        // Lasciamo che i menu siano visibili, l'intercettazione avviene in nav().

        await this.loadData();
        loader.hide();
    },

    async loadData() {
        const { data: invData } = await _sb.from('magazzino').select('*').order('nome');
        state.inventory = invData || [];
        
        const { data: casData } = await _sb.from('magazzino_cassoni').select('*').order('created_at', { ascending: false });
        state.cassoni = casData || [];
        
        this.renderInventory();
        cassoni.renderList(); 

        if (state.user) {
            admin.renderStock();
            admin.renderMovements();
        } else {
            // Se eravamo in una vista specifica rimaniamo lì, altrimenti inventory
            // Ma se c'è manutenzione attiva, app.nav intercetterà tutto.
            if(!document.getElementById('view-cassoni').classList.contains('hidden')) return; 
            this.nav('inventory');
        }
    },

    nav(view) {
        // NUOVA LOGICA MANUTENZIONE (stile Cambusa)
        // Se c'è manutenzione, non sei admin e cerchi di aprire viste pubbliche (inventory o cassoni)
        if (MAINTENANCE_MODE && !state.user && ['inventory', 'cassoni'].includes(view)) {
            document.querySelectorAll('section').forEach(el => el.classList.add('hidden'));
            document.getElementById('view-maintenance').classList.remove('hidden');
            return;
        }

        // Navigazione standard
        document.querySelectorAll('section').forEach(el => el.classList.add('hidden'));
        const el = document.getElementById(`view-${view}`);
        if(el) el.classList.remove('hidden');
    },
    
    setCategory(cat) {
        state.currentCategory = cat;
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active', 'bg-opacity-100', 'text-white'));
        const btn = document.getElementById(`btn-cat-${cat}`);
        if(btn) btn.classList.add('active');
        this.filterProducts();
    },

    filterProducts() {
        const term = document.getElementById('search-bar').value.toLowerCase().trim();
        const cards = document.querySelectorAll('#inventory-list > div');
        let visibleCount = 0;

        cards.forEach(card => {
            const title = card.querySelector('h4').innerText.toLowerCase();
            const cat = card.dataset.category || 'altro';
            const matchesText = title.includes(term);
            const matchesCat = state.currentCategory === 'all' || cat === state.currentCategory;

            if (matchesText && matchesCat) {
                card.classList.remove('hidden');
                visibleCount++;
            } else {
                card.classList.add('hidden');
            }
        });

        const noRes = document.getElementById('no-results');
        if(noRes) (visibleCount === 0 && term !== '') ? noRes.classList.remove('hidden') : noRes.classList.add('hidden');
    },

    renderInventory() {
        document.getElementById('inventory-list').innerHTML = state.inventory.map(p => {
            const isOut = p.quantita <= 0;
            const btnClass = isOut ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 shadow-sm active:transform active:scale-95';

            return `
            <div class="bg-white rounded-xl shadow-sm border border-blue-100 p-4 hover:shadow-md transition group" data-category="${p.categoria || 'altro'}">
                <div class="flex justify-between items-start mb-2">
                    <div>
                        <span class="text-[10px] font-bold uppercase text-blue-500 bg-blue-50 px-2 py-1 rounded">${p.categoria || 'Extra'}</span>
                        <h4 class="font-bold text-lg text-gray-800 leading-tight mt-1">${p.nome}</h4>
                    </div>
                    <div class="text-right">
                        <span class="block font-mono font-bold text-xl ${isOut ? 'text-red-500' : 'text-blue-900'}">${p.quantita}</span>
                        <span class="text-[9px] text-gray-400 uppercase">Disp.</span>
                    </div>
                </div>
                
                ${p.note ? `<p class="text-xs text-gray-500 italic mb-3 bg-gray-50 p-2 rounded border border-gray-100">ℹ️ ${p.note}</p>` : ''}

                <div class="flex items-center gap-2 mt-auto">
                    <input type="number" id="qty-${p.id}" value="1" min="1" max="${p.quantita}" ${isOut ? 'disabled' : ''} class="w-14 p-2 text-center border rounded font-bold outline-none focus:border-blue-500">
                    <button ${isOut ? 'disabled' : ''} onclick="cart.add('${p.id}')" class="flex-1 text-white text-xs font-bold py-2.5 rounded transition ${btnClass}">
                        ${isOut ? 'NON DISPONIBILE' : 'AGGIUNGI A LISTA'}
                    </button>
                </div>
            </div>
            `;
        }).join('');
    },

    async checkout() {
        const name = document.getElementById('checkout-name').value;
        if (!name || state.cart.length === 0) return ui.toast("Inserisci nome e materiale!", "error");
    
        loader.show(); 
        let details = `<h3>Prelievo Magazzino: ${name}</h3><ul>`;
        let logDetails = [];
    
        for (let i of state.cart) {
            const nQ = i.max - i.qty;
            await _sb.from('magazzino').update({ quantita: nQ }).eq('id', i.id);
            details += `<li>${i.name} <b>x${i.qty}</b> (Rimasti: ${nQ})</li>`;
            logDetails.push(`${i.name} x${i.qty}`);
        }
        details += `</ul>`;
        
        // Log Movimenti (Usiamo tabella 'movimenti_magazzino' se esiste, o generica 'movimenti' con tipo)
        // Per semplicità usiamo 'movimenti' come armadio, specificando nel dettaglio
        await _sb.from('movimenti').insert([{
            utente: `MAGAZZINO: ${name}`,
            dettagli: logDetails.join(', ') 
        }]);
    
        try {
            await fetch(`${CONFIG.url}/functions/v1/notify-admin`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${CONFIG.key}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ details, admin_email: CONFIG.adminEmail })
            });
        } catch(e) {}
    
        cart.empty();
        ui.toggleCart();
        loader.hide();
        ui.toast("Uscita registrata correttamente.", "success");
        setTimeout(() => location.reload(), 1500);
    }
};

// --- CART ---
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
            state.cart.push({ id, name: item.nome, qty, max: item.quantita });
        }
        this.render();
        ui.toast("Aggiunto alla lista", "success");
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
                    <span class="text-blue-700 text-xs font-bold">Quantità: ${i.qty}</span>
                </div>
                <button onclick="cart.remove(${idx})" class="text-red-400 font-bold px-2 hover:text-red-600">✕</button>
            </div>
        `).join('') : '<p class="text-center text-gray-400 italic text-sm">Lista vuota</p>';
    }
};

// --- CASSONI LOGIC ---
const cassoni = {
    tempItems: [], // Oggetti nel cassone in fase di modifica

    renderList() {
        const list = document.getElementById('cassoni-list');
        if(!list) return;
        
        if(state.cassoni.length === 0) {
            list.innerHTML = '<div class="text-center py-10 text-gray-400">Nessun cassone creato.</div>';
            return;
        }

        list.innerHTML = state.cassoni.map(c => {
            const statusBadge = c.approvato 
                ? '<span class="bg-green-100 text-green-700 px-2 py-1 rounded text-[10px] font-bold border border-green-200">APPROVATO</span>' 
                : '<span class="bg-yellow-100 text-yellow-700 px-2 py-1 rounded text-[10px] font-bold border border-yellow-200">IN REVISIONE</span>';

            // Conta oggetti
            const count = Array.isArray(c.contenuto) ? c.contenuto.reduce((a,b) => a + (parseInt(b.qty)||0), 0) : 0;

            return `
            <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4 hover:shadow-md transition cursor-pointer relative overflow-hidden" onclick="cassoni.openModal(${c.id})">
                <div class="absolute top-0 right-0 p-2">${statusBadge}</div>
                <div class="pr-20">
                    <h3 class="font-bold text-lg text-blue-900 leading-tight">${c.nome}</h3>
                    <p class="text-xs text-gray-500 font-bold uppercase mb-2">Resp: ${c.responsabile}</p>
                </div>
                <div class="bg-gray-50 p-2 rounded border border-gray-100 text-xs text-gray-600 truncate">
                    📦 Contiene ${count} oggetti...
                </div>
                ${state.user ? `<div class="mt-2 text-[10px] text-red-400 text-right font-mono">ID: ${c.id}</div>` : ''}
            </div>`;
        }).join('');
    },

    openModal(id = null) {
        const select = document.getElementById('cas-item-select');
        select.innerHTML = '<option value="">-- Seleziona Materiale --</option>' + 
            state.inventory.map(i => `<option value="${i.id}" data-name="${i.nome}">${i.nome} (Disp: ${i.quantita})</option>`).join('');
        
        document.getElementById('cas-item-qty').value = 1;
        document.getElementById('cas-add-panel').classList.add('hidden');
        document.getElementById('btn-cas-del').classList.add('hidden');
        document.getElementById('cas-status-msg').innerText = "";
        
        const oldBtn = document.getElementById('btn-approve-toggle');
        if(oldBtn) oldBtn.remove();

        if (id) {
            // EDIT MODE
            const c = state.cassoni.find(x => x.id === id);
            if(!c) return;

            document.getElementById('cas-id').value = c.id;
            document.getElementById('cas-name').value = c.nome;
            document.getElementById('cas-resp').value = c.responsabile;
            document.getElementById('cas-notes').value = c.note || '';
            document.getElementById('cassone-modal-title').innerText = c.approvato ? "Dettagli Cassone (Approvato)" : "Modifica Cassone";
            
            const isApprovedAndPublic = c.approvato && !state.user;
            document.getElementById('cas-name').disabled = isApprovedAndPublic; 
            document.getElementById('cas-resp').disabled = isApprovedAndPublic;
            
            if (state.user || !c.approvato) {
                document.getElementById('btn-cas-del').classList.remove('hidden');
            }

            this.tempItems = Array.isArray(c.contenuto) ? [...c.contenuto] : [];
            
            if (c.approvato && !state.user) {
                document.getElementById('cas-status-msg').innerText = "Cassone approvato: puoi modificare solo il contenuto.";
            }

            // Tasto Admin Toggle Approvazione
            if (state.user) {
                const btnApprove = document.createElement('button');
                btnApprove.id = "btn-approve-toggle";
                btnApprove.className = "w-full mt-2 mb-2 p-2 rounded text-xs font-bold border transition " + (c.approvato ? "border-yellow-500 text-yellow-600 bg-yellow-50 hover:bg-yellow-100" : "border-green-500 text-green-600 bg-green-50 hover:bg-green-100");
                btnApprove.innerText = c.approvato ? "REVOCA APPROVAZIONE" : "✅ APPROVA CASSONE";
                btnApprove.onclick = async () => {
                    if(!confirm("Cambiare lo stato di approvazione?")) return;
                    await _sb.from('magazzino_cassoni').update({ approvato: !c.approvato }).eq('id', id);
                    ui.closeModals();
                    app.loadData();
                };
                const noteLabel = document.querySelector('label[for="cas-notes"]') || document.getElementById('cas-notes').previousElementSibling;
                noteLabel.parentNode.insertBefore(btnApprove, noteLabel);
            }

        } else {
            // CREATE MODE
            document.getElementById('cas-id').value = "";
            document.getElementById('cas-name').value = "";
            document.getElementById('cas-name').disabled = false;
            document.getElementById('cas-resp').value = "";
            document.getElementById('cas-resp').disabled = false;
            document.getElementById('cas-notes').value = "";
            document.getElementById('cassone-modal-title').innerText = "Nuovo Cassone";
            this.tempItems = [];
        }
        
        this.renderTempItems();
        ui.modal('modal-cassone');
    },

    addItem() {
        const sel = document.getElementById('cas-item-select');
        const id = sel.value;
        const name = sel.options[sel.selectedIndex]?.dataset.name;
        const qty = parseInt(document.getElementById('cas-item-qty').value);

        if(!id || !name || qty < 1) return ui.toast("Seleziona oggetto e quantità valida", "error");

        const existing = this.tempItems.find(x => x.id == id);
        if(existing) existing.qty += qty;
        else this.tempItems.push({ id, name, qty });

        this.renderTempItems();
        ui.toast("Aggiunto al cassone", "success");
    },

    removeItem(idx) {
        this.tempItems.splice(idx, 1);
        this.renderTempItems();
    },

    renderTempItems() {
        const el = document.getElementById('cas-items-list');
        if(this.tempItems.length === 0) {
            el.innerHTML = '<p class="text-center text-gray-400 text-xs italic py-2">Cassone vuoto</p>';
            return;
        }
        el.innerHTML = this.tempItems.map((item, idx) => `
            <div class="flex justify-between items-center bg-white p-2 rounded shadow-sm border border-gray-100">
                <span class="text-sm font-bold text-gray-700">${item.name} <span class="text-blue-600">x${item.qty}</span></span>
                <button onclick="cassoni.removeItem(${idx})" class="text-red-400 hover:text-red-600 font-bold px-2">✕</button>
            </div>
        `).join('');
    },

    async save() {
        const id = document.getElementById('cas-id').value;
        const name = document.getElementById('cas-name').value;
        const resp = document.getElementById('cas-resp').value;
        
        if(!name || !resp) return ui.toast("Nome e Responsabile obbligatori!", "error");

        const payload = {
            nome: name,
            responsabile: resp,
            contenuto: this.tempItems,
            note: document.getElementById('cas-notes').value
        };

        loader.show();
        let error = null;

        if (id) {
            const { error: err } = await _sb.from('magazzino_cassoni').update(payload).eq('id', id);
            error = err;
        } else {
            const { error: err } = await _sb.from('magazzino_cassoni').insert([payload]);
            error = err;
        }

        loader.hide();
        if(error) {
            console.error(error);
            ui.toast("Errore salvataggio", "error");
        } else {
            ui.toast("Cassone salvato!", "success");
            ui.closeModals();
            app.loadData();
        }
    },

    async delete() {
        const id = document.getElementById('cas-id').value;
        if(!id) return;

        const c = state.cassoni.find(x => x.id == id);
        if(!state.user && c && c.approvato) {
            return ui.toast("Non puoi eliminare un cassone già approvato!", "error");
        }

        if(!confirm("Eliminare questo cassone?")) return;

        loader.show();
        await _sb.from('magazzino_cassoni').delete().eq('id', id);
        loader.hide();
        ui.toast("Cassone eliminato", "success");
        ui.closeModals();
        app.loadData();
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
                    <div class="text-xs text-gray-500">${p.categoria} | Qt: <b>${p.quantita}</b></div>
                </div>
                <button onclick="admin.openEdit('${p.id}')" class="text-blue-600 text-xs font-bold bg-blue-50 px-3 py-1.5 rounded hover:bg-blue-100">MODIFICA</button>
            </div>
        `).join('');
    },

    filterStock() {
        const term = document.getElementById('admin-search-bar').value.toLowerCase();
        document.querySelectorAll('#admin-stock-list > div').forEach(row => {
            row.classList.toggle('hidden', !row.innerText.toLowerCase().includes(term));
        });
    },

    openEdit(id) {
        const p = state.inventory.find(x => x.id === id);
        document.getElementById('modal-prod-title').innerText = "Modifica Attrezzo";
        document.getElementById('prod-id').value = id;
        document.getElementById('prod-name').value = p.nome;
        document.getElementById('prod-cat').value = p.categoria || 'altro';
        document.getElementById('prod-qty').value = p.quantita;
        document.getElementById('prod-notes').value = p.note || '';
        document.getElementById('btn-del').classList.remove('hidden');
        ui.modal('modal-prod');
    },

    openNewProd() {
        document.getElementById('modal-prod-title').innerText = "Nuovo Attrezzo";
        document.getElementById('prod-id').value = "";
        document.querySelectorAll('#modal-prod input, #modal-prod textarea').forEach(i => i.value = "");
        document.getElementById('prod-cat').value = 'altro';
        document.getElementById('btn-del').classList.add('hidden');
        ui.modal('modal-prod');
    },

    async saveProd() {
        const id = document.getElementById('prod-id').value;
        const data = {
            nome: document.getElementById('prod-name').value,
            categoria: document.getElementById('prod-cat').value,
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
        const { data } = await _sb.from('movimenti').select('*').order('created_at', { ascending: false }).limit(50);
        
        const el = document.getElementById('movements-list');
        if(!data) { el.innerHTML = ''; return; }
        
        el.innerHTML = data.filter(m => m.utente && m.utente.includes('MAGAZZINO')).map(m => `
            <div class="bg-teal-50 p-3 rounded border border-teal-100 mb-2">
                <div class="flex justify-between items-center mb-1">
                    <span class="font-bold text-teal-900 text-sm">${m.utente}</span>
                    <span class="text-[10px] text-teal-600 font-mono">${new Date(m.created_at).toLocaleDateString()}</span>
                </div>
                <p class="text-xs text-teal-800 leading-snug">${m.dettagli}</p>
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
