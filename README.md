# CYBERSECURITY-

Scripts and notes from authorized security-testing engagements.

## Contents

- `scripts/verify-matricules-filieres.js` — Browser-console proof-of-concept
  used during an authorized pentest / bug bounty engagement to verify an
  IDOR (Insecure Direct Object Reference) finding on an exam registration
  portal: a sequential/guessable registration number (`matricule`) in the
  URL returns another candidate's record (including their name, date of
  birth, spécialité and filière) to any unauthenticated visitor, with no
  ownership check on the requester.

  Run it in the browser DevTools console **only** while working within the
  scope of an engagement you are explicitly authorized for, and only for the
  volume of evidence the engagement's rules of engagement call for. It
  exports two files as findings-report evidence:
  - a CSV summary (matricule, existence, nom, date de naissance, spécialité,
    filière, whether the fiche was archived, and the direct link);
  - a ZIP archive containing each exposed candidate's printable "fiche
    d'inscription" (fetched via the "Imprimer la fiche d'inscription" link,
    falling back to the candidate page itself if no distinct print link is
    found), built client-side with a small dependency-free store-only ZIP
    writer — no external library or network call beyond the target site.

- `scripts/build-inscriptions-recap.py` — turns the ZIP of harvested fiches
  (and, optionally, a dossier-status report `.docx` with the same shape) into
  a filière/région/statut recap workbook, for quantifying an IDOR's impact
  in a bug bounty report (e.g. "N candidate records exposed across every
  région and filière"). Generic over the input files — no matricule range or
  filename is hardcoded — so it can be rerun on a future session's harvest:

  ```
  pip install -r scripts/requirements-inscriptions-recap.txt
  python scripts/build-inscriptions-recap.py --zip fiches.zip --out recap.xlsx
  python scripts/build-inscriptions-recap.py --zip fiches.zip --rapport dossiers.docx --out recap.xlsx
  ```

  Only the script is meant to be committed here — the harvested ZIP/DOCX
  inputs and the generated `.xlsx` carry real candidates' personal data and
  are gitignored; keep their volume and retention to what the engagement's
  rules of engagement call for, and delete them once the report is filed.
