import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Github, Settings, LogOut, User } from "lucide-react";
import plusUltraLogo from "@/assets/plusultra-logo.png";
import { useAuth } from "@/contexts/AuthContext";

export const LandingHeader = () => {
  const { isAuthenticated, user, logout } = useAuth();
  const navigate = useNavigate();

  const getUserInitials = () => {
    if (!user?.name) return "U";
    return user.name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .substring(0, 2);
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/", { replace: true });
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 glass-panel border-b border-border/50">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <img src={plusUltraLogo} alt="PlusUltra" className="h-12 w-auto" />
          <span className="font-bold text-2xl">PlusUltra</span>
        </Link>

        {/* Right side navigation */}
        <div className="flex items-center gap-4">
          {/* Features Link */}
          <Button variant="ghost" asChild>
            <Link to="/features" className="text-foreground hover:text-accent">
              Features
            </Link>
          </Button>

          {/* Pricing Link */}
          <Button variant="ghost" asChild>
            <Link to="/pricing" className="text-foreground hover:text-accent">
              Pricing
            </Link>
          </Button>

          {/* Contact Link */}
          <Button variant="ghost" asChild>
            <Link to="/contact" className="text-foreground hover:text-accent">
              Contact
            </Link>
          </Button>

          {/* GitHub Repository Link */}
          <Button variant="ghost" size="icon" asChild>
            <a 
              href="https://github.com/plusultra" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-foreground hover:text-accent"
            >
              <Github className="w-5 h-5" />
            </a>
          </Button>

          {/* Account Settings / Login */}
          {isAuthenticated ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                  <Avatar className="h-10 w-10 ring-2 ring-accent/20 hover:ring-accent/40 transition-all cursor-pointer">
                    <AvatarImage src="" alt="User" />
                    <AvatarFallback className="bg-accent/10 text-accent font-semibold">
                      {getUserInitials()}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 glass-panel">
                <DropdownMenuItem className="cursor-pointer" onClick={() => navigate("/profile")}>
                  <User className="w-4 h-4 mr-2" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer" onClick={() => navigate("/settings")}>
                  <Settings className="w-4 h-4 mr-2" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="cursor-pointer text-destructive focus:text-destructive" onClick={handleLogout}>
                  <LogOut className="w-4 h-4 mr-2" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button
              variant="default"
              className="bg-gradient-to-r from-accent to-purple text-white border-0"
              asChild
            >
              <Link to="/signin">Sign In</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
};