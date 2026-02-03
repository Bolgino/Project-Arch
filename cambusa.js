// cambusa.js
const MAINTENANCE_MODE = false; // <--- METTI TRUE PER CHIUDERE AL PUBBLICO, FALSE PER APRIRE
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
    restockCart: {}, // MODIFICATO: Oggetto mappa per modifiche rapide
    user: null, 
    currentCategory: 'all' 
};

// --- LOADER ---
const loader = {
    show() { document.getElementById('cambusa-loader').classList.remove('opacity-0', 'pointer-events-none'); },
    hide() { setTimeout(() => document.getElementById('cambusa-loader').classList.add('opacity-0', 'pointer-events-none'), 1000); }
};

// --- APP ---
// --- CODICE NUOVO ---
const app = {
    async init() {
        loader.show();
        await auth.check();
        
        // Attiviamo il realtime
        realtime.init(); 

        await this.loadData();
        loader.hide();
    },

    async loadData() {
        // 1. Carica Dispensa
        const { data: d } = await _sb.from('cambusa').select('*').order('nome');
        state.pantry = d || [];
        
        // 2. Carica Ricette
        await recipes.load();

        // RENDERIZZA SEMPRE LA PARTE PUBBLICA
        this.renderPantry();

        if (state.user) {
            // ADMIN: Carica pannello di controllo
            // PRIMA C'ERA L'ERRORE QUI. ORA CHIAMIAMO SOLO render()
            admin.render();      
        } else {
            // PUBBLICO: Naviga alla dispensa
            this.nav('pantry'); 
        }
    },

    nav(view) {
        // Gestione manutenzione
        if (typeof MAINTENANCE_MODE !== 'undefined' && MAINTENANCE_MODE && !state.user && ['pantry', 'restock-public', 'recipes', 'planner'].includes(view)) {
            document.querySelectorAll('section').forEach(el => el.classList.add('hidden'));
            document.getElementById('view-maintenance').classList.remove('hidden');
            return;
        }

        document.querySelectorAll('section').forEach(el => el.classList.add('hidden'));
        const target = document.getElementById(`view-${view}`);
        if(target) target.classList.remove('hidden');
        
        if(view === 'restock-public' && typeof restock !== 'undefined') restock.init();
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

    renderFilters() {
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
        this.renderFilters();
        const myProds = JSON.parse(localStorage.getItem('azimut_my_products') || '[]');

        document.getElementById('pantry-grid').innerHTML = state.pantry.map(item => {
            const isOut = item.quantita <= 0;
            const isPending = item.stato === 'pending';
            const isMine = myProds.includes(item.id);

            let isExpiring = false;
            let daysToExpiry = null;
            if (item.scadenza) {
                const diffTime = new Date(item.scadenza) - new Date();
                daysToExpiry = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                isExpiring = daysToExpiry <= 12 && daysToExpiry >= 0;
            }
            
            let badge = '';
            let borderClass = 'border-orange-100';
            let overlayClass = '';
            let actionButtons = '';
            
            if (isPending) {
                if (isMine) {
                    badge = '<span class="absolute top-0 right-0 bg-yellow-100 text-yellow-800 text-[9px] px-2 py-1 rounded-bl-lg font-bold shadow z-10 border border-yellow-300">IN ATTESA (TUO) ✏️</span>';
                    borderClass = 'border-yellow-400 bg-yellow-50/50';
                    actionButtons = `<button onclick="restock.openEditPending('${item.id}')" class="w-full bg-yellow-400 text-yellow-900 font-bold py-2 rounded text-xs hover:bg-yellow-500 shadow-sm">MODIFICA RICHIESTA</button>`;
                } else {
                    badge = '<span class="absolute top-0 right-0 bg-gray-200 text-gray-600 text-[9px] px-2 py-1 rounded-bl-lg font-bold shadow z-10">IN APPROVAZIONE ⏳</span>';
                    borderClass = 'border-gray-200 bg-gray-50';
                    overlayClass = 'opacity-50 pointer-events-none grayscale-[0.8]';
                }
            } else if (isOut) {
                badge = '<span class="absolute top-2 right-2 bg-gray-800 text-white text-[10px] px-2 py-0.5 rounded font-bold shadow">ESAURITO 🚫</span>';
                borderClass = 'border-gray-300 bg-gray-50 opacity-75';
                actionButtons = `<input type="number" disabled class="w-14 p-2 text-center border rounded bg-gray-100 text-sm"><button disabled class="flex-1 bg-gray-200 text-gray-400 font-bold py-2 rounded text-xs">USA</button>`;
            } else {
                if(isExpiring) {
                    badge = `<span class="absolute top-2 right-2 bg-red-600 text-white text-[10px] px-2 py-0.5 rounded font-bold shadow animate-pulse">SCADE TRA ${daysToExpiry} GG ⏳</span>`;
                    borderClass = 'border-red-400 bg-red-50';
                }
                actionButtons = `<input type="number" step="0.5" min="0" max="${item.quantita}" id="qty-${item.id}" placeholder="0" class="w-14 p-2 text-center border rounded bg-gray-50 text-sm font-bold outline-none focus:border-orange-500"><button onclick="cart.add('${item.id}')" class="flex-1 bg-orange-100 text-orange-800 hover:bg-orange-200 font-bold py-2 rounded text-xs transition">USA</button>`;
            }

            return `
            <div class="rounded-xl shadow-sm border ${borderClass} overflow-hidden hover:shadow-md transition flex flex-col relative group bg-white min-h-[140px]" data-category="${item.categoria}">
                ${badge}
                <div class="p-3 flex flex-col flex-grow ${overlayClass}">
                    <div class="text-[9px] font-bold uppercase text-gray-400 mb-1 tracking-wider">${item.categoria}</div>
                    <h4 class="font-bold text-gray-800 leading-tight mb-2 text-md line-clamp-2">${item.nome}</h4>
                    <div class="mt-auto">
                        <p class="text-xs text-gray-500 mb-1 font-mono flex justify-between items-center">
                            <span>Disp:</span> 
                            <span class="font-bold ${isOut ? 'text-red-600' : 'text-orange-700'} text-lg">${item.quantita} <span class="text-xs">${item.unita}</span></span>
                        </p>
                        ${item.scadenza ? `<p class="text-[10px] text-gray-400 mb-2 italic">Scade il: ${new Date(item.scadenza).toLocaleDateString()}</p>` : ''}
                        <div class="flex gap-1 mt-1">${actionButtons}</div>
                    </div>
                </div>
            </div>`;
        }).join('');
        
        this.filterPantry();
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
// --- RIFORNIMENTO (LISTA RAPIDA) ---
const restock = {
    init() {
        state.restockCart = {}; 
        const searchInput = document.getElementById('restock-search');
        if(searchInput) searchInput.value = '';
        this.renderList();
    },

    // --- Cerca la funzione renderList dentro l'oggetto recipes ---

    renderList() {
        const term = document.getElementById('recipe-search') ? document.getElementById('recipe-search').value.toLowerCase() : '';
        const el = document.getElementById('recipes-list');
        if(!el) return;

        const myRecipes = JSON.parse(localStorage.getItem('azimut_my_recipes') || '[]');
        const isAdmin = state.user !== null;

        const filtered = state.recipes.filter(r => r.nome.toLowerCase().includes(term));

        if(filtered.length === 0) {
            el.innerHTML = `<div class="col-span-full text-center py-10 text-gray-400 italic">Nessuna ricetta trovata.</div>`;
            return;
        }

        el.innerHTML = filtered.map(r => {
            const portions = r.porzioni || 4; 
            const isMyRecipe = myRecipes.includes(r.id);
            const isPending = !r.status || r.status !== 'approved'; 

            // NUOVA LOGICA PERMESSI (Richiesta Utente):
            // Modifica: TUTTI possono modificare sempre (canEdit = true).
            // Elimina: Solo Admin SEMPRE, oppure Creatore SOLO se è pending.
            
            const canEdit = true; 
            const canDelete = isAdmin || (isMyRecipe && isPending);
            
            const statusBadge = isPending 
                ? `<span class="bg-yellow-100 text-yellow-800 text-[9px] font-bold px-2 py-1 rounded ml-2 border border-yellow-200 uppercase">⏳ In Approvazione</span>` 
                : ``; 

            return `
            <div class="bg-white rounded-xl border ${isPending ? 'border-yellow-300' : 'border-gray-200'} shadow-sm hover:shadow-lg transition flex flex-col overflow-hidden relative group">
                <div class="h-2 ${isPending ? 'bg-yellow-400' : 'bg-red-500'} w-full"></div>
                
                <div class="absolute top-2 right-2 z-10 flex gap-1">
                    ${canDelete ? `
                    <button onclick="recipes.delete('${r.id}')" class="bg-white text-gray-400 hover:text-red-600 border border-gray-200 p-1.5 rounded-full shadow-sm transition">🗑</button>
                    ` : ''}
                    
                    <button onclick="recipes.openModal('${r.id}')" class="bg-white text-red-600 hover:text-white hover:bg-red-600 border border-red-200 p-1.5 rounded-full shadow-sm transition">✏️</button>
                </div>

                <div class="p-4 flex-grow">
                    <div class="flex flex-wrap items-center mb-2 pr-14"> 
                        <h3 class="font-extrabold text-gray-800 text-lg leading-tight">${r.nome}</h3>
                        ${statusBadge}
                    </div>
                    
                    <span class="inline-block bg-red-50 text-red-800 text-[10px] font-bold px-2 py-0.5 rounded border border-red-100 mb-3">
                        👥 Per ${portions} persone
                    </span>
                    
                    <div class="bg-gray-50 rounded-lg p-3 border border-gray-100">
                        <div class="text-[9px] font-bold text-gray-400 uppercase mb-2 tracking-wider">Ingredienti</div>
                        <ul class="text-sm text-gray-600 space-y-1">
                            ${r.ingredienti_ricetta.map(i => `
                                <li class="flex justify-between border-b border-gray-100 last:border-0 pb-1 last:pb-0">
                                    <span>${i.nome_ingrediente}</span>
                                    <span class="font-bold text-gray-800">${i.quantita_necessaria} <small>${i.unita}</small></span>
                                </li>
                            `).join('')}
                        </ul>
                    </div>
                </div>
            </div>`;
        }).join('');
    },

    trackChange(id, field, value) {
        if (!state.restockCart[id]) state.restockCart[id] = { addQty: '', newExpiry: '' };
        state.restockCart[id][field] = value;
    },

    submitUpdates() {
        const updatesIDs = Object.keys(state.restockCart).filter(id => {
            const m = state.restockCart[id];
            return (m.addQty !== '' && parseFloat(m.addQty) > 0) || (m.newExpiry !== '' && m.newExpiry !== state.pantry.find(x=>x.id==id)?.scadenza);
        });

        if (updatesIDs.length === 0) return ui.toast("Nessuna modifica inserita", "error");

        const listHTML = updatesIDs.map(id => {
            const item = state.pantry.find(p => p.id == id);
            const mod = state.restockCart[id];
            let details = '';
            if (mod.addQty && parseFloat(mod.addQty) > 0) details += `<span class="text-green-600 font-bold">+${mod.addQty} ${item.unita}</span>`;
            if (mod.newExpiry) details += `<div class="text-[10px] text-gray-500 mt-1">Scad: ${mod.newExpiry}</div>`;
            return `<div class="flex justify-between items-center bg-white p-3 rounded border border-gray-100 shadow-sm"><span class="font-bold text-gray-700">${item.nome}</span><div class="text-right leading-tight">${details}</div></div>`;
        }).join('');

        document.getElementById('restock-confirm-list').innerHTML = listHTML;
        ui.modal('modal-restock-summary');
    },

    async confirmUpload() {
        loader.show();
        let successCount = 0;
        const updatesIDs = Object.keys(state.restockCart).filter(id => {
            const m = state.restockCart[id];
            return (m.addQty !== '' && parseFloat(m.addQty) > 0) || m.newExpiry !== '';
        });

        try {
            for (const id of updatesIDs) {
                const mod = state.restockCart[id];
                const original = state.pantry.find(p => p.id == id);
                const payload = {};
                if (mod.addQty && parseFloat(mod.addQty) > 0) payload.quantita = original.quantita + parseFloat(mod.addQty);
                if (mod.newExpiry) payload.scadenza = mod.newExpiry;

                if (Object.keys(payload).length > 0) {
                    const { error } = await _sb.from('cambusa').update(payload).eq('id', id);
                    if (!error) successCount++;
                }
            }
            ui.toast(`Salvato! ${successCount} prodotti aggiornati.`, "success");
            state.restockCart = {}; 
            ui.closeModals();
            await app.loadData();
            this.renderList();
        } catch (e) {
            ui.toast("Errore salvataggio", "error");
        }
        loader.hide();
    },

    // Funzioni per aggiungere nuovi prodotti (RIPRISTINATE PER TABELLA CAMBUSA)
    async addNewProduct() {
        const nome = document.getElementById('new-prod-name').value.trim();
        const cat = document.getElementById('new-prod-cat').value;
        const unita = document.getElementById('new-prod-unit').value;
        const qta = parseFloat(document.getElementById('new-prod-qty').value);
        const scadenza = document.getElementById('new-prod-expiry').value;

        if (!nome || !qta || !scadenza) return ui.toast("Compila tutti i campi", "error");

        loader.show();
        // Usa la tabella 'cambusa' con stato 'pending' come avevi in origine
        const { data, error } = await _sb.from('cambusa').insert([{
            nome: nome, categoria: cat, quantita: qta, unita: unita, scadenza: scadenza, stato: 'pending'
        }]).select();

        if (error) {
             ui.toast("Errore inserimento", "error");
        } else {
             // Salva nel local storage per sapere che è mio
             const newId = data[0].id;
             const myProds = JSON.parse(localStorage.getItem('azimut_my_products') || '[]');
             myProds.push(newId);
             localStorage.setItem('azimut_my_products', JSON.stringify(myProds));

             ui.toast("Richiesta inviata!", "success");
             ui.closeModals();
             
             document.getElementById('new-prod-name').value = '';
             document.getElementById('new-prod-qty').value = '';
             document.getElementById('new-prod-expiry').value = '';

             await app.loadData();
        }
        loader.hide();
    },

    openEditPending(id) {
        const item = state.pantry.find(x => x.id == id);
        if(!item) return;
        document.getElementById('pend-edit-id').value = id;
        document.getElementById('pend-edit-name').value = item.nome;
        document.getElementById('pend-edit-qty').value = item.quantita;
        document.getElementById('pend-edit-date').value = item.scadenza;
        ui.modal('modal-edit-pending');
    },

    async savePendingEdit() {
        const id = document.getElementById('pend-edit-id').value;
        const updates = {
            nome: document.getElementById('pend-edit-name').value,
            quantita: parseFloat(document.getElementById('pend-edit-qty').value),
            scadenza: document.getElementById('pend-edit-date').value
        };
        
        loader.show();
        await _sb.from('cambusa').update(updates).eq('id', id);
        ui.toast("Aggiornato!", "success");
        ui.closeModals();
        await app.loadData();
        loader.hide();
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
const recipes = {
    tempIng: [], 

    async load() {
        const { data } = await _sb.from('ricette').select('*, ingredienti_ricetta(*)');
        state.recipes = data || [];
        this.renderList();
        
        const sel = document.getElementById('planner-recipe-select');
        if(sel) sel.innerHTML = '<option value="">Seleziona Ricetta...</option>' + state.recipes.map(r => `<option value="${r.id}">${r.nome}</option>`).join('');
    },
    
    renderList() {
        const term = document.getElementById('recipe-search') ? document.getElementById('recipe-search').value.toLowerCase() : '';
        const el = document.getElementById('recipes-list');
        if(!el) return;

        const myRecipes = JSON.parse(localStorage.getItem('azimut_my_recipes') || '[]');
        const isAdmin = state.user !== null;

        const filtered = state.recipes.filter(r => r.nome.toLowerCase().includes(term));

        if(filtered.length === 0) {
            el.innerHTML = `<div class="col-span-full text-center py-10 text-gray-400 italic">Nessuna ricetta trovata.</div>`;
            return;
        }

        el.innerHTML = filtered.map(r => {
            const portions = r.porzioni || 4; 
            const isMyRecipe = myRecipes.includes(r.id);
            // Se non c'è status o è diverso da approved, è pending
            const isPending = !r.status || r.status !== 'approved'; 

            // LOGICA PERMESSI AGGIORNATA
            // Admin: Sempre TRUE.
            // Utente Pubblico: SOLO se è sua (isMyRecipe) E se NON è ancora approvata (isPending).
            const canEdit = isAdmin || (isMyRecipe && isPending);
            
            // Badge visibile a tutti se pending
            const statusBadge = isPending 
                ? `<span class="bg-yellow-100 text-yellow-800 text-[9px] font-bold px-2 py-1 rounded ml-2 border border-yellow-200 uppercase">⏳ In Approvazione</span>` 
                : ``; 

            return `
            <div class="bg-white rounded-xl border ${isPending ? 'border-yellow-300' : 'border-gray-200'} shadow-sm hover:shadow-lg transition flex flex-col overflow-hidden relative group">
                <div class="h-2 ${isPending ? 'bg-yellow-400' : 'bg-red-500'} w-full"></div>
                
                ${canEdit ? `
                <div class="absolute top-2 right-2 z-10 flex gap-1">
                    <button onclick="recipes.delete('${r.id}')" class="bg-white text-gray-400 hover:text-red-600 border border-gray-200 p-1.5 rounded-full shadow-sm transition">🗑</button>
                    <button onclick="recipes.openModal('${r.id}')" class="bg-white text-red-600 hover:text-white hover:bg-red-600 border border-red-200 p-1.5 rounded-full shadow-sm transition">✏️</button>
                </div>` : ''}

                <div class="p-4 flex-grow">
                    <div class="flex flex-wrap items-center mb-2 pr-14"> 
                        <h3 class="font-extrabold text-gray-800 text-lg leading-tight">${r.nome}</h3>
                        ${statusBadge}
                    </div>
                    
                    <span class="inline-block bg-red-50 text-red-800 text-[10px] font-bold px-2 py-0.5 rounded border border-red-100 mb-3">
                        👥 Per ${portions} persone
                    </span>
                    
                    <div class="bg-gray-50 rounded-lg p-3 border border-gray-100">
                        <div class="text-[9px] font-bold text-gray-400 uppercase mb-2 tracking-wider">Ingredienti</div>
                        <ul class="text-sm text-gray-600 space-y-1">
                            ${r.ingredienti_ricetta.map(i => `
                                <li class="flex justify-between border-b border-gray-100 last:border-0 pb-1 last:pb-0">
                                    <span>${i.nome_ingrediente}</span>
                                    <span class="font-bold text-gray-800">${i.quantita_necessaria} <small>${i.unita}</small></span>
                                </li>
                            `).join('')}
                        </ul>
                    </div>
                </div>
            </div>`;
        }).join('');
    },

    openModal(editId = null) { 
        this.tempIng = []; 
        document.getElementById('recipe-id').value = '';
        document.getElementById('new-recipe-name').value = '';
        document.getElementById('new-recipe-portions').value = ''; 
        document.getElementById('ing-input-name').value = '';
        document.getElementById('ing-input-qty').value = '';
        
        const delBtn = document.getElementById('btn-del-recipe');
        if(delBtn) delBtn.classList.add('hidden');

        if (editId) {
            const r = state.recipes.find(x => x.id === editId);
            if(r) {
                document.getElementById('recipe-id').value = r.id;
                document.getElementById('new-recipe-name').value = r.nome;
                document.getElementById('new-recipe-portions').value = r.porzioni;
                
                this.tempIng = r.ingredienti_ricetta.map(i => ({
                    nome: i.nome_ingrediente, qty: i.quantita_necessaria, unita: i.unita
                }));
            }
        }
        this.renderIngList();
        ui.modal('modal-recipe'); 
    },

    addIngFromInput() {
        const name = document.getElementById('ing-input-name').value.trim();
        const qty = parseFloat(document.getElementById('ing-input-qty').value);
        const unit = document.getElementById('ing-input-unit').value;
        if (!name) return ui.toast("Nome mancante", "error");
        if (!qty || qty <= 0) return ui.toast("Qtà errata", "error");
        this.tempIng.push({ nome: name, qty: qty, unita: unit });
        document.getElementById('ing-input-name').value = '';
        document.getElementById('ing-input-qty').value = '';
        document.getElementById('ing-input-name').focus();
        this.renderIngList();
    },

    removeIng(idx) {
        this.tempIng.splice(idx, 1);
        this.renderIngList();
    },

    renderIngList() {
        const list = document.getElementById('recipe-ing-list');
        if (this.tempIng.length === 0) {
            list.innerHTML = '<div class="text-center text-gray-400 italic text-xs mt-4">Nessun ingrediente.</div>';
            return;
        }
        list.innerHTML = this.tempIng.map((ing, idx) => `
            <div class="flex justify-between items-center bg-white border border-gray-200 p-2 rounded shadow-sm">
                <div class="font-bold text-gray-700 text-sm">${ing.nome}</div>
                <div class="flex items-center gap-3">
                    <span class="text-xs bg-gray-100 px-2 py-1 rounded font-mono font-bold">${ing.qty} ${ing.unita}</span>
                    <button onclick="recipes.removeIng(${idx})" class="text-red-400 hover:text-red-600 font-bold px-1">✕</button>
                </div>
            </div>
        `).join('');
    },

    async save() {
        const id = document.getElementById('recipe-id').value;
        const nome = document.getElementById('new-recipe-name').value;
        const portions = parseInt(document.getElementById('new-recipe-portions').value) || 4;
        
        if(!nome || !this.tempIng.length) return ui.toast("Dati mancanti", "error");

        loader.show();
        let recipeId = id;
        
        const isAdmin = state.user !== null;
        let statusToSet = 'pending'; 

        if (isAdmin) {
            statusToSet = 'approved'; 
        } else if (id) {
             const existing = state.recipes.find(r => r.id === id);
             statusToSet = existing ? existing.status : 'pending';
        }

        const recipeData = { nome: nome, porzioni: portions, status: statusToSet };
        
        if (id) {
            const { error } = await _sb.from('ricette').update(recipeData).eq('id', id);
            if(error) { loader.hide(); return ui.toast("Errore update", "error"); }
            await _sb.from('ingredienti_ricetta').delete().eq('ricetta_id', id);
        } else {
            const { data, error } = await _sb.from('ricette').insert([recipeData]).select();
            if(error) { loader.hide(); return ui.toast("Errore insert", "error"); }
            recipeId = data[0].id;
            
            const myRecipes = JSON.parse(localStorage.getItem('azimut_my_recipes') || '[]');
            myRecipes.push(recipeId);
            localStorage.setItem('azimut_my_recipes', JSON.stringify(myRecipes));
        }

        const ingData = this.tempIng.map(i => ({
            ricetta_id: recipeId, nome_ingrediente: i.nome, quantita_necessaria: i.qty, unita: i.unita
        }));
        
        if (ingData.length > 0) await _sb.from('ingredienti_ricetta').insert(ingData);

        await this.load(); // Reload completo per sicurezza
        if(state.user) admin.renderRecipes();

        loader.hide();
        ui.toast("Salvato!", "success");
        ui.closeModals();
    },

    async delete(idIn = null) {
        const id = idIn || document.getElementById('recipe-id').value;
        if(!id || !confirm("Eliminare?")) return;

        loader.show();
        await _sb.from('ingredienti_ricetta').delete().eq('ricetta_id', id);
        await _sb.from('ricette').delete().eq('id', id);

        let myRecipes = JSON.parse(localStorage.getItem('azimut_my_recipes') || '[]');
        myRecipes = myRecipes.filter(x => x !== id);
        localStorage.setItem('azimut_my_recipes', JSON.stringify(myRecipes));

        await this.load();
        if(state.user) admin.renderRecipes();
        loader.hide();
        ui.toast("Eliminata", "success");
        ui.closeModals();
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
// --- NUOVO OGGETTO PER LA SINCRONIZZAZIONE ---
const realtime = {
    init() {
        // Ascolta i cambiamenti su tutte le tabelle importanti
        _sb.channel('db-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'cambusa' }, () => {
                app.loadData(); // Ricarica dispensa e liste
                if(typeof restock !== 'undefined') restock.renderList();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'ricette' }, () => {
                recipes.load(); // Ricarica ricette
                if(state.user) admin.renderRecipes(); // Aggiorna tabella admin se aperta
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'richieste_cambusa' }, () => {
                if(state.user) admin.renderRequests(); // Aggiorna richieste admin
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'ingredienti_ricetta' }, () => {
                recipes.load(); // Se cambiano gli ingredienti, ricarica le ricette
            })
            .subscribe();
            
        console.log("📡 Sincronizzazione attiva");
    }
};
// --- ADMIN ---
// --- SOSTITUISCI INTERO OGGETTO admin IN cambusa.js ---

const admin = {
    async render() {
        if (!state.user) return;
        
        // Apre la tab "approvals" (Richieste) come default
        this.tab('approvals');
    },

    // Funzione Tab corretta per il tuo MENU LATERALE
    tab(name) {
        // 1. Nascondi tutte le tab che hanno classe 'admin-tab'
        document.querySelectorAll('.admin-tab').forEach(el => el.classList.add('hidden'));
        
        // 2. Mostra quella richiesta (es. admin-tab-recipes)
        const target = document.getElementById(`admin-tab-${name}`);
        if(target) target.classList.remove('hidden');

        // 3. Carica i dati specifici
        if (name === 'recipes') this.renderRecipes();
        if (name === 'approvals') this.renderRequests();
        if (name === 'stock') this.filterStock(); // O renderStock se presente
        if (name === 'movements') this.renderMovements(); // Se hai questa funzione
    },

    async renderRequests() {
        const { data } = await _sb.from('richieste_cambusa').select('*').order('created_at', { ascending: false });
        const el = document.getElementById('admin-approval-list');
        if(!el) return;
        
        if(!data || !data.length) { el.innerHTML = '<p class="text-gray-400 text-sm italic">Nessuna richiesta pending.</p>'; return; }

        el.innerHTML = data.map(r => `
            <div class="bg-white p-3 rounded border-l-4 border-yellow-400 shadow-sm flex justify-between items-center mb-2">
                <div>
                    <div class="font-bold text-gray-800">${r.prodotto}</div>
                    <div class="text-xs text-gray-500">Richiesto da: ${r.richiedente || 'Anonimo'}</div>
                    <div class="text-xs font-mono bg-gray-100 inline-block px-1 rounded mt-1">Qt: ${r.quantita}</div>
                </div>
                <div class="flex gap-2">
                    <button onclick="admin.processReq('${r.id}', false)" class="text-red-500 hover:bg-red-50 p-2 rounded">✗</button>
                    <button onclick="admin.processReq('${r.id}', true)" class="text-green-600 hover:bg-green-50 p-2 rounded">✓</button>
                </div>
            </div>
        `).join('');
    },

    async processReq(id, approved) {
        loader.show();
        if(approved) {
            const { data: req } = await _sb.from('richieste_cambusa').select('*').eq('id', id).single();
            if(req) {
                const { data: exist } = await _sb.from('cambusa').select('*').ilike('nome', req.prodotto).single();
                if(exist) {
                    await _sb.from('cambusa').update({ quantita: exist.quantita + req.quantita }).eq('id', exist.id);
                } else {
                    await _sb.from('cambusa').insert([{ nome: req.prodotto, quantita: req.quantita, unita: 'pz', categoria: 'altro' }]);
                }
            }
        }
        await _sb.from('richieste_cambusa').delete().eq('id', id);
        loader.hide();
        ui.toast(approved ? "Richiesta Approvata" : "Richiesta Rifiutata", approved ? "success" : "error");
        this.renderRequests();
        app.loadData();
    },

    // --- NUOVA GESTIONE RICETTE ADMIN ---
    renderRecipes() {
        const el = document.getElementById('admin-recipes-list');
        if(!el) return;

        // Ordiniamo: prima le pending, poi le altre
        const sorted = [...state.recipes].sort((a,b) => (a.status === 'approved' ? 1 : -1));

        if(!sorted.length) { el.innerHTML = '<p class="text-gray-400 italic">Nessuna ricetta.</p>'; return; }

        el.innerHTML = `
        <table class="w-full text-left text-sm text-gray-600">
            <thead class="text-xs text-red-200 uppercase bg-red-900/80 text-white rounded-t-lg">
                <tr>
                    <th class="p-3 rounded-tl-lg">Ricetta</th>
                    <th class="p-3 text-center">Stato</th>
                    <th class="p-3 text-right rounded-tr-lg">Azioni</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 bg-white border border-gray-100">
                ${sorted.map(r => `
                <tr class="hover:bg-red-50 transition">
                    <td class="p-3 font-bold text-gray-800">
                        ${r.nome}
                        <div class="text-[10px] text-gray-400 font-normal">${r.porzioni} Persone</div>
                    </td>
                    <td class="p-3 text-center">
                        ${r.status === 'approved' 
                            ? '<span class="text-green-600 bg-green-100 px-2 py-1 rounded text-[10px] font-bold border border-green-200">PUBBLICA</span>' 
                            : `<button onclick="admin.approveRecipe('${r.id}')" class="text-white bg-yellow-500 hover:bg-yellow-600 px-2 py-1 rounded text-[10px] font-bold shadow animate-pulse">APPROVA ORA</button>`}
                    </td>
                    <td class="p-3 text-right">
                         <div class="flex justify-end gap-2">
                            <button onclick="recipes.openModal('${r.id}')" class="text-blue-500 hover:text-white hover:bg-blue-500 p-1.5 rounded transition" title="Modifica">✏️</button>
                            <button onclick="recipes.delete('${r.id}')" class="text-red-500 hover:text-white hover:bg-red-500 p-1.5 rounded transition" title="Elimina">🗑</button>
                         </div>
                    </td>
                </tr>
                `).join('')}
            </tbody>
        </table>`;
    },

    // Dentro l'oggetto admin...

    async approveRecipe(id) {
        if(!confirm("Confermi l'approvazione? La ricetta diventerà pubblica.")) return;
        
        loader.show();
        // 1. Aggiorna il DB
        const { error } = await _sb.from('ricette').update({ status: 'approved' }).eq('id', id);
        
        if(error) {
            loader.hide();
            ui.toast("Errore Approvazione", "error");
        } else {
            ui.toast("Ricetta Pubblicata!", "success");
            
            // 2. FORZA IL RICARICAMENTO DEI DATI
            await recipes.load(); // Ricarica dal server
            this.renderRecipes(); // Ridisegna la tabella Admin
            
            loader.hide();
        }
    },// Dentro l'oggetto admin...

    async approveRecipe(id) {
        if(!confirm("Confermi l'approvazione? La ricetta diventerà pubblica.")) return;
        
        loader.show();
        // 1. Aggiorna il DB
        const { error } = await _sb.from('ricette').update({ status: 'approved' }).eq('id', id);
        
        if(error) {
            loader.hide();
            ui.toast("Errore Approvazione", "error");
        } else {
            ui.toast("Ricetta Pubblicata!", "success");
            
            // 2. FORZA IL RICARICAMENTO DEI DATI
            await recipes.load(); // Ricarica dal server
            this.renderRecipes(); // Ridisegna la tabella Admin
            
            loader.hide();
        }
    },
    
    // Funzioni placeholder se nel tuo HTML ci sono ancora riferimenti
    filterStock() { /* Logica filtro stock se serve */ },
    renderMovements() { /* Logica movimenti se serve */ }
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
            document.getElementById('btn-login-mobile').classList.add('hidden');
            
            // LOGICA VISIBILITÀ LINK PUBBLICI PER ADMIN
            if (typeof MAINTENANCE_MODE !== 'undefined' && MAINTENANCE_MODE === true) {
                // In manutenzione: Admin vede ANCHE i link pubblici per testare
                document.getElementById('nav-public-links').classList.remove('hidden');
            } else {
                // Operativo normale: Admin vede SOLO Admin (i link pubblici sono nascosti per pulizia)
                document.getElementById('nav-public-links').classList.add('hidden'); 
            }

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
        // Rimuove eventuali toast precedenti
        const old = document.getElementById('toast-container');
        if(old) old.remove();

        // Contenitore Flex a larghezza piena per garantire la centratura
        const container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'fixed bottom-10 inset-x-0 flex justify-center z-[300] pointer-events-none';
        
        const t = document.createElement('div');
        // Il toast vero e proprio
        t.className = `px-6 py-3 rounded-full shadow-2xl text-white text-sm font-bold animate-bounce pointer-events-auto ${type === 'error' ? 'bg-red-500' : 'bg-orange-800'}`;
        t.innerText = msg;
        
        container.appendChild(t);
        document.body.appendChild(container);
        
        setTimeout(() => container.remove(), 3000);
    },
};
app.init();
