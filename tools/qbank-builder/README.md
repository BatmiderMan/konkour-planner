# qbank-builder — how «nardebaam12-handese3.qbank» was made (Python 3, opencv, pillow, pymupdf, tesseract not needed any more)

Specific to the layout of this book (numbered tests «۸۹- …» at the right margin, 720 px wide page scans); for another book the page
ranges / margins in `det5.py`, `boxes.py` and `cut2.py` have to be adapted. Pipeline:

1. `det5.py`  find every «NN-» test marker (a dash with digits that END at the page's right margin).
2. `digits.py`/`num2.py`  read the number of each marker with a small k-NN trained on the book's own digits, then align the readings to the
   consecutive sequence 1..N with dynamic programming (`dp.py`): missing / false markers show up as gaps. Leave-one-out accuracy 545/546.
3. `cut2.py`  cut each question between its marker and the next (blank-gap boundaries, lesson banners and example boxes end a question).
4. the answer key pages are read with the planner's own key scanner (src/checker/engine) — see tools/keyscan-harness.
5. write the pack: «QBK1» + uint32 header length + JSON header + WebP images (format: src/bank/pack.ts).

Known limits for this book: tests 550–562 have a key but their pages are not in the PDF; a few crops carry a sliver of the neighbouring question.
