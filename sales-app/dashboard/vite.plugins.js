import fs from 'node:fs';

// `import b64 from './file.pdf?b64'` -> the file's bytes as a base64 string, bundled in the JS (no fetch needed,
// so the plan reader works the same in the desktop app, on the web and in the single-file preview).
export function pdfBase64(){
  return {
    name: 'pdf-base64',
    enforce: 'pre',
    async resolveId(source, importer){
      if (!source.endsWith('.pdf?b64')) return null;
      const r = await this.resolve(source.replace('?b64', ''), importer, { skipSelf: true });
      return r ? r.id + '?b64' : null;
    },
    load(id){
      if (!id.endsWith('.pdf?b64')) return null;
      const file = id.slice(0, -'?b64'.length);
      this.addWatchFile(file);
      return `export default ${JSON.stringify(fs.readFileSync(file).toString('base64'))};`;
    },
  };
}
