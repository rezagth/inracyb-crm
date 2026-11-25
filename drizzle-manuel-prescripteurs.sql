-- Lot P2 : suivi des prescripteurs.
-- Deux colonnes ajoutées, facultatives (vides par défaut) : rien d'existant n'est modifié ni supprimé.
--   partners.company_id  : fiche du cabinet dans le CRM (prescripteur devenu partenaire)
--   companies.referred_by : partenaire qui a recommandé l'entreprise
-- Rejouable sans danger : chaque instruction vérifie d'abord si elle a déjà été appliquée.
-- À coller dans Neon > SQL Editor AVANT de déployer le code (après une branche de sauvegarde, comme pour les autres fichiers manuels),
-- ou : psql "$PROD_URL" -X -v ON_ERROR_STOP=1 -f drizzle-manuel-prescripteurs.sql

BEGIN;

ALTER TABLE companies ADD COLUMN IF NOT EXISTS referred_by text;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS company_id text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'companies_referred_by_partners_id_fk') THEN
    ALTER TABLE companies ADD CONSTRAINT companies_referred_by_partners_id_fk
      FOREIGN KEY (referred_by) REFERENCES partners(id) ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'partners_company_id_companies_id_fk') THEN
    ALTER TABLE partners ADD CONSTRAINT partners_company_id_companies_id_fk
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS companies_referred_by_idx ON companies USING btree (referred_by);

COMMIT;

-- Contrôle : les deux colonnes doivent apparaître.
SELECT table_name, column_name FROM information_schema.columns
WHERE (table_name = 'companies' AND column_name = 'referred_by') OR (table_name = 'partners' AND column_name = 'company_id');
