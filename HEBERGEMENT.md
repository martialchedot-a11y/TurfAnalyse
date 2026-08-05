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
   *** Mise a jour *** : sur l'ecran d'une **reunion** (liste des courses),
   un bouton **"Mettre a jour les cotes de toute la reunion"** applique
   desormais ce meme mecanisme a **toutes les courses de la reunion en un
   seul clic**, course par course et de facon sequentielle (pour ne pas
   multiplier les requetes simultanees) — utile pour rafraichir toute une
   reunion sans devoir ouvrir chaque course une par une. Un recapitulatif
   final indique le nombre de courses mises a jour (les echecs eventuels sur
   une course, ex. cotes pas encore ouvertes, n'interrompent pas les
   suivantes).
5. Bouton **Resultat** : consultez ou corrigez manuellement l'ordre
   d'arrivee (ex. `10-15-3-7`) — utile si l'arrivee n'a pas encore ete
   detectee automatiquement, ou pour la saisir a la main.
6. Onglet **Course feu vert** *(remplace l'ancien onglet "Courses sures")* :
   liste, toutes reunions importees confondues, les courses dont le **score
   de configuration du Coupl&eacute; Value** (cf. "Score de configuration du
   Coupl&eacute; Value" plus bas) est **>= 3/5** — un raccourci pour reperer
   d'un coup d'oeil les courses ou le contexte de marche est le plus
   favorable au Coupl&eacute; Value. Chaque course affiche son niveau de
   confiance (ex. "Confiance correcte (3/5)") et les 5 candidats du
   Coupl&eacute; Value. Un bouton **"Voir la reussite du jour"** mene a la
   nouvelle page **Resultat**, qui agrege, parmi ces courses "feu vert" dont
   l'arrivee est deja connue, le nombre de Coupl&eacute;s Value effectivement
   reussis (les 2 vrais chevaux du Top2 presents parmi les 5 candidats) —
   les courses feu vert sans arrivee connue apparaissent a part, "en attente
   de resultat".
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
   "Cote Calc" (77 colonnes au lieu de 76 habituelles). Gere par la
   resolution de colonnes par nom (voir section suivante) : aucun decalage
   a calculer, "Cote Calc" est simplement trouvee ou qu'elle se trouve.
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

## Format "Analyse_AAAAMMJJ_partants / _musiques" (nouveau nom de fichiers)

A partir de fin juillet 2026, les fichiers exportes ont change de nom
("Analyse_AAAAMMJJ_partants.csv" pour les courses, "Analyse_AAAAMMJJ_musiques.csv"
pour les performances - a la place de "AAAAMMJJ-JOURNEE.csv" et
"export_performances_....csv"). **Le nom du fichier n'a jamais eu
d'importance pour l'import** : vous choisissez simplement le fichier
"partants" dans le champ "Fichier CSV Reunion complete" et le fichier
"musiques" dans le champ "Fichier CSV Performances", comme avant.

En revanche, le CONTENU du fichier "partants" a change plus profondement
que la seule variante "journee" ci-dessus :

- "Cote Calc" (cote predictive) n'est plus juste avant "Reunion" en fin de
  fichier : elle est deplacee juste apres les colonnes P1-P10, bien plus
  tot dans le fichier.
- Deux nouvelles colonnes apparaissent au milieu du fichier ("Handicap",
  "Median"), et dix autres a la toute fin ("IndForme", "ClasCoefReussite",
  "ScoreBase", "ScoreSignaux", "ClaCote", "ClasED", "ClasHMP", "ClaHisto",
  "ClaTMatic", "ClaOR") - non utilisees par le moteur pour l'instant.
- Le champ "VH ou Ferrage" est desormais scinde en deux colonnes
  distinctes, "Handicap" (nouveau, vide hors course a handicap) et
  "Ferrure" (equivalent exact de l'ancien "VH ou Ferrage").

**Plutot que d'ajouter un troisieme "decalage" (en plus de celui de la
variante "journee"), l'import a ete reecrit pour resoudre chaque colonne
par son NOM dans la ligne d'en-tete**, au lieu d'une position fixe : que
"Cote Calc" soit en colonne 26 ou 57 ne change plus rien, elle est
retrouvee par son nom "Cote Calc" directement. Ce mecanisme gere
desormais uniformement les 3 variantes connues (standard 76 colonnes,
"journee" 77 colonnes, "Analyse_" 88 colonnes) et absorbera d'eventuels
futurs deplacements de colonnes sans nouveau code, tant que les noms de
colonnes utilises par le moteur (Numero/Nom en position fixe 1/2, puis RJ,
RE, ED, MP, PtH, MN, RC, RX, MX, CX, IdC, CFP, OR, PC, MA, AR, TG, R10,
SC, C8, CD, Cote Calc, P1, P2, Ferrure/VH ou Ferrage, SA, Reunion, Course,
LieuCourse, Heure, Discipline, Allocation, Distance, Partants, Arrivee)
restent inchanges. A defaut d'en-tete exploitable dans le fichier (cas
tres rare), l'import retombe sur les positions fixes du format standard
historique.

Le fichier de performances ("musiques") a lui un format de date different :
"AAAA-MM-JJ" ou "AAAA-MM-JJ HH:MM:SS" (ex. "2026-06-03 00:00:00") au lieu
du format "JJ/MM/AAAA" ou numero de serie Excel utilise auparavant. Gere
egalement de facon transparente (`parseDate` dans `csvImporter.js`
reconnait desormais les 3 formats).

**Verification effectuee** : les deux fichiers uploades ("Analyse_20260731_partants.csv",
24 courses / 274 chevaux, et "Analyse_20260731_musiques.csv", 2029 lignes
de performances) ont ete importes et analyses de bout en bout (moteur de
score + Base(s)/Danger(s)) sans aucune erreur ; 86,1% des chevaux ont
retrouve un historique de performances (comparable au taux habituel), et
un controle colonne par colonne (Cote Calc, C8, CD, rubriques) confirme
que les valeurs extraites correspondent exactement aux colonnes du CSV
source. Les 59 tests automatises (`tests/engine.test.js`, qui couvrent
aussi les formats standard et "journee") continuent tous de passer.

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
- **Meilleur outsider (place 4 a 8)** : ajoute a l'epoque au bloc
  "Combinaisons suggerees" (retire depuis, voir plus bas) ; la ligne
  "Outsiders" de la carte "Pronostic suggere" reste disponible separement.
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
- **Onglet "Courses sures"** *(retire depuis, remplace par l'onglet "Course
  feu vert" — voir section "Course feu vert et page Resultat" plus bas)* :
  listait, pour toutes les reunions importees, les courses ayant a la fois
  une base "solide" ou "tres solide" (bloc Base(s) possible(s)), au moins un
  cheval avec un Score Global >= 80, **et** jugees "Course logique" (cf.
  ci-dessus). Triees par meilleur score decroissant.

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

*** Mise a jour : mise a jour pour toute la reunion en un clic *** : sur
l'ecran d'une reunion (liste des courses, onglet Reunions), un bouton
**"Mettre a jour les cotes de toute la reunion"** applique desormais le meme
mecanisme (recuperation via l'API PMU, application, et detection de
l'arrivee si elle n'etait pas deja connue) a **toutes les courses de la
reunion**, l'une apres l'autre. Les requetes sont volontairement
**sequentielles** (une course a la fois, jamais en parallele) pour ne pas
multiplier les appels simultanes vers le PMU/les proxies ; un message
affiche la progression ("Mise a jour course 3/8..."). Un echec sur une
course particuliere (reseau, cotes pas encore ouvertes...) n'interrompt pas
les suivantes : un recapitulatif final indique le nombre de courses mises a
jour et, le cas echeant, le nombre d'echecs. Le bouton par course ("Mettre a
jour les cotes en direct", ci-dessus) reste disponible pour ne rafraichir
qu'une seule course a la fois.

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

## Fonctionnalites retirees : Combinaisons suggerees, Valeur des couples, Indice de convergence

A la demande de l'utilisateur (ne servaient plus), trois fonctionnalites ont
ete retirees de l'app - code supprime, pas seulement masque :

- Le bloc **"Combinaisons suggerees"** (Simple gagnant/place, Couple
  gagnant/place, Trio base sur le rang du modele, Meilleur outsider place 4
  a 8, Multi 7), qui apparaissait dans la carte "Pronostic suggere".
- La ligne **"Valeur des couples"** qui y etait associee (estimation de
  rapport Base x Trio, formule cote x cote / 2).
- La carte **"Indice de convergence"** (heuristique des 5 signaux -
  cote resserree, forme/aptitude/conditions au-dessus de la moyenne,
  bonus rubriques).

Fonctions supprimees : `combinaisonsSuggereesHtml`, `calculerValeurCouples`,
`convergenceHtml`, `calculerIndiceConvergence`, `LIBELLES_SIGNAUX_CONVERGENCE`
et les 7 tests associes. Elles sont remplacees par les deux suggestions
ciblees ci-dessous (Couple Gagnant et Trio), construites a partir du
backtest reel plutot que du simple rang du modele.

## Suggestion Coupl&eacute; Gagnant (5 chevaux max)

A la question "quelle est la meilleure strategie pour trouver le Couple
Gagnant en 5 chevaux max quand on a une Base tres solide ?", une nouvelle
carte a ete ajoutee sur la page Course (juste au-dessus de "Base(s)
possible(s) & Danger(s)", visible seulement quand l'ancre existe) : elle
propose l'ancre (le cheval `chevalConfianceMaximale` : Base tres solide
confirmee, classee n1) + jusqu'a 5 autres chevaux a lui associer pour un
pari Couple Gagnant (l'ancre + un des 5, dans n'importe quel ordre).

**Methode retenue, validee sur le backtest reel (4 mois, 4092 courses,
reconfirmee apres l'ajout d'avril - chiffres d'origine sur 3 mois/3037
courses entre parentheses)** : plusieurs criteres ont ete testes pour
choisir ces 5 chevaux parmi le reste du champ (rang du modele, Danger en
priorite, ProbTop3/ProbVictoire decroissante, Indice de convergence) :

| Critere | Reussite (l'ancre finit Top2, n=482 ; anciennement n=346) |
|---|---|
| Rang du modele (classement croissant) | 75,7% |
| Danger d'abord puis rang | 76,3% |
| ProbVictoire decroissante | 72,0% |
| ProbTop3 decroissante | 70,8% |
| Convergence (nbSignaux) decroissante | 72,5% |
| **Value croissante (la plus jouee par le marche en premier)** | **80,1%** |

La **Value croissante** (les chevaux les plus joues par le marche parmi
les autres partants, Value la plus negative en tete) capture le mieux le
vrai partenaire du Top2 — et ce n'est pas un artefact des petits champs :
sur les courses a 13 partants ou plus (n=175), l'ecart persiste (73,1%
pour la Value contre 68,0% pour le rang du modele). Sur l'ensemble des
courses ou l'ancre existe (n=867, anciennement n=623), cette methode
aboutit a **44,5% de Couples Gagnants reussis (386/867)** avec seulement
5 tickets — un taux identique au chiffre d'origine (277/623), confirmant
la stabilite de la methode.

Compromis nombre de chevaux / reussite (methode Value, parmi les 482
courses ou l'ancre finit Top2) : 3 chevaux -> 60,0%, 4 -> 71,2%, 5 ->
80,1%, 6 -> 85,7%, 7 -> 90,7%. Le choix de 5 (demande par l'utilisateur)
offre un bon compromis nombre de tickets/reussite par rapport a 3 (Trio).

**Important** : purement indicative, n'entre dans aucun calcul de Score
Global/Value/classement, et ne remplace pas votre propre jugement sur la
course. Fonctions concernees : `candidatsCombinaison` et
`suggestionCoupleGagnantHtml` dans `js/app.js` (comme les autres
indicateurs bases sur `chevalConfianceMaximale`, ces fonctions ont besoin
du DOM et ne peuvent donc pas etre couvertes par les tests automatises
Node — verification de coherence faite manuellement sur les 4092 courses
du backtest).

## Trio Value (avec base)

*** Remplace l'ancienne "Suggestion Trio" (ancre stricte + 5 candidats) ***

La premiere version de cette suggestion reutilisait l'ancre stricte de la
Suggestion Couple Gagnant (`chevalConfianceMaximale` : Base tres solide
confirmee ET classee n1) : l'ancre finit Top3 67,9% du temps (423/623),
et sur ces 423 courses, trier les 5 candidats par Value croissante
capturait les 2 vrais partenaires 59,6% du temps (contre 55,6% pour le
rang du modele, 48,9% pour la Convergence, 44,0% pour ProbTop3) - deja la
meilleure methode testee a ce moment-la.

**Amelioration apportee** : plutot que d'exiger l'ancre stricte
(confirmee ET classee n1), la base du Trio est desormais **la meilleure
Base tres solide de la course, quel que soit son rang ou son statut de
confirmation** (meme critere large que pour le "Conseil de jeu" -
niveau 2 - et pour "Couple Value"). Verifie sur le backtest (4 mois,
4092 courses apres l'ajout d'avril, contre 3 mois/3037 courses a
l'origine) : en conditionnant sur le fait que cette base finit deja Top3
(n=923, anciennement n=692, contre 423 pour l'ancre stricte), trier les 5
candidats du reste du champ par Value croissante capture les 2 vrais
partenaires **61,2%** du temps (contre 61,0% mesure a l'origine) -
legerement mieux que l'ancienne version stricte (59,6%), et applicable a
beaucoup plus de courses (923 contre 423, puisque la base n'a plus
besoin d'etre confirmee techniquement ET classee n1 - cf. le constat
similaire fait sur le Couple Gagnant/Trio en general : le sous-groupe
"Base tres solide sans ancre complete" performe aussi bien, voire mieux,
que l'ancre stricte elle-meme).

Nouvelle carte **"Trio Value (avec base)"** : base + 5 candidats (Value
croissante, tout le champ sauf la base), consigne de combiner 2 des 5
avec la base (10 combinaisons possibles).

**Important** : purement indicative, n'entre dans aucun calcul de Score
Global/Value/classement. Fonctions concernees : `trioValueAvecBase` et
`trioValueAvecBaseHtml` dans `js/app.js` (meme limitation de test que
ci-dessus - fonctions liees au DOM, verification de coherence faite
manuellement sur le backtest).

## Conseil de jeu (garde-fou score de configuration -> cascade Couple/Trio -> Simple -> Abstention)

A la question "peut-on donner un conseil de jeu par course : Couple/Trio
si les conditions optimales sont reunies, sinon Simple gagnant/place si
une Base tres solide existe, sinon s'abstenir - est-ce statistiquement
envisageable ?", une carte **"Conseil de jeu"** a ete ajoutee en tete de
la page Course (avant "Course fiable"), qui applique une cascade valide
sur le backtest reel (4 mois, 4092 courses apres l'ajout d'avril -
chiffres d'origine sur 3 mois/3037 courses entre parentheses) :

| Niveau | Condition | Conseil affiche | Victoires | Top3 | n |
|---|---|---|---|---|---|
| 0 | Score de configuration du Coupl&eacute; Value < 3/5 (voir section ci-dessus) | S'abstenir de jouer | - | - | 2335 |
| 1 | Sinon, ancre existe (Base tres solide confirmee, classee n1) | Jouer Couple Gagnant et/ou Trio | 39,3% (39,6%) | 67,5% (67,9%) | 867 (623) |
| 2 | Sinon, une Base tres solide existe encore (confirmee a un autre rang, ou non confirmee) | Jouer Simple gagnant/place sur la mieux classee | 40,7% (42,3%) | 69,5% (71,2%) | 486 (378) |
| 3 | Sinon (aucune Base tres solide) | S'abstenir de jouer | - | - | 2739 (2036) |

**Niveau 0, ajoute a la demande de l'utilisateur** : quel que soit
l'etat de l'ancre ou de la Base tres solide, si le score de configuration
du Coupl&eacute; Value (cf. section precedente) est inferieur a 3/5, le
conseil de jeu bascule directement sur l'abstention, AVANT meme
d'examiner les niveaux 1/2. Justifie par le meme backtest : la reussite
du Coupl&eacute; Value tombe a 48,3% en dessous de 3/5 (n=2335) contre
69,4% au-dessus (n=1738) - un contexte de marche trop flou (partants,
coupure Value, cote du favori...) pour recommander de jouer, meme quand
une Base existe par ailleurs. Ce garde-fou passe donc AVANT les niveaux 1
et 2 de la cascade d'origine (qui ne s'appliquent que si le score est
&ge;3/5).

**Le niveau 2 reste au moins aussi bon que le niveau 1** (40,7% contre
39,3% de victoires), ce qui valide pleinement son usage comme repli : ce
n'est pas un pis-aller, c'est un signal a part entiere.

**Sur la justification du niveau 3 (abstention "sans base")** : sans
aucune Base tres solide, le simple favori du modele (rang 1, sans filtre)
tombe a 20,7%/49,1% (n=2739) - grosso modo moitie moins bien que les
niveaux 1 et 2. Point important verifie avant de conclure a l'abstention :
une "Base solide" confirmee (le cran juste en dessous de "tres solide")
ne rattrape rien - 18,0% de victoires sur les 395 courses ou elle existe
sans Base tres solide (17,8% sur 297 courses a l'origine). Il n'y a donc
pas d'edge recuperable juste en dessous du seuil "tres solide" :
l'abstention est le choix statistiquement justifie a ce niveau, pas une
simple prudence par defaut.

Fonctions concernees : `conseilJeu` et `conseilJeuHtml` dans `js/app.js`
(meme limitation de test que les sections precedentes - fonctions liees
au DOM, verification de coherence faite manuellement sur le backtest et
sur les fichiers reels uploades). Purement indicatif : n'entre dans aucun
calcul de Score Global/Value/classement, et ne remplace pas votre propre
jugement sur la course.

## Couple Gagnant via les Danger(s) : un signal independant et robuste

A la question "peut-on retrouver le Couple Gagnant dans la liste des
Danger(s) ?", une analyse sur le backtest reel (3 mois, 3037 courses) a
mis en evidence un signal solide, distinct du signal Base :

**Constat principal** : au moins un des 2 vrais chevaux du Top2 se trouve
dans la liste des Danger(s) 90,5% du temps ; les 2 a la fois, 41,0% du
temps (liste de 4 Danger(s) en moyenne). Compare a un tirage au hasard de
la meme taille de liste (56,9%/10,4% attendus), l'ecart est enorme (+33,6
et +30,6 points) : ce n'est pas un artefact de taille de liste, c'est un
vrai signal. Verifie aussi independant du signal Base : seulement 13,3%
de recouvrement entre Danger et Base, et l'effet reste tres fort meme en
excluant les Danger(s) qui sont aussi des Bases (77,0% vs 49,2% attendu
pour "au moins 1", 28,1% vs 8,0% pour "les 2").

**Par nombre de partants** : l'ecart au hasard AUGMENTE avec la taille du
champ (contre-intuitif a premiere vue, mais logique : plus le champ est
grand, moins le hasard seul donnerait de resultat, donc plus la
concentration du signal Danger sur les vrais contenders est notable) :

| Partants | Observe (les 2) | Attendu au hasard | Ecart |
|---|---|---|---|
| <= 8 | 31,0% | 10,8% | +20,3 pts |
| 9-12 | 42,0% | 10,7% | +31,2 pts |
| 13+ | 43,4% | 10,0% | +33,3 pts |

**Presence d'une Base tres solide** : ne change quasiment rien a la
qualite du signal (ecart au hasard ~+30 points avec ou sans) - le taux
brut est meme legerement plus bas avec Base tres solide (37,4% vs 42,8%
sans), mais uniquement parce que ces courses ont en moyenne moins de
Danger(s) (une base tres dominante ecrase la concurrence). Ce signal
fonctionne donc aussi bien dans les courses SANS Base tres solide (les
2/3 des courses, cf. section "Conseil de jeu" ci-dessus) que dans celles
qui en ont une.

**Par discipline** : le trot (Attele/Monte) ressort nettement au-dessus
du plat/haies, meme une fois corrige de la taille du champ :

| Discipline | Reussite (les 2) | Ecart au hasard |
|---|---|---|
| Monte | 44,2% | +34,2 pts |
| Attele | 43,2% | +34,0 pts |
| Plat | 38,4% | +26,0 pts |
| Haies | 38,1% | +25,7 pts |
| Steeple | 25,5% | +15,0 pts (n=98, petit echantillon) |

En revanche, ni la "Hierarchie claire" (40,9% vs 41,1%) ni "Course
logique" vs "disputee" (41,7% vs 40,9%) ne changent quasiment rien au
signal - ces deux facteurs n'apportent rien de plus ici, contrairement au
nombre de partants et a la discipline.

## Suggestion "Couple champ total (Dangers)" — retiree

*** Fonctionnalite retiree, remplacee par "Couple Value" (section
suivante) ***

Cette carte proposait, quand la course comptait entre 2 et 5 Danger(s),
de jouer toutes les combinaisons Couple Gagnant parmi ces Danger(s)
(39,9% de reussite moyenne sur 81,6% de l'echantillon, n=2479 - mesure
sur 3 mois/3037 courses). Le "Couple Value" ci-dessous fait mieux au
meme cout (57,3% pour 10 combinaisons contre 53,0% pour 5 Danger(s)/10
combinaisons, chiffres reconfirmes sur 4 mois/4092 courses) et capture
93,3% des vrais Danger(s), rendant cette carte redondante : elle a donc
ete supprimee de `js/app.js` (fonctions `coupleChampTotalDangers` /
`coupleChampTotalDangersHtml` retirees).

## Suggestion "Couple Value" (remplace "Couple Top5 x Dangers")

A la question "les 5 premiers du classement (Score Global) contiennent-ils
souvent le Couple Gagnant, et le croisement avec les Danger(s) est-il
benefique ?", une analyse sur le backtest reel (3 mois, 3037 courses) a
d'abord montre que le Top5 seul (10 combinaisons) capture deja les 2
vrais chevaux du Top2 54,4% du temps (94,5% au moins un) - meilleur que
la liste des Danger(s) seule (41,0%/90,5%). Croiser avec les Danger(s)
(intersection Top5 x Danger(s)) faisait baisser le taux BRUT a 36,8%
(les 2), mais avec deux fois moins de combinaisons - un compromis
rendement/cout, pas une amelioration en soi.

**L'utilisateur a ensuite fait une remarque cle** : le classement du
moteur trie d'abord par SIGNE de la Value (negative avant positive), PUIS
par ProbVictoire+ProbTop3 (cf. `analyser()` dans raceAnalyzer.js) - donc
le Top5 classement et le critere Danger (Value < -10%) sont deja
fortement lies (72,1% des chevaux du Top5 ont une Value < -10%), pas deux
signaux independants. Verification faite : oui, il y a un vrai
recouvrement, mais le tag Danger garde neanmoins un pouvoir selectif reel
au-dela de ce recouvrement (teste contre un sous-ensemble ALEATOIRE de
meme taille pris dans le Top5 : 36,8% observe contre 27,1% attendu au
hasard, +9,7 points).

**Piste d'amelioration trouvee** : plutot que de trier par rang du modele
(qui degrade un cheval tres joue mais juge "moins probable" par le tri
secondaire), trier DIRECTEMENT tout le champ par Value croissante fait
mieux, a cout EGAL :

| Methode | Reussite (les 2) | Combinaisons |
|---|---|---|
| Top5 classement | 53,5% | 10 |
| Top5 x Danger(s) (ancienne version) | 36,8% | 5,37 |
| Value top4 (champ entier) | 43,2% | 6 |
| **Value top5 (champ entier)** | **57,3%** | **10** |

"Value top5 (champ entier)" bat strictement le Top5 classement a cout
identique (57,3% contre 53,5% pour 10 combinaisons), et reste coherent
avec le concept Danger : il capture deja naturellement 93,3% des vrais
Danger(s) de la course - rien n'est perdu, les deux criteres venant de la
meme logique de Value negative.

*** Chiffres reconfirmes sur le backtest elargi a 4 mois (4092 courses,
ajout d'avril) - mesures d'origine sur 3 mois/3037 courses : 58,2%/54,4%
(Value top5 / Top5 classement) et 93,7% de capture des Danger(s). L'ecart
entre les deux mesures est faible (<1 point) et ne change aucune
conclusion. ***

**Changement applique** : la carte "Coupl&eacute; Top5 &times; Dangers"
a ete remplacee par **"Coupl&eacute; Value"**, qui classe tout le champ
par Value croissante et retient les 5 premiers (jamais plus de
C(5,2) = 10 combinaisons, limite par construction). Fonctions
concernees : `coupleValue` et `coupleValueHtml` dans `js/app.js` (meme
limitation de test que les sections precedentes - fonctions liees au
DOM). Purement indicatif : n'entre dans aucun calcul de Score
Global/Value/classement, et ne remplace pas votre propre jugement sur la
course.

## Score de configuration du Coupl&eacute; Value (0 &agrave; 5)

A la question "y a-t-il une configuration de course (repartition des
cotes, profil des chevaux, Value) qui donne un signal positif sur la
reussite du Coupl&eacute; Value ?", plusieurs pistes ont ete testees sur
le backtest (4 mois, 4092 courses) :

- **La cote du couple gagnant reel** (2 favoris, favori + outsider, 2
  outsiders...) est de loin le signal le plus fort (95,2% de reussite si
  les 2 vrais gagnants sont des favoris, 4,2% si l'un est un gros
  outsider &ge;30) - mais c'est un signal **inutilisable en pratique**,
  puisqu'il decrit le RESULTAT (on ne connait pas la cote du futur
  vainqueur avant la course). Interessant pour comprendre POURQUOI le
  Coupl&eacute; Value echoue parfois (par construction, il classe par
  Value, donc privilegie les chevaux les plus joues - un vrai gagnant a
  grosse cote lui echappe presque toujours structurellement), mais pas
  pour decider a l'avance si suivre la suggestion.
- **La structure du marche AVANT la course**, elle, est utilisable :
  cote du favori du marche, nombre de chevaux a cote basse, nombre de
  partants, nettete de la coupure Value entre le 5e candidat retenu et le
  1er exclu, presence d'une Base tres solide.

**5 indicateurs, tous connus au moment ou la carte s'affiche**, ont ete
combines en un score simple (+1 point par condition remplie) :

1. Champ reduit : nbPartants &le; 10.
2. Coupure nette : ecart de Value &ge; 20 points entre le 5e candidat
   retenu (Value croissante) et le 1er cheval exclu.
3. Une Base tres solide existe dans la course.
4. Marche resserre : cote du favori (la plus petite cote du champ) < 3.
5. Plusieurs pretendants credibles : au moins 2 chevaux a cote < 5
   (contre-intuitif mais verifie : un marche avec PLUSIEURS favoris
   credibles est mieux capture par le tri Value qu'un marche avec un seul
   favori isole - potentiellement parce qu'il y a alors plus de chevaux
   "a Value negative" pour remplir les 5 places, laissant moins de place
   a l'incertitude).

**Reussite mesuree par score** (gradient quasi lineaire) :

| Score | Reussite | n |
|---|---|---|
| 0/5 | 32,9% | 559 |
| 1/5 | 49,9% | 792 |
| 2/5 | 55,7% | 984 |
| 3/5 | 63,8% | 881 |
| 4/5 | 72,4% | 642 |
| 5/5 | 83,3% | 215 |

**Verification d'independance** : pour s'assurer que ce n'est pas juste
le nombre de partants deguise en 5 variantes, le gradient des 4 AUTRES
indicateurs (sans le nombre de partants) a ete recalcule separement au
sein des petits champs (&le;10 partants : 52,4% &agrave; 83,3% de score
0 &agrave; 4) et des grands champs (>10 partants : 32,9% &agrave; 62,7%) :
le gradient tient dans les deux cas, confirmant que chaque indicateur
apporte une information reellement independante.

**Affichage** : un badge de confiance ("Confiance tres faible" a "tres
elevee", score X/5) apparait desormais en tete de la carte "Coupl&eacute;
Value", avec le taux de reussite mesure au survol. Fonctions concernees :
`scoreConfigurationCoupleValue` et `SCORE_CONFIGURATION_NIVEAUX` dans
`js/app.js` (meme limitation de test que les sections precedentes -
fonctions liees au DOM, verification de coherence faite manuellement sur
le backtest et sur les fichiers reels uploades). Purement indicatif :
n'entre dans aucun calcul de Score Global/Value/classement.

## Course feu vert et page Resultat (remplace l'onglet "Courses sures")

A la demande de l'utilisateur, l'onglet "Courses sures" (base solide/tres
solide + Score Global >= 80, voir plus haut) a ete **retire et remplace**
par un onglet **"Course feu vert"**, directement aligne sur l'indicateur de
confiance mesure pour le Coupl&eacute; Value (score de configuration
ci-dessus) plutot que sur un critere independant :

- **Filtre** : toutes les courses, toutes reunions importees confondues,
  dont le **score de configuration du Coupl&eacute; Value est >= 3/5**
  (seuil choisi car c'est a partir de ce niveau que la reussite mesuree
  depasse nettement la moyenne generale du Coupl&eacute; Value, cf. tableau
  ci-dessus : 63,8% a 83,3% contre 57,3% en moyenne toutes courses
  confondues) **ET** dont le nombre de partants est compris entre **8 et
  16** (a la demande de l'utilisateur — les champs en dehors de cette plage
  sont ecartes de la liste, meme avec un bon score). Triees par score
  decroissant.
- **Affichage** : pour chaque course, le niveau de confiance (ex.
  "Confiance correcte (3/5)", meme badge/couleur que sur la carte Coupl&eacute;
  Value de la fiche course) et les 5 candidats du Coupl&eacute; Value.
- **Bouton "Voir la reussite du jour"** : mene a une nouvelle page
  **Resultat**, qui reprend les memes courses "feu vert" et, pour celles
  dont l'arrivee officielle est deja connue (saisie manuelle ou detection
  automatique via l'API PMU), verifie si le Coupl&eacute; Value a
  effectivement reussi (les 2 vrais chevaux du Top2 presents parmi les 5
  candidats retenus — meme critere de succes que celui utilise pour
  mesurer COUPLE_VALUE_STATS et le tableau du score de configuration
  ci-dessus). Un compteur global ("X/Y Coupl&eacute;s Value reussis, Z%")
  s'affiche en tete de page. Les courses feu vert dont l'arrivee n'est pas
  encore connue apparaissent a part, sous "En attente de resultat" — cette
  page se remplit donc naturellement au fil de la journee, au fur et a
  mesure que les courses se terminent (surtout si vous utilisez la mise a
  jour des cotes, qui recupere aussi automatiquement l'arrivee des courses
  terminees, cf. plus haut).

**Portee de "la journee"** : cette page prend en compte **toutes les
reunions actuellement presentes dans l'app** (pas de notion de date
distincte) — coherent avec le fonctionnement existant (bouton "Vider les
reunions importees" pour repartir propre entre deux journees de courses,
cf. "Reinitialisation des reunions importees"). Si vous reinitialisez les
reunions chaque jour avant d'importer la nouvelle journee, cette page
reflete naturellement la reussite du jour en cours.

**Fonctions concernees** : `renderCourseFeuVert` et `renderResultatJournee`
(routes `#/feuvert` et `#/resultat`) remplacent `renderCoursesSures` ;
nouvelle fonction `coupleValueReussi` (verification du succes du
Coupl&eacute; Value pour une course dont l'arrivee est connue) ; nouvelle
fonction `nbPartantsAcceptableFeuVert` (filtre 8-16 partants, constantes
`MIN_PARTANTS_FEU_VERT`/`MAX_PARTANTS_FEU_VERT`), appliquee dans les deux
pages pour rester coherentes entre elles. Toutes dans `js/app.js` (meme
limitation de test que les sections precedentes - fonctions liees au DOM,
verification de coherence faite manuellement). Purement indicatif : n'entre
dans aucun calcul de Score Global/Value/classement, et ne modifie aucune
donnee.

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
  un signal d'appoint, pas un signal autonome. *(Fonctionnalite retiree
  depuis a la demande de l'utilisateur - voir plus bas ; ce constat reste
  documente ici a titre historique.)*
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
  hors perimetre V1, comme convenu. Les suggestions Couple Gagnant et Trio
  (voir plus haut) restent des heuristiques simples basees sur la Value,
  pas un vrai module de calcul de combinaisons.
- **Qualite des exports de performances** : selon la fraicheur/completude
  des fichiers `export_performances_*.csv` que vous importez, une part
  significative de vos chevaux peut se retrouver sans historique
  exploitable (voir section "Indicateur de couverture d'historique"
  ci-dessus) — verifiez cet avertissement sur la page Course avant de vous
  fier fortement au Score Forme/Aptitude/Similaire.

## Verification effectuee

Le moteur de calcul (`js/engine/`) est couvert par des tests automatises
(`tests/engine.test.js`), executes reellement avec Node.js : 59 tests, tous
passants, couvrant les formules de score, les probabilites Plackett-Luce
(Victoire, Top2, Top3), le tri/classement, l'import CSV (formats standard 76
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
reunion, classement predictif, badge "Course logique/disputee",
enregistrement puis affichage de l'arrivee officielle, et listage dans
l'onglet "Courses sures" — sans exception, et confirmant l'absence des
boutons/onglets Journal et Statistiques ainsi que du bloc "Combinaisons
suggerees" et de la carte "Indice de convergence" desormais retires. Le comportement reseau reel de
`fetchCotesPmu`/`fetchResultatPmu` (appel HTTP vers l'API PMU) n'est
volontairement pas execute dans ces tests automatises (pas d'appel reseau
non maitrise dans une suite de tests) ; sa logique de succes/repli est
couverte par les tests unitaires et par lecture de code, et devra etre
confirmee "en conditions reelles" lors du premier usage.
