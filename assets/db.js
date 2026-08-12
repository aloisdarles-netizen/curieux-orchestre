// ============================================================================
// Curieux orchestre — couche de persistence Supabase (remplace localStorage).
// Nécessite le script CDN Supabase chargé AVANT ce fichier :
//   <script src="https://unpkg.com/@supabase/supabase-js@2"></script>
// Toutes les pages appellent les mêmes fonctions qu'avant (loadMusicians,
// saveMusicians, etc.) mais désormais asynchrones — voir MIGRATION dans
// chaque page pour le détail des appels convertis en async/await.
// ============================================================================

const SUPABASE_URL = 'https://nffqcvysweidquouulzs.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_-QZnJEZi01-5fjkjv_2SPw_wODqHcJQ';

const supabaseClient = (typeof window !== 'undefined' && window.supabase)
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

if(!supabaseClient){
  console.error("Supabase non chargé : ajoute <script src=\"https://unpkg.com/@supabase/supabase-js@2\"></script> avant assets/db.js");
}

// --- Adaptateurs JS <-> colonnes SQL (pour les tables à colonnes réelles) ---
const CurieuxDB = (()=>{

  const ADAPTERS = {
    musiciens: {
      toDb: (m)=> ({
        id: m.id,
        prenom: m.prenom || '', nom: m.nom || '',
        instrument: m.instrument || '', pupitre: m.pupitre || 'Autre',
        statut_poste: m.statutPoste || 'titulaire',
        rang: m.rang || null,
        telephone: m.telephone || '', email: m.email || '', notes: m.notes || '',
        disponibilites: m.disponibilites || {},
        disponibilites_commentaires: m.disponibilitesCommentaires || {}
      }),
      fromDb: (r)=> ({
        id: r.id, prenom: r.prenom, nom: r.nom,
        instrument: r.instrument, pupitre: r.pupitre,
        statutPoste: r.statut_poste,
        rang: r.rang || undefined,
        telephone: r.telephone, email: r.email, notes: r.notes,
        disponibilites: r.disponibilites || {},
        disponibilitesCommentaires: r.disponibilites_commentaires || {}
      })
    },
    techniciens: {
      toDb: (t)=> ({
        id: t.id,
        prenom: t.prenom || '', nom: t.nom || '',
        poste: t.poste || '', pole: t.pole || 'Autre',
        statut_poste: t.statutPoste || 'titulaire',
        telephone: t.telephone || '', email: t.email || '', notes: t.notes || '',
        disponibilites: t.disponibilites || {},
        disponibilites_commentaires: t.disponibilitesCommentaires || {}
      }),
      fromDb: (r)=> ({
        id: r.id, prenom: r.prenom, nom: r.nom,
        poste: r.poste, pole: r.pole,
        statutPoste: r.statut_poste || 'titulaire',
        telephone: r.telephone, email: r.email, notes: r.notes,
        disponibilites: r.disponibilites || {},
        disponibilitesCommentaires: r.disponibilites_commentaires || {}
      })
    },
    tournees: {
      toDb: (t)=> ({ id: t.id, nom: t.nom || '', dates: t.dates || [] }),
      fromDb: (r)=> ({ id: r.id, nom: r.nom, dates: r.dates || [] })
    },
    // Liens personnels de demande de dispo envoyés aux titulaires — "id" est le token
    // utilisé dans l'URL du lien (voir dispo-titulaire.html).
    dispo_demandes: {
      toDb: (d)=> ({
        id: d.id, tournee_id: d.tourneeId,
        person_type: d.personType, person_id: d.personId,
        last_responded_at: d.lastRespondedAt || null,
        dates: d.dates || [],
        last_reminder_at: d.lastReminderAt || null
      }),
      fromDb: (r)=> ({
        id: r.id, tourneeId: r.tournee_id,
        personType: r.person_type, personId: r.person_id,
        lastRespondedAt: r.last_responded_at || undefined,
        dates: r.dates || [],
        lastReminderAt: r.last_reminder_at || undefined
      })
    },
    feuilles_route: {
      // La FDR entière (contacts, trajets, planning, lieu, hôtel...) tient dans "data".
      toDb: (f)=> ({ id: f.id, data: f }),
      fromDb: (r)=> ({ ...(r.data || {}), id: r.id })
    },
    carnet_contacts: {
      toDb: (c)=> ({
        id: c.id, role: c.role || '', nom: c.nom || '',
        indicatif: c.indicatif || '', tel: c.tel || '', email: c.email || ''
      }),
      fromDb: (r)=> ({ id: r.id, role: r.role, nom: r.nom, indicatif: r.indicatif, tel: r.tel, email: r.email })
    },
    // Zone protégée (voir infos-sociales.html) : "id" est le même id que dans
    // musiciens/techniciens (une fiche par personne). Accès restreint côté
    // Supabase par RLS (infos_sociales_admins), pas par ce fichier.
    infos_sociales: {
      toDb: (r)=> ({
        id: r.id, person_type: r.personType,
        date_naissance: r.dateNaissance || null,
        lieu_naissance: r.lieuNaissance || '',
        nationalite: r.nationalite || '',
        adresse: r.adresse || '',
        num_secu: r.numSecu || '',
        iban: r.iban || '',
        bic: r.bic || '',
        titulaire_compte: r.titulaireCompte || '',
        num_conges_spectacles: r.numCongesSpectacles || '',
        num_audiens: r.numAudiens || '',
        contact_urgence_nom: r.contactUrgenceNom || '',
        contact_urgence_tel: r.contactUrgenceTel || '',
        permis_conduire_numero: r.permisConduireNumero || '',
        permis_conduire_validite: r.permisConduireValidite || null,
        extra: r.extra || {}
      }),
      fromDb: (row)=> ({
        id: row.id, personType: row.person_type,
        dateNaissance: row.date_naissance || '',
        lieuNaissance: row.lieu_naissance || '',
        nationalite: row.nationalite || '',
        adresse: row.adresse || '',
        numSecu: row.num_secu || '',
        iban: row.iban || '',
        bic: row.bic || '',
        titulaireCompte: row.titulaire_compte || '',
        numCongesSpectacles: row.num_conges_spectacles || '',
        numAudiens: row.num_audiens || '',
        contactUrgenceNom: row.contact_urgence_nom || '',
        contactUrgenceTel: row.contact_urgence_tel || '',
        permisConduireNumero: row.permis_conduire_numero || '',
        permisConduireValidite: row.permis_conduire_validite || '',
        extra: row.extra || {}
      })
    }
  };

  function adapterFor(table){ return ADAPTERS[table] || { toDb: x=>x, fromDb: x=>x }; }

  // Récupère toute une collection (équivalent de l'ancien loadXxx()).
  async function fetchAll(table){
    if(!supabaseClient) return [];
    const { data, error } = await supabaseClient.from(table).select('*').order('created_at', { ascending: true });
    if(error){ console.warn(`[CurieuxDB] fetchAll(${table})`, error.message); return []; }
    const adapter = adapterFor(table);
    return (data || []).map(adapter.fromDb);
  }

  // Remplace toute une collection (équivalent de l'ancien saveXxx(list)) :
  // upsert de tous les éléments présents, suppression de ceux qui ont disparu
  // de la liste. Garde le même modèle mental "je sauvegarde le tableau entier"
  // utilisé partout dans l'app, tout en restant du CRUD ligne par ligne côté DB.
  async function syncCollection(table, list){
    if(!supabaseClient) return;
    const adapter = adapterFor(table);
    const rows = (list || []).map(adapter.toDb);

    if(rows.length > 0){
      const { error: upsertError } = await supabaseClient.from(table).upsert(rows, { onConflict: 'id' });
      if(upsertError) console.warn(`[CurieuxDB] upsert(${table})`, upsertError.message);
    }

    const { data: existing, error: fetchErr } = await supabaseClient.from(table).select('id');
    if(fetchErr){ console.warn(`[CurieuxDB] fetch ids(${table})`, fetchErr.message); return; }
    const keepIds = new Set((list || []).map(r=>r.id));
    const toDelete = (existing || []).map(r=>r.id).filter(id=> !keepIds.has(id));
    if(toDelete.length > 0){
      const { error: delError } = await supabaseClient.from(table).delete().in('id', toDelete);
      if(delError) console.warn(`[CurieuxDB] delete(${table})`, delError.message);
    }
  }

  // Upsert d'une seule ligne, sans diff/suppression du reste de la table — utilisé pour
  // les sauvegardes à haute fréquence (frappe clavier) où re-synchroniser toute la
  // collection à chaque saisie serait inutilement coûteux (voir feuille-de-route.html).
  async function upsertOne(table, item){
    if(!supabaseClient) return;
    const adapter = adapterFor(table);
    const { error } = await supabaseClient.from(table).upsert(adapter.toDb(item), { onConflict: 'id' });
    if(error) console.warn(`[CurieuxDB] upsertOne(${table})`, error.message);
  }
  async function removeOne(table, id){
    if(!supabaseClient) return;
    const { error } = await supabaseClient.from(table).delete().eq('id', id);
    if(error) console.warn(`[CurieuxDB] removeOne(${table})`, error.message);
  }

  // Le singleton "newsletter_snapshot" (une seule ligne, id=1) a sa propre API,
  // trop différente du modèle "collection" pour partager syncCollection/fetchAll.
  async function fetchSnapshot(){
    if(!supabaseClient) return null;
    const { data, error } = await supabaseClient.from('newsletter_snapshot').select('*').eq('id', 1).maybeSingle();
    if(error){ console.warn('[CurieuxDB] fetchSnapshot', error.message); return null; }
    if(!data) return null;
    return { sentAt: data.sent_at, entries: data.entries || [] };
  }
  async function saveSnapshot(snap){
    if(!supabaseClient) return;
    const { error } = await supabaseClient.from('newsletter_snapshot')
      .upsert({ id: 1, sent_at: snap.sentAt, entries: snap.entries || [] }, { onConflict: 'id' });
    if(error) console.warn('[CurieuxDB] saveSnapshot', error.message);
  }

  // Abonnement realtime : callback appelé à chaque INSERT/UPDATE/DELETE sur la
  // table (les pages appellent typiquement render() dedans pour se remettre à
  // jour). Retourne le channel (pour unsubscribe() si besoin, rarement utile
  // vu que les pages vivent le temps d'un onglet).
  function subscribe(table, callback){
    if(!supabaseClient) return null;
    return supabaseClient
      .channel(`realtime:${table}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, callback)
      .subscribe();
  }

  // --- Auth (utilisé uniquement par infos-sociales.html, la page admin — le
  // reste de l'app reste en accès public via la clé anonyme, voir DEPLOYMENT.md). ---
  async function signIn(email, password){
    if(!supabaseClient) return { error: { message: 'Supabase non chargé' } };
    return supabaseClient.auth.signInWithPassword({ email, password });
  }
  async function signOut(){
    if(!supabaseClient) return;
    return supabaseClient.auth.signOut();
  }
  async function getSession(){
    if(!supabaseClient) return null;
    const { data } = await supabaseClient.auth.getSession();
    return data.session;
  }
  function onAuthStateChange(callback){
    if(!supabaseClient) return { data: { subscription: { unsubscribe(){} } } };
    return supabaseClient.auth.onAuthStateChange(callback);
  }
  // Vérifie que le compte connecté figure dans infos_sociales_admins (policy
  // RLS "self read own admin row" : la requête ne peut renvoyer QUE la ligne du
  // compte courant, jamais la liste complète des admins).
  async function isInfosSocialesAdmin(){
    if(!supabaseClient) return false;
    const session = await getSession();
    if(!session || !session.user || !session.user.email) return false;
    const { data, error } = await supabaseClient
      .from('infos_sociales_admins').select('email').eq('email', session.user.email).maybeSingle();
    if(error){ console.warn('[CurieuxDB] isInfosSocialesAdmin', error.message); return false; }
    return !!data;
  }

  // --- Auto-saisie par lien personnel (mes-infos.html, même token que
  // dispo-titulaire.html) : pas d'auth, le token EST l'identification. Passe
  // par des fonctions Postgres dédiées (get/upsert_own_infos_sociales) qui
  // valident le token contre dispo_demandes avant de toucher infos_sociales —
  // la table elle-même reste fermée à la clé anonyme (voir migrations.sql). ---
  async function getInfosSocialesByToken(token){
    if(!supabaseClient) return null;
    const { data, error } = await supabaseClient.rpc('get_own_infos_sociales', { p_token: token });
    if(error){ console.warn('[CurieuxDB] getInfosSocialesByToken', error.message); return null; }
    const row = (data || [])[0];
    return row ? adapterFor('infos_sociales').fromDb(row) : null;
  }
  async function upsertInfosSocialesByToken(token, item){
    if(!supabaseClient) return { error: { message: 'Supabase non chargé' } };
    const payload = adapterFor('infos_sociales').toDb(item);
    const { error } = await supabaseClient.rpc('upsert_own_infos_sociales', { p_token: token, p_payload: payload });
    if(error) console.warn('[CurieuxDB] upsertInfosSocialesByToken', error.message);
    return { error };
  }

  return {
    fetchAll, syncCollection, upsertOne, removeOne, fetchSnapshot, saveSnapshot, subscribe,
    signIn, signOut, getSession, onAuthStateChange, isInfosSocialesAdmin,
    getInfosSocialesByToken, upsertInfosSocialesByToken
  };
})();
