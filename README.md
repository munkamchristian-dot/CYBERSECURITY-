# CYBERSECURITY-

Scripts and notes from authorized security-testing engagements.

## Contents

- `scripts/verify-matricules-filieres.js` — Browser-console proof-of-concept
  used during an authorized pentest / bug bounty engagement to verify an
  IDOR (Insecure Direct Object Reference) finding on an exam registration
  portal: a sequential/guessable registration number (`matricule`) in the
  URL returns another candidate's record (including their name, date of
  birth, spécialité, filière and dossier processing status) to any
  unauthenticated visitor, with no ownership check on the requester.

  Run it in the browser DevTools console **only** while working within the
  scope of an engagement you are explicitly authorized for, and only for the
  volume of evidence the engagement's rules of engagement call for. It
  exports two files as findings-report evidence:
  - a CSV summary (matricule, existence, nom, date de naissance, spécialité,
    filière, statut du dossier — "En cours de traitement", "REJETÉ POUR
    <motif>" with the rejection reason as shown on the page, or blank when
    no status is displayed — whether the fiche was archived, and the direct
    link);
  - a ZIP archive containing each exposed candidate's printable "fiche
    d'inscription" (fetched via the "Imprimer la fiche d'inscription" link,
    falling back to the candidate page itself if no distinct print link is
    found), built client-side with a small dependency-free store-only ZIP
    writer — no external library or network call beyond the target site.
