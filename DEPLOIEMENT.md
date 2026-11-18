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

