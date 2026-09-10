#!/usr/bin/env python3
from pathlib import Path
import re
import sys

if len(sys.argv) != 2:
    raise SystemExit('usage: repository-terminal-split-transport-patch.py <runtime.py>')

p = Path(sys.argv[1])
text = p.read_text()

helpers = r'''
def split_transport_transaction(txn):
    out=dict(txn)
    out['schema']='repository-terminal-transaction-v3-split-transport'
    out['transport']='github-rest-annotated-tag-refs-then-graphql-updateRefs-atomic-cas'
    out['atomicRefUpdates']=[u for u in out['refUpdates'] if u['kind'] != 'CREATE_ANNOTATED_TAG']
    out['tagRefUpdates']=[u for u in out['refUpdates'] if u['kind'] == 'CREATE_ANNOTATED_TAG']
    pre=dict(out.get('preconditions') or {})
    pre['allCreatedTagsMustBeAbsentBefore']=False
    pre['createdTagsMayPreexistAtExactObjectOnRetry']=True
    pre['terminalTagIsSingleUseConsumptionMarker']=False
    pre['terminalStateRequiresMarkerAndExactTwoHeadTopology']=True
    pre['retainAssertionsAreInsideAtomicUpdateRefs']=True
    out['preconditions']=pre
    return out


def split_live_heads():
    rows={}
    cp=git('ls-remote','--heads','origin')
    for line in cp.stdout.splitlines():
        if not line.strip(): continue
        sha,ref=line.split('\t',1)
        rows[ref]=sha
    return rows


def split_is_terminal_heads(candidate):
    return split_live_heads()=={
        'refs/heads/main': EXPECTED_MAIN,
        'refs/heads/archive/repository-cleanup-v3-2026-09-10': candidate,
    }


def split_assert_tags_absent_or_exact(tags):
    for t in tags:
        obj,peeled=peel_remote_tag(t['name'])
        if obj is None:
            continue
        if obj != t['objectSha'] or peeled != t['targetSha']:
            raise RuntimeError(f"existing tag ref mismatch for {t['name']}: obj={obj} peeled={peeled}")


def split_ensure_tag_refs(tags):
    token=os.getenv('GITHUB_TOKEN','')
    if not token: raise RuntimeError('GITHUB_TOKEN missing for annotated tag ref publication')
    for t in tags:
        obj,peeled=peel_remote_tag(t['name'])
        if obj is None:
            http_json(
                f'{REST_API}/repos/{REPO}/git/refs',
                token=token,
                method='POST',
                payload={'ref':t['name'],'sha':t['objectSha']},
            )
            obj,peeled=peel_remote_tag(t['name'])
        if obj != t['objectSha'] or peeled != t['targetSha']:
            raise RuntimeError(f"annotated tag ref verification mismatch for {t['name']}: obj={obj} peeled={peeled}")

'''

marker='\ndef main():'
if text.count(marker) != 1:
    raise SystemExit(f'main marker count={text.count(marker)}')
text=text.replace(marker, helpers+marker, 1)

needle='txn=transaction_obj(runner_sha,candidate,tags,idx_sha,idx_md_sha)'
count=text.count(needle)
if count != 2:
    raise SystemExit(f'transaction construction count={count}')
text=text.replace(needle, 'txn=split_transport_transaction(transaction_obj(runner_sha,candidate,tags,idx_sha,idx_md_sha))')

old='if terminal_obj is not None:'
if text.count(old) != 1:
    raise SystemExit(f'terminal replay guard count={text.count(old)}')
text=text.replace(old, 'if terminal_obj is not None and split_is_terminal_heads(candidate):', 1)

old='    verify_tag_absence(local_tags)\n'
if text.count(old) != 1:
    raise SystemExit(f'preparation tag absence count={text.count(old)}')
text=text.replace(old, '    split_assert_tags_absent_or_exact(local_tags)\n', 1)

old="""    verify_heads_exact(expected_heads_before(runner_sha,candidate)); verify_tag_absence(tags)
    apply_github_atomic(txn,tags,runner_sha)
    verdict=verify_terminal(txn,tags,runner_sha,fresh_mirror=True)
"""
new="""    verify_heads_exact(expected_heads_before(runner_sha,candidate)); split_assert_tags_absent_or_exact(tags)
    split_ensure_tag_refs(tags)
    mutation_txn={**txn,'schema':'repository-terminal-transaction-v2','transport':'github-graphql-updateRefs-atomic-cas','refUpdates':txn['atomicRefUpdates']}
    apply_github_atomic(mutation_txn,[],runner_sha)
    verdict=verify_terminal(txn,tags,runner_sha,fresh_mirror=True)
"""
if text.count(old) != 1:
    raise SystemExit(f'apply block count={text.count(old)}')
text=text.replace(old,new,1)

p.write_text(text)
print('SPLIT_TRANSPORT_PATCH_PASS transaction=2 replay=1 preparation=1 apply=1')
