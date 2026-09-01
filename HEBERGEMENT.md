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
   Coupl&eacute; Value" plus bas) correspond au **filtre choisi** — un menu
   deroulant **"Indice de confiance"** en haut de la page propose 8 options
   : 4 cumulatives ("2/5 et plus" &agrave; "5/5 et plus") et 4 exactes
   ("2/5 uniquement" &agrave; "5/5 uniquement") - par defaut "4/5 et plus",
   memorise dans ce navigateur (voir "Filtre de confiance ajustable" plus
   bas) — un raccourci pour reperer d'un coup d'oeil les courses ou le
   contexte de marche est le plus favorable au Coupl&eacute; Value. Chaque
   course affiche son niveau de confiance (ex. "Confiance elevee (4/5)") et
   les 5 candidats du Coupl&eacute; Value. Un bouton **"Voir la reussite du
   jour"** mene a la
   nouvelle page **Resultat**, qui agrege, parmi ces courses "feu vert" dont
   l'arrivee est deja connue, le nombre de Coupl&eacute;s Value effectivement
   reussis (les 2 vrais chevaux du Top2 presents parmi les 5 candidats) —
   les courses feu vert sans arrivee connue apparaissent a part, "en attente
   de resultat". *** Mise a jour *** : un bouton **"Recuperer les rapports"**
   sur cette meme page calcule en plus un **bilan financier hypothetique**
   a partir des dividendes PMU officiels du Coupl&eacute; Gagnant (voir
   "Rapports officiels PMU (Coupl&eacute; Gagnant) et bilan financier" plus
   bas pour le detail et les limites importantes a connaitre).
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

## Correctif : date de la reunion securisee pour l'import d'archives

**Probleme corrige** : ni le fichier "partants" ni le fichier "musiques"
ne contiennent de colonne de date (seulement une heure de depart) - la
date d'une reunion n'etait donc jamais connue autrement que par la date/
heure a laquelle vous importiez le fichier. Sans consequence quand
l'import se fait le jour meme, ceci posait probleme en cas d'import d'une
**archive** (une journee anterieure) : les mises a jour de cotes,
d'arrivee et de rapports PMU (cf. sections precedentes) interrogent
l'API PMU avec la date de la reunion — qui pointait alors vers la date
du JOUR DE L'IMPORT, et donc vers les courses en cours au meme numero de
reunion/course plutot que celles de l'archive, avec des cotes/resultats/
rapports incoherents avec les courses affichees.

**Correction** : la date de la reunion est desormais **extraite du nom du
fichier importe** (nouvelle fonction `extraireDateReunionDepuisNomFichier`,
`js/app.js`), qui reconnait aussi bien l'ancien format
("20260701-JOURNEE.csv") que le nouveau ("Analyse_20260701_partants.csv"),
et cette date est propagee jusqu'a l'enregistrement en base
(`saveMeetingWithRaces`, `js/db.js`, qui respecte desormais une date
fournie par l'appelant au lieu de toujours ecraser avec la date du jour).
Le message de confirmation apres import affiche la date detectee, pour
verification immediate ; si aucune date n'est reconnue dans le nom du
fichier (nommage inhabituel), l'app retombe sur la date du jour et le
signale explicitement dans le message ("date non detectee... a verifier
si ce n'est pas une archive"). Effet de bord utile : la date affichee
dans la liste des reunions (onglet Reunions) refletera egalement
desormais la vraie date de la course plutot que la date d'import.

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

  *** Important : votre val existant doit etre mis a jour *** — le contenu
  de `val-town/pmu-cotes.ts` a change (ajout du type `rapports`, voir
  "Rapports officiels PMU (Couplé Gagnant) et bilan financier" plus bas) :
  retournez dans l'editeur de votre val deja cree sur https://www.val.town,
  remplacez tout son contenu par celui, mis a jour, de `val-town/pmu-cotes.ts`
  inclus dans cette livraison, puis sauvegardez (Ctrl+S). **L'URL de votre
  fonction ne change pas** : pas besoin de recreer un val ni de me
  communiquer une nouvelle adresse. Tant que cette mise a jour n'est pas
  faite, la recuperation des cotes/arrivees continue de fonctionner comme
  avant (aucune regression), mais le nouveau bouton "Recuperer les rapports"
  (page Resultat) retombera sur la fonction Netlify meme-origine (absente
  sur GitHub Pages) puis sur l'ancienne cascade (acces direct/proxies, peu
  fiable) tant que le val n'est pas mis a jour.
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
| 0 | Score de configuration du Coupl&eacute; Value < 3/5 (voir section ci-dessus) | Course difficile | - | - | 2335 |
| 1 | Sinon, ancre existe (Base tres solide confirmee, classee n1) | Jouer Couple Gagnant et/ou Trio | 39,3% (39,6%) | 67,5% (67,9%) | 867 (623) |
| 2 | Sinon, une Base tres solide existe encore (confirmee a un autre rang, ou non confirmee) | Jouer Simple gagnant/place sur la mieux classee | 40,7% (42,3%) | 69,5% (71,2%) | 486 (378) |
| 3 | Sinon (aucune Base tres solide) | Course difficile | - | - | 2739 (2036) |

*** Renomme &agrave; la demande de l'utilisateur *** : le libell&eacute;
"S'abstenir de jouer cette course" est devenu **"Course difficile"** (les
niveaux 0 et 3 ci-dessus, `js/app.js`, fonction `conseilJeuHtml`) - m&ecirc;me
logique et m&ecirc;mes statistiques, formulation moins directive.

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

### Mise a jour aout 2026 : le Trio retire du niveau 1 (ROI reel negatif)

Les niveaux ci-dessus (39,3% de victoires / 67,5% de Top3, n=867) mesurent
le taux de REUSSITE (les bons chevaux dans la combinaison), pas la
RENTABILITE reelle en euros. Un backtest complementaire, sur rapports PMU
officiels reels recuperes course par course (juillet 2026, 940 courses
"Coupl&eacute; Value" / 446 courses "Trio Value avec base"), a mesure :

| Pari | Courses | Gains | Mise totale | Gain total (rapports reels) | ROI |
|---|---|---|---|---|---|
| Coupl&eacute; Value (pool adaptatif) | 940 | 692 (73,6%) | 16 525&euro; | ~20 204&euro; (rapport moyen 29,20&euro;, echantillon n=25) | **+22%** |
| Trio Value avec base (10 combinaisons fixes) | 446 | 167 (37,4%) | 4 436&euro; | ~2 767&euro; (rapport moyen 16,57&euro;, echantillon n=9) | **-38%** |

Le Trio perd de l'argent malgre un taux de reussite correct, car son
rapport moyen ne compense pas le co&ucirc;t des 10 combinaisons - et environ
un tiers des courses gagnantes du backtest n'offraient meme pas de pool
"Trio" classique (petits pelotons, seul le Trio Ordre est propose par
PMU), rendant le pari injouable en pratique dans ces cas.

**Consequence** : le niveau 1 de la cascade Conseil de jeu ne recommande
plus que le Coupl&eacute; Value ("Jouer : Coupl&eacute; Value", type
`'couple'` au lieu de `'couple_trio'` dans `conseilJeu`). La carte "Trio
Value avec base" reste affichee sur la fiche course a titre informatif,
desormais avec un avertissement rouge rappelant ce ROI negatif mesure -
mais elle n'est plus mise en avant par le Conseil de jeu. Les niveaux 2
(Simple) et 3 (abstention) de la cascade sont inchanges. Sw.js passe en
v35.

### Mise a jour aout 2026 (2) : badge "Jeu conseille" par profil confiance x confirmations

Suite a la question "l'indice de confiance aide-t-il a cibler les courses
plus sures ?", un echantillonnage de rapports PMU reels a ete fait pour
chacun des 8 profils confiance x confirmations du pool adaptatif Coupl&eacute;
Value (cf. section "Pool adaptatif" plus haut), sur 2 mois d'archives
(janvier + juillet 2026) :

| Profil confiance-confirmations | Courses | Gains | Mise totale | Rapport moyen (&eacute;chantillon) | ROI |
|---|---|---|---|---|---|
| forte-forte | 428 | 320 (74,8%) | 4 280&euro; | 9,58&euro; (n=16, juillet) | -28% |
| forte-moyenne | 41 | 36 (87,8%) | 615&euro; | 29,86&euro; (n=18) | **+75%** |
| forte-faible | 1 | 1 | 15&euro; | - | n&eacute;gligeable |
| moyenne-forte | 568 | 431 (75,9%) | 8 470&euro; | 10,95&euro; (n=19) | -44% |
| moyenne-moyenne | 335 | 241 (71,9%) | 7 018&euro; | 21,28&euro; (n=20) | -27% |
| moyenne-faible | 12 | 10 (83,3%) | 180&euro; | 26,56&euro; (n=9) | **+48%** |
| faible-forte | 161 | 102 (63,4%) | 3 381&euro; | 28,94&euro; (n=20) | -13% |
| faible-moyenne | 337 | 245 (72,7%) | 9 436&euro; | 62,18&euro; (n=16, juillet) | **+61%** |

**Constat contre-intuitif** : l'indice de confiance n'est PAS predictif du
ROI reel, et l'effet est meme plutot inverse. Les 2 profils "confiance
forte/moyenne" les plus attendus comme surs (forte-forte, moyenne-forte)
sont en realite les plus negatifs (-28% et -44%), tandis que les profils
"faible-moyenne", "forte-moyenne" et "moyenne-faible" ressortent positifs.

**Reserves methodologiques importantes** (echantillonnage encore limite a
2 mois d'archives) :
- **faible-moyenne** (+61%) est le resultat le plus solide : le plus
  large volume de courses (n=337) et l'echantillon de rapports le plus
  fourni (n=16).
- **forte-moyenne** (+75%) repose sur seulement 41 courses au total, et le
  rapport moyen echantillonne (29,86&euro;) est domine par un seul rapport
  extreme a 299,30&euro; (course a 3 gagnants seulement) : sans lui, la
  moyenne tombe a 14,01&euro; et le ROI devient -18%. Resultat fragile.
- **moyenne-faible** (+48%) ne repose que sur 12 courses au total sur 2
  mois - trop peu pour conclure statistiquement.

**Consequence** : un badge visible "&#9733; Jeu conseill&eacute; (profil
rentable sur rapports r&eacute;els - exploratoire)" a ete ajout&eacute; sur
la carte Coupl&eacute; Value (`jeuConseilleHtml` dans `js/app.js`), affich&eacute;
quand le profil de la course est `forte-moyenne`, `moyenne-faible` ou
`faible-moyenne` (constante `PROFILS_RENTABLES_COUPLE_VALUE`). Le badge
precise explicitement qu'il s'agit d'un resultat exploratoire (2 mois
d'archives seulement), en attente de validation sur davantage de mois. Ce
signal est independant de la cascade Conseil de jeu (qui continue de
s'abstenir des que le score de configuration est &lt;3/5) : il peut donc
apparaitre sur des courses ou le Conseil de jeu recommande par ailleurs
l'abstention. Sw.js passe en v36.

### Mise a jour aout 2026 (3) : nouvel onglet "Couplé rentable"

A la demande de l'utilisateur ("regrouper les courses forte-moyenne,
moyenne-faible ou faible-moyenne avec un onglet r&eacute;ussite du jour et
r&eacute;cup&eacute;ration des rapports comme la page feu vert"), un
4e onglet a &eacute;t&eacute; ajout&eacute; : **Coupl&eacute; rentable**
(`js/app.js`, fonctions `renderCoupleRentable` /
`renderCoupleRentableResultat`), sur le meme principe que Course feu vert
/ R&eacute;sultat, mais recentr&eacute; uniquement sur les 3 profils
identifi&eacute;s comme rentables (voir tableau ci-dessus) :

- **Page liste** (`#/couplerentable`) : regroupe toutes les courses dont le
  profil confiance x confirmations du pool adaptatif Coupl&eacute; Value
  est `forte-moyenne`, `moyenne-faible` ou `faible-moyenne`, tri&eacute;es
  par heure de d&eacute;part. Un bandeau rappelle le caract&egrave;re
  exploratoire du r&eacute;sultat (2 mois d'archives) et le ROI mesur&eacute;
  par profil. Bouton "Voir la r&eacute;ussite du jour" vers la 2e page.
- **Page R&eacute;ussite du jour** (`#/coupleresultat`) : m&ecirc;me
  principe que la page R&eacute;sultat de Course feu vert (taux de r&eacute;ussite,
  bilan financier, bouton "R&eacute;cup&eacute;rer les rapports"), mais le
  bilan porte sur le pool Coupl&eacute; Value adapt&eacute; au profil (mise
  = 1&euro; par combinaison du pool) et le rapport r&eacute;cup&eacute;r&eacute;
  est le Coupl&eacute; Gagnant officiel (`extraireRapportsCoupleGagnant`,
  stock&eacute; sur `race.rapportCoupleGagnant`), pas le Simple Gagnant/Place.
  Optimisation par rapport &agrave; Course feu vert : une course perdue
  (le pool ne capture pas les 2 chevaux de l'arriv&eacute;e) n'a jamais
  besoin d'aller chercher le rapport officiel pour conna&icirc;tre son
  bilan (mise perdue quel que soit le dividende) — seules les courses
  **gagn&eacute;es** sans rapport encore r&eacute;cup&eacute;r&eacute;
  d&eacute;clenchent une requ&ecirc;te, ce qui r&eacute;duit le nombre
  d'appels r&eacute;seau.

**Choix m&eacute;thodologique important** : contrairement &agrave; Course
feu vert (qui filtre en plus sur le nombre de partants 8-16, la couverture
d'historique &gt;50% et une confirmation externe sur la Base), la page
Coupl&eacute; rentable n'applique **aucun de ces filtres suppl&eacute;mentaires** —
seule condition : un pool Coupl&eacute; Value calculable (&ge;5 partants).
Raison : le backtest ROI qui a mesur&eacute; les chiffres du tableau
ci-dessus n'appliquait lui non plus aucun de ces filtres. Ajouter ces
restrictions sur la page live aurait rendu la population affich&eacute;e
diff&eacute;rente de la population r&eacute;ellement mesur&eacute;e, et
donc les chiffres de ROI affich&eacute;s non fiables pour les courses
r&eacute;ellement propos&eacute;es.

**Rappel** : r&eacute;sultat exploratoire (2 mois d'archives), en cours de
validation au fur et &agrave; mesure que d'autres mois d'archive seront
fournis. Sw.js passe en v37.

### Mise a jour aout 2026 (4) : validation sur 3 mois (ajout de juin) - ROI revu nettement a la baisse

Suite &agrave; l'ajout des archives de juin 2026 par l'utilisateur, le
tableau ROI des 3 profils identifi&eacute;s comme rentables a &eacute;t&eacute;
recalcul&eacute; sur 3 mois combin&eacute;s (janvier + juin + juillet 2026),
avec un nouvel &eacute;chantillonnage de rapports PMU r&eacute;els sur juin
(53 courses gagn&eacute;es interrog&eacute;es via l'API officielle) :

| Profil | Courses (3 mois) | Mise totale | Captures | Taux | Rapport moyen &eacute;chantillonn&eacute; | ROI 3 mois | ROI 2 mois (pr&eacute;c&eacute;dent) |
|---|---|---|---|---|---|---|---|
| forte-moyenne | 67 | 1 005&euro; | 60 | 89,6% | 23,30&euro; (n=38) | **+39%** | +75% |
| moyenne-faible | 25 | 375&euro; | 18 | 72,0% | 25,30&euro; (n=17) | **+22%** | +48% |
| faible-moyenne | 495 | 13 853&euro; | 350 | 70,7% | 46,76&euro; (n=37) | **+18%** | +61% |

**Constat** : les 3 profils restent positifs apr&egrave;s l'ajout d'un
troisi&egrave;me mois, mais leur ROI a nettement recul&eacute; — divis&eacute;
par environ 2 &agrave; 3,5 selon le profil. Cela confirme la r&eacute;serve
d&eacute;j&agrave; formul&eacute;e lors de la mesure sur 2 mois : les chiffres
initiaux (+75%/+48%/+61%) &eacute;taient optimistes, produits par un
&eacute;chantillon encore trop petit pour la sensibilit&eacute; du calcul
(quelques rapports extr&ecirc;mes suffisent &agrave; faire basculer la
moyenne). Le cas le plus net est **forte-moyenne** : son &eacute;chantillon
initial (n=18 sur 2 mois) &eacute;tait domin&eacute; par un rapport isol&eacute;
&agrave; 299,30&euro; ; les 20 nouveaux rapports de juin (moyenne 17,39&euro;
seulement) ont ramen&eacute; la moyenne combin&eacute;e &agrave; 23,30&euro;, d'o&ugrave;
la chute de +75% &agrave; +39%.

**M&eacute;thode inchang&eacute;e** : m&ecirc;me approche hybride que
pr&eacute;c&eacute;demment — mise et nombre de captures calcul&eacute;s
exactement sur les 3 mois d'archives locales (aucun &eacute;chantillonnage
sur cette partie), gain estim&eacute; en multipliant le nombre de captures
par le rapport moyen &eacute;chantillonn&eacute; via l'API PMU officielle.
Sur juin, 4 des 24 courses "gagn&eacute;es" du profil forte-moyenne
n'offraient pas de pari Coupl&eacute; Gagnant (tr&egrave;s petit peloton, seul
le Coupl&eacute; Ordre &eacute;tait propos&eacute;) — exclues du calcul de
moyenne, comme le pr&eacute;voit d&eacute;j&agrave; la m&eacute;thode.

**Cons&eacute;quence pratique** : les 3 profils restent affich&eacute;s comme
"rentables" (badge et page Coupl&eacute; rentable inchang&eacute;s, aucun
profil n'est repass&eacute; n&eacute;gatif), mais les textes d'aide dans
l'app et cette documentation ont &eacute;t&eacute; mis &agrave; jour avec les
nouveaux chiffres 3 mois. Le message reste le m&ecirc;me qu'&agrave; l'origine :
r&eacute;sultat exploratoire, &agrave; interpr&eacute;ter avec prudence, et
&agrave; continuer de valider avec d'autres mois d'archive. Sw.js passe en
v38.

### Mise a jour aout 2026 (5) : test avec la cote de 8h — resultat s'inverse (NEGATIF)

A la demande de l'utilisateur ("peux-tu tester le resultat sur les cotes
8h"), le m&ecirc;me backtest a &eacute;t&eacute; rejou&eacute; en calculant
la Value (et donc la composition des pools Coupl&eacute; Value) &agrave;
partir de la **cote de 8h** au lieu de la **cote directe** (param&egrave;tre
`useCote8hPourValue` de `RaceAnalyzer.analyser`, d&eacute;j&agrave; pr&eacute;sent
dans le moteur pour la fiche course individuelle). R&eacute;sultat sur les 3
mois d'archives (janvier + juin + juillet 2026), avec un nouvel &eacute;chantillonnage
de 79 rapports PMU r&eacute;els :

| Profil | Courses (cote 8h) | Mise | Captures | Taux | Rapport moyen &eacute;chantillonn&eacute; | ROI cote 8h | ROI cote directe (r&eacute;f&eacute;rence) |
|---|---|---|---|---|---|---|---|
| forte-moyenne | 178 | 2 670&euro; | 99 | 55,6% | 12,56&euro; (n=19) | **-53%** | +39% |
| moyenne-faible | 308 | 4 620&euro; | 82 | 26,6% | 49,41&euro; (n=28) | **-12%** (-39% sans un rapport isol&eacute; &agrave; 451&euro;) | +22% |
| faible-moyenne | 376 | 10 528&euro; | 181 | 48,1% | 32,87&euro; (n=26) | **-44%** | +18% |

**Constat clair et net** : le r&eacute;sultat s'inverse compl&egrave;tement
avec la cote de 8h. Les 3 profils, positifs avec la cote directe, deviennent
**tous n&eacute;gatifs** avec la cote de 8h (de -12% &agrave; -53%). Les taux
de capture (pool contenant les 2 vrais chevaux) chutent aussi nettement
(ex. forte-moyenne : 89,6% avec cote directe contre 55,6% avec cote 8h). Les
populations de courses par profil changent aussi fortement : la cote de 8h
&eacute;tant plus &eacute;loign&eacute;e du d&eacute;part, elle contient moins
d'information de march&eacute; (mises tardives, informations de dernier
moment), donc le calcul de Value &agrave; partir d'elle est beaucoup plus
bruit&eacute; — les courses se r&eacute;partissent diff&eacute;remment entre
profils de confiance, et le signal perd toute sa valeur pr&eacute;dictive.

**Cons&eacute;quence pratique importante** : ce signal (badge "Jeu conseill&eacute;",
page Coupl&eacute; rentable) n'est fiable **que si la cote utilis&eacute;e est
la cote directe** (cote proche du d&eacute;part, mise &agrave; jour via le
bouton "Mettre &agrave; jour les cotes"), **pas la cote de 8h** (cote du
matin, pr&eacute;sente d&egrave;s l'import du fichier). Bonne nouvelle :
c'est d&eacute;j&agrave; le comportement actuel de l'application — Course
feu vert, R&eacute;sultat et Coupl&eacute; rentable appellent tous
`RaceAnalyzer.analyser(..., false)`, c'est-&agrave;-dire cote directe par
d&eacute;faut (voir `js/app.js`). Aucun changement de code n&eacute;cessaire,
mais ceci confirme qu'il ne faut **pas** se fier &agrave; ces signaux tant
que les cotes n'ont pas &eacute;t&eacute; mises &agrave; jour proche du
d&eacute;part (la cote de 8h seule, disponible d&egrave;s le matin, ne
suffit pas).

### Mise a jour aout 2026 (6) : "Course feu vert" renomm&eacute;e "Top base", report supprim&eacute;, r&eacute;ussite/rendement Gagnant et Plac&eacute; s&eacute;par&eacute;s

A la demande de l'utilisateur, 3 changements sur la page (et son onglet) qui
s'appelait jusqu'ici "Course feu vert" :

1. **Renommage** : l'onglet et les titres affich&eacute;s passent de "Course
   feu vert"/"R&eacute;sultat feu vert" &agrave; **"Top base"**/**"R&eacute;ussite
   Top base"**. Aucun changement de logique - seul l'habillage visible
   change (`js/app.js` : `TABS`, `renderTopbar`, messages d'&eacute;tat
   vide). Les noms de fonctions/variables internes (`renderCourseFeuVert`,
   `FILTRE_FEU_VERT_*`, la route `#/feuvert`, etc.) restent inchang&eacute;s
   pour ne pas casser la pr&eacute;f&eacute;rence de filtre d&eacute;j&agrave;
   enregistr&eacute;e dans le navigateur de l'utilisateur (`localStorage`).
2. **Suppression de la simulation de report** : la fonctionnalit&eacute;
   "Simulation report Place (3 courses)" (mise rejou&eacute;e int&eacute;gralement
   sur la Base d'une course suivante, ajout&eacute;e en ao&ucirc;t 2026)
   a &eacute;t&eacute; enti&egrave;rement retir&eacute;e de la page R&eacute;ussite
   Top base, &agrave; la demande de l'utilisateur (`simulerReportPlace` et
   `reportPlaceHtml` supprim&eacute;es de `js/app.js`).
3. **R&eacute;ussite et rendement Gagnant/Plac&eacute; s&eacute;par&eacute;s** :
   jusqu'ici, la page affichait un seul taux de r&eacute;ussite fusionn&eacute;
   ("Base r&eacute;ussie : Gagnant OU Plac&eacute;") et un seul bilan financier
   (mise 2&euro; = 1&euro; Gagnant + 1&euro; Plac&eacute;, gain cumul&eacute;
   des 2 paris). D&eacute;sormais :
   - Le taux de r&eacute;ussite affiche 2 chiffres distincts : "Gagnant X/Y
     (Z%)" et "Plac&eacute; X/Y (Z%)".
   - Le rendement (bouton "R&eacute;cup&eacute;rer les rapports", inchang&eacute;)
     affiche 2 bilans distincts : mise/gains/net pour le Simple Gagnant et
     mise/gains/net pour le Simple Plac&eacute;, s&eacute;par&eacute;ment, plut&ocirc;t
     qu'un seul chiffre m&eacute;lang&eacute;.
   - Chaque ligne de course affiche d&eacute;sormais 2 badges de r&eacute;sultat
     (Gagnant &#10003;/&#10007;, Plac&eacute; &#10003;/&#10007;) et, une fois
     les rapports r&eacute;cup&eacute;r&eacute;s, 2 badges de rendement ("G
     +X&euro;" / "P +X&euro;") au lieu d'un badge unique.

   `bilanSimpleBase` (`js/app.js`) a &eacute;t&eacute; modifi&eacute;e en
   cons&eacute;quence : elle renvoie maintenant `{ gagnant: {mise,gain,net},
   place: {mise,gain,net} }` au lieu d'un seul objet fusionn&eacute;. La
   r&eacute;cup&eacute;ration des rapports officiels PMU (bouton, boucle
   s&eacute;quentielle avec pause 400ms) est inchang&eacute;e - elle
   r&eacute;cup&egrave;re toujours les 2 rapports (Simple Gagnant + Simple
   Place) en un seul appel API par course.

Sw.js passe en v39.

### Mise a jour aout 2026 (7) : validation sur 8 mois (jan-11 aout) - le ROI des 3 profils rentables retombe pres de zero

Suite &agrave; l'ajout de 5 mois d'archives suppl&eacute;mentaires par
l'utilisateur (l'archive couvre d&eacute;sormais en continu le 1er janvier
au 11 ao&ucirc;t 2026, soit 223 jours), le backtest des 3 profils a
&eacute;t&eacute; rejou&eacute; sur l'int&eacute;gralit&eacute; de la
p&eacute;riode, avec un &eacute;chantillonnage de rapports PMU r&eacute;els
nettement &eacute;largi (environ 140 rapports contre ~90 pr&eacute;c&eacute;demment) :

| Profil | Courses (8 mois) | Mise totale | Captures | Taux | Rapport moyen &eacute;chantillonn&eacute; | ROI 8 mois | ROI 3 mois | ROI 2 mois |
|---|---|---|---|---|---|---|---|---|
| forte-moyenne | 199 | 2 980&euro; | 152 | 76,4% | 23,01&euro; (n=46) | **+17%** | +39% | +75% |
| moyenne-faible | 65 | 975&euro; | 41 | 63,1% | 24,67&euro; (n=40) | **+4%** | +22% | +48% |
| faible-moyenne | 1 282 | 35 889&euro; | 890 | 69,4% | 40,11&euro; (n=53) | **-0,5%** | +18% | +61% |
| **Total pond&eacute;r&eacute;** | **1 546** | **39 844&euro;** | **1 083** | **70,0%** | — | **~+1%** | — | — |

**Constat** : la tendance amorc&eacute;e sur 3 mois se confirme et
s'accentue. Avec 8 mois d'archives, le ROI pond&eacute;r&eacute; des 3
profils tombe &agrave; environ **+1%** (quasi nul), et **faible-moyenne**
- qui repr&eacute;sente &agrave; lui seul 90% de la mise totale - passe
l&eacute;g&egrave;rement **n&eacute;gatif** (-0,5%). La trajectoire est
sans ambigu&iuml;t&eacute; : +61%/+48%/+75% (2 mois) &rarr; +18%/+22%/+39%
(3 mois) &rarr; -0,5%/+4%/+17% (8 mois). Les chiffres initiaux &eacute;taient
optimistes par bruit d'&eacute;chantillonnage (les dividendes Coupl&eacute;
sont tr&egrave;s asym&eacute;triques : quelques gros rapports isol&eacute;s
suffisaient &agrave; gonfler la moyenne sur un petit &eacute;chantillon).

**M&eacute;thode inchang&eacute;e** : mise et nombre de captures calcul&eacute;s
exactement sur les 8 mois d'archives locales (aucun &eacute;chantillonnage
sur cette partie), gain estim&eacute; en multipliant le nombre de captures
par le rapport moyen &eacute;chantillonn&eacute; via l'API PMU officielle
(pool internet en priorit&eacute;, repli sur le pool national).

**D&eacute;coupage par discipline et hippodrome (t&acirc;che demand&eacute;e
en parall&egrave;le)** : sur les 1 546 courses "Coupl&eacute; rentable" des
8 mois, le taux de capture par discipline est stable : PLAT n=668 (67,2%),
ATTEL&Eacute; n=644 (72,8%), OBSTACLE (haies+steeple+cross) n=126 (66,7%),
MONT&Eacute; n=108 (75,0%). C&ocirc;t&eacute; ROI, un &eacute;chantillonnage
&eacute;largi de 186 rapports r&eacute;els (contre ~90 avant) donne un ROI
pond&eacute;r&eacute; par discipline de **-8,7%** (ATTEL&Eacute; +1,9%,
PLAT -12,2%, MONT&Eacute; -20,9%, OBSTACLE -32,0%). Une tentative de
recensement exhaustif de la totalit&eacute; des ~1 083 dividendes r&eacute;els
(plut&ocirc;t qu'un &eacute;chantillon) a &eacute;t&eacute; engag&eacute;e
pour trancher d&eacute;finitivement, mais interrompue par une limite de
ressources avant compl&eacute;tion (co&ucirc;t jug&eacute; disproportionn&eacute;) ;
sur d&eacute;cision de l'utilisateur, l'&eacute;chantillon de 186 rapports
est retenu comme suffisant. Ce -8,7% par discipline et le +1% pond&eacute;r&eacute;
par profil sont d&eacute;sormais du m&ecirc;me ordre de grandeur (tous deux
proches de z&eacute;ro), ce qui r&eacute;sout largement la contradiction
observ&eacute;e pr&eacute;c&eacute;demment entre les deux d&eacute;coupages
(&agrave; 3 mois : +18/+22/+39% par profil contre -6% par discipline). Le
d&eacute;coupage par discipline/hippodrome reste **indicatif** (bas&eacute;
sur un &eacute;chantillon, pas un recensement complet) et n'est pas
int&eacute;gr&eacute; comme filtre dans l'application - il sert uniquement
&agrave; confirmer que l'avantage mesur&eacute; par profil n'est pas
concentr&eacute; artificiellement sur une discipline ou un hippodrome
particulier.

**Cons&eacute;quence pratique** : apr&egrave;s discussion avec l'utilisateur,
les 3 profils restent affich&eacute;s tels quels (badge "Jeu conseill&eacute;",
page Coupl&eacute; rentable, aucun changement de logique/filtre), mais avec
les chiffres 8 mois et un libell&eacute; revu &agrave; la baisse ("signal
affaibli" plut&ocirc;t que "profil rentable") pour refl&eacute;ter
honn&ecirc;tement que l'avantage mesur&eacute; s'est quasiment effondr&eacute;
avec un &eacute;chantillon suffisant. Le message reste : r&eacute;sultat
exploratoire, &agrave; interpr&eacute;ter avec beaucoup de prudence. Sw.js
passe en v40.

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
  dont le **score de configuration correspond au filtre choisi** (cumulatif
  ou exact, 2 a 5, par defaut "4/5 et plus" — cf. "Filtre de confiance
  ajustable" ci-dessous pour le detail du selecteur et les taux de reussite
  mesures par palier) **ET** dont le nombre de partants est compris entre
  **8 et 16** (a la demande de l'utilisateur — les champs en dehors de
  cette plage sont ecartes de la liste, meme avec un bon score) **ET** dont
  **au plus 50% des chevaux sont sans historique de performances retrouve**
  (`ratioSansHistorique`/`couvertureHistoriqueAcceptableFeuVert`,
  `js/app.js` — a la demande de l'utilisateur : au-dela de cette
  proportion, le Score Forme/Aptitude/Similaire de la majorite du champ
  reste a une valeur par defaut neutre faute d'historique, rendant la
  Value et le score de configuration peu fiables) **ET** dont la course
  a une **Base tres solide confirmee par les predictions externes** (cf.
  section "Filtre confirmation externe" plus bas). Triees par score
  decroissant.
- *** Mise a jour *** : a la demande de l'utilisateur ("remplacer le
  Coupl&eacute; Value par le Trio Value dans les courses feu vert"), le pari
  suivi sur ces 2 pages est desormais le **Trio Value (avec base)** (Base
  tres solide + 5 partenaires Value = 10 combinaisons possibles — meme
  suggestion que la carte "Trio Value (avec base)" de la fiche course, cf.
  section correspondante) au lieu du Coupl&eacute; Value. Ce dernier reste
  inchange sur la fiche course elle-meme (carte "Coupl&eacute; Value").
- **Affichage** : pour chaque course, le niveau de confiance (ex.
  "Confiance elevee (4/5)"), le badge "Base confirmee (cote cible)" le cas
  echeant, le badge "Confirmation externe", et la suggestion Trio Value
  (Base + 5 partenaires).
- **Bouton "Voir la reussite du jour"** : mene a une nouvelle page
  **Resultat**, qui reprend les memes courses "feu vert" et, pour celles
  dont l'arrivee officielle est deja connue (saisie manuelle ou detection
  automatique via l'API PMU), verifie si le Trio Value a effectivement
  reussi (la Base ET les 2 autres vrais chevaux du Top3 presents parmi les
  5 partenaires retenus — meme critere de succes que celui utilise pour
  mesurer TRIO_VALUE_STATS/TRIO_ADAPTATIF_NIVEAUX sur la fiche course). Un
  compteur global ("X/Y Trio Value avec base reussis, Z%") s'affiche en
  tete de page. Les courses feu vert dont l'arrivee n'est pas encore connue
  apparaissent a part, sous "En attente de resultat" — cette page se
  remplit donc naturellement au fil de la journee, au fur et a mesure que
  les courses se terminent (surtout si vous utilisez la mise a jour des
  cotes, qui recupere aussi automatiquement l'arrivee des courses
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
`trioValueReussi(bd, chevaux, ordreArrivee)` (verification du succes du
Trio Value avec base pour une course dont l'arrivee est connue — la Base
ET les 2 autres vrais chevaux du Top3 parmi les 5 partenaires, `null` si
l'arrivee est inconnue/incomplete) remplace l'ancienne `coupleValueReussi` ;
`nbPartantsAcceptableFeuVert` (filtre 8-16 partants, constantes
`MIN_PARTANTS_FEU_VERT`/`MAX_PARTANTS_FEU_VERT`), appliquee dans les deux
pages pour rester coherentes entre elles. Toutes dans `js/app.js` (meme
limitation de test que les sections precedentes - fonctions liees au DOM,
verification de coherence faite manuellement). Purement indicatif : n'entre
dans aucun calcul de Score Global/Value/classement, et ne modifie aucune
donnee. Le pool adaptatif (section "Pool adaptatif du Coupl&eacute; Value"
plus bas) et la formule de bilan financier "Coupl&eacute; Value"
(`bilanCoupleValue`) ne s'appliquent d&eacute;sormais plus qu'&agrave; la
fiche course (carte "Coupl&eacute; Value") — le Trio Value avec base ayant
toujours un pool fixe (5 partenaires, 10 combinaisons), aucun pool adaptatif
n'est necessaire pour lui.

### Filtre confirmation externe (vrai filtre, pas un badge)

*** Nouveaut&eacute; *** : &agrave; la demande explicite de l'utilisateur
("appliquer le nouveau filtre de confirmation externe pour les courses feu
vert"), et apr&egrave;s confirmation du choix exact (vrai filtre
d'exclusion, plut&ocirc;t qu'un simple badge informatif comme les 2 autres
d&eacute;j&agrave; affich&eacute;s sur chaque ligne), **Course feu vert** et
**Resultat** n'affichent plus desormais qu'une course si, EN PLUS des
crit&egrave;res existants (score de configuration, 8-16 partants, couverture
d'historique) :

- la course a une **Base tres solide** (`trioValueAvecBase`, la m&ecirc;me
  que celle utilis&eacute;e par le badge "Confirmation externe" de la fiche
  course - cf. section "Pr&eacute;dictions externes" plus haut) ;
- **ET** cette Base est **confirm&eacute;e** (simple ou double, cf.
  `niveauConfirmationExterne`) par un fichier de pr&eacute;dictions externe
  **import&eacute; pour le bon jour/hippodrome/course** (onglet Importer,
  carte "Pr&eacute;dictions externes").

**Cons&eacute;quence assum&eacute;e et document&eacute;e dans le message
d'&eacute;tat vide** : sans import d'un fichier de pr&eacute;dictions
externe pour la journ&eacute;e, **aucune course n'appara&icirc;t** en
Course feu vert/Resultat, m&ecirc;me si des courses remplissent tous les
autres crit&egrave;res - ce filtre suppose donc d&eacute;sormais un import
quotidien suppl&eacute;mentaire (le fichier "Predictions_JJMMAAAA_HHMM")
pour que ces 2 pages restent utiles. Les courses affich&eacute;es montrent
le badge "Confirmation externe" (simple ou double) &agrave; c&ocirc;t&eacute;
des badges Cotes cibles/Confiance renforc&eacute;e d&eacute;j&agrave;
pr&eacute;sents, pour distinguer en un coup d'oeil les deux niveaux.

V&eacute;rifi&eacute; : `niveauConfirmationExterne` (les 4 cas retenus/
&eacute;cart&eacute;s par le filtre) est d&eacute;j&agrave; couvert par les
tests automatis&eacute;s (`tests/engine.test.js`, section "Pr&eacute;dictions
externes" plus haut) ; le branchement dans `renderCourseFeuVert`/
`renderResultatJournee` (deux lignes de logique simple : exclusion si pas de
Base tres solide, exclusion si niveau ni "simple" ni "double") a &eacute;t&eacute;
relu directement, m&ecirc;me limitation de test que le reste de `js/app.js`.

### Filtre de confiance ajustable (cumulatif ou exact, 2 &agrave; 5)

*** Mise a jour *** : a la demande de l'utilisateur, le filtre de score de
configuration retenu pour "Course feu vert"/"Resultat" n'est plus fige
dans le code — un menu deroulant **"Indice de confiance"** en haut des
deux pages propose desormais **8 options**, memorisees dans ce navigateur
via `localStorage` (meme mecanisme que pour le mot de passe d'acces) :

- 4 options **cumulatives** ("2/5 et plus" &agrave; "5/5 et plus") -
  score de configuration &ge; N, comme avant ;
- 4 options **exactes** ("2/5 uniquement" &agrave; "5/5 uniquement",
  ajoutees a la demande de l'utilisateur) - score de configuration = N
  pile, pour isoler un seul niveau de confiance plutot qu'un cumul.

Par defaut "4/5 et plus". Les deux pages restent coherentes entre elles :
changer le filtre sur l'une des deux pages s'applique immediatement aux
deux (elles relisent la meme valeur memorisee). Rappel des taux de
reussite mesures (cf. tableau "Score de configuration" ci-dessus,
backtest 4 mois, 4092 courses) pour choisir en connaissance de cause :

| Filtre | Courses concernees | Reussite mesuree |
|---|---|---|
| 2/5 et plus | scores 2, 3, 4 et 5 | 55,7% a 83,3% |
| 3/5 et plus | scores 3, 4 et 5 | 63,8% a 83,3% |
| 4/5 et plus *(par defaut)* | scores 4 et 5 | 72,4% a 83,3% |
| 5/5 et plus | score 5 uniquement | 83,3% |
| 2/5 uniquement | score 2 seul | 55,7% (n=984) |
| 3/5 uniquement | score 3 seul | 63,8% (n=881) |
| 4/5 uniquement | score 4 seul | 72,4% (n=642) |
| 5/5 uniquement | score 5 seul | 83,3% (n=215) |

*(les 4 lignes "uniquement" reprennent simplement les taux du tableau
"Score de configuration" ci-dessus, score par score - un filtre cumulatif
de N/5 et un filtre exact de N/5 ont evidemment le meme taux quand N=5,
puisqu'il n'y a pas de score au-dela)*. Un filtre cumulatif bas (2/5 et
plus) laisse passer davantage de courses mais avec une reussite mesuree
plus faible en moyenne ; un filtre exact permet d'isoler un seul niveau
(utile par exemple pour comparer specifiquement le comportement des
courses 4/5 sans les melanger aux 5/5, plus rares et plus fiables encore).
Fonctions concernees : `getFiltreFeuVert`/`setFiltreFeuVert`/
`matchFiltreFeuVert`/`libelleFiltreFeuVert`/`seuilFeuVertSelectorHtml`/
`bindSeuilFeuVertSelector` dans `js/app.js` (meme limitation de test que
les sections precedentes - fonctions liees au DOM/localStorage ; la
logique pure de correspondance cumulatif/exact a ete verifiee
independamment en Node).

## Croisement Coupl&eacute; Value / Cotes cibles

*** Nouveaut&eacute; *** : a la demande de l'utilisateur, un nouvel
indicateur **independant** du score de configuration croise les 5
candidats du Coupl&eacute; Value avec les **Cotes cibles** (cf. "Cote
cible la plus proche" plus haut : 4 cibles classiques du turf - NP/4,
NP/2, NP, NPx2 - chacune associee au cheval dont la cote actuelle en est
la plus proche, tolerance &plusmn;100%). Principe : plus il y a de
recoupement entre les deux methodes (qui reposent sur des calculs tres
differents - la Value d'un cote, la simple proximite a une cote cible de
l'autre), plus la confirmation est forte.

**Verification effectuee sur le backtest** (5 mois, 5050 courses,
rows_cote.json + rows_juillet.json) : la reussite du Coupl&eacute; Value
(meme critere que d'habitude - les 2 vrais chevaux du Top2 presents parmi
les 5 candidats) grimpe avec le nombre de chevaux "cote cible" retrouves
parmi les 5 candidats Value, avec un gradient quasi lineaire, aussi net
que celui du score de configuration :

| Chevaux communs | Reussite | n |
|---|---|---|
| 1 | 32,6% | 135 |
| 2 | 48,3% | 1930 |
| 3 | 61,3% | 2382 |
| 4 | 75,2% | 602 |

*(le cas "0 commun" est quasi inexistant sur le backtest - n=1 sur 5050
courses, la tolerance &plusmn;100% des cotes cibles etant large - non
retenu comme categorie fiable)*. Au niveau de chaque cheval individuel, un
cheval confirme par les deux methodes ("les deux") termine Top3/Top2/
1er nettement plus souvent (47,0%/34,5%/19,3%) qu'un cheval retenu par le
seul Coupl&eacute; Value (36,8%/25,4%/12,9%) ou par la seule cote cible
(19,4%/10,8%/4,1%).

**Affichage** : un badge **"Cotes cibles : N confirmation(s) (N&deg;x,
N&deg;y, ...)"** (couleur selon le nombre - rouge pour 1, orange pour 2,
bleu pour 3, vert pour 4, gris si aucune) apparait desormais &agrave;
c&ocirc;t&eacute; du badge de score de configuration, sur la carte
"Coupl&eacute; Value" de la fiche course ET sur chaque ligne de la page
**Course feu vert**. *** Mise a jour *** : a la demande de l'utilisateur,
le badge affiche desormais explicitement les **numeros des chevaux
concernes** (ex. "Cotes cibles : 2 confirmations (N&deg;5, N&deg;9)"),
plutot que le seul nombre. Le taux de reussite mesure est visible au
survol du badge.

**Choix d'integration** : a la demande explicite de l'utilisateur, cet
indicateur reste un badge **separe** plut&ocirc;t qu'un 6e point ajout&eacute;
au score de configuration (0-5) - cela evite de modifier les seuils, les
libell&eacute;s et les chiffres de r&eacute;ussite d&eacute;j&agrave;
v&eacute;rifi&eacute;s (score de configuration 0-5, filtre de Course feu
vert/Resultat). Fonctions concernees : `confirmationsCotesCibles`
(retourne les numeros des chevaux communs, tries), `CONFIRMATION_COTES_CIBLES_NIVEAUX`,
`confirmationCotesCiblesHtml` dans `js/app.js` (meme limitation de test
que les sections precedentes - fonctions liees au DOM, verification de
coherence faite manuellement sur le backtest ; la logique pure
d'intersection/tri a ete verifiee independamment en Node). Purement
indicatif : n'entre dans aucun calcul de Score Global/Value/score de
configuration/classement, et ne modifie ni le filtre ni le tri de Course
feu vert.

### Croisement confiance x Cotes cibles : "Confiance renforc&eacute;e" et "Base confirm&eacute;e"

*** Nouveaut&eacute; *** : a la demande de l'utilisateur, le score de
configuration (la "confiance", 0-5) a &eacute;t&eacute; crois&eacute; avec
les confirmations Cotes cibles sur le backtest (5 mois, 5050 courses),
pour le Coupl&eacute; Value et pour le Trio Value avec base. La grille
compl&egrave;te (6 niveaux de score &times; 5 niveaux de confirmations)
contient trop de cases &agrave; faible effectif pour &ecirc;tre fiable
partout ; seuls les **2 signaux mesur&eacute;s sur un large &eacute;chantillon**
ont &eacute;t&eacute; retenus et int&eacute;gr&eacute;s :

1. **Coupl&eacute; Value - badge "Confiance renforc&eacute;e"** : affich&eacute;
   quand le score de configuration est **>= 4/5 ET** qu'au moins **3 des 5
   candidats** sont aussi confirm&eacute;s par une cote cible. R&eacute;ussite
   mesur&eacute;e : **75,6%** (n=986), au-dessus du score seul (72,4% &agrave;
   83,3% pour les scores 4 et 5) et des confirmations seules (61,3%
   &agrave; 75,2% pour 3 et 4 confirmations). Constantes
   `SEUIL_SCORE_CONFIANCE_RENFORCEE` (4) et
   `SEUIL_CONFIRM_CONFIANCE_RENFORCEE` (3), fonction
   `confianceRenforceeHtml` dans `js/app.js`. Affich&eacute; sur la carte
   "Coupl&eacute; Value" de la fiche course ET sur chaque ligne de
   **Course feu vert**.
2. **Trio Value avec base - badge "Base confirm&eacute;e (cote cible)"** :
   affich&eacute; quand la **base elle-m&ecirc;me** (pas les partenaires)
   est d&eacute;sign&eacute;e par une cote cible. R&eacute;ussite mesur&eacute;e :
   **64,2%** (n=1005) contre **41,5%** (n=205) quand la base n'est pas
   confirm&eacute;e - &eacute;cart net (plus de 20 points) sur un crit&egrave;re
   binaire simple, bien mesur&eacute; sur les deux effectifs. Fonction
   `baseConfirmeeCotesCiblesHtml` dans `js/app.js`. Affich&eacute; sur la
   carte "Trio Value (avec base)" de la fiche course.

Les cas &eacute;cart&eacute;s (grille compl&egrave;te 6&times;5, tiers
bas/moyen/haut) n'ont pas &eacute;t&eacute; int&eacute;gr&eacute;s : trop de
cases avec un effectif insuffisant (parfois n<10) pour justifier un
affichage fiable dans l'app - choix explicite de l'utilisateur de
privil&eacute;gier la robustesse statistique &agrave; l'exhaustivit&eacute;.
Fonctions v&eacute;rifi&eacute;es de fa&ccedil;on independante en Node (memes
limitations de test que les sections pr&eacute;c&eacute;dentes pour le reste,
fonctions li&eacute;es au DOM). Purement indicatif dans les deux cas :
n'entre dans aucun calcul de Score Global/Value/score de
configuration/classement.

### Pool adaptatif du Coupl&eacute; Value (taille du pool selon le profil confiance x confirmations)

*** Nouveaut&eacute; *** : &agrave; la demande de l'utilisateur ("adapter
le choix des chevaux - base, Coupl&eacute; Value - en fonction de l'indice
de confiance et de la confirmation Cotes cibles"), la taille du pool de
candidats du Coupl&eacute; Value (jusque-l&agrave; toujours **5**, Value
croissante sur tout le champ) s'adapte d&eacute;sormais au **profil de la
course**, crois&eacute; entre le score de configuration (confiance, 0-5,
group&eacute; en 3 buckets faible/moyenne/forte) et le nombre de
confirmations Cotes cibles (0-4, group&eacute; en 3 buckets faible/moyenne/forte
&eacute;galement) - 9 cellules au total (8 mesur&eacute;es + 1 repli).

**Constat sur le backtest (5 mois, 5050 courses)** : pour chaque cellule,
on a mesur&eacute; le plus petit pool Top-N Value qui capture les 2 vrais
chevaux du Top2 avec un bon rapport capture/co&ucirc;t (le co&ucirc;t
croissant en N&times;(N-1)/2 combinaisons) :

| Confiance &times; Confirmations | n courses | N retenu | Capture mesur&eacute;e |
|---|---|---|---|
| Forte &times; Forte | 986 | 5 | 75,6% |
| Forte &times; Moyenne | 101 | 6 | 77,2% |
| Forte &times; Faible | 0 (repli sur Forte&times;Moyenne) | 6 | 77,2% (non mesur&eacute;) |
| Moyenne &times; Forte | 1509 | 6 | 73,2% |
| Moyenne &times; Moyenne | 819 | 7 | 77,3% |
| Moyenne &times; Faible | 34 | 6 | 70,6% |
| Faible &times; Forte | 489 | 7 | 68,3% |
| Faible &times; Moyenne | 1010 | 8 | 70,6% |
| Faible &times; Faible | 102 | **abstention** | 62,7% au mieux (N=8), aucun N raisonnable ne suffit |

La cellule "Faible &times; Faible" est la seule o&ugrave; aucune taille de
pool ne rattrape le profil : la carte Coupl&eacute; Value affiche alors un
message d'abstention ("Profil confiance/confirmations trop faible : pas de
suggestion Coupl&eacute; Value fiable sur cette course") plut&ocirc;t
qu'une liste de candidats. La cellule "Forte &times; Faible" n'a aucune
occurrence sur le backtest (un score de configuration &eacute;lev&eacute;
implique quasiment toujours au moins 2 confirmations) : elle reprend par
prudence le pool de la cellule voisine "Forte &times; Moyenne".

**Fonctions concern&eacute;es (`js/app.js`)** :
- `coupleValue(chevaux, n = 5)` : accepte d&eacute;sormais une taille de
  pool variable (`n`), `5` par d&eacute;faut pour compatibilit&eacute; (les
  confirmations Cotes cibles restent toujours calcul&eacute;es sur le pool
  de 5, m&ecirc;me quand le pool affich&eacute; est plus grand - m&eacute;trique
  inchang&eacute;e).
- `poolAdaptatifCoupleValue(score, nbConfirmations)` : renvoie le N &agrave;
  utiliser pour le profil donn&eacute; (table `POOL_ADAPTATIF_NIVEAUX`), ou
  `n: null` pour la cellule d'abstention.
- `coupleValueReussi(chevaux, ordreArrivee, nPool = 5)` : accepte
  d&eacute;sormais le pool utilis&eacute; pour la course, afin que la page
  **Resultat** (taux de r&eacute;ussite + bilan financier) &eacute;value
  la r&eacute;ussite du **m&ecirc;me pool** que celui affich&eacute; sur
  **Course feu vert**, pas toujours 5.
- `coupleValueHtml`, **Course feu vert** et **Resultat** utilisent tous les
  trois `poolAdaptatifCoupleValue` pour d&eacute;terminer le pool &agrave;
  afficher/&eacute;valuer. Sur la page Resultat, les courses en cellule
  d'abstention sont list&eacute;es &agrave; part ("Sans suggestion Coupl&eacute;
  Value"), exclues du taux de r&eacute;ussite et du bilan financier
  (aucune suggestion n'a &eacute;t&eacute; faite, rien &agrave; &eacute;valuer).
- Le bilan financier (mise = combinaisons &times; 1&euro;) suit
  automatiquement la taille du pool : 10 combinaisons &agrave; N=5, jusqu'&agrave;
  28 &agrave; N=8.

**Trio Value avec base** : le m&ecirc;me croisement a &eacute;t&eacute;
test&eacute; sur la r&eacute;ussite du Trio (base d&eacute;j&agrave; Top3 ->
les 2 autres vrais chevaux du Top3 sont-ils dans les 5 partenaires ?), mais
la pr&eacute;condition ("la base finit d&eacute;j&agrave; Top3") r&eacute;duit
fortement l'effectif de plusieurs cellules (2 &agrave; 31 courses selon la
cellule, contre des centaines pour le Coupl&eacute; Value) - **pas assez de
donn&eacute;es pour une abstention fiable comme pour le Coupl&eacute; Value**.
La carte "Trio Value (avec base)" affiche d&eacute;sormais, &agrave; titre
purement informatif, le score de configuration (confiance) de la course et,
quand la cellule a un effectif suffisant (n&ge;20), le taux mesur&eacute;
sp&eacute;cifique &agrave; ce profil (de 38,7%, n=31, en confiance faible/confirmations
moyennes, &agrave; 73,0%, n=500, en confiance forte/confirmations fortes -
contre 61,2% en moyenne g&eacute;n&eacute;rale, n=923) ; sinon le taux
global reste affich&eacute;. Aucune abstention appliqu&eacute;e ici.

V&eacute;rifi&eacute; ind&eacute;pendamment en Node (extraction des
fonctions pures depuis `js/app.js`, hors DOM) : les 8 cellules + le repli
retournent le bon N, `coupleValue(chevaux, n)` respecte le tri Value
croissant pour toute taille de pool, `coupleValueReussi` avec un `nPool`
variable capture bien un cheval class&eacute; 6e/7e en Value quand le pool
est &eacute;largi &agrave; 7 (et le rate &agrave; 5), et les cas limites
(champ &lt; 2 chevaux) renvoient `null`. Purement indicatif comme le reste
de ces indicateurs : n'entre dans aucun calcul de Score Global/Value/score
de configuration/classement - seule la **liste des candidats propos&eacute;s**
(et donc les combinaisons/la mise) change selon le profil.

### Fourchette th&eacute;orique du rapport (basse/haute)

*** Nouveaut&eacute; *** : &agrave; la demande de l'utilisateur, les cartes
**Coupl&eacute; Value** et **Trio Value (avec base)** affichent d&eacute;sormais
une **fourchette th&eacute;orique du rapport** (basse &agrave; haute),
calcul&eacute;e &agrave; partir des cotes actuelles des candidats
(`cotePourAffichage` : cote directe si connue, sinon cote 8h) - **avant**
la course, donc purement indicatif (le rapport officiel d&eacute;pend des
mises r&eacute;elles du public, pas seulement des cotes affich&eacute;es).

- **Coupl&eacute; Value** (`fourchetteRapportCouple`, `js/app.js`) : regle
  **(cote1 &times; cote2) / 2** - la m&ecirc;me que le "rapport estim&eacute;"
  d&eacute;j&agrave; v&eacute;rifi&eacute; sur le backtest (74,5% des courses
  au-dessus de 10&euro;, cf. section pr&eacute;c&eacute;dente sur le pool
  adaptatif). Fourchette basse = les **2 cotes les plus basses** du pool
  affich&eacute; (2 favoris) ; fourchette haute = les **2 cotes les plus
  hautes** du pool (2 outsiders).
- **Trio Value (avec base)** (`fourchetteRapportTrio`, `js/app.js`) : regle
  **(produit des 3 cotes) / 10**, fournie par l'utilisateur - **non
  reverifi&eacute;e sur un backtest de rapports Trio officiels** (l'app ne
  r&eacute;cup&egrave;re que les rapports Coupl&eacute; Gagnant, aucune
  donn&eacute;e de rapport Trio n'est disponible pour la valider). Fourchette
  basse = la base + les **2 cotes les plus basses** parmi les 5 partenaires ;
  fourchette haute = la base + les **2 cotes les plus hautes** parmi les 5
  partenaires.

V&eacute;rifi&eacute; ind&eacute;pendamment en Node (extraction des 2
fonctions depuis `js/app.js`) : sur un pool de test (cotes 3,5 / 8 / 15 / 22
/ 40), la fourchette Coupl&eacute; donne bien 14&euro; (3,5&times;8/2) &agrave;
440&euro; (22&times;40/2) ; sur une base &agrave; cote 4 avec 5 partenaires
(6 / 10 / 18 / 25 / 50), la fourchette Trio donne bien 24&euro;
(4&times;6&times;10/10) &agrave; 500&euro; (4&times;25&times;50/10). Cas
limites (pool &lt; 2 cotes connues, base sans cote) renvoient `null` (pas
d'affichage). Purement indicatif : n'entre dans aucun calcul de Score
Global/Value/score de configuration/classement, et ne remplace jamais le
rapport officiel PMU une fois connu.

*** Alerte visuelle, ajout&eacute;e &agrave; la demande de l'utilisateur ***
: la **fourchette basse** s'affiche en **rouge** (`fourchetteRapportHtml`,
param&egrave;tre `nbCombinaisons`) quand elle est **inf&eacute;rieure au
nombre de combinaisons jou&eacute;es** (= la mise totale en euros, &agrave;
1&euro;/combinaison) - Coupl&eacute; Value : compar&eacute;e au nombre de
combinaisons du pool adaptatif (5 &agrave; 8 candidats, donc 10 &agrave; 28
combinaisons) ; Trio Value avec base : compar&eacute;e aux combinaisons entre
les partenaires (10 dans le cas standard, C(5,2)). M&ecirc;me dans le
sc&eacute;nario bas (2 favoris/partenaires les moins chers), le rapport ne
couvrirait alors pas la mise totale - un signal d'alerte simple, purement
visuel (le calcul de la fourchette elle-m&ecirc;me est inchang&eacute;).
V&eacute;rifi&eacute; en Node : rouge d&eacute;clench&eacute; strictement
en-dessous du seuil (basse=8 &lt; 10 combinaisons -> rouge), pas au seuil
exact (basse=10 = 10 combinaisons -> pas de rouge), et jamais de rouge si
`nbCombinaisons` n'est pas fourni.

### Tranche probable (pr&eacute;diction statistique, historique)

*** Nouveaut&eacute; *** : &agrave; la demande de l'utilisateur ("peux-tu
pr&eacute;dire la tranche de rapport probable d'une course ?"), les cartes
**Coupl&eacute; Value** et **Trio Value (avec base)** affichent en plus une
**tranche probable**, distincte de la fourchette th&eacute;orique :

- La **fourchette th&eacute;orique** (section pr&eacute;c&eacute;dente) est
  un calcul **m&eacute;canique** sur les cotes actuelles du pool affich&eacute;
  aujourd'hui (2 cotes basses / 2 cotes hautes).
- La **tranche probable** (`trancheProbableHtml`, tables
  `TRANCHE_PROBABLE_COUPLE` et `TRANCHE_PROBABLE_TRIO`, `js/app.js`) est une
  **v&eacute;ritable pr&eacute;diction statistique** : elle vient de la
  distribution **r&eacute;elle** du rapport estim&eacute; (backtest 5 mois,
  5050 courses), pour les courses ayant eu le **m&ecirc;me profil confiance
  &times; confirmations** (les 9 cellules du pool adaptatif). Elle affiche
  les percentiles **P25 &agrave; P75** (la moiti&eacute; des rapports
  r&eacute;els de ce profil sont tomb&eacute;s dans cette tranche) et la
  m&eacute;diane.

| Profil (confiance &times; confirmations) | Coupl&eacute; : P25-P75 (m&eacute;diane) | Trio : P25-P75 (m&eacute;diane) |
|---|---|---|
| Forte &times; Forte | 5,8&euro;-31,0&euro; (12,0&euro;) | 9,1&euro;-69,4&euro; (23,6&euro;) |
| Forte &times; Moyenne | 5,9&euro;-28,1&euro; (14,0&euro;) | 13,0&euro;-96,7&euro; (29,8&euro;) |
| Moyenne &times; Forte | 8,1&euro;-43,2&euro; (18,4&euro;) | 14,6&euro;-109,1&euro; (36,8&euro;) |
| Moyenne &times; Moyenne | 10,4&euro;-47,1&euro; (20,8&euro;) | 17,9&euro;-134,6&euro; (41,8&euro;) |
| Moyenne &times; Faible | 12,0&euro;-29,7&euro; (18,8&euro;) | 21,0&euro;-115,4&euro; (33,4&euro;) |
| Faible &times; Forte | 14,4&euro;-63,4&euro; (28,3&euro;) | 26,3&euro;-158,0&euro; (61,1&euro;) |
| Faible &times; Moyenne | 19,7&euro;-76,2&euro; (37,4&euro;) | 40,4&euro;-218,9&euro; (86,9&euro;) |
| Faible &times; Faible | 28,6&euro;-79,5&euro; (43,1&euro;) | 42,4&euro;-189,7&euro; (98,8&euro;) |
| Forte &times; Faible | *(repli sur Forte &times; Moyenne, cellule non mesur&eacute;e, n=0)* | *(idem)* |

Affich&eacute;e m&ecirc;me sur la cellule d'abstention du Coupl&eacute;
Value (Faible &times; Faible, pas de suggestion de candidats) : la tranche
probable reste informative sur ce profil, ind&eacute;pendamment du fait
qu'une suggestion soit propos&eacute;e ou non.

**Limite assum&eacute;e, document&eacute;e dans le code et l'infobulle** :
c'est une pr&eacute;diction de **population** (le profil confiance/confirmations
de la course), pas des chevaux pr&eacute;cis du jour - moins pr&eacute;cise
sur une course donn&eacute;e que la fourchette th&eacute;orique (qui, elle,
regarde les cotes r&eacute;elles du pool affich&eacute;), mais reflet fid&egrave;le
de la vraie variabilit&eacute;/asym&eacute;trie des rapports observ&eacute;e en
pratique - contrairement aux bornes min/max m&eacute;caniques de la fourchette
th&eacute;orique. La qualit&eacute; "50% des courses dans [P25,P75]" a
&eacute;t&eacute; v&eacute;rifi&eacute;e par construction sur le backtest
(exactement 50,0%), mais n'a pas &eacute;t&eacute; valid&eacute;e hors
&eacute;chantillon (donn&eacute;es insuffisantes pour un vrai test
train/test &agrave; ce stade).

V&eacute;rifi&eacute; ind&eacute;pendamment en Node : les 9 cellules sont
pr&eacute;sentes dans les 2 tables, le rendu HTML affiche bien les bonnes
valeurs (P25/m&eacute;diane/P75), et une cl&eacute; de cellule inconnue
renvoie une cha&icirc;ne vide (pas d'affichage).

### Coupl&eacute;s dans la tranche probable (surlignage informatif)

*** Nouveaut&eacute; *** : &agrave; la demande de l'utilisateur, la carte
**Coupl&eacute; Value** affiche d&eacute;sormais, juste apr&egrave;s la
Tranche probable, la liste des **combinaisons du pool** dont le rapport
th&eacute;orique - **(cote1 &times; cote2) / 2**, la m&ecirc;me r&egrave;gle
que la fourchette th&eacute;orique, mais **non affich&eacute;** (seul le
filtre s'en sert) - tombe **dans** cette tranche probable [P25,P75] du
profil de la course (`combosDansTrancheProbable`, `combosDansTrancheHtml`,
`js/app.js`).

Une piste voisine avait &eacute;t&eacute; envisag&eacute;e plus t&ocirc;t
(ne **jouer/miser que** sur ces combinaisons, en excluant les autres du
pool) mais &eacute;cart&eacute;e apr&egrave;s analyse (b&eacute;n&eacute;fice
mitig&eacute; selon les cellules, risque de surajustement sur le m&ecirc;me
backtest). Ce qui est affich&eacute; ici est **different et plus prudent** :
un simple **surlignage informatif** - la liste compl&egrave;te des
candidats/combinaisons propos&eacute;e par le pool adaptatif, et la mise
correspondante, restent **strictement inchang&eacute;es**. Rien n'est
exclu ; c'est juste un rep&egrave;re suppl&eacute;mentaire pour l'utilisateur.

**Format d'affichage (&agrave; la demande de l'utilisateur, simplifi&eacute;
apr&egrave;s un premier essai avec les rangs "1er/2&egrave;me" &eacute;crits
en toutes lettres)** : regroup&eacute; par cheval "ancre" (le mieux
class&eacute; en Value des 2 de la paire, en interne via son rang dans le
pool - non affich&eacute;), avec juste les **num&eacute;ros de chevaux**,
sans rang ni "N&deg;" : par exemple `6/8-9 ; 3/8` signifie que le cheval
N&deg;6 forme une combinaison dans la tranche avec le N&deg;8 et avec le
N&deg;9, et que le N&deg;3 en forme une avec le N&deg;8 &eacute;galement.

Affiche "Aucune combinaison du pool n'entre dans la tranche probable"
lorsque c'est le cas (peut arriver, notamment sur les profils &agrave; pool
r&eacute;duit). Non affich&eacute; sur la cellule d'abstention (Faible
&times; Faible : pas de pool, donc pas de combinaisons &agrave; &eacute;valuer).

V&eacute;rifi&eacute; ind&eacute;pendamment en Node (extraction fid&egrave;le
de la fonction, hors DOM) : filtre correct avec bornes P25/P75 incluses,
regroupement par rang ancre correct (partenaires tri&eacute;s par rang
croissant, groupes tri&eacute;s par rang d'ancre croissant), chevaux sans
cote exclus du calcul, et cas limites (tranche/candidats absents, aucune
combinaison dans la tranche) renvoient bien une liste vide sans erreur.

## Pr&eacute;dictions externes (confirmation crois&eacute;e de la Base)

*** Nouveaut&eacute; *** : &agrave; la demande de l'utilisateur, qui a fourni
un fichier de pronostics d'un service **tiers** ("Predictions_JJMMAAAA_HHMM.csv")
et demand&eacute; s'il pouvait servir &agrave; **confirmer la Base** de
l'appli, une nouvelle carte **"Confirmation externe"** croise d&eacute;sormais
la Base (Trio Value avec base) avec ce fichier, import&eacute; &agrave; part
depuis l'onglet **Importer**.

### Structure du fichier tiers

Le fichier ("Rx;Cx;Hippodrome;D&eacute;part;...;Cot&eacute;e G1/G2/G3
N&deg;+Cote;Non cot&eacute;e G1/G2/G3 N&deg;+Cote;ScFi;Rapport Pr&eacute;vu;SG;Arriv&eacute;e",
34 colonnes, s&eacute;parateur `;`) a &eacute;t&eacute; analys&eacute;
en d&eacute;tail sur deux exports r&eacute;els (8 et 9 ao&ucirc;t 2026) avant
int&eacute;gration :

- **Cot&eacute;e G1-G3** et **Non cot&eacute;e G1-G3** : jusqu'&agrave; 6
  chevaux cit&eacute;s par le pronostiqueur, **avant** la course (pr&eacute;dictions
  r&eacute;elles, fig&eacute;es au d&eacute;part sauf mention "hors cote"
  d'apr&egrave;s l'utilisateur).
- **ScFi** : indice de fiabilit&eacute; du pronostic (0-100), connu avant la course.
- **Rapport Pr&eacute;vu** : tranche de rapport Simple Gagnant anticip&eacute;e,
  connue avant la course.
- **SG** et **Arriv&eacute;e** : *** pas des pr&eacute;dictions, malgr&eacute;
  leur nom *** - ce sont le rapport et l'ordre d'arriv&eacute;e **r&eacute;els**,
  remplis par le service une fois la course termin&eacute;e (vides tant
  qu'elle n'est pas partie). V&eacute;rifi&eacute; par un test crois&eacute;
  avec l'API PMU r&eacute;elle : sur un premier fichier (8 ao&ucirc;t), la
  colonne "Arriv&eacute;e" collait exactement &agrave; l'arriv&eacute;e
  officielle sur **12/12 courses test&eacute;es**, y compris des courses
  parties **plusieurs heures apr&egrave;s** l'export du fichier (15h38) - ce
  qui n'est possible que si cette colonne est aliment&eacute;e a posteriori
  et n'a jamais &eacute;t&eacute; une pr&eacute;diction. Confirm&eacute;
  ensuite par l'utilisateur.

### Backtest (juillet 2026, 31 fichiers, 958 courses)

Le fichier a &eacute;t&eacute; test&eacute; sur l'archive juillet compl&egrave;te
de l'utilisateur (31 fichiers quotidiens, appariement date + hippodrome + num&eacute;ro
de course avec les r&eacute;unions import&eacute;es dans l'appli) :

- **958 courses appari&eacute;es**, dont **662 avec une Base identifi&eacute;e**
  par le moteur (les autres courses n'ont pas de Base retenue par le Module 2,
  cf. section "Base(s) possible(s) &amp; Danger(s)").
- Taux de victoire r&eacute;el de la Base selon le niveau de citation par le
  fichier externe :

| Niveau de citation | n | R&eacute;ussite (victoire) |
|---|---|---|
| Cit&eacute;e dans **Cot&eacute;e ET Non cot&eacute;e** (double) | 340 | **36,8%** |
| Cit&eacute;e dans **un seul** des 2 groupes | 249 | **30,1%** |
| **Non cit&eacute;e** du tout | 73 | **16,4%** |
| *(R&eacute;f&eacute;rence : Base seule, sans info externe)* | 753 | 30,9% |

L'&eacute;cart est net (36,8% contre 16,4%, soit plus du double) et va dans
le m&ecirc;me sens que le badge "Base confirm&eacute;e (cote cible)" d&eacute;j&agrave;
existant (crois&eacute; avec les cotes cibles internes) - avec une magnitude
comparable. &Agrave; noter : le groupe "Non cot&eacute;e" seul capture
mieux le vainqueur r&eacute;el que le groupe "Cot&eacute;e" seul (51,0%
contre 42,7% sur l'ensemble des courses, tous chevaux confondus, pas
seulement la Base) - la fiabilit&eacute; ne vient donc pas uniquement des
favoris cit&eacute;s.

### Import et affichage

- **Import** (onglet **Importer**, carte "Pr&eacute;dictions externes
  (optionnel)") : fichier CSV, s&eacute;par&eacute; de l'import "R&eacute;union
  du jour". La date est lue dans le **nom du fichier** (m&ecirc;me extracteur
  que pour la r&eacute;union, `extraireDateReunionDepuisNomFichier`).
  `PredictionsExternesParser.parsePredictionsExternes` (`js/engine/predictionsExternesParser.js`)
  parse le CSV ; `DB.savePredictionsExternes` stocke chaque course avec une
  cl&eacute; `date__HIPPODROME__Cn` (`DB.clePredictionExterne`) - un
  r&eacute;import du m&ecirc;me jour **&eacute;crase** proprement l'ancienne
  entr&eacute;e (pas de doublons). Bouton d&eacute;di&eacute; "Vider les
  pr&eacute;dictions externes import&eacute;es" dans la carte R&eacute;initialisation.
- **Affichage** : sur la fiche course, la carte **"Trio Value (avec base)"**
  affiche un badge **"Confirmation externe double"** (vert), **"Confirmation
  externe"** (bleu) ou **"Non confirm&eacute;e (fichier externe)"** (orange)
  &agrave; c&ocirc;t&eacute; du badge "Base confirm&eacute;e (cote cible)"
  existant - uniquement si une pr&eacute;diction externe a &eacute;t&eacute;
  import&eacute;e pour le bon jour/hippodrome/course (sinon rien ne
  s'affiche). Fonctions `niveauConfirmationExterne`
  (`js/engine/predictionsExternesParser.js`) et `confirmationExterneHtml`
  (`js/app.js`).
- **Stockage** : nouveau magasin IndexedDB `predictionsExternes` (`DB_VERSION`
  pass&eacute; &agrave; **2** - la mise &agrave; niveau du sch&eacute;ma est
  automatique et ne touche pas les donn&eacute;es existantes), inclus dans
  l'export/import de sauvegarde.

Purement indicatif dans tous les cas : comme les autres badges de
confirmation, n'entre dans **aucun** calcul de Score Global/Value/score de
configuration/classement/pool adaptatif - c'est un fichier **tiers**, ind&eacute;pendant
du moteur de l'appli, &agrave; utiliser comme information suppl&eacute;mentaire
avant de jouer.

V&eacute;rifi&eacute; ind&eacute;pendamment en Node (`tests/engine.test.js`) :
parsing d'une ligne compl&egrave;te (cot&eacute;e/non cot&eacute;e/ScFi/Rapport
Pr&eacute;vu/SG/Arriv&eacute;e), colonnes G2/G3 vides ignor&eacute;es
(champs facultatifs), lignes sans num&eacute;ro de course exploitable
ignor&eacute;es, et les 4 cas de `niveauConfirmationExterne` (double, simple,
absente, `null` sans pr&eacute;diction).

## Rapports officiels PMU (Trio) et bilan financier

A la demande de l'utilisateur, la page **Resultat** (voir section
precedente) affiche un **bilan financier hypoth&eacute;tique**, calcul&eacute;
a partir des **rapports officiels PMU** (dividendes reellement pay&eacute;s)
plut&ocirc;t que d'une simple r&eacute;ussite/&eacute;chec :

- **Nouvel endpoint PMU** : `.../rapports-definitifs`, qui renvoie, une fois
  la course termin&eacute;e et les rapports mis en paiement, les dividendes
  officiels par type de pari (Simple Gagnant, Coupl&eacute; Gagnant, Trio...).
  Reutilise la m&ecirc;me cascade fiable que les cotes/arriv&eacute;es
  (fonction externe -> fonction Netlify -> acc&egrave;s direct -> proxies
  CORS), via la fonction `fetchRapportsPmu` (jamais d'exception, renvoie
  `null` en cas d'&eacute;chec reseau).
- **Extraction du Trio** (`extraireRapportsTrio`, `js/engine/pmuApi.js`) :
  *** Mise a jour *** (remplace `extraireRapportsCoupleGagnant` pour
  Course feu vert/Resultat, a la demande de l'utilisateur - m&ecirc;me
  structure, 3 num&eacute;ros par combinaison au lieu de 2) - privil&eacute;gie
  le type de pari "point de vente" (`TRIO`, la r&eacute;f&eacute;rence
  habituellement cit&eacute;e), et se replie sur la variante "internet"
  (`E_TRIO`) si absente. Renvoie un tableau vide si le PMU n'a ouvert
  aucun des deux (arrive encore sur certains tres petits champs, m&ecirc;me
  apres filtrage 8-16 partants, si des non-partants ram&egrave;nent le champ
  effectif sous le seuil requis par le PMU pour ce pari).
- **Bilan (`bilanTrioValue`, `js/app.js`)** : suppose **1&euro; jou&eacute;
  sur CHACUNE des 10 combinaisons Trio possibles** entre la Base et 2 des
  5 partenaires Value (mise 1€/combinaison choisie par l'utilisateur, pool
  toujours fixe pour le Trio Value avec base — pas de pool adaptatif ici,
  contrairement au Coupl&eacute; Value de la fiche course). Chaque
  combinaison (base + 2 partenaires) est compar&eacute;e **sans tenir
  compte de l'ordre** au rapport officiel (r&egrave;gle r&eacute;elle du
  pari "Trio" PMU, contrairement au "Trio Ordre"). Le bilan (mise, gains,
  net) est calcul&eacute; par course puis agr&eacute;g&eacute; sur toutes
  les courses feu vert du jour dont le rapport est disponible.
- **R&eacute;cup&eacute;ration manuelle** : un bouton "R&eacute;cup&eacute;rer
  les rapports" sur la page R&eacute;sultat d&eacute;clenche la
  r&eacute;cup&eacute;ration, course par course et de fa&ccedil;on
  s&eacute;quentielle (m&ecirc;me raison que la mise a jour des cotes pour
  toute la r&eacute;union : ne pas multiplier les requ&ecirc;tes
  simultan&eacute;es), pour toutes les courses feu vert dont l'arriv&eacute;e
  est connue mais dont le rapport n'a pas encore &eacute;t&eacute; demand&eacute;.
  Le r&eacute;sultat (m&ecirc;me un tableau vide, si le PMU n'a pas
  propos&eacute; le Trio) est **persist&eacute;** sur la course
  (`race.rapportTrio`) pour ne plus avoir a le re-demander a chaque
  ouverture de la page.
- **Affichage** : une carte "Bilan financier (hypoth&eacute;tique) Trio
  Value avec base" en haut de la page R&eacute;sultat (net global en gros,
  d&eacute;tail mise/gains, nombre de courses prises en compte), et un
  petit indicateur (net +/- en &euro;, ou "Trio indisponible"/"Rapport non
  r&eacute;cup&eacute;r&eacute;") sur chaque ligne de course.
- Le rapport officiel (combinaison gagnante reelle + dividende pour
  1&euro;), une fois connu, s'affiche aussi directement sur la page
  **Course feu vert** elle-m&ecirc;me, juste a c&ocirc;t&eacute; du tag
  "Trio Value" de chaque course (ex. "Rapport officiel : N&deg;6-N&deg;1-N&deg;9
  &rarr; 185,40&euro;") — pas besoin d'aller sur la page R&eacute;sultat pour
  le voir. N'apparait que si le rapport a deja &eacute;t&eacute;
  r&eacute;cup&eacute;r&eacute; (bouton "R&eacute;cup&eacute;rer les rapports",
  page R&eacute;sultat) ; rien ne s'affiche tant qu'il n'est pas connu.
  Fonction concernee : `rapportTrioHtml` (`js/app.js`).

**Important — a bien garder en t&ecirc;te :**
- C'est un bilan **hypoth&eacute;tique**, pas un historique de vos mises
  r&eacute;elles : il suppose que vous auriez jou&eacute; syst&eacute;matiquement
  les 10 combinaisons Trio (base + 2 des 5 partenaires) sur TOUTES les
  courses feu vert du jour, avec 1&euro; par combinaison. Si vous jouez
  diff&eacute;remment (montant different, sous-ensemble des combinaisons,
  pas toutes les courses feu vert...), ce chiffre ne refl&egrave;te pas
  votre resultat reel.
- Les courses o&ugrave; le PMU n'a pas propos&eacute; le Trio sont
  **exclues** du bilan (mise ET gain), puisqu'il aurait &eacute;t&eacute;
  impossible de placer ce pari dans la r&eacute;alit&eacute; — elles ne
  comptent donc ni comme une perte ni comme un gain.
- Purement indicatif et r&eacute;trospectif : n'ex&eacute;cute aucun pari,
  ne modifie aucun calcul de Score Global/Value/classement, et ne remplace
  pas votre propre jugement.
- **Fiabilit&eacute; de l'API** : comme pour les cotes et l'arriv&eacute;e,
  l'endpoint rapports-definitifs n'est ni document&eacute; ni officiellement
  autoris&eacute; par le PMU pour un usage tiers — m&ecirc;mes r&eacute;serves
  que partout ailleurs dans ce document.
- `extraireRapportsCoupleGagnant` (`js/engine/pmuApi.js`) reste disponible
  et test&eacute;e, mais n'est plus appel&eacute;e nulle part dans l'app
  depuis ce remplacement (le Coupl&eacute; Value de la fiche course
  n'affiche pas de rapport officiel r&eacute;cup&eacute;r&eacute;, seulement
  la fourchette th&eacute;orique - cf. section "Fourchette rapport").
- Si vous utilisez une **fonction externe** (Val Town, mini-site Netlify ou
  Cloudflare Worker), elle doit &ecirc;tre **mise a jour** avec le nouveau
  code (voir "Mise a jour v6" plus haut, section fonction externe) pour que
  la r&eacute;cup&eacute;ration des rapports passe par le chemin le plus
  fiable — sinon elle retombe automatiquement sur la fonction Netlify
  meme-origine puis l'ancienne cascade (moins fiable, notamment sur GitHub
  Pages).
- *** Correction (constat en usage reel) *** : le bouton "R&eacute;cup&eacute;rer
  les rapports" traite d&eacute;sormais chaque course dans son propre
  `try/catch`, avec une petite pause (400ms) entre deux courses. Avant ce
  correctif, une erreur inattendue sur UNE SEULE course (reseau, PMU,
  IndexedDB...) interrompait silencieusement toute la boucle sans message
  d'erreur visible : sur 3 courses testees, 1 seul rapport &eacute;tait
  r&eacute;cup&eacute;r&eacute; et les 2 suivantes n'&eacute;taient jamais
  m&ecirc;me tent&eacute;es (au lieu d'afficher un echec explicite pour
  chacune et de continuer). Le bouton ne redemande que les courses encore
  marqu&eacute;es "Rapport non r&eacute;cup&eacute;r&eacute;" : en cas
  d'&eacute;chec, un nouveau clic suffit a reessayer uniquement celles-ci.

### Correction : deux pools PMU distincts (national vs internet) pour un meme pari

*** Bug signal&eacute; par l'utilisateur *** : pour une course du 09/08/2026
(Trio arriv&eacute; 5-6-16), le rapport affich&eacute; par l'appli
(74,90&euro;) ne correspondait pas du tout &agrave; celui vu sur pmu.fr
(228,30&euro;) pour la MEME combinaison gagnante. Investigation avec
l'utilisateur (envoi de la r&eacute;ponse JSON brute de l'API PMU, puis
capture d'&eacute;cran de la page "Rapports d&eacute;finitifs" de pmu.fr) :

- L'endpoint `rapports-definitifs` expose en r&eacute;alit&eacute; **deux
  pools mutuels ind&eacute;pendants** pour un m&ecirc;me pari, avec des
  mises/gagnants/dividendes propres &agrave; chacun :
  - **sans param&egrave;tre** `specialisation` : pool **national** (types
    de pari sans pr&eacute;fixe, ex. `TRIO`, `COUPLE_GAGNANT`) — pour
    l'exemple ci-dessus, 74,90&euro; (66,96 gagnants).
  - **avec** `?specialisation=INTERNET` : pool **internet uniquement**
    (types de pari pr&eacute;fix&eacute;s `E_`, ex. `E_TRIO`,
    `E_COUPLE_GAGNANT`) — celui affich&eacute; sur la page "Rapports
    d&eacute;finitifs" de pmu.fr (onglet "e.Trio" etc.) pour un joueur en
    ligne — pour le m&ecirc;me exemple, 228,30&euro; (10 gagnants).
- L'appli ne faisait jusqu'ici **qu'un seul appel, sans ce param&egrave;tre**
  : elle ne voyait donc jamais le pool internet. Ce n'&eacute;tait pas un
  bug d'extraction (`extraireRapportsCoupleGagnant`/`extraireRapportsTrio`
  lisaient correctement le seul bloc disponible), mais un appel API
  incomplet — contrairement &agrave; ce qui &eacute;tait suppos&eacute;
  jusqu'ici (l'ancien commentaire du code affirmait, &agrave; tort, que
  l'appel sans param&egrave;tre renvoyait d&eacute;j&agrave; les deux
  pools).

**Correctif** (l'utilisateur joue en ligne sur pmu.fr) :

- `fetchRapportsPmu` (`js/engine/pmuApi.js`) appelle d&eacute;sormais les
  **deux pools en parall&egrave;le** (national + internet) et **fusionne**
  les deux r&eacute;ponses en un seul tableau. Si un seul des deux pools
  r&eacute;pond (panne r&eacute;seau partielle sur l'autre), le r&eacute;sultat
  de celui qui a r&eacute;ussi est quand m&ecirc;me renvoy&eacute; ; `null`
  uniquement si les deux &eacute;chouent (m&ecirc;me garantie "ne l&egrave;ve
  jamais d'exception" qu'avant).
- `extraireRapportsCoupleGagnant`/`extraireRapportsTrio` privil&eacute;gient
  d&eacute;sormais le bloc **internet** (`E_...`) sur le national, puisque
  c'est celui qui correspond &agrave; ce que l'utilisateur voit/gagne
  r&eacute;ellement en jouant sur pmu.fr ; repli sur le national si le bloc
  internet est absent de la r&eacute;ponse (ex. pari non ouvert en ligne
  pour cette course).
- **Garde-fou** : si votre **fonction externe** (Val Town, mini-site
  Netlify ou Cloudflare Worker — voir "Mise a jour v6" plus haut) ou la
  fonction Netlify m&ecirc;me-origine n'ont pas encore &eacute;t&eacute;
  red&eacute;ploy&eacute;es avec le code mis &agrave; jour, elles
  **ignorent** le nouveau param&egrave;tre `specialisation` et renvoient
  quand m&ecirc;me le pool national avec succ&egrave;s (r&eacute;ponse
  valide en apparence, mais fausse pour la demande "internet"). L'appli
  d&eacute;tecte ce cas (aucun type de pari pr&eacute;fix&eacute; `E_` dans
  une r&eacute;ponse non vide alors que le pool internet &eacute;tait
  demand&eacute;) et **continue automatiquement la cascade** jusqu'&agrave;
  l'acc&egrave;s direct/un proxy CORS, qui utilisent l'URL PMU r&eacute;elle
  avec le param&egrave;tre d&eacute;j&agrave; int&eacute;gr&eacute; dans la
  cha&icirc;ne — donc toujours corrects, m&ecirc;me sans red&eacute;ploiement.
  **Recommand&eacute; n&eacute;anmoins** : mettez &agrave; jour votre
  fonction externe (recopier `cloudflare-worker/pmu-cotes.js` mis &agrave;
  jour dans votre projet Val Town, ou `netlify/functions/pmu-cotes.js` si
  vous utilisez Netlify) pour rester sur le chemin le plus fiable de la
  cascade plut&ocirc;t que le repli.
- Si vous jouez plut&ocirc;t **au guichet** (point de vente physique) :
  le pool pertinent pour vous est le national, pas l'internet. Ce choix de
  priorit&eacute; n'est pas configurable dans l'interface pour l'instant —
  faites-le savoir si vous en avez besoin.

V&eacute;rifi&eacute; sur les vraies donn&eacute;es PMU de cette course
(09/08/2026, R3C1, Trio 5-6-16) : `extraireRapportsTrio` appliqu&eacute; au
tableau fusionn&eacute; (bloc `TRIO` national + bloc `E_TRIO` internet,
r&eacute;cup&eacute;r&eacute;s s&eacute;par&eacute;ment via l'API PMU
r&eacute;elle) renvoie bien `{ numeros: [5, 6, 16], dividende: 228.3 }` —
la valeur exacte affich&eacute;e par pmu.fr. Tests automatis&eacute;s mis
&agrave; jour en cons&eacute;quence (priorit&eacute; invers&eacute;e,
fusion de 2 appels, garde-fou "specialisation ignor&eacute;e").

### Correctif (aout 2026, suite) : Val Town ignorait le param&egrave;tre `specialisation` (retombait silencieusement sur le national)

*** Nouveau bug signal&eacute; par l'utilisateur *** : m&ecirc;me apr&egrave;s
le correctif ci-dessus, deux nouveaux &eacute;carts constat&eacute;s le
10/08/2026 entre le Coupl&eacute; Gagnant r&eacute;cup&eacute;r&eacute; par
l'appli et celui affich&eacute; sur pmu.fr (R2C4 Enghien : 26,20&euro;
r&eacute;cup&eacute;r&eacute; contre 22,90&euro; sur pmu.fr ; R5C6 :
6&euro; r&eacute;cup&eacute;r&eacute; contre 8&euro; sur pmu.fr) — dans les
deux cas, la valeur du pool **national** au lieu de celle du pool
**internet**.

Cause trouv&eacute;e : `val-town/pmu-cotes.ts` (le code &agrave; copier/coller
dans votre val, voir "Etape 1" plus haut) n'avait **jamais &eacute;t&eacute;
mis &agrave; jour** lors du correctif pr&eacute;c&eacute;dent — contrairement
&agrave; `netlify/functions/pmu-cotes.js` et `cloudflare-worker/pmu-cotes.js`.
Il lisait bien le param&egrave;tre `specialisation` mais ne l'ajoutait jamais
&agrave; l'URL appel&eacute;e c&ocirc;t&eacute; PMU : votre fonction Val Town
renvoyait donc toujours le pool national, m&ecirc;me quand l'appli demandait
express&eacute;ment l'internet. Le garde-fou c&ocirc;t&eacute; appli
d&eacute;tecte bien ce cas et essaie de poursuivre la cascade (proxy CORS
public), mais ces proxies se sont r&eacute;v&eacute;l&eacute;s peu fiables en
pratique (voir plus haut) — d'o&ugrave; le repli silencieux sur le national
observ&eacute;.

**Correctif** : `val-town/pmu-cotes.ts` relaie d&eacute;sormais bien
`specialisation` vers l'API PMU, exactement comme les deux autres fonctions.

**Action de votre c&ocirc;t&eacute; (indispensable)** : si vous utilisez Val
Town comme fonction externe, ouvrez votre val existant sur
https://www.val.town, effacez tout son contenu et recollez celui, mis
&agrave; jour, de `val-town/pmu-cotes.ts` (inclus dans ce zip), puis
sauvegardez (Ctrl+S). Sans ce red&eacute;ploiement manuel, le bug persiste
c&ocirc;t&eacute; PMU (le code source du zip ne suffit pas &agrave; lui seul,
Val Town ex&eacute;cute la version que VOUS y avez coll&eacute;e).

V&eacute;rifi&eacute; sur les deux courses signal&eacute;es (donn&eacute;es
PMU r&eacute;elles, appel direct des deux pools) : R2C4 Enghien
(10/08/2026) — national 26,20&euro; vs internet (`E_COUPLE_GAGNANT`)
22,90&euro; (= pmu.fr) ; R5C6 — national 6,00&euro; vs internet 8,00&euro;
(= pmu.fr). Par ailleurs, contr&ocirc;le crois&eacute; de 5 entr&eacute;es de
l'&eacute;chantillonnage r&eacute;el utilis&eacute; pour le ROI &agrave; 8
mois (section pr&eacute;c&eacute;dente) : toutes correspondent bien &agrave;
la valeur internet/pmu.fr, y compris R5C6 elle-m&ecirc;me (8,00&euro;
enregistr&eacute; = valeur pmu.fr) — les chiffres de ROI d&eacute;j&agrave;
publi&eacute;s restent donc valides, seule la fonction Val Town
d&eacute;ploy&eacute;e &eacute;tait en cause, pas la m&eacute;thode
d'&eacute;chantillonnage.

Sw.js passe en v41.

## Mise a jour aout 2026 (8) : suppression de 3 cartes, nouveau "Jeu Simple Gagnant" (mise Dutching, N dynamique)

A la demande de l'utilisateur, la fiche course est simplifiee et un nouveau
pari est ajoute dans le prolongement du Conseil de jeu.

### Suppression

Trois cartes retirees de la fiche course (fonctions et donnees associees
retirees de `js/app.js`, sauf lorsque reutilisees ailleurs) :

- **"Course fiable"** (`estCourseFiable`, `bonusCourseFiable`,
  `courseFiableHtml`, `noteCoherenceCourseFiableHtml`).
- **"Suggestion Coupl&eacute; Gagnant (5 chevaux max)"** (`candidatsCombinaison`,
  `suggestionCoupleGagnantHtml`).
- **"Trio Value (avec base)"** — uniquement la carte d'affichage
  (`trioValueAvecBaseHtml`). La fonction sous-jacente `trioValueAvecBase`
  (choix de la meilleure Base tres solide + 5 partenaires Value) est
  **conserv&eacute;e** : elle reste le moteur de la page "Top base"/"R&eacute;sultat"
  (`renderCourseFeuVert`, `renderResultatJournee`, `baseReussie`,
  `bilanSimpleBase`), qui n'est pas concern&eacute;e par cette suppression.
  `TRIO_VALUE_STATS`/`TRIO_ADAPTATIF_NIVEAUX` restent utilis&eacute;s comme
  libell&eacute; de confiance sur cette m&ecirc;me page "Top base".

Les 3 sections de documentation historiques plus haut dans ce fichier
("Trio Value (avec base)", "Course feu vert et R&eacute;sultat...", etc.)
restent en place a titre d'historique des d&eacute;cisions, m&ecirc;me si la
carte "Trio Value (avec base)" de la fiche course n'existe plus.

### Nouveau : "Jeu Simple Gagnant" (m&eacute;thode Dutching, N dynamique)

Nouveau fichier `js/engine/jeuSimpleGagnant.js` (fonctions pures,
test&eacute;es unitairement), affich&eacute; juste apr&egrave;s la carte
"Conseil de jeu" sur la fiche course.

**Principe** : plut&ocirc;t que jouer un nombre fixe de chevaux, l'app
d&eacute;termine, **pour CHAQUE course**, le nombre optimal de chevaux
(N, de 2 &agrave; 8) &agrave; jouer en Simple Gagnant selon les cotes
r&eacute;elles du jour :

1. On prend les chevaux du classement (Score Global) ayant une cote
   r&eacute;elle connue (`cotePourAffichage`), tri&eacute;s par classement.
2. Pour chaque N de 2 &agrave; 8 (limit&eacute; au nombre de chevaux cot&eacute;s
   disponibles), on calcule le rendement Dutching des N premiers :
   `S = somme(1/cote_i)`, `rendement = 1/S`.
3. On compare ce rendement au seuil de rentabilit&eacute; mesur&eacute; sur le
   backtest r&eacute;el (voir ci-dessous) et on retient le **plus grand** N
   dont le rendement d&eacute;passe son seuil (maximise la couverture tout en
   restant rentable d'apr&egrave;s le backtest).
4. Si aucun N (2 &agrave; 8) ne d&eacute;passe son seuil : "Jeu simple gagnant
   non rentable" est affich&eacute;, aucune mise n'est propos&eacute;e.

**Origine des seuils** (voir aussi "R&eacute;ussite gagnante par rang de
classement" plus haut dans les &eacute;changes avec l'utilisateur, backtest
8 mois, jan-11 ao&ucirc;t 2026, 7437 courses) : la r&eacute;ussite cumul&eacute;e
(probabilit&eacute; qu'un des N premiers du classement gagne r&eacute;ellement)
est de 26,2% / 45,4% / 60,8% / 71,4% / 79,4% / 84,7% / 89,1% / 92,6% pour
N=1 &agrave; 8. Le seuil de rentabilit&eacute; = 1/r&eacute;ussite cumul&eacute;e :

| N | Seuil |
|---|---|
| 2 | 220% |
| 3 | 165% |
| 4 | 140% |
| 5 | 126% |
| 6 | 118% |
| 7 | 112% |
| 8 | 108% |

N=1 est volontairement exclu (pas de seuil) : sur le m&ecirc;me backtest, le
rapport moyen r&eacute;el obtenu en jouant seulement le 1er (315%, donn&eacute;es
PMU r&eacute;elles) reste **en dessous** de son seuil th&eacute;orique (381%) —
jouer un seul cheval n'est jamais rentable en pratique sur cet
&eacute;chantillon, contrairement &agrave; partir de N=2 o&ugrave; le rapport
moyen r&eacute;el d&eacute;passe largement le seuil (jusqu'&agrave; 674% pour un
seuil de 108% sur le top 8).

**Mise (m&eacute;thode Dutching)** : une fois N d&eacute;termin&eacute; pour la
course, l'utilisateur choisit une mise totale souhait&eacute;e dans un menu
d&eacute;roulant (10/20/30/50/75/100/150/200&euro;) et clique "Calculer
mises". Formule (fournie par l'utilisateur) : `mise_i = M x (1/cote_i) / S`.
Cette formule garantit mathematiquement que la somme des mises vaut
exactement M, et que le gain est **identique** quel que soit celui des N
chevaux qui gagne (`gain = M / S` pour chacun) — c'est le principe du
Dutching. *Remarque* : l'exemple chiffr&eacute; fourni par l'utilisateur
(cotes 3,0/5,0/6,0/8,0, mise totale 100&euro;) affichait des mises l&eacute;g&egrave;rement
diff&eacute;rentes (38,71&euro;/23,23&euro;/19,35&euro;/14,52&euro;, gain 116,13&euro;) de
celles recalcul&eacute;es avec la formule telle qu'&eacute;crite
(40,40&euro;/24,24&euro;/20,20&euro;/15,15&euro;, gain 121,21&euro;, qui est la seule
r&eacute;partition dont la somme vaut exactement 100&euro; avec S=0,8250) — l'app
applique la formule telle qu'&eacute;crite ; &agrave; signaler si un autre calcul
&eacute;tait vis&eacute;.

Tests unitaires (`tests/engine.test.js`) : non rentable si moins de 2
chevaux cot&eacute;s, aucun N ne d&eacute;passe son seuil, s&eacute;lection du plus grand
N rentable, arr&ecirc;t &agrave; un N interm&eacute;diaire si les N sup&eacute;rieurs
repassent sous leur seuil, chevaux sans cote exclus du pool, r&eacute;partition
Dutching (mises + gain identique), cas mise invalide.

Sw.js passe en v42.

## Mise a jour aout 2026 (9) : surveillance automatique "Jeu Simple Gagnant" (H-3min)

A la demande de l'utilisateur, ajout d'une surveillance automatique, active
tant que l'appli reste ouverte au premier plan : elle verifie les cotes de
chaque course du jour 3 minutes avant son depart theorique, recalcule le
Jeu Simple Gagnant (voir section precedente), et envoie une notification si
un N rentable est trouve.

### Fonctionnement

Nouveau fichier `js/engine/surveillance.js` (logique temporelle pure,
testee unitairement) + orchestration dans `js/app.js` :

- Une carte "Surveillance auto - Jeu Simple Gagnant" apparait en haut de
  l'onglet "R&eacute;unions", avec un bouton "Activer la surveillance" qui
  demande la permission de notification au navigateur.
- Une fois active, un minuteur v&eacute;rifie toutes les 20 secondes
  l'ensemble des courses des r&eacute;unions **du jour m&ecirc;me**
  (`estAujourdHui`) qui n'ont pas encore d'arriv&eacute;e enregistr&eacute;e.
- D&egrave;s qu'une course entre dans la fen&ecirc;tre "0 &agrave; 3 minutes
  avant son heure de d&eacute;part th&eacute;orique"
  (`estDansFenetreAvantDepart`, `heureDepart` du CSV import&eacute;), l'appli
  r&eacute;cup&egrave;re automatiquement ses cotes PMU en direct (m&ecirc;me
  m&eacute;canisme que le bouton "Mettre a jour les cotes en direct"),
  recalcule le classement et le Jeu Simple Gagnant, et envoie une
  notification navigateur si un N rentable est trouv&eacute; (cliquer dessus
  ouvre directement la fiche course).
- Chaque course n'est v&eacute;rifi&eacute;e **qu'une seule fois** (flag
  `notifieJsg` persist&eacute; sur la course en IndexedDB) : pas de requ&ecirc;te
  ni de notification r&eacute;p&eacute;t&eacute;e &agrave; chaque cycle de 20s
  pendant les 3 minutes de fen&ecirc;tre.
- L'&eacute;tat actif/inactif est m&eacute;moris&eacute; (`localStorage`) et
  repris automatiquement au rechargement de la page, &agrave; condition que
  la permission de notification soit d&eacute;j&agrave; accord&eacute;e (pas
  de nouvelle demande sans geste utilisateur).

### Limites importantes (a lire avant utilisation)

- **Appli ouverte obligatoire.** Le minuteur est un simple `setInterval`
  JavaScript : si l'onglet/l'appli passe en arri&egrave;re-plan (&eacute;cran
  verrouill&eacute;, autre appli au premier plan sur mobile), le syst&egrave;me
  d'exploitation suspend les minuteurs JS et la v&eacute;rification ne se
  d&eacute;clenche plus de fa&ccedil;on fiable. Il n'y a pas d'infrastructure
  de "vraie" notification en arri&egrave;re-plan (Web Push serveur) dans
  cette appli statique sans backend.
- **Non disponible sur iPhone/iPad (Safari).** Test&eacute; et confirm&eacute; :
  Safari sur iOS n'impl&eacute;mente pas les notifications locales
  (`new Notification()`) pour les pages web - l'objet `Notification` existe
  par compatibilit&eacute; mais la cr&eacute;ation d'une notification &eacute;choue
  silencieusement, sans erreur ni affichage. Seul le Web Push (n&eacute;cessite
  un abonnement push + un serveur qui d&eacute;clenche l'envoi au bon moment -
  bien plus lourd &agrave; mettre en place, comparable &agrave; ajouter un
  vrai backend planificateur) permettrait des notifications sur iPhone,
  m&ecirc;me appli ferm&eacute;e. L'appli d&eacute;tecte iOS (`estIOS`, via
  `navigator.userAgent` + repli iPadOS "MacIntel" tactile) et affiche un
  message explicite plut&ocirc;t qu'un bouton "Activer" qui ne ferait rien
  de visible. **La fonctionnalit&eacute; est donc r&eacute;serv&eacute;e au PC**
  (Chrome, Edge, Firefox) pour le moment.

Tests unitaires (`tests/engine.test.js`) : parsing `minutesDepuisMinuit`
(formats HHhMM/HH:MM/HH.MM, objet Date, valeurs invalides), fen&ecirc;tre
`estDansFenetreAvantDepart` (bornes 0 et 3 minutes, avant/apr&egrave;s,
heure absente), `estAujourdHui` (comparaison de jour civil, date invalide).

Sw.js passe en v43.

## Mise a jour aout 2026 (10) : mises Jeu Simple Gagnant arrondies a l'euro

A la demande de l'utilisateur, les mises calcul&eacute;es par le Jeu Simple
Gagnant (`js/engine/jeuSimpleGagnant.js`, fonction `misesJeuSimpleGagnant`)
sont d&eacute;sormais **arrondies &agrave; l'euro le plus proche**, pour
rester directement jouables au guichet/en ligne PMU (qui n'accepte pas les
centimes sur ce type de pari).

M&eacute;thode "au plus fort reste" : chaque mise brute (formule Dutching
inchang&eacute;e, `M x (1/cote_i) / S`) est d'abord arrondie &agrave; l'euro
inf&eacute;rieur, puis les euros manquants pour retomber exactement sur la
mise totale choisie sont distribu&eacute;s aux chevaux dont la partie
d&eacute;cimale arrondie &eacute;tait la plus grande. Cons&eacute;quence :
la somme des mises reste **toujours exactement &eacute;gale** &agrave; la
mise totale s&eacute;lectionn&eacute;e, mais le gain (mise_i x cote_i) n'est
plus rigoureusement identique pour tous les chevaux du pool (l'&eacute;cart
reste minime, quelques euros au plus) - contrairement au calcul non
arrondi utilis&eacute; jusqu'ici. L'affichage montre d&eacute;sormais le gain
propre &agrave; chaque cheval (et la fourchette min/max), plut&ocirc;t
qu'un gain unique suppos&eacute; identique.

Exemple repris de la section pr&eacute;c&eacute;dente (cotes 3/5/6/8, mise
totale 100&euro;) : mises brutes 40,40 / 24,24 / 20,20 / 15,15 &rarr;
arrondies 41 / 24 / 20 / 15 (somme 100&euro;), gains 123 / 120 / 120 / 120&euro;.

Tests unitaires mis &agrave; jour (`tests/engine.test.js`) : exemple ci-dessus
avec valeurs arrondies exactes, + test g&eacute;n&eacute;rique v&eacute;rifiant
que la somme des mises arrondies reste toujours exactement &eacute;gale
&agrave; la mise totale, sur plusieurs jeux et l'ensemble des mises totales
propos&eacute;es (10 &agrave; 200&euro;).

Sw.js passe en v44.

## Mise a jour aout 2026 (11) : seuils Jeu Simple Gagnant par tranche de confiance

A la demande de l'utilisateur, la grille de seuils de rentabilit&eacute; du
Jeu Simple Gagnant (jusqu'ici unique, cf. section pr&eacute;c&eacute;dente)
est remplac&eacute;e par 3 grilles distinctes selon l'indice de confiance de
la course (score de configuration Coupl&eacute; Value, 0-5, cf.
`scoreConfigurationCoupleValue` dans app.js).

### Pourquoi

L'utilisateur a demand&eacute; si la r&eacute;ussite de chaque rang du
classement variait selon le nombre de partants et l'indice de confiance
(m&ecirc;me backtest 8 mois, 7437 courses). R&eacute;ponse : tr&egrave;s
nettement pour la confiance, ex. rang 1 seul : 17,6% en confiance faible
(score 0-1) contre 35,6% en confiance forte (score 4-5) - un facteur 2.
Appliquer un seuil unique &agrave; toutes les courses &eacute;tait donc soit
trop laxiste (courses &agrave; faible confiance : le mod&egrave;le pouvait
dire "rentable" alors que le classement &eacute;tait en r&eacute;alit&eacute;
moins fiable que la moyenne), soit trop strict (courses &agrave; forte
confiance : des jeux r&eacute;ellement tr&egrave;s rentables pouvaient
&ecirc;tre rejet&eacute;s &agrave; tort).

### Nouvelle grille

Recalcul&eacute;e s&eacute;par&eacute;ment par tranche (faible = score 0-1,
moyenne = score 2-3, forte = score 4-5), toujours 1 / r&eacute;ussite
cumul&eacute;e, et toujours v&eacute;rifi&eacute;e sur le rapport Simple
Gagnant R&Eacute;EL (colonne SG des fichiers Predictions) - dans les 3
tranches, le rapport r&eacute;el d&eacute;passe bien le seuil th&eacute;orique
&agrave; partir de N=2 :

| N | Faible (0-1) | Moyenne (2-3) | Forte (4-5) |
|---|---|---|---|
| 2 | 303% | 216% | 168% |
| 3 | 217% | 158% | 134% |
| 4 | 171% | 135% | 122% |
| 5 | 147% | 122% | 114% |
| 6 | 130% | 116% | 109% |
| 7 | 122% | 111% | 105% |
| 8 | 116% | 108% | 102% |

N=1 reste exclu dans les 3 tranches : m&ecirc;me en confiance forte, le
rapport r&eacute;el moyen (248%) reste sous le seuil th&eacute;orique
(281%) - jouer un seul cheval n'est jamais rentable en pratique. La tranche
"moyenne" retombe presque exactement sur l'ancienne grille unique
(220/165/140/126/118/112/108%), coh&eacute;rent puisqu'elle repr&eacute;sente
&agrave; elle seule pr&egrave;s de la moiti&eacute; de l'&eacute;chantillon
(3590 courses sur 7437) et tirait donc d&eacute;j&agrave; la moyenne globale
vers elle.

### Implementation

`js/engine/jeuSimpleGagnant.js` : `SEUILS_RENDEMENT_SIMPLE_GAGNANT` devient
un objet &agrave; 3 tranches (au lieu d'une grille plate) ;
`trancheConfiance(scoreConfiance)` convertit un score 0-5 en tranche
('faible'/'moyenne'/'forte'), un score absent/inconnu retombant sur
"moyenne" par d&eacute;faut. `jeuSimpleGagnant(chevaux, scoreConfiance)`
prend d&eacute;sormais un 2e param&egrave;tre et choisit la grille
correspondante ; le r&eacute;sultat inclut d&eacute;sormais `tranche` en
plus de `n`/`s`/`rendement`/`seuil`.

`js/app.js` : le score de confiance (d&eacute;j&agrave; calcul&eacute; via
`scoreConfigurationCoupleValue(bd, chevaux)` pour d'autres fonctionnalit&eacute;s)
est maintenant aussi transmis &agrave; `jeuSimpleGagnant`/`jeuSimpleGagnantHtml`/
`bindJeuSimpleGagnant`, sur la fiche course ET dans la surveillance
automatique (`verifierEtNotifierCourse`, cf. section pr&eacute;c&eacute;dente
- calcule d&eacute;sormais aussi `calculerBasesEtDangers` avant d'appeler
`jeuSimpleGagnant`). La carte "Jeu Simple Gagnant" affiche d&eacute;sormais
la tranche de confiance utilis&eacute;e ("minimum requis ... en confiance
faible/moyenne/forte").

Tests unitaires (`tests/engine.test.js`) : mapping `trancheConfiance`
(bornes 0-1/2-3/4-5, null/undefined -> moyenne par d&eacute;faut), et un cas
concret o&ugrave; le M&Ecirc;ME jeu de cotes (exemple 3/5/6/8) passe de non
rentable (faible et moyenne) &agrave; rentable (forte, N=3) selon la seule
tranche de confiance fournie.

Sw.js passe en v45.

## Bilan Simple Gagnant (remplace l'onglet "Couple rentable")

La page "Couple rentable" est retir&eacute;e (son signal de ROI &eacute;tait
retomb&eacute; &agrave; peine positif, cf. sections pr&eacute;c&eacute;dentes
devenues obsol&egrave;tes) et remplac&eacute;e par une nouvelle page "Bilan
Simple Gagnant", accessible depuis l'onglet "Simple Gagnant" (menu du bas).
Elle liste, pour la journ&eacute;e en cours, toutes les courses o&ugrave; le
Jeu Simple Gagnant &eacute;tait d&eacute;tect&eacute; rentable, avec pour
chacune : heure, hippodrome, tranche de confiance, nombre de chevaux jou&eacute;s
(N), et - d&egrave;s que l'arriv&eacute;e est connue - le r&eacute;sultat
(vainqueur captur&eacute; ou non) et le bilan financier (mise / gain / net).
En bas de page, un bilan global cumule mise/gain/net sur toutes les courses
d&eacute;j&agrave; connues de la journ&eacute;e.

Le badge "Jeu conseill&eacute;" et la liste `PROFILS_RENTABLES_COUPLE_VALUE`
utilis&eacute;s sur la carte Coupl&eacute; Value de la fiche course sont
INCHANG&Eacute;S (ind&eacute;pendants de la page retir&eacute;e).

### Hypoth&egrave;se de mise

Le bilan suppose une mise totale hypoth&eacute;tique de 10&euro; par course
(r&eacute;partie en Dutching sur les N chevaux retenus, cf.
`MISE_STANDARD_BILAN_SIMPLE_GAGNANT` dans `js/app.js`) - ce n'est pas un
historique des mises r&eacute;ellement jou&eacute;es, juste une base de
comparaison constante pour chiffrer le bilan du jour.

### Recuperation des rapports officiels

Comme pour la page "Top base", le bilan d'une course captur&eacute;e a besoin
du rapport Simple Gagnant officiel PMU pour calculer le gain r&eacute;el (le
dividende n'est pas connu tant qu'il n'est pas r&eacute;cup&eacute;r&eacute;).
Un bouton "R&eacute;cup&eacute;rer les rapports" d&eacute;clenche les appels
PMU (avec un d&eacute;lai entre chaque course pour ne pas surcharger l'API) et
stocke le r&eacute;sultat dans `race.rapportSimpleGagnant` /
`race.rapportSimplePlace` - ces champs &eacute;tant d&eacute;j&agrave;
utilis&eacute;s par la page "Top base", un rapport r&eacute;cup&eacute;r&eacute;
sur l'une des deux pages est directement r&eacute;utilis&eacute; par l'autre
(pas de double appel PMU pour la m&ecirc;me course).

- Vainqueur hors du pool retenu : mise perdue, bilan connu imm&eacute;diatement
  (pas besoin du rapport).
- Vainqueur dans le pool mais rapport pas encore r&eacute;cup&eacute;r&eacute;
  ou dividende absent du rapport : bilan affich&eacute; "en attente".
- Vainqueur dans le pool et dividende connu : gain = mise du cheval vainqueur
  x son dividende officiel (rapport pour 1&euro;).

### Implementation

`js/engine/jeuSimpleGagnant.js` : nouvelle fonction
`bilanJeuSimpleGagnant(jeu, miseTotale, rapportReel, vrai1)` couvrant les 3 cas
ci-dessus, avec un indicateur `dividendeConnu` distinct de `gagne`. 5 nouveaux
tests unitaires (`tests/engine.test.js`, 108/108 tests OK).

`js/app.js` : `collecterCandidatesSimpleGagnant()` parcourt toutes les courses
du jour et retient celles dont `jeuSimpleGagnant(...).rentable` est vrai ;
`renderBilanSimpleGagnant()` construit la liste + le bilan global. Suppression
de tout le code sp&eacute;cifique &agrave; "Couple rentable"
(`profilCoupleRentable`, `collecterCandidatesCoupleRentable`,
`renderCoupleRentable`, `rapportCoupleCorrespondant`,
`extraireRapportsCoupleGagnant`).

Sw.js passe en v46.

### Tranche de confiance visible a cote du titre (couleur)

Le titre "Jeu Simple Gagnant" (carte de la fiche course) affiche d&eacute;sormais
la tranche de confiance entre parenth&egrave;ses juste &agrave; c&ocirc;t&eacute;,
en couleur : "(confiance faible)" en orange, "(confiance moyenne)" en bleu,
"(confiance forte)" en vert - m&ecirc;mes couleurs `.tag-*` que le reste de
l'appli. Nouvelle fonction `trancheConfianceBadgeHtml(tranche)` dans
`js/app.js`.

Sw.js passe en v47.

### Minimum de 4 chevaux en confiance faible

En confiance faible, le classement Score Global est moins fiable ; jouer
seulement 2 ou 3 chevaux dans ce cas concentre trop le risque sur un
classement douteux. `jeuSimpleGagnant` (`js/engine/jeuSimpleGagnant.js`)
impose donc d&eacute;sormais un minimum de 4 chevaux jou&eacute;s pour la
tranche faible (contre 2 pour moyenne/forte, inchang&eacute;) : les seuils
N=2 et N=3 de la grille faible ne sont plus test&eacute;s du tout, m&ecirc;me
si le rendement les d&eacute;passerait individuellement (`MIN_N_PAR_TRANCHE`).
Si N=4 (ou plus) ne d&eacute;passe pas son seuil, la course reste non
rentable. 2 nouveaux tests unitaires (`tests/engine.test.js`, 110/110 tests
OK). Message d'explication de la carte "Jeu Simple Gagnant" (fiche course)
adapt&eacute; en cons&eacute;quence quand non rentable en confiance faible.

Sw.js passe en v48.

## Bilan Global Simple Gagnant (historique manuel par jour)

Nouvelle page "Bilan Global Simple Gagnant", accessible depuis la page
"Simple Gagnant" via le bouton "Voir le bilan global (historique par jour)".
Elle conserve, jour apr&egrave;s jour, le bilan du Jeu Simple Gagnant : date,
r&eacute;ussite (vainqueur captur&eacute; / courses avec r&eacute;sultat
connu), bilan financier (mise/gain/net) et rendement (gain/mise) de chaque
jour, ainsi que le bilan CUMUL&Eacute; jour apr&egrave;s jour (progression
dans le temps) et un total g&eacute;n&eacute;ral en haut de page.

### Alimentation manuelle

Contrairement aux autres pages (qui recalculent tout &agrave; la vol&eacute;e
&agrave; partir des r&eacute;unions actuellement import&eacute;es), cette
page est aliment&eacute;e MANUELLEMENT : sur la page "Simple Gagnant", une
fois le bilan financier du jour calculable (au moins une course avec
r&eacute;sultat connu), un bouton "Transfert bilan" appara&icirc;t et
enregistre l'instantan&eacute; du jour (date du jour du transfert, nombre de
courses avec r&eacute;sultat, nombre de vainqueurs captur&eacute;s, mise/gain/
net) dans un nouveau magasin IndexedDB `bilansJournaliersSimpleGagnant`
(cl&eacute; = date, un nouveau transfert le m&ecirc;me jour remplace le
pr&eacute;c&eacute;dent - utile pour corriger apr&egrave;s avoir
r&eacute;cup&eacute;r&eacute; des rapports suppl&eacute;mentaires). Si des
courses captur&eacute;es sont encore en attente de rapport officiel au moment
du transfert, un avertissement pr&eacute;vient que le bilan sera partiel.
Cette page reste consultable m&ecirc;me apr&egrave;s avoir vid&eacute; les
r&eacute;unions import&eacute;es (bouton "Vider les r&eacute;unions
import&eacute;es", onglet Importer) : c'est le seul endroit o&ugrave; le
suivi financier survit d'un jour sur l'autre. Chaque jour peut &ecirc;tre
supprim&eacute; individuellement (bouton "Suppr.", avec confirmation) en cas
d'erreur de transfert.

### Implementation

`js/db.js` : nouveau magasin `bilansJournaliersSimpleGagnant` (DB_VERSION 3),
avec `saveBilanJournalierSimpleGagnant`, `getAllBilansJournaliersSimpleGagnant`,
`deleteBilanJournalierSimpleGagnant`, inclus dans l'export/import complet
(sauvegarde manuelle).

`js/engine/jeuSimpleGagnant.js` : `rendementBilan(bilan)` (gain/mise, null si
mise nulle) et `cumulerBilansJournaliers(bilans)` (trie par date croissante,
calcule le cumul mise/gain/net jour apr&egrave;s jour) - fonctions pures,
test&eacute;es unitairement (`tests/engine.test.js`, 113/113 tests OK).

`js/app.js` : bouton "Transfert bilan" (page Bilan Simple Gagnant), nouvelle
route `bilanglobalsimplegagnant` / `renderBilanGlobalSimpleGagnant()`
(rattach&eacute;e &agrave; l'onglet "Simple Gagnant" dans la barre
d'onglets).

Sw.js passe en v49.

### Correctif : le lien vers le bilan global disparaissait apres "Vider les reunions"

Le bilan global lui-m&ecirc;me n'a JAMAIS &eacute;t&eacute; effac&eacute; par
"Vider les r&eacute;unions import&eacute;es" (`resetReunions()` ne touche que
les magasins `meetings`/`races`/`horses`, jamais
`bilansJournaliersSimpleGagnant`). Mais le bouton "Voir le bilan global"
n'&eacute;tait affich&eacute; que si au moins une r&eacute;union &eacute;tait
import&eacute;e : juste apr&egrave;s avoir vid&eacute; les r&eacute;unions,
la page "Simple Gagnant" tombait sur son tout premier &eacute;tat vide
("Aucune r&eacute;union import&eacute;e") SANS ce bouton, donnant
l'impression trompeuse que l'historique avait disparu alors qu'il &eacute;tait
toujours intact en base. Le bouton est d&eacute;sormais affich&eacute; sur
les 3 &eacute;tats de la page "Simple Gagnant" (aucune r&eacute;union, aucune
course rentable, liste normale), avec un rappel explicite que "Vider les
r&eacute;unions import&eacute;es" ne touche jamais au bilan global.

Sw.js passe en v50.

### Correctif : le transfert utilisait la date du jour reel, pas celle des reunions

Bug : "Transfert bilan" enregistrait toujours l'entree sous la date DU JOUR
REEL o&ugrave; le bouton &eacute;tait cliqu&eacute; (`new Date()`), au lieu de
la date DES R&Eacute;UNIONS concern&eacute;es (`meeting.date`). Cons&eacute;quence :
en transf&eacute;rant le bilan de plusieurs journ&eacute;es d'archive
diff&eacute;rentes le m&ecirc;me jour r&eacute;el (ex. rattraper plusieurs
journ&eacute;es pass&eacute;es d'affil&eacute;e), chaque nouveau transfert
&eacute;crasait le pr&eacute;c&eacute;dent - un seul et m&ecirc;me id (la date
du jour r&eacute;el) &eacute;tait utilis&eacute; pour toutes.

Corrig&eacute; : la date du transfert est d&eacute;sormais calcul&eacute;e &agrave;
partir de `meeting.date` des courses effectivement incluses dans le bilan
(comme le fait d&eacute;j&agrave; "R&eacute;cup&eacute;rer les rapports"). Le
bouton affiche maintenant la date qui sera enregistr&eacute;e ("Transfert
bilan (AAAA-MM-JJ)"). Si les courses avec bilan proviennent de plusieurs
jours diff&eacute;rents en m&ecirc;me temps (r&eacute;unions de plusieurs
journ&eacute;es import&eacute;es sans avoir &eacute;t&eacute; vid&eacute;es
entre les deux), le transfert est d&eacute;sactiv&eacute; avec un message
explicite plut&ocirc;t que de produire un bilan erron&eacute; - videz les
r&eacute;unions et traitez un jour &agrave; la fois.

Sw.js passe en v51.

## Jeu Simple Gagnant v4 (aout 2026) : seuils fixes par rang, rang 1 prioritaire

A la demande de l'utilisateur, le syst&egrave;me "N chevaux dynamique selon
la tranche de confiance" (sections pr&eacute;c&eacute;dentes) est
REMPLAC&Eacute; par une r&egrave;gle plus directement valid&eacute;e par
backtest r&eacute;el : au lieu de chercher le plus grand N (2 &agrave; 8)
dont le rendement Dutching d&eacute;passe un seuil th&eacute;orique, on
compare directement la cote R&Eacute;ELLE de chaque cheval, RANG PAR RANG du
classement Score Global, &agrave; un seuil FIXE de rentabilit&eacute;.

### Origine des seuils (backtest 8 mois, 7456 courses)

Pour chaque rang du classement (1 &agrave; 5), on a mesur&eacute; le
rendement r&eacute;el (cote directe utilis&eacute;e comme approximation du
dividende, mise flat 1&euro;) des courses o&ugrave; le cheval &agrave; ce
rang d&eacute;passe un seuil de cote :

| Rang | Seuil | Courses concern&eacute;es | R&eacute;ussite | Rendement r&eacute;el |
|---|---|---|---|---|
| 1 | > 3,8 | 3274 | 27,4% | **164,0%** (robuste : 158,6% en retirant les 10 plus gros gains) |
| 2 | > 5,2 | 3354 | 13,5% | 103,2% (marge tr&egrave;s fine) |
| 3 | > 6,5 | 3699 | 8,7% | **86,6% (PAS rentable)** |
| 4 | > 9,4 | 3304 | 7,1% | 112,5% |
| 5 | > 12,5 | 3403 | 4,9% | 110,4% |

Le rang 1 est de loin le signal le plus solide pris isol&eacute;ment. Le
rang 3 n'est jamais rentable seul (86,6% < 100%, dans les deux
d&eacute;compositions test&eacute;es - classement mod&egrave;le ET classement
par cote) : il est donc **EXCLU** de toute la logique qui suit, aucun calcul
ne le retient plus jamais comme "value".

### Dutching combin&eacute; sur les rangs restants (1, 2, 4, 5)

Un Dutching combinant TOUS les chevaux "value" simultan&eacute;ment parmi
les rangs 1, 2, 4, 5 (quel que soit le sous-ensemble qui d&eacute;passe son
seuil, 2 &agrave; 4 chevaux) donne, sur 4761 courses avec au moins 2 chevaux
qualifi&eacute;s : **120,2% de rendement**, robuste (108,3% en retirant les
50 plus gros gains). Avec le rang 3 inclus (5 rangs), ce chiffre retombe
&agrave; 112,5% - confirmant que le rang 3 dilue le pool sans apporter de
valeur.

### D&eacute;cision retenue

Le rang 1 restant nettement le plus rentable pris seul (164,0% contre
120,2% pour le Dutching combin&eacute;), il est **TOUJOURS prioritaire**
d&egrave;s qu'il d&eacute;passe son seuil (cote > 3,8) : c'est la
proposition "principale" de la carte "Jeu Simple Gagnant". Si d'autres
rangs (2, 4, 5) d&eacute;passent AUSSI leur propre seuil, un Dutching
combinant tous les chevaux "value" (rang 1 inclus) est propos&eacute; EN
PLUS, en option "alternative" - jamais &agrave; la place du rang 1 seul
quand celui-ci est d&eacute;j&agrave; jouable, mais reste la SEULE
proposition si le rang 1 ne d&eacute;passe pas son seuil alors que d'autres
rangs d&eacute;passent le leur. Si un seul cheval au total d&eacute;passe
son seuil (quel que soit son rang), il est jou&eacute; seul (Dutching
d&eacute;g&eacute;n&eacute;r&eacute; &agrave; 1 cheval).

### Implementation

`js/engine/jeuSimpleGagnant.js` r&eacute;&eacute;crit :
`jeuSimpleGagnant(chevaux)` (n'accepte plus `scoreConfiance`) retourne
`{ rentable, rang1Value, principal, alternative, recommande }` -
`principal`/`alternative` sont chacun `{ chevaux, n, s, rendement }` ou
`null`, `recommande` = `principal` si pr&eacute;sent sinon `alternative`
(utilis&eacute; par d&eacute;faut pour les mises/le bilan/la notification).
Exports supprim&eacute;s : `SEUILS_RENDEMENT_SIMPLE_GAGNANT`,
`trancheConfiance`, `MIN_N_PAR_TRANCHE`. Nouvel export :
`SEUILS_VALUE_RANG_SIMPLE_GAGNANT = { 1: 3.8, 2: 5.2, 4: 9.4, 5: 12.5 }`.
`misesJeuSimpleGagnant`/`bilanJeuSimpleGagnant` prennent d&eacute;sormais
directement un pool (`{chevaux, s}` - `principal`, `alternative` ou
`recommande`) au lieu de l'objet `jeu` complet.

`js/app.js` : carte "Jeu Simple Gagnant" (fiche course) affiche les deux
propositions (principal en vert, alternative en bleu si diff&eacute;rente),
avec un s&eacute;lecteur pour choisir sur laquelle calculer les mises si les
deux sont pr&eacute;sentes. Surveillance automatique, page "Bilan Simple
Gagnant" et notifications utilisent `jeu.recommande` par d&eacute;faut (le
rang 1 seul quand il est jouable). Le store `bilansJournaliersSimpleGagnant`
(IndexedDB) est inchang&eacute; au niveau sch&eacute;ma.

16 tests unitaires r&eacute;&eacute;crits (`tests/engine.test.js`, 134/134
tests OK au total), plus une v&eacute;rification manuelle sur une
journ&eacute;e r&eacute;elle d'archives (25 courses, 22 jouables,
comportement principal/alternative/recommand&eacute; conforme).

Sw.js passe en v55.

## Jeu Simple Gagnant v5 (aout 2026) : rang 1 obligatoire, Dutching seul retir&eacute;

A la demande de l'utilisateur, un backtest cibl&eacute; a &eacute;t&eacute;
men&eacute; pour v&eacute;rifier si le Dutching "alternative" (v4,
ci-dessus) restait fiable dans le cas pr&eacute;cis o&ugrave; il est la
SEULE proposition de l'appli, c'est-&agrave;-dire quand le rang 1 ne
d&eacute;passe PAS son seuil (3,8) mais que 2 rangs ou plus parmi {2, 4, 5}
d&eacute;passent le leur.

### Constat : le Dutching seul (sans le rang 1) est fragile

Isol&eacute; &agrave; ce cas pr&eacute;cis (rang 1 non "value"), sur 2137
courses r&eacute;elles : 376 victoires (17,6%), rendement de **102,8%**
seulement - &agrave; peine au-dessus du seuil de rentabilit&eacute;. En
retirant les plus gros gains (m&ecirc;me test de robustesse que pour le
Croisement Coupl&eacute;/Trio) :

| Gains retir&eacute;s | Rendement |
|---|---|
| 0 (r&eacute;f&eacute;rence) | 102,8% |
| 5 plus gros | 97,9% |
| 10 plus gros | 94,4% |
| 20 plus gros | 89,3% |

Le rendement passe sous 100% d&egrave;s qu'on retire seulement 5 courses
sur 2137 : la rentabilit&eacute; apparente de ce cas pr&eacute;cis est
port&eacute;e par une minorit&eacute; de gros gains, pas par un
avantage structurel. Deux analyses compl&eacute;mentaires confirment que
l'avantage r&eacute;el vient sp&eacute;cifiquement de la position "rang 1"
et non de la valeur de cote en tant que telle :

- **Proche du seuil (bande seuil &agrave; seuil x 1,2)** : seul le rang 1
  reste rentable &agrave; la marge (138,6%) ; les rangs 2, 3, 4, 5 tombent
  tous sous 100% (91,6% / 79,3% / 78,9% / 66,5%) - leur rentabilit&eacute;
  agr&eacute;g&eacute;e vient d'une longue tra&icirc;ne de grosses cotes,
  pas des cas marginaux.
- **Ind&eacute;pendant du rang (checkpoints de cote 3,8/5,2/6,5/9,4/12,5
  &agrave; &plusmn;10%, sur n'importe quel rang du top 5)** : jamais
  rentable (91 &agrave; 97% selon la taille du pool) - la cote seule, sans
  la position rang 1, ne porte aucun avantage.

### D&eacute;cision retenue

Le Dutching combinant les rangs 2/4/5 (rang 1 exclu du pool) n'est plus
JOUABLE quand le rang 1 ne d&eacute;passe pas son seuil : la carte "Jeu
Simple Gagnant" affiche d&eacute;sormais "non jouable" dans ce cas, quels
que soient les autres rangs. Le rang 1 est **la seule condition de
jouabilit&eacute;** : quand il d&eacute;passe son seuil (164,0% de
rendement r&eacute;el, robuste), il reste toujours la proposition
"principale" (rang 1 seul). Le Dutching combin&eacute; (rang 1 + rangs
2/4/5 qualifi&eacute;s) reste propos&eacute; en compl&eacute;ment
facultatif dans ce cas-l&agrave; uniquement - jamais comme seule
proposition.

La page "Bilan Simple Gagnant" / "Bilan Global Simple Gagnant" ne suit
donc plus, de fait, que le rang 1 seul : `jeu.recommande` vaut toujours
`jeu.principal` (le Dutching alternatif n'est jamais recommand&eacute;
automatiquement, seulement disponible via le s&eacute;lecteur sur la fiche
course).

### Implementation

`js/engine/jeuSimpleGagnant.js` : `jeuSimpleGagnant(chevaux)` retourne
`{ rentable: false }` d&egrave;s que le rang 1 ne d&eacute;passe pas son
seuil (cote &gt; 3,8), quels que soient les autres rangs. Quand il
qualifie : `principal` = Dutching &agrave; 1 cheval (rang 1 seul, toujours
pr&eacute;sent), `alternative` = Dutching sur rang 1 + rangs 2/4/5
qualifi&eacute;s si 2 chevaux ou plus au total, sinon `null`. `recommande`
= `principal` (toujours). `rang1Value` reste export&eacute; dans le retour
mais vaut toujours `true` quand `rentable` est `true` (simplification par
rapport &agrave; v4).

`js/app.js` : message "non jouable" simplifi&eacute; (fiche course),
`libelleModeSimpleGagnant` simplifi&eacute; ('1er du classement seul'
uniquement pour `principal`), notification de surveillance simplifi&eacute;e
de m&ecirc;me. Aucun changement de sch&eacute;ma IndexedDB.

3 tests unitaires adapt&eacute;s dans `tests/engine.test.js` pour refl&eacute;ter
le nouveau comportement (134/134 tests OK au total).

Sw.js passe en v56.

## Jeu Simple Gagnant v6 (aout 2026) : Dutching retir&eacute; enti&egrave;rement

Suite &agrave; la v5 (rang 1 obligatoire), l'utilisateur a demand&eacute; de
ne garder QUE le rang 1 sur la page "Jeu Simple Gagnant" : le Dutching
combinant plusieurs rangs (propos&eacute; jusque-l&agrave; en compl&eacute;ment
facultatif quand le rang 1 qualifiait d&eacute;j&agrave; et qu'un autre
rang qualifiait aussi) est **supprim&eacute;**, y compris comme option.

### D&eacute;cision retenue

Le Jeu Simple Gagnant se r&eacute;sume d&eacute;sormais &agrave; une seule
r&egrave;gle : jouer le rang 1 du classement Score Global, seul, si et
seulement si sa cote r&eacute;elle d&eacute;passe 3,8 (164,0% de rendement
r&eacute;el, backtest 8 mois - voir sections pr&eacute;c&eacute;dentes pour
le d&eacute;tail complet du raisonnement). Aucune autre proposition n'est
affich&eacute;e sur la fiche course.

### Implementation

`js/engine/jeuSimpleGagnant.js` : `jeuSimpleGagnant(chevaux)` ne calcule
plus que le pool du rang 1 (`principal`). `alternative` reste dans l'objet
retourn&eacute; (compatibilit&eacute;) mais vaut toujours `null`.
`SEUILS_VALUE_RANG_SIMPLE_GAGNANT` conserve les seuils des rangs 2/4/5
(document&eacute;s pour m&eacute;moire du backtest) mais ils ne sont plus
utilis&eacute;s dans la logique de jeu.

`js/app.js` : carte "Jeu Simple Gagnant" simplifi&eacute;e - un seul bloc
(rang 1), plus de bloc "alternative", plus de s&eacute;lecteur "Mise sur",
bouton renomm&eacute; "Calculer mise" (singulier). `libelleModeSimpleGagnant`
n'accepte plus de param&egrave;tres et retourne toujours '1er du classement
seul'. `envoyerNotificationJsg` simplifi&eacute;e de m&ecirc;me.

1 test unitaire adapt&eacute; dans `tests/engine.test.js` (134/134 tests OK
au total).

Sw.js passe en v57.

## Jeu Simple Gagnant v7 (aout 2026) : retour du "Cheval value seul (rang hors 1)"

Apr&egrave;s la v6, l'utilisateur a demand&eacute; de remettre la
proposition "Cheval value seul (rang hors 1)" en plus du rang 1 - c'est-&agrave;-dire
de rejouer un cheval SEUL (sans Dutching multi-chevaux) quand il est le
SEUL cheval "value" parmi les rangs 2, 4, 5 alors que le rang 1 ne
qualifie pas. Cette possibilit&eacute; existait en v4 mais avait &eacute;t&eacute;
retir&eacute;e par la v5 (rang 1 rendu obligatoire) en m&ecirc;me temps que
le Dutching multi-chevaux fragile (102,8%, voir plus haut) - les deux
avaient &eacute;t&eacute; retir&eacute;s ensemble alors qu'ils sont en fait
des cas distincts : jouer UN SEUL cheval sur son propre seuil de rang
(rang 2 : 103,2%, rang 4 : 112,5%, rang 5 : 110,4% - voir le tableau plus
haut) n'est pas concern&eacute; par la fragilit&eacute; mesur&eacute;e, qui
&eacute;tait sp&eacute;cifique au Dutching COMBINANT 2 chevaux ou plus.

### D&eacute;cision retenue

- Le rang 1 reste prioritaire d&egrave;s qu'il d&eacute;passe son seuil
  (3,8) : "1er du classement seul".
- S'il ne qualifie PAS mais qu'UN SEUL des rangs 2, 4, 5 d&eacute;passe le
  sien, ce cheval est jou&eacute; seul : "Cheval value seul (rang hors 1)".
- Si 2 rangs ou plus parmi {2, 4, 5} qualifient SANS que le rang 1
  qualifie, le jeu reste **non jouable** (cas ambigu : lequel jouer seul ?
  et le Dutching combinant les deux reste exclu, trop fragile par
  backtest - voir plus haut).

### Implementation

`js/engine/jeuSimpleGagnant.js` : `jeuSimpleGagnant(chevaux)` teste
d'abord le rang 1 ; s'il ne qualifie pas, cherche parmi les rangs 2/4/5
lesquels d&eacute;passent leur seuil - si exactement 1, il devient
`principal` (Dutching &agrave; 1 cheval, `rang1Value: false`) ; si 0 ou 2+,
non jouable. `alternative` reste toujours `null` (aucun Dutching
multi-chevaux). `js/app.js` : `libelleModeSimpleGagnant(jeu)` reprend un
param&egrave;tre et retourne '1er du classement seul' ou 'Cheval value
seul (rang hors 1)' selon `jeu.rang1Value` ; message "non jouable" et
notification de surveillance mis &agrave; jour en cons&eacute;quence.

2 tests unitaires adapt&eacute;s/ajout&eacute;s dans `tests/engine.test.js`
(135/135 tests OK au total).

Sw.js passe en v58.

## Filtre par mode sur la page "Bilan Simple Gagnant" (aout 2026)

A la demande de l'utilisateur, un menu d&eacute;roulant permet de filtrer
les courses affich&eacute;es sur la page "Bilan Simple Gagnant" selon le
mode de jeu retenu (`jeu.rang1Value`) : "1er du classement seul" (rang 1
jouable), "Cheval value seul" (rang 1 non jouable, un seul autre rang
value jou&eacute; &agrave; sa place), ou "1er du classement et Cheval
value seul" (les deux confondus - valeur par d&eacute;faut, comportement
identique &agrave; avant l'ajout du filtre).

### Implementation

`js/app.js` : m&ecirc;me pattern que le filtre de confiance Top
base/R&eacute;sultat (`getFiltreFeuVert`/`setFiltreFeuVert`) - m&eacute;moris&eacute;
dans le navigateur via `localStorage` (cl&eacute;
`turf-filtre-mode-simple-gagnant`), pas dans IndexedDB. Nouvelles fonctions
`getFiltreModeSimpleGagnant`/`setFiltreModeSimpleGagnant`/
`matchFiltreModeSimpleGagnant`/`filtreModeSimpleGagnantSelectorHtml`/
`bindFiltreModeSimpleGagnantSelector`. `renderBilanSimpleGagnant` filtre la
liste des candidates (`jeu.rang1Value`) juste apr&egrave;s les avoir
r&eacute;cup&eacute;r&eacute;es, AVANT de calculer le taux de r&eacute;ussite
et le bilan financier de la journ&eacute;e : ces deux chiffres refl&egrave;tent
donc uniquement les courses du mode s&eacute;lectionn&eacute;, pas
l'ensemble. Si aucune course ne correspond au filtre choisi (mais qu'il en
existe pour un autre mode), un message d&eacute;di&eacute; l'indique avec le
total non filtr&eacute; entre parenth&egrave;ses, plut&ocirc;t que le
message g&eacute;n&eacute;rique "aucune course rentable". Le filtre n'affecte
QUE cette page (liste du jour) - le bilan financier hypoth&eacute;tique et
le "Transfert bilan" portent donc uniquement sur les courses filtr&eacute;es
au moment du transfert.

Sw.js passe en v59.

## Jeu Simple Gagnant v8 (aout 2026) : condition d'&eacute;cart de Score Global sur le rang 1

L'utilisateur a demand&eacute; des analyses suppl&eacute;mentaires pour &eacute;carter
les courses non fiables et augmenter la r&eacute;ussite du rang 1 (cote > 3,8).
Plusieurs pistes ont &eacute;t&eacute; test&eacute;es sur les 8 mois d'archives (223
jours, jan-ao&ucirc;t 2026) :

- **Indice de confiance de la course** (`scoreConfigurationCoupleValue`,
  0-5) : aucune tranche &agrave; &eacute;viter, le rang 1 reste rentable
  quel que soit le niveau de confiance.
- **Nombre de partants** (8 &agrave; 16) : pas de tranche &agrave;
  &eacute;viter non plus.
- **Discipline / hippodrome** : Steeple limite (106,9%, n=80), Cross trop
  petit (n=8) ; sur 48 hippodromes test&eacute;s (n&ge;25), seuls Cabourg
  (69,0%, n=51) et Dieppe (63,3%, n=60) ressortent clairement perdants -
  informatif, non impl&eacute;ment&eacute; (pas de filtre par lieu demand&eacute;).
- **Cote seuil max** : aucun seuil de rupture net ; rentable &agrave;
  toutes les tranches test&eacute;es, mais les donn&eacute;es se rar&eacute;fient
  au-del&agrave; de cote 15 (42 courses, 5 victoires) et deviennent fragiles
  &agrave; ce niveau - informatif, non impl&eacute;ment&eacute;.
- **Mouvement de cote 8h -&gt; directe** (steam/drift) : effet mod&eacute;r&eacute;
  et peu tranch&eacute; (164,8% / 183,8% / 150,3% selon la tranche) - non
  retenu.
- **Value du rang 1** (&eacute;cart cote march&eacute;/cote probable du mod&egrave;le) :
  largement redondant avec la cote elle-m&ecirc;me, peu informatif - non
  retenu.
- **&Eacute;cart de Score Global entre le rang 1 et le rang 2** : signal net,
  propre et monotone - retenu (voir ci-dessous).

### &Eacute;cart de Score Global (rang1 - rang2) : le signal retenu

| &Eacute;cart Score Global | n | Victoires | R&eacute;ussite | Rendement |
|---|---|---|---|---|
| &lt; 5 | - | - | 21,6% | 139,7% |
| 5 &agrave; 10 | - | - | 25,9% | 156,0% |
| 10 &agrave; 20 | - | - | 33,0% | 192,2% |
| &ge; 20 | - | - | 43,3% | 226,1% |

Plus le mod&egrave;le domine largement son dauphin en Score Global, plus le
rang 1 est fiable. En combinant avec la condition de cote existante (rang 1,
cote > 3,8) et un seuil d'&eacute;cart &ge; 10 : **1058 courses, 378
victoires, 35,7% de r&eacute;ussite, 201,1% de rendement r&eacute;el** -
contre 3274 courses, 896 victoires, 27,4% de r&eacute;ussite, 164,0% de
rendement sans cette condition. Robuste : 157,6% de rendement m&ecirc;me en
retirant les 50 plus gros gains sur les 378 victoires (contre 158,6% pour la
r&egrave;gle actuelle sur ses 10 plus gros gains) - le gain de r&eacute;ussite
ne repose donc pas sur une poign&eacute;e de gros paiements.

### D&eacute;cision retenue

- Le rang 1 ne qualifie d&eacute;sormais ("1er du classement seul") que si
  sa cote d&eacute;passe 3,8 **ET** que son Score Global d&eacute;passe celui
  du rang 2 d'au moins 10 points.
- Si le rang 1 ne qualifie pas (cote insuffisante OU &eacute;cart
  insuffisant OU pas de rang 2 identifiable dans la course), la logique de
  repli sur les rangs 2/4/5 ("Cheval value seul (rang hors 1)") reste
  inchang&eacute;e - la condition d'&eacute;cart n'a &eacute;t&eacute;
  test&eacute;e/valid&eacute;e que pour le rang 1, elle ne s'applique donc
  qu'&agrave; lui.

### Implementation

`js/engine/jeuSimpleGagnant.js` : nouvel export `SEUIL_ECART_SCORE_RANG1 =
10`. `jeuSimpleGagnant(chevaux)` calcule, quand le rang 1 d&eacute;passe son
seuil de cote, l'&eacute;cart `rang1.scoreGlobal - rang2.scoreGlobal` (rang2
= cheval class&eacute; 2) et n'accepte le rang 1 que si cet &eacute;cart est
&ge; 10 (born incluse). `js/app.js` : commentaire et message "non jouable"
mis &agrave; jour pour mentionner la nouvelle condition.

3 tests unitaires ajout&eacute;s dans `tests/engine.test.js` (&eacute;cart
insuffisant, &eacute;cart tout juste au seuil, rang 2 absent), et plusieurs
tests existants ajust&eacute;s pour fournir un `scoreGlobal` coh&eacute;rent
(138/138 tests OK au total).

Sw.js passe en v60.

## Bilan cumul&eacute; par mode sur la page "Bilan Global Simple Gagnant" (aout 2026)

A la demande de l'utilisateur, la page "Bilan Global Simple Gagnant" affiche
d&eacute;sormais, en plus du bilan cumul&eacute; global (tous modes
confondus, inchang&eacute;), deux cumuls s&eacute;par&eacute;s : "1er du
classement seul" et "Cheval value seul" - pour comparer visuellement la
progression des deux modes de jeu dans le temps (cf. l'analyse comparative
demand&eacute;e juste avant : le mode "Cheval value seul" est nettement plus
fragile que "1er du classement seul" sur le backtest 8 mois, voir plus haut).

### Probl&egrave;me r&eacute;solu au passage

Avant cette mise &agrave; jour, le bouton "Transfert bilan" (page "Bilan
Simple Gagnant") enregistrait le bilan du jour en respectant le filtre par
mode alors s&eacute;lectionn&eacute; (aout 2026, section pr&eacute;c&eacute;dente)
: si l'utilisateur avait laiss&eacute; le filtre sur "1er du classement
seul" au moment de cliquer "Transfert bilan", seules les courses de ce mode
&eacute;taient sauvegard&eacute;es - un bilan partiel pour la journ&eacute;e,
silencieusement. D&eacute;sormais, le taux de r&eacute;ussite, le bilan
financier de la journ&eacute;e et le "Transfert bilan" portent TOUJOURS sur
la journ&eacute;e enti&egrave;re (les deux modes confondus), quel que soit
le filtre choisi : le filtre ne change plus que la LISTE de courses
affich&eacute;e en bas de page (pour parcourir un mode en particulier), plus
le taux de r&eacute;ussite ni le bilan financier au-dessus. La carte "Bilan
financier (hypoth&eacute;tique) de la journ&eacute;e" affiche en plus, sous
le total, deux sous-lignes "dont 1er du classement seul" et "dont Cheval
value seul" pour voir la r&eacute;partition avant m&ecirc;me de
transf&eacute;rer.

### Implementation

`js/engine/jeuSimpleGagnant.js` : `cumulerBilansJournaliers(bilans)` calcule
d&eacute;sormais, en plus du cumul global existant (`cumulMise`/`cumulGain`/
`cumulNet`), deux cumuls s&eacute;par&eacute;s `cumulRang1Seul` et
`cumulChevalValueSeul` (chacun `{mise, gain, net}`), &agrave; partir des
sous-champs optionnels `rang1Seul`/`chevalValueSeul` de chaque entr&eacute;e
journali&egrave;re. Les entr&eacute;es ant&eacute;rieures &agrave; cette
mise &agrave; jour (sans ces deux sous-champs) continuent de compter
normalement dans le cumul global, mais comptent pour 0 dans les deux cumuls
par mode - &eacute;cart attendu et document&eacute; dans l'interface (note
sous les deux cartes de la page "Bilan Global Simple Gagnant" si des jours
sans d&eacute;tail existent dans l'historique).

`js/app.js` (`renderBilanSimpleGagnant`) : la liste `analysees` (bilan par
course, r&eacute;sultat, statut du rapport) est maintenant construite sur
TOUTES les courses candidates du jour (plus seulement celles du filtre
actif), puis filtr&eacute;e s&eacute;par&eacute;ment
(`analyseesFiltrees`) pour la liste de courses affich&eacute;e en bas de
page uniquement. Le bouton "R&eacute;cup&eacute;rer les rapports" porte
&eacute;galement sur la journ&eacute;e enti&egrave;re (et non plus
seulement le mode filtr&eacute;), pour que le bilan par mode puisse toujours
&ecirc;tre complet au moment du transfert. Au clic sur "Transfert bilan", un
sous-bilan (`{nbCourses, reussies, mise, gain, net}`) est calcul&eacute;
s&eacute;par&eacute;ment pour les courses `rang1Value === true` et
`rang1Value === false` du jour, et sauvegard&eacute; dans l'entr&eacute;e
(`rang1Seul`/`chevalValueSeul`) en plus des champs globaux existants.

`renderBilanGlobalSimpleGagnant` : deux nouvelles cartes ("1er du classement
seul" / "Cheval value seul"), calcul&eacute;es en sommant les sous-champs
`rang1Seul`/`chevalValueSeul` de toutes les entr&eacute;es (trait&eacute;es
comme `{mise:0, gain:0, net:0}` si absentes), affich&eacute;es sous la carte
globale existante avec la m&ecirc;me pr&eacute;sentation (net, mise/gains,
rendement, r&eacute;ussite). Aucun changement de sch&eacute;ma IndexedDB
(store `bilansJournaliersSimpleGagnant` d&eacute;j&agrave; sans champs
fixes, `keyPath: 'id'` - les nouveaux champs s'ajoutent librement aux
nouvelles entr&eacute;es).

4 tests unitaires ajout&eacute;s/adapt&eacute;s dans `tests/engine.test.js`
(cumul par mode, entr&eacute;es anciennes sans d&eacute;tail - 140/140 tests
OK au total).

Sw.js passe en v61.

## Jeu Simple Gagnant v9 (aout 2026) : condition de score Croisement pour "Cheval value seul"

Apr&egrave;s la mise &agrave; jour v8, l'utilisateur a demand&eacute; de
tester la "value" (&eacute;cart cote march&eacute;/cote probable du
mod&egrave;le) puis le score Croisement (R10/TG/OR/IdC, voir
`jeuCoupleTrioCroisement.js`) sur les deux modes du Jeu Simple Gagnant. La
value n'a rien apport&eacute; de concluant (voir analyse en chat, non
retenue). Le score Croisement, en revanche, montre un gradient net et
MONOTONE sur "Cheval value seul" :

| Score Croisement (0-4) | n | R&eacute;ussite | Rendement |
|---|---|---|---|
| 0 | 865 | 10,1% | 145,4% |
| 1 | 752 | 9,3% | 129,8% |
| 2 | 568 | 10,2% | 96,1% |
| 3 | 324 | 7,7% | 74,3% |
| 4 | 105 | 7,6% | 60,5% |

Contre-intuitif (moins les rubriques R10/TG/OR/IdC confirment le choix du
mod&egrave;le, mieux ce mode r&eacute;ussit) mais r&eacute;gulier et net. En
restreignant &agrave; score &le;1 (1617 courses sur 2614) : rendement 118,0%
-> 138,1%, et robustesse am&eacute;lior&eacute;e (110,7% au lieu de 100,6%
en retirant les 10 plus gros gains) - sans &eacute;liminer enti&egrave;rement
la fragilit&eacute; de fond du mode (retombe &agrave; 96,8% en retirant les
20 plus gros gains).

Le m&ecirc;me axe test&eacute; sur le rang 1 (v8) montre aussi un gradient
(score &le;2 : 263,7% de rendement sur 420 courses, robuste &agrave; 160,7%
en retirant les 50 plus gros gains, contre 201,1%/157,6% sans restriction).
**Non retenu &agrave; la demande explicite de l'utilisateur** : le rang 1
est d&eacute;j&agrave; performant sous tous les angles test&eacute;s
(confiance, nb partants, discipline/hippodrome, seuil de cote), restreindre
par score Croisement y aurait surtout r&eacute;duit le volume de courses
jouables (1058 -> 420) sans justification suffisante.

### D&eacute;cision retenue

- "Cheval value seul (rang hors 1)" qualifie d&eacute;sormais UNIQUEMENT si,
  en plus de d&eacute;passer son seuil de cote (rang 2/4/5), le score
  Croisement du cheval retenu est &le;1
  (`SEUIL_SCORE_CROISEMENT_CHEVAL_VALUE_SEUL`).
- Le rang 1 ("1er du classement seul") n'est PAS concern&eacute; par cette
  condition, quel que soit son propre score Croisement.

### Implementation

`js/engine/jeuSimpleGagnant.js` : nouvel import `classementCroisement`
(depuis `jeuCoupleTrioCroisement.js`) et nouvel export
`SEUIL_SCORE_CROISEMENT_CHEVAL_VALUE_SEUL = 1`. Dans la branche "Cheval
value seul" de `jeuSimpleGagnant(chevaux)`, apr&egrave;s avoir
identifi&eacute; l'unique cheval qui d&eacute;passe son seuil de cote parmi
les rangs 2/4/5, son score Croisement est calcul&eacute; via
`classementCroisement(chevaux)` (sur l'ensemble du champ) : s'il d&eacute;passe
1 (ou si le cheval n'est pas retrouv&eacute; dans le classement, cas
d&eacute;fensif), le jeu n'est pas jouable. `js/app.js` : commentaire et
message "non jouable" mis &agrave; jour.

4 tests unitaires ajout&eacute;s dans `tests/engine.test.js` (score >1 exclu,
score =1 born inclusive, absence de rubriques -> score 0 par d&eacute;faut
donc qualifie, rang 1 non affect&eacute; m&ecirc;me avec score = 4 -
144/144 tests OK au total).

Sw.js passe en v62.

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
  restent justifies. *(Le rappel textuel de ce constat, affiche sous le
  "Pronostic suggere" de la page Resultat, a ete retire de l'interface a la
  demande de l'utilisateur - ce constat reste documente ici a titre de
  reference.)*
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

## Course feu vert et Resultat : la Base remplace le Trio, rapport Simple Gagnant/Place

*** Nouveau *** : a la demande de l'utilisateur ("mettre la base a la place
du trio [sur la liste Course feu vert] et recuperer le rapport simple
gagnant et/ou place", puis "modifier aussi la reussite du jour... et ne
considerer que la base"), **Course feu vert ET la page R&eacute;sultat**
&eacute;valuent d&eacute;sormais la **Base seule** (Simple Gagnant/Place) au
lieu du Trio Value (base + 2 partenaires).

**Liste Course feu vert** (`js/app.js`, `renderCourseFeuVert`) : n'affiche
plus "Trio Value : N&deg;X + Y-Z-..." mais uniquement **"Base : N&deg;X"**,
avec le rapport officiel PMU Simple Gagnant et/ou Place pour ce seul numero
quand il est connu (`rapportSimpleHtml`).

**Page R&eacute;sultat** (`js/app.js`, `renderResultatJournee`) :

- `baseReussie(bd, chevaux, ordreArrivee, nbPartants)` remplace
  `trioValueReussi` : "r&eacute;ussi" = la Base finit **1&egrave;re (Gagnant)
  OU dans les places payantes (Place)**, au choix de l'utilisateur (pas
  Gagnant seul). Nombre de places payantes selon la r&egrave;gle PMU
  standard (`nombrePlacesPayees`) : aucune en dessous de 4 partants, 2
  places de 4 &agrave; 7 partants, 3 places &agrave; partir de 8 partants.
- `bilanSimpleBase(base, nbPartants, rapportsGagnant, rapportsPlace)`
  remplace `bilanTrioValue` : mise **1&euro; Simple Gagnant + 1&euro; Simple
  Place** (2&euro; par course ; 1&euro; seulement si le march&eacute; Place
  n'existe pas, moins de 4 partants), choix de l'utilisateur. Gain = somme
  des dividendes qui s'appliquent (0, 1 ou les 2).
- Le taux affich&eacute; ("Base r&eacute;ussie (Gagnant ou Place)") et le
  bilan financier ("Bilan financier (hypoth&eacute;tique) Simple
  Gagnant/Place (Base)") portent donc sur cette nouvelle d&eacute;finition.

**Nouvelles fonctions d'extraction** (`js/engine/pmuApi.js`), m&ecirc;me
principe et m&ecirc;me priorit&eacute; pool internet (`E_`) que
`extraireRapportsTrio`/`extraireRapportsCoupleGagnant` (voir plus haut,
section sur le bug des deux pools PMU) :

- `extraireRapportsSimpleGagnant(json)` : `E_SIMPLE_GAGNANT` en priorit&eacute;,
  repli sur `SIMPLE_GAGNANT`. Renvoie `{numero, dividende}[]` - en pratique
  un seul element (le vainqueur ; un Simple Gagnant n'a de rapport que pour
  le numero qui a gagn&eacute;).
- `extraireRapportsSimplePlace(json)` : `E_SIMPLE_PLACE` en priorit&eacute;,
  repli sur `SIMPLE_PLACE`. Renvoie un element par cheval arriv&eacute;
  dans les places payantes (2 ou 3 selon le nombre de partants).
- V&eacute;rifi&eacute;es sur une reponse **reelle** de l'API PMU (R1C1 du
  09/08/2026, pool internet) : e-Simple Gagnant 7,60&euro; (N&deg;5),
  e-Simple Place 2,30&euro; (N&deg;5) et 1,30&euro; (N&deg;6).

**Recuperation** : le bouton "Recuperer les rapports" (page R&eacute;sultat)
recupere la r&eacute;ponse **compl&egrave;te** de `rapports-definitifs`
(tous les types de pari en une seule requete) et en extrait desormais les
rapports Simple Gagnant/Place, persist&eacute;s sur la course
(`race.rapportSimpleGagnant`/`race.rapportSimplePlace`, via
`DB.updateRace`). `race.rapportTrio` et `extraireRapportsTrio` ne sont plus
utilis&eacute;s c&ocirc;t&eacute; Course feu vert/R&eacute;sultat (fonction
toujours test&eacute;e, comme `extraireRapportsCoupleGagnant`).

**Port&eacute;e** : la fiche course individuelle (carte "Trio Value avec
base") et la s&eacute;lection de la Base (`trioValueAvecBase`) restent
**inchang&eacute;es** - c'est la m&ecirc;me Base qui est utilis&eacute;e
partout, seule son &eacute;valuation sur Course feu vert/R&eacute;sultat a
chang&eacute;.

Purement indicatif : n'entre dans aucun calcul de Score Global/Value/score
de configuration/classement.

## Tri chronologique et simulation report Place (3 courses)

*** Nouveau *** : deux ajustements demand&eacute;s par l'utilisateur sur
Course feu vert / R&eacute;sultat.

**Tri par heure de d&eacute;part** (`js/app.js`, `renderCourseFeuVert`) :
la liste Course feu vert &eacute;tait tri&eacute;e par indice de confiance
d&eacute;croissant ; elle est d&eacute;sormais tri&eacute;e par **heure de
d&eacute;part croissante**, via `minutesDepart(heureDepart)` (parse le
format "HHhMM" du CSV, tolerant &agrave; "HH:MM"/"HH.MM", renvoie
`Infinity` - donc classe en dernier - si l'heure est absente/non reconnue).
L'heure de d&eacute;part est aussi affich&eacute;e en t&ecirc;te de chaque
ligne.

**Simulation report Place sur 3 courses** (`js/app.js`,
`renderResultatJournee`) : &agrave; la demande de l'utilisateur, une
nouvelle carte "Simulation report Place (3 courses)" teste **toutes les
combinaisons possibles** de 3 courses feu vert du jour dont le rapport est
d&eacute;j&agrave; connu (`avecBilan`, apr&egrave;s r&eacute;cup&eacute;ration
des rapports).

- Principe d'un "report" : miser 1&euro; sur la Base en Simple Place d'une
  course, puis, si elle est plac&eacute;e, rejouer **l'int&eacute;gralit&eacute;**
  du gain sur la Base d'une course suivante, puis d'une 3e.
- `simulerReportPlace(avecBilan, miseDepart)` g&eacute;n&egrave;re les
  C(n,3) combinaisons de 3 courses parmi les `n` &eacute;ligibles, **tri&eacute;es
  chronologiquement au sein de chaque combinaison** (un report doit
  respecter l'ordre r&eacute;el des courses - l'ordre de s&eacute;lection
  des 3 courses n'a pas d'importance, seul l'ordre chronologique final en
  a), simule la cha&icirc;ne (&eacute;chec d&egrave;s que la Base d'une des
  3 courses n'est pas plac&eacute;e - perte limit&eacute;e &agrave; la mise
  de d&eacute;part, 1&euro;, puisque l'argent rejou&eacute; n'a jamais
  &eacute;t&eacute; "en plus") et renvoie toutes les combinaisons
  tri&eacute;es par gain net d&eacute;croissant.
- Exclut les rares cas o&ugrave; la Base est r&eacute;ellement plac&eacute;e
  mais sans rapport Simple Place correspondant dans les donn&eacute;es
  PMU r&eacute;cup&eacute;r&eacute;es (incoh&eacute;rence de donn&eacute;es,
  course exclue de la simulation plut&ocirc;t que de fausser le calcul).
- Affichage (`reportPlaceHtml`) : nombre de courses &eacute;ligibles et de
  combinaisons test&eacute;es/r&eacute;ussies, puis une ligne par
  combinaison au format demand&eacute; par l'utilisateur (corrig&eacute;
  apr&egrave;s retour "ce n'est pas clair") : `reportN: R<r&eacute;union>-
  <course><num&eacute;ro cheval sur 2 chiffres>/.../...   rapport: <montant>&euro;`
  si la cha&icirc;ne des 3 courses est gagnante, `rapport: perdu` sinon -
  ex. `report1: R1-112/R2-215/R1-408   rapport: 9.00&euro;`. Message
  d&eacute;di&eacute; si moins de 3 courses ont un rapport connu.
- V&eacute;rifi&eacute; manuellement (4 courses fictives, 1 non plac&eacute;e) :
  C(4,3) = 4 combinaisons g&eacute;n&eacute;r&eacute;es, la seule
  combinaison sans la course non plac&eacute;e capitalise correctement les
  3 dividendes en cha&icirc;ne (1&euro; &times; 2,0 &times; 3,0 &times; 1,5
  = 9&euro;, net +8&euro;), les 3 autres perdent exactement la mise de
  d&eacute;part (-1&euro;).

Purement indicatif (hypoth&eacute;tique, comme le reste de ces
simulations) : n'entre dans aucun calcul de Score Global/Value/score de
configuration/classement, et ne repr&eacute;sente pas un historique de
mises r&eacute;elles.

## Bonus reussite historique en deferre (scoreConditions)

**Question pos&eacute;e** : le calcul des scores tient-il compte de la
r&eacute;ussite en d&eacute;ferr&eacute; (historique), du 1er d&eacute;ferrage, du
chrono ?

**V&eacute;rification effectu&eacute;e** sur les archives r&eacute;elles (31
journ&eacute;es, 7145 lignes trot avec arriv&eacute;e connue) :

- **Chrono** : la r&eacute;duction kilom&eacute;trique (`redKDist`, une course
  pass&eacute;e = un temps) &eacute;tait **d&eacute;j&agrave;** utilis&eacute;e dans
  `scoreForme` (bonus si <115/118/120). En revanche la colonne "Record"
  (chrono personnel, fichiers partants) est **vide &agrave; 100%** dans les
  archives r&eacute;elles (0 valeur sur 7145 lignes) — inexploitable, aucun
  changement possible sur ce point.
- **D&eacute;ferr&eacute; aujourd'hui** (vs ferr&eacute;) : b&eacute;n&eacute;fice
  confirm&eacute; (27,7% de podiums vs 19,5%) — d&eacute;j&agrave; capt&eacute; par
  le bonus statique existant (`scoreFerrage` dans `scoreConditions`).
- **1er d&eacute;ferrage** (changement par rapport &agrave; la derni&egrave;re
  course) : **aucune diff&eacute;rence significative** (26,7% de podiums pour
  les chevaux d&eacute;ferr&eacute;s pour la 1&egrave;re fois vs 28,5% pour ceux
  d&eacute;j&agrave; habitu&eacute;s) — signal absent, non impl&eacute;ment&eacute;.
- **R&eacute;ussite personnelle historique en d&eacute;ferr&eacute;** : seul axe
  avec un &eacute;cart net. Chevaux d&eacute;ferr&eacute;s aujourd'hui ayant
  couru d&eacute;ferr&eacute; au moins 3 fois dans le pass&eacute;, avec &ge;50%
  de podiums dans ces courses-l&agrave; : **37,4%** de podiums aujourd'hui.
  Ceux avec <50% : **24,9%**. &Eacute;cart de 12,5 points sur 2611 chevaux.

**D&eacute;cision** (confirm&eacute;e par l'utilisateur) : ajout d'un
bonus/malus dans `scoreConditions` (`js/engine/scoringEngine.js`), appliqu&eacute;
uniquement si le cheval court d&eacute;ferr&eacute; aujourd'hui, en trot
(Attel&eacute;/Mont&eacute;), avec au moins 3 courses pass&eacute;es en
d&eacute;ferr&eacute; dans son historique (colonne "Deferre" du fichier
musiques, d&eacute;j&agrave; pr&eacute;sente dans les objets d'historique via
`parsePerformances`, aucun changement de parsing n&eacute;cessaire) :

- Taux de podiums historiques en d&eacute;ferr&eacute; &ge;50% : **+6 points**.
- Taux de podiums historiques en d&eacute;ferr&eacute; <50% : **-3 points**.
- Moins de 3 courses en d&eacute;ferr&eacute; dans l'historique, ou cheval non
  d&eacute;ferr&eacute; aujourd'hui, ou discipline Plat : aucun changement (0).

Ce bonus s'ajoute au `scoreFerrage` existant (qui reste inchang&eacute;) dans
le calcul de `scoreConditions`, plafonn&eacute; comme avant &agrave; [0, 100].
Nouveau param&egrave;tre optionnel `perfsHistorique` sur `scoreConditions`
(r&eacute;trocompatible, valeur par d&eacute;faut `[]`), branch&eacute; dans
`raceAnalyzer.js` avec l'historique d&eacute;j&agrave; disponible pour chaque
cheval.

## Force relative sans cote — fonctionnalite retiree (backtest negatif)

Cette fonctionnalite (indicateur intra-course comparant les chevaux entre
eux, sans l'avis du march&eacute;) a exist&eacute; en deux versions
successives avant d'&ecirc;tre **retir&eacute;e** :

1. Une premi&egrave;re version utilisait le moteur de probabilit&eacute;s
   Plackett-Luce appliqu&eacute; &agrave; un Score Global sans cote
   (`probVictoireIntrinseque`). Retour utilisateur : les pourcentages
   &eacute;taient jug&eacute;s trop faibles et peu lisibles (ce n'est pas une
   erreur de calcul : une vraie probabilit&eacute; doit sommer &agrave; ~100%
   sur le champ, donc se r&eacute;partit plus uniform&eacute;ment sans la
   cote).
2. Remplac&eacute;e par `forceRelativeSansCote` : le meilleur cheval du champ
   (au sens `scoreGlobalSansCote`, mêmes composantes que `scoreGlobal` sauf
   la cote) affichait 100%, les autres leur niveau relatif. Retour
   utilisateur : "&ccedil;a ne sert pas &agrave; grand-chose".

**Demande suivante** : "souligner un cheval qui se d&eacute;tache par son
historique, au-dessus des autres" — avec demande explicite de v&eacute;rifier
si ce signal fonctionne avant impl&eacute;mentation. Backtest r&eacute;alis&eacute;
sur **4067 courses r&eacute;elles** (ArchivesTurf, janvier-juin 2026, champs
&ge;6 partants), 3 variantes test&eacute;es pour "l'&eacute;cart entre le 1er
et le 2e du champ par historique" :

- &Eacute;cart de `scoreGlobalSansCote` (forme+aptitude+conditions+similaire) :
  taux de victoire du 1er du champ = 22,4% / 20,0% / 17,5% / 20,8% / 24,4% /
  28,6% selon la taille de l'&eacute;cart (tranches croissantes) — plat/bruit&eacute;,
  aucune tendance.
- &Eacute;cart de `scoreForme` seul (lecture la plus litt&eacute;rale
  d'"historique") : m&ecirc;me constat, pas de tendance.
- &Eacute;cart d'un "historique pur" (forme+aptitude+similaire, sans
  conditions jockey/entra&icirc;neur) : m&ecirc;me constat.

Dans les 3 cas, un &eacute;cart plus grand **n'am&eacute;liore pas** le taux
de r&eacute;ussite du cheval en t&ecirc;te. Autre constat : classer
uniquement par historique (sans cote) est **moins pr&eacute;cis** que le
mod&egrave;le actuel — rang 1 par `scoreGlobal` (avec cote, mod&egrave;le en
place) = 25,7% victoire / 54,3% top3, contre 20,9% &agrave; 24,9% pour les 3
variantes sans cote. Le march&eacute; apporte une information r&eacute;elle
que l'historique seul n'a pas.

**Conclusion et d&eacute;cision** : le signal recherch&eacute; (une course o&ugrave;
un cheval "se d&eacute;tache" par son historique serait plus jouable)
n'existe pas dans les donn&eacute;es. La fonctionnalit&eacute; a &eacute;t&eacute;
enti&egrave;rement retir&eacute;e (`scoreGlobalSansCote` dans
`scoringEngine.js`, `forceRelativeSansCote` dans `raceAnalyzer.js`,
affichage fiche cheval et page course dans `app.js`, tests d&eacute;di&eacute;s) —
d&eacute;cision confirm&eacute;e par l'utilisateur apr&egrave;s pr&eacute;sentation
des chiffres ci-dessus. Script du backtest conserv&eacute; hors du d&eacute;p&ocirc;t
livr&eacute; (`backtest_historique_standout.mjs`, dossier de travail) pour
r&eacute;f&eacute;rence.

## Jeu Croisement Coupl&eacute; / Trio (aout 2026)

Nouvel onglet "Coupl&eacute;/Trio" (menu du bas), qui implante en argent
r&eacute;el la strat&eacute;gie d&eacute;couverte par backtest : un pool de
chevaux obtenu en croisant 4 rubriques (R10, TG, OR, IdC - score par cheval =
nombre de fois qu'il figure dans le top-3 de CHACUNE de ces 4 rubriques,
d&eacute;partag&eacute; par la somme de ses rangs sur ces 4 rubriques), jou&eacute;
en Coupl&eacute; Gagnant et en Trio &agrave; mise FLAT (le m&ecirc;me montant
sur chaque combinaison, contrairement au Dutching du Jeu Simple Gagnant).

### Origine et tailles de pool retenues

Sur un &eacute;chantillon de 51 &agrave; 59 courses r&eacute;elles (1 course
sur ~115, r&eacute;parties sur 8 mois d'archives, rapports r&eacute;cup&eacute;r&eacute;s
via l'API PMU `rapports-definitifs`) :

- **Coupl&eacute; Gagnant, pool de 3 chevaux** (`TAILLE_POOL_COUPLE = 3`, 3
  combinaisons) : 22,0% de r&eacute;ussite, **rendement r&eacute;el 148,5%**
  (n=59). V&eacute;rification de robustesse : en retirant le plus gros gain
  de l'&eacute;chantillon (82,50&euro; sur une mise totale de 177&euro;), le
  rendement retombe &agrave; ~102% - toujours au-dessus de 100%, le
  r&eacute;sultat n'est donc pas port&eacute; par un seul coup de chance.
- **Trio, pool de 4 chevaux** (`TAILLE_POOL_TRIO = 4`, 4 combinaisons) :
  17,6% de r&eacute;ussite, **rendement r&eacute;el 128,7%** (n=51). M&ecirc;me
  v&eacute;rification : en retirant son plus gros gain (86,20&euro; sur une
  mise totale de 204&euro;), le rendement retombe &agrave; ~86% (< 100%) - ce
  r&eacute;sultat est donc plus FRAGILE, port&eacute; en bonne partie par une
  seule grosse combinaison gagnante.

Ces deux tailles de pool sont celles retenues dans le code
(`js/engine/jeuCoupleTrioCroisement.js`) ; les autres tailles test&eacute;es en
r&eacute;ussite seule (K=2 &agrave; K=7, voir historique de session) ne sont
PAS impl&eacute;ment&eacute;es, faute de validation en argent r&eacute;el.

**Prudence** : l'&eacute;chantillon reste petit (51-59 courses) comparé aux
3000-7000+ courses des autres backtests de cette appli. Contrairement au Jeu
Simple Gagnant, cette strat&eacute;gie n'a donc pas encore la m&ecirc;me
solidit&eacute; statistique. L'objectif de cette page est justement
d'accumuler un vrai historique au fil du temps SANS mise r&eacute;elle
n&eacute;cessaire pour cela.

### Fiche course

Une nouvelle carte "Jeu Croisement Coupl&eacute;/Trio" (sous "Jeu Simple
Gagnant") affiche, pour la course consult&eacute;e : le pool Coupl&eacute; (3
chevaux, 3 combinaisons list&eacute;es) et le pool Trio (4 chevaux, 4
combinaisons list&eacute;es), avec un s&eacute;lecteur de mise par combinaison
(1 &agrave; 10&euro;) qui affiche la mise totale de chaque pari. Non jouable
si la course compte moins de `MIN_PARTANTS_CROISEMENT` (6) partants.

### Page "Coupl&eacute;/Trio" (bilan du jour)

Liste toutes les courses jouables de la journ&eacute;e (toute course &ge; 6
partants avec rubriques exploitables - pas de notion de "rentable course par
course" comme le Simple Gagnant, la strat&eacute;gie de pool a &eacute;t&eacute;
valid&eacute;e globalement) avec, d&egrave;s l'arriv&eacute;e connue, le
r&eacute;sultat (captur&eacute;/rat&eacute;) et le bilan financier
(hypoth&eacute;tique, `MISE_STANDARD_BILAN_CROISEMENT` = 1&euro; par
combinaison, identique &agrave; l'&eacute;chantillon r&eacute;el valid&eacute;)
pour le Coupl&eacute; et le Trio, suivis S&Eacute;PAR&Eacute;MENT (deux paris
ind&eacute;pendants). Un bouton "R&eacute;cup&eacute;rer les rapports" va
chercher les dividendes officiels PMU (`extraireRapportsCoupleGagnant` /
`extraireRapportsTrio`, d&eacute;j&agrave; utilis&eacute;es en interne par
l'appli) et les stocke sur `race.rapportCoupleGagnant` /
`race.rapportTrio`. Un bouton "Transfert bilan" enregistre le bilan du jour
dans l'historique (store IndexedDB `bilansJournaliersCroisement`, DB_VERSION
4), consultable sur la nouvelle page "Bilan Global Croisement" (cumul
Coupl&eacute; et Trio s&eacute;par&eacute;ment, jour apr&egrave;s jour).

### Implementation

`js/engine/jeuCoupleTrioCroisement.js` (nouveau) : `classementCroisement`,
`jeuCoupleTrioCroisement`, `combinaisonsDuPool`, `bilanCoupleCroisement`,
`bilanTrioCroisement`. `js/db.js` passe en DB_VERSION 4 (nouveau store
`bilansJournaliersCroisement`, inclus dans export/import). `js/app.js` :
nouvel onglet "Coupl&eacute;/Trio", routes `croisement` et
`bilanglobalcroisement`, carte fiche course, pages
`renderBilanCroisement`/`renderBilanGlobalCroisement`. 15 nouveaux tests
unitaires (`tests/engine.test.js`, 128/128 tests OK), plus une v&eacute;rification
manuelle sur une journ&eacute;e r&eacute;elle d'archives (25 courses jouables,
r&eacute;ussite Coupl&eacute;/Trio dans la fourchette attendue).

Sw.js passe en v52.

### Mise a jour (2) : fourchette 8-16 partants + filtre de confiance

A la demande de l'utilisateur : en dessous de 8 partants, le PMU propose
souvent UNIQUEMENT le Coupl&eacute; Ordre / Trio Ordre (paris o&ugrave;
l'ordre d'arriv&eacute;e compte), incompatibles avec ce module qui suppose un
ordre indiff&eacute;rent - d&eacute;j&agrave; observ&eacute; lors de
l'&eacute;chantillonnage r&eacute;el (3 courses exclues pour cette raison,
voir plus haut). `MIN_PARTANTS_CROISEMENT` passe donc de 6 &agrave; 8, et une
nouvelle borne haute `MAX_PARTANTS_CROISEMENT = 16` est ajout&eacute;e (m&ecirc;me
fourchette que "Top base"). Une course hors de cette fourchette (8-16) n'est
plus jouable, ni sur la fiche course ni sur la page "Coupl&eacute;/Trio".

**Indice de confiance et filtre.** L'utilisateur demandait aussi un moyen de
filtrer les (trop) nombreuses courses jouables. Nouvel indicateur
`confiancePool` (0-4) : le score (nombre de rubriques parmi R10/TG/OR/IdC ou
il figure en top-3) du membre le plus FAIBLE du pool - un pool dont tous les
membres ont un score &eacute;lev&eacute; est un signal plus fort qu'un pool
o&ugrave; le dernier membre n'est retenu que par le d&eacute;partage
(somme des rangs). Backtest sur l'archive compl&egrave;te (8 mois, courses
8-16 partants, 6720 courses) :

- **Couple (K=3)** : r&eacute;ussite 17,0% toutes confiances confondues ->
  **22,8% en ne retenant que confiance &ge; 3** (n=952, ~14% des courses) -
  signal net sur un &eacute;chantillon cons&eacute;quent.
- **Trio (K=4)** : le m&ecirc;me filtre n'apporte PAS d'am&eacute;lioration
  nette (12,0% au mieux contre 11,4% globalement, &eacute;chantillon trop
  clairsem&eacute; au-dessus de confiance=2) - la confiance Trio reste
  affich&eacute;e (indicatif) mais n'est PAS filtrable.

*Important* : ce backtest porte sur la R&Eacute;USSITE (le bon combo est dans
le pool), pas encore v&eacute;rifi&eacute; en argent r&eacute;el &agrave; ce
niveau de d&eacute;tail (contrairement aux chiffres globaux Couple/Trio de la
section pr&eacute;c&eacute;dente, qui eux viennent d'un &eacute;chantillon
PMU r&eacute;el).

**Implementation** : `jeuCoupleTrioCroisement.js` retourne d&eacute;sormais
`confianceCouple`/`confianceTrio` (fonction interne `confiancePool`), et
exporte `CONFIANCE_COUPLE_RECOMMANDEE = 3`. Fiche course : badge de
confiance &agrave; c&ocirc;t&eacute; de chaque pool (vert si &ge; seuil
recommand&eacute;, orange sinon pour le Couple ; gris/indicatif pour le
Trio). Page "Coupl&eacute;/Trio" : nouveau s&eacute;lecteur "Confiance
minimale (Couple)" (m&eacute;moris&eacute; en `localStorage`, m&ecirc;me
principe que le filtre "Top base"), qui restreint la liste des courses ET le
bilan financier affich&eacute;. 3 nouveaux tests unitaires
(`tests/engine.test.js`, 129/129 tests OK).

Sw.js passe en v53.

### Mise a jour (3) : pool a taille VARIABLE (remplace le pool fixe et le filtre de confiance)

A la demande de l'utilisateur, qui a remarqu&eacute; que le pool &eacute;tait
TOUJOURS de 3 chevaux en Coupl&eacute; et 4 en Trio, alors que les croisements
entre rubriques pourraient logiquement n'en faire ressortir qu'un ou deux :
c'&eacute;tait exact. L'ancien pool &eacute;tait de taille FIXE (K=3/K=4), donc
compl&eacute;t&eacute; par d&eacute;partage m&ecirc;me quand moins de chevaux
avaient r&eacute;ellement un accord multi-rubriques net - des chevaux de
"remplissage" pouvaient donc int&eacute;grer le pool.

**Nouvelle r&egrave;gle** : le pool retient d&eacute;sormais TOUS les chevaux
qualifi&eacute;s (score de croisement &ge; `SEUIL_QUALIFICATION_CROISEMENT` =
3 sur 4), sans compl&eacute;ter artificiellement. Sa taille est donc VARIABLE
selon la course : 2, 3 ou (rarement) 4 chevaux. Plafond math&eacute;matique de
4 : avec `nbTop` = 3 par rubrique et 4 rubriques (R10/TG/OR/IdC), au plus 4
chevaux distincts peuvent atteindre un score &ge; 3 simultan&eacute;ment
(12 places de top-3 au total, 3 places minimum par cheval qualifi&eacute; ->
12/3 = 4 maximum). Le Coupl&eacute; est jouable d&egrave;s 2 chevaux
qualifi&eacute;s (`MIN_CHEVAUX_COUPLE` = 2), le Trio d&egrave;s 3
(`MIN_CHEVAUX_TRIO` = 3) - **ind&eacute;pendamment l'un de l'autre** : une
course peut d&eacute;sormais &ecirc;tre jouable au Coupl&eacute; sans
l'&ecirc;tre au Trio (2 chevaux qualifi&eacute;s seulement), ou aux deux, mais
jamais au Trio sans l'&ecirc;tre au Coupl&eacute; (3&ge;2).

**Backtest de validation** (m&ecirc;me archive 8 mois, 8-16 partants, 6720
courses) : r&eacute;ussite selon la taille r&eacute;elle du pool qualifi&eacute; :

- **Taille 2** (Coupl&eacute; seul jouable) : 8,3% de r&eacute;ussite
  (n=3262) - la majorit&eacute; des courses jouables sont dans ce cas, avec
  un taux de r&eacute;ussite proche de l'ancien "sans filtre" (17,0%/2, coh&eacute;rent
  avec 2 combinaisons au lieu de 3).
- **Taille 3** (Coupl&eacute; ET Trio jouables) : 22,7% de r&eacute;ussite
  Coupl&eacute; (n=948) - retrouve quasiment exactement le chiffre de l'ancien
  filtre "confiance &ge; 3" (22,8%, m&ecirc;me population de fait), et 5,4% de
  r&eacute;ussite Trio (n=948).
- **Taille 4** : trop rare pour conclure (n=4 sur l'&eacute;chantillon).

Autrement dit : le nouveau pool variable retrouve NATURELLEMENT, sans
s&eacute;lecteur suppl&eacute;mentaire, la distinction que l'ancien filtre de
confiance approximait manuellement. **Le s&eacute;lecteur "Confiance minimale
(Couple)" est donc SUPPRIM&Eacute;** (`getFiltreConfianceCroisement`,
`setFiltreConfianceCroisement`, etc. retir&eacute;s de `app.js`) : la
confiance affich&eacute;e sur chaque pool est toujours 3 ou 4 par
construction (elle ne descend plus jamais en dessous du seuil de
qualification), un filtre n'apporte donc plus rien.

*Important* : comme pour la mise &agrave; jour pr&eacute;c&eacute;dente, ce
backtest porte sur la R&Eacute;USSITE du pool a taille variable, pas encore
v&eacute;rifi&eacute; en argent r&eacute;el &agrave; ce niveau de d&eacute;tail
(seul l'ancien pool a taille fixe K=3/K=4 a &eacute;t&eacute; valid&eacute; en
argent r&eacute;el, rendement 148,5%/128,7%, voir plus haut). La page
"Coupl&eacute;/Trio" sert justement &agrave; accumuler cet historique r&eacute;el
pour la version a taille variable.

**Implementation** : `jeuCoupleTrioCroisement.js` r&eacute;&eacute;crit -
`jeuCoupleTrioCroisement(chevaux)` retourne d&eacute;sormais
`groupeQualifie`, `coupleJouable`/`trioJouable` (bool&eacute;ens
ind&eacute;pendants), `poolCouple`/`poolTrio` (`null` si non jouable, sinon
tableau de taille variable), `confianceCouple`/`confianceTrio` (`null` si non
jouable). `bilanCoupleCroisement`/`bilanTrioCroisement` retournent
`{mise:0, gain:0, net:0, gagne:false, dividendeConnu:true}` quand le pari
n'est pas jouable sur la course (au lieu de calculer un pari hypoth&eacute;tique
sur un pool toujours pr&eacute;sent comme avant). Anciens exports supprim&eacute;s :
`TAILLE_POOL_COUPLE`, `TAILLE_POOL_TRIO`, `CONFIANCE_COUPLE_RECOMMANDEE`.
`app.js` : carte fiche course, page "Coupl&eacute;/Trio" et "Bilan Global
Croisement" adapt&eacute;es pour traiter Coupl&eacute; et Trio comme deux
paris ind&eacute;pendants (d&eacute;nominateurs de r&eacute;ussite
s&eacute;par&eacute;s, &eacute;tats "non jouable" distincts). Le store
`bilansJournaliersCroisement` (IndexedDB, inchang&eacute; niveau sch&eacute;ma)
gagne deux champs optionnels `nbCoursesCouple`/`nbCoursesTrio` (les anciens
bilans transf&eacute;r&eacute;s avant cette mise &agrave; jour n'ont pas ces
champs et retombent sur `nbCourses`, valable puisqu'avant cette mise &agrave;
jour les deux paris &eacute;taient toujours &eacute;valu&eacute;s ensemble). 6
nouveaux/r&eacute;&eacute;crits tests unitaires (`tests/engine.test.js`,
135/135 tests OK).

Sw.js passe en v54.

## Mise a jour aout 2026 (12) : validation sur archive etendue (juillet 2025 - aout 2026, 413 fichiers)

L'utilisateur a fourni progressivement 7 mois d'archives supplementaires
(juillet-aout 2025, puis septembre-decembre 2025), portant l'archive locale
totale a 413 fichiers "Analyse_AAAAMMJJ_partants.csv" (juillet 2025 a aout
2026, periode non continue - il manque le printemps 2025). Objectif :
verifier que les seuils du Jeu Simple Gagnant v8/v9 (voir sections
precedentes) restent valables sur un volume nettement plus grand que les 8
mois d'origine (7456 courses).

### Chiffres finaux (14004 courses analysees, 0 erreur de parsing)

| Mode | Courses jouables | Reussite | Rendement reel |
|---|---|---|---|
| **1er du classement seul** (rang1, cote>3,8, ecart Score Global >=10) | 2133 | 34,2% | **190,3%** |
| **Cheval value seul** (rang 2/4/5, score Croisement <=1) | 3847 | 8,8% | **124,9%** |

Rendement calcule sur la cote DIRECTE reelle de chaque course (proxy du
rapport PMU officiel, meme methode que le reste du backtest). Ces deux
chiffres sont tres proches des derniers releves sur 8-10 mois (191,3%/193,4%
et ~124%), confirmant que les seuils actuels sont stables et non lies a une
periode particuliere. Aucun changement de seuil ou de logique necessaire.

### Bilan mois par mois (rang1 seul)

Le rendement mensuel oscille entre 122,7% (juillet 2026) et 230,2% (avril
2026), toujours positif sur les 14 mois couverts, avec une reussite mensuelle
comprise entre 21,9% et 41,7%. Le detail complet (mois par mois, par tranche
d'ecart de Score Global, et par hippodrome) a ete exporte dans un fichier
`Bilan_Rang1_SimpleGagnant.xlsx` fourni a l'utilisateur (non inclus dans ce
depot, document de suivi externe).

### Rendement par tranche d'ecart de Score Global (rang1 vs rang2)

Confirme et affine le choix du seuil >=10 (v8) : relation croissante et
reguliere entre l'ecart et le rendement -

| Tranche d'ecart | Courses | Reussite | Rendement |
|---|---|---|---|
| 10-15 | 1072 | 28,5% | 167,0% |
| 15-20 | 550 | 35,6% | 196,2% |
| 20-30 | 428 | 43,5% | 227,3% |
| 30-50 | 82 | 50,0% | 257,8% |

(tranche 50+ non retenue : 1 seule course, non significative). Piste
identifiee mais non implementee : un seuil d'ecart plus eleve (par exemple
20 au lieu de 10) ameliorerait encore le rendement moyen, au prix d'un volume
de courses jouables divise par 2,5 environ - a rediscuter avec l'utilisateur
si le volume de courses actuel s'avere trop faible en pratique.

### Selection sur la cote 8h plutot que la cote directe

A la demande de l'utilisateur, teste egalement la meme selection (rang1
seul) en utilisant la cote 8h (au lieu de la cote directe) comme critere de
qualification - le rapport PMU final ne dependant que du pool a la cloture
(parimutuel), le paiement reel reste toujours calcule sur la cote directe,
seule la decision de jeu change :

- Selection sur cote8h seule (sans re-verification cote directe) : 3430
  courses jouables (2,4x plus qu'en cote directe), reussite 44,2%, rendement
  150,6%.
- "Confirmation" (cote8h ET cote directe toutes deux > seuil, meme cheval) :
  1576 courses, reussite 34,6%, rendement 196,8% - quasiment identique a la
  selection cote directe seule, la cote directe etant presque toujours la
  condition la plus stricte des deux.

Interet pratique : jouer des la cote 8h (sans attendre la fenetre H-3min)
capture 2 a 3 fois plus d'opportunites avec une reussite superieure, pour un
rendement par course un peu plus faible mais toujours solidement positif.
Piste non implementee (juste testee a la demande de l'utilisateur) : un mode
de decision base sur la cote 8h pourrait etre ajoute a la surveillance
automatique ou au Jeu Simple Gagnant si l'utilisateur le souhaite.

### Piste exploree et ecartee : Couple Gagnant "rang1 en base"

Teste egalement (a la demande de l'utilisateur, suite a son intention
d'adapter la methode au Couple/Trio) une formation Couple Gagnant avec le
rang1 (cote>3,8) en base fixe, combine au rang2 ET au rang3 du modele (2
combinaisons, 1E chacune). Validation par echantillonnage systematique de
rapports PMU reels (methode identique a celle du Jeu Croisement Couple/Trio -
voir plus haut) : 168 courses echantillonnees, 32 rapports reels recuperes,
reussite 19,0% (quasi identique a la reussite theorique sur la population
complete, 18,9% sur 3355 courses), rendement reel 129,1% (+29,1% net).
Rentable mais nettement plus modeste et plus aleatoire que le Simple
Gagnant rang1 (200%+ net, tres robuste) - decision de l'utilisateur : ne pas
implementer, le Couple/Trio restant "trop aleatoire" comparé au Simple
Gagnant.

Sw.js passe en v63.

## Mise a jour aout 2026 (13) : suppression de la page "Couple/Trio" et de la carte "Jeu Croisement Couple/Trio"

A la demande de l'utilisateur, suite a sa decision de ne pas poursuivre sur
le Couple/Trio ("trop aleatoire" compare au Simple Gagnant - voir la section
precedente sur la piste "Couple Gagnant rang1 en base", ecartee pour la meme
raison) :

- Retire l'onglet "Couple/Trio" de la barre de navigation du bas, ainsi que
  les pages "Croisement" (bilan du jour) et "Bilan Global Croisement"
  (historique).
- Retire la carte "Jeu Croisement Couple/Trio" de la fiche course.
- Retire de `js/app.js` l'import des fonctions UI de
  `js/engine/jeuCoupleTrioCroisement.js` (`jeuCoupleTrioCroisement`,
  `combinaisonsDuPool`, `bilanCoupleCroisement`, `bilanTrioCroisement`,
  constantes associees) ainsi que les fonctions `jeuCroisementHtml`,
  `bindJeuCroisement`, `renderBilanCroisement`, `renderBilanGlobalCroisement`,
  `collecterCandidatesCroisement`, `statutBilanCroisement`.

**Important : le moteur `js/engine/jeuCoupleTrioCroisement.js` N'A PAS ete
supprime.** Sa fonction `classementCroisement` reste utilisee par
`js/engine/jeuSimpleGagnant.js` (v9) pour la condition de score Croisement
du mode "Cheval value seul" (voir plus haut) - seule l'interface (carte
fiche course + pages dediees) a ete retiree, le module reste couvert par les
tests unitaires existants (144/144 toujours au vert). Les fonctions
`jeuCoupleTrioCroisement`, `combinaisonsDuPool`, `bilanCoupleCroisement`,
`bilanTrioCroisement` restent exportees par le moteur mais ne sont plus
appelees nulle part dans l'application - conservees a titre de reference si
l'utilisateur souhaite revenir dessus un jour.

Le store IndexedDB `bilansJournaliersCroisement` (et les fonctions
`DB.saveBilanJournalierCroisement`/`getAllBilansJournaliersCroisement`/
`deleteBilanJournalierCroisement` dans `js/db.js`) n'ont volontairement PAS
ete retires : ils font partie du mecanisme d'export/import complet des
donnees (`exportAllData`/`importAllData`), et les supprimer casserait la
compatibilite avec d'anciennes sauvegardes exportees par l'utilisateur avant
cette mise a jour. Ce store reste donc en base mais n'est plus alimente ni
consulte par aucune page.

Sw.js passe en v64.

## Mise a jour aout 2026 (14) : mise par palier d'ecart (rang1 seul), nouveau mode de mise optionnel

A la demande de l'utilisateur, suite a l'exploration de plusieurs strategies
de mise alternatives a la mise flat pour le mode "1er du classement seul" :

- **Mises en % du capital testees et ECARTEES** (en % fixe du capital courant
  et en Kelly fractionne par palier d'ecart de Score Global) : sur les 2133
  courses de l'archive complete, ces deux approches produisent des multiples
  de capital final theoriquement enormes (jusqu'a x3,3x10^20 pour Kelly/8) car
  elles reinjectent les gains a chaque pari sur plus de 2000 paris
  consecutifs sans plafond ni retrait - un resultat mathematiquement correct
  mais totalement inexploitable en pratique (le PMU plafonne les grosses
  mises, et personne ne rejoue 14 mois sans jamais retirer). Le vrai
  differenciateur mesure est le risque : drawdown max 14,8% a 56,0% selon le
  palier de fraction retenu, contre 1,5% en mise flat - donc ecartees.
- **Mise par palier d'ecart de Score Global (rang1 vs rang2), a UNITE FIXE
  (pas de reinjection)** : testee par l'utilisateur lui-meme sur le detail
  complet des 2133 courses (voir `Detail_Jeux_SimpleGagnant.xlsx`, section
  precedente) - multiplicateur x1 si ecart <20, x1,5 si 20<=ecart<30, x2 si
  ecart>=30. Resultat : net total 2332,2 unites contre 1925,9 en mise flat
  pure, soit **+21,1% de rendement**, pour un risque quasiment identique
  (drawdown max 1,45% contre 1,5% en flat, capital minimum 996,80 contre
  994,40 sur un capital de depart de 1000 unites) - RETENUE.

### Implementation

- `js/engine/jeuSimpleGagnant.js` : nouvelle constante
  `PALIERS_MISE_ECART_RANG1` (`[{seuil:0,multiplicateur:1},
  {seuil:20,multiplicateur:1.5},{seuil:30,multiplicateur:2}]`) et nouvelle
  fonction `multiplicateurMiseEcartRang1(ecartScore)` qui renvoie le
  multiplicateur applicable (1 par defaut si l'ecart est invalide/absent).
  `jeuSimpleGagnant(chevaux)` renvoie desormais aussi `ecartScoreRang1`
  (l'ecart de Score Global rang1 vs rang2 quand `rang1Value` est vrai, `null`
  sinon - notamment `null` pour le mode "Cheval value seul", ce palier ne
  s'appliquant qu'au rang 1).
- `js/app.js` (carte "Jeu Simple Gagnant") : quand le mode "1er du classement
  seul" est actif, affiche une case a cocher optionnelle "Mise par palier
  d'ecart" (decochee par defaut) avec l'ecart actuel affiche. Si cochee au
  moment de cliquer sur "Calculer mise", la mise totale choisie dans le menu
  deroulant est multipliee par `multiplicateurMiseEcartRang1(ecartScoreRang1)`
  avant le calcul du Dutching (a 1 cheval, revient a une simple mise flat
  multipliee) ; le multiplicateur applique est affiche dans le resultat. Ne
  s'affiche pas pour le mode "Cheval value seul" (palier non valide pour ce
  mode).

Sw.js passe en v65.

## Mise a jour aout 2026 (15) : nouvel onglet "Courses du jour" (liste + decompte)

A la demande de l'utilisateur, nouvel onglet dans la barre de navigation du
bas : "Courses du jour" (icone ⏱️, entre "Top base" et "Simple Gagnant").

- Liste TOUTES les courses du jour (reunions dont la date correspond au jour
  civil actuel, `estAujourdHui`) comportant entre `MIN_PARTANTS_FEU_VERT` et
  `MAX_PARTANTS_FEU_VERT` partants (8 a 16 - meme fourchette que "Top base"),
  tri&eacute;es par heure de d&eacute;part croissante.
- Contrairement a "Top base", cette page n'applique AUCUN filtre de score de
  configuration ni de confirmation externe : c'est une simple liste de
  consultation (utile pour voir d'un coup d'oeil l'ensemble des courses
  jouables du jour et leur ordre de passage), pas un conseil de jeu.
- **D&eacute;compte en direct** pour la prochaine course a partir (la
  premi&egrave;re, dans l'ordre chronologique, dont l'heure de d&eacute;part
  n'est pas encore pass&eacute;e) : affich&eacute; en "Xh MMm SSs" (ou
  "MMm SSs" si moins d'1h), mis a jour chaque seconde tant que la page reste
  ouverte. Une fois cette course partie, le d&eacute;compte se recalcule
  automatiquement sur la suivante. Les courses d&eacute;j&agrave; parties
  affichent un badge "D&eacute;part pass&eacute;" au lieu d'un d&eacute;compte.
- Le minuteur du d&eacute;compte (`setInterval`) est arr&ecirc;t&eacute;
  automatiquement des qu'on quitte la page (m&ecirc;me limite de fond que la
  surveillance automatique du Jeu Simple Gagnant : suspendu si l'appli passe
  en arri&egrave;re-plan sur mobile, redevient exact au premier plan).
- Reprend les constantes/fonctions d&eacute;j&agrave; existantes de "Top
  base" (`MIN_PARTANTS_FEU_VERT`, `MAX_PARTANTS_FEU_VERT`,
  `nbPartantsAcceptableFeuVert`, `minutesDepart`) pour rester coh&eacute;rent
  avec la fourchette de partants d&eacute;j&agrave; valid&eacute;e ailleurs
  dans l'appli.

Sw.js passe en v66.

## Mise a jour aout 2026 (16) : "1er du classement 8h" remplace "Cheval value seul" (v10)

A la demande de l'utilisateur, le Jeu Simple Gagnant ne retient plus QUE le
rang 1 du classement Score Global, via deux sources de cote possibles au
lieu d'un mode secondaire base sur les rangs 2/4/5 :

- **"1er du classement seul"** (inchange) : cote DIRECTE (`entry.coteDirecte`)
  &gt; 3,8 ET &eacute;cart de Score Global (rang1 vs rang2) &ge;10. Reste
  prioritaire.
- **"1er du classement 8h"** (NOUVEAU, remplace "Cheval value seul") : cote
  8H (`entry.cote8h`) &gt; 3,8 ET le M&Ecirc;ME &eacute;cart de Score Global
  &ge;10, uniquement si le rang 1 ne qualifie PAS en cote directe. Exactement
  les m&ecirc;mes seuils/crit&egrave;res que le mode ci-dessus, seule la
  source de cote change.

**Ce qui est retire** : le mode "Cheval value seul (rang hors 1)" (rangs 2,
4, 5 pris isol&eacute;ment, chacun rentable seul par backtest 8 mois -
103,2% &agrave; 112,5%) et sa condition suppl&eacute;mentaire de score
Croisement R10/TG/OR/IdC &le;1 (v9, aout 2026) disparaissent enti&egrave;rement
du Jeu Simple Gagnant. La logique restait correcte et valid&eacute;e par
backtest, mais l'utilisateur a pr&eacute;f&eacute;r&eacute; simplifier
l'appli autour du seul rang 1 - de loin le signal le plus solide et le plus
simple &agrave; suivre de tout le backtest (voir sections pr&eacute;c&eacute;dentes).

**M&eacute;thode retenue pour le mode 8h** : reprend exactement l'approche
d&eacute;j&agrave; valid&eacute;e par backtest r&eacute;el dans la section
(12) ("s&eacute;lection sur cote 8h, paiement sur cote directe/cotePourAffichage
&agrave; l'arriv&eacute;e") - 3430 courses, 44,2% de r&eacute;ussite, 150,6%
de rendement en s&eacute;lection seule ; 1576 courses, 34,6%, 196,8% en
version "confirmation" (cote8h ET cote directe toutes deux au-dessus du
seuil). Le paiement/gain affich&eacute; reste toujours bas&eacute; sur la
cote la plus &agrave; jour disponible (`cotePourAffichage`, priorit&eacute;
&agrave; la cote directe) : seul le SEUIL DE S&Eacute;LECTION change de
source entre les deux modes, conform&eacute;ment &agrave; la m&eacute;canique
du pari mutuel PMU (le dividende d&eacute;pend du pool &agrave; la fermeture
des paris, pas du moment o&ugrave; on s&eacute;lectionne le cheval).

**Pr&eacute;cision apport&eacute;e au passage** : avant cette mise &agrave;
jour, "1er du classement seul" lisait `cotePourAffichage` (qui bascule
silencieusement sur la cote 8h si la cote directe n'est pas encore connue)
plut&ocirc;t que `entry.coteDirecte` strictement - un cheval pouvait donc
qualifier "en cote directe" alors qu'en r&eacute;alit&eacute; seule sa cote
8h &eacute;tait connue au moment du calcul. D&eacute;sormais, les deux modes
lisent chacun EXPLICITEMENT leur propre champ (`entry.coteDirecte` /
`entry.cote8h`), pour une s&eacute;paration propre entre les deux sources -
coh&eacute;rent avec la demande explicite de l'utilisateur de distinguer les
deux.

### Implementation

- `js/engine/jeuSimpleGagnant.js` : `jeuSimpleGagnant(chevaux)` r&eacute;&eacute;crite
  - ne v&eacute;rifie plus que le rang 1 (plus de boucle sur les rangs
    2/4/5) ; l'&eacute;cart de Score Global (rang1 vs rang2) est calcul&eacute;
    UNE FOIS et sert de garde-fou commun aux deux modes ; teste d'abord
    `entry.coteDirecte`, puis `entry.cote8h` en repli. Retourne d&eacute;sormais
    un champ suppl&eacute;mentaire `mode8h` (bool&eacute;en, en plus de
    `rang1Value` conserv&eacute; pour compatibilit&eacute; - `true` = cote
    directe, `false` = cote 8h). `ecartScoreRang1` est d&eacute;sormais
    peupl&eacute; dans LES DEUX modes (avant : seulement en cote directe) -
    la mise par palier d'&eacute;cart (section 14) s'applique donc
    d&eacute;sormais aussi au mode 8h.
  - Suppression des exports `AUTRES_RANGS_SIMPLE_GAGNANT`,
    `SEUIL_SCORE_CROISEMENT_CHEVAL_VALUE_SEUL`, et de l'import
    `classementCroisement` (devenu inutile). `SEUILS_VALUE_RANG_SIMPLE_GAGNANT`
    simplifi&eacute; &agrave; `{ 1: 3.8 }` (les seuils des rangs 2/4/5
    n'&eacute;taient plus utilis&eacute;s nulle part).
  - `cumulerBilansJournaliers` : le sous-champ `chevalValueSeul` devient
    `classement8h` (sortie `cumulChevalValueSeul` -&gt; `cumulClassement8h`).
    **Compatibilit&eacute; ascendante** : les anciennes entr&eacute;es
    sauvegard&eacute;es sous `chevalValueSeul` (avant cette mise &agrave;
    jour) continuent de compter dans ce cumul via un repli automatique - la
    continuit&eacute; du suivi financier n'est pas cass&eacute;e, seul le
    libell&eacute; affich&eacute; change.
- `js/app.js` : `libelleModeSimpleGagnant` renvoie "1er du classement 8h" au
  lieu de "Cheval value seul (rang hors 1)". Carte "Jeu Simple Gagnant" :
  message "non jouable" et texte explicatif mis &agrave; jour ; la case
  "Mise par palier d'&eacute;cart" s'affiche d&eacute;sormais pour LES DEUX
  modes (condition bas&eacute;e sur `ecartScoreRang1 != null`, plus sur
  `rang1Value`). Page "Bilan Simple Gagnant" : filtre par mode renomm&eacute;
  ("Cote directe et cote 8h" / "1er du classement seul (cote directe)" /
  "1er du classement 8h" - les VALEURS internes du filtre restent `tous`/
  `rang1`/`value` pour ne pas casser une pr&eacute;f&eacute;rence
  d&eacute;j&agrave; enregistr&eacute;e dans le navigateur de l'utilisateur),
  d&eacute;tail "dont 1er du classement 8h" dans le bilan financier, champ
  sauvegard&eacute; par "Transfert bilan" renomm&eacute; `classement8h`. Page
  "Bilan Global Simple Gagnant" : carte renomm&eacute;e "1er du classement
  8h", cumul avec repli automatique sur l'ancien champ `chevalValueSeul`
  pour les jours transf&eacute;r&eacute;s avant cette mise &agrave; jour.

**Important : `js/engine/jeuCoupleTrioCroisement.js` N'A PAS &eacute;t&eacute;
supprim&eacute;.** Ce fichier n'est plus import&eacute; par AUCUN autre
module de l'application depuis ce changement (sa fonction
`classementCroisement` &eacute;tait le dernier point d'usage, via le mode
"Cheval value seul" d&eacute;sormais retir&eacute;), mais reste couvert par
ses propres tests unitaires et conserv&eacute; &agrave; titre de r&eacute;f&eacute;rence,
comme d&eacute;j&agrave; document&eacute; en section (13).

148 tests -&gt; 145 tests (nouveaux tests du mode 8h, suppression des tests
du mode "Cheval value seul"/score Croisement - plus nombreux mais couvrant
moins de cas qu'avant). Sw.js passe en v67.

## Mise a jour aout 2026 (17) : seuil d'ecart releve a 15 pour le mode "1er du classement 8h" (v11)

Apr&egrave;s livraison du backtest complet du mode "1er du classement 8h"
(section 16bis, ci-dessus, 3006 courses sur les 413 fichiers de l'archive),
l'utilisateur a remarqu&eacute; que la tranche d'&eacute;cart de Score Global
10-15 &eacute;tait &agrave; peine rentable pour ce mode (103,4% de rendement,
n=944/3006 - contre 125,4% &agrave; 150,1% pour les tranches 15-20, 20-30 et
30-50), et a demand&eacute; une v&eacute;rification de l'int&eacute;r&ecirc;t
de retirer cette tranche.

**M&eacute;thode de v&eacute;rification (double, pour garantir la
fiabilit&eacute;) :**
1. Filtrage post-hoc du dataset d&eacute;j&agrave; sauvegard&eacute;
   (`detailClassement8h.json`, 3006 lignes, chacune avec l'`ecartScoreRang1`
   r&eacute;el issu du moteur) sur `ecartScore &gt;= 15`.
2. V&eacute;rification ind&eacute;pendante via une variante temporaire du
   moteur r&eacute;el (`jeuSimpleGagnant()`) avec un seuil d'&eacute;cart
   distinct pour le mode 8h (15 au lieu de 10, mode directe inchang&eacute;),
   re-ex&eacute;cut&eacute;e sur les 413 fichiers de l'archive compl&egrave;te.

Les deux m&eacute;thodes convergent (&eacute;cart de quelques unit&eacute;s
d&ucirc; &agrave; un effet d'arrondi &agrave; la fronti&egrave;re des 15
points) :

| Scenario | n | Rendement (mise plate) | Drawdown max |
|---|---|---|---|
| Seuil 10 (actuel avant ce changement), mise plate | 3006 | 124,3% | 1,90% de la mise totale |
| Seuil 15, mise plate | 2048 | 133,6% | 1,85% |
| Seuil 15 + mise par palier d'ecart | 2048 | 135,9% | 1,65% |

**Decision : seuil du mode 8h releve de 10 &agrave; 15**
(`SEUIL_ECART_SCORE_RANG1_8H` dans `js/engine/jeuSimpleGagnant.js`), le mode
"1er du classement seul" (cote directe) n'est PAS concern&eacute; et garde
son seuil de 10 (2133 courses, 190,3%). Compromis assum&eacute; : -32% de
courses jouables en 8h (3006 &rarr; 2048) contre un rendement et un risque
tous deux am&eacute;lior&eacute;s.

**Attention, correction d'un calcul intermediaire erronn&eacute; :** une
premi&egrave;re estimation manuelle (colonne "Par palier d'&eacute;cart" de
l'onglet "Ecart Score 8h" du fichier `Bilan_Rang1_SimpleGagnant.xlsx`)
sugg&eacute;rait &agrave; tort un rendement de 150,75% pour le sc&eacute;nario
seuil 15 + palier. Cette colonne multiplie le B&Eacute;N&Eacute;FICE par le
multiplicateur de palier sans multiplier la MISE de la m&ecirc;me
mani&egrave;re dans le total affich&eacute; &agrave; l'&eacute;cran &mdash;
elle sert &agrave; afficher un montant de gain informatif par tranche, pas
&agrave; calculer un rendement agr&eacute;g&eacute; correct. Le rendement
r&eacute;el, mise ET gain multipli&eacute;s ensemble comme dans une vraie
simulation, est de 135,9% (v&eacute;rifi&eacute; deux fois, voir tableau
ci-dessus).

**Implementation :** `SEUIL_ECART_SCORE_RANG1_8H = 15` (nouvelle constante,
`js/engine/jeuSimpleGagnant.js`), utilis&eacute;e uniquement dans la branche
"cote 8h" de `jeuSimpleGagnant()` (la branche cote directe garde
`SEUIL_ECART_SCORE_RANG1 = 10`, inchang&eacute;e). 3 nouveaux tests
unitaires (limite 10-15 exclue, limite 14,9 exclue, limite 15 incluse, mode
directe non affect&eacute; par le nouveau seuil) : 148 tests, tous passants.
Sw.js passe en v68.

## Mise a jour aout 2026 (18) : warning hippodrome non rentable en cote 8h

Suite au releve du seuil d'&eacute;cart &agrave; 15 pour le mode "1er du
classement 8h" (section 17 ci-dessus), l'utilisateur a demand&eacute; un
warning visuel quand l'hippodrome de la course s'est av&eacute;r&eacute;
NON rentable pour ce mode sp&eacute;cifique sur l'archive.

**Backtest par hippodrome** (413 fichiers, moteur r&eacute;el, seuil 15,
n=2048) : 68 hippodromes couverts. Retenus comme "non rentables"
uniquement ceux avec &eacute;chantillon suffisant (n&ge;15, seuil de
prudence d&eacute;j&agrave; utilis&eacute; ailleurs dans l'appli pour les
d&eacute;coupages par hippodrome) ET rendement &lt;100% :

| Hippodrome | n | Reussite | Rendement |
|---|---|---|---|
| CLAIREFONTAINE DEAUVILLE | 30 | 23,3% | 65,3% |
| MESLAY DU MAINE | 25 | 40,0% | 90,0% |
| BEAUMONT DE LOMAGNE | 18 | 38,9% | 84,4% |

(CAVAILLON, n=12/97,5%, est tout juste sous 100% mais &eacute;cart&eacute; :
&eacute;chantillon trop faible pour conclure.)

**Implementation :** constante `HIPPODROMES_NON_RENTABLES_8H` et fonction
`estHippodromeNonRentable8h(hippodrome)` (`js/engine/jeuSimpleGagnant.js`,
comparaison insensible &agrave; la casse/espaces). Warning affich&eacute;
sur la carte "Jeu Simple Gagnant" (page course, `js/app.js`) uniquement
quand `jeu.mode8h === true` ET que l'hippodrome de la course fait partie de
la liste : "&#9888; Attention hippodrome non rentable en cote 8h" (tag
rouge). Purement informatif : n'emp&ecirc;che pas de jouer, le mode cote
directe n'est jamais concern&eacute;. Le nom d'hippodrome est propag&eacute;
depuis `context.lieu` (`renderRaceDetail`) &agrave; travers
`basesEtDangersHtml` puis `jeuSimpleGagnantHtml`.

4 nouveaux tests unitaires (liste exacte, reconnaissance insensible
casse/espaces, hippodrome hors liste, valeurs null/undefined/vide) : 151
tests, tous passants. Sw.js passe en v69.

## Mise a jour aout 2026 (19) : version de l'application affichee dans la barre du haut

L'utilisateur a signale des classements/selections Simple Gagnant differents
entre son PC et son iPhone (memes cotes en apparence). Investigation :
l'application est une PWA statique sans serveur, chaque appareil garde ses
propres donnees en local (IndexedDB) - cote directe mise a jour a des
moments differents, ou fichier musiques (historique) importe sur un seul
appareil, peuvent legitimement produire des Score Global differents pour
certains chevaux. Autre cause possible : une version d'appli differente en
cache (service worker) d'un appareil a l'autre.

Pour permettre de verifier facilement ce dernier point, la version de
l'application (`APP_VERSION`, `js/app.js`) s'affiche desormais en haut a
droite de la barre de titre, sur TOUTES les pages (voir `renderTopbar`) :
petit texte gris, format "vNN", avec une infobulle "Version de l'application
- doit etre identique sur tous vos appareils". Il suffit de comparer ce
texte entre les appareils pour savoir si l'un des deux tourne encore sur une
version en cache obsolete (et donc a besoin d'un rechargement/reinstallation
du dernier zip livre).

**Important : `APP_VERSION` (js/app.js) et `CACHE_NAME` (sw.js) doivent
toujours etre mis a jour ENSEMBLE, avec la meme valeur numerique, a chaque
nouvelle livraison** (un commentaire rappelle cette regle dans les deux
fichiers). Sw.js passe en v70, APP_VERSION passe en 'v70'.

## Mise a jour aout 2026 (20) : correction bug doublons historique (performances)

Suite au diagnostic "version identique + cotes identiques mais Score Global
different" (section 19 ci-dessus), l'utilisateur a trouve la cause reelle en
comparant les fiches cheval entre ses deux appareils : l'historique
(performances passees) d'un meme cheval affichait 7 courses connues sur PC
contre 2 sur iPhone, avec des courses comptees PLUSIEURS FOIS sur PC - alors
que le fichier musiques importe etait identique (fige, du 2 aout) sur les
deux appareils.

**Cause reelle (bug) :** `DB.addPerformances()` (`js/db.js`) generait un id
ALEATOIRE (`uuid()`) pour chaque ligne de performance et utilisait
`store.add()` (insertion pure, jamais de remplacement). Resultat : CHAQUE
reimport du fichier musiques - meme un fichier fige/identique - ajoutait une
NOUVELLE copie de chaque performance au lieu de la remplacer. Sur un
appareil ou le meme fichier (ou un fichier recouvrant les memes courses) a
ete importe plusieurs fois au fil des sessions de test, l'historique se
retrouve gonfle de doublons, ce qui fausse tous les calculs bases sur
l'historique (bonus reussite historique en differe, rubriques techniques
Module 2...) au prorata du nombre de reimports - exactement le symptome
observe (Score Global different entre appareils malgre des cotes
identiques, car seul le nombre de reimports differait).

**Correctif :** `addPerformances()` calcule desormais un id DETERMINISTE
pour chaque performance (cheval + date + lieu + distance + place +
discipline, cf. `clePerformance()`) et utilise `store.put()` (upsert) au
lieu de `store.add()` - meme pattern deja utilise pour
`predictionsExternes`/les bilans journaliers. Un reimport du meme fichier
devient donc idempotent : aucune duplication, meme repete N fois.

**Nettoyage des doublons deja accumules :** nouvelle fonction
`DB.dedupePerformances()` (regroupe les performances existantes par la meme
cle deterministe, ne garde qu'une copie par groupe, supprime le reste) et
nouveau bouton "Nettoyer les doublons d'historique" sur la page "Importer",
carte "Historique des chevaux". A utiliser UNE FOIS sur chaque appareil ou
des fichiers musiques ont pu etre importes plusieurs fois par le passe
(typiquement le PC dans le cas de l'utilisateur, moins sollicite sur
iPhone). Le nettoyage est lui-meme idempotent (peut etre relance sans
risque) et ne supprime jamais de donnee reelle, seulement les copies en
trop.

**Recommandation :** apres mise a jour vers cette version (v71) sur les
deux appareils, cliquer une fois sur "Nettoyer les doublons d'historique"
sur CHAQUE appareil (le PC en priorite, qui presentait le plus de
doublons), puis comparer a nouveau les Score Global entre PC et iPhone -
ils devraient desormais etre identiques (cotes ET historique alignes).

## Mise a jour aout 2026 (21) : correction fuite de donnees (lookahead) dans l'historique d'une course archivee

L'utilisateur a identifie lui-meme un second bug, plus fondamental que celui
de la section 20, directement lie a la structure du fichier musiques : ce
fichier contient TOUT l'historique connu d'un cheval, y compris - le cas
echeant - le resultat de la course en cours d'etude elle-meme, des lors que
cette course a deja ete disputee et que sa date figure dans le fichier
musiques importe.

**Probleme (fuite de donnees / lookahead) :** avant ce correctif,
`CSVImporter.historiquePour(nomCheval, toutesPerfs)` regroupait simplement
toutes les performances connues d'un cheval, sans jamais exclure la
performance correspondant a la course analysee. Quand on etudiait une
course PASSEE (archive), et que le fichier musiques contenait deja le
resultat de cette course precise (meme date), ce resultat se retrouvait
inclus dans l'historique utilise pour calculer le Score Global de... cette
meme course. Autrement dit, le modele "savait" deja si le cheval avait
gagne ou perdu la course qu'il etait cense predire, ce qui fausse
l'analyse (et par extension tous les backtests realises jusqu'ici sur des
courses archivees, puisqu'ils reposent sur le meme mecanisme).

**Correctif :** `historiquePour()` accepte desormais un 3e parametre
optionnel `dateCourseAExclure` (format "AAAA-MM-JJ"). Quand il est fourni,
toute performance dont la date correspond exactement a cette date est
retiree de l'historique avant le calcul du Score Global. Les 6 endroits de
l'application qui construisent l'historique d'un cheval pour une course
donnee (fiche course, fiche cheval, Top base, page Resultat, page Liste des
courses, Jeu Simple Gagnant) transmettent maintenant la date de la reunion
en cours d'analyse. L'appel reste retro-compatible : sans ce 3e argument,
le comportement est inchange (aucune exclusion).

**Portee :** ce correctif s'applique a toute analyse - passee ou a venir.
Pour une course du jour meme (pas encore disputee), il n'a aucun effet
puisque le fichier musiques ne contient jamais le resultat d'une course non
courue. Il ne change donc rien aux mises en jeu en temps reel ; il corrige
uniquement l'analyse de courses deja disputees (fiche cheval consultee a
posteriori, reimport d'une archive, etc.).

**A savoir :** les chiffres de backtest presentes precedemment dans cette
documentation (taux de reussite et rendements par mode, par seuil d'ecart,
par hippodrome...) ont ete calcules AVANT ce correctif et sont donc
optimistes pour les courses ou le fichier musiques source contenait deja le
resultat du jour analyse - voir la section suivante pour la
re-verification effectuee et ses consequences sur le Jeu Simple Gagnant.

## Mise a jour aout 2026 (22) : re-verification post-correctif + Jeu Simple Gagnant v12 (scoreAptitude remplace l'ecart en cote directe)

Suite au correctif de la section precedente, l'utilisateur a demande de
revérifier les chiffres de reussite/rendement du rang 1 (le seul mode
encore actif du Jeu Simple Gagnant). Backtest reel refait sur l'archive
complete (417 fichiers/12121 courses cote>3,8, moteur de production reel,
historique honnete via le 3e argument de `historiquePour`) :

**Chute des chiffres :** le rendement du rang 1 seul (cote>3,8, sans aucun
filtre supplementaire) tombe de 190,3%/132,8% (chiffres pre-correctif,
biaises par la fuite) a **91,8% (cote directe) / 88,5% (cote 8h)**. La
reussite tombe de 34,0%/55,2% a **15,9%/35,7%**. L'ancien filtre d'ecart de
Score Global (`SEUIL_ECART_SCORE_RANG1`/`_8H`), qui semblait tres
discriminant avant le correctif, ne separe plus rien de robuste une fois la
fuite corrigee (verifie par tranches fines + retrait des plus gros gains :
aucune relation monotone stable).

**Pistes explorees pour retrouver un signal exploitable (toutes testees sur
l'archive complete, avec verification de robustesse par retrait des plus
gros gains et de stabilite mois par mois) :**
- Tranches d'ecart honnete, par discipline, par ecart de cote : aucune ne
  survit au retrait des plus gros gains.
- Simulation "ecart truque" : injection d'une victoire fictive dans
  l'historique du rang 1 uniquement (le rang 2 restant honnete) : echec
  (aucune tranche fiable au-dessus de 102%).
- Simulation "double injection" : victoire fictive pour le rang 1 ET 2eme
  place fictive pour le rang 2, simultanement, avec le meme seuil d'ecart
  qu'en production : echec, le filtre ne discrimine quasiment plus rien
  (89,4%/86,3%, quasi identique a la population non filtree).
- "Confirmation top 8" : injection d'une victoire fictive tour a tour dans
  chacun des 7 challengers du top 8 du classement, verification que le
  rang 1 honnete reste devant chacun d'eux : signal present mais non
  independant - il disparait completement une fois croise avec
  scoreAptitude (voir ci-dessous), et n'est pas robuste seul en cote
  directe (rendement 98,5% -> 66,5% apres retrait des 30 plus gros gains).

**Signal retenu : `scoreAptitude` (rang1)** - seul critere honnete (calcule
uniquement a partir de donnees disponibles avant la course, sans aucune
triche) a la fois discriminant ET robuste. Comparaison du profil du rang 1
gagnant vs perdant sur les 12121 courses : `scoreAptitude` (adequation aux
conditions du jour - distance, terrain, hippodrome) est le seul sous-score
a montrer une separation nette qui resiste au retrait des plus gros gains
et reste stable mois par mois :
- **Cote directe, scoreAptitude>=85** (n=875, remplace l'ancien filtre
  d'ecart) : 21,4% reussite, 119,3% rendement, encore 90,3% apres retrait
  des 30 plus gros gains. Stable sur 11 des 14 mois de l'archive (un seul
  mois franchement mauvais : juin 2026 a 34,9%).
- **Cote 8h, ecart>=15 (inchange) + scoreAptitude>=85** (n=733, filtre
  supplementaire) : 46,2% reussite, 103,4% rendement (contre 92,6% pour
  l'ecart seul), encore 92,6% apres retrait des 30 plus gros gains. Stable
  sur 9 des 14 mois, jamais catastrophique.

**Implementation (`js/engine/jeuSimpleGagnant.js`, v12) :** nouvelle
constante `SEUIL_SCORE_APTITUDE_RANG1 = 85`. Le mode cote directe ne
verifie plus l'ecart de Score Global (rang1 vs rang2) pour qualifier -
uniquement `entry.coteDirecte > 3,8` ET `scoreAptitude >= 85`. Le mode
cote 8h garde son filtre d'ecart existant (`SEUIL_ECART_SCORE_RANG1_8H =
15`) ET ajoute la condition `scoreAptitude >= 85`. `ecartScoreRang1` reste
toujours calcule et renvoye par `jeuSimpleGagnant()` (il continue de servir
au multiplicateur de mise par palier d'ecart, `multiplicateurMiseEcartRang1`,
optionnel et inchange, et conditionne toujours la qualification en cote
8h). Le message affiche quand le jeu n'est pas jouable a ete mis a jour en
consequence (`js/app.js`, fonction `jeuSimpleGagnantHtml`).

**Non retenu / non implemente :** les pistes d'injection fictive
(simulation d'ecart truque, simple ou double) et de confirmation top 8 ont
ete explorees en detail mais rejetees car non robustes ou redondantes -
elles ne sont PAS implementees dans le moteur, seul `scoreAptitude>=85` a
ete retenu.

Tests unitaires mis a jour dans `tests/engine.test.js` (helper `chevalPourJsg`
avec un 6e parametre optionnel `scoreAptitude`, defaut 90 pour ne pas
polluer les tests non lies a ce nouveau critere) : 158 tests, tous
passants (`node --test tests/engine.test.js`).

## Mise a jour aout 2026 (23) : Jeu Simple Gagnant v13 (elargissement au top3 du classement)

Suite au v12 ci-dessus, l'utilisateur a cherche a recuperer du volume de
jeu sans sacrifier le rendement. Constat de depart (verifie sur l'archive
complete, 417 fichiers/12121 courses cote>3,8, classement honnete
post-correctif fuite) : le vrai vainqueur se trouve dans le **top3** du
classement honnete 51,8% du temps en cote directe et 58,8% en cote 8h -
contre seulement 15,9%/35,7% pour le rang 1 seul. Se limiter au rang 1
laissait donc volontairement de cote une bonne partie des victoires
potentiellement atteignables.

**Pistes de depart testees pour departager les 3 candidats du top3 :**
- **9 scenarios d'injection** (victoire fictive tour a tour dans chacun
  des 3 candidats, pari sur celui au score injecte le plus eleve) : echec,
  le vrai vainqueur ne ressort en tete qu'1 fois sur 3 (quasi le hasard) -
  82,7%/83,9% de rendement, MOINS bon que le rang 1 seul (91,8%/88,5%).
  Confirme une fois de plus que l'injection fictive n'apporte aucun signal
  honnete (voir toutes les tentatives d'injection listees en (22)).
- **`scoreAptitude` applique au meilleur candidat du top3** (au lieu du
  rang 1 seul) : succes. Compare a la production v12 sur la meme archive :
  v12 (rang1 seul, aptitude>=85) = n=1603, 32,6% reussite, **112,0%**
  rendement, robuste a 96,3% apres retrait des 30 plus gros gains ; v13
  (top3, aptitude>=85) = n=2172 (**+35,5%** de volume), 26,3% reussite,
  **108,4%** rendement, robuste a 94,5%. Les 718 courses supplementaires ou
  le choix bascule sur le rang 2/3 (car le rang 1 ne passait pas le filtre
  aptitude) rapportent a elles seules 104,7% de rendement (16,7% reussite)
  - un vrai ajout de valeur, pas juste du volume dilue. Stabilite
  mensuelle comparable a v12 (11/14 mois >100%, meme mauvais mois - juin
  2026 - sur les deux versions, effet de marche general).
- **Confirmation du candidat choisi par injection** (victoire fictive dans
  son propre historique, exigeant un ecart >10 sur le meilleur score
  honnete des 2 autres candidats du top3) : echec et **contre-productif**.
  Sur le pool top3+aptitude (n=2172, 108,4%), la confirmation ne retient
  que 1356 courses a 103,7% (robuste a seulement 88,0%), et les 816
  courses REJETEES par la confirmation font en realite MIEUX (116,2%) que
  celles retenues - preuve que le signal d'injection est inverse au signal
  utile. Cette piste n'est PAS implementee.

**Implementation (`js/engine/jeuSimpleGagnant.js`, v13) :** le pool de
candidats passe du rang 1 seul aux 3 premiers du classement Score Global
(`classement` entre 1 et 3 ; si moins de 3 chevaux au total, le jeu n'est
pas jouable). Parmi les candidats du top3 dont la cote directe > 3,8, on
retient celui au meilleur `scoreAptitude` s'il est >= 85 (mode cote
directe). Sinon, parmi les candidats du top3 dont la cote 8h > 3,8, on
retient celui au meilleur `scoreAptitude` s'il est >= 85 ET que son ecart
de Score Global sur le meilleur des 2 AUTRES candidats du top3 est >= 15
(mode cote 8h, ecart generalise de "rang1 vs rang2" a "candidat retenu vs
meilleur des 2 autres top3"). Nouveau champ `rangChoisi` (1, 2 ou 3) dans
le retour de `jeuSimpleGagnant()`, pour savoir quel rang a effectivement
ete retenu ; `rang1Value` est conserve mais signifie desormais "mode cote
directe" (true) vs "mode cote 8h" (false), independamment du rang choisi.
Le label affiche (`js/app.js`, `libelleModeSimpleGagnant`) indique "1er du
classement" si `rangChoisi===1`, sinon "Top3 (rang N)". Le message
"non rentable" a ete mis a jour ("Aucun des 3 premiers du classement...").

**Non retenu / non implemente :** l'argmax sur 9 scenarios d'injection et
la confirmation par injection du candidat choisi ont ete explores en
detail mais rejetes (echec ou contre-productif) - seul `scoreAptitude`
applique au top3, sans injection, a ete retenu.

Tests unitaires entierement reecrits dans `tests/engine.test.js` pour la
nouvelle logique top3 (160 tests, tous passants, `node --test
tests/engine.test.js`).

## Mise a jour aout 2026 (24) : Jeu Simple Gagnant v14 (scoreForme + exclusion d'hippodromes)

Suite au v13 ci-dessus (108,5% de rendement, 2377 selections sur l'archive
complete), l'utilisateur a demande deux pistes supplementaires pour
ameliorer le rendement, toutes deux testees sur la meme archive complete
(417 fichiers) :

**Ecart de `scoreAptitude`** entre le candidat retenu et le meilleur des 2
autres du top3 (en plus du seuil >=85 deja en place) : NEUTRE. Aucune
tendance monotone ni gain de robustesse quel que soit le seuil teste (0 a
40 points d'ecart) - rendement plat entre 102% et 118% sans lien clair
avec le seuil, et robustesse (retrait des 30 plus gros gains) qui se
degrade a mesure que le seuil monte (95,7% a >=0 jusqu'a 53,4% a >=40).
Non implemente.

**Recherche systematique d'un signal composite**, meme demarche que celle
qui avait trouve `scoreAptitude` en v12 (comparaison du profil du candidat
gagnant vs perdant), mais cette fois sur TOUS les sous-scores honnetes du
candidat retenu par v13 :
- `scoreConditions`, `scoreConditionsSimilaires` (scoreSimilaire),
  `scoreRubriques` et `nbCourses` : ecart de profil gagnant/perdant quasi
  nul (0,5 a 1,5 point) - aucun signal, ecartes d'emblee.
- `scoreCote` : ecart de profil interessant (+8,7 points, le plus grand de
  tous les sous-scores testes) mais NE TIENT PAS en filtre reel - rendement
  plat entre 106% et 110% quel que soit le seuil applique, aucune
  amelioration nette par rapport a la population non filtree. Ecarte.
- `scoreForme` : SEUL sous-score a montrer un vrai signal exploitable -
  gradient MONOTONE et DE PLUS EN PLUS ROBUSTE avec le seuil (109,7% de
  rendement a scoreForme>=50, jusqu'a 116,6% a >=80 ; robustesse de 95,8%
  a 99,8% apres retrait des 30 plus gros gains sur la meme plage). Retenu,
  seuil fixe a >=70 (`SEUIL_SCORE_FORME_RANG1`).

**Segmentation du pool v13 complet** (2377 selections) par discipline,
nombre de partants et hippodrome :
- Discipline et nombre de partants : aucune rupture nette (rendement entre
  99% et 118% selon la tranche, sans seuil clairement exploitable).
- Hippodrome : nette disparite. Sur 46 hippodromes avec un echantillon
  suffisant (n>=15, meme seuil de prudence que pour l'ancien warning 8h),
  **18 ressortent structurellement NON rentables** (rendement <100%, de
  14,1% a Meslay du Maine a 90,3% a Mons) : Lisieux, Pornichet la Baule,
  Deauville, Cagnes sur Mer, Saint Cloud, Beaumont de Lomagne, Compiegne,
  Chateaubriant, Meslay du Maine, Mons, Argentan, Strasbourg, Reims, Caen,
  Rouen Mauquenchy, Nantes, Angers, Marseille Vivaux. Retenus pour une
  **EXCLUSION FERME** (`HIPPODROMES_EXCLUS_SIMPLE_GAGNANT`) - contrairement
  a l'ancien warning purement informatif de la mise a jour (18) ci-dessus
  (`HIPPODROMES_NON_RENTABLES_8H`, RETIRE), qui n'empechait pas de jouer et
  s'est avere obsolete/partiellement contradictoire une fois le pool
  elargi au top3 : l'un des 3 hippodromes qu'il signalait, Clairefontaine
  Deauville, s'avere en realite tres rentable (178,1%) sur le pool v13
  actuel.

**Implementation (`js/engine/jeuSimpleGagnant.js`, v14) :** `jeuSimpleGagnant(chevaux,
hippodrome)` prend desormais un 2e parametre optionnel `hippodrome`. Si
fourni et present dans `HIPPODROMES_EXCLUS_SIMPLE_GAGNANT`, le jeu est
non rentable d'office (`{rentable:false, hippodromeExclu:true}`), avant
meme d'examiner les chevaux. Sinon, la logique v13 s'applique en ajoutant
la condition `scoreForme >= SEUIL_SCORE_FORME_RANG1` (70) au candidat
retenu, dans les DEUX modes (cote directe et cote 8h), en plus de
`scoreAptitude >= 85`. Les 4 points d'appel dans `js/app.js` transmettent
desormais l'hippodrome (`race.lieu`/`context.lieu`) ; le message
"non rentable" distingue le cas "hippodrome exclu" du cas "aucun candidat
ne qualifie". L'ancien warning informatif "hippodrome non rentable en cote
8h" (`estHippodromeNonRentable8h`, mise a jour (18)) est retire, remplace
par l'exclusion ferme ci-dessus qui couvre desormais les deux modes.

**Resultat combine** (hippodromes exclus + scoreForme>=70) : n=1350 (57%
du volume v13, contre 2377), rendement **123,9%** (contre 108,5% pour v13
seul), robuste a 102,3% apres retrait des 30 plus gros gains (contre
95,1% pour v13 sans filtre), stable sur 12 des 14 mois de l'archive (meme
mauvais mois - juin 2026 - qu'a chaque version precedente, effet de
marche general et non un defaut de la methode). Mode cote directe : 970
courses a 132,3% (le gros du gain) ; mode cote 8h : 380 courses a 102,7%
(plus modeste mais toujours positif). Re-verifie avec la fonction de
production reelle (`jeuSimpleGagnant()`, pas le script de backtest
ad-hoc) sur l'archive complete : n=1365, rendement 123,6% - concordance
confirmee (leger ecart du a l'ordre d'iteration des egalites de
scoreAptitude entre les deux scripts, sans impact sur la conclusion).

**Non retenu / non implemente :** ecart de scoreAptitude et filtre
scoreCote ont ete explores en detail mais rejetes (aucun signal net une
fois teste en filtre reel) - seuls scoreForme>=70 et l'exclusion
d'hippodromes sont implementes.

Tests unitaires mis a jour dans `tests/engine.test.js` : nouveau parametre
`scoreForme` sur le helper `chevalPourJsg` (7e parametre optionnel,
defaut 90 pour ne pas polluer les tests non lies a ce critere), remplacement
des tests `HIPPODROMES_NON_RENTABLES_8H`/`estHippodromeNonRentable8h` par
leurs equivalents v14, et ajout de tests dedies (hippodrome exclu,
scoreForme insuffisant, scoreForme au seuil) - 164 tests, tous passants
(`node --test tests/engine.test.js`).

## Mise a jour aout 2026 (25) : Jeu Simple Gagnant v15 (le pool passe de top3 a top2)

Suite a une question de l'utilisateur sur un cas concret (course du
02/07/2025, reunion 3, ou le n°1 avait ete retenu alors que le n°5 semblait
meilleur en score aptitude/forme), il est apparu que le n°5 avait en
realite un `scoreGlobal` correct mais une `Value` nulle (ni positive ni
negative), ce qui le classe apres les chevaux a Value negative dans
`TrierChevaux` (`raceAnalyzer.js`) et le fait tomber au rang 5 - donc hors
du pool top3 de l'epoque. Cet echange a motive un recalcul de la couverture
du vrai vainqueur par rang de classement sur l'archive complete (courses
cote>3,8) : rang1 seul 11,9% (directe)/24,8% (8h), top3 41,8%/57,4%, top5
67,3%/76,7%. Deux tailles de pool alternatives au top3 ont alors ete
testees avec le moteur reel :

- **top5** (rangs 1 a 5) : **ECHEC**. Rendement en baisse (113,5% contre
  123,6% pour top3), robustesse en baisse (89,2% contre 102,1% apres
  retrait des 30 plus gros gains), stabilite mensuelle en baisse (9/14
  contre 12/14 mois >100%). Les selections marginales de rang 4/5 (celles
  qu'ajoute le top5 par rapport au top3) sont nettement faibles isolement
  (6,4% a 7,1% de reussite, 69% a 81% de rendement). Non implemente.
- **top2** (rangs 1 a 2 uniquement) : **SUCCES**. Rendement en hausse
  (127,4% contre 123,6% pour top3, sur n=1265 contre n=1365), robustesse
  en hausse (105,6% contre 102,1% apres retrait des 30 plus gros gains),
  reussite en hausse (31,6% contre 28,8%). Stabilite mensuelle legerement
  en retrait en nombre de mois (11/14 contre 12/14 mois >100%, meme mauvais
  mois - juin 2026 - qu'a chaque version precedente, effet de marche
  general) mais avec une moyenne mensuelle plus elevee. Les selections
  marginales de rang 3 (celles que le top3 avait en plus du top2) sont
  faibles isolement (13,0% de reussite, 98,1% de rendement, s'effondre a
  3,1% apres retrait des 30 plus gros gains) - confirme que le rang 3
  n'apportait pas de valeur nette et diluait la performance du pool plus
  qu'il ne l'ameliorait.

**Decision retenue :** le pool passe de top3 a top2 (`classement` 1 a 2
uniquement), memes seuils `scoreAptitude>=85` / `scoreForme>=70` /
hippodromes exclus qu'en v14 (inchanges).

**Implementation (`js/engine/jeuSimpleGagnant.js`, v15) :** la variable
interne `top3` devient `top2`, le filtre `classement >= 1 && classement <=
3` devient `classement >= 1 && classement <= 2`, et le garde-fou "champ
trop petit" passe de `top3.length < 3` a `top2.length < 2`. La signature
de `jeuSimpleGagnant(chevaux, hippodrome)` ne change pas. `js/app.js` :
`libelleModeSimpleGagnant()` affiche desormais "Top2 (rang 2)" au lieu de
"Top3 (rang N)" (N ne peut plus etre que 2), et le message "non rentable"
mentionne "les 2 premiers" au lieu de "les 3 premiers" du classement.
`APP_VERSION` passe a `v76` (et `CACHE_NAME` dans `sw.js` a
`turf-analyse-v76`).

**Re-verification avec la fonction de production reelle**
(`jeuSimpleGagnant()`, pas un script de backtest ad-hoc, sur l'archive
complete 417 fichiers) : n=1265, rendement **127,4%**, reussite 31,6%,
robuste a 105,6% apres retrait des 30 plus gros gains, 11 mois sur 14
>100% - concordance totale avec les chiffres du backtest de conception
ci-dessus. Mode cote directe : 831 courses a 139,5% (le gros du gain) ;
mode cote 8h : 434 courses a 104,1% (plus modeste mais toujours positif).

**Non retenu / non implemente :** l'elargissement a top5 a ete explore en
detail mais rejete (degrade rendement, robustesse et stabilite sur tous
les axes testes) - seul le retrecissement a top2 est implemente.

Tests unitaires mis a jour dans `tests/engine.test.js` : le pool des tests
passe de 3 a 2 chevaux (le helper `rang3Neutre()`, devenu inutile car un
3e cheval n'est plus jamais examine, a ete retire), le test de borne
"champ trop petit" verifie desormais 1 candidat (non rentable) plutot que
2, et l'ancien test "seul le rang 3 est value -> rang 3 retenu" (devenu
contradictoire, le rang 3 n'etant plus jamais candidat) a ete remplace par
un test confirmant que le rang 3 est desormais TOUJOURS ignore, meme s'il
serait seul a qualifier - 164 tests, tous passants
(`node --test tests/engine.test.js`).

## Mise a jour aout 2026 (26) : Jeu Simple Gagnant v16 (exclusion score Croisement=4)

Suite a une question de l'utilisateur reprenant 4 rubriques deja reperees
par le passe (R10, TG, OR, IdC - deja utilisees en v9 dans le mode "Cheval
value seul" depuis disparu), le "score Croisement" (0 a 4,
`classementCroisement()` de `jeuCoupleTrioCroisement.js` : nombre de
rubriques parmi R10/TG/OR/IdC ou le cheval figure dans le top3 du champ,
module conserve dans le code bien que sa page UI ait ete retiree) a ete
recalcule pour le cheval RETENU par le pool v15 (top2), sur l'archive
complete (417 fichiers) :

- score=0 : 164,0% de rendement (n=105) ; score=1 : 127,5% (n=176) ;
  score=2 : 150,6% (n=249) ; score=3 : 124,1% (n=354) ; score=4 : 105,1%
  (n=381) - gradient pas parfaitement lisse mais nette rupture entre
  score=4 (30% du volume v15, a peine rentable) et le reste.

**Mecanisme identifie** (avant toute decision d'implementation) : le score
Croisement n'apporte PAS d'information nouvelle sur la qualite du cheval
(scoreAptitude/scoreForme moyens quasi identiques, 93 a 96, quel que soit
le score) - c'est surtout un indicateur indirect du resserrement de la
cote (cote moyenne payee : 7,70 a score=0, jusqu'a 3,43 a score=4) et il
recoupe fortement le mode 8h deja identifie plus faible (64% des score=4
sont en mode 8h, contre 22% pour score<=3). Neanmoins l'effet PERSISTE a
l'interieur de CHAQUE mode pris separement (directe : 144,7% a score<=3
contre 113,4% a score=4 ; 8h : 108,8% contre 100,3%) et sur 3 sous-periodes
chronologiques independantes - pas un simple doublon du mode 8h ni un
artefact temporel.

**Seuils testes** : score<=1 et score<=2 tentants sur le rendement brut de
conception (141,1%/145,6%) mais ECHOUENT au test de robustesse
(s'effondrent a 52,6%/93,4% en retirant seulement les 30 plus gros gains -
trop concentres sur une poignee de grosses cotes) - ECARTES. Seul score<=3
(exclusion du seul score=4) tient : n=884 (70% du volume v15), rendement
137,0%, robuste a 105,9% apres retrait des 30 plus gros gains, et bat le
score=4 sur les 3 sous-periodes chronologiques testees separement
(156,0%/132,7%/122,4% contre 142,2%/130,3%/111,7% pour le pool complet
v15 sur les memes 3 periodes).

**Decision retenue :** le candidat retenu par la logique top2/scoreAptitude/
scoreForme (mode directe comme mode 8h) n'est finalement propose que si son
score Croisement (calcule sur l'ENSEMBLE du champ de la course, pas
seulement le top2) ne depasse pas 3 - sans repli sur l'autre mode si le
candidat qualifie autrement mais echoue sur ce filtre.

**Implementation (`js/engine/jeuSimpleGagnant.js`, v16) :** nouvel import
de `classementCroisement` depuis `jeuCoupleTrioCroisement.js`, nouvelle
constante exportee `SEUIL_SCORE_CROISEMENT_MAX = 3`, et un helper
`qualifieCroisement(cheval)` appele juste avant de retourner `rentable:
true` dans CHACUN des deux modes (directe et 8h) - si le candidat qui
vient de qualifier sur cote/aptitude/forme(/ecart pour le 8h) a un score
Croisement > 3, la fonction retourne directement `{ rentable: false }`
SANS jamais evaluer l'autre mode (le mode directe, s'il echoue uniquement
a cause du score Croisement, ne "tombe" jamais sur le mode 8h). Un cheval
sans donnees rubriques du tout obtient un score Croisement par defaut de 0
(toujours qualifiant), pour ne pas penaliser les champs avec des donnees
incompletes. `js/app.js` : le message "non rentable" mentionne desormais
le score Croisement <=3 en plus des seuils cote/aptitude/forme/ecart deja
affiches. `APP_VERSION` passe a `v77` (et `CACHE_NAME` dans `sw.js` a
`turf-analyse-v77`).

**Re-verification avec la fonction de production reelle**
(`jeuSimpleGagnant()`, pas un script de backtest ad-hoc, sur l'archive
complete 417 fichiers) : n=975, rendement **131,7%**, reussite 27,9%,
robuste a 103,0% apres retrait des 30 plus gros gains, 13 mois sur 14
>100% - amelioration confirmee par rapport a la v15 (rendement 127,4%,
robuste 105,6%, 11/14 mois) sur la robustesse (13/14 contre 11/14 mois) et
le rendement brut, avec une robustesse-apres-retrait tres proche (103,0%
contre 105,6%, ecart non significatif vu le volume retire). Les chiffres
exacts different legerement de ceux du backtest de conception (n=884 vs
975, 137,0% vs 131,7%) car le script de conception isolait le score
Croisement du cheval deja retenu par v15 sur un echantillon fige, alors
que la fonction de production recalcule tout depuis zero sur l'archive
complete (population legerement differente) - la tendance et l'ampleur de
l'amelioration restent coherentes entre les deux methodes. Mode cote
directe : 773 courses a 138,2% ; mode cote 8h : 202 courses a 106,7%
(les deux modes restent positifs, et le mode 8h progresse legerement par
rapport a son chiffre v15 seul de 104,1%).

Tests unitaires ajoutes dans `tests/engine.test.js` (4 nouveaux, 168 au
total, tous passants) : candidat qualifiant en cote directe mais score
Croisement=4 -> non rentable, sans repli sur le mode 8h (meme si ce
candidat qualifierait aussi en 8h dans l'absolu) ; score Croisement
exactement au seuil (=3, une rubrique sur 4 manquante) -> qualifie
toujours (borne inclusive) ; cheval sans donnees rubriques -> score par
defaut 0, toujours qualifiant ; meme verification du "sans repli" pour le
mode 8h. `node --test tests/engine.test.js` : 168 tests, tous passants.

## Mise a jour aout 2026 (27) : Jeu Simple Gagnant v17 (mise ponderee par scoreAptitude, remplace le palier d'ecart)

Suite a la v16, l'utilisateur a demande une piste d'amelioration du
rendement SANS reduire le volume de selections (donc pas un nouveau
filtre - un ajustement de la MISE). Backtest sur l'archive complete (417
fichiers, pool v16, n=975, mise unitaire) sur plusieurs signaux candidats
(mode, ecart, scoreAptitude, cote, discipline, nb partants) : le
sous-groupe `scoreAptitude>=100` (n=344, 35% du volume, reparti
equitablement entre disciplines - 33 a 51% de chaque discipline) se
detache nettement, 152,5% de rendement contre 120,3% pour le reste. Effet
verifie robuste :

- Persiste a l'interieur de CHAQUE mode separement (directe : 160,4%
  contre 127,3% ; 8h : 130,1% contre 87,9%, ou c'est meme ce qui rend le
  mode 8h globalement rentable) - pas un simple doublon du mode.
- Persiste sur un decoupage chronologique en 2 moities (145,5%/123,9%
  contre 142,3%/121,0% en mise plate) puis en 3 tiers (153,0%/125,0%/125,9%
  contre 152,3%/120,7%/121,9%) - jamais un artefact d'une seule periode.
- Robuste au retrait des 30 plus gros gains (106,1% contre 103,0% en mise
  plate, avec x1,5 ; 108,4% avec x2).

A cette occasion, le multiplicateur de mise par palier d'ecart existant
(v8/v13, base sur l'ecart de Score Global rang1/rang2, teste a l'origine
sur un pool bien plus ancien avant v15/v16) a ete RETESTE sur le pool v16
actuel : il s'avere legerement CONTRE-PRODUCTIF (130,0% pondere contre
131,7% en mise plate, verifie sur les deux moities chronologiques -
141,5%/118,6% contre 142,3%/121,0%), et moins bon combine au multiplicateur
scoreAptitude (135,7%) qu'utilise seul (137,1%). La tranche d'ecart
20-30 (l'ancien palier x1,5) est meme la moins bonne des tranches
d'ecart testees (106,6%).

**Decision retenue :** le multiplicateur de mise par palier d'ecart est
RETIRE et remplace par un multiplicateur base sur le scoreAptitude du
cheval retenu : x2 si scoreAptitude >= 100, x1 sinon. Rendement pondere
mesure sur l'archive complete : 131,7% -> 137,1%, robustesse (retrait des
30 plus gros gains) 103,0% -> 108,4%. Volume de selections INCHANGE (975
courses toujours jouees, seule la repartition de la mise change) -
conforme a la demande explicite de l'utilisateur.

**Implementation (`js/engine/jeuSimpleGagnant.js`, v17) :** nouvelles
constantes exportees `SEUIL_SCORE_APTITUDE_MISE_RENFORCEE = 100` et
`MULTIPLICATEUR_MISE_APTITUDE_ELEVEE = 2`, nouvelle fonction
`multiplicateurMiseAptitudeRang1(scoreAptitude)` (remplace
`multiplicateurMiseEcartRang1`, retiree). `jeuSimpleGagnant()` expose
desormais `scoreAptitudeRang1` (scoreAptitude du cheval retenu) dans les
DEUX modes, en plus de `ecartScoreRang1` (conserve, toujours utilise pour
le filtre de qualification en cote 8h, seuil 15 - inchange). `js/app.js` :
la case a cocher "Mise par palier d'ecart" devient "Mise renforcee si
scoreAptitude eleve", meme UX (case a cocher optionnelle, desactivee par
defaut). `APP_VERSION` passe a `v78` (et `CACHE_NAME` dans `sw.js` a
`turf-analyse-v78`).

Tests unitaires mis a jour dans `tests/engine.test.js` (168 au total, tous
passants) : les 3 tests de l'ancien `multiplicateurMiseEcartRang1`/
`PALIERS_MISE_ECART_RANG1` sont remplaces par 3 nouveaux tests couvrant
`multiplicateurMiseAptitudeRang1` (bornes x1/x2, valeur invalide) et
l'exposition de `scoreAptitudeRang1` par `jeuSimpleGagnant()` dans les deux
modes. `node --test tests/engine.test.js` : 168 tests, tous passants.

## Mise a jour aout 2026 (28) : Jeu Simple Gagnant v18 (exclusion des courses de categorie F en discipline Plat)

Suite a une question de l'utilisateur sur l'influence du type de course
(colonne BN du fichier "partants", "TypeCourse") et de l'allocation
(colonne BO) sur le pool v17 actuel, l'utilisateur a fourni la legende
officielle GenTurf de la colonne TypeCourse :

- **Niveau de l'epreuve** : 1, 2 et 3 = Groupes 1, 2 et 3 (elite) ; L =
  Listed (preparation aux courses de groupe, en galop) ; A a G =
  categories degressives, uniformisees entre le trot et le galop (A =
  meilleure categorie, G = plus faible).
- **Type d'epreuve** (ne releve pas du niveau, orthogonal) : R = a
  reclamer (partants a vendre a un prix fixe), W = reservee aux apprentis
  et lads-jockeys, X = reservee aux amateurs (cavaliers non
  professionnels).

Backtest sur l'archive complete (417 fichiers, pool v17, n=975 a l'epoque
de cette analyse) : la categorie F (20,5% du volume, n=200) ressortait
quasi a l'equilibre (95,9% de rendement, contre 137,1% pour le reste) et
fragile (s'effondrant a 53,5% en retirant seulement les 15 plus gros
gains) - alors que G, pourtant la categorie la plus faible du bareme, ne
montrait aucun probleme similaire. A la demande explicite de l'utilisateur
("creuser encore avant de trancher"), une analyse plus poussee a montre
que l'effet F n'est **pas uniforme** selon le contexte : croise avec la
discipline, F est catastrophique en Plat (40,5% de rendement, n=60) mais
au contraire **bon** en mode cote 8h (118,4%, n=50) et neutre en
Attele/Monte. Une exclusion aveugle de toutes les courses F aurait donc
jete un sous-groupe rentable avec le mauvais.

Trois regles candidates ont ete testees et comparees (robustesse via
retrait des plus gros gains + decoupage chronologique 2 et 3 parties) :

- **A. Exclusion F partout** : n=775 (-20,5% de volume), rendement 140,9%,
  robuste a 105,4%.
- **B. Exclusion F seulement en mode cote directe** : gain de volume
  proche de A mais robustesse legerement inferieure.
- **C. Exclusion F seulement en discipline Plat** (quel que soit le mode) :
  la perte de volume la plus faible des 3 options, le meilleur rendement
  pondere et la meilleure robustesse - et le sous-groupe exclu (F+Plat)
  s'est avere mauvais de facon tres constante sur les differentes
  sous-periodes chronologiques testees (pas un artefact d'un seul mois).

L'option C a ete retenue par l'utilisateur (la plus chirurgicale, le
meilleur compromis volume/robustesse).

**RE-VERIFICATION avec la fonction `jeuSimpleGagnant()` de production**
(pas le script ad-hoc du backtest de recherche) sur l'archive complete
(417 fichiers) : le pool v17 sans le filtre v18 donne aujourd'hui n=885
(136,8% de rendement) ; avec le filtre v18 (F exclu en Plat uniquement),
n=846 (140,9% de rendement, -4,4% de volume seulement - l'ecart de -6,2%
estime pendant la phase de recherche etait legerement pessimiste), robuste
a 108,6% apres retrait des 30 plus gros gains, et meilleur sur les 3
tiers chronologiques testes (157,3% / 132,2% / 133,3%) ainsi que sur 13
des 14 mois de l'archive. La conclusion de la recherche est confirmee par
le moteur de production ; seul le volume exact differe legerement (39
courses exclues au lieu des 60 estimees), ecart habituel entre un script
de recherche ad-hoc et le moteur reel (deja observe sur les versions
precedentes, ex. v13/v14).

**Implementation :**

- `js/engine/csvImporter.js` : nouvelle colonne resolue par nom,
  `TypeCourse` (repli position fixe `64`, format standard 76 colonnes,
  entre `Discipline` et `Allocation`), exposee dans `context.typeCourse`
  (`parseReunionComplete()`).
- `js/engine/jeuSimpleGagnant.js` (v18) : nouvelle fonction exportee
  `estCourseExclueTypeCourse(disciplineCanonique, typeCourse)` (vrai
  seulement si `disciplineCanonique === 'PLAT'` ET `typeCourse === 'F'`,
  insensible a la casse/espaces, `false` par defaut si l'un des deux
  parametres est absent). `jeuSimpleGagnant()` accepte desormais 2
  parametres optionnels supplementaires (`disciplineCanonique`,
  `typeCourse`) et retourne `{ rentable: false, typeCourseExclu: true }`
  d'office si la course est exclue - meme emplacement dans la fonction que
  l'exclusion d'hippodrome (v14), avant toute autre logique.
- `js/app.js` : les 4 sites d'appel de `jeuSimpleGagnant()` (page
  "Course", surveillance automatique H-3min, `collecterCandidatesSimpleGagnant()`
  pour les pages Bilan) transmettent desormais la discipline canonique et
  `context.typeCourse`/`race.typeCourse`. Le message "Jeu simple gagnant
  non jouable" affiche un texte dedie ("Course de categorie F en
  discipline Plat, exclue d'office...") quand `jeu.typeCourseExclu` est
  vrai, sur le meme modele que le message d'hippodrome exclu.
  `handleReunionImport()` sauvegarde desormais `typeCourse` dans
  IndexedDB (`racesToSave`), sans changement de schema necessaire (les
  enregistrements de courses acceptent librement un nouveau champ,
  `js/db.js` ne fait pas de whitelisting explicite). `APP_VERSION` passe a
  `v79` (et `CACHE_NAME` dans `sw.js` a `turf-analyse-v79`).

Tests unitaires ajoutes dans `tests/engine.test.js` (173 au total, tous
passants) : 6 nouveaux tests couvrant `estCourseExclueTypeCourse` (vrai
seulement PLAT+F, insensible casse/espaces, faux si l'un des deux
parametres manque) et `jeuSimpleGagnant()` avec les nouveaux parametres
(F+Plat exclu, F hors Plat qualifie normalement, Plat hors F qualifie
normalement, parametres absents = comportement inchange pour la
compatibilite ascendante avec les anciens appelants/tests). `node --test
tests/engine.test.js` : 173 tests, tous passants.

## Mise a jour aout 2026 (29) : filtre scoreForme/scoreAptitude sur "Courses du jour"

A la demande de l'utilisateur, la page "Courses du jour" (`renderListeCourses()`,
`js/app.js`) ne liste plus TOUTES les courses du jour a 8-16 partants, mais
seulement celles comptant AU MOINS UN cheval avec `scoreForme >=
SEUIL_SCORE_FORME_RANG1` (70) ET `scoreAptitude >= SEUIL_SCORE_APTITUDE_RANG1`
(85) - les 2 memes seuils que ceux utilises par `jeuSimpleGagnant()`
(`jeuSimpleGagnant.js`). But : se concentrer d'emblee sur les courses qui
MERITENT d'etre regardees en detail, plutot que de parcourir toute la liste
brute. Ce filtre est une condition NECESSAIRE mais pas suffisante pour
qu'une course produise effectivement un Jeu Simple Gagnant rentable (le
moteur applique en plus le classement top2, le seuil de cote >3,8, l'ecart
en mode 8h, le score Croisement, l'exclusion hippodrome/typeCourse) - cette
liste reste donc un outil de pre-tri, pas un conseil de jeu direct (elle ne
remplace pas la carte "Jeu Simple Gagnant" affichee sur la fiche de chaque
course).

**Implementation :** meme calcul que `collecterCandidatesSimpleGagnant()`
(historique par cheval via `CSVImporter.historiquePour()`, contexte de
course, `RaceAnalyzer.analyser()`), mais sans appeler `jeuSimpleGagnant()`
lui-meme : seul un test `some()` sur `result.chevaux` (scoreForme/
scoreAptitude) determine si la course est retenue. `APP_VERSION` passe a
`v80` (et `CACHE_NAME` dans `sw.js` a `turf-analyse-v80`).

## Mise a jour aout 2026 (30) : correction normalisation des noms d'hippodromes doublonnes (scoreAptitude, sous-score Lieu)

**Constat de depart (a la demande de l'utilisateur)** : en comparant, sur la
fiche cheval, une course archivee (VINCENNES, 24/08/2026) avec un recalcul
via le moteur de production sur le fichier archive de ce jour, l'utilisateur
a remonte un ecart de scoreAptitude (87 affiche dans l'appli contre 71
recalcule) pour le meme cheval (HENRIQUE) sur la meme course. Les 6 autres
sous-scores (Forme, Conditions, Cote, Similaire, Bonus Rubriques) et le
Score Global concordaient parfaitement une fois l'ecart de scoreAptitude
pris en compte (delta de Score Global = delta de scoreAptitude x 25%,
exactement), isolant le probleme au seul sous-score Aptitude.

**Cause identifiee (partielle, confirmee)** : le sous-score "Lieu" de
`scoreAptitude()` (`scoringEngine.js`) comparait `perf.lieu` (l'hippodrome
d'une performance passee, lu dans le fichier musiques) a `lieuJour`
(l'hippodrome de la course du jour) par EGALITE DE TEXTE STRICTE. Or,
verifie sur un large echantillon de l'archive (423 fichiers), le fichier
musiques utilise tantot une forme, tantot une autre, pour le MEME
hippodrome : "PARIS VINCENNES" et "VINCENNES" coexistent (les 2 designent
Vincennes), de meme que "PARISLONGCHAMP" (colle, sans espace) et
"LONGCHAMP". Le nom de la reunion du jour (`context.lieu`), lui, utilise
systematiquement une seule des deux formes selon l'hippodrome ("VINCENNES"
pour les reunions a Vincennes, "PARISLONGCHAMP" pour Longchamp) - donc une
partie de l'historique d'un cheval a CE MEME hippodrome etait ignoree a
tort des lors qu'elle etait enregistree sous l'autre forme. Cas HENRIQUE :
sur ses 6 courses passees a Vincennes (10 dernieres performances), seules 3
etaient comptees (celles en "VINCENNES" exact) - dont sa seule victoire a
Vincennes (le 02/05/2026, enregistree "PARIS VINCENNES") etait donc omise
du sous-score Lieu.

**Correctif implemente** : nouvelle fonction exportee
`normaliserHippodrome(nom)` (`scoringEngine.js`) qui ramene les formes
doublonnees connues a une forme canonique commune (table
`SYNONYMES_HIPPODROME` : `'PARIS VINCENNES' -> 'VINCENNES'`,
`'PARISLONGCHAMP' -> 'LONGCHAMP'`), appliquee aux deux cotes de la
comparaison (`lieuJour` ET `perf.lieu`) dans `scoreAptitude()`. Cas
HENRIQUE re-verifie apres correctif : scoreAptitude passe de 71 a 75,17 (le
sous-score Lieu compte desormais les 6 courses a Vincennes, dont la
victoire du 02/05/2026, au lieu de 3).

**Ecart restant, cause racine trouvee (meme mise a jour, suite)** : le
correctif ci-dessus (71 -> 75,17) ne comblait pas tout l'ecart observe par
l'utilisateur (87 affiche dans l'appli). A sa demande, l'utilisateur a
consulte la liste complete de l'historique d'HENRIQUE affichee sur la fiche
cheval elle-meme (section "Historique (N courses connues)", deja presente
dans l'appli, sous les barres de score) : **14 courses connues**, alors que
le fichier archive du 24/08/2026 seul n'en contient que 10 (12 courses
reelles distinctes). Comparaison ligne a ligne : la place du 13/05/2026 a
Vincennes et la victoire du 02/05/2026 a Vincennes existaient CHACUNE en
DOUBLE dans la base locale de l'utilisateur - une fois enregistree sous
"PARIS VINCENNES", une fois sous "VINCENNES" (memes date/distance/place/
discipline sinon). Le bouton "Nettoyer les doublons d'historique" (deja
existant, cf. mise a jour (20) plus haut) ne les avait PAS reconnues comme
doublons : `DB.dedupePerformances()` regroupe les performances par
`clePerformance()` (`js/db.js`), qui utilisait le nom d'hippodrome BRUT
(juste majuscule/trim, sans passer par `normaliserHippodrome`) - "PARIS
VINCENNES" et "VINCENNES" y produisaient donc deux cles differentes, deux
entrees jamais fusionnees.

**Consequence sur le calcul** : `scoreAptitude()` ne regarde que les 10
performances les PLUS RECENTES (`compteur >= 10` puis arret). Avec les 2
paires en double, les 2 vraies performances les plus anciennes (07/11/2025
et 24/10/2025, toutes deux a Vincennes egalement) etaient repoussees HORS
de cette fenetre de 10, remplacees par des copies redondantes des courses
du 13/05 et 02/05 - gonflant artificiellement le nombre de victoires
recentes ET le nombre de courses a distance similaire compte dans les
sous-scores Distance/Lieu/Discipline. Recalcul manuel avec ces 14 lignes
(10 dernieres, doublons inclus) : scoreAptitude = 87,0 - EXACTEMENT le
chiffre affiche par l'application. Cause racine confirmee a 100%.

**Correctif implemente (suite)** : `clePerformance()` (`js/db.js`) utilise
desormais `normaliserHippodrome(p.lieu)` (au lieu du lieu brut) pour la
partie "lieu" de sa cle deterministe. Consequence : (1) tout NOUVEL import
reconnait immediatement les 2 formes comme la meme course (upsert, plus de
doublon cree) ; (2) relancer le bouton "Nettoyer les doublons d'historique"
fusionne desormais correctement les doublons deja accumules sous les 2
formes - l'utilisateur doit le relancer une fois pour que sa base locale
retrouve ses 12 performances distinctes (au lieu de 14) pour HENRIQUE, et
plus generalement pour tout cheval touche par ce type de doublon
(Vincennes/Longchamp).

**Consequence pour la lecture des backtests de ce document** (Excel
"detail du jeu simple gagnant", tous les chiffres de rendement cites dans
ce fichier) : les scripts de backtest ad-hoc ne lisent que le fichier
musiques du jour analyse (jamais accumule, donc jamais expose a ce bug de
doublons) - ils restent fiables et reproductibles tels quels. Le bug ne
touchait QUE le calcul en direct dans l'application, via la base IndexedDB
accumulee de l'utilisateur (`DB.getAllPerformances()`) - desormais
corrige a la source (nouveaux imports) et reparable sur les donnees
existantes (bouton de nettoyage).

`APP_VERSION` passe a `v82` (et `CACHE_NAME` dans `sw.js` a
`turf-analyse-v82`). 3 nouveaux tests dans `tests/engine.test.js`
(`normaliserHippodrome`, comportement du sous-score Lieu avant/apres
fusion des formes doublonnees, `clePerformance` avec formes doublonnees) -
176 tests au total, tous passants.

**Nouveau cas de doublon persistant (sept 2026)** : malgre le correctif
ci-dessus, l'utilisateur a signale un nouveau doublon sur la fiche cheval
(section "Historique") - meme date (06/04/2026), meme place (1er), meme
distance (2600m ATTELE), mais 2 libelles d'hippodrome completement
differents et non lies par `normaliserHippodrome` : "BLAIN BOUVRON LE
GAVRE" et "BLAIN" (vraisemblablement la meme reunion sous 2 noms differents
selon la source/date d'export - ni prefixe/suffixe commun, ni forme
reconnue par la table de correspondance existante). Ce cas illustre que
n'importe quelle nouvelle variante de nom d'hippodrome imprevue peut
recreer le meme type de doublon, quelle que soit la richesse de la table
`normaliserHippodrome`.

**Correctif implemente (durci)** : plutot que d'ajouter une nouvelle entree
au cas par cas dans `normaliserHippodrome`, `clePerformance()` (`js/db.js`)
repose desormais uniquement sur `nomCheval + datePerf` (hippodrome,
distance, place et discipline retires de la cle). Un cheval ne pouvant
courir qu'une seule fois par jour, toute 2e ligne rapportee pour la meme
date est necessairement le meme evenement et remplace la precedente
(upsert) au lieu de s'accumuler - quel que soit le libelle d'hippodrome
recu, meme totalement inconnu de la table de normalisation. Import
`normaliserHippodrome` retire de `db.js` (devenu inutilise a cet endroit).
Comme pour le correctif precedent, relancer le bouton "Nettoyer les
doublons d'historique" fusionne les doublons deja accumules sous ce
nouveau critere.

`APP_VERSION` passe a `v83` (et `CACHE_NAME` dans `sw.js` a
`turf-analyse-v83`). Test `clePerformance` de `tests/engine.test.js`
reecrit pour ce nouveau critere (cheval+date identiques -> meme cle meme
si hippodrome totalement different ; date differente ou cheval different
-> cle differente) - 176 tests au total, tous passants.

**Cas MINNESOTA (31/08/2026) : 11 courses connues affichees pour 10 dans le
fichier musiques du jour - PAS un doublon** : suite au correctif ci-dessus,
l'utilisateur a signale un nouveau cas potentiel de doublon sur la fiche
MINNESOTA. Verification faite sur les fichiers archive fournis : les 10
premieres performances affichees correspondent EXACTEMENT aux 10 lignes du
fichier musiques du jour (memes dates), et la 11e (09/06/2025) est une
performance plus ancienne et reellement distincte, conservee d'un import
anterieur - comportement voulu de l'historique cumulatif ("rien n'est
efface", cf. carte "Historique des chevaux" page Importer), pas un doublon.

**Impact reel sur le classement, verifie fonction par fonction** : parmi les
4 fonctions de `scoringEngine.js` qui consomment `historique` (via
`h.historique` dans `raceAnalyzer.js`), 3 se bornent deja a une fenetre
recente fixe et ne sont donc pas affectees par cette 11e course : `scoreForme`
(6 courses les plus recentes), `scoreAptitude` et `scoreConditionsSimilaires`
(10 courses les plus recentes chacune). Seule `bonusReussiteHistoDeferre`
(sous-composante de `scoreConditions`, taux de podiums du cheval dans ses
courses passees en deferre, trot uniquement - cf. mise a jour (17) plus haut)
parcourait TOUT l'historique connu sans aucune limite : plus la base locale
accumule d'imports au fil des mois, plus cette fonction regarde loin dans le
passe, contrairement aux 3 autres qui restent bornees a un nombre fixe de
courses recentes - une incoherence, meme si le calcul en lui-meme restait
juste (pas de doublon compte en double). MINNESOTA courant deferre (D4) le
31/08/2026, ce bonus etait actif pour lui et donc potentiellement sensible a
cette 11e course.

**Correctif implemente (a la demande de l'utilisateur)** :
`bonusReussiteHistoDeferre()` (`js/engine/scoringEngine.js`) se borne
desormais elle aussi aux 10 courses les plus recentes
(`perfsHistorique.slice(0, 10)` avant filtrage deferre/trot), coherent avec
`scoreAptitude`. Le taux de reussite en deferre redevient ainsi un
indicateur de forme recente stable dans le temps, plutot qu'un taux "toute
carriere connue" qui derive avec la taille de la base locale de
l'utilisateur.

`APP_VERSION` passe a `v84` (et `CACHE_NAME` dans `sw.js` a
`turf-analyse-v84`). Nouveau test dans `tests/engine.test.js` verifiant
qu'une course en deferre au-dela de la 10e position la plus recente est
ignoree par le bonus (le seuil de 3 courses deferre minimum n'est atteint
que si on compte a tort au-dela de la fenetre) - 177 tests au total, tous
passants.

**Numeros des chevaux eligibles sur "Courses du jour" (sept 2026, a la
demande de l'utilisateur)** : la liste "Courses du jour" (`renderListeCourses`,
`js/app.js`) ne retient deja qu'une course si au moins un cheval du champ a
`scoreForme >= 70` ET `scoreAptitude >= 85`, mais n'affichait que la course
elle-meme (hippodrome, heure, discipline, nb partants) - il fallait cliquer
sur chaque course pour savoir QUEL(S) cheval(aux) declenchait(ent)
l'eligibilite. La boucle de construction de `courses` calcule desormais
`chevaux.filter(...)` (au lieu de `.some(...)`) pour recuperer la liste
complete des chevaux eligibles, et stocke leurs numeros
(`numerosEligibles`). Affiches sous forme de badge vert ("N&deg;X - N&deg;Y"
si plusieurs) directement dans chaque ligne de la liste, sans avoir a
ouvrir la fiche course.

`APP_VERSION` passe a `v85` (et `CACHE_NAME` dans `sw.js` a
`turf-analyse-v85`). Aucun changement moteur (uniquement `js/app.js`) - 177
tests au total, tous toujours passants.

## Verification effectuee

Le moteur de calcul (`js/engine/`) est couvert par des tests automatises
(`tests/engine.test.js`), executes reellement avec Node.js : 88 tests, tous
passants, couvrant les formules de score, les probabilites Plackett-Luce
(Victoire, Top2, Top3), le tri/classement, l'import CSV (formats standard 76
colonnes et "journee" 77 colonnes/multi-reunions, voir plus haut), le module "Base(s)
possible(s) / Danger(s)" (rubriques par discipline, criteres techniques,
niveaux de confiance, variantes independantes de la cote, critere "Top2
fiable"), le bonus Rubriques ajoute au Score Global (Module 1 v6.2), le module "Cote(s)
cible(s) la plus proche", le module "Predictions externes"
(`js/engine/predictionsExternesParser.js` : parsing du fichier tiers,
colonnes facultatives vides, lignes sans course exploitable ignorees, et les
4 cas du croisement avec la Base), le detecteur/associateur de cotes
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
