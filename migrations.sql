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
create policy "self read own admin row" on infos_sociales_admins
  for select using (email = auth.jwt()->>'email');

drop policy if exists "admins only" on infos_sociales;
create policy "admins only" on infos_sociales
  for all
  using (exists (select 1 from infos_sociales_admins a where a.email = auth.jwt()->>'email'))
  with check (exists (select 1 from infos_sociales_admins a where a.email = auth.jwt()->>'email'));

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
