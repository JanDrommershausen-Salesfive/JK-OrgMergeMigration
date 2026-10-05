import { Route, Routes } from 'react-router';
import { ConfigPage } from '../pages/ConfigPage';
import { CohortsPage } from '../pages/CohortsPage';
import { LimitsPage } from '../pages/LimitsPage';
import { OrgCleanerPage } from '../pages/OrgCleanerPage';
import { QuickQueryPage } from '../pages/QuickQueryPage';
import { TodosPage } from '../pages/TodosPage';
import { ToolsPage } from '../pages/ToolsPage';
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
                <Route path="tools" element={<ToolsPage />} />
                <Route path="tools/org-cleaner" element={<OrgCleanerPage />} />
                <Route path="tools/limits" element={<LimitsPage />} />
                <Route path="tools/query" element={<QuickQueryPage />} />
                <Route path="tools/todos" element={<TodosPage />} />
                <Route path="laeufe" element={<RunsPage />} />
                <Route path="laeufe/:folder/:id" element={<RunsPage />} />
                <Route path="*" element={<OverviewPage />} />
            </Route>
        </Routes>
    );
}
