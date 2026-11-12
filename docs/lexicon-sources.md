# Lexicon sources: license findings (step L0)

Read 2026-11-11. Not legal advice. When we ingest a source, copy its full license text into `lexicon/licenses/` (raw text, not these summaries).

## Open English WordNet 2025 (github.com/globalwordnet/english-wordnet)

- Read: `WNDB_License.txt` from the repo (raw text), and `LICENSE.md`.
- Terms: Open English WordNet is CC BY 4.0. It sits on Princeton WordNet 3.1 (Copyright 2011 Princeton University). Permission is granted to use, copy, modify and distribute the database for any purpose without fee, provided the copyright notice, the statements and the disclaimer appear on all copies, including modified ones.
- Also: Princeton's name may not be used in advertising or publicity; Princeton keeps title to the copyright.
- What we must do: carry both notices and the disclaimer with any lexicon entries derived from it; credit Princeton WordNet and the Open English WordNet team; never use Princeton's name in promotion.
- Compatible with shipping inside a GPL-3.0-only package: yes (attribution-style terms, no share-alike).

## VerbNet 3.x (University of Colorado; data at github.com/cu-clear/verbnet, folder `verbnet3.4`)

- Read: the VerbNet 3.0 license text from `verbs.colorado.edu` (via a fetch summary, not raw text; keep the raw text when we download the data). It states it also applies to 3.X versions. The GitHub repo itself carries no license file.
- Terms: use, copy, modify and distribute for any purpose, including commercial use, with no fee. Every copy, including modified ones, keeps the copyright notice, the license statements and the disclaimer. Copyright stays with the University of Colorado.
- Attribution: when describing applications based on VerbNet, cite Kipper, Korhonen, Ryant and Palmer (2008), *Language Resources and Evaluation*, and/or Kipper Schuler, Korhonen and Brown (2009), NAACL-HLT tutorial.
- Also: the University of Colorado and "CU" names may not be used in advertising or publicity.
- Compatible with shipping inside a GPL-3.0-only package: yes (permissive, notice-preserving terms).
- Earlier searches found no evidence that VerbNet itself is CC BY 4.0; NextKB's CC BY 4.0 covers NextKB, which points back to Colorado's license for the VerbNet parts.

## What VerbNet gives us (checked on `give-13.1.xml`)

- Each class file lists members (`name="lend"`) with WordNet sense keys (`wn="lend%2:40:00"`), so mapping VerbNet verbs to Open English WordNet senses is direct.
- Each class lists syntax frames (e.g. NP V NP; NP V NP PREP NP). We can derive our verb classes from them: any frame NP V NP means transitive; a frame with no object means intransitive; frames with two objects or an object plus a "to/for" phrase mean ditransitive. About 330 class files exist in 3.4.

## Decision

- Verb frames come from VerbNet 3.4. Verbs not in VerbNet fall back to WordNet sentence frames, and anything still unclear is left out or set in an overrides file.
- Both sources are acceptable to ship (derived entries only, with notices), subject to carrying the notices above.

## Still unread

- The full text of VerbNet's license as a raw file (read it when downloading the data).
- Wiktionary's attribution wording for Wiktextract data (only if L4 is triggered).
