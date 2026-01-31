// --- CONFIGURAZIONE ---
const CONFIG = {
    url: "https://jmildwxjaviqkrkhjzhl.supabase.co", 
    key: "sb_publishable_PwYQxh8l7HLR49EC_wHa7A_gppKi_FS", 
    adminEmail: "marcobolge@gmail.com",
    bucket: "immagini-oggetti"
};

// --- DEFINIZIONE REPARTI (Scalabile) ---
const DEPARTMENTS = {
    armadio: {
        id: 'armadio',
        label: 'Armadio',
        color: 'green', // Classi Tailwind (bg-green-600, text-green-900)
        icon: '⚜️', 
        titles: { 
            shop: 'Uniformi & Distintivi', 
            sub: 'Promesse, Specialità, Distintivi e Patacche' 
        }
    },
    cambusa: {
        id: 'cambusa',
        label: 'Cambusa',
        color: 'orange', // Classi Tailwind (bg-orange-600, text-orange-900)
        icon: '🍝',
        titles: { 
            shop: 'Cambusa di Gruppo', 
            sub: 'Cibo, scatolame, ingredienti e consumabili' 
        }
    }
};

const _sb = supabase.createClient(CONFIG.url, CONFIG.key);

// --- STATO ---
const state = { 
    cart: [], 
    products: [], 
    packs: [], 
    packComponents: [], 
    user: null, 
    currentCategory: 'all',
    currentScope: null // 'armadio' o 'cambusa'
};

// --- LOADER ---
const loader = {
    phrases: ["Cucio i distintivi...", "Conto le scatolette...", "Verifico le taglie...", "Preparo il menù...", "Lucido gli scarponi...", "Controllo la scadenza...", "Stiro il fazzolettone...", "Accendo il fuoco...", "Calcolo l'azimut..."],
    show() {
        const el = document.getElementById('scout-loader');
        const txt = document.getElementById('loader-text');
        txt.innerText = this.phrases[Math.floor(Math.random() * this.phrases.length)];
        el.classList.remove('pointer-events-none', 'opacity-0');
    },
    hide() {
        setTimeout(() => {
            document.getElementById('scout-loader').classList.add('opacity-0', 'pointer-events-none');
        }, 1000); 
    }
};

// --- APP CONTROLLER ---
const app = {
    async init() {
        loader.show(); 
        await auth.check();
        
        // Se Admin loggato, default su Armadio, ma l'interfaccia si aggiornerà
        if (state.user) {
            await this.setScope('armadio'); 
        } else {
            this.nav('home');
            loader.hide();
        }
        
        pwa.init(); 
    },

    // CAMBIO REPARTO (Armadio <-> Cambusa)
    async setScope(scopeId) {
        if (!DEPARTMENTS[scopeId]) return;
        state.currentScope = scopeId;
        
        loader.show();
        
        // 1. Aggiorna Grafica e Testi
        this.updateTheme(DEPARTMENTS[scopeId]);
        
        // 2. Svuota carrello (per non mischiare patacche e pasta)
        cart.empty();

        // 3. Carica i dati dal DB filtrati
        await this.loadData();
        
        // 4. Navigazione e aggiornamento UI Admin
        if (state.user) {
            admin.refreshUI(); // Aggiorna le scritte Q.G.
            this.nav('admin');
        } else {
            this.nav('shop');
        }
        
        loader.hide();
    },

    updateTheme(dept) {
        // Aggiorna Navbar
        const nav = document.querySelector('nav');
        nav.className = `bg-${dept.color}-900 text-white sticky top-0 z-50 shadow-xl border-b-4 border-yellow-500 shrink-0 transition-colors duration-500`;

        // Aggiorna Titoli Vista Shop (Pubblica)
        const shopTitle = document.querySelector('#view-shop h1');
        const shopSub = document.querySelector('#view-shop p');
        if(shopTitle) {
            shopTitle.innerText = dept.titles.shop;
            shopTitle.className = `text-2xl md:text-4xl font-extrabold text-${dept.color}-900`;
        }
        if(shopSub) shopSub.innerText = dept.titles.sub;

        // Aggiorna Icona Menu Mobile
        const menuIcon = document.getElementById('menu-icon-shop');
        const menuText = document.getElementById('menu-text-shop');
        if(menuIcon) menuIcon.innerText = dept.icon;
        if(menuText) menuText.innerText = dept.label; // "Armadio" o "Cambusa"
    },

    async loadData() {
        // FILTRO: Scarica solo oggetti del magazzino corrente
        const { data: p } = await _sb.from('oggetti')
            .select('*')
            .eq('magazzino', state.currentScope)
            .order('nome');
        state.products = p || [];
        
        const { data: k } = await _sb.from('pacchetti')
            .select('*')
            .eq('magazzino', state.currentScope);
        state.packs = k || [];
        
        // I componenti non hanno magazzino, si filtrano in base ai pacchetti caricati
        const { data: c } = await _sb.from('componenti_pacchetto').select('*');
        state.packComponents = c || [];
        
        if (state.user) {
            admin.refreshAll(); // Ricarica tutte le liste admin
        } else {
            this.renderShop();
        }
    },

    nav(view) {
        document.querySelectorAll('section').forEach(el => el.classList.add('hidden'));
        document.getElementById(`view-${view}`).classList.remove('hidden');
        window.scrollTo(0,0);

        // Reset navbar verde se torno alla home
        if(view === 'home') {
            document.querySelector('nav').className = `bg-green-900 text-white sticky top-0 z-50 shadow-xl border-b-4 border-yellow-500 shrink-0`;
        }
        
        if (view === 'wishlist') wishlist.load();
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
        if(noRes) (visibleCount === 0 && term !== '') ? noRes.classList.remove('hidden') : noRes.classList.add('hidden');
    },

    renderShop() {
        const currentDept = DEPARTMENTS[state.currentScope];
        const color = currentDept.color;

        document.getElementById('shop-products').innerHTML = state.products.map(p => {
            let statusBadge = '';
            const isOut = p.quantita_disponibile <= 0;
            const isLow = !isOut && p.quantita_disponibile <= p.soglia_minima;

            if (isOut) statusBadge = '<span class="absolute top-2 right-2 bg-gray-800 text-white text-[10px] font-bold px-2 py-0.5 rounded-full z-10">ESAURITO</span>';
            else if (isLow) statusBadge = '<span class="absolute top-2 right-2 bg-red-100 text-red-600 text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse z-10">SCORTA BASSA</span>';

            const btnClass = isOut ? 'bg-gray-400 cursor-not-allowed' : `bg-${color}-600 hover:bg-${color}-700`;

            return `
            <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-lg transition flex flex-col h-full group" data-category="${p.categoria || 'Generale'}">
                <div class="h-28 md:h-32 bg-gray-50 p-4 relative flex items-center justify-center">
                    <img src="${p.foto_url || `https://placehold.co/200?text=${currentDept.icon}`}" class="max-h-full max-w-full object-contain mix-blend-multiply ${isOut?'grayscale opacity-50':''}">
                    ${statusBadge}
                </div>
                <div class="p-3 flex flex-col flex-grow">
                    <div class="flex justify-between items-start mb-1">
                        <span class="text-[9px] font-bold uppercase text-gray-400 border px-1 rounded">${p.categoria || 'Gen'}</span>
                    </div>
                    <h4 class="font-bold text-sm leading-tight mb-1 text-gray-800 line-clamp-2 uppercase">${p.nome}</h4>
                    <p class="text-xs text-gray-500 mb-3 font-mono">Disponibili: <span class="${isOut ? 'text-red-600' : `text-${color}-700`} font-bold text-lg">${p.quantita_disponibile}</span></p>
                    <div class="mt-auto flex items-center gap-1">
                        <input type="number" id="shop-qty-${p.id}" value="1" min="1" max="${p.quantita_disponibile}" ${isOut ? 'disabled' : ''} class="w-12 p-2 text-center border rounded-lg text-sm bg-gray-50 font-bold">
                        <button ${isOut ? 'disabled' : ''} onclick="cart.add('${p.id}', '${p.nome}', 'item', document.getElementById('shop-qty-${p.id}').value, ${p.quantita_disponibile})" class="flex-1 text-white text-xs font-bold py-2.5 rounded-lg transition ${btnClass}">
                            ${isOut ? 'NO' : 'PRENDI'}
                        </button>
                    </div>
                </div>
            </div>`;
        }).join('');
        
        // Render Pacchetti/Kit
        document.getElementById('shop-packs').innerHTML = state.packs.map(p => {
             const comps = state.packComponents.filter(c => c.pacchetto_id === p.id);
             let maxQty = 9999;
             if (comps.length === 0) maxQty = 0;
             comps.forEach(c => {
                const item = state.products.find(x => x.id === c.oggetto_id);
                if(item) {
                    const possible = Math.floor(item.quantita_disponibile / c.quantita_necessaria);
                    if(possible < maxQty) maxQty = possible;
                } else maxQty = 0;
             });
             const isOut = maxQty <= 0;
             const btnClass = isOut ? 'bg-gray-400 cursor-not-allowed' : 'bg-yellow-400 text-yellow-900 hover:bg-yellow-500';
             
             return `
            <div class="bg-yellow-50 p-4 rounded-xl border-l-4 border-yellow-400 flex justify-between items-center shadow-sm">
                <div><h4 class="font-bold text-yellow-900">🎁 ${p.nome}</h4><span class="text-[10px] text-yellow-700 font-bold">${isOut ? 'NON DISPONIBILE' : `DISPONIBILI: ${maxQty}`}</span></div>
                <button ${isOut?'disabled':''} onclick="cart.add('${p.id}', '${p.nome}', 'pack', 1, ${maxQty})" class="${btnClass} px-4 py-2 rounded-lg text-xs font-bold shadow-sm">PRENDI</button>
            </div>`;
        }).join('');
    },

    async checkout() {
        const name = document.getElementById('checkout-name').value;
        if (!name || state.cart.length === 0) return ui.toast("Zaino vuoto o nome mancante!", "error");
    
        loader.show(); 
        const dept = DEPARTMENTS[state.currentScope];
        let details = `<h3>Prelievo [${dept.label}] di: ${name}</h3><ul>`;
        let logDetails = [];
        let urgentAlerts = ""; 
    
        for (let i of state.cart) {
            if (i.type === 'item') {
                const nQ = i.max - i.qty;
                await _sb.from('oggetti').update({ quantita_disponibile: nQ }).eq('id', i.id);
                
                const originalProd = state.products.find(p => p.id === i.id);
                if (nQ <= originalProd.soglia_minima) urgentAlerts += `<p style="color:red">⚠️ ${i.name} in esaurimento (${nQ})</p>`;
                details += `<li>${i.name} <b>(${i.qty})</b></li>`;
                logDetails.push(`${i.name} x${i.qty}`);
            } else {
                 const { data: comps } = await _sb.from('componenti_pacchetto').select('*, oggetti(*)').eq('pacchetto_id', i.id);
                 for (let c of comps) {
                    const nuovaQta = c.oggetti.quantita_disponibile - c.quantita_necessaria;
                    await _sb.from('oggetti').update({ quantita_disponibile: nuovaQta }).eq('id', c.oggetto_id);
                 }
                 logDetails.push(`KIT ${i.name}`);
                 details += `<li>KIT ${i.name}</li>`;
            }
        }
        details += `</ul>${urgentAlerts}`;
    
        await _sb.from('movimenti').insert([{ 
            utente: name, 
            dettagli: logDetails.join(', '), 
            magazzino: state.currentScope // SALVA NEL REPARTO GIUSTO
        }]);
    
        try {
            await fetch(`${CONFIG.url}/functions/v1/notify-admin`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${CONFIG.key}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ details, admin_email: CONFIG.adminEmail })
            });
        } catch(e) {}
    
        cart.empty();
        ui.toggleCart();
        loader.hide();
        ui.toast("Prelievo registrato!", "success");
        setTimeout(() => app.loadData(), 1000); 
    }
};

// --- CART ---
const cart = {
    add(id, name, type, qtyVal, max) {
        const qty = parseInt(qtyVal);
        if (max <= 0) return ui.toast("Esaurito!", "error");
        if(isNaN(qty) || qty < 1) return ui.toast("Quantità invalida", "error");
        
        const exists = state.cart.find(x => x.id === id);
        if (exists) {
            if (exists.qty + qty > max) return ui.toast("Non basta!", "error");
            exists.qty += qty;
        } else {
            if (qty > max) return ui.toast("Troppo!", "error");
            state.cart.push({ id, name, type, qty, max });
        }
        this.render();
        ui.toast("Aggiunto!", "success");
    },
    remove(idx) { state.cart.splice(idx, 1); this.render(); },
    empty() { state.cart = []; this.render(); },
    render() {
        const deptColor = state.currentScope ? DEPARTMENTS[state.currentScope].color : 'green';
        document.getElementById('cart-count-mobile').innerText = state.cart.length;
        document.getElementById('cart-items').innerHTML = state.cart.map((i, idx) => `
            <div class="bg-white p-3 rounded shadow-sm border-l-4 border-${deptColor}-600 flex justify-between items-center">
                <div><div class="font-bold">${i.name}</div><div class="text-xs">Quantità: ${i.qty}</div></div>
                <button onclick="cart.remove(${idx})" class="text-red-500 font-bold">🗑</button>
            </div>`).join('');
    }
};

// --- ADMIN ---
const admin = {
    // AGGIORNA LE SCRITTE Q.G. IN BASE AL REPARTO
    refreshUI() {
        if(!state.currentScope) return;
        const dept = DEPARTMENTS[state.currentScope];
        
        // 1. Aggiorna Titolo Principale Admin (Q.G. ARMADIO / Q.G. CAMBUSA)
        const adminHeader = document.querySelector('#view-admin h2');
        if(adminHeader) {
            adminHeader.innerText = `Q.G. ${dept.label.toUpperCase()}`;
            adminHeader.parentElement.className = `col-span-2 lg:col-auto bg-white p-3 rounded-lg shadow text-center border-l-4 border-${dept.color}-600 mb-0 lg:mb-2`;
        }
        
        // 2. Aggiorna il testo del pulsante Stock
        const stockBtn = document.querySelector(`button[onclick="admin.tab('stock')"]`);
        if(stockBtn) {
            stockBtn.innerHTML = `📦 ${dept.label}`; 
        }
        
        // 3. Aggiorna Titolo interno alla tab stock
        const stockTitle = document.querySelector('#admin-tab-stock h3');
        if(stockTitle) {
            stockTitle.innerText = `Inventario ${dept.label}`;
            stockTitle.className = `font-bold text-xl text-${dept.color}-900`;
        }
    },

    refreshAll() {
        this.refreshUI();
        this.renderStock();
        this.renderRestock();
        this.renderPackBuilder();
        this.renderMovements();
        this.renderRequests();
    },

    switchScopeFromAdmin() {
        const newScope = state.currentScope === 'armadio' ? 'cambusa' : 'armadio';
        app.setScope(newScope);
    },

    tab(t) {
        document.querySelectorAll('.admin-tab').forEach(e => e.classList.add('hidden'));
        document.getElementById(`admin-tab-${t}`).classList.remove('hidden');
    },
    
    // --- STOCK ---
    renderStock() {
        const dept = DEPARTMENTS[state.currentScope];
        document.getElementById('admin-total-count').innerText = state.products.length;
        document.getElementById('admin-stock-list').innerHTML = state.products.map(p => `
            <div class="flex justify-between items-center py-3 border-b">
                <div class="flex items-center gap-3">
                    <div class="font-bold text-gray-800">${p.nome}</div>
                    <div class="text-xs text-gray-500 font-mono">Qty: ${p.quantita_disponibile}</div>
                </div>
                <button onclick="admin.openEdit('${p.id}')" class="text-${dept.color}-600 text-xs font-bold border border-${dept.color}-200 bg-${dept.color}-50 px-3 py-1 rounded">MODIFICA</button>
            </div>`).join('');
    },
    filterStock() {
        const term = document.getElementById('admin-search-bar').value.toLowerCase().trim();
        document.querySelectorAll('#admin-stock-list > div').forEach(r => {
            r.classList.toggle('hidden', !r.innerText.toLowerCase().includes(term));
            r.classList.toggle('flex', r.innerText.toLowerCase().includes(term));
        });
    },

    // --- RIFORNIMENTO ---
    renderRestock() {
        document.getElementById('admin-restock-list').innerHTML = state.products.map(p => `
            <div class="bg-white border rounded-lg p-3 flex justify-between items-center shadow-sm">
                <div class="truncate pr-2"><div class="font-bold text-sm text-gray-700 truncate">${p.nome}</div><div class="text-xs text-gray-400">Attuali: ${p.quantita_disponibile}</div></div>
                <div class="flex items-center bg-blue-50 rounded-lg px-2 py-1 border border-blue-100">
                    <span class="text-blue-600 text-xs font-bold mr-2">+</span>
                    <input type="number" min="0" placeholder="0" data-id="${p.id}" data-current="${p.quantita_disponibile}" class="restock-input w-16 p-1 text-center bg-transparent outline-none font-bold">
                </div>
            </div>`).join('');
    },
    filterRestock() {
        const term = document.getElementById('search-restock').value.toLowerCase();
        document.querySelectorAll('#admin-restock-list > div').forEach(el => el.classList.toggle('hidden', !el.innerText.toLowerCase().includes(term)));
    },
    async processRestock() {
        const inputs = document.querySelectorAll('.restock-input');
        let updates = [];
        inputs.forEach(inp => {
            const val = parseInt(inp.value);
            if(val > 0) updates.push(_sb.from('oggetti').update({ quantita_disponibile: parseInt(inp.dataset.current) + val }).eq('id', inp.dataset.id));
        });
        if(updates.length) { await Promise.all(updates); ui.toast("Rifornito!", "success"); app.loadData(); }
    },
    
    // --- EDITOR PRODOTTO ---
    openEdit(id) {
        const p = state.products.find(x => x.id === id);
        document.getElementById('modal-prod-title').innerText = "Modifica Oggetto";
        document.getElementById('prod-id').value = id;
        document.getElementById('prod-name').value = p.nome;
        document.getElementById('prod-cat').value = p.categoria || 'Generale';
        document.getElementById('prod-qty').value = p.quantita_disponibile;
        document.getElementById('prod-min').value = p.soglia_minima;
        document.getElementById('prod-img').value = p.foto_url || '';
        document.getElementById('prod-img-preview').src = p.foto_url || '';
        document.getElementById('btn-del').classList.remove('hidden');
        ui.modal('modal-prod');
    },
    openNewProd() {
        document.getElementById('modal-prod-title').innerText = "Nuovo Oggetto";
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
            foto_url: imgUrl,
            magazzino: state.currentScope // SALVA NEL REPARTO CORRENTE
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
    
    // --- KIT (GESTIONE COMPLETA) ---
    renderPackBuilder() {
         document.getElementById('pack-items').innerHTML = state.products.map(p => `
            <label class="flex items-center gap-2 text-xs p-2 border rounded hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" value="${p.id}" class="pack-chk accent-yellow-500 w-4 h-4"> <span class="font-medium">${p.nome}</span>
            </label>`).join('');
         
         document.getElementById('admin-packs-list').innerHTML = state.packs.map(k => `
            <div class="flex justify-between items-center bg-white p-3 border rounded-lg shadow-sm hover:shadow-md transition">
                <span class="font-bold text-sm text-gray-700 flex items-center gap-2">🎁 ${k.nome}</span>
                <div class="flex gap-2">
                    <button onclick="admin.openEditPack('${k.id}')" class="text-blue-500 hover:text-blue-700 text-xs font-bold border border-blue-200 px-3 py-1.5 rounded hover:bg-blue-50 transition">MODIFICA</button>
                    <button onclick="admin.deletePack('${k.id}')" class="text-red-500 hover:text-red-700 text-xs font-bold border border-red-200 px-3 py-1.5 rounded hover:bg-red-50 transition">ELIMINA</button>
                </div>
            </div>`).join('');
    },
    async createPack() {
        const name = document.getElementById('pack-name').value;
        const chks = document.querySelectorAll('.pack-chk:checked');
        if (!name || !chks.length) return ui.toast("Dati mancanti", "error");
        const { data } = await _sb.from('pacchetti').insert([{ nome: name, magazzino: state.currentScope }]).select();
        const items = Array.from(chks).map(c => ({ pacchetto_id: data[0].id, oggetto_id: c.value, quantita_necessaria: 1 }));
        await _sb.from('componenti_pacchetto').insert(items);
        ui.toast("Kit Creato!", "success"); app.loadData();
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
                <input type="checkbox" value="${p.id}" class="edit-pack-chk accent-yellow-500 w-4 h-4" ${currentIds.includes(p.id) ? 'checked' : ''}> <span class="font-medium">${p.nome}</span>
            </label>`).join('');
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
        ui.toast("Kit Aggiornato!", "success"); ui.closeModals(); app.loadData();
    },
    async deletePack(id) {
        if(!confirm("Eliminare Kit?")) return;
        await _sb.from('componenti_pacchetto').delete().eq('pacchetto_id', id);
        await _sb.from('pacchetti').delete().eq('id', id);
        ui.toast("Eliminato", "success"); app.loadData();
    },
    filterPackCreation() {
        const term = document.getElementById('search-pack-create').value.toLowerCase();
        document.querySelectorAll('#pack-items > label').forEach(el => el.classList.toggle('hidden', !el.innerText.toLowerCase().includes(term)));
    },
    filterPackEdit() {
        const term = document.getElementById('search-pack-edit').value.toLowerCase();
        document.querySelectorAll('#edit-kit-items > label').forEach(el => el.classList.toggle('hidden', !el.innerText.toLowerCase().includes(term)));
    },

    // --- MOVIMENTI & RICHIESTE ---
    async renderMovements() {
        const { data } = await _sb.from('movimenti').select('*').eq('magazzino', state.currentScope).order('created_at', { ascending: false });
        const el = document.getElementById('movements-list');
        if(!data || !data.length) { el.innerHTML = "<p class='text-gray-400 text-center text-xs'>Nessun movimento.</p>"; return; }
        el.innerHTML = data.map(m => `
            <div class="bg-gray-50 p-2 rounded border mb-2">
                <div class="flex justify-between font-bold text-sm"><span>${m.utente}</span> <span class="text-xs text-gray-400">${new Date(m.created_at).toLocaleDateString()}</span></div>
                <p class="text-xs text-gray-800">${m.dettagli}</p>
            </div>`).join('');
    },
    filterMovements() {
        const term = document.getElementById('movements-search').value.toLowerCase();
        document.querySelectorAll('#movements-list > div').forEach(el => el.classList.toggle('hidden', !el.innerText.toLowerCase().includes(term)));
    },

    async renderRequests() {
        const { data } = await _sb.from('richieste').select('*').eq('magazzino', state.currentScope).order('created_at', { ascending: false });
        const el = document.getElementById('admin-requests-list');
        if (!data || !data.length) { el.innerHTML = "<p class='text-xs text-gray-400 text-center'>Nessuna richiesta.</p>"; return; }
        el.innerHTML = data.map(r => `
            <div class="bg-pink-50 p-2 rounded border mb-1 flex justify-between">
                <div><div class="font-bold text-sm ${r.completato?'line-through':''}">${r.oggetto}</div><div class="text-[10px]">${r.richiedente}</div></div>
                <div class="flex gap-1"><button onclick="admin.reqAction('${r.id}', 'toggle', ${!r.completato})" class="text-xs bg-white border px-2 rounded">${r.completato?'↩️':'✅'}</button>
                <button onclick="admin.reqAction('${r.id}', 'del')" class="text-xs bg-red-100 text-red-600 px-2 rounded">X</button></div>
            </div>`).join('');
    },
    async reqAction(id, type, val) {
        if(type==='toggle') await _sb.from('richieste').update({completato:val}).eq('id',id);
        else if(type==='del' && confirm('Eliminare?')) await _sb.from('richieste').delete().eq('id',id);
        admin.renderRequests(); wishlist.load();
    }
};

// --- WISHLIST ---
const wishlist = {
    async load() {
        const { data } = await _sb.from('richieste').select('*').eq('magazzino', state.currentScope).order('created_at', { ascending: false });
        this.render(data || []);
    },
    render(data) {
        const el = document.getElementById('wishlist-items');
        if (!data.length) { el.innerHTML = '<p class="text-center text-gray-400 text-xs">Lista vuota!</p>'; return; }
        const isAdmin = state.user !== null;
        el.innerHTML = data.map(item => `
            <div class="bg-white p-4 rounded shadow-sm border-l-4 ${item.completato ? 'border-green-500 opacity-60' : 'border-purple-500'} flex justify-between items-center">
                <div><div class="font-bold text-gray-800 ${item.completato ? 'line-through' : ''}">${item.oggetto}</div><div class="text-xs text-gray-500">👤 ${item.richiedente}</div></div>
                ${isAdmin ? `
                <div class="flex gap-2">
                    <button onclick="wishlist.toggle(${item.id}, ${!item.completato})">${item.completato?'↩️':'✅'}</button>
                    <button onclick="wishlist.delete(${item.id})">🗑</button>
                </div>` : 
                (item.completato ? '✅ PRESO' : '⏳')}
            </div>`).join('');
    },
    async add() {
        const item = document.getElementById('wish-item').value;
        const name = document.getElementById('wish-name').value;
        if (!item || !name) return ui.toast("Dati mancanti", "error");
        await _sb.from('richieste').insert([{ oggetto: item, richiedente: name, magazzino: state.currentScope }]);
        ui.toast("Richiesta inviata!", "success");
        document.getElementById('wish-item').value = '';
        this.load();
    },
    async toggle(id, status) { await _sb.from('richieste').update({ completato: status }).eq('id', id); this.load(); },
    async delete(id) { if(confirm("Eliminare?")) await _sb.from('richieste').delete().eq('id', id); this.load(); }
};

// --- AUTH, UI, PWA ---
const auth = { 
    check: async () => { 
        const {data:{user}} = await _sb.auth.getUser(); 
        if(user) { 
            state.user = user; 
            document.getElementById('nav-admin-mobile').classList.remove('hidden'); 
            document.getElementById('nav-admin-mobile').classList.add('flex'); 
            document.getElementById('btn-login-mobile').classList.add('hidden');
            document.getElementById('nav-btn-shop').classList.add('hidden');
            document.getElementById('nav-btn-wish').classList.add('hidden');
        }
    },
    login: async () => { const {error} = await _sb.auth.signInWithPassword({email:document.getElementById('log-mail').value, password:document.getElementById('log-pass').value}); if(!error) location.reload(); else ui.toast("Errore Login", "error"); },
    logout: () => _sb.auth.signOut().then(() => location.reload())
};

const ui = {
    modal: (id) => document.getElementById(id).classList.remove('hidden'),
    closeModals: () => document.querySelectorAll('[id^="modal"], #login-modal').forEach(m => m.classList.add('hidden')),
    toggleCart: () => document.getElementById('cart-sidebar').classList.toggle('translate-x-full'),
    toggleMenu: () => { document.getElementById('mobile-menu').classList.toggle('hidden'); document.getElementById('mobile-menu-panel').classList.toggle('translate-x-full'); },
    toast: (msg, type) => {
        const t = document.createElement('div'); t.className = `fixed bottom-5 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-full text-white font-bold shadow-xl z-[200] ${type==='error'?'bg-red-500':'bg-green-800'}`;
        t.innerText = msg; document.body.appendChild(t); setTimeout(()=>t.remove(), 3000);
    }
};

const pwa = { 
    init: () => { 
        if('serviceWorker' in navigator) {
             window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));
        }
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            const btn = document.getElementById('btn-install-app');
            if(btn) { btn.classList.remove('hidden'); btn.classList.add('flex'); }
        });
        window.addEventListener('appinstalled', () => {
             ui.toast("App installata!", "success");
             document.getElementById('btn-install-app').classList.add('hidden');
             deferredPrompt = null;
        });
    }, 
    install: async () => { 
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        deferredPrompt = null;
        ui.toggleMenu();
    } 
};
let deferredPrompt;

// FINE SCRIPT
app.init();
