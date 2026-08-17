# CYBERSECURITY-

Scripts and notes from authorized security-testing engagements.

## Contents

- `scripts/verify-matricules-filieres.js` — Browser-console proof-of-concept
  used during an authorized pentest / bug bounty engagement to verify an
  IDOR (Insecure Direct Object Reference) finding on an exam registration
  portal: a sequential/guessable registration number (`matricule`) in the
  URL returns another candidate's record (including their `filière`) to
  any unauthenticated visitor, with no ownership check on the requester.

  Run it in the browser DevTools console **only** while working within the
  scope of an engagement you are explicitly authorized for. It exports a
  CSV summary (matricule, whether the record exists, the exposed filière,
  and the direct link) to use as evidence in the findings report.
