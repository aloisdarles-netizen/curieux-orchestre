-- ============================================================================
-- Jeu de démonstration « Refonte Curieux » — musicien·nes, technicien·nes,
-- véhicules et chauffeurs repris de la maquette.
--
-- À COLLER DANS L'ÉDITEUR SQL DE SUPABASE (Dashboard → SQL Editor), pas à
-- exécuter depuis l'app : les policies RLS réservent l'écriture aux comptes
-- has_access(), et la clé anon du site ne peut ni lire ni écrire ces tables.
--
-- Le script tient en deux blocs, à exécuter dans l'ordre — ou d'un seul coup,
-- l'éditeur SQL accepte les deux transactions à la suite :
--   1. les personnes, véhicules et chauffeurs (ci-dessous) ;
--   2. les tournées, dates et disponibilités (en fin de fichier), qui
--      référencent les identifiants du premier.
-- Sans le second bloc, Tournées, Vue d'ensemble, Disponibilités et Feuilles de
-- route restent vides : ce sont les dates qui les alimentent.
--
-- ⚠ CE SCRIPT EFFACE L'INTÉGRALITÉ des quatre tables avant de réinsérer.
--   Demandé explicitement (base encore en développement). Irréversible.
--   Les feuilles de route et fiches techniques ne sont PAS touchées — mais
--   elles référencent des identifiants de personnes qui vont disparaître :
--   prévois de les repeupler ou de les vider aussi.
--
-- Chaque bloc est enveloppé dans une transaction : en cas d'erreur, rien n'est
-- écrit.
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
  -- Pupitre « Piano » et non « Autre ». La maquette se contredit sur ce point :
  -- sa fonction de pupitre range le piano dans « Autre », mais sa nomenclature
  -- attend bien une ligne « Piano ». Suivre la première laisserait un manque
  -- permanent de 0/1 au piano et une personne hors nomenclature.
  ('demo-mus-13', 'Orane', 'Donnadieu', 'Piano', 'Piano', 'titulaire', null, '06 24 43 64 82', 'orane.donnadieu@mail.com'),
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
-- La maquette donne un permis par chauffeur (SPL, SPL, VL), mais la colonne
-- n'existe plus : migrations.sql la retire (« le permis ne sert pas ») après
-- l'avoir créée. Le create table plus haut dans ce même fichier la montre
-- encore — c'est un journal cumulatif, seul le dernier état fait foi.
-- L'information est reportée en notes pour ne pas la perdre.
insert into chauffeurs (id, prenom, nom, telephone, email, notes) values
  ('demo-chauf-01', 'Karim', 'Haddad', '06 42 61 82 100', 'karim.haddad@mail.com', 'Permis SPL'),
  ('demo-chauf-02', 'Paul', 'Renault', '06 43 62 83 101', 'paul.renault@mail.com', 'Permis SPL'),
  ('demo-chauf-03', 'Nadia', 'Benali', '06 44 63 84 102', 'nadia.benali@mail.com', 'Permis VL');

commit;

-- Contrôle après exécution :
--   select 'musiciens' t, count(*) from musiciens
--   union all select 'techniciens', count(*) from techniciens
--   union all select 'vehicules', count(*) from vehicules
--   union all select 'chauffeurs', count(*) from chauffeurs;
-- Attendu : 16 / 4 / 3 / 3.


-- ============================================================================
-- Tournées, dates et disponibilités de la maquette
--
-- Sans ce bloc, les écrans Tournées, Vue d'ensemble, Disponibilités et Feuilles
-- de route restent vides même une fois les personnes créées : ce sont les dates
-- qui les alimentent.
--
-- À exécuter APRÈS le bloc ci-dessus (les dates référencent demo-mus-* et
-- demo-tech-*). Les identifiants sont stables et préfixés « demo- », donc un
-- delete ... like 'demo-%' suffit à tout retirer plus tard.
-- ============================================================================

begin;

delete from tournees where id like 'demo-%';

insert into tournees (id, nom, cachet_statut, cachet_montant, dates) values
  ('demo-tour1', 'L''Atelier de Joe Hisaishi — Printemps 2027', 'defini', 320, '[{"id": "demo-tour1-d01", "date": "2027-01-22", "ville": "Paris", "lieu": "Studio Ferber — répétitions", "commentaire": "Amener les conducteurs v2", "statut": "validee", "musiciensAssignes": ["demo-mus-01", "demo-mus-02", "demo-mus-03", "demo-mus-04", "demo-mus-05", "demo-mus-06", "demo-mus-07", "demo-mus-08", "demo-mus-09", "demo-mus-10", "demo-mus-11", "demo-mus-12", "demo-mus-13", "demo-mus-14"], "techniciensAssignes": ["demo-tech-01", "demo-tech-02"], "linkedToNext": false, "nomenclature": [{"pupitre": "Chef", "nombre": 1}, {"pupitre": "Cordes", "nombre": 5}, {"pupitre": "Bois", "nombre": 4}, {"pupitre": "Cuivres", "nombre": 2}, {"pupitre": "Percussions", "nombre": 1}, {"pupitre": "Piano", "nombre": 1}]}, {"id": "demo-tour1-d02", "date": "2027-01-25", "ville": "Paris", "lieu": "Studio Ferber — répétitions", "commentaire": "", "statut": "validee", "musiciensAssignes": ["demo-mus-01", "demo-mus-02", "demo-mus-03", "demo-mus-04", "demo-mus-05", "demo-mus-06", "demo-mus-07", "demo-mus-08", "demo-mus-09", "demo-mus-10", "demo-mus-11", "demo-mus-12", "demo-mus-13", "demo-mus-14"], "techniciensAssignes": ["demo-tech-01", "demo-tech-02"], "linkedToNext": false}, {"id": "demo-tour1-d03", "date": "2027-03-12", "ville": "Lyon", "lieu": "Salle 3000", "commentaire": "", "statut": "validee", "musiciensAssignes": ["demo-mus-01", "demo-mus-02", "demo-mus-03", "demo-mus-04", "demo-mus-05", "demo-mus-06", "demo-mus-07", "demo-mus-08", "demo-mus-09", "demo-mus-10", "demo-mus-11", "demo-mus-12", "demo-mus-13", "demo-mus-14"], "techniciensAssignes": ["demo-tech-01", "demo-tech-02", "demo-tech-03", "demo-tech-04"], "linkedToNext": true}, {"id": "demo-tour1-d04", "date": "2027-03-13", "ville": "Grenoble", "lieu": "Le Summum", "commentaire": "", "statut": "validee", "musiciensAssignes": ["demo-mus-01", "demo-mus-02", "demo-mus-03", "demo-mus-04", "demo-mus-05", "demo-mus-06", "demo-mus-07", "demo-mus-08", "demo-mus-09", "demo-mus-10", "demo-mus-11", "demo-mus-12", "demo-mus-13", "demo-mus-14"], "techniciensAssignes": ["demo-tech-01", "demo-tech-02", "demo-tech-03", "demo-tech-04"], "linkedToNext": false}, {"id": "demo-tour1-d05", "date": "2027-03-15", "ville": "Marseille", "lieu": "Le Dôme", "commentaire": "", "statut": "option", "musiciensAssignes": ["demo-mus-01", "demo-mus-02", "demo-mus-03", "demo-mus-04", "demo-mus-05", "demo-mus-06", "demo-mus-07", "demo-mus-08", "demo-mus-09", "demo-mus-10", "demo-mus-11", "demo-mus-12"], "techniciensAssignes": ["demo-tech-01", "demo-tech-02", "demo-tech-03"], "linkedToNext": false}, {"id": "demo-tour1-d06", "date": "2027-03-18", "ville": "Toulouse", "lieu": "Zénith", "commentaire": "Relancer le Zénith avant le 20 févr.", "statut": "option", "musiciensAssignes": [], "techniciensAssignes": [], "linkedToNext": false}, {"id": "demo-tour1-d07", "date": "2027-03-19", "ville": "Bordeaux", "lieu": "Arkéa Arena", "commentaire": "", "statut": "validee", "musiciensAssignes": ["demo-mus-01", "demo-mus-02", "demo-mus-03", "demo-mus-04", "demo-mus-05", "demo-mus-06", "demo-mus-07", "demo-mus-08", "demo-mus-09", "demo-mus-10", "demo-mus-11", "demo-mus-12", "demo-mus-13", "demo-mus-14"], "techniciensAssignes": ["demo-tech-01", "demo-tech-02", "demo-tech-03", "demo-tech-04"], "linkedToNext": false}, {"id": "demo-tour1-d08", "date": "2027-03-22", "ville": "Paris", "lieu": "Le Grand Rex", "commentaire": "", "statut": "validee", "musiciensAssignes": ["demo-mus-01", "demo-mus-02", "demo-mus-03", "demo-mus-04", "demo-mus-05", "demo-mus-06", "demo-mus-07", "demo-mus-08", "demo-mus-09", "demo-mus-10", "demo-mus-11", "demo-mus-12", "demo-mus-13", "demo-mus-14"], "techniciensAssignes": ["demo-tech-01", "demo-tech-02", "demo-tech-03", "demo-tech-04"], "linkedToNext": false}]'::jsonb),
  ('demo-tour2', 'La Curieuse Soirée 2027', 'non_defini', null, '[{"id": "demo-tour2-d01", "date": "2027-02-06", "ville": "Paris", "lieu": "Studio Twitch", "commentaire": "Marathon caritatif diffusé en direct", "statut": "validee", "musiciensAssignes": ["demo-mus-01", "demo-mus-02", "demo-mus-03", "demo-mus-04", "demo-mus-05", "demo-mus-06", "demo-mus-07", "demo-mus-08", "demo-mus-09", "demo-mus-10", "demo-mus-11", "demo-mus-12", "demo-mus-13", "demo-mus-14"], "techniciensAssignes": ["demo-tech-01", "demo-tech-02"], "linkedToNext": false, "nomenclature": [{"pupitre": "Chef", "nombre": 1}, {"pupitre": "Cordes", "nombre": 5}, {"pupitre": "Bois", "nombre": 4}, {"pupitre": "Cuivres", "nombre": 2}, {"pupitre": "Percussions", "nombre": 1}, {"pupitre": "Piano", "nombre": 1}]}]'::jsonb);

-- Disponibilités déclarées, posées sur les fiches existantes.
update musiciens set disponibilites = case id
  when 'demo-mus-01' then '{"2027-01-22": "dispo", "2027-01-25": "dispo", "2027-03-12": "dispo", "2027-03-13": "dispo", "2027-03-15": "dispo", "2027-03-18": "dispo", "2027-03-19": "dispo", "2027-03-22": "dispo", "2027-02-06": "dispo"}'::jsonb
  when 'demo-mus-02' then '{"2027-01-22": "dispo", "2027-01-25": "dispo", "2027-03-12": "dispo", "2027-03-13": "dispo", "2027-03-15": "dispo", "2027-03-18": "dispo", "2027-03-19": "dispo", "2027-03-22": "dispo", "2027-02-06": "dispo"}'::jsonb
  when 'demo-mus-03' then '{"2027-01-22": "dispo", "2027-01-25": "dispo", "2027-03-12": "dispo", "2027-03-13": "dispo", "2027-03-15": "dispo", "2027-03-18": "dispo", "2027-03-19": "dispo", "2027-03-22": "dispo", "2027-02-06": "indispo"}'::jsonb
  when 'demo-mus-04' then '{"2027-01-22": "dispo", "2027-01-25": "dispo", "2027-03-12": "dispo", "2027-03-13": "dispo", "2027-03-15": "dispo", "2027-03-18": "dispo", "2027-03-19": "dispo", "2027-03-22": "dispo", "2027-02-06": "dispo"}'::jsonb
  when 'demo-mus-05' then '{"2027-01-22": "dispo", "2027-01-25": "dispo", "2027-03-12": "dispo", "2027-03-13": "dispo", "2027-03-15": "indispo", "2027-03-18": "dispo", "2027-03-19": "dispo", "2027-03-22": "dispo", "2027-02-06": "dispo"}'::jsonb
  when 'demo-mus-06' then '{"2027-01-22": "dispo", "2027-01-25": "dispo", "2027-03-12": "dispo", "2027-03-13": "dispo", "2027-03-15": "dispo", "2027-03-18": "dispo", "2027-03-19": "dispo", "2027-03-22": "dispo", "2027-02-06": "dispo"}'::jsonb
  when 'demo-mus-07' then '{"2027-01-22": "dispo", "2027-01-25": "dispo", "2027-03-12": "dispo", "2027-03-13": "dispo", "2027-03-15": "dispo", "2027-03-18": "incertain", "2027-03-19": "dispo", "2027-03-22": "dispo", "2027-02-06": "dispo"}'::jsonb
  when 'demo-mus-08' then '{"2027-01-22": "dispo", "2027-01-25": "dispo", "2027-03-12": "dispo", "2027-03-13": "indispo", "2027-03-15": "dispo", "2027-03-18": "dispo", "2027-03-19": "dispo", "2027-03-22": "dispo", "2027-02-06": "dispo"}'::jsonb
  when 'demo-mus-09' then '{"2027-01-22": "dispo", "2027-01-25": "dispo", "2027-03-12": "dispo", "2027-03-13": "dispo", "2027-03-15": "dispo", "2027-03-18": "dispo", "2027-03-19": "dispo", "2027-03-22": "dispo", "2027-02-06": "dispo"}'::jsonb
  when 'demo-mus-10' then '{"2027-01-22": "dispo", "2027-01-25": "dispo", "2027-03-12": "dispo", "2027-03-13": "dispo", "2027-03-15": "dispo", "2027-03-18": "dispo", "2027-03-19": "dispo", "2027-03-22": "dispo", "2027-02-06": "dispo"}'::jsonb
  when 'demo-mus-11' then '{"2027-01-22": "dispo", "2027-01-25": "dispo", "2027-03-12": "dispo", "2027-03-13": "dispo", "2027-03-15": "indispo", "2027-03-18": "dispo", "2027-03-19": "dispo", "2027-03-22": "dispo", "2027-02-06": "dispo"}'::jsonb
  when 'demo-mus-12' then '{"2027-01-22": "dispo", "2027-01-25": "dispo", "2027-03-12": "dispo", "2027-03-13": "dispo", "2027-03-15": "dispo", "2027-03-18": "incertain", "2027-03-19": "dispo", "2027-03-22": "dispo", "2027-02-06": "dispo"}'::jsonb
  when 'demo-mus-13' then '{"2027-01-22": "dispo", "2027-01-25": "dispo", "2027-03-12": "dispo", "2027-03-13": "dispo", "2027-03-15": "dispo", "2027-03-18": "dispo", "2027-03-19": "dispo", "2027-03-22": "dispo", "2027-02-06": "dispo"}'::jsonb
  when 'demo-mus-14' then '{"2027-01-22": "dispo", "2027-01-25": "dispo", "2027-03-12": "dispo", "2027-03-13": "dispo", "2027-03-15": "dispo", "2027-03-18": "dispo", "2027-03-19": "dispo", "2027-03-22": "dispo", "2027-02-06": "dispo"}'::jsonb
  when 'demo-mus-15' then '{"2027-03-13": "dispo", "2027-03-15": "dispo"}'::jsonb
  when 'demo-mus-16' then '{"2027-03-13": "dispo", "2027-03-15": "dispo"}'::jsonb
  else disponibilites end
where id like 'demo-mus-%';

commit;

-- Contrôle :
--   select nom, jsonb_array_length(dates) as dates from tournees where id like 'demo-%';
-- Attendu : 8 dates pour l'Atelier, 1 pour la Curieuse Soirée.
