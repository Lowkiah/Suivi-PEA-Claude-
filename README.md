# Suivi PEA

Application web (HTML/JS, sans installation) de suivi de portefeuille boursier à partir d'un CSV d'opérations.

## Lancer

Ouvrir `index.html` dans un navigateur (ou `python3 -m http.server` puis http://localhost:8000).
Une connexion internet est nécessaire pour charger Chart.js depuis le CDN.

## Onglets

- **Suivi** : indicateurs (valeur, investi, plus-values latentes/réalisées), graphique d'évolution valeur vs apport net,
  répartition (catégorie / zone / ligne), investissements mensuels, positions ouvertes (PRU, perf., poids) et positions soldées.
  Le cours actuel de chaque ligne est modifiable directement dans le tableau (sauvegardé dans le navigateur) ;
  par défaut c'est le dernier prix d'exécution connu.
- **Projection DCA** : choix du DCA mensuel, du rendement annuel, de la durée et du capital de départ
  (curseurs, saisie libre ou valeurs rapides). Graphique capital projeté vs total versé avec fourchette ±2 pts,
  et tableau année par année.
- **Opérations** : historique filtrable.

## Données

Les opérations par défaut sont dans `data/operations_bourse.csv` (copie embarquée dans `data.js`).
Le bouton **Importer un CSV** permet de charger un fichier mis à jour (mêmes colonnes) ; il est mémorisé dans le navigateur.
Pour mettre à jour les données par défaut : `{ printf 'window.DEFAULT_CSV = \`'; cat data/operations_bourse.csv; printf '\`;\n'; } > data.js`
