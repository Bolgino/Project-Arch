// cambusa.js
// --- CONFIGURAZIONE ---
const CONFIG = {
    url: "https://jmildwxjaviqkrkhjzhl.supabase.co", 
    key: "sb_publishable_PwYQxh8l7HLR49EC_wHa7A_gppKi_FS", 
    adminEmail: "marcobolge@gmail.com",
    bucket: "immagini-oggetti"
};
const _sb = supabase.createClient(CONFIG.url, CONFIG.key);

console.log("Cambusa caricata. Pronto per il codice.");
