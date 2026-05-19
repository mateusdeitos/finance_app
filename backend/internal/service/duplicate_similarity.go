package service

import (
	"strings"
	"unicode"
)

// descriptionSimilarityThreshold is the minimum trigram similarity for two
// transaction descriptions to be considered a possible duplicate. It mirrors
// PostgreSQL's pg_trgm default and is exposed here for tuning against real data.
const descriptionSimilarityThreshold = 0.4

// trigramSet returns the set of distinct trigrams for s, replicating
// PostgreSQL pg_trgm semantics: the string is lowercased, split into words on
// non-alphanumeric runes, and each word is padded with two leading and one
// trailing blank before sliding a 3-rune window.
func trigramSet(s string) map[string]struct{} {
	set := make(map[string]struct{})
	var word []rune

	flush := func() {
		if len(word) == 0 {
			return
		}
		padded := []rune("  " + string(word) + " ")
		for i := 0; i+3 <= len(padded); i++ {
			set[string(padded[i:i+3])] = struct{}{}
		}
		word = word[:0]
	}

	for _, r := range strings.ToLower(s) {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			word = append(word, r)
		} else {
			flush()
		}
	}
	flush()

	return set
}

// trigramSimilarity returns the Jaccard index of the trigram sets of a and b,
// matching PostgreSQL's similarity() function. The result is in [0, 1].
func trigramSimilarity(a, b string) float64 {
	ta := trigramSet(a)
	tb := trigramSet(b)
	if len(ta) == 0 || len(tb) == 0 {
		return 0
	}

	shared := 0
	for t := range ta {
		if _, ok := tb[t]; ok {
			shared++
		}
	}

	union := len(ta) + len(tb) - shared
	if union == 0 {
		return 0
	}
	return float64(shared) / float64(union)
}
