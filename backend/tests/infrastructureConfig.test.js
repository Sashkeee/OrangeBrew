import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import yaml from 'js-yaml';

function files(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
        ? files(join(directory, entry.name)) : entry.name.endsWith('.yml') ? [join(directory, entry.name)] : []);
}
describe('infrastructure configuration syntax', () => {
    it('parses actual Filebeat, Elastic and workflow YAML including autodiscover templates', () => {
        const root = fileURLToPath(new URL('../../', import.meta.url));
        const paths = [...files(join(root, 'infra')), ...files(join(root, '.github', 'workflows'))];
        expect(paths.length).toBeGreaterThan(5);
        for (const path of paths) expect(() => yaml.load(readFileSync(path, 'utf8')), path).not.toThrow();
    });
});
