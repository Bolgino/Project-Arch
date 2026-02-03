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
        
        // 2. Carica Ricette
        await recipes.load();

        // RENDERIZZA SEMPRE LA PARTE PUBBLICA
        this.renderPantry();

        if (state.user) {
            // ADMIN: Carica liste gestione
            admin.renderList();      
            admin.loadApprovals();    
            admin.renderMovements(); 
        } else {
            // PUBBLICO: Naviga alla dispensa
            this.nav('pantry'); 
        }
    },

    nav(view) {
        // LOGICA MANUTENZIONE
        // Se la manutenzione è attiva E l'utente NON è admin E sta cercando di vedere pagine pubbliche
        if (MAINTENANCE_MODE && !state.user && ['pantry', 'restock-public', 'recipes', 'planner'].includes(view)) {
            document.querySelectorAll('section').forEach(el => el.classList.add('hidden'));
            document.getElementById('view-maintenance').classList.remove('hidden');
            return;
        }

        document.querySelectorAll('section').forEach(el => el.classList.add('hidden'));
        document.getElementById(`view-${view}`).classList.remove('hidden');
        
        if(view === 'wishlist') wishlist.load();
        if(view === 'restock-public') restock.init();
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
        this.renderFilters();
        
        // Recupera lista ID creati da questo browser
        const myProds = JSON.parse(localStorage.getItem('azimut_my_products') || '[]');

        document.getElementById('pantry-grid').innerHTML = state.pantry.map(item => {
            const isOut = item.quantita <= 0;
            const isPending = item.stato === 'pending';
            const isMine = myProds.includes(item.id); // È mio?

            // Calcolo scadenza
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
                    // SE È MIO: Badge diverso e NIENTE overlay bloccante
                    badge = '<span class="absolute top-0 right-0 bg-yellow-100 text-yellow-800 text-[9px] px-2 py-1 rounded-bl-lg font-bold shadow z-10 border border-yellow-300">IN ATTESA (TUO) ✏️</span>';
                    borderClass = 'border-yellow-400 bg-yellow-50/50';
                    // Tasto Modifica Speciale
                    actionButtons = `
                    <button onclick="restock.openEditPending('${item.id}')" class="w-full bg-yellow-400 text-yellow-900 font-bold py-2 rounded text-xs hover:bg-yellow-500 shadow-sm">
                        MODIFICA RICHIESTA
                    </button>`;
                } else {
                    // SE NON È MIO: Bloccato
                    badge = '<span class="absolute top-0 right-0 bg-gray-200 text-gray-600 text-[9px] px-2 py-1 rounded-bl-lg font-bold shadow z-10">IN APPROVAZIONE ⏳</span>';
                    borderClass = 'border-gray-200 bg-gray-50';
                    overlayClass = 'opacity-50 pointer-events-none grayscale-[0.8]';
                }
            } else if (isOut) {
                badge = '<span class="absolute top-2 right-2 bg-gray-800 text-white text-[10px] px-2 py-0.5 rounded font-bold shadow">ESAURITO 🚫</span>';
                borderClass = 'border-gray-300 bg-gray-50 opacity-75';
                actionButtons = `
                <input type="number" disabled class="w-14 p-2 text-center border rounded bg-gray-100 text-sm">
                <button disabled class="flex-1 bg-gray-200 text-gray-400 font-bold py-2 rounded text-xs">USA</button>`;
            } else {
                if(isExpiring) {
                    badge = `<span class="absolute top-2 right-2 bg-red-600 text-white text-[10px] px-2 py-0.5 rounded font-bold shadow animate-pulse">SCADE TRA ${daysToExpiry} GG ⏳</span>`;
                    borderClass = 'border-red-400 bg-red-50';
                }
                // Tasti normali per utenti attivi
                actionButtons = `
                <input type="number" step="0.5" min="0" max="${item.quantita}" id="qty-${item.id}" placeholder="0" 
                    class="w-14 p-2 text-center border rounded bg-gray-50 text-sm font-bold outline-none focus:border-orange-500">
                <button onclick="cart.add('${item.id}')" class="flex-1 bg-orange-100 text-orange-800 hover:bg-orange-200 font-bold py-2 rounded text-xs transition">USA</button>`;
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
                        
                        <div class="flex gap-1 mt-1">
                            ${actionButtons}
                        </div>
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
            if (item.scadenza) {
                const diffTime = new Date(item.scadenza) - new Date();
                const daysToExpiry = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                if (daysToExpiry <= 12) {
                    urgentAlerts += `<p style="color: #b91c1c; font-weight: bold;">🚨 SCADENZA IMMINENTE: L'oggetto '${item.nome}' scade il ${new Date(item.scadenza).toLocaleDateString()} (Tra ${daysToExpiry} giorni)!</p>`;
                }
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
// --- RIFORNIMENTO (LISTA RAPIDA) ---
// --- RIFORNIMENTO (LISTA RAPIDA) ---
const restock = {
    init() {
        // Assicuriamoci che sia un oggetto vuoto all'avvio
        state.restockCart = {}; 
        // Pulisce la ricerca quando si entra
        const searchInput = document.getElementById('restock-search');
        if(searchInput) searchInput.value = '';
        
        this.renderList();
    },

    renderList() {
        const searchInput = document.getElementById('restock-search');
        // Protezione se l'input non esiste ancora nel DOM
        const term = searchInput ? searchInput.value.toLowerCase() : '';
        const container = document.getElementById('restock-full-list');
        
        if (!container) return;

        // Filtra prodotti
        const matches = state.pantry.filter(p => 
            p.nome.toLowerCase().includes(term) || 
            p.categoria.toLowerCase().includes(term)
        );

        if (matches.length === 0) {
            container.innerHTML = `<div class="text-center py-10 text-gray-400 italic">Nessun prodotto trovato.<br>Usa il tasto in alto per aggiungerlo.</div>`;
            return;
        }

        container.innerHTML = matches.map(item => {
            // Recupera stato modifica o inizializza vuoto
            const mod = state.restockCart[item.id] || { addQty: '', newExpiry: '' };
            const isModified = (mod.addQty !== '' && mod.addQty != 0) || mod.newExpiry !== '';
            
            const borderClass = isModified ? 'border-orange-500 ring-1 ring-orange-200 bg-orange-50' : 'border-gray-200 bg-white';

            // Formattazione data esistente per il campo date (YYYY-MM-DD)
            const currentExpiry = item.scadenza ? item.scadenza.split('T')[0] : '';

            return `
            <div class="rounded-xl shadow-sm border ${borderClass} p-4 transition mb-3">
                <div class="flex justify-between items-start mb-3">
                    <div>
                        <div class="text-[10px] font-bold uppercase text-gray-400 tracking-wider">${item.categoria}</div>
                        <div class="font-extrabold text-gray-800 text-lg leading-tight">${item.nome}</div>
                    </div>
                    <div class="text-right">
                         <div class="text-[10px] text-gray-400 font-bold uppercase">Attuale</div>
                        <div class="font-mono font-bold text-gray-600">${item.quantita} <span class="text-xs">${item.unita}</span></div>
                    </div>
                </div>
                
                <div class="grid grid-cols-2 gap-3 bg-white/50 p-2 rounded-lg">
                    <div>
                        <label class="text-[9px] font-bold text-orange-600 uppercase block mb-1">Aggiungi (+)</label>
                        <input type="number" step="0.5" placeholder="0" value="${mod.addQty}" 
                            oninput="restock.trackChange('${item.id}', 'addQty', this.value)"
                            class="w-full p-2 text-center border rounded-lg font-bold text-gray-800 focus:border-orange-500 focus:bg-orange-50 outline-none transition">
                    </div>
                    <div>
                        <label class="text-[9px] font-bold text-gray-500 uppercase block mb-1">Nuova Scadenza</label>
                        <input type="date" value="${mod.newExpiry || currentExpiry}" 
                            onchange="restock.trackChange('${item.id}', 'newExpiry', this.value)"
                            class="w-full p-2 border rounded-lg text-xs font-mono focus:border-orange-500 outline-none transition">
                    </div>
                </div>
            </div>`;
        }).join('');
    },

    trackChange(id, field, value) {
        if (!state.restockCart[id]) state.restockCart[id] = { addQty: '', newExpiry: '' };
        state.restockCart[id][field] = value;
        // Non ricarichiamo tutta la lista per non perdere il focus
        // Potremmo aggiungere una classe visuale al div padre qui se volessimo fare fine tuning
    },

    // --- POP-UP RIEPILOGO ---
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
            
            return `
            <div class="flex justify-between items-center bg-white p-3 rounded border border-gray-100 shadow-sm">
                <span class="font-bold text-gray-700">${item.nome}</span>
                <div class="text-right leading-tight">${details}</div>
            </div>`;
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
                
                if (mod.addQty && parseFloat(mod.addQty) > 0) {
                    payload.quantita = original.quantita + parseFloat(mod.addQty);
                }
                if (mod.newExpiry) {
                    payload.scadenza = mod.newExpiry;
                }

                if (Object.keys(payload).length > 0) {
                    const { error } = await _sb.from('cambusa').update(payload).eq('id', id);
                    if (!error) successCount++;
                }
            }
            ui.toast(`Salvato! ${successCount} prodotti aggiornati.`, "success");
            state.restockCart = {}; 
            ui.closeModals();
            await app.loadData();
            this.renderList(); // Resetta i campi
        } catch (e) {
            console.error(e);
            ui.toast("Errore salvataggio", "error");
        }
        loader.hide();
    },

    // --- NUOVO PRODOTTO (PENDING) ---
    async addNewProduct() {
        const nome = document.getElementById('new-prod-name').value.trim();
        const cat = document.getElementById('new-prod-cat').value;
        const unita = document.getElementById('new-prod-unit').value;
        const qta = parseFloat(document.getElementById('new-prod-qty').value);
        const scadenza = document.getElementById('new-prod-expiry').value;

        if (!nome) return ui.toast("Inserisci il nome", "error");
        if (!qta || qta <= 0) return ui.toast("Quantità non valida", "error");
        if (!scadenza) return ui.toast("⚠️ LA SCADENZA È OBBLIGATORIA", "error");

        loader.show();
        
        // 1. Inserisci e recupera ID
        const { data, error } = await _sb.from('cambusa').insert([{
            nome: nome,
            categoria: cat,
            quantita: qta,
            unita: unita,
            scadenza: scadenza,
            stato: 'pending'
        }]).select();

        if (error) {
            console.error(error);
            ui.toast("Errore inserimento", "error");
        } else {
            // 2. Salva ID nel LocalStorage (I miei prodotti)
            const newId = data[0].id;
            const myProds = JSON.parse(localStorage.getItem('azimut_my_products') || '[]');
            myProds.push(newId);
            localStorage.setItem('azimut_my_products', JSON.stringify(myProds));

            ui.toast("Richiesta inviata! Puoi modificarla finché è in attesa.", "success");
            ui.closeModals();
            
            // Pulisci campi
            document.getElementById('new-prod-name').value = '';
            document.getElementById('new-prod-qty').value = '';
            document.getElementById('new-prod-expiry').value = '';
            
            await app.loadData();
        }
        loader.hide();
    },

    // --- MODIFICA PENDING (Utente) ---
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
// --- RICETTE ---
// --- PEZZO DI CODICE VECCHIO: const recipes = { ... } (tutto l'oggetto) ---

// --- PEZZO DI CODICE NUOVO ---
const recipes = {
    tempIng: [], // Array temporaneo per gli ingredienti nel modale

    async load() {
        // Carichiamo ricette e ingredienti
        const { data } = await _sb.from('ricette').select('*, ingredienti_ricetta(*)');
        state.recipes = data || [];
        this.renderList();
        
        // Aggiorna Select del Planner
        const sel = document.getElementById('planner-recipe-select');
        if(sel) sel.innerHTML = '<option value="">Seleziona Ricetta...</option>' + state.recipes.map(r => `<option value="${r.id}">${r.nome}</option>`).join('');
    },
    
    renderList() {
        const term = document.getElementById('recipe-search') ? document.getElementById('recipe-search').value.toLowerCase() : '';
        const el = document.getElementById('recipes-list');
        if(!el) return;

        const filtered = state.recipes.filter(r => r.nome.toLowerCase().includes(term));

        // RECUPERO LISTA RICETTE MIE (dal LocalStorage)
        const myRecipes = JSON.parse(localStorage.getItem('azimut_my_recipes') || '[]');
        const isAdmin = state.user !== null; // Se state.user è popolato, sei Admin/Staff

        if(filtered.length === 0) {
            el.innerHTML = `<div class="col-span-full text-center py-10 text-gray-400 italic">Nessuna ricetta trovata.</div>`;
            return;
        }

        el.innerHTML = filtered.map(r => {
            const portions = r.porzioni || 4; 
            // Posso modificare se: Sono Admin OPPURE l'ID della ricetta è nel mio LocalStorage
            const canEdit = isAdmin || myRecipes.includes(r.id);

            return `
            <div class="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-lg transition flex flex-col overflow-hidden relative group">
                <div class="h-2 bg-red-500 w-full"></div>
                
                ${canEdit ? `
                <button onclick="recipes.openModal('${r.id}')" class="absolute top-4 right-4 bg-white text-red-600 hover:text-white hover:bg-red-600 border border-red-200 p-2 rounded-full shadow-sm transition z-10">
                    ✏️
                </button>` : ''}

                <div class="p-4 flex-grow">
                    <div class="flex justify-between items-start mb-2 pr-10"> <h3 class="font-extrabold text-gray-800 text-lg leading-tight group-hover:text-red-700 transition">${r.nome}</h3>
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

    // APERTURA MODALE (Nuova o Modifica)
    openModal(editId = null) { 
        this.tempIng = []; 
        document.getElementById('recipe-id').value = '';
        document.getElementById('new-recipe-name').value = '';
        document.getElementById('new-recipe-portions').value = ''; 
        document.getElementById('ing-input-name').value = '';
        document.getElementById('ing-input-qty').value = '';
        document.getElementById('btn-del-recipe').classList.add('hidden');

        if (editId) {
            // MOODALITA' MODIFICA
            const r = state.recipes.find(x => x.id === editId);
            if(r) {
                document.getElementById('recipe-id').value = r.id;
                document.getElementById('new-recipe-name').value = r.nome;
                document.getElementById('new-recipe-portions').value = r.porzioni;
                document.getElementById('btn-del-recipe').classList.remove('hidden');
                
                // Carichiamo gli ingredienti esistenti
                this.tempIng = r.ingredienti_ricetta.map(i => ({
                    nome: i.nome_ingrediente,
                    qty: i.quantita_necessaria,
                    unita: i.unita
                }));
            }
        }

        this.renderIngList();
        ui.modal('modal-recipe'); 
    },

    // AGGIUNTA INGREDIENTE DALL'INPUT LIBERO
    addIngFromInput() {
        const name = document.getElementById('ing-input-name').value.trim();
        const qty = parseFloat(document.getElementById('ing-input-qty').value);
        const unit = document.getElementById('ing-input-unit').value;

        if (!name) return ui.toast("Nome ingrediente mancante", "error");
        if (!qty || qty <= 0) return ui.toast("Quantità non valida", "error");

        this.tempIng.push({ nome: name, qty: qty, unita: unit });
        
        // Pulisci i campi per inserimento rapido successivo
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
            list.innerHTML = '<div class="text-center text-gray-400 italic text-xs mt-4">Nessun ingrediente aggiunto.</div>';
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
        const id = document.getElementById('recipe-id').value; // Se c'è, è update
        const nome = document.getElementById('new-recipe-name').value;
        const portions = parseInt(document.getElementById('new-recipe-portions').value) || 4;
        
        if(!nome || !this.tempIng.length) return ui.toast("Nome o ingredienti mancanti", "error");

        loader.show();
        
        let recipeId = id;

        // 1. SALVATAGGIO / AGGIORNAMENTO RICETTA
        const recipeData = { nome: nome, porzioni: portions };
        
        if (id) {
            // UPDATE
            const { error } = await _sb.from('ricette').update(recipeData).eq('id', id);
            if(error) { loader.hide(); return ui.toast("Errore aggiornamento", "error"); }
            
            // Per gli ingredienti, cancelliamo i vecchi e rimettiamo i nuovi (metodo più pulito per le modifiche complete)
            await _sb.from('ingredienti_ricetta').delete().eq('ricetta_id', id);
        } else {
            // INSERT
            const { data, error } = await _sb.from('ricette').insert([recipeData]).select();
            if(error) { loader.hide(); return ui.toast("Errore creazione", "error"); }
            recipeId = data[0].id;

            // SALVO ID NEL LOCAL STORAGE (Cosi l'utente pubblico può modificarla in futuro)
            const myRecipes = JSON.parse(localStorage.getItem('azimut_my_recipes') || '[]');
            myRecipes.push(recipeId);
            localStorage.setItem('azimut_my_recipes', JSON.stringify(myRecipes));
        }

        // 2. INSERIMENTO INGREDIENTI
        const ingData = this.tempIng.map(i => ({
            ricetta_id: recipeId,
            nome_ingrediente: i.nome,
            quantita_necessaria: i.qty,
            unita: i.unita
        }));
        
        if (ingData.length > 0) {
            await _sb.from('ingredienti_ricetta').insert(ingData);
        }

        loader.hide();
        ui.toast(id ? "Ricetta Aggiornata!" : "Ricetta Creata!", "success");
        ui.closeModals();
        this.load();
    },

    async delete() {
        const id = document.getElementById('recipe-id').value;
        if(!id) return;
        if(!confirm("Eliminare definitivamente questa ricetta?")) return;

        loader.show();
        // Cancella ingredienti (cascade di solito funziona, ma per sicurezza)
        await _sb.from('ingredienti_ricetta').delete().eq('ricetta_id', id);
        // Cancella ricetta
        await _sb.from('ricette').delete().eq('id', id);

        // Rimuovi da local storage se presente
        let myRecipes = JSON.parse(localStorage.getItem('azimut_my_recipes') || '[]');
        myRecipes = myRecipes.filter(x => x !== id);
        localStorage.setItem('azimut_my_recipes', JSON.stringify(myRecipes));

        loader.hide();
        ui.toast("Ricetta Eliminata", "success");
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
    // 1. DISPENSA (Stock)
    renderList() {
        document.getElementById('admin-list').innerHTML = state.pantry.map(p => {
            // Formattazione data
            const expiry = p.scadenza ? new Date(p.scadenza).toLocaleDateString('it-IT') : '<span class="text-red-300">--/--</span>';
            // Controllo scadenza per evidenziare in rosso
            const isExpiring = p.scadenza && (new Date(p.scadenza) - new Date()) / (1000 * 60 * 60 * 24) <= 12;
            const dateClass = isExpiring ? 'text-red-600 font-bold' : 'text-gray-500';

            return `
            <div class="flex justify-between items-center py-3 px-2 border-b hover:bg-gray-50">
                <div>
                    <div class="font-bold text-gray-800">${p.nome}</div>
                    <div class="text-xs text-gray-500 font-mono flex gap-2 items-center">
                        <span>${p.quantita} ${p.unita}</span>
                        <span class="text-gray-300">|</span>
                        <span class="${dateClass}">Scad: ${expiry}</span>
                    </div>
                </div>
                <button onclick="admin.edit('${p.id}')" class="text-blue-600 text-xs font-bold bg-blue-50 px-3 py-1 rounded border border-blue-100">MODIFICA</button>
            </div>`;
        }).join('');
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
   // 5. MOVIMENTI
    async renderMovements() {
        const list = document.getElementById('movements-list');
        list.innerHTML = '<div class="text-center text-gray-400 text-xs py-4">Caricamento...</div>';
        
        const { data, error } = await _sb.from('movimenti')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(30);

        if (error || !data || data.length === 0) {
            list.innerHTML = '<div class="text-center text-gray-400 text-xs py-4 italic">Nessun movimento registrato di recente.</div>';
            return;
        }

        list.innerHTML = data.map(m => `
            <div class="bg-teal-50 p-3 rounded-lg border border-teal-100 mb-2 shadow-sm">
                <div class="flex justify-between mb-1">
                    <span class="font-bold text-teal-900 text-xs uppercase tracking-wide">${m.utente || 'Anonimo'}</span>
                    <span class="text-[10px] text-teal-600 font-mono">${new Date(m.created_at).toLocaleString()}</span>
                </div>
                <p class="text-xs text-teal-800 leading-snug">${m.dettagli}</p>
            </div>`).join('');
    },
    // NUOVO: Approva le richieste pubbliche
    // Carica gli item con stato 'pending'
    loadApprovals() {
        const pendingItems = state.pantry.filter(x => x.stato === 'pending');
        const list = document.getElementById('admin-approval-list');
        const badge = document.getElementById('badge-approvals'); // Se hai un badge nel menu
        
        if (badge) {
            badge.innerText = pendingItems.length;
            badge.classList.toggle('hidden', pendingItems.length === 0);
        }

        if (pendingItems.length === 0) {
            list.innerHTML = '<div class="text-center text-gray-400 py-10 italic">Nessun prodotto da approvare.</div>';
            return;
        }

        list.innerHTML = pendingItems.map(p => `
            <div class="bg-white border-l-4 border-yellow-400 shadow-sm rounded-r-lg p-4 mb-3">
                <div class="mb-3">
                    <p class="text-[10px] text-gray-400 uppercase font-bold">Richiesta inserimento</p>
                    <input type="text" id="appr-name-${p.id}" value="${p.nome}" 
                        class="w-full font-bold text-gray-800 border-b border-gray-200 focus:border-yellow-500 outline-none text-lg">
                </div>
                
                <div class="grid grid-cols-3 gap-2 mb-3">
                    <div>
                        <label class="text-[9px] text-gray-500 uppercase">Cat.</label>
                        <select id="appr-cat-${p.id}" class="w-full text-xs border rounded p-1 bg-gray-50">
                            <option value="colazione" ${p.categoria=='colazione'?'selected':''}>Colazione</option>
                            <option value="pranzo_cena" ${p.categoria=='pranzo_cena'?'selected':''}>Pasti</option>
                            <option value="condimenti" ${p.categoria=='condimenti'?'selected':''}>Condim.</option>
                            <option value="merenda" ${p.categoria=='merenda'?'selected':''}>Merenda</option>
                            <option value="extra" ${p.categoria=='extra'?'selected':''}>Extra</option>
                        </select>
                    </div>
                    <div>
                        <label class="text-[9px] text-gray-500 uppercase">Unità</label>
                        <select id="appr-unit-${p.id}" class="w-full text-xs border rounded p-1 bg-gray-50">
                            <option value="pz" ${p.unita=='pz'?'selected':''}>Pz</option>
                            <option value="kg" ${p.unita=='kg'?'selected':''}>Kg</option>
                            <option value="lt" ${p.unita=='lt'?'selected':''}>Lt</option>
                        </select>
                    </div>
                    <div>
                        <label class="text-[9px] text-gray-500 uppercase">Qtà</label>
                        <input type="number" step="0.1" id="appr-qty-${p.id}" value="${p.quantita}" class="w-full text-xs border rounded p-1 text-center font-bold">
                    </div>
                </div>

                <div class="mb-4">
                     <label class="text-[9px] text-red-500 uppercase font-bold">Scadenza</label>
                     <input type="date" id="appr-date-${p.id}" value="${p.scadenza}" class="w-full text-xs border border-red-200 rounded p-1 bg-red-50">
                </div>

                <div class="flex gap-2">
                    <button onclick="admin.processApproval('${p.id}', false)" class="flex-1 bg-red-100 text-red-600 font-bold text-xs py-2 rounded hover:bg-red-200">RIFIUTA 🗑️</button>
                    <button onclick="admin.processApproval('${p.id}', true)" class="flex-1 bg-green-600 text-white font-bold text-xs py-2 rounded shadow hover:bg-green-700">APPROVA ✅</button>
                </div>
            </div>
        `).join('');
    },

    async processApproval(id, isApproved) {
        loader.show();
        if (isApproved) {
            // Raccoglie i dati (eventualmente modificati dall'admin)
            const updates = {
                nome: document.getElementById(`appr-name-${id}`).value,
                categoria: document.getElementById(`appr-cat-${id}`).value,
                unita: document.getElementById(`appr-unit-${id}`).value,
                quantita: parseFloat(document.getElementById(`appr-qty-${id}`).value),
                scadenza: document.getElementById(`appr-date-${id}`).value,
                stato: 'active' // <--- SBLOCCA IL PRODOTTO
            };
            
            await _sb.from('cambusa').update(updates).eq('id', id);
            ui.toast("Prodotto approvato e attivo!", "success");
        } else {
            // Rifiuta = Cancella dal DB
            if(confirm("Sei sicuro di voler rifiutare ed eliminare questa richiesta?")) {
                await _sb.from('cambusa').delete().eq('id', id);
                ui.toast("Richiesta eliminata", "success");
            } else {
                loader.hide();
                return;
            }
        }
        
        await app.loadData(); // Ricarica tutto
        this.loadApprovals(); // Aggiorna lista approvazioni
        loader.hide();
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
        document.getElementById('item-expiry').value = p.scadenza || '';
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
        const t = document.createElement('div');
        t.className = `px-6 py-3 rounded-full shadow-2xl text-white text-sm font-bold animate-bounce ${type === 'error' ? 'bg-red-500' : 'bg-orange-800'}`;
        t.innerText = msg;
        document.getElementById('toast-container').appendChild(t);
        setTimeout(() => t.remove(), 3000);
    }
};

app.init();
