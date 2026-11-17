/**
 * Fonction Edge Supabase « ai » : fait le lien entre l'appli et l'API Claude.
 * La clé API n'est jamais envoyée au navigateur. Elle vient, dans l'ordre :
 *   1. de la clé que le compte a enregistrée dans Réglages (Supabase Vault, migration 004) ;
 *   2. sinon du secret global ANTHROPIC_API_KEY.
 *
 * Secrets (supabase secrets set …) :
 *   ANTHROPIC_API_KEY   optionnel, clé partagée utilisée en repli
 *   AI_MODEL            optionnel, claude-opus-5-5 par défaut
 *   AI_ALLOWED_EMAILS   optionnel, e-mails autorisés à utiliser la clé partagée, séparés par des virgules
 * SUPABASE_URL, SUPABASE_ANON_KEY et SUPABASE_SERVICE_ROLE_KEY sont fournis automatiquement par Supabase.
 */
import Anthropic from 'npm:@anthropic-ai/sdk@1.3.0'
import { createClient } from 'npm:@supabase/supabase-js@2.119.0'
import { BadRequest, DEFAULT_MODEL, parseRequest, Refused, run } from './handler.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405)

  // Seuls les comptes connectés de l'appli peuvent utiliser l'IA.
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data, error } = await sb.auth.getUser()
  if (error || !data.user) return json({ error: 'Connecte-toi dans Réglages pour utiliser l’IA.' }, 401)

  // 1) La clé que le compte a saisie dans Réglages (chiffrée dans Supabase Vault, migration 004).
  //    Seul le rôle service_role peut la déchiffrer : elle ne repart jamais vers le navigateur.
  let apiKey: string | null = null
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })
  const own = await admin.rpc('get_ai_key', { p_user: data.user.id })
  if (own.error) console.warn('get_ai_key:', own.error.message) // migration 004 pas encore lancée : on passe au repli
  else if (typeof own.data === 'string' && own.data) apiKey = own.data
  const ownKey = !!apiKey

  // 2) Repli : le secret global ANTHROPIC_API_KEY, réservé aux e-mails de AI_ALLOWED_EMAILS s'il est défini.
  if (!apiKey) {
    apiKey = Deno.env.get('ANTHROPIC_API_KEY') ?? null
    if (!apiKey) return json({ error: 'Ajoute ta clé API Anthropic dans Réglages > Intelligence artificielle.' }, 400)
    const allowed = (Deno.env.get('AI_ALLOWED_EMAILS') ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
    if (allowed.length && !allowed.includes((data.user.email ?? '').toLowerCase())) {
      return json({ error: "Ce compte n'est pas autorisé à utiliser la clé partagée : ajoute ta propre clé dans Réglages." }, 403)
    }
  }

  try {
    const body = parseRequest(await req.json())
    const client = new Anthropic({ apiKey })
    return json(await run(client, Deno.env.get('AI_MODEL') || DEFAULT_MODEL, body))
  } catch (e) {
    if (e instanceof BadRequest) return json({ error: e.message }, 400)
    if (e instanceof Refused) return json({ error: e.message }, 422)
    if (e instanceof Anthropic.AuthenticationError) {
      const where = ownKey ? 'remplace la clé dans Réglages' : 'vérifie le secret ANTHROPIC_API_KEY'
      return json({ error: `Clé API refusée par Anthropic : ${where}.` }, 502)
    }
    if (e instanceof Anthropic.RateLimitError) return json({ error: "Trop de demandes à l'IA, réessaie dans une minute." }, 429)
    if (e instanceof Anthropic.APIError) return json({ error: `Erreur de l'IA (${e.status ?? '?'}) : ${e.message}` }, 502)
    console.error(e)
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
