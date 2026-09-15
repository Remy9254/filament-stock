# Filament Stock V2 — PWA multiplateforme

Cette V2 reprend la logique de la V1.6.1 dans une application web installable :
- Windows / macOS via navigateur moderne
- iPhone / iPad via Safari > Partager > Ajouter à l'écran d'accueil
- interface responsive et tactile
- tableau de bord, bobines, étagère, historique
- petits blocs pseudo-isométriques
- glisser-déposer à la souris et déplacement tactile
- ajout / modification / consommation
- filtres et recherche
- données locales IndexedDB
- cache Service Worker pour fonctionner hors connexion
- export/import JSON

## Test sur PC
Double-clique `serveur_local.bat`, puis ouvre http://localhost:8080

## Installation iPhone/iPad
Une PWA iOS doit être servie en HTTPS (hors localhost). Il faut donc publier ce dossier sur un hébergeur HTTPS.
Ensuite dans Safari : Partager > Ajouter à l'écran d'accueil.

## Synchronisation PC / iPhone / iPad
La V2 fournie est réellement offline/local-first, mais la synchronisation entre appareils nécessite un backend commun.
Ce ZIP ne contient volontairement aucune clé cloud inventée. Il faut connecter un backend (par ex. Supabase/Firebase ou serveur personnel), puis la V2 peut pousser les changements quand Internet revient et les récupérer sur les autres appareils.

La page Réglages indique clairement cet état. En attendant, export/import JSON permet de transférer le stock.

## Publication GitHub Pages

Adresse prévue : https://remy9254.github.io/filament-stock/

Dans Settings > Pages : Source = Deploy from a branch, Branch = main, dossier = / (root), puis Save. Les fichiers sont à la racine de main et tous les chemins de la PWA restent relatifs au dossier /filament-stock/. Aucun outil de compilation n’est nécessaire.

Sur iPhone/iPad, ouvrir cette adresse dans Safari, puis Partager > Sur l’écran d’accueil > Ajouter (activer Ouvrir comme app web si proposé). Ouvrir une première fois avec Internet pour remplir le cache. Les stocks restent propres à chaque appareil ; utiliser Exporter/Importer pour transférer une sauvegarde.
