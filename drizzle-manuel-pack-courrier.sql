-- Pack « Courrier sécurisé » dans le catalogue des prestations (devis et factures).
-- Aucune table n'est créée ni modifiée. Sans danger si relancé : n'ajoute rien si une prestation du même nom existe.
-- À coller dans Neon > SQL Editor (après une branche de sauvegarde, comme pour les autres fichiers manuels).
-- Le prix de 390 € HT est une valeur de départ à valider : modifie-le ensuite dans Catalogue.
INSERT INTO catalog_items (id, name, offer, unit, unit_price_cents, description, active)
SELECT replace(gen_random_uuid()::text, '-', ''),
       'Pack Courrier sécurisé — SPF, DKIM, DMARC',
       'Audit',
       'forfait',
       39000,
       'Contrôle et publication des enregistrements SPF et DKIM, DMARC en mode surveillance, rapport des envois à J+30, passage progressif à une politique plus stricte si les rapports le permettent. Le client garde la main sur son DNS (aucun mot de passe de registrar demandé). Prix de départ à valider.',
       true
WHERE NOT EXISTS (SELECT 1 FROM catalog_items WHERE name = 'Pack Courrier sécurisé — SPF, DKIM, DMARC');
