-- Phase R (26/11/2026) : publication automatique sur LinkedIn.
--   posts.external_url : lien du post une fois publié par le CRM
--   linkedin_auth      : autorisation LinkedIn chiffrée (une seule ligne), avec sa date d'expiration
-- Rien d'existant n'est modifié ni supprimé. Rejouable sans danger. À appliquer AVANT de déployer le code
-- (après une branche de sauvegarde Neon) :
-- psql "$PROD_URL" -X -v ON_ERROR_STOP=1 -f drizzle-manuel-phase-r.sql

BEGIN;

ALTER TABLE posts ADD COLUMN IF NOT EXISTS external_url text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS linkedin_auth (
  id integer PRIMARY KEY NOT NULL,
  token_enc text DEFAULT '' NOT NULL,
  person_urn text DEFAULT '' NOT NULL,
  name text DEFAULT '' NOT NULL,
  expires_at timestamp with time zone,
  last_error text DEFAULT '' NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMIT;

-- Contrôle : la colonne et la table doivent apparaître.
SELECT table_name, column_name FROM information_schema.columns
WHERE (table_name = 'posts' AND column_name = 'external_url') OR (table_name = 'linkedin_auth' AND column_name = 'token_enc');
