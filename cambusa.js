// cambusa.js - Versione 3.0 Complete

const CONFIG = {
    url: "https://jmildwxjaviqkrkhjzhl.supabase.co", 
    key: "sb_publishable_PwYQxh8l7HLR49EC_wHa7A_gppKi_FS", 
    adminEmail: "marcobolge@gmail.com"
};

const _sb = supabase.createClient(CONFIG.url, CONFIG.key);

const state = {
    pantry: [],      
    recipes: [],     
    recipeIngs: [],  
    cart: [],
    campMenu: [], // Array di oggetti: { recipeId, recipeName, date, meal }
    user: null,
    currentCategory: 'all',
    tempRecipeId: null // Per il modale data
};

const loader = {
    show() { document.getElementById('cambusa-loader').classList.remove('opacity-0', 'pointer-events-none'); },
    hide() { setTimeout(() => document.getElementById('cambusa-loader').classList.add('opacity-0', 'pointer-events-none'), 800); }
};

const app = {
    async init() {
        loader.show();
        await auth.check();
        await this.loadData();
        loader.hide();
        
        // Default View: Pantry
        if(!state.user) this.nav('pantry');
        else admin.checkExpirations();
    },

    async loadData() {
        const { data: d } = await _sb.from('cambusa').select('*').order('nome');
        state.pantry = d || [];
        const { data: r } = await _sb.from('ricette').select('*').order('nome');
        state.recipes = r || [];
        const { data: i } = await _sb.from('ingredienti_ricette').select('*');
        state.recipeIngs = i || [];

        this.renderPantry();
        
        // Popola liste per form di creazione ricette
        this.renderPublicRecipeForm();
        
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
            const isOut = item.quantita <= 0;
            const daysToExp = item.data_scadenza ? Math.ceil((new Date(item.data_scadenza) - new Date()) / (86400000)) : 999;
            const isExpiring = !isOut && daysToExp <= 7 && daysToExp >= 0;

            let badge = '';
            if (isOut) badge = '<span class="absolute top-2 right-2 bg-gray-800 text-white text-[10px] font-bold px-2 py-0.5 rounded z-10">ESAURITO</span>';
            else if (isExpiring) badge = '<span class="absolute top-2 right-2 bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded z-10 animate-pulse">SCADE PRESTO</span>';

            const opacity = isOut ? 'opacity-50 grayscale' : '';
            return `
            <div class="bg-white rounded-xl shadow-sm border border-orange-100 overflow-hidden hover:shadow-md transition flex flex-col relative group ${opacity}" data-category="${item.categoria}">
                ${badge}
                <div class="p-3 flex flex-col flex-grow">
                    <span class="text-[9px] font-bold uppercase text-orange-400 mb-1 tracking-wider">${item.categoria}</span>
                    <h4 class="font-bold text-gray-800 leading-tight mb-1 text-base md:text-lg line-clamp-2">${item.nome}</h4>
                    <div class="text-xs text-gray-500 mb-3 font-mono">
                        Disp: <span class="font-bold text-orange-700 text-lg">${item.quantita} <span class="text-xs">${item.unita}</span></span>
                    </div>
                    <div class="mt-auto flex gap-1">
                        <input type="number" id="qty-${item.id}" placeholder="0" class="w-14 p-1 text-center border rounded bg-gray-50 text-sm font-bold" ${isOut ? 'disabled' : ''}>
                        <button ${isOut ? 'disabled' : ''} onclick="cart.add('${item.id}')" class="flex-1 bg-orange-100 text-orange-800 hover:bg-orange-200 font-bold py-2 rounded transition">${isOut ? 'FINITO' : 'PRENDI'}</button>
                    </div>
                </div>
            </div>`;
        }).join('');
    },

    // --- CARICO AVANZI (WIZARD) ---
    searchLeftoverItem() {
        const term = document.getElementById('leftover-search').value.toLowerCase();
        const resDiv = document.getElementById('leftover-results');
        const createBtn = document.getElementById('leftover-create-btn');
        
        if(term.length < 2) { 
            resDiv.classList.add('hidden'); 
            createBtn.classList.add('hidden');
            return; 
        }
        
        const matches = state.pantry.filter(p => p.nome.toLowerCase().includes(term));
        if(matches.length > 0) {
            resDiv.innerHTML = matches.map(p => `
                <div class="p-4 hover:bg-green-50 cursor-pointer text-sm font-bold text-gray-700 border-b flex justify-between items-center group" 
                     onclick="app.selectLeftover('${p.id}')">
                    <span>${p.nome}</span>
                    <span class="text-green-600 group-hover:underline">Seleziona &rarr;</span>
                </div>
            `).join('');
            resDiv.classList.remove('hidden');
            createBtn.classList.add('hidden');
        } else {
            resDiv.classList.add('hidden');
            createBtn.classList.remove('hidden');
        }
    },

    selectLeftover(id) {
        const item = state.pantry.find(p => p.id === id);
        this.fillLeftoverForm(item.id, item.nome, item.unita, false);
    },

    showLeftoverFormNew() {
        const name = document.getElementById('leftover-search').value;
        this.fillLeftoverForm(null, name, 'pz', true);
    },

    fillLeftoverForm(id, name, unit, isNew) {
        document.getElementById('leftover-step-1').classList.add('hidden');
        document.getElementById('leftover-step-2').classList.remove('hidden');
        
        document.getElementById('leftover-display-name').innerText = name || "Nuovo Prodotto";
        document.getElementById('leftover-id').value = id || "";
        document.getElementById('leftover-name').value = name || "";
        document.getElementById('leftover-unit').value = unit || 'pz';
        document.getElementById('leftover-is-new').value = isNew;

        if (isNew) {
            document.getElementById('leftover-new-fields').classList.remove('hidden');
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
        document.getElementById('leftover-create-btn').classList.add('hidden');
    },

    async submitLeftover() {
        const isNew = document.getElementById('leftover-is-new').value === 'true';
        const id = document.getElementById('leftover-id').value;
        const qty = parseFloat(document.getElementById('leftover-qty').value);
        const date = document.getElementById('leftover-date').value || null;
        
        let name = document.getElementById('leftover-display-name').innerText;
        let unit = document.getElementById('leftover-unit').value;
        let cat = 'extra';

        if (isNew) {
            name = document.getElementById('leftover-name').value;
            cat = document.getElementById('leftover-cat').value;
        }

        if(!name || !qty || qty <= 0) return ui.toast("Dati mancanti o errati!", "error");

        loader.show();
        if (!isNew && id) {
            const current = state.pantry.find(p => p.id == id);
            await _sb.from('cambusa').update({ 
                quantita: current.quantita + qty,
                ...(date ? { data_scadenza: date } : {}) 
            }).eq('id', id);
        } else {
            await _sb.from('cambusa').insert([{
                nome: name, quantita: qty, unita: unit, categoria: cat, data_scadenza: date, soglia: 1
            }]);
        }
        
        await _sb.from('movimenti').insert([{ utente: 'AVANZI', dettagli: `Caricato: ${name} (+${qty})` }]);
        loader.hide();
        ui.toast("Caricato con successo!", "success");
        this.resetLeftoverWizard();
        await this.loadData();
    },

    // --- RICETTE PUBBLICHE ---
    renderRecipesList() {
        document.getElementById('recipes-list').innerHTML = state.recipes.map(r => `
            <div class="bg-white p-4 rounded-xl shadow-md border-l-4 border-yellow-400 flex flex-col hover:shadow-lg transition">
                <div class="flex justify-between items-start mb-2">
                    <h3 class="font-bold text-lg text-gray-800">${r.nome}</h3>
                    <button onclick="camp.promptAddRecipe('${r.id}')" class="bg-green-100 text-green-700 text-xs font-bold px-3 py-1 rounded-full hover:bg-green-200 transition">+ CAMP</button>
                </div>
                <div class="text-xs text-gray-500 mb-2 italic">${r.tags || 'Ricetta generica'}</div>
            </div>
        `).join('');
    },

    togglePublicRecipeForm() {
        const f = document.getElementById('public-recipe-form');
        f.classList.toggle('hidden');
    },

    renderPublicRecipeForm() {
        document.getElementById('pub-rec-ing-list').innerHTML = state.pantry.map(p => `
            <label class="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" value="${p.id}" class="pub-rec-chk accent-yellow-500"> 
                <span class="truncate">${p.nome}</span>
            </label>
        `).join('');
    },

    async submitPublicRecipe() {
        const name = document.getElementById('pub-rec-name').value;
        const tags = document.getElementById('pub-rec-tags').value;
        const chks = document.querySelectorAll('.pub-rec-chk:checked');
        
        if (!name || !chks.length) return ui.toast("Serve nome e ingredienti", "error");
        
        loader.show();
        const { data, error } = await _sb.from('ricette').insert([{ nome: name, tags: tags + " (Community)" }]).select();
        
        if(!error && data) {
            const rid = data[0].id;
            const items = Array.from(chks).map(c => ({ 
                ricetta_id: rid, ingrediente_id: c.value, quantita_necessaria: 0.1 // Default dummy dose
            }));
            await _sb.from('ingredienti_ricette').insert(items);
            ui.toast("Ricetta Creata! Grazie!", "success");
            this.togglePublicRecipeForm();
            await this.loadData();
        } else {
            ui.toast("Errore creazione", "error");
        }
        loader.hide();
    },

    // --- CHECKOUT ---
    async checkout() {
        const note = document.getElementById('checkout-note').value;
        if(state.cart.length === 0) return ui.toast("Carrello vuoto!", "error");
        if(!note) return ui.toast("Chi preleva?", "error");

        loader.show();
        let log = [];
        for (let c of state.cart) {
            const item = state.pantry.find(x => x.id === c.id);
            if(item) {
                const nQ = Math.max(0, item.quantita - c.qty);
                await _sb.from('cambusa').update({ quantita: nQ }).eq('id', c.id);
                log.push(`${item.nome} x${c.qty}`);
            }
        }
        await _sb.from('movimenti').insert([{ utente: note, dettagli: log.join(', ') }]);
        cart.empty(); ui.toggleCart(); loader.hide(); ui.toast("Prelevato!", "success"); await this.loadData();
    }
};

// --- CAMP PLANNER (DATE & MEALS) ---
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
        // Pre-fill data oggi se vuota
        if(!document.getElementById('camp-add-date').value) {
            document.getElementById('camp-add-date').valueAsDate = new Date();
        }
        ui.modal('modal-camp-date');
    },

    confirmAddRecipe() {
        const date = document.getElementById('camp-add-date').value;
        const meal = document.getElementById('camp-add-meal').value;
        
        if(!date) return ui.toast("Inserisci una data", "error");
        
        const r = state.recipes.find(x => x.id === state.tempRecipeId);
        state.campMenu.push({
            id: r.id,
            name: r.nome,
            date: date,
            meal: meal
        });
        
        // Ordina per data e pasto
        state.campMenu.sort((a,b) => new Date(a.date) - new Date(b.date));
        
        ui.closeModals();
        ui.toast("Aggiunto al menu!", "success");
        if(!document.getElementById('view-planner').classList.contains('hidden')) this.calculate();
    },

    clear() { state.campMenu = []; this.calculate(); },

    calculate() {
        const people = parseInt(document.getElementById('camp-people').value) || 1;
        
        // 1. Sidebar List
        document.getElementById('camp-menu-list').innerHTML = state.campMenu.map((item, i) => `
            <div class="bg-gray-50 border p-2 rounded flex justify-between items-center text-xs">
                <div>
                    <span class="font-bold block text-gray-700">${new Date(item.date).toLocaleDateString()} - ${item.meal}</span>
                    <span class="text-gray-500">${item.name}</span>
                </div>
                <button onclick="state.campMenu.splice(${i},1); camp.calculate()" class="text-red-500 font-bold px-2">✕</button>
            </div>
        `).join('') || '<p class="text-gray-400 text-xs italic">Nessuna ricetta.</p>';

        // 2. Calendar View for Print
        document.getElementById('print-calendar-view').innerHTML = state.campMenu.map(item => `
            <div class="flex border-b py-2">
                <div class="w-32 font-bold text-gray-600">${new Date(item.date).toLocaleDateString()}</div>
                <div class="w-24 font-bold text-orange-600 uppercase">${item.meal}</div>
                <div class="flex-grow">${item.name}</div>
            </div>
        `).join('');

        // 3. Totals Calculation
        let totals = {};
        state.campMenu.forEach(entry => {
            const ings = state.recipeIngs.filter(x => x.ricetta_id === entry.id);
            ings.forEach(ing => {
                if (!totals[ing.ingrediente_id]) {
                    const pItem = state.pantry.find(p => p.id === ing.ingrediente_id);
                    if(pItem) totals[ing.ingrediente_id] = { needed: 0, obj: pItem };
                }
                if (totals[ing.ingrediente_id]) {
                    // Dose x Persone
                    totals[ing.ingrediente_id].needed += (ing.quantita_necessaria * people);
                }
            });
        });

        const tbody = document.getElementById('camp-calc-body');
        let html = '';
        Object.values(totals).forEach(t => {
            const item = t.obj;
            const need = t.needed;
            const have = item.quantita;
            const missing = Math.max(0, need - have);
            
            html += `
            <tr class="border-b">
                <td class="p-2 font-bold text-gray-700">${item.nome}</td>
                <td class="p-2 font-mono">${need.toFixed(1)} ${item.unita}</td>
                <td class="p-2 font-mono text-gray-500">${have.toFixed(1)}</td>
                <td class="p-2 ${missing > 0 ? 'text-red-600 font-bold bg-red-50' : 'text-green-600'}">${missing > 0 ? missing.toFixed(1) + ' ' + item.unita : 'OK'}</td>
            </tr>`;
        });
        tbody.innerHTML = html || '<tr><td colspan="4" class="p-4 text-center text-gray-400">Nessun dato</td></tr>';
    },

    print() { window.print(); }
};

// --- CART ---
const cart = {
    add(id) {
        const item = state.pantry.find(x => x.id == id);
        const input = document.getElementById(`qty-${id}`);
        const qty = parseFloat(input.value);
        if(!qty || qty <= 0) return ui.toast("Quantità?", "error");
        
        const exists = state.cart.find(x => x.id == id);
        if(exists) exists.qty += qty;
        else state.cart.push({ id, name: item.nome, qty, unit: item.unita });
        
        input.value = ''; this.render(); ui.toast("Aggiunto", "success");
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
        document.querySelectorAll('.admin-nav-btn').forEach(e => e.classList.remove('border-orange-600', 'bg-orange-50'));
        document.getElementById(`admin-tab-${t}`).classList.remove('hidden');
    },

    checkExpirations() { /* Logica scadenze come prima */ },

    // STOCK
    renderStock() {
        document.getElementById('admin-stock-list').innerHTML = state.pantry.map(p => `
            <div class="flex justify-between items-center py-2 px-2 hover:bg-gray-50 border-b">
                <div class="flex-grow">
                    <div class="font-bold text-gray-800">${p.nome}</div>
                    <div class="text-xs text-gray-500 font-mono">${p.quantita} ${p.unita} | ${p.soglia} min</div>
                </div>
                <button onclick="admin.editItem('${p.id}')" class="text-blue-600 text-xs font-bold bg-blue-50 px-3 py-1 rounded">MODIFICA</button>
            </div>`).join('');
    },
    filterStock() {
        const term = document.getElementById('admin-search-stock').value.toLowerCase();
        document.querySelectorAll('#admin-stock-list > div').forEach(el => el.classList.toggle('hidden', !el.innerText.toLowerCase().includes(term)));
    },
    openNewItem() { ui.modal('modal-item'); document.querySelectorAll('#modal-item input').forEach(i => i.value=''); document.getElementById('edit-id').value=''; },
    editItem(id) {
        const p = state.pantry.find(x => x.id === id);
        document.getElementById('edit-id').value = id;
        document.getElementById('edit-name').value = p.nome;
        document.getElementById('edit-qty').value = p.quantita;
        document.getElementById('edit-unit').value = p.unita;
        document.getElementById('edit-min').value = p.soglia;
        document.getElementById('edit-cat').value = p.categoria;
        document.getElementById('edit-date').value = p.data_scadenza || '';
        ui.modal('modal-item');
    },
    async saveItem() {
        // Logica salvataggio ingrediente identica a v2 (vedi sopra o precedente)
        const id = document.getElementById('edit-id').value;
        const data = {
            nome: document.getElementById('edit-name').value,
            quantita: parseFloat(document.getElementById('edit-qty').value),
            unita: document.getElementById('edit-unit').value,
            soglia: parseFloat(document.getElementById('edit-min').value),
            categoria: document.getElementById('edit-cat').value,
            data_scadenza: document.getElementById('edit-date').value || null
        };
        if(id) await _sb.from('cambusa').update(data).eq('id', id);
        else await _sb.from('cambusa').insert([data]);
        ui.closeModals(); app.loadData();
    },
    async deleteItem() {
        if(confirm('Eliminare?')) { await _sb.from('cambusa').delete().eq('id', document.getElementById('edit-id').value); ui.closeModals(); app.loadData(); }
    },

    // RECIPES & DOSES
    renderRecipesAdmin() {
        document.getElementById('admin-recipes-list').innerHTML = state.recipes.map(r => `
            <div class="bg-white border rounded p-3 flex justify-between items-center">
                <span class="font-bold text-sm text-gray-700">${r.nome}</span>
                <div class="flex gap-2">
                    <button onclick="admin.editDoses('${r.id}')" class="text-yellow-600 text-xs font-bold border border-yellow-200 px-3 py-1 rounded hover:bg-yellow-50">DOSI</button>
                    <button onclick="admin.deleteRecipe('${r.id}')" class="text-red-500 text-xs font-bold border border-red-200 px-3 py-1 rounded hover:bg-red-50">ELIMINA</button>
                </div>
            </div>`).join('');
    },
    
    editDoses(id) {
        const r = state.recipes.find(x => x.id === id);
        document.getElementById('dose-modal-title').innerText = `Dosi: ${r.nome}`;
        document.getElementById('dose-recipe-id').value = id;
        
        const myIngs = state.recipeIngs.filter(i => i.ricetta_id === id);
        
        document.getElementById('dose-list').innerHTML = myIngs.map(i => {
            const p = state.pantry.find(p => p.id === i.ingrediente_id);
            if(!p) return '';
            return `
            <div class="flex justify-between items-center mb-2 border-b pb-2">
                <div class="text-sm font-bold text-gray-700 w-1/2">${p.nome}</div>
                <div class="flex items-center gap-2 w-1/2 justify-end">
                    <input type="number" step="0.01" class="dose-input w-20 p-1 border rounded text-right font-mono" 
                           data-ing-id="${p.id}" value="${i.quantita_necessaria}">
                    <span class="text-xs text-gray-500 w-8">${p.unita}/pers</span>
                </div>
            </div>`;
        }).join('');
        
        ui.modal('modal-recipe-doses');
    },
    
    async saveDoses() {
        const rid = document.getElementById('dose-recipe-id').value;
        const inputs = document.querySelectorAll('.dose-input');
        
        loader.show();
        for (let inp of inputs) {
            const ingId = inp.dataset.ingId;
            const val = parseFloat(inp.value);
            await _sb.from('ingredienti_ricette')
                .update({ quantita_necessaria: val })
                .match({ ricetta_id: rid, ingrediente_id: ingId });
        }
        loader.hide();
        ui.toast("Dosi aggiornate!", "success");
        ui.closeModals();
        app.loadData();
    },

    async deleteRecipe(id) {
        if(!confirm("Eliminare?")) return;
        await _sb.from('ingredienti_ricette').delete().eq('ricetta_id', id);
        await _sb.from('ricette').delete().eq('id', id);
        app.loadData();
    },

    // STATS
    async renderStats() {
        const { data } = await _sb.from('movimenti').select('*').order('created_at', { ascending: false }).limit(20);
        document.getElementById('admin-movements-list').innerHTML = data.map(m => `
            <div class="border-b pb-1">
                <div class="font-bold text-gray-800">${m.utente}</div>
                <div class="text-gray-500 truncate">${m.dettagli}</div>
            </div>`).join('');
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
            // Quando si logga l'admin, va alla dashboard admin
            app.nav('admin');
        }
    },
    async login() {
        const { error } = await _sb.auth.signInWithPassword({
            email: document.getElementById('log-mail').value,
            password: document.getElementById('log-pass').value
        });
        if (!error) location.reload(); else ui.toast("Login fallito", "error");
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
        t.className = `px-6 py-3 rounded-full shadow-2xl text-white text-sm font-bold animate-bounce ${type === 'error' ? 'bg-red-500' : 'bg-orange-800'} z-[200]`;
        t.innerText = msg;
        document.getElementById('toast-container').appendChild(t);
        setTimeout(() => t.remove(), 3000);
    }
};

app.init();
