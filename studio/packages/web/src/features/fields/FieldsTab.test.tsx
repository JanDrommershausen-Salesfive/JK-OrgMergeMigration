import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FieldsTab } from './FieldsTab';

const field = (name: string, over = {}) => ({
    name,
    lookup: false,
    parent: null,
    parentReadonly: false,
    owner: false,
    externalId: false,
    valueMapped: false,
    excluded: false,
    targetField: name,
    renamed: false,
    ...over
});

describe('FieldsTab', () => {
    it('versteckt das technische Trägerfeld eines festen Werts', () => {
        render(
            <QueryClientProvider client={new QueryClient()}>
                <FieldsTab
                    detail={{
                        folder: '010_Account',
                        object: 'Account',
                        operation: 'Upsert',
                        externalId: 'Id',
                        readonlyParents: [],
                        fieldCount: 3,
                        valueMappingCount: 0,
                        lastRun: null,
                        parentIndex: null,
                        where: null,
                        valueMappings: [],
                        fields: [
                            field('Id'),
                            field('Name'),
                            field('Ava_Only__c', {
                                targetField: 'CurrencyIsoCode',
                                renamed: true,
                                staticValue: 'USD'
                            })
                        ]
                    }}
                    describe={undefined}
                    describeError={null}
                    onlyDiff={false}
                    running={false}
                    report={() => undefined}
                />
            </QueryClientProvider>
        );
        expect(screen.getAllByText('Name').length).toBeGreaterThan(0);
        expect(screen.queryByText('Ava_Only__c')).toBeNull();
    });
});
