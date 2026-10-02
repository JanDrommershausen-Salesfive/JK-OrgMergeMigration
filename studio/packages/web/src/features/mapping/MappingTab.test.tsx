import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MappingTab } from './MappingTab';

afterEach(() => vi.unstubAllGlobals());

const field = (name: string, targetField = name) => ({
    name,
    lookup: false,
    parent: null,
    parentReadonly: false,
    owner: false,
    externalId: false,
    valueMapped: false,
    excluded: false,
    targetField,
    renamed: false
});
const detail = (object: string, parentIndex: number | null, names: string[]) => ({
    folder: '020_Contact',
    object,
    operation: 'Upsert',
    externalId: null,
    readonlyParents: [],
    lastRun: null,
    parentIndex,
    where: null,
    fields: names.map((n) => field(n)),
    valueMappings: []
});
const d = (baseType: string, over = {}) => ({
    type: baseType,
    baseType,
    label: baseType,
    createable: true,
    updateable: true,
    ...over
});
const model = {
    folder: '020_Contact',
    object: 'Contact',
    soql: 'x',
    fields: ['Id', 'Email'],
    filters: [],
    rawWhere: null,
    tail: '',
    supported: true,
    parents: [
        {
            index: 0,
            object: 'Account',
            operation: 'Upsert',
            master: false,
            externalId: 'Name',
            where: null,
            fields: ['Id', 'Name'],
            mode: 'pull',
            configFolder: '010_Account'
        },
        {
            index: 1,
            object: 'Pricebook2',
            operation: 'Readonly',
            master: false,
            externalId: 'Name',
            where: null,
            fields: ['Id', 'Name'],
            mode: 'read',
            configFolder: null
        }
    ]
};

function render_() {
    vi.stubGlobal(
        'fetch',
        vi.fn((url: string) => {
            const body = url.startsWith('/api/query')
                ? model
                : url.startsWith('/api/object?folder=020_Contact&parent=0')
                  ? detail('Account', 0, ['Id', 'Name'])
                  : url.startsWith('/api/object')
                    ? detail('Contact', null, ['Id', 'Email'])
                    : url.startsWith('/api/describe/object')
                      ? {
                            source: { ok: true, fields: { Id: d('id'), Name: d('string') } },
                            target: {
                                ok: true,
                                fields: {
                                    Id: d('id', { createable: false }),
                                    Name: d('string', { required: true }),
                                    Rating: d('picklist', { required: true }),
                                    Website: d('url')
                                }
                            }
                        }
                      : url.startsWith('/api/describe')
                        ? {
                              source: { ok: true, fields: { Id: d('id'), Email: d('email') } },
                              target: {
                                  ok: true,
                                  fields: {
                                      Id: d('id', { createable: false }),
                                      Email: d('email'),
                                      Phone: d('phone')
                                  }
                              }
                          }
                        : null;
            return Promise.resolve({
                ok: !!body,
                status: body ? 200 : 404,
                json: async () => body ?? { error: 'x' }
            });
        })
    );
    render(
        <QueryClientProvider client={new QueryClient()}>
            <MemoryRouter>
                <MappingTab
                    folder="020_Contact"
                    object="Contact"
                    onlyDiff={false}
                    running={false}
                    report={() => undefined}
                    onOpenValueMapping={() => undefined}
                />
            </MemoryRouter>
        </QueryClientProvider>
    );
}

describe('MappingTab', () => {
    it('zeigt das Objekt und einen Abschnitt je mitgezogenem Parent, nicht für Nur-lesen-Parents', async () => {
        render_();
        expect(
            await screen.findByRole('heading', { name: 'Account (mitgezogen)' })
        ).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Contact · Hauptobjekt' })).toBeInTheDocument();
        expect(screen.queryByText(/Pricebook2/)).not.toBeInTheDocument();
    });

    it('listet Pflichtfelder im Ziel ohne Quelle und hebt sie hervor', async () => {
        render_();
        // Parent Account: Rating ist Pflicht und hat keine Quelle, Website nicht
        const summary = await screen.findByText(/Zielfelder ohne Quelle \(2\)/);
        expect(summary).toBeInTheDocument();
        expect(screen.getAllByText('1 Pflicht').length).toBe(1);
        expect(screen.getByText('Rating')).toBeInTheDocument();
        // Objekt Contact: Phone ohne Quelle, kein Pflichtfeld
        expect(await screen.findByText(/Zielfelder ohne Quelle \(1\)/)).toBeInTheDocument();
    });
});
