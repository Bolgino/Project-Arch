// cambusa.js - Versione 2.0 Rewrite

// --- CONFIGURAZIONE ---
const CONFIG = {
    url: "https://jmildwxjaviqkrkhjzhl.supabase.co", 
    key: "sb_publishable_PwYQxh8l7HLR49EC_wHa7A_gppKi_FS", // Placeholder, usa la tua chiave reale
    adminEmail: "marcobolge@gmail.com"
};

const _sb = supabase.createClient(CONFIG.url, CONFIG.key);

// --- STATO ---
const state = {
    pantry: [],      // Tabella 'cambusa' (con campi: id, nome, quantita, unita, soglia, categoria, data_scadenza)
    recipes: [],     // Tabella 'ricette' (ex menu: id, nome, tags)
    recipeIngs: [],  // Tabella 'ingredienti_ricette' (ricetta_id, ingrediente_id, qta_per_persona)
    cart: [],
    campMenu: [],    // Ricette selezionate per il campo corrente
    user: null,
    currentCategory: 'all'
};

// --- LOADER ---
const loader = {
    show() { document.getElementById('cambusa-loader').classList.remove('opacity-0', 'pointer-events-none'); },
    hide() { setTimeout(() => document.getElementById('cambusa-loader').classList.add('opacity-0', 'pointer-events-none'), 800); }
};

// --- APP CONTROLLER ---
const app = {
    async init() {
        loader.show();
        await auth.check();
        await this.loadData();
        loader.hide();
        
        // Se Admin, controlla scadenze all'avvio
        if(state.user) admin.checkExpirations();
    },

    async loadData() {
        // 1. Carica Dispensa
        const { data: d } = await _sb.from('cambusa').select('*').order('nome');
        state.pantry = d || [];

        // 2. Carica Ricette
        // Assumiamo che le tabelle siano state rinominate o create come 'ricette' e 'ingredienti_ricette'
        // Se non esistono, crea le tabelle in Supabase.
        const { data: r } = await _sb.from('ricette').select('*');
        state.recipes = r || [];
        
        const { data: i } = await _sb.from('ingredienti_ricette').select('*');
        state.recipeIngs = i || [];

        this.renderPantry(); // Renderizza sempre per la vista pubblica
        
        if (state.user) {
            admin.renderStock();
            admin.renderRecipeBuilder();
            admin.renderStats();
        }
    },

    nav(view) {
        // Nascondi tutte le sezioni
        document.querySelectorAll('main > section').forEach(el => el.classList.add('hidden'));
        document.getElementById(`view-${view}`).classList.remove('hidden');
        
        if (view === 'recipes') this.renderRecipesList();
    },

    // --- LOGICA DISPENSA PUBBLICA ---
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
        const grid = document.getElementById('pantry-grid');
        grid.innerHTML = state.pantry.map(item => {
            const isOut = item.quantita <= 0;
            // Se scadenza esiste e passata o vicina
            const daysToExp = item.data_scadenza ? Math.ceil((new Date(item.data_scadenza) - new Date()) / (1000 * 60 * 60 * 24)) : 999;
            const isExpiring = !isOut && daysToExp <= 7 && daysToExp >= 0;
            const isExpired = !isOut && daysToExp < 0;

            let badge = '';
            if (isOut) badge = '<span class="absolute top-2 right-2 bg-gray-800 text-white text-[10px] font-bold px-2 py-0.5 rounded z-10">ESAURITO</span>';
            else if (isExpired) badge = '<span class="absolute top-2 right-2 bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded z-10 animate-pulse">SCADUTO</span>';
            else if (isExpiring) badge = '<span class="absolute top-2 right-2 bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded z-10">SCADE PRESTO</span>';

            const opacity = isOut ? 'opacity-50 grayscale' : '';
            const btnState = isOut ? 'disabled class="flex-1 bg-gray-300 text-white font-bold py-2 rounded cursor-not-allowed"' : 'class="flex-1 bg-orange-100 text-orange-800 hover:bg-orange-200 font-bold py-2 rounded transition" onclick="cart.add(\'' + item.id + '\')"';
            const btnText = isOut ? 'FINITO' : 'PRENDI';

            return `
            <div class="bg-white rounded-xl shadow-sm border border-orange-100 overflow-hidden hover:shadow-md transition flex flex-col relative group ${opacity}" data-category="${item.categoria || 'extra'}">
                ${badge}
                <div class="p-3 flex flex-col flex-grow">
                    <span class="text-[9px] font-bold uppercase text-orange-400 mb-1 tracking-wider">${item.categoria || 'Varie'}</span>
                    <h4 class="font-bold text-gray-800 leading-tight mb-1 text-base md:text-lg line-clamp-2">${item.nome}</h4>
                    <div class="text-xs text-gray-500 mb-3 font-mono flex justify-between items-end">
                        <span>Disp:</span>
                        <span class="font-bold text-orange-700 text-lg">${item.quantita} <span class="text-xs text-gray-400">${item.unita}</span></span>
                    </div>
                    ${item.data_scadenza ? `<div class="text-[9px] text-gray-400 mb-2">Scad: ${new Date(item.data_scadenza).toLocaleDateString()}</div>` : ''}
                    
                    <div class="mt-auto flex gap-1">
                        <input type="number" id="qty-${item.id}" placeholder="0" class="w-14 p-1 text-center border rounded bg-gray-50 text-sm font-bold outline-none focus:border-orange-500" ${isOut ? 'disabled' : ''}>
                        <button ${btnState}>${btnText}</button>
                    </div>
                </div>
            </div>`;
        }).join('');
    },

    // --- CARICO AVANZI (PUBBLICO) ---
    searchLeftoverItem() {
        const term = document.getElementById('leftover-search').value.toLowerCase();
        const resDiv = document.getElementById('leftover-results');
        
        if(term.length < 2) { resDiv.classList.add('hidden'); return; }
        
        const matches = state.pantry.filter(p => p.nome.toLowerCase().includes(term));
        if(matches.length > 0) {
            resDiv.innerHTML = matches.map(p => `
                <div class="p-2 hover:bg-orange-50 cursor-pointer text-sm font-bold text-gray-700 border-b" 
                     onclick="app.selectLeftover('${p.id}')">
                    ${p.nome} (${p.quantita} ${p.unita})
                </div>
            `).join('');
            resDiv.classList.remove('hidden');
        } else {
            resDiv.classList.add('hidden');
        }
    },

    selectLeftover(id) {
        const item = state.pantry.find(p => p.id === id);
        document.getElementById('leftover-id').value = item.id;
        document.getElementById('leftover-name').value = item.nome;
        document.getElementById('leftover-name').disabled = true; // Non cambiare nome se esiste
        document.getElementById('leftover-cat').value = item.categoria;
        document.getElementById('leftover-unit').value = item.unita;
        document.getElementById('leftover-search').value = '';
        document.getElementById('leftover-results').classList.add('hidden');
    },

    async submitLeftover() {
        const id = document.getElementById('leftover-id').value;
        const name = document.getElementById('leftover-name').value;
        const qty = parseFloat(document.getElementById('leftover-qty').value);
        const unit = document.getElementById('leftover-unit').value;
        const cat = document.getElementById('leftover-cat').value;
        const date = document.getElementById('leftover-date').value || null;

        if(!name || !qty || qty <= 0) return ui.toast("Compila nome e quantità valida!", "error");

        loader.show();
        
        if (id) {
            // Aggiorna esistente
            const current = state.pantry.find(p => p.id == id);
            await _sb.from('cambusa').update({ 
                quantita: current.quantita + qty,
                // Aggiorna scadenza solo se fornita e più recente o se mancante
                ...(date ? { data_scadenza: date } : {}) 
            }).eq('id', id);
        } else {
            // Crea nuovo
            await _sb.from('cambusa').insert([{
                nome: name,
                quantita: qty,
                unita: unit,
                categoria: cat,
                data_scadenza: date,
                soglia: 1 // Default
            }]);
        }
        
        // Log movimento
        await _sb.from('movimenti').insert([{ utente: 'AVANZI CAMPO', dettagli: `Caricato: ${name} (+${qty} ${unit})` }]);

        loader.hide();
        ui.toast("Avanzi caricati in dispensa!", "success");
        // Reset form
        document.getElementById('leftover-id').value = '';
        document.getElementById('leftover-name').value = '';
        document.getElementById('leftover-name').disabled = false;
        document.getElementById('leftover-qty').value = '';
        await this.loadData();
    },

    // --- CARRELLO & CHECKOUT ---
    async checkout() {
        const note = document.getElementById('checkout-note').value;
        if(state.cart.length === 0) return ui.toast("Carrello vuoto!", "error");
        if(!note) return ui.toast("Chi sta prelevando?", "error");

        loader.show();
        let log = [];
        for (let c of state.cart) {
            const item = state.pantry.find(x => x.id === c.id);
            if(item) {
                const nQ = item.quantita - c.qty;
                // Impedisci valori negativi, ferma a 0
                const finalQ = nQ < 0 ? 0 : nQ;
                await _sb.from('cambusa').update({ quantita: finalQ }).eq('id', c.id);
                log.push(`${item.nome} x${c.qty}`);
            }
        }
        
        await _sb.from('movimenti').insert([{ utente: note, dettagli: log.join(', ') }]);
        
        cart.empty();
        ui.toggleCart();
        ui.toast("Prelievo registrato.", "success");
        await this.loadData();
        loader.hide();
    },

    // --- MENU & RICETTE ---
    renderRecipesList() {
        const el = document.getElementById('recipes-list');
        el.innerHTML = state.recipes.map(r => `
            <div class="bg-white p-4 rounded-xl shadow-md border-l-4 border-yellow-400 flex flex-col">
                <div class="flex justify-between items-start mb-2">
                    <h3 class="font-bold text-lg text-gray-800">${r.nome}</h3>
                    <button onclick="camp.addRecipe('${r.id}')" class="bg-green-100 text-green-700 text-xs font-bold px-2 py-1 rounded hover:bg-green-200 transition">+ MENU</button>
                </div>
                <div class="text-xs text-gray-500 mb-2">${r.tags || 'Ricetta standard'}</div>
                <div class="mt-auto text-[10px] text-gray-400 font-mono">Ingredienti base caricati</div>
            </div>
        `).join('');
    },
};

// --- LOGICA CAMPO (PLANNER) ---
const camp = {
    togglePlanner() {
        document.getElementById('view-recipes').classList.add('hidden');
        document.getElementById('view-planner').classList.remove('hidden');
        this.calculate(); // Ricalcola subito se c'è roba
    },
    
    addRecipe(id) {
        const r = state.recipes.find(x => x.id === id);
        state.campMenu.push(r);
        ui.toast(`Aggiunto: ${r.nome}`, "success");
        // Se il planner è aperto, ricalcola
        if (!document.getElementById('view-planner').classList.contains('hidden')) {
            this.calculate();
        }
    },

    clear() {
        state.campMenu = [];
        this.calculate();
        ui.toast("Menu resettato", "success");
    },

    calculate() {
        const people = parseInt(document.getElementById('camp-people').value) || 1;
        
        // 1. Renderizza lista menu laterale
        document.getElementById('camp-menu-list').innerHTML = state.campMenu.map((r, i) => 
            `<div class="flex justify-between text-sm border-b pb-1">
                <span>${r.nome}</span>
                <button onclick="state.campMenu.splice(${i},1); camp.calculate()" class="text-red-500 font-bold">✕</button>
             </div>`
        ).join('') || '<p class="text-gray-400 text-xs italic">Nessuna ricetta.</p>';

        // 2. Aggrega Ingredienti
        let totals = {}; // { item_id: { needed: 0, obj: itemRef } }

        state.campMenu.forEach(r => {
            const ings = state.recipeIngs.filter(x => x.ricetta_id === r.id);
            ings.forEach(ing => {
                if (!totals[ing.ingrediente_id]) {
                    const pItem = state.pantry.find(p => p.id === ing.ingrediente_id);
                    if(pItem) {
                        totals[ing.ingrediente_id] = { needed: 0, obj: pItem };
                    }
                }
                if (totals[ing.ingrediente_id]) {
                    // Calcolo: (dose_per_persona * persone)
                    // Assumiamo che nel DB ingrediente_ricette.quantita sia "per persona" o "per unita base".
                    // Semplifichiamo: se non c'è campo 'dose', assumiamo 1 unità per ricetta intera e moltiplichiamo solo se logica diversa.
                    // Qui assumo che 'quantita_necessaria' nel DB sia "per 1 persona" se inteso così, o per "batch".
                    // Per ora: Moltiplico per 'people' assumendo che la ricetta sia "dose per 1".
                    // SE invece le ricette sono "dose per squadriglia", bisognerebbe dividere.
                    // STANDARD SCOUT: Dose a testa.
                    totals[ing.ingrediente_id].needed += (ing.quantita_necessaria * people);
                }
            });
        });

        // 3. Tabella Calcoli
        const tbody = document.getElementById('camp-calc-body');
        let html = '';
        
        Object.values(totals).forEach(t => {
            const item = t.obj;
            const need = t.needed;
            const have = item.quantita;
            const missing = need - have;
            const toBuy = missing > 0 ? missing : 0;
            const statusClass = toBuy > 0 ? 'text-red-600 font-bold bg-red-50' : 'text-green-600 font-bold bg-green-50';

            html += `
            <tr class="border-b">
                <td class="p-2 font-bold text-gray-700">${item.nome}</td>
                <td class="p-2 font-mono">${need.toFixed(1)} ${item.unita}</td>
                <td class="p-2 font-mono text-gray-500">${have.toFixed(1)}</td>
                <td class="p-2 ${statusClass}">${toBuy > 0 ? toBuy.toFixed(1) + ' ' + item.unita : 'OK'}</td>
            </tr>`;
        });

        if (html === '') html = '<tr><td colspan="4" class="p-4 text-center text-gray-400">Aggiungi ricette...</td></tr>';
        tbody.innerHTML = html;
        
        // Aggiorna dettaglio per stampa
        document.getElementById('print-menu-details').innerHTML = state.campMenu.map(r => `• ${r.nome}`).join('<br>');
    },

    print() {
        window.print();
    }
};

// --- CARRELLO LOGICA ---
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
        ui.toast("Aggiunto al carrello", "success");
    },
    remove(idx) { state.cart.splice(idx, 1); this.render(); },
    empty() { state.cart = []; this.render(); },
    render() {
        document.getElementById('cart-count-mobile').innerText = state.cart.length;
        document.getElementById('cart-items').innerHTML = state.cart.map((c, i) => `
            <div class="bg-white p-3 rounded shadow-sm border-l-4 border-orange-500 flex justify-between items-center relative group">
                <div>
                    <div class="font-bold text-gray-800">${c.name}</div>
                    <div class="text-xs text-orange-600 font-bold">${c.qty} ${c.unit}</div>
                </div>
                <button onclick="cart.remove(${i})" class="text-red-400 font-bold px-2 hover:bg-red-50 rounded">✕</button>
            </div>`).join('');
    }
};

// --- ADMIN ---
const admin = {
    tab(t) {
        document.querySelectorAll('.admin-tab').forEach(e => e.classList.add('hidden'));
        document.querySelectorAll('.admin-nav-btn').forEach(e => e.classList.remove('border-orange-600', 'bg-orange-50'));
        document.getElementById(`admin-tab-${t}`).classList.remove('hidden');
        // Evidenzia bottone (logica semplice basata su ordine, migliorabile con ID sui bottoni)
    },

    // --- SCADENZE & NOTIFICHE ---
    async checkExpirations() {
        const today = new Date();
        const nextWeek = new Date();
        nextWeek.setDate(today.getDate() + 7);

        const expiring = state.pantry.filter(item => {
            if(!item.data_scadenza) return false;
            const d = new Date(item.data_scadenza);
            return d >= today && d <= nextWeek;
        });

        if (expiring.length > 0) {
            // Mostra alert UI
            const ul = document.getElementById('expiry-list');
            ul.innerHTML = expiring.map(i => `<li><b>${i.nome}</b> (Scade il ${new Date(i.data_scadenza).toLocaleDateString()})</li>`).join('');
            document.getElementById('expiry-alerts').classList.remove('hidden');
            
            // Invia Mail (Simulazione chiamata Backend)
            // Se esiste la funzione Supabase, decommenta:
            /*
            await fetch(`${CONFIG.url}/functions/v1/notify-admin`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${CONFIG.key}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    subject: "⚠️ Allerta Scadenze Cambusa", 
                    details: `Prodotti in scadenza:<br>${expiring.map(i => i.nome + ' - ' + i.data_scadenza).join('<br>')}`,
                    admin_email: CONFIG.adminEmail 
                })
            });
            */
            console.log("Mail scadenze inviata (simulata)");
        }
    },

    // --- STOCK ---
    renderStock() {
        document.getElementById('admin-stock-list').innerHTML = state.pantry.map(p => `
            <div class="flex justify-between items-center py-2 px-2 hover:bg-gray-50">
                <div class="flex-grow">
                    <div class="font-bold text-gray-800">${p.nome}</div>
                    <div class="text-xs text-gray-500 font-mono">
                        ${p.quantita} ${p.unita} 
                        ${p.data_scadenza ? `| 📅 ${new Date(p.data_scadenza).toLocaleDateString()}` : ''}
                    </div>
                </div>
                <button onclick="admin.editItem('${p.id}')" class="text-blue-600 text-xs font-bold border border-blue-200 px-3 py-1 rounded hover:bg-blue-50">MODIFICA</button>
            </div>`).join('');
    },
    filterStock() {
        const term = document.getElementById('admin-search-stock').value.toLowerCase();
        document.querySelectorAll('#admin-stock-list > div').forEach(el => el.classList.toggle('hidden', !el.innerText.toLowerCase().includes(term)));
    },

    // --- CRUD ITEM ---
    openNewItem() {
        document.getElementById('edit-id').value = '';
        document.querySelectorAll('#modal-item input').forEach(i => i.value = '');
        ui.modal('modal-item');
    },
    editItem(id) {
        const p = state.pantry.find(x => x.id == id);
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

        ui.toast("Salvato!", "success"); ui.closeModals(); app.loadData();
    },
    async deleteItem() {
        if(!confirm("Eliminare definitivamente?")) return;
        await _sb.from('cambusa').delete().eq('id', document.getElementById('edit-id').value);
        ui.closeModals(); app.loadData();
    },

    // --- RICETTE ---
    renderRecipeBuilder() {
        // Popola la lista per creare ricette
        document.getElementById('recipe-ing-select').innerHTML = state.pantry.map(p => `
            <label class="flex items-center gap-1 text-[10px] p-1 border rounded hover:bg-gray-50">
                <input type="checkbox" value="${p.id}" class="rec-chk accent-yellow-500"> ${p.nome}
            </label>`).join('');

        document.getElementById('admin-recipes-list').innerHTML = state.recipes.map(r => `
            <div class="bg-white border rounded p-3 flex justify-between items-center">
                <span class="font-bold text-sm text-gray-700">${r.nome}</span>
                <button onclick="admin.deleteRecipe('${r.id}')" class="text-red-500 text-xs font-bold border border-red-200 px-2 py-1 rounded">ELIMINA</button>
            </div>`).join('');
    },
    async createRecipe() {
        const name = document.getElementById('new-recipe-name').value;
        const tags = document.getElementById('new-recipe-tags').value;
        const chks = document.querySelectorAll('.rec-chk:checked');
        
        if (!name || !chks.length) return ui.toast("Nome e ingredienti richiesti", "error");
        
        const { data } = await _sb.from('ricette').insert([{ nome: name, tags: tags }]).select();
        const rid = data[0].id;
        
        // Per semplicità, qui inseriamo dose 1. In una app reale chiederemmo la dose per ogni ingrediente.
        const items = Array.from(chks).map(c => ({ 
            ricetta_id: rid, 
            ingrediente_id: c.value, 
            quantita_necessaria: 0.1 // Default placeholder
        }));
        
        await _sb.from('ingredienti_ricette').insert(items);
        ui.toast("Ricetta Creata (Dosi default 0.1)", "success");
        app.loadData();
    },
    async deleteRecipe(id) {
        if(!confirm("Eliminare ricetta?")) return;
        await _sb.from('ingredienti_ricette').delete().eq('ricetta_id', id);
        await _sb.from('ricette').delete().eq('id', id);
        app.loadData();
    },

    // --- STATS ---
    async renderStats() {
        const total = state.pantry.length;
        const low = state.pantry.filter(i => i.quantita <= i.soglia).length;
        document.getElementById('stat-total-items').innerText = total;
        document.getElementById('stat-low-stock').innerText = low;

        const { data } = await _sb.from('movimenti').select('*').order('created_at', { ascending: false }).limit(10);
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
        t.className = `px-6 py-3 rounded-full shadow-2xl text-white text-sm font-bold animate-bounce ${type === 'error' ? 'bg-red-500' : 'bg-orange-800'} z-[200]`;
        t.innerText = msg;
        document.getElementById('toast-container').appendChild(t);
        setTimeout(() => t.remove(), 3000);
    }
};

// Avvio
app.init();
