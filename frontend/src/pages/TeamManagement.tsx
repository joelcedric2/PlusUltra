import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, UserPlus, Mail, Shield, Trash2, Search, MoreVertical, CheckCircle2, XCircle, Loader2, Users, Crown, Eye, Edit } from "lucide-react";
import logoImage from "@/assets/plusultra-logo.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api";
import { cn } from "@/lib/utils";

interface TeamMember {
  id: string;
  email: string;
  roles: string[];
  permissions: string[];
  workspaceId?: string;
  createdAt: string;
  isActive: boolean;
  lastActive?: string;
}

interface CreateUserData {
  id: string;
  email: string;
  roles: string[];
  workspaceId?: string;
}

const TeamManagement = () => {
  const { toast } = useToast();
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"owner" | "editor" | "viewer">("editor");
  const [isInviting, setIsInviting] = useState(false);

  // Simulated team members for demo (replace with actual API call)
  useEffect(() => {
    const loadTeamMembers = async () => {
      setIsLoading(true);
      try {
        // Simulate API call - replace with actual endpoint when available
        setTimeout(() => {
          setTeamMembers([
            {
              id: "1",
              email: "john@example.com",
              roles: ["owner"],
              permissions: ["all"],
              createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
              isActive: true,
              lastActive: new Date().toISOString(),
            },
            {
              id: "2",
              email: "sarah@example.com",
              roles: ["editor"],
              permissions: ["read", "write", "execute"],
              createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
              isActive: true,
              lastActive: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
            },
            {
              id: "3",
              email: "mike@example.com",
              roles: ["viewer"],
              permissions: ["read"],
              createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
              isActive: true,
              lastActive: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
            },
          ]);
          setIsLoading(false);
        }, 500);
      } catch (error) {
        console.error("Failed to load team members:", error);
        toast({
          title: "Failed to load team",
          description: "Could not load team members. Please try again.",
          variant: "destructive",
        });
        setIsLoading(false);
      }
    };

    loadTeamMembers();
  }, [toast]);

  const handleInviteUser = async () => {
    if (!inviteEmail.trim()) {
      toast({
        title: "Email required",
        description: "Please enter an email address to invite.",
        variant: "destructive",
      });
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail)) {
      toast({
        title: "Invalid email",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }

    setIsInviting(true);

    try {
      const newUser: CreateUserData = {
        id: `user_${Date.now()}`,
        email: inviteEmail,
        roles: [inviteRole],
        workspaceId: "default-workspace",
      };

      const response = await apiClient.post("/api/v1/rbac/users", newUser);

      if (response.success) {
        const createdUser: TeamMember = {
          id: newUser.id,
          email: newUser.email,
          roles: newUser.roles,
          permissions: inviteRole === "owner" ? ["all"] : inviteRole === "editor" ? ["read", "write", "execute"] : ["read"],
          createdAt: new Date().toISOString(),
          isActive: true,
          workspaceId: newUser.workspaceId,
        };

        setTeamMembers([...teamMembers, createdUser]);
        toast({
          title: "User invited successfully",
          description: `${inviteEmail} has been invited as ${inviteRole}`,
        });
        setIsInviteDialogOpen(false);
        setInviteEmail("");
        setInviteRole("editor");
      }
    } catch (error) {
      console.error("Failed to invite user:", error);
      toast({
        title: "Invitation failed",
        description: error instanceof Error ? error.message : "Failed to invite user. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsInviting(false);
    }
  };

  const handleUpdateRole = async (userId: string, newRole: string) => {
    try {
      const response = await apiClient.put(`/api/v1/rbac/users/${userId}/roles`, {
        roles: [newRole],
      });

      if (response.success) {
        setTeamMembers(
          teamMembers.map((member) =>
            member.id === userId
              ? {
                  ...member,
                  roles: [newRole],
                  permissions: newRole === "owner" ? ["all"] : newRole === "editor" ? ["read", "write", "execute"] : ["read"],
                }
              : member
          )
        );
        toast({
          title: "Role updated",
          description: "User role has been updated successfully",
        });
      }
    } catch (error) {
      console.error("Failed to update role:", error);
      toast({
        title: "Update failed",
        description: "Failed to update user role. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleRemoveUser = async (userId: string, email: string) => {
    try {
      const response = await apiClient.delete(`/api/v1/rbac/users/${userId}`);

      if (response.success) {
        setTeamMembers(teamMembers.filter((member) => member.id !== userId));
        toast({
          title: "User removed",
          description: `${email} has been removed from the team`,
        });
      }
    } catch (error) {
      console.error("Failed to remove user:", error);
      toast({
        title: "Removal failed",
        description: "Failed to remove user. Please try again.",
        variant: "destructive",
      });
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "owner":
        return <Crown className="w-4 h-4" />;
      case "editor":
        return <Edit className="w-4 h-4" />;
      case "viewer":
        return <Eye className="w-4 h-4" />;
      default:
        return <Shield className="w-4 h-4" />;
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "owner":
        return "bg-purple-500/10 text-purple-500 border-purple-500/20";
      case "editor":
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "viewer":
        return "bg-gray-500/10 text-gray-500 border-gray-500/20";
      default:
        return "";
    }
  };

  const filteredMembers = teamMembers.filter((member) =>
    member.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getInitials = (email: string) => {
    return email.substring(0, 2).toUpperCase();
  };

  const formatLastActive = (timestamp?: string) => {
    if (!timestamp) return "Never";
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/20">
      {/* Header */}
      <header className="h-16 bg-card/80 backdrop-blur-2xl border-b border-border flex items-center justify-between px-6 sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <Link to="/" className="w-12 h-12 rounded-xl flex items-center justify-center hover:opacity-80 transition-opacity">
            <img src={logoImage} alt="PlusUltra Logo" className="w-12 h-12 object-contain" />
          </Link>
          <div>
            <h1 className="font-bold text-xl text-foreground">Team Management</h1>
            <p className="text-xs text-muted-foreground">Manage team members and permissions</p>
          </div>
        </div>
        <Link to="/workspace">
          <Button variant="outline" size="sm" className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Workspace
          </Button>
        </Link>
      </header>

      <div className="container mx-auto px-6 py-8 max-w-7xl">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="bg-card/80 backdrop-blur-sm border-border">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Members</p>
                  <p className="text-2xl font-bold">{teamMembers.length}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Users className="w-6 h-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/80 backdrop-blur-sm border-border">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Active Now</p>
                  <p className="text-2xl font-bold">{teamMembers.filter((m) => m.isActive).length}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6 text-green-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/80 backdrop-blur-sm border-border">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Roles Assigned</p>
                  <p className="text-2xl font-bold">{new Set(teamMembers.flatMap((m) => m.roles)).size}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center">
                  <Shield className="w-6 h-6 text-purple-500" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Table Card */}
        <Card className="bg-card/80 backdrop-blur-sm border-border">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Team Members</CardTitle>
                <CardDescription>Manage your team members and their permissions</CardDescription>
              </div>
              <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-gradient-to-r from-accent to-purple hover:opacity-90 text-accent-foreground shadow-lg shadow-accent/20">
                    <UserPlus className="w-4 h-4 mr-2" />
                    Invite Member
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Invite Team Member</DialogTitle>
                    <DialogDescription>Send an invitation to join your team</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email Address</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="colleague@example.com"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="role">Role</Label>
                      <Select value={inviteRole} onValueChange={(value: any) => setInviteRole(value)}>
                        <SelectTrigger id="role">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="owner">
                            <div className="flex items-center gap-2">
                              <Crown className="w-4 h-4 text-purple-500" />
                              Owner - Full access
                            </div>
                          </SelectItem>
                          <SelectItem value="editor">
                            <div className="flex items-center gap-2">
                              <Edit className="w-4 h-4 text-blue-500" />
                              Editor - Can edit and collaborate
                            </div>
                          </SelectItem>
                          <SelectItem value="viewer">
                            <div className="flex items-center gap-2">
                              <Eye className="w-4 h-4 text-gray-500" />
                              Viewer - Read-only access
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsInviteDialogOpen(false)} disabled={isInviting}>
                      Cancel
                    </Button>
                    <Button onClick={handleInviteUser} disabled={isInviting}>
                      {isInviting ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Mail className="w-4 h-4 mr-2" />
                          Send Invite
                        </>
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search team members..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Permissions</TableHead>
                    <TableHead>Last Active</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMembers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No team members found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredMembers.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="w-10 h-10">
                              <AvatarFallback className="bg-gradient-to-br from-accent/30 to-purple/30">
                                {getInitials(member.email)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium">{member.email}</p>
                              <p className="text-xs text-muted-foreground">
                                Joined {new Date(member.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("gap-1", getRoleBadgeColor(member.roles[0]))}>
                            {getRoleIcon(member.roles[0])}
                            {member.roles[0]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {member.permissions.slice(0, 2).map((perm) => (
                              <Badge key={perm} variant="secondary" className="text-xs">
                                {perm}
                              </Badge>
                            ))}
                            {member.permissions.length > 2 && (
                              <Badge variant="secondary" className="text-xs">
                                +{member.permissions.length - 2}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">{formatLastActive(member.lastActive)}</span>
                        </TableCell>
                        <TableCell>
                          {member.isActive ? (
                            <div className="flex items-center gap-2 text-green-500">
                              <CheckCircle2 className="w-4 h-4" />
                              <span className="text-sm">Active</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <XCircle className="w-4 h-4" />
                              <span className="text-sm">Inactive</span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleUpdateRole(member.id, "owner")}>
                                <Crown className="w-4 h-4 mr-2" />
                                Make Owner
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleUpdateRole(member.id, "editor")}>
                                <Edit className="w-4 h-4 mr-2" />
                                Make Editor
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleUpdateRole(member.id, "viewer")}>
                                <Eye className="w-4 h-4 mr-2" />
                                Make Viewer
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => handleRemoveUser(member.id, member.email)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Remove Member
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default TeamManagement;
