import { useState, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileCode2, Folder, ChevronRight, ChevronDown, File, Save, RefreshCw } from "lucide-react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useSimulatedCollaboration } from "@/hooks/useSimulatedCollaboration";
import { CollaboratorCursor } from "./CollaboratorCursor";
import { FileCollaborationIndicator, FileCollaborator } from "@/components/collaboration/FileCollaborationIndicator";

interface FileNode {
  name: string;
  type: "file" | "folder";
  children?: FileNode[];
  path: string;
  content?: string;
}

interface FileTreeItemProps {
  node: FileNode;
  depth?: number;
  onSelect: (path: string) => void;
  selectedFile: string;
  parentPath?: string;
}

const FileTreeItem = ({ node, depth = 0, onSelect, selectedFile, parentPath = "" }: FileTreeItemProps) => {
  const [isOpen, setIsOpen] = useState(depth === 0 || node.name === "src");
  const fullPath = parentPath ? `${parentPath}/${node.name}` : node.name;
  const isSelected = selectedFile === fullPath;

  return (
    <div>
      <button
        onClick={() => {
          if (node.type === "folder") {
            setIsOpen(!isOpen);
          } else {
            onSelect(fullPath);
          }
        }}
        className={cn(
          "w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-primary/10 transition-colors rounded-md group",
          isSelected && "bg-primary/20 text-primary"
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {node.type === "folder" ? (
          <>
            {isOpen ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
            <Folder className={cn("w-4 h-4", isOpen ? "text-primary" : "text-muted-foreground")} />
          </>
        ) : (
          <>
            <div className="w-4" />
            <File className="w-4 h-4 text-muted-foreground group-hover:text-foreground" />
          </>
        )}
        <span className={cn("flex-1 text-left truncate", isSelected && "font-medium")}>
          {node.name}
        </span>
      </button>
      {node.type === "folder" && isOpen && node.children && (
        <div>
          {node.children.map((child, index) => (
            <FileTreeItem
              key={index}
              node={child}
              depth={depth + 1}
              onSelect={onSelect}
              selectedFile={selectedFile}
              parentPath={fullPath}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// Helper function to build file tree from project files
const buildFileTree = (files: Array<{ path: string; content: string; lastModified: string; size: number }>): FileNode[] => {
  const tree: FileNode[] = [];
  const pathMap = new Map<string, FileNode>();

  files.forEach(file => {
    const parts = file.path.split('/');
    let currentPath = '';

    parts.forEach((part, index) => {
      currentPath += (currentPath ? '/' : '') + part;
      const isFile = index === parts.length - 1;
      const nodeKey = currentPath;

      if (!pathMap.has(nodeKey)) {
        const node: FileNode = {
          name: part,
          type: isFile ? 'file' : 'folder',
          path: currentPath,
          content: isFile ? file.content : undefined,
          children: isFile ? undefined : []
        };
        pathMap.set(nodeKey, node);

        if (isFile) {
          // Add to parent folder
          const parentPath = parts.slice(0, -1).join('/') || '';
          if (parentPath && pathMap.has(parentPath)) {
            const parent = pathMap.get(parentPath)!;
            if (parent.children) {
              parent.children.push(node);
            }
          } else {
            tree.push(node);
          }
        } else {
          // Add to parent folder
          const parentPath = parts.slice(0, -1).join('/') || '';
          if (parentPath && pathMap.has(parentPath)) {
            const parent = pathMap.get(parentPath)!;
            if (parent.children) {
              parent.children.push(node);
            }
          } else {
            tree.push(node);
          }
        }
      }
    });
  });

  return tree;
};

interface CodeViewProps {
  projectId: string;
  files: Record<string, string>;
  onFileUpdate: (filePath: string, content: string) => void;
}

export const CodeView = ({ projectId, files, onFileUpdate }: CodeViewProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { collaborators } = useSimulatedCollaboration();
  const [selectedFile, setSelectedFile] = useState<string>("");
  const [selectedFileContent, setSelectedFileContent] = useState<string>("");
  const [fileStructure, setFileStructure] = useState<FileNode[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);

  // Build file tree from files object
  useEffect(() => {
    const fileArray = Object.entries(files).map(([path, content]) => ({
      path,
      content,
      lastModified: new Date().toISOString(),
      size: content.length
    }));
    const tree = buildFileTree(fileArray);
    setFileStructure(tree);

    // Auto-select first file if none selected
    if (tree.length > 0 && !selectedFile) {
      const firstFile = findFirstFile(tree);
      if (firstFile) {
        setSelectedFile(firstFile.path);
        setSelectedFileContent(firstFile.content || '');
      }
    }
  }, [files]);

  const findFirstFile = (nodes: FileNode[]): FileNode | null => {
    for (const node of nodes) {
      if (node.type === 'file') {
        return node;
      }
      if (node.children) {
        const found = findFirstFile(node.children);
        if (found) return found;
      }
    }
    return null;
  };

  // Load file content when selected file changes
  useEffect(() => {
    if (selectedFile && files[selectedFile]) {
      setSelectedFileContent(files[selectedFile]);
      setHasUnsavedChanges(false);
    }
  }, [selectedFile, files]);

  // Save file content
  const saveFile = async () => {
    if (!selectedFile) return;

    try {
      onFileUpdate(selectedFile, selectedFileContent);
      setHasUnsavedChanges(false);
      toast({
        title: "File saved successfully",
        description: `${selectedFile} has been saved`
      });
    } catch (error) {
      toast({
        title: "Failed to save file",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="h-full flex flex-col bg-background/30">
      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal">
          {/* File Explorer Sidebar */}
          <Panel defaultSize={20} minSize={15} maxSize={35}>
            <div className="h-full flex flex-col border-r border-border/30 bg-card/30 backdrop-blur-xl">
              {/* Explorer Header */}
              <div className="h-14 border-b border-border/30 glass-panel flex items-center justify-between px-4">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Explorer
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {}} // Refresh functionality can be added later
                  className="h-6 w-6 p-0"
                >
                  <RefreshCw className="w-3 h-3" />
                </Button>
              </div>

              {/* File Tree */}
              <ScrollArea className="flex-1">
                <div className="p-2">
                  {fileStructure.map((node, index) => (
                    <FileTreeItem
                      key={`${node.path}-${index}`}
                      node={node}
                      depth={0}
                      onSelect={(path) => {
                        setSelectedFile(path);
                        // File content will be loaded via useEffect
                      }}
                      selectedFile={selectedFile}
                      parentPath=""
                    />
                  ))}
                </div>
              </ScrollArea>
            </div>
          </Panel>

          <PanelResizeHandle className="w-1 bg-border/30 hover:bg-primary/50 hover:shadow-[0_0_20px_rgba(23,217,227,0.3)] transition-all duration-300" />

          {/* Code Editor */}
          <Panel defaultSize={80} minSize={50}>
            <div className="h-full flex flex-col">
              {/* Editor Header */}
              <div className="h-14 border-b border-border/30 glass-panel flex items-center justify-between px-6">
                <div className="flex items-center gap-3">
                  <FileCode2 className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{selectedFile || 'No file selected'}</span>
                  {hasUnsavedChanges && (
                    <span className="text-xs text-amber-500 px-2 py-1 bg-amber-500/10 rounded-md border border-amber-500/20">
                      Modified
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  {/* Collaboration Indicator */}
                  {selectedFile && collaborators.length > 0 && (
                    <FileCollaborationIndicator
                      filePath={selectedFile}
                      projectId={projectId}
                      collaborators={collaborators
                        .filter((c) => c.currentFile === selectedFile)
                        .map((c) => ({
                          userId: c.id,
                          userName: c.name,
                          userAvatar: c.avatar,
                          userColor: c.color,
                          status: 'viewing' as const,
                          lastActivity: new Date(),
                          cursorPosition: c.position
                            ? { line: c.position.line, column: c.position.column }
                            : undefined,
                        }))}
                      compact
                    />
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => selectedFile && saveFile()}
                    disabled={!hasUnsavedChanges || !selectedFile}
                    className="h-7 px-2 text-xs"
                  >
                    <Save className="w-3 h-3 mr-1" />
                    Save
                  </Button>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>TypeScript React</span>
                  </div>
                </div>
              </div>

              {/* Code Editor Area */}
              <ScrollArea className="flex-1">
                <div className="p-6 relative">
                  {/* Collaborator Cursors */}
                  {collaborators.map((collab) => (
                    <CollaboratorCursor
                      key={collab.id}
                      collaborator={collab}
                      isCurrentFile={collab.currentFile === selectedFile}
                    />
                  ))}

                  {selectedFile ? (
                    <div className="glass-panel rounded-xl p-6 font-mono text-sm border border-primary/10 shadow-2xl relative">
                      <textarea
                        value={selectedFileContent}
                        onChange={(e) => {
                          setSelectedFileContent(e.target.value);
                          setHasUnsavedChanges(true);
                        }}
                        className="w-full h-full min-h-[400px] bg-transparent border-none outline-none resize-none font-mono text-sm leading-6"
                        placeholder="File content will appear here..."
                        spellCheck={false}
                      />
                    </div>
                  ) : (
                    <div className="glass-panel rounded-xl p-6 border border-border/30 flex items-center justify-center min-h-[400px]">
                      <div className="text-center text-muted-foreground">
                        <FileCode2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>Select a file to start editing</p>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>

              {/* Status Bar */}
              <div className="h-10 border-t border-border/30 glass-panel flex items-center justify-between px-6 text-xs">
                <div className="flex items-center gap-4 text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-primary" />
                    <span className="font-medium">No errors</span>
                  </div>
                  <span>•</span>
                  <span>UTF-8</span>
                  <span>•</span>
                  <span>LF</span>
                </div>
                <div className="flex items-center gap-4 text-muted-foreground">
                  <span>Ln 1, Col 1</span>
                  <span>•</span>
                  <span className="text-primary">TSX</span>
                </div>
              </div>
            </div>
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
};
