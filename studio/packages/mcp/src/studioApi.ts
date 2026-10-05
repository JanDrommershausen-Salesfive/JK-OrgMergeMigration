// Zugriff auf die Studio-API. Gelesen wird per GET. Die einzige Ausnahme zum Schreiben ist das Anlegen eines
// Vorschlags (er ändert nichts; übernommen wird nur in der GUI). Jeder andere POST wird abgelehnt.
export const PROPOSALS_PATH = '/api/chat/proposals';

export class StudioApi {
    constructor(
        private readonly baseUrl: string,
        private readonly fetchImpl: typeof fetch = fetch
    ) {}

    async propose<T = unknown>(body: unknown): Promise<T> {
        return this.send<T>(PROPOSALS_PATH, body);
    }

    private async send<T>(path: string, body: unknown): Promise<T> {
        if (path !== PROPOSALS_PATH) throw new Error('Schreibzugriff nicht erlaubt.');
        let res: Response;
        try {
            res = await this.fetchImpl(new URL(path, this.baseUrl), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
        } catch {
            throw new Error(
                `Studio nicht erreichbar unter ${this.baseUrl}. Läuft "npm run studio"?`
            );
        }
        if (!res.ok) {
            const payload = (await res.json().catch(() => null)) as { error?: string } | null;
            throw new Error(payload?.error ?? `${path}: HTTP ${res.status}`);
        }
        return (await res.json()) as T;
    }

    async get<T = unknown>(
        path: string,
        params: Record<string, string | undefined> = {}
    ): Promise<T> {
        const url = new URL(path, this.baseUrl);
        for (const [k, v] of Object.entries(params))
            if (v !== undefined) url.searchParams.set(k, v);
        let res: Response;
        try {
            res = await this.fetchImpl(url, { method: 'GET' });
        } catch {
            throw new Error(
                `Studio nicht erreichbar unter ${this.baseUrl}. Läuft "npm run studio"?`
            );
        }
        if (!res.ok) {
            const body = (await res.json().catch(() => null)) as { error?: string } | null;
            throw new Error(body?.error ?? `${path}: HTTP ${res.status}`);
        }
        return (await res.json()) as T;
    }
}
