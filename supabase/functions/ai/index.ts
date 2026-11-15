/**
 * Fonction Edge Supabase « ai » : fait le lien entre l'appli et l'API Claude.
 * La clé API reste ici, en secret Supabase : elle n'est jamais envoyée au navigateur.
 *
 * Secrets (supabase secrets set …) :
 *   ANTHROPIC_API_KEY   obligatoire
 *   AI_MODEL            optionnel, claude-opus-5-5 par défaut
 *   AI_ALLOWED_EMAILS   optionnel, e-mails autorisés séparés par des virgules (conseillé si l'inscription est ouverte)
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

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return json({ error: "Clé API absente : lance « supabase secrets set ANTHROPIC_API_KEY=… »." }, 500)

  // Seuls les comptes connectés de l'appli peuvent utiliser la clé.
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data, error } = await sb.auth.getUser()
  if (error || !data.user) return json({ error: 'Connecte-toi dans Réglages pour utiliser l’IA.' }, 401)
  const allowed = (Deno.env.get('AI_ALLOWED_EMAILS') ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  if (allowed.length && !allowed.includes((data.user.email ?? '').toLowerCase())) {
    return json({ error: "Ce compte n'est pas autorisé à utiliser l'IA." }, 403)
  }

  try {
    const body = parseRequest(await req.json())
    const client = new Anthropic({ apiKey })
    return json(await run(client, Deno.env.get('AI_MODEL') || DEFAULT_MODEL, body))
  } catch (e) {
    if (e instanceof BadRequest) return json({ error: e.message }, 400)
    if (e instanceof Refused) return json({ error: e.message }, 422)
    if (e instanceof Anthropic.AuthenticationError) return json({ error: 'Clé API refusée par Anthropic : vérifie ANTHROPIC_API_KEY.' }, 502)
    if (e instanceof Anthropic.RateLimitError) return json({ error: "Trop de demandes à l'IA, réessaie dans une minute." }, 429)
    if (e instanceof Anthropic.APIError) return json({ error: `Erreur de l'IA (${e.status ?? '?'}) : ${e.message}` }, 502)
    console.error(e)
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
