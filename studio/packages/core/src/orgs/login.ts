import type { LoginRequest } from '@studio/shared';
import { badRequest } from '../errors';
import { sf } from './sf';

const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
const ALLOWED_HOST = /(^|\.)(salesforce\.com|force\.com)$/;

// Login-URL je Art der Org. Produktion nutzt den Standard der sf-CLI (keine URL nötig).
export function loginUrl({
    kind,
    instanceUrl
}: Pick<LoginRequest, 'kind' | 'instanceUrl'>): string | null {
    if (kind === 'production') return null;
    if (kind === 'sandbox') return 'https://test.salesforce.com';
    let url: URL;
    try {
        url = new URL(instanceUrl ?? '');
    } catch {
        throw badRequest('Ungültige URL.');
    }
    if (url.protocol !== 'https:' || !ALLOWED_HOST.test(url.hostname)) {
        throw badRequest('Nur https-Adressen unter salesforce.com oder force.com sind erlaubt.');
    }
    return url.origin;
}

export function loginArgs(req: LoginRequest): string[] {
    const url = loginUrl(req);
    return ['org', 'login', 'web', '--alias', req.alias, ...(url ? ['--instance-url', url] : [])];
}

// Öffnet den Browser auf diesem Rechner; die Anfrage ist fertig, sobald der Login abgeschlossen ist.
export async function loginOrg(req: LoginRequest): Promise<void> {
    const r = await sf(loginArgs(req), LOGIN_TIMEOUT_MS);
    if (r.status !== 0) {
        throw badRequest(r.message?.split('\n')[0] ?? 'Login fehlgeschlagen oder abgebrochen.');
    }
}
