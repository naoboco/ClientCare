# Analyse des échanges Gmail

Depuis une fiche client, **Analyser les échanges Gmail** recherche les messages
envoyés ou reçus avec l’adresse enregistrée dans le dossier, y compris ceux où le
client figure en copie. Le serveur parcourt toutes les pages de résultats dans
la boîte autorisée, hors brouillons, spam et corbeille. Gemini reçoit les sujets,
dates et textes des messages retenus. La synthèse, les besoins et le brouillon
de réponse sont modifiables avant l’enregistrement de la synthèse interne.

## Configuration de la boîte

1. Créer un connecteur **Google** dans Vercel Connect. Configurer l’autorisation
   utilisateur en lecture Gmail avec `https://www.googleapis.com/auth/gmail.readonly`.
   Si la configuration utilise un client OAuth Google Cloud, activer **Gmail API**
   dans son projet et utiliser l’URI de redirection indiquée par le connecteur.
2. Lier le connecteur au projet Vercel `client-care` pour **Production**.
   Activer l’exposition des variables système Vercel pour l’authentification OIDC.
3. Configurer les variables ci-dessous en **Production**. Vérifier dans Google AI
   Studio que la clé Gemini appartient à un projet avec facturation active et
   que le partage facultatif des journaux est désactivé avant de traiter les
   échanges clients.
4. Exécuter `supabase/pas-a-pas/13-analyses-gmail.sql` dans le SQL Editor de Supabase,
   puis déployer le code via GitHub.
5. Ouvrir une fiche en tant qu’administrateur, cliquer sur **Analyser les échanges
   Gmail**, puis **Connecter la boîte Gmail**. Autoriser la boîte configurée dans
   `GMAIL_MAILBOX`. Après le retour dans l’espace Olimline, relancer l’analyse.

| Variable Vercel | Configuration |
| --- | --- |
| `GMAIL_CONNECTOR_UID` | Identifiant du connecteur tel qu’affiché dans Vercel |
| `GMAIL_ORGANIZATION_ID` | Identifiant Supabase de l’entreprise autorisée |
| `GMAIL_MAILBOX` | Adresse principale de la boîte Gmail de cette entreprise |
| `GEMINI_API_KEY` | Clé Gemini conservée comme secret côté serveur |
| `GEMINI_PAID_PROJECT` | `true` après vérification de la configuration Gemini pour les données clients |
| `GEMINI_MODEL` | Facultative, `gemini-3.1-flash-lite` par défaut |
| `VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY` | Configuration Supabase existante |

L’accès Gmail est associé à l’entreprise configurée. Le serveur utilise la session
Supabase du salarié pour vérifier le rôle et l’accès au dossier. Les corps des
messages sont traités en mémoire pour l’analyse. La base conserve les synthèses
relues avec le nombre de messages, les dates couvertes et l’auteur de la validation.
Les règles Supabase réservent ces synthèses aux administrateurs de l’entreprise
et aux coordinateurs affectés au dossier.

Une analyse traite jusqu’à 800 000 octets de texte et de métadonnées. L’interface
affiche une erreur si l’historique dépasse cette taille ou si sa récupération
échoue. Pour une ouverture à des organisations externes, vérifier les conditions
Google applicables à la portée Gmail restreinte et publier les informations de
confidentialité de l’intégration.

- [Connecteur Google](https://vercel.com/connect/google)
- [Portées Gmail](https://developers.google.com/workspace/gmail/api/auth/scopes)
- [Conditions Gemini](https://ai.google.dev/gemini-api/terms)
