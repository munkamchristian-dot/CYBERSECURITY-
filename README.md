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
  `verify-matricules-filieres.js`, but for each existing dossier checks
  whether it is *actually* "en cours de traitement": it looks at the
  displayed status label and at whether any pièce jointe (attachment) was
  actually uploaded. A dossier only counts as genuinely in processing when
  both conditions hold — some dossiers display the "en cours de
  traitement" status without any attachment loaded, and are reported
  separately as incomplete. At the end it prints a summary count (total
  checked, existing dossiers, dossiers displaying the status, dossiers
  without an attachment, and dossiers genuinely in processing) and exports
  a CSV with the per-dossier detail.
