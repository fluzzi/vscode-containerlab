// src/commands/togglePersist.ts
import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import { ClabLabTreeNode } from '../treeView/common';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8');

function getPersistFilePath(): string {
  const envPath = process.env['PERSIST_PATH'];
  if (envPath && envPath.trim()) return envPath.trim();
  return path.join(os.homedir(), '.clab', 'persist.yaml');
}

function getPersistFileUri(): vscode.Uri {
  return vscode.Uri.file(getPersistFilePath());
}

function yamlQuote(s: string): string {
  // YAML es superconjunto de JSON → un string JSON válido es YAML válido
  return JSON.stringify(s);
}

function serializeLabs(labs: Set<string>): string {
  const items = Array.from(labs).sort().map(p => `  - ${yamlQuote(p)}\n`).join('');
  return `labs:\n${items}`;
}

function parseLabsFromYaml(text: string): Set<string> {
  // Parser minimalista para nuestro formato:
  // labs:
  //   - "/abs/path/one"
  //   - "/abs/path/two"
  const labs = new Set<string>();
  const lines = text.split(/\r?\n/);
  let inLabs = false;

  for (const raw of lines) {
    const line = raw.replace(/\t/g, '    '); // normalizá tabs a espacios
    if (/^\s*labs\s*:\s*$/.test(line)) {
      inLabs = true;
      continue;
    }
    if (inLabs) {
      // fin del bloque si aparece otra clave top-level
      if (/^\S/.test(line)) break;

      const m = line.match(/^\s*-\s*(.+?)\s*$/);
      if (m) {
        let v = m[1].trim();
        // si viene en JSON string (por como escribimos), parsealo
        if (v.startsWith('"')) {
          try { v = JSON.parse(v); } catch { /* ignore y deja como estaba */ }
        }
        if (v) labs.add(v);
      }
    }
  }
  return labs;
}

async function readLabs(uri: vscode.Uri): Promise<Set<string>> {
  try {
    const data = await vscode.workspace.fs.readFile(uri);
    const text = decoder.decode(data);
    return parseLabsFromYaml(text);
  } catch (e: any) {
    // si no existe, devolvé set vacío
    return new Set<string>();
  }
}

async function atomicWrite(uri: vscode.Uri, content: string): Promise<void> {
  const dir = vscode.Uri.file(path.dirname(uri.fsPath));
  await vscode.workspace.fs.createDirectory(dir);
  const tmp = vscode.Uri.file(uri.fsPath + '.tmp');
  await vscode.workspace.fs.writeFile(tmp, encoder.encode(content));
  // rename atómico (overwrite si ya existía)
  await vscode.workspace.fs.rename(tmp, uri, { overwrite: true });
}

export async function togglePersist(node: ClabLabTreeNode) {
  if (!node?.labPath?.absolute) {
    return;
  }
  const absPath = node.labPath.absolute;
  const file = getPersistFileUri();

  const labs = await readLabs(file);
  let msg: string;

  if (labs.has(absPath)) {
    labs.delete(absPath);
    msg = 'Removed from persist list';
  } else {
    labs.add(absPath);
    msg = 'Added to persist list';
  }

  const text = serializeLabs(labs);
  await atomicWrite(file, text);

  vscode.window.showInformationMessage(msg);
  // opcional: refrescar el árbol, igual que hace el favorito
  vscode.commands.executeCommand('containerlab.refresh');
}

