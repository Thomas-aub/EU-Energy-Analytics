# Document de cadrage : EU-Energy-Analytics

### Quel est le problème abordé / à quel besoin répondons-nous ?

L'Europe traverse une double crise énergétique et climatique qui rend la compréhension de nos sources d'énergie plus cruciale que jamais. Le problème abordé est la difficulté pour un citoyen de saisir globalement les enjeux énergétiques européens : quels pays sont réellement les plus "verts" ? De qui dépendons-nous pour notre approvisionnement ?

Nous répondons au besoin de vulgariser et d'explorer ces données complexes. L'objectif est de permettre à l'utilisateur de dépasser les idées reçues en visualisant concrètement la production (nucléaire, renouvelable, fossile), les échanges transfrontaliers (import/export) et l'évolution historique de la dépendance énergétique des pays de l'UE.

### À qui s’adresse la visualisation, quelles tâches seront effectuées au travers de notre projet ?

**Public cible :**
Le projet s'adresse principalement aux **citoyens européens éclairés** (étudiants, journalistes, personnes intéressées par l'écologie) souhaitant une vue macroscopique rapide.

**Tâches principales :**

1.  **Comparer le mix énergétique (Vert vs Polluant) :** L'utilisateur pourra classer les pays selon leur part d'énergie renouvelable vs fossile et voir l'intensité carbone de leur production.
2.  **Analyser l'indépendance énergétique :** Identifier quels pays sont exportateurs nets ou importateurs nets, et visualiser les flux d'énergie pour comprendre les dépendances géopolitiques.
3.  **Observer la transition temporelle :** Visualiser l'évolution des consommations sur les 20 dernières années pour identifier les pays qui ont réussi leur transition énergétique et ceux qui stagnent.

### Sources de données choisies

**Source principale :**

  * **IEA (International Energy Agency) - Energy Balances :**
      * *Lien :* [IEA Data Browser](https://www.iea.org/data-and-statistics/data-tools/energy-statistics-data-browser?country=FRANCE&energy=Balances&year=2020)
      * *Intérêt :* Données de référence mondiale, standardisées et couvrant les bilans complets (pas seulement l'électricité, mais l'énergie totale).
      * *Limites :* Certaines données récentes peuvent être agrégées ou manquantes pour les années courantes (N-1).

**Plan de secours / Source complémentaire :**

  * **Eurostat (https://ec.europa.eu/eurostat/databrowser/view/nrg_bal_c/) :** 
  Si l'API ou l'extraction IEA s'avère complexe ou limitée, nous utiliserons les jeux de données Open Data d'Eurostat qui sont très complets pour l'UE et permettent des téléchargements en CSV/JSON faciles.

### Travaux importants liés au projet

1.  **Electricity Maps (https://app.electricitymaps.com/map/live/fifteen_minutes) :**
      * *Description :* Une carte en temps réel montrant l'intensité carbone et les échanges d'électricité.
      * *Intérêt/Amélioration :* C'est la référence pour le "temps réel". Notre projet se distinguera en se concentrant sur l'analyse historique (évolution sur 20 ans) et sur l'énergie globale (incluant chauffage/transport) et pas uniquement l'électricité.
2.  **Outil interactif Sankey d'Eurostat (https://ec.europa.eu/eurostat/cache/sankey/energy/sankey.html) :**
      * *Description :* Un diagramme de flux montrant la source d'énergie jusqu'à son utilisation finale.
      * *Intérêt/Amélioration :* Très complet mais visuellement complexe et austère pour le grand public. Nous souhaitons proposer une interface plus guidée et narrative (Scrollytelling).
3.  **Our World in Data - Energy (https://ourworldindata.org/energy) :**
      * *Description :* Articles riches en graphiques statiques ou interactifs simples (line charts).
      * *Intérêt/Amélioration :* Excellente pédagogie. Nous voulons reprendre cette clarté mais en permettant une exploration plus libre et comparative (ex: comparer directement la courbe de la France vs celle de l'Allemagne sur un même graphe).


### Organisation

* **Moyens de communication :**
    * Discord pour les échanges quotidiens et le partage de liens.

* **Sessions de travail :**
    * Une session hebdomadaire (en présentiel ou distanciel) le jeudi matin à 11h.
    * Point synchrone sur Discord le lundi ou mardi soir pour définir les objectifs de la semaine.
    * Travail individuel asynchrone avec un suivi documenté de l'avancement.

* **Rôles :**
    * **Thomas** est responsable du suivi de la documentation, de la cohérence des visualisations et de l'organisation générale.
    * **Fantin** est responsable de l'extraction et du traitement des données.
    * **Nessim** est responsable de la visualisation en D3.js, de l'architecture du code et des interactions complexes.

    *Note : Le groupe n'étant composé que de 3 personnes, ces rôles servent avant tout à définir des responsables pour le suivi, la maintenance et la cohérence du projet. Il est entendu que tous les membres du groupe seront amenés à travailler de manière transversale sur ces trois aspects.*



### Scan des esquisses finales

Nous avons exploré plusieurs pistes graphiques pour répondre aux tâches identifiées. Voici les quatre visualisations retenues, détaillées selon une structure commune :

#### 1\. Vue Spatiale : Carte de l'Europe

  * **Objectif :** Servir de point d'entrée pour une comparaison géographique immédiate. Elle permet d'identifier rapidement les bons et les mauvais élèves en termes de mix énergétique.
  * **Encodage visuel :** Carte choroplèthe. Chaque pays est coloré selon une échelle divergente (du Rouge au Vert) représentant le ratio *Énergie Décarbonée / Énergie Carbonée*.
  * **Interactions :**
      * **Tooltip (Survol) :** Affiche le nom du pays, la valeur précise du ratio et la production totale.
      * **Slider temporel :** Permet de voir l'évolution de la carte année par année.
      * **Filtres (Optionnel) :** Nous envisageons d'ajouter un sélecteur permettant de basculer la carte selon trois modes :
        1.  *Ratio carbone* (vue par défaut).
        2.  *Consommation par habitant* (plus la couleur est intense, plus la consommation est élevée).
        3.  *Balance commerciale* (Bleu = Exportateur net, Rouge = Importateur net).

\<img src="asset/pictures/IMG\_5061.jpg" width="600" alt="Esquisse Carte Europe"\>

#### 2\. Vue Temporelle : Évolution du Mix

  * **Objectif :** Comprendre l'histoire énergétique d'un pays spécifique. Elle montre la transition énergétique (ex: essor du nucléaire, déclin du charbon) sur le long terme.
  * **Encodage visuel :** *Stacked Area Chart* (Graphique en aires empilées). L'axe X représente le temps, l'axe Y la quantité d'énergie (en TJ), et les couches de couleurs correspondent aux différentes sources (Charbon, Gaz, Nucléaire, etc.).
  * **Interactions :**
      * **Tooltip (Survol) :** Une ligne verticale suit la souris pour indiquer l'année exacte. Une infobulle affiche alors le détail chiffré de chaque source d'énergie pour cette année-là.

\<img src="asset/pictures/IMG\_5058.jpg" width="600" alt="Esquisse Evolution Temporelle"\>

#### 3\. Vue Comparative : Détail de la Production

  * **Objectif :** Comparer finement les volumes et les types de production entre plusieurs pays. Contrairement à la carte qui montre un ratio, ici on compare des quantités absolues et leur répartition.
  * **Encodage visuel :** *Grouped Bar Chart* (Histogramme groupé). L'axe X liste les pays sélectionnés, l'axe Y la quantité. Chaque pays possède plusieurs barres correspondant aux types d'énergie (Vert, Pétrole, Charbon).
  * **Interactions :**
      * **Tooltip (Survol) :** Au survol d'une barre spécifique, l'infobulle affiche le pays, le type d'énergie précis et le volume de production exact.

\<img src="asset/pictures/IMG\_5059.jpg" width="600" alt="Esquisse Comparaison Production"\>

#### 4\. Vue Classement : Consommation par Habitant

  * **Objectif :** Normaliser les données pour comparer l'efficacité ou la "gourmandise" énergétique des pays, indépendamment de leur taille démographique.
  * **Encodage visuel :** *Horizontal Bar Chart* (Barres horizontales). Les pays sont triés par ordre décroissant de consommation (kWh/pers). La longueur de la barre représente l'intensité de la consommation.
  * **Interactions :**
      * **Tooltip (Survol) :** Affiche la valeur exacte en kWh/habitant et le rang du pays dans le classement européen.
      * **Slider temporel :** Lié à la vue principale, permet de voir l'évolution du classement dans le temps.

\<img src="asset/pictures/IMG\_5060.jpg" width="600" alt="Esquisse Consommation par habitant"\>