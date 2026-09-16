# Compte et mot de passe

La PWA conserve IndexedDB (`filament-stock-v2`, version 1), le format des bobines,
les mouvements et la clé de session existante. Aucun utilisateur ni UUID n'est
créé, supprimé ou remplacé lors d'un changement de mot de passe.
L'interface portrait (`mobile.css`, `mobile.js`) reste inchangée.

## Utilisation

- **Réglages → Compte → Changer mon mot de passe** : saisir le mot de passe
  actuel, le nouveau (au moins 8 caractères) et sa confirmation.
- Depuis la connexion : **Mot de passe oublié ?**, saisir l'e-mail du compte,
  puis ouvrir le lien Supabase reçu. La PWA ouvre automatiquement les réglages
  pour choisir le nouveau mot de passe.
- Après récupération, se reconnecter explicitement. Si Supabase révoque une
  session sur un autre appareil après le changement, utiliser le nouveau mot
  de passe sur cet appareil. Les données locales restent conservées.
- Ces opérations nécessitent Internet. Le stock reste utilisable hors ligne.

## Mécanismes Supabase Auth

L'application conserve l'intégration HTTP officielle déjà utilisée dans `sync.js`
(pas de seconde bibliothèque ni de migration des sessions).

- Vérification du mot de passe actuel : `POST /auth/v1/token?grant_type=password`,
  puis vérification que l'UUID reçu est celui du compte connecté.
- Changement : `PUT /auth/v1/user` avec la session fraîche et les champs
  `password` / `current_password`. Aucun endpoint administrateur.
- E-mail de récupération : `POST /auth/v1/recover?redirect_to=...`.
- Retour de récupération : flux implicite officiel avec jetons dans le fragment
  de l'URL (`type=recovery`). Le fragment est immédiatement retiré de l'historique.
  `GET /auth/v1/user` vérifie la session avant de proposer le nouveau mot de passe.
- La récupération reste dans `sessionStorage` de l'onglet, séparée de la session
  normale. Elle ne déclenche aucune synchronisation de stock. Les jetons sont
  retirés du stockage à l'annulation ou après succès.
- Les mots de passe ne sont jamais enregistrés ni journalisés. Les champs sont
  vidés après chaque soumission. Les erreurs ne révèlent pas l'existence d'un compte.
- Une panne de réseau pendant le renouvellement de session ne déconnecte plus
  l'appareil. La déconnexion volontaire utilise `scope=local`.

Références officielles :
- https://supabase.com/docs/guides/auth/passwords
- https://supabase.com/docs/guides/auth/redirect-urls
- https://github.com/supabase/auth/blob/master/openapi.yaml

## Configuration de production

Projet : `sykkkgzvyysagpucelik`.

Dans **Authentication → URL Configuration** :
- Site URL : `https://remy9254.github.io/filament-stock/`
- Redirect URLs : la même URL exacte, sans joker.

Le modèle de récupération doit utiliser le lien Supabase `{{ .ConfirmationURL }}`.
Le projet utilise actuellement le service e-mail et le modèle par défaut Supabase.
Les limites d'envoi et de destinataires de ce service s'appliquent :
https://supabase.com/docs/guides/auth/auth-smtp

Dans **Authentication → Sign In / Providers** :
- désactiver **Allow new users to sign up** après déploiement et vérification ;
- conserver **Email** activé et **Confirm email** activé ;
- conserver les connexions anonymes désactivées.

## Réautoriser les inscriptions plus tard

1. Réactiver **Allow new users to sign up** dans Supabase.
2. Passer `ALLOW_SIGNUP` à `true` dans `account.js`.
3. Incrémenter le suffixe de cache dans `sw.js` et publier.

La fermeture repose sur Supabase, pas uniquement sur le masquage du bouton.
Cette réouverture ne modifie ni les utilisateurs existants ni leurs UUID.
Avant d'utiliser plusieurs comptes sur un même appareil, prévoir l'isolation
locale par utilisateur : le stockage IndexedDB existant est commun à cet appareil.

## Vérification

Les tests de navigateur locaux utilisent des réponses Auth simulées, sans
changer le mot de passe du propriétaire ni créer de compte de test en production.
Ils couvrent : mot de passe actuel incorrect, confirmations différentes, changement
réussi avec le même UUID, demande d'e-mail, limite d'envoi, retour du lien,
rechargement pendant la récupération, lien expiré/invalide, compte différent,
panne réseau, reconnexion, conservation IndexedDB et reprise de synchronisation.
Le fonctionnement hors ligne et les écrans de stock sont aussi contrôlés.

Le test réel de réception de l'e-mail et du changement de mot de passe se fait
par le propriétaire, sans communiquer ses mots de passe ni son lien de récupération.

Cache de cette version : `filament-stock-v2-account-5`.
