#!/bin/bash
# Build the TypeScript files
echo "Building TypeScript files..."
npm run build

# Run the bootstrap file
echo "Running bootstrap.ts for debugging..."
node dist/bootstrap.js
