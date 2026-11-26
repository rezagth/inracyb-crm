# Réglages Cal.com — textes prêts à coller (phase U, 26/11/2026)

## 1. Profil (Settings → My account → Profile → « About »)

> Consultant en cybersécurité pour les TPE et PME : fraude au faux RIB, sécurité de la messagerie, Microsoft 365, questionnaires d'assurance.
>
> Un seul interlocuteur, sans jargon. Prenez 15 minutes : je regarde avec vous les réglages publics de votre domaine et je vous dis par quoi commencer.
>
> www.infracyb.fr

(Retire les mentions « pentests », « SOC », « ISO 27001 » et la liste des plateformes : ton site dit que tu ne fais ni tests d'intrusion ni SOC.)

## 2. Rendez-vous principal (Event Types → New)

- **Title** : `Diagnostic messagerie offert — 15 min`
- **URL** : `cal.com/infracyb/diagnostic`
- **Duration** : 15 minutes
- **Location** : Cal Video (ou Google Meet)
- **Description** :

> 15 minutes en visio pour faire le point sur la sécurité de vos mails et de votre domaine.
>
> Avant le rendez-vous, je lis les réglages publics de votre domaine (SPF, DKIM, DMARC, certificat) : sans aucun accès ni mot de passe. Pendant l'échange, je vous dis ce qui est en place, ce qui manque, et par quoi commencer.
>
> Gratuit et sans engagement.

### Questions à la réservation (onglet « Advanced » → Booking questions → Add a question)

Le champ **Identifier** doit être exactement celui indiqué : c'est ce que lit le CRM.

| Question (Label) | Identifier | Type | Obligatoire |
|---|---|---|---|
| Nom de votre entreprise | `entreprise` | Short text | Oui |
| Site internet ou nom de domaine (ex. monentreprise.fr) | `site` | Short text | Oui |
| Le sujet qui vous amène | `sujet` | Select : Fraude au faux RIB · Messagerie piratée ou suspecte · DMARC / réglages mail · Questionnaire d'assurance ou de client · Autre | Oui |

Garde les questions par défaut « Your name », « Email address » et « Additional notes ».

### Réglages (onglet « Limits »)

- **Minimum notice** : 4 heures
- **Before event** : 0 · **After event** : 10 minutes (battement)
- **Limit booking frequency** : 4 par jour
- **Limit future bookings** : 30 jours

### Rappels (Workflows)

Crée un workflow « Rappel 24 h » : **Before event starts**, 24 heures, **Send email to attendee**, appliqué à ce rendez-vous.

## 3. Rendez-vous clients (facultatif)

- **Title** : `Échange — 30 min` · **URL** : `cal.com/infracyb/echange` · **Duration** : 30 minutes
- Pour les clients et les prospects déjà en discussion. Tu peux le masquer de la page publique (« Hidden ») et n'envoyer son lien qu'à la main.

Supprime ou masque « Cyber Call – 30 min » et « Flash Call – 15 min ».

## 4. Lien vers le CRM (Settings → Developer → Webhooks → New)

1. Génère un secret dans le terminal : `openssl rand -hex 32` et copie-le.
2. **Subscriber URL** : `https://inracyb-crm.vercel.app/api/webhooks/cal`
3. **Event triggers** : coche seulement **Booking Created**, **Booking Rescheduled**, **Booking Cancelled**.
4. **Secret** : colle le secret. **Payload template** : laisse le format par défaut.
5. Enregistre, puis dans **Vercel → Settings → Environment Variables** : `CAL_WEBHOOK_SECRET` = le même secret, en Production. Redéploie.
6. Bouton **« Ping test »** de Cal : le CRM doit répondre 200 (le ping est accepté sans effet).

## 5. Dans le CRM

**Intégrations → Réservation en ligne (Cal)** : colle `https://cal.com/infracyb/diagnostic`. Le lien apparaît alors dans le mail J+7, la synthèse envoyée aux prospects et les brouillons de réponse.
