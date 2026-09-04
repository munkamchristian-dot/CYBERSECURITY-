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
 * A dossier is counted as "réellement en cours de traitement" (OK) only
 * when BOTH are true:
 *   - the status label on the page matches "en cours de traitement"
 *   - at least one attachment (pièce jointe) link is present on the page
 *
 * Every other matricule (dossier introuvable, statut différent, ou
 * dossier "en cours" affiché sans pièce jointe chargée) is classé PAS OK,
 * avec la raison associée.
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
 *
 * Sorties générées : un CSV détaillé et un document Word (.docx) listant
 * séparément les matricules OK et PAS OK — le .docx est construit
 * entièrement côté client (mini écrivain ZIP + XML WordprocessingML),
 * sans dépendance externe ni appel réseau autre que vers le site cible.
 */
(async () => {
    const debut = 1;
    const fin = 338;
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

    // --- Mini-écrivain ZIP (méthode "store", sans compression, sans
    // dépendance externe) — sert de base au fichier .docx (qui est un ZIP
    // contenant des XML WordprocessingML) ---
    const crcTable = (() => {
        const table = [];
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) {
                c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            }
            table[n] = c >>> 0;
        }
        return table;
    })();

    function crc32(bytes) {
        let crc = 0xFFFFFFFF;
        for (let i = 0; i < bytes.length; i++) {
            crc = (crc >>> 8) ^ crcTable[(crc ^ bytes[i]) & 0xFF];
        }
        return (crc ^ 0xFFFFFFFF) >>> 0;
    }

    function dosDateTime(date = new Date()) {
        const time = ((date.getHours() & 0x1F) << 11) | ((date.getMinutes() & 0x3F) << 5) | ((date.getSeconds() >> 1) & 0x1F);
        const dosDate = (((date.getFullYear() - 1980) & 0x7F) << 9) | (((date.getMonth() + 1) & 0xF) << 5) | (date.getDate() & 0x1F);
        return { time, dosDate };
    }

    class ZipWriter {
        constructor() {
            this.chunks = [];
            this.centralDirectory = [];
            this.offset = 0;
        }

        addFile(name, data) {
            const nameBytes = new TextEncoder().encode(name);
            const crc = crc32(data);
            const { time, dosDate } = dosDateTime();

            const localHeader = new Uint8Array(30 + nameBytes.length);
            const view = new DataView(localHeader.buffer);

            view.setUint32(0, 0x04034b50, true);
            view.setUint16(4, 20, true);
            view.setUint16(6, 0, true);
            view.setUint16(8, 0, true);
            view.setUint16(10, time, true);
            view.setUint16(12, dosDate, true);
            view.setUint32(14, crc, true);
            view.setUint32(18, data.length, true);
            view.setUint32(22, data.length, true);
            view.setUint16(26, nameBytes.length, true);
            view.setUint16(28, 0, true);
            localHeader.set(nameBytes, 30);

            this.centralDirectory.push({ nameBytes, crc, size: data.length, offset: this.offset, time, dosDate });

            this.chunks.push(localHeader, data);
            this.offset += localHeader.length + data.length;
        }

        finalize() {
            const centralChunks = [];
            let centralSize = 0;
            const centralOffset = this.offset;

            for (const entry of this.centralDirectory) {
                const header = new Uint8Array(46 + entry.nameBytes.length);
                const view = new DataView(header.buffer);

                view.setUint32(0, 0x02014b50, true);
                view.setUint16(4, 20, true);
                view.setUint16(6, 20, true);
                view.setUint16(8, 0, true);
                view.setUint16(10, 0, true);
                view.setUint16(12, entry.time, true);
                view.setUint16(14, entry.dosDate, true);
                view.setUint32(16, entry.crc, true);
                view.setUint32(20, entry.size, true);
                view.setUint32(24, entry.size, true);
                view.setUint16(28, entry.nameBytes.length, true);
                view.setUint16(30, 0, true);
                view.setUint16(32, 0, true);
                view.setUint16(34, 0, true);
                view.setUint16(36, 0, true);
                view.setUint32(38, 0, true);
                view.setUint32(42, entry.offset, true);
                header.set(entry.nameBytes, 46);

                centralChunks.push(header);
                centralSize += header.length;
            }

            const endRecord = new Uint8Array(22);
            const endView = new DataView(endRecord.buffer);
            endView.setUint32(0, 0x06054b50, true);
            endView.setUint16(4, 0, true);
            endView.setUint16(6, 0, true);
            endView.setUint16(8, this.centralDirectory.length, true);
            endView.setUint16(10, this.centralDirectory.length, true);
            endView.setUint32(12, centralSize, true);
            endView.setUint32(16, centralOffset, true);
            endView.setUint16(20, 0, true);

            return new Blob([...this.chunks, ...centralChunks, endRecord], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
        }
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
            ["Matricule", "Existe", "Statut affiché", "Affiché en cours de traitement", "Pièces jointes", "Réellement en cours de traitement", "Raison", "Lien"],
            ...donnees.map(x => [
                x.Matricule,
                x.Existe,
                x.Statut,
                x.AfficheEnCours,
                x.NombrePiecesJointes,
                x.ReellementEnCours,
                x.Raison,
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

    // --- Génération du document Word (.docx) ---

    function xmlEscape(texte) {
        return String(texte)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&apos;");
    }

    function paragrapheXml(texte, { gras = false, taille = 22, avant = 0, apres = 120 } = {}) {
        return `<w:p><w:pPr><w:spacing w:before="${avant}" w:after="${apres}"/></w:pPr><w:r><w:rPr>${gras ? "<w:b/>" : ""}<w:sz w:val="${taille}"/></w:rPr><w:t xml:space="preserve">${xmlEscape(texte)}</w:t></w:r></w:p>`;
    }

    function celluleXml(texte, { gras = false } = {}) {
        return `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr><w:p><w:r><w:rPr>${gras ? "<w:b/>" : ""}</w:rPr><w:t xml:space="preserve">${xmlEscape(texte)}</w:t></w:r></w:p></w:tc>`;
    }

    function ligneXml(cellules, options) {
        return `<w:tr>${cellules.map(c => celluleXml(c, options)).join("")}</w:tr>`;
    }

    function tableauXml(entetes, lignes) {
        const bordures = `<w:tblBorders>
            <w:top w:val="single" w:sz="4" w:color="999999"/>
            <w:left w:val="single" w:sz="4" w:color="999999"/>
            <w:bottom w:val="single" w:sz="4" w:color="999999"/>
            <w:right w:val="single" w:sz="4" w:color="999999"/>
            <w:insideH w:val="single" w:sz="4" w:color="999999"/>
            <w:insideV w:val="single" w:sz="4" w:color="999999"/>
        </w:tblBorders>`;

        if (lignes.length === 0) {
            return paragrapheXml("(aucun)", { taille: 20 });
        }

        return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>${bordures}</w:tblPr>${ligneXml(entetes, { gras: true })}${lignes.map(l => ligneXml(l)).join("")}</w:tbl>`;
    }

    function exporterDocx(donnees, compteurs) {
        const debutTag = String(debut).padStart(5, "0");
        const finTag = String(fin).padStart(5, "0");
        const dateGeneration = new Date().toLocaleString("fr-FR");

        const ok = donnees.filter(x => x.ReellementEnCours === "OUI");
        const pasOk = donnees.filter(x => x.ReellementEnCours !== "OUI");

        const corps = [
            paragrapheXml("Rapport de vérification des dossiers en cours de traitement", { gras: true, taille: 32, apres: 200 }),
            paragrapheXml(`Plage vérifiée : 26SP${debutTag} à 26SP${finTag}`, { taille: 20 }),
            paragrapheXml(`Généré le : ${dateGeneration}`, { taille: 20, apres: 240 }),

            paragrapheXml("Résumé", { gras: true, taille: 26, apres: 160 }),
            paragrapheXml(`Matricules vérifiés : ${donnees.length}`, { taille: 20 }),
            paragrapheXml(`Dossiers existants : ${compteurs.dossiersExistants}`, { taille: 20 }),
            paragrapheXml(`Affichent le statut "en cours de traitement" : ${compteurs.afficheEnCoursCount}`, { taille: 20 }),
            paragrapheXml(`Sans pièce jointe chargée : ${compteurs.sansPieceJointeCount}`, { taille: 20 }),
            paragrapheXml(`Dossiers OK — réellement en cours de traitement : ${ok.length}`, { gras: true, taille: 20 }),
            paragrapheXml(`Dossiers PAS OK : ${pasOk.length}`, { gras: true, taille: 20, apres: 240 }),

            paragrapheXml(`Dossiers OK (${ok.length})`, { gras: true, taille: 26, apres: 160 }),
            tableauXml(["Matricule", "Statut", "Pièces jointes", "Lien"], ok.map(x => [x.Matricule, x.Statut, String(x.NombrePiecesJointes), x.Lien])),

            paragrapheXml("", { avant: 240, apres: 0 }),

            paragrapheXml(`Dossiers PAS OK (${pasOk.length})`, { gras: true, taille: 26, avant: 240, apres: 160 }),
            tableauXml(["Matricule", "Existe", "Statut", "Raison"], pasOk.map(x => [x.Matricule, x.Existe, x.Statut, x.Raison]))
        ].join("");

        const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${corps}<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;

        const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;

        const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

        const zip = new ZipWriter();
        const encodeur = new TextEncoder();

        zip.addFile("[Content_Types].xml", encodeur.encode(contentTypesXml));
        zip.addFile("_rels/.rels", encodeur.encode(relsXml));
        zip.addFile("word/document.xml", encodeur.encode(documentXml));

        telechargerBlob(zip.finalize(), `dossiers_en_traitement_26SP${debutTag}_a_26SP${finTag}.docx`);

        console.log(`📄 Document Word téléchargé (${ok.length} OK / ${pasOk.length} pas OK)`);
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

                let raison = "";
                if (!existe) {
                    raison = "Dossier introuvable";
                } else if (!afficheEnCours) {
                    raison = "Statut différent de \"en cours de traitement\"";
                } else if (nombrePiecesJointes === 0 || aucunePieceJointeExplicite) {
                    raison = "Aucune pièce jointe chargée";
                } else {
                    raison = "OK";
                }

                resultat.push({
                    Matricule: matricule,
                    Existe: existe ? "OUI" : "NON",
                    Statut: statut,
                    AfficheEnCours: afficheEnCours ? "OUI" : "NON",
                    NombrePiecesJointes: nombrePiecesJointes,
                    ReellementEnCours: reellementEnCours ? "OUI" : "NON",
                    Raison: raison,
                    Lien: existe
                        ? new URL(url, window.location.origin).href
                        : ""
                });

                console.log(
                    `${i}/${fin} — ${matricule} → ${existe ? "✅" : "❌"} ` +
                    (existe ? `[${statut || "statut inconnu"}] pj=${nombrePiecesJointes} → ${reellementEnCours ? "✔️ en traitement" : "⚠️ " + raison}` : "")
                );

            } catch (erreur) {
                resultat.push({
                    Matricule: matricule,
                    Existe: "ERREUR",
                    Statut: "",
                    AfficheEnCours: "NON",
                    NombrePiecesJointes: 0,
                    ReellementEnCours: "NON",
                    Raison: "Erreur réseau",
                    Lien: ""
                });

                console.log(`${i}/${fin} — ${matricule} → ⚠️ ERREUR`);
            }

            await new Promise(resolve => setTimeout(resolve, 150));
        }
    } finally {
        const compteurs = { dossiersExistants, afficheEnCoursCount, sansPieceJointeCount, reellementEnCoursCount };

        exporterCSV(resultat);
        exporterDocx(resultat, compteurs);

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
