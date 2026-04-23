// @ts-nocheck — standalone maintenance script, run via `vp dlx tsx`
/**
 * Generate example source maps by running REAL transformers.
 *
 * Usage:
 *   vp dlx tsx scripts/generate-examples.ts
 *
 * Prerequisites:
 *   Make sure the transformer CLIs invoked below (`esbuild`, `swc`, `tsc`,
 *   `rolldown`) are available on PATH, and that `oxc-transform` can be
 *   resolved from your global npm modules.
 *
 * The script rewrites `src/examples/index.ts`. Re-run whenever you upgrade a
 * transformer or want to refresh the bundled examples.
 */

import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TransformerResult {
  generatedCode: string;
  sourceMapJson: string;
  entries?: ExampleEntry[];
}

interface ExampleEntry {
  generatedCode: string;
  sourceMapJson: string;
  label: string;
  entryPath: string;
  generatedPath?: string;
  sourceMapPath?: string;
}

interface ExampleDef {
  name: string;
  description: string;
  file: string;
  source: string;
  transformers: Record<string, (source: string, file: string, dir: string) => TransformerResult>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TMP = join("/tmp", "sourcemap-gen-examples");
const WORKSPACE_ROOT = join(import.meta.dirname!, "..");
const VP_BIN = join(process.env.HOME ?? "", ".vite-plus", "bin", "vp");

function ensureDir(dir: string) {
  mkdirSync(dir, { recursive: true });
}

function stripSourceMappingURL(code: string): string {
  return code.replace(/\n?\/\/[#@]\s*sourceMappingURL=.*$/m, "");
}

function readOutput(dir: string, outFile: string): TransformerResult {
  const code = readFileSync(join(dir, outFile), "utf-8");
  const mapFile = outFile + ".map";
  const mapJson = readFileSync(join(dir, mapFile), "utf-8");
  return {
    generatedCode: stripSourceMappingURL(code),
    sourceMapJson: mapJson,
  };
}

function readOutputCollection(dir: string, outFiles: string[]): TransformerResult {
  const entries = [...outFiles].sort().map((outFile) => {
    const result = readOutput(dir, outFile);
    return {
      generatedCode: result.generatedCode,
      sourceMapJson: result.sourceMapJson,
      label: basename(outFile),
      entryPath: outFile,
      generatedPath: outFile,
      sourceMapPath: `${outFile}.map`,
    };
  });

  const first = entries[0];
  if (!first) {
    throw new Error("No output files were generated");
  }

  return {
    generatedCode: first.generatedCode,
    sourceMapJson: first.sourceMapJson,
    entries,
  };
}

const GLOBAL_MODULES = execSync("npm root -g", { encoding: "utf-8" }).trim();

function run(cmd: string, cwd: string) {
  execSync(cmd, {
    cwd,
    stdio: "pipe",
    env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: GLOBAL_MODULES },
  });
}

function runFromWorkspace(cmd: string) {
  execSync(cmd, {
    cwd: WORKSPACE_ROOT,
    stdio: "pipe",
    env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: GLOBAL_MODULES },
  });
}

// ---------------------------------------------------------------------------
// Transformer implementations
// ---------------------------------------------------------------------------

function esbuildTransform(source: string, file: string, dir: string): TransformerResult {
  const inFile = join(dir, file);
  writeFileSync(inFile, source);
  run(`esbuild ${file} --sourcemap=external --outfile=out.js --target=es2022`, dir);
  return readOutput(dir, "out.js");
}

function esbuildBundle(source: string, file: string, dir: string): TransformerResult {
  const inFile = join(dir, file);
  writeFileSync(inFile, source);
  run(
    `esbuild ${file} --bundle --sourcemap=external --outfile=out.js --target=es2022 --format=esm`,
    dir,
  );
  return readOutput(dir, "out.js");
}

function tscTransform(source: string, file: string, dir: string): TransformerResult {
  const inFile = join(dir, file);
  const outDir = join(dir, "out");
  writeFileSync(inFile, source);
  runFromWorkspace(
    `${JSON.stringify(VP_BIN)} dlx -p typescript tsc --ignoreConfig --sourceMap --inlineSources --target es2022 --outDir ${JSON.stringify(outDir)} --declaration false ${JSON.stringify(inFile)}`,
  );
  const baseName = file.replace(/\.tsx?$/, ".js");
  return readOutput(outDir, baseName);
}

function tscDecoratorTransform(source: string, file: string, dir: string): TransformerResult {
  const inFile = join(dir, file);
  const outDir = join(dir, "out");
  writeFileSync(inFile, source);
  runFromWorkspace(
    `${JSON.stringify(VP_BIN)} dlx -p typescript tsc --ignoreConfig --sourceMap --inlineSources --target es2022 --experimentalDecorators --emitDecoratorMetadata --outDir ${JSON.stringify(outDir)} --declaration false ${JSON.stringify(inFile)}`,
  );
  const baseName = file.replace(/\.tsx?$/, ".js");
  return readOutput(outDir, baseName);
}

function swcTransform(source: string, file: string, dir: string): TransformerResult {
  const inFile = join(dir, file);
  writeFileSync(inFile, source);
  writeFileSync(
    join(dir, ".swcrc"),
    JSON.stringify({
      jsc: {
        parser: {
          syntax: "typescript",
          tsx: file.endsWith(".tsx"),
          decorators: false,
        },
        target: "es2022",
      },
      sourceMaps: true,
    }),
  );
  run(`swc ${file} -o out.js --source-maps`, dir);
  return readOutput(dir, "out.js");
}

function swcDecoratorTransform(source: string, file: string, dir: string): TransformerResult {
  const inFile = join(dir, file);
  writeFileSync(inFile, source);
  writeFileSync(
    join(dir, ".swcrc"),
    JSON.stringify({
      jsc: {
        parser: {
          syntax: "typescript",
          decorators: true,
        },
        transform: {
          legacyDecorator: true,
          decoratorMetadata: true,
        },
        target: "es2022",
      },
      sourceMaps: true,
    }),
  );
  run(`swc ${file} -o out.js --source-maps`, dir);
  return readOutput(dir, "out.js");
}

function oxcTransform(source: string, file: string, dir: string): TransformerResult {
  writeFileSync(join(dir, file), source);
  const script = `
    const { transformSync } = require('oxc-transform');
    const fs = require('fs');
    const source = fs.readFileSync('${file}', 'utf-8');
    const result = transformSync('${file}', source, {
      sourcemap: true,
    });
    if (result.errors.length) { console.error(result.errors); process.exit(1); }
    fs.writeFileSync('out.js', result.code);
    fs.writeFileSync('out.js.map', JSON.stringify(result.map));
  `;
  writeFileSync(join(dir, "_transform.cjs"), script);
  run("node _transform.cjs", dir);
  return readOutput(dir, "out.js");
}

function oxcDecoratorTransform(source: string, file: string, dir: string): TransformerResult {
  writeFileSync(join(dir, file), source);
  const script = `
    const { transformSync } = require('oxc-transform');
    const fs = require('fs');
    const source = fs.readFileSync('${file}', 'utf-8');
    const result = transformSync('${file}', source, {
      sourcemap: true,
      decorator: {
        legacy: true,
        emitDecoratorMetadata: true,
      },
    });
    if (result.errors.length) { console.error(result.errors); process.exit(1); }
    fs.writeFileSync('out.js', result.code);
    fs.writeFileSync('out.js.map', JSON.stringify(result.map));
  `;
  writeFileSync(join(dir, "_transform.cjs"), script);
  run("node _transform.cjs", dir);
  return readOutput(dir, "out.js");
}

function rolldownBundle(_source: string, _file: string, dir: string): TransformerResult {
  run(`rolldown app.ts -f esm -o out.js -s`, dir);
  return readOutput(dir, "out.js");
}

function esbuildMultiEntryBundle(_source: string, _file: string, dir: string): TransformerResult {
  run(
    `esbuild alpha.ts beta.ts --bundle --sourcemap=external --outdir=dist --format=esm --target=es2017`,
    dir,
  );
  return readOutputCollection(join(dir, "dist"), ["alpha.js", "beta.js"]);
}

function rolldownMultiEntryBundle(_source: string, _file: string, dir: string): TransformerResult {
  run(`rolldown alpha.ts beta.ts -d dist -f esm -s --transform.target es2017`, dir);
  return readOutputCollection(join(dir, "dist"), ["alpha.js", "beta.js"]);
}

// ---------------------------------------------------------------------------
// Example definitions (source code only — transforms run at generation time)
// ---------------------------------------------------------------------------

const ReactTodoApp: ExampleDef = {
  name: "React Todo App",
  description: "JSX transform + hooks",
  file: "app.tsx",
  source: `import React, { useState, useEffect } from 'react';

interface Todo {
  id: number;
  text: string;
  completed: boolean;
}

const TodoApp: React.FC = () => {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [input, setInput] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem('todos');
    if (saved) {
      setTodos(JSON.parse(saved));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('todos', JSON.stringify(todos));
  }, [todos]);

  const addTodo = () => {
    if (!input.trim()) return;
    setTodos([...todos, { id: Date.now(), text: input, completed: false }]);
    setInput('');
  };

  const toggleTodo = (id: number) => {
    setTodos(todos.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
  };

  const deleteTodo = (id: number) => {
    setTodos(todos.filter(t => t.id !== id));
  };

  return (
    <div className="app">
      <h1>Todo List</h1>
      <div className="input-row">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addTodo()}
          placeholder="Add a todo..."
        />
        <button onClick={addTodo}>Add</button>
      </div>
      <ul>
        {todos.map(todo => (
          <li key={todo.id} className={todo.completed ? 'done' : ''}>
            <span onClick={() => toggleTodo(todo.id)}>{todo.text}</span>
            <button onClick={() => deleteTodo(todo.id)}>\u00d7</button>
          </li>
        ))}
      </ul>
      <p>{todos.filter(t => !t.completed).length} items left</p>
    </div>
  );
};

export default TodoApp;
`,
  transformers: {
    esbuild: esbuildTransform,
    oxc: oxcTransform,
    swc: swcTransform,
  },
};

const TypeScriptClasses: ExampleDef = {
  name: "TypeScript Classes",
  description: "Class inheritance + generics",
  file: "classes.ts",
  source: `abstract class Animal {
  constructor(
    protected name: string,
    protected age: number
  ) {}

  abstract speak(): string;

  toString(): string {
    return \`\${this.name} (\${this.age} years old)\`;
  }
}

class Dog extends Animal {
  constructor(name: string, age: number, private breed: string) {
    super(name, age);
  }

  speak(): string {
    return \`\${this.name} says: Woof!\`;
  }

  fetch(item: string): string {
    return \`\${this.name} fetches the \${item}\`;
  }
}

class Cat extends Animal {
  private lives = 9;

  speak(): string {
    return \`\${this.name} says: Meow!\`;
  }

  land(): string {
    this.lives--;
    return \`\${this.name} lands safely. \${this.lives} lives remaining.\`;
  }
}

class AnimalShelter<T extends Animal> {
  private animals: T[] = [];

  add(animal: T): void {
    this.animals.push(animal);
  }

  findByName(name: string): T | undefined {
    return this.animals.find(a => a.toString().startsWith(name));
  }

  listAll(): string[] {
    return this.animals.map(a => \`\${a.toString()} - "\${a.speak()}"\`);
  }

  get count(): number {
    return this.animals.length;
  }
}

const shelter = new AnimalShelter<Animal>();
shelter.add(new Dog('Rex', 5, 'German Shepherd'));
shelter.add(new Cat('Whiskers', 3));
shelter.add(new Dog('Buddy', 2, 'Golden Retriever'));

console.log('All animals:');
for (const info of shelter.listAll()) {
  console.log(\` - \${info}\`);
}

const rex = shelter.findByName('Rex') as Dog;
console.log(rex.fetch('ball'));

console.log(\`Total animals: \${shelter.count}\`);
`,
  transformers: {
    esbuild: esbuildTransform,
    tsc: tscTransform,
    oxc: oxcTransform,
    swc: swcTransform,
  },
};

const LegacyDecorators: ExampleDef = {
  name: "Decorators (experimentalDecorators + emitDecoratorMetadata)",
  description: "Stage 3 decorator transform",
  file: "decorators.ts",
  source: `function log(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const original = descriptor.value;
  descriptor.value = function (...args: any[]) {
    console.log(\`Calling \${propertyKey} with\`, args);
    const result = original.apply(this, args);
    console.log(\`\${propertyKey} returned\`, result);
    return result;
  };
}

function sealed(constructor: Function) {
  Object.seal(constructor);
  Object.seal(constructor.prototype);
}

function readonly(target: any, propertyKey: string) {
  Object.defineProperty(target, propertyKey, { writable: false });
}

function validate(min: number, max: number) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const original = descriptor.value;
    descriptor.value = function (value: number) {
      if (value < min || value > max) {
        throw new RangeError(\`\${propertyKey}: value \${value} is out of range [\${min}, \${max}]\`);
      }
      return original.call(this, value);
    };
  };
}

@sealed
class Temperature {
  @readonly
  unit = '\u00b0C';

  private _value = 0;

  get value(): number {
    return this._value;
  }

  @validate(-273.15, 1000000)
  @log
  setValue(temp: number): void {
    this._value = temp;
  }

  @log
  toFahrenheit(): number {
    return this._value * 9 / 5 + 32;
  }

  @log
  toString(): string {
    return \`\${this._value}\${this.unit}\`;
  }
}

const temp = new Temperature();
temp.setValue(100);
console.log(temp.toFahrenheit());
console.log(temp.toString());
`,
  transformers: {
    tsc: tscDecoratorTransform,
    oxc: oxcDecoratorTransform,
    swc: swcDecoratorTransform,
  },
};

// Multi-file app — extra files written to the temp dir before bundling
const multiFileTypes = `export const enum LogLevel {
  Debug = 0,
  Info = 1,
  Warn = 2,
  Error = 3,
}

export const enum HttpMethod {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  DELETE = 'DELETE',
}

export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  createdAt: Date;
}

export type UserCreateInput = Omit<User, 'id' | 'createdAt'>;

export interface ApiResponse<T> {
  data: T;
  status: number;
}
`;

const multiFileLogger = `import { LogLevel } from './types';

const LOG_PREFIXES: Record<LogLevel, string> = {
  [LogLevel.Debug]: '[DEBUG]',
  [LogLevel.Info]: '[INFO]',
  [LogLevel.Warn]: '[WARN]',
  [LogLevel.Error]: '[ERROR]',
};

let currentLevel = LogLevel.Info;

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

export function log(level: LogLevel, message: string, ...args: unknown[]): void {
  if (level < currentLevel) return;
  const prefix = LOG_PREFIXES[level];
  const timestamp = new Date().toISOString();
  console.log(\`\${timestamp} \${prefix} \${message}\`, ...args);
}

export const debug = (msg: string, ...args: unknown[]) => log(LogLevel.Debug, msg, ...args);
export const info = (msg: string, ...args: unknown[]) => log(LogLevel.Info, msg, ...args);
export const warn = (msg: string, ...args: unknown[]) => log(LogLevel.Warn, msg, ...args);
export const error = (msg: string, ...args: unknown[]) => log(LogLevel.Error, msg, ...args);
`;

const multiFileApi = `import { HttpMethod, type ApiResponse, type User, type UserCreateInput } from './types';
import { info, error } from './logger';

const BASE_URL = 'https://api.example.com';

async function request<T>(method: HttpMethod, path: string, body?: unknown): Promise<ApiResponse<T>> {
  info(\`\${method} \${path}\`);

  const options: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };

  if (body && (method === HttpMethod.POST || method === HttpMethod.PUT)) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(\`\${BASE_URL}\${path}\`, options);
    const data = await response.json() as ApiResponse<T>;
    info(\`Response \${response.status} from \${path}\`);
    return data;
  } catch (err) {
    error(\`Request failed: \${path}\`, err);
    throw err;
  }
}

export async function getUsers(): Promise<ApiResponse<User[]>> {
  return request<User[]>(HttpMethod.GET, '/users');
}

export async function getUser(id: number): Promise<ApiResponse<User>> {
  return request<User>(HttpMethod.GET, \`/users/\${id}\`);
}

export async function createUser(input: UserCreateInput): Promise<ApiResponse<User>> {
  return request<User>(HttpMethod.POST, '/users', input);
}

export async function updateUser(id: number, input: Partial<UserCreateInput>): Promise<ApiResponse<User>> {
  return request<User>(HttpMethod.PUT, \`/users/\${id}\`, input);
}

export async function deleteUser(id: number): Promise<ApiResponse<void>> {
  return request<void>(HttpMethod.DELETE, \`/users/\${id}\`);
}
`;

const multiFileUtils = `export function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: any[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}

export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return \`\${y}-\${m}-\${d}\`;
}

export function groupBy<T>(items: T[], keyFn: (item: T) => string): Record<string, T[]> {
  return items.reduce((acc, item) => {
    const key = keyFn(item);
    (acc[key] ??= []).push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
`;

const multiFileAppSource = `import { LogLevel, HttpMethod } from './types';
import { setLogLevel, info, warn, debug } from './logger';
import { getUsers, createUser, deleteUser } from './api';
import { formatDate, groupBy, capitalize } from './utils';

// Local const enum (inlined in same file)
const enum Priority {
  Low = 'low',
  Medium = 'medium',
  High = 'high',
  Critical = 'critical',
}

setLogLevel(LogLevel.Debug);

async function main() {
  info('Application starting');

  // Cross-module const enum inlining: HttpMethod.GET → "GET"
  debug(\`Using method: \${HttpMethod.GET}\`);
  const { data: users } = await getUsers();
  info(\`Loaded \${users.length} users\`);

  // Group by role
  const grouped = groupBy(users, u => u.role);
  for (const [role, roleUsers] of Object.entries(grouped)) {
    info(\`\${capitalize(role)}: \${roleUsers.map(u => u.name).join(', ')}\`);
  }

  // Cross-module const enum: HttpMethod.POST → "POST"
  debug(\`Using method: \${HttpMethod.POST}\`);
  const { data: newUser } = await createUser({
    name: 'Alice',
    email: 'alice@example.com',
    role: 'admin',
  });
  info(\`Created user \${newUser.name} on \${formatDate(newUser.createdAt)}\`);

  // Local const enum usage: Priority.High → "high"
  const taskPriority = Priority.High;
  info(\`Default task priority: \${taskPriority}\`);

  // Cleanup old users via DELETE
  const oldUsers = users.filter(u => {
    const age = Date.now() - u.createdAt.getTime();
    return age > 365 * 24 * 60 * 60 * 1000;
  });

  if (oldUsers.length > 0) {
    warn(\`Found \${oldUsers.length} users older than 1 year, priority: \${Priority.Critical}\`);
    debug(\`Using method: \${HttpMethod.DELETE}\`);
    for (const user of oldUsers) {
      await deleteUser(user.id);
      info(\`Deleted user \${user.name}\`);
    }
  }

  // Cross-module const enum comparison: LogLevel.Error > LogLevel.Warn
  if (LogLevel.Error > LogLevel.Warn) {
    info('Error level is higher than Warn');
  }
  debug(\`Debug level value: \${LogLevel.Debug}\`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
`;

function multiFileBundleSetup(dir: string) {
  writeFileSync(join(dir, "types.ts"), multiFileTypes);
  writeFileSync(join(dir, "logger.ts"), multiFileLogger);
  writeFileSync(join(dir, "api.ts"), multiFileApi);
  writeFileSync(join(dir, "utils.ts"), multiFileUtils);
  writeFileSync(join(dir, "app.ts"), multiFileAppSource);
}

const MultiFileApp: ExampleDef = {
  name: "Multi-File with Const Enum",
  description: "Multi-file bundle with const enums",
  file: "app.ts",
  source: multiFileAppSource,
  transformers: {
    esbuild: (source, file, dir) => {
      multiFileBundleSetup(dir);
      return esbuildBundle(source, file, dir);
    },
    rolldown: (source, file, dir) => {
      multiFileBundleSetup(dir);
      return rolldownBundle(source, file, dir);
    },
  },
};

const multiEntryAlphaSource = `type AlphaInput = {
  user?: {
    profile?: {
      displayName?: string;
    };
  };
  flags?: string[];
};

class AlphaFormatter {
  prefix = "alpha";

  alphaMessage(input?: AlphaInput) {
    const displayName = input?.user?.profile?.displayName?.trim() ?? "guest";
    const flags = [...(input?.flags ?? []), "entry"];
    return {
      ...(input ?? {}),
      flags,
      message: \`\${this.prefix}:\${displayName.toUpperCase()}\`,
    };
  }
}

const formatter = new AlphaFormatter();
console.log(
  formatter.alphaMessage({
    user: { profile: { displayName: " demo " } },
  }),
);

export {};
`;

const multiEntryBetaSource = `const defaultWeights = {
  primary: 2,
  secondary: 1,
};

function betaTotal(values?: Array<number | null>, overrides?: Partial<typeof defaultWeights>) {
  const weights = {
    ...defaultWeights,
    ...overrides,
  };
  const normalized = values?.filter((value): value is number => value != null) ?? [];
  return normalized.reduce((sum, value, index) => {
    const weight = index === 0 ? weights.primary : weights.secondary;
    return sum + value * weight;
  }, 0);
}

const summary = {
  total: betaTotal([1, 2, null, 4], { secondary: 3 }),
  meta: { label: "weighted" as string | undefined },
};

console.log(summary.meta?.label ?? "plain", summary.total);

export {};
`;

function multiEntryBundleSetup(dir: string) {
  writeFileSync(join(dir, "alpha.ts"), multiEntryAlphaSource);
  writeFileSync(join(dir, "beta.ts"), multiEntryBetaSource);
}

const MultiEntryBundle: ExampleDef = {
  name: "Multi-Entry Bundle",
  description: "Modern syntax lowered across two emitted entrypoints",
  file: "alpha.ts",
  source: multiEntryAlphaSource,
  transformers: {
    esbuild: (source, file, dir) => {
      multiEntryBundleSetup(dir);
      return esbuildMultiEntryBundle(source, file, dir);
    },
    rolldown: (source, file, dir) => {
      multiEntryBundleSetup(dir);
      return rolldownMultiEntryBundle(source, file, dir);
    },
  },
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const examples: ExampleDef[] = [
  ReactTodoApp,
  TypeScriptClasses,
  LegacyDecorators,
  MultiFileApp,
  MultiEntryBundle,
];

function generateAll() {
  console.log("Generating example source maps...\n");

  // Clean temp dir
  rmSync(TMP, { recursive: true, force: true });
  ensureDir(TMP);

  const results: Array<{
    name: string;
    description: string;
    transformers: Record<string, TransformerResult>;
  }> = [];

  for (const example of examples) {
    console.log(`\n=== ${example.name} ===`);
    const transformerResults: Record<string, TransformerResult> = {};

    for (const [name, transformFn] of Object.entries(example.transformers)) {
      const dir = join(TMP, `${example.file}-${name}`);
      ensureDir(dir);

      process.stdout.write(`  ${name}... `);
      try {
        const result = transformFn(example.source, example.file, dir);

        const mapsToValidate = result.entries?.length ? result.entries : [result];
        for (const item of mapsToValidate) {
          const map = JSON.parse(item.sourceMapJson);
          if (!map.mappings || !map.sources) {
            throw new Error("Invalid source map: missing mappings or sources");
          }
        }

        transformerResults[name] = result;
        if (result.entries?.length) {
          console.log(`OK (${result.entries.length} entry files)`);
        } else {
          const map = JSON.parse(result.sourceMapJson);
          console.log(
            `OK (${result.generatedCode.split("\n").length} lines, ${map.mappings.length} chars mappings)`,
          );
        }
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        console.log(`FAILED: ${errorMessage}`);
        console.error(`  Skipping ${name} for ${example.name}`);
      }
    }

    results.push({
      name: example.name,
      description: example.description,
      transformers: transformerResults,
    });
  }

  // Write the output TypeScript file
  const outputPath = join(import.meta.dirname!, "..", "src", "examples", "index.ts");

  let output = `// Auto-generated by scripts/generate-examples.ts — do not edit manually.\n`;
  output += `// Re-run: vp dlx tsx scripts/generate-examples.ts\n\n`;
  output += `import type { ResolvedFileCollection } from "../core/inputResolver";\n\n`;
  output += `export interface ExampleTransformerResult {\n`;
  output += `  generatedCode: string;\n`;
  output += `  sourceMapJson: string;\n`;
  output += `  entries?: ResolvedFileCollection[];\n`;
  output += `}\n\n`;
  output += `export interface ExampleSource {\n`;
  output += `  name: string;\n`;
  output += `  description: string;\n`;
  output += `  transformers: Record<string, ExampleTransformerResult>;\n`;
  output += `}\n\n`;

  for (const example of results) {
    const varName = example.name
      .replace(/[^a-zA-Z0-9 ]/g, "")
      .split(/\s+/)
      .map((w, i) => (i === 0 ? w[0].toLowerCase() + w.slice(1) : w[0].toUpperCase() + w.slice(1)))
      .join("");

    output += `const ${varName}: ExampleSource = {\n`;
    output += `  name: ${JSON.stringify(example.name)},\n`;
    output += `  description: ${JSON.stringify(example.description)},\n`;
    output += `  transformers: {\n`;

    for (const [tName, tResult] of Object.entries(example.transformers)) {
      output += `    ${tName}: {\n`;
      output += `      generatedCode:\n        ${JSON.stringify(tResult.generatedCode)},\n`;
      output += `      sourceMapJson: JSON.stringify(${tResult.sourceMapJson}),\n`;
      if (tResult.entries?.length) {
        output += `      entries: [\n`;
        for (const entry of tResult.entries) {
          output += `        {\n`;
          output += `          generatedCode:\n            ${JSON.stringify(entry.generatedCode)},\n`;
          output += `          sourceMapJson: JSON.stringify(${entry.sourceMapJson}),\n`;
          output += `          label: ${JSON.stringify(entry.label)},\n`;
          output += `          entryPath: ${JSON.stringify(entry.entryPath)},\n`;
          if (entry.generatedPath) {
            output += `          generatedPath: ${JSON.stringify(entry.generatedPath)},\n`;
          }
          if (entry.sourceMapPath) {
            output += `          sourceMapPath: ${JSON.stringify(entry.sourceMapPath)},\n`;
          }
          output += `        },\n`;
        }
        output += `      ],\n`;
      }
      output += `    },\n`;
    }

    output += `  },\n`;
    output += `};\n\n`;
  }

  // Export array
  const varNames = results.map((e) =>
    e.name
      .replace(/[^a-zA-Z0-9 ]/g, "")
      .split(/\s+/)
      .map((w, i) => (i === 0 ? w[0].toLowerCase() + w.slice(1) : w[0].toUpperCase() + w.slice(1)))
      .join(""),
  );
  output += `export const exampleSources: ExampleSource[] = [\n`;
  for (const v of varNames) {
    output += `  ${v},\n`;
  }
  output += `];\n`;

  writeFileSync(outputPath, output);
  console.log(`\nWrote ${outputPath}`);

  // Clean up
  rmSync(TMP, { recursive: true, force: true });
  console.log("Done!");
}

generateAll();
