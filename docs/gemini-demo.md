# Olimline — analyse d’emails avec Gemini

La fonction Vercel POST /api/analyze-email utilise Express. Le serveur vérifie
la session Supabase, le rôle et l’accès au dossier avant d’appeler Gemini.

| Variable Vercel | Configuration |
| --- | --- |
| GEMINI_API_KEY | Secret en production |
| GEMINI_MODEL | Facultative, avec gemini-3.1-flash-lite par défaut |
| VITE_SUPABASE_URL | URL du projet Supabase |
| VITE_SUPABASE_PUBLISHABLE_KEY | Clé publique de Supabase |

1. Se connecter avec un compte coordinateur ayant accès au dossier.
2. Ouvrir la fiche, coller un email fictif et lancer l’analyse.
3. Relire le résultat, le corriger si besoin et cocher la confirmation.
4. Ajouter le résultat aux notes, puis enregistrer la fiche.
5. Actualiser et vérifier que les notes sont sauvegardées.

Pour tester la fonction serveur, utiliser le déploiement Vercel ou vercel dev.
