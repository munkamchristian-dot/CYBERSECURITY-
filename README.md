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

- `scripts/compter-dossiers-en-traitement.js` — Browser-console
  companion script that sweeps the same matricule range as
  `verify-matricules-filieres.js`, and for each existing dossier reads the
  displayed status label to tell whether it is "en cours de traitement" or
  not. At the end it prints a summary count (total checked, existing
  dossiers, dossiers genuinely in processing) and exports both a detailed
  CSV and a Word (.docx) report listing the OK matricules (status "en
  cours de traitement") separately from the PAS OK ones (with the reason:
  not found, or a different status) — the .docx is built entirely
  client-side (a small store-only ZIP writer plus WordprocessingML XML),
  no external library or network call beyond the target site.
