# Mettre le CRM en ligne (Vercel + Neon)

Ordre à suivre. Aucun secret ne doit être écrit dans ce fichier, dans Git, dans une conversation ou dans Notion.

## 1. Base de données (Neon)
1. Crée un projet Neon **séparé** de celui de StratCyber (les données de facturation et celles de conformité ne se mélangent pas).
2. Copie l'URL de connexion **poolée** (celle avec `-pooler` dans le nom d'hôte, `?sslmode=require` à la fin).
3. Garde-la pour l'étape 3. Ne la colle nulle part ailleurs.

## 2. Créer les tables
Dans ton `.env` local, mets `DATABASE_URL` = l'URL Neon, puis :
```bash
npm install
npm run db:migrate
npm run db:seed          # catalogue de prestations (optionnel)
```
Si tu as déjà des données dans l'ancienne version locale : `SQLITE_FILE=data/infracyb.db npm run db:copy-sqlite` (jamais sur une base qui a déjà un compte).
Retire ensuite `DATABASE_URL` de ton `.env` ou remets-y l'URL d'une base de **développement** : évite de travailler en local sur la base de production.

## 3. Projet Vercel
1. Importe le dépôt du CRM sur Vercel (framework Next.js détecté).
2. Variables d'environnement (Production, et Preview si tu l'utilises avec **une autre base**) :
   - `DATABASE_URL` : l'URL Neon poolée
   - `AUTH_SECRET` : une chaîne aléatoire d'au moins 32 caractères (`openssl rand -base64 48`), différente de celle de ton `.env` local
   - `SETUP_TOKEN` : une chaîne aléatoire d'au moins 20 caractères, pour créer le premier compte
   - `STRATCYBER_URL` et `STRATCYBER_WEBHOOK_SECRET` : pour le lien avec StratCyber (même secret que `CRM_WEBHOOK_SECRET` côté StratCyber)
3. Déploie.

## 4. Premier compte
1. Ouvre `/setup` sur l'adresse déployée, saisis le code `SETUP_TOKEN`, puis crée ton compte.
2. Si tu as copié l'ancien compte à l'étape 2, ignore ce point : connecte-toi avec l'ancien e-mail et mot de passe.
3. Après création, tu peux supprimer `SETUP_TOKEN` de Vercel.

## 5. À vérifier avant de saisir de vraies données
- [ ] Connexion, déconnexion, mauvais mot de passe 5 fois (blocage de 15 minutes)
- [ ] Créer une entreprise, un devis, l'émettre, créer la facture, enregistrer un paiement
- [ ] Les numéros se suivent sans trou (F-AAAA-001, 002…)
- [ ] `/login` fonctionne en navigation privée et aucune page n'est lisible sans connexion
- [ ] Lancer une restauration de test (voir le README, section Sauvegardes)
- [ ] Le lien StratCyber : `npm run sync:stratcyber` en local avec `STRATCYBER_URL` pointant vers la production

## Limites connues
- Les automatisations quotidiennes (facturation des contrats, relances, lien StratCyber) se déclenchent à la première ouverture du CRM de la journée, pas à heure fixe. Pour une exécution sans ouverture, il faudra une tâche planifiée Vercel (non ajoutée).
- Sur Vercel, `DATABASE_URL` doit être l'URL poolée de Neon, sinon les connexions s'épuisent.

## Envoi de mails depuis le CRM (Brevo)

Dans Prospection > Séquence mails, le bouton « Envoyer via Brevo » envoie le mail depuis contact@infracyb.fr, le note dans le journal et planifie la relance suivante.

Variables à ajouter dans `.env` en local **et** dans Vercel (Settings > Environment Variables), puis redéployer :

- `BREVO_API_KEY` : clé créée dans Brevo (SMTP et API > Clés API).
- `MAIL_FROM_EMAIL` (défaut `contact@infracyb.fr`), `MAIL_FROM_NAME` (défaut `InfraCyb`), `MAIL_REPLY_TO` (défaut : l'expéditeur).
- `MAIL_DAILY_LIMIT` : plafond d'envois par jour du service Audit, envois à la main compris (défaut 10, maximum 300).

### Deux services : Audit et Diagnostic

**Migrations de la base en service : uniquement `drizzle-manuel-diagnostic.sql`, jamais `npm run db:migrate`.** La base de production n'a enregistré que la première migration Drizzle ; les tables suivantes ont été créées par les fichiers `drizzle-manuel-*.sql`. `npm run db:migrate` rejouerait la migration 0001 et échouerait sur des tables qui existent déjà. Le fichier manuel est rejouable en entier (sections A à F), sans danger :

```bash
psql "$PROD_URL" -X -v ON_ERROR_STOP=1 -f drizzle-manuel-diagnostic.sql
```

Avant : une branche Neon de la production, et un export avec un `pg_dump` de version égale ou supérieure à celle du serveur (PostgreSQL 18 ; `brew install libpq`, puis `/opt/homebrew/opt/libpq/bin/pg_dump`).

Les plafonds sont dans le code (`src/lib/campaign.ts`) : aucune variable n'est à créer.

- Audit : 10 par jour. Diagnostic : 10 par jour, atteint par paliers (4, 6, 8, 10 ; un palier tous les 2 jours ouvrés depuis le premier envoi réel). Total : 20.
- Facultatif : `MAIL_DAILY_LIMIT_DIAGNOSTIC` (plafond visé du diagnostic), `CAMPAIGN_REST_DAYS` (repos avant de passer d'un service à l'autre, 30 jours par défaut).
- Une entreprise n'a qu'une séquence en cours à la fois : index unique `mail_campaign_items_active_uq` (`drizzle-manuel-diagnostic.sql`, après le contrôle indiqué en tête du fichier).
- Le déclenchement automatique n'envoie rien les jours fériés ; les mails dus partent au jour ouvré suivant.

Prérequis côté Brevo : domaine infracyb.fr authentifié, expéditeur contact@infracyb.fr validé, téléphone vérifié.

### Garde-fous d'envoi (communs aux deux services)

- **Pause automatique** : un service s'arrête à la première plainte pour spam, ou au-delà de 2 % de rebonds sur 30 jours (au moins 30 envois et 2 rebonds). Une tâche prioritaire est créée et un bandeau s'affiche sur la page Campagnes ; la reprise est manuelle (bouton « Reprendre le service »). Les événements Brevo reçus avant cette version ne sont pas comptés.
- **Réponse reçue** : bouton sur la page Campagnes et sur la fiche de l'entreprise. Il arrête la séquence et crée une tâche prioritaire.
- **Origine des adresses** : chaque adresse garde son origine (saisie à la main, publiée sur le site, historique). Sans origine connue, aucun envoi. Les adresses historiques ne sont admises que pour le service Audit.
- Migration : section « Phase B » de `drizzle-manuel-diagnostic.sql`, **avant** de déployer le code (le CRM lit la colonne `contacts.email_source`).

### Moteur de diagnostic (service Diagnostic)

- Mesures passives uniquement, sur des données publiques : SPF, DMARC, MX, MTA-STS, DKIM (sélecteurs courants, « non détecté » et jamais « absent »), certificat HTTPS, en-têtes de la page d'accueil, `security.txt`, domaines proches (résolution DNS seulement). Aucun balayage de ports.
- Le DNS est interrogé en HTTPS auprès de deux résolveurs publics (Cloudflare et Google) : une absence n'est retenue que s'ils sont d'accord. Les noms de domaine des prospects leur sont donc transmis, comme pour toute requête DNS.
- File d'attente traitée par lots dans un budget de temps ; le reste est repris par la tâche planifiée `/api/cron/diagnostics` (jours ouvrés, 6 h 30 UTC, même `CRON_SECRET`).
- Un prospect n'entre dans la séquence que s'il a au moins un constat certain, mesuré depuis 14 jours au plus. Rapport d'une page : lien « Rapport » de l'onglet Diagnostic (Imprimer > Enregistrer en PDF).
- Migration : section « Phase C » de `drizzle-manuel-diagnostic.sql`, avant de déployer.

### Séquence et textes du service Diagnostic

- Les textes viennent de `textes-campagne-diagnostic-v2.md` et sont repris à l'identique dans `src/lib/diagnostic-mails.ts`. Pour changer une phrase : modifier les deux fichiers ; `npm test` échoue s'ils diffèrent d'un caractère.
- Une campagne Diagnostic porte un segment (éditeurs / ESN / agences, ou cabinets). Seules les entreprises d'un secteur du segment y entrent : Numérique pour le premier ; Expertise comptable, Juridique, Notariat, Courtage pour le second.
- Accroches possibles : SPF absent, en double, en `+all` ; DMARC absent ou en `p=none` ; certificat expiré ou expirant sous 14 jours. HSTS n'est qu'un constat secondaire (J+3) : seul, il n'ouvre pas la campagne.
- Avant J0 et J+3, le domaine est mesuré de nouveau. Constat corrigé : la séquence s'arrête. Mesure impossible ce jour-là : rien ne part, nouvel essai au passage suivant.
- Un champ obligatoire vide (prénom, entreprise, domaine, date du certificat, nom dans Paramètres, signature) : le mail ne part pas et l'erreur s'affiche sur la ligne de la campagne. Seule exception : une adresse générique publiée sur le site, sans dirigeant connu ; le mail commence alors par « Bonjour, ».
- Migration : section « Phase D » de `drizzle-manuel-diagnostic.sql`, avant de déployer.

### Bilan par service et par segment

- Page Campagnes, section « Bilan » : entreprises contactées, mails, délivrées, rebonds, plaintes, désinscriptions, réponses, rendez-vous, devis acceptés, avec les taux. Trois vues : tout, cohorte à J+14, cohorte à J+30.
- Colonne « Délivrées » : cocher l'événement « Délivré » (delivered) dans le webhook Brevo. Sans lui, la colonne affiche « — ».
- Aucune comparaison en dessous de 30 entreprises par ligne ; au-delà, un écart n'est retenu que s'il dépasse la marge d'incertitude.

### Alimentation automatique (campagnes permanentes)

- Page **Alimentation** : interrupteur général, réglages, entreprises traitées (importées, complétées, inscrites, écartées et pourquoi), journal des passages.
- **Arrêtée par défaut.** Rien n'est cherché, importé ni inscrit tant que tu n'as pas cliqué sur « Mettre en marche ». Le service Audit n'est alimenté que si tu coches sa case : il partage le plafond de la campagne d'audit en cours.
- Tâche planifiée `/api/cron/alimentation` (jours ouvrés, 5 h UTC, même `CRON_SECRET`), avant les diagnostics (6 h 30) et les envois (8 h). Pas de passage les jours fériés.
- Étapes : recherche dans l'Annuaire des Entreprises par segment (codes NAF, tailles, départements), import (30 par jour et par segment par défaut), site et téléphone par Google Places si `GOOGLE_PLACES_API_KEY` est configurée (30 requêtes par jour par défaut), adresse **seulement si elle est publiée sur le site** (générique en priorité, origine « site »), diagnostic, inscription dans la campagne permanente du service et du segment.
- Une entreprise n'est inscrite que si elle remplit toutes les conditions d'entrée habituelles, et seulement s'il reste de la place : les mails déjà dus plus ceux des nouvelles inscriptions doivent tenir dans le plafond quotidien sur la durée d'une séquence.
- **Règle d'entrée dans le CRM (phase G)** : une entreprise n'est créée que si son **adresse mail publiée sur son site ET son téléphone** (Google ou site) ont été trouvés. Sinon elle reste hors du CRM, notée dans l'onglet « Écartées » de la page Alimentation avec le motif, et n'est jamais revérifiée (aucune nouvelle requête Google).
- **Site trouvé sans Google, prouvé par le SIREN** : pour chaque candidat, le CRM essaie d'abord jusqu'à 6 adresses de site tirées du nom (`nom.fr`, `nom.com`, avec ou sans tirets, sigle entre parenthèses d'abord) et ne retient un site que si le SIREN de l'entreprise y est publié (mentions légales, obligatoires). Gratuit, sans quota. Seule l'adresse du site est déduite, puis prouvée ; l'adresse mail est toujours lue sur le site.
- Google Places sert en secours, pour les sites non prouvés : une requête par candidat, dans la limite du quota du jour (30 par défaut), partagé entre les deux segments. Une erreur passagère de Google est réessayée une fois. Sans `GOOGLE_PLACES_API_KEY`, seuls les sites prouvés par le SIREN sont retenus.
- Un site trop lent a droit à un second essai, plus patient, avant d'être écarté.
- Entreprises importées avant la phase G (encore « à compléter ») : vérifiées avec la même règle au passage suivant. Incomplètes et sans aucune trace dans le CRM (aucun échange, envoi, campagne, tâche, devis…), elles sont retirées du CRM ; sinon gardées et marquées écartées.
- Migration : sections « Phase F » puis « Phase G » de `drizzle-manuel-diagnostic.sql`, avant de déployer.

### Lecture automatique des réponses (phase H)

Le CRM lit ta boîte Gmail **en lecture seule** (portée `gmail.readonly` : il ne peut ni envoyer, ni supprimer, ni modifier). Chaque jour ouvré à 7 h 30 UTC (`/api/cron/reponses`), et juste avant l'envoi de 8 h, il examine les messages reçus depuis 3 jours.

- Un message d'un contact à qui tu as écrit dans les 45 derniers jours **arrête sa séquence**, crée la tâche « Répondre à… » (priorité haute) et dépose dans le journal de la fiche un **brouillon de réponse** à relire (la synthèse d'une page est à joindre).
- « Stop », « désinscrivez-moi », « ne me contactez plus » : l'adresse est désinscrite, la séquence s'arrête.
- « Pas intéressé », « non merci » : la séquence s'arrête et une tâche de vérification à faible priorité est créée (un refus peut cacher un besoin). Aucune désinscription.
- Réponses automatiques (absence), rebonds, messages de tes propres adresses, expéditeurs inconnus : ignorés. Chaque message n'est traité qu'une fois.
- Sans configuration Gmail, rien ne se passe et le bouton manuel « Réponse reçue » fonctionne comme avant, avec le même brouillon.

**Mise en place (une fois, environ 15 minutes)** — l'interface de Google change : vérifie les intitulés dans la console.
1. console.cloud.google.com : créer un projet « InfraCyb CRM », activer **Gmail API**.
2. Écran de consentement OAuth : type « Externe », ton adresse Gmail comme utilisateur de test, portée `gmail.readonly`. **Passer l'application en « En production »** : en mode « Test », Google fait expirer le jeton au bout de 7 jours (l'écran « application non vérifiée » s'affiche alors, c'est normal pour un usage personnel).
3. Identifiants : créer un « ID client OAuth » de type Application Web, avec l'URI de redirection `https://developers.google.com/oauthplayground`.
4. Sur developers.google.com/oauthplayground : roue dentée, cocher « Use your own OAuth credentials », coller l'ID et le secret ; choisir la portée `https://www.googleapis.com/auth/gmail.readonly`, autoriser avec le compte qui reçoit les réponses (infracyb@gmail.com), « Exchange authorization code for tokens », copier le **Refresh token**.
5. Dans Vercel (Settings > Environment Variables) et jamais ailleurs : `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`. Redéployer.
6. Test : t'envoyer un mail depuis une adresse qui est un contact d'une campagne en cours, puis ouvrir `https://<ton CRM>/api/cron/reponses` avec l'en-tête `Authorization: Bearer <CRON_SECRET>` (ou attendre le déclenchement du lendemain matin).

Si le jeton est révoqué ou expire, le déclenchement renvoie une erreur lisible (visible dans Vercel > Cron Jobs) ; les envois du jour partent quand même.

### Tâche d'appel à J+4 (phase H)

Quand le mail **J+3** d'une campagne Diagnostic part, le CRM crée la tâche « Appeler <entreprise> au <téléphone> : <constat> sur <domaine> » pour le lendemain (priorité haute) et note dans le journal de la fiche les phrases d'ouverture de l'appel. Le constat est repris mot pour mot de la phrase validée. Pas de téléphone utilisable (9 chiffres au moins) : aucune tâche. Le canevas d'appel (les phrases autour du constat) est dans `src/lib/call-task.ts` : à relire et corriger par toi.

### Pack « Courrier sécurisé » (phase H)

`drizzle-manuel-pack-courrier.sql` ajoute la prestation au catalogue (390 € HT de départ, à valider ; rejouable sans danger). Aucune table n'est modifiée : **aucune autre migration n'est nécessaire pour la phase H**.


## Prix du Pack Courrier et prix pilote

Étude de marché du 18/11/2026 (prestataires installés : 390 à 650 € HT). Prix public : 390 € HT. Prix pilote : 290 € HT pour les 3 premiers clients, contre un témoignage écrit. Les montants sont dans `src/lib/pricing.ts`. Aucune facture avant l'immatriculation.

## Rapport hebdomadaire automatique

Chaque lundi à 7h15 UTC, `/api/cron/rapport` envoie par Brevo le bilan de la semaine (nouvelles entreprises, bilan par service et segment, alertes, actions). Destinataire : `REPORT_TO_EMAIL`, sinon l'e-mail du profil du CRM. Pour le tester : dans Vercel, Settings, Cron Jobs, bouton Run sur `/api/cron/rapport`.

## Campagne prescripteurs (lot P1 : envoi branché)

Textes dans `textes-campagne-prescripteurs.md`, code dans `src/lib/prescripteur-mails.ts` (validés le 24/11/2026). Experts-comptables, avocats et notaires : jamais de commission (décret n° 2012-432, art. 162). Courtiers : 15 % du HT encaissé, accord écrit.

- **Troisième service du moteur de campagnes**, onglet « Prescripteurs » de la page Campagnes : son propre plafond (`MAIL_DAILY_LIMIT_PRESCRIPTEUR`, 10 par jour par défaut), sa pause automatique (rebonds, plainte), son étiquette Brevo `prescripteur`, sa ligne dans le bilan et le rapport hebdomadaire. Le total du jour devient la somme des trois plafonds.
- **Séquence** : premier message (J0), relance à J+7, puis une tâche « Appeler … » le lendemain de la relance (si la fiche a un téléphone), avec les phrases d'ouverture dans le journal.
- **Cabinets réservés** : Expertise comptable, Juridique et Notariat ne reçoivent plus la prospection client (audit, diagnostic) ; les séquences déjà en cours se terminent normalement. Un cabinet contacté comme prescripteur n'est plus jamais prospecté comme client. L'alimentation automatique continue d'importer ces cabinets : ils sont notés « réservé à la campagne prescripteurs » et apparaissent dans l'onglet Prescripteurs, à lancer à la main.
- **Courtiers** : visés seulement avec `PRESCRIPTEUR_PARTENAIRES=1` (après l'immatriculation et la relecture de l'accord écrit). Sans elle, ils restent des clients potentiels du diagnostic.
- Aucune migration de base.

## Envoi des devis et factures depuis le CRM (étape 2, lots A et B)

- **PDF** : le CRM produit lui-même le PDF des devis, factures et avoirs émis (bouton « Télécharger le PDF »). Un brouillon n'en a pas.
- **Envoi** : bouton « Envoyer au client » sur un devis ou une facture émis, et « Envoyer » pour le rappel courtois et la relance ferme. Une fenêtre montre le destinataire, l'objet et le texte (modifiables) ; le PDF est joint. La mise en demeure reste à envoyer soi-même, de préférence en recommandé.
- **Avant la mise en ligne** : ajouter et valider l'adresse d'expédition (ex. `facturation@`) dans Brevo > Expéditeurs, puis renseigner `MAIL_BILLING_FROM_EMAIL` (et facultativement `MAIL_BILLING_FROM_NAME`) dans Vercel. Sans elle, l'expéditeur habituel est utilisé. Les réponses du client vont vers l'e-mail de Paramètres > Identité.
- **Séparé de la prospection** : ces mails ne comptent pas dans le plafond quotidien, partent même si une campagne est en pause, et ne consultent pas la liste des désinscrits. Ils portent l'étiquette Brevo `facturation` : un rebond, une plainte ou un clic « se désinscrire » sur un de ces mails crée une tâche prioritaire et n'est jamais compté dans les pauses ni le bilan des campagnes.
- Sans Brevo configuré, les anciens liens « Préparer l'e-mail » restent affichés.
- Aucune migration de base.

## Phase I : synthèse en lien, Pack dans les mails, file d'appels du jour

**Migrations, avant de déployer le code** (branche de sauvegarde Neon d'abord), dans cet ordre :

```bash
psql "$PROD_URL" -X -v ON_ERROR_STOP=1 -f drizzle-manuel-prescripteurs.sql   # lot P2, s'il n'est pas déjà passé
psql "$PROD_URL" -X -v ON_ERROR_STOP=1 -f drizzle-manuel-appels.sql          # phase I : tasks.kind
```

Les deux fichiers sont rejouables sans danger. Sans eux, la fiche entreprise et la page Appels plantent (colonnes absentes).

- **Lien public `/r/<jeton>`** : synthèse de diagnostic lisible sans compte, jeton signé avec `AUTH_SECRET`, valable 60 jours. Changer `AUTH_SECRET` invalide tous les liens déjà envoyés (et déconnecte la session). L'adresse des liens vient de `APP_URL`, sinon du domaine de production Vercel.
- **Consultation** : une ouverture humaine (robots, antivirus de messagerie et ouvertures dans les 2 minutes après un envoi écartés) note « Rapport de diagnostic consulté » sur la fiche et met un appel du jour en tête de la file.
- **Textes Diagnostic** : J+3 contient le lien de la synthèse, J+7 le Pack (prix pilote tant qu'aucun devis accepté n'a épuisé les 3 places) et le lien de réservation de Paramètres > Intégrations (sans lien Cal, la phrase de réservation est omise). Tableau 5 de `textes-campagne-diagnostic-v2.md`.
- **Page Appels** : file « À appeler aujourd'hui » (tâches `kind = 'appel'`), résultat en un clic.

## Phase J : volume d'envoi

**Migration, avant de déployer le code** (branche de sauvegarde Neon d'abord) :

```bash
psql "$PROD_URL" -X -v ON_ERROR_STOP=1 -f drizzle-manuel-phase-j.sql
```

- **Stock d'abord** : chaque passage de l'alimentation diagnostique et inscrit d'abord les entreprises déjà vérifiées, puis cherche de nouvelles entreprises. La tâche de 6 h 30 (`/api/cron/diagnostics`) traite aussi ce stock.
- **Domaine d'envoi** : la page Campagnes (onglet Diagnostic) affiche SPF, DKIM de Brevo et DMARC du domaine de `MAIL_FROM_EMAIL`. Tant que DMARC n'est pas en `quarantine` ou `reject` à 100 % avec un DKIM valide, le diagnostic reste plafonné à 10 mails par jour, quelle que soit la cible. Le rapport du lundi le signale.
- **Montée en charge** : 4 → 6 → 8 → 10 depuis le premier envoi, puis 15 → 20 → 25 → 30 (un palier tous les 2 jours ouvrés) à partir du jour où le domaine d'envoi est devenu strict. Cible : `MAIL_DAILY_LIMIT_DIAGNOSTIC` (30 recommandé). Si le domaine redevient non strict, la montée repart du début.
- **Sous-domaine d'envoi (recommandé)** : par exemple `contact@go.infracyb.fr` authentifié dans Brevo, puis `MAIL_FROM_EMAIL` = cette adresse et `MAIL_REPLY_TO=contact@infracyb.fr` (les réponses restent dans la boîte lue par le CRM). Sans DMARC propre, le sous-domaine suit `sp=` (sinon `p=`) du domaine principal.
- **Segments** : le segment Cabinets ne cherche plus les secteurs réservés aux prescripteurs ; nouveau segment Immobilier (agences, syndics, administrateurs de biens ; textes : segment 3 de `textes-campagne-diagnostic-v2.md`).
- **Prescripteurs automatiques** : case « Alimenter la campagne Prescripteurs » sur la page Alimentation (éteinte par défaut). Les cabinets réservés trouvés entrent dans la campagne permanente Prescripteurs (plafond `MAIL_DAILY_LIMIT_PRESCRIPTEUR`).

## Phase L : prospects entrants depuis www.infracyb.fr

**Aucune migration.** Trois dépôts : CRM (ce dépôt), site public (`~/infracyb`), StratCyber (`~/stratcyber`).

- **CRM** : adresse `/api/webhooks/lead`, fermée tant que `LEAD_WEBHOOK_SECRET` (32 caractères au moins, `openssl rand -hex 32`) n'est pas dans Vercel. Chaque demande est signée par le serveur du site (HMAC de « horodatage.corps », 5 minutes). Une demande crée ou retrouve la fiche (contact d'origine « formulaire » : jamais de séquence de prospection), diagnostique le domaine de l'adresse, met un appel « Demande entrante » en tête de la page Appels et envoie la synthèse par Brevo (lien de désinscription inclus). 50 demandes par jour au plus.
- **Site** (projet Vercel du site) : `LEAD_WEBHOOK_SECRET` (le même que le CRM), `CRM_URL` (adresse https du CRM, sans `/` final), puis `LEAD_FORMS_ENABLED=1` seulement quand l'éditeur est renseigné dans `lib/site.ts` (`LEGAL`) et le texte de `/confidentialite` validé. Sans cela, `/test-messagerie` propose la prise de rendez-vous et l'autodiagnostic fonctionne sans formulaire de rappel.
- **StratCyber** : les boutons « Auto-évaluation » des pages de conformité mènent à `https://www.infracyb.fr/autodiagnostic`.

## Phase M : offre récurrente « Pack + Suivi », appels du matin, bilans mensuels

**Migration, avant de déployer le code** (branche de sauvegarde Neon d'abord) : `drizzle-manuel-phase-m.sql` ajoute au catalogue le Pack Courrier (absent de la production au 26/11) et l'abonnement Suivi. Aucune table modifiée, rejouable sans danger.

```bash
psql "$PROD_URL" -X -v ON_ERROR_STOP=1 -f drizzle-manuel-phase-m.sql
```

- **Offre Suivi Courrier & Domaine** : 49 € HT/mois (39 € pour les 3 clients pilotes), 6 mois d'engagement, dans `src/lib/pricing.ts`. La synthèse publique `/r/…` l'annonce après le Pack. Les mails de séquence ne changent pas.
- **Bouton « Devis Pack + Suivi »** (file d'appels et fiche entreprise) : devis en brouillon, prérempli avec le domaine du dernier diagnostic et le prix pilote s'il reste des places. À relire, émettre, envoyer.
- **Acceptation du devis** : le contrat mensuel « Suivi Courrier & Domaine » est créé tout seul (page Contrats). La facture tirée du devis ne reprend que le Pack : l'abonnement se facture chaque mois depuis Contrats.
- **Mail des appels du jour** : après les envois de 8 h, le CRM t'envoie la file d'appels (numéros, constats, essais). Rien si la file est vide. Destinataire : `REPORT_TO_EMAIL`, sinon l'e-mail du profil.
- **Bilan mensuel** (`/api/cron/suivi`, jours ouvrés à 6 h 45 UTC) : à partir du mois qui suit la signature, nouvelle mesure du domaine, mail au contact principal (étiquettes `facturation` et `suivi`, expéditeur de facturation), tâche prioritaire si un écart apparaît. Sans Brevo ou sans e-mail : tâche « envoyer à la main », texte dans le journal.
- **Bascule Audit → Diagnostic** (bouton en haut de la page Campagnes, visible s'il y a quelque chose à basculer) : arrête les séquences Audit des cabinets réservés aux prescripteurs et des entreprises que le Diagnostic attend. L'alimentation les inscrit ensuite, après le délai de repos habituel.

## Phase N : cinq passages d'alimentation par jour

**Aucune migration.** `vercel.json` ajoute 4 déclenchements de `/api/cron/alimentation?passe=2` à `?passe=5` (9 h, 11 h, 13 h, 15 h UTC, jours ouvrés). Après le déploiement, vérifier dans Vercel > Settings > Cron Jobs que les 10 déclenchements apparaissent (sur l'offre Hobby, chaque déclenchement part à un moment quelconque de l'heure prévue).

- **Rotation** : chaque passage commence par un segment différent (passage 1 : Éditeurs, 2 : Cabinets, 3 : Immobilier, 4 : Éditeurs, 5 : Cabinets). Le temps restant passe au segment suivant.
- **Quotas communs** : imports par segment et par jour (`importPerSegment`) et requêtes Google Places du jour (`placesDaily`) valent pour l'ensemble des passages.
- **Stock borné** : avant une recherche, le diagnostic du stock dispose de 12 secondes au plus ; la tâche de 6 h 30 et les passages suivants finissent le reste.
- **Page Alimentation** : nouvelle ligne « Intégrées par segment (aujourd'hui / 7 jours) ».

## Phase O : offres demandées (faux RIB, Microsoft 365, dossier de preuves) et abonnement à 149 €

**Migration, avant ou après le code** (branche de sauvegarde Neon d'abord) : `drizzle-manuel-phase-o.sql` ajoute 4 prestations au catalogue. Aucune table modifiée, rejouable sans danger. Le code n'en dépend pas : les devis prennent leurs prix dans `src/lib/pricing.ts`.

```bash
psql "$PROD_URL" -X -v ON_ERROR_STOP=1 -f drizzle-manuel-phase-o.sql
```

- **Offres** (`src/lib/pricing.ts`) : Kit anti-faux-RIB 590 € HT (pilote 450 €), Microsoft 365 sécurisé 490 € HT jusqu'à 10 comptes (pilote 390 €), Dossier de preuves 690 € HT, abonnement Suivi Sécurité PME 149 € HT/mois sur 12 mois. Les 3 places pilotes sont communes à toutes les offres.
- **Messagerie détectée** à partir des mesures existantes (MX, puis SPF) : Microsoft 365, Google Workspace ou autre. Aucune mesure nouvelle.
- **Recommandation** : agences et cabinets → Kit anti-faux-RIB ; éditeurs → Dossier de preuves ; Microsoft 365 → Microsoft 365 sécurisé ; constat SPF/DMARC → Pack. Affichée dans la file d'appels, le mail du matin et la synthèse `/r/…`.
- **Devis en un clic** : bouton de l'offre recommandée + menu « Autre offre… » (file d'appels, fiche entreprise). Les nouvelles offres ajoutent la ligne d'abonnement à 149 € (à retirer si le client ne prend que le forfait). À l'acceptation, le contrat « Suivi Sécurité PME » est créé et suivi par le bilan mensuel ; la facture du devis ne reprend que le forfait.
- **J+7** : après la phrase du Pack, phrase du Kit (agences, cabinets) ou du Dossier de preuves (éditeurs). Tableau 5 de `textes-campagne-diagnostic-v2.md`.

## Phase Q : posts LinkedIn dans le CRM, mail du jour avec l'image

**Migration, avant de déployer le code** (branche de sauvegarde Neon d'abord) : `drizzle-manuel-phase-q.sql` ajoute `posts.body` et `posts.visual`, puis les 8 posts de décembre (texte et image). Rejouable sans danger. Sans elle, la page Marketing plante.

```bash
psql "$PROD_URL" -X -v ON_ERROR_STOP=1 -f drizzle-manuel-phase-q.sql
```

- **Page Marketing** : carte « Posts à publier », avec le texte (bouton « Copier le texte »), l'aperçu de l'image (bouton « Télécharger l'image »), « Marquer comme publié » et « Modifier ». Le formulaire « Nouvelle publication » accepte le texte et les trois champs de l'image.
- **Image** : générée par le CRM en 1200 × 1200 (`/api/posts/<id>/image`, connexion obligatoire) à partir de trois champs : surtitre, chiffre ou phrase forte, légende.
- **Mail** (`/api/cron/linkedin`, mardi et jeudi à 6 h UTC, soit 7 h à Paris l'hiver) : s'il y a un post LinkedIn prévu ce jour-là et pas encore publié, le texte part par mail avec l'image en pièce jointe. Destinataire : `REPORT_TO_EMAIL`, sinon l'e-mail du profil.

## Phase R : publication automatique sur LinkedIn

**Migration, avant de déployer le code** (branche de sauvegarde Neon d'abord) : `drizzle-manuel-phase-r.sql` ajoute `posts.external_url` et la table `linkedin_auth`. Rejouable sans danger.

```bash
psql "$PROD_URL" -X -v ON_ERROR_STOP=1 -f drizzle-manuel-phase-r.sql
```

**Application LinkedIn (une fois)** : developer.linkedin.com → My Apps → Create app (rattachée à la page entreprise InfraCyb) → onglet Products : « Sign In with LinkedIn using OpenID Connect » et « Share on LinkedIn » → onglet Auth : adresse de retour `<APP_URL>/api/linkedin/callback` (affichée sur la page Marketing) → copier Client ID et Client Secret dans Vercel (`LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`), jamais ailleurs. `APP_URL` doit être renseignée. Redéployer, puis page Marketing → « Connecter LinkedIn ».

- **Publication** (`/api/cron/linkedin`, mardi et jeudi à 7 h UTC, soit 8 h – 9 h à Paris l'hiver) : le post du jour au statut « Programmé » est publié sur le profil, avec son image, puis passe en « Publié » avec son lien ; mail « Publié ✅ » avec le lien. Jamais deux fois (verrou « en cours »). Seul « Programmé » part : « Idée » et « Rédigé » ne partent jamais.
- **Repli** : non connecté, autorisation expirée ou refus de LinkedIn → mail avec le texte et l'image jointe, et l'erreur affichée sur la page Marketing.
- **Autorisation** : chiffrée (AES-256-GCM, clé tirée d'`AUTH_SECRET`), valable 60 jours, non renouvelable automatiquement (réservé aux partenaires agréés de LinkedIn). Alerte 10 jours avant dans le mail du post et le rapport du lundi. Changer `AUTH_SECRET` oblige à reconnecter LinkedIn.
- Un post resté au statut « en_cours » (coupure pendant la publication) n'est jamais republié automatiquement : vérifier sur LinkedIn, puis le passer en « Publié » ou « Programmé ».

## Phase S : un post LinkedIn par jour ouvré

- `vercel.json` : `/api/cron/linkedin` tourne du lundi au vendredi à 7 h UTC (8 h – 9 h à Paris l'hiver). Un jour sans post « Programmé » : rien ne se passe.
- `drizzle-manuel-phase-s.sql` ajoute 16 posts (texte et image), un par jour ouvré du 27/11 au 31/12/2026, hors 25/12, en plus des 8 de la phase Q. Statut « Programmé » : ils partent tout seuls. Pour en bloquer un, le passer en « Rédigé » sur la page Marketing. Rejouable sans danger, aucune table modifiée.

```bash
psql "$PROD_URL" -X -v ON_ERROR_STOP=1 -f drizzle-manuel-phase-s.sql
```

## Phase T : écriture automatique des posts LinkedIn (sans clé API)

**Aucune migration, rien à configurer dans Vercel.** L'écriture se fait par une tâche programmée de l'app Claude sur le Mac (« Écrire les posts LinkedIn quand le stock baisse », chaque jour à 10 h, mode Auto), qui utilise deux scripts du projet :

- `npm run -s posts:context` (lecture seule) : stock de posts « Programmé », prochaines dates et thèmes, sujets récents, base de faits (baromètre recalculé en direct, Cybermalveillance.gouv.fr 2024, offres) et consignes d'écriture (`src/lib/post-generator.ts`). Une série de 20 posts n'est demandée que s'il reste moins de 10 posts programmés.
- `npm run -s posts:insert -- <posts.json> [--dry]` : contrôle chaque post (`validateGeneratedPost` : chiffres présents dans la base de faits, aucune histoire de client, aucun nom d'entreprise du CRM, aucun lien hors infracyb.fr et cybermalveillance.gouv.fr, longueur, image, sujet non repris, date prévue). Conforme → « Programmé » ; sinon → « Rédigé », jamais publié sans relecture. Mail récapitulatif par Brevo.
- **Republication de secours** (CRM, `/api/cron/linkedin`) : un jour ouvré sans post et sans aucun post programmé à venir, un ancien post publié il y a plus de 90 jours (et dont le sujet n'a pas été repris) est republié, avec une note dans le mail.
- La tâche ne tourne que lorsque l'app Claude est ouverte (sinon au lancement suivant) : avec 10 posts d'avance, il faut deux semaines d'app fermée pour épuiser le stock.
- Les chiffres de Cybermalveillance.gouv.fr (`CYBER_FACTS`) sont ceux du rapport 2024 : à mettre à jour à la publication du rapport suivant.

## Phase U : réservations Cal.com reliées au CRM

**Aucune migration.** Textes et réglages de la page Cal.com : `data/cal-com-reglages.md`.

- **Webhook** `/api/webhooks/cal` (public, fermé sans `CAL_WEBHOOK_SECRET`) : chaque envoi doit porter `X-Cal-Signature-256` (HMAC-SHA256 hexadécimal du corps brut). Événements suivis : Booking Created, Booking Rescheduled, Booking Cancelled ; les autres et le ping de test sont acceptés sans effet.
- **Création** : fiche retrouvée par l'adresse, puis par le domaine (adresses des contacts, site des notes), sinon créée (source « Réservation en ligne », étape « RDV planifié ») ; rendez-vous dans l'agenda (heure de Paris, lien de visio, repère « Réservation Cal <uid> ») ; relances de campagne arrêtées (« A pris rendez-vous ») ; appels ouverts fermés ; étape « RDV planifié » ; tâche « Préparer le rendez-vous » la veille ; diagnostic du domaine s'il n'y en a pas de moins de 14 jours ; mail au propriétaire avec le constat et l'offre recommandée. Une même réservation n'est jamais créée deux fois.
- **Report** : rendez-vous et tâche de préparation déplacés. **Annulation** : rendez-vous retiré, tâche « Relancer » dans 2 jours ouvrés, mail.
- Questions Cal.com lues par le CRM (champ Identifier) : `entreprise`, `site`, `sujet`. Une adresse Gmail, Outlook, etc. ne sert pas à reconnaître l'entreprise : la question `site` y supplée.
- **CRM** : renseigner le lien du rendez-vous dans Intégrations (sinon il manque dans J+7, la synthèse et les brouillons de réponse).
