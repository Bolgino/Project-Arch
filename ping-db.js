const { createClient } = require('@supabase/supabase-js');

// Queste variabili verranno prese dai "Secrets" di GitHub
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function ping() {
  console.log('Tentativo di risveglio database...');
  
  // Facciamo una query reale sulla tabella cambusa
  const { data, error } = await supabase
    .from('cambusa')
    .select('id')
    .limit(1);

  if (error) {
    console.error('Errore durante il ping:', error.message);
    process.exit(1);
  }
  
  console.log('Database risvegliato con successo!');
}

ping();
