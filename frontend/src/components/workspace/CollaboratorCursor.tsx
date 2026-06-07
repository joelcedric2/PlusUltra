import { Collaborator } from "@/hooks/useSimulatedCollaboration";
import { cn } from "@/lib/utils";

interface CollaboratorCursorProps {
  collaborator: Collaborator;
  isCurrentFile: boolean;
}

export const CollaboratorCursor = ({ collaborator, isCurrentFile }: CollaboratorCursorProps) => {
  if (!isCurrentFile || !collaborator.isActive) return null;

  return (
    <div
      className={cn(
        "absolute left-0 right-0 h-6 pointer-events-none transition-all duration-500 ease-out flex items-center"
      )}
      style={{
        top: `${(collaborator.currentLine - 1) * 24 + 80}px`, // Approximate line height
        backgroundColor: `hsl(${collaborator.color} / 0.1)`,
        borderLeft: `3px solid hsl(${collaborator.color})`,
      }}
    >
      <div
        className="ml-2 px-2 py-0.5 rounded text-xs font-semibold text-white whitespace-nowrap shadow-lg"
        style={{ backgroundColor: `hsl(${collaborator.color})` }}
      >
        {collaborator.name}
      </div>
    </div>
  );
};
