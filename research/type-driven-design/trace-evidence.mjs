export function assessRule(rule, links, runs, current) {
  const obligations = rule.obligations.map(obligation => {
    const candidates = links.filter(link => link.rule === rule.id && link.obligation === obligation);
    const reviewed = candidates.filter(link => link.reviewed === true);
    if (!reviewed.length) return { obligation, status: candidates.length ? 'unreviewed' : 'missing-check' };
    const checks = reviewed.map(link => {
      const matches = runs.filter(run => run.check === link.check);
      if (matches.length > 1) return { check: link.check, status: 'ambiguous-history' };
      const run = matches[0];
      if (!run) return { check: link.check, status: 'not-run' };
      if (run.kind !== obligation) return { check: link.check, status: 'wrong-check-kind' };
      if (current.completeness !== 'complete') return { check: link.check, status: 'incomplete-inputs' };
      if (!link.artifacts.length || link.artifacts.some(id => !current.inputs[id] || !run.inputs[id])) return { check: link.check, status: 'unresolved-input' };
      if (run.ruleRevision !== rule.revision || run.compiler !== current.compiler || run.configuration !== current.configuration || link.artifacts.some(id => run.inputs[id] !== current.inputs[id])) return { check: link.check, status: 'stale' };
      return { check: link.check, status: run.status === 'passed' ? 'current-evidence' : run.status === 'failed' ? 'check-failed' : 'not-passed' };
    });
    return { obligation, status: checks.every(check => check.status === 'current-evidence') ? 'current-evidence' : 'gap', checks };
  });
  return { rule: rule.id, status: obligations.length && obligations.every(item => item.status === 'current-evidence') ? 'current-evidence' : 'gap', obligations };
}
