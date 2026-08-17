-- ============================================================================
-- Jeu de démonstration « Refonte Curieux » — musicien·nes, technicien·nes,
-- véhicules et chauffeurs repris de la maquette.
--
-- À COLLER DANS L'ÉDITEUR SQL DE SUPABASE (Dashboard → SQL Editor), pas à
-- exécuter depuis l'app : les policies RLS réservent l'écriture aux comptes
-- has_access(), et la clé anon du site ne peut ni lire ni écrire ces tables.
--
-- ⚠ CE SCRIPT EFFACE L'INTÉGRALITÉ des quatre tables avant de réinsérer.
--   Demandé explicitement (base encore en développement). Irréversible.
--   Les tournées, feuilles de route, dispos et fiches techniques ne sont PAS
--   touchées — mais elles référencent des identifiants de personnes qui vont
--   disparaître : prévois de les repeupler ou de les vider aussi.
--
-- Tout est enveloppé dans une transaction : en cas d'erreur, rien n'est écrit.
-- ============================================================================

begin;

delete from musiciens;
delete from techniciens;
delete from vehicules;
delete from chauffeurs;

-- --- Musicien·nes (14 titulaires + 2 remplaçant·es) ------------------------
insert into musiciens (id, prenom, nom, instrument, pupitre, statut_poste, rang, telephone, email) values
  ('demo-mus-01', 'Roxanne', 'Rabatti', 'Violon solo', 'Cordes', 'titulaire', null, '06 12 31 52 70', 'roxanne.rabatti@mail.com'),
  ('demo-mus-02', 'Mariane', 'Minjou', 'Violon', 'Cordes', 'titulaire', null, '06 13 32 53 71', 'mariane.minjou@mail.com'),
  ('demo-mus-03', 'Pierre-Pascal', 'Jean', 'Alto', 'Cordes', 'titulaire', null, '06 14 33 54 72', 'pierrepascal.jean@mail.com'),
  ('demo-mus-04', 'Marwane', 'Champ', 'Violoncelle', 'Cordes', 'titulaire', null, '06 15 34 55 73', 'marwane.champ@mail.com'),
  ('demo-mus-05', 'Paul-Marie', 'Kuzma', 'Violoncelle', 'Cordes', 'titulaire', null, '06 16 35 56 74', 'paulmarie.kuzma@mail.com'),
  ('demo-mus-06', 'Christelle', 'Raquillet', 'Flûte', 'Bois', 'titulaire', null, '06 17 36 57 75', 'christelle.raquillet@mail.com'),
  ('demo-mus-07', 'Coralie', 'Menuge', 'Hautbois', 'Bois', 'titulaire', null, '06 18 37 58 76', 'coralie.menuge@mail.com'),
  ('demo-mus-08', 'Yann', 'Pannecoucke', 'Clarinette', 'Bois', 'titulaire', null, '06 19 38 59 77', 'yann.pannecoucke@mail.com'),
  ('demo-mus-09', 'Nil', 'Loiseau', 'Basson', 'Bois', 'titulaire', null, '06 20 39 60 78', 'nil.loiseau@mail.com'),
  ('demo-mus-10', 'Elodie', 'Baert', 'Cor', 'Cuivres', 'titulaire', null, '06 21 40 61 79', 'elodie.baert@mail.com'),
  ('demo-mus-11', 'Tom', 'Caudelle', 'Saxhorn', 'Cuivres', 'titulaire', null, '06 22 41 62 80', 'tom.caudelle@mail.com'),
  ('demo-mus-12', 'Theo', 'Lamperier', 'Percussions', 'Percussions', 'titulaire', null, '06 23 42 63 81', 'theo.lamperier@mail.com'),
  ('demo-mus-13', 'Orane', 'Donnadieu', 'Piano', 'Autre', 'titulaire', null, '06 24 43 64 82', 'orane.donnadieu@mail.com'),
  ('demo-mus-14', 'Daniel', 'Sicard', 'Chef d''orchestre', 'Chef', 'titulaire', null, '06 25 44 65 83', 'daniel.sicard@mail.com'),
  ('demo-mus-15', 'Camille', 'Durand', 'Violon', 'Cordes', 'remplacant', 1, '06 26 45 66 84', 'camille.durand@mail.com'),
  ('demo-mus-16', 'Jules', 'Moreau', 'Violoncelle', 'Cordes', 'remplacant', 2, '06 27 46 67 85', 'jules.moreau@mail.com');

-- --- Technicien·nes --------------------------------------------------------
insert into techniciens (id, prenom, nom, poste, pole, statut_poste, telephone, email) values
  ('demo-tech-01', 'Marie', 'Dupont', 'Ingé son façade', 'Son', 'titulaire', '06 32 51 72 90', 'marie.dupont@mail.com'),
  ('demo-tech-02', 'Léo', 'Bernard', 'Ingé lumière', 'Lumière', 'titulaire', '06 33 52 73 91', 'leo.bernard@mail.com'),
  ('demo-tech-03', 'Sacha', 'Petit', 'Régie générale', 'Régie générale', 'titulaire', '06 34 53 74 92', 'sacha.petit@mail.com'),
  ('demo-tech-04', 'Anna', 'Costa', 'Backline', 'Backline', 'titulaire', '06 35 54 75 93', 'anna.costa@mail.com');

-- --- Véhicules -------------------------------------------------------------
insert into vehicules (id, nom, type, immatriculation, hayon) values
  ('demo-veh-01', 'Semi 1', 'semi', 'AB-123-CD', true),
  ('demo-veh-02', 'Semi 2', 'semi', 'EF-456-GH', true),
  ('demo-veh-03', 'Sprinter', 'camion', 'IJ-789-KL', false);

-- --- Chauffeurs ------------------------------------------------------------
insert into chauffeurs (id, prenom, nom, permis, telephone, email) values
  ('demo-chauf-01', 'Karim', 'Haddad', 'SPL', '06 42 61 82 100', 'karim.haddad@mail.com'),
  ('demo-chauf-02', 'Paul', 'Renault', 'SPL', '06 43 62 83 101', 'paul.renault@mail.com'),
  ('demo-chauf-03', 'Nadia', 'Benali', 'VL', '06 44 63 84 102', 'nadia.benali@mail.com');

commit;

-- Contrôle après exécution :
--   select 'musiciens' t, count(*) from musiciens
--   union all select 'techniciens', count(*) from techniciens
--   union all select 'vehicules', count(*) from vehicules
--   union all select 'chauffeurs', count(*) from chauffeurs;
-- Attendu : 16 / 4 / 3 / 3.
