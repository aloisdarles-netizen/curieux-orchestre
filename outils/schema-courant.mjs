/* ============================================================================
   La carte du schéma, produite depuis la base plutôt qu'écrite à la main
   ============================================================================
   SUPABASE_SCHEMA.md et DATA_STRUCTURE.md ont été écrits une fois, justes ce
   jour-là, et ont cessé de l'être : ils annoncent un accès public sans compte
   et six tables, quand la base a désormais des rôles, des fonctions
   `security definer`, des jetons personnels et un journal d'audit. Une carte
   fausse est pire qu'une carte absente — on décide en la croyant.

   Ce script ne migre rien, il regarde et il écrit. Il produit la partie
   « ce qui EST » de la documentation : tables et colonnes réelles, policies
   effectives, tables réellement publiées en temps réel, fonctions en vigueur.
   Le « pourquoi » — les intentions écrites en français, qui sont une vraie
   qualité de ce dépôt — reste à la main : ce fichier ne touche jamais aux
   sections rédigées, il remplace uniquement le bloc encadré par les balises
   ci-dessous.

   Usage :
     SUPABASE_DB_URL='postgresql://…' node outils/schema-courant.mjs
     SUPABASE_DB_URL='postgresql://…' node outils/schema-courant.mjs --verifier

   L'URL de connexion directe se trouve dans Supabase → Project Settings →
   Database → Connection string (URI). Ce n'est PAS la clé publishable de
   assets/db.js : celle-ci ne peut pas lire les catalogues système, et c'est
   très bien ainsi.

   --verifier ne réécrit rien et sort en code 1 si la documentation ne
   correspond plus à la base : de quoi le passer en vérification automatique
   après chaque strate ajoutée à migrations.sql.
============================================================================ */

import { readFileSync, writeFileSync } from 'node:fs';

const DEBUT = '<!-- SCHEMA-COURANT:DEBUT -->';
const FIN = '<!-- SCHEMA-COURANT:FIN -->';
const CIBLE = new URL('../SUPABASE_SCHEMA.md', import.meta.url).pathname;

const verifier = process.argv.includes('--verifier');
const url = process.env.SUPABASE_DB_URL;
if(!url){
  console.error("SUPABASE_DB_URL manquante.\n"
    + "  Supabase → Project Settings → Database → Connection string (URI).\n"
    + "  Ce n'est pas la clé publishable de assets/db.js : celle-ci ne lit pas les catalogues.");
  process.exit(2);
}

/* postgres n'est pas dans les dépendances du projet — l'app est statique et
   n'a pas besoin d'un pilote SQL. On le charge donc à la demande, avec un
   message qui dit quoi faire plutôt qu'une pile d'appels. */
let postgres;
try{
  ({ default: postgres } = await import('postgres'));
}catch(e){
  console.error("Le pilote « postgres » n'est pas installé.\n"
    + '  npm i postgres --no-save     (comme playwright-core pour les captures)');
  process.exit(2);
}

const sql = postgres(url, { ssl: 'require', max: 1 });

// --- Ce qu'on va lire -------------------------------------------------------

const tables = await sql`
  select c.relname as table,
         obj_description(c.oid) as commentaire
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
   order by c.relname`;

const colonnes = await sql`
  select c.table_name as table, c.column_name as colonne, c.data_type as type,
         c.is_nullable = 'YES' as nullable, c.column_default as defaut,
         col_description(format('public.%I', c.table_name)::regclass::oid, c.ordinal_position) as commentaire
    from information_schema.columns c
   where c.table_schema = 'public'
   order by c.table_name, c.ordinal_position`;

const policies = await sql`
  select tablename as table, policyname as nom, cmd as commande,
         roles::text as roles, qual as lecture, with_check as ecriture
    from pg_policies
   where schemaname = 'public'
   order by tablename, policyname`;

const rls = await sql`
  select c.relname as table, c.relrowsecurity as active
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
   order by c.relname`;

const realtime = await sql`
  select tablename as table
    from pg_publication_tables
   where pubname = 'supabase_realtime' and schemaname = 'public'
   order by tablename`;

const fonctions = await sql`
  select p.proname as nom,
         pg_get_function_identity_arguments(p.oid) as arguments,
         t.typname as retour,
         p.prosecdef as security_definer
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_type t on t.oid = p.prorettype
   where n.nspname = 'public'
   order by p.proname`;

const index = await sql`
  select tablename as table, indexname as nom, indexdef as definition
    from pg_indexes
   where schemaname = 'public'
   order by tablename, indexname`;

await sql.end();

// --- Ce qu'on en écrit ------------------------------------------------------

const parTable = (liste)=> liste.reduce((acc, l)=>{
  (acc[l.table] = acc[l.table] || []).push(l);
  return acc;
}, {});

const colParTable = parTable(colonnes);
const polParTable = parTable(policies);
const idxParTable = parTable(index);
const rlsParTable = Object.fromEntries(rls.map(r=> [r.table, r.active]));
const publiees = new Set(realtime.map(r=> r.table));

const lignes = [];
lignes.push('## Le schéma tel qu\'il est');
lignes.push('');
lignes.push('*Cette section est produite par `outils/schema-courant.mjs` — ne pas la corriger');
lignes.push('à la main, elle serait écrasée. Pour changer ce qu\'elle dit, changer la base.*');
lignes.push('');
lignes.push(`${tables.length} tables, ${fonctions.length} fonctions, ${publiees.size} tables publiées en temps réel.`);
lignes.push('');

for(const t of tables){
  lignes.push(`### \`${t.table}\``);
  if(t.commentaire) lignes.push(`${t.commentaire}`);
  lignes.push('');
  const secu = [];
  secu.push(rlsParTable[t.table] ? 'RLS activée' : '**RLS désactivée**');
  secu.push(publiees.has(t.table) ? 'temps réel publié' : 'pas de temps réel');
  lignes.push(`*${secu.join(' · ')}*`);
  lignes.push('');
  lignes.push('| Colonne | Type | Null | Défaut |');
  lignes.push('|---|---|---|---|');
  for(const c of (colParTable[t.table] || [])){
    lignes.push(`| \`${c.colonne}\` | ${c.type} | ${c.nullable ? 'oui' : 'non'} | ${c.defaut ? '`' + String(c.defaut).slice(0, 40) + '`' : '—'} |`);
  }
  lignes.push('');
  const pol = polParTable[t.table] || [];
  if(pol.length){
    lignes.push('Policies :');
    for(const p of pol){
      lignes.push(`- \`${p.nom}\` (${p.commande}, ${p.roles})${p.lecture ? ' — lecture : `' + p.lecture + '`' : ''}${p.ecriture ? ' — écriture : `' + p.ecriture + '`' : ''}`);
    }
    lignes.push('');
  }
  // Les index qui ne sont pas la clé primaire : eux seuls apprennent quelque
  // chose sur les requêtes qu'on a voulu rendre rapides.
  const idx = (idxParTable[t.table] || []).filter(i=> !/_pkey$/.test(i.nom));
  if(idx.length){
    lignes.push('Index :');
    for(const i of idx) lignes.push(`- \`${i.nom}\``);
    lignes.push('');
  }
}

lignes.push('### Fonctions');
lignes.push('');
lignes.push('| Fonction | Arguments | Retour | Droits |');
lignes.push('|---|---|---|---|');
for(const f of fonctions){
  lignes.push(`| \`${f.nom}\` | ${f.arguments ? '`' + f.arguments + '`' : '—'} | ${f.retour} | ${f.security_definer ? '**security definer**' : 'invoker'} |`);
}
lignes.push('');
lignes.push('Une fonction `security definer` s\'exécute avec les droits de son propriétaire :');
lignes.push('c\'est par elle que passe tout ce qu\'un lien à jeton peut faire sans compte.');
lignes.push('Chacune est donc une porte, et mérite d\'être relue comme telle.');

const bloc = `${DEBUT}\n\n${lignes.join('\n')}\n\n${FIN}`;

const actuel = readFileSync(CIBLE, 'utf8');
const iDebut = actuel.indexOf(DEBUT);
const iFin = actuel.indexOf(FIN);
const neuf = (iDebut !== -1 && iFin !== -1)
  ? actuel.slice(0, iDebut) + bloc + actuel.slice(iFin + FIN.length)
  : actuel.trimEnd() + '\n\n' + bloc + '\n';

if(verifier){
  if(neuf === actuel){
    console.log('La carte du schéma est à jour.');
    process.exit(0);
  }
  console.error('SUPABASE_SCHEMA.md ne correspond plus à la base.\n'
    + '  Relancer sans --verifier pour la régénérer.');
  process.exit(1);
}

writeFileSync(CIBLE, neuf);
console.log(`SUPABASE_SCHEMA.md régénéré — ${tables.length} tables, ${fonctions.length} fonctions.`);
