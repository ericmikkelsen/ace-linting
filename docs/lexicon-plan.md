# Plan: a clean lexicon to replace Clex

Status: DRAFT for review. Not legal advice. Nothing here is built. Facts marked "verified" were read from the source named; everything else is flagged.

## Goal

APE needs word entries in its own format. We need a lexicon whose every entry has a recorded source and a license we can meet, built from several sources, plus user-added words on top. Clex (derived from COMLEX/LDC) is out.

## What APE needs per entry (verified from `vendor/APE/prolog/lexicon/` and `ulex.pl`)

| Class | Entry shape | What we must supply |
|---|---|---|
| Common noun | `noun_sg(Form, Lemma, Gender)`, `noun_pl(...)`, `noun_mass(...)` | singular and plural forms (irregulars), countable vs mass, gender (`neutr`, `masc`, `fem`, `human`; e.g. customer is `human`, man is `masc`) |
| Proper name | `pn_sg(Name, Name, Gender)` | users add these; we ship few or none |
| Transitive verb | `tv_finsg`, `tv_infpl`, `tv_pp` | 3rd-person singular, base form, past participle |
| Intransitive verb | `iv_finsg`, `iv_infpl`, `iv_pp` | same forms |
| Ditransitive verb | `dv_finsg`, `dv_infpl`, `dv_pp` (with a preposition field) | same, plus the preposition |
| Adjective | `adj_itr`, `adj_itr_comp`, `adj_itr_sup`, `adj_tr` (+ preposition) | base, comparative, superlative |
| Adverb | `adv`, `adv_comp`, `adv_sup` | base and degree forms |
| Preposition | `prep(Form, Lemma)` | small closed set (APE has about 53) |

Rules: words that are APE function words or on its illegal-word list (`functionwords.pl`, `illegalwords.pl`, e.g. any, anybody, this) must never be added as content words. User entries can be added at runtime through `ulex:add_lexicon_entries/1` (verified), so our lexicon and user words can use the same path.

APE's small built-in lexicon is about 1,900 entries (verified count). We fetch it with APE and layer on top of it.

## Candidate sources

| Source | License (status) | What it gives us | Risks | Verdict |
|---|---|---|---|---|
| **Our own core vocabulary** | Ours | Hand-written words for project notes: people, tasks, dates, ownership, dependencies, status words | Takes writing time | **Use first.** Zero third-party risk. |
| **Open English WordNet 2025** (github.com/globalwordnet/english-wordnet) | CC BY 4.0, derived from Princeton WordNet under the WordNet license. Both require attribution; the repo's `LICENSE.md` says to attribute Princeton WordNet and the Open English WordNet team and points to `WNDB_License.txt` (verified from `LICENSE.md`; I have not read `WNDB_License.txt` itself). | Lemmas by part of speech, sense frequency counts, verb sentence frames (a hint for transitive vs intransitive), noun categories (a hint for human vs neutral gender and for mass nouns). Releases in JSON, XML and TTL (about 10 MB zipped). | WordNet has no inflected forms beyond exceptions, and its frames are coarse | **Use** for the word list and verb frames. |
| **Wiktionary via Wiktextract** (kaikki.org) | Wiktionary text is CC BY-SA 4.0 and GFDL (verified on Wiktionary's copyright page). CC says GPLv3 is a BY-SA 4.0 compatible license, one way: adaptations may be released under GPLv3 (verified). The kaikki.org page does not state a license itself (verified), so Wiktionary's applies. | Inflected forms, irregular plurals and verb forms, countable/uncountable and transitive/intransitive tags | Share-alike and attribution obligations on the derived data; large raw dumps; tag quality varies | **Use only for forms and tags, kept as a separate, removable layer**, and only if rules plus WordNet exceptions are not enough. |
| **NULEX** (McFate and Forbus, ACL 2011, Northwestern QRG) | Paper read in full: it says only "open-license" and names no license for the result; it does not discuss Wiktionary's share-alike terms. The project page asks for citation. Its successor NextKB lists CC BY 4.0 for its data (2019 files). | Confirms the recipe we plan: WordNet lemmas, plural forms and countability and verb tense forms taken from Wiktionary, and verb subcategorization frames from VerbNet. Reports 100,000+ words and a 4.6% unknown-word rate (11 of 239 unique words, not counting proper names and numbers) on 50 Simple English Wikipedia sentences. | Output is CycL assertions for a Lisp/Cyc parser, not APE format. It has no comparative or superlative forms, no proper names, no cardinal numbers, and no gender. Wiktionary was screen-scraped in 2011 and the paper admits malformed verb definitions and entries lost in scraping. Its Wiktionary-derived parts probably carry BY-SA terms the paper never mentions. | **Design reference, not a source.** We repeat the recipe with modern, structured inputs (Open English WordNet and Wiktextract JSON). Downloading it is optional, only as a cross-check. |
| **SCOWL / ESDB** (Kevin Atkinson) | MIT-like notice license (verified from its `Copyright` file), but the file notes COCA frequency data used under an NDA, that the WordNet copyright might apply, and that lists larger than size 80 add UKACD terms | A frequency-ranked word list | Extra notices and caveats for little gain, since WordNet gives us sense counts | **Not planned.** Use WordNet frequency counts instead. |
| **APE's small built-in lexicon** | LGPL header only; provenance of entries not stated | About 1,900 entries | Provenance unknown | Fetched with APE, not shipped by us. Optional question to Attempto. |
| **Clex / COMLEX** | LDC terms; redistribution of a derived lexicon not established | Large coverage | Legal | **Rejected.** |
| **VerbNet** | License not checked. | Verb subcategorization frames (np-v-np and similar) that map to our transitive, intransitive and ditransitive classes, with a published mapping to WordNet senses (per the NULEX paper). | License and current distribution must be read before use. | **Candidate for verb frames.** Check its license and the WordNet mapping first; otherwise use WordNet's own sentence frames. |
| Moby POS lists | Not checked | Word lists | Not read | Not planned. |

## What the NULEX paper tells us

- The recipe works: WordNet for coverage, Wiktionary for plural forms, countability and verb tense forms, and VerbNet for verb frames. We would reproduce it with structured data rather than screen scraping.
- Where it fell short is a checklist for us: no comparatives or superlatives (APE needs them for adjectives), no proper names, no numbers, no gender, malformed verb entries, and entries lost in scraping. Our template-sentence validation exists to catch exactly the malformed-entry and lost-entry cases.
- Its evaluation is a model for ours: run sample sentences through the parser and count unknown words. Their 4.6% unknown-word rate (excluding proper names and numbers) is a rough benchmark for our L3 coverage test.
- Proper names and numerals were their largest gaps, so we should decide early how names (user-added) and numerals (check what APE already handles) are covered.

## Pipeline

1. **Normalize.** Each source is read into a plain JSON-lines file per class, with a `source` tag and a source version or hash on every entry. Raw downloads are not committed (build-time only); we record version, retrieval date and sha256.
2. **Combine and filter.** Merge by lemma and class. Keep words that are single tokens (no spaces, digits, apostrophes), are not function or illegal words, and meet a frequency threshold from WordNet sense counts. Target for v1: our core (about 300 words) plus roughly 20,000 general words, not 100,000.
3. **Derive forms.** Plural, 3rd-person, participle and comparative forms from rules, with irregulars from WordNet exception data (and Wiktionary if we adopt it). A script, not hand-typed.
4. **Derive attributes.** Gender and mass/count from WordNet categories (and tags); transitivity from verb frames. Anything ambiguous is dropped or hand-decided in an overrides file.
5. **Generate.** Write `lexicon/dist/lexicon.pl` in APE's entry format and an updated `lexicon/PROVENANCE.md` with counts per source.
6. **Validate** (automated, part of `npm test`):
   - Every entry loads through `ulex` with no "Malformed entry" message.
   - Each entry parses in a template sentence for its class (for example "A &lt;noun&gt; waits.", "A customer &lt;verb&gt;s a card."). Failures are dropped and logged.
   - No entry collides with a function or illegal word.
   - Every entry has a source tag, and every source has its license text under `lexicon/licenses/`.
   - A fixture set of project-note sentences parses.
7. **Measure** size and load time against the 50 MB budget.

## Licensing handling

- We ship only our generated lexicon (our own words plus attributed entries), never raw source dumps.
- `lexicon/licenses/` holds each source's license text (Open English WordNet CC BY 4.0, Princeton WordNet license, and Wiktionary's if used), and a `NOTICE` names every source, its version and its required attribution.
- If Wiktionary data is used, the derived lexicon data is released under GPLv3 (allowed by CC's compatibility statement) or CC BY-SA 4.0, with attribution and a link back, and it stays in its own removable layer so dropping it is a rebuild, not a rewrite.
- `THIRD_PARTY_LICENSES.md` is updated whenever a source is added.

## Steps

**L0. Check the verb-frame source (decision gate).** Read VerbNet's license and the VerbNet-to-WordNet mapping, and read `WNDB_License.txt` in the Open English WordNet repo. Decide whether verb frames come from VerbNet or from WordNet's own sentence frames. (NULEX turned out to be a design reference only, so no download is needed for it.)
- Done when: a short note in `docs/lexicon-sources.md` records the license text found for each source and the decision.

**L1. Core vocabulary (hand-written, CC0).** About 300 entries for project notes in a JSON-lines format, plus the loader that turns them into APE entries through `ulex`. Verify the gender rules by checking APE's behavior.
- Done when: sentences in `tests/fixtures` parse with no unknown-word diagnostics, with the lexicon loaded through the same path users will use.

**L2. Generator and validator skeleton.** Build steps 1, 5 and 6 above using only the core vocabulary, with provenance output and template-sentence tests.
- Done when: `npm run build:lexicon` produces `lexicon/dist/lexicon.pl`, and `npm test` validates it.

**L3. Open English WordNet ingestion.** Nouns, verbs, adjectives, adverbs with frequency filter, verb frames, exceptions. Read `WNDB_License.txt` and record it.
- Done when: coverage on a sample of 100 real note lines is measured (the expressibility test), and failures are classified (vocabulary vs sentence patterns).

**L4. Decision gate: Wiktionary (or NULEX) enrichment.** Only if L3 leaves too many wrong or missing forms or tags. Add as a removable layer with its license handling.

**L5. User add/remove API.** `lexicon.add/remove` sharing the same entry format and validator (conflict and function-word checks; user entries override ours and APE's built-in, with a warning).

**L6. License pack.** `PROVENANCE.md`, `NOTICE`, `lexicon/licenses/`, updated `THIRD_PARTY_LICENSES.md`, and a package check that every entry has a source.

## Decisions so far

- **NULEX:** skip the download; it is a design reference only.
- **License for our hand-written core: CC0 (public-domain dedication)**, the most permissive option. It is only legitimate for entries we author ourselves, so the core files must contain nothing taken or derived from another source. Entries that come from outside sources live in separate files with their own licenses and attribution. CC0 data inside a GPL-3.0-only package is compatible. (Not legal advice; CC0 is the standard tool for this and we are not aware of a reason we cannot use it.)
- **Numerals:** no lexicon work needed. Checked against APE (pinned in `tests/ape-behavior.test.ts`): integers, number words (two, three), `at least`, `at most` and `exactly` all parse with no entries. Decimals like `3.5` are not accepted, and neither is "The number of cards is 3."
- **Proper names:** no lexicon work needed. APE accepts an unknown capitalized word as a singular proper name and only warns ("Interpreted as a singular proper name"). We therefore ship no names. Our linter's message for this case should say it is treated as a proper name, not "unknown word" (small fix, see todo).
- **Inline word declaration:** an unknown lowercase word is an error that points to APE's prefixes (`n:`, `v:`, `a:`, `p:`), and `A n:zorblax inserts a card.` parses. Users can therefore declare a word inline without editing a lexicon.

- **Vocabulary scope: broader everyday English** (decided 2026-11-11). The hand-written CC0 core stays small (the closed vocabulary of notes and tasks plus the most common words); breadth comes from Open English WordNet in L3, so L3 matters more. Raise the v1 target from 5,000-10,000 to about 20,000 lemmas, filtered by WordNet sense counts. Broader English means more words that are both noun and verb (run, plan, file), so the validator must check that multi-class words still parse in each role.

- **No frequency filter** (decided 2026-11-11, after measuring): taking every plain lowercase lemma from Open English WordNet gives 73,847 validated entries (42.5k nouns, 11.2k verb entries, 17.3k adjectives, 3.6k adverbs; 4.7 MB of generated lexicon). Loading all of them into APE takes about 0.6 s and lint still takes 1-13 ms per sentence; Node's process memory reached about 327 MB, which is the number to watch for browsers. A top-22k cut by sense count missed ordinary words (hotel, landlord, laptop, plumber, accountant, website) because common words often have a single sense; on 300 generated note lines the share of lowercase words not in the lexicon went from 25.8% (top 22k) to 14.0% (all). What remains missing is abbreviations (fri, asap, tmrw), team slang (soundcheck, setlist, merch), and lowercase first names (APE needs capitals). Those are for users to add, which is what the user-lexicon path is for. Frequency counts (WordNet tag counts) would only matter if we later want a smaller lexicon for memory reasons.
- **Rejections by APE:** 817 entries are dropped because APE reports a conflict (a word that is both an adverb and a noun, a form defined twice, a function word). Our own core wins over WordNet, then noun, verb, adjective, adverb. The list is in the generated `PROVENANCE.md`.
- **Known limits of the WordNet entries:** all nouns are countable (WordNet has no countability; mass nouns come from our core), verb valency comes from VerbNet class files and is deliberately permissive (a verb gets every valency its class allows), and entries parse for any sentence role because APE checks only the lexicon, so the lexicon cannot tell "a customer is main" is odd.

## What share-alike means for us (Wiktionary, CC BY-SA 4.0)

- It applies to data we adapt from Wiktionary (the entries derived from it), not to our code or to our other lexicon sources.
- The adapted entries must stay under BY-SA 4.0 or a BY-SA-compatible license. GPLv3 is one (one way: BY-SA material may be relicensed to GPLv3, per Creative Commons), and the package is GPL-3.0-only already, so the practical extra burden is small: credit Wiktionary and link to it, say we changed the material, and carry the license notice.
- The cost is that the Wiktionary-derived entries can never be re-released under a more permissive license (such as CC0 or MIT) or closed. That is why they stay in a separate, removable layer, and the CC0 core and the CC BY 4.0 WordNet entries stay in their own files.
- Wiktionary is dual-licensed (CC BY-SA 4.0 and GFDL); we would take it under CC BY-SA and not need to meet the GFDL terms.
- Open points: whether bare word forms (the plural of "boat" is "boats") are protectable at all is a legal question we are not relying on; we treat them as covered to be safe. Creative Commons' page mentions further "special considerations" for GPLv3 adapters in a document I could not read, so read that before adopting Wiktionary data. Not legal advice.

## Open questions

1. Decision gate L4 (answer after L3 shows whether it is needed): do we accept Wiktionary data on the terms above, or live with rougher forms?
