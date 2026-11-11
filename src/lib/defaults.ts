/** Contenus de départ utiles (procédures, obligations, registre RGPD, modèles de documents, partenaires à trouver).
 * Ajoutés une seule fois à la première ouverture ; tout est ensuite modifiable ou supprimable. Aucune donnée client fictive. */
export const DEFAULTS = {
 "kb": [
  {
   "title": "Procédure de réponse à incident (client)",
   "category": "Procédure",
   "body": "1. Isoler : débrancher le poste du réseau (câble et Wi-Fi), sans l'éteindre.\n2. Prévenir : moi, le dirigeant, puis l'assureur cyber si le client en a un.\n3. Préserver les preuves : ne rien supprimer, noter l'heure et ce qui a été vu.\n4. Évaluer : quelles données et quels systèmes sont touchés ? Des données personnelles ? Si oui et s'il existe un risque pour les personnes, le client (responsable de traitement) doit notifier la CNIL dans les 72 heures (article 33 du RGPD).\n5. Signaler : plainte si besoin, et assistance sur cybermalveillance.gouv.fr.\n6. Restaurer depuis une sauvegarde saine, changer les mots de passe concernés.\n7. Retour d'expérience : ce qui a permis l'incident, ce qu'on corrige, mise à jour du plan d'action."
  },
  {
   "title": "Checklist d'arrivée d'un nouveau client RSSI",
   "category": "Checklist",
   "body": "☐ Contrat RSSI signé et accord de sous-traitance RGPD (article 28)\n☐ Contacts : dirigeant, référent interne, prestataire informatique, assureur\n☐ Accès nominatifs pour moi, avec double authentification (jamais de compte partagé)\n☐ Inventaire du matériel, des logiciels et des comptes\n☐ Audit initial et plan d'action priorisé\n☐ Calendrier des comités mensuels\n☐ Procédure d'incident remise au client\n☐ Facturation mensuelle et prélèvement en place"
  },
  {
   "title": "Checklist avant d'émettre une facture",
   "category": "Checklist",
   "body": "☐ Bon client et bonne adresse de facturation\n☐ Numéro à la suite du précédent (pas de trou)\n☐ Lignes, quantités et prix conformes au devis\n☐ Mentions : nom + EI, SIRET, « TVA non applicable, art. 293 B du CGI » si franchise, pénalités de retard, indemnité de 40 €\n☐ Date d'échéance\n☐ IBAN ou lien de paiement\n☐ Envoi au bon interlocuteur, puis statut « Envoyée »"
  },
  {
   "title": "Trame du comité sécurité mensuel",
   "category": "Modèle",
   "body": "1. Avancement du plan d'action (fait, en cours, à venir)\n2. Incidents du mois et enseignements\n3. Demandes de support traitées\n4. Points de vigilance (menaces du moment, fournisseurs, départs/arrivées)\n5. Décisions à prendre par le dirigeant\n6. Priorités du mois prochain\n\nAstuce : le bouton « Compte rendu de comité » de la page Plans d'action prépare ce document automatiquement."
  }
 ],
 "obligations": [
  {
   "title": "Déclarer la micro-entreprise (guichet unique)",
   "category": "Création",
   "due": "",
   "done": false,
   "note": "Sur le guichet unique des formalités d'entreprises."
  },
  {
   "title": "Demander l'ACRE",
   "category": "Création",
   "due": "",
   "done": false,
   "note": "Le délai de demande est court après la création : vérifie-le sur urssaf.fr."
  },
  {
   "title": "Ouvrir un compte bancaire dédié",
   "category": "Finance",
   "due": "",
   "done": false,
   "note": "Obligatoire si le CA dépasse 10 000 € deux années civiles de suite ; recommandé dès le début."
  },
  {
   "title": "Souscrire une assurance RC Pro",
   "category": "Assurance",
   "due": "",
   "done": false,
   "note": "Indispensable pour du conseil en cybersécurité."
  },
  {
   "title": "Tenir le livre des recettes",
   "category": "Comptabilité",
   "due": "",
   "done": true,
   "note": "Généré depuis les factures payées (page Factures)."
  },
  {
   "title": "Déclarer et payer le CA d'octobre à l'URSSAF",
   "category": "Social",
   "due": "2026-11-30",
   "done": false,
   "note": "Montant estimé dans Trésorerie. Périodicité réglable dans Paramètres."
  },
  {
   "title": "Déclaration initiale de CFE (1447-C-SD)",
   "category": "Fiscal",
   "due": "2026-12-31",
   "done": false,
   "note": "L'année de création ; la CFE n'est pas due la première année."
  },
  {
   "title": "Reporter le CA sur la déclaration de revenus (2042-C-PRO)",
   "category": "Fiscal",
   "due": "2027-05-31",
   "done": false,
   "note": "Date exacte selon le calendrier fiscal 2027."
  },
  {
   "title": "Être prêt à recevoir les factures électroniques",
   "category": "Facturation",
   "due": "2026-09-01",
   "done": false,
   "note": "Réforme de la facturation électronique : réception pour toutes les entreprises, émission pour les micro-entreprises plus tard. Dates et plateforme à vérifier sur impots.gouv.fr."
  },
  {
   "title": "Mentions obligatoires sur devis et factures",
   "category": "Facturation",
   "due": "",
   "done": true,
   "note": "EI, SIRET, TVA non applicable (art. 293 B du CGI), pénalités, indemnité de 40 € : intégrées à l'aperçu des factures."
  },
  {
   "title": "Tenir le registre RGPD des traitements",
   "category": "RGPD",
   "due": "",
   "done": false,
   "note": "Prérempli ci-dessous : à relire et valider."
  },
  {
   "title": "Signer un accord de sous-traitance RGPD avec chaque client",
   "category": "RGPD",
   "due": "",
   "done": false,
   "note": "Tu accèdes à leurs données : l'article 28 du RGPD impose un contrat."
  },
  {
   "title": "Désinscription possible dans chaque mail de prospection",
   "category": "RGPD",
   "due": "",
   "done": true,
   "note": "Ajoutée en bas de toutes tes séquences."
  },
  {
   "title": "Mentions légales et politique de confidentialité du site",
   "category": "Site web",
   "due": "",
   "done": false,
   "note": "Sur infracyb.fr."
  },
  {
   "title": "Sécuriser tes propres outils",
   "category": "Sécurité interne",
   "due": "",
   "done": false,
   "note": "Double authentification partout, sauvegardes testées, portable chiffré : ta crédibilité de RSSI commence chez toi."
  }
 ],
 "rgpd": [
  {
   "name": "Prospection commerciale B2B",
   "purpose": "Présenter mes offres à des entreprises",
   "basis": "Intérêt légitime",
   "data": "Nom, fonction, e-mail et téléphone professionnels",
   "keep": "3 ans après le dernier contact",
   "status": "a_valider"
  },
  {
   "name": "Gestion des clients et facturation",
   "purpose": "Exécuter les contrats et facturer",
   "basis": "Contrat et obligation légale",
   "data": "Identité, coordonnées, devis, factures",
   "keep": "10 ans pour les pièces comptables",
   "status": "a_valider"
  },
  {
   "name": "Support et accès aux systèmes des clients",
   "purpose": "Assurer le RSSI externalisé",
   "basis": "Contrat (sous-traitant du client)",
   "data": "Comptes et données des clients selon la mission",
   "keep": "Durée du contrat",
   "status": "a_valider"
  },
  {
   "name": "Formulaire de contact du site",
   "purpose": "Répondre aux demandes",
   "basis": "Intérêt légitime",
   "data": "Nom, e-mail, message",
   "keep": "3 ans après le dernier contact",
   "status": "a_valider"
  }
 ],
 "documents": [
  {
   "name": "Conditions générales de prestation (CGV)",
   "type": "Modèle",
   "status": "a_rediger"
  },
  {
   "name": "Contrat RSSI externalisé",
   "type": "Modèle",
   "status": "a_relire"
  },
  {
   "name": "Lettre de mission — audit forfaitaire",
   "type": "Modèle",
   "status": "brouillon"
  },
  {
   "name": "Accord de confidentialité (NDA)",
   "type": "Modèle",
   "status": "a_rediger"
  },
  {
   "name": "Accord de sous-traitance RGPD (art. 28)",
   "type": "Modèle",
   "status": "a_rediger"
  },
  {
   "name": "Rapport d'audit — modèle",
   "type": "Modèle",
   "status": "brouillon"
  },
  {
   "name": "Plan de réponse à incident — modèle",
   "type": "Modèle",
   "status": "a_rediger"
  }
 ],
 "partners": [
  {
   "name": "Partenaire tests d'intrusion (à trouver)",
   "type": "Partenaire (j'oriente)",
   "specialty": "Tests d'intrusion",
   "contact": "",
   "commission": "",
   "status": "a_trouver"
  },
  {
   "name": "Partenaire SOC / surveillance 24 h/24 (à trouver)",
   "type": "Partenaire (j'oriente)",
   "specialty": "Surveillance et réponse 24 h/24",
   "contact": "",
   "commission": "",
   "status": "a_trouver"
  },
  {
   "name": "Expert-comptable apporteur d'affaires (à contacter)",
   "type": "Apporteur d'affaires",
   "specialty": "Réseau de TPE et cabinets",
   "contact": "",
   "commission": "10 %",
   "status": "a_contacter"
  },
  {
   "name": "Avocat RGPD (à trouver)",
   "type": "Partenaire (j'oriente)",
   "specialty": "Conformité RGPD et contrats",
   "contact": "",
   "commission": "",
   "status": "a_trouver"
  }
 ]
} as const;
