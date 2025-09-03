# shell.nix
{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  # These are the packages that will be available in your shell environment
  buildInputs = [
    # Use a recent, stable version of Node.js from nixpkgs.
    # This will come with a compatible version of npm.
    pkgs.nodejs-19_x 

    # The Go compiler you need for the backend
    pkgs.go
    
    # Add any other system-level tools you need here
    # pkgs.terraform
  ];

  # You can also set environment variables if needed
  # shellHook = ''
  #   export MY_VAR="hello world"
  # '';
}
