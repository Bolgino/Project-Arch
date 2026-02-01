// cambusa.js - Versione 5.0 OPERATIVA

const CONFIG = {
    url: "https://jmildwxjaviqkrkhjzhl.supabase.co", 
    key: "sb_publishable_PwYQxh8l7HLR49EC_wHa7A_gppKi_FS", 
    adminEmail: "marcobolge@gmail.com"
};

const _sb = supabase.createClient(CONFIG.url, CONFIG.key);

const state = {
    pantry: [], recipes: [], recipeIngs: [], 
    cart: [], // Carrello consumo rapido
    campMenu: [], // Menu del campo
    shoppingList: [], // Lista spesa calcolata
    builderIngs: [], // Ingredienti temporanei per nuova ricetta
    user: null, currentCategory: 'all', tempRecipeId: null
};

const app = {
    async init() {
        ui.loader(true);
        await auth.check();
        await this.loadData();
        ui.loader(false);
        if(!state.user) this.nav('pantry');
    },

    async loadData() {
        const { data: d } = await _sb.from('cambusa').select('*').order('nome');
        state.pantry = d || [];
        const { data: r } = await _sb.from('ricette').select('*').order('nome');
        state.recipes = r || [];
        const { data: i } = await _sb.from('ingredienti_ricette').select('*');
        state.recipeIngs = i || [];

        this.renderPantry();
        if(state.user) admin.renderStock();
    },

    nav(view) {
        document.querySelectorAll('main > section').forEach(el => el.classList.add('hidden'));
        const el = document.getElementById(`view-${view}`);
        if(el) el.classList.remove('hidden');
        if(view === 'recipes') this.renderRecipesList();
    },

    // --- 1. DISPENSA ---
    setCategory(cat) {
        state.currentCategory = cat;
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active', 'bg-orange-600', 'text-white'));
        document.getElementById(`btn-cat-${cat}`).classList.add('active', 'bg-orange-600', 'text-white');
        this.filterPantry();
    },
    filterPantry() {
        const term = document.getElementById('search-bar').value.toLowerCase().trim();
        const cards = document.querySelectorAll('#pantry-grid > div');
        cards.forEach(card => {
            if(!card.dataset.name) return;
            const match = card.dataset.name.toLowerCase().includes(term) && 
                          (state.currentCategory === 'all' || card.dataset.category === state.currentCategory);
            card.classList.toggle('hidden', !match);
        });
    },
    renderPantry() {
        const grid = document.getElementById('pantry-grid');
        if(!state.pantry.length) { grid.innerHTML = '<p class="col-span-full text-center text-gray-400">Dispensa vuota.</p>'; return; }
        grid.innerHTML = state.pantry.map(i => {
            const isOut = i.quantita <= 0;
            return `
            <div class="bg-white rounded-xl shadow p-3 border border-orange-100 relative group" data-name="${i.nome}" data-category="${i.categoria}">
                ${isOut ? '<span class="absolute top-2 right-2 bg-black text-white text-[10px] px-1 rounded">ESAURITO</span>' : ''}
                <span class="text-[9px] font-bold text-orange-400 uppercase">${i.categoria}</span>
                <h4 class="font-bold text-gray-800 truncate">${i.nome}</h4>
                <div class="text-xs text-gray-500 mb-2 font-mono"><span class="font-bold text-lg text-orange-700">${i.quantita}</span> ${i.unita}</div>
                <div class="flex gap-1 mt-auto">
                    <input type="number" id="qty-${i.id}" class="w-12 border rounded text-center text-sm" placeholder="0">
                    <button onclick="cart.add('${i.id}')" class="flex-1 bg-orange-100 text-orange-800 text-xs font-bold py-2 rounded hover:bg-orange-200">PRENDI</button>
                </div>
            </div>`;
        }).join('');
    },

    // --- 2. CARICO AVANZI ---
    searchLeftoverItem() {
        const term = document.getElementById('leftover-search').value.toLowerCase();
        const resDiv = document.getElementById('leftover-results');
        const newBtn = document.getElementById('btn-new-product');
        if(term.length < 2) { resDiv.classList.add('hidden'); newBtn.classList.add('hidden'); return; }

        const matches = state.pantry.filter(p => p.nome.toLowerCase().includes(term));
        if(matches.length > 0) {
            resDiv.classList.remove('hidden'); newBtn.classList.add('hidden');
            resDiv.innerHTML = matches.map(p => `
                <div class="p-3 hover:bg-green-50 cursor-pointer border-b text-sm font-bold flex justify-between" onclick="app.selectLeftover('${p.id}')">
                    <span>${p.nome}</span> <span class="text-gray-400 text-xs">${p.unita}</span>
                </div>`).join('');
        } else {
            resDiv.classList.add('hidden'); newBtn.classList.remove('hidden');
        }
    },
    selectLeftover(id) {
        const p = state.pantry.find(x => x.id === id);
        this.setupLeftoverForm(p.id, p.nome, p.unita, false);
    },
    setupNewLeftover() {
        const name = document.getElementById('leftover-search').value;
        this.setupLeftoverForm(null, name, 'pz', true);
    },
    setupLeftoverForm(id, name, unit, isNew) {
        document.getElementById('leftover-step-1').classList.add('hidden');
        document.getElementById('leftover-step-2').classList.remove('hidden');
        document.getElementById('leftover-title').innerText = isNew ? "Nuovo: " + name : name;
        document.getElementById('leftover-id').value = id || '';
        document.getElementById('leftover-is-new').value = isNew;
        document.getElementById('leftover-unit-display').innerText = unit;
        
        if(isNew) {
            document.getElementById('leftover-new-fields').classList.remove('hidden');
            document.getElementById('leftover-name-new').value = name;
            document.getElementById('leftover-unit-display').innerText = '-';
        } else {
            document.getElementById('leftover-new-fields').classList.add('hidden');
        }
    },
    resetLeftoverWizard() {
        document.getElementById('leftover-step-2').classList.add('hidden');
        document.getElementById('leftover-step-1').classList.remove('hidden');
        document.getElementById('leftover-search').value = '';
        document.getElementById('leftover-qty').value = '';
        document.getElementById('leftover-results').classList.add('hidden');
        document.getElementById('btn-new-product').classList.add('hidden');
    },
    async submitLeftover() {
        const isNew = document.getElementById('leftover-is-new').value === 'true';
        const qty = parseFloat(document.getElementById('leftover-qty').value);
        if(!qty) return ui.toast("Quantità mancante", "error");

        let id = document.getElementById('leftover-id').value;
        try {
            ui.loader(true);
            if(isNew) {
                const name = document.getElementById('leftover-name-new').value;
                const cat = document.getElementById('leftover-cat-new').value;
                const unit = document.getElementById('leftover-unit-new').value;
                const { data, error } = await _sb.from('cambusa').insert([{ nome: name, quantita: qty, unita: unit, categoria: cat }]).select();
                if(error) throw error;
            } else {
                const cur = state.pantry.find(p => p.id === id);
                await _sb.from('cambusa').update({ quantita: cur.quantita + qty }).eq('id', id);
            }
            await _sb.from('movimenti').insert([{ utente: 'AVANZI', dettagli: `Carico +${qty}` }]);
            ui.toast("Caricato!", "success"); this.resetLeftoverWizard(); await this.loadData();
        } catch(e) { ui.toast("Errore: " + e.message, "error"); } finally { ui.loader(false); }
    },

    // --- 3. RICETTE (BUILDER) ---
    renderRecipesList() {
        document.getElementById('recipes-list').innerHTML = state.recipes.map(r => `
            <div class="bg-white p-3 rounded-lg shadow border-l-4 border-yellow-400 flex justify-between items-center">
                <div><h4 class="font-bold text-gray-800">${r.nome}</h4><p class="text-[10px] text-gray-500">${r.tags||''}</p></div>
                <button onclick="camp.promptAdd('${r.id}')" class="bg-yellow-100 text-yellow-700 text-xs font-bold px-3 py-1 rounded-full">+ MENU</button>
            </div>`).join('');
    },
    openRecipeBuilder() {
        state.builderIngs = [];
        document.getElementById('builder-name').value = '';
        document.getElementById('builder-tags').value = '';
        document.getElementById('builder-search').value = '';
        this.renderBuilderSelected();
        ui.modal('modal-recipe-builder');
    },
    searchBuilderIng() {
        const t = document.getElementById('builder-search').value.toLowerCase();
        const res = document.getElementById('builder-results');
        if(t.length < 2) { res.classList.add('hidden'); return; }
        
        const matches = state.pantry.filter(p => p.nome.toLowerCase().includes(t));
        res.innerHTML = matches.map(p => `
            <div class="p-2 hover:bg-gray-50 cursor-pointer text-xs font-bold border-b flex justify-between" onclick="app.addBuilderIng('${p.id}')">
                ${p.nome} <span class="text-gray-400">${p.unita}</span>
            </div>`).join('');
        res.classList.remove('hidden');
    },
    addBuilderIng(id) {
        const p = state.pantry.find(x => x.id === id);
        if(!state.builderIngs.find(x => x.id === id)) {
            state.builderIngs.push({ id: p.id, name: p.nome, unit: p.unita, qty: 0 }); // Default 0
            this.renderBuilderSelected();
        }
        document.getElementById('builder-search').value = '';
        document.getElementById('builder-results').classList.add('hidden');
    },
    renderBuilderSelected() {
        const el = document.getElementById('builder-selected');
        if(!state.builderIngs.length) { el.innerHTML = '<p class="text-gray-400 text-xs text-center">Nessuno.</p>'; return; }
        
        el.innerHTML = state.builderIngs.map((ing, i) => `
            <div class="flex items-center gap-2 bg-yellow-50 p-2 rounded border border-yellow-100">
                <span class="text-xs font-bold flex-grow truncate">${ing.name}</span>
                <input type="number" step="0.1" class="w-16 p-1 border rounded text-xs text-center font-bold" 
                       placeholder="Dose" value="${ing.qty || ''}" onchange="state.builderIngs[${i}].qty = parseFloat(this.value)">
                <span class="text-[10px] text-gray-500 w-8">${ing.unit}/pers</span>
                <button onclick="state.builderIngs.splice(${i},1); app.renderBuilderSelected()" class="text-red-500 font-bold ml-1">&times;</button>
            </div>`).join('');
    },
    async saveRecipe() {
        const name = document.getElementById('builder-name').value;
        const tags = document.getElementById('builder-tags').value;
        const ings = state.builderIngs.filter(i => i.qty > 0);
        
        if(!name || !ings.length) return ui.toast("Nome e dosi obbligatori", "error");
        
        try {
            ui.loader(true);
            const { data, error } = await _sb.from('ricette').insert([{ nome: name, tags: tags }]).select();
            if(error) throw error;
            const rid = data[0].id;
            const rows = ings.map(i => ({ ricetta_id: rid, ingrediente_id: i.id, quantita_necessaria: i.qty }));
            await _sb.from('ingredienti_ricette').insert(rows);
            ui.toast("Ricetta creata!", "success"); ui.closeModals(); await this.loadData();
        } catch(e) { ui.toast("Errore salvataggio", "error"); } finally { ui.loader(false); }
    }
};

// --- 4. PIANIFICATORE & LOGICA SPESA ---
const camp = {
    togglePlanner() {
        app.nav('planner');
        this.calculate();
    },
    promptAdd(id) {
        state.tempRecipeId = id;
        const r = state.recipes.find(x => x.id === id);
        document.getElementById('menu-add-name').innerText = r.nome;
        document.getElementById('menu-add-date').valueAsDate = new Date();
        ui.modal('modal-add-menu');
    },
    confirmAdd() {
        const date = document.getElementById('menu-add-date').value;
        const meal = document.getElementById('menu-add-meal').value;
        const r = state.recipes.find(x => x.id === state.tempRecipeId);
        state.campMenu.push({ id: r.id, name: r.nome, date, meal });
        state.campMenu.sort((a,b) => new Date(a.date) - new Date(b.date));
        ui.closeModals(); ui.toast("Aggiunto", "success");
        if(!document.getElementById('view-planner').classList.contains('hidden')) this.calculate();
    },
    clear() { state.campMenu = []; this.calculate(); },
    calculate() {
        const people = parseInt(document.getElementById('camp-people').value) || 1;
        
        // 1. Lista Visuale
        document.getElementById('camp-menu-list').innerHTML = state.campMenu.map((m,i) => `
            <div class="flex justify-between border-b pb-1 text-xs">
                <div><b>${new Date(m.date).toLocaleDateString()}</b> ${m.meal} - ${m.name}</div>
                <button onclick="state.campMenu.splice(${i},1); camp.calculate()" class="text-red-500 font-bold">&times;</button>
            </div>`).join('');
        
        document.getElementById('print-calendar').innerHTML = state.campMenu.map(m => `
            <div class="flex border-b border-gray-100 py-1">
                <span class="w-24 font-bold text-gray-500">${new Date(m.date).toLocaleDateString()}</span>
                <span class="w-20 font-bold text-orange-600 uppercase text-xs pt-1">${m.meal}</span>
                <span class="flex-grow">${m.name}</span>
            </div>`).join('');

        // 2. Calcolo Matematico
        let totals = {};
        state.campMenu.forEach(m => {
            const recipeIngs = state.recipeIngs.filter(x => x.ricetta_id === m.id);
            recipeIngs.forEach(ri => {
                if(!totals[ri.ingrediente_id]) {
                    const p = state.pantry.find(x => x.id === ri.ingrediente_id);
                    if(p) totals[ri.ingrediente_id] = { obj: p, needed: 0 };
                }
                if(totals[ri.ingrediente_id]) {
                    totals[ri.ingrediente_id].needed += (ri.quantita_necessaria * people);
                }
            });
        });

        const tbody = document.getElementById('camp-calc-body');
        state.shoppingList = []; // Reset lista per "Missione Spesa"
        let html = '';

        Object.values(totals).forEach(t => {
            const p = t.obj;
            const have = p.quantita;
            const need = t.needed;
            const missing = Math.max(0, need - have);
            
            if(missing > 0) {
                // Aggiungiamo alla lista interattiva
                state.shoppingList.push({ id: p.id, name: p.nome, buy: missing, unit: p.unita });
            }

            html += `
            <tr class="border-b">
                <td class="p-2 font-bold text-gray-700">${p.nome}</td>
                <td class="p-2 font-mono">${need.toFixed(1)} ${p.unita}</td>
                <td class="p-2 font-mono text-gray-400">${have.toFixed(1)}</td>
                <td class="p-2 font-bold ${missing>0 ? 'text-red-600 bg-red-50' : 'text-green-600'}">
                    ${missing>0 ? missing.toFixed(1) + ' ' + p.unita : 'OK (Usiamo scorte)'}
                </td>
            </tr>`;
        });
        tbody.innerHTML = html || '<tr><td colspan="4" class="text-center p-4 text-gray-300">Nessuna ricetta</td></tr>';
    }
};

// --- 5. MISSIONE SPESA ---
const shopping = {
    startMode() {
        if(!state.shoppingList.length) return ui.toast("Nulla da comprare!", "error");
        document.getElementById('view-planner').classList.add('hidden');
        document.getElementById('view-shopping').classList.remove('hidden');
        
        document.getElementById('shopping-list-interactive').innerHTML = state.shoppingList.map((item, i) => `
            <label class="flex items-center p-4 bg-gray-50 rounded-xl border border-gray-200 cursor-pointer hover:bg-green-50 transition">
                <input type="checkbox" class="shop-chk w-6 h-6 accent-green-600 mr-4" value="${i}">
                <div class="flex-grow">
                    <div class="font-bold text-gray-800 text-lg">${item.name}</div>
                    <div class="text-green-700 font-mono font-bold text-sm">DA PRENDERE: ${item.buy.toFixed(1)} ${item.unit}</div>
                </div>
            </label>`).join('');
    },
    async commit() {
        const chks = document.querySelectorAll('.shop-chk:checked');
        if(!chks.length) return ui.toast("Spunta almeno un prodotto!", "error");
        if(!confirm(`Confermi di aver comprato ${chks.length} prodotti? Verranno caricati in dispensa.`)) return;

        try {
            ui.loader(true);
            for(let chk of chks) {
                const idx = parseInt(chk.value);
                const item = state.shoppingList[idx];
                const p = state.pantry.find(x => x.id === item.id);
                // Aggiorna dispensa: Quantità attuale + Quantità comprata
                await _sb.from('cambusa').update({ quantita: p.quantita + item.buy }).eq('id', item.id);
            }
            await _sb.from('movimenti').insert([{ utente: 'MISSIONE SPESA', dettagli: 'Carico automatico da Menu Campo' }]);
            ui.toast("Spesa caricata!", "success");
            app.nav('pantry');
            await app.loadData();
        } catch(e) { ui.toast("Errore: " + e.message, "error"); } finally { ui.loader(false); }
    }
};

// --- CARRELLO RAPIDO ---
const cart = {
    add(id) {
        const p = state.pantry.find(x => x.id == id);
        const qty = parseFloat(document.getElementById(`qty-${id}`).value);
        if(!qty) return ui.toast("Quantità?", "error");
        state.cart.push({ id, name: p.nome, qty, unit: p.unita });
        document.getElementById(`qty-${id}`).value = '';
        this.render(); ui.toggleCart();
    },
    render() {
        document.getElementById('cart-count-mobile').innerText = state.cart.length;
        document.getElementById('cart-items').innerHTML = state.cart.map((c, i) => `
            <div class="flex justify-between border-b pb-2 mb-2 items-center">
                <div><div class="font-bold">${c.name}</div><div class="text-xs text-gray-500">-${c.qty} ${c.unit}</div></div>
                <button onclick="state.cart.splice(${i},1); cart.render()" class="text-red-500 font-bold">&times;</button>
            </div>`).join('');
    },
    async checkout() {
        const who = document.getElementById('checkout-note').value;
        if(!state.cart.length || !who) return ui.toast("Carrello vuoto o nome mancante", "error");
        try {
            ui.loader(true);
            for(let c of state.cart) {
                const p = state.pantry.find(x => x.id === c.id);
                await _sb.from('cambusa').update({ quantita: Math.max(0, p.quantita - c.qty) }).eq('id', c.id);
            }
            await _sb.from('movimenti').insert([{ utente: who, dettagli: state.cart.map(c=>`${c.name} -${c.qty}`).join(', ') }]);
            state.cart = []; this.render(); ui.toggleCart(); ui.toast("Prelevato!", "success"); await app.loadData();
        } catch(e) { ui.toast("Errore", "error"); } finally { ui.loader(false); }
    },
    empty() { state.cart=[]; this.render(); }
};

// --- ADMIN (Minimal) ---
const admin = {
    renderStock() { document.getElementById('admin-content').innerHTML = state.pantry.map(p => `<div class="border-b py-1 flex justify-between"><span>${p.nome}</span> <span class="font-mono text-xs">${p.quantita}</span></div>`).join(''); },
    async renderStats() { const {data}=await _sb.from('movimenti').select('*').limit(10).order('created_at',{ascending:false}); document.getElementById('admin-content').innerHTML = data.map(m=>`<div class="border-b py-1 text-xs"><b>${m.utente}</b>: ${m.dettagli}</div>`).join(''); }
};

// --- UTILS ---
const auth = {
    async check() { const {data:{user}} = await _sb.auth.getUser(); state.user = user; },
    async login() { const {error} = await _sb.auth.signInWithPassword({ email: document.getElementById('l-email').value, password: document.getElementById('l-pass').value }); if(!error) location.reload(); },
    logout() { _sb.auth.signOut().then(() => location.reload()); }
};

const ui = {
    loader(show) { const l=document.getElementById('cambusa-loader'); if(show) l.classList.remove('hidden','opacity-0'); else { l.classList.add('opacity-0'); setTimeout(()=>l.classList.add('hidden'),500); } },
    toggleMenu() { const m=document.getElementById('mobile-menu'); m.classList.toggle('hidden'); },
    toggleCart() { document.getElementById('cart-sidebar').classList.toggle('translate-x-full'); },
    modal(id) { document.getElementById(id).classList.remove('hidden'); },
    closeModals() { document.querySelectorAll('[id^="modal"], #login-modal').forEach(m=>m.classList.add('hidden')); },
    toast(msg, type) { 
        const t = document.createElement('div'); t.className = `bg-gray-800 text-white px-4 py-2 rounded-full shadow-lg text-sm font-bold animate-bounce`; 
        t.innerText = msg; document.getElementById('toast-container').appendChild(t); setTimeout(()=>t.remove(), 3000); 
    }
};

app.init();
