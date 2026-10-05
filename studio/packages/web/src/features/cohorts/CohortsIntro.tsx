import { useState } from 'react';

const KEY = 'studio.cohortsIntroHidden';

// Merkt sich pro Browser, ob der Hinweis ausgeblendet wurde. Ohne Speicher (privates Fenster) bleibt er sichtbar.
const readHidden = (): boolean => {
    try {
        return localStorage.getItem(KEY) === '1';
    } catch {
        return false;
    }
};

// Erklärung am Anfang der Kohorten-Seite: was eine Kohorte ist und wofür man sie braucht.
export function CohortsIntro() {
    const [hidden, setHidden] = useState(readHidden);

    if (hidden) {
        return (
            <button
                type="button"
                className="mb-4 cursor-pointer text-[13px] text-digital-blue underline"
                onClick={() => {
                    try {
                        localStorage.removeItem(KEY);
                    } catch {
                        /* ohne Speicher gilt der Hinweis nur für diese Sitzung */
                    }
                    setHidden(false);
                }}
            >
                Was ist eine Kohorte?
            </button>
        );
    }

    return (
        <section
            aria-label="Was ist eine Kohorte?"
            className="mb-6 rounded-xl border border-open-blue bg-white px-5 py-4"
        >
            <div className="flex items-start gap-3">
                <h2 className="flex-1 text-base font-bold">Was ist eine Kohorte?</h2>
                <button
                    type="button"
                    className="cursor-pointer text-[13px] text-grey-500 hover:text-ink"
                    onClick={() => {
                        try {
                            localStorage.setItem(KEY, '1');
                        } catch {
                            /* ohne Speicher gilt das Ausblenden nur für diese Sitzung */
                        }
                        setHidden(true);
                    }}
                >
                    Ausblenden
                </button>
            </div>
            <p className="mt-1 text-sm">
                Eine Kohorte ist eine <b>feste Auswahl von Accounts</b> aus der Quelle, auf die du
                einen Lauf beschränkst. Der Lauf nimmt diese Accounts und alles, was daran hängt:
                Contacts, Opportunities, Quotes, Orders, Assets und Cases.
            </p>
            <ul className="mt-2 mb-0 list-disc space-y-1 pl-5 text-[13px] text-grey-500">
                <li>
                    <b className="text-ink">Wofür:</b> Die Sandbox ist klein. Mit einer Kohorte
                    testest du mit einer zusammenhängenden Teilmenge, ohne dass Datensätze ohne
                    ihren Parent ankommen.
                </li>
                <li>
                    <b className="text-ink">Eingefroren:</b> Die Auswahl wird beim Anlegen einmal
                    gezogen und ändert sich danach nicht. Ein erneuter Lauf trifft dieselben
                    Datensätze.
                </li>
                <li>
                    <b className="text-ink">Anlegen:</b> als zufällige Stichprobe (zum Beispiel 50
                    Accounts, optional gefiltert) oder als feste Liste von Ids. Höchstens 500
                    Accounts.
                </li>
                <li>
                    <b className="text-ink">Vorher ansehen:</b> Die Vorschau zeigt je Objekt, wie
                    viele Datensätze in der Kohorte liegen und wie viel Speicher das grob braucht.
                    Sie liest nur aus der Quelle.
                </li>
                <li>
                    <b className="text-ink">Verwenden:</b> Beim Start eines Laufs wählst du unter
                    „Umfang“ die Kohorte. Fang klein an und nimm bei Bedarf eine größere.
                </li>
            </ul>
        </section>
    );
}
