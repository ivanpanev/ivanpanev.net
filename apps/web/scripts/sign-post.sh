#!/usr/bin/env bash
# Sign a blog post with the site's OpenPGP signing subkey.
#
#   scripts/sign-post.sh <post-id> [--key <fingerprint-or-email>]
#
# Produces, next to the post:
#   src/content/signatures/<id>.md.asc     detached, armoured signature
#   src/content/signatures/<id>.md.sha256  sha256 of the exact bytes signed
# and flips `signed: true` in the post's frontmatter if it is not already.
#
# The build (src/integrations/signed-posts.ts) recomputes the digest and fails
# if the post was edited after signing, so re-run this after every edit.
# gpg does the signing; the private key never touches Node or the repo.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
id="${1:-}"
[[ -n "$id" ]] || { echo "usage: $0 <post-id> [--key <id>]" >&2; exit 2; }
shift
key="${IVP_PGP_SIGNING_KEY:-ivan@ivanpanev.net}"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --key) key="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

post=""
for ext in md mdx; do
  [[ -f "$here/src/content/posts/$id.$ext" ]] && post="$here/src/content/posts/$id.$ext" && break
done
[[ -n "$post" ]] || { echo "no post with id '$id' under src/content/posts" >&2; exit 1; }

if grep -Eq '^draft:\s*true\s*$' "$post"; then
  echo "refusing to sign a draft ($post has draft: true)" >&2
  exit 1
fi

sigdir="$here/src/content/signatures"
mkdir -p "$sigdir"

# Ensure `signed: true` is in the frontmatter BEFORE hashing/signing, so the
# signed bytes are exactly what gets published.
if grep -Eq '^signed:\s*true\s*$' "$post"; then
  :
elif grep -Eq '^signed:\s*false\s*$' "$post"; then
  sed -i.bak -E 's/^signed:\s*false\s*$/signed: true/' "$post" && rm -f "$post.bak"
else
  # insert before the closing frontmatter delimiter (second '---')
  awk 'BEGIN{n=0} /^---\s*$/{n++; if(n==2){print "signed: true"}} {print}' "$post" > "$post.tmp" && mv "$post.tmp" "$post"
fi

asc="$sigdir/$id.md.asc"
sha="$sigdir/$id.md.sha256"
rm -f "$asc"
gpg --local-user "$key" --armor --detach-sign --output "$asc" "$post"
sha256sum "$post" | awk -v n="$id.md" '{print $1 "  " n}' > "$sha"

echo "signed $post"
echo "  signature: ${asc#$here/}"
echo "  digest:    $(cut -d' ' -f1 "$sha")"
echo "verify locally: gpg --verify \"$asc\" \"$post\""
gpg --verify "$asc" "$post" 2>&1 | grep -E 'Good signature|BAD signature' || true
