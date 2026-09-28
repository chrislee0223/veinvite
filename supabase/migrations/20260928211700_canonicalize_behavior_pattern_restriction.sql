alter function public.apply_sybil_v2_behavior_pattern_restriction(
  text, bigint, text, text
) security invoker;

revoke all on function public.apply_sybil_v2_behavior_pattern_restriction(
  text, bigint, text, text
) from public, anon, authenticated;

grant execute on function public.apply_sybil_v2_behavior_pattern_restriction(
  text, bigint, text, text
) to service_role;
