import { z } from 'zod';

const repo = z.object({
  alias: z.string().min(1),
  path: z.string().min(1),
  role: z.string().optional(),
  remote: z.string().optional(),
  defaultBranch: z.string().optional(),
  specs: z.object({ enabled: z.boolean().optional(), path: z.string().optional() }).optional(),
});

export const workspaceSchema = z.object({
  version: z.literal(1),
  workspace: z.object({ id: z.string().min(1), name: z.string().optional(), description: z.string().optional() }),
  repos: z.array(repo).min(1),
  groups: z.array(z.object({ name: z.string().min(1), repos: z.array(z.string()) })).optional(),
  edges: z.array(z.object({ from: z.string(), to: z.string(), type: z.string().min(1), label: z.string().optional() })).optional(),
});

export type Workspace = z.output<typeof workspaceSchema>;
export type Issue = { code: string; message: string; path?: string };
export type Result = { ok: true; data: Workspace } | { ok: false; stage: 'shape' | 'semantic'; errors: Issue[] };
export type SemanticValidator = (input: unknown) => { valid: boolean; errors: Issue[] };

export function parseWorkspace(input: unknown, validate: SemanticValidator): Result {
  const parsed = workspaceSchema.safeParse(input);
  if (!parsed.success) return {
    ok: false,
    stage: 'shape',
    errors: parsed.error.issues.map(issue => ({ code: issue.code, message: issue.message, path: issue.path.map(String).join('.') })),
  };
  const checked = validate(parsed.data);
  if (!checked.valid) return { ok: false, stage: 'semantic', errors: checked.errors };
  return { ok: true, data: parsed.data };
}
