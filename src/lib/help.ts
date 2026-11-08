/** Aide contextuelle par page (reprise de la maquette). */
export const HELP: Record<string, string[]> = {
 "dashboard": [
  "Ta journée commence ici : les cartes du haut résument ta semaine, clique dessus pour aller au détail.",
  "La carte « Bien démarrer » t'accompagne jusqu'à ton premier rendez-vous. Chaque étape a son bouton.",
  "Survole une barre pour voir les encaissements d'un mois. Elle se met à jour à chaque paiement enregistré.",
  "Les cartes du haut t'emmènent au détail : pipeline, devis, factures."
 ],
 "prospection": [
  "Choisis un prospect et une offre en haut : scripts, mails et objections se remplissent avec ses infos et les tiennes.",
  "« Aujourd'hui » te donne ta file d'appels (ta cible d'abord) et tes compteurs du jour.",
  "« Lancer l'appel guidé » affiche le script étape par étape, avec les réponses aux objections à droite. À la fin, choisis le résultat : le CRM enregistre tout et planifie la suite.",
  "Dans « Séquence mails », copie le mail ou ouvre-le dans ta messagerie, puis clique « Marquer comme envoyé » : la relance suivante est planifiée toute seule.",
  "Les textes entre crochets, comme [PRIX], sont à compléter : renseigne-les dans ton profil."
 ],
 "pipeline": [
  "Glisse une carte d'une colonne à l'autre pour changer d'étape, ou utilise le menu en bas de chaque carte.",
  "Chaque changement est noté dans l'historique de l'entreprise.",
  "« Nouvelle affaire » crée un prospect ; choisis son étape dans le formulaire."
 ],
 "entreprises": [
  "Cherche par nom, secteur, contact ou ville, puis filtre par statut.",
  "Les filtres Prospects, En discussion, Clients et Perdus affinent la liste.",
  "La recherche en haut de l'écran fonctionne depuis n'importe quelle page.",
  "Clique un nom pour ouvrir la fiche complète."
 ],
 "contacts": [
  "Tous les interlocuteurs de tes entreprises, triés par nom.",
  "Clique l'entreprise pour ouvrir sa fiche."
 ],
 "appels": [
  "Le journal de tous tes appels, du plus récent au plus ancien.",
  "Les appels guidés de la Prospection s'enregistrent ici automatiquement.",
  "Surveille ton taux de joignabilité : s'il baisse, change tes horaires d'appel."
 ],
 "taches": [
  "Coche une tâche pour la marquer comme faite.",
  "« En retard » te montre ce qui passe en premier.",
  "Les relances de mails et de rappels sont créées toutes seules par la prospection."
 ],
 "rdv": [
  "Clique un jour pour voir ses rendez-vous.",
  "Le bouton Visio, Téléphone ou Sur place te donne l'info utile pour le rejoindre.",
  "« Créer un rendez-vous » préremplit la date choisie."
 ],
 "devis": [
  "Ouvre un devis pour l'émettre, puis note l'accord du client : il passe en Gagné.",
  "Le TTC suit ton réglage de TVA (Paramètres) : en franchise, TTC = HT avec la mention « TVA non applicable, art. 293 B du CGI ».",
  "Sur un devis accepté, crée la facture en un clic : totalité, acompte 30 % ou 50 %, ou solde."
 ],
 "contrats": [
  "Tes contrats récurrents : le MRR est ton revenu mensuel garanti.",
  "« Facturer novembre » crée la facture du mois en brouillon ; « Générer les factures du mois » le fait pour tous les contrats actifs.",
  "Surveille les fins de contrat : anticipe le renouvellement avant le préavis."
 ],
 "missions": [
  "Une mission = une prestation à livrer (audit, RSSI du mois, projet IA).",
  "La barre compare le temps passé au budget en jours (7 h par jour).",
  "« + Temps » saisit directement du temps sur la mission."
 ],
 "temps": [
  "Saisis ton temps chaque jour, même le non facturable : c'est ce qui te dira si tes prix sont justes.",
  "Renseigne ton TJM dans Paramètres pour valoriser ton temps facturable."
 ],
 "support": [
  "Les demandes de tes clients RSSI, avec un délai cible par priorité, en heures ouvrées.",
  "Tu ne fais pas d'astreinte 24 h/24 : écris ces délais dans tes contrats."
 ],
 "factures": [
  "Numérotation continue, sans trou : le numéro définitif est attribué à l'émission. Une facture émise se corrige par un avoir.",
  "Enregistre chaque paiement reçu sur la facture (ou rapproche-le depuis ton relevé bancaire) : il entre dans le livre des recettes.",
  "Une facture en retard propose 3 niveaux de relance, avec l'e-mail déjà rédigé.",
  "« Imprimer / PDF » produit la facture avec toutes les mentions obligatoires."
 ],
 "depenses": [
  "En micro-entreprise, les dépenses ne réduisent pas tes cotisations : ce suivi sert à piloter ta trésorerie.",
  "Coche le justificatif dès que tu l'as rangé."
 ],
 "tresorerie": [
  "Ton encaissé de l'année face au plafond de la micro-entreprise et au seuil de franchise de TVA.",
  "Cotisations estimées avec les taux de Paramètres : vérifie-les sur urssaf.fr.",
  "La prévision à 3 mois additionne ton MRR et les factures à encaisser, moins tes abonnements."
 ],
 "documents": [
  "Tes modèles (CGV, contrats, lettre de mission, accord RGPD…) et les documents de tes clients.",
  "Fais relire tes modèles juridiques par un professionnel avant de les utiliser."
 ],
 "marketing": [
  "Ton calendrier éditorial : LinkedIn en vouvoiement, Instagram en tutoiement.",
  "Change le statut au fil de l'eau : idée, rédigé, programmé, publié."
 ],
 "conformite": [
  "Toutes tes obligations d'entrepreneur au même endroit, avec leurs échéances.",
  "Coche une obligation quand elle est faite.",
  "Le registre RGPD est prérempli : relis-le et valide chaque traitement."
 ],
 "parametres": [
  "L'identité de ton entreprise apparaît sur tes factures.",
  "Les taux et seuils sont modifiables : vérifie-les sur urssaf.fr et impots.gouv.fr.",
  "Sauvegarde ta base avec « npm run db:backup » et copie le dossier data/backups hors de ton Mac."
 ],
 "catalogue": [
  "Tes prestations et leurs prix : elles s'ajoutent en un clic dans un devis ou une facture.",
  "Archive une prestation au lieu de la supprimer : tes anciennes factures restent cohérentes."
 ],
 "plans": [
  "Le plan de sécurité de chaque client, action par action, avec un responsable et une échéance.",
  "C'est la base de tes comités mensuels en RSSI externalisé et du suivi après un audit."
 ],
 "activite": [
  "Le journal de tout ce qui s'est passé, filtrable par type.",
  "Clique une entreprise pour ouvrir sa fiche."
 ],
 "audits": [
  "Démarre un audit, puis réponds point par point : Oui, Partiel, Non ou N/A.",
  "« Générer le plan d'action » crée une action par point à corriger, avec sa priorité et une échéance.",
  "« Voir le rapport » produit le rapport à remettre au client (copie ou impression en PDF)."
 ],
 "incidents": [
  "Déclare chaque incident d'un client : une tâche de suivi est créée.",
  "Si des données personnelles sont touchées, aide le client à évaluer la notification CNIL (72 h).",
  "Ta procédure de réponse à incident est dans la Base de connaissances."
 ],
 "partenaires": [
  "Trouve des partenaires pour ce que tu ne fais pas (tests d'intrusion, SOC 24 h/24) : tu restes l'interlocuteur du client.",
  "Les apporteurs d'affaires (comptables, avocats) sont ta meilleure source de clients : note les leads qu'ils t'envoient."
 ],
 "rentabilite": [
  "Le revenu horaire réel de chaque client : encaissé divisé par le temps saisi.",
  "Le prévisionnel calcule le CA nécessaire pour ton objectif net, et combien d'audits ou de clients RSSI il te faut.",
  "Règle ton objectif dans Paramètres › Objectifs."
 ],
 "savoir": [
  "Tes procédures et checklists internes.",
  "Clique un titre pour le lire, l'imprimer ou le copier."
 ],
 "integrations": [
  "Ce qui est marqué « Actif » fonctionne déjà : export d'agenda, import bancaire, liens Cal et paiement, exports comptables.",
  "Importe ton relevé bancaire en CSV, puis rapproche chaque virement de sa facture en un clic.",
  "Les connexions automatiques (agenda, banque, signature) demanderont un compte chez chaque prestataire."
 ],
 "automatisations": [
  "Active ou coupe chaque automatisation avec l'interrupteur.",
  "« Exécuter maintenant » lance tout de suite la facturation des contrats et les relances d'impayés.",
  "La facturation des contrats et les relances tournent aussi toutes seules, une fois par jour, à l'ouverture du CRM."
 ],
 "clients": [
  "Tes clients gagnés, en galerie.",
  "Clique une carte pour ouvrir la fiche."
 ],
 "rapports": [
  "Choisis la métrique, le regroupement et la visualisation à droite : l'aperçu est en direct.",
  "« Enregistrer » garde ta configuration, « Télécharger » exporte en CSV."
 ],
 "fiche": [
  "Les boutons en haut lancent un appel, un rendez-vous, une relance ou un devis pour cette entreprise.",
  "Le menu en haut à droite change l'étape du pipeline en un clic.",
  "Ajoute une note dans l'Historique après chaque échange.",
  "Pour son script personnalisé, choisis-la dans Prospection."
 ]
};
