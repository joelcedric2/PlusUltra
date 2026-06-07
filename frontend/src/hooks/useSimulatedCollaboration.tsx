import { useState, useEffect } from "react";

export type UserRole = "admin" | "editor" | "viewer";

export interface Collaborator {
  id: string;
  name: string;
  role: UserRole;
  color: string;
  currentFile: string;
  currentLine: number;
  isActive: boolean;
}

const MOCK_COLLABORATORS: Collaborator[] = [
  {
    id: "1",
    name: "Sarah Chen",
    role: "admin",
    color: "189 94% 55%", // cyan from design system
    currentFile: "src/App.tsx",
    currentLine: 12,
    isActive: true,
  },
  {
    id: "2",
    name: "Marcus Reid",
    role: "editor",
    color: "271 76% 65%", // purple from design system
    currentFile: "src/components/Workspace.tsx",
    currentLine: 45,
    isActive: true,
  },
  {
    id: "3",
    name: "Elena Popov",
    role: "editor",
    color: "43 96% 56%", // gold from design system
    currentFile: "src/App.tsx",
    currentLine: 8,
    isActive: false,
  },
];

export const useSimulatedCollaboration = () => {
  const [collaborators, setCollaborators] = useState<Collaborator[]>(MOCK_COLLABORATORS);

  useEffect(() => {
    // Simulate cursor movement every 2-4 seconds
    const interval = setInterval(() => {
      setCollaborators(prev =>
        prev.map(collab => ({
          ...collab,
          currentLine: collab.isActive
            ? Math.floor(Math.random() * 30) + 1
            : collab.currentLine,
        }))
      );
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  return { collaborators };
};
