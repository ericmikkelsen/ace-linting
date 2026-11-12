# Notices for lexicon data

Entries in the generated lexicon come from the sources below. Each entry in `lexicon/oewn/oewn.jsonl` and `lexicon/dist/lexicon.pl`
traces to a source through its `source` tag, and `lexicon/dist/PROVENANCE.md` counts entries per source.

## Open English WordNet 2025 (source tag `oewn-2025`)

Release `2025-edition` of https://github.com/globalwordnet/english-wordnet, file `english-wordnet-2025-json.zip`
(sha256 `7d749f6e2c39e6970e4997839dcf6e42fd281f3c2fae0171d2192bae8cfa4b51`).
Licensed CC BY 4.0 by the Open English WordNet Team (Copyright (c) 2019-present), which is derived from
Princeton WordNet 3.1 (Copyright 2011 by Princeton University. All rights reserved.) under the WordNet license.
Full texts: `lexicon/licenses/oewn-LICENSE.md` and `lexicon/licenses/oewn-WNDB_License.txt`.
We took lemmas by part of speech, irregular forms, lexicographer categories (for the noun gender hint) and verb frames
(as a fallback), and changed them into the lexicon format; the entries are modified material.
The name of Princeton University is not used in advertising or publicity.

## VerbNet 3.4 (source tag `oewn-2025+verbnet-3.4`: WordNet words with VerbNet frames)

https://github.com/cu-clear/verbnet, folder `verbnet3.4`, commit `ae8e9cfdc2c0d3414b748763612f1a0a34194cc1`.
VerbNet 3.0 (or 3.X) Copyright 2009 by University of Colorado. All rights reserved. Used under the VerbNet 3.x license:
`lexicon/licenses/verbnet-3.x-license.txt`. We used its verb member lists and syntax frame descriptions to decide which verbs
take no object, one object, or two objects. The names of the University of Colorado and "CU" are not used in advertising or publicity.
When describing applications based on VerbNet, cite: Kipper, Korhonen, Ryant and Palmer (2008), *Language Resources and Evaluation*.

## Core vocabulary (source tag `core`) and inflection overrides

Written by the ace-linting authors and dedicated to the public domain (CC0 1.0): `lexicon/core/`, and `lexicon/oewn/overrides.json`.

## Synonym index (generated)

`lexicon/dist/synonyms.json`, built by `scripts/build-synonyms.ts`, contains synonym sets and definitions from Open English WordNet 2025 and is covered by the same notices as above (CC BY 4.0 and the Princeton WordNet license; credit Princeton WordNet and the Open English WordNet team).
