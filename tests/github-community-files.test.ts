import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { parse } from 'yaml';

const ROOT = resolve(__dirname, '..');

/**
 * GitHub reads these at render time and fails quietly: a malformed issue form
 * does not error anywhere a maintainer will see it, it just drops the template
 * off the "New issue" page and hands every reporter a blank box. Nothing in the
 * build touches these files, so this suite is the only thing that parses them.
 */
const ISSUE_TEMPLATE_DIR = resolve(ROOT, '.github/ISSUE_TEMPLATE');

interface IssueForm {
  name?: string;
  description?: string;
  body?: Array<{ type?: string; id?: string; attributes?: Record<string, unknown> }>;
}

const formFiles = readdirSync(ISSUE_TEMPLATE_DIR).filter(
  (name) => name.endsWith('.yml') && name !== 'config.yml',
);

describe('GitHub community files', () => {
  it('publishes the files GitHub surfaces in the community profile', () => {
    for (const file of ['LICENSE', 'README.md', 'CONTRIBUTING.md', 'SECURITY.md', 'CODE_OF_CONDUCT.md']) {
      expect(readdirSync(ROOT), `${file} is missing`).toContain(file);
    }
  });

  it('offers at least one issue form', () => {
    expect(formFiles.length).toBeGreaterThan(0);
  });

  for (const file of formFiles) {
    it(`${file} is a valid issue form`, () => {
      const form = parse(readFileSync(resolve(ISSUE_TEMPLATE_DIR, file), 'utf8')) as IssueForm;

      // The three fields GitHub requires; without any one of them the template
      // is rejected and never rendered.
      expect(form.name, 'issue forms need a name').toBeTruthy();
      expect(form.description, 'issue forms need a description').toBeTruthy();
      expect(Array.isArray(form.body), 'issue forms need a body array').toBe(true);
      expect(form.body!.length).toBeGreaterThan(0);

      for (const field of form.body!) {
        expect(
          ['markdown', 'input', 'textarea', 'dropdown', 'checkboxes'],
          `${file} uses an unsupported field type`,
        ).toContain(field.type);
        // Every field except free-standing markdown must carry a label.
        if (field.type !== 'markdown') {
          expect(field.attributes?.label, `${file} has an unlabelled ${field.type}`).toBeTruthy();
        }
      }
    });
  }

  it('routes vulnerability reports away from the public issue tracker', () => {
    // A security report filed as a public issue is a disclosure. The contact
    // links are what stand between a reporter and that mistake.
    const config = parse(readFileSync(resolve(ISSUE_TEMPLATE_DIR, 'config.yml'), 'utf8')) as {
      blank_issues_enabled?: boolean;
      contact_links?: Array<{ name: string; url: string; about: string }>;
    };

    expect(config.blank_issues_enabled).toBe(false);
    const security = config.contact_links?.find((link) => /security/i.test(link.name));
    expect(security, 'no security contact link').toBeDefined();
    expect(security!.url).toContain('/security/advisories/new');
  });

  it('ships a pull request template that asks how the change was verified', () => {
    const template = readFileSync(resolve(ROOT, '.github/PULL_REQUEST_TEMPLATE.md'), 'utf8');
    expect(template).toContain('npm test');
    expect(template).toContain('npm run typecheck');
  });
});
