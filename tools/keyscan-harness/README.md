Offline test for the key scanner. Needs `npm i -D tsx`. 1) dump each photo to `pN.gray` (raw 8-bit grey) + `pN.json` {"w","h"} with PIL;
2) `node --max-old-space-size=3500 --import tsx run.ts pN` (edit the import path at the top of run.ts); 3) `python3 sheet.py pN <first question number>`
makes tile sheets per detected digit class: a wrong digit stands out in the wrong sheet.
