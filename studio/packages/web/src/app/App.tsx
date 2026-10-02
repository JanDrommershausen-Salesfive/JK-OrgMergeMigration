import { Route, Routes } from 'react-router';
import { ConfigPage } from '../pages/ConfigPage';
import { CohortsPage } from '../pages/CohortsPage';
import { OverviewPage } from '../pages/OverviewPage';
import { RunsPage } from '../pages/RunsPage';
import { AppLayout } from './AppLayout';

// Adressen: / Übersicht · /konfiguration/:objekt/:tab · /kohorten/:kohorte · /laeufe/:objekt/:lauf
export function App() {
    return (
        <Routes>
            <Route element={<AppLayout />}>
                <Route index element={<OverviewPage />} />
                <Route path="konfiguration" element={<ConfigPage />} />
                <Route path="konfiguration/:folder" element={<ConfigPage />} />
                <Route path="konfiguration/:folder/:tab" element={<ConfigPage />} />
                <Route path="kohorten" element={<CohortsPage />} />
                <Route path="kohorten/:id" element={<CohortsPage />} />
                <Route path="laeufe" element={<RunsPage />} />
                <Route path="laeufe/:folder/:id" element={<RunsPage />} />
                <Route path="*" element={<OverviewPage />} />
            </Route>
        </Routes>
    );
}
