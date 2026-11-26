-- Phase O (26/11/2026) : offres du catalogue utilisées par les devis en un clic. Aucune table modifiée.
-- Rejouable sans danger : n'ajoute rien si une prestation du même nom existe. Branche de sauvegarde Neon d'abord.
-- Prix de départ (prix publics) : modifiables ensuite dans Catalogue. Les prix pilotes sont appliqués par le bouton de devis.
INSERT INTO catalog_items (id, name, offer, unit, unit_price_cents, description, active)
SELECT replace(gen_random_uuid()::text, '-', ''), v.name, v.offer, v.unit, v.cents, v.descr, true
FROM (VALUES
  ('Kit anti-faux-RIB', 'Audit', 'forfait', 59000, 'Pack Courrier sécurisé (SPF, DKIM, DMARC), double authentification sur les messageries, procédure écrite de vérification des changements de coordonnées bancaires, une heure de sensibilisation de l''équipe.'),
  ('Microsoft 365 sécurisé — jusqu''à 10 comptes', 'Audit', 'forfait', 49000, 'Double authentification pour tous les comptes, revue des règles de transfert et des comptes inactifs, partages externes, alertes de connexion, rapport avant / après.'),
  ('Dossier de preuves sécurité', 'Audit', 'forfait', 69000, 'Réponses prêtes et justifiées aux questionnaires de sécurité des assureurs et des clients (MFA, sauvegardes, postes, accès, incidents), avec les preuves. Mise à jour annuelle.'),
  ('Suivi Sécurité PME — abonnement', 'CISOaaS', 'mois', 14900, 'Suivi du courrier (DMARC jusqu''au blocage, bilan mensuel), contrôle trimestriel de Microsoft 365, mise à jour annuelle du dossier de preuves, une heure d''assistance par mois. Engagement de 12 mois.')
) AS v(name, offer, unit, cents, descr)
WHERE NOT EXISTS (SELECT 1 FROM catalog_items c WHERE c.name = v.name);
