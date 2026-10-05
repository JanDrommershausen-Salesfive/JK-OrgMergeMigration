import type { Cohort } from '@studio/shared';
import { describe, expect, it } from 'vitest';
import { cohortRecordsSoql } from './records';

describe('cohortRecordsSoql', () => {
    it('fragt die Datensätze der Kohorte über ihre Ids ab', () => {
        const cohort = { rootObject: 'Account', ids: ['001A', '001B'] } as Cohort;
        expect(cohortRecordsSoql(cohort)).toBe(
            "SELECT Id, Name, Type, Industry, BillingCountry, BillingState, CreatedDate FROM Account WHERE Id IN ('001A', '001B') ORDER BY Name"
        );
    });
});
