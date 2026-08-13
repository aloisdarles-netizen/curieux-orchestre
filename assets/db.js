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
      toDb: (t)=> ({
        id: t.id, nom: t.nom || '', dates: t.dates || [],
        cachet_statut: t.cachetStatut === 'defini' ? 'defini' : 'non_defini',
        cachet_montant: t.cachetStatut === 'defini' ? (t.cachetMontant != null ? t.cachetMontant : null) : null,
      }),
      fromDb: (r)=> ({ id: r.id, nom: r.nom, dates: r.dates || [], cachetStatut: r.cachet_statut || 'non_defini', cachetMontant: r.cachet_montant })
    },
    // Liste personnelle et permanente de remplaçant·es classé·es (mes-remplacants.html) —
    // "id" = le person_id du/de la titulaire. Accessible en lecture directe par les
    // comptes admin/user (RLS "admin access", voir migrations.sql) : contrairement à
    // infos_sociales/dispo_demandes, pas besoin de passer par une fonction à token ici,
    // ce sont les pages admin (annuaire, techniciens) qui consultent cette table.
    remplacant_prefs: {
      toDb: (r)=> ({ id: r.id, person_type: r.personType, items: r.items || [] }),
      fromDb: (r)=> ({ id: r.id, personType: r.person_type, items: r.items || [] })
    },
    // Signalements du widget "Signaler un bug" (voir injectBugReportWidget dans
    // brand-assets.js) — écriture publique, lecture réservée aux comptes 'admin'.
    bug_reports: {
      toDb: (b)=> ({ id: b.id, message: b.message || '', page: b.page || '' }),
      fromDb: (r)=> ({ id: r.id, message: r.message, page: r.page, createdAt: r.created_at })
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
      // _updatedAt (préfixé pour ne jamais entrer en collision avec un champ du
      // même nom à l'intérieur de "data") sert à détecter les conflits d'édition
      // concurrente, voir feuille-de-route.html.
      toDb: (f)=> ({ id: f.id, data: f }),
      fromDb: (r)=> ({ ...(r.data || {}), id: r.id, _updatedAt: r.updated_at })
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
        genre: r.genre || '',
        genre_detail: r.genreDetail || '',
        prenom_civil: r.prenomCivil || '',
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
        permis_conduire: r.permisConduire || '',
        permis_conduire_type: r.permisConduireType || '',
        permis_conduire_type_detail: r.permisConduireTypeDetail || '',
        taille_vetement: r.tailleVetement || '',
        extra: r.extra || {}
      }),
      fromDb: (row)=> ({
        id: row.id, personType: row.person_type,
        genre: row.genre || '',
        genreDetail: row.genre_detail || '',
        prenomCivil: row.prenom_civil || '',
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
        permisConduire: row.permis_conduire || '',
        permisConduireType: row.permis_conduire_type || '',
        permisConduireTypeDetail: row.permis_conduire_type_detail || '',
        tailleVetement: row.taille_vetement || '',
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

  // Upsert de toute une collection (équivalent de l'ancien saveXxx(list)) —
  // sans plus jamais supprimer ce qui manquerait de la liste. Avant, syncCollection
  // supprimait tout ce qui n'était pas dans "list", ce qui était dangereux dès que
  // deux admins travaillaient en même temps : un onglet resté ouvert avec une
  // liste devenue périmée pouvait supprimer d'un coup ce qu'une autre personne
  // venait d'ajouter ailleurs. Les suppressions se font maintenant explicitement,
  // via removeOne/removeMany/removePerson (le·la seul·e à savoir "je veux
  // supprimer CETTE ligne précise" est l'action qui déclenche la suppression).
  async function syncCollection(table, list){
    if(!supabaseClient) return;
    const adapter = adapterFor(table);
    const rows = (list || []).map(adapter.toDb);
    if(rows.length === 0) return;
    const { error } = await supabaseClient.from(table).upsert(rows, { onConflict: 'id' });
    if(error) console.warn(`[CurieuxDB] syncCollection(${table})`, error.message);
  }

  // Upsert d'une seule ligne — utilisé pour les sauvegardes à haute fréquence
  // (frappe clavier) où re-synchroniser toute la collection à chaque saisie
  // serait inutilement coûteux (voir feuille-de-route.html), et plus généralement
  // partout où on modifie/ajoute UNE ligne connue.
  async function upsertOne(table, item){
    if(!supabaseClient) return { error: { message: 'Supabase non chargé' } };
    const adapter = adapterFor(table);
    const { error } = await supabaseClient.from(table).upsert(adapter.toDb(item), { onConflict: 'id' });
    if(error) console.warn(`[CurieuxDB] upsertOne(${table})`, error.message);
    return { error };
  }
  async function removeOne(table, id){
    if(!supabaseClient) return { error: { message: 'Supabase non chargé' } };
    const { error } = await supabaseClient.from(table).delete().eq('id', id);
    if(error) console.warn(`[CurieuxDB] removeOne(${table})`, error.message);
    return { error };
  }
  async function removeMany(table, ids){
    if(!supabaseClient || !ids || ids.length === 0) return { error: null };
    const { error } = await supabaseClient.from(table).delete().in('id', ids);
    if(error) console.warn(`[CurieuxDB] removeMany(${table})`, error.message);
    return { error };
  }
  // Supprime un·e musicien·ne/technicien·ne ET les données rattachées ailleurs
  // (fiche infos_sociales, liens dispo_demandes) — sans quoi elles restaient
  // orphelines et invisibles indéfiniment. Best-effort : un compte de rôle
  // 'user' n'a pas accès à infos_sociales (RLS), ce volet échoue silencieusement
  // pour lui, la fiche roster est quand même bien supprimée.
  async function removePerson(table, id){
    if(!supabaseClient) return;
    await Promise.all([
      supabaseClient.from(table).delete().eq('id', id),
      supabaseClient.from('infos_sociales').delete().eq('id', id),
      supabaseClient.from('dispo_demandes').delete().eq('person_id', id),
    ]);
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

  // --- Auth : comptes Supabase réels, utilisés pour protéger toutes les pages
  // admin (accueil, annuaire, tournées, infos sociales, ...) — le reste de
  // l'app (liens personnels dispo/mes-infos) reste en accès public par token,
  // voir DEPLOYMENT.md. ---
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
  // Rôle du compte connecté dans infos_sociales_admins ('admin'|'user'), ou
  // null s'il n'y figure pas — c'est la liste de confiance qui sert
  // d'allowlist pour toute l'app (policy RLS "self read own row" : la
  // requête ne peut renvoyer QUE la ligne du compte courant en lecture simple ;
  // un compte 'admin' peut en plus lister/gérer les autres lignes, voir
  // listAccounts ci-dessous).
  async function getMyRole(){
    if(!supabaseClient) return null;
    const session = await getSession();
    if(!session || !session.user || !session.user.email) return null;
    const { data, error } = await supabaseClient
      .from('infos_sociales_admins').select('role').eq('email', session.user.email).maybeSingle();
    if(error){ console.warn('[CurieuxDB] getMyRole', error.message); return null; }
    return data ? (data.role || 'admin') : null;
  }
  // Accès aux pages admin courantes (annuaires, tournées, dispos...) : tout
  // compte présent dans infos_sociales_admins, quel que soit son rôle.
  async function hasAppAccess(){
    return !!(await getMyRole());
  }
  // Accès aux zones réservées (infos sociales, gestion des comptes) : rôle
  // 'admin' uniquement.
  async function isSuperAdmin(){
    return (await getMyRole()) === 'admin';
  }

  // --- Gestion des comptes (page admin-dashboard.html, réservée aux comptes
  // 'admin') : liste/ajoute/retire des lignes dans infos_sociales_admins. Ne
  // liste PAS les comptes Supabase Auth eux-mêmes (ça nécessiterait la clé
  // service_role, jamais utilisée côté client) — seulement la liste blanche
  // qui donne accès à l'app, ce qui est suffisant pour gérer qui a accès. ---
  async function listAccounts(){
    if(!supabaseClient) return [];
    const { data, error } = await supabaseClient
      .from('infos_sociales_admins').select('email, role').order('email');
    if(error){ console.warn('[CurieuxDB] listAccounts', error.message); return []; }
    return data || [];
  }
  async function setAccountRole(email, role){
    if(!supabaseClient) return { error: { message: 'Supabase non chargé' } };
    const { error } = await supabaseClient
      .from('infos_sociales_admins').upsert({ email, role }, { onConflict: 'email' });
    if(error) console.warn('[CurieuxDB] setAccountRole', error.message);
    return { error };
  }
  async function removeAccount(email){
    if(!supabaseClient) return { error: { message: 'Supabase non chargé' } };
    const { error } = await supabaseClient.from('infos_sociales_admins').delete().eq('email', email);
    if(error) console.warn('[CurieuxDB] removeAccount', error.message);
    return { error };
  }

  // Client Supabase secondaire, sans persistance de session : utilisé pour
  // créer un compte AU NOM DE quelqu'un d'autre depuis le dashboard, sans
  // remplacer la session actuelle de l'admin connecté (auth.signUp() sur le
  // client principal authentifierait le navigateur comme ce nouveau compte).
  let adminActionClient = null;
  function getAdminActionClient(){
    if(!adminActionClient && typeof window !== 'undefined' && window.supabase){
      adminActionClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false }
      });
    }
    return adminActionClient;
  }
  // Crée un compte avec un mot de passe choisi par l'admin (à transmettre à
  // la personne par un canal séparé — SMS, appel...). L'email de confirmation
  // par défaut de Supabase part quand même si l'option est activée sur le
  // projet ; le compte n'a aucun accès tant qu'il n'est pas ajouté à la liste
  // (setAccountRole ci-dessus).
  async function createAccountWithPassword(email, password){
    const client = getAdminActionClient();
    if(!client) return { error: { message: 'Supabase non chargé' } };
    return client.auth.signUp({ email, password });
  }
  // Envoie un lien de connexion par email (sans mot de passe) — crée le
  // compte au premier clic si besoin. N'affecte pas la session de l'admin
  // qui déclenche l'envoi : rien ne change côté navigateur tant que le lien
  // n'est pas ouvert (dans la boîte mail du destinataire).
  async function sendMagicLinkInvite(email){
    if(!supabaseClient) return { error: { message: 'Supabase non chargé' } };
    return supabaseClient.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  }

  // --- Historique des modifications (audit_log, réservé aux comptes 'admin'
  // par RLS — voir migrations.sql). tableName optionnel pour filtrer. ---
  async function fetchAuditLog(tableName, limit){
    if(!supabaseClient) return [];
    let q = supabaseClient.from('audit_log').select('*').order('changed_at', { ascending: false }).limit(limit || 200);
    if(tableName) q = q.eq('table_name', tableName);
    const { data, error } = await q;
    if(error){ console.warn('[CurieuxDB] fetchAuditLog', error.message); return []; }
    return data || [];
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

  // dispo_demandes n'est plus lisible/écrivable directement par la clé
  // anonyme (voir migrations.sql) : dispo-titulaire.html/mes-infos.html
  // passent par ces deux fonctions dédiées, qui ne donnent accès qu'à UNE
  // ligne précise (celle du token fourni), jamais à la table entière.
  async function getDispoDemandeByToken(token){
    if(!supabaseClient) return null;
    const { data, error } = await supabaseClient.rpc('get_dispo_demande_by_token', { p_token: token });
    if(error){ console.warn('[CurieuxDB] getDispoDemandeByToken', error.message); return null; }
    const row = (data || [])[0];
    return row ? adapterFor('dispo_demandes').fromDb(row) : null;
  }
  async function markDispoRespondedByToken(token){
    if(!supabaseClient) return { error: { message: 'Supabase non chargé' } };
    const { error } = await supabaseClient.rpc('mark_dispo_responded_by_token', { p_token: token });
    if(error) console.warn('[CurieuxDB] markDispoRespondedByToken', error.message);
    return { error };
  }

  // Liste personnelle de remplaçant·es classé·es (mes-remplacants.html, même
  // token que dispo-titulaire.html/mes-infos.html) : même principe que
  // getInfosSocialesByToken, la table remplacant_prefs reste fermée à la clé
  // anonyme, tout passe par ces deux fonctions Postgres dédiées.
  async function getRemplacantPrefsByToken(token){
    if(!supabaseClient) return [];
    const { data, error } = await supabaseClient.rpc('get_own_remplacant_prefs', { p_token: token });
    if(error){ console.warn('[CurieuxDB] getRemplacantPrefsByToken', error.message); return []; }
    const row = (data || [])[0];
    return row && Array.isArray(row.items) ? row.items : [];
  }
  async function upsertRemplacantPrefsByToken(token, items){
    if(!supabaseClient) return { error: { message: 'Supabase non chargé' } };
    const { error } = await supabaseClient.rpc('upsert_own_remplacant_prefs', { p_token: token, p_items: items });
    if(error) console.warn('[CurieuxDB] upsertRemplacantPrefsByToken', error.message);
    return { error };
  }

  // Widget "Signaler un bug" (voir injectBugReportWidget dans brand-assets.js) —
  // écriture seule, table fermée en lecture à la clé anonyme (voir migrations.sql).
  async function reportBug(message, page){
    if(!supabaseClient) return { error: { message: 'Supabase non chargé' } };
    const id = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : 'bug-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
    const payload = adapterFor('bug_reports').toDb({ id, message, page });
    const { error } = await supabaseClient.from('bug_reports').insert(payload);
    if(error) console.warn('[CurieuxDB] reportBug', error.message);
    return { error };
  }

  return {
    fetchAll, syncCollection, upsertOne, removeOne, removeMany, removePerson, fetchSnapshot, saveSnapshot, subscribe,
    signIn, signOut, getSession, onAuthStateChange,
    getMyRole, hasAppAccess, isSuperAdmin,
    listAccounts, setAccountRole, removeAccount,
    createAccountWithPassword, sendMagicLinkInvite, fetchAuditLog,
    getInfosSocialesByToken, upsertInfosSocialesByToken,
    getDispoDemandeByToken, markDispoRespondedByToken,
    getRemplacantPrefsByToken, upsertRemplacantPrefsByToken,
    reportBug
  };
})();
