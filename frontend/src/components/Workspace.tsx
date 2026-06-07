/**
 * PlusUltra Workspace - Main development environment
 *
 * Layout Architecture (70/30 split):
 * ┌─────────────────────────────────────────────────────────────┐
 * │                        Header                                │
 * ├────────────────────────────────┬────────────────────────────┤
 * │                                │                            │
 * │   Chat Area (top)              │   Code View                │
 * │   ─────────────────            │   OR                       │
 * │   Preview Area (bottom)        │   Analytics View           │
 * │   (adaptive: mobile/desktop)   │   OR                       │
 * │                                │   Deploy View              │
 * │        70% width               │       30% width            │
 * │                                │                            │
 * └────────────────────────────────┴────────────────────────────┘
 *
 * The left pane combines Chat + Preview vertically.
 * The right pane shows Code/Analytics/Deploy based on view mode.
 */

import { useState, useRef } from 'react';
import { Panel, PanelGroup, PanelResizeHandle, ImperativePanelHandle } from 'react-resizable-panels';
import { motion, AnimatePresence } from 'framer-motion';

// Components
import { Header } from './workspace/Header';
import { ChatPane } from './workspace/ChatPane';
import { PreviewPane } from './workspace/PreviewPane';
import { CodeView } from './workspace/CodeView';
import { BuildDeployPane } from './workspace/BuildDeployPane';

// Utilities
import { cn } from '@/lib/utils';
import { fadeIn, springs } from '@/lib/animations';

// =============================================================================
// TYPES
// =============================================================================

export type ViewMode = 'preview' | 'code' | 'build';
export type DeviceMode = 'mobile' | 'tablet' | 'desktop';

// =============================================================================
// WORKSPACE COMPONENT
// =============================================================================

export const Workspace = () => {
  // View and device modes
  const [viewMode, setViewMode] = useState<ViewMode>('preview');
  const [deviceMode, setDeviceMode] = useState<DeviceMode>('desktop');

  // Project state
  const [currentProjectId, setCurrentProjectId] = useState<string>('1');
  const [projectName, setProjectName] = useState<string>('Untitled Project');
  const [currentPage, setCurrentPage] = useState<string>('/home');
  const [availablePages, setAvailablePages] = useState<string[]>(['/home', '/about', '/settings']);

  // Preview state
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState<number>(0);

  // File state
  const [currentFiles, setCurrentFiles] = useState<Record<string, string>>({
    'src/App.tsx': `import React, { useState } from 'react';
import './App.css';

function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="App">
      <header className="App-header">
        <h1>PlusUltra Project</h1>
        <p>A test application for PlusUltra</p>
        <button onClick={() => setCount(count + 1)}>
          Clicked {count} times
        </button>
      </header>
    </div>
  );
}

export default App;`,
    'src/index.tsx': `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);`,
  });

  // Panel refs and collapse state
  const leftPanelRef = useRef<ImperativePanelHandle>(null);
  const chatPanelRef = useRef<ImperativePanelHandle>(null);
  const [isLeftCollapsed, setIsLeftCollapsed] = useState(false);
  const [isChatMinimized, setIsChatMinimized] = useState(false);

  // ==========================================================================
  // HANDLERS
  // ==========================================================================

  const handleToggleLeftPanel = () => {
    if (leftPanelRef.current) {
      if (isLeftCollapsed) {
        leftPanelRef.current.expand();
      } else {
        leftPanelRef.current.collapse();
      }
      setIsLeftCollapsed(!isLeftCollapsed);
    }
  };

  const handleToggleChatMinimize = () => {
    if (chatPanelRef.current) {
      if (isChatMinimized) {
        chatPanelRef.current.resize(50); // Restore to 50% of left panel
      } else {
        chatPanelRef.current.resize(10); // Minimize to 10%
      }
      setIsChatMinimized(!isChatMinimized);
    }
  };

  const handleFileUpdate = (filePath: string, content: string) => {
    setCurrentFiles((prev) => ({
      ...prev,
      [filePath]: content,
    }));
  };

  const handleRefreshPreview = () => {
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewKey((prev) => prev + 1);

    // Simulate build/preview generation
    setTimeout(() => {
      const staticPreviewUrl = 'https://example.com/live-preview-placeholder.html';
      setPreviewUrl(staticPreviewUrl);
      setPreviewLoading(false);
    }, 1500);
  };

  const handlePageChange = (page: string) => {
    setCurrentPage(page);
  };

  const handleProjectNameChange = (name: string) => {
    setProjectName(name);
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    <div className="h-screen w-full flex flex-col bg-background overflow-hidden">
      {/* Header with controls */}
      <Header
        viewMode={viewMode}
        setViewMode={setViewMode}
        deviceMode={deviceMode}
        setDeviceMode={setDeviceMode}
        onToggleChat={handleToggleLeftPanel}
        isChatCollapsed={isLeftCollapsed}
        projectId={currentProjectId}
        projectName={projectName}
        onProjectNameChange={handleProjectNameChange}
        onRefreshPreview={handleRefreshPreview}
        currentPage={currentPage}
        availablePages={availablePages}
        onPageChange={handlePageChange}
      />

      {/* Main content area */}
      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal" className="h-full">
          {/* =================================================================
              LEFT PANEL (70%) - Chat + Preview stacked vertically
              ================================================================= */}
          <Panel
            ref={leftPanelRef}
            defaultSize={70}
            minSize={40}
            maxSize={85}
            collapsible
            onCollapse={() => setIsLeftCollapsed(true)}
            onExpand={() => setIsLeftCollapsed(false)}
          >
            <PanelGroup direction="vertical" className="h-full">
              {/* Chat Area (top) */}
              <Panel
                ref={chatPanelRef}
                defaultSize={50}
                minSize={15}
                maxSize={80}
                className="relative"
              >
                <motion.div
                  className="h-full"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3 }}
                >
                  <ChatPane />
                </motion.div>

                {/* Chat minimize button */}
                <button
                  onClick={handleToggleChatMinimize}
                  className={cn(
                    'absolute bottom-2 right-2 z-10',
                    'w-6 h-6 rounded-md',
                    'flex items-center justify-center',
                    'glass-button text-muted-foreground',
                    'hover:text-foreground',
                    'transition-all duration-200'
                  )}
                  title={isChatMinimized ? 'Expand chat' : 'Minimize chat'}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className={cn(
                      'w-3.5 h-3.5 transition-transform duration-200',
                      isChatMinimized && 'rotate-180'
                    )}
                  >
                    <path d="m18 15-6-6-6 6" />
                  </svg>
                </button>
              </Panel>

              {/* Vertical resize handle */}
              <PanelResizeHandle
                className={cn(
                  'h-1.5 relative group',
                  'bg-transparent',
                  'hover:bg-accent/20',
                  'transition-colors duration-200'
                )}
              >
                <div
                  className={cn(
                    'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
                    'w-12 h-1 rounded-full',
                    'bg-border group-hover:bg-accent/50',
                    'transition-colors duration-200'
                  )}
                />
              </PanelResizeHandle>

              {/* Preview Area (bottom) */}
              <Panel
                defaultSize={50}
                minSize={20}
                className="relative"
              >
                <motion.div
                  className="h-full"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3, delay: 0.1 }}
                >
                  <PreviewPane
                    key={previewKey}
                    deviceMode={deviceMode}
                    previewUrl={previewUrl}
                    loading={previewLoading}
                    error={previewError}
                    onRefresh={handleRefreshPreview}
                    fileCount={Object.keys(currentFiles).length}
                  />
                </motion.div>
              </Panel>
            </PanelGroup>
          </Panel>

          {/* =================================================================
              HORIZONTAL RESIZE HANDLE
              ================================================================= */}
          <PanelResizeHandle
            className={cn(
              'w-1.5 relative group',
              'bg-transparent',
              'hover:bg-accent/20',
              'transition-colors duration-200'
            )}
          >
            <div
              className={cn(
                'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
                'w-1 h-12 rounded-full',
                'bg-border group-hover:bg-accent/50',
                'transition-colors duration-200'
              )}
            />
          </PanelResizeHandle>

          {/* =================================================================
              RIGHT PANEL (30%) - Code / Analytics / Deploy
              ================================================================= */}
          <Panel
            defaultSize={30}
            minSize={15}
            maxSize={60}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={viewMode}
                className="h-full"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={springs.smooth}
              >
                {viewMode === 'code' ? (
                  <CodeView
                    projectId={currentProjectId}
                    files={currentFiles}
                    onFileUpdate={handleFileUpdate}
                  />
                ) : viewMode === 'build' ? (
                  <BuildDeployPane
                    projectId={currentProjectId}
                    files={currentFiles}
                  />
                ) : (
                  // Default: Show code view alongside preview
                  <CodeView
                    projectId={currentProjectId}
                    files={currentFiles}
                    onFileUpdate={handleFileUpdate}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
};

export default Workspace;
