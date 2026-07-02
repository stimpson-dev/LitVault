from app.search.sanitizer import sanitize_fts5_query, sanitize_fts5_query_with_prefix


class TestSanitizeBasic:
    def test_single_word_quoted(self):
        assert sanitize_fts5_query("getriebe") == '"getriebe"'

    def test_multiple_words(self):
        assert sanitize_fts5_query("kegelrad getriebe") == '"kegelrad" "getriebe"'

    def test_empty_string(self):
        assert sanitize_fts5_query("") == ""

    def test_whitespace_only(self):
        assert sanitize_fts5_query("   ") == ""

    def test_hyphen_becomes_space(self):
        assert sanitize_fts5_query("kegel-rad") == '"kegel" "rad"'

    def test_special_chars_removed(self):
        assert sanitize_fts5_query('test* "quoted" (paren) col:on ^caret') == \
            '"test" "quoted" "paren" "colon" "caret"'

    def test_only_special_chars(self):
        assert sanitize_fts5_query('*"():^') == ""


class TestSanitizePrefix:
    def test_last_word_gets_prefix_star(self):
        assert sanitize_fts5_query_with_prefix("getriebe") == "getriebe*"

    def test_earlier_words_quoted_last_prefixed(self):
        assert sanitize_fts5_query_with_prefix("kegelrad getr") == '"kegelrad" getr*'

    def test_empty(self):
        assert sanitize_fts5_query_with_prefix("") == ""

    def test_umlauts_survive(self):
        assert sanitize_fts5_query_with_prefix("verzahnungsträger") == "verzahnungsträger*"
