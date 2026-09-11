// Snapshot the actual web UI and a completed real roundtable. No model calls here.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=__dirname,web=path.resolve(root,'../web'),out=path.join(root,'showcase');
const read=p=>fs.readFileSync(p,'utf8');
const capture=JSON.parse(read(path.join(root,'assets/showcase/roundtable.json')));
const people=JSON.parse(read(path.join(web,'philosophers.json')));
const defaults=require(path.join(web,'roundtable-core.js')).participants(people,null);
if(capture.prompt!=='你们怎么看待亲密关系？'||capture.turns.length!==defaults.length*2||
   capture.turns.some((t,i)=>t.slug!==defaults[i%defaults.length]||!t.text.trim()))throw Error('Incomplete real roundtable capture');
fs.mkdirSync(out,{recursive:true});
let html=read(path.join(web,'index.html')).replace(/\s*<script[^>]*>[\s\S]*?<\/script>/g,'');
html=html.replace(/<button\b[^>]*\bid="(?:rt-choose|rt-menu-new)"[^>]*>/g,tag=>tag.replace(/\saria-haspopup="[^"]*"/g,'').replace(/>$/,' disabled>'));
html=html.replace(/\.\/styles\.css\?[^"']+/,'./styles.css?v=showcase-1').replace('</head>',`  <link rel="stylesheet" href="../showcase.css?v=roundtable-readonly-1">
  <script src="./data.js?v=showcase-1" defer></script>
  <script src="./chat-core.js" defer></script>
  <script src="../showcase-motion.js?v=showcase-soft-1" defer></script>
  <script src="../showcase-driver.js?v=roundtable-readonly-1" defer></script>
</head>`);
fs.writeFileSync(path.join(out,'index.html'),html);
for(const name of ['styles.css','chat-core.js'])fs.copyFileSync(path.join(web,name),path.join(out,name));
fs.cpSync(path.join(web,'assets'),path.join(out,'assets'),{recursive:true});
const data={people,capture:{...capture,events:undefined}};
fs.writeFileSync(path.join(out,'data.js'),'window.PhiloShowcaseData='+JSON.stringify(data).replace(/</g,'\\u003c')+';\n');
const sources=Object.fromEntries(['index.html','styles.css','philosophers.json','chat-core.js'].map(name=>[name,crypto.createHash('sha256').update(read(path.join(web,name))).digest('hex')]));
fs.writeFileSync(path.join(out,'source.json'),JSON.stringify({sources,capturedAt:capture.captured_at,model:capture.model,generatedBy:'prepare_showcase.cjs'},null,2)+'\n');
console.log(`Prepared original web UI: ${people.length} philosophers, ${capture.turns.length} real speeches.`);
