# Registre des traitements — Curieux orchestre

Registre des activités de traitement tenu en application de l'article 30 du
RGPD. Document interne, à jour à la date indiquée en bas de page, à revoir à
chaque évolution significative de l'outil (nouvelle donnée collectée,
nouveau sous-traitant, nouvelle finalité).

## Responsable de traitement

**Les Soudaines**, société par actions simplifiée (SAS)
Siège social : 61 rue de Lyon, 75012 Paris
SIREN : 938 916 244 — SIRET (siège) : 938 916 244 00016

Personne à contacter pour toute question relative aux données personnelles :
Aloïs Darles, directeur général — alois.darles@lessoudaines.fr

Aucun délégué à la protection des données (DPO) désigné : non obligatoire au
vu du volume et de la nature des traitements (pas de traitement à grande
échelle, pas de suivi systématique, pas de données sensibles traitées en
masse).

## Sous-traitants (Art. 28 RGPD)

| Sous-traitant | Rôle | Données concernées | Localisation |
|---|---|---|---|
| Supabase Inc. | Hébergement de la base de données, authentification, envoi des emails de connexion (lien magique, invitation) | Toutes les données de l'outil | Union européenne — région `eu-west-3` (Paris) |
| Vercel Inc. | Hébergement des pages du site (fichiers statiques HTML/JS) | Aucune donnée personnelle stockée côté Vercel ; les pages appellent directement Supabase depuis le navigateur | États-Unis |

Vercel n'héberge aucune donnée personnelle en base — il sert uniquement les
fichiers statiques de l'application. Un accord de traitement (DPA) standard
Supabase et Vercel s'applique de fait à l'usage de leurs plateformes ; aucun
avenant spécifique n'a été négocié à ce jour.

## Traitements

### 1. Annuaire des musicien·nes et technicien·nes

- **Finalité** : constituer et joindre les équipes de production (savoir qui
  contacter, quel poste/instrument, quel statut).
- **Base légale** : intérêt légitime du responsable de traitement (gestion
  courante de la relation avec les personnes qui interviennent sur les
  productions) et exécution de mesures précontractuelles.
- **Données** : prénom, nom, instrument ou poste, pupitre/pôle, statut
  (titulaire/remplaçant), téléphone, email, notes libres.
- **Personnes concernées** : musicien·nes et technicien·nes intervenant ou
  susceptibles d'intervenir sur les productions.
- **Destinataires internes** : comptes de production disposant d'un accès à
  l'outil.
- **Durée de conservation** : tant que la collaboration se poursuit ou est
  susceptible de reprendre, puis 2 ans après la dernière date travaillée.
- **Support** : table `musiciens` / `techniciens` (Supabase Postgres).

### 2. Disponibilités et planification des tournées

- **Finalité** : savoir qui peut tenir quelles dates, constituer les équipes
  par date, produire les plannings et récapitulatifs.
- **Base légale** : intérêt légitime (organisation opérationnelle des
  tournées) et exécution du contrat pour les personnes engagées.
- **Données** : disponibilités déclarées par date (`dispo`/`indispo`/
  `incertain`), affectations aux dates de tournée.
- **Personnes concernées** : musicien·nes et technicien·nes.
- **Destinataires internes** : comptes de production.
- **Durée de conservation** : durée de vie de la tournée concernée, puis 2
  ans.
- **Support** : tables `tournees` (champ `dates` jsonb), `musiciens`,
  `techniciens`.

### 3. Feuilles de route et logistique de tournée

- **Finalité** : organiser le déroulé d'une date (trajets, hôtel, contacts
  sur place, planning horaire).
- **Base légale** : exécution du contrat / intérêt légitime pour les
  contacts extérieurs (régie, salle).
- **Données** : noms des passagers sur les trajets, contacts (nom,
  téléphone, email) de personnes côté salle/prestataires, éventuellement
  hébergées dans un carnet d'adresses réutilisable.
- **Personnes concernées** : musicien·nes, technicien·nes, et contacts
  extérieurs (régisseur·euses, salles, prestataires).
- **Destinataires internes** : comptes de production.
- **Durée de conservation** : 2 ans après la date concernée pour la feuille
  de route ; le carnet de contacts est mis à jour en continu par
  écrasement/déduplication et ne fait pas l'objet d'une purge automatique
  (à revoir si le carnet grossit significativement).
- **Support** : tables `feuilles_route`, `carnet_contacts`.

### 4. Gestion administrative de l'embauche

- **Finalité** : établir les contrats de travail et les déclarations
  d'embauche (DUE, paie intermittence), assurer la sécurité en tournée
  (contact d'urgence) et la logistique costumes/transport.
- **Base légale** : obligation légale (droit du travail, réglementation
  intermittence du spectacle) et exécution du contrat de travail.
- **Données** : identité civile (nom, prénom d'état civil, date et lieu de
  naissance, nationalité, genre), adresse postale, numéro de sécurité
  sociale (NIR), IBAN/BIC, numéro Congés Spectacles, numéro Audiens, contact
  d'urgence, numéro et type de permis de conduire, taille de vêtement.
- **Personnes concernées** : musicien·nes et technicien·nes employé·es.
- **Destinataires internes** : comptes de rôle administrateur uniquement
  (accès cloisonné en base).
- **Destinataires externes** : organismes sociaux dans le cadre des
  obligations d'employeur (URSSAF, Audiens, Pôle emploi spectacle /
  Congés Spectacles), lorsque la déclaration l'exige.
- **Durée de conservation** : 5 ans, durée usuelle de conservation des
  pièces justificatives de paie et de déclarations sociales.
- **Support** : table dédiée aux infos sociales, consultée/éditée depuis
  `infos-sociales.html` (accès administrateur uniquement).
- **Particularité** : le NIR est une donnée sensible au sens large du RGPD
  (identifiant national) ; son traitement est strictement limité aux
  obligations légales d'employeur et son accès est réservé aux comptes
  administrateur.

### 5. Récapitulatif / newsletter interne

- **Finalité** : informer l'équipe de production des nouveautés, changements
  et annulations de dates entre deux envois.
- **Base légale** : intérêt légitime (information interne de l'équipe).
- **Données** : aucune donnée personnelle propre à la newsletter — elle
  recense des dates de tournées (ville, lieu, statut), pas de données
  individuelles des musicien·nes.
- **Durée de conservation** : le dernier envoi seulement (`newsletter_snapshot`,
  une seule ligne remplacée à chaque envoi).
- **Support** : table `newsletter_snapshot`.

### 6. Comptes d'accès et journal des modifications

- **Finalité** : restreindre l'accès aux pages internes aux personnes
  autorisées, tracer qui a créé/modifié/supprimé quoi pour la fiabilité des
  données et la résolution d'incidents.
- **Base légale** : intérêt légitime (sécurité du système d'information).
- **Données** : email de connexion, mot de passe (hashé par Supabase Auth,
  jamais accessible en clair), journal des créations/modifications/
  suppressions (auteur, horodatage, champs modifiés — sans le contenu pour
  les données d'embauche).
- **Personnes concernées** : comptes de production et administrateur·rices.
- **Destinataires internes** : comptes administrateur (tableau de bord).
- **Durée de conservation** : compte actif tant que la personne a besoin
  d'accéder à l'outil, suppression sur demande ou départ ; journal conservé
  2 ans puis purgé.
- **Support** : Supabase Auth, table de journalisation interne.

## Mesures de sécurité en place

- Accès aux pages internes réservé à des comptes nommés (authentification
  Supabase Auth, liens magiques à identifiant imprévisible pour les fiches
  individuelles).
- Cloisonnement en base des données d'embauche sensibles (identité civile,
  IBAN, NIR) : lecture/écriture réservées aux comptes de rôle administrateur.
- Journalisation des créations, modifications et suppressions ; pour les
  données d'embauche, seul le nom du champ modifié est journalisé, jamais
  son contenu.
- Hébergement de la base de données dans l'Union européenne (Supabase,
  région Paris).
- Aucune vente ni transmission des données à des tiers en dehors des
  obligations légales d'employeur.

## Violations de données

En cas de violation de données personnelles (accès non autorisé, perte,
fuite), le responsable de traitement (Aloïs Darles) évalue le risque pour
les personnes concernées et, si nécessaire :
- notifie la CNIL dans les 72 heures suivant la prise de connaissance
  (via [cnil.fr](https://www.cnil.fr)) ;
- informe les personnes concernées si le risque est élevé pour leurs droits
  et libertés.

---

*Dernière mise à jour : août 2026. Ce registre doit être revu à chaque ajout
de traitement, de sous-traitant, ou de catégorie de données.*
