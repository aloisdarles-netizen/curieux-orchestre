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
-- La colonne "version" est supprimée plus bas par la refonte des fiches
-- techniques. Sur une base déjà migrée, cet index la référencerait dans le
-- vide et ferait échouer tout le reste du fichier : on ne le crée que si la
-- colonne est encore là.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public'
               and table_name = 'fiches_techniques_versions'
               and column_name = 'version') then
    create index if not exists idx_ft_versions_fiche on fiches_techniques_versions(fiche_id, version desc);
  end if;
end $$;

alter table fiches_techniques enable row level security;
alter table fiches_techniques_versions enable row level security;
drop policy if exists "fiches techniques acces" on fiches_techniques;
create policy "fiches techniques acces" on fiches_techniques for all to authenticated
  using (has_access()) with check (has_access());
drop policy if exists "fiches techniques versions acces" on fiches_techniques_versions;
create policy "fiches techniques versions acces" on fiches_techniques_versions for all to authenticated
  using (has_access()) with check (has_access());

-- Résolution publique du lien canonique d'une fiche technique.
--
-- La définition qui se trouvait ici lisait fiches_techniques_versions.version
-- et .fichier_chemin, colonnes supprimées depuis par la refonte des fiches
-- techniques. Elle était remplacée quelques centaines de lignes plus bas, mais
-- sur une base déjà migrée elle ne compilait plus et faisait échouer tout le
-- reste du fichier. Elle est donc retirée : la seule définition en vigueur est
-- celle de la refonte, plus bas (« Fiches techniques : lien Drive vivant »).

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
--
-- Deux registres en miroir dans tout l'axe B : ce qu'on AMÈNE (lots_materiel,
-- ci-dessous) et ce qu'on DEMANDE EN LOCAL (ici). Pour tout ce qui se négocie
-- avec la salle — roadies, caristes, chariots — la demande et la validation
-- sont deux valeurs distinctes : ce qu'on a demandé n'est pas ce qu'on a
-- obtenu. Ce qui est un fait constaté plutôt qu'une négociation (hauteur de
-- grill, puissance disponible) reste un champ simple.
--
-- "Quai oui/non" est retiré : la question qui compte n'est pas binaire, c'est
-- combien de semis on peut mettre et à quel niveau on décharge. Avec assez de
-- roadies et de chariots aux bonnes fourches, l'accès importe peu en lui-même.
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
  semis_places int,
  niveau_dechargement text not null default 'inconnu'
    check (niveau_dechargement in ('scene','sol','les_deux','inconnu')),
  acces_notes text default '',
  roadies_demande int,
  roadies_valide int,
  roadies_horaire text default '',
  caristes_demande int,
  caristes_valide int,
  -- Un élément par chariot demandé : {fourche:'longues'|'courtes'|'inconnu', valide:bool}.
  -- La longueur du tableau EST le nombre demandé ; compter valide=true donne
  -- le nombre confirmé. Chaque fenwick a ses propres fourches, d'où le tableau
  -- plutôt qu'un champ unique pour toute la date.
  chariots jsonb not null default '[]'::jsonb,
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
-- B3 — lots de matériel, véhicules, chauffeurs, carnets ATA.
-- Volontairement un registre, pas un plan de transport : ce qui doit être là,
-- pas comment ça y arrive. L'exécution reste au stage manager.
-- ----------------------------------------------------------------------------

-- Un lot est un kit — « Kit son A », « Backline cuivres » — qui contient ses
-- propres éléments (jsonb : [{nom, quantite, numeroSerie, notes}, ...]),
-- ajoutés librement plutôt que figés à la création du lot.
create table if not exists lots_materiel (
  id text primary key,
  nom text default '',
  categorie text default 'autre'
    check (categorie in ('son','lumiere','structure','backline','partitions','costumes','autre')),
  provenance text default '',
  tournee_id text,
  dates_ids jsonb not null default '[]'::jsonb,
  elements jsonb not null default '[]'::jsonb,
  nb_colis int,
  poids_kg numeric,
  valeur numeric,
  retour_le date,
  notes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_lots_materiel_updated_at on lots_materiel;
create trigger trg_lots_materiel_updated_at before update on lots_materiel
  for each row execute function set_updated_at();

-- Tracteur et semi sont deux lignes distinctes : c'est la semi qui porte le
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

-- Un carnet ATA est attribué à une semi, pour toute la durée de la tournée —
-- pas date par date : l'avoir pour une semi, c'est l'avoir pour tout ce
-- qu'elle transporte sur la tournée. D'où vehicule_id plutôt que dates_ids.
create table if not exists carnets_ata (
  id text primary key,
  numero text default '',
  pays text default '',
  tournee_id text,
  vehicule_id text references vehicules(id) on delete set null,
  emis_le date,
  expire_le date,
  statut text not null default 'a_demander'
    check (statut in ('a_demander','demande','obtenu','en_cours','a_apurer','apure')),
  lots_ids jsonb not null default '[]'::jsonb,
  notes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_carnets_ata_vehicule on carnets_ata(vehicule_id);
drop trigger if exists trg_carnets_ata_updated_at on carnets_ata;
create trigger trg_carnets_ata_updated_at before update on carnets_ata
  for each row execute function set_updated_at();

alter table lots_materiel enable row level security;
alter table vehicules    enable row level security;
alter table chauffeurs   enable row level security;
alter table carnets_ata  enable row level security;
drop policy if exists "lots materiel acces" on lots_materiel;
create policy "lots materiel acces" on lots_materiel for all to authenticated
  using (has_access()) with check (has_access());
drop policy if exists "vehicules acces" on vehicules;
create policy "vehicules acces" on vehicules for all to authenticated
  using (has_access()) with check (has_access());
drop policy if exists "chauffeurs acces" on chauffeurs;
create policy "chauffeurs acces" on chauffeurs for all to authenticated
  using (has_access()) with check (has_access());
drop policy if exists "carnets ata acces" on carnets_ata;
create policy "carnets ata acces" on carnets_ata for all to authenticated
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


-- ============================================================================
-- Curieux orchestre — Direction technique v2
-- Août 2026.
--
-- Rejouable. Les colonnes remplacées transportent leur ancien contenu vers
-- leur nouvelle forme avant d'être retirées (rejouer ne perd donc rien),
-- mais une fois une colonne "drop column"-ée, un second passage n'a plus
-- rien à transporter — c'est attendu, pas une erreur.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- Accès réservé : Direction technique n'est plus ouvert à tout compte ayant
-- accès à l'appli, seulement aux comptes explicitement désignés (+ les
-- comptes 'admin', qui ont de toute façon accès à tout).
-- ----------------------------------------------------------------------------
alter table infos_sociales_admins add column if not exists direction_technique boolean not null default false;

create or replace function has_direction_technique_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from infos_sociales_admins
    where email = auth.jwt()->>'email'
      and (role = 'admin' or direction_technique = true)
  );
$$;
grant execute on function has_direction_technique_access() to anon, authenticated;

drop policy if exists "moyens salle acces" on moyens_salle;
create policy "moyens salle acces" on moyens_salle for all to authenticated
  using (has_direction_technique_access()) with check (has_direction_technique_access());
drop policy if exists "lots materiel acces" on lots_materiel;
create policy "lots materiel acces" on lots_materiel for all to authenticated
  using (has_direction_technique_access()) with check (has_direction_technique_access());
drop policy if exists "vehicules acces" on vehicules;
create policy "vehicules acces" on vehicules for all to authenticated
  using (has_direction_technique_access()) with check (has_direction_technique_access());
drop policy if exists "chauffeurs acces" on chauffeurs;
create policy "chauffeurs acces" on chauffeurs for all to authenticated
  using (has_direction_technique_access()) with check (has_direction_technique_access());
drop policy if exists "carnets ata acces" on carnets_ata;
create policy "carnets ata acces" on carnets_ata for all to authenticated
  using (has_direction_technique_access()) with check (has_direction_technique_access());
drop policy if exists "fiches techniques acces" on fiches_techniques;
create policy "fiches techniques acces" on fiches_techniques for all to authenticated
  using (has_direction_technique_access()) with check (has_direction_technique_access());
drop policy if exists "fiches techniques versions acces" on fiches_techniques_versions;
create policy "fiches techniques versions acces" on fiches_techniques_versions for all to authenticated
  using (has_direction_technique_access()) with check (has_direction_technique_access());
drop policy if exists "acces logistique acces" on acces_logistique;
create policy "acces logistique acces" on acces_logistique for all to authenticated
  using (has_direction_technique_access()) with check (has_direction_technique_access());

drop policy if exists "fiches techniques depot" on storage.objects;
create policy "fiches techniques depot" on storage.objects for insert to authenticated
  with check (bucket_id = 'fiches-techniques' and has_direction_technique_access());
drop policy if exists "fiches techniques remplacement" on storage.objects;
create policy "fiches techniques remplacement" on storage.objects for update to authenticated
  using (bucket_id = 'fiches-techniques' and has_direction_technique_access());
drop policy if exists "fiches techniques retrait" on storage.objects;
create policy "fiches techniques retrait" on storage.objects for delete to authenticated
  using (bucket_id = 'fiches-techniques' and has_direction_technique_access());


-- ----------------------------------------------------------------------------
-- Registre des prestataires — partagé entre matériel (provenance) et
-- véhicules (loueur/transporteur), pour ne pas ressaisir le même nom en texte
-- libre à chaque fois. Un menu déroulant y ajoute une entrée à la volée.
-- ----------------------------------------------------------------------------
create table if not exists prestataires (
  id text primary key,
  nom text not null default '',
  notes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_prestataires_updated_at on prestataires;
create trigger trg_prestataires_updated_at before update on prestataires
  for each row execute function set_updated_at();
alter table prestataires enable row level security;
drop policy if exists "prestataires acces" on prestataires;
create policy "prestataires acces" on prestataires for all to authenticated
  using (has_direction_technique_access()) with check (has_direction_technique_access());


-- ----------------------------------------------------------------------------
-- Matériel — lots imbriqués (un lot peut contenir d'autres lots), catégories
-- élargies, description libre plutôt que colis/poids/valeur, trois dates
-- possibles (préparation, récupération, retour).
-- ----------------------------------------------------------------------------
alter table lots_materiel drop constraint if exists lots_materiel_categorie_check;
alter table lots_materiel add constraint lots_materiel_categorie_check
  check (categorie in ('son','lumiere','video','structure','backline','partitions','costumes','prod','autre'));
alter table lots_materiel add column if not exists parent_id text references lots_materiel(id) on delete set null;
alter table lots_materiel add column if not exists date_prepa date;
alter table lots_materiel add column if not exists date_pickup date;
alter table lots_materiel add column if not exists description text default '';
alter table lots_materiel add column if not exists provenance_id text references prestataires(id) on delete set null;

-- Gardé par une vérification d'existence de colonne : "provenance" disparaît
-- à la fin de ce bloc, donc un second passage n'a plus rien à transporter.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='lots_materiel' and column_name='provenance') then
    insert into prestataires (id, nom)
      select 'prest' || substr(md5(random()::text || s.provenance), 1, 20), s.provenance
      from (select distinct provenance from lots_materiel where provenance is not null and provenance <> '') s
      where not exists (select 1 from prestataires p where p.nom = s.provenance);
    update lots_materiel l set provenance_id = p.id
      from prestataires p
      where p.nom = l.provenance and l.provenance_id is null and l.provenance is not null and l.provenance <> '';
  end if;
end $$;

alter table lots_materiel drop column if exists nb_colis;
alter table lots_materiel drop column if exists poids_kg;
alter table lots_materiel drop column if exists valeur;
alter table lots_materiel drop column if exists provenance;
create index if not exists idx_lots_materiel_parent on lots_materiel(parent_id);
create index if not exists idx_lots_materiel_tournee on lots_materiel(tournee_id);


-- ----------------------------------------------------------------------------
-- Véhicules — dimensions, prestataire en registre plutôt qu'en texte libre.
-- ----------------------------------------------------------------------------
alter table vehicules add column if not exists hauteur_m numeric;
alter table vehicules add column if not exists largeur_m numeric;
alter table vehicules add column if not exists profondeur_m numeric;
alter table vehicules add column if not exists prestataire_id text references prestataires(id) on delete set null;

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='vehicules' and column_name='prestataire') then
    insert into prestataires (id, nom)
      select 'prest' || substr(md5(random()::text || s.prestataire), 1, 20), s.prestataire
      from (select distinct prestataire from vehicules where prestataire is not null and prestataire <> '') s
      where not exists (select 1 from prestataires p where p.nom = s.prestataire);
    update vehicules v set prestataire_id = p.id
      from prestataires p
      where p.nom = v.prestataire and v.prestataire_id is null and v.prestataire is not null and v.prestataire <> '';
  end if;
end $$;

alter table vehicules drop column if exists prestataire;


-- ----------------------------------------------------------------------------
-- Chauffeurs — le permis ne sert pas ; carnets ATA — pas de pays, valables
-- dans toute l'Europe.
-- ----------------------------------------------------------------------------
alter table chauffeurs drop column if exists permis;
alter table carnets_ata drop column if exists pays;


-- ----------------------------------------------------------------------------
-- Affectation chauffeur ↔ semi, souple : par date, jamais figée sur le
-- véhicule — un chauffeur peut changer de semi d'une date à l'autre.
-- ----------------------------------------------------------------------------
create table if not exists affectations_transport (
  id text primary key,
  tournee_id text not null,
  date_id text not null,
  vehicule_id text references vehicules(id) on delete cascade,
  chauffeur_id text references chauffeurs(id) on delete set null,
  notes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_affectations_transport_date on affectations_transport(tournee_id, date_id);
drop trigger if exists trg_affectations_transport_updated_at on affectations_transport;
create trigger trg_affectations_transport_updated_at before update on affectations_transport
  for each row execute function set_updated_at();
alter table affectations_transport enable row level security;
drop policy if exists "affectations transport acces" on affectations_transport;
create policy "affectations transport acces" on affectations_transport for all to authenticated
  using (has_direction_technique_access()) with check (has_direction_technique_access());


-- ----------------------------------------------------------------------------
-- Fiches techniques — le lien pointe directement sur le fichier Drive
-- partagé : toujours à jour, sans synchronisation à construire. La "version"
-- devient une étiquette qu'on met à jour soi-même en un clic ; l'historique
-- un simple journal (plus de fichier hébergé, plus de bucket nécessaire pour
-- ça).
-- ----------------------------------------------------------------------------
alter table fiches_techniques add column if not exists version_actuelle text default '';
alter table fiches_techniques add column if not exists version_le timestamptz;
alter table fiches_techniques drop column if exists version_courante;

alter table fiches_techniques_versions drop column if exists fichier_chemin;
alter table fiches_techniques_versions drop column if exists fichier_nom;
alter table fiches_techniques_versions drop column if exists version;
alter table fiches_techniques_versions add column if not exists label text default '';

drop function if exists get_fiche_technique_by_token(text);
create function get_fiche_technique_by_token(p_token text)
returns table(nom text, drive_url text, version_actuelle text, version_le timestamptz)
language sql
security definer
set search_path = public
as $$
  select f.nom, f.drive_url, f.version_actuelle, f.version_le
  from fiches_techniques f
  where f.token = p_token
  limit 1;
$$;
grant execute on function get_fiche_technique_by_token(text) to anon, authenticated;


-- ----------------------------------------------------------------------------
-- Fiche de date — précisions demandées : plan de scène (envoi ≠ validation à
-- l'échelle), plan de charge (bureau de contrôle), bureau de contrôle sur
-- place, déchargement à plusieurs semis avec emplacement par semi, roadies et
-- chariots en vacations (créneaux, demandé/proposé/validé), faits techniques
-- enrichis, contacts salle multiples + technicien·nes exposé·es comme
-- contacts, plan de salle positionnable.
-- ----------------------------------------------------------------------------
alter table moyens_salle add column if not exists plan_valide boolean not null default false;
alter table moyens_salle add column if not exists plan_charge_statut text not null default 'non_envoye'
  check (plan_charge_statut in ('non_envoye','envoye','valide_bureau_controle'));
alter table moyens_salle add column if not exists bureau_controle_sur_place boolean not null default false;
alter table moyens_salle add column if not exists bureau_controle_horaire text default '';
alter table moyens_salle add column if not exists bureau_controle_contact text default '';

alter table moyens_salle add column if not exists nombre_semis_simultanees int;
alter table moyens_salle add column if not exists emplacements_dechargement jsonb not null default '[]'::jsonb;
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='moyens_salle' and column_name='semis_places') then
    update moyens_salle set nombre_semis_simultanees = semis_places
      where semis_places is not null and nombre_semis_simultanees is null;
  end if;
end $$;
alter table moyens_salle drop column if exists semis_places;

alter table moyens_salle add column if not exists roadies_vacations jsonb not null default '[]'::jsonb;
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='moyens_salle' and column_name='roadies_demande') then
    update moyens_salle
      set roadies_vacations = jsonb_build_array(jsonb_build_object(
            'horaireDebut', coalesce(roadies_horaire,''), 'horaireFin', '',
            'nombreDemande', roadies_demande, 'nombreValide', roadies_valide, 'notes', ''))
      where (roadies_demande is not null or roadies_valide is not null or coalesce(roadies_horaire,'') <> '')
        and roadies_vacations = '[]'::jsonb;
  end if;
end $$;
alter table moyens_salle drop column if exists roadies_demande;
alter table moyens_salle drop column if exists roadies_valide;
alter table moyens_salle drop column if exists roadies_horaire;

alter table moyens_salle add column if not exists chariots_vacations jsonb not null default '[]'::jsonb;
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='moyens_salle' and column_name='chariots') then
    update moyens_salle
      set chariots_vacations = jsonb_build_array(jsonb_build_object(
            'horaireDebut', '', 'horaireFin', '',
            'nombreChariotsDemande', jsonb_array_length(chariots),
            'nombreChariotsValide', (select count(*) from jsonb_array_elements(chariots) e where (e->>'valide')::boolean),
            'fourches', chariots,
            'nombreCaristesDemande', caristes_demande, 'nombreCaristesValide', caristes_valide,
            'notes', ''))
      where jsonb_array_length(chariots) > 0 and chariots_vacations = '[]'::jsonb;
  end if;
end $$;
alter table moyens_salle drop column if exists chariots;
alter table moyens_salle drop column if exists caristes_demande;
alter table moyens_salle drop column if exists caristes_valide;

alter table moyens_salle add column if not exists profondeur_scene text default '';
alter table moyens_salle add column if not exists type_courant text default '';
alter table moyens_salle add column if not exists nombre_circuits text default '';
alter table moyens_salle add column if not exists charge_max_accroche text default '';
alter table moyens_salle add column if not exists type_sol text default '';

alter table moyens_salle add column if not exists contacts_salle jsonb not null default '[]'::jsonb;
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='moyens_salle' and column_name='contact_nom') then
    update moyens_salle
      set contacts_salle = jsonb_build_array(jsonb_build_object(
            'nom', coalesce(contact_nom,''), 'role', '', 'tel', coalesce(contact_tel,''), 'email', coalesce(contact_email,'')))
      where (coalesce(contact_nom,'') <> '' or coalesce(contact_tel,'') <> '' or coalesce(contact_email,'') <> '')
        and contacts_salle = '[]'::jsonb;
  end if;
end $$;
alter table moyens_salle drop column if exists contact_nom;
alter table moyens_salle drop column if exists contact_tel;
alter table moyens_salle drop column if exists contact_email;
alter table moyens_salle add column if not exists contacts_techniciens_ids jsonb not null default '[]'::jsonb;

alter table moyens_salle add column if not exists plan_image_path text default '';
alter table moyens_salle add column if not exists semis_positions jsonb not null default '[]'::jsonb;


-- ----------------------------------------------------------------------------
-- Partage à trois audiences : stage manager (tout + plan positionnable),
-- technicien (récap doc de salle + particularités), salle (notre demande +
-- FT à jour, avec réponse possible aux vacations). Un accès salle est scopé
-- à une ou plusieurs dates précises, pas à toute la tournée.
-- ----------------------------------------------------------------------------
alter table acces_logistique add column if not exists type text not null default 'stage_manager'
  check (type in ('stage_manager','technicien','salle'));
alter table acces_logistique add column if not exists dates_ids jsonb not null default '[]'::jsonb;

-- Une salle répond à UN créneau (roadies ou chariots) d'UNE de ses dates,
-- jamais en dehors de son propre périmètre.
create or replace function repondre_vacation_salle(
  p_token text, p_date_id text, p_type_vacation text, p_index int, p_reponse jsonb
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  acces acces_logistique%rowtype;
  ms moyens_salle%rowtype;
  liste jsonb;
begin
  select * into acces from acces_logistique where id = p_token and actif and type = 'salle' limit 1;
  if not found then return false; end if;
  if not (acces.dates_ids ? p_date_id) then return false; end if;
  if p_type_vacation not in ('roadies','chariots') then return false; end if;

  select * into ms from moyens_salle where tournee_id = acces.tournee_id and date_id = p_date_id limit 1;
  if not found then return false; end if;

  liste := case when p_type_vacation = 'roadies' then ms.roadies_vacations else ms.chariots_vacations end;
  if p_index < 0 or p_index >= jsonb_array_length(liste) then return false; end if;
  liste := jsonb_set(liste, array[p_index::text], (liste->p_index) || p_reponse);

  if p_type_vacation = 'roadies' then
    update moyens_salle set roadies_vacations = liste where id = ms.id;
  else
    update moyens_salle set chariots_vacations = liste where id = ms.id;
  end if;
  return true;
end;
$$;
grant execute on function repondre_vacation_salle(text, text, text, int, jsonb) to anon, authenticated;

-- Le stage manager positionne ses semis sur le plan d'une date de sa tournée.
create or replace function enregistrer_positions_semis(
  p_token text, p_date_id text, p_positions jsonb
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  acces acces_logistique%rowtype;
  n int;
begin
  select * into acces from acces_logistique where id = p_token and actif and type = 'stage_manager' limit 1;
  if not found then return false; end if;
  update moyens_salle set semis_positions = p_positions
    where tournee_id = acces.tournee_id and date_id = p_date_id;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;
grant execute on function enregistrer_positions_semis(text, text, jsonb) to anon, authenticated;

create or replace function get_recap_logistique(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  acces acces_logistique%rowtype;
  resultat jsonb;
begin
  select * into acces from acces_logistique where id = p_token and actif limit 1;
  if not found then
    return null;
  end if;

  select jsonb_build_object(
    'libelle', acces.libelle,
    'type', acces.type,
    'datesIds', acces.dates_ids,
    'tournee', (select jsonb_build_object('id', t.id, 'nom', t.nom, 'dates', t.dates)
                from tournees t where t.id = acces.tournee_id),
    'moyens', coalesce((select jsonb_agg(to_jsonb(m))
                from moyens_salle m where m.tournee_id = acces.tournee_id), '[]'::jsonb),
    'lots', coalesce((select jsonb_agg(to_jsonb(l))
                from lots_materiel l where l.tournee_id = acces.tournee_id), '[]'::jsonb),
    'carnets', coalesce((select jsonb_agg(to_jsonb(c))
                from carnets_ata c where c.tournee_id = acces.tournee_id), '[]'::jsonb),
    'vehicules', coalesce((select jsonb_agg(to_jsonb(v)) from vehicules v), '[]'::jsonb),
    'chauffeurs', coalesce((select jsonb_agg(to_jsonb(ch)) from chauffeurs ch), '[]'::jsonb),
    'affectationsTransport', coalesce((select jsonb_agg(to_jsonb(a))
                from affectations_transport a where a.tournee_id = acces.tournee_id), '[]'::jsonb),
    'fichesTechniques', coalesce((select jsonb_agg(to_jsonb(f))
                from fiches_techniques f where f.tournee_id = acces.tournee_id), '[]'::jsonb),
    'techniciensContacts', coalesce((
                select jsonb_agg(jsonb_build_object('id', tc.id, 'prenom', tc.prenom, 'nom', tc.nom, 'poste', tc.poste))
                from techniciens tc
                where tc.id in (
                  select jsonb_array_elements_text(m.contacts_techniciens_ids)
                  from moyens_salle m where m.tournee_id = acces.tournee_id
                )), '[]'::jsonb)
  ) into resultat;

  return resultat;
end;
$$;


-- ============================================================================
-- Direction technique v3 — retours d'usage après premier tour :
-- matériel en mouvements plutôt qu'une date de retour unique, vacations
-- simplifiées à une confirmation, vacations de rigg, bureau d'étude
-- électrique et accroche distincts, horaires de journée et équipes road
-- colorées par département.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Matériel — un lot peut avoir plusieurs allers-retours (échange de console,
-- retour de matériel non utilisé…) : un journal de mouvements plutôt qu'une
-- seule date de retour. Quantité et numéro de série des éléments ne servent
-- pas — restent en place dans le jsonb mais ne sont plus affichés/saisis.
-- ----------------------------------------------------------------------------
alter table lots_materiel add column if not exists mouvements jsonb not null default '[]'::jsonb;
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='lots_materiel' and column_name='retour_le') then
    update lots_materiel
      set mouvements = jsonb_build_array(jsonb_build_object(
            'id', 'mig' || substr(md5(random()::text || id), 1, 12),
            'date', to_char(retour_le, 'YYYY-MM-DD'), 'type', 'entree', 'description', 'Retour'))
      where retour_le is not null and mouvements = '[]'::jsonb;
  end if;
end $$;
alter table lots_materiel drop column if exists retour_le;


-- ----------------------------------------------------------------------------
-- Fiche de date — simplifications et ajouts.
-- ----------------------------------------------------------------------------

-- Nombre de circuits ne voulait rien dire dans l'usage — retiré.
alter table moyens_salle drop column if exists nombre_circuits;

-- Bureau de contrôle devient deux bureaux distincts : électrique et accroche.
-- Les données existantes (génériques) sont reprises côté accroche, le plus
-- proche de leur usage réel (plan de charge / structure).
alter table moyens_salle add column if not exists bureau_electrique_sur_place boolean not null default false;
alter table moyens_salle add column if not exists bureau_electrique_horaire text default '';
alter table moyens_salle add column if not exists bureau_electrique_contact text default '';
alter table moyens_salle add column if not exists bureau_accroche_sur_place boolean not null default false;
alter table moyens_salle add column if not exists bureau_accroche_horaire text default '';
alter table moyens_salle add column if not exists bureau_accroche_contact text default '';
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='moyens_salle' and column_name='bureau_controle_sur_place') then
    update moyens_salle set
      bureau_accroche_sur_place = bureau_controle_sur_place,
      bureau_accroche_horaire = bureau_controle_horaire,
      bureau_accroche_contact = bureau_controle_contact
      where bureau_controle_sur_place = true
        or coalesce(bureau_controle_horaire,'') <> '' or coalesce(bureau_controle_contact,'') <> '';
  end if;
end $$;
alter table moyens_salle drop column if exists bureau_controle_sur_place;
alter table moyens_salle drop column if exists bureau_controle_horaire;
alter table moyens_salle drop column if exists bureau_controle_contact;

-- Vacations roadies : demandé/proposé/validé remplacé par une simple
-- confirmation, plus une répartition en équipes colorées par département.
do $$
begin
  if exists (
    select 1 from moyens_salle m, jsonb_array_elements(m.roadies_vacations) elem
    where elem ? 'nombrePropose' or elem ? 'nombreValide'
  ) then
    update moyens_salle
      set roadies_vacations = (
        select coalesce(jsonb_agg(
          (elem - 'nombrePropose' - 'nombreValide') || jsonb_build_object(
            'confirme', coalesce((elem->>'nombreValide') is not null, false),
            'equipes', coalesce(elem->'equipes', '[]'::jsonb)
          )
        ), '[]'::jsonb)
        from jsonb_array_elements(roadies_vacations) elem
      )
      where jsonb_array_length(roadies_vacations) > 0;
  end if;
end $$;

-- Vacations chariots : même simplification, et la case "confirmé" par
-- chariot détaillé (inutile en pratique) disparaît du détail des fourches.
do $$
begin
  if exists (
    select 1 from moyens_salle m, jsonb_array_elements(m.chariots_vacations) elem
    where elem ? 'nombreChariotsPropose' or elem ? 'nombreChariotsValide'
       or elem ? 'nombreCaristesPropose' or elem ? 'nombreCaristesValide'
  ) then
    update moyens_salle
      set chariots_vacations = (
        select coalesce(jsonb_agg(
          (elem - 'nombreChariotsPropose' - 'nombreChariotsValide' - 'nombreCaristesPropose' - 'nombreCaristesValide')
          || jsonb_build_object(
               'confirme', coalesce((elem->>'nombreChariotsValide') is not null, false),
               'fourches', coalesce((
                 select jsonb_agg(f - 'valide')
                 from jsonb_array_elements(coalesce(elem->'fourches', '[]'::jsonb)) f
               ), '[]'::jsonb)
             )
        ), '[]'::jsonb)
        from jsonb_array_elements(chariots_vacations) elem
      )
      where jsonb_array_length(chariots_vacations) > 0;
  end if;
end $$;

-- Vacations de rigg — même logique que roadies, en plus simple (pas d'équipes).
alter table moyens_salle add column if not exists rigg_vacations jsonb not null default '[]'::jsonb;

-- Horaires de la journée (load in, get in…) — une liste libre de repères.
alter table moyens_salle add column if not exists horaires_journee jsonb not null default '[]'::jsonb;

-- Étend repondre_vacation_salle au rigg (nouveau type de vacation).
create or replace function repondre_vacation_salle(
  p_token text, p_date_id text, p_type_vacation text, p_index int, p_reponse jsonb
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  acces acces_logistique%rowtype;
  ms moyens_salle%rowtype;
  liste jsonb;
begin
  select * into acces from acces_logistique where id = p_token and actif and type = 'salle' limit 1;
  if not found then return false; end if;
  if not (acces.dates_ids ? p_date_id) then return false; end if;
  if p_type_vacation not in ('roadies','chariots','rigg') then return false; end if;

  select * into ms from moyens_salle where tournee_id = acces.tournee_id and date_id = p_date_id limit 1;
  if not found then return false; end if;

  liste := case p_type_vacation
    when 'roadies' then ms.roadies_vacations
    when 'chariots' then ms.chariots_vacations
    else ms.rigg_vacations
  end;
  if p_index < 0 or p_index >= jsonb_array_length(liste) then return false; end if;
  liste := jsonb_set(liste, array[p_index::text], (liste->p_index) || p_reponse);

  if p_type_vacation = 'roadies' then
    update moyens_salle set roadies_vacations = liste where id = ms.id;
  elsif p_type_vacation = 'chariots' then
    update moyens_salle set chariots_vacations = liste where id = ms.id;
  else
    update moyens_salle set rigg_vacations = liste where id = ms.id;
  end if;
  return true;
end;
$$;
grant execute on function repondre_vacation_salle(text, text, text, int, jsonb) to anon, authenticated;


-- ============================================================================
-- Direction technique v4 — matériel (mouvements horodatés, retour prestataire),
-- chauffeur habituel par semi, équipes road nommées par tournée, horaires de
-- journée modifiables par le stage manager, accès élargi aux documents.
-- ============================================================================

-- Matériel : heure de livraison/pickup par mouvement (jsonb, pas de colonne à
-- ajouter) ; date + heure de retour chez le prestataire, distinctes des
-- mouvements courants (c'est le retour définitif du lot en fin de tournée).
alter table lots_materiel add column if not exists retour_prestataire_date date;
alter table lots_materiel add column if not exists retour_prestataire_heure text default '';

-- Véhicules : chauffeur habituel — le lien par défaut entre une semi et son
-- chauffeur, qui ne change pas d'une date à l'autre sauf exception (gérée par
-- affectations_transport, qui ne sert plus qu'aux exceptions).
alter table vehicules add column if not exists chauffeur_defaut_id text references chauffeurs(id) on delete set null;

-- Tournées : registre des équipes road nommées, réutilisé comme base de
-- répartition sur chaque vacation roadies (au lieu de recréer les mêmes
-- catégories à chaque fois).
alter table tournees add column if not exists equipes_road jsonb not null default '[]'::jsonb;

-- Le stage manager peut modifier les horaires de la journée (load in, get in…).
create or replace function enregistrer_horaires_journee(
  p_token text, p_date_id text, p_horaires jsonb
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  acces acces_logistique%rowtype;
  n int;
begin
  select * into acces from acces_logistique where id = p_token and actif and type = 'stage_manager' limit 1;
  if not found then return false; end if;
  update moyens_salle set horaires_journee = p_horaires
    where tournee_id = acces.tournee_id and date_id = p_date_id;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;
grant execute on function enregistrer_horaires_journee(text, text, jsonb) to anon, authenticated;

-- get_recap_logistique : expose désormais equipes_road (noms d'équipes pour
-- l'affichage des vacations roadies côté salle/technicien/stage manager).
-- NB : cette définition est corrigée plus bas (section « Correctif sécurité »)
-- pour ne plus fuiter l'intégralité des véhicules et chauffeurs.
create or replace function get_recap_logistique(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  acces acces_logistique%rowtype;
  resultat jsonb;
begin
  select * into acces from acces_logistique where id = p_token and actif limit 1;
  if not found then
    return null;
  end if;

  select jsonb_build_object(
    'libelle', acces.libelle,
    'type', acces.type,
    'datesIds', acces.dates_ids,
    'tournee', (select jsonb_build_object('id', t.id, 'nom', t.nom, 'dates', t.dates, 'equipesRoad', t.equipes_road)
                from tournees t where t.id = acces.tournee_id),
    'moyens', coalesce((select jsonb_agg(to_jsonb(m))
                from moyens_salle m where m.tournee_id = acces.tournee_id), '[]'::jsonb),
    'lots', coalesce((select jsonb_agg(to_jsonb(l))
                from lots_materiel l where l.tournee_id = acces.tournee_id), '[]'::jsonb),
    'carnets', coalesce((select jsonb_agg(to_jsonb(c))
                from carnets_ata c where c.tournee_id = acces.tournee_id), '[]'::jsonb),
    'vehicules', coalesce((select jsonb_agg(to_jsonb(v)) from vehicules v), '[]'::jsonb),
    'chauffeurs', coalesce((select jsonb_agg(to_jsonb(ch)) from chauffeurs ch), '[]'::jsonb),
    'affectationsTransport', coalesce((select jsonb_agg(to_jsonb(a))
                from affectations_transport a where a.tournee_id = acces.tournee_id), '[]'::jsonb),
    'fichesTechniques', coalesce((select jsonb_agg(to_jsonb(f))
                from fiches_techniques f where f.tournee_id = acces.tournee_id), '[]'::jsonb),
    'techniciensContacts', coalesce((
                select jsonb_agg(jsonb_build_object('id', tc.id, 'prenom', tc.prenom, 'nom', tc.nom, 'poste', tc.poste))
                from techniciens tc
                where tc.id in (
                  select jsonb_array_elements_text(m.contacts_techniciens_ids)
                  from moyens_salle m where m.tournee_id = acces.tournee_id
                )), '[]'::jsonb)
  ) into resultat;

  return resultat;
end;
$$;

-- ============================================================================
-- Correctif sécurité — récapitulatif logistique : ne partager que les
-- véhicules et chauffeurs réellement affectés à la tournée du jeton.
--
-- Auparavant, get_recap_logistique renvoyait la TOTALITÉ des tables vehicules
-- et chauffeurs (to_jsonb sans filtre) à n'importe quel lien de partage —
-- donc les coordonnées et notes internes de tous les chauffeurs, toutes
-- tournées confondues. On restreint désormais aux seuls véhicules et
-- chauffeurs liés à cette tournée (via affectations_transport et le chauffeur
-- habituel des véhicules concernés), et on n'expose que les champs utiles à
-- l'affichage — jamais le champ "notes", qui est interne.
-- ============================================================================
create or replace function get_recap_logistique(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  acces acces_logistique%rowtype;
  resultat jsonb;
begin
  select * into acces from acces_logistique where id = p_token and actif limit 1;
  if not found then
    return null;
  end if;

  select jsonb_build_object(
    'libelle', acces.libelle,
    'type', acces.type,
    'datesIds', acces.dates_ids,
    'tournee', (select jsonb_build_object('id', t.id, 'nom', t.nom, 'dates', t.dates, 'equipesRoad', t.equipes_road)
                from tournees t where t.id = acces.tournee_id),
    'moyens', coalesce((select jsonb_agg(to_jsonb(m))
                from moyens_salle m where m.tournee_id = acces.tournee_id), '[]'::jsonb),
    'lots', coalesce((select jsonb_agg(to_jsonb(l))
                from lots_materiel l where l.tournee_id = acces.tournee_id), '[]'::jsonb),
    'carnets', coalesce((select jsonb_agg(to_jsonb(c))
                from carnets_ata c where c.tournee_id = acces.tournee_id), '[]'::jsonb),
    -- Véhicules affectés à cette tournée uniquement, sans le champ notes.
    'vehicules', coalesce((
                select jsonb_agg(jsonb_build_object(
                  'id', v.id, 'nom', v.nom, 'type', v.type,
                  'immatriculation', v.immatriculation, 'hayon', v.hayon,
                  'capacite', v.capacite, 'prestataire_id', v.prestataire_id,
                  'hauteur_m', v.hauteur_m, 'largeur_m', v.largeur_m,
                  'profondeur_m', v.profondeur_m,
                  'chauffeur_defaut_id', v.chauffeur_defaut_id))
                from vehicules v
                where v.id in (
                  select af.vehicule_id from affectations_transport af
                  where af.tournee_id = acces.tournee_id and af.vehicule_id is not null
                )), '[]'::jsonb),
    -- Chauffeurs de la tournée : ceux d'une affectation, plus le chauffeur
    -- habituel des véhicules concernés. Sans le champ notes.
    'chauffeurs', coalesce((
                select jsonb_agg(jsonb_build_object(
                  'id', ch.id, 'prenom', ch.prenom, 'nom', ch.nom,
                  'telephone', ch.telephone, 'email', ch.email,
                  'prestataire', ch.prestataire))
                from chauffeurs ch
                where ch.id in (
                  select af.chauffeur_id from affectations_transport af
                  where af.tournee_id = acces.tournee_id and af.chauffeur_id is not null
                  union
                  select v.chauffeur_defaut_id from vehicules v
                  where v.chauffeur_defaut_id is not null and v.id in (
                    select af2.vehicule_id from affectations_transport af2
                    where af2.tournee_id = acces.tournee_id and af2.vehicule_id is not null
                  )
                )), '[]'::jsonb),
    'affectationsTransport', coalesce((select jsonb_agg(to_jsonb(a))
                from affectations_transport a where a.tournee_id = acces.tournee_id), '[]'::jsonb),
    'fichesTechniques', coalesce((select jsonb_agg(to_jsonb(f))
                from fiches_techniques f where f.tournee_id = acces.tournee_id), '[]'::jsonb),
    'techniciensContacts', coalesce((
                select jsonb_agg(jsonb_build_object('id', tc.id, 'prenom', tc.prenom, 'nom', tc.nom, 'poste', tc.poste))
                from techniciens tc
                where tc.id in (
                  select jsonb_array_elements_text(m.contacts_techniciens_ids)
                  from moyens_salle m where m.tournee_id = acces.tournee_id
                )), '[]'::jsonb)
  ) into resultat;

  return resultat;
end;
$$;

-- ============================================================================
-- Étape 1 — comptes personnels pour les musicien·nes
--
-- Aujourd'hui, un lien personnel EST le mot de passe : il est permanent, il
-- circule par messagerie, il se transfère, et il ouvre infos_sociales — donc
-- IBAN, numéro de sécurité sociale, date de naissance et adresse. On adosse
-- donc ces accès à de vrais comptes, créés par la personne elle-même depuis
-- son lien, avec une connexion par lien magique (pas de mot de passe).
--
-- Cette étape pose la fondation SANS rien casser : les jetons continuent de
-- fonctionner exactement comme avant. Elle ajoute la liaison compte ↔ personne
-- et de quoi la créer et la lire.
-- ============================================================================

-- Au passage, fermeture d'une lecture publique restée ouverte : tournees était
-- lisible par la clé anonyme, qui est publique par construction. Elle expose
-- cachet_montant, la nomenclature et, dans "dates", musiciensAssignes et
-- techniciensAssignes. Les dix pages qui lisent cette table en direct sont
-- toutes authentifiées, et les pages à jeton passent par get_tournee_by_token
-- (security definer, insensible aux policies) : la lecture publique ne servait
-- donc plus personne. Ce verrou compte double maintenant qu'on va multiplier
-- les comptes "authenticated" qui ne doivent, seuls, ouvrir aucune donnée.
drop policy if exists "public read" on tournees;
drop policy if exists "admin read" on tournees;
create policy "admin read" on tournees for select using (has_access());

-- Liaison entre un compte Supabase et une personne du répertoire. Une personne
-- ne peut être rattachée qu'à un seul compte, et inversement.
create table if not exists comptes_personnes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  person_id text not null,
  person_type text not null check (person_type in ('musicien','technicien')),
  email text not null,
  cree_le timestamptz not null default now(),
  unique (person_id, person_type)
);
create index if not exists idx_comptes_personnes_personne on comptes_personnes(person_id, person_type);

alter table comptes_personnes enable row level security;
-- Chacun·e voit sa propre liaison ; les comptes de l'équipe voient tout.
drop policy if exists "sa propre liaison" on comptes_personnes;
create policy "sa propre liaison" on comptes_personnes for select to authenticated
  using (user_id = auth.uid() or has_access());
-- L'écriture ne passe que par lier_compte_a_personne() ci-dessous : personne ne
-- doit pouvoir se rattacher à la personne de son choix par une requête directe.
drop policy if exists "gestion equipe" on comptes_personnes;
create policy "gestion equipe" on comptes_personnes for all to authenticated
  using (has_access()) with check (has_access());

-- Rattache le compte connecté à la personne désignée par son jeton personnel.
--
-- Deux garde-fous : il faut être connecté (donc avoir prouvé l'accès à sa boîte
-- mail via le lien magique) ET détenir le jeton personnel. Quand la fiche de la
-- personne porte déjà une adresse email, celle du compte doit correspondre —
-- sans quoi un lien transféré permettrait à un tiers de s'approprier
-- durablement l'identité de quelqu'un.
create or replace function lier_compte_a_personne(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cible record;
  email_compte text;
  email_fiche text;
  existante comptes_personnes%rowtype;
  prenom text; nom text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'motif', 'non_connecte');
  end if;

  select * into cible from resolve_person_token(p_token);
  if not found or cible.person_id is null then
    return jsonb_build_object('ok', false, 'motif', 'jeton_invalide');
  end if;

  email_compte := lower(trim(coalesce(auth.jwt()->>'email', '')));
  if email_compte = '' then
    return jsonb_build_object('ok', false, 'motif', 'compte_sans_email');
  end if;

  -- Déjà rattaché ? On distingue "c'est déjà toi" de "c'est quelqu'un d'autre".
  select * into existante from comptes_personnes
   where person_id = cible.person_id and person_type = cible.person_type;
  if found then
    if existante.user_id = auth.uid() then
      return jsonb_build_object('ok', true, 'motif', 'deja_lie');
    end if;
    return jsonb_build_object('ok', false, 'motif', 'personne_deja_prise');
  end if;

  -- Ce compte est-il déjà rattaché à quelqu'un d'autre ?
  if exists (select 1 from comptes_personnes where user_id = auth.uid()) then
    return jsonb_build_object('ok', false, 'motif', 'compte_deja_lie');
  end if;

  if cible.person_type = 'musicien' then
    select lower(trim(coalesce(m.email,''))), m.prenom, m.nom into email_fiche, prenom, nom
      from musiciens m where m.id = cible.person_id;
  else
    select lower(trim(coalesce(t.email,''))), t.prenom, t.nom into email_fiche, prenom, nom
      from techniciens t where t.id = cible.person_id;
  end if;

  if email_fiche is not null and email_fiche <> '' and email_fiche <> email_compte then
    return jsonb_build_object('ok', false, 'motif', 'email_different');
  end if;

  insert into comptes_personnes (user_id, person_id, person_type, email)
  values (auth.uid(), cible.person_id, cible.person_type, email_compte);

  return jsonb_build_object('ok', true, 'motif', 'cree', 'prenom', prenom, 'nom', nom);
end;
$$;
grant execute on function lier_compte_a_personne(text) to authenticated;

-- Qui suis-je ? Renvoie la personne rattachée au compte connecté, ou null.
-- C'est ce que le futur routage lira pour ouvrir le bon espace.
create or replace function ma_personne()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  lien comptes_personnes%rowtype;
  prenom text; nom text;
begin
  if auth.uid() is null then return null; end if;
  select * into lien from comptes_personnes where user_id = auth.uid();
  if not found then return null; end if;

  if lien.person_type = 'musicien' then
    select m.prenom, m.nom into prenom, nom from musiciens m where m.id = lien.person_id;
  else
    select t.prenom, t.nom into prenom, nom from techniciens t where t.id = lien.person_id;
  end if;

  return jsonb_build_object(
    'personId', lien.person_id, 'personType', lien.person_type,
    'prenom', prenom, 'nom', nom, 'email', lien.email
  );
end;
$$;
grant execute on function ma_personne() to authenticated;

-- ============================================================================
-- Espace personnel : un lien unique pour les musicien·nes
--
-- Jusqu'ici une personne recevait plusieurs liens — un par demande de dispo,
-- plus un lien permanent pour ses infos. On en fait un seul, permanent, qui
-- regroupe tout. Il faut donc pouvoir retrouver, depuis le jeton permanent,
-- les demandes de disponibilité en cours : c'est l'objet de cette fonction.
--
-- Elle accepte indifféremment un jeton permanent (acces_personnels) ou un
-- jeton de demande (dispo_demandes), via resolve_person_token — les anciens
-- liens continuent donc de mener au même endroit.
-- ============================================================================
create or replace function mes_demandes_dispo(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cible record;
  resultat jsonb;
begin
  select * into cible from resolve_person_token(p_token);
  if not found or cible.person_id is null then
    return null;
  end if;

  select jsonb_build_object(
    'personId', cible.person_id,
    'personType', cible.person_type,
    'prenom', coalesce(
      (select m.prenom from musiciens m where m.id = cible.person_id and cible.person_type = 'musicien'),
      (select t.prenom from techniciens t where t.id = cible.person_id and cible.person_type = 'technicien'), ''),
    'nom', coalesce(
      (select m.nom from musiciens m where m.id = cible.person_id and cible.person_type = 'musicien'),
      (select t.nom from techniciens t where t.id = cible.person_id and cible.person_type = 'technicien'), ''),
    'statutPoste', coalesce(
      (select m.statut_poste from musiciens m where m.id = cible.person_id and cible.person_type = 'musicien'),
      'titulaire'),
    'demandes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'token', d.id,
               'tourneeNom', t.nom,
               'repondu', d.last_responded_at is not null,
               'creeLe', d.created_at)
             order by d.created_at desc)
      from dispo_demandes d
      join tournees t on t.id = d.tournee_id
      where d.person_id = cible.person_id and d.person_type = cible.person_type
    ), '[]'::jsonb)
  ) into resultat;

  return resultat;
end;
$$;
grant execute on function mes_demandes_dispo(text) to anon, authenticated;

-- ============================================================================
-- Administration des accès personnels
--
-- Sans ces deux fonctions, la création de compte est une impasse : si une
-- personne change d'adresse email, perd l'accès à sa boîte, ou se rattache
-- par erreur, plus rien ne peut être défait — sa fiche reste prise et elle ne
-- peut plus jamais créer d'accès. On donne donc à l'équipe de quoi voir et
-- défaire les rattachements.
--
-- Au passage : ma_personne() et lier_compte_a_personne() restaient appelables
-- par tout le monde. Elles refusent correctement les appels anonymes, mais le
-- droit par défaut que PostgreSQL accorde à PUBLIC rendait le grant précédent
-- décoratif. On le retire pour que la restriction repose sur deux barrières.
-- ============================================================================
revoke execute on function ma_personne() from public;
revoke execute on function lier_compte_a_personne(text) from public;
grant execute on function ma_personne() to authenticated;
grant execute on function lier_compte_a_personne(text) to authenticated;

-- Qui a créé son accès, et qui ne l'a pas encore fait.
create or replace function liste_comptes_personnes()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare resultat jsonb;
begin
  if not has_access() then
    raise exception 'Réservé aux comptes autorisés';
  end if;

  select jsonb_build_object(
    'lies', coalesce((
      select jsonb_agg(jsonb_build_object(
               'personId', c.person_id, 'personType', c.person_type,
               'prenom', coalesce(m.prenom, t.prenom, ''),
               'nom', coalesce(m.nom, t.nom, ''),
               'emailCompte', c.email,
               'emailFiche', coalesce(m.email, t.email, ''),
               'creeLe', c.cree_le)
             order by coalesce(m.nom, t.nom, ''), coalesce(m.prenom, t.prenom, ''))
      from comptes_personnes c
      left join musiciens m on m.id = c.person_id and c.person_type = 'musicien'
      left join techniciens t on t.id = c.person_id and c.person_type = 'technicien'
    ), '[]'::jsonb),
    'sansCompte', coalesce((
      select jsonb_agg(jsonb_build_object(
               'personId', m.id, 'personType', 'musicien',
               'prenom', m.prenom, 'nom', m.nom, 'emailFiche', coalesce(m.email,''))
             order by m.nom, m.prenom)
      from musiciens m
      where not exists (
        select 1 from comptes_personnes c
        where c.person_id = m.id and c.person_type = 'musicien')
    ), '[]'::jsonb)
  ) into resultat;

  return resultat;
end;
$$;
revoke execute on function liste_comptes_personnes() from public;
grant execute on function liste_comptes_personnes() to authenticated;

-- Défait un rattachement, pour que la personne puisse en recréer un. Le compte
-- Supabase lui-même subsiste mais n'ouvre plus rien : il ne donne accès à
-- aucune donnée tant qu'il n'est rattaché à personne.
create or replace function delier_compte_personne(p_person_id text, p_person_type text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  if not has_access() then
    raise exception 'Réservé aux comptes autorisés';
  end if;
  delete from comptes_personnes
   where person_id = p_person_id and person_type = p_person_type;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;
revoke execute on function delier_compte_personne(text, text) from public;
grant execute on function delier_compte_personne(text, text) to authenticated;

-- ============================================================================
-- Verrouillage des liens personnels
--
-- Jusqu'ici le lien personnel donnait accès aux données par lui-même. Il est
-- permanent, il circule par messagerie et il se transfère : quiconque le
-- recevait pouvait lire et modifier l'IBAN et le numéro de sécurité sociale
-- de la personne.
--
-- Désormais le lien ne sert plus qu'à UNE chose : créer son accès ou se
-- connecter. Les données ne s'ouvrent qu'à une session rattachée à la
-- personne concernée.
--
-- Conséquence assumée : tant qu'une personne n'a pas créé son accès, son lien
-- ne montre rien — pas même ses disponibilités.
--
-- Presque toutes les fonctions passent par resolve_person_token : le verrou
-- tient donc en un point unique. Les trois qui interrogeaient dispo_demandes
-- en direct sont reprises juste après.
-- ============================================================================

-- Le résolveur brut, sans contrôle de session. Réservé à la création d'accès :
-- à cet instant, la personne n'a par définition pas encore de compte.
create or replace function resolve_person_token_brut(p_token text)
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
revoke execute on function resolve_person_token_brut(text) from public;

-- Le résolveur utilisé partout ailleurs : il ne rend la personne que si la
-- session en cours lui est rattachée.
create or replace function resolve_person_token(p_token text)
returns table(person_id text, person_type text)
language sql
security definer
set search_path = public
stable
as $$
  select b.person_id, b.person_type
  from resolve_person_token_brut(p_token) b
  join comptes_personnes c
    on c.person_id = b.person_id and c.person_type = b.person_type
  where c.user_id = auth.uid();
$$;
grant execute on function resolve_person_token(text) to anon, authenticated;

-- La création d'accès doit continuer de fonctionner sans session rattachée.
create or replace function lier_compte_a_personne(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cible record;
  email_compte text;
  email_fiche text;
  existante comptes_personnes%rowtype;
  prenom text; nom text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'motif', 'non_connecte');
  end if;

  select * into cible from resolve_person_token_brut(p_token);
  if not found or cible.person_id is null then
    return jsonb_build_object('ok', false, 'motif', 'jeton_invalide');
  end if;

  email_compte := lower(trim(coalesce(auth.jwt()->>'email', '')));
  if email_compte = '' then
    return jsonb_build_object('ok', false, 'motif', 'compte_sans_email');
  end if;

  select * into existante from comptes_personnes
   where person_id = cible.person_id and person_type = cible.person_type;
  if found then
    if existante.user_id = auth.uid() then
      return jsonb_build_object('ok', true, 'motif', 'deja_lie');
    end if;
    return jsonb_build_object('ok', false, 'motif', 'personne_deja_prise');
  end if;

  if exists (select 1 from comptes_personnes where user_id = auth.uid()) then
    return jsonb_build_object('ok', false, 'motif', 'compte_deja_lie');
  end if;

  if cible.person_type = 'musicien' then
    select lower(trim(coalesce(m.email,''))), m.prenom, m.nom into email_fiche, prenom, nom
      from musiciens m where m.id = cible.person_id;
  else
    select lower(trim(coalesce(t.email,''))), t.prenom, t.nom into email_fiche, prenom, nom
      from techniciens t where t.id = cible.person_id;
  end if;

  if email_fiche is not null and email_fiche <> '' and email_fiche <> email_compte then
    return jsonb_build_object('ok', false, 'motif', 'email_different');
  end if;

  insert into comptes_personnes (user_id, person_id, person_type, email)
  values (auth.uid(), cible.person_id, cible.person_type, email_compte);

  return jsonb_build_object('ok', true, 'motif', 'cree', 'prenom', prenom, 'nom', nom);
end;
$$;
revoke execute on function lier_compte_a_personne(text) from public;
grant execute on function lier_compte_a_personne(text) to authenticated;

-- Les trois fonctions qui lisaient dispo_demandes sans passer par le pivot.
create or replace function get_dispo_demande_by_token(p_token text)
returns setof dispo_demandes
language sql
security definer
set search_path = public
as $$
  select d.* from dispo_demandes d
  where d.id = p_token
    and exists (select 1 from resolve_person_token(p_token));
$$;

create or replace function mark_dispo_responded_by_token(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from resolve_person_token(p_token)) then
    raise exception 'Accès refusé';
  end if;
  update dispo_demandes set last_responded_at = now() where id = p_token;
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
  from resolve_person_token(p_token);
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

-- Savoir, sans rien dévoiler, si un lien attend encore la création d'un accès.
-- Ne renvoie qu'un booléen : aucune donnée personnelle.
create or replace function jeton_attend_creation(p_token text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from resolve_person_token_brut(p_token))
     and not exists (
       select 1 from resolve_person_token_brut(p_token) b
       join comptes_personnes c
         on c.person_id = b.person_id and c.person_type = b.person_type);
$$;
grant execute on function jeton_attend_creation(text) to anon, authenticated;

-- get_tournee_by_token interrogeait dispo_demandes en direct, sans passer par
-- le pivot : elle rendait donc encore le nom de la tournée à un lien nu.
create or replace function get_tournee_by_token(p_token text)
returns setof tournees
language sql
security definer
set search_path = public
as $$
  select t.* from tournees t
    join dispo_demandes d on d.tournee_id = t.id
   where d.id = p_token
     and exists (select 1 from resolve_person_token(p_token));
$$;

-- Le cachet individualisé passait lui aussi par dispo_demandes en direct.
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
  where d.id = p_token
    and exists (select 1 from resolve_person_token(p_token));
$$;

-- ============================================================================
-- Retour aux liens personnels sans compte (musicien·nes)
--
-- Décision d'usage : le système de comptes compliquait trop le parcours pour
-- l'enjeu retenu. On revient au fonctionnement d'avant — le lien personnel
-- suffit à ouvrir l'espace, comme pour les salles et stage managers.
--
-- Ce qui est conservé : le lien unique mon-espace (mes_demandes_dispo), les
-- correctifs chauffeurs et tournees, l'app installable.
-- Ce qui est retiré : la table de liaison compte ↔ personne et toutes les
-- fonctions de création/gestion d'accès ; le résolveur redevient direct.
-- ============================================================================

-- Le résolveur redevient le résolveur simple : détenir le jeton suffit.
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

-- Les cinq fonctions qui avaient été verrouillées retrouvent leur forme d'origine.
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

-- Démontage de la mécanique de comptes.
drop function if exists jeton_attend_creation(text);
drop function if exists lier_compte_a_personne(text);
drop function if exists ma_personne();
drop function if exists liste_comptes_personnes();
drop function if exists delier_compte_personne(text, text);
drop function if exists resolve_person_token_brut(text);
drop table if exists comptes_personnes;

-- ============================================================================
-- Retour chez le prestataire : deux heures, pas une.
--
-- Le pick up (l'heure où l'on charge) et la livraison (l'heure où le lot
-- arrive chez le prestataire) sont deux rendez-vous distincts, souvent à deux
-- bouts de la même journée. La colonne historique retour_prestataire_heure
-- portait les deux à la fois : elle devient l'heure de pick up, et la
-- livraison prend la sienne. Rien à reprendre dans les données existantes.
-- ============================================================================
alter table lots_materiel add column if not exists retour_prestataire_heure_livraison text default '';

-- ============================================================================
-- Fiche de date : ce qui se valide de deux côtés, ce qui va de soi, et ce qui
-- se règle semi par semi.
--
-- 1. Le plan de scène portait une case unique « validée de part et d'autre ».
--    Une validation ne vaut pourtant que d'un côté à la fois : la nôtre ne dit
--    rien de celle de la salle. Deux colonnes, donc, initialisées depuis
--    l'ancienne (qui valait bien pour les deux quand elle était cochée).
--    plan_valide reste en place, plus personne ne l'écrit.
--
-- 2. Un bureau d'étude est toujours prévu sur place : la case ne demande plus
--    de le confirmer à chaque date, elle signale l'exception. Le défaut passe
--    donc à vrai, et les fiches jamais renseignées sur ce point suivent — on ne
--    touche pas à celles où quelqu'un a saisi un horaire ou un contact, leur
--    « non » était voulu. Le contact en texte libre se scinde en nom et
--    téléphone, avec le lien du dossier à côté.
--
-- 3. Le niveau de déchargement était unique pour toute la salle, alors qu'une
--    semi peut décharger de plain-pied côté cour pendant qu'une autre monte sur
--    scène. Il rejoint chaque entrée de emplacements_dechargement, en reprenant
--    l'ancienne valeur commune. niveau_dechargement reste, plus personne ne
--    l'écrit.
--
-- Les trois blocs ne s'exécutent qu'une fois : ils ne font rien si les
-- colonnes sont déjà là, ou si les niveaux sont déjà posés.
-- ============================================================================
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_name = 'moyens_salle' and column_name = 'plan_valide_nous') then
    alter table moyens_salle add column plan_valide_nous boolean not null default false;
    alter table moyens_salle add column plan_valide_salle boolean not null default false;
    update moyens_salle set plan_valide_nous = true, plan_valide_salle = true where plan_valide;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_name = 'moyens_salle' and column_name = 'bureau_electrique_nom') then
    alter table moyens_salle add column bureau_electrique_nom text not null default '';
    alter table moyens_salle add column bureau_electrique_tel text not null default '';
    alter table moyens_salle add column bureau_electrique_dossier_url text not null default '';
    alter table moyens_salle add column bureau_accroche_nom text not null default '';
    alter table moyens_salle add column bureau_accroche_tel text not null default '';
    alter table moyens_salle add column bureau_accroche_dossier_url text not null default '';

    update moyens_salle set bureau_electrique_nom = coalesce(bureau_electrique_contact, ''),
                            bureau_accroche_nom   = coalesce(bureau_accroche_contact, '');

    alter table moyens_salle alter column bureau_electrique_sur_place set default true;
    alter table moyens_salle alter column bureau_accroche_sur_place   set default true;
    update moyens_salle set bureau_electrique_sur_place = true
      where bureau_electrique_sur_place is not true
        and coalesce(bureau_electrique_horaire, '') = ''
        and coalesce(bureau_electrique_contact, '') = '';
    update moyens_salle set bureau_accroche_sur_place = true
      where bureau_accroche_sur_place is not true
        and coalesce(bureau_accroche_horaire, '') = ''
        and coalesce(bureau_accroche_contact, '') = '';
  end if;
end $$;

update moyens_salle
   set emplacements_dechargement = (
         select jsonb_agg(e || jsonb_build_object('niveau', coalesce(niveau_dechargement, 'inconnu')))
           from jsonb_array_elements(emplacements_dechargement) e)
 where jsonb_typeof(emplacements_dechargement) = 'array'
   and jsonb_array_length(emplacements_dechargement) > 0
   -- Parenthèses explicites autour du -> : sans elles, la lecture de la ligne
   -- dépend de la précédence entre deux opérateurs jsonb, et le sens n'est pas
   -- évident à relire. Et on ne concatène qu'à des objets : sur un scalaire,
   -- « || » ferait une fusion de tableaux, donc une donnée fausse en silence.
   and jsonb_typeof(emplacements_dechargement -> 0) = 'object'
   and not ((emplacements_dechargement -> 0) ? 'niveau');

-- ============================================================================
-- Adresse du destinataire d'un accès de partage.
--
-- On envoie parfois à une salle le PDF plutôt que le lien — c'est la salle qui
-- décide, et beaucoup préfèrent une pièce jointe qu'elles classent. Le message
-- qui l'accompagne se pré-adresse alors depuis partage.html, à condition de
-- savoir à qui. Le lien reste utilisable en parallèle.
--
-- Cette adresse est interne : get_recap_logistique ne la renvoie pas, elle ne
-- sort donc jamais par le lien public.
-- ============================================================================
alter table acces_logistique add column if not exists email text not null default '';

-- ============================================================================
-- On ne se déclare pas indisponible sur une date où l'on est déjà affecté·e.
--
-- Rien ne l'empêchait : la page de dispo ignorait tout des affectations, et la
-- fonction d'écriture recopiait ce qu'on lui donnait. Une personne pouvait donc
-- se retirer d'une date dont l'équipe était bouclée, sans que la production
-- l'apprenne autrement qu'en relisant la grille par hasard.
--
-- Deux verrous, parce qu'un seul ne suffit pas. Côté page, le bouton
-- « Indisponible » est barré sur ces dates et propose d'appeler la production.
-- Côté base, ci-dessous, la bascule est refusée : un lien personnel ne doit pas
-- pouvoir défaire une équipe en contournant l'interface.
--
-- Seules les BASCULES vers « indisponible » sont refusées. Une date déjà marquée
-- indisponible avant l'affectation — cela arrive, la production peut affecter
-- quand même — continue de se réenregistrer sans erreur, sinon plus aucune
-- sauvegarde ne passerait pour cette personne.
-- ============================================================================
alter table reglages add column if not exists referent_nom text not null default '';
alter table reglages add column if not exists referent_telephone text not null default '';

-- Le contact de production s'affiche sur les pages à jeton, que la clé anonyme
-- ne peut pas lire (reglages est fermée par has_access()). Cette fonction
-- n'expose que ces deux champs, qui n'ont rien de confidentiel : c'est le
-- numéro qu'on donne déjà à tout le monde.
create or replace function get_contact_production()
returns table(nom text, telephone text)
language sql
security definer
set search_path = public
as $$
  select coalesce(referent_nom, ''), coalesce(referent_telephone, '')
    from reglages where id = 1;
$$;
grant execute on function get_contact_production() to anon, authenticated;

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
  v_actuelles jsonb;
  v_bloquees text[];
begin
  select person_id, person_type into v_person_id, v_person_type
  from dispo_demandes where id = p_token;
  if v_person_id is null then
    raise exception 'Lien invalide';
  end if;

  if v_person_type = 'musicien' then
    select coalesce(disponibilites, '{}'::jsonb) into v_actuelles from musiciens where id = v_person_id;
  else
    select coalesce(disponibilites, '{}'::jsonb) into v_actuelles from techniciens where id = v_person_id;
  end if;

  -- jsonb_exists() plutôt que l'opérateur « ? » : même sens, mais aucune
  -- ambiguïté de lecture, et rien qu'un pilote puisse confondre avec un
  -- paramètre de requête.
  select array_agg(e.key order by e.key) into v_bloquees
  from jsonb_each_text(coalesce(p_disponibilites, '{}'::jsonb)) as e(key, valeur)
  where e.valeur = 'indispo'
    and coalesce(v_actuelles ->> e.key, '') <> 'indispo'
    and exists (
      select 1
        from tournees t, jsonb_array_elements(t.dates) d
       where d ->> 'date' = e.key
         and jsonb_exists(
               case when v_person_type = 'musicien'
                    then d -> 'musiciensAssignes'
                    else d -> 'techniciensAssignes' end,
               v_person_id)
    );

  if v_bloquees is not null then
    raise exception 'AFFECTE_SUR_CES_DATES:%', array_to_string(v_bloquees, ',');
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
grant execute on function update_own_disponibilites_by_token(text, jsonb, jsonb, text, text) to anon, authenticated;

-- ============================================================================
-- Où va le chauffeur, ce que la tournée demande, et ce que les gens en disent.
--
-- Trois manques qui se tenaient : on ne pouvait pas dire à un chauffeur chez
-- qui il allait faute d'adresse, on redécrivait à chaque date des exigences de
-- tournée qui ne changent pas, et personne ne pouvait nous signaler un problème
-- depuis un lien partagé autrement qu'en téléphonant.
-- ============================================================================

-- 1. Un prestataire a une adresse. Sans elle, « chez quel prestataire va-t-il ? »
--    reste sans réponse utilisable sur une feuille de mission.
alter table prestataires add column if not exists adresse text not null default '';
alter table prestataires add column if not exists telephone text not null default '';
alter table prestataires add column if not exists contact_nom text not null default '';

-- 2. Les exigences techniques de la tournée : elles ne changent pas d'une date
--    à l'autre, mais doivent pouvoir évoluer. On les pose sur la tournée plutôt
--    que de les recopier sur chaque fiche de date.
--
--    { pointsJus:      [{id, position, puissance, typePrise, differentiel}],
--      accesScene:     [{id, position, notes}],
--      multis:         {nombre, depart, notes} }   -- les snakes plateau → régie
alter table tournees add column if not exists technique_tournee jsonb not null default '{}'::jsonb;

-- 3. Ce que la salle indique en retour, date par date : où sont ses points de
--    distribution électrique. [{id, position, notes}]
alter table moyens_salle add column if not exists points_distribution jsonb not null default '[]'::jsonb;

-- 4. Remarques laissées depuis un lien partagé.
--
--    Une salle ou un stage manager qui repère une erreur n'avait aucun moyen de
--    nous le dire dans l'outil : il fallait téléphoner, et l'information restait
--    dans la tête de celui qui décrochait. Elles remontent désormais ici, et
--    s'affichent côté production sur la date concernée.
create table if not exists remarques (
  id text primary key,
  tournee_id text,
  date_id text,
  acces_id text,
  auteur text not null default '',
  sujet text not null default '',
  message text not null default '',
  traitee boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_remarques_updated_at on remarques;
create trigger trg_remarques_updated_at before update on remarques
  for each row execute function set_updated_at();

alter table remarques enable row level security;
-- Écriture par la fonction à jeton uniquement (security definer) : la clé
-- anonyme n'a aucun droit direct sur cette table, ni en lecture ni en écriture.
drop policy if exists "remarques lecture" on remarques;
create policy "remarques lecture" on remarques for select to authenticated
  using (has_access());
drop policy if exists "remarques ecriture" on remarques;
create policy "remarques ecriture" on remarques for all to authenticated
  using (has_access()) with check (has_access());

create or replace function ajouter_remarque_par_jeton(
  p_token text, p_date_id text, p_sujet text, p_message text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  acces acces_logistique%rowtype;
begin
  select * into acces from acces_logistique where id = p_token and actif limit 1;
  if not found then return false; end if;
  if coalesce(trim(p_message), '') = '' then return false; end if;

  insert into remarques (id, tournee_id, date_id, acces_id, auteur, sujet, message)
  values (replace(gen_random_uuid()::text, '-', ''), acces.tournee_id, p_date_id,
          acces.id, coalesce(acces.libelle, ''), coalesce(p_sujet, ''),
          -- Bornée : un lien public ne doit pas pouvoir écrire un roman en base.
          left(trim(p_message), 2000));
  return true;
end;
$$;
grant execute on function ajouter_remarque_par_jeton(text, text, text, text) to anon, authenticated;

-- Les remarques déjà laissées, pour que la page partagée les montre à son auteur
-- plutôt que de lui faire croire que rien n'est parti.
create or replace function get_remarques_par_jeton(p_token text)
returns table(id text, date_id text, sujet text, message text, traitee boolean, created_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select r.id, r.date_id, r.sujet, r.message, r.traitee, r.created_at
    from remarques r
    join acces_logistique a on a.id = r.acces_id
   where a.id = p_token and a.actif
   order by r.created_at desc;
$$;
grant execute on function get_remarques_par_jeton(text) to anon, authenticated;

-- 5. Dépôt du plan de salle par le stage manager.
--
--    Il pouvait positionner les semis mais pas déposer l'image : celle-ci ne se
--    chargeait que depuis la fiche de date, côté production. Le fichier lui-même
--    passe par api/deposer-plan-salle.js — le bucket exige un compte, et ouvrir
--    l'écriture à la clé anonyme aurait offert un dépôt de fichiers sans
--    authentification à qui lit le code source. Cette fonction ne fait que
--    rattacher le chemin déjà déposé à la bonne date, après contrôle du jeton.
create or replace function enregistrer_plan_salle_par_jeton(
  p_token text, p_date_id text, p_chemin text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  acces acces_logistique%rowtype;
  n int;
begin
  select * into acces from acces_logistique
   where id = p_token and actif and type = 'stage_manager' limit 1;
  if not found then return false; end if;
  update moyens_salle set plan_image_path = coalesce(p_chemin, '')
   where tournee_id = acces.tournee_id and date_id = p_date_id;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;
grant execute on function enregistrer_plan_salle_par_jeton(text, text, text) to anon, authenticated;

-- ============================================================================
-- Les exigences techniques de la tournée descendent jusqu'aux liens partagés
--
-- Les colonnes existaient déjà (bloc précédent) mais rien ne les faisait sortir :
-- get_recap_logistique construit l'objet « tournee » champ par champ, et
-- technique_tournee n'y figurait pas. Une salle ou un stage manager ne voyait
-- donc ni les points de puissance demandés, ni les accès scène, ni les multipaires.
--
-- points_distribution, lui, passait déjà : les moyens sortent en to_jsonb(m),
-- donc colonne par colonne, sans liste à tenir à jour.
-- ============================================================================
create or replace function get_recap_logistique(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  acces acces_logistique%rowtype;
  resultat jsonb;
begin
  select * into acces from acces_logistique where id = p_token and actif limit 1;
  if not found then
    return null;
  end if;

  select jsonb_build_object(
    'libelle', acces.libelle,
    'type', acces.type,
    'datesIds', acces.dates_ids,
    'tournee', (select jsonb_build_object('id', t.id, 'nom', t.nom, 'dates', t.dates,
                       'equipesRoad', t.equipes_road,
                       'techniqueTournee', t.technique_tournee)
                from tournees t where t.id = acces.tournee_id),
    'moyens', coalesce((select jsonb_agg(to_jsonb(m))
                from moyens_salle m where m.tournee_id = acces.tournee_id), '[]'::jsonb),
    'lots', coalesce((select jsonb_agg(to_jsonb(l))
                from lots_materiel l where l.tournee_id = acces.tournee_id), '[]'::jsonb),
    'carnets', coalesce((select jsonb_agg(to_jsonb(c))
                from carnets_ata c where c.tournee_id = acces.tournee_id), '[]'::jsonb),
    -- Véhicules affectés à cette tournée uniquement, sans le champ notes.
    'vehicules', coalesce((
                select jsonb_agg(jsonb_build_object(
                  'id', v.id, 'nom', v.nom, 'type', v.type,
                  'immatriculation', v.immatriculation, 'hayon', v.hayon,
                  'capacite', v.capacite, 'prestataire_id', v.prestataire_id,
                  'hauteur_m', v.hauteur_m, 'largeur_m', v.largeur_m,
                  'profondeur_m', v.profondeur_m,
                  'chauffeur_defaut_id', v.chauffeur_defaut_id))
                from vehicules v
                where v.id in (
                  select af.vehicule_id from affectations_transport af
                  where af.tournee_id = acces.tournee_id and af.vehicule_id is not null
                )), '[]'::jsonb),
    -- Chauffeurs de la tournée : ceux d'une affectation, plus le chauffeur
    -- habituel des véhicules concernés. Sans le champ notes.
    'chauffeurs', coalesce((
                select jsonb_agg(jsonb_build_object(
                  'id', ch.id, 'prenom', ch.prenom, 'nom', ch.nom,
                  'telephone', ch.telephone, 'email', ch.email,
                  'prestataire', ch.prestataire))
                from chauffeurs ch
                where ch.id in (
                  select af.chauffeur_id from affectations_transport af
                  where af.tournee_id = acces.tournee_id and af.chauffeur_id is not null
                  union
                  select v.chauffeur_defaut_id from vehicules v
                  where v.chauffeur_defaut_id is not null and v.id in (
                    select af2.vehicule_id from affectations_transport af2
                    where af2.tournee_id = acces.tournee_id and af2.vehicule_id is not null
                  )
                )), '[]'::jsonb),
    'affectationsTransport', coalesce((select jsonb_agg(to_jsonb(a))
                from affectations_transport a where a.tournee_id = acces.tournee_id), '[]'::jsonb),
    'fichesTechniques', coalesce((select jsonb_agg(to_jsonb(f))
                from fiches_techniques f where f.tournee_id = acces.tournee_id), '[]'::jsonb),
    'techniciensContacts', coalesce((
                select jsonb_agg(jsonb_build_object('id', tc.id, 'prenom', tc.prenom, 'nom', tc.nom, 'poste', tc.poste))
                from techniciens tc
                where tc.id in (
                  select jsonb_array_elements_text(m.contacts_techniciens_ids)
                  from moyens_salle m where m.tournee_id = acces.tournee_id
                )), '[]'::jsonb)
  ) into resultat;

  return resultat;
end;
$$;

-- ============================================================================
-- Le matériel s'organise par semi, et un aller-retour devient un objet suivi
--
-- Ce que le modèle ne savait pas dire, et qui était pourtant le besoin :
--
--  * un kit est chargé dans UNE semi — rien ne reliait lots_materiel à
--    vehicules, alors que « le kit son part dans la semi 3 » est le pivot de
--    toute la logistique ;
--  * la prise en charge initiale n'était qu'une date sèche, sans heure ni
--    adresse : impossible d'en tirer « mardi 8 h, chez Dushow, 12 rue de la
--    Fonderie » à donner à un chauffeur ;
--  * un aller-retour n'existait pas. Les mouvements étaient un journal plat où
--    une « sortie » et une « entrée » ne se connaissaient pas. Rien ne disait
--    que la console partie le 12 était celle revenue le 14 — donc aucun suivi,
--    et à trois ou quatre tournées menées en parallèle, plus rien de tenable.
--
-- L'échange devient donc une ligne à part entière, avec son état. C'est cet
-- état qui répond à la seule question qui compte : qu'est-ce qui est parti chez
-- un prestataire et n'est pas revenu ?
-- ============================================================================

-- 1. La semi qui porte le kit, et le premier rendez-vous du chauffeur.
--    prise_en_charge : {date, heure, prestataireId, notes}
alter table lots_materiel add column if not exists vehicule_id text;
alter table lots_materiel add column if not exists prise_en_charge jsonb not null default '{}'::jsonb;

-- Reprise de l'existant : date_pickup portait déjà la récupération initiale.
-- On ne la perd pas, on lui donne sa place — sans écraser ce qui aurait déjà
-- été saisi côté prise_en_charge.
update lots_materiel
   set prise_en_charge = jsonb_build_object('date', date_pickup::text, 'heure', '', 'prestataireId', coalesce(provenance_id, ''), 'notes', '')
 where date_pickup is not null
   and coalesce(prise_en_charge->>'date', '') = '';

-- 2. Les échanges — un aller chez un prestataire, et son retour.
--
--    Deux semis distinctes sont prévues : il arrive qu'une semi dépose et
--    qu'une autre récupère. Par défaut ce sont les mêmes, et l'écran ne
--    demande la seconde que si elle diffère.
create table if not exists echanges (
  id text primary key,
  tournee_id text,
  lot_id text,
  -- Semi qui dépose, puis semi qui récupère (souvent la même).
  vehicule_id text,
  vehicule_retour_id text,
  chauffeur_id text,
  prestataire_id text,
  -- 'total' : tout le kit repart. 'partiel' : seulement ce que nomme elements.
  portee text not null default 'partiel',
  elements text not null default '',
  -- panne | echange | complement | retour | autre
  motif text not null default 'panne',
  depot_date date, depot_heure text not null default '',
  recup_date date, recup_heure text not null default '',
  -- a_planifier | planifie | depose | recupere | clos
  etat text not null default 'a_planifier',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_echanges_tournee on echanges(tournee_id);
create index if not exists idx_echanges_lot on echanges(lot_id);
-- Le suivi trie sur l'état puis sur la date de dépôt : ce qui traîne d'abord.
create index if not exists idx_echanges_etat on echanges(etat, depot_date);

drop trigger if exists trg_echanges_updated_at on echanges;
create trigger trg_echanges_updated_at before update on echanges
  for each row execute function set_updated_at();

alter table echanges enable row level security;
-- Table de production : aucun lien public ne la lit, la clé anonyme n'y a rien.
drop policy if exists "echanges acces equipe" on echanges;
create policy "echanges acces equipe" on echanges for all to authenticated
  using (has_access()) with check (has_access());

-- 3. Reprise de l'ancien journal « mouvements » en échanges.
--
--    Chaque mouvement devient un échange à une seule jambe : une sortie donne
--    un dépôt, une entrée une récupération. On n'essaie PAS de les apparier
--    automatiquement — deviner que la console sortie le 12 est celle rentrée le
--    14 serait une invention, et une invention dans un suivi est pire que rien.
--    Les quelques cas à rapprocher se font à la main, une fois.
--
--    L'identifiant de l'échange dérive de celui du lot et du mouvement : rejouer
--    ce bloc ne crée pas de doublon.
insert into echanges (id, tournee_id, lot_id, vehicule_id, vehicule_retour_id,
                      prestataire_id, portee, elements, motif,
                      depot_date, depot_heure, recup_date, recup_heure, etat, notes)
select
  'repris-' || l.id || '-' || coalesce(mv->>'id', ord::text),
  l.tournee_id, l.id, l.vehicule_id, l.vehicule_id,
  l.provenance_id, 'partiel',
  coalesce(nullif(mv->>'description', ''), 'Repris de l''ancien journal'),
  'autre',
  case when mv->>'type' = 'sortie' then (mv->>'date')::date end,
  case when mv->>'type' = 'sortie' then coalesce(mv->>'heure', '') else '' end,
  case when mv->>'type' <> 'sortie' then (mv->>'date')::date end,
  case when mv->>'type' <> 'sortie' then coalesce(mv->>'heure', '') else '' end,
  case when mv->>'type' = 'sortie' then 'depose' else 'recupere' end,
  'Repris automatiquement de l''ancien journal des mouvements.'
from lots_materiel l,
     lateral jsonb_array_elements(coalesce(l.mouvements, '[]'::jsonb)) with ordinality as t(mv, ord)
where coalesce(mv->>'date', '') <> ''
on conflict (id) do nothing;


-- ============================================================================
-- Espace Devis (août 2026) — chiffrage des projets de production.
--
-- Trois tables + un réglage, toutes réservées aux comptes 'admin' : un devis
-- porte des salaires, des taux de charges et des marges — rien de tout cela ne
-- regarde les comptes 'user' ni, a fortiori, les pages à jeton.
--
-- Le devis entier (en-tête éditorial, sections, groupes, lignes, taux) vit
-- dans "data" en jsonb, comme les feuilles de route : c'est un document qu'on
-- édite d'un seul tenant, pas une collection qu'on requête ligne à ligne.
-- ============================================================================

-- Le carnet de clients (studios, salles, festivals, agences).
create table if not exists devis_clients (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_devis_clients_updated_at on devis_clients;
create trigger trg_devis_clients_updated_at before update on devis_clients
  for each row execute function set_updated_at();
alter table devis_clients enable row level security;
drop policy if exists "devis clients acces" on devis_clients;
create policy "devis clients acces" on devis_clients for all to authenticated
  using (is_admin()) with check (is_admin());

-- Les devis eux-mêmes. Un projet peut porter plusieurs variantes : elles
-- partagent data->>'projetId' et se comparent côte à côte.
create table if not exists devis (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_devis_updated_at on devis;
create trigger trg_devis_updated_at before update on devis
  for each row execute function set_updated_at();
alter table devis enable row level security;
drop policy if exists "devis acces" on devis;
create policy "devis acces" on devis for all to authenticated
  using (is_admin()) with check (is_admin());

-- La bibliothèque de postes réutilisables (« Ingé son 280 €/j », « Repas 20 € »).
create table if not exists devis_postes (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_devis_postes_updated_at on devis_postes;
create trigger trg_devis_postes_updated_at before update on devis_postes
  for each row execute function set_updated_at();
alter table devis_postes enable row level security;
drop policy if exists "devis postes acces" on devis_postes;
create policy "devis postes acces" on devis_postes for all to authenticated
  using (is_admin()) with check (is_admin());

-- L'identité de l'émetteur et les défauts (taux de charges, TVA, validité),
-- une seule ligne. Pré-remplie avec l'en-tête légal des Soudaines tel qu'il
-- figure sur les devis existants — modifiable depuis la page Devis.
create table if not exists devis_reglages (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_devis_reglages_updated_at on devis_reglages;
create trigger trg_devis_reglages_updated_at before update on devis_reglages
  for each row execute function set_updated_at();
alter table devis_reglages enable row level security;
drop policy if exists "devis reglages acces" on devis_reglages;
create policy "devis reglages acces" on devis_reglages for all to authenticated
  using (is_admin()) with check (is_admin());

insert into devis_reglages (id, data) values (1, jsonb_build_object(
  'nom', 'LES SOUDAINES',
  'siret', '938 916 244 00016',
  'adresse', '61 rue de Lyon 75012 Paris',
  'ape', 'Arts du spectacle vivant (90.01Z)',
  'tvaIntracom', 'FR82938916244',
  'representant', 'Représentée par Daniel SICARD, son président',
  'email', 'lessoudaines@gmail.com',
  'tel', '+33 6 08 18 43 90',
  'tauxAuteur', 4, 'tauxMusicien', 60, 'tauxProduction', 67,
  'tvaDefaut', 20, 'validiteJours', 30,
  'conditionsReglement', 'Acompte de 30 % à la commande, solde à livraison. Paiement à 30 jours. Pénalités de retard : taux BCE + 10 points ; indemnité forfaitaire de recouvrement : 40 €.'
)) on conflict (id) do nothing;


-- ============================================================================
-- Sauvegardes automatiques (août 2026)
--
-- Un bucket PRIVÉ où la tâche planifiée dépose chaque nuit un export JSON des
-- devis (voir api/sauvegarde-devis.js). Privé, contrairement au bucket des
-- fiches techniques : une sauvegarde contient les montants, les marges et les
-- coordonnées des clients — rien qui doive être lisible par une URL devinée.
--
-- L'écriture est faite par la clé service_role, qui ignore RLS : aucune policy
-- d'insertion n'est donc nécessaire. Seule la lecture est ouverte, et
-- uniquement aux comptes 'admin', pour que le tableau de bord puisse lister et
-- télécharger les archives.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('sauvegardes', 'sauvegardes', false)
on conflict (id) do update set public = false;

drop policy if exists "sauvegardes lecture admin" on storage.objects;
create policy "sauvegardes lecture admin" on storage.objects for select to authenticated
  using (bucket_id = 'sauvegardes' and is_admin());


-- ============================================================================
-- Recording en studio (août 2026)
--
-- Un enregistrement se planifie exactement comme une tournée : des dates, des
-- personnes affectées, des blocs, une feuille par jour. Seul le vocabulaire et
-- deux ou trois champs changent (studio au lieu de salle, séance au lieu de
-- mode de voyage). Créer un module parallèle aurait dupliqué les treize pages
-- qui lisent déjà « tournees » — dispos, récap, avancement technique, feuilles
-- de route, liens partagés. On distingue donc par une colonne, et tout le reste
-- continue de fonctionner sans le savoir.
--
-- 'tournee' par défaut : les projets existants ne bougent pas.
-- ============================================================================

alter table tournees add column if not exists type text not null default 'tournee'
  check (type in ('tournee','recording'));

-- Réglages propres à un recording, constants sur tout le projet (label,
-- direction artistique, format de livraison, dossier des masters). Même
-- principe que technique_tournee : ils ne changent pas d'une séance à l'autre,
-- on ne les recopie donc pas sur chaque date.
alter table tournees add column if not exists recording jsonb not null default '{}'::jsonb;


-- ============================================================================
-- Espace perso : dire de quelle nature est le projet (août 2026)
--
-- mes_demandes_dispo ne rendait que le nom de la tournée. Depuis l'arrivée des
-- recordings, une même personne peut avoir en attente une demande de tournée et
-- une demande de studio : sans la nature, les deux s'affichent à l'identique
-- dans son espace, avec la même icône de calendrier. On ajoute donc le type,
-- que mon-espace.html traduit en icône (un disque plutôt qu'un calendrier).
--
-- Seul le champ 'tourneeType' est nouveau : le reste de la fonction est
-- rigoureusement identique à sa version précédente.
-- ============================================================================

create or replace function mes_demandes_dispo(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cible record;
  resultat jsonb;
begin
  select * into cible from resolve_person_token(p_token);
  if not found or cible.person_id is null then
    return null;
  end if;

  select jsonb_build_object(
    'personId', cible.person_id,
    'personType', cible.person_type,
    'prenom', coalesce(
      (select m.prenom from musiciens m where m.id = cible.person_id and cible.person_type = 'musicien'),
      (select t.prenom from techniciens t where t.id = cible.person_id and cible.person_type = 'technicien'), ''),
    'nom', coalesce(
      (select m.nom from musiciens m where m.id = cible.person_id and cible.person_type = 'musicien'),
      (select t.nom from techniciens t where t.id = cible.person_id and cible.person_type = 'technicien'), ''),
    'statutPoste', coalesce(
      (select m.statut_poste from musiciens m where m.id = cible.person_id and cible.person_type = 'musicien'),
      'titulaire'),
    'demandes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'token', d.id,
               'tourneeNom', t.nom,
               'tourneeType', coalesce(t.type, 'tournee'),
               'repondu', d.last_responded_at is not null,
               'creeLe', d.created_at)
             order by d.created_at desc)
      from dispo_demandes d
      join tournees t on t.id = d.tournee_id
      where d.person_id = cible.person_id and d.person_type = cible.person_type
    ), '[]'::jsonb)
  ) into resultat;

  return resultat;
end;
$$;
grant execute on function mes_demandes_dispo(text) to anon, authenticated;
