# InfraCyb CRM

Ton logiciel de gestion d'entreprise interne : prospects, pipeline, devis, factures, encaissements, relances, tâches et catalogue. Next.js + Postgres (Neon), prévu pour tourner sur Vercel. Rien n'est public : tout est derrière une connexion.

## Prérequis

- **Node.js 20.19 ou plus récent** (`node -v`).
- Une **base Postgres** : un projet Neon (gratuit pour démarrer), avec son URL de connexion « poolée ». En local, une base Neon de développement distincte de la production.

## Premier démarrage (une seule fois)

```bash
npm install
npm run setup        # crée .env avec une clé secrète de session, puis demande DATABASE_URL (à renseigner dans .env)
npm run db:migrate   # crée les tables et les contenus de départ dans Postgres
npm run db:seed      # ajoute ton catalogue de prestations (tarifs modifiables ensuite)
```

Facultatif, pour essayer avec des données fictives : `npm run db:demo` (base vide uniquement).

Renseigne `DATABASE_URL` dans `.env` **avant** `npm run db:migrate`. Au premier lancement, l'écran « Création du compte » demande ton nom, ton e-mail et un mot de passe (12 caractères minimum). Une fois en ligne, il exige en plus le code `SETUP_TOKEN` (voir `DEPLOIEMENT.md`).

## Lancer le logiciel

```bash
npm run dev          # http://localhost:3000
```

## Reprendre les données de l'ancienne version (SQLite)

Si tu avais déjà saisi des données dans l'ancienne version locale (`data/infracyb.db`) :

```bash
npm run db:migrate
SQLITE_FILE=data/infracyb.db npm run db:copy-sqlite
```

La copie se fait en une seule transaction (tout ou rien), vérifie les nombres de lignes, et refuse de s'exécuter si la base Postgres contient déjà des données.

## Ce qui est inclus

Au premier lancement, un **démarrage accompagné** (6 étapes) règle ton profil, tes offres, ta cible et tes objectifs : ils servent à écrire tes scripts. Le bouton **Guide et démarrage** (bas de la barre latérale) donne l'aide de chaque page.

| Groupe | Pages |
| --- | --- |
| Pilotage | Tableau de bord (avec « Bien démarrer »), Rapports (métrique, regroupement, export CSV, vues enregistrées), Rentabilité (revenu horaire par client, prévisionnel), Activité |
| Commercial | Prospection (file d'appels, scripts d'appel, séquences de mails J0 à J+14, objections, appel guidé), Pipeline, Entreprises (fiche complète avec suivi client), Contacts, Appels, Rendez-vous (agenda + export .ics), Devis, Partenaires |
| Clients | Clients, Contrats (MRR, facturation du mois), Missions, Audits (24 points, score, rapport, plan généré), Plans d'action (compte rendu de comité), Incidents (alerte CNIL 72 h), Temps, Support |
| Finance | Factures (numérotation continue, paiements, relances, avoirs), Catalogue, Dépenses, Trésorerie (plafond, TVA, URSSAF, prévision), livre des recettes |
| Entreprise | Tâches, Documents, Base de connaissances, Marketing, Conformité (obligations + registre RGPD), Intégrations (Cal, agenda, banque CSV avec rapprochement, paiement, exports comptables), Automatisations, Paramètres |

Les favoris (étoile en haut à droite) gardent tes vues filtrées dans la barre latérale ; chaque groupe de la barre se replie.

### Règles de facturation appliquées

- Un brouillon a un numéro provisoire. Le numéro définitif (`F-2026-001`, `D-2026-001`, `AV-2026-001`) est attribué **à l'émission**, sans trou dans la suite.
- Une facture émise ne se modifie plus. On la corrige par un **avoir**.
- Une entreprise qui a des devis ou des factures ne peut pas être supprimée (obligation de conservation).
- Les taux et seuils (cotisations, ACRE, plafond, franchise de TVA) sont des **valeurs par défaut à vérifier** chaque année sur autoentrepreneur.urssaf.fr et impots.gouv.fr.

Avant d'envoyer ton premier document : remplis **Paramètres → Identité** (nom, SIRET, adresse) et l'**adresse de facturation** de chaque client. Un bandeau rouge te le rappelle tant que ce n'est pas fait.

## Sauvegardes

Neon conserve un historique et permet de créer des **branches** (copies instantanées) : à faire avant toute opération risquée. En plus, `npm run db:backup` crée un export `.dump` dans `data/backups/` (nécessite `pg_dump`) : range-le chiffré, hors du dépôt. Teste une restauration avant ton premier client.

## Sécurité

- Mot de passe haché (bcrypt), session dans un cookie protégé (10 h, `Secure` en ligne), blocage 15 minutes après 5 échecs de connexion.
- La création du premier compte exige `SETUP_TOKEN` en ligne.
- Les pages sont marquées `noindex` ; en-têtes de sécurité (CSP, HSTS, anti-framing) actifs.
- Le fichier `.env` contient tes secrets : ne le partage jamais et ne le mets pas sur GitHub (déjà exclu par `.gitignore`).

## Mettre en ligne

Voir `DEPLOIEMENT.md` (pas à pas, Vercel + Neon).

## Commandes utiles

| Commande | Rôle |
| --- | --- |
| `npm run dev` | Lancer en mode développement |
| `npm run build && npm start` | Lancer en mode optimisé |
| `npm run db:migrate` | Appliquer les migrations et les contenus de départ |
| `npm run db:seed` | Ajouter le catalogue de base |
| `npm run db:demo` | Ajouter des données fictives (base vide uniquement) |
| `npm run db:copy-sqlite` | Reprendre l'ancienne base SQLite |
| `npm run db:backup` | Export de secours (`pg_dump`) |
| `npm run sync:stratcyber` | Envoyer les statuts de paiement à StratCyber |
| `npm test` | Tests (calculs fiscaux, lien StratCyber, parcours sur Postgres en mémoire) |
| `npm run typecheck` / `npm run lint` | Vérifications du code |
