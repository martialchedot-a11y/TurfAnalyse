# TurfAnalyse Web — mise en ligne et installation

Cette version est une **web app** : aucun Mac, aucun Xcode, aucun compte Apple
developpeur necessaire. Elle fonctionne sur iPhone (Safari) et sur PC
(n'importe quel navigateur). Tout se passe depuis votre PC Windows.

## Ce qu'il faut savoir avant de commencer

- Le moteur de calcul (scores, probabilites, classement) est **identique**
  a celui du classeur Excel — verifie par des tests automatises reellement
  executes (contrairement a la version iOS native, ici j'ai pu lancer les
  tests moi-meme et confirmer qu'ils passent tous).
- Vos donnees (historique des chevaux, reunions importees, journal de
  predictions) restent **uniquement dans le navigateur** de l'appareil qui
  les a importees (technologie IndexedDB). Il n'y a pas de compte ni de
  synchronisation automatique entre iPhone et PC : si vous utilisez les deux,
  utilisez le bouton "Exporter une sauvegarde" (onglet Importer) sur un
  appareil, puis "Importer une sauvegarde" sur l'autre.
- Pas de serveur a maintenir : une fois hebergee (gratuitement), l'app
  fonctionne meme hors-ligne apres le premier chargement.

## Etape 1 — Heberger les fichiers (gratuit, ~5 minutes)

Il faut un hebergement en HTTPS pour que "Ajouter a l'ecran d'accueil" sur
iPhone fonctionne correctement (mode plein ecran, icone, hors-ligne). Le
plus simple sans rien installer sur votre PC :

### Option recommandee : GitHub Pages

Gratuite sans limite de credit ni de facturation a l'usage pour ce type de
site (contrairement a Netlify, voir plus bas) — la meilleure option pour
faire evoluer l'app dans la duree sans frais.

1. Creez un compte sur https://github.com si vous n'en avez pas.
2. Creez un nouveau depot (bouton vert "New"), nom libre, public.
3. Sur la page du depot, "Add file > Upload files", glissez tout le contenu
   du dossier `TurfAnalyse-Web`.
4. Une fois envoye, allez dans **Settings > Pages**, section "Source",
   choisissez la branche `main` et le dossier `/ (root)`, sauvegardez.
5. Apres 1-2 minutes, votre app est disponible a l'adresse indiquee en haut
   de cette page (du type `https://votre-nom.github.io/nom-du-depot/`).

Pour mettre a jour l'app plus tard (si je vous fournis des corrections),
remplacez les fichiers dans le depot ("Add file > Upload files" de nouveau,
ou en modifiant les fichiers directement dans l'interface GitHub) ; Pages se
redeploie automatiquement en 1-2 minutes.

**Important apres une mise a jour** : l'app fonctionne hors-ligne grace a un
"service worker" qui garde une copie des fichiers en cache sur votre
appareil. Apres avoir redeploye une version mise a jour, faites **une fois**
un rechargement force de la page (Ctrl+F5 sur PC, ou fermez completement
l'onglet/l'app et rouvrez-la) pour etre sur de charger la toute derniere
version plutot qu'une copie en cache. Les mises a jour suivantes se
prendront en compte automatiquement des la premiere ouverture (des lors que
vous etes en ligne), sans manipulation particuliere.

Seule difference avec Netlify : GitHub Pages ne supporte pas les "fonctions
serverless" utilisees pour la recuperation automatique des cotes PMU la plus
fiable (voir plus bas). C'est une limite structurelle de GitHub Pages, pas un
manque de configuration : un hebergement statique ne sait servir que des
fichiers tels quels, sans jamais executer de code cote serveur - or c'est
justement un tel code, cote serveur, qui permet d'eviter le probleme CORS qui
bloque l'appel direct depuis le navigateur a l'API du PMU. Sans ce code
serveur, l'app bascule alors automatiquement sur l'appel direct a l'API du
PMU puis, si besoin, une cascade de proxies CORS publics gratuits — sans
aucune action de votre part ni perte de fonctionnalite visible, mais ces
proxies gratuits se sont reveles en pratique peu fiables. La solution
recommandee pour retrouver cette fiabilite tout en restant sur GitHub Pages
est decrite dans "Mise a jour v6" de la section "Mise a jour des cotes en
direct (PMU.fr, 1 seul clic)" plus bas : **Val Town**, un service gratuit
avec editeur de code dans le navigateur (aucun compte Netlify necessaire).

### Alternative : Netlify

**Attention** : depuis 2026, Netlify facture l'usage au-dela d'un quota
mensuel gratuit reduit (systeme de credits a plafond dur, sans depassement
possible — le site passe hors-ligne le reste du mois si le quota est
depasse). Pour un usage personnel tres occasionnel cela peut suffire, mais
si vous avez deja epuise ce quota, privilegiez GitHub Pages (ci-dessus), qui
reste entierement gratuit pour ce type de site.

1. Allez sur https://app.netlify.com et creez un compte gratuit (email ou
   Google/GitHub).
2. Une fois connecte, cherchez la zone "Add new site" > **"Deploy manually"**
   (ou la zone de glisser-deposer sur la page d'accueil du tableau de bord).
3. Glissez-deposez le dossier `TurfAnalyse-Web` (celui-ci, en entier) dans la
   zone indiquee.
4. Netlify vous donne une adresse du type `https://nom-au-hasard.netlify.app`
   — c'est votre app, deja en ligne.
5. (Optionnel) Dans "Site settings > Change site name", choisissez un nom
   plus simple, par exemple `mon-turfanalyse.netlify.app`.

Pour mettre a jour l'app plus tard (si je vous fournis des corrections),
il suffira de re-glisser le dossier mis a jour au meme endroit.

Le dossier `TurfAnalyse-Web` inclut `netlify.toml` et le sous-dossier
`netlify/functions/` : Netlify les detecte automatiquement lors du
glisser-deposer, sans aucune manipulation supplementaire de votre part —
c'est ce qui permet la recuperation des cotes PMU la plus fiable, decrite
plus bas (mais consomme une partie du quota gratuit mensuel).

**Important apres une mise a jour** : l'app fonctionne hors-ligne grace a un
"service worker" qui garde une copie des fichiers en cache sur votre
appareil. Apres avoir redeploye une version mise a jour, faites **une fois**
un rechargement force de la page (Ctrl+F5 sur PC, ou fermez completement
l'onglet/l'app et rouvrez-la) pour etre sur de charger la toute derniere
version plutot qu'une copie en cache. Les mises a jour suivantes se
prendront en compte automatiquement des la premiere ouverture (des lors que
vous etes en ligne), sans manipulation particuliere.

## Etape 2 — Installer sur iPhone

1. Ouvrez l'adresse de votre app dans **Safari** (pas Chrome — "Ajouter a
   l'ecran d'accueil" en mode plein ecran ne fonctionne correctement que
   depuis Safari sur iPhone).
2. Appuyez sur le bouton Partager (carre avec une fleche vers le haut).
3. Faites defiler et choisissez **"Sur l'ecran d'accueil"**.
4. Confirmez. Une icone TurfAnalyse apparait sur votre ecran d'accueil,
   s'ouvre en plein ecran comme une vraie app, fonctionne hors-ligne apres
   le premier lancement.

## Etape 3 — Utiliser sur PC

Ouvrez simplement la meme adresse dans votre navigateur habituel. Vous
pouvez aussi l'"installer" comme app de bureau : dans Chrome ou Edge, une
icone d'installation apparait dans la barre d'adresse (ou menu ⋮ >
"Installer TurfAnalyse").

## Utilisation

1. Onglet **Importer** : importez d'abord votre fichier "Performances
   completes" (historique), puis le CSV de la reunion du jour ("Reunion
   complete") — meme format que celui utilise aujourd'hui pour Excel.
   *** Mise a jour *** : un export **"journee complete"** regroupant
   **plusieurs reunions dans un seul fichier** est desormais accepte lui
   aussi (voir "Format 'journee' multi-reunions" plus bas) — chaque reunion
   detectee dans le fichier est alors importee separement, exactement comme
   si vous aviez importe un fichier par reunion.
2. Onglet **Reunions** : ouvrez la reunion, choisissez une course, l'app
   calcule le classement predictif automatiquement (bases, outsiders,
   value bets, combinaisons suggerees), ainsi qu'un bloc **"Base(s)
   possible(s) & Danger(s)"** (voir ci-dessous), annote **"Course logique"**
   ou **"Course disputee"** selon la fiabilite technique des bases.
3. Bascule "Cote directe / Cote 8h" pour la reference de calcul de la Value.
   *** Correction *** : la cote affichee sous chaque cheval (badge "Cote")
   suit desormais ce meme selecteur (avec repli sur l'autre cote si celle
   demandee est absente) — auparavant elle affichait toujours la cote
   directe (colonne Z du CSV), meme en mode "Cote 8h" (colonne Y), ce qui
   donnait l'impression que les deux modes affichaient la meme valeur tant
   qu'aucune mise a jour des cotes en direct n'avait ete faite. Pour
   rappel : la cote 8h (colonne Y) est figee des l'import et ne bouge
   jamais ; seule la cote directe (colonne Z) varie, via le bouton "Mettre
   a jour les cotes en direct" ci-dessous.
4. Sur l'ecran d'une course, bouton **"Mettre a jour les cotes en direct"**
   pour rafraichir les cotes directes en un seul clic : recuperation et
   application automatiques via l'API du PMU, sans autre action (voir
   ci-dessous). Si la course est deja terminee au moment du rafraichissement,
   l'**arrivee officielle** est detectee et enregistree automatiquement, sans
   action supplementaire de votre part.
5. Bouton **Resultat** : consultez ou corrigez manuellement l'ordre
   d'arrivee (ex. `10-15-3-7`) — utile si l'arrivee n'a pas encore ete
   detectee automatiquement, ou pour la saisir a la main.
6. Onglet **Courses sures** : liste, toutes reunions importees confondues,
   les courses ayant une base solide/tres solide **et** au moins un cheval
   avec un Score Global >= 80 — un raccourci pour reperer d'un coup d'oeil
   les courses les plus fiables du jour.
7. Pensez a exporter une sauvegarde de temps en temps (onglet Importer) —
   vos donnees ne vivent que dans ce navigateur.
8. Onglet **Importer > Reinitialisation** : bouton "Vider les reunions
   importees" pour repartir propre entre deux journees de courses (voir
   ci-dessous).

## Format "journee" multi-reunions (import)

Certains fournisseurs de donnees exportent une **journee complete** (toutes
les reunions du jour) dans un seul fichier CSV, plutot qu'un fichier par
reunion. Ce format differe du format standard "Reunion complete" sur deux
points, geres automatiquement a l'import (`js/engine/csvImporter.js`) :

1. **Une colonne en plus** : "Pedigree Faible" est inseree juste avant
   "Cote Calc" (77 colonnes au lieu de 76 habituelles), ce qui decale tous
   les champs a partir de "Cote Calc" (cote predictive, numero de reunion,
   numero de course, lieu, heure, discipline, allocation, distance, nombre
   de partants, arrivee). Le decalage est detecte automatiquement a partir
   du nombre de colonnes de la premiere ligne de donnees (0 pour le format
   standard a 76 colonnes, 1 pour la variante "journee" a 77 colonnes) et
   applique de facon transparente : vous n'avez rien a faire de special.
2. **Plusieurs reunions dans un seul fichier** : le regroupement des lignes
   se fait desormais sur la paire (numero de reunion, numero de course), et
   non plus sur le seul numero de course, afin de ne jamais fusionner a
   tort deux courses de meme numero mais de reunions differentes (ex.
   "Course 1" de la reunion 1 et "Course 1" de la reunion 4 ne sont plus
   melangees). A l'import (onglet **Importer**), chaque reunion detectee
   dans le fichier est enregistree comme un "meeting" separe, exactement
   comme si vous aviez importe un fichier standard par reunion — le message
   de confirmation liste alors chaque reunion importee avec son hippodrome
   et son nombre de courses.

Le format standard "Reunion complete" a 76 colonnes (une seule reunion par
fichier) continue evidemment de fonctionner sans aucun changement.

## Base(s) possible(s) & Danger(s) (Module 2)

En plus du classement predictif (Module 1 : Score Global, Value, probabilites),
chaque course affiche desormais un bloc **"Base(s) possible(s) & Danger(s)"**,
porte depuis la feuille "Analyse complete course" et le module VBA `Module112`
du classeur Excel :

- **Base(s) possible(s)** : les chevaux recommandes "Base tres solide" par le
  Module 1 (a defaut, "Base solide"), avec un niveau de confiance selon qu'ils
  sont aussi confirmes par les criteres techniques du Module 2 (18 rubriques
  RJ/RE/ED/MP/PtH/MN/RC/RX/MX/CX/IdC/CFP/OR/PC/MA/AR/TG/R10, Top 3 par
  rubrique, associations de rubriques et criteres SC/cote/Dp selon la
  discipline). Une base "confirmee" (fond rouge) est plus fiable qu'une base
  "non confirmee" (grise). *** Mise a jour v2 *** : une recommandation du
  Module 1 n'est desormais retenue comme base que si la cote predictive ET
  la cote 8h du cheval sont toutes deux renseignees et <= 12 - un cheval
  recommande "Base solide"/"Base tres solide" mais dont une des deux cotes
  depasse 12 (ou est absente) n'apparait plus dans Base(s) possible(s).
- **Danger(s)** : les chevaux tres joues par le marche (Value < -10%, cote
  jouable) mais non retenus comme base. *** Mise a jour, suite a
  verification sur donnees reelles (voir "Marche vs modele : verification
  sur donnees reelles" plus bas) *** : ces chevaux ont statistiquement
  mieux performe que le reste du champ — a prendre au serieux dans vos
  combinaisons, pas seulement comme un risque a surveiller.

Cette fonctionnalite n'a ete implementee que dans la web app (pas dans le
projet iOS/Swift initial), puisque vous n'avez pas de Mac pour compiler ce
dernier ; le moteur de calcul reste toutefois strictement identique pour les
deux si vous deviez un jour reprendre la version iOS.

Juste apres le bloc Danger(s), un encart **"Cote(s) cible(s) la plus proche"**
a ete ajoute, porte depuis la sub VBA `TrouverCotesCibles` (feuille "Cotes
cibles" du classeur) : pour 4 cotes de reference calculees a partir du
nombre de partants (NP/4, NP/2, NP, NP x2 — des reperes classiques
favori/outsider), il indique le cheval du champ dont la cote actuelle en
est la plus proche (tolerance ±100% autour de la cible, comme la valeur par
defaut de la macro d'origine). Cet indicateur est independant du Score
Global/Value du Module 1 : il ne fait que reperer les chevaux dont la cote
"colle" a ces bandes de reference.

## Bonus Rubriques dans le Score Global (Module 1, mise a jour v6.2)

La mise a jour v6.2 du module VBA `AnalysePerformanceChevaux` presente son
changelog comme un simple correctif de format Excel (Value/ProbVictoire/
ProbTop3 stockes en nombres plutot qu'en texte "45%") — sans impact pour la
web app, qui n'a jamais eu ce probleme. En comparant le code en detail, une
fonction `CalculerScoreRubriquesCourse` non liee a ce changelog s'est
toutefois averee absente du portage JS : elle est desormais integree.

Pour chaque course, un **bonus de 0 a 15 points** est ajoute directement au
Score Global de chaque cheval, selon le nombre de rubriques (parmi les 5
choisies pour la discipline — les memes que celles du bloc "Base(s)
possible(s) & Danger(s)" ci-dessus) ou il figure dans le Top 4 du champ (3
points par rubrique). Ce bonus est visible sur la fiche de chaque cheval,
sous la barre "Similaire", sous le libelle **"Bonus Rubriques"**.

## Reinitialisation des reunions importees

Onglet **Importer > Reinitialisation** : le bouton "Vider les reunions
importees" efface toutes les reunions/courses deja importees (utile pour
repartir propre chaque jour), avec une confirmation avant suppression.
Il ne touche **pas** a l'historique des performances (onglet Importer,
premiere carte) : seules les reunions/courses du jour sont effacees.

## Arrivee officielle, meilleur outsider, Courses sures, annotation logique/disputee

Quatre ajouts recents, tous porteurs d'informations deja calculees par le
moteur existant (aucun nouveau critere metier introduit) :

- **Arrivee officielle automatique** : en plus de la saisie manuelle
  (bouton "Resultat"), l'app interroge desormais aussi l'API du PMU pour
  savoir si la course est terminee (`arriveeDefinitive` + `ordreArrivee`).
  Cette detection se declenche automatiquement a chaque clic sur "Mettre a
  jour les cotes en direct" (meme fonction serverless Netlify / cascade de
  repli que pour les cotes) : si l'arrivee est connue et n'etait pas deja
  enregistree, elle est sauvegardee et affichee en haut de la fiche course
  sans action supplementaire. La saisie manuelle reste disponible si vous
  preferez l'entrer vous-meme ou si la detection automatique echoue.
- **Meilleur outsider (place 4 a 8)** : dans le bloc "Combinaisons
  suggerees", si le meilleur cheval classe entre la 4e et la 8e position
  (au sens du moteur de score) ne figure deja pas dans le Trio suggere, il
  est desormais ajoute sur sa propre ligne.
- **Annotation "Course logique" / "Course disputee"** (renommee, ex "Course
  aleatoire" — voir encadre plus bas) : affichee a cote du titre "Base(s)
  possible(s) & Danger(s)" (et reprise dans l'onglet Courses sures). Elle
  croise 3 signaux deja calcules par le moteur, les 3 devant etre reunis
  pour "Course logique" (sinon "Course disputee") :
  1. au moins une base "solide" ou "tres solide" (Module 1) est *confirmee
     techniquement* par le Module 2 (croisement des rubriques/associations,
     cf. ci-dessus) ;
  2. au maximum 5 Danger(s) detecte(s), au sens Value < -10% (un Danger =
     cheval tres joue par le marche mais non retenu comme base, signe de
     desaccord entre marche et modele) ;
  3. une "Hierarchie claire" (ecart Top3/4e >= 15 points, cf. "Pronostic
     suggere") : le Top3 se detache nettement du reste.

  *** Mise a jour *** : la cote (marche) n'est plus prise en compte dans les
  criteres 1 et 2 ci-dessus - ni pour la confirmation de la base (qui ne
  depend plus du plafond de cote <= 12 impose par ailleurs au bloc "Base(s)
  possible(s)"), ni pour le comptage des Danger(s) (qui ne se limite plus
  aux chevaux avec une cote jouable <= 50). Ce statut repose ainsi
  uniquement sur les criteres techniques (Module 2) et le classement du
  Score Global (Module 1), independamment de ce que fait le marche des
  cotes. Le bloc d'affichage "Base(s) possible(s) & Danger(s)" lui-meme
  n'est pas modifie et continue d'appliquer ses propres filtres de cote.

  *** Note *** : un 3e critere base sur la confiance Top3 moyenne
  (Plackett-Luce) a ete teste puis ecarte apres verification sur des
  donnees reelles : cette confiance reste quasi toujours entre 20 et 35%
  quel que soit le niveau de domination du favori (le modele Plackett-Luce
  dilue la probabilite Top3 entre tous les partants d'un champ de 11 a 15
  chevaux), rendant un seuil eleve pratiquement inatteignable meme pour des
  bases tres solides ecrasantes. L'ecart Top3/4e, lui, varie fortement avec
  la domination reelle du favori et est donc un bien meilleur signal ici.

  *** Renommage "Course aleatoire" -> "Course disputee" + note de
  coherence (retour utilisateur) *** : un utilisateur a signale qu'une
  meme course pouvait afficher a la fois le badge "Course fiable" (voir
  plus bas) ET "Course aleatoire", ce qui semblait contradictoire. Ce
  n'est pas un bug : les deux badges repondent a des questions
  differentes ("Course fiable" juge UN cheval precis - une base
  confirmee bien classee - tandis que "Course logique"/"disputee" juge
  l'ensemble du peloton - nombre de Danger(s), ecart de hierarchie).
  Verifie sur le backtest reel (3037 courses) : 67,6% des courses avec un
  badge "Course fiable" affichent AUSSI ce badge (n=619/916), sans que
  cela nuise a la fiabilite du pick (34,1% de victoires, contre 32,0%
  quand la course est au contraire jugee "logique", n=297). Deux
  changements suite a ce constat : le libelle "Course aleatoire" est
  renomme "Course disputee" (moins oppose semantiquement a "fiable"), et
  un rappel s'affiche automatiquement sous le titre "Base(s) possible(s)
  & Danger(s)" quand les deux badges apparaissent ensemble, pour eviter
  toute confusion. Aucun calcul n'a change, seuls le libelle et le texte
  d'accompagnement ont ete modifies.
- **"Top 2 fiable"** : nouvelle ligne affichee dans le bloc "Base(s)
  possible(s) & Danger(s)", a cote du "Cheval le plus fiable (Module 2)".
  Repond a la question : la base retenue a-t-elle de bonnes chances de
  terminer precisement dans les 2 premiers (et pas seulement dans les 3
  premiers) ? Deux nouveaux elements pour cela :
  1. **Prob Top2** (Plackett-Luce, probabilityEngine.js) : P(1er) + P(2e
     exactement), affichee a titre informatif a cote de la Prob Top3
     existante pour la base (ex. "35% Top3, 24% Top2").
  2. **Ecart de Score Global sur le 2e meilleur rival** : le Score Global de
     la base moins le 2e meilleur Score Global du reste du champ (hors la
     base). Comparer au 2e meilleur rival (et non au 1er) capture le risque
     reel de ne pas finir top 2 : il faut DEUX chevaux devant la base pour
     l'en priver, donc c'est bien la marge sur ce 2e rival qui compte. "Top2
     fiable" = Oui si cet ecart est >= 15 points (meme seuil que "Hierarchie
     claire", par coherence), sinon Non.

  *** Note *** : un premier essai a repose sur un seuil absolu de Prob Top2
  (Plackett-Luce) mais a ete ecarte apres verification sur des donnees
  reelles (reunion CLAIREFONTAINE-DEAUVILLE) - meme probleme de dilution que
  la confiance Top3 abandonnee ci-dessus pour "Course logique" : la Prob
  Top2 ne depasse quasiment jamais 25% dans un champ de 11 a 15 chevaux,
  quel que soit le niveau de domination reelle de la base, rendant tout
  seuil absolu impraticable. L'ecart de Score Global sur le 2e rival, lui,
  varie fortement avec la domination reelle (4.7 a 21.5 points observes sur
  les bases de la reunion de reference) et est donc repris comme critere
  effectif, sur le meme principe que l'ecart Top3/4e.
- **Onglet "Courses sures"** : nouvel onglet listant, pour toutes les
  reunions importees, les courses ayant a la fois une base "solide" ou
  "tres solide" (bloc Base(s) possible(s)), au moins un cheval avec un
  Score Global >= 80, **et** jugees "Course logique" (cf. ci-dessus) — une
  course disputee n'est jamais retenue, meme si elle a par ailleurs une
  base et un bon score. Triees par meilleur score decroissant.

**Suppression des onglets Journal et Statistiques** : a la demande de
l'utilisateur (fonctionnalites inutilisees), ces deux onglets ainsi que le
bouton "Enregistrer au journal" ont ete retires de l'interface. Les donnees
techniques sous-jacentes restent presentes dans `js/db.js` (compatibilite
d'export/import de sauvegarde), mais ne sont plus utilisees ni affichees.

## Mise a jour des cotes en direct (PMU.fr, 1 seul clic)

Sur l'ecran de chaque course, un seul bouton : **"Mettre a jour les cotes en
direct"**. Un clic suffit — l'app recupere automatiquement les cotes
actuelles via l'API du PMU (date/reunion/course deja connues, aucune saisie
requise) puis les applique immediatement aux chevaux de la course : le
Score, la Value, les Base(s)/Danger(s) et les cote(s) cible(s) sont
recalcules dans la foulee, sans etape de confirmation intermediaire.

*** Mise a jour v7 *** : la recuperation manuelle par collage de texte
(copier/coller depuis pmu.fr, Zeturf, etc.) a ete retiree. Le detecteur de
cotes par collage (`js/engine/zeturfParser.js`, fonctions `parseCotesZeturf`
et `apparierCotesZeturf`) reste present dans le moteur — `apparierCotesZeturf`
est toujours utilise en interne pour associer les cotes recuperees
automatiquement aux chevaux de la course — mais l'ecran de collage manuel et
l'ecran de confirmation intermediaire ont disparu de l'interface : il n'y a
plus qu'un seul bouton, une seule action.

**Important — a savoir avant d'utiliser cette fonction :**
- Cette API n'est **pas documentee ni officiellement autorisee** par le PMU
  pour un usage tiers. Elle est utilisee ici "au mieux", sans aucune garantie
  de disponibilite : le PMU peut la modifier, la bloquer, ou la faire
  repondre differemment a tout moment, sans preavis.
- Une web app statique comme celle-ci n'a pas de serveur pour "masquer" cet
  appel : il part directement du navigateur, ce qui expose la requete aux
  restrictions CORS. **En pratique, l'appel direct echoue quasi systematiquement**
  : cette API du PMU n'etant a priori prevue que pour etre appelee depuis
  pmu.fr lui-meme, elle n'autorise tres probablement pas les requetes venant
  d'un autre site.
- *** Mise a jour v2 *** : une premiere version ne tentait qu'**un seul** proxy
  CORS public (allorigins.win) en repli de l'appel direct. Ce proxy s'est
  revele intermittent (parfois en panne totale, et sans limite de temps sur
  la requete, ce qui pouvait bloquer l'ecran tres longtemps avant d'afficher
  une erreur). Une cascade de plusieurs proxies CORS publics (allorigins.win,
  corsproxy.io, codetabs.com), chacun limite a 8 secondes maximum, avait alors
  ete ajoutee en repli de l'appel direct.
- *** Mise a jour v3 (recommandee) *** : meme avec plusieurs proxies en
  cascade, ce sont des services tiers gratuits, sans garantie, qui peuvent
  tomber en panne (parfois tous en meme temps). Le probleme est desormais
  evite completement grace a une **fonction serverless** incluse dans le
  dossier `netlify/functions/pmu-cotes.js` : elle fait l'appel a l'API PMU
  **depuis le serveur** plutot que depuis votre navigateur, ce qui n'est
  **jamais** soumis aux restrictions CORS (celles-ci ne s'appliquent qu'aux
  requetes emises par un navigateur). C'est de loin le moyen le plus fiable.
  **Si vous hebergez sur Netlify** (voir l'Etape 1 ci-dessus), cette fonction
  est deployee automatiquement avec le reste du site des le premier
  glisser-deposer du dossier `TurfAnalyse-Web` — aucune configuration, aucune
  installation, aucun compte supplementaire necessaire. L'application
  l'utilise desormais **en priorite** ; l'ancienne cascade (acces direct puis
  proxies CORS publics) ne sert plus que de repli si, pour une raison
  quelconque, la fonction Netlify echoue ou n'est pas disponible (par exemple
  si vous heergez sur **GitHub Pages**, qui ne supporte pas les fonctions
  serverless — dans ce cas l'app bascule automatiquement sur l'ancienne
  cascade, sans action de votre part).
- *** Mise a jour v4 (tentative sur GitHub Pages, abandonnee) *** : une
  premiere piste a consiste a deployer **Cloudflare Workers** comme
  alternative gratuite a la fonction Netlify. Le code necessaire a ete
  ecrit (`cloudflare-worker/pmu-cotes.js`, conserve dans le dossier a titre
  de reference), mais en pratique le tableau de bord Cloudflare actuel ne
  proposait pas d'editeur de code simple dans le navigateur pour le Worker
  cree (seulement un historique de deploiements) : le deployer aurait
  demande d'installer l'outil en ligne de commande Cloudflare (Wrangler) et
  de travailler depuis un terminal, nettement plus technique qu'un
  glisser-deposer. Cette piste a donc ete abandonnee.
- *** Mise a jour v5 *** : le mecanisme concu pour Cloudflare a ete
  generalise en une **fonction externe** generique : n'importe quelle URL,
  hebergee n'importe ou, qui execute le meme code que
  `netlify/functions/pmu-cotes.js` (meme contrat : parametres
  `date`/`reunion`/`course`/`type`, en-tetes CORS permissifs) peut occuper ce
  role, sans aucun changement de code necessaire dans `js/engine/pmuApi.js`
  (constante `EXTERNAL_FUNCTION_URL`, vide par defaut, tentee **en tout
  premier** dans la cascade des lors qu'elle est renseignee). Une premiere
  option a consiste a reutiliser Netlify (deja familier) en n'hebergeant
  **que la fonction** plutot que le site complet (dossier
  `netlify-mini-site-cotes-pmu/`, toujours inclus dans cette livraison) :
  glisser-deposer ce dossier seul via "Deploy manually" sur
  https://app.netlify.com, recuperer l'adresse du type
  `https://nom-au-hasard.netlify.app`, puis me la communiquer pour
  integration. Cette option reste valable **si vous disposez encore de
  credit Netlify disponible** (elle en consomme tres peu, mais pas zero).
- *** Mise a jour v6 (recommandee, aucun credit Netlify necessaire) *** :
  suite a l'epuisement du credit Netlify, la fonction externe peut aussi
  etre hebergee gratuitement sur **Val Town** (https://www.val.town), un
  service independant de Netlify, avec un editeur de code directement dans
  le navigateur (aucune ligne de commande, aucun compte GitHub necessaire,
  aucun glisser-deposer de dossier) et un quota gratuit tres large (100 000
  requetes/jour). C'est desormais l'option la plus simple a mettre en place.

  **Marche a suivre** (code deja pret dans `val-town/pmu-cotes.ts`, inclus
  dans cette livraison — voir les commentaires en tete de ce fichier pour le
  detail) :
  1. Creez un compte gratuit sur https://www.val.town.
  2. Cliquez sur "+" (nouveau val), donnez-lui un nom, par exemple
     `pmu-cotes`.
  3. Effacez le contenu par defaut de l'editeur, collez-y tout le contenu de
     `val-town/pmu-cotes.ts`.
  4. Cliquez sur le bouton "+" en haut a droite de l'editeur, choisissez
     **"HTTP"** comme type de declencheur, puis sauvegardez (Ctrl+S).
  5. L'URL de votre fonction s'affiche immediatement, du type
     `https://votre-nom-pmu-cotes.web.val.run`. Communiquez-la-moi :
     j'integrerai cette adresse dans `EXTERNAL_FUNCTION_URL`
     (`js/engine/pmuApi.js`) et vous livrerai la version mise a jour de
     `TurfAnalyse-Web` (le site principal sur GitHub Pages n'a pas besoin
     d'etre redeploye en entier, seul ce fichier change).

  Une fois configuree (Netlify ou Val Town), cette fonction externe est
  tentee avant meme la fonction Netlify meme-origine (utile si vous hebergez
  un jour le site complet sur Netlify) ; l'ancienne cascade (direct puis
  proxies) continue de servir de dernier repli.
- **Si toutes les tentatives echouent** (reseau, panne simultanee des
  differents services, reunion/course/date incorrecte...), un message clair
  s'affiche sous le bouton et aucune cote n'est modifiee. Il suffit de
  reessayer plus tard (le bouton reste disponible a tout moment).

Le detecteur de correspondance (`apparierCotesZeturf`) est tolerant : les
numeros de cheval renvoyes par l'API qui n'appartiennent pas a la course en
cours sont signales en interne et ignores, sans rien modifier d'incorrect.

## Ecran de mot de passe (protection cote client)

Un ecran de mot de passe (`js/passwordGate.js`) bloque desormais l'affichage
de l'app tant que le bon mot de passe n'a pas ete saisi. **Important a
comprendre** : GitHub Pages ne permet pas de vraie protection par mot de
passe (voir plus haut, hors GitHub Enterprise Cloud) — ceci est un simple
frein cote client, pas une vraie securite. Le site restant 100% statique,
n'importe qui peut lire le code source (clic droit > Afficher le code
source) et y trouver le hash du mot de passe, voire contourner l'ecran en
supprimant l'element `#passwordGateOverlay` depuis la console du navigateur.
Ne convient que pour decourager un acces accidentel via un lien partage —
pas pour proteger des donnees vraiment sensibles.

Le mot de passe n'est jamais stocke en clair dans le code : seul son hash
SHA-256 y figure (constante `HASH_ATTENDU`). Une fois le bon mot de passe
saisi, l'appareil est memorise (`localStorage`) et l'ecran ne sera plus
redemande sur ce meme navigateur (jusqu'a effacement des donnees de site).

**Pour changer le mot de passe vous-meme**, sans repasser par moi :
1. Ouvrez la console du navigateur (F12) sur n'importe quelle page HTTPS.
2. Executez :
   ```js
   crypto.subtle.digest('SHA-256', new TextEncoder().encode('VOTRE_NOUVEAU_MDP'))
     .then(b => console.log(Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2,'0')).join('')))
   ```
3. Copiez le resultat affiche, remplacez la valeur de `HASH_ATTENDU` dans
   `js/passwordGate.js` (edition directe du fichier sur GitHub) par ce
   resultat, et faites un commit.
4. Pensez a faire le rechargement force habituel (Ctrl+F5) apres coup.

## Valeur des couples : methode terrain (Base(s) confirmee(s) x Trio)

Le bloc "Combinaisons suggerees" affiche une ligne **"Valeur des couples"** :
elle associe chaque cheval retenu comme Base confirmee (meme liste que
"Simple gagnant/place (la Base)", cf. Module 2 juste au-dessus) a chacun des
chevaux du groupe **Trio (Base(s)/Danger(s) + cote(s) cible(s))** affiche
juste en dessous, et calcule pour chaque paire une valeur approximative de
couple avec la formule classique du terrain :

```
valeur = (cote Base × cote autre cheval) / 2
```

*** Mise a jour *** : cette fonctionnalite s'appelait auparavant "Couple
Gagnant (10-30€)" et associait uniquement le cheval le mieux classe par le
modele de score (`chevaux[0]`) a tous les autres chevaux du champ, en ne
retenant que les paires dont la valeur tombait entre 10 et 30€. Elle associe
desormais toute(s) la/les Base(s) *confirmee(s) techniquement* (Module 2,
recommandation "Base solide"/"Base très solide" + criteres techniques) aux
seuls chevaux deja mis en avant dans les combinaisons suggerees (Trio), et
affiche la valeur de chaque paire sans filtre de plage — c'est desormais
plus coherent avec le reste du pronostic (les memes chevaux que ceux deja
recommandes) et moins arbitraire (plus de fourchette fixe 10-30€). Une meme
paire n'est jamais affichee deux fois (si deux Bases confirmees sont toutes
les deux dans le Trio, leur paire n'apparait qu'une seule fois), et une Base
n'est jamais associee a elle-meme.

C'est une methode empirique simple et repandue chez les joueurs de couple
(mise a l'unite, sans tenir compte de la commission/TRJ reel du PMU), qui
donne un ordre de grandeur du rapport pour chaque combinaison suggeree.
Elle est independante du modele de score/probabilites (Plackett-Luce)
utilise ailleurs dans l'app.

**A bien comprendre avant utilisation** : cette valeur n'est PAS une
prediction du vrai rapport qui sera affiche sur pmu.fr. Le vrai rapport
Couple Gagnant depend de la repartition reelle des mises de TOUS les
parieurs sur chaque combinaison (systeme pari mutuel) — une donnee non
disponible via l'API publique/non-officielle utilisee par cette app (verifie
: seul le rapport DEFINITIF, une fois la course terminee, y est accessible ;
aucun rapport probable pre-course pour les paris combines n'est expose).
Si aucune Base n'est confirmee, ou si une cote necessaire est inconnue, la
ligne l'indique clairement (aucune combinaison proposee, ou ligne absente).

## Indice de convergence (heuristique, à ne pas confondre avec une corrélation statistique prouvée)

Une nouvelle carte **"Indice de convergence"** apparait sur l'ecran de
chaque course, entre "Base(s) possible(s) & Danger(s)" et "Pronostic
suggere". Pour chaque cheval, elle compte combien de **signaux
independants** vont dans le meme sens favorable, parmi 5 :

1. **Cote resserree** : la cote se resserre nettement entre le matin (8h) et
   la cote directe (tendance > 10%, le meme seuil que celui deja utilise en
   interne par le Score Cote pour bonifier ce sous-score) — signe que le
   marche (l'ensemble des parieurs) se porte de plus en plus sur ce cheval.
2. **Forme** au-dessus de la moyenne du champ pour cette course (relatif,
   pas un seuil absolu arbitraire).
3. **Aptitude** au-dessus de la moyenne du champ.
4. **Conditions** (jockey/entraineur/ferrage) au-dessus de la moyenne du
   champ.
5. **Bonus Rubriques** (Module 1 v6.2) strictement positif : au moins une
   rubrique technique ou ce cheval figure dans le Top N du champ.

Les chevaux cumulant **4 ou 5 signaux sur 5** apparaissent sous
"Convergence forte" ; ceux a **3 signaux sur 5** sous "Convergence
moderee". Si aucun cheval n'atteint 4 signaux, la carte l'indique
clairement plutot que d'afficher une liste vide silencieuse.

**Important — bien comprendre les limites de cet indice avant de
l'utiliser** :
- C'est une regle de bon sens, **transparente** (chaque signal est
  explicite, verifiable, et deja utilise ailleurs dans l'app) qui signale
  simplement quand PLUSIEURS indices INDEPENDANTS s'accordent sur un meme
  cheval.
- Ce n'est **PAS une correlation statistique prouvee**. Etablir qu'une
  combinaison de signaux "predit" fiablement une arrivee demanderait de la
  comparer methodiquement a un historique consequent de resultats reels
  (backtesting sur des dizaines, voire des centaines de courses), ce que
  cette fonctionnalite ne fait pas — elle ne fait que compter des
  coincidences favorables, sans avoir jamais verifie statistiquement que ces
  coincidences se traduisent effectivement plus souvent par une victoire ou
  une place.
- Le seuil de 10% pour "cote resserree" et le fait de comparer chaque score
  a la moyenne du champ (plutot qu'a un seuil absolu) sont des choix de bon
  sens, pas des valeurs optimisees statistiquement.
- A prendre comme **un element de plus** parmi d'autres (Value, Base(s)/
  Danger(s), cote(s) cible(s), Valeur des couples...), jamais comme une
  prediction fiable a elle seule.

## Marche vs modele : verification sur donnees reelles (backtest 2 mois, 1995 courses)

A la demande de l'utilisateur, une premiere verification avait ete
effectuee sur 6 reunions (51 courses, 624 chevaux), puis elargie a un mois
complet (30 journees, fin fevrier a fin mars, 1027 courses — voir
historique). Un deuxieme mois d'archives (janvier 2026, 31 journees) a
ensuite ete ajoute, portant l'echantillon a **1995 courses et 24 027
chevaux**, en comparant les indices du moteur a l'arrivee officielle
reellement enregistree dans les CSV. L'historique de performances utilise
pour chaque journee est celui disponible la veille (aucune donnee
posterieure a la course analysee n'entre dans le calcul, pour eviter tout
biais retrospectif). Ce n'est toujours pas un backtest automatise integre
a l'app (aucun code de backtest n'a ete ajoute au moteur) : c'est une
verification faite manuellement pour repondre a la question "quels
indices sont fiables ?".

**Constat principal (toujours confirme sur cet echantillon double) : le
marche (la cote et son evolution) reste plus fiable que l'ecart Value
(Score Global vs marche).**

- **Base(s) confirmee(s)** (Module 2) reste de loin le signal le plus
  fort : 31,7% de victoires, 62,2% de Top3 (n=723) contre 7,6%/23,8% pour
  les chevaux non confirmes (n=23 304).
- Chevaux **"tres joues"** (Value ≤ -30%) : 25,7% de victoires, 53,6% de
  Top3 (n=3908) — tres largement devant les chevaux **"delaisses par le
  marche"** (Value ≥ +20%) : seulement 3,8% de victoires, 19,5% de Top3
  (n=3193). Confirme (ecart encore plus net) : les libelles actuels
  restent justifies.
- **Danger(s)** (Value < -10%, non retenus comme Base) : 18,8% de
  victoires, 44,3% de Top3 (n=7997) contre 3,1%/15,2% pour le reste du
  champ (n=16 030) — signal tres fort, confirme.
- **Cote qui se resserre** entre le matin (8h) et la cote directe, prise
  isolement (>10%) : 13,0% de victoires, 33,1% de Top3 (n=10 541) contre
  4,7%/18,5% sans resserrement (n=13 486) — quasiment identique a
  l'echantillon precedent, signal tres robuste.
- **Indice de convergence** : toujours pas de valeur demontree au-dela de
  Base(s) confirmee(s), et toujours pas monotone (convergence "moderee" a
  15,8% de victoires fait mieux que "forte" a 13,2%). Confirme que c'est
  un signal d'appoint, pas un signal autonome.
- Au niveau course : le n°1 du modele gagne toujours autant dans les
  courses **"Course logique"** (26,8%, n=246) que dans les **"Course
  disputee"** (25,8%, n=1749) — confirme, ce badge seul ne discrimine pas
  le taux de victoire. La **"Lisibilite"** ne predit toujours pas mieux le
  n°1 (Ouverte 25,8% n=1297, Tres ouverte 25,4% n=562, Lisible 28,7%
  n=136) : confirme, ne pas s'y fier comme filtre de choix de course.
- **Revision importante — "Top2 fiable"** : sur le premier mois (n=30),
  ce signal affichait 60,0% de victoires / 76,7% de Top2, un chiffre
  spectaculaire. Sur l'echantillon double (n=70), il retombe a **40,0% de
  victoires / 55,7% de Top2** (contre 32,5%/50,1% sans ce critere,
  n=850) : toujours un signal positif, mais beaucoup plus modeste que ce
  que le petit echantillon initial laissait penser — bon exemple de
  pourquoi les chiffres bases sur n<50 doivent etre pris avec prudence.

**Consequence appliquee** : aucun changement aux libelles Value/Danger
(deja corriges, toujours confirmes). En revanche, le badge "Course
fiable" et le niveau de fiabilite par discipline ont ete revises suite a
ce constat elargi — voir section suivante. **Aucune modification du Score
Global, de la Value, ni des formules du moteur** n'a ete faite ici non
plus — uniquement des constats d'interpretation et d'affichage.

**Limites de cette verification, a garder en tete** :
- Periode : janvier + fin fevrier a fin mars 2026 (fevrier non couvert) :
  les proportions pourraient varier sur d'autres periodes de l'annee ou
  d'autres hippodromes non representes dans cet echantillon.
- L'historique de performances utilise est celui disponible la veille de
  chaque journee (chaine jour par jour), mais reste tributaire de la
  qualite/fraicheur des exports fournis par l'utilisateur.
- C'est une verification ponctuelle sur les lots de reunions fournis par
  l'utilisateur, pas un processus repete/automatise integre a l'app.
  L'exemple du "Top2 fiable" ci-dessus montre que meme un echantillon de
  plusieurs centaines de courses peut encore faire bouger sensiblement un
  chiffre pour les categories les plus rares (n<100) : les pourcentages
  ci-dessus restent des estimations, a affiner si d'autres archives sont
  ajoutees.

## Ameliorations issues du backtest (revisees sur 2 mois)

A la suite des backtests ci-dessus, plusieurs affichages/priorisations
ont ete ajoutes dans l'appli pour aider a mieux exploiter le signal
Base(s) confirmee(s) et reperer les courses les plus fiables. **Aucun
d'entre eux ne modifie le Score Global, la Value, ni le classement (tri)
calcules par le moteur** : ce sont uniquement des indicateurs/
priorisations d'affichage, bases sur des constats empiriques.

- **Badge "Course fiable"** (page Course, en tete du bloc "Base(s)
  possible(s) & Danger(s)" ; egalement affiche dans la liste "Courses
  sures") : synthese de la meilleure methode trouvee pour reperer LA
  course avec la plus grande probabilite de gagner. Priorite au pick
  "base tres solide confirmee ET classee n1" s'il existe, sinon une
  "base confirmee unique" (une seule base confirmee dans toute la
  course), classee 1ere ou 2e par le Score Global. **Correction
  importante** : sur le premier mois (n=24), la combinaison "base tres
  solide + n1" affichait 41,7% de victoires / 75,0% de Top3, ce qui
  laissait penser a un niveau de confiance distinct et superieur. Sur
  l'echantillon double (n=68), ce chiffre retombe a 32,4%/61,8% —
  quasiment identique a la "base confirmee unique" (33,8%/62,8%, n=506) :
  l'ecart initial etait un effet de petit echantillon, pas un signal
  distinct. Les deux niveaux ont donc ete fusionnes en un seul badge
  "Course fiable" (plus de mention "Confiance maximale" separee). Note
  toujours ECARTEE comme niveau de repli supplementaire : utiliser seul
  le badge "Course logique + Hierarchie claire" en l'absence de base
  confirmee ne marche pas (22,9% de victoires, n=48 — moins bien que le
  simple favori du modele sans filtre, 25,9%). En cumulant les deux
  niveaux, le badge "Course fiable" s'affiche sur 28,8% des courses
  (n=574/1995), avec 33,6% de victoires / 62,7% de Top3 en moyenne.
- **Bonus "Petit champ" et "Discipline favorable"** (affiches en tag a
  cote du badge "Course fiable", n'excluent aucune course) : les bases
  confirmees dans un champ <=10 partants gagnent 35,0% du temps (Top3
  70,3%, n=246) contre 28,7%/55,0% dans un champ >=14 partants (n=209) —
  confirme, robuste. Cote discipline, Haies (38,5% de victoires, n=26)
  rejoint desormais Attele (34,8%, n=394) et Steeple (35,7%, n=28) dans le
  groupe "favorable" (le bonus discipline inclut donc maintenant
  Attele/Steeple/Haies). Quand un badge "Course fiable" cumule les deux
  bonus, le taux de victoire monte a 44,0%/66,7% de Top3 (n=84).
- **Priorisation "Petit champ" dans Courses sures** : les courses a <=10
  partants sont affichees en premier dans la liste, avec un tag "Petit
  champ (N partants)". Aucune course n'est retiree de la liste, seul
  l'ordre d'affichage change.
- **Niveau de fiabilite par discipline** (page Course, sous "Base(s)
  possible(s)", affiche seulement si au moins une base confirmee est
  presente) : Attele (34,8%, n=394), Steeple (35,7%, n=28) et Haies
  (38,5%, n=26) sont classes "fiabilite renforcee" (un groupe plus
  homogene qu'avant, Haies ayant rejoint les deux autres) ; Plat (25,0%,
  n=204) et Monte (26,9%, n=67) restent "plus moderes".

**A propos du reglage Cote directe/Cote 8h** : le badge "Course fiable" et
le signal Base(s) confirmee(s) ont a nouveau ete verifies avec le reglage
"Cote 8h" sur l'echantillon double. Resultat inchange : le signal se
degrade nettement (Confiance maximale/Course fiable tombe a 16,7% de
victoires/45,8% de Top3, n=48, contre 32,4%/61,8% en cote directe). Le
reglage par defaut "Cote directe" reste donc le bon choix.

Verification de coherence : tous ces indicateurs ont ete re-calcules
directement sur les donnees du backtest (1995 courses) a partir de la
meme logique que celle implementee dans `js/app.js`, et retrouvent
exactement les memes chiffres — ces fonctions vivent dans `js/app.js`
(elles ont besoin du DOM/de `document`) et ne peuvent donc pas etre
executees par les tests automatises Node (`tests/engine.test.js`), qui ne
couvrent que `js/engine/`. Meme situation deja existante pour "Course
logique/disputee" et "Courses sures".

## Retarification "Base tres solide" / "Base solide" par la Value (backtest 3 mois, 3037 courses)

A la question "peut-on ameliorer le choix de Base tres solide/solide et le
calcul du Score Global a l'aide de l'historique ?", l'echantillon a ete
etendu a 3 mois d'archives combinees (janvier + fin fevrier-mars + juin
2026, **3037 courses, 36 330 chevaux**) pour re-analyser les seuils
existants.

**Constat** : l'ancien critere de separation entre "Base tres solide"
(rangs 1-5, Value <= -30% ET Score Global >= 80) et "Base solide" (meme
Value, Score Global 60-79) ne discriminait quasiment pas la realite :
**28,1% de victoires pour "tres solide" contre 27,8% pour "solide"**
(n=249/2186 au total) — un ecart nul, alors que le Score Global sert
justement a distinguer ces deux niveaux depuis l'origine du classeur.

En revanche, a Score Global >= 60 fixe, la **Value seule** separe tres
nettement deux groupes : **Value <= -50% -> 35,2% de victoires (n=1445)**
contre **Value entre -50% et -30% -> seulement 17,1% (n=990)**.

**Changement applique** (`js/engine/raceAnalyzer.js`, rangs 1-5
uniquement) : le seuil "Base tres solide" est resserre a **Value <= -50%**
(au lieu de Score Global >= 80), en gardant le meme plancher Score Global
>= 60 pour les deux niveaux. C'est le premier ecart volontaire par
rapport au portage fidele du classeur Excel d'origine — fait uniquement
sur la base de ce constat empirique, avec l'accord explicite de
l'utilisateur. **Le Score Global, la Value et le classement (tri) des
chevaux restent inchanges** : seule l'etape d'etiquetage
(recommandation) qui en decoule change, ce qui affecte a son tour la
selection des Base(s) confirmee(s) (Module 2) et donc les badges "Course
fiable"/"Confiance maximale" qui en dependent.

**Sur le calcul du Score Global lui-meme (ponderation Forme 35% /
Aptitude 25% / Conditions 15% / Cote 10% / Similaire 15%)** : l'analyse a
mis en evidence un probleme de qualite des donnees qui rend toute
conclusion sur une reponderation actuellement peu fiable — voir la
section suivante. Aucune modification de la formule du Score Global n'a
donc ete faite.

## Indicateur de couverture d'historique

En creusant la question ci-dessus, un probleme de fond a ete decouvert
dans les fichiers d'export de performances (`export_performances_*.csv`)
utilises comme historique : ce ne sont apparemment **pas des bases
cumulatives completes a une date donnee**, mais plutot des extraits
partiels de la population de chevaux, dont le contenu varie fortement
d'un fichier a l'autre meme a quelques jours d'intervalle (exemple
constate : un cheval present dans deux fichiers d'une meme serie mais
absent d'un troisieme fichier intercalaire, alors que ce dernier etait
bien celui correspondant a la bonne date). Consequence mesuree sur
l'echantillon de 3037 courses : **86,6% des chevaux n'avaient
litteralement aucune performance passee retrouvee dans l'historique
importe** (score Forme/Aptitude par defaut, "neutre", plutot qu'une
vraie evaluation), avec un taux qui pouvait passer de 0% a plus de 95%
d'un jour a l'autre. Cela n'affecte pas la fiabilite du moteur en soi
(le score par defaut est neutre, pas errone), mais cela limite la
possibilite de tirer des conclusions solides sur la ponderation
Forme/Aptitude/Similaire du Score Global a partir de ce backtest, et peut
egalement affecter vos analyses en usage reel si vos propres exports de
performances presentent le meme type de lacune.

**Changement applique** (`js/app.js`, page Course) : un avertissement
s'affiche desormais au-dessus de la liste des chevaux des qu'au moins un
cheval de la course n'a aucun historique retrouve (ex. "3/14 chevaux
sans historique de performances trouve"), avec une couleur qui s'intensifie
selon la proportion concernee (gris en-dessous de 40%, orange entre 40 et
75%, rouge au-dela de 75%). Purement indicatif : n'entre dans aucun
calcul, sert uniquement a savoir quand se mefier du Score Forme/Aptitude
d'un cheval donne.

## Limites connues

- Le CSV "Reunion complete" doit respecter le meme format a 76 colonnes que
  celui utilise aujourd'hui. Si votre fournisseur de donnees change de
  format, le fichier `js/engine/csvImporter.js` devra etre ajuste.
- L'import gere l'encodage UTF-8 et Windows-1252/Latin-1 (courant pour les
  exports francais avec accents).
- Si vous videz le cache/donnees de site de votre navigateur (ou
  desinstallez l'app de l'ecran d'accueil), l'historique est perdu sauf si
  vous avez exporte une sauvegarde au prealable.
- Pas de calcul bayesien complet de combinaisons de paris (module "Analyse
  complete courses"/"Comparaison" du classeur Excel d'origine, non porte) :
  hors perimetre V1, comme convenu. Seule exception, ajoutee plus tard : la
  Valeur des couples decrite plus haut, qui reste volontairement simple
  (formule directe cote×cote/2, sans ponderation ni fourchette) et n'a pas
  vocation a remplacer un vrai module de calcul de combinaisons.
- **Qualite des exports de performances** : selon la fraicheur/completude
  des fichiers `export_performances_*.csv` que vous importez, une part
  significative de vos chevaux peut se retrouver sans historique
  exploitable (voir section "Indicateur de couverture d'historique"
  ci-dessus) — verifiez cet avertissement sur la page Course avant de vous
  fier fortement au Score Forme/Aptitude/Similaire.

## Verification effectuee

Le moteur de calcul (`js/engine/`) est couvert par des tests automatises
(`tests/engine.test.js`), executes reellement avec Node.js : 66 tests, tous
passants, couvrant les formules de score, les probabilites Plackett-Luce
(Victoire, Top2, Top3), la Valeur des couples (`calculerValeurCouples`,
voir plus haut), l'Indice de convergence (`calculerIndiceConvergence`,
voir plus haut), le tri/classement, l'import CSV (formats standard 76
colonnes et "journee" 77 colonnes/multi-reunions, voir plus haut), le module "Base(s)
possible(s) / Danger(s)" (rubriques par discipline, criteres techniques,
niveaux de confiance, variantes independantes de la cote, critere "Top2
fiable"), le bonus Rubriques ajoute au Score Global (Module 1 v6.2), le module "Cote(s)
cible(s) la plus proche", le detecteur/associateur de cotes
(`js/engine/zeturfParser.js` : formats simples et tolerants au texte
parasite — moteur toujours teste, meme si l'ecran de collage manuel a ete
retire de l'interface ; la fonction d'association reste utilisee en interne
pour la mise a jour en un clic) et le mapping/enchainement
des reponses de l'API PMU (extraction numero/cote/nom, tolerance aux champs
manquants ou a une reponse malformee, la logique de repli en cascade
fonction externe -> fonction Netlify -> direct -> proxy allorigins.win ->
proxy corsproxy.io -> proxy codetabs.com -> erreur claire (6 tentatives, y
compris un test dedie confirmant que la fonction externe est bien tentee en
tout premier des lors qu'elle est configuree), le timeout par tentative
(bascule rapide si un service reste muet), ainsi que la detection de
l'arrivee officielle
(`extraireArriveePmu`, `fetchResultatPmu` : aplatissement de l'ordre d'arrivee
y compris ex-aequo, et absence totale d'exception meme si la course n'est pas
terminee ou si tous les services echouent) — le tout simule avec un `fetch`
factice pour verifier ces scenarios sans appel reseau reel. La fonction
`netlify/functions/pmu-cotes.js` elle-meme a ete testee manuellement (succes,
parametres manquants, erreur HTTP de l'API PMU, type=resultat) avec un
`fetch` global factice, mais n'est pas executee par Netlify lui-meme dans
cette suite (ce qui necessiterait un deploiement reel) ; il en va de meme
pour la copie identique hebergee dans `netlify-mini-site-cotes-pmu/`, pour
`val-town/pmu-cotes.ts` (verifie uniquement par analyse syntaxique, Val Town
utilisant un runtime Deno non disponible dans cette suite Node.js) et pour
`cloudflare-worker/pmu-cotes.js` (conserve a titre de reference, piste
abandonnee) — tous ecrits et prets a etre deployes mais non executes
reellement dans cette suite.

Un test d'integration complet dans un navigateur simule (jsdom + IndexedDB
factice) a egalement ete execute avec succes : import/sauvegarde d'une
reunion, classement predictif, badge "Course logique/disputee", bloc
Combinaisons suggerees avec meilleur outsider (place 4 a 8), enregistrement
puis affichage de l'arrivee officielle, et listage dans l'onglet "Courses
sures" — sans exception, et confirmant l'absence des boutons/onglets
Journal et Statistiques desormais retires. Le comportement reseau reel de
`fetchCotesPmu`/`fetchResultatPmu` (appel HTTP vers l'API PMU) n'est
volontairement pas execute dans ces tests automatises (pas d'appel reseau
non maitrise dans une suite de tests) ; sa logique de succes/repli est
couverte par les tests unitaires et par lecture de code, et devra etre
confirmee "en conditions reelles" lors du premier usage.
