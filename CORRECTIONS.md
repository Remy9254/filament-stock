# Corrections du stock

Depuis l’historique, « Annuler la consommation » rend les grammes à la même bobine et marque le mouvement comme annulé. Une bobine terminée retrouve le stock. Une bobine supprimée reste supprimée jusqu’à sa restauration explicite.

« Remettre en stock » demande un poids restant positif, au maximum égal au poids initial, et attribue une place libre. Les anciennes étapes et la correction restent dans l’historique.

Les corrections demandent Internet et une session connectée. Les opérations normales restent disponibles hors ligne. La fonction `correct_stock` réalise la correction de la bobine et du mouvement dans une transaction, avec verrouillage et protection contre les doubles annulations.

## Base de données

Le schéma additionnel est documenté dans `database/stock-corrections.sql`, appliqué après `database/spool-lifecycle.sql`. Ne pas réappliquer l’ancien déclencheur seul : cela retirerait la prise en charge des restaurations.

`correction_revision` distingue une correction explicite d’un ancien état envoyé par un autre appareil. La version corrigée est prioritaire sur les états précédents. Mettre à jour tous les appareils : les anciennes versions de la PWA ne savent pas modifier une bobine après une correction. Aucun compte ni identifiant de bobine n’est remplacé. Les politiques RLS restent actives, et la fonction s’exécute avec les droits de l’utilisateur connecté.

## Vérifications effectuées

- Navigateur aux largeurs 375, 820 et 1440 px : annulation, restauration, refus hors connexion, conflit serveur, historique et rechargement.
- SQL dans une transaction annulée après vérification : double annulation, restauration, ancien état rejeté, annulation préservée, révision obsolète refusée.
- Tests existants du compte, des mots de passe et du cycle de vie des bobines.

L’ancienne alerte Supabase concernant la protection contre les mots de passe compromis est indépendante de ces changements.

