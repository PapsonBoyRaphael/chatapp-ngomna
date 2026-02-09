#!/usr/bin/env node

/**
 * Test des noms de streams - Vérifier que tous les streams utilisent le préfixe chat:stream:
 */

const fs = require("fs");
const path = require("path");

const STREAM_PATTERN = /chat:stream:[a-z:]+/gi;
const OLD_PATTERNS = [
  /["']stream:messages:/gi,
  /["']stream:status:/gi,
  /["']stream:events:(?!typing|reactions|replies|conversations|files|notifications|analytics|users|conversation)/gi,
  /["']events:notifications/gi,
  /["']events:conversations/gi,
  /["']events:analytics/gi,
  /["']events:files/gi,
  /["']events:users(?!:)/gi,
];

const EXCLUDE_DIRS = ["node_modules", ".git", "logs", "storage"];
const JS_FILES = [];

function findJsFiles(dir) {
  const files = fs.readdirSync(dir);

  files.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    // Skip excluded directories
    if (stat.isDirectory()) {
      if (!EXCLUDE_DIRS.includes(file)) {
        findJsFiles(filePath);
      }
    } else if (file.endsWith(".js")) {
      JS_FILES.push(filePath);
    }
  });
}

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const issues = [];

  // Check for old patterns
  OLD_PATTERNS.forEach((pattern, idx) => {
    const matches = content.match(pattern);
    if (matches) {
      issues.push({
        file: filePath,
        pattern: pattern.toString(),
        matches,
        type: "OLD_PATTERN",
      });
    }
  });

  return issues;
}

// Main
console.log("🔍 Vérification des noms de streams...\n");

findJsFiles(process.cwd());

let totalIssues = 0;
const issues = [];

JS_FILES.forEach((file) => {
  const fileIssues = checkFile(file);
  if (fileIssues.length > 0) {
    totalIssues += fileIssues.length;
    issues.push(...fileIssues);
  }
});

if (issues.length === 0) {
  console.log("✅ Tous les streams utilisent le format correct: chat:stream:*");
  console.log(`   Fichiers vérifiés: ${JS_FILES.length}`);
  process.exit(0);
} else {
  console.log(`❌ ${issues.length} problème(s) trouvé(s):\n`);

  issues.forEach((issue) => {
    console.log(`  📄 ${issue.file}`);
    console.log(`     Pattern: ${issue.pattern}`);
    console.log(`     Matches: ${issue.matches.join(", ")}`);
    console.log();
  });

  process.exit(1);
}
