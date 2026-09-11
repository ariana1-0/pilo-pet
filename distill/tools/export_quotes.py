#!/usr/bin/env python3
"""Export reviewed source text or literal translations for the quote popup.

Usage:
  python3 tools/export_quotes.py [slug]  # default: marcus-aurelius
  python3 tools/export_quotes.py --all   # all packages in quote-selection.json

Only cards explicitly selected in shared/quote-selection.json are exported.
Every exported card must have a verified, corpus-verbatim anchor. Packages with
``display_mode: source_original`` display that anchor itself; other packages
display the reviewed ``literal`` section. Editorial ``one_liner`` text is never
exported as popup copy.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SELECTION_PATH = ROOT / "shared" / "quote-selection.json"
PROVENANCE_NOTE_RE = re.compile(r"\s*（(?:基于|据)[^）]*转译）\s*$")


def _match(pattern: str, text: str, label: str, path: Path) -> str:
    match = re.search(pattern, text, re.M | re.S)
    if not match:
        raise SystemExit(f"REFUSED: missing {label} in {path}")
    return match.group(1).strip()


def _section(text: str, heading: str, path: Path) -> str:
    value = _match(
        rf"^## {re.escape(heading)}\s*\n+(.*?)(?=^## |\Z)",
        text,
        heading,
        path,
    )
    value = " ".join(value.split())
    return PROVENANCE_NOTE_RE.sub("", value).strip()


def _load_corpus(pkg: Path) -> dict:
    corpus = {}
    for jsonl in pkg.glob("corpus/*.jsonl"):
        for line in jsonl.read_text(encoding="utf-8").splitlines():
            entry = json.loads(line)
            corpus[entry["id"]] = entry
    return corpus


def _translation_review_sha256(quote: str, literal: str) -> str:
    """Bind human review to the exact source quote and Chinese translation."""
    return hashlib.sha256(f"{quote}\n{literal}".encode("utf-8")).hexdigest()


def export_package(slug: str, spec: dict) -> Path:
    pkg = ROOT / "packages" / slug
    corpus = _load_corpus(pkg)
    cards = {path.stem: path for path in (pkg / "concepts").glob("*.md")}
    out = []
    display_mode = spec.get("display_mode", "literal_translation")
    if display_mode not in {"literal_translation", "source_original"}:
        raise SystemExit(f"REFUSED: unknown display_mode for {slug}: {display_mode}")

    for rank, selected in enumerate(spec["quotes"], start=1):
        card_id = selected["id"]
        path = cards.get(card_id)
        if path is None:
            raise SystemExit(f"REFUSED: selected card not found: {slug}/{card_id}")
        text = path.read_text(encoding="utf-8")
        front = _match(r"^---\n(.*?)\n---", text, "frontmatter", path)
        if not re.search(r"^\s*verified:\s*true\s*$", front, re.M):
            raise SystemExit(f"REFUSED: anchor is not verified verbatim: {path}")

        name = _match(r"^name:\s*([^\n]+)$", front, "name", path)
        corpus_id = _match(r"corpus_id:\s*([\w.\-]+)", front, "corpus_id", path)
        quote = _match(r'^\s*quote:\s*"([^"\n]*)"\s*$', front, "quote", path)
        tags = _match(r"^dilemma_tags:\s*\[([^\]]*)\]", front, "dilemma_tags", path)
        flags_match = re.search(r"^content_flags:\s*\[([^\]]*)\]", front, re.M)
        entry = corpus.get(corpus_id)
        if entry is None:
            raise SystemExit(f"REFUSED: corpus id not found: {slug}/{corpus_id}")
        if quote not in entry["text"]:
            raise SystemExit(f"REFUSED: quote is not corpus-verbatim: {slug}/{corpus_id}")

        literal = _section(text, "忠实直译（literal）", path)
        if not literal:
            raise SystemExit(f"REFUSED: empty literal translation: {path}")
        review_hash = _translation_review_sha256(quote, literal)
        if (
            selected.get("translation_reviewed") is not True
            or selected.get("translation_review_sha256") != review_hash
        ):
            raise SystemExit(
                f"REFUSED: translation review is missing or stale: {slug}/{card_id}"
            )

        popup_text = quote if display_mode == "source_original" else literal

        out.append({
            "id": card_id,
            "slug": slug,
            "author": spec["author"],
            "text": popup_text,
            "text_kind": display_mode,
            "source_text_verified": True,
            "translation_reviewed": True,
            "translation_review_sha256": review_hash,
            "featured_rank": rank,
            "concept": name,
            "corpus_id": corpus_id,
            "locus": selected["locus"],
            "quote": quote,
            "source": entry.get("source"),
            "paraphrase": False,
            "dilemma_tags": [tag.strip() for tag in tags.split(",") if tag.strip()],
            "content_flags": (
                [flag.strip() for flag in flags_match.group(1).split(",") if flag.strip()]
                if flags_match else []
            ),
        })

    dest = pkg / "build" / "quotes.json"
    dest.parent.mkdir(exist_ok=True)
    dest.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return dest


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("slug", nargs="?", default="marcus-aurelius")
    parser.add_argument("--all", action="store_true", help="export every curated package")
    args = parser.parse_args()

    selection = json.loads(SELECTION_PATH.read_text(encoding="utf-8"))
    packages = selection["packages"]
    slugs = list(packages) if args.all else [args.slug]
    for slug in slugs:
        if slug not in packages:
            reason = selection.get("excluded_packages", {}).get(slug, "not in curated selection")
            raise SystemExit(f"REFUSED: {slug}: {reason}")
        dest = export_package(slug, packages[slug])
        print(
            f"exported {len(packages[slug]['quotes'])} reviewed popup texts"
            f" -> {dest.relative_to(ROOT)}"
        )


if __name__ == "__main__":
    main()
