import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryTab } from './QueryTab';

afterEach(() => vi.unstubAllGlobals());

const model = {
    folder: '020_Contact',
    object: 'Contact',
    soql: 'SELECT Id, Email, AccountId FROM Contact WHERE CreatedDate = LAST_N_DAYS:7',
    fields: ['Id', 'Email', 'AccountId'],
    filters: [
        { field: 'CreatedDate', op: '=', value: { kind: 'literal', value: 'LAST_N_DAYS:7' } }
    ],
    rawWhere: null,
    tail: '',
    supported: true,
    parents: [
        {
            index: 0,
            object: 'Account',
            operation: 'Readonly',
            master: false,
            externalId: 'Name',
            where: null,
            fields: ['Id', 'Name'],
            mode: 'read',
            configFolder: '010_Account'
        }
    ]
};
const f = (baseType: string, createable = true) => ({
    type: baseType,
    baseType,
    label: baseType,
    createable,
    updateable: true
});
const describeBody = {
    source: {
        ok: true,
        fields: {
            CreatedDate: f('datetime'),
            Email: f('email'),
            Phone: f('phone'),
            Fax: f('phone')
        }
    },
    target: {
        ok: true,
        fields: {
            CreatedDate: f('datetime'),
            Email: f('email'),
            Phone: f('phone'),
            Fax: f('phone', false),
            Nur_im_Ziel__c: f('string')
        }
    }
};

function setup() {
    const calls: { url: string; body?: unknown }[] = [];
    vi.stubGlobal(
        'fetch',
        vi.fn((url: string, init?: { body?: string }) => {
            calls.push({ url, body: init?.body ? JSON.parse(init.body) : undefined });
            const body = url.startsWith('/api/query/parent')
                ? {
                      ...model,
                      parents: [{ ...model.parents[0], mode: 'pull', operation: 'Upsert' }]
                  }
                : url.startsWith('/api/query/check')
                  ? {
                        count: 46,
                        error: null,
                        columns: ['Id'],
                        rows: [['003']],
                        parents: [
                            {
                                object: 'Account',
                                lookupField: 'AccountId',
                                referenced: 43,
                                existingInTarget: 10,
                                missing: 33,
                                note: null
                            }
                        ]
                    }
                  : url.startsWith('/api/query')
                    ? model
                    : url.startsWith('/api/describe')
                      ? describeBody
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
            <QueryTab folder="020_Contact" running={false} report={() => undefined} />
        </QueryClientProvider>
    );
    return calls;
}

describe('QueryTab', () => {
    it('zeigt Query, Filter und die Quellfelder als Checkliste mit Typ-Emoji', async () => {
        const user = userEvent.setup();
        const calls = setup();
        expect(await screen.findByText(model.soql)).toBeInTheDocument();
        expect(screen.getByRole('combobox', { name: 'Feld' })).toHaveValue('CreatedDate');

        const email = await screen.findByRole('checkbox', { name: 'Email' });
        expect(email).toBeChecked();
        const phone = screen.getByRole('checkbox', { name: 'Phone' });
        expect(phone).not.toBeChecked();
        // Die Liste kommt aus der Quelle: Fax ist dort lesbar, ein Feld nur im Ziel fehlt
        expect(screen.getByRole('checkbox', { name: 'Fax' })).toBeEnabled();
        expect(screen.queryByRole('checkbox', { name: 'Nur_im_Ziel__c' })).not.toBeInTheDocument();
        expect(screen.getAllByText('🔤').length).toBeGreaterThan(0);
        expect(screen.getAllByText('🗓️').length).toBeGreaterThan(0);

        await user.click(phone);
        await waitFor(() =>
            expect(calls.find((c) => c.url === '/api/query/fields')?.body).toEqual({
                folder: '020_Contact',
                add: ['Phone'],
                remove: []
            })
        );
    });

    it('zeigt die Felder als Tabelle mit Kopfzeile', async () => {
        setup();
        await screen.findByRole('checkbox', { name: 'Email' });
        for (const name of ['Auswahl', 'Typ', 'API-Name', 'Label', 'Info']) {
            expect(screen.getByRole('columnheader', { name })).toBeInTheDocument();
        }
    });

    it('baut eine ODER-Gruppe und speichert sie als Gruppe', async () => {
        const user = userEvent.setup();
        const calls = setup();
        await user.click(await screen.findByRole('button', { name: '+ ODER-Gruppe' }));
        expect(screen.getByRole('group', { name: 'ODER-Gruppe' })).toBeInTheDocument();
        expect(screen.getByText('UND')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Filter speichern' }));
        await waitFor(() => {
            const body = calls.find((c) => c.url === '/api/query/filters')?.body as
                { filters: unknown[] } | undefined;
            expect(body?.filters).toHaveLength(2);
            expect(body?.filters[1]).toMatchObject({ or: [{ op: '=' }, { op: '=' }] });
        });
    });

    it('speichert Filter erst nach einer Änderung', async () => {
        const user = userEvent.setup();
        const calls = setup();
        expect(await screen.findByRole('button', { name: 'Filter speichern' })).toBeDisabled();
        await user.click(screen.getByRole('button', { name: '+ Bedingung' }));
        const save = screen.getByRole('button', { name: 'Filter speichern' });
        expect(save).toBeEnabled();
        await user.click(save);
        await waitFor(() => {
            const body = calls.find((c) => c.url === '/api/query/filters')?.body as
                { filters: unknown[] } | undefined;
            expect(body?.filters).toHaveLength(2);
        });
    });

    it('Mitziehen braucht eine Bestätigung und schreibt dann den Modus', async () => {
        const user = userEvent.setup();
        const calls = setup();
        await user.click(await screen.findByRole('button', { name: 'Mitziehen' }));
        expect(calls.some((c) => c.url.startsWith('/api/query/parent'))).toBe(false);
        await user.click(screen.getByRole('button', { name: 'Ja, mitziehen' }));
        await waitFor(() =>
            expect(calls.find((c) => c.url.startsWith('/api/query/parent'))?.body).toEqual({
                folder: '020_Contact',
                index: 0,
                mode: 'pull'
            })
        );
    });

    it('zeigt nach dem Prüfen die fehlenden Parents beim Parent', async () => {
        const user = userEvent.setup();
        setup();
        await user.click(await screen.findByRole('button', { name: 'Treffer und Parents prüfen' }));
        expect((await screen.findAllByText(/33/)).length).toBeGreaterThan(0);
        expect(screen.getByText(/fehlen im Ziel/)).toBeInTheDocument();
        expect(screen.getByText(/Datensätze in der Quelle/)).toBeInTheDocument();
    });
});
