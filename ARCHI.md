# Architecture de Kcalculator

Ce document explique, sans jargon inutile, comment l'appli est construite et à quoi servent Supabase et Vercel.

## Vue d'ensemble

```
   Ton téléphone                     Ton PC
 ┌───────────────────┐         ┌───────────────────┐
 │ Appli Kcalculator │         │ Appli Kcalculator │   ← la même appli web (PWA),
 │ + données locales │         │ + données locales │     installée sur chaque appareil
 └─────────┬─────────┘         └─────────┬─────────┘
           │   1. télécharge l'appli     │
           ├────────────► VERCEL ◄───────┤   (hébergement des fichiers de l'appli)
           │                             │
           │   2. envoie / reçoit tes    │
           │      aliments, repas, menus │
           └────────────► SUPABASE ◄─────┘   (base de données + comptes)

           3. scan d'un code-barres ──► Open Food Facts (base publique de produits)
```

Il y a donc trois morceaux, chacun avec un rôle bien séparé :

| Morceau | Rôle | Ce qu'il connaît |
|---|---|---|
| **L'appli** (React, dans ton navigateur) | Tout ce que tu vois et tous les calculs | Tes données, copiées sur l'appareil |
| **Vercel** | Héberge les fichiers de l'appli et les met à jour | Le code, pas tes données |
| **Supabase** | Garde tes données en ligne et gère ton compte | Tes données, pas le code |

## L'appli (PWA)

Une **PWA** (Progressive Web App) est un site web qui se comporte comme une appli : on l'installe sur l'écran d'accueil du téléphone ou sur le PC, elle s'ouvre en plein écran et elle marche **hors ligne**.

L'appli fait tous les calculs elle-même, sur ton appareil : métabolisme de base, objectif calorique, macros, totaux des repas, portions de batch cooking. Il n'y a pas de « serveur de calcul ».

Tes données sont d'abord enregistrées **sur l'appareil** (dans le stockage du navigateur). C'est ce qui permet d'utiliser l'appli sans réseau, par exemple au supermarché. La synchro avec Supabase vient ensuite, dès qu'il y a une connexion.

Fichiers principaux :

```
src/lib/calc.ts        calculs (métabolisme, objectifs, macros, végé/vegan, batch cooking)
src/lib/store.ts       données locales sur l'appareil
src/lib/sync.ts        synchro avec Supabase
src/lib/off.ts         recherche d'un code-barres sur Open Food Facts
src/components/        les écrans (Journal, Mes menus, Aliments, Profil, Réglages, scanner)
supabase/schema.sql    création des tables Supabase (nouveau projet)
supabase/migrations/   modifications des tables, à lancer sur un projet existant
```

## Vercel : l'hébergeur

**Vercel** est un service qui met ton appli en ligne à une adresse `https://…vercel.app`.

Concrètement :

1. Tu pousses ton code sur GitHub (branche `main`).
2. Vercel le voit, lance `npm run build`, qui transforme le code React/TypeScript en fichiers HTML, CSS et JavaScript prêts pour le navigateur.
3. Vercel publie ces fichiers. Quelques secondes plus tard, la nouvelle version est en ligne et tes appareils la récupèrent à la prochaine ouverture.

Vercel ne stocke **aucune** de tes données nutritionnelles. Il sert uniquement les fichiers de l'appli. Il garde aussi deux réglages (« variables d'environnement ») qui sont intégrés à l'appli au moment du build :

- `VITE_SUPABASE_URL` : l'adresse de ton projet Supabase ;
- `VITE_SUPABASE_ANON_KEY` : la clé publique de ce projet.

Ces deux valeurs ne sont pas secrètes : elles finissent dans le code envoyé au navigateur. La sécurité vient des règles d'accès de Supabase (voir plus bas).

Bonus : pour chaque pull request, Vercel publie une **version de prévisualisation** à une adresse à part, pour tester avant de fusionner dans `main`.

## Supabase : la base de données et les comptes

**Supabase** est un service qui fournit, sans avoir à gérer de serveur :

- une **base de données PostgreSQL** (des tables, comme des feuilles Excel bien rangées) ;
- un système de **comptes** (inscription et connexion par e-mail et mot de passe) ;
- une **API** : l'appli lit et écrit dans les tables directement depuis le navigateur.

Les tables de Kcalculator :

| Table | Contenu |
|---|---|
| `foods` | Tes aliments : nom, valeurs pour 100 g / 100 ml / 1 unité, code-barres, régime (végé / vegan) |
| `entries` | Ton journal : quel aliment, quelle quantité, quel jour, quel repas |
| `menus` | Tes menus enregistrés, avec le nombre de jours pour le batch cooking |
| `profiles` | Ton profil (poids, % de graisse, activité, objectif) |

**Sécurité** : chaque ligne porte l'identifiant de ton compte, et des règles (« Row Level Security ») font qu'un compte ne peut lire et modifier **que ses propres lignes**. C'est pour ça que la clé publique peut se trouver dans l'appli sans danger.

## Comment marche la synchro

1. Quand tu modifies quelque chose, l'appli l'enregistre sur l'appareil et le note « à envoyer ».
2. Environ 3 s plus tard (ou au démarrage, ou quand le réseau revient), elle envoie ces changements à Supabase.
3. Elle récupère ensuite ce que tes autres appareils ont envoyé depuis la dernière synchro.
4. Si le même élément a été modifié sur deux appareils, **la modification la plus récente gagne**.
5. Une suppression est gardée comme un marqueur (« supprimé ») pour qu'elle se propage aux autres appareils.

## Faire évoluer la base (migrations)

Quand une nouvelle version ajoute des informations (par exemple le régime végé/vegan d'un aliment), il faut ajouter des colonnes aux tables Supabase. On le fait avec un fichier de **migration** dans `supabase/migrations/`, à lancer **une fois** dans Supabase → SQL Editor. Les migrations n'effacent rien : elles ajoutent des colonnes avec une valeur par défaut.

Si l'appli est mise à jour avant que la migration soit lancée, la synchro continue de marcher pour le reste, et le statut dans Réglages indique quelle migration lancer. Une fois la migration faite, l'appli renvoie automatiquement les informations manquantes.

## Open Food Facts

Pour le scan de code-barres, l'appli interroge directement **Open Food Facts**, une base de données publique et gratuite de produits alimentaires. Elle récupère le nom, la marque, les valeurs nutritionnelles et, quand le produit l'indique, s'il est végétarien ou vegan. Tu vérifies et tu enregistres : l'aliment rejoint alors ta propre base.
