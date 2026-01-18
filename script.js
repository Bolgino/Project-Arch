// --- CONFIGURAZIONE ---
const CONFIG = {
    url: "https://jmildwxjaviqkrkhjzhl.supabase.co",
    key: "sb_publishable_PwYQxh8l7HLR49EC_wHa7A_gppKi_FS", 
    adminEmail: "marcobolge@gmail.com",
    bucket: "immagini-oggetti"
};

const _sb = supabase.createClient(CONFIG.url, CONFIG.key);

// --- STATO ---
const state = { cart: [], products: [], packs: [], user: null };

// --- APP CONTROLLER ---
const app = {
    async init() {
        await auth.check();
        this.loadData();
    },

    async loadData() {
        const { data: p } = await _sb.from('oggetti').select('*').order('nome');
        const { data: k } = await _sb.from('pacchetti').select('*');
        state.products = p || [];
        state.packs = k || [];
        
        if (state.user) {
            admin.renderStock();
            admin.renderPackBuilder();
            admin.checkMod();
        } else {
            this.renderShop();
            archive.load();
        }
    },

    nav(view) {
        document.querySelectorAll('section').forEach(el => el.classList.add('hidden'));
        document.getElementById(`view-${view}`).classList.remove('hidden');
    },

    renderShop() {
        // --- RENDER PRODOTTI SINGOLI ---
        document.getElementById('shop-products').innerHTML = state.products.map(p => `
            <div class="bg-white rounded-lg shadow-sm border overflow-hidden hover:shadow-md transition flex flex-col h-full group">
                <div class="h-32 bg-gray-50 p-2 relative">
                    <img src="${p.foto_url || 'https://placehold.co/200?text=📦'}" class="w-full h-full object-contain mix-blend-multiply">
                    ${p.quantita_disponibile <= p.soglia_minima ? 
                        '<span class="absolute top-1 right-1 bg-red-100 text-red-600 text-[10px] font-bold px-2 rounded-full border border-red-200">SCARSO</span>' 
                        : ''}
                </div>
                
                <div class="p-3 flex flex-col flex-grow">
                    <h4 class="font-bold text-sm leading-tight mb-1 text-gray-800">${p.nome}</h4>
                    <p class="text-xs text-gray-500 mb-3 font-mono">Disponibili: ${p.quantita_disponibile}</p>
                    
                    <div class="mt-auto flex items-center gap-2">
                        <input type="number" id="shop-qty-${p.id}" value="1" min="1" max="${p.quantita_disponibile}" 
                               class="w-12 p-1 text-center border rounded text-sm focus:ring-2 focus:ring-green-500 outline-none">
                        
                        <button onclick="const q = document.getElementById('shop-qty-${p.id}').value; cart.add('${p.id}', '${p.nome}', 'item', parseInt(q), ${p.quantita_disponibile})" 
                                class="flex-1 bg-green-100 text-green-800 text-xs font-bold py-1.5 rounded hover:bg-green-700 hover:text-white transition">
                            AGGIUNGI
                        </button>
                    </div>
                </div>
            </div>
        `).join('');

        // --- RENDER PACCHETTI (Resta uguale o aggiungiamo qty anche qui) ---
        document.getElementById('shop-packs').innerHTML = state.packs.map(p => `
            <div class="bg-yellow-50 p-4 rounded-lg border border-yellow-200 flex justify-between items-center shadow-sm">
                <div>
                    <h4 class="font-bold text-yellow-900 leading-tight">${p.nome}</h4>
                    <span class="text-[10px] uppercase tracking-wide text-yellow-700 font-bold">Kit Completo</span>
                </div>
                <div class="flex items-center gap-2">
                    <input type="number" id="pack-qty-${p.id}" value="1" min="1" max="50" class="w-10 p-1 text-center border border-yellow-300 rounded text-xs bg-white">
                    <button onclick="const q = document.getElementById('pack-qty-${p.id}').value; cart.add('${p.id}', '${p.nome}', 'pack', parseInt(q), 999)" 
                            class="bg-yellow-400 text-black px-3 py-1.5 rounded text-xs font-bold hover:bg-yellow-500 shadow-sm">
                        +
                    </button>
                </div>
            </div>
        `).join('');
    },

    async checkout() {
        const name = document.getElementById('checkout-name').value;
        if (!name || state.cart.length === 0) return ui.toast("Nome o carrello vuoto", "error");

        ui.toast("Elaborazione...", "info");
        let details = `<h3>Prelievo di: ${name}</h3><ul>`;

        for (let i of state.cart) {
            if (i.type === 'item') {
                const nQ = i.max - i.qty;
                await _sb.from('oggetti').update({ quantita_disponibile: nQ }).eq('id', i.id);
                details += `<li>${i.name} <b>(${i.qty})</b></li>`;
            } else {
                const { data: comps } = await _sb.from('componenti_pacchetto').select('*, oggetti(*)').eq('pacchetto_id', i.id);
                for (let c of comps) {
                    await _sb.from('oggetti').update({ quantita_disponibile: c.oggetti.quantita_disponibile - c.quantita_necessaria }).eq('id', c.oggetto_id);
                }
                details += `<li>KIT ${i.name}</li>`;
            }
        }
        details += `</ul>`;

        await fetch(`${CONFIG.url}/functions/v1/notify-admin`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${CONFIG.key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ details, admin_email: CONFIG.adminEmail })
        });

        cart.empty();
        ui.toggleCart();
        ui.toast("Ordine Inviato!", "success");
        setTimeout(() => location.reload(), 1500);
    }
};

// --- CART LOGIC ---
const cart = {
    add(id, name, type, qty, max) {
        const exists = state.cart.find(x => x.id === id);
        if (exists) {
            if (exists.qty + qty > max) return ui.toast("Max disponibile raggiunto", "error");
            exists.qty += qty;
        } else {
            state.cart.push({ id, name, type, qty, max });
        }
        this.render();
        ui.toast(`${name} aggiunto`, "success");
    },
    remove(idx) { state.cart.splice(idx, 1); this.render(); },
    empty() { state.cart = []; this.render(); },
    render() {
        document.getElementById('cart-count').innerText = state.cart.length;
        document.getElementById('cart-items').innerHTML = state.cart.length ? state.cart.map((i, idx) => `
            <div class="flex justify-between items-center bg-gray-50 p-2 rounded border">
                <div class="text-sm">
                    <span class="font-bold">${i.name}</span>
                    <span class="text-gray-500 text-xs ml-1">(${i.qty})</span>
                </div>
                <button onclick="cart.remove(${idx})" class="text-red-500 font-bold px-2">&times;</button>
            </div>
        `).join('') : '<p class="text-gray-400 text-center text-sm">Vuoto</p>';
    }
};

// --- ARCHIVE ---
const archive = {
    async load() {
        const { data } = await _sb.from('archivio').select('*').eq('status', 'approved').order('created_at', { ascending: false });
        this.render(data, 'archive-list');
    },
    render(data, elId, isAdmin = false) {
        const el = document.getElementById(elId);
        if (!data || !data.length) { el.innerHTML = '<p class="text-gray-400 italic text-center">Nessun ricordo.</p>'; return; }
        el.innerHTML = data.map(m => `
            <div class="bg-white p-4 rounded-lg shadow-sm border border-l-4 border-l-green-600">
                <div class="flex justify-between">
                    <h4 class="font-bold text-green-900">${m.evento}</h4>
                    ${isAdmin ? `<div class="flex gap-2"><button onclick="admin.memAction('${m.id}', 'approved')" class="text-green-600 text-xs font-bold">OK</button><button onclick="admin.memAction('${m.id}', 'del')" class="text-red-600 text-xs font-bold">DEL</button></div>` : `<small class="text-gray-400">${m.luogo}</small>`}
                </div>
                <p class="text-gray-600 text-sm mt-1 italic">"${m.aneddoto}"</p>
            </div>
        `).join('');
    },
    async submit() {
        const ev = document.getElementById('mem-ev').value;
        const pl = document.getElementById('mem-pl').value;
        const tx = document.getElementById('mem-tx').value;
        if (!ev || !tx) return ui.toast("Compila tutto", "error");
        await _sb.from('archivio').insert([{ evento: ev, luogo: pl, aneddoto: tx, status: 'pending' }]);
        ui.toast("Inviato!", "success"); ui.closeModals();
    }
};

// --- ADMIN ---
const admin = {
    tab(t) {
        document.querySelectorAll('.admin-tab').forEach(e => e.classList.add('hidden'));
        document.getElementById(`admin-tab-${t}`).classList.remove('hidden');
    },
    renderStock() {
        document.getElementById('admin-stock-list').innerHTML = state.products.map(p => `
            <div class="flex justify-between items-center py-2 border-b">
                <div class="flex items-center gap-2">
                    <img src="${p.foto_url || ''}" class="w-8 h-8 object-contain bg-gray-100 rounded">
                    <div>
                        <div class="font-bold">${p.nome}</div>
                        <div class="text-xs text-gray-500">Qty: ${p.quantita_disponibile} | Min: ${p.soglia_minima}</div>
                    </div>
                </div>
                <button onclick="admin.openEdit('${p.id}')" class="text-blue-600 text-xs font-bold bg-blue-50 px-2 py-1 rounded">MODIFICA</button>
            </div>
        `).join('');
    },
    openEdit(id) {
        const p = state.products.find(x => x.id === id);
        document.getElementById('modal-prod-title').innerText = "Modifica Prodotto";
        document.getElementById('prod-id').value = id;
        document.getElementById('prod-name').value = p.nome;
        document.getElementById('prod-qty').value = p.quantita_disponibile;
        document.getElementById('prod-min').value = p.soglia_minima;
        document.getElementById('prod-img').value = p.foto_url || '';
        document.getElementById('btn-del').classList.remove('hidden');
        ui.modal('modal-prod');
    },
    openNewProd() {
        document.getElementById('modal-prod-title').innerText = "Nuovo Prodotto";
        document.getElementById('prod-id').value = "";
        document.querySelectorAll('#modal-prod input').forEach(i => i.value = "");
        document.getElementById('btn-del').classList.add('hidden');
        ui.modal('modal-prod');
    },
    async saveProd() {
        const id = document.getElementById('prod-id').value;
        const file = document.getElementById('prod-file').files[0];
        let imgUrl = document.getElementById('prod-img').value;

        // UPLOAD LOGIC
        if (file) {
            document.getElementById('upload-loader').classList.remove('hidden');
            const fileName = `${Date.now()}_${file.name.replace(/\s/g, '')}`;
            const { error } = await _sb.storage.from(CONFIG.bucket).upload(fileName, file);
            if (!error) {
                const { data } = _sb.storage.from(CONFIG.bucket).getPublicUrl(fileName);
                imgUrl = data.publicUrl;
            } else {
                alert("Errore Upload: " + error.message);
            }
            document.getElementById('upload-loader').classList.add('hidden');
        }

        const data = {
            nome: document.getElementById('prod-name').value,
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
    // Packs & Mod
    renderPackBuilder() {
        document.getElementById('pack-items').innerHTML = state.products.map(p => `
            <label class="flex items-center gap-2 text-xs p-1 border rounded"><input type="checkbox" value="${p.id}" class="pack-chk"> ${p.nome}</label>
        `).join('');
    },
    async createPack() {
        const name = document.getElementById('pack-name').value;
        const chks = document.querySelectorAll('.pack-chk:checked');
        if (!name || !chks.length) return ui.toast("Dati mancanti", "error");
        const { data } = await _sb.from('pacchetti').insert([{ nome: name }]).select();
        const items = Array.from(chks).map(c => ({ pacchetto_id: data[0].id, oggetto_id: c.value, quantita_necessaria: 1 }));
        await _sb.from('componenti_pacchetto').insert(items);
        ui.toast("Kit Creato", "success"); app.loadData();
    },
    async checkMod() {
        const { data } = await _sb.from('archivio').select('*').eq('status', 'pending');
        if (data.length) {
            document.getElementById('mod-badge').innerText = data.length;
            document.getElementById('mod-badge').classList.remove('hidden');
            archive.render(data, 'mod-list', true);
        } else {
            document.getElementById('mod-badge').classList.add('hidden');
            document.getElementById('mod-list').innerHTML = "<p class='text-gray-400 italic'>Nulla da approvare.</p>";
        }
    },
    async memAction(id, action) {
        if (action === 'del') await _sb.from('archivio').delete().eq('id', id);
        else await _sb.from('archivio').update({ status: 'approved' }).eq('id', id);
        this.checkMod();
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
    closeModals() { document.querySelectorAll('[id^="modal"]').forEach(m => m.classList.add('hidden')); },
    toggleCart() { document.getElementById('cart-sidebar').classList.toggle('translate-x-full'); },
    toast(msg, type) {
        const t = document.createElement('div');
        t.className = `px-4 py-2 rounded shadow-lg text-white text-sm font-bold ${type === 'error' ? 'bg-red-500' : 'bg-green-600'}`;
        t.innerText = msg;
        document.getElementById('toast-container').appendChild(t);
        setTimeout(() => t.remove(), 3000);
    }
};

app.init();
