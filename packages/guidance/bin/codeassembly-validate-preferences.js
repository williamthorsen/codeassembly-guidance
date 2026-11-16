#!/usr/bin/env node

// Runs the bundled validate-preferences helper. The bundle is self-contained, so the package doesn't need any runtime
// dependencies, and its own entry guard stays false here because `process.argv[1]` names this file.
import path from 'node:path';
import process from 'node:process';

import { runValidatePreferencesCommand } from '../content/scripts/validate-preferences.mjs';

const programName = path.basename(process.argv[1] ?? 'codeassembly-validate-preferences', '.js');

process.exitCode = await runValidatePreferencesCommand(process.argv.slice(2), process.cwd(), programName);
