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
    recipes: [], 
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
        // 1. Carica Dispensa
        const { data: d } = await _sb.from('cambusa').select('*').order('nome');
        state.pantry = d || [];
        
        // 2. Carica Ricette (Nuovo)
        await recipes.load();

        if (state.user) {
            // ADMIN: Carica liste stock e approvazioni
            admin.renderList();      
            admin.loadApprovals();   
            admin.renderMovements(); 
        } else {
            // PUBBLICO
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
// --- RIFORNIMENTO PUBBLICO ---
const restock = {
    searchExisting() {
        const term = document.getElementById('restock-name').value.toLowerCase();
        const sugg = document.getElementById('restock-suggestions');
        if(term.length < 2) { sugg.classList.add('hidden'); return; }
        
        const matches = state.pantry.filter(p => p.nome.toLowerCase().includes(term));
        if(matches.length > 0) {
            sugg.innerHTML = matches.map(p => `
                <div onclick="restock.select('${p.nome}', '${p.unita}', '${p.categoria}')" class="p-2 hover:bg-gray-100 cursor-pointer text-sm border-b">
                    <b>${p.nome}</b> <span class="text-xs text-gray-500">(${p.unita})</span>
                </div>`).join('');
            sugg.classList.remove('hidden');
        } else { sugg.classList.add('hidden'); }
    },
    select(name, unit, cat) {
        document.getElementById('restock-name').value = name;
        document.getElementById('restock-unit').value = unit;
        document.getElementById('restock-cat').value = cat;
        document.getElementById('restock-suggestions').classList.add('hidden');
    },
    async submit() {
        const data = {
            nome: document.getElementById('restock-name').value,
            quantita: parseFloat(document.getElementById('restock-qty').value),
            unita: document.getElementById('restock-unit').value,
            categoria: document.getElementById('restock-cat').value,
            utente: state.user ? state.user.email : 'Pubblico',
            stato: 'pending'
        };
        if(!data.nome || !data.quantita) return ui.toast("Dati mancanti", "error");

        loader.show();
        await _sb.from('proposte_rifornimento').insert([data]);
        loader.hide();
        ui.toast("Inviato ad Admin!", "success");
        document.getElementById('restock-name').value = '';
        document.getElementById('restock-qty').value = '';
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
// --- RICETTE ---
const recipes = {
    tempIng: [], 
    async load() {
        const { data } = await _sb.from('ricette').select('*, ingredienti_ricetta(*)');
        state.recipes = data || [];
        this.renderList();
        
        // Aggiorna Select del Planner
        const sel = document.getElementById('planner-recipe-select');
        if(sel) sel.innerHTML = '<option value="">Seleziona Ricetta...</option>' + state.recipes.map(r => `<option value="${r.id}">${r.nome}</option>`).join('');
        
        // Aggiorna Datalist Ingredienti
        const dl = document.getElementById('pantry-datalist');
        if(dl) dl.innerHTML = state.pantry.map(p => `<option value="${p.nome}">`).join('');
    },
    renderList() {
        const el = document.getElementById('recipes-list');
        if(el) el.innerHTML = state.recipes.map(r => `
            <div class="bg-white p-4 rounded-xl border border-red-100 shadow-sm">
                <h3 class="font-bold text-red-900">${r.nome}</h3>
                <div class="text-xs text-gray-500 mt-1">${r.ingredienti_ricetta.map(i => `${i.quantita_necessaria}${i.unita} ${i.nome_ingrediente}`).join(', ')}</div>
            </div>`).join('');
    },
    openModal() { this.tempIng = []; this.renderTempIng(); ui.modal('modal-recipe'); },
    addIng() {
        const nome = document.getElementById('rec-ing-name').value;
        const qty = document.getElementById('rec-ing-qty').value;
        const unit = document.getElementById('rec-ing-unit').value;
        if(nome && qty) {
            this.tempIng.push({ nome, qty, unit });
            this.renderTempIng();
            document.getElementById('rec-ing-name').value = '';
            document.getElementById('rec-ing-qty').value = '';
        }
    },
    renderTempIng() {
        document.getElementById('recipe-ingredients-list').innerHTML = this.tempIng.map((i, idx) => `
            <div class="flex justify-between text-sm bg-white p-2 rounded border mb-1">
                <span><b>${i.qty}${i.unit}</b> ${i.nome}</span>
                <button onclick="recipes.tempIng.splice(${idx},1); recipes.renderTempIng()" class="text-red-500 font-bold">x</button>
            </div>`).join('');
    },
    async save() {
        const nome = document.getElementById('new-recipe-name').value;
        if(!nome || !this.tempIng.length) return ui.toast("Nome o ingredienti mancanti", "error");
        loader.show();
        const { data: rec } = await _sb.from('ricette').insert([{ nome }]).select();
        const ingData = this.tempIng.map(i => ({ ricetta_id: rec[0].id, nome_ingrediente: i.nome, quantita_necessaria: i.qty, unita: i.unit }));
        await _sb.from('ingredienti_ricetta').insert(ingData);
        loader.hide(); ui.toast("Salvata!", "success"); ui.closeModals(); this.load();
    }
};

// --- PLANNER (CALCOLO SPESA) ---
const planner = {
    currentMenu: [],
    addRecipe() {
        const sel = document.getElementById('planner-recipe-select');
        const mult = parseFloat(document.getElementById('planner-multiplier').value) || 1;
        if(sel.value) {
            this.currentMenu.push({ id: sel.value, name: sel.options[sel.selectedIndex].text, mult });
            this.renderCurrent();
        }
    },
    renderCurrent() {
        document.getElementById('planner-current-list').innerHTML = this.currentMenu.map((item, idx) => `
            <div class="flex justify-between items-center text-sm border-b py-1">
                <span>🍽️ ${item.name} <span class="font-bold text-green-700">x${item.mult}</span></span>
                <button onclick="planner.currentMenu.splice(${idx},1); planner.renderCurrent()" class="text-red-500 font-bold">x</button>
            </div>`).join('');
    },
    calculate() {
        if(!this.currentMenu.length) return ui.toast("Menu vuoto!", "error");
        let totalNeeds = {};
        
        // 1. Somma fabbisogno
        this.currentMenu.forEach(menuItem => {
            const recipe = state.recipes.find(r => r.id == menuItem.id);
            if(recipe) recipe.ingredienti_ricetta.forEach(ing => {
                const key = ing.nome_ingrediente.toLowerCase().trim();
                if(!totalNeeds[key]) totalNeeds[key] = { q: 0, u: ing.unita, name: ing.nome_ingrediente };
                totalNeeds[key].q += (parseFloat(ing.quantita_necessaria) * menuItem.mult);
            });
        });

        // 2. Confronta con dispensa e genera lista
        let list = [];
        for (let key in totalNeeds) {
            const need = totalNeeds[key];
            const inStock = state.pantry.find(p => p.nome.toLowerCase().trim() === key);
            const qtyStock = inStock ? inStock.quantita : 0;
            const diff = need.q - qtyStock;
            if (diff > 0) list.push({ ...need, stock: qtyStock, toBuy: diff });
        }
        this.renderResult(list);
    },
    renderResult(list) {
        document.getElementById('planner-result').classList.remove('hidden');
        const el = document.getElementById('planner-shopping-list');
        if(list.length === 0) el.innerHTML = '<div class="text-green-600 font-bold text-center">✅ Tutto presente in dispensa!</div>';
        else el.innerHTML = list.map(i => `
            <div class="py-2 flex justify-between border-b">
                <div><div class="font-bold capitalize">${i.name}</div><div class="text-xs text-gray-500">Serve: ${i.q} | C'è: ${i.stock}</div></div>
                <div class="text-right"><span class="block text-xs font-bold">COMPRARE</span><span class="text-xl font-bold text-red-600">${i.toBuy.toFixed(1)} <small>${i.u}</small></span></div>
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
       // 5. MOVIMENTI
    async renderMovements() {
        const { data } = await _sb.from('movimenti').select('*').order('created_at', { ascending: false }).limit(20);
        document.getElementById('movements-list').innerHTML = data.map(m => `
            <div class="bg-teal-50 p-3 rounded border border-teal-100 mb-2">
                <div class="flex justify-between mb-1"><span class="font-bold text-teal-900 text-xs">${m.utente}</span><span class="text-[10px] text-teal-600">${new Date(m.created_at).toLocaleDateString()}</span></div>
                <p class="text-xs text-teal-800">${m.dettagli}</p>
            </div>`).join('');
    },
    // NUOVO: Approva le richieste pubbliche
    async loadApprovals() {
        const { data } = await _sb.from('proposte_rifornimento').select('*').eq('stato', 'pending');
        const list = document.getElementById('admin-approval-list');
        const badge = document.getElementById('badge-approvals');
        
        if(data && data.length > 0) {
            if(badge) badge.classList.remove('hidden');
            list.innerHTML = data.map(p => `
                <div class="bg-blue-50 border border-blue-200 p-3 rounded flex flex-col gap-2">
                    <div class="flex justify-between font-bold text-blue-900"><span>${p.nome}</span> <span>${p.quantita} ${p.unita}</span></div>
                    <div class="text-xs text-gray-500">Categoria: ${p.categoria} | Da: ${p.utente}</div>
                    <div class="flex gap-2 items-center">
                        <input type="number" id="approve-min-${p.id}" placeholder="Soglia Min." class="w-20 p-1 text-xs border rounded text-center">
                        <button onclick="admin.approve(${p.id}, true)" class="flex-grow bg-green-600 text-white text-xs font-bold rounded py-1">APPROVA</button>
                        <button onclick="admin.approve(${p.id}, false)" class="bg-red-500 text-white text-xs font-bold rounded px-2 py-1">X</button>
                    </div>
                </div>`).join('');
        } else {
            if(badge) badge.classList.add('hidden');
            list.innerHTML = '<p class="text-gray-400 text-sm italic">Nessuna richiesta.</p>';
        }
    },

    async approve(id, isApproved) {
        loader.show();
        if(!isApproved) {
            await _sb.from('proposte_rifornimento').update({ stato: 'rejected' }).eq('id', id);
        } else {
            const { data: prop } = await _sb.from('proposte_rifornimento').select('*').eq('id', id).single();
            const min = parseFloat(document.getElementById(`approve-min-${id}`).value) || 0;
            
            // Cerca item esistente per nome (case insensitive)
            const { data: existing } = await _sb.from('cambusa').select('*').ilike('nome', prop.nome).maybeSingle();

            if(existing) {
                // Aggiorna esistente
                const newQ = existing.quantita + prop.quantita;
                // Aggiorna soglia solo se specificata dall'admin ora
                const newMin = min > 0 ? min : existing.soglia;
                await _sb.from('cambusa').update({ quantita: newQ, soglia: newMin }).eq('id', existing.id);
            } else {
                // Crea nuovo
                await _sb.from('cambusa').insert([{ nome: prop.nome, categoria: prop.categoria, quantita: prop.quantita, unita: prop.unita, soglia: min }]);
            }
            await _sb.from('proposte_rifornimento').update({ stato: 'approved' }).eq('id', id);
            await _sb.from('movimenti').insert([{ utente: 'ADMIN', dettagli: `Approvato: ${prop.nome} (+${prop.quantita})` }]);
        }
        await this.loadApprovals();
        await app.loadData();
        loader.hide();
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

app.init();
