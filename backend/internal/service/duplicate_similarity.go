package service

import (
	"strings"
	"unicode"

	"golang.org/x/text/unicode/norm"
)

// descriptionSimilarityThreshold is the minimum trigram similarity for two
// transaction descriptions to be considered a possible duplicate. It mirrors
// PostgreSQL's pg_trgm default and is exposed here for tuning against real data.
const descriptionSimilarityThreshold = 0.4

// trigramSize is the number of runes in a trigram, matching pg_trgm.
const trigramSize = 3

// significantWordMinLength is the minimum length for a word to count as a
// duplicate signal on its own — shorter tokens ("zp", "br") are too noisy.
const significantWordMinLength = 4

// genericDescriptionWords are normalized tokens too generic to signal a
// duplicate on their own — common Brazilian bank-statement boilerplate. They
// must be written already accent-folded and lowercased, since they are matched
// against normalizedWords output.
var genericDescriptionWords = map[string]struct{}{
	"compra": {}, "compras": {}, "pagamento": {}, "pagto": {}, "pgto": {},
	"cartao": {}, "debito": {}, "credito": {}, "transferencia": {}, "transf": {},
	"boleto": {}, "saque": {}, "deposito": {}, "parcela": {}, "parcelado": {},
	"mensalidade": {}, "fatura": {}, "conta": {}, "tarifa": {}, "taxa": {},
	"anuidade": {}, "pix": {}, "ted": {}, "doc": {}, "valor": {},
	"recebimento": {}, "estorno": {}, "juros": {}, "online": {}, "loja": {},
}

// foldAccents returns s with Unicode combining marks removed: it NFD-decomposes
// each rune and drops category-Mn runes, so "são" becomes "sao" and "açaí"
// becomes "acai" (NFD decomposes "ç" into "c" plus a combining cedilla).
func foldAccents(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range norm.NFD.String(s) {
		if unicode.Is(unicode.Mn, r) {
			continue
		}
		b.WriteRune(r)
	}
	return b.String()
}

// normalizedWords splits s into lowercased, accent-folded word tokens, breaking
// on every non-alphanumeric rune. It is the shared tokenizer used by both
// trigram comparison and significant-word overlap so the two cannot drift.
func normalizedWords(s string) []string {
	folded := strings.ToLower(foldAccents(s))
	var words []string
	var word []rune

	flush := func() {
		if len(word) > 0 {
			words = append(words, string(word))
			word = word[:0]
		}
	}

	for _, r := range folded {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			word = append(word, r)
		} else {
			flush()
		}
	}
	flush()

	return words
}

// trigramSet returns the set of distinct trigrams for s, replicating
// PostgreSQL pg_trgm semantics on accent-folded text: each normalized word is
// padded with trigramSize-1 leading and one trailing blank before sliding a
// trigramSize-rune window.
func trigramSet(s string) map[string]struct{} {
	set := make(map[string]struct{})
	for _, word := range normalizedWords(s) {
		runes := []rune(word)
		padded := make([]rune, 0, len(runes)+trigramSize)
		for range trigramSize - 1 {
			padded = append(padded, ' ')
		}
		padded = append(padded, runes...)
		padded = append(padded, ' ')
		for i := 0; i+trigramSize <= len(padded); i++ {
			set[string(padded[i:i+trigramSize])] = struct{}{}
		}
	}
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

// isSignificantWord reports whether word (already normalized) is meaningful
// enough to flag a duplicate on its own: long enough, not purely numeric, and
// not a generic bank-statement term.
func isSignificantWord(word string) bool {
	if len([]rune(word)) < significantWordMinLength {
		return false
	}
	if _, generic := genericDescriptionWords[word]; generic {
		return false
	}
	for _, r := range word {
		if !unicode.IsDigit(r) {
			return true
		}
	}
	return false
}

// sharesSignificantWord reports whether a and b share at least one significant
// word. This catches duplicates like "Amazon (fraldas Luca)" vs "Amazon" that
// trigram similarity alone misses because the extra words drag the score down.
func sharesSignificantWord(a, b string) bool {
	wordsA := make(map[string]struct{})
	for _, w := range normalizedWords(a) {
		if isSignificantWord(w) {
			wordsA[w] = struct{}{}
		}
	}
	if len(wordsA) == 0 {
		return false
	}
	for _, w := range normalizedWords(b) {
		if !isSignificantWord(w) {
			continue
		}
		if _, ok := wordsA[w]; ok {
			return true
		}
	}
	return false
}

// descriptionsAreSimilar reports whether two transaction descriptions are close
// enough to be possible duplicates. Two signals are combined: accent-folded
// trigram similarity at or above descriptionSimilarityThreshold, or a shared
// significant word. Either is sufficient.
func descriptionsAreSimilar(a, b string) bool {
	if trigramSimilarity(a, b) >= descriptionSimilarityThreshold {
		return true
	}
	return sharesSignificantWord(a, b)
}
