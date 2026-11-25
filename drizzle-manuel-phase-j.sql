-- Phase J : volume d'envoi.
-- Deux colonnes ajoutées, avec une valeur par défaut : rien d'existant n'est modifié ni supprimé.
--   mail_service_state.ramp_from     : jour où la montée du diagnostic au-delà de 10 par jour a commencé (domaine d'envoi strict)
--   feed_settings.feed_prescripteur  : alimentation automatique de la campagne Prescripteurs (éteinte par défaut)
-- Rejouable sans danger. À appliquer AVANT de déployer le code (après une branche de sauvegarde Neon), dans Neon > SQL Editor, ou :
-- psql "$PROD_URL" -X -v ON_ERROR_STOP=1 -f drizzle-manuel-phase-j.sql

BEGIN;

ALTER TABLE mail_service_state ADD COLUMN IF NOT EXISTS ramp_from text NOT NULL DEFAULT '';
ALTER TABLE feed_settings ADD COLUMN IF NOT EXISTS feed_prescripteur boolean NOT NULL DEFAULT false;

COMMIT;

-- Contrôle : les deux colonnes doivent apparaître.
SELECT table_name, column_name FROM information_schema.columns
WHERE (table_name = 'mail_service_state' AND column_name = 'ramp_from') OR (table_name = 'feed_settings' AND column_name = 'feed_prescripteur');
