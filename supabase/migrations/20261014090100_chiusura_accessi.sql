-- =====================================================================
-- Project Arch · Migrazione 2 di 2: chiusura del database
-- DA APPLICARE SOLO DOPO che il sito nuovo è online: il sito vecchio
-- scriveva direttamente sulle tabelle e smetterebbe di funzionare.
--
-- Regola generale: tutti leggono, solo l'admin scrive.
-- Eccezioni pubbliche: prelievi e rifornimenti passano dalle funzioni
-- controllate; richieste "Serve!", proposte di prodotti e ricette
-- (solo finché sono "in attesa"), menu dei campi e reparti della spesa.
-- =====================================================================

-- Via tutte le regole vecchie (erano quasi tutte "chiunque fa tutto")
do $$
declare r record;
begin
  for r in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('oggetti', 'pacchetti', 'componenti_pacchetto', 'movimenti_armadio', 'richieste',
                        'cambusa', 'movimenti_cambusa', 'ricette', 'ingredienti_ricetta', 'richieste_cambusa',
                        'magazzino', 'magazzino_cassoni', 'lista_desideri', 'movimenti_magazzino')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- ---------- Armadio ----------
create policy "Tutti leggono" on public.oggetti for select to anon, authenticated using (true);
create policy "Admin scrive" on public.oggetti for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "Tutti leggono" on public.pacchetti for select to anon, authenticated using (true);
create policy "Admin scrive" on public.pacchetti for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "Tutti leggono" on public.componenti_pacchetto for select to anon, authenticated using (true);
create policy "Admin scrive" on public.componenti_pacchetto for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Il registro lo vede e lo tocca solo l'admin (i prelievi lo scrivono tramite preleva_armadio)
create policy "Solo admin" on public.movimenti_armadio for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "Tutti leggono" on public.richieste for select to anon, authenticated using (true);
create policy "Tutti chiedono" on public.richieste for insert to anon, authenticated
  with check (
    coalesce(completato, false) = false
    and coalesce(tipo, 'armadio') = 'armadio'
    and char_length(oggetto) between 1 and 200
    and char_length(coalesce(richiedente, '')) <= 60
    and char_length(coalesce(note, '')) <= 500
  );
create policy "Admin scrive" on public.richieste for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- Cambusa ----------
create policy "Tutti leggono" on public.cambusa for select to anon, authenticated using (true);
create policy "Tutti propongono" on public.cambusa for insert to anon, authenticated
  with check (stato = 'pending' and char_length(nome) between 1 and 80);
create policy "Tutti sistemano le proposte" on public.cambusa for update to anon, authenticated
  using (stato = 'pending') with check (stato = 'pending' and char_length(nome) between 1 and 80);
create policy "Tutti ritirano le proposte" on public.cambusa for delete to anon, authenticated using (stato = 'pending');
create policy "Admin scrive" on public.cambusa for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "Solo admin" on public.movimenti_cambusa for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "Tutti leggono" on public.ricette for select to anon, authenticated using (true);
create policy "Tutti propongono" on public.ricette for insert to anon, authenticated
  with check (status = 'pending' and char_length(nome) between 1 and 80);
create policy "Tutti sistemano le proposte" on public.ricette for update to anon, authenticated
  using (status = 'pending') with check (status = 'pending' and char_length(nome) between 1 and 80);
create policy "Tutti ritirano le proposte" on public.ricette for delete to anon, authenticated using (status = 'pending');
create policy "Admin scrive" on public.ricette for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "Tutti leggono" on public.ingredienti_ricetta for select to anon, authenticated using (true);
create policy "Ingredienti delle proposte" on public.ingredienti_ricetta for all to anon, authenticated
  using (exists (select 1 from public.ricette r where r.id = ricetta_id and r.status = 'pending'))
  with check (exists (select 1 from public.ricette r where r.id = ricetta_id and r.status = 'pending')
              and char_length(nome_ingrediente) between 1 and 80);
create policy "Admin scrive" on public.ingredienti_ricetta for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- Tabelle non più usate dal sito (magazzino tolto, richieste_cambusa mai usata) ----------
create policy "Solo admin" on public.richieste_cambusa for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Solo admin" on public.magazzino for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Solo admin" on public.magazzino_cassoni for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Solo admin" on public.lista_desideri for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Solo admin" on public.movimenti_magazzino for all to authenticated using (public.is_admin()) with check (public.is_admin());
