import { describe, expect, it } from 'vitest';

// test/unit/releaseMetadata.test.ts

const { validateReleaseMetadata } = require('../../shared/releaseMetadata.cjs') as {
    validateReleaseMetadata: (metadata: {
        commitMessage: string;
        releaseFileContent: string;
        packageVersion: string;
    }) => string;
};

const validMetadata = {
    commitMessage: 'release: v0.6.1',
    releaseFileContent: '0.6.1\n',
    packageVersion: '0.6.1',
};

describe('release metadata', () => {
    it('accepts a matching commit message, release file, and package version', () => {
        expect(validateReleaseMetadata(validMetadata)).toBe('0.6.1');
    });

    it.each([
        [{ ...validMetadata, commitMessage: 'release: v0.6.1\n\nnotes' }, 'complete commit message'],
        [{ ...validMetadata, releaseFileContent: 'v0.6.1\n' }, 'release file'],
        [{ ...validMetadata, releaseFileContent: '0.6.2\n' }, 'Release versions must match'],
        [{ ...validMetadata, packageVersion: '0.6.1-beta.1' }, 'package.json version'],
    ])('rejects invalid metadata %#', (metadata, message) => {
        expect(() => validateReleaseMetadata(metadata)).toThrow(message);
    });
});
