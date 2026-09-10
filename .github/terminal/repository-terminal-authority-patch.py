#!/usr/bin/env python3
from pathlib import Path
import re
import sys

if len(sys.argv) != 2:
    raise SystemExit('usage: repository-terminal-authority-patch.py <runtime.py>')

p = Path(sys.argv[1])
text = p.read_text()

fn_pattern = re.compile(
    r"def ensure_remote_annotated_tag_objects\(tags\):\n.*?(?=\ndef transaction_observed_state\(transaction\):)",
    re.S,
)
fn_replacement = '''def ensure_remote_annotated_tag_objects(tags):
    if TEST_MODE:
        return [{**t,'localObjectSha':t.get('objectSha'),'mode':'test-local-object'} for t in tags]
    token=os.getenv('GITHUB_TOKEN','')
    if not token: raise RuntimeError('GITHUB_TOKEN missing for annotated tag object preparation')
    prepared=[]
    for t in tags:
        # GitHub REST is authoritative for annotated-tag object identity. It creates only the object, never refs/tags/*.
        ts=int(git('show','-s','--format=%ct',os.getenv('GITHUB_SHA') or git('rev-parse','HEAD').stdout.strip()).stdout.strip())
        date=datetime.fromtimestamp(ts,timezone.utc).isoformat().replace('+00:00','Z')
        payload={'tag':t['name'],'message':t['message'],'object':t['targetSha'],'type':'commit','tagger':{'name':'Repository Terminal Closure','email':'repository-terminal-closure@invalid.local','date':date}}
        _, row=http_json(f'{REST_API}/repos/{REPO}/git/tags',token=token,method='POST',payload=payload)
        got=(row or {}).get('sha')
        if not got: raise RuntimeError(f'GitHub annotated tag object creation returned no SHA for {t["name"]}')
        prepared.append({**t,'localObjectSha':t.get('objectSha'),'objectSha':got,'mode':'github-unreferenced-tag-object'})
    return prepared

'''
text, fn_count = fn_pattern.subn(fn_replacement, text)
if fn_count != 1:
    raise SystemExit(f'authority function patch count={fn_count}')

main_pattern = re.compile(
    r"    tags=prepare_tags\(candidate,runner_sha\)\n.*?    print\(f'PASS_TERMINAL_ATOMIC_APPLY_AND_FRESH_MIRROR transaction=\{digest\} archive=\{candidate\}'\)\n",
    re.S,
)
main_replacement = '''    local_tags=prepare_tags(candidate,runner_sha)

    # Existing terminal tag is the single-use consumption marker. On replay, recover GitHub-authoritative OIDs from live tag refs.
    terminal_obj, terminal_peeled = peel_remote_tag(TERMINAL_TAG)
    if terminal_obj is not None:
        tags=[]
        for t in local_tags:
            obj,peeled=peel_remote_tag(t['name'])
            if obj is None or peeled != t['targetSha']: raise RuntimeError(f"existing terminal tag set mismatch for {t['name']}: obj={obj} peeled={peeled}")
            tags.append({**t,'localObjectSha':t.get('objectSha'),'objectSha':obj,'mode':'github-existing-tag-ref'})
        txn=transaction_obj(runner_sha,candidate,tags,idx_sha,idx_md_sha)
        txn_text=canonical_json(txn); digest=sha256_text(txn_text)
        auth=f'REPO_CLEANUP_TERMINAL_APPLY:{REPO}:{digest}'
        write_json(OUT/'terminal-transaction.json',txn)
        (OUT/'terminal-transaction.canonical.json').write_text(txn_text)
        (OUT/'authorization-token.txt').write_text(auth+'\n')
        (OUT/'semantic-index.json').write_text(idx_text)
        (OUT/'semantic-index.md').write_text(idx_md)
        (OUT/'closure.md').write_text(closure)
        write_json(OUT/'prepared-tag-objects.json',local_tags)
        write_json(OUT/'remote-annotated-tag-objects.json',tags)
        prep={'schema':'repository-terminal-preparation-v2','runnerSha':runner_sha,'canonicalMainSha':EXPECTED_MAIN,'baseArchiveSha':BASE_ARCHIVE,'archiveCandidateSha':candidate,'transactionSha256':digest,'authorizationToken':auth,'semanticIndexSha256':idx_sha,'semanticIndexMarkdownSha256':idx_md_sha,'prePruneTag':preprune,'publishArchiveEnabled':PUBLISH_ARCHIVE,'applyEnabled':ALLOW_APPLY,'terminalAlreadyPresent':True,'authorizationPresent':False}
        write_json(OUT/'preparation.json',prep)
        if terminal_peeled != candidate: raise RuntimeError('terminal tag exists but does not point to this deterministic archive candidate')
        verdict=verify_terminal(txn,tags,runner_sha,fresh_mirror=True)
        verdict['transactionSha256']=digest; verdict['runnerSha']=runner_sha; verdict['archiveSha']=candidate; verdict['replay']=True
        write_json(OUT/'terminal-verification.json',verdict)
        print(f'ALREADY_TERMINAL_PASS transaction={digest} archive={candidate}')
        return

    # Before archive publication all seven live heads must be exact; all four future tag refs must be absent.
    verify_preparation_heads(runner_sha,candidate)
    verify_tag_absence(local_tags)

    if PUBLISH_ARCHIVE:
        state=publish_archive(candidate); print(f'ARCHIVE_{state.upper()} {candidate}')
        tags=ensure_remote_annotated_tag_objects(local_tags)
        write_json(OUT/'remote-annotated-tag-objects.json',tags)
        print(f'REMOTE_ANNOTATED_TAG_OBJECTS_PREPARED count={len(tags)}')
    else:
        tags=local_tags
        print(f'DRY_PREP_ARCHIVE_NOT_PUBLISHED candidate={candidate}')

    # Owner authorization binds the exact GitHub-created tag object OIDs, not locally predicted OIDs.
    txn=transaction_obj(runner_sha,candidate,tags,idx_sha,idx_md_sha)
    txn_text=canonical_json(txn); digest=sha256_text(txn_text)
    auth=f'REPO_CLEANUP_TERMINAL_APPLY:{REPO}:{digest}'
    write_json(OUT/'terminal-transaction.json',txn)
    (OUT/'terminal-transaction.canonical.json').write_text(txn_text)
    (OUT/'authorization-token.txt').write_text(auth+'\n')
    (OUT/'semantic-index.json').write_text(idx_text)
    (OUT/'semantic-index.md').write_text(idx_md)
    (OUT/'closure.md').write_text(closure)
    write_json(OUT/'prepared-tag-objects.json',local_tags)
    prep={'schema':'repository-terminal-preparation-v2','runnerSha':runner_sha,'canonicalMainSha':EXPECTED_MAIN,'baseArchiveSha':BASE_ARCHIVE,'archiveCandidateSha':candidate,'transactionSha256':digest,'authorizationToken':auth,'semanticIndexSha256':idx_sha,'semanticIndexMarkdownSha256':idx_md_sha,'prePruneTag':preprune,'publishArchiveEnabled':PUBLISH_ARCHIVE,'applyEnabled':ALLOW_APPLY,'terminalAlreadyPresent':False}
    write_json(OUT/'preparation.json',prep)

    archive_live = candidate if PUBLISH_ARCHIVE else BASE_ARCHIVE
    verify_heads_exact(expected_heads_before(runner_sha, archive_live))
    if PUBLISH_ARCHIVE:
        assert_ancestor(BASE_ARCHIVE,candidate); assert_ancestor(EXPECTED_MAIN,candidate); assert_ancestor(runner_sha,candidate); assert_ancestor(EXPECTED_HELPER,candidate)
        for _,sha,_,_ in ANCHORS: assert_ancestor(sha,candidate)

    has_auth=auth_present(auth)
    prep['authorizationPresent']=has_auth
    write_json(OUT/'preparation.json',prep)
    if not has_auth:
        print(f'OWNER_STOP transaction={digest}')
        print(auth)
        return
    if not ALLOW_APPLY:
        print(f'AUTH_PRESENT_BUT_APPLY_DISABLED transaction={digest}')
        return
    if not PUBLISH_ARCHIVE: raise RuntimeError('apply enabled but archive publication disabled')

    verify_heads_exact(expected_heads_before(runner_sha,candidate)); verify_tag_absence(tags)
    apply_github_atomic(txn,tags,runner_sha)
    verdict=verify_terminal(txn,tags,runner_sha,fresh_mirror=True)
    verdict['transactionSha256']=digest; verdict['runnerSha']=runner_sha; verdict['archiveSha']=candidate
    write_json(OUT/'terminal-verification.json',verdict)
    print(f'PASS_TERMINAL_ATOMIC_APPLY_AND_FRESH_MIRROR transaction={digest} archive={candidate}')
'''
text, main_count = main_pattern.subn(lambda _: main_replacement, text)
if main_count != 1:
    raise SystemExit(f'main authority reorder patch count={main_count}')

p.write_text(text)
print(f'AUTHORITY_PATCH_PASS function={fn_count} main={main_count}')
