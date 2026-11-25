-- Phase I : file d'appels du jour.
-- Une colonne ajoutée, vide par défaut : rien d'existant n'est supprimé.
--   tasks.kind : « appel » pour une tâche de la file d'appels (page Appels), vide sinon.
-- Les tâches « Appeler … » encore ouvertes sont rangées dans la file.
-- Rejouable sans danger. À appliquer APRÈS drizzle-manuel-prescripteurs.sql, AVANT de déployer le code
-- (après une branche de sauvegarde Neon), dans Neon > SQL Editor, ou :
-- psql "$PROD_URL" -X -v ON_ERROR_STOP=1 -f drizzle-manuel-appels.sql

BEGIN;

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT '';
UPDATE tasks SET kind = 'appel' WHERE done = false AND kind = '' AND title LIKE 'Appeler %';

COMMIT;

-- Contrôle : nombre de tâches dans la file d'appels.
SELECT count(*) AS appels_ouverts FROM tasks WHERE kind = 'appel' AND done = false;
