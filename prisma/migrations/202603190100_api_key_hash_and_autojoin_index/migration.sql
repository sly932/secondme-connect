ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "apiKeyHash" TEXT,
  ADD COLUMN IF NOT EXISTS "apiKeyPreview" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "users_apiKeyHash_key"
  ON "users"("apiKeyHash");

CREATE INDEX IF NOT EXISTS "users_autoJoinGame_id_idx"
  ON "users"("autoJoinGame", "id");
