import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = ".github/workflows";
const OUTPUT = process.env.MW_WORKFLOW_PIPELINE_AUDIT_OUTPUT ?? "workflow-pipeline-safety-audit.json";
const files = readdirSync(ROOT).filter((name) => /\.ya?ml$/.test(name)).sort();
const findings = [];

function indentation(line) { return line.match(/^\s*/)?.[0].length ?? 0; }

for (const name of files) {
  const path = join(ROOT, name);
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const inline = line.match(/^\s*run:\s+(.+)$/);
    if (inline && !inline[1].startsWith("|")) {
      if (/\|\s*tee\b/.test(inline[1])) {
        findings.push({ file: path, line: i + 1, kind: "inline-pipeline-no-pipefail", excerpt: inline[1].trim() });
      }
      continue;
    }
    if (!/^\s*run:\s*\|\s*$/.test(line)) continue;
    const runIndent = indentation(line);
    const block = [];
    let j = i + 1;
    for (; j < lines.length; j += 1) {
      if (lines[j].trim() && indentation(lines[j]) <= runIndent) break;
      block.push({ line: j + 1, text: lines[j] });
    }
    const firstTee = block.findIndex((entry) => /\|\s*tee\b/.test(entry.text));
    if (firstTee < 0) { i = j - 1; continue; }
    const prior = block.slice(0, firstTee + 1).map((entry) => entry.text).join("\n");
    if (!/set\s+-[^\n]*o\s+pipefail|set\s+-[^\n]*pipefail|set\s+-euo\s+pipefail/.test(prior)) {
      findings.push({
        file: path,
        line: block[firstTee].line,
        kind: "block-pipeline-no-pipefail",
        excerpt: block[firstTee].text.trim(),
      });
    }
    i = j - 1;
  }
}

const result = {
  revision: "workflow-pipeline-safety-audit-v1",
  workflowFilesScanned: files.length,
  unsafeTeePipelines: findings.length,
  findings,
  verdict: findings.length ? "WORKFLOW_FALSE_GREEN_SURFACES_FOUND" : "WORKFLOW_TEE_PIPELINES_PIPEFAIL_CLEAN",
  note: "Static heuristic for shell pipeline exit-code masking. Findings require human/agent review; absence is not a complete shell-safety proof.",
};
writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
console.log(result.verdict);
