import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Collaborator } from "@/hooks/useSimulatedCollaboration";
import { cn } from "@/lib/utils";

interface CollaboratorPresenceProps {
  collaborators: Collaborator[];
}

export const CollaboratorPresence = ({ collaborators }: CollaboratorPresenceProps) => {
  const activeCollaborators = collaborators.filter(c => c.isActive);
  
  return (
    <TooltipProvider>
      <div className="flex items-center gap-1">
        <div className="flex -space-x-2">
          {activeCollaborators.slice(0, 5).map((collab) => (
            <Tooltip key={collab.id}>
              <TooltipTrigger asChild>
                <div className="relative">
                  <Avatar
                    className={cn(
                      "w-8 h-8 border-2 border-background cursor-pointer transition-transform hover:scale-110 hover:z-10"
                    )}
                    style={{ borderColor: `hsl(${collab.color})` }}
                  >
                    <AvatarFallback
                      className="text-xs font-semibold text-white"
                      style={{ backgroundColor: `hsl(${collab.color})` }}
                    >
                      {collab.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </AvatarFallback>
                  </Avatar>
                  <div
                    className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-background"
                    style={{ backgroundColor: `hsl(${collab.color})` }}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-card border-border">
                <div className="text-xs space-y-1">
                  <p className="font-semibold">{collab.name}</p>
                  <p className="text-muted-foreground capitalize">{collab.role}</p>
                  <p className="text-muted-foreground truncate max-w-[200px]">
                    {collab.currentFile}
                  </p>
                </div>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
        {activeCollaborators.length > 5 && (
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted text-xs font-semibold text-muted-foreground border-2 border-background">
            +{activeCollaborators.length - 5}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
};
