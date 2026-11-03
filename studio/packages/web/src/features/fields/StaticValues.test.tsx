import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StaticValues } from './StaticValues';

afterEach(() => vi.unstubAllGlobals());

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
const detail = (fields = [field('Id'), field('Name')], operation = 'Upsert') => ({
    folder: '010_Account',
    object: 'Account',
    operation,
    externalId: 'Id',
    readonlyParents: [],
    fieldCount: 2,
    valueMappingCount: 0,
    lastRun: null,
    parentIndex: null,
    where: null,
    fields,
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
const target = {
    Id: d('id', { createable: false }),
    Name: d('string'),
    Notiz__c: d('string'),
    CurrencyIsoCode: d('picklist', { picklistValues: ['EUR', 'USD'] })
};

function setup(det = detail()) {
    const fetch = vi.fn<(url: string, init?: RequestInit) => Promise<unknown>>(() =>
        Promise.resolve({ ok: true, status: 200, json: async () => det })
    );
    vi.stubGlobal('fetch', fetch);
    const report = vi.fn();
    render(
        <QueryClientProvider client={new QueryClient()}>
            <StaticValues detail={det} target={target} running={false} report={report} />
        </QueryClientProvider>
    );
    const bodies = () =>
        fetch.mock.calls
            .filter(([u]) => u === '/api/static')
            .map(([, init]) => JSON.parse(String(init?.body)) as unknown);
    return { bodies, report };
}

describe('StaticValues', () => {
    it('bietet nur freie, schreibbare Zielfelder an und speichert einen Text', async () => {
        const { bodies } = setup();
        const user = userEvent.setup();
        const targets = screen.getByLabelText('Zielfeld für festen Wert');
        const names = within(targets)
            .getAllByRole('option')
            .map((o) => o.textContent?.split(' ·')[0]);
        expect(names).toEqual(['Zielfeld wählen …', 'CurrencyIsoCode', 'Notiz__c']); // ohne Id, Name

        await user.selectOptions(targets, 'Notiz__c');
        const button = screen.getByRole('button', { name: 'Hinzufügen' });
        expect(button).toBeDisabled();
        await user.type(screen.getByLabelText('Fester Wert für neues Zielfeld'), 'Kunde, neu');
        await user.click(button);
        await waitFor(() =>
            expect(bodies()).toEqual([
                { folder: '010_Account', targetField: 'Notiz__c', value: 'Kunde, neu' }
            ])
        );
    });

    it('zeigt bei einer Picklist die Zielwerte zur Auswahl', async () => {
        const { bodies } = setup();
        const user = userEvent.setup();
        await user.selectOptions(
            screen.getByLabelText('Zielfeld für festen Wert'),
            'CurrencyIsoCode'
        );
        const value = screen.getByLabelText('Fester Wert für neues Zielfeld');
        expect(
            within(value)
                .getAllByRole('option')
                .map((o) => o.textContent)
        ).toEqual(['Wert wählen …', 'EUR', 'USD']);
        await user.selectOptions(value, 'USD');
        await user.click(screen.getByRole('button', { name: 'Hinzufügen' }));
        await waitFor(() =>
            expect(bodies()).toEqual([
                { folder: '010_Account', targetField: 'CurrencyIsoCode', value: 'USD' }
            ])
        );
    });

    it('listet vorhandene feste Werte, ändert sie und entfernt sie', async () => {
        const { bodies } = setup(
            detail([
                field('Id'),
                field('Name'),
                field('Ava_Only__c', {
                    targetField: 'CurrencyIsoCode',
                    renamed: true,
                    staticValue: 'USD'
                })
            ])
        );
        const user = userEvent.setup();
        expect(screen.getByText('Feste Werte (1)')).toBeInTheDocument();
        // Das Zielfeld ist belegt und fehlt in der Auswahl
        expect(
            within(screen.getByLabelText('Zielfeld für festen Wert')).queryByRole('option', {
                name: /CurrencyIsoCode/
            })
        ).toBeNull();
        const current = screen.getByLabelText('Fester Wert für CurrencyIsoCode');
        expect(current).toHaveValue('USD');
        await user.selectOptions(current, 'EUR');
        await user.click(
            screen.getByRole('button', { name: 'Festen Wert für CurrencyIsoCode entfernen' })
        );
        await waitFor(() =>
            expect(bodies()).toEqual([
                { folder: '010_Account', targetField: 'CurrencyIsoCode', value: 'EUR' },
                { folder: '010_Account', targetField: 'CurrencyIsoCode', value: null }
            ])
        );
    });

    it('erscheint nicht für Readonly-Einträge', () => {
        setup(detail([field('Id')], 'Readonly'));
        expect(screen.queryByText(/Feste Werte/)).toBeNull();
    });
});
