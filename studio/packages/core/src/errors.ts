// Fehler mit passendem HTTP-Status; der Server gibt message unverändert an die GUI weiter.
export class StudioError extends Error {
    constructor(
        readonly status: number,
        message: string
    ) {
        super(message);
        this.name = 'StudioError';
    }
}

export const badRequest = (message: string) => new StudioError(400, message);
export const conflict = (message: string) => new StudioError(409, message);
export const notFound = (message: string) => new StudioError(404, message);
