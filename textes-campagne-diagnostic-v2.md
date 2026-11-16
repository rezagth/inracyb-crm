# Textes de la campagne Diagnostic — version 2 (phase D)

Écrits le 16/11/2026, après la phase C. Remplace `textes-campagne-diagnostic.md`.
À relire et corriger par toi avant mise en ligne : ce sont tes mails, envoyés en ton nom. Remplace « [mon prénom] ».

## Principe

Un texte commun par segment et par étape. Les parties qui dépendent du constat sont des champs remplis par le diagnostic :

| Champ | Contenu |
|---|---|
| `{objet_j0}` | objet du premier mail, selon la famille du constat |
| `{constat_principal}` | la phrase de constat (tableau 1) |
| `{impact}` | la phrase d'impact, selon la famille du constat et le segment (tableau 2) |
| `{piste_corrective}` | la correction générale (tableau 3), utilisée à J+3 |
| `{constat_secondaire}` | phrase facultative (tableau 4), ajoutée à J+3 seulement si elle s'applique |
| `{prenom}`, `{entreprise}`, `{domaine}`, `{date_expiration}`, `{signature}` | fiche du prospect, diagnostic, profil InfraCyb |

Constats utilisables en accroche principale (ceux que la phase C classe « certains ») : SPF absent, SPF en double, SPF en `+all`, DMARC absent, DMARC en `p=none`, certificat expiré ou expirant sous 14 jours.

HSTS absent n'est **pas** une accroche principale : le sujet est trop faible pour ouvrir une conversation. Il sert seulement de constat secondaire à J+3. Un prospect dont HSTS est le seul constat n'entre pas dans la campagne.

Deux familles : **A** = authentification du courrier (SPF, DMARC) ; **B** = certificat du site.

## Tableau 1 — `{constat_principal}` et `{objet_j0}`

| Constat | Famille | `{objet_j0}` | `{constat_principal}` |
|---|---|---|---|
| DMARC absent | A | Un point sur les réglages mail de {domaine} | aucune politique DMARC n'est publiée pour {domaine} : un tiers peut envoyer un message qui semble venir de votre domaine, sans que les messageries aient la consigne de le refuser |
| DMARC en `p=none` | A | Un point sur les réglages mail de {domaine} | la politique DMARC de {domaine} est en mode surveillance (`p=none`) : elle signale les usurpations mais ne les bloque pas |
| SPF absent | A | Un point sur les réglages mail de {domaine} | aucun enregistrement SPF n'est publié pour {domaine} : les messageries ne peuvent pas vérifier quels serveurs ont le droit d'envoyer en votre nom |
| SPF en double | A | Un point sur les réglages mail de {domaine} | deux enregistrements SPF sont publiés pour {domaine}, alors qu'un seul est admis : vos messages légitimes risquent d'être mal authentifiés |
| SPF en `+all` | A | Un point sur les réglages mail de {domaine} | l'enregistrement SPF de {domaine} se termine par `+all`, ce qui autorise n'importe quel serveur à envoyer en votre nom |
| Certificat expiré | B | Le certificat du site {domaine} | le certificat du site {domaine} a expiré le {date_expiration} : les visiteurs voient un avertissement de sécurité |
| Certificat expirant | B | Le certificat du site {domaine} | le certificat du site {domaine} expire le {date_expiration} : sans renouvellement, les visiteurs verront un avertissement de sécurité |

## Tableau 2 — `{impact}`

| Famille | Segment 1 (éditeurs, ESN, agences) | Segment 2 (cabinets) |
|---|---|---|
| A | Ces éléments reviennent souvent dans les questionnaires de sécurité que les grands clients envoient avant de signer. | Pour un cabinet qui échange chaque jour avec ses clients sur des documents sensibles, c'est un point que les fraudes au faux RIB exploitent régulièrement. |
| B | Un client ou un prospect qui voit cet avertissement peut s'inquiéter avant même de vous avoir contacté. | Vos clients qui visitent votre site voient cet avertissement, ce qui peut les inquiéter. |

## Tableau 3 — `{piste_corrective}` (J+3)

| Constat | Phrase |
|---|---|
| DMARC absent | la première étape consiste à publier une politique DMARC en mode surveillance, par un simple enregistrement DNS, pour recevoir des rapports sur qui envoie en votre nom ; on la durcit ensuite par étapes une fois les envois légitimes identifiés |
| DMARC en `p=none` | cette politique sert à observer ; une fois les rapports analysés et les envois légitimes tous conformes, on peut la durcir par étapes |
| SPF absent | il s'agit de publier un enregistrement SPF qui liste les services autorisés à envoyer en votre nom (messagerie, outil d'envoi, etc.) |
| SPF en double | il faut fusionner les deux enregistrements en un seul, qui liste l'ensemble des services autorisés |
| SPF en `+all` | il faut remplacer `+all` par une politique restrictive, après avoir listé les services légitimes |
| Certificat expiré ou expirant | le renouvellement est en général automatisable, par exemple chez l'hébergeur, pour que cela ne se reproduise pas |

## Tableau 4 — `{constat_secondaire}` (J+3, facultatif)

| Constat | Phrase |
|---|---|
| HSTS absent | J'ai aussi noté que le site n'envoie pas l'en-tête HSTS, un réglage simple à ajouter côté serveur. |

Pas d'autre constat secondaire : un domaine proche enregistré ou une information ne partent jamais seuls dans un mail.

## Règles

- Texte brut, sans pièce jointe, sans lien autre que le lien de désinscription ajouté par le moteur (qui ajoute aussi la mention de désinscription : ne pas la mettre dans les textes).
- Pas de « Re: » dans les objets, pas le mot « phishing ».
- Un mail dont un champ obligatoire est vide ne part pas.
- Les phrases des tableaux sont validées par moi (le propriétaire). Aucune ne doit être modifiée par le code ou générée automatiquement.

---

## Segment 1 — Éditeurs de logiciels B2B, ESN, agences digitales

### J0

Objet : {objet_j0}

Bonjour {prenom},

Je suis [mon prénom], RSSI externalisé chez InfraCyb. En regardant les réglages publics de {domaine}, j'ai relevé un point : {constat_principal}.

{impact}

Puis-je vous envoyer le détail, sur une page ?

{signature}

### J+3

Objet : Précision sur {domaine}

Bonjour {prenom},

Une précision utile sur le point relevé pour {domaine} : {piste_corrective}. {constat_secondaire}

Je vous envoie volontiers la page de synthèse si cela peut vous servir.

{signature}

### J+7

Objet : Questionnaires de sécurité chez {entreprise}

Bonjour {prenom},

Quand un client ou un prospect demande des garanties sur la sécurité de vos échanges, ce type de point est souvent l'un des premiers regardés. Un dossier de preuves (ce qui est en place, ce qui a été corrigé, ce qui reste à faire) permet de répondre vite, sans tout refaire à chaque demande.

Si un questionnaire de sécurité est en cours chez vous, je peux vous dire en quinze minutes ce que je regarderais en priorité. Cela vous serait utile ?

{signature}

### J+14

Objet : Dernier message de ma part

Bonjour {prenom},

Je ne vous écris plus après celui-ci. Si le sujet devient utile chez {entreprise} (questionnaire client, renouvellement d'assurance), la synthèse d'une page sur {domaine} reste disponible : il suffit de me répondre.

Bonne continuation,

{signature}

---

## Segment 2 — Cabinets d'expertise comptable, juridiques, courtiers

### J0

Objet : {objet_j0}

Bonjour {prenom},

Je suis [mon prénom], RSSI externalisé chez InfraCyb. En regardant les réglages publics de {domaine}, j'ai relevé un point : {constat_principal}.

{impact}

Puis-je vous envoyer le détail, sur une page ?

{signature}

### J+3

Objet : Précision sur {domaine}

Bonjour {prenom},

Une précision utile sur le point relevé pour {domaine} : {piste_corrective}. {constat_secondaire}

Je vous envoie volontiers la page de synthèse si cela peut vous servir.

{signature}

### J+7

Objet : Vos clients et les messages à votre nom

Bonjour {prenom},

Vos clients vous transmettent des documents et parfois des coordonnées bancaires par mail. S'ils reçoivent un faux message à votre nom, c'est vers vous qu'ils se retourneront. Un dossier de preuves (ce qui est en place, ce qui a été corrigé, ce qui reste à faire) permet de montrer que le sujet est maîtrisé, à vos clients comme à votre assureur.

Je peux vous dire en quinze minutes ce que je regarderais en priorité chez {entreprise}. Cela vous serait utile ?

{signature}

### J+14

Objet : Dernier message de ma part

Bonjour {prenom},

Je ne vous écris plus après celui-ci. Si le sujet devient utile pour {entreprise}, la synthèse d'une page sur {domaine} reste disponible : il suffit de me répondre.

Bonne continuation,

{signature}
