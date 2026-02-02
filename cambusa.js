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
    restockCart: [], // NUOVO: carrello per il ricarico
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

   // --- DENTRO L'OGGETTO app ---

    renderFilters() {
        // Categorie fisse o dinamiche
        const cats = ['all', 'colazione', 'pranzo_cena', 'condimenti', 'merenda', 'extra'];
        const labels = { all: 'Tutto', colazione: '☕ Colazione', pranzo_cena: '🍝 Pasti', condimenti: '🧂 Condim.', merenda: '🍫 Merenda', extra: '🧻 Extra' };
        
        document.getElementById('pantry-filters').innerHTML = cats.map(c => `
            <button id="btn-cat-${c}" onclick="app.setCategory('${c}')" 
                class="filter-btn px-4 py-2 rounded-full text-xs font-bold border transition whitespace-nowrap
                ${state.currentCategory === c ? 'bg-orange-700 text-white border-orange-700 shadow-md' : 'bg-white text-gray-600 border-gray-200'}">
                ${labels[c] || c}
            </button>
        `).join('');
    },

    renderPantry() {
        this.renderFilters(); // Assicura che i filtri ci siano
        
        document.getElementById('pantry-grid').innerHTML = state.pantry.map(item => {
            const isOut = item.quantita <= 0;
            const isLow = !isOut && item.quantita <= item.soglia;
            
            // Badge colorati
            let badge = '';
            let borderClass = 'border-orange-100';
            
            if (isOut) {
                badge = '<span class="absolute top-2 right-2 bg-gray-800 text-white text-[10px] px-2 py-0.5 rounded font-bold shadow">ESAURITO 🚫</span>';
                borderClass = 'border-gray-300 bg-gray-50 opacity-75';
            } else if (isLow) {
                badge = '<span class="absolute top-2 right-2 bg-red-500 text-white text-[10px] px-2 py-0.5 rounded font-bold shadow animate-pulse">SCORTA BASSA ⚠️</span>';
                borderClass = 'border-red-300 bg-red-50';
            }

            return `
            <div class="rounded-xl shadow-sm border ${borderClass} overflow-hidden hover:shadow-md transition flex flex-col relative group bg-white" data-category="${item.categoria}">
                ${badge}
                <div class="p-3 flex flex-col flex-grow">
                    <div class="text-[9px] font-bold uppercase text-gray-400 mb-1 tracking-wider">${item.categoria}</div>
                    <h4 class="font-bold text-gray-800 leading-tight mb-2 text-md">${item.nome}</h4>
                    
                    <div class="mt-auto">
                        <p class="text-xs text-gray-500 mb-2 font-mono flex justify-between">
                            <span>Disp:</span> 
                            <span class="font-bold ${isLow ? 'text-red-600' : 'text-orange-700'} text-lg">${item.quantita} <span class="text-xs">${item.unita}</span></span>
                        </p>
                        
                        <div class="flex gap-1 ${isOut ? 'opacity-50 pointer-events-none' : ''}">
                            <input type="number" step="0.5" min="0" max="${item.quantita}" id="qty-${item.id}" placeholder="0" 
                                class="w-14 p-2 text-center border rounded bg-gray-50 text-sm font-bold outline-none focus:border-orange-500">
                            <button onclick="cart.add('${item.id}')" class="flex-1 bg-orange-100 text-orange-800 hover:bg-orange-200 font-bold py-2 rounded text-xs transition">USA</button>
                        </div>
                    </div>
                </div>
            </div>`;
        }).join('');
        
        this.filterPantry(); // Applica il filtro corrente
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
// --- RIFORNIMENTO PUBBLICO (A STEP CON GRIGLIA) ---
const restock = {
    init() {
        state.restockCart = [];
        this.renderBadge();
        this.backToStep1();
        this.renderList();
    },

    // STEP 1: Mostra TUTTO (o filtrato) in una griglia
    renderList() {
        const term = document.getElementById('restock-search').value.toLowerCase();
        const container = document.getElementById('restock-grid');
        
        // Filtra
        let matches = state.pantry.filter(p => p.nome.toLowerCase().includes(term));
        
        // Ordina: prima quelli già nel carrello ricarico, poi alfabetico
        matches.sort((a, b) => {
            const aInCart = state.restockCart.some(x => x.nome === a.nome);
            const bInCart = state.restockCart.some(x => x.nome === b.nome);
            if (aInCart && !bInCart) return -1;
            if (!aInCart && bInCart) return 1;
            return a.nome.localeCompare(b.nome);
        });

        container.innerHTML = matches.map(p => {
            const inCart = state.restockCart.find(x => x.nome === p.nome);
            const val = inCart ? inCart.quantita : '';
            const isSelected = !!inCart;
            
            // Stile Card
            const bgClass = isSelected ? 'bg-blue-50 border-blue-500 ring-2 ring-blue-200' : 'bg-white border-gray-200';
            
            return `
            <div class="rounded-xl shadow-sm border ${bgClass} p-3 flex flex-col justify-between transition group hover:shadow-md h-full">
                <div>
                    <div class="text-[10px] font-bold uppercase text-gray-400 mb-1 tracking-wider">${p.categoria}</div>
                    <div class="font-bold text-gray-800 text-sm leading-tight mb-2">${p.nome}</div>
                </div>
                
                <div class="mt-2">
                    <div class="flex items-center bg-gray-100 rounded-lg p-1 border">
                        <span class="text-blue-600 font-bold text-xs pl-2 mr-2">+</span>
                        <input type="number" step="0.5" placeholder="0" value="${val}"
                            onchange="restock.updateCart('${p.nome}', this.value, '${p.unita}', '${p.categoria}')"
                            class="w-full bg-transparent text-center font-bold text-blue-900 outline-none text-sm p-1">
                        <span class="text-[10px] text-gray-500 font-mono pr-2">${p.unita}</span>
                    </div>
                </div>
            </div>`;
        }).join('');
    },

    updateCart(nome, qty, unita, categoria) {
        const q = parseFloat(qty);
        const idx = state.restockCart.findIndex(x => x.nome === nome);
        
        if (!qty || q <= 0) {
            if (idx > -1) state.restockCart.splice(idx, 1);
        } else {
            if (idx > -1) state.restockCart[idx].quantita = q;
            else state.restockCart.push({ nome, quantita: q, unita, categoria, isNew: false });
        }
        this.renderBadge();
        // Non ricarico tutta la lista per non perdere il focus, cambio solo stile se necessario
        // (Opzionale: potresti chiamare renderList() qui ma farebbe saltare il focus dell'input)
    },

    renderBadge() {
        document.getElementById('restock-count-badge').innerText = state.restockCart.length;
    },

    openNewModal() {
        document.getElementById('new-res-name').value = '';
        document.getElementById('new-res-qty').value = '';
        document.getElementById('modal-new-restock').classList.remove('hidden');
    },

    addNewItemToCart() {
        const nome = document.getElementById('new-res-name').value;
        const qty = parseFloat(document.getElementById('new-res-qty').value);
        const unita = document.getElementById('new-res-unit').value;
        const cat = document.getElementById('new-res-cat').value;

        if (!nome || !qty) return ui.toast("Dati mancanti", "error");

        this.updateCart(nome, qty, unita, cat);
        
        document.getElementById('modal-new-restock').classList.add('hidden');
        document.getElementById('restock-search').value = nome; 
        this.renderList();
        ui.toast("Aggiunto!", "success");
    },

    goToStep2() {
        if (state.restockCart.length === 0) return ui.toast("Seleziona almeno un prodotto", "error");
        document.getElementById('restock-step-1').classList.add('hidden');
        document.getElementById('restock-step-2').classList.remove('hidden');
        this.renderSummary();
    },

    backToStep1() {
        document.getElementById('restock-step-2').classList.add('hidden');
        document.getElementById('restock-step-1').classList.remove('hidden');
        this.renderList();
    },

    renderSummary() {
        document.getElementById('restock-summary-list').innerHTML = state.restockCart.map((item, idx) => `
            <div class="flex justify-between items-center bg-white p-3 rounded-lg border-b last:border-0 hover:bg-gray-50">
                <div class="flex items-center gap-3">
                    <div class="bg-blue-100 text-blue-600 font-bold rounded-full w-8 h-8 flex items-center justify-center text-xs">
                        ${idx + 1}
                    </div>
                    <div>
                        <div class="font-bold text-gray-800">${item.nome}</div>
                        <div class="text-[10px] text-gray-500 uppercase font-bold tracking-wider">${item.categoria}</div>
                    </div>
                </div>
                <div class="text-right flex items-center gap-3">
                    <div class="bg-blue-50 px-3 py-1 rounded text-blue-900 font-bold border border-blue-100">
                        +${item.quantita} <span class="text-xs font-normal">${item.unita}</span>
                    </div>
                    <button onclick="state.restockCart.splice(${idx},1); restock.renderSummary(); restock.renderBadge()" class="text-red-400 hover:text-red-600 font-bold p-1">✕</button>
                </div>
            </div>
        `).join('');
    },

    async submitTotal() {
        if (state.restockCart.length === 0) return;
        loader.show();
        const user = state.user ? state.user.email : 'Pubblico';
        
        const payload = state.restockCart.map(item => ({
            nome: item.nome,
            quantita: item.quantita,
            unita: item.unita,
            categoria: item.categoria,
            utente: user,
            stato: 'pending'
        }));

        const { error } = await _sb.from('proposte_rifornimento').insert(payload);
        loader.hide();
        
        if(error) {
            ui.toast("Errore invio dati", "error");
        } else {
            ui.toast(`Richiesta inviata per ${state.restockCart.length} prodotti!`, "success");
            this.init(); 
            document.getElementById('restock-search').value = '';
        }
    }
};
// --- CARRELLO ---
const cart = {
    // --- DENTRO L'OGGETTO cart ---
    add(id) {
        const item = state.pantry.find(x => x.id == id);
        const input = document.getElementById(`qty-${id}`);
        const qty = parseFloat(input.value);
        
        if(!qty || qty <= 0) return ui.toast("Quantità non valida", "error");
        
        // CONTROLLO SCORTA
        if(qty > item.quantita) {
            return ui.toast(`Massimo disponibile: ${item.quantita} ${item.unita}`, "error");
        }
        
        const exists = state.cart.find(x => x.id == id);
        // Calcola totale nel carrello per questo item per evitare workaround
        const currentInCart = exists ? exists.qty : 0;
        
        if (currentInCart + qty > item.quantita) {
             return ui.toast(`Superi la disponibilità!`, "error");
        }

        if(exists) exists.qty += qty;
        else state.cart.push({ id, name: item.nome, qty, unit: item.unita });
        
        input.value = '';
        this.render();
        ui.toast("Aggiunto al consumo", "success");
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
    },
    
    // VISUALIZZAZIONE LISTA RICETTE (Card migliorate)
    renderList() {
        const term = document.getElementById('recipe-search') ? document.getElementById('recipe-search').value.toLowerCase() : '';
        const el = document.getElementById('recipes-list');
        if(!el) return;

        const filtered = state.recipes.filter(r => r.nome.toLowerCase().includes(term));

        if(filtered.length === 0) {
            el.innerHTML = `<div class="col-span-full text-center py-10 text-gray-400 italic">Nessuna ricetta trovata.</div>`;
            return;
        }

        el.innerHTML = filtered.map(r => {
            // Usa il campo 'note' per le porzioni se non c'è una colonna dedicata, o una logica fallback
            // Nota: Se hai aggiunto la colonna 'porzioni' al DB, usa r.porzioni. 
            // Qui simulo l'uso di un campo 'porzioni' o un default.
            const portions = r.porzioni || 4; // Default 4 se manca

            return `
            <div class="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-lg transition flex flex-col overflow-hidden relative group">
                <div class="h-2 bg-red-500 w-full"></div>
                <div class="p-4 flex-grow">
                    <div class="flex justify-between items-start mb-2">
                        <h3 class="font-extrabold text-gray-800 text-lg leading-tight group-hover:text-red-700 transition">${r.nome}</h3>
                        <span class="bg-red-100 text-red-800 text-xs font-bold px-2 py-1 rounded-full border border-red-200 shadow-sm whitespace-nowrap">
                            👥 x${portions}
                        </span>
                    </div>
                    
                    <div class="bg-gray-50 rounded-lg p-2 border border-gray-100 mt-3">
                        <div class="text-[10px] font-bold text-gray-400 uppercase mb-1 tracking-wider">Ingredienti necessari</div>
                        <div class="flex flex-wrap gap-1">
                            ${r.ingredienti_ricetta.map(i => `
                                <span class="text-xs bg-white border border-gray-200 px-2 py-1 rounded text-gray-700 shadow-sm flex items-center gap-1">
                                    <b>${i.quantita_necessaria}</b><small>${i.unita}</small> ${i.nome_ingrediente}
                                </span>
                            `).join('')}
                        </div>
                    </div>
                </div>
            </div>`;
        }).join('');
    },

    // APERTURA MODALE E SELETTORE
    openModal() { 
        this.tempIng = []; 
        document.getElementById('new-recipe-name').value = '';
        document.getElementById('new-recipe-portions').value = ''; // Reset porzioni
        this.renderSelector();
        this.renderSelected();
        ui.modal('modal-recipe'); 
    },

    // Renderizza la GRIGLIA di ingredienti nel modale (stile armadio)
    renderSelector() {
        const term = document.getElementById('recipe-ing-search').value.toLowerCase();
        const container = document.getElementById('recipe-ing-grid');
        
        let matches = state.pantry.filter(p => p.nome.toLowerCase().includes(term));
        
        container.innerHTML = matches.map(p => {
            const isSelected = this.tempIng.some(x => x.nome === p.nome);
            const style = isSelected ? 'border-red-500 bg-red-50 ring-1 ring-red-200' : 'border-gray-200 bg-white hover:border-red-300';
            
            return `
            <div onclick="recipes.toggleIng('${p.nome}', '${p.unita}')" class="cursor-pointer rounded-lg border ${style} p-2 flex flex-col justify-between transition h-20 relative select-none">
                <div class="font-bold text-xs text-gray-800 leading-tight line-clamp-2">${p.nome}</div>
                <div class="text-[10px] text-gray-400 text-right">${p.unita}</div>
                ${isSelected ? '<div class="absolute top-1 right-1 text-red-600 font-bold text-xs">✓</div>' : ''}
            </div>`;
        }).join('');
    },

    filterSelector() {
        this.renderSelector();
    },

    toggleIng(nome, unita) {
        const idx = this.tempIng.findIndex(x => x.nome === nome);
        if (idx > -1) {
            this.tempIng.splice(idx, 1);
        } else {
            // Aggiungi con quantità default 0, poi l'utente la cambia
            this.tempIng.push({ nome, qty: 0, unita }); 
        }
        this.renderSelector(); // Aggiorna stato visivo griglia
        this.renderSelected(); // Aggiorna lista in alto
    },

    // Renderizza le "pillole" in alto con input quantità
    renderSelected() {
        const container = document.getElementById('recipe-selected-list');
        if (this.tempIng.length === 0) {
            container.innerHTML = '<span class="text-xs text-gray-400 italic self-center px-2">Clicca gli ingredienti sotto per aggiungerli...</span>';
            return;
        }

        container.innerHTML = this.tempIng.map((i, idx) => `
            <div class="flex items-center gap-1 bg-red-50 border border-red-200 rounded-lg pl-2 pr-1 py-1 shrink-0 shadow-sm">
                <span class="text-xs font-bold text-red-900">${i.nome}</span>
                <input type="number" step="0.1" value="${i.qty || ''}" placeholder="Qtà" 
                    onchange="recipes.tempIng[${idx}].qty = this.value"
                    class="w-12 p-1 text-center text-xs border rounded outline-none focus:border-red-500 bg-white font-mono">
                <span class="text-[10px] text-gray-500">${i.unita}</span>
                <button onclick="recipes.toggleIng('${i.nome}')" class="text-red-400 hover:text-red-600 font-bold px-1 ml-1">×</button>
            </div>
        `).join('');
    },

    async save() {
        const nome = document.getElementById('new-recipe-name').value;
        const portions = parseInt(document.getElementById('new-recipe-portions').value) || 4; // Default 4
        
        if(!nome || !this.tempIng.length) return ui.toast("Nome o ingredienti mancanti", "error");
        
        // Controllo che le quantità siano state inserite
        if(this.tempIng.some(i => !i.qty || i.qty <= 0)) return ui.toast("Inserisci le dosi per gli ingredienti scelti", "error");

        loader.show();
        
        // 1. Crea Ricetta (Aggiungi campo porzioni se il DB lo supporta, altrimenti lo mettiamo in 'note' o lo ignoriamo per ora)
        // Se non hai la colonna 'porzioni', modifica la query sotto togliendola o aggiungila su Supabase.
        // Qui assumo che tu possa aggiungerla o che esista. Se fallisce, togli 'porzioni'.
        const { data: rec, error } = await _sb.from('ricette').insert([{ nome, porzioni: portions }]).select();
        
        if (error) {
            console.error(error);
            loader.hide();
            return ui.toast("Errore salvataggio (verificare DB)", "error");
        }

        const recId = rec[0].id;

        // 2. Crea Ingredienti
        const ingData = this.tempIng.map(i => ({
            ricetta_id: recId,
            nome_ingrediente: i.nome,
            quantita_necessaria: i.qty,
            unita: i.unita
        }));
        
        await _sb.from('ingredienti_ricetta').insert(ingData);

        loader.hide();
        ui.toast("Ricetta Salvata! 👨‍🍳", "success");
        ui.closeModals();
        this.load();
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
