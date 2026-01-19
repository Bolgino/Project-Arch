// --- CONFIGURAZIONE ---
const CONFIG = {
    url: "https://jmildwxjaviqkrkhjzhl.supabase.co", 
    key: "sb_publishable_PwYQxh8l7HLR49EC_wHa7A_gppKi_FS", 
    adminEmail: "marcobolge@gmail.com",
    bucket: "immagini-oggetti"
};

const _sb = supabase.createClient(CONFIG.url, CONFIG.key);

// --- STATO ---
const state = { cart: [], products: [], packs: [], user: null, currentCategory: 'all' };

// --- LOADER ---
const loader = {
    phrases: ["Sto calcolando l'azimut...", "Sto orientando la cartina...", "Contemplo il fuoco...", "Conto le scorte...", "Imparo i nodi...", "Ammiro le Stelle..."],
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
        
        if (state.user) {
            admin.renderStock();
            admin.renderRestock();
            admin.renderPackBuilder();
            admin.checkMod();
            admin.renderHistory();
            admin.renderMovements(); // NUOVO
        } else {
            this.renderShop();
            archive.load();
            this.nav('shop');
        }
    },

    nav(view) {
        document.querySelectorAll('section').forEach(el => el.classList.add('hidden'));
        document.getElementById(`view-${view}`).classList.remove('hidden');
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
        document.getElementById('nav-public').classList.remove('hidden');
        document.getElementById('shop-products').innerHTML = state.products.map(p => `
            <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-lg transition flex flex-col h-full group" data-category="${p.categoria || 'Generale'}">
                <div class="h-28 md:h-32 bg-gray-50 p-4 relative flex items-center justify-center">
                    <img src="${p.foto_url || 'https://placehold.co/200?text=📦'}" class="max-h-full max-w-full object-contain mix-blend-multiply transition group-hover:scale-110 duration-300">
                    ${p.quantita_disponibile <= p.soglia_minima ? '<span class="absolute top-2 right-2 bg-red-100 text-red-600 text-[10px] font-bold px-2 py-0.5 rounded-full border border-red-200 shadow-sm animate-pulse">SCORTA BASSA</span>' : ''}
                </div>
                <div class="p-3 flex flex-col flex-grow">
                    <div class="flex justify-between items-start mb-1">
                        <span class="text-[9px] font-bold uppercase text-gray-400 border px-1 rounded">${p.categoria || 'Gen'}</span>
                    </div>
                    <h4 class="font-bold text-sm leading-tight mb-1 text-gray-800 line-clamp-2 uppercase tracking-wide">${p.nome}</h4>
                    <p class="text-xs text-gray-500 mb-3 font-mono">Disponibili: <span class="text-green-700 font-bold text-lg">${p.quantita_disponibile}</span></p>
                    <div class="mt-auto flex items-center gap-1">
                        <input type="number" id="shop-qty-${p.id}" value="1" min="1" max="${p.quantita_disponibile}" class="w-12 p-2 text-center border-2 border-gray-200 rounded-lg text-sm focus:border-green-500 outline-none bg-gray-50 font-bold">
                        <button onclick="const q = document.getElementById('shop-qty-${p.id}').value; cart.add('${p.id}', '${p.nome}', 'item', parseInt(q), ${p.quantita_disponibile})" class="flex-1 bg-green-600 text-white text-xs font-bold py-2.5 rounded-lg hover:bg-green-700 transition shadow-sm active:transform active:scale-95">AGGIUNGI</button>
                    </div>
                </div>
            </div>
        `).join('');

        document.getElementById('shop-packs').innerHTML = state.packs.map(p => `
            <div class="bg-yellow-50 p-4 rounded-xl border-l-4 border-yellow-400 flex justify-between items-center shadow-sm hover:shadow-md transition">
                <div>
                    <h4 class="font-bold text-yellow-900 leading-tight text-lg">🎁 ${p.nome}</h4>
                    <span class="text-[10px] uppercase tracking-wide text-yellow-700 font-bold bg-yellow-100 px-1 rounded">Kit Pronto</span>
                </div>
                <button onclick="cart.add('${p.id}', '${p.nome}', 'pack', 1, 999)" class="bg-yellow-400 text-yellow-900 px-4 py-2 rounded-lg text-xs font-bold hover:bg-yellow-500 shadow-sm transform active:scale-95">PRENDI</button>
            </div>
        `).join('');
    },

    async checkout() {
        const name = document.getElementById('checkout-name').value;
        if (!name || state.cart.length === 0) return ui.toast("Inserisci nome e riempi zaino!", "error");

        loader.show(); 
        let details = `<h3>Prelievo di: ${name}</h3><ul>`;
        let logDetails = [];

        for (let i of state.cart) {
            let itemWarn = "";
            if (i.type === 'item') {
                const nQ = i.max - i.qty;
                const pObj = state.products.find(x => x.id === i.id);
                // Controllo Sotto Scorta
                if (pObj && nQ <= pObj.soglia_minima) itemWarn = " [ALERTA SCORTA BASSA]";
                
                await _sb.from('oggetti').update({ quantita_disponibile: nQ }).eq('id', i.id);
                details += `<li>${i.name} <b>(${i.qty})</b>${itemWarn}</li>`;
                logDetails.push(`${i.name} x${i.qty}`);
            } else {
                const { data: comps } = await _sb.from('componenti_pacchetto').select('*, oggetti(*)').eq('pacchetto_id', i.id);
                for (let c of comps) {
                    await _sb.from('oggetti').update({ quantita_disponibile: c.oggetti.quantita_disponibile - c.quantita_necessaria }).eq('id', c.oggetto_id);
                }
                details += `<li>KIT ${i.name}</li>`;
                logDetails.push(`KIT ${i.name}`);
            }
        }
        details += `</ul>`;

        // 1. INSERIMENTO LOG MOVIMENTI
        await _sb.from('movimenti').insert([{
            utente: name,
            dettagli: logDetails.join(', ')
        }]);

        // 2. NOTIFICA MAIL
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
        if(isNaN(qty) || qty < 1) return ui.toast("Quantità non valida", "error");
        const exists = state.cart.find(x => x.id === id);
        if (exists) {
            if (exists.qty + qty > max) return ui.toast("Non abbiamo abbastanza scorte!", "error");
            exists.qty += qty;
        } else {
            state.cart.push({ id, name, type, qty, max });
        }
        this.render();
        ui.toast(`${name} aggiunto allo zaino`, "success");
    },
    remove(idx) { state.cart.splice(idx, 1); this.render(); },
    empty() { state.cart = []; this.render(); },
    render() {
        document.getElementById('cart-count').innerText = state.cart.length;
        document.getElementById('cart-items').innerHTML = state.cart.length ? state.cart.map((i, idx) => `
            <div class="flex justify-between items-center bg-white p-3 rounded shadow-sm border-l-4 border-green-600 relative overflow-hidden">
                <div class="text-sm z-10">
                    <div class="font-bold text-gray-800 text-lg">${i.name}</div>
                    <span class="text-green-700 text-xs font-bold bg-green-100 px-2 py-0.5 rounded border border-green-200">Quantità: ${i.qty}</span>
                </div>
                <button onclick="cart.remove(${idx})" class="text-red-400 hover:text-red-600 font-bold px-3 py-1 rounded hover:bg-red-50 transition z-10">🗑</button>
            </div>
        `).join('') : '<div class="text-center py-10 opacity-50"><div class="text-4xl mb-2">🎒</div><p class="text-sm font-bold">Lo zaino è vuoto</p></div>';
    }
};

// --- ARCHIVE ---
const archive = {
    async load() {
        const { data, error } = await _sb.from('archivio').select('*').eq('status', 'approved').order('created_at', { ascending: false });
        if (error) {
            const { data: dataBack } = await _sb.from('archivio').select('*').eq('status', 'approved');
            this.render(dataBack, 'archive-list');
        } else {
            this.render(data, 'archive-list');
        }
    },
    render(data, elId, isAdmin = false) {
        const el = document.getElementById(elId);
        if (!data || !data.length) { el.innerHTML = '<p class="text-gray-400 italic text-center w-full col-span-2">Nessun ricordo trovato.</p>'; return; }
        el.innerHTML = data.map(m => `
            <div class="bg-white p-6 rounded-2xl shadow-lg border-b-4 ${isAdmin ? 'border-red-400' : 'border-green-600'} hover:transform hover:-translate-y-1 transition duration-300 flex flex-col justify-between">
                <div>
                    <div class="flex justify-between items-start mb-3">
                        <div>
                            <h4 class="font-extrabold text-xl text-green-900 leading-tight">${m.evento}</h4>
                            <span class="text-xs text-white bg-green-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">${m.luogo}</span>
                        </div>
                        <span class="text-4xl text-green-100 font-serif">“</span>
                    </div>
                    <p class="text-gray-600 text-md italic leading-relaxed mb-4">${m.aneddoto}</p>
                </div>
                ${isAdmin ? `
                    <div class="flex gap-2 mt-2 pt-2 border-t border-gray-100">
                        <button onclick="admin.memAction('${m.id}', 'approved')" class="flex-1 bg-green-50 text-green-700 py-2 rounded hover:bg-green-100 text-xs font-bold transition">APPROVA</button>
                        <button onclick="admin.memAction('${m.id}', 'del')" class="flex-1 bg-red-50 text-red-700 py-2 rounded hover:bg-red-100 text-xs font-bold transition">RIFIUTA</button>
                    </div>
                ` : ''}
            </div>
        `).join('');
    },
    async submit() {
        const ev = document.getElementById('mem-ev').value;
        const pl = document.getElementById('mem-pl').value;
        const tx = document.getElementById('mem-tx').value;
        if (!ev || !tx) return ui.toast("Compila tutto!", "error");
        
        const { error } = await _sb.from('archivio').insert([{ evento: ev, luogo: pl, aneddoto: tx, status: 'pending' }]);
        
        if(error) { ui.toast("Errore invio", "error"); }
        else {
            ui.toast("Inviato agli amministratori!", "success");
            ui.closeModals();
        }
    }
};

// --- ADMIN ---
const admin = {
    tab(t) {
        document.querySelectorAll('.admin-tab').forEach(e => e.classList.add('hidden'));
        document.getElementById(`admin-tab-${t}`).classList.remove('hidden');
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
    async checkMod() {
        const { data } = await _sb.from('archivio').select('*').eq('status', 'pending');
        if (data && data.length) {
            document.getElementById('mod-badge').innerText = data.length;
            document.getElementById('mod-badge').classList.remove('hidden');
            archive.render(data, 'mod-list', true);
        } else {
            document.getElementById('mod-badge').classList.add('hidden');
            document.getElementById('mod-list').innerHTML = "<p class='text-gray-400 italic text-center py-4'>Tutto tranquillo.</p>";
        }
    },
    async renderHistory() {
        const { data } = await _sb.from('archivio').select('*').order('created_at', { ascending: false });
        if(!data || data.length === 0) {
            document.getElementById('history-list').innerHTML = "<p class='text-gray-400 text-center'>Nessun ricordo nel diario.</p>";
            return;
        }
        document.getElementById('history-list').innerHTML = data.map(m => `
            <div class="bg-gray-50 p-3 rounded border border-gray-200 flex justify-between items-start">
                <div>
                    <div class="flex items-center gap-2 mb-1">
                        <span class="text-[10px] font-mono text-gray-400">${new Date(m.created_at).toLocaleDateString()}</span>
                        <span class="text-xs font-bold px-2 py-0.5 rounded ${m.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'} uppercase">${m.status === 'approved' ? 'Pubblicato' : 'In Attesa'}</span>
                    </div>
                    <div class="font-bold text-gray-800 text-sm">${m.evento} <span class="font-normal text-gray-500">(${m.luogo})</span></div>
                    <div class="text-xs text-gray-600 italic mt-1 line-clamp-1">"${m.aneddoto}"</div>
                </div>
                <div class="flex flex-col gap-1">
                    ${m.status !== 'approved' ? `<button onclick="admin.memAction('${m.id}', 'approved')" class="text-green-600 text-xs font-bold hover:underline">Approva</button>` : ''}
                    <button onclick="admin.memAction('${m.id}', 'del')" class="text-red-500 text-xs font-bold hover:underline">Elimina</button>
                </div>
            </div>
        `).join('');
    },
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
    async memAction(id, action) {
        if (action === 'del') {
            if(!confirm("Cancellare definitivamente questo ricordo?")) return;
            await _sb.from('archivio').delete().eq('id', id);
        } else {
            await _sb.from('archivio').update({ status: 'approved' }).eq('id', id);
        }
        this.checkMod();
        this.renderHistory();
        ui.toast("Fatto", "success");
    }
};

// --- AUTH & UI ---
const auth = {
    async check() {
        const { data: { user } } = await _sb.auth.getUser();
        if (user) {
            state.user = user;
            document.getElementById('nav-public').classList.add('hidden');
            document.getElementById('nav-admin').classList.remove('hidden');
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
    }
};

app.init();            
