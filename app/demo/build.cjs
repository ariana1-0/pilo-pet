const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=__dirname;
const files=['index.html','styles.css','action-assets.js','motion.js','app.js','showcase.css','showcase-motion.js','showcase-driver.js','desktop-data.js','desktop-demo.js','craft-data.js','craft-demo.js'];
for(const name of files.filter(name=>name.endsWith('.js')))execFileSync(process.execPath,['--check',path.join(root,name)]);
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'styles.css'),'utf8');
const refs=[...html.matchAll(/(?:src|href)="(\.\/[^"#]+)"/g),...css.matchAll(/url\(['"]?(\.\/[^)'"\s]+)['"]?\)/g)].map(m=>m[1].split('?')[0]);
for(const action of Object.values(require('./action-assets.js'))) {
  refs.push(action.src);
  const png=fs.readFileSync(path.resolve(root,action.src));
  if(png.readUInt32BE(16)!==action.frameWidth*action.columns||png.readUInt32BE(20)!==action.frameHeight*action.rows)
    throw new Error(`Action atlas dimensions do not match: ${action.src}`);
  if(action.timeline.reduce((total,step)=>total+step.duration,0)!==action.duration)
    throw new Error(`Action timeline duration does not match: ${action.src}`);
}
for(const ref of refs)if(!fs.existsSync(path.resolve(root,ref)))throw new Error(`Missing asset: ${ref}`);
for(const file of ['showcase/index.html','showcase/styles.css']){
  const body=fs.readFileSync(path.join(root,file),'utf8');
  const local=[...body.matchAll(/(?:src|href)="((?:\.\.\/|\.\/)[^"#]+)"/g),...body.matchAll(/url\(['"]?((?:\.\.\/|\.\/)[^)'"\s]+)['"]?\)/g)];
  for(const match of local){const p=path.resolve(root,path.dirname(file),match[1].split('?')[0]);if(!fs.existsSync(p))throw Error(`Missing showcase asset: ${p}`);}
}
const output=path.join(root,'dist');
fs.mkdirSync(output,{recursive:true});
for(const file of files)fs.copyFileSync(path.join(root,file),path.join(output,file));
fs.cpSync(path.join(root,'assets'),path.join(output,'assets'),{recursive:true});
fs.cpSync(path.join(root,'showcase'),path.join(output,'showcase'),{recursive:true});
console.log(`Static build ready: ${files.length} source files; ${new Set(refs).size} local references verified.`);
