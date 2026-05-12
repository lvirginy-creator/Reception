# Guide utilisateur — Application Réception

## À qui s'adresse ce guide ?

Ce guide s'adresse aux **magasiniers** et aux **responsables** qui utilisent l'application tablette pour saisir et valider les réceptions de marchandises.

---

## 1. Se connecter

1. Sur la tablette, ouvrez le navigateur et accédez à l'adresse de l'application (votre responsable ou l'administrateur vous la communique).
2. Entrez le **code magasin** (ex. : `PAP` pour Pointe-à-Pitre Centre).
3. Tapez votre **PIN** (4 à 6 chiffres) sur le clavier à l'écran.
4. Appuyez sur **Se connecter**.

> **Attention** : après 5 tentatives incorrectes, votre PIN est bloqué pendant 10 minutes.
> En cas de blocage, contactez votre responsable ou l'administrateur.

---

## 2. La liste des réceptions (magasinier)

Après connexion, vous voyez la liste des réceptions de votre magasin, divisée en deux sections :

| Section | Description |
|---|---|
| **En attente** | Réceptions à saisir (statut *En cours*) |
| **Terminées** | Réceptions transmises au responsable (statut *Prête*, *Validée*, *Envoyée*) |

**Filtres disponibles** (barre en haut) :
- Par statut
- Par fournisseur (tapez quelques lettres)
- Bouton **↻** pour rafraîchir

Chaque carte affiche : le numéro d'engagement (EN), le fournisseur, la date, le nombre de lignes saisies sur le total, et une barre de progression.

---

## 3. Saisir une réception

### 3.1 Ouvrir une réception

Touchez la carte de la réception à saisir. Vous arrivez sur l'écran de saisie.

### 3.2 Mode saisie à l'aveugle

Par défaut, les **quantités attendues sont masquées** pour vous inciter à compter indépendamment. C'est le mode recommandé. Votre responsable peut le désactiver depuis son écran de validation.

### 3.3 Saisir les quantités

Pour chaque ligne (article) :

1. Touchez le champ quantité (chiffre à droite).
2. Entrez la quantité comptée (0 si l'article est absent).
3. Touchez ailleurs ou appuyez sur Suivant → la saisie est **sauvegardée automatiquement**.

> **Quantité 0** : saisissez bien 0 si l'article n'est pas arrivé. Ne laissez pas le champ vide.

### 3.4 Ajouter un commentaire

Touchez une ligne pour la développer → un champ commentaire apparaît. Idéal pour noter un colis endommagé, un lot différent, etc.

### 3.5 Prendre une photo

Touchez l'icône 📷 sur une ligne pour photographier un colis endommagé ou un étiquetage particulier. La photo est compressée et envoyée automatiquement.

### 3.6 Scanner un code-barres

**Via la douchette** (scanner HID filaire ou Bluetooth) :
- Pointez le scanner vers le code-barres → la ligne correspondante est automatiquement sélectionnée.

**Via l'appareil photo** :
- Touchez l'icône 📷 dans la barre de scan → pointez la caméra vers le code-barres.

Si le code-barres est inconnu, une fenêtre s'ouvre pour rechercher l'article ou saisir un article hors commande.

### 3.7 Article hors commande

Si vous recevez un article qui n'est pas dans la réception :

1. Scannez son code-barres.
2. Si inconnu, l'application propose d'ajouter une **ligne hors commande**.
3. Renseignez la référence, la désignation et la quantité.
4. Confirmez → la ligne est ajoutée en orange.

### 3.8 Terminer la saisie

Quand toutes les lignes sont saisies (y compris les 0) :

1. Touchez **Terminer la saisie** (bouton vert en bas).
2. Confirmez → la réception passe au statut **Prête** et est transmise au responsable.
3. Vous revenez à la liste. Vous ne pouvez plus modifier cette réception.

---

## 4. Saisie hors ligne (sans Wi-Fi)

L'application fonctionne même sans connexion réseau.

- L'indicateur en haut de l'écran affiche **⚠ Hors ligne (N en attente)** quand le réseau est coupé.
- Vos saisies sont conservées localement sur la tablette.
- Dès que le Wi-Fi revient, la synchronisation se déclenche automatiquement.
- L'indicateur passe à **● Synchronisé** quand tout est envoyé.

> Ne fermez pas l'application tant que l'indicateur n'est pas revenu à *Synchronisé*.

---

## 5. La validation (responsable)

### 5.1 Voir les réceptions prêtes

Connectez-vous avec votre PIN de responsable. Les réceptions au statut **Prête** affichent un bouton **Valider cette réception**.

### 5.2 Ouvrir la vue de validation

Touchez **Valider cette réception** → vous arrivez sur l'écran de validation qui affiche :

- **Tableau de synthèse** : conformes ✓ / écarts ± / hors commande ✕
- **Tableau détaillé** : toutes les lignes avec quantités reçues et couleurs d'alerte
  - 🟢 Vert : quantité conforme
  - 🔴 Rouge : quantité inférieure à l'attendu
  - 🟠 Orange : quantité supérieure ou article hors commande

### 5.3 Mode saisie à l'aveugle (toggle)

Le bouton **Saisie à l'aveugle** (violet = actif) masque les quantités attendues dans le tableau. Désactivez-le pour voir les colonnes "Attendu".

### 5.4 Modifier une quantité

Vous pouvez corriger une quantité directement dans le tableau avant de valider.

### 5.5 Valider et envoyer

1. Touchez **Valider et envoyer**.
2. Une fenêtre de confirmation s'affiche. Touchez **Valider**.
3. Le rapport PDF est généré et envoyé par e-mail au magasin et au service achats.
4. La réception passe au statut **Validée** puis **Envoyée**.
5. Aucune modification n'est plus possible.

---

## 6. Que faire en cas de problème ?

| Problème | Solution |
|---|---|
| PIN bloqué | Attendez 10 min ou contactez votre responsable |
| Indicateur resté "Hors ligne" | Vérifiez le Wi-Fi de la tablette, quittez et relancez l'application |
| La réception n'apparaît pas | Appuyez sur ↻ pour rafraîchir ; si absent, contactez l'administrateur |
| Photo qui ne s'envoie pas | Vérifiez le réseau ; elle sera envoyée dès que le réseau revient |
| Bouton "Terminer" grisé | Des lignes sont encore vides → saisissez un 0 pour les articles absents |
