export function isQaStudioAllowed(): boolean {
  // Production must stay blocked even if another environment variable is
  // accidentally configured in a permissive way.
  if (process.env.VERCEL_ENV === 'production') {
    return false;
  }

  return (
    process.env.NODE_ENV === 'development' ||
    process.env.VERCEL_ENV === 'preview'
  );
}
