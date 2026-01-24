// --- CONFIGURAZIONE ---
const CONFIG = {
    url: "https://jmildwxjaviqkrkhjzhl.supabase.co", 
    key: "sb_publishable_PwYQxh8l7HLR49EC_wHa7A_gppKi_FS", 
    adminEmail: "marcobolge@gmail.com",
    bucket: "immagini-oggetti"
};

const _sb = supabase.createClient(CONFIG.url, CONFIG.key);

// --- STATO ---
const state = { cart: [], products: [], packs: [], packComponents: [], user: null, currentCategory: 'all' };

// --- LOADER ---
const loader = {
    phrases: ["Sto calcolando l'azimut...", "Sto orientando la cartina...", "Contemplo il fuoco...", "Imparo il Morse...", "Imparo i nodi...", "Ammiro le Stelle...","Preparo la legna...","Pulisco la gavetta...","Preparo lo zaino...","Guado il torrente...","Inseguo l'orizzonte...",],
    show() {
        const el = document.getElementById('scout-loader');
        const txt = document.getElementById('loader-text');
        txt.innerText = this.phrases[Math.floor(Math.random() * this.phrases.length)];
        el.classList.remove('pointer-events-none', 'opacity-0');
    },
    hide() {
        setTimeout(() => {
            document.getElementById('scout-loader').classList.add('opacity-0', 'pointer-events-none');
        }, 2000); 
    }
};

// --- APP CONTROLLER ---
const app = {
    async init() {
        loader.show(); 
        await auth.check();
        await this.loadData();
        loader.hide(); 
    },

    async loadData() {
        const { data: p } = await _sb.from('oggetti').select('*').order('nome');
        state.products = p || [];
        
        const { data: k } = await _sb.from('pacchetti').select('*');
        state.packs = k || [];
        
        // NUOVO: Carichiamo le ricette dei kit per calcolare la disponibilità reale
        const { data: c } = await _sb.from('componenti_pacchetto').select('*');
        state.packComponents = c || [];
        
        if (state.user) {
            admin.renderStock();
            admin.renderRestock();
            admin.renderPackBuilder();
            admin.renderMovements(); 
        } else {
            this.renderShop();
            this.nav('shop');
        }
    },

    nav(view) {
        document.querySelectorAll('section').forEach(el => el.classList.add('hidden'));
        document.getElementById(`view-${view}`).classList.remove('hidden');
        
        // Se apro la wishlist, carica i dati aggiornati
        if (view === 'wishlist') {
            wishlist.load();
        }
    },

    setCategory(cat) {
        state.currentCategory = cat;
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active', 'bg-opacity-100', 'text-white'));
        const btn = document.getElementById(`btn-cat-${cat}`);
        if(btn) btn.classList.add('active');
        this.filterProducts();
    },

    filterProducts() {
        const term = document.getElementById('search-bar').value.toLowerCase().trim();
        const cards = document.querySelectorAll('#shop-products > div');
        let visibleCount = 0;

        cards.forEach(card => {
            const title = card.querySelector('h4').innerText.toLowerCase();
            const cat = card.dataset.category || 'Generale';
            const matchesText = title.includes(term);
            const matchesCat = state.currentCategory === 'all' || cat === state.currentCategory;

            if (matchesText && matchesCat) {
                card.classList.remove('hidden');
                card.classList.add('flex');
                visibleCount++;
            } else {
                card.classList.add('hidden');
                card.classList.remove('flex');
            }
        });

        const noRes = document.getElementById('no-results');
        if(noRes) {
            (visibleCount === 0 && term !== '') ? noRes.classList.remove('hidden') : noRes.classList.add('hidden');
        }
    },

    renderShop() {
        document.getElementById('shop-products').innerHTML = state.products.map(p => {
            // Logica per determinare lo stato (Esaurito vs Scorta Bassa)
            let statusBadge = '';
            const isOut = p.quantita_disponibile <= 0;
            const isLow = !isOut && p.quantita_disponibile <= p.soglia_minima;

            if (isOut) {
                statusBadge = '<span class="absolute top-2 right-2 bg-gray-800 text-white text-[10px] font-bold px-2 py-0.5 rounded-full border border-gray-600 shadow-sm z-10">ESAURITO 🚫</span>';
            } else if (isLow) {
                statusBadge = '<span class="absolute top-2 right-2 bg-red-100 text-red-600 text-[10px] font-bold px-2 py-0.5 rounded-full border border-red-200 shadow-sm animate-pulse z-10">SCORTA BASSA ⚠️</span>';
            }

            // Disabilita i controlli se esaurito
            const disabledClass = isOut ? 'opacity-50 cursor-not-allowed grayscale' : '';
            const btnClass = isOut ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 shadow-sm active:transform active:scale-95';

            return `
            <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-lg transition flex flex-col h-full group" data-category="${p.categoria || 'Generale'}">
                <div class="h-28 md:h-32 bg-gray-50 p-4 relative flex items-center justify-center">
                    <img src="${p.foto_url || 'https://placehold.co/200?text=📦'}" class="max-h-full max-w-full object-contain mix-blend-multiply transition group-hover:scale-110 duration-300 ${disabledClass}">
                    ${statusBadge}
                </div>
                <div class="p-3 flex flex-col flex-grow">
                    <div class="flex justify-between items-start mb-1">
                        <span class="text-[9px] font-bold uppercase text-gray-400 border px-1 rounded">${p.categoria || 'Gen'}</span>
                    </div>
                    <h4 class="font-bold text-sm leading-tight mb-1 text-gray-800 line-clamp-2 uppercase tracking-wide">${p.nome}</h4>
                    <p class="text-xs text-gray-500 mb-3 font-mono">Disponibili: <span class="${isOut ? 'text-red-600' : 'text-green-700'} font-bold text-lg">${p.quantita_disponibile}</span></p>
                    <div class="mt-auto flex items-center gap-1">
                        <input type="number" id="shop-qty-${p.id}" value="1" min="1" max="${p.quantita_disponibile}" ${isOut ? 'disabled' : ''} class="w-12 p-2 text-center border-2 border-gray-200 rounded-lg text-sm focus:border-green-500 outline-none bg-gray-50 font-bold ${disabledClass}">
                        <button ${isOut ? 'disabled' : ''} onclick="const q = document.getElementById('shop-qty-${p.id}').value; cart.add('${p.id}', '${p.nome}', 'item', parseInt(q), ${p.quantita_disponibile})" class="flex-1 text-white text-xs font-bold py-2.5 rounded-lg transition ${btnClass}">
                            ${isOut ? 'ESAURITO' : 'AGGIUNGI'}
                        </button>
                    </div>
                </div>
            </div>
            `;
        }).join('');

        // La parte dei pacchetti rimane invariata o puoi reinserire il codice originale dei pacchetti qui sotto
        document.getElementById('shop-packs').innerHTML = state.packs.map(p => {
            // 1. Troviamo i componenti di questo pacchetto
            const comps = state.packComponents.filter(c => c.pacchetto_id === p.id);
            
            // 2. Calcoliamo quanti pacchetti massimi possiamo fare
            let maxQty = 9999; // Partiamo da infinito
            
            if (comps.length === 0) maxQty = 0; // Se il kit è vuoto, non si può prendere

            comps.forEach(c => {
                const item = state.products.find(x => x.id === c.oggetto_id);
                if (item) {
                    // Quante volte ci sta il componente necessario nella disponibilità totale?
                    const possible = Math.floor(item.quantita_disponibile / c.quantita_necessaria);
                    // Il massimo numero di kit è limitato dal componente più scarso
                    if (possible < maxQty) maxQty = possible;
                } else {
                    maxQty = 0; // Se un componente non esiste più nel database
                }
            });

            const isOut = maxQty <= 0;
            const btnClass = isOut ? 'bg-gray-400 cursor-not-allowed text-white' : 'bg-yellow-400 text-yellow-900 hover:bg-yellow-500 shadow-sm transform active:scale-95';

            return `
            <div class="bg-yellow-50 p-4 rounded-xl border-l-4 border-yellow-400 flex justify-between items-center shadow-sm hover:shadow-md transition">
                <div>
                    <h4 class="font-bold text-yellow-900 leading-tight text-lg">🎁 ${p.nome}</h4>
                    <span class="text-[10px] uppercase tracking-wide text-yellow-700 font-bold bg-yellow-100 px-1 rounded">
                        ${isOut ? 'NON DISPONIBILE ❌' : 'Kit Pronto'}
                    </span>
                    ${!isOut ? `<div class="text-[10px] text-yellow-600 font-mono mt-1">Disponibili: <b>${maxQty}</b></div>` : ''}
                </div>
                
                <button ${isOut ? 'disabled' : ''} onclick="cart.add('${p.id}', '${p.nome}', 'pack', 1, ${maxQty})" class="px-4 py-2 rounded-lg text-xs font-bold transition ${btnClass}">
                    ${isOut ? 'MANCA MATERIALE' : 'PRENDI'}
                </button>
            </div>
            `;
        }).join('');
    },
    // Sostituisci l'intera funzione app.checkout con questa:
    async checkout() {
        const name = document.getElementById('checkout-name').value;
        if (!name || state.cart.length === 0) return ui.toast("Inserisci nome e riempi zaino!", "error");
    
        loader.show(); 
        let details = `<h3>Prelievo effettuato da: ${name}</h3><ul>`;
        let logDetails = [];
        let urgentAlerts = ""; // Stringa per raccogliere avvisi di scorte critiche
    
        // Iteriamo sugli oggetti nel carrello
        for (let i of state.cart) {
            
            if (i.type === 'item') {
                const nQ = i.max - i.qty;
                
                // Aggiornamento DB
                await _sb.from('oggetti').update({ quantita_disponibile: nQ }).eq('id', i.id);
                
                // --- LOGICA AVVISI MAIL ---
                // Recupero i dati originali dal prodotto nello state per vedere la soglia minima
                const originalProd = state.products.find(p => p.id === i.id);
                const threshold = originalProd ? originalProd.soglia_minima : 0;

                if (nQ === 0) {
                    urgentAlerts += `<p style="color: red; font-weight: bold;">🚨 ATTENZIONE: L'oggetto '${i.name}' è definitivamente ESAURITO (Qtà: 0)!</p>`;
                } else if (nQ <= threshold) {
                    urgentAlerts += `<p style="color: #d97706; font-weight: bold;">⚠️ ATTENZIONE: L'oggetto '${i.name}' è sotto scorta (Rimasti: ${nQ})!</p>`;
                }
                // ---------------------------

                details += `<li>${i.name} <b>(${i.qty})</b></li>`;
                logDetails.push(`${i.name} x${i.qty}`);
            } else {
                // Gestione Kit (logica simile per i componenti se necessario, ma qui semplifichiamo)
                const { data: comps } = await _sb.from('componenti_pacchetto').select('*, oggetti(*)').eq('pacchetto_id', i.id);
                for (let c of comps) {
                    const nuovaQta = c.oggetti.quantita_disponibile - c.quantita_necessaria;
                    await _sb.from('oggetti').update({ quantita_disponibile: nuovaQta }).eq('id', c.oggetto_id);
                    
                    // Controllo esaurimento anche dentro ai kit
                    if (nuovaQta <= c.oggetti.soglia_minima) {
                         urgentAlerts += `<p style="color: red;">⚠️ Verifica scorte dopo prelievo Kit ${i.name}: ${c.oggetti.nome} (Rimasti: ${nuovaQta})</p>`;
                    }
                }
                details += `<li>KIT ${i.name}</li>`;
                logDetails.push(`KIT ${i.name}`);
            }
        }
        details += `</ul>`;
        
        // Se ci sono avvisi urgenti, li mettiamo IN CIMA alla mail
        if (urgentAlerts !== "") {
            details = `<h2>⚠️ REPORT SCORTE CRITICHE</h2>${urgentAlerts}<hr>${details}`;
        }
    
        // 1. INSERIMENTO LOG MOVIMENTI
        await _sb.from('movimenti').insert([{
            utente: name,
            dettagli: logDetails.join(', ') 
        }]);
    
        // 2. NOTIFICA MAIL (Includerà gli avvisi urgenti se generati)
        try {
            await fetch(`${CONFIG.url}/functions/v1/notify-admin`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${CONFIG.key}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ details, admin_email: CONFIG.adminEmail })
            });
        } catch(e) { console.log("No notify func"); }
    
        cart.empty();
        ui.toggleCart();
        loader.hide();
        ui.toast("Materiale Prelevato con successo. Buona Strada! ", "success");
        setTimeout(() => location.reload(), 1500);
    }
};

// --- CART ---
const cart = {
    add(id, name, type, qty, max) {
        // 1. Controllo gravissimo: se la quantità massima è 0 o meno, ferma tutto.
        if (max <= 0) return ui.toast("Oggetto ESAURITO! Impossibile aggiungere.", "error");
        
        if(isNaN(qty) || qty < 1) return ui.toast("Quantità non valida", "error");
        
        const exists = state.cart.find(x => x.id === id);
        if (exists) {
            if (exists.qty + qty > max) return ui.toast("Non abbiamo abbastanza scorte!", "error");
            exists.qty += qty;
        } else {
            // Un ulteriore controllo di sicurezza nel caso qty > max al primo inserimento
            if (qty > max) return ui.toast("Richiesta superiore alla disponibilità!", "error");
            state.cart.push({ id, name, type, qty, max });
        }
        this.render();
        ui.toast(`${name} aggiunto allo zaino`, "success");
    },
    remove(idx) { state.cart.splice(idx, 1); this.render(); },
    empty() { state.cart = []; this.render(); },
    render() {
        const count = state.cart.length;
        const elMob = document.getElementById('cart-count-mobile');
        
        if(elMob) elMob.innerText = count;
    
        document.getElementById('cart-items').innerHTML = state.cart.length ? state.cart.map((i, idx) => `
            <div class="bg-white p-3 rounded shadow-sm border-l-4 border-green-600 relative overflow-hidden flex flex-col gap-2">
                <div class="flex justify-between items-center">
                    <div class="text-sm z-10">
                        <div class="font-bold text-gray-800 text-lg leading-tight">${i.name}</div>
                        <span class="text-green-700 text-xs font-bold bg-green-100 px-2 py-0.5 rounded border border-green-200">Quantità: ${i.qty}</span>
                    </div>
                    <button onclick="cart.remove(${idx})" class="text-red-400 hover:text-red-600 font-bold px-3 py-1 rounded hover:bg-red-50 transition z-10">🗑</button>
                </div>
                </div>
        `).join('') : '<div class="text-center py-10 opacity-50"><div class="text-4xl mb-2">🎒</div><p class="text-sm font-bold">Lo zaino è vuoto</p></div>';
    }
};
// --- ADMIN ---
const admin = {
    tab(t) {
        document.querySelectorAll('.admin-tab').forEach(e => e.classList.add('hidden'));
        document.getElementById(`admin-tab-${t}`).classList.remove('hidden');
        
        // Se apro la tab richieste, carica i dati
        if (t === 'requests') {
            this.renderRequests();
        }
    },
    
    // --- STOCK & RESTOCK ---
    renderStock() {
        document.getElementById('admin-total-count').innerText = state.products.length;

        document.getElementById('admin-stock-list').innerHTML = state.products.map(p => `
            <div class="flex justify-between items-center py-3 hover:bg-gray-50 px-2 transition border-b border-gray-100 last:border-0">
                <div class="flex items-center gap-3">
                    <img src="${p.foto_url || ''}" class="w-10 h-10 object-contain bg-white border rounded p-0.5">
                    <div>
                        <div class="font-bold text-gray-800">${p.nome}</div>
                        <div class="text-xs text-gray-500 font-mono">Qty: ${p.quantita_disponibile} | Min: ${p.soglia_minima}</div>
                    </div>
                </div>
                <button onclick="admin.openEdit('${p.id}')" class="text-blue-600 text-xs font-bold bg-blue-50 px-3 py-1.5 rounded hover:bg-blue-100 transition">MODIFICA</button>
            </div>
        `).join('');
    },

    filterStock() {
        const term = document.getElementById('admin-search-bar').value.toLowerCase().trim();
        const rows = document.querySelectorAll('#admin-stock-list > div');
        
        rows.forEach(row => {
            const text = row.innerText.toLowerCase();
            if (text.includes(term)) {
                row.classList.remove('hidden');
                row.classList.add('flex');
            } else {
                row.classList.add('hidden');
                row.classList.remove('flex');
            }
        });
    },

    renderRestock() {
        document.getElementById('admin-restock-list').innerHTML = state.products.map(p => `
            <div class="bg-white border rounded-lg p-3 flex justify-between items-center shadow-sm hover:shadow-md transition">
                <div class="truncate pr-2">
                    <div class="font-bold text-sm text-gray-700 truncate">${p.nome}</div>
                    <div class="text-xs text-gray-400">Attuali: ${p.quantita_disponibile}</div>
                </div>
                <div class="flex items-center bg-blue-50 rounded-lg px-2 py-1 border border-blue-100">
                    <span class="text-blue-600 text-xs font-bold mr-2">+</span>
                    <input type="number" min="0" placeholder="0" data-id="${p.id}" data-current="${p.quantita_disponibile}" class="restock-input w-16 p-1 text-center bg-transparent outline-none font-bold text-blue-900 border-b border-blue-200 focus:border-blue-500">
                </div>
            </div>
        `).join('');
    },
    async processRestock() {
        const inputs = document.querySelectorAll('.restock-input');
        let updates = [];
        inputs.forEach(inp => {
            const val = parseInt(inp.value);
            if(val > 0) {
                const id = inp.dataset.id;
                const current = parseInt(inp.dataset.current);
                updates.push(_sb.from('oggetti').update({ quantita_disponibile: current + val }).eq('id', id));
            }
        });
        if(updates.length === 0) return ui.toast("Nessuna quantità", "error");
        loader.show();
        await Promise.all(updates);
        inputs.forEach(i => i.value = '');
        ui.toast("Rifornito!", "success");
        await app.loadData();
        loader.hide();
    },
    
    // --- PRODOTTO ---
    openEdit(id) {
        const p = state.products.find(x => x.id === id);
        document.getElementById('modal-prod-title').innerText = "Modifica Prodotto";
        document.getElementById('prod-id').value = id;
        document.getElementById('prod-name').value = p.nome;
        document.getElementById('prod-cat').value = p.categoria || 'Generale';
        document.getElementById('prod-qty').value = p.quantita_disponibile;
        document.getElementById('prod-min').value = p.soglia_minima;
        document.getElementById('prod-img').value = p.foto_url || '';
        document.getElementById('prod-img-preview').src = p.foto_url || 'https://placehold.co/200?text=No+Img';
        document.getElementById('prod-file').value = "";
        document.getElementById('btn-del').classList.remove('hidden');
        ui.modal('modal-prod');
    },
    openNewProd() {
        document.getElementById('modal-prod-title').innerText = "Nuovo Prodotto";
        document.getElementById('prod-id').value = "";
        document.querySelectorAll('#modal-prod input').forEach(i => i.value = "");
        document.getElementById('prod-cat').value = 'Generale';
        document.getElementById('prod-img-preview').src = 'https://placehold.co/200?text=Nuovo';
        document.getElementById('btn-del').classList.add('hidden');
        ui.modal('modal-prod');
    },
    async saveProd() {
        const id = document.getElementById('prod-id').value;
        const file = document.getElementById('prod-file').files[0];
        let imgUrl = document.getElementById('prod-img').value;

        if (file) {
            document.getElementById('upload-loader').classList.remove('hidden');
            const fileName = `${Date.now()}_${file.name.replace(/\s/g, '')}`;
            const { error } = await _sb.storage.from(CONFIG.bucket).upload(fileName, file);
            if (!error) {
                const { data } = _sb.storage.from(CONFIG.bucket).getPublicUrl(fileName);
                imgUrl = data.publicUrl;
            }
            document.getElementById('upload-loader').classList.add('hidden');
        }

        const data = {
            nome: document.getElementById('prod-name').value,
            categoria: document.getElementById('prod-cat').value,
            quantita_disponibile: document.getElementById('prod-qty').value,
            soglia_minima: document.getElementById('prod-min').value,
            foto_url: imgUrl
        };

        if (id) await _sb.from('oggetti').update(data).eq('id', id);
        else await _sb.from('oggetti').insert([data]);

        ui.toast("Salvato!", "success"); ui.closeModals(); app.loadData();
    },
    async deleteProd() {
        if (!confirm("Eliminare?")) return;
        await _sb.from('oggetti').delete().eq('id', document.getElementById('prod-id').value);
        ui.closeModals(); app.loadData();
    },
    
    // --- KIT ---
    renderPackBuilder() {
        document.getElementById('pack-items').innerHTML = state.products.map(p => `
            <label class="flex items-center gap-2 text-xs p-2 border rounded hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" value="${p.id}" class="pack-chk accent-yellow-500 w-4 h-4"> 
                <span class="font-medium">${p.nome}</span>
            </label>
        `).join('');

        const listEl = document.getElementById('admin-packs-list');
        if(state.packs.length === 0) {
            listEl.innerHTML = '<p class="text-xs text-gray-400 italic">Nessun kit creato.</p>';
        } else {
            listEl.innerHTML = state.packs.map(k => `
                <div class="flex justify-between items-center bg-white p-3 border rounded-lg shadow-sm hover:shadow-md transition">
                    <span class="font-bold text-sm text-gray-700 flex items-center gap-2">🎁 ${k.nome}</span>
                    <div class="flex gap-2">
                        <button onclick="admin.openEditPack('${k.id}')" class="text-blue-500 hover:text-blue-700 text-xs font-bold border border-blue-200 px-3 py-1.5 rounded hover:bg-blue-50 transition">MODIFICA</button>
                        <button onclick="admin.deletePack('${k.id}')" class="text-red-500 hover:text-red-700 text-xs font-bold border border-red-200 px-3 py-1.5 rounded hover:bg-red-50 transition">ELIMINA</button>
                    </div>
                </div>
            `).join('');
        }
    },
    async createPack() {
        const name = document.getElementById('pack-name').value;
        const chks = document.querySelectorAll('.pack-chk:checked');
        if (!name || !chks.length) return ui.toast("Dati mancanti", "error");
        
        const { data } = await _sb.from('pacchetti').insert([{ nome: name }]).select();
        const items = Array.from(chks).map(c => ({ pacchetto_id: data[0].id, oggetto_id: c.value, quantita_necessaria: 1 }));
        await _sb.from('componenti_pacchetto').insert(items);
        
        ui.toast("Creato!", "success"); document.getElementById('pack-name').value = ""; app.loadData();
    },
    async openEditPack(id) {
        const pack = state.packs.find(k => k.id === id);
        if(!pack) return;

        const { data: currentItems } = await _sb.from('componenti_pacchetto').select('oggetto_id').eq('pacchetto_id', id);
        const currentIds = currentItems.map(i => i.oggetto_id);

        document.getElementById('edit-kit-id').value = id;
        document.getElementById('edit-kit-name').value = pack.nome;
        
        document.getElementById('edit-kit-items').innerHTML = state.products.map(p => `
            <label class="flex items-center gap-2 text-xs p-2 border rounded hover:bg-white cursor-pointer ${currentIds.includes(p.id) ? 'bg-yellow-50 border-yellow-300' : ''}">
                <input type="checkbox" value="${p.id}" class="edit-pack-chk accent-yellow-500 w-4 h-4" ${currentIds.includes(p.id) ? 'checked' : ''}> 
                <span class="font-medium">${p.nome}</span>
            </label>
        `).join('');

        ui.modal('modal-kit');
    },
    async saveEditPack() {
        const id = document.getElementById('edit-kit-id').value;
        const name = document.getElementById('edit-kit-name').value;
        const chks = document.querySelectorAll('.edit-pack-chk:checked');

        if(!name || !chks.length) return ui.toast("Serve nome e almeno un oggetto", "error");

        await _sb.from('pacchetti').update({ nome: name }).eq('id', id);
        await _sb.from('componenti_pacchetto').delete().eq('pacchetto_id', id);
        const items = Array.from(chks).map(c => ({ pacchetto_id: id, oggetto_id: c.value, quantita_necessaria: 1 }));
        await _sb.from('componenti_pacchetto').insert(items);

        ui.toast("Kit Aggiornato!", "success");
        ui.closeModals();
        app.loadData();
    },
    async deletePack(id) {
        if(!confirm("Eliminare Kit?")) return;
        await _sb.from('componenti_pacchetto').delete().eq('pacchetto_id', id);
        await _sb.from('pacchetti').delete().eq('id', id);
        ui.toast("Eliminato", "success"); app.loadData();
    },
    
    // --- MODERAZIONE & STORICO & MOVIMENTI ---
    async renderMovements() {
        const { data } = await _sb.from('movimenti').select('*').order('created_at', { ascending: false });
        if(!data || data.length === 0) {
            document.getElementById('movements-list').innerHTML = "<p class='text-gray-400 text-center text-xs'>Nessun movimento recente.</p>";
            return;
        }
        document.getElementById('movements-list').innerHTML = data.map(m => `
            <div class="bg-teal-50 p-3 rounded border border-teal-100 mb-2">
                <div class="flex justify-between items-center mb-1">
                    <span class="font-bold text-teal-900 text-sm">${m.utente}</span>
                    <span class="text-[10px] text-teal-600 font-mono">${new Date(m.created_at).toLocaleDateString()}</span>
                </div>
                <p class="text-xs text-teal-800 leading-snug">${m.dettagli}</p>
            </div>
        `).join('');
    },
    filterMovements() {
        const term = document.getElementById('movements-search').value.toLowerCase().trim();
        const cards = document.querySelectorAll('#movements-list > div');
        
        cards.forEach(card => {
            const text = card.innerText.toLowerCase();
            // Cerca sia nel nome del capo che nel contenuto (oggetti e nomi ragazzi)
            if (text.includes(term)) {
                card.classList.remove('hidden');
            } else {
                card.classList.add('hidden');
            }
        });
    },
    // --- GESTIONE DESIDERI ---
    async renderRequests() {
        // Carica tutte le richieste
        const { data } = await _sb.from('richieste').select('*').order('created_at', { ascending: false });
        
        const el = document.getElementById('admin-requests-list');
        if (!data || data.length === 0) {
            el.innerHTML = "<p class='text-gray-400 text-center text-xs'>Nessuna richiesta in attesa.</p>";
            return;
        }

        el.innerHTML = data.map(r => `
            <div class="bg-pink-50 p-3 rounded border border-pink-100 flex justify-between items-center transition ${r.completato ? 'opacity-50 grayscale' : ''}">
                <div>
                    <div class="font-bold text-gray-800 text-sm ${r.completato ? 'line-through' : ''}">${r.oggetto}</div>
                    <div class="text-[10px] text-gray-500 font-mono">
                        👤 ${r.richiedente || 'Anonimo'} | 📅 ${new Date(r.created_at).toLocaleDateString()}
                    </div>
                </div>
                
                <div class="flex gap-2">
                    <button onclick="admin.reqAction('${r.id}', 'toggle', ${!r.completato})" class="px-3 py-1 rounded text-xs font-bold shadow-sm ${r.completato ? 'bg-yellow-100 text-yellow-700' : 'bg-green-600 text-white'}">
                        ${r.completato ? 'Da Comprare' : 'Preso!'}
                    </button>
                    <button onclick="admin.reqAction('${r.id}', 'del')" class="px-3 py-1 rounded bg-red-100 text-red-600 text-xs font-bold hover:bg-red-200">
                        Elimina
                    </button>
                </div>
            </div>
        `).join('');
    },

    async reqAction(id, action, status) {
        if (action === 'del') {
            if(!confirm("Eliminare questa richiesta?")) return;
            await _sb.from('richieste').delete().eq('id', id);
        } else if (action === 'toggle') {
            await _sb.from('richieste').update({ completato: status }).eq('id', id);
        }
        
        ui.toast("Fatto!", "success");
        this.renderRequests(); // Ricarica la lista admin
        // Opzionale: se la lista pubblica è aperta, ricarica anche quella
        if(typeof wishlist !== 'undefined') wishlist.load(); 
    },
};

// --- AUTH & UI ---
const auth = {
    async check() {
        const { data: { user } } = await _sb.auth.getUser();
        if (user) {
            state.user = user;
            
            // 1. Mostra menu staff
            document.getElementById('nav-admin-mobile').classList.remove('hidden');
            document.getElementById('nav-admin-mobile').classList.add('flex');
            
            // 2. Nascondi tasto login
            document.getElementById('btn-login-mobile').classList.add('hidden');
            
            // 3. NASCONDI I MENU PUBBLICI (Nuova modifica)
            document.getElementById('nav-btn-shop').classList.add('hidden');
            document.getElementById('nav-btn-wish').classList.add('hidden');
            
            // Vai alla dashboard admin
            app.nav('admin');
        }
    },
    async login() {
        const { error } = await _sb.auth.signInWithPassword({
            email: document.getElementById('log-mail').value,
            password: document.getElementById('log-pass').value
        });
        if (!error) location.reload(); else ui.toast("Dati errati", "error");
    },
    logout() { _sb.auth.signOut().then(() => location.reload()); }
};

const ui = {
    modal(id) { document.getElementById(id).classList.remove('hidden'); },
    closeModals() { document.querySelectorAll('[id^="modal"], #login-modal').forEach(m => m.classList.add('hidden')); },
    toggleCart() { document.getElementById('cart-sidebar').classList.toggle('translate-x-full'); },
    toast(msg, type) {
        const t = document.createElement('div');
        t.className = `px-6 py-3 rounded-full shadow-2xl text-white text-sm font-bold animate-bounce ${type === 'error' ? 'bg-red-500' : 'bg-green-800'}`;
        t.innerText = msg;
        document.getElementById('toast-container').appendChild(t);
        setTimeout(() => t.remove(), 3000);
    },
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
    }
};
// --- WISHLIST ---
const wishlist = {
    async load() {
        // Carica le richieste non completate (o tutte se serve storico)
        const { data, error } = await _sb.from('richieste').select('*').order('created_at', { ascending: false });
        if (error) return;
        this.render(data);
    },
    
    render(data) {
        const el = document.getElementById('wishlist-items');
        if (!data || data.length === 0) {
            el.innerHTML = '<p class="text-gray-400 italic text-center col-span-2">Nessuna richiesta attiva!</p>';
            return;
        }

        const isAdmin = state.user !== null; // Verifica se è loggato un Admin

        el.innerHTML = data.map(item => `
            <div class="bg-white p-4 rounded-xl shadow-sm border-l-4 ${item.completato ? 'border-green-500 opacity-60' : 'border-purple-500'} flex justify-between items-center transition relative overflow-hidden">
                <div>
                    <div class="font-bold text-gray-800 text-lg ${item.completato ? 'line-through' : ''}">${item.oggetto}</div>
                    <div class="text-xs text-gray-500 font-mono flex items-center gap-2">
                        <span>👤 ${item.richiedente || 'Anonimo'}</span>
                        <span>📅 ${new Date(item.created_at).toLocaleDateString()}</span>
                    </div>
                </div>
                
                ${isAdmin ? `
                <div class="flex gap-2 z-10">
                    <button onclick="wishlist.toggle(${item.id}, ${!item.completato})" class="p-2 rounded-full ${item.completato ? 'bg-yellow-100 text-yellow-600' : 'bg-green-100 text-green-600'} font-bold text-xs" title="${item.completato ? 'Segna da comprare' : 'Segna comprato'}">
                        ${item.completato ? '↩️' : '✅'}
                    </button>
                    <button onclick="wishlist.delete(${item.id})" class="p-2 rounded-full bg-red-100 text-red-600 font-bold text-xs" title="Elimina">🗑</button>
                </div>
                ` : `
                ${item.completato ? '<span class="text-green-600 font-bold text-xs border border-green-200 bg-green-50 px-2 py-1 rounded">PRESO!</span>' : '<span class="text-purple-400 text-xs italic">In attesa...</span>'}
                `}
            </div>
        `).join('');
    },

    async add() {
        const item = document.getElementById('wish-item').value;
        const name = document.getElementById('wish-name').value;
        
        if (!item || !name) return ui.toast("Scrivi cosa serve e chi sei!", "error");

        loader.show();
        const { error } = await _sb.from('richieste').insert([{ oggetto: item, richiedente: name }]);
        
        loader.hide();
        if (error) {
            console.error(error);
            ui.toast("Errore durante l'invio.", "error");
        } else {
            ui.toast("Richiesta aggiunta alla lista!", "success");
            document.getElementById('wish-item').value = '';
            this.load();
        }
    },

    // Funzioni solo per Admin
    async toggle(id, status) {
        await _sb.from('richieste').update({ completato: status }).eq('id', id);
        this.load();
    },
    
    async delete(id) {
        if(!confirm("Eliminare questa richiesta?")) return;
        await _sb.from('richieste').delete().eq('id', id);
        this.load();
    }
};
// --- PWA CONFIGURATION ---
let deferredPrompt;

const pwa = {
    init() {
        // 1. Registra il Service Worker
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('./sw.js')
                    .then(reg => console.log('SW registrato: ', reg.scope))
                    .catch(err => console.log('SW fallito: ', err));
            });
        }

        // 2. Intercetta l'evento di installazione
        window.addEventListener('beforeinstallprompt', (e) => {
            // Impedisce al browser di mostrare subito il banner standard
            e.preventDefault();
            // Salva l'evento per usarlo dopo
            deferredPrompt = e;
            // Mostra il nostro bottone nel menu
            const btn = document.getElementById('btn-install-app');
            if(btn) {
                btn.classList.remove('hidden');
                btn.classList.add('flex');
            }
        });

        // 3. Gestione visualizzazione post-installazione
        window.addEventListener('appinstalled', () => {
            ui.toast("App installata nello zaino digitale!", "success");
            const btn = document.getElementById('btn-install-app');
            if(btn) btn.classList.add('hidden');
            deferredPrompt = null;
        });
    },

    async install() {
        if (!deferredPrompt) return;
        // Mostra il prompt nativo
        deferredPrompt.prompt();
        // Attendi la risposta dell'utente
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User response to the install prompt: ${outcome}`);
        deferredPrompt = null;
        // Chiudi il menu mobile se aperto
        ui.toggleMenu();
    }
};
// --- NUOVE FUNZIONI DI RICERCA ---
    
    // 1. Filtro Rifornimento
    filterRestock() {
        const term = document.getElementById('search-restock').value.toLowerCase();
        // Nasconde i div che non contengono il testo cercato
        document.querySelectorAll('#admin-restock-list > div').forEach(el => {
            const text = el.innerText.toLowerCase();
            el.classList.toggle('hidden', !text.includes(term));
        });
    },

    // 2. Filtro Creazione Pacchetti
    filterPackCreation() {
        const term = document.getElementById('search-pack-create').value.toLowerCase();
        // Filtra le etichette (checkbox)
        document.querySelectorAll('#pack-items > label').forEach(el => {
            const text = el.innerText.toLowerCase();
            el.classList.toggle('hidden', !text.includes(term));
        });
    },

    // 3. Filtro Modifica Pacchetti
    filterPackEdit() {
        const term = document.getElementById('search-pack-edit').value.toLowerCase();
        // Filtra le etichette nel popup
        document.querySelectorAll('#edit-kit-items > label').forEach(el => {
            const text = el.innerText.toLowerCase();
            el.classList.toggle('hidden', !text.includes(term));
        });
    },

// --- MODIFICA ALLA INITIALIZZAZIONE ---
// Aggiungi pwa.init() dentro app.init o chiamalo alla fine
pwa.init(); 
// (Lascia app.init() dov'era)

app.init();
