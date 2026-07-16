---
'@formflowjs/core': patch
---

Resolve conditional visibility through the complete source graph so rendered fields, client validation, and serialized submissions stay aligned with the FormFlow plugin. Invalid, hidden, ambiguous, layout-only, and cyclic sources now fail closed.
