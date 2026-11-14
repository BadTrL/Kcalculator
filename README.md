# Kcalculator

Calculateur de repas : calories et macros de ce que tu manges, à partir de ta propre base d'aliments.
Fonctionne sur téléphone et sur PC (appli web installable), hors ligne, avec synchro entre appareils via Supabase.

## Ce que fait l'appli

- **Journal** : repas du jour (Matin, Midi, Collation, Soir), total kcal et macros, avec la progression vers ton objectif.
- **Mes menus** : tes repas déjà calculés, enregistrés pour les réutiliser. Dans le Journal, « Enregistrer comme menu » sauvegarde un repas rempli, et « + Menu » l'ajoute en un clic.
- **Aliments** : ta base d'aliments (tes 88 aliments de l'Excel sont déjà importés). Valeurs pour 100 g, 100 ml ou pour 1 unité.
- **Végé / vegan** : chaque aliment peut être marqué Végé ou Vegan. Filtre Tous / Végé / Vegan dans Aliments, dans le choix d'un aliment et dans Mes menus (un menu est vegan si tous ses aliments le sont). Le scan pré-remplit le régime quand Open Food Facts le connaît.
- **Batch cooking** : dans un menu, indique pour combien de jours tu cuisines. Tu saisis les quantités totales, l'appli affiche la portion par jour (quantités divisées par le nombre de jours) avec ses kcal et macros. « + Journal » ajoute une portion chaque jour pendant ces jours.
- **Scan de code-barres** avec la caméra : l'appli récupère les valeurs sur Open Food Facts, tu vérifies et tu enregistres.
- **Profil** : même calcul que ton fichier Excel. Katch-McArdle (370 + 21,6 × masse maigre) × activité, objectif sèche / maintien / prise de masse arrondi à 50 kcal, protéines et lipides en g/kg de masse maigre, glucides sur le reste.
- **Réglages** : connexion pour la synchro, export / import d'une sauvegarde.

Sans Supabase, l'appli marche quand même, mais les données restent sur l'appareil.

## Architecture

Le fonctionnement de l'appli, et le rôle de Supabase et de Vercel, sont expliqués simplement dans [ARCHI.md](ARCHI.md).

En bref : **Vercel** héberge l'appli (il la reconstruit et la met en ligne à chaque push sur `main`), **Supabase** garde tes données et ton compte pour synchroniser téléphone et PC, et l'appli fait tous les calculs sur ton appareil, même hors ligne.

## Lancer en local

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # tests des calculs
npm run build    # version de production dans dist/
```

## Mise en ligne (environ 15 minutes, gratuit)

### 1. Supabase (base de données et comptes)

1. Crée un compte sur https://supabase.com, puis un nouveau projet.
2. Va dans **SQL Editor → New query**, colle le contenu de `supabase/schema.sql` et clique sur **Run**.
   Projet Supabase déjà installé avec une version précédente : lance à la place les fichiers de `supabase/migrations/` qui n'ont pas encore été lancés (par exemple `002_vege_batch.sql`).
3. Dans **Project Settings → API**, copie l'**URL du projet** et la clé **anon public**.
4. (Facultatif) Dans **Authentication → Sign In / Providers → Email**, tu peux désactiver « Confirm email » pour te connecter sans valider l'e-mail.

### 2. Hébergement (Vercel)

1. Mets ce dossier sur un dépôt GitHub.
2. Sur https://vercel.com, clique sur **Add New → Project**, puis importe le dépôt. Vercel détecte Vite tout seul.
3. Dans **Environment Variables**, ajoute `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` avec les valeurs de l'étape 1.
4. Clique sur **Deploy**. Tu obtiens une adresse en `https://…vercel.app`.

Tu peux aussi sauter l'étape 3 et saisir l'URL et la clé dans **Réglages**, sur chaque appareil.

### 3. Installer sur tes appareils

- **Android (Chrome)** : ouvre l'adresse, menu ⋮ → *Installer l'application*.
- **iPhone (Safari)** : bouton Partager → *Sur l'écran d'accueil*.
- **PC (Chrome / Edge)** : icône d'installation à droite de la barre d'adresse.

Ensuite, va dans **Réglages**, crée ton compte, puis connecte-toi avec le même compte sur chaque appareil.

## Synchro : comment ça marche

Tout est d'abord enregistré sur l'appareil, donc l'appli fonctionne sans réseau. Dès qu'il y a une connexion, l'appli envoie tes changements et récupère ceux des autres appareils : au démarrage, quand tu reviens sur l'appli, et 3 s après chaque modification. Si le même élément a été modifié sur deux appareils, c'est la modification la plus récente qui est gardée. Une suppression est gardée comme un marqueur, pour qu'elle se propage aux autres appareils.

## Structure

```
src/lib/calc.ts        calculs (métabolisme, objectifs, macros)
src/lib/store.ts       données locales
src/lib/sync.ts        synchro Supabase
src/lib/off.ts         recherche Open Food Facts
src/components/        écrans (Journal, Mes menus, Aliments, Profil, Réglages, scanner)
src/data/seedFoods.json  aliments importés de l'Excel
supabase/schema.sql    tables et règles d'accès (nouveau projet)
supabase/migrations/   changements de tables pour un projet existant
```
