// cambusa.js

// --- CONFIGURAZIONE ---
const CONFIG = {
    url: "https://jmildwxjaviqkrkhjzhl.supabase.co", 
    key: "sb_publishable_PwYQxh8l7HLR49EC_wHa7A_gppKi_FS", 
    adminEmail: "marcobolge@gmail.com",
    bucket: "immagini-oggetti"
};

const _sb = supabase.createClient(CONFIG.url, CONFIG.key);

// --- STATO ---
const state = { 
    pantry: [], 
    menus: [],
    menuComponents: [],
    cart: [],   
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
        // 1. Carica Dispensa (Tabella 'cambusa')
        const { data: d } = await _sb.from('cambusa').select('*').order('nome');
        state.pantry = d || [];
        
        // 2. Carica Menu/Ricette (Tabella 'menu' o riadatta pacchetti)
        // Nota: Assumo tu usi una tabella 'menu' e 'ingredienti_menu' simile a pacchetti.
        // Se non esistono, crea le tabelle in Supabase identiche a 'pacchetti' e 'componenti_pacchetto' ma con questi nomi.
        // Oppure usiamo 'pacchetti' filtrati per tipo se preferisci, ma qui uso nomi dedicati per pulizia.
        const { data: m } = await _sb.from('menu').select('*');
        state.menus = m || [];
        const { data: c } = await _sb.from('ingredienti_menu').select('*');
        state.menuComponents = c || [];

        if (state.user) {
            // Se Admin, renderizza i tab
            admin.renderList();
            admin.renderRestock();
            admin.renderRequests();
            admin.renderMenuBuilder();
            admin.renderMovements();
        } else {
            // Se Pubblico
            this.renderPantry();
            this.nav('pantry');
        }
    },

    nav(view) {
        document.querySelectorAll('section').forEach(el => el.classList.add('hidden'));
        document.getElementById(`view-${view}`).classList.remove('hidden');
        // Aggiungi questa riga:
        if(view === 'wishlist') wishlist.load();
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
            card.classList.toggle('hidden', !(matchesText && matchesCat));
        });
    },

    renderPantry() {
        document.getElementById('pantry-grid').innerHTML = state.pantry.map(item => {
            const isLow = item.quantita <= item.soglia;
            const isOut = item.quantita <= 0;
            let badge = isOut ? '<span class="absolute top-2 right-2 bg-gray-800 text-white text-[10px] px-2 rounded">FINITO 🚫</span>' 
                      : (isLow ? '<span class="absolute top-2 right-2 bg-red-100 text-red-600 text-[10px] px-2 rounded border border-red-200">SCORTA BASSA ⚠️</span>' : '');

            return `
            <div class="bg-white rounded-xl shadow-sm border border-orange-100 overflow-hidden hover:shadow-md transition flex flex-col relative group" data-category="${item.categoria}">
                ${badge}
                <div class="p-4 flex flex-col flex-grow">
                    <div class="text-[9px] font-bold uppercase text-orange-400 mb-1">${item.categoria}</div>
                    <h4 class="font-bold text-gray-800 leading-tight mb-1 text-lg">${item.nome}</h4>
                    <p class="text-xs text-gray-500 mb-3 font-mono">Disp: <span class="font-bold text-orange-700 text-lg">${item.quantita} <span class="text-xs">${item.unita}</span></span></p>
                    <div class="mt-auto flex gap-1">
                        <input type="number" step="0.5" id="qty-${item.id}" placeholder="0" class="w-16 p-2 text-center border rounded bg-gray-50 text-sm font-bold outline-none focus:border-orange-500">
                        <button onclick="cart.add('${item.id}')" class="flex-1 bg-orange-100 text-orange-700 hover:bg-orange-200 font-bold py-2 rounded text-sm transition">USA</button>
                    </div>
                </div>
            </div>`;
        }).join('');
    },

    async checkout() {
        const note = document.getElementById('checkout-note').value;
        if(state.cart.length === 0) return ui.toast("Lista vuota!", "error");

        loader.show();
        let logDetails = [];
        
        for (let c of state.cart) {
            const item = state.pantry.find(x => x.id === c.id);
            if(item) {
                const newQ = item.quantita - c.qty;
                await _sb.from('cambusa').update({ quantita: newQ }).eq('id', c.id);
                logDetails.push(`${item.nome} x${c.qty}${item.unita}`);
            }
        }

        // Salva movimento (uso tabella 'movimenti' generica, magari aggiungendo tag [CAMBUSA] nel dettaglio)
        await _sb.from('movimenti').insert([{
            utente: `Cambusa: ${note}`,
            dettagli: logDetails.join(', ')
        }]);

        cart.empty();
        ui.toggleCart();
        ui.toast("Registrato! 🥘", "success");
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
        
        const exists = state.cart.find(x => x.id == id);
        if(exists) exists.qty += qty;
        else state.cart.push({ id, name: item.nome, qty, unit: item.unita });
        
        input.value = '';
        this.render();
        ui.toast("Aggiunto", "success");
    },
    remove(idx) { state.cart.splice(idx, 1); this.render(); },
    empty() { state.cart = []; this.render(); },
    render() {
        document.getElementById('cart-count-mobile').innerText = state.cart.length;
        document.getElementById('cart-items').innerHTML = state.cart.map((c, i) => `
            <div class="bg-white p-3 rounded shadow-sm border-l-4 border-orange-500 flex justify-between items-center">
                <div><div class="font-bold text-gray-800">${c.name}</div><div class="text-xs text-orange-600 font-bold">${c.qty} ${c.unit}</div></div>
                <button onclick="cart.remove(${i})" class="text-red-400 font-bold px-2">✕</button>
            </div>`).join('');
    }
};

// --- ADMIN ---
const admin = {
    tab(t) {
        document.querySelectorAll('.admin-tab').forEach(e => e.classList.add('hidden'));
        document.getElementById(`admin-tab-${t}`).classList.remove('hidden');
    },

    // 1. DISPENSA (Stock)
    renderList() {
        document.getElementById('admin-list').innerHTML = state.pantry.map(p => `
            <div class="flex justify-between items-center py-3 px-2 border-b hover:bg-gray-50">
                <div>
                    <div class="font-bold text-gray-800">${p.nome}</div>
                    <div class="text-xs text-gray-500 font-mono">${p.quantita} ${p.unita} (Min: ${p.soglia})</div>
                </div>
                <button onclick="admin.edit('${p.id}')" class="text-blue-600 text-xs font-bold bg-blue-50 px-3 py-1 rounded">MODIFICA</button>
            </div>`).join('');
    },
    filterStock() {
        const term = document.getElementById('admin-search').value.toLowerCase();
        document.querySelectorAll('#admin-list > div').forEach(el => el.classList.toggle('hidden', !el.innerText.toLowerCase().includes(term)));
    },

    // 2. RIFORNIMENTO
    renderRestock() {
        document.getElementById('admin-restock-list').innerHTML = state.pantry.map(p => `
            <div class="bg-white border rounded-lg p-3 flex justify-between items-center shadow-sm">
                <div class="truncate pr-2">
                    <div class="font-bold text-sm text-gray-700 truncate">${p.nome}</div>
                    <div class="text-xs text-gray-400">Attuali: ${p.quantita} ${p.unita}</div>
                </div>
                <div class="flex items-center bg-blue-50 rounded-lg px-2 py-1 border border-blue-100">
                    <span class="text-blue-600 text-xs font-bold mr-2">+</span>
                    <input type="number" step="0.5" placeholder="0" data-id="${p.id}" data-current="${p.quantita}" class="restock-input w-16 p-1 text-center bg-transparent outline-none font-bold text-blue-900 border-b border-blue-200">
                </div>
            </div>`).join('');
    },
    async processRestock() {
        const inputs = document.querySelectorAll('.restock-input');
        let updates = [];
        inputs.forEach(inp => {
            const val = parseFloat(inp.value);
            if(val > 0) {
                updates.push(_sb.from('cambusa').update({ quantita: parseFloat(inp.dataset.current) + val }).eq('id', inp.dataset.id));
            }
        });
        if(!updates.length) return;
        loader.show(); await Promise.all(updates);
        inputs.forEach(i => i.value = '');
        ui.toast("Rifornito!", "success"); app.loadData(); loader.hide();
    },

    // 3. MENU / RICETTE (Ex Pacchetti)
    renderMenuBuilder() {
        document.getElementById('menu-items').innerHTML = state.pantry.map(p => `
            <label class="flex items-center gap-2 text-xs p-2 border rounded hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" value="${p.id}" class="menu-chk accent-yellow-500 w-4 h-4"> <span class="font-medium">${p.nome}</span>
            </label>`).join('');

        document.getElementById('admin-menus-list').innerHTML = state.menus.map(k => `
            <div class="flex justify-between items-center bg-white p-3 border rounded-lg shadow-sm">
                <span class="font-bold text-sm text-gray-700">🍽️ ${k.nome}</span>
                <div class="flex gap-2">
                    <button onclick="admin.openEditMenu('${k.id}')" class="text-blue-500 text-xs font-bold border border-blue-200 px-2 py-1 rounded">MOD</button>
                    <button onclick="admin.deleteMenu('${k.id}')" class="text-red-500 text-xs font-bold border border-red-200 px-2 py-1 rounded">DEL</button>
                </div>
            </div>`).join('');
    },
    async createMenu() {
        const name = document.getElementById('menu-name').value;
        const chks = document.querySelectorAll('.menu-chk:checked');
        if (!name || !chks.length) return ui.toast("Nome e ingredienti richiesti", "error");
        
        const { data } = await _sb.from('menu').insert([{ nome: name }]).select();
        const items = Array.from(chks).map(c => ({ menu_id: data[0].id, ingrediente_id: c.value, quantita_necessaria: 1 }));
        await _sb.from('ingredienti_menu').insert(items); // Tabella link
        
        ui.toast("Menu Creato!", "success"); document.getElementById('menu-name').value = ""; app.loadData();
    },
    // (Edit Menu functions omitted for brevity but follow logic of create)

    // 4. LISTA SPESA (Requests - Simuliamo usando una tabella 'spesa' o 'richieste' filtrata)
    async renderRequests() {
        // Aggiunto .eq('tipo', 'cambusa')
        const { data } = await _sb.from('richieste').select('*').eq('tipo', 'cambusa').order('created_at', { ascending: false });
        const el = document.getElementById('admin-requests-list');
        
        if(!data || !data.length) { 
            el.innerHTML = "<p class='text-gray-400 text-center text-xs'>Nessuna voce in lista.</p>"; 
            return; 
        }
        
        el.innerHTML = data.map(r => `
            <div class="bg-pink-50 p-3 rounded border border-pink-100 flex justify-between items-center">
                <div class="text-sm">
                    <div class="font-bold text-gray-800 ${r.completato ? 'line-through' : ''}">${r.oggetto}</div>
                    <div class="text-[10px] text-gray-500">${r.richiedente || 'N/A'}</div>
                </div>
                <div class="flex gap-2">
                    <button onclick="admin.reqAction('${r.id}', 'toggle', ${!r.completato})" class="px-2 py-1 rounded text-xs font-bold ${r.completato ? 'bg-yellow-100 text-yellow-700' : 'bg-green-600 text-white'}">${r.completato ? '↩️' : '✅'}</button>
                    <button onclick="admin.reqAction('${r.id}', 'del')" class="text-red-500 font-bold px-2">✕</button>
                </div>
            </div>`).join('');
    },
    async delReq(id) { await _sb.from('lista_spesa').delete().eq('id', id); this.renderRequests(); },

    // 5. MOVIMENTI
    async renderMovements() {
        const { data } = await _sb.from('movimenti').select('*').order('created_at', { ascending: false }).limit(20);
        document.getElementById('movements-list').innerHTML = data.map(m => `
            <div class="bg-teal-50 p-3 rounded border border-teal-100 mb-2">
                <div class="flex justify-between mb-1"><span class="font-bold text-teal-900 text-xs">${m.utente}</span><span class="text-[10px] text-teal-600">${new Date(m.created_at).toLocaleDateString()}</span></div>
                <p class="text-xs text-teal-800">${m.dettagli}</p>
            </div>`).join('');
    },

    // CRUD ITEM
    openNewItem() { this.resetModal(); ui.modal('modal-item'); },
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
        ui.toast("Salvato!", "success"); ui.closeModals(); app.loadData();
    },
    async deleteItem() {
        if(!confirm("Eliminare?")) return;
        await _sb.from('cambusa').delete().eq('id', document.getElementById('item-id').value);
        ui.closeModals(); app.loadData();
    },
    resetModal() {
        document.getElementById('item-id').value = '';
        document.querySelectorAll('#modal-item input').forEach(i => i.value = '');
        document.getElementById('btn-del-item').classList.add('hidden');
    }
};

// --- AUTH ---
const auth = {
    async check() {
        const { data: { user } } = await _sb.auth.getUser();
        if (user) {
            state.user = user;
            // Mostra Admin
            document.getElementById('nav-admin-mobile').classList.remove('hidden');
            document.getElementById('nav-admin-mobile').classList.add('flex');
            // Nascondi Login e Link Pubblici
            document.getElementById('btn-login-mobile').classList.add('hidden');
            document.getElementById('nav-public-links').classList.add('hidden'); // NASCONDE LA DISPENSA PUBBLICA
            app.nav('admin');
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
const wishlist = {
    async load() {
        // Carica SOLO richieste tipo 'cambusa'
        const { data } = await _sb.from('richieste').select('*').eq('tipo', 'cambusa').order('created_at', { ascending: false });
        this.render(data || []);
    },
    render(data) {
        const el = document.getElementById('wishlist-items');
        if (!data.length) { el.innerHTML = '<p class="text-gray-400 italic text-center">Nessuna richiesta attiva!</p>'; return; }
        el.innerHTML = data.map(item => `
            <div class="bg-white p-3 rounded border-l-4 ${item.completato ? 'border-green-500 opacity-60' : 'border-orange-500'} flex justify-between items-center mb-2">
                <div><div class="font-bold text-gray-800 ${item.completato ? 'line-through' : ''}">${item.oggetto}</div><div class="text-xs text-gray-500 font-mono">👤 ${item.richiedente || 'Anonimo'}</div></div>
                ${item.completato ? '<span class="text-green-600 font-bold text-xs bg-green-50 px-2 py-1 rounded">PRESO!</span>' : '<span class="text-orange-400 text-xs italic">In attesa...</span>'}
            </div>`).join('');
    },
    async add() {
        const item = document.getElementById('wish-item').value;
        const name = document.getElementById('wish-name').value;
        if (!item || !name) return ui.toast("Cosa serve e chi sei?", "error");
        
        // SALVA CON TIPO 'cambusa'
        await _sb.from('richieste').insert([{ oggetto: item, richiedente: name, tipo: 'cambusa' }]);
        
        ui.toast("Richiesta inviata!", "success"); 
        document.getElementById('wish-item').value = ''; 
        this.load();
    }
};
app.init();
