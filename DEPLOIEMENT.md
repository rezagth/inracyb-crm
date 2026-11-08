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
