# Calendrier LinkedIn — 4 semaines, 8 posts (préparé le 26/11/2026)

**Rythme :** mardi et jeudi, entre 8 h et 9 h. **Format :** texte seul, phrases courtes, une idée par post.
**Règle d'or :** chaque post se termine par une question ou une proposition simple. Réponds à **tous** les commentaires dans la journée : c'est ce qui fait circuler le post.
**À ne jamais mettre :** le nom d'un prospect ou d'un domaine que tu as diagnostiqué.

Après chaque post, **envoie 5 à 10 invitations** à des dirigeants de ta cible (agences immobilières, cabinets, ESN), sans message commercial. Ils verront tes posts suivants.

---

## Semaine 1

### Mardi : « Je l'ai fait chez moi d'abord »
> Ce matin, j'ai corrigé un réglage sur mon propre domaine.
>
> Mon DMARC était en « p=none ». En clair : n'importe qui pouvait envoyer un mail avec l'adresse contact@infracyb.fr, et les messageries de mes destinataires n'avaient aucune consigne pour le refuser.
>
> Pour quelqu'un qui conseille des entreprises en cybersécurité, c'était gênant.
>
> C'est corrigé : les faux mails à mon nom partent maintenant dans les indésirables. Dans deux semaines, s'il n'y a pas de surprise dans les rapports, ils seront refusés.
>
> Pourquoi pas tout de suite ? Parce que bloquer trop vite peut bloquer vos vrais mails (facturation, paie, newsletters). On y va par étapes.
>
> Et vous, vous savez ce que dit votre DMARC ?

### Jeudi : le chiffre du baromètre
> J'ai regardé les réglages de messagerie de 74 PME françaises. Uniquement des informations publiques.
>
> 57 % n'ont aucune protection DMARC qui bloque les faux mails.
>
> Concrètement : un escroc peut envoyer un « changement de RIB » avec leur adresse exacte, et il arrivera chez leurs clients.
>
> 73 % sont sous Microsoft 365. 38 % ont un SPF permissif.
>
> La méthode et les limites sont détaillées ici : www.infracyb.fr/barometre-messagerie
>
> Ça vous surprend, ou c'est ce que vous voyez aussi ?

---

## Semaine 2

### Mardi : le faux RIB, expliqué simplement
> La fraude au faux RIB, en 3 étapes :
>
> 1. Un escroc écrit à vos clients « de votre part » : « nous avons changé de banque ».
> 2. Le mail a l'air de venir de chez vous. Parfois, il vient vraiment de chez vous : une boîte piratée.
> 3. Le client paie. Puis il se retourne vers vous.
>
> Les trois protections qui marchent :
> → un DMARC qui bloque (contre les faux mails avec votre adresse)
> → la double authentification (contre le vol de boîte)
> → une règle simple : tout changement de RIB se vérifie par téléphone, à un numéro déjà connu
>
> La troisième ne coûte rien et arrête la fraude même quand le reste a échoué.
>
> Vous l'avez, cette règle, chez vous ?

### Jeudi : ce que DMARC ne fait pas
> On me demande souvent : « si je règle DMARC, je suis protégé du phishing ? »
>
> Non. DMARC fait une chose, et la fait bien : il empêche d'utiliser votre adresse exacte.
>
> Il ne protège pas :
> → d'une adresse qui ressemble à la vôtre (une lettre changée)
> → d'un faux nom affiché devant une adresse Gmail
> → d'une boîte dont le mot de passe a été volé
>
> C'est pour ça que je ne vends jamais DMARC comme une solution miracle. C'est une brique. Indispensable, mais une brique.

---

## Semaine 3

### Mardi : compte Microsoft 365 piraté, les signes
> Le piratage de compte est la 2e raison pour laquelle les entreprises demandent de l'aide à Cybermalveillance.gouv.fr. +55 % en un an.
>
> 4 signes qu'une boîte Microsoft 365 est compromise :
> → des contacts reçoivent des mails que personne n'a écrits
> → une règle de transfert que personne n'a créée
> → une demande de validation de connexion que vous n'avez pas faite
> → une connexion depuis un pays inhabituel
>
> Le premier réflexe d'un pirate, c'est souvent la règle de transfert. Allez vérifier les vôtres : 2 minutes dans Outlook, Paramètres → Courrier → Règles.
>
> Vous en avez trouvé une que vous ne connaissiez pas ?

### Jeudi : les questionnaires d'assurance
> Les assureurs cyber ne se contentent plus d'une case cochée.
>
> Double authentification, sauvegardes isolées, protection des postes : ils demandent des preuves. Une réponse inexacte peut vous être opposée le jour du sinistre.
>
> Mon conseil : ne cochez « oui » que si vous pouvez le prouver. Et rassemblez les preuves une fois, dans un seul document, plutôt que de tout refaire à chaque questionnaire.
>
> Un « non, mais c'est prévu pour mars » avec un plan daté est mieux reçu qu'un « oui » fragile.

---

## Semaine 4

### Mardi : pourquoi on ne passe pas directement à reject
> « DMARC p=reject tout de suite, c'est plus sûr, non ? »
>
> Sur le papier, oui. En vrai, voici ce qui arrive souvent :
>
> Votre logiciel de facturation envoie des mails en votre nom. Il n'est pas déclaré. Vous passez à reject. Vos factures n'arrivent plus. Personne ne s'en rend compte pendant trois semaines.
>
> La bonne méthode :
> 1. DMARC en observation, avec une adresse de rapport
> 2. Lire les rapports : qui envoie en votre nom ?
> 3. Déclarer chaque service légitime
> 4. quarantine, puis reject
>
> Quelques semaines. Pas quelques minutes. Mais sans casse.

### Jeudi : la proposition
> Ce mois-ci, j'ai parlé de faux RIB, de DMARC, de Microsoft 365 et de questionnaires d'assurance.
>
> Si vous voulez savoir où en est votre entreprise, je vous propose ceci :
>
> Envoyez-moi votre nom de domaine en message privé. Je vous réponds avec une synthèse d'une page : ce qui est en place, ce qui manque, par quoi commencer.
>
> C'est gratuit, ça ne demande aucun accès, je lis seulement ce qui est public.
>
> Je prends les 10 premiers.

---

## Quand quelqu'un t'envoie son domaine en message privé
1. Crée la fiche dans le CRM (Entreprises → Nouvelle), avec le site et l'adresse e-mail.
2. Lance le diagnostic (Campagnes → onglet Diagnostic).
3. Copie le **lien de la synthèse** depuis la fiche et envoie-le en réponse, avec une phrase : « Le point principal est [constat]. Voulez-vous qu'on en parle 15 minutes ? [lien de réservation] ».
4. La fiche te propose l'offre adaptée et le devis en un clic.
