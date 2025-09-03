# shell.nix
{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  # These are the packages that will be available in your shell environment
  buildInputs = [
    # Use a recent, stable version of Node.js from nixpkgs.
    # This will come with a compatible version of npm.
    pkgs.nodejs_24
    pkgs.yarn

    # The Go compiler you need for the backend
    pkgs.go
    pkgs.cacert
    
    # Add any other system-level tools you need here
    # pkgs.terraform
  ];

  # You can also set environment variables if needed
   shellHook = ''
       export NIX_SSL_CERT_FILE=${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt
   '';
}
