import re


def sanitize_fts5_query(query: str) -> str:
    query = query.strip()
    if not query:
        return ""
    # Hyphens are NOT operators in FTS5 — replace with spaces
    query = query.replace("-", " ")
    # Remove FTS5 special characters
    query = re.sub(r'[*"():^]', "", query)
    # Collapse multiple spaces
    query = re.sub(r"\s+", " ", query).strip()
    if not query:
        return ""
    # Quote each word to prevent FTS5 operator interpretation
    return " ".join(f'"{word}"' for word in query.split())


def sanitize_fts5_query_with_prefix(query: str) -> str:
    query = query.strip()
    if not query:
        return ""
    # Hyphens are NOT operators in FTS5 — replace with spaces
    query = query.replace("-", " ")
    # Remove FTS5 special characters
    query = re.sub(r'[*"():^]', "", query)
    # Collapse multiple spaces
    query = re.sub(r"\s+", " ", query).strip()
    if not query:
        return ""
    words = query.split()
    # Quote all words except the last; last term gets * for prefix matching (unquoted)
    quoted = [f'"{word}"' for word in words[:-1]]
    # FTS5 prefix requires unquoted token: word* (not "word"*)
    quoted.append(f"{words[-1]}*")
    return " ".join(quoted)
