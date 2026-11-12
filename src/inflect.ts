// Regular English inflection rules. When a rule cannot be trusted, it returns undefined and the entry must give the form itself.

const VOWELS = /[aeiou]/;

/** Plural of a regular noun, or the 3rd-person singular of a regular verb (same spelling rules). */
export function addS(word: string): string {
  if (/(s|x|z|ch|sh)$/.test(word)) return `${word}es`;
  if (/[^aeiou]y$/.test(word)) return `${word.slice(0, -1)}ies`;
  if (/[^aeiou]o$/.test(word)) return `${word}es`; // hero -> heroes (photo, piano are exceptions: give the form explicitly)
  return `${word}s`;
}

/** Past participle of a regular verb, or undefined when consonant doubling or another irregularity may apply. */
export function regularPp(word: string): string | undefined {
  if (/e$/.test(word)) return `${word}d`;
  if (/[^aeiou]y$/.test(word)) return `${word.slice(0, -1)}ied`;
  // A short word ending consonant-vowel-consonant often doubles the final letter (stop -> stopped): do not guess.
  const lastVowelGroups = word.match(/[aeiou]+/g)?.length ?? 0;
  if (lastVowelGroups === 1 && /[^aeiou][aeiou][^aeiouwxy]$/.test(word)) return undefined;
  if (!VOWELS.test(word)) return undefined;
  return `${word}ed`;
}

/** Comparative and superlative of a regular adjective, or undefined when unsure. Long words use "more" and "most" in English, so we give no forms. */
export function regularDegree(word: string): { comp: string; sup: string } | undefined {
  if (word.length > 6) return undefined;
  if (/e$/.test(word)) return { comp: `${word}r`, sup: `${word}st` };
  if (/[^aeiou]y$/.test(word)) return { comp: `${word.slice(0, -1)}ier`, sup: `${word.slice(0, -1)}iest` };
  if (/[^aeiou][aeiou][^aeiouwxy]$/.test(word)) return undefined; // doubling
  return { comp: `${word}er`, sup: `${word}est` };
}
