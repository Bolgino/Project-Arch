const { createClient } = require('@supabase/supabase-js');

// Assicurati che il tuo file keep-alive.yml passi queste variabili d'ambiente
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY; // Usa la Service Role Key o la Anon Key

if (!supabaseUrl || !supabaseKey) {
  console.error('Errore: Variabili SUPABASE_URL o SUPABASE_KEY mancanti.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function pingDatabase() {
  try {
    console.log('Inizio attività sul database per prevenire la pausa...');

    // 1. Inserisce un nuovo record (Operazione di Scrittura)
    const { data: insertData, error: insertError } = await supabase
      .from('keep_alive')
      .insert([{ pinged_at: new Date().toISOString() }])
      .select();

    if (insertError) throw insertError;
    console.log('Scrittura completata con successo. ID Record:', insertData[0].id);

    // 2. Cancella il record appena creato (Operazione di Pulizia)
    const { error: deleteError } = await supabase
      .from('keep_alive')
      .delete()
      .eq('id', insertData[0].id);

    if (deleteError) throw deleteError;
    console.log('Pulizia completata. Il database non accumulerà dati extra.');

    console.log('Ping completato: simulazione di attività reale riuscita!');
    
  } catch (error) {
    console.error('Errore durante le operazioni sul database:', error.message);
    process.exit(1);
  }
}

pingDatabase();
