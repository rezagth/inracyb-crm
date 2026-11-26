-- Phase M (26/11/2026) : offres du catalogue utilisées par le bouton « Devis Pack + Suivi ».
-- Aucune table n'est créée ni modifiée. Rejouable sans danger : n'ajoute rien si une prestation du même nom existe.
-- À coller dans Neon > SQL Editor (après une branche de sauvegarde). Prix de départ : modifiables ensuite dans Catalogue.
INSERT INTO catalog_items (id, name, offer, unit, unit_price_cents, description, active)
SELECT replace(gen_random_uuid()::text, '-', ''),
       'Pack Courrier sécurisé — SPF, DKIM, DMARC',
       'Audit', 'forfait', 39000,
       'Contrôle et publication des enregistrements SPF et DKIM, DMARC en mode surveillance, rapport des envois à J+30, passage progressif à une politique plus stricte si les rapports le permettent. Le client garde la main sur son DNS (aucun mot de passe de registrar demandé).',
       true
WHERE NOT EXISTS (SELECT 1 FROM catalog_items WHERE name = 'Pack Courrier sécurisé — SPF, DKIM, DMARC');

INSERT INTO catalog_items (id, name, offer, unit, unit_price_cents, description, active)
SELECT replace(gen_random_uuid()::text, '-', ''),
       'Suivi Courrier & Domaine — abonnement',
       'CISOaaS', 'mois', 4900,
       'Lecture des rapports DMARC et durcissement progressif jusqu''au blocage des usurpations, contrôle mensuel de SPF, DMARC et du certificat du site, alerte en cas de dégradation, bilan mensuel d''une page. Engagement de 6 mois.',
       true
WHERE NOT EXISTS (SELECT 1 FROM catalog_items WHERE name = 'Suivi Courrier & Domaine — abonnement');
