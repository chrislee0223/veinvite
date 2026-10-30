import { readFile } from 'node:fs/promises';

const [source, functionName] = process.argv.slice(2);
if (!source || !/^[a-z][a-z0-9_]*$/.test(functionName ?? '')) {
  throw new Error('Usage: extract-postgres-function.mjs <migration-path> <function-name>');
}
const sql = await readFile(source, 'utf8');
const marker = `CREATE OR REPLACE FUNCTION public.${functionName}(`;
const start = sql.indexOf(marker);
if (start < 0 || sql.indexOf(marker, start + marker.length) !== -1) {
  throw new Error('Expected exactly one occurrence of ' + functionName);
}
const end = sql.indexOf('$function$\n;', start);
if (end < 0) throw new Error('Missing end of function ' + functionName);
const functionSql = sql.slice(start, end + '$function$\n;'.length);
if (!/SECURITY DEFINER/i.test(functionSql)) {
  throw new Error('Unexpected function definition: ' + functionName);
}
process.stdout.write(functionSql + '\n');
