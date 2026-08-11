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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Rang de priorité des remplaçant·es (1 = à contacter en premier) : ajouté après la
-- création initiale de la table, donc "add column if not exists" pour une base déjà
-- provisionnée (le "create table if not exists" ci-dessus ne touche pas une table existante).
alter table musiciens add column if not exists rang integer;
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
  telephone text default '',
  email text default '',
  notes text default '',
  disponibilites jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
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

-- ============================================================================
-- RLS : accès public en lecture/écriture (pas de compte utilisateur).
-- ============================================================================
alter table musiciens enable row level security;
alter table techniciens enable row level security;
alter table tournees enable row level security;
alter table feuilles_route enable row level security;
alter table carnet_contacts enable row level security;
alter table newsletter_snapshot enable row level security;

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

-- ============================================================================
-- Realtime : ajoute les tables à la publication utilisée par le Realtime
-- de Supabase, pour que les changements se propagent instantanément.
-- ============================================================================
alter publication supabase_realtime add table musiciens;
alter publication supabase_realtime add table techniciens;
alter publication supabase_realtime add table tournees;
alter publication supabase_realtime add table feuilles_route;
alter publication supabase_realtime add table carnet_contacts;
alter publication supabase_realtime add table newsletter_snapshot;

-- Replica identity FULL : permet à Realtime d'envoyer l'ancienne ET la nouvelle
-- ligne sur UPDATE/DELETE (utile pour reconstruire l'état côté client).
alter table musiciens replica identity full;
alter table techniciens replica identity full;
alter table tournees replica identity full;
alter table feuilles_route replica identity full;
alter table carnet_contacts replica identity full;
alter table newsletter_snapshot replica identity full;
