"""Rendre un PDF en images, une par page, pour le relire d'un coup d'œil.

    pip install pymupdf
    python3 outils/pdf-en-images.py /tmp/captures/technique-partage.pdf

Compagnon de capture-pdf.cjs : celui-ci produit le document, celui-là le donne
à voir. Sans quoi un export ne se vérifie qu'en l'ouvrant à la main, c'est-à-dire
en pratique jamais.
"""
import sys
import pathlib
import fitz


def rendre(chemin, zoom=2.0):
    doc = fitz.open(chemin)
    base = pathlib.Path(chemin).with_suffix("")
    sorties = []
    for i, page in enumerate(doc, start=1):
        pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom))
        sortie = f"{base}-p{i}.png"
        pix.save(sortie)
        sorties.append(sortie)
    print(f"{len(doc)} page(s) : " + ", ".join(sorties))
    return sorties


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("usage : python3 outils/pdf-en-images.py <fichier.pdf>")
    rendre(sys.argv[1])
