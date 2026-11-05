const fs = require('fs');
const path = require('path');

const migrationsDir = path.resolve(__dirname, '../supabase/migrations');
const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

// Normalize policy names (strip quotes)
const cleanName = (s) => s.replace(/^["'`]|["'`]$/g, '').trim();

/**
 * Extracts balanced parenthesis content starting at or immediately following pos
 */
function extractBalanced(str, startPos) {
  let openIndex = str.indexOf('(', startPos);
  if (openIndex === -1) return null;

  let depth = 0;
  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;
  let resultStart = openIndex + 1;

  for (let i = openIndex; i < str.length; i++) {
    const ch = str[i];
    const next = str[i + 1] || '';

    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (inString) {
      if (ch === "'") {
        if (next === "'") {
          i++; // escaped quote
        } else {
          inString = false;
        }
      }
      continue;
    }

    // Check comment starts
    if (ch === '-' && next === '-') {
      inLineComment = true;
      i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i++;
      continue;
    }
    if (ch === "'") {
      inString = true;
      continue;
    }

    if (ch === '(') {
      depth++;
    } else if (ch === ')') {
      depth--;
      if (depth === 0) {
        return {
          content: str.substring(resultStart, i).trim(),
          endIndex: i + 1,
        };
      }
    }
  }

  throw new Error(`Unbalanced parenthesis encountered starting at index ${openIndex}`);
}

const policies = {}; // table -> Map(policyName, { file, command, to, using, withCheck })
const parseErrors = [];

for (const file of files) {
  const content = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');

  // Find all drops
  const dropRegex = /DROP\s+POLICY\s+(?:IF\s+EXISTS\s+)?(".*?"|'.*?'|`.*?`|[^\s;]+)\s+ON\s+(?:public\.)?([a-zA-Z0-9_]+)/gi;
  let dMatch;
  while ((dMatch = dropRegex.exec(content)) !== null) {
    const pName = cleanName(dMatch[1]);
    const tbl = dMatch[2].toLowerCase();
    if (policies[tbl] && policies[tbl].has(pName)) {
      policies[tbl].delete(pName);
    }
  }

  // Find all creates
  const createRegex = /CREATE\s+POLICY\s+(".*?"|'.*?'|`.*?`|[^\s]+)\s+ON\s+(?:public\.)?([a-zA-Z0-9_]+)/gi;
  let cMatch;
  while ((cMatch = createRegex.exec(content)) !== null) {
    const pName = cleanName(cMatch[1]);
    const tbl = cMatch[2].toLowerCase();
    const statementStartIndex = cMatch.index;

    // Find end of this statement (next semicolon or end of file)
    const semiIndex = content.indexOf(';', statementStartIndex);
    const statementEnd = semiIndex !== -1 ? semiIndex : content.length;
    const stmt = content.substring(statementStartIndex, statementEnd);

    let command = 'ALL';
    const forMatch = /FOR\s+(SELECT|INSERT|UPDATE|DELETE|ALL)/i.exec(stmt);
    if (forMatch) command = forMatch[1].toUpperCase();

    let to = 'authenticated';
    const toMatch = /TO\s+([a-zA-Z0-9_,\s]+?)(?:USING|WITH CHECK|$)/i.exec(stmt);
    if (toMatch) to = toMatch[1].trim();

    let using = undefined;
    const usingKeywordIndex = stmt.search(/\bUSING\s*\(/i);
    if (usingKeywordIndex !== -1) {
      try {
        const bal = extractBalanced(stmt, usingKeywordIndex);
        if (bal) using = bal.content.replace(/\s+/g, ' ');
      } catch (err) {
        parseErrors.push({ file, policy: pName, clause: 'USING', error: err.message });
      }
    }

    let withCheck = undefined;
    const withCheckKeywordIndex = stmt.search(/\bWITH\s+CHECK\s*\(/i);
    if (withCheckKeywordIndex !== -1) {
      try {
        const bal = extractBalanced(stmt, withCheckKeywordIndex);
        if (bal) withCheck = bal.content.replace(/\s+/g, ' ');
      } catch (err) {
        parseErrors.push({ file, policy: pName, clause: 'WITH CHECK', error: err.message });
      }
    }

    if (!policies[tbl]) policies[tbl] = new Map();
    policies[tbl].set(pName, {
      file,
      command,
      to,
      using,
      withCheck,
    });
  }
}

if (parseErrors.length > 0) {
  console.error('FATAL: Policy parsing errors detected:');
  console.error(parseErrors);
  process.exit(1);
}

for (const [table, tablePolicies] of Object.entries(policies)) {
  console.log(`\n=== Table: ${table} (${tablePolicies.size} active policies) ===`);
  for (const [name, pol] of tablePolicies.entries()) {
    console.log(`  - [${pol.file}] "${name}" FOR ${pol.command} TO ${pol.to}`);
    if (pol.using) console.log(`      USING: (${pol.using})`);
    if (pol.withCheck) console.log(`      WITH CHECK: (${pol.withCheck})`);
  }
}

module.exports = {
  policies,
  extractBalanced,
};
