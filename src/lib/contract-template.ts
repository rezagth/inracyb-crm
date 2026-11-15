
/**
 * Modèle de contrat de mission InfraCyb + annexe de sous-traitance RGPD (article 28).
 * C'est un MODÈLE : il doit être relu par un juriste avant la première signature.
 * Aucun montant ni donnée du client n'est inventé : tout vient des champs saisis, et ce qui manque
 * est rendu sous la forme « [à compléter] ».
 */

export type ProviderIdentity = {
  legalName: string | null;
  representative: string | null;
  siret: string | null;
  address: string | null;
  email: string | null;
  insurer: string | null;
};

export type ContractInput = {
  clientName: string;
  clientSignatoryName: string | null;
  clientSignatoryRole: string | null;
  clientSiret: string | null;
  clientAddress: string | null;
  /** Prix en euros hors taxes, ou null si non fixé. */
  priceHT: number | null;
  durationDays: number | null;
  startDate: string | null; // AAAA-MM-JJ
  /** Périmètre de la mission (texte libre du dossier client). */
  scope: string | null;
  provider: ProviderIdentity;
  /** Conditions de paiement du CRM (Paramètres). */
  payDays: number | null;
  payMethod: string | null;
  latePenalty: string | null;
  tvaFranchise: boolean;
  /** Date d'émission, injectable pour les tests. */
  issuedAt?: Date;
};

export type ContractArticle = { title: string; paragraphs: string[] };
export type ContractDoc = {
  title: string;
  reference: string;
  articles: ContractArticle[];
  annex: { title: string; intro: string; articles: ContractArticle[] };
  /** Champs encore à compléter avant envoi (libellés), pour avertir l'administrateur. */
  missing: string[];
};

export const TODO = '[à compléter]';

const fmtDate = (iso: string | null) => {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return TODO;
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};
const fmtEuro = (n: number | null) =>
  n === null ? TODO : `${n.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} € HT`;

export function buildContract(input: ContractInput): ContractDoc {
  const p = input.provider;
  const issued = input.issuedAt ?? new Date();
  const missing: string[] = [];
  const need = (label: string, value: string | null) => {
    if (value === null || value === '') {
      missing.push(label);
      return TODO;
    }
    return value;
  };

  const providerName = need('Raison sociale du prestataire', p.legalName);
  const providerRep = need('Représentant du prestataire', p.representative);
  const providerSiret = need('SIRET du prestataire', p.siret);
  const providerAddress = need('Adresse du prestataire', p.address);
  const providerEmail = need('E-mail de contact du prestataire', p.email);
  const clientSiret = need('SIRET du client', input.clientSiret);
  const clientAddress = need('Adresse du client', input.clientAddress);
  const clientRep = need('Signataire du client', input.clientSignatoryName);
  const clientRole = input.clientSignatoryRole ?? TODO;
  if (input.priceHT === null) missing.push('Prix de la mission');
  if (input.durationDays === null) missing.push('Durée de la mission');
  if (!input.startDate) missing.push('Date de démarrage');
  if (!input.scope) missing.push('Périmètre de la mission');

  const reference = `CTR-${issued.toISOString().slice(0, 10).replace(/-/g, '')}-${input.clientName
    .normalize('NFD').replace(/[^\w]/g, '').toUpperCase().slice(0, 6) || 'CLIENT'}`;

  const articles: ContractArticle[] = [
    {
      title: 'Article 1 — Parties',
      paragraphs: [
        `Le prestataire : ${providerName}, SIRET ${providerSiret}, ${providerAddress}, représenté par ${providerRep} (« InfraCyb »).`,
        `Le client : ${input.clientName}, SIRET ${clientSiret}, ${clientAddress}, représenté par ${clientRep}, ${clientRole} (« le Client »).`,
      ],
    },
    {
      title: 'Article 2 — Objet et périmètre',
      paragraphs: [
        'InfraCyb réalise pour le Client une mission de conseil et d’audit organisationnel de cybersécurité (« la Mission »), à partir des informations et réponses fournies par le Client.',
        `Périmètre : ${input.scope ?? TODO}`,
        'Sont exclus, sauf accord écrit distinct : les tests d’intrusion, les audits de configuration ou de code source, l’analyse forensique et toute intervention sur les systèmes du Client.',
        'Des contrôles externes non intrusifs (scan) ne peuvent être réalisés qu’après la signature d’une lettre d’autorisation spécifique, précisant les cibles et la période.',
      ],
    },
    {
      title: 'Article 3 — Nature de la prestation',
      paragraphs: [
        'La Mission n’est pas une prestation qualifiée par l’ANSSI (PASSI, PACS). Elle ne remplace pas un audit qualifié lorsqu’une réglementation ou une autorité l’exige.',
        'Les livrables ne constituent ni une attestation de conformité (RGPD, NIS2, DORA, ISO 27001 ou autre), ni un avis juridique. Les scores sont indicatifs.',
      ],
    },
    {
      title: 'Article 4 — Livrables et déroulement',
      paragraphs: [
        'Livrables : questionnaire d’audit renseigné avec le Client, rapport d’audit, plan d’action priorisé et, si prévu au périmètre, restitution orale.',
        `Démarrage : ${fmtDate(input.startDate)}. Durée prévue : ${input.durationDays === null ? TODO : `${input.durationDays} jours`}, sous réserve de la disponibilité des informations et interlocuteurs du Client.`,
      ],
    },
    {
      title: 'Article 5 — Obligations du Client',
      paragraphs: [
        'Le Client désigne un interlocuteur, fournit des informations exactes et complètes dans les délais, et garantit disposer des droits nécessaires sur les systèmes et données concernés par la Mission.',
        'Le Client reste seul responsable de la mise en œuvre des recommandations et de ses décisions.',
      ],
    },
    {
      title: 'Article 6 — Prix et paiement',
      paragraphs: [
        `Prix forfaitaire de la Mission : ${fmtEuro(input.priceHT)}${input.tvaFranchise ? ' — TVA non applicable, article 293 B du CGI' : ', TVA en sus'}.`,
        `Facture émise à la remise des livrables ; paiement par ${input.payMethod ?? TODO} sous ${input.payDays === null ? TODO : `${input.payDays} jours`} à compter de la date de facture.`,
        `Tout retard de paiement entraîne des pénalités égales à ${input.latePenalty ?? TODO} et une indemnité forfaitaire de recouvrement de 40 € (Code de commerce, article L. 441-10).`,
      ],
    },
    {
      title: 'Article 7 — Confidentialité',
      paragraphs: [
        'Chaque partie garde confidentielles les informations non publiques reçues de l’autre, pendant la Mission et pendant les cinq ans qui suivent sa fin. Les rapports contiennent des informations sensibles sur la sécurité du Client : InfraCyb ne les communique à aucun tiers et les conserve de manière sécurisée.',
      ],
    },
    {
      title: 'Article 8 — Données personnelles',
      paragraphs: [
        'Pour les données personnelles du Client auxquelles InfraCyb accède dans le cadre de la Mission, InfraCyb agit en qualité de sous-traitant au sens de l’article 28 du RGPD, selon les termes de l’annexe jointe, qui fait partie du contrat.',
      ],
    },
    {
      title: 'Article 9 — Responsabilité',
      paragraphs: [
        'InfraCyb est tenue d’une obligation de moyens. Elle ne garantit ni l’absence de vulnérabilité ou d’incident, ni le résultat des actions recommandées.',
        `Sauf faute lourde ou dolosive, la responsabilité totale d’InfraCyb est limitée au montant hors taxes payé par le Client pour la Mission, à l’exclusion des dommages indirects. ${p.insurer ? `InfraCyb est assurée en responsabilité civile professionnelle auprès de ${p.insurer}.` : `Assurance responsabilité civile professionnelle : ${TODO}.`}`,
      ],
    },
    {
      title: 'Article 10 — Propriété intellectuelle',
      paragraphs: [
        'Les livrables sont cédés au Client pour son usage interne après paiement intégral. InfraCyb conserve ses méthodes, outils et savoir-faire.',
      ],
    },
    {
      title: 'Article 11 — Durée et résiliation',
      paragraphs: [
        'Le contrat prend effet à la signature et prend fin à la remise des livrables. Chaque partie peut le résilier par écrit en cas de manquement non corrigé 15 jours après mise en demeure ; les prestations déjà réalisées restent dues.',
      ],
    },
    {
      title: 'Article 12 — Droit applicable',
      paragraphs: [
        'Le contrat est soumis au droit français. À défaut d’accord amiable, les tribunaux compétents sont ceux du ressort du siège du prestataire.',
        `Fait en deux exemplaires à ${TODO}, le ${TODO}.`,
        `Pour InfraCyb : ${providerRep}        Pour le Client : ${clientRep}`,
      ],
    },
  ];

  const annex = {
    title: 'Annexe — Sous-traitance de données personnelles (article 28 du RGPD)',
    intro: `Entre ${input.clientName} (responsable de traitement) et ${providerName} (sous-traitant).`,
    articles: [
      {
        title: 'A1 — Objet, durée, nature et finalité',
        paragraphs: [
          'Objet : réalisation de la Mission décrite au contrat. Durée : celle de la Mission. Nature et finalité du traitement : consultation et analyse, pour les besoins exclusifs de l’audit, des informations et documents fournis par le Client.',
        ],
      },
      {
        title: 'A2 — Données et personnes concernées',
        paragraphs: [
          'Types de données : coordonnées professionnelles des collaborateurs, identifiants techniques et informations sur l’organisation du système d’information ; aucune donnée sensible n’est demandée.',
          'Personnes concernées : collaborateurs, dirigeants et prestataires du Client.',
        ],
      },
      {
        title: 'A3 — Obligations du sous-traitant',
        paragraphs: [
          'InfraCyb s’engage à : (a) traiter les données uniquement sur instruction documentée du Client ; (b) veiller à ce que les personnes autorisées à traiter les données soient tenues à la confidentialité ; (c) mettre en œuvre les mesures de sécurité de l’article 32 du RGPD ; (d) ne recruter un autre sous-traitant qu’avec l’autorisation écrite préalable du Client ; (e) aider le Client à répondre aux demandes d’exercice des droits des personnes ; (f) l’aider à respecter les articles 32 à 36 du RGPD ; (g) supprimer ou restituer les données au terme de la Mission, au choix du Client ; (h) mettre à disposition les informations nécessaires pour démontrer le respect de ces obligations et permettre les audits.',
          'InfraCyb informe le Client de toute violation de données personnelles dans les meilleurs délais après en avoir pris connaissance, afin que le Client puisse la notifier à la CNIL dans les 72 heures.',
        ],
      },
      {
        title: 'A4 — Sous-traitants ultérieurs et localisation',
        paragraphs: [
          `Sous-traitants ultérieurs autorisés (hébergement, messagerie, outils) : ${TODO}. Localisation des données : ${TODO}. Tout transfert hors de l’Union européenne est soumis aux garanties du chapitre V du RGPD.`,
        ],
      },
    ],
  };

  return {
    title: 'Contrat de mission d’audit de cybersécurité',
    reference,
    articles,
    annex,
    missing: Array.from(new Set(missing)),
  };
}
