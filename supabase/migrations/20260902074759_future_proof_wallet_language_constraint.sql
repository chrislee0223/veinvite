-- Keep the database responsible for locale-tag shape, while the server-side
-- VeInvite locale registry remains the single source of truth for which
-- languages are currently supported. This prevents every future language
-- addition from requiring another database allow-list migration.

alter table public.wallet_preferences
  drop constraint if exists wallet_preferences_language_check;

alter table public.wallet_preferences
  add constraint wallet_preferences_language_check check (
    char_length(language) <= 35
    and language ~ '^[a-z]{2,3}(-[a-z0-9]{2,8})*$'
  );
