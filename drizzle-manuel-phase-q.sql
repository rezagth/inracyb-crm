-- Phase Q (26/11/2026) : texte et image des posts LinkedIn dans le CRM, et les 8 posts de décembre.
-- Deux colonnes ajoutées avec une valeur par défaut : rien d'existant n'est modifié ni supprimé.
--   posts.body   : texte complet du post, prêt à copier
--   posts.visual : contenu de l'image générée par le CRM (JSON : kicker, big, sub)
-- Rejouable sans danger (un post n'est ajouté que s'il n'existe pas déjà à la même date avec le même sujet).
-- À appliquer AVANT de déployer le code (après une branche de sauvegarde Neon) :
-- psql "$PROD_URL" -X -v ON_ERROR_STOP=1 -f drizzle-manuel-phase-q.sql

BEGIN;

ALTER TABLE posts ADD COLUMN IF NOT EXISTS body text NOT NULL DEFAULT '';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS visual text NOT NULL DEFAULT '';

INSERT INTO posts (id, date, network, topic, pillar, status, body, visual)
SELECT replace(gen_random_uuid()::text, '-', ''), '2026-12-01', 'LinkedIn', $post$Je l'ai fait chez moi d'abord$post$, 'Coulisses', 'programme', $post$Ce matin, j'ai corrigé un réglage sur mon propre domaine.

Mon DMARC était en « p=none ». En clair : n'importe qui pouvait envoyer un mail avec l'adresse contact@infracyb.fr, et les messageries de mes destinataires n'avaient aucune consigne pour le refuser.

Pour quelqu'un qui conseille des entreprises en cybersécurité, c'était gênant.

C'est corrigé : les faux mails à mon nom partent maintenant dans les indésirables. Dans deux semaines, s'il n'y a pas de surprise dans les rapports, ils seront refusés.

Pourquoi pas tout de suite ? Parce que bloquer trop vite peut bloquer vos vrais mails (facturation, paie, newsletters). On y va par étapes.

Et vous, vous savez ce que dit votre DMARC ?$post$, $post${"kicker": "DMARC", "big": "none → quarantine", "sub": "Je l'ai corrigé sur mon propre domaine d'abord."}$post$
WHERE NOT EXISTS (SELECT 1 FROM posts WHERE date = '2026-12-01' AND topic = $post$Je l'ai fait chez moi d'abord$post$);

INSERT INTO posts (id, date, network, topic, pillar, status, body, visual)
SELECT replace(gen_random_uuid()::text, '-', ''), '2026-12-03', 'LinkedIn', $post$Le chiffre du baromètre$post$, 'Expertise', 'programme', $post$J'ai regardé les réglages de messagerie de 74 PME françaises. Uniquement des informations publiques.

57 % n'ont aucune protection DMARC qui bloque les faux mails.

Concrètement : un escroc peut envoyer un « changement de RIB » avec leur adresse exacte, et il arrivera chez leurs clients.

73 % sont sous Microsoft 365. 38 % ont un SPF permissif.

La méthode et les limites sont détaillées ici : www.infracyb.fr/barometre-messagerie

Ça vous surprend, ou c'est ce que vous voyez aussi ?$post$, $post${"kicker": "Baromètre · 74 PME", "big": "57 %", "sub": "n'ont aucune protection DMARC qui bloque les faux mails"}$post$
WHERE NOT EXISTS (SELECT 1 FROM posts WHERE date = '2026-12-03' AND topic = $post$Le chiffre du baromètre$post$);

INSERT INTO posts (id, date, network, topic, pillar, status, body, visual)
SELECT replace(gen_random_uuid()::text, '-', ''), '2026-12-08', 'LinkedIn', $post$Le faux RIB, expliqué simplement$post$, 'Conseil pratique', 'programme', $post$La fraude au faux RIB, en 3 étapes :

1. Un escroc écrit à vos clients « de votre part » : « nous avons changé de banque ».
2. Le mail a l'air de venir de chez vous. Parfois, il vient vraiment de chez vous : une boîte piratée.
3. Le client paie. Puis il se retourne vers vous.

Les trois protections qui marchent :
→ un DMARC qui bloque (contre les faux mails avec votre adresse)
→ la double authentification (contre le vol de boîte)
→ une règle simple : tout changement de RIB se vérifie par téléphone, à un numéro déjà connu

La troisième ne coûte rien et arrête la fraude même quand le reste a échoué.

Vous l'avez, cette règle, chez vous ?$post$, $post${"kicker": "Fraude au faux RIB", "big": "3 protections", "sub": "DMARC · double authentification · vérification par téléphone"}$post$
WHERE NOT EXISTS (SELECT 1 FROM posts WHERE date = '2026-12-08' AND topic = $post$Le faux RIB, expliqué simplement$post$);

INSERT INTO posts (id, date, network, topic, pillar, status, body, visual)
SELECT replace(gen_random_uuid()::text, '-', ''), '2026-12-10', 'LinkedIn', $post$Ce que DMARC ne fait pas$post$, 'Conseil pratique', 'programme', $post$On me demande souvent : « si je règle DMARC, je suis protégé du phishing ? »

Non. DMARC fait une chose, et la fait bien : il empêche d'utiliser votre adresse exacte.

Il ne protège pas :
→ d'une adresse qui ressemble à la vôtre (une lettre changée)
→ d'un faux nom affiché devant une adresse Gmail
→ d'une boîte dont le mot de passe a été volé

C'est pour ça que je ne vends jamais DMARC comme une solution miracle. C'est une brique. Indispensable, mais une brique.$post$, $post${"kicker": "DMARC", "big": "Une brique", "sub": "Il protège votre adresse exacte. Pas le reste."}$post$
WHERE NOT EXISTS (SELECT 1 FROM posts WHERE date = '2026-12-10' AND topic = $post$Ce que DMARC ne fait pas$post$);

INSERT INTO posts (id, date, network, topic, pillar, status, body, visual)
SELECT replace(gen_random_uuid()::text, '-', ''), '2026-12-15', 'LinkedIn', $post$Compte Microsoft 365 piraté, les signes$post$, 'Conseil pratique', 'programme', $post$Le piratage de compte est la 2e raison pour laquelle les entreprises demandent de l'aide à Cybermalveillance.gouv.fr. +55 % en un an.

4 signes qu'une boîte Microsoft 365 est compromise :
→ des contacts reçoivent des mails que personne n'a écrits
→ une règle de transfert que personne n'a créée
→ une demande de validation de connexion que vous n'avez pas faite
→ une connexion depuis un pays inhabituel

Le premier réflexe d'un pirate, c'est souvent la règle de transfert. Allez vérifier les vôtres : 2 minutes dans Outlook, Paramètres → Courrier → Règles.

Vous en avez trouvé une que vous ne connaissiez pas ?$post$, $post${"kicker": "Piratage de compte", "big": "+55 %", "sub": "de demandes d'assistance en un an (Cybermalveillance.gouv.fr, 2024)"}$post$
WHERE NOT EXISTS (SELECT 1 FROM posts WHERE date = '2026-12-15' AND topic = $post$Compte Microsoft 365 piraté, les signes$post$);

INSERT INTO posts (id, date, network, topic, pillar, status, body, visual)
SELECT replace(gen_random_uuid()::text, '-', ''), '2026-12-17', 'LinkedIn', $post$Les questionnaires d'assurance$post$, 'Conseil pratique', 'programme', $post$Les assureurs cyber ne se contentent plus d'une case cochée.

Double authentification, sauvegardes isolées, protection des postes : ils demandent des preuves. Une réponse inexacte peut vous être opposée le jour du sinistre.

Mon conseil : ne cochez « oui » que si vous pouvez le prouver. Et rassemblez les preuves une fois, dans un seul document, plutôt que de tout refaire à chaque questionnaire.

Un « non, mais c'est prévu pour mars » avec un plan daté est mieux reçu qu'un « oui » fragile.$post$, $post${"kicker": "Assurance cyber", "big": "Prouvez-le", "sub": "Ne cochez « oui » que si vous pouvez le montrer."}$post$
WHERE NOT EXISTS (SELECT 1 FROM posts WHERE date = '2026-12-17' AND topic = $post$Les questionnaires d'assurance$post$);

INSERT INTO posts (id, date, network, topic, pillar, status, body, visual)
SELECT replace(gen_random_uuid()::text, '-', ''), '2026-12-22', 'LinkedIn', $post$Pourquoi on ne passe pas directement à reject$post$, 'Conseil pratique', 'programme', $post$« DMARC p=reject tout de suite, c'est plus sûr, non ? »

Sur le papier, oui. En vrai, voici ce qui arrive souvent :

Votre logiciel de facturation envoie des mails en votre nom. Il n'est pas déclaré. Vous passez à reject. Vos factures n'arrivent plus. Personne ne s'en rend compte pendant trois semaines.

La bonne méthode :
1. DMARC en observation, avec une adresse de rapport
2. Lire les rapports : qui envoie en votre nom ?
3. Déclarer chaque service légitime
4. quarantine, puis reject

Quelques semaines. Pas quelques minutes. Mais sans casse.$post$, $post${"kicker": "DMARC", "big": "Par étapes", "sub": "none → quarantine → reject : quelques semaines, sans casse."}$post$
WHERE NOT EXISTS (SELECT 1 FROM posts WHERE date = '2026-12-22' AND topic = $post$Pourquoi on ne passe pas directement à reject$post$);

INSERT INTO posts (id, date, network, topic, pillar, status, body, visual)
SELECT replace(gen_random_uuid()::text, '-', ''), '2026-12-24', 'LinkedIn', $post$Synthèse gratuite : la proposition$post$, 'Offre', 'programme', $post$Ce mois-ci, j'ai parlé de faux RIB, de DMARC, de Microsoft 365 et de questionnaires d'assurance.

Si vous voulez savoir où en est votre entreprise, je vous propose ceci :

Envoyez-moi votre nom de domaine en message privé. Je vous réponds avec une synthèse d'une page : ce qui est en place, ce qui manque, par quoi commencer.

C'est gratuit, ça ne demande aucun accès, je lis seulement ce qui est public.

Je prends les 10 premiers.$post$, $post${"kicker": "Offert", "big": "1 page", "sub": "Envoyez-moi votre domaine : synthèse gratuite, sans aucun accès."}$post$
WHERE NOT EXISTS (SELECT 1 FROM posts WHERE date = '2026-12-24' AND topic = $post$Synthèse gratuite : la proposition$post$);

COMMIT;

-- Contrôle : les 8 posts de décembre, avec leur texte et leur image.
SELECT date, topic, length(body) AS caracteres, visual <> '' AS image FROM posts WHERE date BETWEEN '2026-12-01' AND '2026-12-31' ORDER BY date;
