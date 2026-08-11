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
        disponibilites: m.disponibilites || {}
      }),
      fromDb: (r)=> ({
        id: r.id, prenom: r.prenom, nom: r.nom,
        instrument: r.instrument, pupitre: r.pupitre,
        statutPoste: r.statut_poste,
        rang: r.rang || undefined,
        telephone: r.telephone, email: r.email, notes: r.notes,
        disponibilites: r.disponibilites || {}
      })
    },
    techniciens: {
      toDb: (t)=> ({
        id: t.id,
        prenom: t.prenom || '', nom: t.nom || '',
        poste: t.poste || '', pole: t.pole || 'Autre',
        telephone: t.telephone || '', email: t.email || '', notes: t.notes || '',
        disponibilites: t.disponibilites || {}
      }),
      fromDb: (r)=> ({
        id: r.id, prenom: r.prenom, nom: r.nom,
        poste: r.poste, pole: r.pole,
        telephone: r.telephone, email: r.email, notes: r.notes,
        disponibilites: r.disponibilites || {}
      })
    },
    tournees: {
      toDb: (t)=> ({ id: t.id, nom: t.nom || '', dates: t.dates || [] }),
      fromDb: (r)=> ({ id: r.id, nom: r.nom, dates: r.dates || [] })
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

  return { fetchAll, syncCollection, upsertOne, removeOne, fetchSnapshot, saveSnapshot, subscribe };
})();
