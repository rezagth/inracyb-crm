-- Phase S (26/11/2026) : un post LinkedIn par jour ouvré, du 27/11 au 31/12/2026 (hors 25/12), en plus des 8 posts de la phase Q.
-- Les posts sont ajoutés au statut « Programmé » : ils partent tout seuls le jour prévu. Pour en bloquer un, passe-le en « Rédigé ».
-- Rejouable sans danger : un post n'est ajouté que s'il n'existe pas déjà à la même date avec le même sujet. Aucune table modifiée.
-- psql "$PROD_URL" -X -v ON_ERROR_STOP=1 -f drizzle-manuel-phase-s.sql

BEGIN;

INSERT INTO posts (id, date, network, topic, pillar, status, body, visual)
SELECT replace(gen_random_uuid()::text, '-', ''), '2026-11-27', 'LinkedIn', $post$Qui s'occupe de vos mails ?$post$, 'Coulisses', 'programme', $post$Une question simple pour finir la semaine.

Dans votre entreprise, qui s'occupe des réglages de sécurité de vos mails ?

→ Votre prestataire informatique
→ Quelqu'un en interne, « parce qu'il s'y connaît »
→ Personne, en fait

Je pose la question parce que c'est souvent la troisième réponse. Pas par négligence : simplement parce que tout fonctionne, donc personne n'y pense.

Jusqu'au jour où un client reçoit un faux mail à votre nom.

Je suis consultant en cybersécurité pour les TPE et PME. Mon travail, c'est justement de m'occuper de ces sujets-là, sans jargon.

Et chez vous, c'est quelle réponse ?$post$, $post${"kicker": "Question du vendredi", "big": "Qui s'en occupe ?", "sub": "Les réglages de sécurité de votre messagerie : qui les surveille chez vous ?"}$post$
WHERE NOT EXISTS (SELECT 1 FROM posts WHERE date = '2026-11-27' AND topic = $post$Qui s'occupe de vos mails ?$post$);

INSERT INTO posts (id, date, network, topic, pillar, status, body, visual)
SELECT replace(gen_random_uuid()::text, '-', ''), '2026-11-30', 'LinkedIn', $post$420 000 demandes d'aide en 2024$post$, 'Expertise', 'programme', $post$420 000.

C'est le nombre de demandes d'assistance reçues par Cybermalveillance.gouv.fr en 2024. +49,9 % en un an.

Pour les entreprises, les trois premières causes :
→ l'hameçonnage (les faux mails qui piègent)
→ le piratage de compte, souvent la messagerie
→ les rançongiciels

Ce qui frappe : ce ne sont pas des attaques sophistiquées. Ce sont des faux mails, des mots de passe volés, des comptes mal protégés.

Autrement dit, la plupart se préviennent avec des réglages simples, faits une bonne fois.

Source : rapport d'activité 2024 de Cybermalveillance.gouv.fr.$post$, $post${"kicker": "Cybermalveillance.gouv.fr · 2024", "big": "420 000", "sub": "demandes d'assistance en un an, en hausse de 50 %"}$post$
WHERE NOT EXISTS (SELECT 1 FROM posts WHERE date = '2026-11-30' AND topic = $post$420 000 demandes d'aide en 2024$post$);

INSERT INTO posts (id, date, network, topic, pillar, status, body, visual)
SELECT replace(gen_random_uuid()::text, '-', ''), '2026-12-02', 'LinkedIn', $post$L'erreur n°1 : le même mot de passe partout$post$, 'Conseil pratique', 'programme', $post$L'erreur que je vois le plus souvent : le même mot de passe pour plusieurs comptes.

Le scénario est toujours le même :
1. Un site où vous avez un compte se fait voler sa base de données.
2. Votre mot de passe circule.
3. Quelqu'un l'essaie sur votre messagerie. Et ça marche.

À partir de là, il peut lire vos échanges, écrire en votre nom, envoyer un faux RIB à vos clients.

Ce qui protège vraiment :
→ un mot de passe différent par compte, rangé dans un gestionnaire de mots de passe
→ la double authentification sur la messagerie, en priorité absolue

Avec la double authentification, un mot de passe volé ne suffit plus.$post$, $post${"kicker": "Erreur courante", "big": "1 mot de passe", "sub": "réutilisé partout : une seule fuite suffit pour ouvrir tous vos comptes"}$post$
WHERE NOT EXISTS (SELECT 1 FROM posts WHERE date = '2026-12-02' AND topic = $post$L'erreur n°1 : le même mot de passe partout$post$);

INSERT INTO posts (id, date, network, topic, pillar, status, body, visual)
SELECT replace(gen_random_uuid()::text, '-', ''), '2026-12-04', 'LinkedIn', $post$Comment je lis un domaine en 30 secondes$post$, 'Coulisses', 'programme', $post$Les coulisses de mon métier, version courte.

Quand je regarde la sécurité mail d'une entreprise, je commence par trois informations publiques, lisibles par n'importe qui :

1. Le SPF : la liste des serveurs autorisés à envoyer vos mails.
2. Le DKIM : la signature qui prouve qu'un mail vient bien de vous.
3. Le DMARC : la consigne donnée aux messageries quand un mail ne passe pas ces contrôles.

Aucun accès, aucun mot de passe, aucun test intrusif. Juste ce que votre domaine publie lui-même.

En 30 secondes, je sais si un escroc peut envoyer un mail avec votre adresse exacte.

Vous voulez que je regarde le vôtre ? Envoyez-moi votre nom de domaine en message privé.$post$, $post${"kicker": "Coulisses", "big": "30 secondes", "sub": "pour savoir si un domaine est protégé contre les faux mails"}$post$
WHERE NOT EXISTS (SELECT 1 FROM posts WHERE date = '2026-12-04' AND topic = $post$Comment je lis un domaine en 30 secondes$post$);

INSERT INTO posts (id, date, network, topic, pillar, status, body, visual)
SELECT replace(gen_random_uuid()::text, '-', ''), '2026-12-07', 'LinkedIn', $post$73 % des PME sous Microsoft 365$post$, 'Expertise', 'programme', $post$73 %.

C'est la part des PME de mon baromètre dont la messagerie tourne sous Microsoft 365.

C'est une bonne solution. Mais c'est aussi pour ça que c'est la cible préférée des pirates : un seul type de faux écran de connexion fonctionne sur des millions d'entreprises.

Les trois réglages que je vérifie en premier :
→ la double authentification, activée pour tout le monde
→ les règles de transfert automatique, que personne ne regarde jamais
→ les comptes des anciens collaborateurs, encore actifs

Aucun n'est compliqué. Mais il faut que quelqu'un s'en occupe.

Le baromètre complet : www.infracyb.fr/barometre-messagerie$post$, $post${"kicker": "Baromètre · 74 PME", "big": "73 %", "sub": "des PME analysées utilisent Microsoft 365 pour leur messagerie"}$post$
WHERE NOT EXISTS (SELECT 1 FROM posts WHERE date = '2026-12-07' AND topic = $post$73 % des PME sous Microsoft 365$post$);

INSERT INTO posts (id, date, network, topic, pillar, status, body, visual)
SELECT replace(gen_random_uuid()::text, '-', ''), '2026-12-09', 'LinkedIn', $post$Le changement de RIB reçu par mail$post$, 'Conseil pratique', 'programme', $post$« Bonjour, notre banque a changé, merci d'utiliser ce nouveau RIB pour vos prochains règlements. »

Ce mail, beaucoup d'entreprises l'ont déjà reçu. Il peut venir d'un fournisseur piraté, ou d'un escroc qui s'en fait passer pour lui.

L'erreur, c'est de mettre à jour le RIB directement à partir du mail.

La règle qui arrête cette fraude, quelle que soit la technique utilisée :
→ tout changement de coordonnées bancaires se confirme par téléphone
→ à un numéro déjà connu, jamais celui indiqué dans le mail

Elle ne coûte rien. Elle prend deux minutes. Écrivez-la, et faites-la connaître à toute l'équipe, comptabilité en tête.

C'est la protection la plus rentable que je connaisse.$post$, $post${"kicker": "Erreur courante", "big": "Un appel", "sub": "à un numéro déjà connu, avant tout changement de RIB"}$post$
WHERE NOT EXISTS (SELECT 1 FROM posts WHERE date = '2026-12-09' AND topic = $post$Le changement de RIB reçu par mail$post$);

INSERT INTO posts (id, date, network, topic, pillar, status, body, visual)
SELECT replace(gen_random_uuid()::text, '-', ''), '2026-12-11', 'LinkedIn', $post$Avez-vous déjà reçu un faux mail à votre nom ?$post$, 'Coulisses', 'programme', $post$Question du vendredi.

Avez-vous déjà découvert qu'un mail avait été envoyé à votre nom, sans que vous l'ayez écrit ?

Un client qui vous appelle pour un « changement de RIB ». Un fournisseur surpris par une demande étrange. Un contact qui vous demande si votre boîte a été piratée.

Souvent, on ne l'apprend que par hasard. Et parfois, trop tard.

Je suis curieux de vos expériences, en commentaire ou en message privé. Sans nom d'entreprise, évidemment.

Elles m'aident à expliquer ces fraudes avec des cas réels plutôt qu'avec des théories.$post$, $post${"kicker": "Question du vendredi", "big": "Et vous ?", "sub": "Avez-vous déjà vu un faux mail envoyé à votre nom ?"}$post$
WHERE NOT EXISTS (SELECT 1 FROM posts WHERE date = '2026-12-11' AND topic = $post$Avez-vous déjà reçu un faux mail à votre nom ?$post$);

INSERT INTO posts (id, date, network, topic, pillar, status, body, visual)
SELECT replace(gen_random_uuid()::text, '-', ''), '2026-12-14', 'LinkedIn', $post$16 % sans aucune protection DMARC$post$, 'Expertise', 'programme', $post$16 %.

C'est la part des PME de mon baromètre qui ne publient aucune politique DMARC.

Concrètement : si un escroc envoie un mail avec leur adresse exacte, les messageries de leurs clients n'ont aucune consigne pour le refuser.

Et 41 % de plus en ont une, mais en mode observation (« p=none ») : elle signale les faux mails, sans les bloquer.

Au total, 57 % des entreprises analysées n'ont aucune protection DMARC qui bloque réellement les usurpations.

La bonne nouvelle : c'est un réglage public, gratuit, qui se fait par étapes, sans bloquer les vrais mails.

Méthode et chiffres : www.infracyb.fr/barometre-messagerie$post$, $post${"kicker": "Baromètre · 74 PME", "big": "16 %", "sub": "des PME analysées ne publient aucune politique DMARC"}$post$
WHERE NOT EXISTS (SELECT 1 FROM posts WHERE date = '2026-12-14' AND topic = $post$16 % sans aucune protection DMARC$post$);

INSERT INTO posts (id, date, network, topic, pillar, status, body, visual)
SELECT replace(gen_random_uuid()::text, '-', ''), '2026-12-16', 'LinkedIn', $post$Les comptes des anciens salariés$post$, 'Conseil pratique', 'programme', $post$Une porte souvent oubliée : les comptes des personnes qui ont quitté l'entreprise.

Le stagiaire de l'an dernier. L'associé parti il y a deux ans. Le prestataire qui avait un accès « temporaire ».

Leurs comptes sont parfois encore actifs. Personne ne les surveille, et si leur mot de passe a fuité ailleurs, personne ne s'en rendra compte.

Ce que je conseille :
→ une liste simple des comptes et de leurs propriétaires
→ une règle : le jour du départ, le compte est fermé ou bloqué
→ une vérification deux fois par an

Dans Microsoft 365, cette liste se consulte en quelques minutes. Le plus dur, c'est d'y penser.$post$, $post${"kicker": "Erreur courante", "big": "Comptes oubliés", "sub": "Un ancien collaborateur parti = un compte à fermer le jour même"}$post$
WHERE NOT EXISTS (SELECT 1 FROM posts WHERE date = '2026-12-16' AND topic = $post$Les comptes des anciens salariés$post$);

INSERT INTO posts (id, date, network, topic, pillar, status, body, visual)
SELECT replace(gen_random_uuid()::text, '-', ''), '2026-12-18', 'LinkedIn', $post$Les fêtes, période préférée des escrocs$post$, 'Conseil pratique', 'programme', $post$Les deux semaines qui arrivent sont une période idéale pour les escrocs.

Pourquoi :
→ les équipes sont réduites, la personne qui vérifie d'habitude est en congé
→ tout le monde veut boucler avant les fêtes, donc tout est « urgent »
→ les faux mails de livraison de colis se fondent dans la masse

Trois rappels à faire passer à l'équipe avant de partir :
1. Aucun virement ni changement de RIB sans vérification par téléphone, même « urgent ».
2. Un lien de livraison reçu par mail ou SMS : on passe par le site du transporteur, pas par le lien.
3. En cas de doute, on attend. Une vraie urgence survit à un appel de vérification.

Bonnes fêtes, et bonne vigilance.$post$, $post${"kicker": "Avant les congés", "big": "Vigilance", "sub": "Équipes réduites, urgences et colis : la période idéale pour les faux mails"}$post$
WHERE NOT EXISTS (SELECT 1 FROM posts WHERE date = '2026-12-18' AND topic = $post$Les fêtes, période préférée des escrocs$post$);

INSERT INTO posts (id, date, network, topic, pillar, status, body, visual)
SELECT replace(gen_random_uuid()::text, '-', ''), '2026-12-21', 'LinkedIn', $post$64 000 demandes d'aide pour l'hameçonnage$post$, 'Expertise', 'programme', $post$64 000.

C'est le nombre de demandes d'assistance pour hameçonnage reçues par Cybermalveillance.gouv.fr en 2024. C'est la première menace, tous publics confondus.

L'hameçonnage, c'est le faux mail qui vous pousse à cliquer, à donner un mot de passe ou à payer.

Ce qui a changé ces dernières années : les faux mails sont mieux écrits, mieux ciblés, et reprennent le nom de vos vrais fournisseurs ou de vos vrais clients.

Ce qui marche encore :
→ ne jamais saisir un mot de passe depuis un lien reçu par mail
→ la double authentification, qui rend un mot de passe volé inutile
→ un réflexe : en cas de demande inhabituelle, on vérifie par un autre canal

Source : rapport d'activité 2024 de Cybermalveillance.gouv.fr.$post$, $post${"kicker": "Cybermalveillance.gouv.fr · 2024", "big": "64 000", "sub": "demandes d'assistance pour hameçonnage, première menace en France"}$post$
WHERE NOT EXISTS (SELECT 1 FROM posts WHERE date = '2026-12-21' AND topic = $post$64 000 demandes d'aide pour l'hameçonnage$post$);

INSERT INTO posts (id, date, network, topic, pillar, status, body, visual)
SELECT replace(gen_random_uuid()::text, '-', ''), '2026-12-23', 'LinkedIn', $post$Des sauvegardes jamais testées$post$, 'Conseil pratique', 'programme', $post$« On a des sauvegardes. »

C'est la réponse que j'entends le plus souvent. La question suivante est plus gênante : « Quand avez-vous restauré un fichier pour la dernière fois ? »

Une sauvegarde jamais testée, c'est une promesse. Le jour où vous en avez besoin, vous découvrez parfois qu'elle s'est arrêtée il y a six mois, ou qu'elle est sur le même réseau que les fichiers chiffrés par le rançongiciel.

Trois vérifications simples :
→ restaurer un fichier au hasard, une fois par trimestre
→ garder au moins une copie déconnectée du réseau
→ noter la date du test : votre assureur vous la demandera

C'est un des points les plus regardés dans les questionnaires d'assurance cyber.$post$, $post${"kicker": "Erreur courante", "big": "Testée ?", "sub": "Une sauvegarde qui n'a jamais été restaurée n'est qu'une promesse"}$post$
WHERE NOT EXISTS (SELECT 1 FROM posts WHERE date = '2026-12-23' AND topic = $post$Des sauvegardes jamais testées$post$);

INSERT INTO posts (id, date, network, topic, pillar, status, body, visual)
SELECT replace(gen_random_uuid()::text, '-', ''), '2026-12-28', 'LinkedIn', $post$38 % des SPF trop permissifs$post$, 'Expertise', 'programme', $post$38 %.

C'est la part des PME de mon baromètre dont l'enregistrement SPF se termine par « ~all » plutôt que par « -all ».

En clair : le SPF liste les serveurs autorisés à envoyer vos mails. La fin de la ligne dit ce qu'il faut faire des autres.
→ « -all » : les autres ne sont pas autorisés
→ « ~all » : les autres sont suspects, mais on laisse passer

Ce n'est pas une catastrophe en soi : c'est DMARC qui décide au final. Mais c'est souvent le signe que personne n'a fini le travail.

Avant de passer à « -all », il faut être sûr d'avoir listé tous vos services d'envoi : messagerie, facturation, newsletters.

Comme toujours : par étapes.$post$, $post${"kicker": "Baromètre · 74 PME", "big": "38 %", "sub": "des PME analysées ont un SPF permissif plutôt que strict"}$post$
WHERE NOT EXISTS (SELECT 1 FROM posts WHERE date = '2026-12-28' AND topic = $post$38 % des SPF trop permissifs$post$);

INSERT INTO posts (id, date, network, topic, pillar, status, body, visual)
SELECT replace(gen_random_uuid()::text, '-', ''), '2026-12-29', 'LinkedIn', $post$Une résolution simple pour 2027$post$, 'Conseil pratique', 'programme', $post$Si vous ne deviez prendre qu'une résolution de sécurité pour 2027 :

Activer la double authentification sur toutes les messageries de l'entreprise.

Pourquoi celle-là :
→ le piratage de compte est la deuxième menace pour les entreprises (Cybermalveillance.gouv.fr, 2024)
→ la plupart de ces piratages partent d'un mot de passe volé
→ avec la double authentification, un mot de passe volé ne suffit plus

C'est gratuit dans Microsoft 365 comme dans Google Workspace. Ça prend une heure pour une petite équipe.

Et c'est la première question des questionnaires d'assurance cyber.

Une heure en janvier, pour toute l'année.$post$, $post${"kicker": "Pour 2027", "big": "Une seule", "sub": "La double authentification sur toutes les messageries de l'entreprise"}$post$
WHERE NOT EXISTS (SELECT 1 FROM posts WHERE date = '2026-12-29' AND topic = $post$Une résolution simple pour 2027$post$);

INSERT INTO posts (id, date, network, topic, pillar, status, body, visual)
SELECT replace(gen_random_uuid()::text, '-', ''), '2026-12-30', 'LinkedIn', $post$Le mot de passe partagé dans l'équipe$post$, 'Conseil pratique', 'programme', $post$« contact@ », « compta@ », « accueil@ » : beaucoup d'entreprises ont une boîte commune, avec un mot de passe connu de toute l'équipe.

Parfois écrit sur un post-it. Parfois envoyé par mail. Rarement changé, même après un départ.

Le problème : ces boîtes reçoivent souvent les demandes de paiement et les échanges avec les clients. Exactement ce que visent les escrocs.

Ce qui marche mieux :
→ une boîte partagée, à laquelle chacun accède avec son propre compte (c'est prévu dans Microsoft 365)
→ la double authentification sur chaque compte
→ et si un mot de passe commun reste indispensable : un gestionnaire de mots de passe, et un changement à chaque départ

Moins pratique au début. Beaucoup plus sûr ensuite.$post$, $post${"kicker": "Erreur courante", "big": "Partagé ?", "sub": "Un compte commun avec un mot de passe que tout le monde connaît"}$post$
WHERE NOT EXISTS (SELECT 1 FROM posts WHERE date = '2026-12-30' AND topic = $post$Le mot de passe partagé dans l'équipe$post$);

INSERT INTO posts (id, date, network, topic, pillar, status, body, visual)
SELECT replace(gen_random_uuid()::text, '-', ''), '2026-12-31', 'LinkedIn', $post$5 vérifications pour démarrer 2027$post$, 'Conseil pratique', 'programme', $post$Dernier post de l'année : cinq vérifications à faire en janvier.

1. La double authentification est-elle activée sur toutes les messageries ?
2. Votre domaine a-t-il un DMARC qui bloque (quarantine ou reject), et pas seulement « p=none » ?
3. Les comptes des anciens collaborateurs sont-ils fermés ?
4. Avez-vous restauré une sauvegarde depuis moins de trois mois ?
5. L'équipe connaît-elle la règle : tout changement de RIB se vérifie par téléphone ?

Cinq « oui », et vous êtes déjà mieux protégé que la plupart des PME que j'ai analysées cette année.

Un « non » ou un doute ? Envoyez-moi votre nom de domaine en message privé : je vous réponds avec une synthèse d'une page, gratuite.

Bonne année 2027.$post$, $post${"kicker": "Check-list 2027", "big": "5 vérifications", "sub": "à faire en janvier pour démarrer l'année protégé"}$post$
WHERE NOT EXISTS (SELECT 1 FROM posts WHERE date = '2026-12-31' AND topic = $post$5 vérifications pour démarrer 2027$post$);

COMMIT;

-- Contrôle : un post par jour ouvré jusqu'au 31/12 (hors 25/12).
SELECT date, topic, status, length(body) AS caracteres, visual <> '' AS image FROM posts WHERE date BETWEEN '2026-11-27' AND '2026-12-31' ORDER BY date;
