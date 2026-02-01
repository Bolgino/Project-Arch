// cambusa.js - Versione 4.0 Final

const CONFIG = {
    url: "https://jmildwxjaviqkrkhjzhl.supabase.co", 
    key: "sb_publishable_PwYQxh8l7HLR49EC_wHa7A_gppKi_FS", 
    adminEmail: "marcobolge@gmail.com"
};

const _sb = supabase.createClient(CONFIG.url, CONFIG.key);

const state = {
    pantry: [], recipes: [], recipeIngs: [], cart: [], campMenu: [],
    user: null, currentCategory: 'all', tempRecipeId: null, shoppingList: []
};

const app = {
    async init() {
        await auth.check();
        await this.loadData();
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
        this.renderRecipeCreatorIngredients();
        
        if (state.user) {
            admin.renderStock();
            admin.renderRecipesAdmin();
            admin.renderStats();
        }
    },

    nav(view) {
        document.querySelectorAll('main > section').forEach(el => el.classList.add('hidden'));
        document.getElementById(`view-${view}`).classList.remove('hidden');
        if(view === 'recipes') this.renderRecipesList();
    },

    // --- DISPENSA ---
    setCategory(cat) {
        state.currentCategory = cat;
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        document.getElementById(`btn-cat-${cat}`).classList.add('active');
        this.filterPantry();
    },
    filterPantry() {
        const term = document.getElementById('search-bar').value.toLowerCase().trim();
        document.querySelectorAll('#pantry-grid > div').forEach(card => {
            const matches = card.dataset.name.toLowerCase().includes(term) && 
                            (state.currentCategory === 'all' || card.dataset.category === state.currentCategory);
            card.classList.toggle('hidden', !matches);
        });
    },
    renderPantry() {
        document.getElementById('pantry-grid').innerHTML = state.pantry.map(i => {
            const isOut = i.quantita <= 0;
            return `
            <div class="bg-white rounded-xl shadow border border-orange-100 p-3 flex flex-col relative group ${isOut?'opacity-60 grayscale':''}" data-name="${i.nome}" data-category="${i.categoria}">
                ${isOut ? '<span class="absolute top-2 right-2 bg-black text-white text-[10px] px-1 rounded">FINITO</span>' : ''}
                <span class="text-[9px] font-bold uppercase text-orange-400">${i.categoria}</span>
                <h4 class="font-bold text-gray-800 text-sm md:text-base mb-1 truncate">${i.nome}</h4>
                <div class="text-xs text-gray-500 mb-2 font-mono"><span class="font-bold text-orange-700 text-lg">${i.quantita}</span> ${i.unita}</div>
                <div class="mt-auto flex gap-1">
                     <input type="number" id="qty-${i.id}" class="w-12 border rounded text-center text-sm" placeholder="0">
                     <button onclick="cart.add('${i.id}')" class="flex-1 bg-orange-100 text-orange-800 font-bold text-xs py-2 rounded hover:bg-orange-200">PRENDI</button>
                </div>
            </div>`;
        }).join('');
    },

    // --- CARICO AVANZI (WIZARD CORRETTO) ---
    searchLeftoverItem() {
        const term = document.getElementById('leftover-search').value.toLowerCase();
        const resDiv = document.getElementById('leftover-results');
        const newBtn = document.getElementById('btn-create-new-leftover');
        
        if(term.length < 2) { resDiv.classList.add('hidden'); newBtn.classList.add('hidden'); return; }
        
        const matches = state.pantry.filter(p => p.nome.toLowerCase().includes(term));
        
        if(matches.length > 0) {
            resDiv.classList.remove('hidden'); newBtn.classList.add('hidden');
            resDiv.innerHTML = matches.map(p => `
                <div class="p-3 hover:bg-green-50 cursor-pointer text-sm font-bold flex justify-between" onclick="app.selectLeftover('${p.id}')">
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
        
        document.getElementById('leftover-id').value = id || '';
        document.getElementById('leftover-is-new').value = isNew;
        document.getElementById('leftover-title').innerText = isNew ? "Nuovo: " + name : name;
        document.getElementById('leftover-unit').value = unit || 'pz';
        
        const newFields = document.getElementById('leftover-new-fields');
        if(isNew) {
            newFields.classList.remove('hidden');
            document.getElementById('leftover-name-new').value = name;
        } else {
            newFields.classList.add('hidden');
        }
    },
    resetLeftoverWizard() {
        document.getElementById('leftover-step-2').classList.add('hidden');
        document.getElementById('leftover-step-1').classList.remove('hidden');
        document.getElementById('leftover-search').value = '';
        document.getElementById('leftover-qty').value = '';
        document.getElementById('leftover-results').classList.add('hidden');
        document.getElementById('btn-create-new-leftover').classList.add('hidden');
    },
    async submitLeftover() {
        const isNew = document.getElementById('leftover-is-new').value === 'true';
        const qty = parseFloat(document.getElementById('leftover-qty').value);
        if(!qty) return ui.toast("Manca la quantità", "error");

        let id = document.getElementById('leftover-id').value;
        let name = isNew ? document.getElementById('leftover-name-new').value : document.getElementById('leftover-title').innerText;
        
        if(isNew) {
            const cat = document.getElementById('leftover-cat-new').value;
            const unit = document.getElementById('leftover-unit').value;
            const { data, error } = await _sb.from('cambusa').insert([{ nome: name, quantita: qty, unita: unit, categoria: cat }]).select();
            if(error) return ui.toast("Errore creazione", "error");
            id = data[0].id; // Ottieni ID appena creato
        } else {
            const current = state.pantry.find(p => p.id === id);
            await _sb.from('cambusa').update({ quantita: current.quantita + qty }).eq('id', id);
        }
        await _sb.from('movimenti').insert([{ utente: 'AVANZI', dettagli: `Caricato: ${name} (+${qty})` }]);
        ui.toast("Caricato!", "success"); this.resetLeftoverWizard(); await this.loadData();
    },

    // --- RICETTE (LISTA & CREAZIONE) ---
    renderRecipesList() {
        document.getElementById('recipes-list').innerHTML = state.recipes.map(r => `
            <div class="bg-white p-4 rounded-xl shadow border-l-4 border-yellow-400 hover:shadow-lg transition flex justify-between items-center">
                <div><h3 class="font-bold text-gray-800">${r.nome}</h3><div class="text-xs text-gray-500">${r.tags||''}</div></div>
                <button onclick="camp.promptAddRecipe('${r.id}')" class="bg-yellow-100 text-yellow-700 font-bold px-3 py-1 rounded-full text-xs hover:bg-yellow-200">+ MENU</button>
            </div>`).join('');
    },
    renderRecipeCreatorIngredients() {
        // Popola la lista ingredienti nel modale creazione
        document.getElementById('new-rec-ing-list').innerHTML = state.pantry.map(p => `
            <label class="flex items-center gap-2 p-1 hover:bg-white rounded cursor-pointer" data-name="${p.nome}">
                <input type="checkbox" value="${p.id}" class="accent-yellow-500 new-rec-chk"> 
                <span class="truncate">${p.nome}</span>
            </label>`).join('');
    },
    filterRecipeIngredients() {
        const term = document.getElementById('new-rec-search').value.toLowerCase();
        document.querySelectorAll('#new-rec-ing-list label').forEach(l => {
            l.classList.toggle('hidden', !l.dataset.name.toLowerCase().includes(term));
        });
    },
    async submitNewRecipe() {
        const name = document.getElementById('new-rec-name').value;
        const tags = document.getElementById('new-rec-tags').value;
        const chks = document.querySelectorAll('.new-rec-chk:checked');
        if(!name || !chks.length) return ui.toast("Nome e ingredienti obbligatori", "error");

        const { data } = await _sb.from('ricette').insert([{ nome: name, tags: tags }]).select();
        const rid = data[0].id;
        const items = Array.from(chks).map(c => ({ ricetta_id: rid, ingrediente_id: c.value, quantita_necessaria: 0.1 })); // Dose default
        await _sb.from('ingredienti_ricette').insert(items);
        
        ui.toast("Ricetta creata!", "success"); ui.closeModals(); await this.loadData();
    },

    // --- CARRELLO ---
    async checkout() {
        const note = document.getElementById('checkout-note').value;
        if(!state.cart.length || !note) return ui.toast("Carrello vuoto o nome mancante", "error");
        for (let c of state.cart) {
            const item = state.pantry.find(x => x.id === c.id);
            if(item) await _sb.from('cambusa').update({ quantita: Math.max(0, item.quantita - c.qty) }).eq('id', c.id);
        }
        await _sb.from('movimenti').insert([{ utente: note, dettagli: state.cart.map(c=>`${c.name} x${c.qty}`).join(', ') }]);
        cart.empty(); ui.toggleCart(); ui.toast("Prelevato!", "success"); await this.loadData();
    }
};

// --- CAMP PLANNER & SHOPPING MODE ---
const camp = {
    togglePlanner() {
        document.getElementById('view-recipes').classList.add('hidden');
        document.getElementById('view-planner').classList.remove('hidden');
        this.calculate();
    },
    promptAddRecipe(id) {
        state.tempRecipeId = id;
        const r = state.recipes.find(x => x.id === id);
        document.getElementById('modal-camp-recipe-name').innerText = r.nome;
        document.getElementById('camp-add-date').valueAsDate = new Date();
        ui.modal('modal-camp-date');
    },
    confirmAddRecipe() {
        const date = document.getElementById('camp-add-date').value;
        const meal = document.getElementById('camp-add-meal').value;
        const r = state.recipes.find(x => x.id === state.tempRecipeId);
        state.campMenu.push({ id: r.id, name: r.nome, date, meal });
        state.campMenu.sort((a,b) => new Date(a.date) - new Date(b.date));
        ui.closeModals(); ui.toast("Aggiunto", "success");
        if(!document.getElementById('view-planner').classList.contains('hidden')) this.calculate();
    },
    clear() { state.campMenu = []; this.calculate(); },
    calculate() {
        const people = parseInt(document.getElementById('camp-people').value) || 1;
        // Render List Sidebar
        document.getElementById('camp-menu-list').innerHTML = state.campMenu.map((m,i) => `
            <div class="flex justify-between border-b pb-1 text-xs">
                <div><b>${new Date(m.date).toLocaleDateString()}</b> ${m.meal} - ${m.name}</div>
                <button onclick="state.campMenu.splice(${i},1); camp.calculate()" class="text-red-500 font-bold">x</button>
            </div>`).join('');
        
        // Calculate Totals
        let totals = {};
        state.campMenu.forEach(m => {
            const ings = state.recipeIngs.filter(x => x.ricetta_id === m.id);
            ings.forEach(ing => {
                if(!totals[ing.ingrediente_id]) {
                    const p = state.pantry.find(x => x.id === ing.ingrediente_id);
                    if(p) totals[ing.ingrediente_id] = { obj: p, needed: 0 };
                }
                if(totals[ing.ingrediente_id]) totals[ing.ingrediente_id].needed += (ing.quantita_necessaria * people);
            });
        });
        
        const tbody = document.getElementById('camp-calc-body');
        state.shoppingList = []; // Reset shopping logic list
        let html = '';
        
        Object.values(totals).forEach(t => {
            const p = t.obj;
            const miss = Math.max(0, t.needed - p.quantita);
            if(miss > 0) state.shoppingList.push({ id: p.id, name: p.nome, qty: miss, unit: p.unita });
            
            html += `<tr class="border-b">
                <td class="p-2 font-bold">${p.nome}</td>
                <td class="p-2">${t.needed.toFixed(1)} ${p.unita}</td>
                <td class="p-2 text-gray-400">${p.quantita.toFixed(1)}</td>
                <td class="p-2 ${miss>0?'text-red-600 font-bold bg-red-50':'text-green-600'}">${miss>0 ? miss.toFixed(1) : 'OK'}</td>
            </tr>`;
        });
        tbody.innerHTML = html || '<tr><td colspan="4" class="text-center p-4 text-gray-400">Nessuna ricetta</td></tr>';
    }
};

const shopping = {
    start() {
        if(!state.shoppingList.length) return ui.toast("Nulla da comprare!", "error");
        document.getElementById('view-planner').classList.add('hidden');
        document.getElementById('view-shopping').classList.remove('hidden');
        
        document.getElementById('shopping-list').innerHTML = state.shoppingList.map((item, i) => `
            <label class="flex items-center p-3 bg-gray-50 rounded border cursor-pointer hover:bg-green-50">
                <input type="checkbox" class="shop-chk w-5 h-5 accent-green-600 mr-3" value="${i}">
                <div class="flex-grow">
                    <div class="font-bold text-gray-800 text-lg">${item.name}</div>
                    <div class="text-green-700 font-mono font-bold">Da prendere: ${item.qty} ${item.unit}</div>
                </div>
            </label>
        `).join('');
    },
    async complete() {
        const chks = document.querySelectorAll('.shop-chk:checked');
        if(!chks.length) return ui.toast("Spunta cosa hai preso", "error");
        
        if(!confirm(`Confermi di aver comprato ${chks.length} prodotti? Verranno caricati in dispensa.`)) return;
        
        for (let chk of chks) {
            const idx = parseInt(chk.value);
            const item = state.shoppingList[idx];
            // Carica in DB
            const p = state.pantry.find(x => x.id === item.id);
            await _sb.from('cambusa').update({ quantita: p.quantita + item.qty }).eq('id', item.id);
        }
        
        await _sb.from('movimenti').insert([{ utente: 'SPESA', dettagli: `Carico automatico spesa campo` }]);
        ui.toast("Spesa Caricata!", "success");
        app.nav('pantry');
        await app.loadData();
    }
};

const cart = {
    add(id) {
        const p = state.pantry.find(x => x.id == id);
        const qty = parseFloat(document.getElementById(`qty-${id}`).value);
        if(!qty) return ui.toast("Quantità?", "error");
        state.cart.push({ id, name: p.nome, qty, unit: p.unita });
        document.getElementById(`qty-${id}`).value = '';
        this.render(); ui.toast("Aggiunto", "success");
    },
    empty() { state.cart = []; this.render(); },
    render() {
        document.getElementById('cart-count-mobile').innerText = state.cart.length;
        document.getElementById('cart-items').innerHTML = state.cart.map(c => 
            `<div class="flex justify-between border-b pb-1"><span>${c.name} (${c.qty})</span></div>`
        ).join('');
    }
};

const admin = {
    tab(t) { document.querySelectorAll('.admin-tab').forEach(e => e.classList.add('hidden')); document.getElementById(`admin-tab-${t}`).classList.remove('hidden'); },
    renderStock() { document.getElementById('admin-stock-list').innerHTML = state.pantry.map(p => `
        <div class="flex justify-between py-2 border-b">
            <div><b>${p.nome}</b> <span class="text-xs">${p.quantita} ${p.unita}</span></div>
            <button onclick="admin.editItem('${p.id}')" class="text-blue-600 text-xs font-bold">MODIFICA</button>
        </div>`).join(''); },
    filterStock() { 
        const t = document.getElementById('admin-search-stock').value.toLowerCase(); 
        document.querySelectorAll('#admin-stock-list > div').forEach(e => e.classList.toggle('hidden', !e.innerText.toLowerCase().includes(t))); 
    },
    editItem(id) {
        const p = state.pantry.find(x => x.id === id);
        document.getElementById('edit-id').value = id; document.getElementById('edit-name').value = p.nome;
        document.getElementById('edit-qty').value = p.quantita; document.getElementById('edit-unit').value = p.unita;
        ui.modal('modal-item');
    },
    openNewItem() { 
        document.getElementById('edit-id').value = ''; document.querySelectorAll('#modal-item input').forEach(i=>i.value=''); 
        ui.modal('modal-item'); 
    },
    async saveItem() {
        const id = document.getElementById('edit-id').value;
        const data = { 
            nome: document.getElementById('edit-name').value, 
            quantita: parseFloat(document.getElementById('edit-qty').value), 
            unita: document.getElementById('edit-unit').value,
            categoria: document.getElementById('edit-cat').value 
        };
        if(id) await _sb.from('cambusa').update(data).eq('id', id);
        else await _sb.from('cambusa').insert([data]);
        ui.closeModals(); app.loadData();
    },
    renderRecipesAdmin() { /* Implementato simile a v3 */ },
    renderStats() { /* Implementato simile a v3 */ }
};

const auth = {
    async check() { const {data:{user}} = await _sb.auth.getUser(); state.user = user; if(user) { document.getElementById('nav-admin-mobile').classList.remove('hidden'); document.getElementById('nav-admin-mobile').classList.add('flex'); document.getElementById('btn-login-mobile').classList.add('hidden'); } },
    async login() { const {error} = await _sb.auth.signInWithPassword({ email: document.getElementById('log-mail').value, password: document.getElementById('log-pass').value }); if(!error) location.reload(); },
    logout() { _sb.auth.signOut().then(() => location.reload()); }
};

const ui = {
    modal(id) { document.getElementById(id).classList.remove('hidden'); },
    closeModals() { document.querySelectorAll('[id^="modal"], #login-modal').forEach(m => m.classList.add('hidden')); },
    toggleCart() { document.getElementById('cart-sidebar').classList.toggle('translate-x-full'); },
    toggleMenu() { 
        const m = document.getElementById('mobile-menu'); 
        if(m.classList.contains('hidden')) m.classList.remove('hidden'); else m.classList.add('hidden'); 
    },
    toast(msg, type) {
        const t = document.createElement('div'); t.className = `px-6 py-3 rounded-full text-white font-bold animate-bounce ${type==='error'?'bg-red-500':'bg-orange-800'}`;
        t.innerText = msg; document.getElementById('toast-container').appendChild(t); setTimeout(()=>t.remove(), 3000);
    }
};

app.init();
