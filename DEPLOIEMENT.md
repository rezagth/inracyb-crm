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

Les plafonds sont dans le code (`src/lib/campaign.ts`) : aucune variable n'est à créer.

- Audit : 10 par jour. Diagnostic : 10 par jour, atteint par paliers (4, 6, 8, 10 ; un palier tous les 2 jours ouvrés depuis le premier envoi réel). Total : 20.
- Facultatif : `MAIL_DAILY_LIMIT_DIAGNOSTIC` (plafond visé du diagnostic), `CAMPAIGN_REST_DAYS` (repos avant de passer d'un service à l'autre, 30 jours par défaut).
- Une entreprise n'a qu'une séquence en cours à la fois : index unique `mail_campaign_items_active_uq` (`npm run db:migrate`, ou `drizzle-manuel-diagnostic.sql` dans Neon, après le contrôle indiqué en tête du fichier).
- Le déclenchement automatique n'envoie rien les jours fériés ; les mails dus partent au jour ouvré suivant.

Prérequis côté Brevo : domaine infracyb.fr authentifié, expéditeur contact@infracyb.fr validé, téléphone vérifié.

### Garde-fous d'envoi (communs aux deux services)

- **Pause automatique** : un service s'arrête à la première plainte pour spam, ou au-delà de 2 % de rebonds sur 30 jours (au moins 30 envois et 2 rebonds). Une tâche prioritaire est créée et un bandeau s'affiche sur la page Campagnes ; la reprise est manuelle (bouton « Reprendre le service »). Les événements Brevo reçus avant cette version ne sont pas comptés.
- **Réponse reçue** : bouton sur la page Campagnes et sur la fiche de l'entreprise. Il arrête la séquence et crée une tâche prioritaire.
- **Origine des adresses** : chaque adresse garde son origine (saisie à la main, publiée sur le site, historique). Sans origine connue, aucun envoi. Les adresses historiques ne sont admises que pour le service Audit.
- Migration : `npm run db:migrate`, ou la section « Phase B » de `drizzle-manuel-diagnostic.sql`, **avant** de déployer le code (le CRM lit la colonne `contacts.email_source`).

### Moteur de diagnostic (service Diagnostic)

- Mesures passives uniquement, sur des données publiques : SPF, DMARC, MX, MTA-STS, DKIM (sélecteurs courants, « non détecté » et jamais « absent »), certificat HTTPS, en-têtes de la page d'accueil, `security.txt`, domaines proches (résolution DNS seulement). Aucun balayage de ports.
- Le DNS est interrogé en HTTPS auprès de deux résolveurs publics (Cloudflare et Google) : une absence n'est retenue que s'ils sont d'accord. Les noms de domaine des prospects leur sont donc transmis, comme pour toute requête DNS.
- File d'attente traitée par lots dans un budget de temps ; le reste est repris par la tâche planifiée `/api/cron/diagnostics` (jours ouvrés, 6 h 30 UTC, même `CRON_SECRET`).
- Un prospect n'entre dans la séquence que s'il a au moins un constat certain, mesuré depuis 14 jours au plus. Rapport d'une page : lien « Rapport » de l'onglet Diagnostic (Imprimer > Enregistrer en PDF).
- Migration : `npm run db:migrate`, ou la section « Phase C » de `drizzle-manuel-diagnostic.sql`, avant de déployer.

### Séquence et textes du service Diagnostic

- Les textes viennent de `textes-campagne-diagnostic-v2.md` et sont repris à l'identique dans `src/lib/diagnostic-mails.ts`. Pour changer une phrase : modifier les deux fichiers ; `npm test` échoue s'ils diffèrent d'un caractère.
- Une campagne Diagnostic porte un segment (éditeurs / ESN / agences, ou cabinets). Seules les entreprises d'un secteur du segment y entrent : Numérique pour le premier ; Expertise comptable, Juridique, Notariat, Courtage pour le second.
- Accroches possibles : SPF absent, en double, en `+all` ; DMARC absent ou en `p=none` ; certificat expiré ou expirant sous 14 jours. HSTS n'est qu'un constat secondaire (J+3) : seul, il n'ouvre pas la campagne.
- Avant J0 et J+3, le domaine est mesuré de nouveau. Constat corrigé : la séquence s'arrête. Mesure impossible ce jour-là : rien ne part, nouvel essai au passage suivant.
- Un champ obligatoire vide (prénom, entreprise, domaine, date du certificat, nom dans Paramètres, signature) : le mail ne part pas et l'erreur s'affiche sur la ligne de la campagne.
- Migration : section « Phase D » de `drizzle-manuel-diagnostic.sql`, ou `npm run db:migrate`, avant de déployer.

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
- Sans Google Places, seules les entreprises dont le site est déjà noté sur la fiche peuvent être complétées : les autres sont écartées avec ce motif.
- Migration : section « Phase F » de `drizzle-manuel-diagnostic.sql`, ou `npm run db:migrate`, avant de déployer.
