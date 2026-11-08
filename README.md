# Suivi PEA

Application web (HTML/JS, sans installation) de suivi de portefeuille boursier à partir d'un CSV d'opérations.

## Lancer

```bash
python3 server.py        # puis ouvrir http://localhost:8000
```

Le petit serveur (Python standard, aucune dépendance) sert l'application et relaie les cours
**Yahoo Finance** : les navigateurs ne peuvent pas interroger Yahoo directement (restriction CORS).

Ouvrir directement `index.html` fonctionne aussi : l'application tente alors Yahoo via des proxys
publics (corsproxy.io, allorigins), moins fiables. Sans cours disponibles, elle utilise les cours saisis
à la main, sinon le dernier prix d'achat.

## Cours en direct

- Cours récupérés au chargement puis **toutes les 60 s** (et au retour sur l'onglet), bouton ↻ pour forcer.
- Indicateur dans l'en-tête : vert = toutes les lignes cotées, orange = partiel, rouge = indisponible.
- Variation du jour par ligne et pour le portefeuille.
- Le graphique d'évolution utilise les **clôtures de fin de mois** Yahoo (5 ans d'historique) ;
  conversion automatique en euros pour les titres cotés en devise (ex. EVO.ST en SEK).
- Le symbole utilisé est la colonne `symbole_yahoo` du CSV.

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
