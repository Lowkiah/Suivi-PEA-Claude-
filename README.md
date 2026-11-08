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

Aucune opération n'est stockée dans le dépôt (public). Au premier lancement, importez votre CSV avec
**Importer mon CSV** : il est conservé uniquement dans le navigateur de l'appareil. Pour une mise à jour,
réimportez le fichier complet. Les fichiers `*.csv` et le dossier `data/` sont ignorés par Git.

Colonnes attendues : `id,date,type_operation,isin,ticker,symbole_yahoo,nom,libelle_courtier,type_actif,categorie,zone_geo,quantite,montant_total_eur,prix_unitaire_eur,devise,compte,courtier,statut_position`.

## Sur smartphone (Android) — GitHub Pages

Le workflow `.github/workflows/pages.yml` publie l'application sur GitHub Pages à chaque push.
**La version en ligne n'embarque pas vos opérations** (`data/` et `data.js` sont exclus) : sur chaque
appareil, on importe son CSV une fois, il est conservé uniquement dans le navigateur de l'appareil.

Mise en place (une seule fois) :
1. Sur GitHub : *Settings → Pages → Build and deployment → Source : **GitHub Actions***.
   (Pour un dépôt privé, GitHub Pages nécessite un compte GitHub Pro ; sinon rendre le dépôt public
   — dans ce cas pensez à retirer `data/operations_bourse.csv` et à vider `data.js`.)
2. *Actions → Déploiement GitHub Pages → Run workflow* (ou pousser un commit).
3. Ouvrir l'adresse affichée (`https://<utilisateur>.github.io/<dépôt>/`) dans Chrome sur Android,
   importer `operations_bourse.csv`, puis menu ⋮ → **Ajouter à l'écran d'accueil**.

Les cours en direct passent alors par des relais publics (corsproxy.io, allorigins, codetabs) :
s'ils sont indisponibles, l'application garde les derniers cours connus / saisis.
