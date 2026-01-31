// cambusa.js

// --- CONFIGURAZIONE ---
const CONFIG = {
    // Stesse credenziali dell'Armadio
    url: "https://jmildwxjaviqkrkhjzhl.supabase.co", 
    key: "sb_publishable_PwYQxh8l7HLR49EC_wHa7A_gppKi_FS", 
    adminEmail: "marcobolge@gmail.com"
};

const _sb = supabase.createClient(CONFIG.url, CONFIG.key);

// --- STATO ---
const state = { 
    pantry: [], // La lista cibo
    cart: [],   // Lista spesa "virtuale" da prelevare
    user: null, 
    currentCategory: 'all' 
};

// --- LOADER ---
const loader = {
    show() { document.getElementById('cambusa-loader').classList.remove('opacity-0', 'pointer-events-none'); },
    hide() { setTimeout(() => document.getElementById('cambusa-loader').classList.add('opacity-0', 'pointer-events-none'), 1000); }
};

// --- APP ---
const app = {
    async init() {
        loader.show();
        await auth.check();
        await this.loadData();
        loader.hide();
    },

    async loadData() {
        // Carica dalla tabella 'cambusa' invece che 'oggetti'
        const { data, error } = await _sb.from('cambusa').select('*').order('nome');
        if(error) console.error(error);
        state.pantry = data || [];
        
        if (state.user) {
            admin.renderList();
        } else {
            this.renderPantry();
            this.nav('pantry');
        }
    },

    nav(view) {
        document.querySelectorAll('section').forEach(el => el.classList.add('hidden'));
        document.getElementById(`view-${view}`).classList.remove('hidden');
    },

    setCategory(cat) {
        state.currentCategory = cat;
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active', 'bg-opacity-100', 'text-white'));
        const btn = document.getElementById(`btn-cat-${cat}`);
        if(btn) btn.classList.add('active');
        this.filterPantry();
    },

    filterPantry() {
        const term = document.getElementById('search-bar').value.toLowerCase().trim();
        const cards = document.querySelectorAll('#pantry-grid > div');

        cards.forEach(card => {
            const title = card.querySelector('h4').innerText.toLowerCase();
            const cat = card.dataset.category;
            const matchesText = title.includes(term);
            const matchesCat = state.currentCategory === 'all' || cat === state.currentCategory;

            if (matchesText && matchesCat) {
                card.classList.remove('hidden');
            } else {
                card.classList.add('hidden');
            }
        });
    },

    renderPantry() {
        document.getElementById('pantry-grid').innerHTML = state.pantry.map(item => {
            const isLow = item.quantita <= item.soglia;
            const isOut = item.quantita <= 0;
            
            // Gestione visuale scorta
            let badge = '';
            if(isOut) badge = '<span class="absolute top-2 right-2 bg-gray-800 text-white text-[10px] px-2 rounded">FINITO 🚫</span>';
            else if(isLow) badge = '<span class="absolute top-2 right-2 bg-red-100 text-red-600 text-[10px] px-2 rounded border border-red-200">SCORTA BASSA ⚠️</span>';

            return `
            <div class="bg-white rounded-xl shadow-sm border border-orange-100 overflow-hidden hover:shadow-md transition flex flex-col relative group" data-category="${item.categoria}">
                ${badge}
                <div class="p-4 flex flex-col flex-grow">
                    <div class="text-[9px] font-bold uppercase text-orange-400 mb-1">${item.categoria}</div>
                    <h4 class="font-bold text-gray-800 leading-tight mb-1 text-lg">${item.nome}</h4>
                    <p class="text-xs text-gray-500 mb-3 font-mono">Disponibili: <span class="font-bold text-orange-700 text-lg">${item.quantita} <span class="text-xs">${item.unita}</span></span></p>
                    
                    <div class="mt-auto flex gap-1">
                        <input type="number" id="qty-${item.id}" placeholder="0" class="w-16 p-2 text-center border rounded bg-gray-50 text-sm font-bold outline-none focus:border-orange-500">
                        <button onclick="cart.add('${item.id}')" class="flex-1 bg-orange-100 text-orange-700 hover:bg-orange-200 font-bold py-2 rounded text-sm transition">
                            USA
                        </button>
                    </div>
                </div>
            </div>
            `;
        }).join('');
    },

    async checkout() {
        const note = document.getElementById('checkout-note').value;
        if(state.cart.length === 0) return ui.toast("Lista vuota!", "error");

        loader.show();
        // Aggiorna DB
        for (let c of state.cart) {
            const item = state.pantry.find(x => x.id === c.id);
            if(item) {
                const newQ = item.quantita - c.qty;
                await _sb.from('cambusa').update({ quantita: newQ }).eq('id', c.id);
            }
        }

        // Logica notifiche (opzionale, simile ad Armadio)
        
        cart.empty();
        ui.toggleCart();
        ui.toast("Ingredienti usati! Buon appetito 🥘", "success");
        await this.loadData();
        loader.hide();
    }
};

// --- CARRELLO ---
const cart = {
    add(id) {
        const item = state.pantry.find(x => x.id == id);
        const input = document.getElementById(`qty-${id}`);
        const qty = parseFloat(input.value);

        if(!qty || qty <= 0) return ui.toast("Quantità non valida", "error");
        if(qty > item.quantita) return ui.toast("Non ne hai abbastanza!", "error");

        const exists = state.cart.find(x => x.id == id);
        if(exists) exists.qty += qty;
        else state.cart.push({ id, name: item.nome, qty, unit: item.unita });

        input.value = '';
        this.render();
        ui.toast(`${item.nome} aggiunto`, "success");
    },
    remove(idx) { state.cart.splice(idx, 1); this.render(); },
    empty() { state.cart = []; this.render(); },
    render() {
        document.getElementById('cart-count-mobile').innerText = state.cart.length;
        document.getElementById('cart-items').innerHTML = state.cart.map((c, i) => `
            <div class="bg-white p-3 rounded shadow-sm border-l-4 border-orange-500 flex justify-between items-center">
                <div>
                    <div class="font-bold text-gray-800">${c.name}</div>
                    <div class="text-xs text-orange-600 font-bold">${c.qty} ${c.unit}</div>
                </div>
                <button onclick="cart.remove(${i})" class="text-red-400 font-bold px-2">✕</button>
            </div>
        `).join('');
    }
};

// --- ADMIN ---
const admin = {
    renderList() {
        document.getElementById('admin-list').innerHTML = state.pantry.map(p => `
            <div class="flex justify-between items-center py-3 px-2 border-b hover:bg-gray-50">
                <div>
                    <div class="font-bold text-gray-800">${p.nome}</div>
                    <div class="text-xs text-gray-500 font-mono">
                        ${p.quantita} ${p.unita} (Min: ${p.soglia})
                    </div>
                </div>
                <button onclick="admin.edit('${p.id}')" class="text-blue-600 text-xs font-bold bg-blue-50 px-3 py-1 rounded">MODIFICA</button>
            </div>
        `).join('');
    },
    filterStock() {
        const term = document.getElementById('admin-search').value.toLowerCase();
        document.querySelectorAll('#admin-list > div').forEach(el => {
            const txt = el.innerText.toLowerCase();
            el.classList.toggle('hidden', !txt.includes(term));
        });
    },
    
    // CRUD
    openNewItem() {
        this.resetModal();
        ui.modal('modal-item');
    },
    edit(id) {
        const p = state.pantry.find(x => x.id == id);
        document.getElementById('item-id').value = id;
        document.getElementById('item-name').value = p.nome;
        document.getElementById('item-cat').value = p.categoria;
        document.getElementById('item-qty').value = p.quantita;
        document.getElementById('item-unit').value = p.unita;
        document.getElementById('item-min').value = p.soglia;
        document.getElementById('btn-del-item').classList.remove('hidden');
        ui.modal('modal-item');
    },
    async saveItem() {
        const id = document.getElementById('item-id').value;
        const data = {
            nome: document.getElementById('item-name').value,
            categoria: document.getElementById('item-cat').value,
            quantita: parseFloat(document.getElementById('item-qty').value),
            unita: document.getElementById('item-unit').value,
            soglia: parseFloat(document.getElementById('item-min').value)
        };

        if(id) await _sb.from('cambusa').update(data).eq('id', id);
        else await _sb.from('cambusa').insert([data]);

        ui.toast("Salvato!", "success");
        ui.closeModals();
        app.loadData();
    },
    async deleteItem() {
        if(!confirm("Eliminare ingrediente?")) return;
        await _sb.from('cambusa').delete().eq('id', document.getElementById('item-id').value);
        ui.closeModals();
        app.loadData();
    },
    resetModal() {
        document.getElementById('item-id').value = '';
        document.querySelectorAll('#modal-item input').forEach(i => i.value = '');
        document.getElementById('btn-del-item').classList.add('hidden');
    }
};

// --- AUTH & UI (Uguale ad Armadio) ---
const auth = {
    async check() {
        const { data: { user } } = await _sb.auth.getUser();
        if (user) {
            state.user = user;
            document.getElementById('nav-admin-mobile').classList.remove('hidden');
            document.getElementById('nav-admin-mobile').classList.add('flex');
            document.getElementById('btn-login-mobile').classList.add('hidden');
            app.nav('admin'); // Admin va diretto al QG
        }
    },
    async login() {
        const { error } = await _sb.auth.signInWithPassword({
            email: document.getElementById('log-mail').value,
            password: document.getElementById('log-pass').value
        });
        if (!error) location.reload(); else ui.toast("Errore login", "error");
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
        t.className = `px-6 py-3 rounded-full shadow-2xl text-white text-sm font-bold animate-bounce ${type === 'error' ? 'bg-red-500' : 'bg-orange-800'}`;
        t.innerText = msg;
        document.getElementById('toast-container').appendChild(t);
        setTimeout(() => t.remove(), 3000);
    }
};

app.init();
