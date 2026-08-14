// ============================================================================
// Curieux orchestre — couche de persistence Supabase (remplace localStorage).
// Nécessite le script CDN Supabase chargé AVANT ce fichier :
//   <script src="assets/vendor/supabase-js.js"></script>
// (copie locale et versionnée : plus aucune dépendance à un CDN tiers, qui
// pourrait tomber ou servir une version compromise — voir assets/vendor/*.VERSION)
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
  console.error("Supabase non chargé : ajoute <script src=\"assets/vendor/supabase-js.js\"></script> avant assets/db.js");
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
    // Exceptions par personne au cachet standard d'une tournée (voir tournees.cachet_montant) —
    // table à part, verrouillée (RLS "admin access" ci-dessous) : contrairement au cachet
    // standard (public, identique pour tout le monde), un montant individualisé est sensible
    // et ne doit être lisible, côté lien perso, que par la personne concernée — jamais par
    // simple lecture de la table (voir get_cachet_override_by_token dans migrations.sql).
    // "id" = `${tourneeId}::${personType}::${personId}`, pour réutiliser upsertOne/removeOne
    // tels quels malgré la clé composite.
    cachet_overrides: {
      toDb: (o)=> ({ id: o.id, tournee_id: o.tourneeId, person_type: o.personType, person_id: o.personId, montant: o.montant }),
      fromDb: (r)=> ({ id: r.id, tourneeId: r.tournee_id, personType: r.person_type, personId: r.person_id, montant: r.montant })
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
    // "type" distingue bug / amélioration / incohérence.
    bug_reports: {
      toDb: (b)=> ({ id: b.id, message: b.message || '', page: b.page || '', type: b.type || 'bug' }),
      fromDb: (r)=> ({ id: r.id, message: r.message, page: r.page, type: r.type || 'bug', createdAt: r.created_at })
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

  // --------------------------------------------------------------------------
  // Suivi des écritures.
  //
  // Auparavant, une écriture qui échouait se contentait d'un console.warn : sur
  // 29 appels, 24 ignoraient l'erreur renvoyée, et certaines pages lançaient même
  // la sauvegarde sans l'attendre après avoir déjà mis à jour l'affichage. Une
  // coupure réseau en salle ou une session expirée pendant la nuit produisait
  // donc exactement le même écran qu'un enregistrement réussi — la modification
  // était perdue sans que personne ne puisse le savoir.
  //
  // Le mécanisme ci-dessous reprend celui qui existait déjà sur la page des
  // musicien·nes (dispo-titulaire.html) et le rend valable partout : l'échec est
  // annoncé, l'opération est conservée pour être rejouée, et fermer l'onglet
  // demande confirmation tant qu'il reste quelque chose à enregistrer.
  // --------------------------------------------------------------------------
  const _echecs = [];           // opérations à rejouer
  let _enCours = 0;             // écritures en vol
  const _abonnes = [];          // callbacks d'affichage

  function _etatEcriture(){
    return { enCours: _enCours, echecs: _echecs.length,
             messages: [...new Set(_echecs.map(e => e.message))] };
  }
  function _notifier(){
    const etat = _etatEcriture();
    _abonnes.forEach(fn => { try{ fn(etat); }catch(e){} });
    _majBandeau(etat);
  }
  // Permet à une page d'afficher l'état à sa façon (voir dispo-titulaire.html,
  // qui a déjà son propre indicateur et n'a pas besoin du bandeau générique).
  function onEtatEcriture(fn){ _abonnes.push(fn); fn(_etatEcriture()); return () => {
    const i = _abonnes.indexOf(fn); if(i >= 0) _abonnes.splice(i, 1);
  }; }

  // Exécute une écriture en la surveillant. `rejouer` doit pouvoir être rappelée
  // telle quelle : c'est ce qui permet le bouton « Réessayer ».
  async function _ecrire(libelle, rejouer){
    if(!supabaseClient) return { error: { message: 'Supabase non chargé' } };
    _enCours++; _notifier();
    let res;
    try{
      res = await rejouer();
    }catch(err){
      res = { error: { message: err && err.message ? err.message : String(err) } };
    }
    _enCours--;
    if(res && res.error){
      console.warn(`[CurieuxDB] ${libelle}`, res.error.message);
      _echecs.push({ libelle, rejouer, message: _messageLisible(res.error.message) });
    }
    _notifier();
    return res || { error: null };
  }

  // Les messages bruts de Postgres/Supabase ne veulent rien dire pour qui les
  // lit dans une salle de concert : on traduit les deux cas réellement fréquents.
  function _messageLisible(message){
    const m = String(message || '');
    if(/row-level security|JWT|not authorized|permission denied/i.test(m)){
      return "Ta session n'est plus valide — reconnecte-toi pour enregistrer.";
    }
    if(/fetch|network|Failed to fetch|timeout/i.test(m)){
      return "Pas de connexion — la modification n'est pas encore enregistrée.";
    }
    return m;
  }

  async function reessayerEcritures(){
    if(_echecs.length === 0) return { error: null };
    const aRejouer = _echecs.splice(0, _echecs.length);
    _notifier();
    for(const op of aRejouer) await _ecrire(op.libelle, op.rejouer);
    return { error: _echecs.length ? { message: 'Certaines modifications résistent.' } : null };
  }
  function ecrituresEnAttente(){ return _echecs.length > 0 || _enCours > 0; }

  // Bandeau générique, injecté à la première alerte seulement — les pages qui
  // gèrent déjà leur propre indicateur peuvent le désactiver via
  // window.CURIEUX_SANS_BANDEAU_ECRITURE.
  let _bandeau = null;
  function _majBandeau(etat){
    if(typeof document === 'undefined' || window.CURIEUX_SANS_BANDEAU_ECRITURE) return;
    if(etat.echecs === 0){
      if(_bandeau) _bandeau.style.display = 'none';
      return;
    }
    if(!_bandeau){
      _bandeau = document.createElement('div');
      _bandeau.id = 'curieuxEcritureBandeau';
      _bandeau.setAttribute('role', 'alert');
      _bandeau.style.cssText =
        'position:fixed; left:0; right:0; bottom:0; z-index:9999;' +
        'background:#a5313f; color:#fff; padding:11px 16px; font-size:13.5px;' +
        "font-family:'Host Grotesk',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;" +
        'display:flex; gap:12px; align-items:center; justify-content:center; flex-wrap:wrap;' +
        'box-shadow:0 -4px 16px rgba(0,0,0,.18);';
      const texte = document.createElement('span');
      texte.id = 'curieuxEcritureTexte';
      const bouton = document.createElement('button');
      bouton.type = 'button';
      bouton.textContent = 'Réessayer';
      bouton.style.cssText =
        'background:#fff; color:#a5313f; border:none; border-radius:8px;' +
        'padding:7px 14px; font-weight:700; font-size:13px; cursor:pointer; font-family:inherit;';
      bouton.addEventListener('click', async () => {
        bouton.disabled = true; bouton.textContent = 'Envoi…';
        await reessayerEcritures();
        bouton.disabled = false; bouton.textContent = 'Réessayer';
      });
      _bandeau.append(texte, bouton);
      (document.body || document.documentElement).appendChild(_bandeau);
    }
    const n = etat.echecs;
    document.getElementById('curieuxEcritureTexte').textContent =
      `${n} modification${n > 1 ? 's' : ''} non enregistrée${n > 1 ? 's' : ''}. ` +
      (etat.messages[0] || '');
    _bandeau.style.display = 'flex';
  }

  if(typeof window !== 'undefined'){
    window.addEventListener('beforeunload', (e) => {
      if(!ecrituresEnAttente()) return;
      e.preventDefault();
      e.returnValue = '';
    });
  }

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
    if(!supabaseClient) return { error: { message: 'Supabase non chargé' } };
    const adapter = adapterFor(table);
    const rows = (list || []).map(adapter.toDb);
    if(rows.length === 0) return { error: null };
    return _ecrire(`syncCollection(${table})`,
      () => supabaseClient.from(table).upsert(rows, { onConflict: 'id' }));
  }

  // Upsert d'une seule ligne — utilisé pour les sauvegardes à haute fréquence
  // (frappe clavier) où re-synchroniser toute la collection à chaque saisie
  // serait inutilement coûteux (voir feuille-de-route.html), et plus généralement
  // partout où on modifie/ajoute UNE ligne connue.
  async function upsertOne(table, item){
    const adapter = adapterFor(table);
    const row = adapter.toDb(item);
    return _ecrire(`upsertOne(${table})`,
      () => supabaseClient.from(table).upsert(row, { onConflict: 'id' }));
  }
  async function removeOne(table, id){
    return _ecrire(`removeOne(${table})`,
      () => supabaseClient.from(table).delete().eq('id', id));
  }
  async function removeMany(table, ids){
    if(!ids || ids.length === 0) return { error: null };
    return _ecrire(`removeMany(${table})`,
      () => supabaseClient.from(table).delete().in('id', ids));
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
    return _ecrire('saveSnapshot',
      () => supabaseClient.from('newsletter_snapshot')
        .upsert({ id: 1, sent_at: snap.sentAt, entries: snap.entries || [] }, { onConflict: 'id' }));
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
  // Changement de mot de passe par le compte connecté lui-même (page admin,
  // section "Mon compte") — ne touche que la session en cours, jamais un
  // autre compte (contrairement à createAccountWithPassword qui en crée un
  // nouveau au nom de quelqu'un d'autre).
  async function updateOwnPassword(newPassword){
    if(!supabaseClient) return { error: { message: 'Supabase non chargé' } };
    return supabaseClient.auth.updateUser({ password: newPassword });
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
  //
  // emailRedirectTo doit être précisé explicitement : sans lui, Supabase
  // renvoie vers la Site URL par défaut configurée dans le dashboard du
  // projet (souvent restée sur localhost), ce qui casse le lien pour la
  // personne qui clique dessus — voir admin-login.html qui sait déjà détecter
  // une session issue d'un lien magique et rediriger vers accueil.html.
  // location.origin est vide/"null" en file:// (app ouverte en local) : dans
  // ce cas on n'envoie pas emailRedirectTo plutôt que de pointer vers un
  // chemin local inutilisable pour le destinataire.
  async function sendMagicLinkInvite(email){
    if(!supabaseClient) return { error: { message: 'Supabase non chargé' } };
    const options = { shouldCreateUser: true };
    if(typeof location !== 'undefined' && /^https?:$/.test(location.protocol)){
      options.emailRedirectTo = location.origin + '/admin-login.html';
    }
    return supabaseClient.auth.signInWithOtp({ email, options });
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

  // --- Corbeille : restauration depuis le journal d'audit -------------------
  // L'interface prévenait qu'"il n'y a pas de corbeille : une suppression est
  // définitive". C'était vrai côté écran, mais pas côté base : le journal
  // conserve déjà l'état complet d'avant chaque suppression (old_data). Il ne
  // manquait donc que la lecture — c'est ce que font les deux fonctions
  // ci-dessous, sans rien ajouter au schéma.
  //
  // infos_sociales est volontairement exclue : son journal ne retient que le
  // NOM des champs modifiés, jamais leurs valeurs (pour ne pas dupliquer un
  // numéro de sécurité sociale dans une table moins cloisonnée). Il n'y a donc
  // rien à restaurer, et c'est délibéré.
  const TABLES_RESTAURABLES = [
    'musiciens', 'techniciens', 'tournees', 'feuilles_route', 'carnet_contacts',
    'dispo_demandes', 'remplacant_prefs', 'cachet_overrides',
  ];

  // Suppressions restaurables : celles dont la ligne n'a pas été recréée depuis.
  async function fetchCorbeille(limit){
    if(!supabaseClient) return [];
    const { data, error } = await supabaseClient
      .from('audit_log')
      .select('*')
      .eq('action', 'DELETE')
      .in('table_name', TABLES_RESTAURABLES)
      .order('changed_at', { ascending: false })
      .limit(limit || 100);
    if(error){ console.warn('[CurieuxDB] fetchCorbeille', error.message); return []; }

    const entrees = (data || []).filter(e => e.old_data && e.old_data.id != null);
    // Une ligne supprimée puis recréée ne doit plus apparaître comme
    // restaurable, sinon on proposerait d'écraser la version actuelle.
    const parTable = {};
    entrees.forEach(e => { (parTable[e.table_name] = parTable[e.table_name] || new Set()).add(String(e.old_data.id)); });
    const existants = {};
    await Promise.all(Object.entries(parTable).map(async ([table, ids]) => {
      const { data: presents } = await supabaseClient.from(table).select('id').in('id', [...ids]);
      existants[table] = new Set((presents || []).map(r => String(r.id)));
    }));
    // Et si la même ligne a été supprimée plusieurs fois, seule la dernière compte.
    const vus = new Set();
    return entrees.filter(e => {
      const cle = e.table_name + '::' + e.old_data.id;
      if(vus.has(cle)) return false;
      vus.add(cle);
      return !(existants[e.table_name] || new Set()).has(String(e.old_data.id));
    });
  }

  // Réinsère la ligne telle qu'elle était. old_data est déjà au format des
  // colonnes SQL : on n'applique donc PAS les adaptateurs, qui traduisent
  // depuis le format JavaScript.
  async function restaurerDepuisCorbeille(entree){
    if(!supabaseClient) return { error: { message: 'Supabase non chargé' } };
    if(!entree || !entree.old_data || !TABLES_RESTAURABLES.includes(entree.table_name)){
      return { error: { message: 'Entrée non restaurable' } };
    }
    const ligne = { ...entree.old_data };
    return _ecrire(`restaurer(${entree.table_name})`,
      () => supabaseClient.from(entree.table_name).insert(ligne));
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

  // musiciens/techniciens ne sont plus écrivables directement par la clé anonyme
  // (voir migrations.sql) : dispo-titulaire.html passe par ces deux fonctions, qui ne
  // touchent que LA fiche de la personne du token fourni, jamais une autre.
  async function updateOwnContactByToken(token, telephone, email){
    if(!supabaseClient) return { error: { message: 'Supabase non chargé' } };
    const { error } = await supabaseClient.rpc('update_own_contact_by_token', { p_token: token, p_telephone: telephone, p_email: email });
    if(error) console.warn('[CurieuxDB] updateOwnContactByToken', error.message);
    return { error };
  }
  async function updateOwnDisponibilitesByToken(token, disponibilites, disponibilitesCommentaires, telephone, email){
    if(!supabaseClient) return { error: { message: 'Supabase non chargé' } };
    const { error } = await supabaseClient.rpc('update_own_disponibilites_by_token', {
      p_token: token, p_disponibilites: disponibilites, p_disponibilites_commentaires: disponibilitesCommentaires,
      p_telephone: telephone, p_email: email
    });
    if(error) console.warn('[CurieuxDB] updateOwnDisponibilitesByToken', error.message);
    return { error };
  }
  // Renomme le prénom affiché partout dans l'app (mes-infos.html, "Prénom d'usage") :
  // la fonction Postgres préserve l'ancien prénom dans infos_sociales.prenom_civil
  // (seulement s'il n'y était pas déjà) avant d'écraser musiciens/techniciens.prenom —
  // voir update_own_prenom_usage_by_token dans migrations.sql.
  async function updateOwnPrenomUsageByToken(token, prenomUsage){
    if(!supabaseClient) return { error: { message: 'Supabase non chargé' } };
    const { error } = await supabaseClient.rpc('update_own_prenom_usage_by_token', { p_token: token, p_prenom_usage: prenomUsage });
    if(error) console.warn('[CurieuxDB] updateOwnPrenomUsageByToken', error.message);
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

  // --- Accès par lien personnel aux données du répertoire (C1) -------------
  // musiciens/techniciens ne sont plus lisibles par la clé anonyme : leur
  // lecture publique exposait 107 fiches avec téléphones, e-mails et notes
  // internes. Les pages à lien personnel passent par ces fonctions, qui ne
  // rendent que le strict nécessaire.
  //
  // Chacune retombe sur l'ancien accès direct si la fonction n'existe pas
  // encore côté base : le site et la migration SQL peuvent ainsi être déployés
  // dans n'importe quel ordre sans jamais couper les liens des musicien·nes.
  function _fonctionAbsente(error){
    return !!error && /(does not exist|Could not find the function|PGRST202)/i.test(error.message || '');
  }

  async function getOwnPersonByToken(token, personType, personId){
    if(!supabaseClient) return null;
    const { data, error } = await supabaseClient.rpc('get_own_person_by_token', { p_token: token });
    if(!error) return (data || [])[0] || null;
    if(!_fonctionAbsente(error)){
      console.warn('[CurieuxDB] getOwnPersonByToken', error.message);
      return null;
    }
    const table = personType === 'musicien' ? 'musiciens' : 'techniciens';
    const res = await supabaseClient.from(table).select('*').eq('id', personId).maybeSingle();
    return res.data || null;
  }

  // Annuaire réduit aux noms, pour choisir ses remplaçant·es : ni téléphone,
  // ni e-mail, ni notes, ni disponibilités.
  async function getRosterForPicker(token){
    if(!supabaseClient) return [];
    const { data, error } = await supabaseClient.rpc('get_roster_for_picker', { p_token: token });
    if(!error){
      return (data || []).map(r => ({
        id: r.id, personType: r.person_type, nom: r.nom, prenom: r.prenom, roleLabel: r.role_label
      }));
    }
    if(!_fonctionAbsente(error)){
      console.warn('[CurieuxDB] getRosterForPicker', error.message);
      return [];
    }
    const [mus, tech] = await Promise.all([
      supabaseClient.from('musiciens').select('id,prenom,nom,instrument'),
      supabaseClient.from('techniciens').select('id,prenom,nom,poste'),
    ]);
    return [
      ...(mus.data || []).map(m => ({ id:m.id, personType:'musicien', nom:m.nom, prenom:m.prenom, roleLabel: m.instrument || 'Musicien·ne' })),
      ...(tech.data || []).map(t => ({ id:t.id, personType:'technicien', nom:t.nom, prenom:t.prenom, roleLabel: t.poste || 'Technicien·ne' })),
    ];
  }

  async function getTourneeByToken(token, tourneeId){
    if(!supabaseClient) return null;
    const { data, error } = await supabaseClient.rpc('get_tournee_by_token', { p_token: token });
    if(!error) return (data || [])[0] || null;
    if(!_fonctionAbsente(error)){
      console.warn('[CurieuxDB] getTourneeByToken', error.message);
      return null;
    }
    const res = await supabaseClient.from('tournees').select('*').eq('id', tourneeId).maybeSingle();
    return res.data || null;
  }

  // Jeton permanent d'une personne (I3), indépendant des tournées : appelé
  // côté admin pour construire un lien qui survit au ménage des vieilles
  // tournées. Renvoie null si la base n'a pas encore la migration.
  // Renvoie { token } en cas de succès, sinon { error } — et non null quelle que
  // soit la cause : confondre « la migration n'est pas passée » avec « l'appel a
  // échoué » affichait un message faux dès que la fonction existait mais levait
  // une erreur.
  async function ensureAccesPersonnel(personId, personType){
    if(!supabaseClient) return { error: { message: 'Supabase non chargé' } };
    const { data, error } = await supabaseClient.rpc('ensure_acces_personnel',
      { p_person_id: personId, p_person_type: personType });
    if(error){
      console.warn('[CurieuxDB] ensureAccesPersonnel', error.message);
      return { error, migrationAbsente: _fonctionAbsente(error) };
    }
    return { token: data || null };
  }

  // Cachet individualisé (voir cachet_overrides dans migrations.sql) : la table reste
  // fermée à la clé anonyme, dispo-titulaire.html ne peut lire que le montant de LA
  // personne du token fourni — jamais la liste complète des montants de la tournée.
  async function getCachetOverrideByToken(token){
    if(!supabaseClient) return null;
    const { data, error } = await supabaseClient.rpc('get_cachet_override_by_token', { p_token: token });
    if(error){ console.warn('[CurieuxDB] getCachetOverrideByToken', error.message); return null; }
    const row = (data || [])[0];
    return row && row.montant != null ? row.montant : null;
  }
  // Efface toutes les exceptions de cachet d'une tournée d'un coup — utilisé quand le
  // cachet standard repasse à "non défini" (tournees.html) : une exception n'a de sens
  // que par rapport à un cachet standard existant.
  async function removeCachetOverridesForTournee(tourneeId){
    if(!supabaseClient) return { error: { message: 'Supabase non chargé' } };
    const { error } = await supabaseClient.from('cachet_overrides').delete().eq('tournee_id', tourneeId);
    if(error) console.warn('[CurieuxDB] removeCachetOverridesForTournee', error.message);
    return { error };
  }

  // Widget "Signaler un bug" (voir injectBugReportWidget dans brand-assets.js) —
  // écriture seule, table fermée en lecture à la clé anonyme (voir migrations.sql).
  async function reportBug(message, page, type){
    if(!supabaseClient) return { error: { message: 'Supabase non chargé' } };
    const id = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : 'bug-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
    const payload = adapterFor('bug_reports').toDb({ id, message, page, type });
    const { error } = await supabaseClient.from('bug_reports').insert(payload);
    if(error) console.warn('[CurieuxDB] reportBug', error.message);
    return { error };
  }

  return {
    fetchAll, syncCollection, upsertOne, removeOne, removeMany, removePerson, fetchSnapshot, saveSnapshot, subscribe,
    onEtatEcriture, reessayerEcritures, ecrituresEnAttente,
    signIn, signOut, getSession, onAuthStateChange, updateOwnPassword,
    getMyRole, hasAppAccess, isSuperAdmin,
    listAccounts, setAccountRole, removeAccount,
    createAccountWithPassword, sendMagicLinkInvite, fetchAuditLog,
    fetchCorbeille, restaurerDepuisCorbeille,
    getInfosSocialesByToken, upsertInfosSocialesByToken,
    getDispoDemandeByToken, markDispoRespondedByToken,
    updateOwnContactByToken, updateOwnDisponibilitesByToken, updateOwnPrenomUsageByToken,
    getRemplacantPrefsByToken, upsertRemplacantPrefsByToken,
    getOwnPersonByToken, getRosterForPicker, getTourneeByToken, ensureAccesPersonnel,
    getCachetOverrideByToken, removeCachetOverridesForTournee,
    reportBug
  };
})();
