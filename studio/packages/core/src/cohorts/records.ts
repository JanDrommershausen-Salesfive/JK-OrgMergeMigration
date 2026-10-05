import type { Cohort } from '@studio/shared';
import { formatValue } from '../query/soql';

// Spalten, an denen man Datensätze der Kohorte erkennt. Heute ist das Root-Objekt immer Account.
const COLUMNS = ['Id', 'Name', 'Type', 'Industry', 'BillingCountry', 'BillingState', 'CreatedDate'];

// Abfrage der Datensätze einer Kohorte in der Quelle (die Kohorte selbst speichert nur die Ids).
export function cohortRecordsSoql(cohort: Cohort): string {
    const ids = formatValue({
        kind: 'list',
        values: cohort.ids.map((value) => ({ kind: 'string' as const, value }))
    });
    return `SELECT ${COLUMNS.join(', ')} FROM ${cohort.rootObject} WHERE Id IN ${ids} ORDER BY Name`;
}
