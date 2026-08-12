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
-- consulter/modifier infos_sociales. Ajouter une ligne (email) donne accès, en
-- retirer une le retire — c'est le SEUL endroit où gérer les autorisations,
-- directement en SQL. Pas de lecture complète exposée côté app : chaque compte
-- ne peut lire QUE sa propre ligne (juste assez pour la policy ci-dessous, qui a
-- seulement besoin de vérifier l'existence, pas de lister les autres comptes).
-- ----------------------------------------------------------------------------
create table if not exists infos_sociales_admins (
  email text primary key
);
insert into infos_sociales_admins (email) values ('alois.darles@lessoudaines.fr')
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
  date_naissance date,
  lieu_naissance text default '',
  nationalite text default '',
  adresse text default '',
  num_secu text default '',
  iban text default '',
  bic text default '',
  titulaire_compte text default '',
  num_objet_employeur text default '',
  num_aem text default '',
  num_audiens text default '',
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
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
create policy "self read own admin row" on infos_sociales_admins
  for select using (email = auth.jwt()->>'email');

drop policy if exists "admins only" on infos_sociales;
create policy "admins only" on infos_sociales
  for all
  using (exists (select 1 from infos_sociales_admins a where a.email = auth.jwt()->>'email'))
  with check (exists (select 1 from infos_sociales_admins a where a.email = auth.jwt()->>'email'));

-- ============================================================================
-- RLS : accès public en lecture/écriture (pas de compte utilisateur).
-- infos_sociales / infos_sociales_admins font exception (voir plus haut) : ce
-- sont les deux seules tables où l'accès est restreint à des comptes Auth.
-- ============================================================================
alter table musiciens enable row level security;
alter table techniciens enable row level security;
alter table tournees enable row level security;
alter table feuilles_route enable row level security;
alter table carnet_contacts enable row level security;
alter table newsletter_snapshot enable row level security;
alter table dispo_demandes enable row level security;

drop policy if exists "public full access" on musiciens;
create policy "public full access" on musiciens for all using (true) with check (true);

drop policy if exists "public full access" on techniciens;
create policy "public full access" on techniciens for all using (true) with check (true);

drop policy if exists "public full access" on tournees;
create policy "public full access" on tournees for all using (true) with check (true);

drop policy if exists "public full access" on feuilles_route;
create policy "public full access" on feuilles_route for all using (true) with check (true);

drop policy if exists "public full access" on carnet_contacts;
create policy "public full access" on carnet_contacts for all using (true) with check (true);

drop policy if exists "public full access" on newsletter_snapshot;
create policy "public full access" on newsletter_snapshot for all using (true) with check (true);

drop policy if exists "public full access" on dispo_demandes;
create policy "public full access" on dispo_demandes for all using (true) with check (true);

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
