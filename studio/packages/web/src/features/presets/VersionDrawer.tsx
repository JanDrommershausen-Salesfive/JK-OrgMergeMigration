import { Drawer } from '../../components/Drawer';
import type { Report } from '../detail/saveMessage';
import { VersionsTab } from './VersionsTab';

interface Props {
    folder: string;
    object: string;
    open: boolean;
    running: boolean;
    report: Report;
    onClose: () => void;
}

// Versionen eines Objekts in der Seitenleiste: speichern, vergleichen, laden.
export function VersionDrawer({ folder, object, open, running, report, onClose }: Props) {
    return (
        <Drawer open={open} kicker={object} title="Versionen" onClose={onClose}>
            <VersionsTab folder={folder} running={running} report={report} />
        </Drawer>
    );
}
