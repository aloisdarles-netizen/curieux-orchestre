-- ============================================================================
-- Curieux orchestre — schéma Supabase (Postgres)
-- À coller tel quel dans Supabase → SQL Editor → New query → Run.
-- Accès public (pas de compte utilisateur) : RLS activé avec policies permissives.
-- ============================================================================

-- Fonction partagée : met à jour updated_at à chaque UPDATE.
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ----------------------------------------------------------------------------
-- musiciens  (← localStorage 'musiciens-v1')
-- ----------------------------------------------------------------------------
create table if not exists musiciens (
  id text primary key,
  prenom text default '',
  nom text default '',
  instrument text default '',
  pupitre text default 'Autre',
  statut_poste text default 'titulaire',
  rang integer,
  telephone text default '',
  email text default '',
  notes text default '',
  disponibilites jsonb not null default '{}'::jsonb,
  disponibilites_commentaires jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Rang de priorité des remplaçant·es (1 = à contacter en premier) et commentaire par
-- date de dispo : ajoutés après la création initiale de la table, donc "add column if
-- not exists" pour une base déjà provisionnée (le "create table if not exists" ci-dessus
-- ne touche pas une table existante).
alter table musiciens add column if not exists rang integer;
alter table musiciens add column if not exists disponibilites_commentaires jsonb not null default '{}'::jsonb;
drop trigger if exists trg_musiciens_updated_at on musiciens;
create trigger trg_musiciens_updated_at before update on musiciens
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- techniciens  (← localStorage 'techniciens-v1')
-- ----------------------------------------------------------------------------
create table if not exists techniciens (
  id text primary key,
  prenom text default '',
  nom text default '',
  poste text default '',
  pole text default 'Autre',
  statut_poste text default 'titulaire',
  telephone text default '',
  email text default '',
  notes text default '',
  disponibilites jsonb not null default '{}'::jsonb,
  disponibilites_commentaires jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table techniciens add column if not exists disponibilites_commentaires jsonb not null default '{}'::jsonb;
alter table techniciens add column if not exists statut_poste text default 'titulaire';
drop trigger if exists trg_techniciens_updated_at on techniciens;
create trigger trg_techniciens_updated_at before update on techniciens
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- tournees  (← localStorage 'tournees-v1')
-- Le tableau "dates" (statuts, affectations, blocs) reste en JSONB : structure
-- encore mouvante, toujours lue/écrite en bloc côté app.
-- ----------------------------------------------------------------------------
create table if not exists tournees (
  id text primary key,
  nom text default '',
  dates jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Cachet brut de la tournée (un seul montant pour toutes ses dates) : ajouté
-- après coup, pour une base déjà provisionnée.
alter table tournees add column if not exists cachet_statut text not null default 'non_defini' check (cachet_statut in ('non_defini','defini'));
alter table tournees add column if not exists cachet_montant numeric;
drop trigger if exists trg_tournees_updated_at on tournees;
create trigger trg_tournees_updated_at before update on tournees
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- feuilles_route  (← localStorage 'fdr-collection-v1')
-- Objet riche et évolutif (contacts, trajets, planning, lieu, hôtel...) : gardé
-- tel quel en JSONB pour zéro breaking change.
-- ----------------------------------------------------------------------------
create table if not exists feuilles_route (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_feuilles_route_updated_at on feuilles_route;
create trigger trg_feuilles_route_updated_at before update on feuilles_route
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- carnet_contacts  (← localStorage 'contacts-carnet-v1')
-- ----------------------------------------------------------------------------
create table if not exists carnet_contacts (
  id text primary key,
  role text default '',
  nom text default '',
  indicatif text default '+33',
  tel text default '',
  email text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_carnet_contacts_updated_at on carnet_contacts;
create trigger trg_carnet_contacts_updated_at before update on carnet_contacts
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- newsletter_snapshot  (← localStorage 'newsletter-snapshot-v1')
-- Singleton : une seule ligne (id fixé à 1), écrite via upsert.
-- ----------------------------------------------------------------------------
create table if not exists newsletter_snapshot (
  id int primary key default 1 check (id = 1),
  sent_at timestamptz,
  entries jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_newsletter_snapshot_updated_at on newsletter_snapshot;
create trigger trg_newsletter_snapshot_updated_at before update on newsletter_snapshot
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- dispo_demandes  (liens personnels de demande de disponibilité, envoyés aux
-- titulaires uniquement — un token imprévisible par personne/tournée, pas de
-- compte : "id" EST le token utilisé dans l'URL du lien).
-- ----------------------------------------------------------------------------
create table if not exists dispo_demandes (
  id text primary key,
  tournee_id text not null references tournees(id) on delete cascade,
  person_type text not null check (person_type in ('musicien','technicien')),
  person_id text not null,
  last_responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Sous-ensemble de dates (ids) proposées à cette personne au lieu de toutes les dates
-- de la tournée — utilisé pour les remplaçant·es sollicité·es sur des dates précises
-- seulement. Tableau vide = pas de restriction (comportement historique, tout est
-- proposé, y compris les dates ajoutées après coup).
alter table dispo_demandes add column if not exists dates jsonb not null default '[]'::jsonb;
-- Horodatage de la dernière relance envoyée (bouton "Relancer" de suivi-dispo.html) —
-- distingue "Première relance" de "Relancer" pour l'admin. On ne peut pas savoir si le
-- message a vraiment été envoyé (WhatsApp/email s'ouvrent dans une autre app), donc on
-- enregistre l'intention au clic, en cohérence avec le reste de l'app (best-effort).
alter table dispo_demandes add column if not exists last_reminder_at timestamptz;
drop trigger if exists trg_dispo_demandes_updated_at on dispo_demandes;
create trigger trg_dispo_demandes_updated_at before update on dispo_demandes
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- infos_sociales_admins — liste blanche des comptes (Supabase Auth) autorisés à
-- utiliser les pages admin de l'app. Ajouter une ligne (email) donne accès, en
-- retirer une le retire. Deux rôles :
--   'admin' — accès à tout, y compris infos_sociales et la gestion des comptes
--             elle-même (admin-dashboard.html).
--   'user'  — accès aux pages admin courantes (annuaires, tournées, dispos,
--             feuilles de route...) mais PAS à infos_sociales ni au dashboard.
-- Un compte 'admin' peut lister/ajouter/modifier/retirer n'importe quelle
-- ligne (policy "admins manage all rows" ci-dessous) ; un compte 'user' ne
-- peut lire QUE sa propre ligne (policy "self read own row"), pour connaître
-- son propre rôle sans pouvoir lister les autres comptes.
-- ----------------------------------------------------------------------------
create table if not exists infos_sociales_admins (
  email text primary key,
  role text not null default 'admin' check (role in ('admin','user'))
);
-- Ajoutée après coup : les comptes déjà en liste blanche avant l'introduction
-- des rôles restent 'admin' par défaut, pour ne pas perdre l'accès existant.
alter table infos_sociales_admins add column if not exists role text not null default 'admin' check (role in ('admin','user'));
insert into infos_sociales_admins (email, role) values ('alois.darles@lessoudaines.fr', 'admin')
  on conflict (email) do nothing;

-- ----------------------------------------------------------------------------
-- infos_sociales — zone protégée : infos nécessaires à l'embauche (identité
-- civile, n° sécu, RIB, statut intermittent). Une ligne par musicien·ne ou
-- technicien·ne, "id" = le même id que dans musiciens/techniciens (pas de FK
-- stricte : les deux tables partagent l'espace d'id, préfixé "mus"/"tech").
-- "extra" en JSONB accueille des champs additionnels ajoutés depuis l'app sans
-- nouvelle migration.
-- ----------------------------------------------------------------------------
create table if not exists infos_sociales (
  id text primary key,
  person_type text not null check (person_type in ('musicien','technicien')),
  genre text default '',
  genre_detail text default '',
  prenom_civil text default '',
  date_naissance date,
  lieu_naissance text default '',
  nationalite text default '',
  adresse text default '',
  num_secu text default '',
  iban text default '',
  bic text default '',
  titulaire_compte text default '',
  num_conges_spectacles text default '',
  num_audiens text default '',
  contact_urgence_nom text default '',
  contact_urgence_tel text default '',
  permis_conduire text default '',
  permis_conduire_type text default '',
  permis_conduire_type_detail text default '',
  taille_vetement text default '',
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Remplace num_objet_employeur/num_aem (retirés — générés côté employeur/GUSO,
-- ça n'avait pas de sens de les demander à la personne embauchée) par
-- num_conges_spectacles, ajouté après coup pour une base déjà provisionnée.
alter table infos_sociales add column if not exists num_conges_spectacles text default '';
-- Contact d'urgence et permis de conduire (utile pour qui conduit le
-- tourbus) : ajoutés après coup, mêmes colonnes que le "create table" ci-dessus
-- pour une base déjà provisionnée.
alter table infos_sociales add column if not exists contact_urgence_nom text default '';
alter table infos_sociales add column if not exists contact_urgence_tel text default '';
alter table infos_sociales add column if not exists taille_vetement text default '';
-- Genre, ajouté après coup.
alter table infos_sociales add column if not exists genre text default '';
alter table infos_sociales add column if not exists genre_detail text default '';
-- Prénom d'état civil, uniquement s'il diffère du prénom d'usage (celui déjà
-- utilisé partout ailleurs dans l'app, musiciens.prenom/techniciens.prenom) —
-- nécessaire pour les documents administratifs (contrat, DPAE...).
alter table infos_sociales add column if not exists prenom_civil text default '';
-- Permis de conduire simplifié en oui/non + type (B/autre) — remplace les
-- anciennes colonnes permis_conduire_numero/permis_conduire_validite (pas
-- droppées, juste plus utilisées : on ne demandait pas vraiment besoin du
-- numéro exact ni de la date de validité, juste de savoir si la personne
-- peut conduire et avec quel type de permis).
alter table infos_sociales add column if not exists permis_conduire text default '';
alter table infos_sociales add column if not exists permis_conduire_type text default '';
alter table infos_sociales add column if not exists permis_conduire_type_detail text default '';
drop trigger if exists trg_infos_sociales_updated_at on infos_sociales;
create trigger trg_infos_sociales_updated_at before update on infos_sociales
  for each row execute function set_updated_at();

-- RLS restrictive (à l'opposé du reste du schéma, volontairement public) :
-- seuls les comptes Supabase Auth listés dans infos_sociales_admins peuvent lire
-- ou écrire infos_sociales. Nécessite un vrai compte (email + mot de passe) créé
-- dans Supabase → Authentication → Users, voir SETUP_LOCAL.md.
alter table infos_sociales_admins enable row level security;
alter table infos_sociales enable row level security;

drop policy if exists "self read own admin row" on infos_sociales_admins;
drop policy if exists "self read own row" on infos_sociales_admins;
create policy "self read own row" on infos_sociales_admins
  for select using (email = auth.jwt()->>'email');

-- Vérifie si le compte connecté a le rôle 'admin'. SECURITY DEFINER : la
-- lecture interne de infos_sociales_admins CONTOURNE le RLS de la table,
-- ce qui casse la récursion — une policy qui interroge sa propre table via
-- une sous-requête normale (sans passer par une fonction definer) déclenche
-- une erreur Postgres "infinite recursion detected in policy for relation"
-- (silencieuse côté app : elle finit juste par bloquer tout accès admin,
-- y compris pour le compte déjà listé dans la table).
create or replace function is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from infos_sociales_admins
    where email = auth.jwt()->>'email' and role = 'admin'
  );
$$;
grant execute on function is_admin() to anon, authenticated;

-- Même chose, mais pour "a un compte listé, quel que soit son rôle" — utilisée
-- pour verrouiller dispo_demandes (voir plus bas) aux pages admin courantes
-- (tournées, suivi des dispos), accessibles aussi bien aux 'admin' qu'aux 'user'.
create or replace function has_access()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from infos_sociales_admins where email = auth.jwt()->>'email'
  );
$$;
grant execute on function has_access() to anon, authenticated;

-- Un compte 'admin' peut lire/ajouter/modifier/retirer n'importe quelle ligne
-- (gestion des comptes depuis admin-dashboard.html).
drop policy if exists "admins manage all rows" on infos_sociales_admins;
create policy "admins manage all rows" on infos_sociales_admins
  for all
  using (is_admin())
  with check (is_admin());

-- infos_sociales reste réservée au rôle 'admin' précisément (pas 'user').
drop policy if exists "admins only" on infos_sociales;
create policy "admins only" on infos_sociales
  for all
  using (is_admin())
  with check (is_admin());

-- dispo_demandes : réservée aux comptes admin/user connectés (génération et
-- gestion des liens perso, depuis tournees.html/suivi-dispo.html). PAS en
-- accès public — voir plus bas pour l'explication de sécurité et les deux
-- fonctions SECURITY DEFINER qui permettent quand même aux titulaires (sans
-- compte) de lire/mettre à jour LEUR PROPRE ligne via leur token.
alter table dispo_demandes enable row level security;
drop policy if exists "public full access" on dispo_demandes;
drop policy if exists "admin access" on dispo_demandes;
create policy "admin access" on dispo_demandes
  for all
  using (has_access())
  with check (has_access());

-- CORRECTIF SÉCURITÉ : avant ces deux fonctions, dispo-titulaire.html et
-- mes-infos.html lisaient/écrivaient dispo_demandes DIRECTEMENT via la clé
-- anonyme (RLS "public full access"). Comme get_own_infos_sociales /
-- upsert_own_infos_sociales font confiance à n'importe quel id de
-- dispo_demandes comme preuve d'identité, ça permettait à n'importe qui de :
-- (1) lire tous les tokens existants directement sur la table, ou (2) en
-- fabriquer un pointant vers n'importe quelle personne — et donc lire/écraser
-- le n° sécu/IBAN/adresse de n'importe qui, sans jamais se connecter. Ces deux
-- fonctions donnent aux pages publiques un accès étroit (une seule ligne, par
-- son token exact) sans jamais exposer la table elle-même à la clé anonyme.
create or replace function get_dispo_demande_by_token(p_token text)
returns setof dispo_demandes
language sql
security definer
set search_path = public
as $$
  select * from dispo_demandes where id = p_token;
$$;

create or replace function mark_dispo_responded_by_token(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update dispo_demandes set last_responded_at = now() where id = p_token;
end;
$$;

grant execute on function get_dispo_demande_by_token(text) to anon, authenticated;
grant execute on function mark_dispo_responded_by_token(text) to anon, authenticated;

-- Auto-saisie (mes-infos.html) : PAS de compte séparé — on réutilise le même
-- lien personnel imprévisible que pour les dispos (dispo_demandes.id comme
-- token dans l'URL, voir dispo-titulaire.html). infos_sociales reste
-- interdite d'accès direct à la clé anonyme (seule "admins only" ci-dessus y
-- touche) ; l'auto-saisie passe par deux fonctions SECURITY DEFINER qui
-- valident le token contre dispo_demandes AVANT de lire/écrire, en
-- contournant volontairement le RLS de la table une fois le token vérifié —
-- c'est le seul chemin par lequel un token donne accès à une ligne précise.
create or replace function get_own_infos_sociales(p_token text)
returns setof infos_sociales
language sql
security definer
set search_path = public
as $$
  select s.* from infos_sociales s
  join dispo_demandes d on d.person_id = s.id
  where d.id = p_token;
$$;

create or replace function upsert_own_infos_sociales(p_token text, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person_id text;
  v_person_type text;
begin
  select person_id, person_type into v_person_id, v_person_type
  from dispo_demandes where id = p_token;

  if v_person_id is null then
    raise exception 'Lien invalide';
  end if;

  insert into infos_sociales (
    id, person_type, genre, genre_detail, prenom_civil, date_naissance, lieu_naissance, nationalite, adresse,
    num_secu, iban, bic, titulaire_compte, num_conges_spectacles, num_audiens,
    contact_urgence_nom, contact_urgence_tel, permis_conduire,
    permis_conduire_type, permis_conduire_type_detail, taille_vetement, extra
  ) values (
    v_person_id, v_person_type, p_payload->>'genre', p_payload->>'genre_detail', p_payload->>'prenom_civil',
    nullif(p_payload->>'date_naissance','')::date, p_payload->>'lieu_naissance',
    p_payload->>'nationalite', p_payload->>'adresse',
    p_payload->>'num_secu', p_payload->>'iban', p_payload->>'bic', p_payload->>'titulaire_compte',
    p_payload->>'num_conges_spectacles', p_payload->>'num_audiens',
    p_payload->>'contact_urgence_nom', p_payload->>'contact_urgence_tel',
    p_payload->>'permis_conduire', p_payload->>'permis_conduire_type', p_payload->>'permis_conduire_type_detail',
    p_payload->>'taille_vetement',
    coalesce(p_payload->'extra', '{}'::jsonb)
  )
  on conflict (id) do update set
    person_type = excluded.person_type,
    genre = excluded.genre,
    genre_detail = excluded.genre_detail,
    prenom_civil = excluded.prenom_civil,
    date_naissance = excluded.date_naissance,
    lieu_naissance = excluded.lieu_naissance,
    nationalite = excluded.nationalite,
    adresse = excluded.adresse,
    num_secu = excluded.num_secu,
    iban = excluded.iban,
    bic = excluded.bic,
    titulaire_compte = excluded.titulaire_compte,
    num_conges_spectacles = excluded.num_conges_spectacles,
    num_audiens = excluded.num_audiens,
    contact_urgence_nom = excluded.contact_urgence_nom,
    contact_urgence_tel = excluded.contact_urgence_tel,
    permis_conduire = excluded.permis_conduire,
    permis_conduire_type = excluded.permis_conduire_type,
    permis_conduire_type_detail = excluded.permis_conduire_type_detail,
    taille_vetement = excluded.taille_vetement,
    extra = excluded.extra;
end;
$$;

-- La validation du token est DANS la fonction, pas dans le grant : donner
-- l'exécution à la clé anonyme est donc sans risque, comme le reste de l'app
-- publique — sans token valide, les fonctions ne renvoient/n'écrivent rien.
grant execute on function get_own_infos_sociales(text) to anon, authenticated;
grant execute on function upsert_own_infos_sociales(text, jsonb) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- remplacant_prefs — liste personnelle et permanente des remplaçant·es
-- classé·es (rang 1 = principal, jusqu'à 10) par chaque titulaire, gérée
-- depuis mes-remplacants.html. Une ligne par titulaire ("id" = son person_id,
-- espace d'id déjà partagé musiciens/techniciens, préfixé mus/tech). "items"
-- est un tableau JSONB, chaque entrée soit un renvoi vers une personne déjà
-- au répertoire ({source:'roster', personId, personType}), soit une personne
-- pas encore connue de l'app ({source:'new', nom, prenom, telephone, email})
-- saisie directement par le titulaire — volontairement PAS insérée dans
-- musiciens/techniciens (répertoire géré par l'admin), pour ne pas le
-- polluer avec des fiches incomplètes/non vérifiées depuis une page publique.
-- Comme infos_sociales/dispo_demandes, contient des coordonnées de tiers :
-- fermée à la clé anonyme, accès uniquement via les deux fonctions
-- SECURITY DEFINER ci-dessous qui valident le token contre dispo_demandes —
-- N'IMPORTE LEQUEL des tokens déjà envoyés à ce titulaire (une tournée
-- passée suffit) permet de gérer cette liste permanente, pas besoin d'un
-- nouveau token dédié.
-- ----------------------------------------------------------------------------
create table if not exists remplacant_prefs (
  id text primary key,
  person_type text not null check (person_type in ('musicien','technicien')),
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_remplacant_prefs_updated_at on remplacant_prefs;
create trigger trg_remplacant_prefs_updated_at before update on remplacant_prefs
  for each row execute function set_updated_at();

alter table remplacant_prefs enable row level security;
drop policy if exists "admin access" on remplacant_prefs;
create policy "admin access" on remplacant_prefs
  for all
  using (has_access())
  with check (has_access());

create or replace function get_own_remplacant_prefs(p_token text)
returns setof remplacant_prefs
language sql
security definer
set search_path = public
as $$
  select r.* from remplacant_prefs r
  join dispo_demandes d on d.person_id = r.id
  where d.id = p_token;
$$;

create or replace function upsert_own_remplacant_prefs(p_token text, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person_id text;
  v_person_type text;
begin
  select person_id, person_type into v_person_id, v_person_type
  from dispo_demandes where id = p_token;

  if v_person_id is null then
    raise exception 'Lien invalide';
  end if;

  insert into remplacant_prefs (id, person_type, items)
  values (v_person_id, v_person_type, p_items)
  on conflict (id) do update set
    person_type = excluded.person_type,
    items = excluded.items;
end;
$$;

grant execute on function get_own_remplacant_prefs(text) to anon, authenticated;
grant execute on function upsert_own_remplacant_prefs(text, jsonb) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- cachet_overrides — exceptions par personne au cachet standard d'une tournée
-- (tournees.cachet_montant), gérées depuis tournees.html. "id" =
-- `${tournee_id}::${person_type}::${person_id}` (clé composite encodée en texte,
-- pour rester compatible avec les helpers génériques upsertOne/removeOne du
-- reste de l'app, qui opèrent tous sur une colonne "id"). Contrairement au
-- cachet standard (colonne publique de tournees, identique pour tout le
-- monde), un montant individualisé est une donnée de paie sensible : la table
-- reste fermée à la clé anonyme, et dispo-titulaire.html n'y accède que via
-- get_cachet_override_by_token, qui ne renvoie jamais que LE montant de la
-- personne du token fourni — jamais la liste complète de la tournée.
-- ----------------------------------------------------------------------------
create table if not exists cachet_overrides (
  id text primary key,
  tournee_id text not null references tournees(id) on delete cascade,
  person_type text not null check (person_type in ('musicien','technicien')),
  person_id text not null,
  montant numeric not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_cachet_overrides_tournee on cachet_overrides(tournee_id);
drop trigger if exists trg_cachet_overrides_updated_at on cachet_overrides;
create trigger trg_cachet_overrides_updated_at before update on cachet_overrides
  for each row execute function set_updated_at();

alter table cachet_overrides enable row level security;
drop policy if exists "admin access" on cachet_overrides;
create policy "admin access" on cachet_overrides
  for all
  using (has_access())
  with check (has_access());

create or replace function get_cachet_override_by_token(p_token text)
returns table(montant numeric)
language sql
security definer
set search_path = public
as $$
  select co.montant from cachet_overrides co
  join dispo_demandes d
    on d.tournee_id = co.tournee_id
    and d.person_type = co.person_type
    and d.person_id = co.person_id
  where d.id = p_token;
$$;

grant execute on function get_cachet_override_by_token(text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- bug_reports — petit widget "Signaler un bug" présent sur TOUTES les pages
-- (admin comme publiques par lien perso), voir injectBugReportWidget() dans
-- assets/brand-assets.js. Écriture ouverte à la clé anonyme (n'importe qui
-- doit pouvoir signaler un problème sans compte) mais lecture/suppression
-- réservées au rôle 'admin' (console admin-dashboard.html) — comme
-- audit_log, ce n'est pas un canal qu'on veut voir listé/lu publiquement.
-- ----------------------------------------------------------------------------
create table if not exists bug_reports (
  id text primary key,
  message text not null,
  page text default '',
  created_at timestamptz not null default now()
);
create index if not exists idx_bug_reports_created_at on bug_reports (created_at desc);
-- Catégorie choisie dans le widget : distingue un vrai bug d'une simple idée
-- d'amélioration ou d'une incohérence repérée — pour que la console admin
-- serve aussi de liste centralisée des futures missions d'amélioration, pas
-- seulement des pannes. Ajoutée après coup, pour une base déjà provisionnée.
alter table bug_reports add column if not exists type text not null default 'bug' check (type in ('bug','amelioration','incoherence'));

alter table bug_reports enable row level security;

drop policy if exists "public can report" on bug_reports;
create policy "public can report" on bug_reports
  for insert
  with check (true);

drop policy if exists "admins read reports" on bug_reports;
create policy "admins read reports" on bug_reports
  for select
  using (is_admin());

drop policy if exists "admins delete reports" on bug_reports;
create policy "admins delete reports" on bug_reports
  for delete
  using (is_admin());

-- ============================================================================
-- RLS : lecture publique large (pas de compte utilisateur), mais ÉCRITURE
-- réservée aux comptes admin/user (has_access()) — sauf pour les deux fonctions
-- SECURITY DEFINER à token ci-dessous, seul chemin d'écriture public restant.
--
-- Historique : musiciens/techniciens/tournees/feuilles_route/carnet_contacts/
-- newsletter_snapshot étaient auparavant en "public full access" (using(true)
-- with check(true)) — donc en écriture ouverte à la clé anonyme, la même clé
-- visible dans le code source de n'importe quelle page. dispo-titulaire.html
-- écrivait directement dans musiciens/techniciens (coordonnées, dispos) sans
-- passer par un token vérifié côté serveur : la seule chose qui empêchait de
-- modifier la fiche de N'IMPORTE QUI (pas seulement la sienne) via un appel
-- direct à l'API était le comportement du site, pas une règle en base.
-- infos_sociales / infos_sociales_admins / dispo_demandes / remplacant_prefs
-- avaient déjà ce traitement (accès direct fermé, RPC à token) — musiciens/
-- techniciens/tournees suivent enfin le même principe.
-- ============================================================================
alter table musiciens enable row level security;
alter table techniciens enable row level security;
alter table tournees enable row level security;
alter table feuilles_route enable row level security;
alter table carnet_contacts enable row level security;
alter table newsletter_snapshot enable row level security;
-- dispo_demandes est déjà passée en RLS plus haut (policy "admin access").

drop policy if exists "public full access" on musiciens;
drop policy if exists "public read" on musiciens;
drop policy if exists "admin write insert" on musiciens;
drop policy if exists "admin write update" on musiciens;
drop policy if exists "admin write delete" on musiciens;
-- Lecture publique conservée : dispo-titulaire.html (sa propre fiche) et
-- mes-remplacants.html (recherche dans tout le répertoire) en ont besoin sans
-- compte. L'écriture publique, elle, ne passe plus que par les fonctions à
-- token plus bas (SECURITY DEFINER, donc pas soumises à ces policies).
create policy "public read" on musiciens for select using (true);
create policy "admin write insert" on musiciens for insert with check (has_access());
create policy "admin write update" on musiciens for update using (has_access()) with check (has_access());
create policy "admin write delete" on musiciens for delete using (has_access());

drop policy if exists "public full access" on techniciens;
drop policy if exists "public read" on techniciens;
drop policy if exists "admin write insert" on techniciens;
drop policy if exists "admin write update" on techniciens;
drop policy if exists "admin write delete" on techniciens;
create policy "public read" on techniciens for select using (true);
create policy "admin write insert" on techniciens for insert with check (has_access());
create policy "admin write update" on techniciens for update using (has_access()) with check (has_access());
create policy "admin write delete" on techniciens for delete using (has_access());

drop policy if exists "public full access" on tournees;
drop policy if exists "public read" on tournees;
drop policy if exists "admin write insert" on tournees;
drop policy if exists "admin write update" on tournees;
drop policy if exists "admin write delete" on tournees;
-- Lecture publique conservée : dispo-titulaire.html affiche le nom de la
-- tournée et le cachet standard. Aucune page publique n'écrit jamais dans
-- tournees (le cachet individualisé passe par cachet_overrides, cloisonnée).
create policy "public read" on tournees for select using (true);
create policy "admin write insert" on tournees for insert with check (has_access());
create policy "admin write update" on tournees for update using (has_access()) with check (has_access());
create policy "admin write delete" on tournees for delete using (has_access());

-- Chaque "create policy" est précédé du "drop policy if exists" de CETTE
-- policy : sans cela, rejouer le fichier échouait ici ("policy already
-- exists") et tout ce qui suit — dont la fermeture de la lecture publique du
-- répertoire, en fin de fichier — n'était jamais exécuté.
-- feuilles_route / carnet_contacts / newsletter_snapshot : aucune page
-- publique n'y touche jamais (feuille-de-route.html, feuilles-de-route.html
-- et newsletter.html exigent toutes un compte) — fermées entièrement,
-- lecture comprise, plutôt que juste l'écriture comme ci-dessus.
drop policy if exists "public full access" on feuilles_route;
drop policy if exists "admin access" on feuilles_route;
create policy "admin access" on feuilles_route for all using (has_access()) with check (has_access());

drop policy if exists "public full access" on carnet_contacts;
drop policy if exists "admin access" on carnet_contacts;
create policy "admin access" on carnet_contacts for all using (has_access()) with check (has_access());

drop policy if exists "public full access" on newsletter_snapshot;
drop policy if exists "admin access" on newsletter_snapshot;
create policy "admin access" on newsletter_snapshot for all using (has_access()) with check (has_access());

-- dispo_demandes N'EST PLUS en "public full access" : sa policy "admin access"
-- (basée sur has_access()) est définie plus haut, juste après is_admin() — voir
-- le commentaire à cet endroit pour l'explication de sécurité.

-- Écriture publique sur SA PROPRE fiche (coordonnées + dispos), depuis
-- dispo-titulaire.html — même principe que get_own_infos_sociales : le token
-- est vérifié contre dispo_demandes avant d'écrire, en SECURITY DEFINER pour
-- contourner le RLS ci-dessus une fois cette vérification faite.
create or replace function update_own_contact_by_token(p_token text, p_telephone text, p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person_id text;
  v_person_type text;
begin
  select person_id, person_type into v_person_id, v_person_type
  from dispo_demandes where id = p_token;
  if v_person_id is null then
    raise exception 'Lien invalide';
  end if;
  if v_person_type = 'musicien' then
    update musiciens set telephone = p_telephone, email = p_email where id = v_person_id;
  else
    update techniciens set telephone = p_telephone, email = p_email where id = v_person_id;
  end if;
end;
$$;

create or replace function update_own_disponibilites_by_token(
  p_token text, p_disponibilites jsonb, p_disponibilites_commentaires jsonb, p_telephone text, p_email text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person_id text;
  v_person_type text;
begin
  select person_id, person_type into v_person_id, v_person_type
  from dispo_demandes where id = p_token;
  if v_person_id is null then
    raise exception 'Lien invalide';
  end if;
  if v_person_type = 'musicien' then
    update musiciens set
      disponibilites = p_disponibilites, disponibilites_commentaires = p_disponibilites_commentaires,
      telephone = p_telephone, email = p_email
    where id = v_person_id;
  else
    update techniciens set
      disponibilites = p_disponibilites, disponibilites_commentaires = p_disponibilites_commentaires,
      telephone = p_telephone, email = p_email
    where id = v_person_id;
  end if;
end;
$$;

grant execute on function update_own_contact_by_token(text, text, text) to anon, authenticated;
grant execute on function update_own_disponibilites_by_token(text, jsonb, jsonb, text, text) to anon, authenticated;

-- Renommage d'affichage (mes-infos.html, "Prénom d'usage") : musiciens.prenom/
-- techniciens.prenom sert de nom affiché PARTOUT dans l'app (annuaire, plannings,
-- feuilles de route, etc.), donc le modifier ici suffit à propager le changement
-- sans toucher au reste du code. Avant d'écraser ce prénom, l'ancien est préservé
-- dans infos_sociales.prenom_civil (identité d'état civil, utilisée pour les
-- documents administratifs) — mais seulement s'il n'y est pas déjà, pour ne
-- jamais écraser un prénom civil déjà renseigné explicitement (par un admin ou
-- un précédent renommage).
create or replace function update_own_prenom_usage_by_token(p_token text, p_prenom_usage text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person_id text;
  v_person_type text;
  v_current_prenom text;
begin
  if p_prenom_usage is null or btrim(p_prenom_usage) = '' then
    return;
  end if;

  select person_id, person_type into v_person_id, v_person_type
  from dispo_demandes where id = p_token;
  if v_person_id is null then
    raise exception 'Lien invalide';
  end if;

  if v_person_type = 'musicien' then
    select prenom into v_current_prenom from musiciens where id = v_person_id;
  else
    select prenom into v_current_prenom from techniciens where id = v_person_id;
  end if;

  if v_current_prenom is not distinct from p_prenom_usage then
    return;
  end if;

  insert into infos_sociales (id, person_type, prenom_civil)
  values (v_person_id, v_person_type, coalesce(v_current_prenom, ''))
  on conflict (id) do update set
    prenom_civil = case when coalesce(infos_sociales.prenom_civil, '') = ''
                         then excluded.prenom_civil
                         else infos_sociales.prenom_civil end;

  if v_person_type = 'musicien' then
    update musiciens set prenom = p_prenom_usage where id = v_person_id;
  else
    update techniciens set prenom = p_prenom_usage where id = v_person_id;
  end if;
end;
$$;

grant execute on function update_own_prenom_usage_by_token(text, text) to anon, authenticated;

-- ============================================================================
-- audit_log — historique des modifications, lisible uniquement par les
-- comptes 'admin' (page admin-dashboard.html). Écrit UNIQUEMENT par les
-- fonctions trigger ci-dessous (SECURITY DEFINER) : aucune policy
-- insert/update/delete n'est donnée à anon/authenticated, pour que ce journal
-- ne puisse pas être falsifié depuis le client.
-- Pour infos_sociales (données sensibles), on ne logue QUE la liste des
-- champs modifiés — jamais les valeurs (n° sécu, IBAN...) — pour ne pas
-- dupliquer des données sensibles dans une table moins cloisonnée.
-- ============================================================================
create table if not exists audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  row_id text not null,
  action text not null check (action in ('INSERT','UPDATE','DELETE')),
  changed_by text,
  old_data jsonb,
  new_data jsonb,
  changed_at timestamptz not null default now()
);
create index if not exists idx_audit_log_table_changed_at on audit_log (table_name, changed_at desc);
create index if not exists idx_audit_log_row_id on audit_log (row_id);

alter table audit_log enable row level security;
drop policy if exists "admins read audit log" on audit_log;
create policy "admins read audit log" on audit_log
  for select
  using (is_admin());

-- Trigger générique (avant/après complets) pour les tables "normales".
create or replace function audit_trigger_func()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    insert into audit_log(table_name, row_id, action, changed_by, old_data, new_data)
    values (tg_table_name, old.id::text, tg_op, auth.jwt()->>'email', to_jsonb(old), null);
    return old;
  elsif tg_op = 'INSERT' then
    insert into audit_log(table_name, row_id, action, changed_by, old_data, new_data)
    values (tg_table_name, new.id::text, tg_op, auth.jwt()->>'email', null, to_jsonb(new));
    return new;
  else
    -- Beaucoup d'écritures re-upsertent une ligne inchangée (syncCollection
    -- sauvegarde toute une collection même quand une seule ligne a bougé) :
    -- pas la peine de noircir le journal d'une "modification" quand seul
    -- updated_at a changé.
    if (to_jsonb(old) - 'updated_at') = (to_jsonb(new) - 'updated_at') then
      return new;
    end if;
    insert into audit_log(table_name, row_id, action, changed_by, old_data, new_data)
    values (tg_table_name, new.id::text, tg_op, auth.jwt()->>'email', to_jsonb(old), to_jsonb(new));
    return new;
  end if;
end;
$$;

-- remplacant_prefs et cachet_overrides ajoutées : ce sont des données qui changent
-- en dehors de l'écran admin (lien perso du titulaire pour la première, saisie admin
-- mais sensible côté paie pour la seconde) — sans trace, un changement inattendu
-- passait inaperçu.
do $$
declare tbl text;
begin
  foreach tbl in array array['musiciens','techniciens','tournees','feuilles_route','carnet_contacts','newsletter_snapshot','dispo_demandes','remplacant_prefs','cachet_overrides']
  loop
    execute format('drop trigger if exists trg_audit_%1$s on %1$I', tbl);
    execute format('create trigger trg_audit_%1$s after insert or update or delete on %1$I for each row execute function audit_trigger_func()', tbl);
  end loop;
end $$;

-- Trigger dédié pour infos_sociales : ne logue que les noms de champs
-- modifiés (pas les valeurs), pour ne jamais exposer n° sécu/IBAN/etc. dans
-- ce journal.
create or replace function audit_trigger_infos_sociales()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cols text[] := array['genre','genre_detail','prenom_civil','date_naissance','lieu_naissance','nationalite','adresse',
    'num_secu','iban','bic','titulaire_compte','num_conges_spectacles','num_audiens',
    'contact_urgence_nom','contact_urgence_tel','permis_conduire','permis_conduire_type',
    'permis_conduire_type_detail','taille_vetement'];
  v_col text;
  v_changed text[] := array[]::text[];
  v_old jsonb;
  v_new jsonb;
begin
  if tg_op = 'DELETE' then
    insert into audit_log(table_name, row_id, action, changed_by, old_data, new_data)
    values ('infos_sociales', old.id, tg_op, auth.jwt()->>'email', jsonb_build_object('fields', to_jsonb(v_cols)), null);
    return old;
  end if;

  if tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    foreach v_col in array v_cols loop
      if v_old->>v_col is distinct from v_new->>v_col then
        v_changed := array_append(v_changed, v_col);
      end if;
    end loop;
    if array_length(v_changed, 1) is null then
      return new;
    end if;
    insert into audit_log(table_name, row_id, action, changed_by, old_data, new_data)
    values ('infos_sociales', new.id, tg_op, auth.jwt()->>'email', null, jsonb_build_object('fields_changed', to_jsonb(v_changed)));
    return new;
  end if;

  insert into audit_log(table_name, row_id, action, changed_by, old_data, new_data)
  values ('infos_sociales', new.id, tg_op, auth.jwt()->>'email', null, jsonb_build_object('note', 'fiche créée'));
  return new;
end;
$$;

drop trigger if exists trg_audit_infos_sociales on infos_sociales;
create trigger trg_audit_infos_sociales after insert or update or delete on infos_sociales
  for each row execute function audit_trigger_infos_sociales();

-- ============================================================================
-- Realtime : ajoute les tables à la publication utilisée par le Realtime
-- de Supabase, pour que les changements se propagent instantanément.
-- ============================================================================
-- "add table" échoue si la table est déjà membre de la publication (pas de variante
-- "if not exists" en SQL pur) — on vérifie donc via pg_publication_tables avant d'ajouter,
-- pour que ce fichier reste rejouable tel quel sans erreur sur une base déjà provisionnée.
do $$
declare
  tbl text;
begin
  foreach tbl in array array['musiciens','techniciens','tournees','feuilles_route','carnet_contacts','newsletter_snapshot','dispo_demandes']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = tbl
    ) then
      execute format('alter publication supabase_realtime add table %I', tbl);
    end if;
  end loop;
end $$;

-- Replica identity FULL : permet à Realtime d'envoyer l'ancienne ET la nouvelle
-- ligne sur UPDATE/DELETE (utile pour reconstruire l'état côté client).
alter table musiciens replica identity full;
alter table techniciens replica identity full;
alter table tournees replica identity full;
alter table feuilles_route replica identity full;
alter table carnet_contacts replica identity full;
alter table newsletter_snapshot replica identity full;
alter table dispo_demandes replica identity full;

-- ============================================================================
-- Août 2026 — suites de l'audit. Ajouté à la fin du fichier, qui reste
-- rejouable en entier sans risque.
--
--  C1  ferme la lecture publique de musiciens/techniciens
--  I3  découple les accès personnels des tournées
--  M6  index manquants et purge du journal d'audit
--  M7  plafonne les signalements de bug
-- ============================================================================

-- ----------------------------------------------------------------------------
-- I3 — accès personnels permanents.
--
-- Jusqu'ici, le lien personnel d'une personne était l'id d'une ligne de
-- dispo_demandes, elle-même rattachée à une tournée en suppression en cascade.
-- Conséquence : faire du ménage dans les vieilles tournées révoquait sans
-- prévenir l'accès des musicien·nes à leurs propres infos et à leur liste de
-- remplaçant·es, qui n'ont pourtant rien à voir avec une tournée précise.
--
-- Un jeton permanent par personne règle cela. Les jetons de dispo_demandes
-- restent valables : tous les liens déjà envoyés continuent de fonctionner.
-- ----------------------------------------------------------------------------
create table if not exists acces_personnels (
  token text primary key,
  person_id text not null,
  person_type text not null check (person_type in ('musicien','technicien')),
  created_at timestamptz not null default now()
);
create unique index if not exists idx_acces_personnels_personne
  on acces_personnels(person_id, person_type);

alter table acces_personnels enable row level security;
drop policy if exists "admin access" on acces_personnels;
create policy "admin access" on acces_personnels
  for all using (has_access()) with check (has_access());

-- Résout un jeton, qu'il soit permanent (acces_personnels) ou lié à une
-- demande de dispo (dispo_demandes). Toutes les fonctions à jeton passent
-- désormais par ici, ce qui évite de dupliquer la règle huit fois.
create or replace function resolve_person_token(p_token text)
returns table(person_id text, person_type text)
language sql
security definer
set search_path = public
stable
as $$
  select a.person_id, a.person_type from acces_personnels a where a.token = p_token
  union all
  select d.person_id, d.person_type from dispo_demandes d where d.id = p_token
  limit 1;
$$;
grant execute on function resolve_person_token(text) to anon, authenticated;

-- Crée (ou retrouve) le jeton permanent d'une personne — appelé côté admin
-- pour construire le lien à envoyer.
create or replace function ensure_acces_personnel(p_person_id text, p_person_type text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_token text;
begin
  if not has_access() then
    raise exception 'Réservé aux comptes autorisés';
  end if;
  select token into v_token from acces_personnels
   where person_id = p_person_id and person_type = p_person_type;
  if v_token is not null then return v_token; end if;
  -- gen_random_uuid() est fourni par PostgreSQL lui-même depuis la v13.
  -- gen_random_bytes() aurait imposé l'extension pgcrypto, que Supabase
  -- installe dans un schéma séparé, hors du search_path de cette fonction.
  -- 32 caractères hexadécimaux, soit 128 bits d'aléa.
  v_token := 'perso' || replace(gen_random_uuid()::text, '-', '');
  insert into acces_personnels (token, person_id, person_type)
  values (v_token, p_person_id, p_person_type);
  return v_token;
end;
$$;
grant execute on function ensure_acces_personnel(text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- C1 — fermeture de la lecture publique du répertoire.
--
-- musiciens était lisible en entier par la clé anonyme, qui est publique par
-- construction : 107 fiches, dont 50 avec téléphone et e-mail, plus le champ
-- "notes" qui contient des commentaires internes sur des personnes.
--
-- Cette ouverture ne servait qu'à trois usages précis, remplacés ci-dessous
-- par des fonctions qui ne rendent que le strict nécessaire.
-- ----------------------------------------------------------------------------

-- 1. Sa propre fiche (dispo-titulaire.html, mes-infos.html, mes-remplacants.html).
create or replace function get_own_person_by_token(p_token text)
returns table(
  id text, prenom text, nom text, instrument text, pupitre text, poste text, pole text,
  statut_poste text, telephone text, email text,
  disponibilites jsonb, disponibilites_commentaires jsonb
)
language sql
security definer
set search_path = public
as $$
  with p as (select * from resolve_person_token(p_token))
  select m.id, m.prenom, m.nom, m.instrument, m.pupitre, null::text, null::text,
         m.statut_poste, m.telephone, m.email, m.disponibilites, m.disponibilites_commentaires
    from musiciens m join p on p.person_id = m.id and p.person_type = 'musicien'
  union all
  select t.id, t.prenom, t.nom, null::text, null::text, t.poste, t.pole,
         t.statut_poste, t.telephone, t.email, t.disponibilites, t.disponibilites_commentaires
    from techniciens t join p on p.person_id = t.id and p.person_type = 'technicien';
$$;
grant execute on function get_own_person_by_token(text) to anon, authenticated;

-- 2. L'annuaire réduit aux seuls noms, pour choisir ses remplaçant·es
--    (mes-remplacants.html). Volontairement sans téléphone, e-mail, notes ni
--    disponibilités : la page n'affichait que le nom et l'instrument, elle
--    demandait pourtant la totalité des colonnes.
create or replace function get_roster_for_picker(p_token text)
returns table(id text, person_type text, prenom text, nom text, role_label text)
language sql
security definer
set search_path = public
as $$
  select m.id, 'musicien'::text, m.prenom, m.nom, coalesce(nullif(m.instrument,''), 'Musicien·ne')
    from musiciens m
   where exists (select 1 from resolve_person_token(p_token))
  union all
  select t.id, 'technicien'::text, t.prenom, t.nom, coalesce(nullif(t.poste,''), 'Technicien·ne')
    from techniciens t
   where exists (select 1 from resolve_person_token(p_token));
$$;
grant execute on function get_roster_for_picker(text) to anon, authenticated;

-- 3. La tournée d'un lien de dispo (nom + dates + cachet standard).
create or replace function get_tournee_by_token(p_token text)
returns setof tournees
language sql
security definer
set search_path = public
as $$
  select t.* from tournees t
    join dispo_demandes d on d.tournee_id = t.id
   where d.id = p_token;
$$;
grant execute on function get_tournee_by_token(text) to anon, authenticated;

-- Fermeture effective : plus aucune lecture anonyme du répertoire.
drop policy if exists "public read" on musiciens;
drop policy if exists "public read" on techniciens;
drop policy if exists "admin read" on musiciens;
drop policy if exists "admin read" on techniciens;
create policy "admin read" on musiciens for select using (has_access());
create policy "admin read" on techniciens for select using (has_access());

-- tournees garde sa lecture publique : elle ne contient pas de donnée
-- personnelle en clair (les affectations n'y figurent que sous forme d'id,
-- inexploitables une fois le répertoire fermé) et plusieurs pages internes
-- s'appuient dessus.

-- Les fonctions à jeton existantes passent au résolveur commun, pour accepter
-- aussi bien un jeton permanent qu'un jeton de demande de dispo.
create or replace function get_own_infos_sociales(p_token text)
returns setof infos_sociales
language sql
security definer
set search_path = public
as $$
  select s.* from infos_sociales s
    join resolve_person_token(p_token) p on p.person_id = s.id;
$$;

create or replace function get_own_remplacant_prefs(p_token text)
returns setof remplacant_prefs
language sql
security definer
set search_path = public
as $$
  select r.* from remplacant_prefs r
    join resolve_person_token(p_token) p on p.person_id = r.id;
$$;

create or replace function upsert_own_remplacant_prefs(p_token text, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_person_id text; v_person_type text;
begin
  select person_id, person_type into v_person_id, v_person_type
    from resolve_person_token(p_token);
  if v_person_id is null then raise exception 'Lien invalide'; end if;
  insert into remplacant_prefs (id, person_type, items)
  values (v_person_id, v_person_type, p_items)
  on conflict (id) do update set person_type = excluded.person_type, items = excluded.items;
end;
$$;

create or replace function update_own_contact_by_token(p_token text, p_telephone text, p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_person_id text; v_person_type text;
begin
  select person_id, person_type into v_person_id, v_person_type
    from resolve_person_token(p_token);
  if v_person_id is null then raise exception 'Lien invalide'; end if;
  if v_person_type = 'musicien' then
    update musiciens set telephone = p_telephone, email = p_email where id = v_person_id;
  else
    update techniciens set telephone = p_telephone, email = p_email where id = v_person_id;
  end if;
end;
$$;

create or replace function update_own_prenom_usage_by_token(p_token text, p_prenom_usage text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_person_id text; v_person_type text; v_current_prenom text;
begin
  if p_prenom_usage is null or btrim(p_prenom_usage) = '' then return; end if;
  select person_id, person_type into v_person_id, v_person_type
    from resolve_person_token(p_token);
  if v_person_id is null then raise exception 'Lien invalide'; end if;
  if v_person_type = 'musicien' then
    select prenom into v_current_prenom from musiciens where id = v_person_id;
  else
    select prenom into v_current_prenom from techniciens where id = v_person_id;
  end if;
  if v_current_prenom is not distinct from p_prenom_usage then return; end if;
  insert into infos_sociales (id, person_type, prenom_civil)
  values (v_person_id, v_person_type, coalesce(v_current_prenom, ''))
  on conflict (id) do update set
    prenom_civil = case when coalesce(infos_sociales.prenom_civil, '') = ''
                        then excluded.prenom_civil else infos_sociales.prenom_civil end;
  if v_person_type = 'musicien' then
    update musiciens set prenom = p_prenom_usage where id = v_person_id;
  else
    update techniciens set prenom = p_prenom_usage where id = v_person_id;
  end if;
end;
$$;

-- upsert_own_infos_sociales : même changement, résolveur commun.
create or replace function upsert_own_infos_sociales(p_token text, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_person_id text; v_person_type text;
begin
  select person_id, person_type into v_person_id, v_person_type
    from resolve_person_token(p_token);
  if v_person_id is null then raise exception 'Lien invalide'; end if;

  insert into infos_sociales (
    id, person_type, genre, genre_detail, prenom_civil, date_naissance, lieu_naissance, nationalite, adresse,
    num_secu, iban, bic, titulaire_compte, num_conges_spectacles, num_audiens,
    contact_urgence_nom, contact_urgence_tel, permis_conduire,
    permis_conduire_type, permis_conduire_type_detail, taille_vetement, extra
  ) values (
    v_person_id, v_person_type, p_payload->>'genre', p_payload->>'genre_detail', p_payload->>'prenom_civil',
    nullif(p_payload->>'date_naissance','')::date, p_payload->>'lieu_naissance',
    p_payload->>'nationalite', p_payload->>'adresse',
    p_payload->>'num_secu', p_payload->>'iban', p_payload->>'bic', p_payload->>'titulaire_compte',
    p_payload->>'num_conges_spectacles', p_payload->>'num_audiens',
    p_payload->>'contact_urgence_nom', p_payload->>'contact_urgence_tel',
    p_payload->>'permis_conduire', p_payload->>'permis_conduire_type', p_payload->>'permis_conduire_type_detail',
    p_payload->>'taille_vetement',
    coalesce(p_payload->'extra', '{}'::jsonb)
  )
  on conflict (id) do update set
    person_type = excluded.person_type, genre = excluded.genre, genre_detail = excluded.genre_detail,
    prenom_civil = excluded.prenom_civil, date_naissance = excluded.date_naissance,
    lieu_naissance = excluded.lieu_naissance, nationalite = excluded.nationalite, adresse = excluded.adresse,
    num_secu = excluded.num_secu, iban = excluded.iban, bic = excluded.bic,
    titulaire_compte = excluded.titulaire_compte, num_conges_spectacles = excluded.num_conges_spectacles,
    num_audiens = excluded.num_audiens, contact_urgence_nom = excluded.contact_urgence_nom,
    contact_urgence_tel = excluded.contact_urgence_tel, permis_conduire = excluded.permis_conduire,
    permis_conduire_type = excluded.permis_conduire_type,
    permis_conduire_type_detail = excluded.permis_conduire_type_detail,
    taille_vetement = excluded.taille_vetement, extra = excluded.extra;
end;
$$;

-- ----------------------------------------------------------------------------
-- M6 — index manquants et conservation du journal.
-- Postgres n'indexe pas automatiquement les clés étrangères, et person_id est
-- joint par toutes les fonctions à jeton.
-- ----------------------------------------------------------------------------
create index if not exists idx_dispo_demandes_person on dispo_demandes(person_id, person_type);
create index if not exists idx_dispo_demandes_tournee on dispo_demandes(tournee_id);

-- Le journal conserve l'avant et l'après complets de chaque modification. Il
-- rend la corbeille possible, mais sans limite il finirait par occuper
-- l'essentiel de la base : deux ans de conservation, purge à la demande.
create or replace function purge_audit_log(p_jours integer default 730)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_supprimees integer;
begin
  if not is_admin() then
    raise exception 'Réservé aux comptes administrateurs';
  end if;
  delete from audit_log where changed_at < now() - make_interval(days => p_jours);
  get diagnostics v_supprimees = row_count;
  return v_supprimees;
end;
$$;
grant execute on function purge_audit_log(integer) to authenticated;

-- ----------------------------------------------------------------------------
-- M7 — plafonnement des signalements.
-- L'écriture est publique et doit le rester (n'importe qui doit pouvoir
-- signaler un problème sans compte), mais rien n'empêchait d'y déverser un
-- volume illimité.
-- ----------------------------------------------------------------------------
alter table bug_reports drop constraint if exists bug_reports_message_longueur;
alter table bug_reports add constraint bug_reports_message_longueur
  check (char_length(message) between 1 and 4000);

create or replace function bug_reports_limite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from bug_reports where created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Trop de signalements envoyés récemment — réessaie dans un moment.';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_bug_reports_limite on bug_reports;
create trigger trg_bug_reports_limite before insert on bug_reports
  for each row execute function bug_reports_limite();


-- ============================================================================
-- Curieux orchestre — Outils direction technique + effectif + réinitialisation
-- Août 2026.
--
-- Rejouable autant de fois que voulu : tout est en "if not exists" / "or
-- replace", et chaque "create policy" est précédé de son "drop policy if
-- exists" (sans quoi une base déjà provisionnée s'arrête à la première
-- politique existante).
--
-- Contenu :
--   A3  nomenclature (effectif attendu) par tournée, surchargeable par date
--   A4  réglages (drapeau phase de test) + purge des données d'essai
--   B1  fiches techniques versionnées + lien canonique public
--   B2  moyens fournis par la salle, date par date
--   B3  lots de matériel, carnets ATA, véhicules, chauffeurs
--   B4  accès logistique en lecture seule (stage manager, chauffeur)
-- ============================================================================


-- ----------------------------------------------------------------------------
-- A3 — effectif attendu.
-- La nomenclature vit sur la tournée : [{pupitre, libelle, nombre}, ...].
-- Une date peut la surcharger, via la clé "nomenclature" de son objet dans
-- tournees.dates (jsonb, aucune migration nécessaire pour ça).
-- ----------------------------------------------------------------------------
alter table tournees add column if not exists nomenclature jsonb not null default '[]'::jsonb;


-- ----------------------------------------------------------------------------
-- A4 — réglages généraux (singleton).
-- phase_test verrouille l'espace de réinitialisation : une fois l'outil
-- déployé auprès des équipes, on bascule ce drapeau à false et le bouton
-- « vider les tables » disparaît. Un bouton de purge qui survit à côté de
-- vrais numéros de sécurité sociale finit toujours par servir.
-- ----------------------------------------------------------------------------
create table if not exists reglages (
  id int primary key default 1 check (id = 1),
  phase_test boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into reglages (id) values (1) on conflict (id) do nothing;
drop trigger if exists trg_reglages_updated_at on reglages;
create trigger trg_reglages_updated_at before update on reglages
  for each row execute function set_updated_at();

alter table reglages enable row level security;
drop policy if exists "reglages lecture" on reglages;
create policy "reglages lecture" on reglages for select to anon, authenticated
  using (has_access());
drop policy if exists "reglages ecriture" on reglages;
create policy "reglages ecriture" on reglages for all to authenticated
  using (is_admin()) with check (is_admin());

-- Purge des données d'essai. Réservée aux comptes 'admin' ET à la phase de
-- test : hors phase de test, la fonction refuse, quoi qu'affiche l'interface.
-- p_tables est la liste des tables à vider, en clair ; tout nom hors de la
-- liste blanche est ignoré (jamais interpolé tel quel dans le SQL).
create or replace function purger_donnees_essai(p_tables text[])
returns table(table_videe text, lignes_supprimees bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  autorisees constant text[] := array[
    'dispo_demandes','infos_sociales','feuilles_route','carnet_contacts',
    'newsletter_snapshot','cachet_overrides','remplacant_prefs','bug_reports',
    'audit_log','moyens_salle','lots_materiel','carnets_ata','vehicules',
    'chauffeurs','fiches_techniques_versions','fiches_techniques',
    'acces_logistique','acces_personnels','tournees','musiciens','techniciens'
  ];
  t text;
  n bigint;
begin
  if not is_admin() then
    raise exception 'Réservé aux comptes administrateur.';
  end if;
  if not (select phase_test from reglages where id = 1) then
    raise exception 'La phase de test est terminée : la purge est désactivée.';
  end if;

  foreach t in array coalesce(p_tables, array[]::text[]) loop
    if t = any(autorisees) then
      execute format('delete from %I', t);
      get diagnostics n = row_count;
      table_videe := t; lignes_supprimees := n;
      return next;
    end if;
  end loop;
end;
$$;
grant execute on function purger_donnees_essai(text[]) to authenticated;

-- Compte les lignes des tables purgeables, pour afficher « vous êtes sur le
-- point de supprimer N lignes » avant confirmation.
create or replace function compter_lignes_purgeables()
returns table(nom_table text, lignes bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  autorisees constant text[] := array[
    'dispo_demandes','infos_sociales','feuilles_route','carnet_contacts',
    'newsletter_snapshot','cachet_overrides','remplacant_prefs','bug_reports',
    'audit_log','moyens_salle','lots_materiel','carnets_ata','vehicules',
    'chauffeurs','fiches_techniques_versions','fiches_techniques',
    'acces_logistique','acces_personnels','tournees','musiciens','techniciens'
  ];
  t text;
  n bigint;
begin
  if not is_admin() then
    raise exception 'Réservé aux comptes administrateur.';
  end if;
  foreach t in array autorisees loop
    if to_regclass('public.' || quote_ident(t)) is not null then
      execute format('select count(*) from %I', t) into n;
      nom_table := t; lignes := n;
      return next;
    end if;
  end loop;
end;
$$;
grant execute on function compter_lignes_purgeables() to authenticated;


-- ----------------------------------------------------------------------------
-- B1 — fiches techniques versionnées.
-- Google Drive reste l'atelier (drive_url pointe vers le dossier de travail).
-- L'application est la vitrine : publier une version fige le PDF, l'horodate
-- et l'expose derrière un jeton permanent qui sert toujours la version
-- courante. La salle reçoit ce lien une fois pour toutes.
-- ----------------------------------------------------------------------------
create table if not exists fiches_techniques (
  id text primary key,
  nom text default '',
  tournee_id text,
  drive_url text default '',
  token text unique not null default replace(gen_random_uuid()::text, '-', ''),
  version_courante int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_fiches_techniques_updated_at on fiches_techniques;
create trigger trg_fiches_techniques_updated_at before update on fiches_techniques
  for each row execute function set_updated_at();

create table if not exists fiches_techniques_versions (
  id text primary key,
  fiche_id text not null references fiches_techniques(id) on delete cascade,
  version int not null,
  fichier_chemin text default '',
  fichier_nom text default '',
  changelog text default '',
  created_at timestamptz not null default now()
);
create index if not exists idx_ft_versions_fiche on fiches_techniques_versions(fiche_id, version desc);

alter table fiches_techniques enable row level security;
alter table fiches_techniques_versions enable row level security;
drop policy if exists "fiches techniques acces" on fiches_techniques;
create policy "fiches techniques acces" on fiches_techniques for all to authenticated
  using (has_access()) with check (has_access());
drop policy if exists "fiches techniques versions acces" on fiches_techniques_versions;
create policy "fiches techniques versions acces" on fiches_techniques_versions for all to authenticated
  using (has_access()) with check (has_access());

-- Résolution publique du lien canonique : renvoie la version courante, et
-- rien d'autre — ni la liste des versions, ni le lien Drive de travail.
create or replace function get_fiche_technique_by_token(p_token text)
returns table(nom text, version int, fichier_chemin text, fichier_nom text, publiee_le timestamptz)
language sql
security definer
set search_path = public
as $$
  select f.nom, v.version, v.fichier_chemin, v.fichier_nom, v.created_at
  from fiches_techniques f
  join fiches_techniques_versions v
    on v.fiche_id = f.id and v.version = f.version_courante
  where f.token = p_token
  limit 1;
$$;
grant execute on function get_fiche_technique_by_token(text) to anon, authenticated;

-- Bucket de stockage des PDF publiés. Public en lecture : le chemin contient
-- un identifiant aléatoire, et une fiche technique a de toute façon vocation à
-- être envoyée aux salles. L'écriture reste réservée aux comptes connectés.
insert into storage.buckets (id, name, public)
values ('fiches-techniques', 'fiches-techniques', true)
on conflict (id) do update set public = true;

drop policy if exists "fiches techniques depot" on storage.objects;
create policy "fiches techniques depot" on storage.objects for insert to authenticated
  with check (bucket_id = 'fiches-techniques' and has_access());
drop policy if exists "fiches techniques remplacement" on storage.objects;
create policy "fiches techniques remplacement" on storage.objects for update to authenticated
  using (bucket_id = 'fiches-techniques' and has_access());
drop policy if exists "fiches techniques retrait" on storage.objects;
create policy "fiches techniques retrait" on storage.objects for delete to authenticated
  using (bucket_id = 'fiches-techniques' and has_access());


-- ----------------------------------------------------------------------------
-- B2 — ce que la salle fournit, date par date.
-- "id" = `${tournee_id}::${date_id}`, pour réutiliser upsertOne/removeOne
-- tels quels malgré la clé composite.
-- ----------------------------------------------------------------------------
create table if not exists moyens_salle (
  id text primary key,
  tournee_id text not null,
  date_id text not null,
  statut text not null default 'non_demande'
    check (statut in ('non_demande','demande','recu','valide')),
  plan_statut text not null default 'non_demande'
    check (plan_statut in ('non_demande','demande','recu')),
  plan_url text default '',
  quai text not null default 'inconnu' check (quai in ('oui','non','inconnu')),
  acces_notes text default '',
  roadies int,
  roadies_horaire text default '',
  caristes int,
  chariots int,
  chariots_fourches text not null default 'inconnu'
    check (chariots_fourches in ('longues','courtes','les deux','inconnu')),
  hauteur_grill text default '',
  ouverture_scene text default '',
  puissance text default '',
  contact_nom text default '',
  contact_tel text default '',
  contact_email text default '',
  notes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_moyens_salle_tournee on moyens_salle(tournee_id);
drop trigger if exists trg_moyens_salle_updated_at on moyens_salle;
create trigger trg_moyens_salle_updated_at before update on moyens_salle
  for each row execute function set_updated_at();

alter table moyens_salle enable row level security;
drop policy if exists "moyens salle acces" on moyens_salle;
create policy "moyens salle acces" on moyens_salle for all to authenticated
  using (has_access()) with check (has_access());


-- ----------------------------------------------------------------------------
-- B3 — lots de matériel, carnets ATA, véhicules, chauffeurs.
-- Volontairement un registre, pas un plan de transport : ce qui doit être là,
-- pas comment ça y arrive. L'exécution reste au stage manager.
-- ----------------------------------------------------------------------------
create table if not exists lots_materiel (
  id text primary key,
  nom text default '',
  categorie text default 'autre'
    check (categorie in ('son','lumiere','structure','backline','partitions','costumes','autre')),
  provenance text default '',
  tournee_id text,
  dates_ids jsonb not null default '[]'::jsonb,
  nb_colis int,
  poids_kg numeric,
  valeur numeric,
  numeros_serie text default '',
  retour_le date,
  notes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_lots_materiel_updated_at on lots_materiel;
create trigger trg_lots_materiel_updated_at before update on lots_materiel
  for each row execute function set_updated_at();

create table if not exists carnets_ata (
  id text primary key,
  numero text default '',
  pays text default '',
  tournee_id text,
  emis_le date,
  expire_le date,
  statut text not null default 'a_demander'
    check (statut in ('a_demander','demande','obtenu','en_cours','a_apurer','apure')),
  lots_ids jsonb not null default '[]'::jsonb,
  dates_ids jsonb not null default '[]'::jsonb,
  notes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_carnets_ata_updated_at on carnets_ata;
create trigger trg_carnets_ata_updated_at before update on carnets_ata
  for each row execute function set_updated_at();

-- Tracteur et semi sont deux lignes distinctes : c'est le semi qui porte le
-- hayon, et un tracteur peut tirer une autre semi.
create table if not exists vehicules (
  id text primary key,
  nom text default '',
  type text not null default 'semi'
    check (type in ('tracteur','semi','porteur','camion','voiture')),
  immatriculation text default '',
  hayon boolean not null default false,
  capacite text default '',
  prestataire text default '',
  notes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_vehicules_updated_at on vehicules;
create trigger trg_vehicules_updated_at before update on vehicules
  for each row execute function set_updated_at();

create table if not exists chauffeurs (
  id text primary key,
  prenom text default '',
  nom text default '',
  telephone text default '',
  email text default '',
  permis text default '',
  prestataire text default '',
  notes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_chauffeurs_updated_at on chauffeurs;
create trigger trg_chauffeurs_updated_at before update on chauffeurs
  for each row execute function set_updated_at();

alter table lots_materiel enable row level security;
alter table carnets_ata  enable row level security;
alter table vehicules    enable row level security;
alter table chauffeurs   enable row level security;
drop policy if exists "lots materiel acces" on lots_materiel;
create policy "lots materiel acces" on lots_materiel for all to authenticated
  using (has_access()) with check (has_access());
drop policy if exists "carnets ata acces" on carnets_ata;
create policy "carnets ata acces" on carnets_ata for all to authenticated
  using (has_access()) with check (has_access());
drop policy if exists "vehicules acces" on vehicules;
create policy "vehicules acces" on vehicules for all to authenticated
  using (has_access()) with check (has_access());
drop policy if exists "chauffeurs acces" on chauffeurs;
create policy "chauffeurs acces" on chauffeurs for all to authenticated
  using (has_access()) with check (has_access());


-- ----------------------------------------------------------------------------
-- B4 — accès logistique en lecture seule.
-- Un jeton par destinataire (stage manager, chauffeur…), révocable. La
-- fonction ci-dessous est le SEUL chemin de lecture sans compte : elle ne
-- renvoie que la logistique, jamais le répertoire ni les infos d'embauche.
-- ----------------------------------------------------------------------------
create table if not exists acces_logistique (
  id text primary key default replace(gen_random_uuid()::text, '-', ''),
  libelle text default '',
  tournee_id text,
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_acces_logistique_updated_at on acces_logistique;
create trigger trg_acces_logistique_updated_at before update on acces_logistique
  for each row execute function set_updated_at();

alter table acces_logistique enable row level security;
drop policy if exists "acces logistique acces" on acces_logistique;
create policy "acces logistique acces" on acces_logistique for all to authenticated
  using (has_access()) with check (has_access());

create or replace function get_recap_logistique(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  acces  acces_logistique%rowtype;
  resultat jsonb;
begin
  select * into acces from acces_logistique where id = p_token and actif limit 1;
  if not found then
    return null;
  end if;

  select jsonb_build_object(
    'libelle',  acces.libelle,
    'tournee',  (select jsonb_build_object('id', t.id, 'nom', t.nom, 'dates', t.dates)
                 from tournees t where t.id = acces.tournee_id),
    'moyens',   coalesce((select jsonb_agg(to_jsonb(m))
                 from moyens_salle m where m.tournee_id = acces.tournee_id), '[]'::jsonb),
    'lots',     coalesce((select jsonb_agg(to_jsonb(l))
                 from lots_materiel l where l.tournee_id = acces.tournee_id), '[]'::jsonb),
    'carnets',  coalesce((select jsonb_agg(to_jsonb(c))
                 from carnets_ata c where c.tournee_id = acces.tournee_id), '[]'::jsonb),
    'vehicules',coalesce((select jsonb_agg(to_jsonb(v)) from vehicules v), '[]'::jsonb),
    'chauffeurs',coalesce((select jsonb_agg(to_jsonb(ch)) from chauffeurs ch), '[]'::jsonb)
  ) into resultat;

  return resultat;
end;
$$;
grant execute on function get_recap_logistique(text) to anon, authenticated;
