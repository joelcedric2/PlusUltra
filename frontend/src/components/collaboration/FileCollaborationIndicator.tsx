/**
 * File Collaboration Indicator
 * Shows who is currently viewing/editing a file in real-time
 */

import { useState, useEffect } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Eye, Edit3, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FileCollaborator {
  userId: string;
  userName: string;
  userAvatar?: string;
  userColor: string; // Unique color for cursor/highlight
  status: 'viewing' | 'editing';
  lastActivity: Date;
  cursorPosition?: {
    line: number;
    column: number;
  };
}

interface FileCollaborationIndicatorProps {
  filePath: string;
  projectId: string;
  collaborators: FileCollaborator[];
  compact?: boolean;
  className?: string;
}

export const FileCollaborationIndicator: React.FC<FileCollaborationIndicatorProps> = ({
  filePath,
  projectId,
  collaborators,
  compact = false,
  className,
}) => {
  const [activeCollaborators, setActiveCollaborators] = useState<FileCollaborator[]>([]);

  useEffect(() => {
    // Filter out stale collaborators (inactive for >2 minutes)
    const now = new Date();
    const active = collaborators.filter((collab) => {
      const inactiveDuration = now.getTime() - new Date(collab.lastActivity).getTime();
      return inactiveDuration < 2 * 60 * 1000; // 2 minutes
    });

    setActiveCollaborators(active);
  }, [collaborators]);

  if (activeCollaborators.length === 0) {
    return null;
  }

  const editingCount = activeCollaborators.filter((c) => c.status === 'editing').length;
  const viewingCount = activeCollaborators.filter((c) => c.status === 'viewing').length;

  // Compact mode: just show avatar stack
  if (compact) {
    return (
      <TooltipProvider>
        <div className={cn('flex items-center gap-1', className)}>
          <div className="flex -space-x-2">
            {activeCollaborators.slice(0, 3).map((collab) => (
              <Tooltip key={collab.userId}>
                <TooltipTrigger asChild>
                  <div className="relative">
                    <Avatar className="w-6 h-6 border-2 border-background">
                      <AvatarImage src={collab.userAvatar} alt={collab.userName} />
                      <AvatarFallback
                        className="text-xs"
                        style={{ backgroundColor: collab.userColor }}
                      >
                        {collab.userName.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    {collab.status === 'editing' && (
                      <div
                        className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background flex items-center justify-center"
                        style={{ backgroundColor: collab.userColor }}
                      >
                        <Edit3 className="w-2 h-2 text-white" />
                      </div>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="text-xs">
                    <div className="font-medium">{collab.userName}</div>
                    <div className="text-muted-foreground">
                      {collab.status === 'editing' ? 'Editing' : 'Viewing'}
                      {collab.cursorPosition && (
                        <> at line {collab.cursorPosition.line}</>
                      )}
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
          {activeCollaborators.length > 3 && (
            <span className="text-xs text-muted-foreground ml-1">
              +{activeCollaborators.length - 3}
            </span>
          )}
        </div>
      </TooltipProvider>
    );
  }

  // Full mode: show detailed list
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div className="flex items-center gap-2">
        <Users className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium text-muted-foreground">
          {activeCollaborators.length} collaborator{activeCollaborators.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {editingCount > 0 && (
          <Badge variant="secondary" className="gap-1 text-xs">
            <Edit3 className="w-3 h-3" />
            {editingCount} editing
          </Badge>
        )}
        {viewingCount > 0 && (
          <Badge variant="outline" className="gap-1 text-xs">
            <Eye className="w-3 h-3" />
            {viewingCount} viewing
          </Badge>
        )}
      </div>

      <div className="flex -space-x-2">
        {activeCollaborators.map((collab) => (
          <TooltipProvider key={collab.userId}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="relative cursor-pointer hover:z-10 transition-transform hover:scale-110">
                  <Avatar className="w-8 h-8 border-2 border-background">
                    <AvatarImage src={collab.userAvatar} alt={collab.userName} />
                    <AvatarFallback style={{ backgroundColor: collab.userColor }}>
                      {collab.userName.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  {collab.status === 'editing' && (
                    <div
                      className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-background flex items-center justify-center"
                      style={{ backgroundColor: collab.userColor }}
                    >
                      <Edit3 className="w-2.5 h-2.5 text-white" />
                    </div>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <div className="text-xs">
                  <div className="font-medium">{collab.userName}</div>
                  <div className="text-muted-foreground">
                    {collab.status === 'editing' ? 'Editing' : 'Viewing'}
                    {collab.cursorPosition && (
                      <> at line {collab.cursorPosition.line}:{collab.cursorPosition.column}</>
                    )}
                  </div>
                  <div className="text-muted-foreground mt-1">
                    Last activity:{' '}
                    {Math.floor((Date.now() - new Date(collab.lastActivity).getTime()) / 1000)}s ago
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ))}
      </div>
    </div>
  );
};

/**
 * Inline Cursor Indicator
 * Shows remote user cursors in the code editor
 */
interface CursorIndicatorProps {
  collaborator: FileCollaborator;
  style?: React.CSSProperties;
}

export const CursorIndicator: React.FC<CursorIndicatorProps> = ({ collaborator, style }) => {
  return (
    <div
      className="absolute pointer-events-none z-50"
      style={{
        ...style,
        borderLeft: `2px solid ${collaborator.userColor}`,
      }}
    >
      <div
        className="absolute -top-4 left-0 px-1.5 py-0.5 rounded text-xs font-medium text-white whitespace-nowrap"
        style={{ backgroundColor: collaborator.userColor }}
      >
        {collaborator.userName}
      </div>
    </div>
  );
};

/**
 * Line Selection Indicator
 * Shows when another user has selected text
 */
interface SelectionIndicatorProps {
  collaborator: FileCollaborator;
  startLine: number;
  endLine: number;
  style?: React.CSSProperties;
}

export const SelectionIndicator: React.FC<SelectionIndicatorProps> = ({
  collaborator,
  startLine,
  endLine,
  style,
}) => {
  return (
    <div
      className="absolute pointer-events-none z-40 opacity-20"
      style={{
        ...style,
        backgroundColor: collaborator.userColor,
      }}
    />
  );
};
