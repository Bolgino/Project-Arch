// --- CONFIGURAZIONE ---
const MAINTENANCE_MODE = true; // Metti TRUE per manutenzione
const CONFIG = {
    url: "https://jmildwxjaviqkrkhjzhl.supabase.co", 
    key: "sb_publishable_PwYQxh8l7HLR49EC_wHa7A_gppKi_FS", 
    adminEmail: "marcobolge@gmail.com"
};

const _sb = supabase.createClient(CONFIG.url, CONFIG.key);

// --- STATO ---
const state = { inventory: [], cart: [], user: null, currentCategory: 'all' };

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

        if (MAINTENANCE_MODE && !state.user) {
            document.querySelectorAll('section').forEach(el => el.classList.add('hidden'));
            document.getElementById('view-maintenance').classList.remove('hidden');
            loader.hide();
            return;
        }

        await this.loadData();
        loader.hide();
    },

    async loadData() {
        // Usa la tabella 'magazzino' (creala su Supabase se non esiste: id, nome, categoria, quantita, note)
        const { data } = await _sb.from('magazzino').select('*').order('nome');
        state.inventory = data || [];
        
        this.renderInventory();

        if (state.user) {
            admin.renderStock();
            admin.renderMovements();
        } else {
            this.nav('inventory');
        }
    },

    nav(view) {
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
                        <span class="text-[10px] font-bold uppercase text-blue-500 bg-blue-50 px-2 py-1 rounded">${p.categoria || 'Altro'}</span>
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
        // Filtra i movimenti che contengono "MAGAZZINO" nel nome utente (trucco per distinguere se usi stessa tabella)
        // Oppure se usi tabella dedicata: await _sb.from('movimenti_magazzino')...
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
