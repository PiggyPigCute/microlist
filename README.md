# microlist

Annuaire coopératif des micronations. N'importe qui peut proposer l'ajout d'une
micronation ou la modification d'une entrée existante ; un administrateur valide ou
refuse ces propositions (et peut aussi éditer directement).

## Installation

```
npm install
```

## Configurer le mot de passe admin

Générer un hash à partir d'un mot de passe :

```
node scripts/hash-password.js "motdepasse"
```

Coller le résultat (`salt:hash`) dans `data/admin-password.json` :

```json
{ "hash": "salt:hash" }
```

Tant que ce fichier n'existe pas ou que `hash` vaut `null`, la connexion admin
(`/admin/login`) est désactivée.

## Lancer le serveur

```
npm start
```

Le site écoute sur `http://localhost:3000` par défaut (`PORT` pour changer le port).

## Structure

- `server.js` — API Express + service des pages statiques (`public/`) et des images
  uploadées (`uploads/`).
- `data/entries.json` — micronations publiées.
- `data/proposals.json` — propositions (ajout ou modification) en attente de validation.
- `data/admin-password.json`, `data/session-secret` — auth admin, générés/à remplir en
  local, jamais commités.
- `uploads/` — drapeaux et armoiries uploadés, jamais commités.

## Utilisation

- `/` — liste des micronations, avec recherche.
- `/entry/<id>` — détail d'une entrée, avec bouton "Proposer une modification".
- `/propose` — proposer une nouvelle entrée. `/propose/<id>` — proposer une modification.
- `/admin` — dashboard admin (après connexion sur `/admin/login`) : valider/refuser les
  propositions, ajouter/modifier/supprimer des entrées directement.
