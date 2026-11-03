import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    // init wird nur in posted() über mock.calls gelesen
    const fetch = vi.fn((url: string, init?: RequestInit) => {
        void init;
        const body = url.startsWith('/api/mapping')
            ? detail('Contact', null, ['Id', 'Email', 'Title'])
            : url.startsWith('/api/query')
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
                            source: {
                                ok: true,
                                fields: { Id: d('id'), Email: d('email'), Title: d('string') }
                            },
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
    });
    vi.stubGlobal('fetch', fetch);
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
    return fetch;
}

const posted = (fetch: ReturnType<typeof render_>, url: string) =>
    fetch.mock.calls
        .filter(([u, init]) => u === url && init?.method === 'POST')
        .map(([, init]) => JSON.parse(String(init?.body)) as unknown);

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

    it('nimmt ein Quellfeld im Mapping in die Query auf und mappt es auf das gewählte Zielfeld', async () => {
        const fetch = render_();
        const user = userEvent.setup();
        await screen.findByRole('option', { name: /^Title/ });
        const [source] = screen.getAllByLabelText('Quellfeld hinzufügen');
        // Nur Felder, die noch nicht in der Query stehen
        expect(within(source as HTMLElement).queryByRole('option', { name: /^Email/ })).toBeNull();
        await user.selectOptions(source as HTMLElement, 'Title');
        // Title gibt es im Ziel nicht: kein Vorschlag, die Person wählt
        const [target] = screen.getAllByLabelText('Zielfeld für neues Feld');
        expect(target).toHaveValue('');
        expect(screen.getAllByRole('button', { name: 'Hinzufügen' })[0]).toBeDisabled();
        await user.selectOptions(target as HTMLElement, 'Phone');
        await user.click(screen.getAllByRole('button', { name: 'Hinzufügen' })[0] as HTMLElement);

        await waitFor(() =>
            expect(posted(fetch, '/api/mapping')).toEqual([
                { folder: '020_Contact', sourceField: 'Title', targetField: 'Phone' }
            ])
        );
        expect(posted(fetch, '/api/query/fields')).toEqual([
            { folder: '020_Contact', add: ['Title'], remove: [] }
        ]);
    });

    it('lädt die Felder auf Knopfdruck am Cache vorbei neu, auch für mitgezogene Parents', async () => {
        const fetch = render_();
        const user = userEvent.setup();
        await user.click(await screen.findByRole('button', { name: /Felder aus Orgs neu laden/ }));
        await waitFor(() => {
            const urls = fetch.mock.calls.map(([u]) => u);
            expect(urls).toContain('/api/describe?folder=020_Contact&refresh=1');
            expect(urls).toContain('/api/describe/object?object=Account&refresh=1');
        });
    });
});
