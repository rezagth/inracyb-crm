-- Campagne Diagnostic, phase A : une seule séquence en cours par entreprise, tous services confondus.
-- Ne touche à aucune donnée. Sans danger si relancé (IF NOT EXISTS).
-- À coller dans Neon > SQL Editor si `npm run db:migrate` ne peut pas se connecter depuis ton Mac.

-- 1) Contrôle à lancer AVANT : cette requête doit ne renvoyer aucune ligne.
--    Si elle en renvoie, une entreprise est « en cours » dans deux campagnes : arrête l'une des deux
--    depuis la page Campagnes (bouton « Stop » ou « A répondu »), puis relance le contrôle.
SELECT "company_id", count(*) AS sequences_en_cours
FROM "mail_campaign_items"
WHERE "status" = 'en_cours'
GROUP BY "company_id"
HAVING count(*) > 1;

-- 2) L'index. Il échoue (sans rien modifier) tant que le contrôle ci-dessus renvoie des lignes.
CREATE UNIQUE INDEX IF NOT EXISTS "mail_campaign_items_active_uq"
  ON "mail_campaign_items" ("company_id")
  WHERE "status" = 'en_cours';
