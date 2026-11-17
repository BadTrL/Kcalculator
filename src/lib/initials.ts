/**
 * Initiales affichées dans la pastille du compte : le nom du profil Supabase s'il existe,
 * sinon l'e-mail (« jean.dupont@… » → « JD », « sacha@… » → « SA »).
 */
export function initials(user: { email?: string | null; user_metadata?: Record<string, unknown> | null }): string {
  const meta = user.user_metadata ?? {}
  const name = [meta.full_name, meta.name].find((v): v is string => typeof v === 'string' && !!v.trim())
  const src = (name ?? (user.email ?? '').split('@')[0]).trim()
  const words = src.split(/[\s._\-+]+/).filter((w) => /[\p{L}\p{N}]/u.test(w))
  if (!words.length) return '?'
  const letters = words.length > 1 ? words[0][0] + words[1][0] : words[0].replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2)
  return letters.toUpperCase()
}
