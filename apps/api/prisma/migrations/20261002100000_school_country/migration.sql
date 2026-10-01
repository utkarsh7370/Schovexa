-- AlterTable
ALTER TABLE "School" ADD COLUMN "country" TEXT NOT NULL DEFAULT 'IN';

-- Existing schools: best guess from the currency they already chose, so a
-- US or UK school doesn't suddenly show India in the header. Editable in
-- School settings.
UPDATE "School" SET "country" = CASE "currency"
  WHEN 'USD' THEN 'US'
  WHEN 'GBP' THEN 'GB'
  WHEN 'AED' THEN 'AE'
  WHEN 'CAD' THEN 'CA'
  WHEN 'AUD' THEN 'AU'
  WHEN 'SGD' THEN 'SG'
  ELSE 'IN'
END;
