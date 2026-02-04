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
        // Standardizzazione Categorie: pasti, colazione, merenda, condimenti, extra
        const cats = ['all', 'colazione', 'merenda', 'pasti', 'condimenti', 'extra'];
        const labels = { 
            all: 'Tutto', 
            colazione: '☕ Colazione', 
            merenda: '🍫 Merenda', 
            pasti: '🍝 Pasti', 
            condimenti: '🧂 Condimenti', 
            extra: '🧻 Extra' 
        };
        
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
                    actionButtons = `
                    <div class="flex gap-1 w-full">
                        <button onclick="restock.openEditPending('${item.id}')" class="flex-grow bg-yellow-400 text-yellow-900 font-bold py-2 rounded text-xs hover:bg-yellow-500 shadow-sm">MODIFICA</button>
                        <button onclick="restock.deletePending('${item.id}')" class="bg-red-500 text-white font-bold px-3 py-2 rounded text-xs hover:bg-red-600 shadow-sm">🗑</button>
                    </div>`;
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
        // Registrazione su 'movimenti_cambusa' per ogni item
        const userLabel = state.user ? 'Admin' : (note || 'Utente');

        for (let c of state.cart) {
            const item = state.pantry.find(x => x.id === c.id);
            if(item) {
                // 1. Aggiorna quantità
                const newQ = item.quantita - c.qty;
                await _sb.from('cambusa').update({ quantita: newQ }).eq('id', c.id);
                
                // 2. Registra movimento singolo
                await _sb.from('movimenti_cambusa').insert([{
                    prodotto: item.nome,
                    quantita: -Math.abs(c.qty), // Negativo perché è un consumo
                    unita: item.unita,
                    azione: 'scarico', // o 'consumo'
                    utente: userLabel
                }]);
            }
        }

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

    renderList() {
        const term = document.getElementById('restock-search') ? document.getElementById('restock-search').value.toLowerCase() : '';
        const el = document.getElementById('restock-full-list');
        if(!el) return;

        // Filtra la dispensa (pantry), non le ricette!
        const filtered = state.pantry.filter(p => p.nome.toLowerCase().includes(term));

        if(filtered.length === 0) {
            el.innerHTML = `<div class="text-center py-10 text-gray-400 italic">Nessun prodotto trovato.</div>`;
            return;
        }

        el.innerHTML = filtered.map(p => {
            return `
            <div class="bg-white rounded-xl p-3 border border-orange-100 shadow-sm flex flex-col gap-2">
                <div class="flex justify-between items-start">
                    <div>
                        <div class="font-bold text-gray-800 text-lg leading-tight">${p.nome}</div>
                        <div class="text-xs text-gray-400 font-mono">Attuali: ${p.quantita} ${p.unita} | Scad: ${p.scadenza ? new Date(p.scadenza).toLocaleDateString() : 'N/A'}</div>
                    </div>
                </div>
                
                <div class="grid grid-cols-2 gap-2 bg-orange-50 p-2 rounded-lg">
                    <div>
                        <label class="text-[9px] font-bold text-orange-800 uppercase">Aggiungi Qtà</label>
                        <input type="number" placeholder="0" class="w-full p-1 text-center border rounded text-sm font-bold outline-none focus:border-orange-500"
                            onchange="restock.trackChange('${p.id}', 'addQty', this.value)">
                    </div>
                    <div>
                        <label class="text-[9px] font-bold text-orange-800 uppercase">Nuova Scadenza</label>
                        <input type="date" class="w-full p-1 border rounded text-xs outline-none focus:border-orange-500 bg-white"
                            onchange="restock.trackChange('${p.id}', 'newExpiry', this.value)">
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
        
        // SE è Admin -> Approvato subito (stato: null o 'approved'), ALTRIMENTI 'pending'
        const initialStatus = state.user ? 'approved' : 'pending';

        const { data, error } = await _sb.from('cambusa').insert([{
            nome: nome, 
            categoria: cat, 
            quantita: qta, 
            unita: unita, 
            scadenza: scadenza, 
            stato: initialStatus
        }]).select();

        if (error) {
             console.error(error);
             ui.toast("Errore inserimento", "error");
        } else {
             // Se è l'utente, salviamo nel local storage
             if(!state.user) {
                 const newId = data[0].id;
                 const myProds = JSON.parse(localStorage.getItem('azimut_my_products') || '[]');
                 myProds.push(newId);
                 localStorage.setItem('azimut_my_products', JSON.stringify(myProds));
             }

             const msg = state.user ? "Prodotto aggiunto!" : "Richiesta inviata!";
             ui.toast(msg, "success");
             ui.closeModals();
             
             // Reset campi
             document.getElementById('new-prod-name').value = '';
             document.getElementById('new-prod-qty').value = '';
             document.getElementById('new-prod-expiry').value = '';

             // Ricarica dati generali
             await app.loadData();
             // FORZA AGGIORNAMENTO LISTA RIFORNIMENTO
             this.renderList(); 
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
    },

    async deletePending(id) {
        if(!confirm("Eliminare questa richiesta in attesa?")) return;
        loader.show();
        
        const { error } = await _sb.from('cambusa').delete().eq('id', id);
        
        if(!error) {
            // Rimuovi anche dal local storage per non vederlo più come "mio"
            let myProds = JSON.parse(localStorage.getItem('azimut_my_products') || '[]');
            myProds = myProds.filter(x => x != id);
            localStorage.setItem('azimut_my_products', JSON.stringify(myProds));
            
            ui.toast("Richiesta eliminata", "success");
            await app.loadData();
        } else {
            ui.toast("Errore eliminazione", "error");
        }
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
// SOSTITUISCI TUTTO L'OGGETTO recipes
const recipes = {
    currentIngredients: [], // Usiamo un unico array per gestire gli ingredienti

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
            const isPending = !r.status || r.status !== 'approved'; 

            const canEdit = true; // Tutti possono modificare
            const canDelete = isAdmin || (isMyRecipe && isPending);
            
            const statusBadge = isPending 
                ? `<span class="bg-yellow-100 text-yellow-800 text-[9px] font-bold px-2 py-1 rounded ml-2 border border-yellow-200 uppercase">⏳ In Approvazione</span>` 
                : ``; 

            return `
            <div class="bg-white rounded-xl border ${isPending ? 'border-yellow-300' : 'border-gray-200'} shadow-sm hover:shadow-lg transition flex flex-col overflow-hidden relative group">
                <div class="h-2 ${isPending ? 'bg-yellow-400' : 'bg-red-500'} w-full"></div>
                
                <div class="absolute top-2 right-2 z-10 flex gap-1">
                    ${canDelete ? `<button onclick="recipes.delete('${r.id}')" class="bg-white text-gray-400 hover:text-red-600 border border-gray-200 p-1.5 rounded-full shadow-sm transition">🗑</button>` : ''}
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
                            ${r.ingredienti_ricetta && r.ingredienti_ricetta.length > 0 ? r.ingredienti_ricetta.map(i => `
                                <li class="flex justify-between border-b border-gray-100 last:border-0 pb-1 last:pb-0">
                                    <span>${i.nome_ingrediente}</span>
                                    <span class="font-bold text-gray-800">${i.quantita_necessaria} <small>${i.unita}</small></span>
                                </li>
                            `).join('') : '<li class="italic text-gray-400 text-xs">Nessun ingrediente</li>'}
                        </ul>
                    </div>
                </div>
            </div>`;
        }).join('');
    },

    openModal(id = null) {
        // Reset campi
        document.getElementById('rec-name').value = '';
        document.getElementById('rec-portions').value = 4;
        document.getElementById('rec-cat').value = 'pasti'; 
        
        // Pulizia input ingredienti
        document.getElementById('new-ing-name').value = '';
        document.getElementById('new-ing-qty').value = '';
        
        this.currentIngredients = [];
        this.editingId = id; 

        if (id && id !== 'undefined' && id !== 'null') {
            const r = state.recipes.find(x => String(x.id) === String(id));
            if (r) {
                document.getElementById('rec-name').value = r.nome;
                document.getElementById('rec-portions').value = r.porzioni || 4;
                document.getElementById('rec-cat').value = r.categoria || 'pasti'; 
                // Clona l'array per evitare modifiche dirette prima del salvataggio
                this.currentIngredients = r.ingredienti_ricetta ? [...r.ingredienti_ricetta] : [];
            }
        }
        this.renderIngredientsList();
        ui.modal('modal-recipe');
    },

    // FUNZIONE CORRETTA CHE CORRISPONDE ALL'HTML (addIngredient)
    addIngredient() {
        const name = document.getElementById('new-ing-name').value.trim(); // ID corretto
        const qty = parseFloat(document.getElementById('new-ing-qty').value); // ID corretto
        const unit = document.getElementById('new-ing-unit').value; // ID corretto
        
        if (!name) return ui.toast("Nome ingrediente mancante", "error");
        if (!qty || qty <= 0) return ui.toast("Quantità errata", "error");
        
        // Aggiunge all'array corrente
        this.currentIngredients.push({ 
            nome_ingrediente: name, 
            quantita_necessaria: qty, 
            unita: unit 
        });
        
        // Pulisce input e rimette focus
        document.getElementById('new-ing-name').value = '';
        document.getElementById('new-ing-qty').value = '';
        document.getElementById('new-ing-name').focus();
        
        this.renderIngredientsList();
    },

    // FUNZIONE CORRETTA (removeIngredient)
    removeIngredient(idx) {
        this.currentIngredients.splice(idx, 1);
        this.renderIngredientsList();
    },

    renderIngredientsList() {
        const list = document.getElementById('recipe-ing-list');
        if (!list) return;

        if (this.currentIngredients.length === 0) {
            list.innerHTML = '<div class="text-center text-gray-400 italic text-xs mt-4">Nessun ingrediente inserito.</div>';
            return;
        }
        
        list.innerHTML = this.currentIngredients.map((ing, idx) => `
            <div class="flex justify-between items-center bg-white border border-gray-200 p-2 rounded shadow-sm">
                <div class="font-bold text-gray-700 text-sm">${ing.nome_ingrediente}</div>
                <div class="flex items-center gap-3">
                    <span class="text-xs bg-gray-100 px-2 py-1 rounded font-mono font-bold">${ing.quantita_necessaria} ${ing.unita}</span>
                    <button onclick="recipes.removeIngredient(${idx})" class="text-red-400 hover:text-red-600 font-bold px-1 text-lg">×</button>
                </div>
            </div>
        `).join('');
    },

   async save() {
        const nome = document.getElementById('rec-name').value;
        const porz = parseInt(document.getElementById('rec-portions').value);
        const cat = document.getElementById('rec-cat').value;

        if (!nome || this.currentIngredients.length === 0) return ui.toast("Nome e ingredienti obbligatori", "error");

        loader.show();
        
        // Se è una nuova ricetta creata da utente, salviamo ID in localStorage
        const isNew = !this.editingId;
        
        const payload = {
            nome: nome,
            porzioni: porz,
            categoria: cat,
            ingredienti_ricetta: this.currentIngredients,
            status: state.user ? 'approved' : 'pending' // Admin approva subito
        };

        let error = null;
        let data = null;
        
        if (this.editingId) {
            // Update
            const res = await _sb.from('ricette').update(payload).eq('id', this.editingId).select();
            error = res.error;
            data = res.data;
        } else {
            // Insert
            const res = await _sb.from('ricette').insert([payload]).select();
            error = res.error;
            data = res.data;
        }

        if (error) {
            console.error(error);
            ui.toast("Errore salvataggio", "error");
        } else {
            // Se nuovo e utente pubblico, salva ownership
            if (isNew && !state.user && data && data[0]) {
                const newId = data[0].id;
                let myRecipes = JSON.parse(localStorage.getItem('azimut_my_recipes') || '[]');
                myRecipes.push(newId);
                localStorage.setItem('azimut_my_recipes', JSON.stringify(myRecipes));
            }

            ui.toast("Ricetta salvata!", "success");
            ui.closeModals();
            await this.load(); 
            
            // Se eravamo nel planner, aggiorna griglia
            if(!document.getElementById('planner-step-grid').classList.contains('hidden')) {
                planner.renderGrid();
            }
        }
        loader.hide();
    },

    async delete(idIn = null) {
        const id = idIn || this.editingId;
        if(!id || !confirm("Eliminare questa ricetta?")) return;

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
    eventData: { days: [], pax: 0 },
    
    // Genera la struttura dei giorni in base alle date
    generateMenu() {
        const startStr = document.getElementById('evt-start').value;
        const endStr = document.getElementById('evt-end').value;
        const pax = parseInt(document.getElementById('evt-pax').value) || 30;

        if(!startStr || !endStr) return ui.toast("Inserisci date inizio e fine", "error");

        const start = new Date(startStr);
        const end = new Date(endStr);
        
        if(end <= start) return ui.toast("La fine deve essere dopo l'inizio", "error");

        this.eventData.pax = pax;
        this.eventData.days = [];

        // Loop per creare i giorni
        let current = new Date(start);
        while (current <= end || current.toDateString() === end.toDateString()) {
            // Determina quali pasti servono in base all'ora
            let meals = [];
            const h = current.getHours();
            const isFirstDay = current.toDateString() === start.toDateString();
            const isLastDay = current.toDateString() === end.toDateString();

            // Logica orari (es. se arrivo alle 18, niente pranzo)
            let includeBreakfast = true, includeLunch = true, includeMerenda = true, includeDinner = true;

            if (isFirstDay) {
                if (h > 9) includeBreakfast = false;
                if (h > 14) includeLunch = false;
                if (h > 17) includeMerenda = false;
                if (h > 20) includeDinner = false;
            }
            if (isLastDay) {
                const endH = end.getHours();
                if (endH < 8) includeBreakfast = false;
                if (endH < 13) includeLunch = false;
                if (endH < 16) includeMerenda = false;
                if (endH < 20) includeDinner = false;
            }

            if(includeBreakfast) meals.push({ type: 'colazione', name: 'Colazione', recipeId: null });
            if(includeLunch) meals.push({ type: 'pranzo', name: 'Pranzo', recipeId: null });
            if(includeMerenda) meals.push({ type: 'merenda', name: 'Merenda', recipeId: null });
            if(includeDinner) meals.push({ type: 'cena', name: 'Cena', recipeId: null });

            this.eventData.days.push({
                date: new Date(current),
                meals: meals
            });

            // Vai al giorno dopo
            current.setDate(current.getDate() + 1);
            current.setHours(0,0,0,0); // Reset orario per i giorni successivi al primo
        }

        this.autoFillRecipes();
        this.renderGrid();
        
        // Mostra la griglia
        document.getElementById('planner-step-setup').classList.add('hidden');
        document.getElementById('planner-step-grid').classList.remove('hidden');
    },

    // Algoritmo semplice per proporre un menu equilibrato
    autoFillRecipes() {
        // Cerchiamo ricette per categoria (se esistessero categorie nel DB sarebbe meglio, usiamo keyword nel nome)
        const findRecipe = (keywords) => {
            const matches = state.recipes.filter(r => keywords.some(k => r.nome.toLowerCase().includes(k)));
            return matches.length > 0 ? matches[Math.floor(Math.random() * matches.length)].id : null;
        };

        const pastaRecipes = findRecipe(['pasta', 'riso', 'lasagne', 'fusilli', 'penne']);
        const meatRecipes = findRecipe(['pollo', 'carne', 'arrosto', 'scaloppine', 'uova', 'frittata']);
        const lightRecipes = findRecipe(['minestra', 'zuppa', 'insalata', 'verdure']);
        const basicPasta = state.recipes.find(r => r.nome.toLowerCase().includes('pomodoro'))?.id;

        this.eventData.days.forEach((day, idx) => {
            day.meals.forEach(meal => {
                if (meal.type === 'pranzo') {
                    // Pranzi: Carboidrati
                    meal.recipeId = pastaRecipes || basicPasta; 
                } else if (meal.type === 'cena') {
                    // Cene: Proteine o cose calde
                    meal.recipeId = meatRecipes || lightRecipes;
                }
                // Se non trova nulla, lascia null (verrà mostrato come "Scegli...")
            });
        });
    },

    renderGrid() {
        const container = document.getElementById('planner-grid-container');
        if(!container) return;

        container.innerHTML = this.eventData.days.map((day, dIdx) => {
            const dateStr = day.date.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
            
            const mealsHtml = day.meals.map((meal, mIdx) => {
                // BUG FIX: Uso String() per essere sicuro che il confronto funzioni (id numero vs id stringa)
                const recipe = state.recipes.find(r => String(r.id) === String(meal.recipeId));
                
                const isPending = recipe && (!recipe.status || recipe.status !== 'approved');
                const recipeName = recipe 
                    ? (isPending ? `⏳ ${recipe.nome}` : recipe.nome) 
                    : '<span class="text-gray-400 italic">Seleziona Ricetta...</span>';
                
                const isPacked = meal.isPacked ? '🎒 AL SACCO' : '';
                
                // Gestione colori bordi
                let styleClass = 'border-l-4 ';
                if (meal.type === 'pranzo') styleClass += 'border-orange-400';
                else if (meal.type === 'cena') styleClass += 'border-blue-400';
                else if (meal.type === 'merenda') styleClass += 'border-purple-400';
                else styleClass += 'border-yellow-300';

                // Passiamo l'indice in modo sicuro
                return `
                <div onclick="planner.openSlotEditor(${dIdx}, ${mIdx})" 
                     class="bg-white p-3 rounded-lg shadow-sm border border-gray-200 cursor-pointer hover:bg-gray-50 flex justify-between items-center ${styleClass} mb-2">
                    <div class="overflow-hidden">
                        <span class="text-[10px] font-bold uppercase text-gray-400 block tracking-wider">${meal.name}</span>
                        <span class="font-bold text-gray-800 text-sm leading-tight block truncate">${recipeName}</span>
                    </div>
                    <div class="text-[10px] font-bold text-orange-600 ml-2 whitespace-nowrap">${isPacked}</div>
                </div>`;
            }).join('');

            return `
            <div class="bg-gray-50 p-3 rounded-xl border border-gray-200 shadow-sm">
                <h4 class="font-extrabold text-gray-700 mb-2 capitalize text-sm border-b border-gray-200 pb-1">${dateStr}</h4>
                <div class="flex flex-col gap-1">
                    ${mealsHtml}
                </div>
            </div>`;
        }).join('');
    },
    openSlotEditor(dIdx, mIdx) {
        const meal = this.eventData.days[dIdx].meals[mIdx];
        document.getElementById('slot-day-index').value = dIdx;
        document.getElementById('slot-type').value = mIdx;
        document.getElementById('slot-packed').checked = meal.isPacked || false;

        // --- LOGICA FILTRO CATEGORIE AGGIORNATA ---
        // Ricette categorie: 'pasti' (Pranzo/Cena) o 'snack' (Colazione/Merenda)
        // Pasti eventi: 'colazione', 'merenda' -> 'snack'
        // Pasti eventi: 'pranzo', 'cena' -> 'pasti'
        
        let targetCat = 'pasti';
        if (meal.type === 'colazione' || meal.type === 'merenda') {
            targetCat = 'snack';
        }

        const filteredRecipes = state.recipes.filter(r => {
            // Se la ricetta non ha categoria, assumiamo 'pasti' se non è specificato
            const rCat = r.categoria || 'pasti';
            return rCat === targetCat;
        });

        const sel = document.getElementById('slot-recipe-select');
        sel.innerHTML = '<option value="">-- Nessuna / Piatto Pronto --</option>' + 
            filteredRecipes.map(r => {
                const isPending = !r.status || r.status !== 'approved';
                const isSelected = String(r.id) === String(meal.recipeId) ? 'selected' : '';
                return `<option value="${r.id}" ${isSelected}>
                    ${r.nome} ${isPending ? '(In Approvazione)' : ''}
                </option>`;
            }).join('');

        ui.modal('modal-slot-edit');
    },

    saveSlot() {
        const dIdx = parseInt(document.getElementById('slot-day-index').value);
        const mIdx = parseInt(document.getElementById('slot-type').value);
        const recipeId = document.getElementById('slot-recipe-select').value;
        const isPacked = document.getElementById('slot-packed').checked;

        // Aggiorna i dati
        // Nota: se recipeId è stringa vuota, salviamo null per pulizia
        this.eventData.days[dIdx].meals[mIdx].recipeId = (recipeId && recipeId !== "") ? recipeId : null;
        this.eventData.days[dIdx].meals[mIdx].isPacked = isPacked;

        ui.closeModals();
        
        // Ridisegna
        this.renderGrid();
    },
    calculateShopping() {
        if (!this.eventData.days || this.eventData.days.length === 0) return;

        let needs = {}; 

        // 1. Calcola Fabbisogno Totale
        this.eventData.days.forEach(day => {
            if(!day.meals) return;
            
            day.meals.forEach(meal => {
                // FIX: Controlliamo che ci sia un recipeId
                if(meal.recipeId) {
                    // FIX CRITICO: Convertiamo entrambi in String per il confronto
                    const r = state.recipes.find(x => String(x.id) === String(meal.recipeId));
                    
                    if(r && r.ingredienti_ricetta && Array.isArray(r.ingredienti_ricetta)) {
                        // Scala dosi: (DoseRicetta / PorzioniRicetta) * PaxEvento
                        const basePortions = parseFloat(r.porzioni) || 4;
                        const targetPax = parseFloat(this.eventData.pax) || 1;
                        const ratio = targetPax / basePortions;
                        
                        r.ingredienti_ricetta.forEach(ing => {
                            if(!ing.nome_ingrediente) return;
                            
                            const name = ing.nome_ingrediente.toLowerCase().trim();
                            const qty = parseFloat(ing.quantita_necessaria) * ratio;
                            
                            if(!needs[name]) {
                                needs[name] = { qty: 0, unit: ing.unita, usage: [] };
                            }
                            needs[name].qty += qty;
                            const mealName = `${r.nome} (${day.date.toLocaleDateString('it-IT', {weekday:'short'})} ${meal.name})`;
                            if(!needs[name].usage.includes(mealName)) needs[name].usage.push(mealName);
                        });
                    }
                }
            });
        });

        // 2. Confronta con Dispensa
        const el = document.getElementById('shopping-result-list');
        if(!el) return;

        const ingredientKeys = Object.keys(needs).sort();
        
        if (ingredientKeys.length === 0) {
            el.innerHTML = '<div class="text-center py-10 text-gray-500">Nessun ingrediente necessario trovato. Assicurati di aver assegnato le ricette agli slot.</div>';
            return;
        }

        const today = new Date().toISOString().split('T')[0];
        let resultHtml = '';

        ingredientKeys.forEach(ingName => {
            const need = needs[ingName];
            
            // Cerca in dispensa prodotti simili non scaduti
            const inPantryItems = state.pantry.filter(p => 
                p.nome.toLowerCase().includes(ingName) && 
                (!p.scadenza || p.scadenza >= today) &&
                p.quantita > 0
            );

            const totalInPantry = inPantryItems.reduce((acc, curr) => acc + curr.quantita, 0);
            const missing = need.qty - totalInPantry;
            
            let statusColor = 'text-red-600 bg-red-50';
            let statusText = `MANCANO: <strong>${Math.max(0, missing).toFixed(1)} ${need.unit}</strong>`;
            
            if (missing <= 0) {
                statusColor = 'text-green-700 bg-green-50';
                statusText = '✅ Coperto dalla dispensa!';
            }

            const pantryDetail = inPantryItems.map(p => `${p.nome}: ${p.quantita} ${p.unita}`).join(', ') || '0 in dispensa';

            resultHtml += `
            <div class="py-4 grid grid-cols-1 md:grid-cols-4 gap-4 border-b border-gray-100 last:border-0">
                <div class="md:col-span-1">
                    <div class="font-extrabold text-lg capitalize text-gray-800">${ingName}</div>
                    <div class="text-xs text-gray-500">Serve per: ${need.usage.length} ricette</div>
                </div>
                
                <div class="md:col-span-1">
                    <div class="text-xs uppercase font-bold text-gray-400">Totale Necessario</div>
                    <div class="font-mono text-xl font-bold">${need.qty.toFixed(1)} <span class="text-sm">${need.unit}</span></div>
                </div>

                <div class="md:col-span-1">
                    <div class="text-xs uppercase font-bold text-gray-400">In Dispensa</div>
                    <div class="text-sm font-bold text-gray-700">${pantryDetail}</div>
                </div>

                <div class="md:col-span-1 p-2 rounded-lg text-center flex flex-col justify-center ${statusColor}">
                    <div class="text-sm">${statusText}</div>
                </div>
            </div>`;
        });

        el.innerHTML = resultHtml;
        
        document.getElementById('planner-step-grid').classList.add('hidden');
        document.getElementById('planner-step-list').classList.remove('hidden');
    },

    backToGrid() {
        document.getElementById('planner-step-list').classList.add('hidden');
        document.getElementById('planner-step-grid').classList.remove('hidden');
    },

    createNewRecipeFromPlanner() {
        ui.closeModals(); // Chiude il modale slot
        recipes.openModal(); // Apre il modale creazione ricetta
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
        if (name === 'stock') this.renderStock();
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
    renderStock() {
        const term = document.getElementById('admin-search') ? document.getElementById('admin-search').value.toLowerCase() : '';
        const el = document.getElementById('admin-list');
        if(!el) return;

        const filtered = state.pantry.filter(p => p.nome.toLowerCase().includes(term));
        
        if(!filtered.length) { el.innerHTML = '<p class="text-gray-400 p-4">Nessun oggetto.</p>'; return; }

        el.innerHTML = filtered.map(p => {
            // FORMATTAZIONE DATA SCADENZA
            const scadenzaStr = p.scadenza ? new Date(p.scadenza).toLocaleDateString('it-IT') : 'Nessuna';
            
            // COLORE SCADENZA (Rosso se scaduto o vicino)
            let dateClass = "text-gray-500";
            if(p.scadenza && new Date(p.scadenza) < new Date()) dateClass = "text-red-600 font-bold";

            return `
            <div class="flex justify-between items-center py-3 px-3 bg-white mb-2 rounded-lg border border-gray-100 shadow-sm hover:shadow-md transition">
                <div>
                    <div class="font-bold text-gray-800 text-lg">${p.nome}</div>
                    <div class="text-xs flex items-center gap-2 mt-1">
                        <span class="bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-mono font-bold">${p.quantita} ${p.unita}</span>
                        <span class="${dateClass}">📅 Scad: ${scadenzaStr}</span>
                    </div>
                </div>
                
                <div class="flex gap-2">
                    <button onclick="admin.editItem('${p.id}')" class="bg-blue-100 hover:bg-blue-200 text-blue-700 w-10 h-10 rounded-lg flex items-center justify-center transition" title="Modifica">
                        ✏️
                    </button>
                    <button onclick="admin.deleteItem('${p.id}')" class="bg-red-100 hover:bg-red-200 text-red-600 w-10 h-10 rounded-lg flex items-center justify-center transition" title="Elimina">
                        🗑
                    </button>
                </div>
            </div>
        `;
        }).join('');
    },
    
    // Funzione per filtrare (collegata all'input search admin)
    filterStock() {
        this.renderStock();
    },

    // Aggiungi queste funzioni per far funzionare i bottoni MOD ed ELIM
    editItem(id) {
        const item = state.pantry.find(x => x.id === id);
        if(!item) return;
        document.getElementById('modal-title').innerText = "Modifica Ingrediente";
        document.getElementById('item-id').value = id;
        document.getElementById('item-name').value = item.nome;
        document.getElementById('item-cat').value = item.categoria;
        document.getElementById('item-qty').value = item.quantita;
        document.getElementById('item-unit').value = item.unita;
        document.getElementById('item-expiry').value = item.scadenza || '';
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
            scadenza: document.getElementById('item-expiry').value || null
        };
        
        if(id) await _sb.from('cambusa').update(data).eq('id', id);
        // else se volessi creare nuovo da admin...

        ui.toast("Salvato!", "success");
        ui.closeModals();
        app.loadData();
        this.renderStock();
    },

    async deleteItem(idIn) {
        const id = idIn || document.getElementById('item-id').value;
        if(!confirm("Eliminare definitivamente dalla dispensa?")) return;
        await _sb.from('cambusa').delete().eq('id', id);
        ui.closeModals();
        app.loadData();
        this.renderStock();
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
    },
    // Dentro l'oggetto 'admin' in cambusa.js

async renderMovements() {
    const el = document.getElementById('movements-list');
    if (!el) return;

    el.innerHTML = '<div class="text-center py-10"><div class="animate-spin inline-block w-6 h-6 border-[3px] border-current border-t-transparent text-gray-400 rounded-full" role="status" aria-label="loading"></div></div>';

    // 1. Scarica i dati da Supabase (Tabella: movimenti_cambusa)
    const { data, error } = await _sb
        .from('movimenti_cambusa')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50); // Mostra solo gli ultimi 50

    if (error) {
        console.error(error);
        el.innerHTML = '<div class="text-center text-red-500 py-4">Errore caricamento movimenti.</div>';
        return;
    }

    if (!data || data.length === 0) {
        el.innerHTML = '<div class="text-center text-gray-400 italic py-10">Nessun movimento registrato di recente.</div>';
        return;
    }

        // 2. Genera HTML
        el.innerHTML = data.map(m => {
            const date = new Date(m.created_at);
            const dateStr = date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
            const timeStr = date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
            
            // Stile per carico (+) o scarico (-)
            const isPositive = m.quantita > 0;
            const bgClass = isPositive ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100';
            const textClass = isPositive ? 'text-green-700' : 'text-red-700';
            const sign = isPositive ? '+' : '';
            const icon = isPositive ? '📥' : '📤';
    
            return `
            <div class="flex justify-between items-center p-3 mb-2 rounded-lg border ${bgClass} shadow-sm">
                <div class="flex items-center gap-3">
                    <div class="text-xl">${icon}</div>
                    <div>
                        <div class="font-bold text-gray-800 leading-tight">${m.prodotto}</div>
                        <div class="text-[10px] text-gray-500 font-mono uppercase mt-0.5">
                            ${dateStr} ${timeStr} • <span class="font-semibold">${m.utente || 'Admin'}</span>
                        </div>
                    </div>
                </div>
                <div class="text-right">
                    <div class="font-bold text-lg ${textClass} font-mono tracking-tight">
                        ${sign}${m.quantita} <span class="text-xs text-gray-400">${m.unita || ''}</span>
                    </div>
                    <div class="text-[9px] text-gray-400 uppercase tracking-widest">${m.azione || 'MOV'}</div>
                </div>
            </div>
            `;
        }).join('');
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
