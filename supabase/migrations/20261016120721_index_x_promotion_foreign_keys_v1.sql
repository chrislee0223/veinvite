create index if not exists reward_x_promotion_obligations_source_receipt_idx
  on public.reward_x_promotion_obligations(source_allocation_receipt_id);

create index if not exists reward_x_promotion_payout_intents_source_receipt_idx
  on public.reward_x_promotion_payout_intents(source_allocation_receipt_id);

create index if not exists reward_x_promotion_post_submissions_obligation_idx
  on public.reward_x_promotion_post_submissions(obligation_id);

create index if not exists reward_x_promotion_post_submissions_split_idx
  on public.reward_x_promotion_post_submissions(split_id);

create index if not exists reward_x_promotion_post_verifications_obligation_idx
  on public.reward_x_promotion_post_verifications(obligation_id);

create index if not exists reward_x_promotion_post_verifications_split_idx
  on public.reward_x_promotion_post_verifications(split_id);

create index if not exists reward_x_promotion_receipts_source_receipt_idx
  on public.reward_x_promotion_receipts(source_allocation_receipt_id);

create index if not exists reward_x_promotion_splits_source_receipt_idx
  on public.reward_x_promotion_splits(source_allocation_receipt_id);

comment on index public.reward_x_promotion_obligations_source_receipt_idx is
  'Covers the X promotion obligation allocation-receipt foreign key for parent-side checks and focused joins.';

comment on index public.reward_x_promotion_payout_intents_source_receipt_idx is
  'Covers the X promotion payout-intent allocation-receipt foreign key for parent-side checks and focused joins.';

comment on index public.reward_x_promotion_post_submissions_obligation_idx is
  'Covers the X promotion post-submission obligation foreign key.';

comment on index public.reward_x_promotion_post_submissions_split_idx is
  'Covers the X promotion post-submission split foreign key.';

comment on index public.reward_x_promotion_post_verifications_obligation_idx is
  'Covers the X promotion post-verification obligation foreign key.';

comment on index public.reward_x_promotion_post_verifications_split_idx is
  'Covers the X promotion post-verification split foreign key.';

comment on index public.reward_x_promotion_receipts_source_receipt_idx is
  'Covers the X promotion receipt allocation-receipt foreign key for reporting and parent-side checks.';

comment on index public.reward_x_promotion_splits_source_receipt_idx is
  'Covers the X promotion split allocation-receipt foreign key for parent-side checks and focused joins.';
