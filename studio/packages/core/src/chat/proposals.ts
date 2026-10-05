import { randomUUID } from 'node:crypto';
import {
    PROPOSAL_PAYLOADS,
    type ChatEvent,
    type CreateProposalRequest,
    type ExcludeRequest,
    type MappingRequest,
    type QuickQueryRequest,
    type ParentModeRequest,
    type Proposal,
    type SaveFiltersRequest,
    type SetFieldsRequest,
    type UpdateTodoRequest,
    type ValueMappingRequest
} from '@studio/shared';
import { badRequest, conflict, notFound } from '../errors';
import { formatNode } from '../query/soql';
import type { Studio } from '../studio';

type Describe = { folder: string | null; title: string; details: string[] };

const list = (xs: string[]) => xs.join(', ');

// Verständliche Beschreibung eines Vorschlags für die Karte im Chat.
export function describeProposal(kind: Proposal['kind'], payload: unknown): Describe {
    switch (kind) {
        case 'query-fields': {
            const p = payload as SetFieldsRequest;
            const where = p.parentIndex === undefined ? '' : ` (Parent ${p.parentIndex + 1})`;
            return {
                folder: p.folder,
                title: `Query${where}: Felder ändern`,
                details: [
                    ...(p.add.length ? [`Hinzufügen: ${list(p.add)}`] : []),
                    ...(p.remove.length ? [`Entfernen: ${list(p.remove)}`] : [])
                ]
            };
        }
        case 'query-filters': {
            const p = payload as SaveFiltersRequest;
            return {
                folder: p.folder,
                title: 'Query: Filter ersetzen',
                details: p.filters
                    ? p.filters.length
                        ? p.filters.map(formatNode)
                        : ['Alle Filter entfernen']
                    : [`WHERE ${p.rawWhere ?? ''}`]
            };
        }
        case 'parent-mode': {
            const p = payload as ParentModeRequest;
            return {
                folder: p.folder,
                title: `Parent ${p.index + 1}: ${p.mode === 'pull' ? 'mitziehen' : 'nur lesen'}`,
                details: []
            };
        }
        case 'mapping': {
            const p = payload as MappingRequest;
            return {
                folder: p.folder,
                title: 'Mapping ändern',
                details: [`${p.sourceField} → ${p.targetField}`]
            };
        }
        case 'exclude': {
            const p = payload as ExcludeRequest;
            return {
                folder: p.folder,
                title: p.excluded ? 'Feld von der Migration ausschließen' : 'Feld wieder aufnehmen',
                details: [p.field]
            };
        }
        case 'value-mapping': {
            const p = payload as ValueMappingRequest;
            return {
                folder: p.folder,
                title: `Wertemapping für ${p.field}: ${p.rows.length} Regeln (ersetzt die bisherigen)`,
                details: p.rows.map((r) => `${r.from} → ${r.to}`)
            };
        }
        case 'soql-query': {
            const p = payload as QuickQueryRequest;
            return {
                folder: null,
                title: `Abfrage in ${p.org === 'source' ? 'der Quelle' : 'dem Ziel'} im Query-Editor öffnen`,
                details: [p.soql]
            };
        }
        case 'todo-status': {
            const p = payload as UpdateTodoRequest;
            return {
                folder: null,
                title: 'To-Do-Eintrag ändern',
                details: [
                    ...(p.status ? [`Status: ${p.status}`] : []),
                    ...(p.note !== undefined ? [`Notiz: ${p.note}`] : [])
                ]
            };
        }
    }
}

// Vorschläge von Claude: anlegen, übernehmen, verwerfen. Geändert wird erst beim Übernehmen, und zwar über dieselben
// geprüften Studio-Methoden wie in der GUI. Vorher wird der Stand des Objekts als Backup-Version gesichert.
export class ChatProposals {
    private readonly byId = new Map<string, { proposal: Proposal; payload: unknown }>();

    constructor(
        private readonly studio: Studio,
        private readonly publish: (e: ChatEvent) => void
    ) {}

    async create(req: CreateProposalRequest): Promise<Proposal> {
        const payload = PROPOSAL_PAYLOADS[req.kind].parse(req.payload);
        const d = describeProposal(req.kind, payload);
        if (d.folder) await this.studio.object(d.folder); // unbekannter Ordner → 404
        if (req.kind === 'todo-status') {
            const id = (payload as UpdateTodoRequest).id;
            if (!(await this.studio.listTodos()).items.some((t) => t.id === id))
                throw notFound('Unbekannter To-Do-Eintrag.');
        }
        const proposal: Proposal = {
            id: randomUUID(),
            kind: req.kind,
            ...d,
            reason: req.reason,
            status: 'pending',
            createdAt: new Date().toISOString()
        };
        this.byId.set(proposal.id, { proposal, payload });
        this.publish({ type: 'proposal', proposal });
        return proposal;
    }

    async apply(id: string): Promise<Proposal> {
        const entry = this.pending(id);
        const { proposal, payload } = entry;
        try {
            const backup = proposal.folder
                ? await this.studio.backupIfUnsaved(
                      proposal.folder,
                      `Vor Chat-Änderung ${new Date().toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}`,
                      `Automatisch vor: ${proposal.title}`
                  )
                : null;
            await this.run(proposal.kind, payload);
            return this.finish(
                entry,
                'applied',
                backup ? `Übernommen. Vorher gesichert als „${backup}“.` : 'Übernommen.'
            );
        } catch (err) {
            return this.finish(entry, 'failed', err instanceof Error ? err.message : String(err));
        }
    }

    reject(id: string): Proposal {
        return this.finish(this.pending(id), 'rejected');
    }

    private pending(id: string) {
        const entry = this.byId.get(id);
        if (!entry)
            throw notFound(
                'Unbekannter Vorschlag (der Server wurde seit dem Vorschlag neu gestartet).'
            );
        if (entry.proposal.status !== 'pending')
            throw conflict('Der Vorschlag ist schon bearbeitet.');
        return entry;
    }

    private finish(
        entry: { proposal: Proposal },
        status: Proposal['status'],
        message?: string
    ): Proposal {
        entry.proposal = { ...entry.proposal, status, ...(message ? { message } : {}) };
        this.publish({ type: 'proposal-status', id: entry.proposal.id, status, message });
        return entry.proposal;
    }

    private async run(kind: Proposal['kind'], payload: unknown): Promise<void> {
        switch (kind) {
            case 'query-fields':
                await this.studio.changeQueryFields(payload as SetFieldsRequest);
                return;
            case 'query-filters':
                await this.studio.saveFilters(payload as SaveFiltersRequest);
                return;
            case 'parent-mode':
                await this.studio.setParentMode(payload as ParentModeRequest);
                return;
            case 'mapping':
                await this.studio.setMapping(payload as MappingRequest);
                return;
            case 'exclude':
                await this.studio.setExcluded(payload as ExcludeRequest);
                return;
            case 'value-mapping':
                await this.studio.setValueMapping(payload as ValueMappingRequest);
                return;
            case 'soql-query':
                return; // nichts zu ändern: die GUI öffnet den Editor, abgefragt wird dort durch die Person
            case 'todo-status':
                await this.studio.updateTodo(payload as UpdateTodoRequest);
                return;
            default:
                throw badRequest('Unbekannte Art von Vorschlag.');
        }
    }
}
