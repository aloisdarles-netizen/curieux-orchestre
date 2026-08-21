#!/usr/bin/env python3
"""Vérifie assets/qr.js — l'encodeur QR écrit à la main pour le PDF de prise en main.

Un encodeur QR faux produit un carré d'allure parfaitement normale qu'aucun
téléphone ne lit : le relire à l'œil ne prouve rien. On vérifie donc deux
choses, sur une série de textes couvrant les versions 1 à 10, l'ASCII et l'UTF-8 :

1. Un décodeur relit le symbole et retrouve le texte de départ. C'est la seule
   propriété qui compte vraiment.
2. La matrice est comparée à celle de python-qrcode, quand la comparaison a un
   sens. Deux écarts sont légitimes et attendus :
   - python-qrcode choisit le mode d'encodage le plus compact (numérique,
     alphanumérique) là où qr.js n'encode qu'en octets. Sur un texte que
     python-qrcode encode autrement, les deux symboles n'ont aucune raison de
     coïncider — on s'en tient alors au décodage.
   - à mode égal, python-qrcode choisit son masque en évaluant une matrice de
     test, pas la matrice finale, et retient donc parfois un masque moins bon.
     On n'échoue que si notre masque est réellement moins bon que le sien,
     mesuré par la fonction de pénalité de python-qrcode elle-même.

    pip install qrcode opencv-python-headless numpy
    python3 outils/verifier-qr.py
"""
import json
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np
import qrcode
import qrcode.util
from qrcode.constants import ERROR_CORRECT_M

RACINE = Path(__file__).resolve().parent.parent

CAS = [
    "A",
    "https://prod.lessoudaines.fr/mon-espace.html?token=abc123",
    "https://prod.lessoudaines.fr/mon-espace.html?token=" + "0123456789abcdef" * 2,
    "https://prod.lessoudaines.fr/mon-espace.html?token=" + "0123456789abcdef" * 4,
    "Prénom Nom — accès personnel — Curieux orchestre æøå",
    "x" * 180,
]


def matrice_js(texte):
    # qr.js est un script classique, pas un module : le navigateur le charge par
    # <script src>. On le rejoue donc tel quel dans un contexte vm, et non par
    # require() — le paquet est en "type": "module", et l'important est de
    # vérifier le fichier que la page exécutera vraiment.
    chemin = json.dumps(str(RACINE / "assets" / "qr.js"))
    script = f"""
      const fs = require('node:fs');
      const vm = require('node:vm');
      const contexte = {{ TextEncoder }};
      vm.createContext(contexte);
      vm.runInContext(fs.readFileSync({chemin}, 'utf8'), contexte);
      const r = contexte.genererMatriceQr({json.dumps(texte)});
      console.log(JSON.stringify({{
        version: r.version,
        modules: r.modules.map(l => l.map(v => (v ? 1 : 0))),
      }}));
    """
    sortie = subprocess.run(
        ["node", "-e", script], capture_output=True, text=True, check=True
    )
    return json.loads(sortie.stdout)


def matrice_reference(texte):
    qr = qrcode.QRCode(error_correction=ERROR_CORRECT_M, border=0)
    qr.add_data(texte)
    qr.make(fit=True)
    return {
        "version": qr.version,
        "modules": [[1 if v else 0 for v in ligne] for ligne in qr.get_matrix()],
    }


def decoder(modules, echelle=8, marge=4):
    """Rend la matrice en image et la relit avec le décodeur d'OpenCV."""
    n = len(modules)
    total = n + marge * 2
    image = np.full((total, total), 255, dtype=np.uint8)
    for y in range(n):
        for x in range(n):
            if modules[y][x]:
                image[y + marge, x + marge] = 0
    grande = cv2.resize(
        image, (total * echelle, total * echelle), interpolation=cv2.INTER_NEAREST
    )
    texte, _, _ = cv2.QRCodeDetector().detectAndDecode(grande)
    return texte


def main():
    echecs = 0
    for texte in CAS:
        apercu = texte if len(texte) <= 42 else texte[:39] + "…"
        try:
            a = matrice_js(texte)
        except subprocess.CalledProcessError as e:
            print(f"✗ {apercu!r}\n  qr.js a levé : {e.stderr.strip().splitlines()[-1]}")
            echecs += 1
            continue
        b = matrice_reference(texte)

        relu = decoder(a["modules"])
        if relu != texte:
            print(f"✗ {apercu!r} — relu comme {relu!r}")
            echecs += 1
            continue

        # Le mode retenu par python-qrcode conditionne la comparaison : sur un
        # texte purement alphanumérique il produit un symbole plus compact, que
        # qr.js — volontairement limité au mode octet — ne peut pas égaler.
        if qrcode.util.optimal_mode(texte.encode()) != qrcode.util.MODE_8BIT_BYTE:
            print(
                f"✓ {apercu!r} — version {a['version']}, relu à l'identique "
                f"(python-qrcode encode ce texte dans un mode plus compact, "
                f"pas de comparaison de matrice)"
            )
            continue

        if a["version"] != b["version"]:
            print(f"✗ {apercu!r} — version {a['version']} au lieu de {b['version']}")
            echecs += 1
            continue

        if a["modules"] == b["modules"]:
            detail = "matrice identique à python-qrcode"
        else:
            mien = qrcode.util.lost_point([[bool(v) for v in l] for l in a["modules"]])
            sien = qrcode.util.lost_point([[bool(v) for v in l] for l in b["modules"]])
            if mien > sien:
                print(
                    f"✗ {apercu!r} — masque moins bon que la référence "
                    f"(pénalité {mien} contre {sien})"
                )
                echecs += 1
                continue
            detail = f"masque différent, pénalité {mien} ≤ {sien}"

        print(f"✓ {apercu!r} — version {a['version']}, relu à l'identique, {detail}")

    if echecs:
        print(f"\n{echecs} cas en échec.")
        return 1
    print(f"\n{len(CAS)} cas : tous relus à l'identique par un décodeur.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
